"""
BackupManager — single entry point for all backup & restore operations.

All backup operations flow through this class.
Do not call database.py or files.py utilities directly.

Usage:
    from backend.backup import get_backup_manager

    manager = get_backup_manager()
    result = manager.create_backup(username="admin")
    backups = manager.list_backups()
    result = manager.restore_backup("AI_Attendance_Backup_2026_06_24_1430.zip", username="admin")
"""

import json
import os
import tempfile
import zipfile
from datetime import datetime

from backend.backup import (
    get_backups_dir,
    get_employees_dir,
    get_uploads_dir,
)
from backend.backup.database import DatabaseBackup
from backend.backup.files import FileBackup
from backend.backup.models import (
    BackupInfo,
    BackupMetadata,
    BackupResult,
    REQUIRED_ZIP_ENTRIES,
    SUPPORTED_BACKUP_VERSIONS,
)


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


class BackupManager:
    """Centralized backup & restore orchestrator."""

    def __init__(self) -> None:
        self._db_backup = DatabaseBackup()
        self._file_backup = FileBackup()

    # ── Create Backup ────────────────────────────────────────

    def create_backup(self, username: str = "system") -> BackupResult:
        """Create a full system backup.

        Produces a timestamped ZIP archive containing:
            - metadata.json
            - database/database_backup.sql
            - employees/*.npy
            - uploads/*
            - config/app_config.json

        Args:
            username: The user who triggered the backup (for audit).

        Returns:
            BackupResult with status, filename, and timestamp.
        """
        now = datetime.now()
        timestamp = now.strftime("%Y_%m_%d_%H%M")
        filename = f"AI_Attendance_Backup_{timestamp}.zip"

        backup_dir = self._get_backup_directory()
        os.makedirs(backup_dir, exist_ok=True)
        backup_path = os.path.join(backup_dir, filename)

        try:
            from backend.config import config_manager
            provider = config_manager.get_config().storage.provider
            db_filename = "database_backup.db" if self._get_database_type() == "SQLITE" else "database_backup.sql"

            # Create a temporary directory for the database dump
            with tempfile.TemporaryDirectory() as tmp_dir:
                sql_path = os.path.join(tmp_dir, db_filename)

                # 1. Database export
                self._db_backup.export(sql_path)

                # 2. Build ZIP archive
                with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    # Metadata
                    metadata = BackupMetadata(
                        created_at=now.isoformat(),
                        database_type=self._get_database_type(),
                        database_provider=provider.upper(),
                        created_by=username,
                    )
                    zf.writestr(
                        "metadata.json",
                        json.dumps(metadata.model_dump(), indent=2),
                    )

                    # Database dump
                    zf.write(sql_path, f"database/{db_filename}")

                    # Employee embeddings
                    employees_dir = get_employees_dir()
                    self._file_backup.export_employees(zf, employees_dir)

                    # Employee photos
                    uploads_dir = get_uploads_dir()
                    self._file_backup.export_uploads(zf, uploads_dir)

                    # Configuration
                    config_path = self._get_config_path()
                    self._file_backup.export_config(zf, config_path)

            # Audit log
            self._log_audit(
                username=username,
                action="BACKUP_CREATED",
                details=f"Backup created: {filename}",
            )

            return BackupResult(
                status="success",
                message="Backup created successfully.",
                file=filename,
                created_at=now.isoformat(),
            )

        except Exception as e:
            # Clean up partial backup
            if os.path.isfile(backup_path):
                try:
                    os.remove(backup_path)
                except OSError:
                    pass

            error_message = self._translate_error(str(e))

            self._log_audit(
                username=username,
                action="BACKUP_FAILED",
                details=f"Backup failed: {error_message}",
            )

            return BackupResult(
                status="error",
                message=error_message,
            )

    # ── Restore Backup ───────────────────────────────────────

    def restore_backup(
        self,
        filename: str,
        username: str = "system",
        restore_db_connection: bool = False,
    ) -> BackupResult:
        """Restore a system backup.

        Restore flow:
            1. Validate the backup ZIP
            2. Create a safety backup (pre_restore_safety_backup.zip)
            3. Restore database from SQL dump
            4. Restore employee embeddings
            5. Restore uploaded photos
            6. Restore configuration (preserving DB connection by default)
            7. Reload configuration

        Args:
            filename: Name of the backup ZIP file.
            username: The user who triggered the restore (for audit).
            restore_db_connection: If True, also restore database
                connection settings from the backup.

        Returns:
            BackupResult with status and restart_required flag.
        """
        backup_dir = self._get_backup_directory()
        backup_path = os.path.join(backup_dir, filename)

        if not os.path.isfile(backup_path):
            return BackupResult(
                status="error",
                message="Backup file not found.",
            )

        # 1. Validate
        validation = self.validate_backup(filename)
        if validation["status"] != "valid":
            return BackupResult(
                status="error",
                message=f"Invalid backup: {validation['message']}",
            )

        try:
            # 2. Create safety backup
            safety_result = self._create_safety_backup(username)
            if safety_result.status == "error":
                return BackupResult(
                    status="error",
                    message=f"Failed to create safety backup: {safety_result.message}",
                )

            with zipfile.ZipFile(backup_path, "r") as zf:
                # 3. Restore database
                with tempfile.TemporaryDirectory() as tmp_dir:
                    meta = {}
                    if "metadata.json" in zf.namelist():
                        with zf.open("metadata.json") as mf:
                            meta = json.loads(mf.read().decode("utf-8"))

                    db_type = meta.get("database_type", "POSTGRES")
                    db_provider = meta.get("database_provider", "LOCAL_POSTGRES")

                    db_filename = "database_backup.db" if (db_type == "SQLITE" or db_provider == "SQLITE") else "database_backup.sql"
                    db_entry = f"database/{db_filename}"

                    if db_entry not in zf.namelist():
                        fallback_filename = "database_backup.sql" if db_filename == "database_backup.db" else "database_backup.db"
                        if f"database/{fallback_filename}" in zf.namelist():
                            db_entry = f"database/{fallback_filename}"
                            db_filename = fallback_filename

                    if db_entry in zf.namelist():
                        db_tmp_path = os.path.join(tmp_dir, db_filename)
                        with zf.open(db_entry) as src, open(db_tmp_path, "wb") as dst:
                            dst.write(src.read())
                        self._db_backup.restore(db_tmp_path)

                # 4. Restore employee embeddings
                employees_dir = get_employees_dir()
                self._file_backup.restore_employees(zf, employees_dir)

                # 5. Restore uploaded photos
                uploads_dir = get_uploads_dir()
                self._file_backup.restore_uploads(zf, uploads_dir)

                # 6. Restore configuration
                config_path = self._get_config_path()
                self._file_backup.restore_config(
                    zf,
                    config_path,
                    restore_db_connection=restore_db_connection,
                )

            # 7. Reload configuration
            self._reload_config()

            self._log_audit(
                username=username,
                action="BACKUP_RESTORED",
                details=(
                    f"Restored from: {filename} "
                    f"(safety backup: {safety_result.file})"
                ),
            )

            return BackupResult(
                status="success",
                message=(
                    "Backup restored successfully. "
                    "Application restart is required for changes to take full effect."
                ),
                file=filename,
                restart_required=True,
            )

        except Exception as e:
            error_message = self._translate_error(str(e))

            self._log_audit(
                username=username,
                action="BACKUP_FAILED",
                details=f"Restore failed: {error_message}",
            )

            return BackupResult(
                status="error",
                message=error_message,
            )

    # ── List Backups ─────────────────────────────────────────

    def list_backups(self) -> list[BackupInfo]:
        """List all available backup files.

        Returns:
            List of BackupInfo sorted by filename (newest first).
        """
        backup_dir = self._get_backup_directory()

        if not os.path.isdir(backup_dir):
            return []

        backups = []

        for filename in os.listdir(backup_dir):
            if not filename.endswith(".zip"):
                continue

            filepath = os.path.join(backup_dir, filename)
            stat = os.stat(filepath)

            # Try to extract created_at from metadata.json
            created_at = self._extract_created_at(filepath)
            if not created_at:
                created_at = datetime.fromtimestamp(stat.st_mtime).isoformat()

            backups.append(
                BackupInfo(
                    filename=filename,
                    size_bytes=stat.st_size,
                    size_display=_human_readable_size(stat.st_size),
                    created_at=created_at,
                )
            )

        # Sort newest first
        backups.sort(key=lambda b: b.filename, reverse=True)
        return backups

    # ── Delete Backup ────────────────────────────────────────

    def delete_backup(
        self,
        filename: str,
        username: str = "system",
    ) -> BackupResult:
        """Delete a backup file.

        Args:
            filename: Name of the backup ZIP to delete.
            username: The user who triggered the deletion (for audit).

        Returns:
            BackupResult with status.
        """
        backup_dir = self._get_backup_directory()
        filepath = os.path.join(backup_dir, filename)

        if not os.path.isfile(filepath):
            return BackupResult(
                status="error",
                message="Backup file not found.",
            )

        try:
            os.remove(filepath)

            self._log_audit(
                username=username,
                action="BACKUP_DELETED",
                details=f"Deleted backup: {filename}",
            )

            return BackupResult(
                status="success",
                message="Backup deleted successfully.",
            )

        except PermissionError:
            return BackupResult(
                status="error",
                message="Backup file is in use and cannot be deleted.",
            )
        except OSError as e:
            return BackupResult(
                status="error",
                message=f"Failed to delete backup: {self._translate_error(str(e))}",
            )

    # ── Validate Backup ──────────────────────────────────────

    def validate_backup(self, filename: str) -> dict:
        """Validate a backup ZIP file.

        Checks:
            - ZIP format integrity
            - metadata.json exists and is valid
            - backup_version is supported
            - Required folders exist

        Args:
            filename: Name of the backup ZIP to validate.

        Returns:
            {"status": "valid"} or {"status": "invalid", "message": "..."}
        """
        backup_dir = self._get_backup_directory()
        filepath = os.path.join(backup_dir, filename)

        if not os.path.isfile(filepath):
            return {"status": "invalid", "message": "Backup file not found."}

        # Check ZIP format
        if not zipfile.is_zipfile(filepath):
            return {"status": "invalid", "message": "File is not a valid ZIP archive."}

        try:
            with zipfile.ZipFile(filepath, "r") as zf:
                names = set(zf.namelist())

                # Add directory entries for files (some ZIP tools don't include them)
                for name in list(names):
                    parts = name.split("/")
                    for i in range(1, len(parts)):
                        names.add("/".join(parts[:i]) + "/")

                # Check metadata.json
                if "metadata.json" not in names:
                    return {
                        "status": "invalid",
                        "message": "Missing metadata.json in backup archive.",
                    }

                # Parse metadata
                with zf.open("metadata.json") as f:
                    metadata = json.loads(f.read().decode("utf-8"))

                # Check backup version
                backup_version = metadata.get("backup_version", 0)
                if backup_version not in SUPPORTED_BACKUP_VERSIONS:
                    return {
                        "status": "invalid",
                        "message": (
                            f"Unsupported backup version: {backup_version}. "
                            f"Supported versions: {sorted(SUPPORTED_BACKUP_VERSIONS)}"
                        ),
                    }

                # Check required folders
                for required in REQUIRED_ZIP_ENTRIES:
                    if required not in names:
                        return {
                            "status": "invalid",
                            "message": f"Missing required entry: {required}",
                        }

        except zipfile.BadZipFile:
            return {"status": "invalid", "message": "Corrupted ZIP archive."}
        except (json.JSONDecodeError, KeyError) as e:
            return {"status": "invalid", "message": f"Invalid metadata: {e}"}

        return {"status": "valid"}

    # ── Internals ────────────────────────────────────────────

    def _get_backup_directory(self) -> str:
        """Return the configured backup directory.

        Falls back to the default backups directory if not configured.
        """
        from backend.config import config_manager

        config = config_manager.get_config()
        destination = config.backup.destination

        if destination and os.path.isabs(destination):
            os.makedirs(destination, exist_ok=True)
            return destination

        return get_backups_dir()

    def _create_safety_backup(self, username: str) -> BackupResult:
        """Create a safety backup before restoring.

        Named: pre_restore_safety_backup_YYYYMMDD_HHMM.zip
        """
        now = datetime.now()
        timestamp = now.strftime("%Y%m%d_%H%M")
        filename = f"pre_restore_safety_backup_{timestamp}.zip"

        backup_dir = self._get_backup_directory()
        os.makedirs(backup_dir, exist_ok=True)
        backup_path = os.path.join(backup_dir, filename)

        try:
            from backend.config import config_manager
            provider = config_manager.get_config().storage.provider
            db_filename = "database_backup.db" if self._get_database_type() == "SQLITE" else "database_backup.sql"

            with tempfile.TemporaryDirectory() as tmp_dir:
                sql_path = os.path.join(tmp_dir, db_filename)
                self._db_backup.export(sql_path)

                with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    metadata = BackupMetadata(
                        created_at=now.isoformat(),
                        database_type=self._get_database_type(),
                        database_provider=provider.upper(),
                        created_by=f"system (pre-restore by {username})",
                    )
                    zf.writestr(
                        "metadata.json",
                        json.dumps(metadata.model_dump(), indent=2),
                    )
                    zf.write(sql_path, f"database/{db_filename}")

                    employees_dir = get_employees_dir()
                    self._file_backup.export_employees(zf, employees_dir)

                    uploads_dir = get_uploads_dir()
                    self._file_backup.export_uploads(zf, uploads_dir)

                    config_path = self._get_config_path()
                    self._file_backup.export_config(zf, config_path)

            return BackupResult(
                status="success",
                message="Safety backup created.",
                file=filename,
                created_at=now.isoformat(),
            )

        except Exception as e:
            return BackupResult(
                status="error",
                message=self._translate_error(str(e)),
            )

    @staticmethod
    def _get_database_type() -> str:
        """Return the current database type string for metadata."""
        from backend.config import config_manager
        from backend.config.models import StorageProvider

        provider = config_manager.get_config().storage.provider
        if provider in (
            StorageProvider.LOCAL_POSTGRES.value,
            StorageProvider.EXTERNAL_POSTGRES.value,
        ):
            return "POSTGRES"
        return provider.upper()

    @staticmethod
    def _get_config_path() -> str:
        """Return the path to app_config.json."""
        from backend.config.manager import _get_config_path
        return _get_config_path()

    @staticmethod
    def _reload_config() -> None:
        """Reload ConfigurationManager after restoring config."""
        from backend.config import config_manager

        config_manager._loaded = False
        config_manager._config = None
        config_manager.load()

    @staticmethod
    def _extract_created_at(filepath: str) -> str | None:
        """Extract created_at from a backup ZIP's metadata.json."""
        try:
            with zipfile.ZipFile(filepath, "r") as zf:
                if "metadata.json" in zf.namelist():
                    with zf.open("metadata.json") as f:
                        metadata = json.loads(f.read().decode("utf-8"))
                    return metadata.get("created_at")
        except Exception:
            pass
        return None

    @staticmethod
    def _log_audit(username: str, action: str, details: str) -> None:
        """Log a backup event to the audit log."""
        try:
            from backend.audit import create_audit_log
            create_audit_log(
                username=username,
                action=action,
                details=details,
            )
        except Exception as e:
            # Don't let audit failures break backup operations
            print(f"[BACKUP] Audit log failed: {e}")

    @staticmethod
    def _translate_error(raw_error: str) -> str:
        """Translate raw Python errors into user-friendly messages."""
        lower = raw_error.lower()

        if "pg_dump" in lower and "not found" in lower:
            return (
                "PostgreSQL tools (pg_dump) not found. "
                "Please ensure PostgreSQL is installed."
            )

        if "pg_dump failed" in lower or "pg_dump" in lower:
            return (
                "Database backup failed. "
                "Please verify the database connection is active."
            )

        if "psql" in lower and "not found" in lower:
            return (
                "PostgreSQL tools (psql) not found. "
                "Please ensure PostgreSQL is installed."
            )

        if "schema reset failed" in lower or "database restore failed" in lower:
            return (
                "Database restore failed. "
                "Please verify the database connection and try again."
            )

        if "permission denied" in lower or "access is denied" in lower:
            return "Backup location is not writable. Check folder permissions."

        if "no space left" in lower or "disk full" in lower:
            return "Not enough disk space to create the backup."

        if "connection refused" in lower or "could not connect" in lower:
            return (
                "Database connection failed. "
                "Please verify the database server is running."
            )

        if "password authentication failed" in lower:
            return (
                "Database authentication failed. "
                "Please verify your database credentials."
            )

        if "timeout" in lower:
            return "Operation timed out. The database may be under heavy load."

        # Fallback: return cleaned-up error
        return f"An error occurred: {raw_error}"
