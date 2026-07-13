"""
File backup and restore utilities.

Handles:
    - Employee face embeddings  (data/employees/*.npy)
    - Employee uploaded photos  (data/uploads/*)
    - Application configuration (config/app_config.json)

Restore automatically creates missing directories.
"""

import json
import os
import zipfile
from typing import Optional


class FileBackup:
    """Backup and restore files to/from a ZIP archive."""

    # ── Export (add to ZIP) ──────────────────────────────────

    @staticmethod
    def export_employees(zf: zipfile.ZipFile, source_dir: str) -> int:
        """Add employee embedding files (.npy) to the ZIP.

        Args:
            zf: Open ZipFile in write mode.
            source_dir: Absolute path to the employees directory.

        Returns:
            Number of files added.
        """
        count = 0
        if not os.path.isdir(source_dir):
            return count

        for filename in os.listdir(source_dir):
            if filename.lower().endswith(".npy"):
                filepath = os.path.join(source_dir, filename)
                zf.write(filepath, f"employees/{filename}")
                count += 1

        return count

    @staticmethod
    def export_uploads(zf: zipfile.ZipFile, source_dir: str) -> int:
        """Add uploaded employee photos to the ZIP.

        Supports common image formats.

        Args:
            zf: Open ZipFile in write mode.
            source_dir: Absolute path to the uploads directory.

        Returns:
            Number of files added.
        """
        image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif"}
        count = 0

        if not os.path.isdir(source_dir):
            return count

        for filename in os.listdir(source_dir):
            _, ext = os.path.splitext(filename)
            if ext.lower() in image_exts:
                filepath = os.path.join(source_dir, filename)
                zf.write(filepath, f"uploads/{filename}")
                count += 1

        return count

    @staticmethod
    def export_config(zf: zipfile.ZipFile, config_path: str) -> bool:
        """Add app_config.json to the ZIP.

        Args:
            zf: Open ZipFile in write mode.
            config_path: Absolute path to app_config.json.

        Returns:
            True if the config was added, False if not found.
        """
        if not os.path.isfile(config_path):
            return False

        zf.write(config_path, "config/app_config.json")
        return True

    # ── Restore (extract from ZIP) ───────────────────────────

    @staticmethod
    def restore_employees(zf: zipfile.ZipFile, target_dir: str) -> int:
        """Extract employee embeddings from the ZIP.

        Args:
            zf: Open ZipFile in read mode.
            target_dir: Absolute path to the employees directory.

        Returns:
            Number of files restored.
        """
        os.makedirs(target_dir, exist_ok=True)
        count = 0

        for entry in zf.namelist():
            if entry.startswith("employees/") and not entry.endswith("/"):
                filename = os.path.basename(entry)
                if filename:
                    target_path = os.path.join(target_dir, filename)
                    with zf.open(entry) as src, open(target_path, "wb") as dst:
                        dst.write(src.read())
                    count += 1

        return count

    @staticmethod
    def restore_uploads(zf: zipfile.ZipFile, target_dir: str) -> int:
        """Extract uploaded photos from the ZIP.

        Args:
            zf: Open ZipFile in read mode.
            target_dir: Absolute path to the uploads directory.

        Returns:
            Number of files restored.
        """
        os.makedirs(target_dir, exist_ok=True)
        count = 0

        for entry in zf.namelist():
            if entry.startswith("uploads/") and not entry.endswith("/"):
                filename = os.path.basename(entry)
                if filename:
                    target_path = os.path.join(target_dir, filename)
                    with zf.open(entry) as src, open(target_path, "wb") as dst:
                        dst.write(src.read())
                    count += 1

        return count

    @staticmethod
    def restore_config(
        zf: zipfile.ZipFile,
        target_path: str,
        restore_db_connection: bool = False,
    ) -> bool:
        """Extract and restore app_config.json from the ZIP.

        Separates application settings from database connection settings.
        Database connection settings (host, port, username, password, ssl)
        are only restored if ``restore_db_connection`` is True.  This
        prevents breaking the current database connection when restoring
        a backup from another machine.

        Args:
            zf: Open ZipFile in read mode.
            target_path: Absolute path where app_config.json should go.
            restore_db_connection: If True, also overwrite database
                connection settings.

        Returns:
            True if config was restored, False if not found in ZIP.
        """
        config_entry = "config/app_config.json"
        if config_entry not in zf.namelist():
            return False

        os.makedirs(os.path.dirname(target_path), exist_ok=True)

        # Read the backup config
        with zf.open(config_entry) as src:
            backup_config = json.loads(src.read().decode("utf-8"))

        # Read the current config (if it exists)
        current_config: Optional[dict] = None
        if os.path.isfile(target_path):
            try:
                with open(target_path, "r", encoding="utf-8") as f:
                    current_config = json.load(f)
            except (json.JSONDecodeError, OSError):
                current_config = None

        if current_config and not restore_db_connection:
            # Preserve current database connection settings
            if "database" in current_config:
                backup_config["database"] = current_config["database"]
            # Preserve current storage provider
            if "storage" in current_config:
                backup_config["storage"] = current_config["storage"]

        # Write merged config
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(backup_config, f, indent=4)

        return True
