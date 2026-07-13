"""
backend.config_cli — Configuration CLI for Electron integration.

Provides command-line entry points for Electron to safely update
application configuration through the existing ConfigurationManager
save flow, preserving encryption and validation.

Usage from Electron / shell:

    PG_INIT_PASSWORD=<generated> python -m backend.config_cli set-local-postgres \
        --host 127.0.0.1 \
        --port 54329 \
        --username attendance_admin \
        --database attendance

The password is read from the PG_INIT_PASSWORD environment variable
(preferred) to avoid argparse issues with passwords starting with '-'.
The --password CLI flag is still accepted as a fallback.
"""

import argparse
import os
import json
import sys


def cmd_set_local_postgres(args: argparse.Namespace) -> None:
    """Update config for LOCAL_POSTGRES provider with the given credentials."""
    import time
    
    # Checkpoint: Before importing config_manager
    print(f"[config_cli] [{time.time()}] Before importing config_manager", flush=True)
    from backend.config import config_manager
    from backend.config.models import StorageProvider
    # Checkpoint: After config_manager import
    print(f"[config_cli] [{time.time()}] After config_manager import", flush=True)

    # Resolve password: env var takes precedence over CLI arg
    password = os.environ.get("PG_INIT_PASSWORD") or getattr(args, "password", None)
    if not password:
        print(json.dumps({
            "success": False,
            "errors": [{"field": "password", "message": "Password must be provided via PG_INIT_PASSWORD env var or --password flag."}],
        }))
        sys.exit(1)

    config_manager.load()

    updates = {
        "storage": {
            "provider": StorageProvider.LOCAL_POSTGRES.value,
        },
        "database": {
            "host": args.host,
            "port": args.port,
            "username": args.username,
            "password": password,
            "database": args.database,
        },
    }

    # Checkpoint: Before update_config()
    print(f"[config_cli] [{time.time()}] Before update_config()", flush=True)
    errors = config_manager.update_config(updates)
    # Checkpoint: After update_config()
    print(f"[config_cli] [{time.time()}] After update_config()", flush=True)

    if errors:
        result = {
            "success": False,
            "errors": [
                {"field": e.field, "message": e.message} for e in errors
            ],
        }
        print(json.dumps(result))
        sys.exit(1)

    result = {
        "success": True,
        "message": "Local PostgreSQL configuration saved.",
        "config": {
            "host": args.host,
            "port": args.port,
            "username": args.username,
            "database": args.database,
        },
    }
    print(json.dumps(result))


def main() -> None:
    """CLI entry point."""
    import time
    import traceback
    
    # Checkpoint: Enter main()
    print(f"[config_cli] [{time.time()}] Enter main()", flush=True)
    
    try:
        parser = argparse.ArgumentParser(
            prog="backend.config_cli",
            description="AI Attendance System — Configuration CLI",
        )
        subparsers = parser.add_subparsers(dest="command", required=True)

        # ── set-local-postgres ──────────────────────────────────────
        sp = subparsers.add_parser(
            "set-local-postgres",
            help="Configure LOCAL_POSTGRES provider credentials.",
        )
        sp.add_argument("--host", required=True, help="Database host (e.g. 127.0.0.1)")
        sp.add_argument("--port", type=int, required=True, help="Database port (e.g. 54329)")
        sp.add_argument("--username", required=True, help="Database username")
        sp.add_argument("--password", required=False, default=None,
                        help="Database password (prefer PG_INIT_PASSWORD env var)")
        sp.add_argument("--database", required=True, help="Database name (e.g. attendance)")

        parsed = parser.parse_args()

        # Checkpoint: After argument parsing
        print(f"[config_cli] [{time.time()}] After argument parsing", flush=True)

        if parsed.command == "set-local-postgres":
            cmd_set_local_postgres(parsed)
        else:
            parser.print_help()
            sys.exit(1)
            
        # Checkpoint: Before exit (successful path)
        print(f"[config_cli] [{time.time()}] Before exit", flush=True)
        sys.exit(0)
        
    except Exception as e:
        tb_str = traceback.format_exc()
        print(f"[config_cli] [{time.time()}] Exception caught in main:\n{tb_str}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
