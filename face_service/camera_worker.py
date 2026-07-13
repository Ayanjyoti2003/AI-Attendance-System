"""
Camera Worker — runs face detection, recognition, and attendance marking
for a single camera (USB or RTSP).

Spawned by camera_manager.py, one worker per active camera.
"""

import backend.runtime

import cv2
import torch
import numpy as np
import os
import requests
import time
import threading
from datetime import datetime
from facenet_pytorch import MTCNN, InceptionResnetV1

# ─── Paths (absolute, safe from any cwd) ─────────────────
from backend.backup import get_employees_dir
EMPLOYEE_DIR = get_employees_dir()

# ─── Config ───────────────────────────────────────────────
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
THRESHOLD = float(os.getenv("FACE_THRESHOLD", "0.6"))  # lower = stricter
HEARTBEAT_INTERVAL = 30  # seconds between last_seen heartbeats
FRAME_SKIP = 3  # process every Nth frame for performance
RECOGNITION_COOLDOWN = 60  # seconds to ignore same person after recognition

device = "cuda" if torch.cuda.is_available() else "cpu"

# Worker-level heartbeats for hang detection by manager
worker_heartbeats: dict[int, float] = {}

# Lazy-load models (shared across workers in same process)
_mtcnn = None
_resnet = None
_models_lock = threading.Lock()


def _get_models():
    """Thread-safe lazy initialization of face models."""
    global _mtcnn, _resnet
    if _mtcnn is None:
        with _models_lock:
            if _mtcnn is None:
                backend.runtime.validate_ai_model()
                _mtcnn = MTCNN(keep_all=False, device=device)
                _resnet = InceptionResnetV1(
                    pretrained="vggface2"
                ).eval().to(device)
    return _mtcnn, _resnet


def cosine_distance(a, b):
    a = np.squeeze(a)
    b = np.squeeze(b)
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 1.0
    return 1 - (dot / norm)


def load_known_embeddings(data_path=None):
    """Load all .npy embeddings from the employees directory."""
    if data_path is None:
        data_path = EMPLOYEE_DIR
    known = {}
    if not os.path.exists(data_path):
        print(f"[WORKER] Embeddings directory not found: {data_path}")
        return known
    for file in os.listdir(data_path):
        if file.endswith(".npy"):
            name = file.replace(".npy", "")
            emb = np.load(os.path.join(data_path, file))
            known[name] = emb.squeeze()
    return known


def update_camera_last_seen(camera_id: int):
    """Send heartbeat to backend to update camera.last_seen."""
    try:
        requests.patch(
            f"{BACKEND_URL}/api/cameras/{camera_id}/heartbeat",
            timeout=5
        )
    except Exception as e:
        print(f"[WORKER cam={camera_id}] Heartbeat failed: {e}")


def update_camera_status(camera_id: int, status: str):
    """Update camera status in the backend."""
    try:
        requests.patch(
            f"{BACKEND_URL}/api/cameras/{camera_id}/status",
            json={"status": status},
            timeout=5
        )
    except Exception as e:
        print(f"[WORKER cam={camera_id}] Status update failed: {e}")


def run_camera_worker(
    camera_id: int,
    camera_type: str,
    source: str,
    stop_event: threading.Event
):
    """
    Main loop for a single camera worker.

    Args:
        camera_id:    DB id of the camera
        camera_type:  "USB" or "RTSP"
        source:       device index (str) for USB, or RTSP URL
        stop_event:   threading.Event — set to signal this worker to stop
    """
    mtcnn, resnet = _get_models()
    known_embeddings = load_known_embeddings(EMPLOYEE_DIR)

    print(f"[WORKER cam={camera_id}] Starting ({camera_type}: {source})")
    print(f"[WORKER cam={camera_id}] Embeddings dir: {EMPLOYEE_DIR}")
    print(f"[WORKER cam={camera_id}] Loaded {len(known_embeddings)} known faces")

    # Open video capture
    if camera_type == "USB":
        cap = cv2.VideoCapture(int(source))
    elif camera_type == "RTSP":
        cap = cv2.VideoCapture(source)
    else:
        print(f"[WORKER cam={camera_id}] Unknown camera_type: {camera_type}")
        return

    if not cap.isOpened():
        print(f"[WORKER cam={camera_id}] Failed to open stream")
        update_camera_status(camera_id, "ERROR")
        return

    # Mark camera as ONLINE
    update_camera_status(camera_id, "ONLINE")

    frame_count = 0
    last_heartbeat = 0
    recent_recognitions: dict[str, float] = {}  # name → timestamp of last recognition

    try:
        while not stop_event.is_set():
            ret, frame = cap.read()

            if not ret:
                print(f"[WORKER cam={camera_id}] Lost stream, retrying in 5s...")
                update_camera_status(camera_id, "ERROR")
                time.sleep(5)

                # Try to reconnect
                cap.release()
                if camera_type == "USB":
                    cap = cv2.VideoCapture(int(source))
                else:
                    cap = cv2.VideoCapture(source)

                if not cap.isOpened():
                    print(f"[WORKER cam={camera_id}] Reconnect failed")
                    continue
                else:
                    update_camera_status(camera_id, "ONLINE")
                    continue

            frame_count += 1

            # Skip frames for performance
            if frame_count % FRAME_SKIP != 0:
                continue

            # Heartbeat (backend + manager hang-detection)
            now = time.time()
            if now - last_heartbeat > HEARTBEAT_INTERVAL:
                update_camera_last_seen(camera_id)
                worker_heartbeats[camera_id] = now
                last_heartbeat = now

            # Reload embeddings periodically (every 100 processed frames)
            if frame_count % (FRAME_SKIP * 100) == 0:
                known_embeddings = load_known_embeddings(EMPLOYEE_DIR)

            # ─── Face Detection & Recognition ────────────
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face = mtcnn(rgb)

            if face is not None:
                emb = resnet(face.unsqueeze(0).to(device))
                emb = emb.detach().cpu().numpy().squeeze()

                best_match = None
                best_score = 1.0

                for name, known_emb in known_embeddings.items():
                    score = cosine_distance(emb, known_emb)
                    if score < best_score:
                        best_score = score
                        best_match = name

                if best_score < THRESHOLD and best_match:
                    # ─── Cooldown: skip if recognized within last 60s ───
                    if (
                        best_match in recent_recognitions
                        and now - recent_recognitions[best_match] < RECOGNITION_COOLDOWN
                    ):
                        continue

                    recent_recognitions[best_match] = now

                    print(
                        f"[WORKER cam={camera_id}] Recognized: "
                        f"{best_match} (score={best_score:.3f})"
                    )

                    payload = {
                        "name": best_match,
                        "timestamp": datetime.now().isoformat(),
                        "camera_id": camera_id
                    }

                    try:
                        response = requests.post(
                            f"{BACKEND_URL}/api/attendance",
                            json=payload,
                            timeout=10
                        )
                        result = response.json()
                        print(
                            f"[WORKER cam={camera_id}] Attendance result: {result}"
                        )
                    except Exception as e:
                        print(
                            f"[WORKER cam={camera_id}] Attendance send failed: {e}"
                        )

            # Small sleep to prevent CPU overload
            time.sleep(0.01)

    except Exception as e:
        print(f"[WORKER cam={camera_id}] Unexpected error: {e}")
    finally:
        cap.release()
        update_camera_status(camera_id, "OFFLINE")
        worker_heartbeats.pop(camera_id, None)
        print(f"[WORKER cam={camera_id}] Stopped")
