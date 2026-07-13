import os
import shutil
import platform
import sys
from datetime import datetime
from sqlalchemy import text
from backend.config import config_manager
from backend.config.models import StorageProvider
from backend.backup import get_app_data_dir


def _human_readable_size(size_bytes: int) -> str:
    """Convert bytes to human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def get_storage_info() -> dict:
    """Get disk usage metrics for the application data directory."""
    app_data_dir = get_app_data_dir()
    os.makedirs(app_data_dir, exist_ok=True)
    
    try:
        total, used, free = shutil.disk_usage(app_data_dir)
        percentage = round((used / total) * 100, 1) if total > 0 else 0.0
        return {
            "used": _human_readable_size(used),
            "available": _human_readable_size(free),
            "total": _human_readable_size(total),
            "percentage": percentage
        }
    except Exception:
        return {
            "used": "Unknown",
            "available": "Unknown",
            "total": "Unknown",
            "percentage": 0.0
        }


def get_database_size() -> tuple[int, str]:
    """Get physical size of the active database (supporting SQLite and Postgres pg_database_size)."""
    config = config_manager.get_config()
    provider = config.storage.provider

    if provider == StorageProvider.SQLITE.value:
        db_dir = os.path.join(get_app_data_dir(), "database")
        db_path = config.database.path
        if not os.path.isabs(db_path):
            db_path = os.path.join(db_dir, db_path)
        db_path = os.path.abspath(db_path)
        
        if os.path.exists(db_path):
            try:
                size = os.path.getsize(db_path)
                return size, _human_readable_size(size)
            except Exception:
                pass
        return 0, "0 B"

    # PostgreSQL (LOCAL_POSTGRES / EXTERNAL_POSTGRES)
    from backend.database import engine
    try:
        with engine.connect() as conn:
            # Query db size via SQL
            res = conn.execute(text("SELECT pg_database_size(current_database())"))
            size = res.scalar()
            if size is not None:
                return int(size), _human_readable_size(size)
    except Exception:
        # Fallback if connection fails or function not supported
        pass

    return 0, "Unknown"


def get_system_info() -> dict:
    """Collect platform hardware and environment metadata."""
    return {
        "os": f"{platform.system()} {platform.release()}",
        "architecture": platform.machine(),
        "python_version": sys.version.split()[0],
        "local_time": datetime.now().isoformat(),
        "timezone": str(datetime.now().astimezone().tzinfo)
    }
