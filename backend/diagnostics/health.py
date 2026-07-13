import os
import time
from datetime import datetime
from sqlalchemy import text

from backend.config import config_manager
from backend.backup import get_app_data_dir, get_backup_manager, get_employees_dir
from backend.diagnostics.system import get_storage_info, get_database_size, get_system_info
from backend.diagnostics.logs import get_logs_dir, sanitize_line

# Track system load time as a proxy for application startup time
START_TIME = time.time()


class HealthManager:
    """Central manager for compiling application health, database status, camera system state, storage, and logs."""

    # Lightweight TTL cache to avoid repeated expensive checks
    _cached_health: dict | None = None
    _cache_time: float = 0
    _CACHE_TTL: int = 10  # seconds

    @staticmethod
    def check_camera_manager_running() -> bool:
        """Verify if the camera manager process is updating its heartbeat file."""
        heartbeat_path = os.path.join(get_app_data_dir(), "camera_manager.heartbeat")
        if os.path.exists(heartbeat_path):
            try:
                with open(heartbeat_path, "r") as f:
                    t = float(f.read().strip())
                # Active if heartbeat was written in the last 60 seconds
                return (time.time() - t) < 60
            except Exception:
                return False
        return False

    @staticmethod
    def get_system_health(force_refresh: bool = False) -> dict:
        """Compile a full diagnostics health report across all components."""
        now = time.time()
        if not force_refresh and HealthManager._cached_health is not None and (now - HealthManager._cache_time) < HealthManager._CACHE_TTL:
            return HealthManager._cached_health
        # 1. Application Uptime & Version
        uptime_seconds = int(time.time() - START_TIME)
        hours, remainder = divmod(uptime_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        uptime_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m {seconds}s"

        application_health = {
            "version": "1.0.0",
            "uptime": uptime_str
        }

        # 2. Database Health
        from backend.database import engine
        connected = False
        latency_ms = 0
        db_start = time.time()
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            latency_ms = int((time.time() - db_start) * 1000)
            connected = True
        except Exception:
            pass

        migration_status = "UP_TO_DATE"
        if connected:
            try:
                from alembic.config import Config
                from alembic.script import ScriptDirectory
                from alembic.runtime.migration import MigrationContext

                from backend.runtime import get_backend_path
                backend_root = get_backend_path()
                alembic_ini_path = os.path.join(backend_root, "alembic.ini")

                alembic_cfg = Config(alembic_ini_path)
                alembic_cfg.set_main_option("script_location", os.path.join(backend_root, "backend", "alembic"))

                script = ScriptDirectory.from_config(alembic_cfg)
                head_rev = script.get_current_head()

                with engine.connect() as connection:
                    context = MigrationContext.configure(connection)
                    current_rev = context.get_current_revision()

                if current_rev != head_rev:
                    migration_status = "MIGRATION_REQUIRED"
            except Exception:
                migration_status = "MIGRATION_REQUIRED"
        else:
            migration_status = "MIGRATION_REQUIRED"

        db_size_bytes, db_size_display = get_database_size()
        database_health = {
            "provider": config_manager.get_config().storage.provider.upper(),
            "connected": connected,
            "latency_ms": latency_ms,
            "migration_status": migration_status,
            "size_bytes": db_size_bytes,
            "size_display": db_size_display
        }

        # 3. Camera System Health
        from backend.models import Camera
        from backend.database import SessionLocal
        total_cameras = 0
        online = 0
        offline = 0
        error = 0
        last_heartbeat = None

        try:
            with SessionLocal() as db:
                active_cameras = db.query(Camera).filter(Camera.status != "DISABLED").all()
                total_cameras = len(active_cameras)
                online = sum(1 for c in active_cameras if c.status == "ONLINE")
                error = sum(1 for c in active_cameras if c.status == "ERROR")
                offline = sum(1 for c in active_cameras if c.status not in ["ONLINE", "ERROR"])

                last_seens = [c.last_seen for c in active_cameras if c.last_seen is not None]
                if last_seens:
                    last_heartbeat = max(last_seens).isoformat()
        except Exception:
            pass

        manager_running = HealthManager.check_camera_manager_running()
        camera_health = {
            "manager_running": manager_running,
            "total_cameras": total_cameras,
            "online": online,
            "offline": offline,
            "error": error,
            "last_heartbeat": last_heartbeat
        }

        # 4. Backup Health
        config = config_manager.get_config()
        backup_manager = get_backup_manager()
        backups = []
        try:
            backups = backup_manager.list_backups()
        except Exception:
            pass

        last_backup = backups[0].created_at if backups else None
        backup_folder = config.backup.destination or os.path.join(get_app_data_dir(), "backups")
        backup_count = len(backups)

        # Storage used by backups
        from backend.diagnostics.system import _human_readable_size
        storage_used_bytes = 0
        for b in backups:
            try:
                storage_used_bytes += b.size_bytes
            except AttributeError:
                pass
        backup_storage_used = _human_readable_size(storage_used_bytes)

        backup_status = "OK"
        if config.backup.enabled and config.backup.automatic:
            if last_backup:
                try:
                    last_dt = datetime.fromisoformat(last_backup)
                    diff = datetime.now() - last_dt
                    freq = config.backup.frequency
                    if freq == "daily" and diff.total_seconds() > 26 * 3600:
                        backup_status = "OVERDUE"
                    elif freq == "weekly" and diff.days > 8:
                        backup_status = "OVERDUE"
                    elif freq == "monthly" and diff.days > 32:
                        backup_status = "OVERDUE"
                except Exception:
                    backup_status = "OVERDUE"
            else:
                # Overdue if setup is complete and app has been running > 24h
                if uptime_seconds > 24 * 3600:
                    backup_status = "OVERDUE"

        backup_health = {
            "enabled": config.backup.enabled,
            "automatic": config.backup.automatic,
            "last_backup": last_backup,
            "status": backup_status,
            "backup_folder": backup_folder,
            "backup_count": backup_count,
            "storage_used": backup_storage_used
        }

        # 5. Storage Health
        storage_health = get_storage_info()

        # 6. AI Engine Health
        model_loaded = False
        try:
            from facenet_pytorch import MTCNN, InceptionResnetV1
            model_loaded = True
        except ImportError:
            pass

        device = "CPU"
        try:
            import torch
            if torch.cuda.is_available():
                device = "CUDA"
        except ImportError:
            pass

        known_faces_count = 0
        emp_dir = get_employees_dir()
        if os.path.exists(emp_dir):
            try:
                known_faces_count = len([f for f in os.listdir(emp_dir) if f.endswith(".npy")])
            except Exception:
                pass

        ai_engine_health = {
            "device": device,
            "model_loaded": model_loaded,
            "known_faces": known_faces_count
        }

        # 7. Overall System Status Determination
        # Error: database unavailable, migration failure, camera manager down (when total_cameras > 0)
        # Warning: camera offline, backup overdue, AI model unavailable
        # Healthy: everything working
        status = "healthy"
        if not connected or migration_status == "MIGRATION_REQUIRED":
            status = "error"
        elif total_cameras > 0 and not manager_running:
            status = "error"
        elif error > 0:
            status = "error"
        elif offline > 0 or backup_status == "OVERDUE" or not model_loaded:
            status = "warning"

        result = {
            "status": status,
            "application": application_health,
            "database": database_health,
            "camera_system": camera_health,
            "backup": backup_health,
            "storage": storage_health,
            "ai_engine": ai_engine_health
        }

        # Store in cache
        HealthManager._cached_health = result
        HealthManager._cache_time = time.time()

        return result

    @staticmethod
    def _cleanup_old_diagnostics_zips() -> None:
        """Remove abandoned diagnostics zip files older than 24 hours from temp directory."""
        import tempfile
        temp_dir = tempfile.gettempdir()
        cutoff = time.time() - 24 * 3600
        try:
            for fname in os.listdir(temp_dir):
                if fname.startswith("diagnostics_") and fname.endswith(".zip"):
                    fpath = os.path.join(temp_dir, fname)
                    if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                        try:
                            os.remove(fpath)
                        except Exception:
                            pass
        except Exception:
            pass

    @staticmethod
    def export_diagnostics() -> str:
        """Generate a diagnostics zip file in temp directory, sanitizing sensitive info in log files."""
        import tempfile
        import json
        import zipfile

        # Clean up any abandoned diagnostics zips older than 24 hours
        HealthManager._cleanup_old_diagnostics_zips()

        temp_dir = tempfile.gettempdir()
        timestamp = datetime.now().strftime("%Y_%m_%d_%H%M%S")
        zip_filename = f"diagnostics_{timestamp}.zip"
        zip_path = os.path.join(temp_dir, zip_filename)

        # 1. Build reports
        health_report = HealthManager.get_system_health()
        system_info = get_system_info()

        # Write reports to temporary JSON files
        health_json_path = os.path.join(temp_dir, "health_report.json")
        system_json_path = os.path.join(temp_dir, "system_info.json")

        try:
            with open(health_json_path, "w", encoding="utf-8") as f:
                json.dump(health_report, f, indent=4)
            with open(system_json_path, "w", encoding="utf-8") as f:
                json.dump(system_info, f, indent=4)

            # 2. Package ZIP
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                # Add JSON reports
                zf.write(health_json_path, "health_report.json")
                zf.write(system_json_path, "system_info.json")

                # Add logs folder, sanitizing line by line
                logs_dir = get_logs_dir()
                if os.path.isdir(logs_dir):
                    for file_name in os.listdir(logs_dir):
                        if file_name.endswith(".log") or ".log." in file_name:
                            log_file_path = os.path.join(logs_dir, file_name)
                            if os.path.isfile(log_file_path):
                                try:
                                    sanitized_content = []
                                    with open(log_file_path, "r", encoding="utf-8", errors="replace") as lf:
                                        for line in lf:
                                            sanitized_content.append(sanitize_line(line))
                                    
                                    zf.writestr(f"logs/{file_name}", "".join(sanitized_content))
                                except Exception as e:
                                    zf.writestr(f"logs/{file_name}_error.txt", f"Failed to sanitize log: {e}")

            return zip_path
        finally:
            # Clean up temp json files
            for p in (health_json_path, system_json_path):
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        pass
