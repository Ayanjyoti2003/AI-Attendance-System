"""
Configuration data models.

Pydantic v2 models that define the shape of app_config.json.
StorageProvider enum defines supported database backends.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class StorageProvider(str, Enum):
    """
    Supported storage backends.

    LOCAL_POSTGRES   — PostgreSQL installed on the same machine
    EXTERNAL_POSTGRES — Any remote PostgreSQL (Supabase, Neon, Railway, AWS RDS, Azure, etc.)
    SQLITE           — Embedded SQLite database for lightweight deployments
    """
    LOCAL_POSTGRES = "local_postgres"
    EXTERNAL_POSTGRES = "external_postgres"
    SQLITE = "sqlite"


# ─── Config Sections ────────────────────────────────────────


class StorageConfig(BaseModel):
    """Which storage backend is active."""
    provider: str = Field(
        default=StorageProvider.LOCAL_POSTGRES.value,
        description="Active storage provider (local_postgres | external_postgres | sqlite)"
    )


class DatabaseConfig(BaseModel):
    """Database connection parameters."""
    host: str = Field(default="localhost", description="Database host")
    port: int = Field(default=5432, description="Database port")
    database: str = Field(default="attendance", description="Database name")
    username: str = Field(default="attendance_admin", description="Database username")
    password: str = Field(default="", description="Database password")
    ssl: bool = Field(default=False, description="Use SSL for connection")
    path: str = Field(default="attendance.db", description="SQLite database path")



class BackupConfig(BaseModel):
    """Backup settings for manual and automatic backups."""
    enabled: bool = False
    automatic: bool = False
    frequency: str = "daily"  # daily | weekly | monthly
    keep: int = 30
    destination: str = ""
    backup_time: str = "02:00"  # HH:MM format


class CamerasConfig(BaseModel):
    """Camera settings — reserved for future implementation."""
    poll_interval: int = Field(default=15, description="Camera poll interval in seconds")


class RecognitionConfig(BaseModel):
    """Recognition settings — reserved for future implementation."""
    confidence_threshold: float = Field(default=0.6, description="Face recognition confidence threshold")


class ApplicationConfig(BaseModel):
    """Application-level settings."""
    theme: str = Field(default="dark", description="UI theme (dark | light)")
    first_run_complete: bool = Field(default=False, description="Whether first-run wizard has completed")
    setup_complete: bool = Field(default=False, description="Whether initial setup is complete")


class UpdatesConfig(BaseModel):
    """Update settings — reserved for future implementation."""
    auto_check: bool = Field(default=False, description="Automatically check for updates")
    channel: str = Field(default="stable", description="Update channel (stable | beta)")


# ─── Root Config ─────────────────────────────────────────────


class AppConfig(BaseModel):
    """
    Root configuration model.

    Maps 1:1 with config/app_config.json.
    """
    schema_version: int = Field(default=1, description="Configuration schema version for future migrations")
    storage: StorageConfig = Field(default_factory=StorageConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    backup: BackupConfig = Field(default_factory=BackupConfig)
    cameras: CamerasConfig = Field(default_factory=CamerasConfig)
    recognition: RecognitionConfig = Field(default_factory=RecognitionConfig)
    application: ApplicationConfig = Field(default_factory=ApplicationConfig)
    updates: UpdatesConfig = Field(default_factory=UpdatesConfig)
