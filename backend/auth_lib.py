"""Authentication primitives: password hashing, JWT, current-user dependency."""
import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request, Response

from db import db


JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


async def get_current_user(request: Request) -> dict:
    token: Optional[str] = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one(
            {"id": payload["sub"]}, {"_id": 0, "password_hash": 0}
        )
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")



def require_edit(page: str):
    """Dependency factory: ensures the current user has `edit` permission on a given page.
    Super admins always pass. Office admins are checked against `user.permissions[page]`.
    Missing permissions default to `edit` (backward-compatible with users created before
    this feature shipped)."""
    async def _checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") == "super_admin":
            return user
        perms = user.get("permissions") or {}
        level = perms.get(page) or "edit"
        if level != "edit":
            raise HTTPException(
                status_code=403,
                detail=f"You have {level}-only access to {page}",
            )
        return user
    return _checker



# ---------- Brute-force lockout ----------
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


async def check_lockout(email: str) -> None:
    """Raises 429 if the email is currently locked out. Idempotent."""
    rec = await db.login_attempts.find_one({"email": email})
    if not rec:
        return
    locked_until = rec.get("locked_until")
    if locked_until:
        try:
            ts = datetime.fromisoformat(locked_until)
        except (TypeError, ValueError):
            ts = None
        if ts and ts > datetime.now(timezone.utc):
            remaining = int((ts - datetime.now(timezone.utc)).total_seconds() // 60) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Account temporarily locked. Try again in {remaining} minute(s).",
            )


async def record_failed_attempt(email: str) -> None:
    """Increment failed counter; lock the account when threshold hit."""
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"email": email})
    fails = (rec.get("fails", 0) if rec else 0) + 1
    patch = {"email": email, "fails": fails, "last_attempt": now.isoformat()}
    if fails >= MAX_FAILED_ATTEMPTS:
        patch["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
    await db.login_attempts.update_one(
        {"email": email}, {"$set": patch}, upsert=True
    )


async def clear_failed_attempts(email: str) -> None:
    """Called on successful login — wipes the counter."""
    await db.login_attempts.delete_one({"email": email})
