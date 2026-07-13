import os
import re
import logging
from logging.handlers import RotatingFileHandler
from collections import deque
from datetime import datetime
from backend.backup import get_app_data_dir

# Regex patterns for sanitization
PASSWORD_REGEXES = [
    (re.compile(r'(password\s*[:=]\s*["\']?)([^"\'\s,;&]+)(["\']?)', re.IGNORECASE), r'\1******\3'),
    (re.compile(r'("password"\s*:\s*")([^"]+)(")', re.IGNORECASE), r'\1******\3'),
    (re.compile(r'(\'password\'\s*:\s*\')([^\']+)(\')', re.IGNORECASE), r'\1******\3'),
]

TOKEN_REGEXES = [
    (re.compile(r'(token\s*[:=]\s*["\']?)([^"\'\s,;&]+)(["\']?)', re.IGNORECASE), r'\1******\3'),
    (re.compile(r'("token"\s*:\s*")([^"]+)(")', re.IGNORECASE), r'\1******\3'),
    (re.compile(r'(\'token\'\s*:\s*\')([^\']+)(\')', re.IGNORECASE), r'\1******\3'),
    (re.compile(r'(access_token\s*[:=]\s*["\']?)([^"\'\s,;&]+)(["\']?)', re.IGNORECASE), r'\1******\3'),
    (re.compile(r'("access_token"\s*:\s*")([^"]+)(")', re.IGNORECASE), r'\1******\3'),
]

SECRET_REGEXES = [
    (re.compile(r'((?:secret|SECRET_KEY|api_key|API_KEY)\s*[:=]\s*["\']?)([^"\'\s,;&]+)(["\']?)', re.IGNORECASE), r'\1******\3'),
    (re.compile(r'("(?:secret|secret_key|api_key)"\s*:\s*")([^"]+)(")', re.IGNORECASE), r'\1******\3'),
    (re.compile(r'(\'(?:secret|secret_key|api_key)\'\s*:\s*\')([^\']+)(\')', re.IGNORECASE), r'\1******\3'),
]

AUTH_HEADER_REGEX = re.compile(r'(Authorization\s*:\s*(?:Bearer\s+)?)([^"\'\s]+)', re.IGNORECASE)
CONN_STRING_REGEX = re.compile(r'(\w+://)([^:]+):([^@]+)(@[^/]+/[^\s"\']*)')

def sanitize_line(line: str) -> str:
    """Mask credentials, passwords, connection strings, and tokens in a log line."""
    if not line:
        return line
    # 1. Sanitize passwords
    for regex, replacement in PASSWORD_REGEXES:
        line = regex.sub(replacement, line)
    # 2. Sanitize tokens
    for regex, replacement in TOKEN_REGEXES:
        line = regex.sub(replacement, line)
    # 3. Sanitize secrets (SECRET_KEY, api_key, etc.)
    for regex, replacement in SECRET_REGEXES:
        line = regex.sub(replacement, line)
    # 4. Sanitize Authorization headers
    line = AUTH_HEADER_REGEX.sub(r'\1******', line)
    # 5. Sanitize connection strings (mask password between ':' and '@')
    line = CONN_STRING_REGEX.sub(r'\1\2:******\4', line)
    return line


def get_logs_dir() -> str:
    """Get the app logs directory, ensuring it exists."""
    log_dir = os.path.join(get_app_data_dir(), "logs")
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


def setup_backend_logging() -> None:
    """Configure python backend logging to write to backend.log with rotation."""
    log_dir = get_logs_dir()
    log_file = os.path.join(log_dir, "backend.log")

    # Limit to 10MB per file, keeping 5 old files
    handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8"
    )
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s [%(name)s:%(lineno)d] %(message)s"
    )
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    # Ensure root logger is set to INFO or appropriate level
    if root_logger.level == logging.NOTSET or root_logger.level > logging.INFO:
        root_logger.setLevel(logging.INFO)
    root_logger.addHandler(handler)

    # Attach to Uvicorn loggers as well
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(logger_name)
        logger.addHandler(handler)


def setup_camera_manager_logging() -> None:
    """Configure python camera manager logging to write to camera_manager.log."""
    log_dir = get_logs_dir()
    log_file = os.path.join(log_dir, "camera_manager.log")

    handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8"
    )
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s [%(name)s:%(lineno)d] %(message)s"
    )
    handler.setFormatter(formatter)

    cam_logger = logging.getLogger("camera_manager")
    if cam_logger.level == logging.NOTSET or cam_logger.level > logging.INFO:
        cam_logger.setLevel(logging.INFO)
    cam_logger.addHandler(handler)


def list_available_logs() -> list:
    """List available log files and their metadata."""
    log_dir = get_logs_dir()
    if not os.path.isdir(log_dir):
        return []

    logs = []
    for filename in os.listdir(log_dir):
        # List active or rotated log files
        if filename.endswith(".log") or ".log." in filename:
            filepath = os.path.join(log_dir, filename)
            stat = os.stat(filepath)
            logs.append({
                "name": filename,
                "size_bytes": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
    
    # Sort alphabetical
    logs.sort(key=lambda l: l["name"])
    return logs


def read_log_tail(filename: str, limit: int = 500) -> list[str]:
    """Read the last N lines of a log file, sanitizing sensitive data."""
    log_dir = get_logs_dir()
    filepath = os.path.join(log_dir, filename)
    
    # Security check: prevent directory traversal
    if not os.path.dirname(os.path.abspath(filepath)) == os.path.abspath(log_dir):
        raise ValueError("Invalid log filename")

    if not os.path.isfile(filepath):
        return [f"Log file {filename} not found."]

    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            lines = list(deque(f, maxlen=limit))
        return [sanitize_line(line.rstrip("\n")) for line in lines]
    except Exception as e:
        return [f"Error reading log file: {str(e)}"]
