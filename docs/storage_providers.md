# Database Storage Providers Reference Manual

AI Attendance System supports three database storage providers to accommodate different deployment scales: **Local PostgreSQL**, **SQLite**, and **External PostgreSQL**.

---

## 1. Local PostgreSQL
Recommended for: **Large offices and multi-device deployments** where the server is hosted locally on the same network.

### Setup Process
1. Install PostgreSQL on the server machine (version 13+ is recommended).
2. Configure it to accept connections on a local port (default is `5432`).
3. Create a database (e.g. `attendance`) and a dedicated user.
4. During the Setup Wizard, select **Local PostgreSQL** and fill in the connection details:
   - **Host**: `localhost` or local IP (e.g. `192.168.1.100`)
   - **Port**: `5432`
   - **Database**: `attendance`
   - **Username**: `attendance_admin`
   - **Password**: `your_password`

### Backup & Restore Mechanics
- **Backup**: Executes `pg_dump` via a subprocess to write the complete schema and data into a standard SQL script inside the ZIP archive (`database/database_backup.sql`).
- **Restore**: Clears the active `public` schema in PostgreSQL (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) and executes the `psql` utility to restore tables and data.
- **Prerequisites**: PostgreSQL client utilities (`pg_dump` and `psql`) must be available on the system PATH.

---

## 2. SQLite
Recommended for: **Small offices and single attendance station deployments**. Excellent for lightweight, offline, and quick installations.

### Setup Process
1. During the Setup Wizard, select **SQLite**.
2. No servers or database configuration parameters are required.
3. The database location defaults to:
   - **Windows Production**: `C:\ProgramData\AI Attendance System\database\attendance.db`
   - **Development fallback**: `data/database/attendance.db`
4. *(Optional)* Select **Advanced: Change location** to customize the database file path.

### Backup & Restore Mechanics
- **Backup**: Safely creates a binary snapshot copy of the `attendance.db` file and stores it in the ZIP archive (`database/database_backup.db`).
- **Restore**: Disposes of any active SQLAlchemy engine connections to release file locks on Windows, copies the database snapshot to a temporary file (`attendance.db.tmp`), and performs an atomic overwrite rename to replace the active database safely.

### Concurrency and Reliability
To support simultaneous access from the main process, UI threads, and camera workers, the system configures SQLite in **Write-Ahead Logging (WAL)** mode.
- Enables high concurrency by allowing multiple readers to read the database at the same time a writer is writing.
- Prevents database file locking errors (`sqlite3.OperationalError: database is locked`) during peak attendance hours.

---

## 3. External PostgreSQL
Recommended for: **Cloud storage, multiple locations, and managed hosting**.

Supports any PostgreSQL-compatible cloud provider, including:
- **Supabase**
- **Neon**
- **Railway**
- **AWS RDS PostgreSQL**
- **Azure Database for PostgreSQL**

### Setup Process
1. Create a database instance on your cloud provider.
2. Retrieve the connection string parameters from the provider dashboard.
3. In the Setup Wizard, select **External PostgreSQL** and enter:
   - **Host**: E.g. `db.xxx.supabase.co` or `ep-xxx.neon.tech`
   - **Port**: Typically `5432`
   - **Database**: `postgres` or custom database name
   - **Username**: `postgres` or custom username
   - **Password**: Database password
   - **SSL**: Set to `true` (most cloud databases enforce SSL connections).

### Backup & Restore Mechanics
- Works identically to Local PostgreSQL using remote TCP connection streams via `pg_dump` and `psql`.
- The local machine performing the backup/restore must have internet access and client utilities installed on its PATH.

---

## Database Switching Safety
> [!WARNING]
> **Changing database storage will switch the active database.**
> Existing data is not automatically migrated between storage backends (e.g. from local PostgreSQL to SQLite).
> If you need to switch providers, create a backup of your existing data first, configure the new database, and restore the backup using the settings panel. Ensure the target schema matches the system version.
