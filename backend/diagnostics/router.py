import os
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from backend.dependencies import get_current_user
from backend.permissions import require_role
from backend.diagnostics.health import HealthManager
from backend.diagnostics.models import SystemHealthResponse
from backend.diagnostics.logs import list_available_logs, read_log_tail
from backend.audit import create_audit_log

router = APIRouter(prefix="/api/system", tags=["System Diagnostics"])


@router.get("/health", response_model=SystemHealthResponse)
def get_system_health(force_refresh: bool = False, user=Depends(get_current_user)):
    """Retrieve application health diagnostics. Accessible to ADMIN and SUPER_ADMIN."""
    require_role(user, ["ADMIN", "SUPER_ADMIN"])
    return HealthManager.get_system_health(force_refresh=force_refresh)


@router.get("/logs")
def list_logs(user=Depends(get_current_user)):
    """List available system log files. Restricted to SUPER_ADMIN."""
    require_role(user, ["SUPER_ADMIN"])
    return list_available_logs()


@router.get("/logs/{name}")
def get_log_content(name: str, user=Depends(get_current_user)):
    """Fetch the latest 500 lines of a specific log file. Restricted to SUPER_ADMIN."""
    require_role(user, ["SUPER_ADMIN"])
    try:
        lines = read_log_tail(name)
        return {"name": name, "lines": lines}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export-diagnostics")
def export_diagnostics(background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    """Export system diagnostics (reports and logs sanitized). Restricted to SUPER_ADMIN."""
    require_role(user, ["SUPER_ADMIN"])
    try:
        zip_path = HealthManager.export_diagnostics()
        if not zip_path or not os.path.exists(zip_path):
            raise HTTPException(status_code=500, detail="Generated zip file not found.")

        filename = os.path.basename(zip_path)

        # Log audit log
        create_audit_log(
            username=user["sub"],
            action="DIAGNOSTICS_EXPORTED",
            details=f"Diagnostics zip exported: {filename}"
        )

        # Register deletion task to remove temporary zip after delivery
        background_tasks.add_task(os.remove, zip_path)

        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=filename
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnostics export failed: {str(e)}")
