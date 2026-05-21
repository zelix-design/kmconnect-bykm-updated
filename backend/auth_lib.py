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
    """Return True iff ``plain`` matches the bcrypt ``hashed``. Returns False
    instead of raising for malformed/empty hashes — so a corrupted row in
    Mongo can't take down ``/api/auth/login`` with an HTTP 500."""
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        # Surface a clear, actionable 500 instead of KeyError → opaque crash.
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail="JWT_SECRET env var is missing on the server. "
                   "Set JWT_SECRET in the deployment environment and redeploy.",
        )
    return secret


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


def _cookie_settings() -> tuple[bool, str]:
    """Return ``(secure, samesite)`` for the auth cookie.

    Defaults to ``secure=True, samesite="none"`` so it works on every
    deployed Emergent environment (preview + production + custom domains),
    where the frontend may end up cross-origin from the backend.

    For local HTTP dev set ``AUTH_COOKIE_SECURE=false`` and
    ``AUTH_COOKIE_SAMESITE=lax`` in backend/.env."""
    secure_env = (os.environ.get("AUTH_COOKIE_SECURE") or "").lower()
    if secure_env in {"true", "1", "yes"}:
        secure = True
    elif secure_env in {"false", "0", "no"}:
        secure = False
    else:
        secure = True  # deployed default
    samesite = (os.environ.get("AUTH_COOKIE_SAMESITE") or "none").lower()
    if samesite not in {"none", "lax", "strict"}:
        samesite = "none"
    # ``SameSite=None`` is only valid with ``Secure``; enforce that pairing.
    if samesite == "none" and not secure:
        secure = True
    return secure, samesite


def set_auth_cookie(response: Response, token: str) -> None:
    secure, samesite = _cookie_settings()
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite=samesite,
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
