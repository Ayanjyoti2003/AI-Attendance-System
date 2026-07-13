import backend.runtime
from mpmath import usertools
from backend.config import config_manager
from backend.diagnostics.logs import setup_backend_logging

# Initialize rotating file logging
setup_backend_logging()

from fastapi import FastAPI, UploadFile, File, Depends, Form, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend.database import SessionLocal
from backend.models import Attendance, Employee, Camera, User, AuditLog, UserRole, UserStatus, SystemConfig
from face_service.embedding_utils import generate_embedding
from datetime import datetime
import shutil
import os
import numpy as np
from enum import Enum
from typing import Optional
from backend.auth import (
    verify_password,
    create_access_token
)
from backend.dependencies import get_current_user
from fastapi.security import OAuth2PasswordRequestForm
from backend.audit import create_audit_log
from backend.permissions import require_role
from backend.auth import hash_password
from backend.websocket_manager import manager
import asyncio


from backend.backup import get_uploads_dir, get_employees_dir

UPLOAD_DIR = get_uploads_dir()
EMPLOYEE_DIR = get_employees_dir()

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EMPLOYEE_DIR, exist_ok=True)


app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.diagnostics.router import router as diagnostics_router
app.include_router(diagnostics_router)


class EmployeeStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"
    TERMINATED = "TERMINATED"


# -----------------------------
# MODELS
# -----------------------------
class FaceData(BaseModel):
    camera_id: int
    embedding: list

class AttendanceData(BaseModel):
    name: str
    timestamp: str
    camera_id: int

class StatusUpdate(BaseModel):
    status: EmployeeStatus

class CameraCreate(BaseModel):

    name: str
    location: str

    camera_type: str
    source: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole

class UserStatusUpdate(BaseModel):
    status: UserStatus

class UserRoleUpdate(BaseModel):
    role: UserRole

# -----------------------------
# HEALTH CHECK
# -----------------------------
@app.get("/")
def health():
    return {"status": "backend running"}


# -----------------------------
# SETUP WIZARD ENDPOINTS
# -----------------------------

class SetupAdmin(BaseModel):
    username: str
    password: str

class SetupCameraData(BaseModel):
    name: str
    location: str
    camera_type: str
    source: str


@app.get("/api/setup-status")
def get_setup_status():
    """Check if initial setup has been completed and if initial admin has been created.
    Uses ConfigurationManager as primary source, falls back to DB."""
    app_config = config_manager.get_config()
    
    # Check if ADMIN/SUPER_ADMIN has been created
    admin_created = False
    try:
        from backend.models import User
        db = SessionLocal()
        try:
            admin_created = db.query(User).filter(User.role.in_(["SUPER_ADMIN", "ADMIN"])).count() > 0
        finally:
            db.close()
    except Exception:
        # DB connection failed or table does not exist yet (expected before wizard runs)
        pass

    if app_config.application.setup_complete:
        return {
            "setup_completed": True,
            "first_run_complete": app_config.application.first_run_complete,
            "admin_created": admin_created
        }

    # Fallback: check DB for backward compatibility
    setup_completed = False
    try:
        db = SessionLocal()
        try:
            config = (
                db.query(SystemConfig)
                .filter(SystemConfig.key == "setup_completed")
                .first()
            )
            if config and config.value == "true":
                setup_completed = True
        finally:
            db.close()
    except Exception:
        pass

    return {
        "setup_completed": setup_completed,
        "first_run_complete": app_config.application.first_run_complete if setup_completed else False,
        "admin_created": admin_created
    }


