"""
ConfigurationManager — single entry point for all application configuration.

Responsibilities:
    load()                   — read config from disk, auto-generate if missing
    save()                   — persist current config to disk
    validate()               — check config fields, return list of errors
    get_config()             — expose the current AppConfig
    build_database_url()     — build a SQLAlchemy connection URL
    update_config(updates)   — partial update with re-validation
    get_database_password()  — return the database password
    test_database_connection() — verify database is reachable
"""

import json
import os
import re
from dataclasses import dataclass
from urllib.parse import quote_plus

from backend.config.models import AppConfig, StorageProvider

# ─── Paths ───────────────────────────────────────────────────

def _get_config_path() -> str:
    """Path to config/app_config.json."""
    from backend.backup import get_app_data_dir
    return os.path.join(get_app_data_dir(), "config", "app_config.json")


# ─── Validation ──────────────────────────────────────────────

@dataclass
class ValidationError:
    """A single validation failure."""
    field: str
    message: str


_HOSTNAME_RE = re.compile(
    r"^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$"
)

_DBNAME_RE = re.compile(
    r"^[a-zA-Z0-9_]+$"
)


# ─── Manager ─────────────────────────────────────────────────

class ConfigurationManager:
    """
    Centralized configuration management.

    Usage:
        from backend.config import config_manager
        config_manager.load()
        url = config_manager.build_database_url()
    """

    def __init__(self) -> None:
        self._config: AppConfig | None = None
        self._config_path: str = _get_config_path()
        self._loaded: bool = False

    # ── Load / Save ──────────────────────────────────────────

    def load(self) -> None:
        """
        Load configuration from disk.

        If the config file does not exist, generate it from defaults
        (parsing the existing .env for backward compatibility).
        """
        if self._loaded:
            return

        if os.path.isfile(self._config_path):
            self._load_from_file()
        else:
            self._generate_defaults()

        self._loaded = True

    def _load_from_file(self) -> None:
        """Read and parse config/app_config.json."""
        with open(self._config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self._config = AppConfig(**data)

    def _generate_defaults(self) -> None:
        """Auto-generate config from defaults and persist."""
        from backend.config.defaults import get_default_config

        self._config = get_default_config()
        self.save()
        print(f"[CONFIG] Generated default configuration at {self._config_path}")

    def save(self) -> None:
        """Persist current configuration to disk."""
        import time
        # Checkpoint: Before save()
        print(f"[config_cli] [{time.time()}] Before save()", flush=True)

        if self._config is None:
            raise RuntimeError("Cannot save: configuration not loaded")

        os.makedirs(os.path.dirname(self._config_path), exist_ok=True)

        with open(self._config_path, "w", encoding="utf-8") as f:
            json.dump(
                self._config.model_dump(),
                f,
                indent=4,
            )
        # Checkpoint: After save()
        print(f"[config_cli] [{time.time()}] After save()", flush=True)

    # ── Access ───────────────────────────────────────────────

    def get_config(self) -> AppConfig:
        """Return the current configuration. Loads if necessary."""
        if not self._loaded:
            self.load()
        assert self._config is not None
        return self._config

    def get_database_password(self) -> str:
        """
        Return the database password.

        Currently reads from the config file directly.
        In a future phase this will delegate to a CredentialStore
        (Fernet, Windows Credential Manager, etc.).
        """
        return self.get_config().database.password

    # ── Update ───────────────────────────────────────────────

    def update_config(self, updates: dict) -> list[ValidationError]:
        """
        Apply a partial update to the configuration.

        Args:
            updates: A dict matching the AppConfig structure.
                     Only provided keys are updated.

        Returns:
            List of validation errors (empty if valid).
        """
        config = self.get_config()
        current = config.model_dump()
        self._deep_merge(current, updates)
        self._config = AppConfig(**current)

        errors = self.validate()
        if not errors:
            self.save()

        return errors

    @staticmethod
    def _deep_merge(base: dict, overrides: dict) -> None:
        """Recursively merge overrides into base dict (in-place)."""
        for key, value in overrides.items():
            if (
                key in base
                and isinstance(base[key], dict)
                and isinstance(value, dict)
            ):
                ConfigurationManager._deep_merge(base[key], value)
            else:
                base[key] = value

    # ── Validation ───────────────────────────────────────────

    def validate(self) -> list[ValidationError]:
        """
        Validate the current configuration.

        Returns:
            List of ValidationError objects. Empty list means valid.
        """
        errors: list[ValidationError] = []
        config = self.get_config()

        # Provider
        valid_providers = [p.value for p in StorageProvider]
        if config.storage.provider not in valid_providers:
            errors.append(ValidationError(
                field="storage.provider",
                message=f"Invalid provider '{config.storage.provider}'. Must be one of: {', '.join(valid_providers)}"
            ))

        # Skip DB validation for SQLite
        if config.storage.provider != StorageProvider.SQLITE.value:
            # Host
            host = config.database.host
            if not host or not _HOSTNAME_RE.match(host):
                errors.append(ValidationError(
                    field="database.host",
                    message=f"Invalid host '{host}'. Must be a valid hostname or IP address."
                ))

            # Port
            port = config.database.port
            if not (1 <= port <= 65535):
                errors.append(ValidationError(
                    field="database.port",
                    message=f"Invalid port {port}. Must be between 1 and 65535."
                ))

            # Database name
            dbname = config.database.database
            if not dbname or not _DBNAME_RE.match(dbname):
                errors.append(ValidationError(
                    field="database.database",
                    message=f"Invalid database name '{dbname}'. Must contain only letters, numbers, and underscores."
                ))
        else:
            path = config.database.path
            if not path or not path.strip():
                errors.append(ValidationError(
                    field="database.path",
                    message="Database path must be provided for SQLite storage."
                ))

        return errors

    # ── Database URL ─────────────────────────────────────────

    def build_database_url(self) -> str:
        """
        Build a SQLAlchemy-compatible database URL from current config.

        Returns:
            Connection string for the active storage provider.

        Raises:
            ValueError: If the provider is not recognized.
        """
        config = self.get_config()
        provider = config.storage.provider

        if provider in (
            StorageProvider.LOCAL_POSTGRES.value,
            StorageProvider.EXTERNAL_POSTGRES.value,
        ):
            return self._build_postgres_url(config)

        if provider == StorageProvider.SQLITE.value:
            from backend.backup import get_app_data_dir
            db_dir = os.path.join(get_app_data_dir(), "database")
            db_path = config.database.path
            if not os.path.isabs(db_path):
                db_path = os.path.join(db_dir, db_path)
            db_path = os.path.abspath(db_path).replace("\\", "/")
            return f"sqlite:///{db_path}"

        raise ValueError(f"Unknown storage provider: {provider}")

    @staticmethod
    def _build_postgres_url(config: AppConfig) -> str:
        """Build a PostgreSQL connection URL."""
        db = config.database
        # URL-encode username and password to handle special characters
        user = quote_plus(db.username)
        password = quote_plus(db.password)
        return f"postgresql://{user}:{password}@{db.host}:{db.port}/{db.database}"

    # ── Connection Test ──────────────────────────────────────

    def test_database_connection(self) -> dict:
        """
        Test database connectivity using the current configuration.

        Returns:
            {
                "success": True/False,
                "message": "..." ,
                "details": { ... }   # only on success
            }
        """
        try:
            from sqlalchemy import create_engine, text

            config = self.get_config()
            provider = config.storage.provider

            if provider == StorageProvider.SQLITE.value:
                from backend.backup import get_app_data_dir
                db_dir = os.path.join(get_app_data_dir(), "database")
                db_path = config.database.path
                if not os.path.isabs(db_path):
                    db_path = os.path.join(db_dir, db_path)
                db_dir_abs = os.path.dirname(os.path.abspath(db_path))

                os.makedirs(db_dir_abs, exist_ok=True)
                if not os.access(db_dir_abs, os.W_OK):
                    return {
                        "success": False,
                        "message": f"Database connection failed: Directory '{db_dir_abs}' is not writable.",
                    }

            url = self.build_database_url()
            connect_args = {}
            if provider == StorageProvider.SQLITE.value:
                connect_args["check_same_thread"] = False

            test_engine = create_engine(url, connect_args=connect_args)

            with test_engine.connect() as conn:
                # Run a simple query to verify full connectivity
                result = conn.execute(text("SELECT 1"))
                result.fetchone()

            test_engine.dispose()

            if provider == StorageProvider.SQLITE.value:
                return {
                    "success": True,
                    "message": "Database connection successful.",
                    "details": {
                        "provider": provider,
                        "path": config.database.path,
                    },
                }

            return {
                "success": True,
                "message": "Database connection successful.",
                "details": {
                    "provider": config.storage.provider,
                    "host": config.database.host,
                    "port": config.database.port,
                    "database": config.database.database,
                },
            }

        except Exception as e:
            return {
                "success": False,
                "message": f"Database connection failed: {str(e)}",
            }

