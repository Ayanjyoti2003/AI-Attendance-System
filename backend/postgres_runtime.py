"""
PostgreSQL binary path resolution.

Resolves the correct path to PostgreSQL CLI tools (pg_dump, psql, etc.)
depending on whether the application is running in development or
packaged production mode.

In development:  normal PATH lookup → common Windows PG dirs fallback
In production:   resources/runtime/postgresql/bin/<tool>.exe
"""

import glob
import os
import shutil
import sys

from backend.runtime import is_packaged, get_runtime_path


def get_postgres_binary(name: str) -> str:
    """Locate a PostgreSQL CLI tool by name.

    Args:
        name: Tool name without extension, e.g. "pg_dump", "psql",
              "pg_isready", "initdb", "pg_ctl", "createdb", "postgres".

    Returns:
        Absolute path to the tool executable.

    Raises:
        RuntimeError: If the tool cannot be found.
    """
    exe_name = f"{name}.exe" if sys.platform == "win32" else name

    if is_packaged():
        return _resolve_bundled(exe_name, name)
    return _resolve_development(exe_name, name)


def _resolve_bundled(exe_name: str, tool_name: str) -> str:
    """Resolve a PostgreSQL tool from the bundled runtime directory."""
    bundled_path = os.path.join(
        get_runtime_path(), "postgresql", "bin", exe_name
    )
    if os.path.isfile(bundled_path):
        return bundled_path

    raise RuntimeError(
        f"Bundled PostgreSQL tool '{tool_name}' not found at: {bundled_path}. "
        f"The runtime installation may be corrupted."
    )


def _resolve_development(exe_name: str, tool_name: str) -> str:
    """Resolve a PostgreSQL tool from the system PATH or common install dirs."""
    # 1. System PATH
    found = shutil.which(exe_name)
    if found:
        return found

    # 2. Common Windows PostgreSQL installation directories
    if sys.platform == "win32":
        found = _search_windows_pg_dirs(exe_name)
        if found:
            return found

    raise RuntimeError(
        f"'{tool_name}' not found. Please ensure PostgreSQL client tools "
        f"are installed and available on the system PATH. "
        f"On Windows, install PostgreSQL or add its bin directory "
        f"to the PATH environment variable."
    )


def _search_windows_pg_dirs(exe_name: str) -> str | None:
    """Search common Windows PostgreSQL installation directories."""
    search_patterns = [
        os.path.join("C:\\", "Program Files", "PostgreSQL", "*", "bin"),
        os.path.join("C:\\", "Program Files (x86)", "PostgreSQL", "*", "bin"),
    ]

    for pattern in search_patterns:
        for bin_dir in sorted(glob.glob(pattern), reverse=True):
            candidate = os.path.join(bin_dir, exe_name)
            if os.path.isfile(candidate):
                return candidate

    return None