@app.post("/api/setup/admin")
def setup_admin(data: SetupAdmin):
    db = SessionLocal()
    try:
        # Block if setup already completed
        config = (
            db.query(SystemConfig)
            .filter(SystemConfig.key == "setup_completed")
            .first()
        )
        if config and config.value == "true":
            return {"error": "Setup already completed"}

        # Block if users already exist
        user_count = db.query(User).count()
        if user_count > 0:
            return {"error": "Setup already completed"}

        # Validate
        if len(data.password) < 8:
            return {"error": "Password must be at least 8 characters"}

        # Create SUPER_ADMIN
        new_user = User(
            username=data.username,
            password_hash=hash_password(data.password),
            role="SUPER_ADMIN",
            status="ACTIVE"
        )
        db.add(new_user)
        db.commit()

        return {"status": "created"}
    finally:
        db.close()


@app.post("/api/setup/camera")
def setup_camera(data: SetupCameraData):
    db = SessionLocal()
    try:
        if data.camera_type not in ["USB", "RTSP"]:
            return {"error": "Invalid camera type. Must be USB or RTSP."}

        existing = (
            db.query(Camera)
            .filter(Camera.name == data.name)
            .first()
        )
        if existing:
            return {"error": "Camera already exists"}

        camera = Camera(
            name=data.name,
            location=data.location,
            camera_type=data.camera_type,
            source=data.source
        )
        db.add(camera)
        db.commit()

        return {"status": "created"}
    finally:
        db.close()


@app.post("/api/setup/complete")
def setup_complete():
    # Mark complete in database (backward compat)
    db = SessionLocal()
    try:
        config = (
            db.query(SystemConfig)
            .filter(SystemConfig.key == "setup_completed")
            .first()
        )
        if config:
            config.value = "true"
        else:
            config = SystemConfig(
                key="setup_completed",
                value="true"
            )
            db.add(config)
        db.commit()
    finally:
        db.close()

    # Mark complete in ConfigurationManager
    config_manager.update_config({
        "application": {
            "setup_complete": True,
            "first_run_complete": True
        }
    })

    return {"status": "completed"}


# -----------------------------
# SETUP WIZARD v2 — DATABASE
# -----------------------------

class DatabaseConfigUpdate(BaseModel):
    provider: str
    host: str = "localhost"
    port: int = 5432
    database: str = "attendance"
    username: str = ""
    password: str = ""
    ssl: bool = False
    path: str = "attendance.db"


@app.get("/api/setup/config")
def get_setup_config():
    """Return the current app configuration for the wizard."""
    app_config = config_manager.get_config()
    return {
        "schema_version": app_config.schema_version,
        "storage": app_config.storage.model_dump(),
        "database": {
            "host": app_config.database.host,
            "port": app_config.database.port,
            "database": app_config.database.database,
            "username": app_config.database.username,
            "password": app_config.database.password,
            "ssl": app_config.database.ssl,
            "path": app_config.database.path,
        },
        "application": app_config.application.model_dump(),
    }


@app.put("/api/setup/config")
def update_setup_config(data: DatabaseConfigUpdate):
    """Update database configuration from the wizard."""
    errors = config_manager.update_config({
        "storage": {"provider": data.provider},
        "database": {
            "host": data.host,
            "port": data.port,
            "database": data.database,
            "username": data.username,
            "password": data.password,
            "ssl": data.ssl,
            "path": data.path,
        }
    })

    if errors:
        return {
            "status": "error",
            "errors": [
                {"field": e.field, "message": e.message}
                for e in errors
            ]
        }

    return {"status": "updated"}


