"""
backend.backup — Backup & Restore System

All backup operations flow through BackupManager.
Do not call backup utilities (database.py, files.py) directly.

Application Data Directory
--------------------------
Production (Windows):  C:\\ProgramData\\AI Attendance System\\
Development fallback:  <project_root>/data/

The app data directory contains:
    backups/    — backup ZIP archives
    employees/  — face embedding .npy files
    uploads/    — employee photo uploads
    logs/       — application logs (future)
    config/     — application configuration (future)
"""

import os
import sys


# ─── Application Data Directory ──────────────────────────────


def _get_project_root() -> str:
    """Resolve the project root (attendance-system/)."""
    from backend.runtime import get_runtime_path
    return get_runtime_path()


def _is_development() -> bool:
    """Detect whether we are running in development mode."""
    from backend.runtime import is_packaged
    return not is_packaged()


def get_app_data_dir() -> str:
    """Return the application data directory.

    Production (Windows):
        C:\\ProgramData\\AI Attendance System\\

    Development fallback:
        <project_root>/data/
    """
    # 1. Packaged production path
    if sys.platform == "win32" and not _is_development():
        base = os.environ.get(
            "PROGRAMDATA",
            r"C:\ProgramData",
        )
        return os.path.join(base, "AI Attendance System")

    # 2. Safety Check: If development mode points to a read-only or protected system folder
    # like C:\\Program Files, force use of ProgramData.
    fallback_path = os.path.join(_get_project_root(), "data")
    norm_path = os.path.abspath(fallback_path).replace("\\", "/").lower()
    
    if "program files" in norm_path or "system32" in norm_path:
        if sys.platform == "win32":
            base = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
            return os.path.join(base, "AI Attendance System")

    # Development fallback — project-local data/
    return fallback_path


def get_backups_dir() -> str:
    """Return the default backups directory."""
    return os.path.join(get_app_data_dir(), "backups")


def get_employees_dir() -> str:
    """Return the employees (face embeddings) directory."""
    return os.path.join(get_app_data_dir(), "employees")


def get_uploads_dir() -> str:
    """Return the uploads (employee photos) directory."""
    return os.path.join(get_app_data_dir(), "uploads")


def ensure_app_directories() -> None:
    """Create all application data subdirectories if they don't exist."""
    for dir_path in (
        get_backups_dir(),
        get_employees_dir(),
        get_uploads_dir(),
        os.path.join(get_app_data_dir(), "logs"),
        os.path.join(get_app_data_dir(), "database"),
        os.path.join(get_app_data_dir(), "config"),
    ):
        os.makedirs(dir_path, exist_ok=True)


def _migrate_legacy_config() -> None:
    """Migrate app_config.json from old location to new data directory.

    Prior to Phase E1, config lived at <project_root>/config/app_config.json.
    It now lives at <app_data_dir>/config/app_config.json.

    If the old file exists and the new one does not, copy it over so the
    user's settings are preserved.  Never overwrite an existing new config.
    """
    import shutil
    from backend.runtime import get_backend_path

    old_config = os.path.join(get_backend_path(), "config", "app_config.json")
    new_config = os.path.join(get_app_data_dir(), "config", "app_config.json")

    if os.path.isfile(old_config) and not os.path.isfile(new_config):
        try:
            shutil.copy2(old_config, new_config)
            print(f"[CONFIG] Migrated legacy config from {old_config} to {new_config}")
        except Exception as e:
            print(f"[CONFIG] Failed to migrate legacy config: {e}")


# Ensure directories exist on import
ensure_app_directories()

# Migrate legacy config if needed
_migrate_legacy_config()


# ─── Singleton ────────────────────────────────────────────────

# Lazy import to avoid circular dependencies.
# BackupManager is imported when first accessed.
_backup_manager = None


def get_backup_manager():
    """Return the singleton BackupManager instance."""
    global _backup_manager
    if _backup_manager is None:
        from backend.backup.manager import BackupManager
        _backup_manager = BackupManager()
    return _backup_manager


__all__ = [
    "get_app_data_dir",
    "get_backups_dir",
    "get_employees_dir",
    "get_uploads_dir",
    "ensure_app_directories",
    "get_backup_manager",
]
