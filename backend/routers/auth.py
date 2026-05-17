"""Authentication endpoints: register / login / me / logout / update settings."""
from fastapi import APIRouter, Depends, HTTPException, Response

from db import db
from auth_lib import (
    hash_password, verify_password, create_access_token,
    set_auth_cookie, get_current_user, gen_id, now_iso, require_edit,
    check_lockout, record_failed_attempt, clear_failed_attempts,
)
from models import RegisterIn, LoginIn, UserOut, SettingsUpdate, DEFAULT_PERMISSIONS
from seed import seed_user_defaults

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register(payload: RegisterIn):
    """Office-admin self-registration. Account is created with approval_status='pending'
    and the user CANNOT log in until a super_admin approves them. We do NOT set the
    auth cookie here — the user must wait."""
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if not payload.office:
        raise HTTPException(status_code=400, detail="Office is required for registration")

    user_id = gen_id()
    doc = {
        "id": user_id,
        "email": email,
        "name": payload.name,
        "business_name": payload.business_name,
        "password_hash": hash_password(payload.password),
        "currency": "INR",
        "role": "office_admin",
        "office": payload.office,
        "approval_status": "pending",
        "permissions": dict(DEFAULT_PERMISSIONS),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    # Seed defaults so the office admin has accounts/categories ready upon approval
    await seed_user_defaults(user_id)
    return {
        "ok": True,
        "approval_status": "pending",
        "message": "Account created. A super admin will review and approve your access shortly.",
    }


@router.post("/login", response_model=UserOut)
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    # Lockout check FIRST so bad actors can't keep guessing during a lock window
    await check_lockout(email)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failed_attempt(email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    status = user.get("approval_status", "approved")
    if status == "pending":
        raise HTTPException(status_code=403, detail="Your account is awaiting super-admin approval.")
    if status == "rejected":
        raise HTTPException(status_code=403, detail="Your access request was rejected. Please contact the super admin.")
    # Successful login → wipe the failed-attempt counter
    await clear_failed_attempts(email)
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
async def update_settings(payload: SettingsUpdate, user: dict = Depends(require_edit("settings"))):
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh
