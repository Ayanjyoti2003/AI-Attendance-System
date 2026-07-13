from backend.database import SessionLocal
from backend.models import Employee

db = SessionLocal()

employee = Employee(
    name="Ayanjyoti",
    embedding_file="Ayanjyoti.npy"
)

db.add(employee)
db.commit()

print("Employee inserted")

db.close()