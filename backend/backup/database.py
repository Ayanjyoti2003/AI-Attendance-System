"""
Database backup and restore utilities.

Supports LOCAL_POSTGRES, EXTERNAL_POSTGRES (via pg_dump / psql),
and SQLITE (via file copy / atomic replace) providers.
Reads connection details from ConfigurationManager — never hardcoded.

Note for packaged builds:
    Electron/packaged distributions must bundle pg_dump and psql
    binaries, or ensure PostgreSQL is installed on the target machine.
    See docs/backup_restore.md for packaging guidance.
"""

import os
import subprocess
from typing import Optional


class DatabaseBackup:
    """PostgreSQL backup and restore using pg_dump / psql."""

    def __init__(self) -> None:
        self._pg_dump_path: Optional[str] = None
        self._psql_path: Optional[str] = None

    # ── Public API ───────────────────────────────────────────

    def export(self, output_path: str) -> None:
        """Export the database. For PostgreSQL, uses pg_dump. For SQLite, copies the db file.

        Args:
            output_path: Absolute path for the output file.

        Raises:
            RuntimeError: If backup fails.
        """
        from backend.config import config_manager
        from backend.config.models import StorageProvider

        config = config_manager.get_config()
        provider = config.storage.provider

        if provider == StorageProvider.SQLITE.value:
            from backend.backup import get_app_data_dir
            import shutil

            db_path = config.database.path
            if not os.path.isabs(db_path):
                db_path = os.path.join(get_app_data_dir(), "database", db_path)
            db_path = os.path.abspath(db_path)

            if os.path.isfile(db_path):
                shutil.copy2(db_path, output_path)
            else:
                # Create an empty file if the database doesn't exist yet
                with open(output_path, "wb") as f:
                    pass
            return

        # PostgreSQL export
        db_config = self._get_db_config()
        pg_dump = self._find_pg_tool("pg_dump")

        env = os.environ.copy()
        env["PGPASSWORD"] = db_config["password"]

        cmd = [
            pg_dump,
            "-h", db_config["host"],
            "-p", str(db_config["port"]),
            "-U", db_config["username"],
            "-d", db_config["database"],
            "--no-owner",
            "--no-privileges",
            "-f", output_path,
        ]

        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=300,  # 5-minute timeout
        )

        if result.returncode != 0:
            error_msg = result.stderr.strip() if result.stderr else "Unknown error"
            raise RuntimeError(
                f"pg_dump failed (exit code {result.returncode}): {error_msg}"
            )

    def restore(self, sql_path: str) -> None:
        """Restore the database. For PostgreSQL, uses psql. For SQLite, replaces the db file safely.

        Args:
            sql_path: Absolute path to the backup file.

        Raises:
            RuntimeError: If restore fails.
        """
        if not os.path.isfile(sql_path):
            raise FileNotFoundError(f"Database backup file not found: {sql_path}")

        from backend.config import config_manager
        from backend.config.models import StorageProvider

        config = config_manager.get_config()
        provider = config.storage.provider

        if provider == StorageProvider.SQLITE.value:
            from backend.backup import get_app_data_dir
            import shutil

            db_path = config.database.path
            if not os.path.isabs(db_path):
                db_path = os.path.join(get_app_data_dir(), "database", db_path)
            db_path = os.path.abspath(db_path)

            os.makedirs(os.path.dirname(db_path), exist_ok=True)

            # Dispose engine connections to free the SQLite file lock
            try:
                from backend.database import engine
                engine.dispose()
            except Exception as e:
                print(f"[RESTORE] Failed to dispose database engine: {e}")

            temp_db_path = db_path + ".tmp"
            try:
                shutil.copy2(sql_path, temp_db_path)
                if os.path.isfile(db_path):
                    os.remove(db_path)
                os.rename(temp_db_path, db_path)
            except Exception as e:
                if os.path.isfile(temp_db_path):
                    os.remove(temp_db_path)
                raise RuntimeError(f"Failed to restore SQLite database: {e}")
            return

        # PostgreSQL restore
        db_config = self._get_db_config()
        psql = self._find_pg_tool("psql")

        env = os.environ.copy()
        env["PGPASSWORD"] = db_config["password"]

        # Drop and recreate all public schema objects before restoring
        drop_cmd = [
            psql,
            "-h", db_config["host"],
            "-p", str(db_config["port"]),
            "-U", db_config["username"],
            "-d", db_config["database"],
            "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
        ]

        drop_result = subprocess.run(
            drop_cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )

        if drop_result.returncode != 0:
            error_msg = drop_result.stderr.strip() if drop_result.stderr else "Unknown error"
            raise RuntimeError(
                f"Schema reset failed (exit code {drop_result.returncode}): {error_msg}"
            )

        # Restore from SQL file
        restore_cmd = [
            psql,
            "-h", db_config["host"],
            "-p", str(db_config["port"]),
            "-U", db_config["username"],
            "-d", db_config["database"],
            "-f", sql_path,
        ]

        restore_result = subprocess.run(
            restore_cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )

        if restore_result.returncode != 0:
            error_msg = restore_result.stderr.strip() if restore_result.stderr else "Unknown error"
            # psql may return warnings on restore — only fail on hard errors
            if "ERROR" in (restore_result.stderr or ""):
                raise RuntimeError(
                    f"Database restore failed: {error_msg}"
                )

    # ── Internals ────────────────────────────────────────────

    @staticmethod
    def _get_db_config() -> dict:
        """Read database connection details from ConfigurationManager."""
        from backend.config import config_manager
        from backend.config.models import StorageProvider

        config = config_manager.get_config()

        if config.storage.provider not in (
            StorageProvider.LOCAL_POSTGRES.value,
            StorageProvider.EXTERNAL_POSTGRES.value,
            StorageProvider.SQLITE.value,
        ):
            raise RuntimeError(
                f"Database backup is only supported for PostgreSQL or SQLite. "
                f"Current provider: {config.storage.provider}"
            )

        return {
            "host": config.database.host,
            "port": config.database.port,
            "database": config.database.database,
            "username": config.database.username,
            "password": config.database.password,
        }

    def _find_pg_tool(self, name: str) -> str:
        """Locate a PostgreSQL CLI tool (pg_dump or psql).

        Args:
            name: Tool name, e.g. "pg_dump" or "psql".

        Returns:
            Absolute path to the tool executable.

        Raises:
            RuntimeError: If the tool cannot be found.
        """
        # Check cache
        if name == "pg_dump" and self._pg_dump_path:
            return self._pg_dump_path
        if name == "psql" and self._psql_path:
            return self._psql_path

        from backend.postgres_runtime import get_postgres_binary
        path = get_postgres_binary(name)
        self._cache_path(name, path)
        return path

    def _cache_path(self, name: str, path: str) -> None:
        """Cache a resolved tool path."""
        if name == "pg_dump":
            self._pg_dump_path = path
        elif name == "psql":
            self._psql_path = path

