from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
    Boolean
)
from backend.database import Base
from datetime import datetime
from enum import Enum

class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"),nullable=False)
    timestamp = Column(DateTime, nullable=False)
    camera_id = Column(Integer,ForeignKey("cameras.id"))

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    embedding_file = Column(String, nullable=False)
    status = Column(String,default="ACTIVE")

class Camera(Base):

    __tablename__ = "cameras"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String,
        nullable=False
    )

    location = Column(
        String,
        nullable=False
    )

    camera_type = Column(
        String,
        nullable=False
    )

    source = Column(
        String,
        nullable=False
    )

    status = Column(
        String,
        default="OFFLINE"
    )

    last_seen = Column(
        DateTime,
        nullable=True
    )

    last_error = Column(
        String,
        nullable=True
    )

    last_successful_frame = Column(
        DateTime,
        nullable=True
    )

    device_name = Column(
        String,
        nullable=True
    )

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    username = Column(
        String,
        unique=True,
        nullable=False
    )

    password_hash = Column(
        String,
        nullable=False
    )

    role = Column(
        String,
        default="ADMIN"
    )

    status = Column(
        String,
        default="ACTIVE"
    )

    must_change_password = Column(
        Boolean,
        default=False,
        server_default='false',
        nullable=False
    )

    token_version = Column(
        Integer,
        default=1,
        server_default='1',
        nullable=False
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    username = Column(
        String,
        nullable=False
    )

    action = Column(
        String,
        nullable=False
    )

    details = Column(
        String
    )

    timestamp = Column(
        DateTime,
        default=datetime.utcnow
    )

class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    HR = "HR"
    VIEWER = "VIEWER"

class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"

class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    key = Column(
        String,
        unique=True,
        nullable=False
    )

    value = Column(
        String,
        nullable=True
    )
