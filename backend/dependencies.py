from fastapi import Depends, HTTPException, Request
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
    request: Request,
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
        
        # Verify token_version to support remote revocation/session invalidation
        token_version = payload.get("token_version")
        if token_version is None or token_version != user.token_version:
            raise HTTPException(
                status_code=401,
                detail="Session expired. Please login again."
            )
            
        # Enforce password change redirect if flagged
        if user.must_change_password:
            # Allow only the change-password route to go through
            if request.url.path != "/api/users/change-password":
                raise HTTPException(
                    status_code=403,
                    detail="Password change required"
                )
    finally:
        db.close()

    return payload