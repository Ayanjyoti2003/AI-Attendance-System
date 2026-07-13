from pydantic import BaseModel, Field
from typing import Optional

class ApplicationHealth(BaseModel):
    version: str = Field(..., description="Application version")
    uptime: str = Field(..., description="Uptime in human-readable format")

class DatabaseHealth(BaseModel):
    provider: str = Field(..., description="Active database provider (SQLITE | LOCAL_POSTGRES | EXTERNAL_POSTGRES)")
    connected: bool = Field(..., description="Database connection status")
    latency_ms: int = Field(..., description="Query latency in milliseconds")
    migration_status: str = Field(..., description="Alembic schema migration status (UP_TO_DATE | MIGRATION_REQUIRED)")
    size_bytes: int = Field(..., description="Database file size in bytes")
    size_display: str = Field(..., description="Human-readable database file size")

class CameraSystemHealth(BaseModel):
    manager_running: bool = Field(..., description="Whether Camera Manager daemon is running")
    total_cameras: int = Field(..., description="Total active cameras configured in system")
    online: int = Field(..., description="Number of cameras currently ONLINE")
    offline: int = Field(..., description="Number of cameras currently OFFLINE")
    error: int = Field(..., description="Number of cameras currently in ERROR state")
    last_heartbeat: Optional[str] = Field(None, description="ISO timestamp of last camera activity")

class BackupHealth(BaseModel):
    enabled: bool = Field(..., description="Whether backups are enabled")
    automatic: bool = Field(..., description="Whether automatic backups are enabled")
    last_backup: Optional[str] = Field(None, description="ISO timestamp of last successful backup")
    status: str = Field(..., description="Backup status (OK | OVERDUE)")
    backup_folder: str = Field(..., description="Absolute path of the backups directory")
    backup_count: int = Field(..., description="Total number of backup archives")
    storage_used: str = Field(..., description="Human-readable storage used by backups")

class StorageHealth(BaseModel):
    used: str = Field(..., description="Used storage size")
    available: str = Field(..., description="Available storage size")
    total: str = Field(..., description="Total disk space")
    percentage: float = Field(..., description="Disk usage percentage")

class AIEngineHealth(BaseModel):
    device: str = Field(..., description="Device type (CPU / CUDA)")
    model_loaded: bool = Field(..., description="Whether the face recognition model is ready in memory")
    known_faces: int = Field(..., description="Number of processed face embeddings in employees data")

class SystemHealthResponse(BaseModel):
    status: str = Field(..., description="Overall health indicator (healthy | warning | error)")
    application: ApplicationHealth
    database: DatabaseHealth
    camera_system: CameraSystemHealth
    backup: BackupHealth
    storage: StorageHealth
    ai_engine: AIEngineHealth
