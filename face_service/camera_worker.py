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
import random
from datetime import datetime
from facenet_pytorch import MTCNN, InceptionResnetV1

# Soft dependency on pygrabber for friendly names on Windows
pygrabber_available = False
try:
    from pygrabber.dshow_graph import FilterGraph
    pygrabber_available = True
except ImportError:
    FilterGraph = None

def get_connected_camera_names():
    if pygrabber_available and FilterGraph is not None:
        try:
            return FilterGraph().get_input_devices()
        except Exception:
            return []
    return []

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


def update_camera_diagnostics(
    camera_id: int,
    status: str,
    last_error: str = None,
    device_name: str = None,
    last_successful_frame: datetime = None,
    reconnect_attempts: int = None,
    reconnect_countdown: int = None,
    last_reconnect_attempt: datetime = None
):
    """Send diagnostics details to backend."""
    payload = {"status": status}
    if last_error is not None:
        payload["last_error"] = last_error
    if device_name is not None:
        payload["device_name"] = device_name
    if last_successful_frame is not None:
        payload["last_successful_frame"] = last_successful_frame.isoformat()
    if reconnect_attempts is not None:
        payload["reconnect_attempts"] = reconnect_attempts
    if reconnect_countdown is not None:
        payload["reconnect_countdown"] = reconnect_countdown
    if last_reconnect_attempt is not None:
        payload["last_reconnect_attempt"] = last_reconnect_attempt.isoformat()

    try:
        requests.patch(
            f"{BACKEND_URL}/api/cameras/{camera_id}/status",
            json=payload,
            timeout=5
        )
    except Exception as e:
        print(f"[WORKER cam={camera_id}] Diagnostics update failed: {e}")


def run_camera_worker(
    camera_id: int,
    camera_type: str,
    source: str,
    stop_event: threading.Event
):
    """
    Main loop for a single camera worker.
    """
    mtcnn, resnet = _get_models()
    known_embeddings = load_known_embeddings(EMPLOYEE_DIR)

    print(f"[WORKER cam={camera_id}] Starting ({camera_type}: {source})")
    
    # Track error state to avoid duplicate log spam
    last_logged_error = None
    
    # Backoff retry parameters
    reconnect_attempts = 0
    backoff_delays = [30, 60, 120, 300]
    
    # Throttling tracking
    last_db_frame_update = 0.0

    try:
        while not stop_event.is_set():
            # Attempt to open/reconnect to camera
            device_friendly_name = None
            cap = None
            
            # Connection checks
            is_connected = False
            error_message = None
            status_state = "OFFLINE"
            
            if camera_type == "USB":
                try:
                    src_idx = int(source)
                except ValueError:
                    src_idx = 0
                
                # Check hardware connectivity using pygrabber
                devices = get_connected_camera_names()
                if pygrabber_available and devices:
                    if src_idx < 0 or src_idx >= len(devices):
                        status_state = "OFFLINE"
                        error_message = f"No camera detected at index {src_idx}."
                    else:
                        device_friendly_name = devices[src_idx]
                        cap = cv2.VideoCapture(src_idx)
                        if not cap.isOpened():
                            status_state = "BUSY"
                            error_message = f"Camera busy or unavailable (in use by another application or driver/permission failure) at index {src_idx}."
                        else:
                            is_connected = True
                else:
                    # Fallback to direct OpenCV capture
                    cap = cv2.VideoCapture(src_idx)
                    if not cap.isOpened():
                        status_state = "BUSY"
                        error_message = f"Camera busy or unavailable (in use by another application or driver/permission failure) at index {src_idx}."
                    else:
                        is_connected = True
            elif camera_type == "RTSP":
                cap = cv2.VideoCapture(source)
                if not cap.isOpened():
                    status_state = "OFFLINE"
                    error_message = f"RTSP stream unreachable or invalid at {source}."
                else:
                    is_connected = True
            else:
                error_message = f"Unknown camera_type: {camera_type}"
                update_camera_diagnostics(camera_id, "ERROR", last_error=error_message)
                print(f"[WORKER cam={camera_id}] {error_message}")
                return

            if not is_connected:
                # Connection failed! Log the error (deduplicated)
                if error_message != last_logged_error:
                    print(f"[WORKER cam={camera_id}] Connection failed: {error_message}")
                    last_logged_error = error_message
                
                # Calculate backoff delay with random jitter
                base_delay = backoff_delays[min(reconnect_attempts, len(backoff_delays) - 1)]
                if base_delay <= 60:
                    jitter = random.randint(-5, 5)
                elif base_delay == 120:
                    jitter = random.randint(-10, 10)
                else:
                    jitter = random.randint(-15, 15)
                
                actual_delay = max(5, base_delay + jitter)
                reconnect_attempts += 1
                
                now_dt = datetime.now()
                target_status = "RECONNECTING" if reconnect_attempts > 1 else status_state
                update_camera_diagnostics(
                    camera_id=camera_id,
                    status=target_status,
                    last_error=error_message,
                    device_name=device_friendly_name,
                    reconnect_attempts=reconnect_attempts,
                    reconnect_countdown=actual_delay,
                    last_reconnect_attempt=now_dt
                )
                
                print(f"[WORKER cam={camera_id}] Retry scheduled in {actual_delay} seconds (Attempt {reconnect_attempts}).")
                
                # Wait using monotonic clock
                start_wait = time.monotonic()
                while time.monotonic() - start_wait < actual_delay:
                    if stop_event.is_set():
                        if cap:
                            cap.release()
                        return
                    time.sleep(1.0)
                
                # Clean up if VideoCapture was created but closed
                if cap:
                    cap.release()
                continue
            
            # Connection succeeded!
            reconnect_attempts = 0
            last_logged_error = None
            print(f"[WORKER cam={camera_id}] Connected. Status set to ONLINE. Hardware: {device_friendly_name or 'OpenCV Default'}")
            
            # Force update status to ONLINE and clear reconnect parameters
            update_camera_diagnostics(
                camera_id=camera_id,
                status="ONLINE",
                last_error="",
                device_name=device_friendly_name,
                reconnect_attempts=0,
                reconnect_countdown=0,
                last_reconnect_attempt=datetime.now(),
                last_successful_frame=datetime.now()
            )
            
            frame_count = 0
            last_heartbeat = 0
            recent_recognitions: dict[str, float] = {}
            
            try:
                while not stop_event.is_set():
                    ret, frame = cap.read()
                    if not ret:
                        print(f"[WORKER cam={camera_id}] Lost stream.")
                        break
                    
                    frame_count += 1
                    
                    if frame_count % FRAME_SKIP != 0:
                        continue
                    
                    now = time.time()
                    
                    # Throttle database write for last_successful_frame (once every 30s)
                    if now - last_db_frame_update > 30:
                        last_db_frame_update = now
                        update_camera_diagnostics(
                            camera_id=camera_id,
                            status="ONLINE",
                            last_successful_frame=datetime.now()
                        )
                    
                    # Heartbeat (backend + manager hang-detection)
                    if now - last_heartbeat > HEARTBEAT_INTERVAL:
                        update_camera_last_seen(camera_id)
                        worker_heartbeats[camera_id] = now
                        last_heartbeat = now
                    
                    # Reload embeddings periodically
                    if frame_count % (FRAME_SKIP * 100) == 0:
                        known_embeddings = load_known_embeddings(EMPLOYEE_DIR)
                    
                    # Face detection & recognition
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
                            if (
                                best_match in recent_recognitions
                                and now - recent_recognitions[best_match] < RECOGNITION_COOLDOWN
                            ):
                                continue
                            
                            recent_recognitions[best_match] = now
                            print(f"[WORKER cam={camera_id}] Recognized: {best_match} (score={best_score:.3f})")
                            
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
                                print(f"[WORKER cam={camera_id}] Attendance result: {result}")
                            except Exception as e:
                                print(f"[WORKER cam={camera_id}] Attendance send failed: {e}")
                                
                    time.sleep(0.01)
            finally:
                cap.release()
                
            # Lost connection during stream
            update_camera_diagnostics(camera_id, "OFFLINE", last_error="Lost video stream connection.")
            
    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        print(f"[WORKER cam={camera_id}] Unexpected error:\n{trace}")
        update_camera_diagnostics(camera_id, "ERROR", last_error=f"Unexpected worker crash:\n{trace}")
    finally:
        update_camera_diagnostics(camera_id, "OFFLINE")
        worker_heartbeats.pop(camera_id, None)
        print(f"[WORKER cam={camera_id}] Stopped")
