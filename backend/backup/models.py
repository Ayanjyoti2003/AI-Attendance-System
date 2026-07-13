"""
Backup data models.

Pydantic v2 models for backup metadata, API responses,
and settings serialization.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BackupMetadata(BaseModel):
    """Serialized as metadata.json inside each backup ZIP."""

    app: str = Field(default="AI Attendance System")
    version: str = Field(default="1.0.0")
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    database_type: str = Field(default="POSTGRES")
    database_provider: str = Field(default="LOCAL_POSTGRES")
    backup_version: int = Field(default=1)
    created_by: str = Field(default="system")


class BackupInfo(BaseModel):
    """Returned by the list-backups endpoint."""

    filename: str
    size_bytes: int
    size_display: str  # human-readable, e.g. "12.4 MB"
    created_at: str


class BackupResult(BaseModel):
    """Returned by create / restore endpoints."""

    status: str  # "success" | "error"
    message: str
    file: Optional[str] = None
    created_at: Optional[str] = None
    restart_required: bool = False


class RestoreRequest(BaseModel):
    """Request body for the restore endpoint."""

    filename: str
    restore_db_connection: bool = Field(
        default=False,
        description=(
            "If True, also restore database connection settings "
            "(host, port, username, password). Defaults to False to "
            "prevent breaking the current database connection when "
            "restoring from another machine."
        ),
    )


class BackupSettings(BaseModel):
    """Backup schedule settings — maps to ConfigurationManager.backup."""

    enabled: bool = False
    automatic: bool = False
    frequency: str = "daily"  # daily | weekly | monthly
    keep: int = 30
    destination: str = ""
    backup_time: str = "02:00"


# ─── Supported backup versions ──────────────────────────────

SUPPORTED_BACKUP_VERSIONS = {1}

# ─── Required folders inside a backup ZIP ────────────────────

REQUIRED_ZIP_ENTRIES = {"metadata.json", "database/", "config/"}
