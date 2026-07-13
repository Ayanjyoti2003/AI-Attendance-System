"""
Default configuration factory.

Generates initial configuration on first boot.
If a backend/.env exists, the defaults are derived from the
current environment values to ensure backward compatibility.
"""

import os
from backend.config.models import (
    AppConfig,
    StorageConfig,
    DatabaseConfig,
    ApplicationConfig,
    StorageProvider,
)


def get_default_config() -> AppConfig:
    """
    Build a default AppConfig.

    If backend/.env contains DATABASE_URL, parse it to populate
    the database section so the current installation keeps working.
    Otherwise fall back to spec defaults.
    """
    # Try to read existing .env for backward compatibility
    env_url = _read_env_database_url()

    if env_url:
        db_config = _parse_database_url(env_url)
    else:
        db_config = DatabaseConfig()

    return AppConfig(
        schema_version=1,
        storage=StorageConfig(provider=StorageProvider.LOCAL_POSTGRES.value),
        database=db_config,
        application=ApplicationConfig(),
    )


def _read_env_database_url() -> str | None:
    """
    Read DATABASE_URL from backend/.env file directly.

    We parse the file ourselves instead of using load_dotenv
    to avoid side-effects on os.environ.
    """
    # Resolve path relative to this file:
    # this file   → backend/config/defaults.py
    # target      → backend/.env
    config_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(config_dir)
    env_path = os.path.join(backend_dir, ".env")

    if not os.path.isfile(env_path):
        return None

    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    return line.split("=", 1)[1].strip()
    except OSError:
        pass

    return None


def _parse_database_url(url: str) -> DatabaseConfig:
    """
    Parse a PostgreSQL URL into a DatabaseConfig.

    Expected format:
        postgresql://user:password@host:port/database
    """
    try:
        # Strip scheme
        rest = url.split("://", 1)[1]

        # Split credentials from host
        creds, host_part = rest.rsplit("@", 1)

        # Parse credentials
        if ":" in creds:
            username, password = creds.split(":", 1)
        else:
            username = creds
            password = ""

        # Parse host:port/database
        host_port, database = host_part.split("/", 1)

        if ":" in host_port:
            host, port_str = host_port.split(":", 1)
            port = int(port_str)
        else:
            host = host_port
            port = 5432

        return DatabaseConfig(
            host=host,
            port=port,
            database=database,
            username=username,
            password=password,
        )
    except (ValueError, IndexError):
        # If parsing fails, return defaults
        return DatabaseConfig()
