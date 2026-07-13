# Backup & Restore System

## Overview

The AI Attendance System includes a professional backup and restore system that protects all user data and enables full recovery after PC replacement, accidental deletion, database corruption, or migration to another machine.

**Core Principle:** A backup captures the **complete system state** — database, face embeddings, employee photos, and application configuration.

---

## Architecture

```
backend/backup/
    __init__.py       ← App data directory abstraction + singleton
    manager.py        ← BackupManager — central orchestrator
    database.py       ← PostgreSQL backup via pg_dump / psql
    files.py          ← File backup/restore (embeddings, uploads, config)
    scheduler.py      ← Background scheduler (threading.Timer)
    models.py         ← Pydantic data models
```

### Data Flow

All backup operations flow through `BackupManager`. No other module should call `database.py` or `files.py` directly.

```
Settings UI  →  REST API  →  BackupManager
                                 ├── DatabaseBackup (pg_dump / psql)
                                 ├── FileBackup (embeddings, uploads, config)
                                 └── AuditLog
```

### Application Data Directory

| Environment | Path |
|---|---|
| **Production (Windows)** | `C:\ProgramData\AI Attendance System\` |
| **Development** | `<project_root>/data/` |

Subdirectories:

```
<app_data>/
    backups/     ← Backup ZIP archives
    employees/   ← Face embedding .npy files
    uploads/     ← Employee photo uploads
    logs/        ← Application logs (future)
```

---

## Backup ZIP Structure

Each backup is a timestamped ZIP archive:

```
AI_Attendance_Backup_YYYY_MM_DD_HHMM.zip
    metadata.json                  ← Backup metadata
    database/
        database_backup.sql        ← PostgreSQL dump
    employees/
        *.npy                      ← Face embeddings
    uploads/
        *.jpg                      ← Employee photos
    config/
        app_config.json            ← Application configuration
```

### metadata.json

```json
{
    "app": "AI Attendance System",
    "version": "1.0.0",
    "created_at": "2026-06-24T14:30:00",
    "database_type": "POSTGRES",
    "backup_version": 1,
    "created_by": "admin"
}
```

---

## REST API

All endpoints require authentication.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/backups/create` | Create a backup immediately |
| `GET` | `/api/backups` | List available backups |
| `POST` | `/api/backups/restore` | Restore a backup |
| `DELETE` | `/api/backups/{filename}` | Delete a backup |
| `GET` | `/api/backups/settings` | Get backup settings |
| `PUT` | `/api/backups/settings` | Update backup settings |

### Create Backup

```
POST /api/backups/create
→ { "status": "success", "file": "AI_Attendance_Backup_2026_06_24_1430.zip", "created_at": "..." }
```

### Restore Backup

```
POST /api/backups/restore
Body: { "filename": "AI_Attendance_Backup_2026_06_24_1430.zip", "restore_db_connection": false }
→ { "status": "success", "message": "...", "restart_required": true }
```

> **Important:** `restore_db_connection` defaults to `false`. Database connection settings (host, port, username, password) are preserved by default to prevent breaking the current database connection when restoring from another machine.

---

## Manual Backup

1. Navigate to **Settings → Backup & Restore**
2. Click **Create Backup**
3. The system creates a ZIP archive with all data
4. Backup appears in the Available Backups table

---

## Automatic Backup

Configure in **Settings → Backup & Restore → Automatic Backups**:

| Setting | Options | Default |
|---------|---------|---------|
| Enable | On / Off | Off |
| Frequency | Daily / Weekly / Monthly | Daily |
| Backup Time | HH:MM | 02:00 |
| Retention | 1–365 backups | 30 |
| Destination | Folder path | Default app data directory |

The scheduler runs in the background using `threading.Timer`. It checks every 60 seconds whether the configured backup time has been reached.

### Retention Policy

When a scheduled backup completes, the system deletes the oldest backups beyond the retention limit. Safety backups (pre-restore) are excluded from retention deletion.

---

## Restore Process

### Restore Flow

```
1. Validate backup ZIP
   ├── Check ZIP integrity
   ├── Verify metadata.json exists
   ├── Check backup_version is supported
   └── Verify required folders exist
       ↓
2. Create safety backup
   └── pre_restore_safety_backup_YYYYMMDD_HHMM.zip
       ↓
3. Restore database
   └── psql: DROP SCHEMA → RESTORE
       ↓
4. Restore employee embeddings
   └── Extract employees/*.npy
       ↓
5. Restore employee photos
   └── Extract uploads/*
       ↓
6. Restore configuration
   ├── Restore app settings
   └── Preserve DB connection (unless explicitly requested)
       ↓
7. Reload configuration
       ↓
8. ⚠️  Application restart required
```