@app.post("/api/setup/database/test")
def test_database_connection(data: DatabaseConfigUpdate):
    """Test database connection with provided (unsaved) configuration.
    Does NOT persist config — only tests connectivity."""
    from backend.config.manager import ConfigurationManager
    from backend.config.models import AppConfig, StorageConfig, DatabaseConfig

    # Build a temporary config to test against
    test_mgr = ConfigurationManager()
    test_mgr._config = AppConfig(
        storage=StorageConfig(provider=data.provider),
        database=DatabaseConfig(
            host=data.host,
            port=data.port,
            database=data.database,
            username=data.username,
            password=data.password,
            ssl=data.ssl,
            path=data.path,
        )
    )
    test_mgr._loaded = True

    result = test_mgr.test_database_connection()

    # Provide user-friendly error categories
    if not result["success"]:
        msg = result["message"].lower()
        if "password authentication failed" in msg or "authentication failed" in msg:
            result["error_type"] = "auth_failed"
            result["message"] = "Authentication failed. Check your username and password."
        elif "could not connect" in msg or "connection refused" in msg or "unreachable" in msg:
            result["error_type"] = "host_unreachable"
            result["message"] = "Host unreachable. Check the hostname and port."
        elif "does not exist" in msg:
            result["error_type"] = "database_not_found"
            result["message"] = "Database does not exist. Check the database name."
        elif "timeout" in msg or "timed out" in msg:
            result["error_type"] = "timeout"
            result["message"] = "Connection timed out. The server may be unreachable."
        else:
            result["error_type"] = "unknown"

    return result


@app.post("/api/setup/database/initialize")
def initialize_database():
    """Initialize database tables using current configuration.
    Applies all migrations to the database."""
    try:
        from backend.database import run_pending_migrations, engine
        from sqlalchemy import inspect

        # Apply migrations programmatically
        run_pending_migrations()

        inspector = inspect(engine)
        tables = inspector.get_table_names()

        return {
            "status": "success",
            "message": "Database initialized successfully.",
            "tables_created": tables
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to initialize database: {str(e)}"
        }


# -----------------------------
# EXISTING ENDPOINTS
# -----------------------------
@app.post("/api/recognition")
def recognize(data: FaceData):
    print("Received embedding from camera:", data.camera_id)
    return {"status": "embedding received"}


@app.post("/api/frame")
async def receive_frame(frame: UploadFile = File(...)):
    content = await frame.read()
    print("Frame received:", len(content), "bytes")
    return {"status": "frame received"}


# -----------------------------
# ATTENDANCE ENDPOINT
# -----------------------------
attendance_log = []

@app.get("/api/attendance")
def get_attendance(
    employee_id: Optional[int] = None,
    date: Optional[str] = None,
    camera_id: Optional[int] = None
):
    db = SessionLocal()

    try:

        query = (
            db.query(
                Attendance,
                Employee
            )
            .join(
                Employee,
                Attendance.employee_id == Employee.id
            )
        )

        if employee_id:
            query = query.filter(
                Attendance.employee_id == employee_id
            )

        if camera_id:
            query = query.filter(
                Attendance.camera_id == camera_id
            )

        if date:
            target_date = datetime.fromisoformat(date).date()

            records = query.all()

            records = [
                (att, emp)
                for att, emp in records
                if att.timestamp.date() == target_date
            ]
        else:
            records = query.all()

        return [
            {
                "id": attendance.id,
                "employee": employee.name,
                "employee_id": employee.id,
                "timestamp": attendance.timestamp,
                "camera_id": attendance.camera_id
            }
            for attendance, employee in records
        ]

    finally:
        db.close()


# -----------------------------
# MARK ATTENDANCE
# -----------------------------

@app.post("/api/attendance")
async def mark_attendance(
    data: AttendanceData
):

    db = SessionLocal()

    try:

        attendance_time = datetime.fromisoformat(
            data.timestamp
        )

        employee = (
            db.query(Employee)
            .filter(Employee.name == data.name)
            .filter(Employee.status == "ACTIVE")
            .first()
        )

        if not employee:
            return {
                "error": "Employee not found or inactive"
            }

        today = attendance_time.date()

        existing_attendance = (
            db.query(Attendance)
            .filter(
                Attendance.employee_id == employee.id
            )
            .all()
        )

        already_marked = False

        for record in existing_attendance:

            if record.timestamp.date() == today:
                already_marked = True
                break

        if already_marked:

            print(
                f"⚠️ {employee.name} already marked today"
            )

            return {
                "status": "already_marked"
            }

        camera = (
            db.query(Camera)
            .filter(Camera.id == data.camera_id)
            .first()
        )

        if not camera:
            return {
                "error": "Camera not found"
            }

        new_entry = Attendance(
            employee_id=employee.id,
            timestamp=attendance_time,
            camera_id=data.camera_id
        )

        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)

        print(
            f"[STORED] Attendance stored for {employee.name}"
        )

        # -------------------------
        # WEBSOCKET BROADCAST
        # -------------------------

        await manager.broadcast(
            {
                "type": "attendance",
                "attendance_id": new_entry.id,
                "employee_id": employee.id,
                "employee": employee.name,
                "timestamp": str(attendance_time),
                "camera_id": data.camera_id
            }
        )

        return {
            "status": "stored",
            "employee": employee.name,
            "camera_id": data.camera_id
        }

    finally:
        db.close()

