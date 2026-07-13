from backend.database import SessionLocal
from backend.models import AuditLog


def create_audit_log(
    username: str,
    action: str,
    details: str
):
    db = SessionLocal()

    try:

        log = AuditLog(
            username=username,
            action=action,
            details=details
        )

        db.add(log)
        db.commit()

    finally:
        db.close()