### Safety Backup

Before every restore operation, the system automatically creates a safety backup named `pre_restore_safety_backup_YYYYMMDD_HHMM.zip`. This ensures data can be recovered if the restore fails or produces unexpected results.

### Database Connection Preservation

By default, restoring a backup does **not** overwrite database connection settings (host, port, database name, username, password, SSL). This prevents a backup from one machine breaking the database connection on another machine.

To also restore database connection settings, set `restore_db_connection: true` in the restore request.

---

## Recovery Scenarios

### PC Replacement

1. Install the application on the new PC
2. Configure database connection (Setup Wizard)
3. Copy the backup ZIP to the new machine
4. Place it in the backups directory
5. Navigate to Settings → Backup & Restore
6. Click Restore on the desired backup
7. Restart the application

### Accidental Deletion

1. Navigate to Settings → Backup & Restore
2. Select the most recent backup
3. Click Restore
4. The system creates a safety backup before restoring
5. Restart the application

### Database Corruption

1. Fix or reinstall the database server
2. Navigate to Settings → Backup & Restore
3. Restore from the last good backup
4. Restart the application

### Migration to Another Machine

1. Create a backup on the source machine
2. Transfer the ZIP file to the target machine
3. Install and configure the app on the target machine
4. Place the backup in the backups directory
5. Restore (database connection settings are preserved)
6. Restart the application

---

## Audit Logging

All backup operations are logged to the audit trail:

| Action | Description |
|--------|-------------|
| `BACKUP_CREATED` | Backup archive created |
| `BACKUP_RESTORED` | Backup restored (includes safety backup filename) |
| `BACKUP_FAILED` | Backup or restore operation failed |
| `BACKUP_DELETED` | Backup archive deleted |
| `BACKUP_SETTINGS_UPDATED` | Backup schedule settings changed |

---

## Error Handling

All errors are translated into user-friendly messages:

| Raw Error | User Message |
|-----------|--------------|
| `pg_dump not found` | PostgreSQL tools not found. Please ensure PostgreSQL is installed. |
| `pg_dump failed` | Database backup failed. Please verify the database connection. |
| `Permission denied` | Backup location is not writable. Check folder permissions. |
| `Connection refused` | Database connection failed. Please verify the database server is running. |
| `Password authentication failed` | Database authentication failed. Please verify your credentials. |

---

## Packaging Notes

### PostgreSQL Client Tools

Packaged builds (Electron) must ensure `pg_dump` and `psql` are available. Options:

1. **Bundle PostgreSQL binaries** — Include `pg_dump.exe` and `psql.exe` (and their DLL dependencies) in the packaged application
2. **Require PostgreSQL installation** — Document that PostgreSQL must be installed on the target machine
3. **Use libpq directly** — Future: use a Python-native PostgreSQL dump/restore (eliminates external tool dependency)

The system searches for PostgreSQL tools in this order:
1. System PATH
2. `C:\Program Files\PostgreSQL\*\bin` (Windows, newest version first)
3. `C:\Program Files (x86)\PostgreSQL\*\bin` (Windows, 32-bit)

---

## Future Extensions

### Cloud Backup (Future Phase)

The backup system is designed for future cloud integration:

- **Google Drive** — Upload/download backup ZIPs via Google Drive API
- **OneDrive** — Microsoft Graph API integration
- **Dropbox** — Dropbox API integration
- **AWS S3** — S3-compatible storage

The `BackupManager` architecture allows adding cloud storage as a destination alongside local storage. The `destination` setting in `BackupSettings` can be extended to support cloud URIs.

### SQLite Support (Future)

Database backup currently supports PostgreSQL only. SQLite support can be added by:
1. Copying the SQLite database file directly into the ZIP
2. No external tools (pg_dump/psql) required
3. Add a `SQLiteBackup` class alongside `DatabaseBackup`

### Encryption (Future)

Backup encryption can be added with:
- AES-256 encryption of the ZIP archive
- Password-protected backups
- Key management via Windows Credential Manager
