from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError

from backend.auth import (
    SECRET_KEY,
    ALGORITHM
)
from backend.database import SessionLocal
from backend.models import User, UserStatus

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/login"
)


def get_current_user(
    token: str = Depends(oauth2_scheme)
):
    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        username = payload.get("sub")

        if username is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid token"
            )

    except JWTError:

        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            raise HTTPException(
                status_code=401,
                detail="User not found."
            )
        if user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=403,
                detail="Your account has been disabled. Please contact an administrator."
            )
    finally:
        db.close()

    return payload