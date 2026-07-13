from backend.database import SessionLocal
from backend.models import User
from backend.auth import hash_password

db = SessionLocal()

admin = User(
    username="admin",
    password_hash=hash_password("admin123"),
    role="ADMIN"
)

db.add(admin)
db.commit()

print("Admin created")