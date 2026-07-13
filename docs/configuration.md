# Configuration Management — AI Attendance System

## Overview

The application uses a centralized configuration system to manage all runtime settings.
Configuration is defined in a single JSON file, validated on load, and exposed to the rest of the application through `ConfigurationManager`.

No module should read configuration files directly. Everything flows through `ConfigurationManager`.

---

## Folder Structure

```
attendance-system/
├── backend/
│   ├── config/                    ← Configuration package
│   │   ├── __init__.py            ← Exports config_manager singleton
│   │   ├── models.py              ← Pydantic data models + StorageProvider enum
│   │   ├── defaults.py            ← Default config factory (reads .env for migration)
│   │   └── manager.py             ← ConfigurationManager class
│   ├── database.py                ← Uses ConfigurationManager to build DATABASE_URL
│   ├── main.py                    ← Unchanged — imports SessionLocal from database.py
│   ├── auth.py                    ← Unchanged — reads SECRET_KEY from .env
│   ├── models.py                  ← Unchanged — imports Base from database.py
│   └── ...
├── config/
│   ├── app_config.json            ← Auto-generated runtime configuration (gitignored)
│   └── .gitignore                 ← Prevents secrets from being committed
└── docs/
    └── configuration.md           ← This file
```

---

## Configuration Flow

```
Application Start
       │
       ▼
ConfigurationManager.load()
       │
       ├── config/app_config.json exists?
       │      YES → parse JSON → validate → expose
       │      NO  → read backend/.env for current DB values
       │            → generate defaults → write app_config.json → expose
       │
       ▼
ConfigurationManager.build_database_url()
       │
       ▼
SQLAlchemy engine created with the URL
       │
       ▼
Application runs normally
```

---

## Configuration File

Location: `config/app_config.json`

Auto-generated on first run if it does not exist.

### Structure

```json
{
    "schema_version": 1,
    "storage": {
        "provider": "local_postgres"
    },
    "database": {
        "host": "localhost",
        "port": 5432,
        "database": "attendance",
        "username": "attendance_admin",
        "password": "",
        "ssl": false
    },
    "backup": {
        "enabled": false,
        "automatic": false,
        "frequency": "daily",
        "keep": 30,
        "destination": ""
    },
    "cameras": {
        "poll_interval": 15
    },
    "recognition": {
        "confidence_threshold": 0.6
    },
    "application": {
        "theme": "dark",
        "first_run_complete": false,
        "setup_complete": false
    },
    "updates": {
        "auto_check": false,
        "channel": "stable"
    }
}
```

### Schema Version

The `schema_version` field (currently `1`) enables automatic config migrations in future releases. When the schema changes, a migration function will transform older configs to the new format.

### Reserved Sections

The following sections exist as placeholders and will be implemented in future phases:

| Section | Purpose |
|---|---|
| `backup` | Automatic backup scheduling and retention |
| `cameras` | Camera polling and processing settings |
| `recognition` | Face recognition thresholds and model config |
| `updates` | Auto-update channel and frequency |

---

## Storage Providers

The system supports multiple database backends through the `StorageProvider` enum:

| Provider | Value | Status |
|---|---|---|
| Local PostgreSQL | `local_postgres` | ✅ Implemented |
| External PostgreSQL | `external_postgres` | ✅ Implemented |
| SQLite | `sqlite` | 🔲 Placeholder |

### External PostgreSQL

All remote PostgreSQL services are treated uniformly as `external_postgres`:

- **Supabase** — PostgreSQL connection string
- **Neon** — PostgreSQL connection string
- **Railway** — PostgreSQL connection string
- **AWS RDS** — PostgreSQL connection string
- **Azure PostgreSQL** — PostgreSQL connection string

The only difference between providers is the connection parameters supplied by the user. No provider-specific code is needed.

### Database URL Building

`ConfigurationManager.build_database_url()` constructs a SQLAlchemy-compatible URL:

```
LOCAL_POSTGRES:    postgresql://user:password@localhost:5432/attendance
EXTERNAL_POSTGRES: postgresql://user:password@db.xxx.supabase.co:5432/postgres
SQLITE:            (not yet implemented)
```

---

## How ConfigurationManager is Used

### Importing

```python
from backend.config import config_manager
```

### Loading Configuration

```python
config_manager.load()  # Idempotent — safe to call multiple times
```

### Getting Configuration

```python
config = config_manager.get_config()
print(config.database.host)
print(config.application.theme)
```

### Building Database URL

```python
url = config_manager.build_database_url()
# → "postgresql://admin:admin@localhost:5433/attendance"
```

### Getting Database Password

```python
password = config_manager.get_database_password()
```

### Updating Configuration

```python
errors = config_manager.update_config({
    "database": {
        "host": "db.example.supabase.co",
        "port": 5432,
    },
    "storage": {
        "provider": "external_postgres"
    }
})

if errors:
    for err in errors:
        print(f"{err.field}: {err.message}")
```

### Testing Database Connection

```python
result = config_manager.test_database_connection()
if result["success"]:
    print("Connected!")
else:
    print(f"Failed: {result['message']}")
```

### Validation

```python
errors = config_manager.validate()
for err in errors:
    print(f"{err.field}: {err.message}")
```

---

## Security Decisions

### Current Phase (Phase A)

Database credentials are stored inside `config/app_config.json`. The file is gitignored to prevent accidental commits.

### Future Phase (Deployment)

When the installer is finalized, security will be hardened:

- **Fernet encryption** for credentials stored on disk
- **Windows Credential Manager** integration for native OS-level storage
- **CredentialStore abstraction** allowing pluggable backends

The `get_database_password()` API is already designed so the switch to encrypted storage will be transparent — no consumer code changes required.

---

## Future Extension Points

The configuration system is designed for easy extension:

| Feature | How to Add |
|---|---|
| **SQLite support** | Implement `_build_sqlite_url()` in manager.py |
| **Backup system** | Use `config.backup` section, add backup logic |
| **Camera settings** | Use `config.cameras` section, read from camera_manager.py |
| **Recognition tuning** | Use `config.recognition` section, read from face_service |
| **Auto-updates** | Use `config.updates` section, add update checker |
| **New config section** | Add a Pydantic model in models.py, add field to AppConfig |
| **Schema migration** | Check `schema_version`, transform old config format |
| **Credential encryption** | Add CredentialStore in crypto.py, delegate from get_database_password() |
| **Setup Wizard API** | Expose config_manager methods via FastAPI endpoints |

---

## Backward Compatibility

The refactor preserves full backward compatibility:

- `database.py` exports the same `engine`, `SessionLocal`, and `Base` names
- All modules importing from `backend.database` work unchanged
- The `.env` file is read on first boot to generate matching config
- The existing PostgreSQL database continues to function identically
- Electron launcher, frontend, and face_service are completely untouched
