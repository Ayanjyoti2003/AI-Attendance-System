import os
from dotenv import load_dotenv
import bcrypt
from jose import jwt
from datetime import datetime, timedelta
from fastapi import HTTPException
import secrets

def generate_recovery_key() -> str:
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    chars = [secrets.choice(alphabet) for _ in range(16)]
    return f"{''.join(chars[:4])}-{''.join(chars[4:8])}-{''.join(chars[8:12])}-{''.join(chars[12:])}"

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 60

COMMON_PASSWORDS = {
    "password",
    "password123",
    "12345678",
    "admin123",
    "aaaaaaaa",
}

def validate_password_policy(password: str, current_password: str = None):
    if not password:
        raise HTTPException(
            status_code=400,
            detail="Password cannot be empty."
        )
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long."
        )
    if len(password) > 128:
        raise HTTPException(
            status_code=400,
            detail="Password cannot exceed 128 characters."
        )
    if current_password and password == current_password:
        raise HTTPException(
            status_code=400,
            detail="New password cannot be the same as the current password."
        )
    if password.lower() in COMMON_PASSWORDS:
        raise HTTPException(
            status_code=400,
            detail="Password is too common or weak."
        )


def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    # Generate salt and hash
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pwd_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(data: dict):

    to_encode = data.copy()

    expire = datetime.utcnow() + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode.update({
        "exp": expire
    })

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )