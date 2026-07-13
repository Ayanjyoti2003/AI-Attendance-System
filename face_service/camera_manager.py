"""
Camera Manager — polls the database for cameras and spawns/stops
camera_worker threads accordingly.

Run as:  python -m face_service.camera_manager
"""

import os
import sys
import time
import threading
from datetime import datetime

# Ensure project root is on the path
from backend.runtime import get_backend_path
_backend_root = get_backend_path()
sys.path.insert(0, _backend_root)

from dotenv import load_dotenv
_env_path = os.path.join(_backend_root, "backend", ".env")
if os.path.isfile(_env_path):
    load_dotenv(_env_path)

from backend.diagnostics.logs import setup_camera_manager_logging
# Initialize logging
setup_camera_manager_logging()

from backend.database import SessionLocal
from backend.models import Camera
from face_service.camera_worker import run_camera_worker, worker_heartbeats

# ─── Config ───────────────────────────────────────────────
POLL_INTERVAL = int(os.getenv("CAMERA_POLL_INTERVAL", "15"))  # seconds
WORKER_HANG_TIMEOUT = 90  # if no heartbeat in 90s, consider worker hung


class CameraManager:
    """
    Manages camera worker threads.

    Periodically polls the DB for cameras that are not DISABLED.
    - If a camera exists in DB but has no running worker → start one
    - If a camera was removed or set to DISABLED → stop its worker
    """

    def __init__(self):
        # Map camera_id → { "thread": Thread, "stop_event": Event, "config": dict }
        self.workers: dict[int, dict] = {}
        self._lock = threading.Lock()

    def _get_active_cameras(self):
        """Fetch all cameras from DB that are not DISABLED."""
        db = SessionLocal()
        try:
            cameras = (
                db.query(Camera)
                .filter(Camera.status != "DISABLED")
                .all()
            )
            return [
                {
                    "id": cam.id,
                    "camera_type": cam.camera_type,
                    "source": cam.source,
                    "name": cam.name,
                }
                for cam in cameras
            ]
        finally:
            db.close()

    def _start_worker(self, cam: dict):
        """Start a new worker thread for a camera."""
        cam_id = cam["id"]
        stop_event = threading.Event()

        thread = threading.Thread(
            target=run_camera_worker,
            args=(cam_id, cam["camera_type"], cam["source"], stop_event),
            name=f"cam-worker-{cam_id}",
            daemon=True
        )

        self.workers[cam_id] = {
            "thread": thread,
            "stop_event": stop_event,
            "config": cam
        }

        thread.start()
        print(f"[MANAGER] Started worker for camera {cam_id} ({cam['name']})")

    def _stop_worker(self, cam_id: int):
        """Signal a worker to stop and clean up."""
        worker = self.workers.pop(cam_id, None)
        if worker:
            worker["stop_event"].set()
            worker["thread"].join(timeout=10)
            print(f"[MANAGER] Stopped worker for camera {cam_id}")

    def _is_worker_hung(self, cam_id: int) -> bool:
        """Check if a worker is alive but hasn't sent a heartbeat recently."""
        last_hb = worker_heartbeats.get(cam_id)
        if last_hb is None:
            return False  # hasn't started heartbeating yet
        return (time.time() - last_hb) > WORKER_HANG_TIMEOUT

    def _config_changed(self, cam_id: int, cam: dict) -> bool:
        """Check if camera config changed (type or source)."""
        existing = self.workers.get(cam_id)
        if not existing:
            return True
        old = existing["config"]
        return (
            old["camera_type"] != cam["camera_type"]
            or old["source"] != cam["source"]
        )

    def sync(self):
        """
        Sync workers with current DB state.
        Start new workers, stop removed workers, restart changed workers.
        """
        # Write heartbeat file for system health monitoring
        try:
            from backend.backup import get_app_data_dir
            hb_path = os.path.join(get_app_data_dir(), "camera_manager.heartbeat")
            with open(hb_path, "w") as f:
                f.write(str(time.time()))
        except Exception as e:
            print(f"[MANAGER] Failed to write heartbeat file: {e}")

        with self._lock:
            active_cameras = self._get_active_cameras()
            active_ids = {cam["id"] for cam in active_cameras}

            # Stop workers for cameras that are no longer active
            stale_ids = set(self.workers.keys()) - active_ids
            for cam_id in stale_ids:
                self._stop_worker(cam_id)

            # Start or restart workers for active cameras
            for cam in active_cameras:
                cam_id = cam["id"]
                worker = self.workers.get(cam_id)

                if worker and not worker["thread"].is_alive():
                    # Worker died — restart it
                    print(f"[MANAGER] Worker for camera {cam_id} died, restarting...")
                    self._stop_worker(cam_id)
                    self._start_worker(cam)
                elif worker and self._is_worker_hung(cam_id):
                    # Worker hung (is_alive but no heartbeat) — force restart
                    print(f"[MANAGER] Worker for camera {cam_id} appears hung (no heartbeat in {WORKER_HANG_TIMEOUT}s), restarting...")
                    self._stop_worker(cam_id)
                    self._start_worker(cam)
                elif worker and self._config_changed(cam_id, cam):
                    # Config changed — restart
                    print(f"[MANAGER] Config changed for camera {cam_id}, restarting...")
                    self._stop_worker(cam_id)
                    self._start_worker(cam)
                elif not worker:
                    # New camera — start
                    self._start_worker(cam)

    def run_forever(self):
        """Main loop — sync every POLL_INTERVAL seconds."""
        print(f"[MANAGER] Camera Manager started (poll every {POLL_INTERVAL}s)")
        print(f"[MANAGER] Press Ctrl+C to stop\n")

        try:
            self.sync()
            while True:
                time.sleep(POLL_INTERVAL)
                self.sync()
        except KeyboardInterrupt:
            print("\n[MANAGER] Shutting down...")
            with self._lock:
                for cam_id in list(self.workers.keys()):
                    self._stop_worker(cam_id)
            print("[MANAGER] All workers stopped. Goodbye!")


if __name__ == "__main__":
    manager = CameraManager()
    manager.run_forever()