# -----------------------------
# UPLOAD EMPLOYEES
# -----------------------------

@app.post("/api/employees")
async def create_employee(
    name: str = Form(...),
    image: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    image_path = os.path.join(
        UPLOAD_DIR,
        f"{name}.jpg"
    )

    with open(image_path, "wb") as buffer:
        shutil.copyfileobj(
            image.file,
            buffer
        )
        
    embedding = generate_embedding(
        image_path
    )

    if embedding is None:
        os.remove(image_path)
        return {
            "error": "No face detected"
        }
    embedding_file = f"{name}.npy"

    np.save(
        os.path.join(
            EMPLOYEE_DIR,
            embedding_file
        ),
        embedding
    )

    db = SessionLocal()

    try:

        employee = (
            db.query(Employee)
            .filter(Employee.name == name)
            .first()
        )

        if employee:
            return {
                "error": "Employee already exists"
            }
        
        employee = Employee(
            name=name,
            embedding_file=embedding_file,
            status="ACTIVE"
        )
        db.add(employee)
        db.commit()
        create_audit_log(
            username=current_user["sub"],
            action="CREATE_EMPLOYEE",
            details=f"Created employee {name}"
        )
        db.refresh(employee)

        return {
            "status": "created",
            "employee_id": employee.id,
            "name": employee.name
        }

    finally:
        db.close()


# -----------------------------
# GET EMPLOYEES
# -----------------------------
@app.get("/api/employees")
def get_employees(current_user=Depends(get_current_user)):

    db = SessionLocal()

    try:
        employees = db.query(Employee).all()

        return [
            {
                "id": emp.id,
                "name": emp.name,
                "status": emp.status
            }
            for emp in employees
        ]

    finally:
        db.close()


# -----------------------------
# UPDATE EMPLOYEE STATUS
# ----------------------------- 

@app.patch("/api/employees/{employee_id}/status")
def update_status(
    employee_id: int,
    status: StatusUpdate,
    current_user=Depends(get_current_user)
):
    db = SessionLocal()

    try:
        employee = (
            db.query(Employee)
            .filter(Employee.id == employee_id)
            .first()
        )

        if not employee:
            return {
                "error": "Employee not found"
            }

        old_status = employee.status
        employee.status = status.status.value

        db.commit()
        create_audit_log(
            username=current_user["sub"],
            action="UPDATE_EMPLOYEE_STATUS",
            details=(
                f"{employee.name}: "
                f"{old_status} -> {status.status}"
            )
        )

        return {
            "status": "updated",
            "employee_id": employee.id,
            "new_status": employee.status
        }

    finally:
        db.close()



# -----------------------------
# ADD CAMERA
# -----------------------------

@app.post("/api/cameras")
def create_camera(data: CameraCreate, current_user=Depends(get_current_user)):

    db = SessionLocal()

    try:

        if data.camera_type not in ["USB", "RTSP"]:
            return {
                "error": "Invalid camera type. Must be USB or RTSP."
            }

        existing = (
            db.query(Camera)
            .filter(Camera.name == data.name)
            .first()
        )

        if existing:
            return {
                "error": "Camera already exists"
            }

        camera = Camera(
            name=data.name,
            location=data.location,
            camera_type=data.camera_type,
            source=data.source
        )

        db.add(camera)
        db.commit()
        db.refresh(camera)
        create_audit_log(
            username=current_user["sub"],
            action="CREATE_CAMERA",
            details=f"Created camera {camera.name} ({data.camera_type}: {data.source})"
        )

        return {
            "id": camera.id,
            "name": camera.name,
            "location": camera.location,
            "camera_type": camera.camera_type,
            "source": camera.source,
            "status": camera.status,
            "last_seen": camera.last_seen
        }

    finally:
        db.close()



# -----------------------------
# GET CAMERAS
# ----------------------------- 

@app.get("/api/cameras")
def get_cameras():

    db = SessionLocal()

    try:

        cameras = db.query(Camera).all()

        return [
            {
                "id": cam.id,
                "name": cam.name,
                "location": cam.location,
                "camera_type": cam.camera_type,
                "source": cam.source,
                "status": cam.status,
                "last_seen": str(cam.last_seen) if cam.last_seen else None
            }
            for cam in cameras
        ]

    finally:
        db.close()


# -----------------------------
# CAMERA HEARTBEAT (last_seen)
# -----------------------------

@app.patch("/api/cameras/{camera_id}/heartbeat")
def camera_heartbeat(camera_id: int):
    db = SessionLocal()
    try:
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            return {"error": "Camera not found"}
        camera.last_seen = datetime.utcnow()
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()


# -----------------------------
# CAMERA STATUS UPDATE
# -----------------------------

class CameraStatusUpdate(BaseModel):
    status: str

@app.patch("/api/cameras/{camera_id}/status")
def update_camera_status(camera_id: int, data: CameraStatusUpdate):
    db = SessionLocal()
    try:
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            return {"error": "Camera not found"}
        camera.status = data.status
        camera.last_seen = datetime.utcnow()
        db.commit()
        return {"status": "ok", "camera_status": data.status}
    finally:
        db.close()


# -----------------------------
# EDIT CAMERA
# -----------------------------

class CameraEdit(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    camera_type: Optional[str] = None
    source: Optional[str] = None

@app.patch("/api/cameras/{camera_id}")
def edit_camera(camera_id: int, data: CameraEdit, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            return {"error": "Camera not found"}

        if data.camera_type and data.camera_type not in ["USB", "RTSP"]:
            return {"error": "Invalid camera type. Must be USB or RTSP."}

        # Check name uniqueness if changing name
        if data.name and data.name != camera.name:
            existing = db.query(Camera).filter(Camera.name == data.name).first()
            if existing:
                return {"error": "A camera with that name already exists"}

        if data.name is not None:
            camera.name = data.name
        if data.location is not None:
            camera.location = data.location
        if data.camera_type is not None:
            camera.camera_type = data.camera_type
        if data.source is not None:
            camera.source = data.source

        db.commit()
        db.refresh(camera)

        create_audit_log(
            username=current_user["sub"],
            action="EDIT_CAMERA",
            details=f"Edited camera {camera.name} (id={camera_id})"
        )

        return {
            "id": camera.id,
            "name": camera.name,
            "location": camera.location,
            "camera_type": camera.camera_type,
            "source": camera.source,
            "status": camera.status,
            "last_seen": str(camera.last_seen) if camera.last_seen else None
        }
    finally:
        db.close()


# -----------------------------
# TEST CAMERA CONNECTION
# -----------------------------

class CameraTestRequest(BaseModel):
    camera_type: str
    source: str

@app.post("/api/cameras/test")
def test_camera_connection(data: CameraTestRequest):
    import cv2

    if data.camera_type not in ["USB", "RTSP"]:
        return {"status": "failed", "error": "Invalid camera type"}

    try:
        if data.camera_type == "USB":
            cap = cv2.VideoCapture(int(data.source))
        else:
            cap = cv2.VideoCapture(data.source)

        if not cap.isOpened():
            return {"status": "failed", "error": "Could not open camera stream"}

        ret, _ = cap.read()
        cap.release()

        if ret:
            return {"status": "success"}
        else:
            return {"status": "failed", "error": "Camera opened but could not read frame"}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


# -----------------------------
# DELETE CAMERA
# -----------------------------

@app.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: int, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            return {"error": "Camera not found"}

        if camera.status != "DISABLED":
            return {"error": "Camera must be DISABLED before deletion"}

        camera_name = camera.name
        db.delete(camera)
        db.commit()

        create_audit_log(
            username=current_user["sub"],
            action="DELETE_CAMERA",
            details=f"Deleted camera {camera_name} (id={camera_id})"
        )

        return {"status": "deleted"}
    finally:
        db.close()


# -----------------------------
# DASHBOARD STATS
# ----------------------------- 

@app.get("/api/stats")
def get_stats(current_user=Depends(get_current_user)):

    db = SessionLocal()

    try:

        today = datetime.now().date()

        total_employees = db.query(Employee).count()

        active_employees = (
            db.query(Employee)
            .filter(Employee.status == "ACTIVE")
            .count()
        )

        attendance_today = 0

        records = db.query(Attendance).all()

        for record in records:
            if record.timestamp.date() == today:
                attendance_today += 1

        active_cameras = (
            db.query(Attendance.camera_id)
            .distinct()
            .count()
        )

        total_cameras = db.query(Camera).count()
        total_users = db.query(User).count()

        return {
            "total_employees": total_employees,
            "active_employees": active_employees,
            "attendance_today": attendance_today,
            "active_cameras": active_cameras,
            "total_cameras": total_cameras,
            "total_users": total_users,
        }

    finally:
        db.close()


# -----------------------------
# LOGIN
# -----------------------------

@app.post("/api/login")
def login(form_data :  OAuth2PasswordRequestForm = Depends()):

    db = SessionLocal()

    try:

        user = (
            db.query(User)
            .filter(
                User.username == form_data.username
            )
            .first()
        )

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid username or password."
            )
        
        if not verify_password(
            form_data.password,
            user.password_hash
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid username or password."
            )

        if user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=403,
                detail="This account is inactive or suspended. Please contact an administrator."
            )

        token = create_access_token(
            {
                "sub": user.username,
                "role": user.role
            }
        )

        create_audit_log(
            username=user.username,
            action="LOGIN",
            details="Successful login"
        )
        return {
            "access_token": token,
            "token_type": "bearer"
        }

    finally:
        db.close()


# -----------------------------
# AUDIT LOGS
# -----------------------------

@app.get("/api/audit-logs")
def get_audit_logs(
    user=Depends(get_current_user)
):

    db = SessionLocal()

    try:

        logs = (
            db.query(AuditLog)
            .order_by(
                AuditLog.timestamp.desc()
            )
            .all()
        )

        return [
            {
                "id": log.id,
                "user": log.username,
                "action": log.action,
                "details": log.details,
                "timestamp": log.timestamp
            }
            for log in logs
        ]

    finally:
        db.close()


# -----------------------------
# CURRENT USER
# -----------------------------

@app.get("/api/current-user")
def current_user(
    user=Depends(get_current_user)
):
    return user


# -----------------------------
# USERS
# -----------------------------

@app.get("/api/users")
def get_users(
    user=Depends(get_current_user)
):

    require_role(
        user,
        ["SUPER_ADMIN"]
    )

    db = SessionLocal()

    try:

        users = db.query(User).all()

        return [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "status": u.status
            }
            for u in users
        ]

    finally:
        db.close()


