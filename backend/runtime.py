import os

def is_packaged() -> bool:
    """Detect whether we are running in packaged/production mode.

    Primary check: AI_ATTENDANCE_PACKAGED environment variable.
    Fallback: filesystem heuristic — in packaged builds this file lives at
        <install>/resources/runtime/backend/backend/runtime.py
    which contains the path segment "resources/runtime". This path never
    occurs in development, so its presence is a reliable secondary signal.

    The fallback prevents silent fallthrough to development mode when a
    subprocess is spawned without the env var, which would resolve the
    data directory to resources/runtime/data/ under C:\\Program Files
    and cause PermissionError: [WinError 5].
    """
    env_val = os.environ.get("AI_ATTENDANCE_PACKAGED")
    if env_val == "1":
        return True
    if env_val == "0":
        return False

    # Env var absent — apply filesystem heuristic.
    # Normalise to forward slashes so the check works on Windows too.
    current_path = os.path.abspath(__file__).replace("\\", "/").lower()
    if "/resources/runtime/" in current_path:
        return True

    return False

def get_runtime_path() -> str:
    """Get the root runtime directory.
    
    In development: the project root (attendance-system/).
    In production: the resources/runtime directory.
    """
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    if is_packaged():
        # resources/runtime/backend/backend -> resources/runtime/
        return os.path.dirname(os.path.dirname(backend_dir))
    else:
        # attendance-system/backend -> attendance-system/
        return os.path.dirname(backend_dir)

def get_backend_path() -> str:
    """Get the path to the backend runtime folder.
    
    In development: the project root (attendance-system/).
    In production: resources/runtime/backend/
    """
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(backend_dir)

def get_model_path() -> str:
    """Get the models directory.
    
    In development: <project_root>/data/models/
    In production: resources/runtime/models/
    """
    if is_packaged():
        return os.path.join(get_runtime_path(), "models")
    else:
        return os.path.join(get_runtime_path(), "data", "models")

# Dynamically set TORCH_HOME for PyTorch checkpoint loading in production
if is_packaged():
    _torch_home = os.path.abspath(os.path.join(get_model_path(), "torch"))
    os.environ["TORCH_HOME"] = _torch_home
    print(f"[Runtime] TORCH_HOME configured: {_torch_home}")

def validate_ai_model() -> None:
    """Verify that the bundled FaceNet model is available in packaged mode.
    
    If running in packaged mode, check that:
    1. TORCH_HOME is configured.
    2. The model file exists at TORCH_HOME/checkpoints/<model>.
    3. The model file size is > 50 MB (not truncated).
    """
    if is_packaged():
        torch_home = os.environ.get("TORCH_HOME")
        if not torch_home:
            raise RuntimeError("AI runtime path not configured. TORCH_HOME missing.")
        model_path = os.path.join(torch_home, "checkpoints", "20180402-114759-vggface2.pt")
        if not os.path.exists(model_path):
            raise RuntimeError(f"Bundled FaceNet model missing or corrupted at: {model_path}")
        model_size = os.path.getsize(model_path)
        if model_size < 50 * 1024 * 1024:
            raise RuntimeError(f"Bundled FaceNet model missing or corrupted at: {model_path}")

