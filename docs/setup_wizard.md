# Setup Wizard — AI Attendance System

## Overview

The Setup Wizard is a first-run configuration interface designed to initialize the application and configure the environment before first use. It guides the user through database setup, administrator creation, database initialization, and initial camera configuration.

---

## Wizard Flow

The wizard operates as a multi-step component in the React frontend, where state is preserved when moving back and forward:

```
Welcome
   │
   ▼
Administrator Account  ← Super admin username, password (strength meter)
   │
   ▼
Storage Provider       ← Select Local/External Postgres (SQLite coming soon)
   │
   ▼
Database Configuration ← Host, Port, Username, Password, SSL (for External)
   │
   ▼
Test Connection        ← Verifies database is reachable using config_manager
   │
   ▼
Initialize Database    ← Automatically creates database tables (Base.metadata)
   │
   ▼
Initial Camera         ← Optionally configures the first USB or RTSP camera
   │
   ▼
Finish                 ← Persists config, marks setup complete, redirects to Login
```

---

## Backend APIs

The Setup Wizard communicates with the backend via the following FastAPI endpoints:

### 1. `GET /api/setup-status`
Checks if the initial setup has been completed.
* **Source**: Reads `setup_complete` from `ConfigurationManager`. If not set, falls back to querying `SystemConfig` in the database (backward compatibility). If the DB is down or tables are not created, it handles the exception gracefully.
* **Response**:
```json
{
    "setup_completed": false,
    "first_run_complete": false
}
```

### 2. `GET /api/setup/config`
Retrieves the current application configuration. Used to pre-populate setup fields.
* **Response**:
```json
{
    "schema_version": 1,
    "storage": {
        "provider": "local_postgres"
    },
    "database": {
        "host": "localhost",
        "port": 5433,
        "database": "attendance",
        "username": "admin",
        "password": "",
        "ssl": false
    },
    "application": {
        "theme": "dark",
        "first_run_complete": false,
        "setup_complete": false
    }
}
```

### 3. `PUT /api/setup/config`
Applies a partial database and storage provider update to the configuration.
* **Payload**:
```json
{
    "provider": "external_postgres",
    "host": "db.supabase.co",
    "port": 5432,
    "database": "postgres",
    "username": "postgres",
    "password": "secret_password",
    "ssl": true
}
```
* **Response**:
```json
{
    "status": "updated"
}
```

### 4. `POST /api/setup/database/test`
Tests a database connection using the provided configuration before saving.
* **Payload**: Same as `PUT /api/setup/config`.
* **Response**:
```json
{
    "success": true,
    "message": "Database connection successful.",
    "details": {
        "provider": "external_postgres",
        "host": "db.supabase.co",
        "port": 5432,
        "database": "postgres"
    }
}
```

### 5. `POST /api/setup/database/initialize`
Initializes database tables by creating schemas defined in models.
* **Response**:
```json
{
    "status": "success",
    "message": "Database initialized successfully.",
    "tables_created": ["attendance", "employee", "camera", "user", "audit_log", "system_config"]
}
```

### 6. `POST /api/setup/admin`
Creates the initial super administrator user.
* **Payload**:
```json
{
    "username": "admin",
    "password": "securepassword123"
}
```

### 7. `POST /api/setup/camera`
Registers the initial camera (can be skipped).
* **Payload**:
```json
{
    "name": "Front Entrance",
    "location": "Reception",
    "camera_type": "USB",
    "source": "0"
}
```

### 8. `POST /api/setup/complete`
Marks the setup as completed. Persists configuration to `app_config.json` via `ConfigurationManager` and updates the database flag.
* **Response**:
```json
{
    "status": "completed"
}
```

---

## ConfigurationManager Integration

`ConfigurationManager` acts as the source of truth throughout the wizard. 
* **Config Syncing**: When `PUT /api/setup/config` is called, `config_manager.update_config()` validates the credentials.
* **Database Testing**: `POST /api/setup/database/test` creates an ephemeral configuration instance and tests connectivity without modifying the persistent config file.
* **Finalization**: `POST /api/setup/complete` updates `application.first_run_complete = true` and `application.setup_complete = true`, saving the state to `config/app_config.json`.

---

## Validation

### Frontend Validation
* **Admin Form**: Checks that `username` is at least 3 characters. Includes password confirmation and password strength meter (based on length, casing, numbers, and special characters).
* **Database Config**: Fields are validated for correctness (e.g. valid host, positive port) before connection testing is allowed.
* **Testing Step**: Users cannot proceed past the Database Configuration page until a connection test succeeds.

### Backend Validation
* Hostnames must match syntax rules.
* Ports must fall in the valid TCP range (1 to 65535).
* Database names must be alphanumeric/underscores.

---

## Future Extension Points

1. **SQLite support**: To enable SQLite, implement the DB URL generator logic for the `sqlite` provider in `manager.py`, then enable the selection card in `SetupStorage.tsx`.
2. **Credential encryption**: In future security phases, transition the plaintext password storage inside `ConfigurationManager` to a secure credential store (e.g. Fernet or native Keyring) without changing any Setup Wizard APIs.