# -----------------------------
# CREATE USER
# -----------------------------

@app.post("/api/users")
def create_user(
    data: UserCreate,
    user=Depends(get_current_user)
):
    require_role(
        user,
        ["SUPER_ADMIN"]
    )

    db = SessionLocal()

    try:

        existing_user = (
            db.query(User)
            .filter(
                User.username == data.username
            )
            .first()
        )

        if existing_user:
            return {
                "error": "User already exists"
            }

        new_user = User(
            username=data.username,
            password_hash=hash_password(
                data.password
            ),
            role=data.role,
            status="ACTIVE"
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        create_audit_log(
            username=user["sub"],
            action="CREATE_USER",
            details=(
                f"Created user "
                f"{new_user.username} "
                f"with role "
                f"{new_user.role}"
            )
        )

        return {
            "status": "created",
            "user_id": new_user.id,
            "username": new_user.username,
            "role": new_user.role
        }

    finally:
        db.close()


# -----------------------------
# UPDATE USER STATUS
# -----------------------------

@app.patch("/api/users/{user_id}/status")
def update_user_status(
    user_id: int,
    data: UserStatusUpdate,
    user=Depends(get_current_user)
):

    require_role(
        user,
        ["SUPER_ADMIN"]
    )

    db = SessionLocal()

    try:

        target_user = (
            db.query(User)
            .filter(User.id == user_id)
            .first()
        )

        if not target_user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        # Prevent self-disable
        if target_user.username == user["sub"]:
            raise HTTPException(
                status_code=403,
                detail="Cannot modify your own status"
            )

        old_status = target_user.status

        target_user.status = data.status

        db.commit()

        create_audit_log(
            username=user["sub"],
            action="UPDATE_USER_STATUS",
            details=(
                f"{target_user.username}: "
                f"{old_status} -> "
                f"{data.status}"
            )
        )

        return {
            "status": "updated",
            "user": target_user.username,
            "new_status": data.status
        }

    finally:
        db.close()


# -----------------------------
# UPDATE USER ROLE
# -----------------------------

@app.patch("/api/users/{user_id}/role")
def update_user_role(
    user_id: int,
    data: UserRoleUpdate,
    user=Depends(get_current_user)
):

    require_role(
        user,
        ["SUPER_ADMIN"]
    )

    db = SessionLocal()

    try:

        target_user = (
            db.query(User)
            .filter(User.id == user_id)
            .first()
        )

        if not target_user:
            return {
                "error": "User not found"
            }

        # Prevent changing your own role
        if target_user.username == user["sub"]:
            return {
                "error": (
                    "Cannot modify "
                    "your own role"
                )
            }

        old_role = target_user.role

        if (
            old_role == "SUPER_ADMIN"
            and data.role != "SUPER_ADMIN"
        ):

            super_admin_count = (
                db.query(User)
                .filter(
                    User.role == "SUPER_ADMIN"
                )
                .count()
            )

            if super_admin_count <= 1:
                return {
                    "error":
                    "Cannot remove last SUPER_ADMIN"
                }

        target_user.role = data.role

        db.commit()

        create_audit_log(
            username=user["sub"],
            action="UPDATE_USER_ROLE",
            details=(
                f"{target_user.username}: "
                f"{old_role} -> "
                f"{data.role}"
            )
        )

        return {
            "status": "updated",
            "user": target_user.username,
            "new_role": data.role
        }

    finally:
        db.close()


# -----------------------------
# WEBSOCKET ENDPOINT
# -----------------------------

@app.websocket("/ws/attendance")
async def attendance_socket(
    websocket: WebSocket
):

    await manager.connect(websocket)

    try:
        while True:
            await asyncio.sleep(30)
    finally:
        manager.disconnect(websocket)


# =============================================================
# BACKUP & RESTORE ENDPOINTS
# =============================================================

from backend.backup.models import RestoreRequest, BackupSettings


@app.on_event("startup")
def run_migrations():
    """Apply pending Alembic migrations on startup."""
    try:
        from backend.database import run_pending_migrations
        run_pending_migrations()
    except Exception as e:
        print(f"[STARTUP] Database migrations failed: {e}")
        import sys
        sys.exit(1)


@app.on_event("startup")
def start_backup_scheduler():
    """Start the backup scheduler on application startup."""
    try:
        from backend.backup.scheduler import BackupScheduler
        global _backup_scheduler
        _backup_scheduler = BackupScheduler()
        _backup_scheduler.start()
    except Exception as e:
        print(f"[STARTUP] Backup scheduler failed to start: {e}")

_backup_scheduler = None


@app.post("/api/backups/create")
def create_backup(user=Depends(get_current_user)):
    """Create a backup immediately."""
    from backend.backup import get_backup_manager

    backup_manager = get_backup_manager()
    result = backup_manager.create_backup(username=user["sub"])

    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.message)

    return {
        "status": result.status,
        "file": result.file,
        "created_at": result.created_at,
        "message": result.message,
    }


