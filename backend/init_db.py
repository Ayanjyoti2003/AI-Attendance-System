from backend.database import engine
from backend.models import Base

print("Creating tables...")

Base.metadata.create_all(bind=engine)

print("Done.")