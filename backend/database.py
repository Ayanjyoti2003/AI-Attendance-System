from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.config import config_manager
from backend.config.models import StorageProvider

# Load configuration (auto-generates defaults on first boot)
config_manager.load()

DATABASE_URL = config_manager.build_database_url()
provider = config_manager.get_config().storage.provider

connect_args = {}
if provider == StorageProvider.SQLITE.value:
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Enable WAL mode for SQLite to prevent locking with parallel camera threads
if provider == StorageProvider.SQLITE.value:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def run_pending_migrations() -> None:
    """
    Apply pending Alembic migrations with safety locks.

    Always runs on startup regardless of setup_complete state.
    Schema tables must exist before the setup wizard can create
    an administrator or query system_config.

    Exits the application if migrations fail.
    """
    import os
    import sys
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import inspect

    print("[MIGRATIONS] Checking database schema...")

    # 1. Create migration lock (cross-process file lock)
    from backend.backup import get_app_data_dir
    lock_file_path = os.path.join(get_app_data_dir(), "migration.lock")
    
    lock_acquired = False
    try:
        # Create lock file exclusively
        fd = os.open(lock_file_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w") as f:
            f.write(str(os.getpid()))
        lock_acquired = True
    except FileExistsError:
        # Check if the process inside lock file is still running
        try:
            with open(lock_file_path, "r") as f:
                pid = int(f.read().strip())
            # Check if PID is alive
            if sys.platform == "win32":
                import ctypes
                kernel32 = ctypes.windll.kernel32
                process = kernel32.OpenProcess(1, False, pid)
                pid_alive = process != 0
                if process:
                    kernel32.CloseHandle(process)
            else:
                os.kill(pid, 0)
                pid_alive = True
        except Exception:
            pid_alive = False

        if pid_alive:
            print(f"[MIGRATIONS] [CRITICAL] Migration lock is held by PID {pid}. Another process is running migrations. Exiting.")
            sys.exit(1)
        else:
            # Stale lock, overwrite it
            print("[MIGRATIONS] Stale migration lock found. Releasing lock.")
            try:
                os.remove(lock_file_path)
                fd = os.open(lock_file_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                with os.fdopen(fd, "w") as f:
                    f.write(str(os.getpid()))
                lock_acquired = True
            except Exception as e:
                print(f"[MIGRATIONS] [CRITICAL] Failed to acquire stale migration lock: {e}. Exiting.")
                sys.exit(1)

    try:
        # Resolve path to alembic.ini
        from backend.runtime import get_backend_path
        backend_root = get_backend_path()
        alembic_ini_path = os.path.join(backend_root, "alembic.ini")
        
        alembic_cfg = Config(alembic_ini_path)
        alembic_cfg.set_main_option("script_location", os.path.join(backend_root, "backend", "alembic"))
        
        # 2. Existing database compatibility / Baselining
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        has_existing_data = "users" in existing_tables or "system_config" in existing_tables
        has_alembic = "alembic_version" in existing_tables
        
        if has_existing_data and not has_alembic:
            print("[MIGRATIONS] Existing database detected without Alembic tracking. Baselining to 'head'.")
            command.stamp(alembic_cfg, "head")
            print("[MIGRATIONS] Database baselining complete.")
        else:
            # 3. Run migrations
            print("[MIGRATIONS] Running alembic upgrade head...")
            command.upgrade(alembic_cfg, "head")

        print("[MIGRATIONS] Database schema ready.")
            
    except Exception as e:
        print(f"[MIGRATIONS] [CRITICAL] Migration failed: {e}")
        print("[MIGRATIONS] [CRITICAL] Terminating startup due to database schema mismatch.")
        sys.exit(1)
    finally:
        # Release the lock
        if lock_acquired and os.path.exists(lock_file_path):
            try:
                os.remove(lock_file_path)
            except Exception:
                pass