@app.get("/api/backups")
def list_backups(user=Depends(get_current_user)):
    """List available backups."""
    from backend.backup import get_backup_manager

    backup_manager = get_backup_manager()
    backups = backup_manager.list_backups()

    return [
        {
            "filename": b.filename,
            "size_bytes": b.size_bytes,
            "size_display": b.size_display,
            "created_at": b.created_at,
        }
        for b in backups
    ]


@app.post("/api/backups/restore")
def restore_backup(data: RestoreRequest, user=Depends(get_current_user)):
    """Restore a selected backup.

    Creates an automatic safety backup before restoring.
    Database connection settings are preserved by default.
    """
    from backend.backup import get_backup_manager

    backup_manager = get_backup_manager()
    result = backup_manager.restore_backup(
        filename=data.filename,
        username=user["sub"],
        restore_db_connection=data.restore_db_connection,
    )

    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.message)

    return {
        "status": result.status,
        "message": result.message,
        "file": result.file,
        "restart_required": result.restart_required,
    }


@app.delete("/api/backups/{filename}")
def delete_backup(filename: str, user=Depends(get_current_user)):
    """Delete a backup file."""
    from backend.backup import get_backup_manager

    backup_manager = get_backup_manager()
    result = backup_manager.delete_backup(
        filename=filename,
        username=user["sub"],
    )

    if result.status == "error":
        raise HTTPException(status_code=404, detail=result.message)

    return {
        "status": result.status,
        "message": result.message,
    }


@app.get("/api/backups/settings")
def get_backup_settings(user=Depends(get_current_user)):
    """Get current backup settings."""
    config = config_manager.get_config()

    return {
        "enabled": config.backup.enabled,
        "automatic": config.backup.automatic,
        "frequency": config.backup.frequency,
        "keep": config.backup.keep,
        "destination": config.backup.destination,
        "backup_time": config.backup.backup_time,
    }


class BackupSettingsUpdate(BaseModel):
    enabled: bool = False
    automatic: bool = False
    frequency: str = "daily"
    keep: int = 30
    destination: str = ""
    backup_time: str = "02:00"


@app.put("/api/backups/settings")
def update_backup_settings(data: BackupSettingsUpdate, user=Depends(get_current_user)):
    """Update backup settings (schedule, retention, destination)."""
    errors = config_manager.update_config({
        "backup": {
            "enabled": data.enabled,
            "automatic": data.automatic,
            "frequency": data.frequency,
            "keep": data.keep,
            "destination": data.destination,
            "backup_time": data.backup_time,
        }
    })

    if errors:
        return {
            "status": "error",
            "errors": [
                {"field": e.field, "message": e.message}
                for e in errors
            ],
        }

    # Restart scheduler with new settings
    global _backup_scheduler
    if _backup_scheduler is not None:
        _backup_scheduler.restart()

    create_audit_log(
        username=user["sub"],
        action="BACKUP_SETTINGS_UPDATED",
        details=(
            f"Backup settings updated: "
            f"enabled={data.enabled}, automatic={data.automatic}, "
            f"frequency={data.frequency}, keep={data.keep}"
        ),
    )

    return {"status": "updated", "message": "Backup settings saved successfully."}

