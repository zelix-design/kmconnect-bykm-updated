"""Authentication endpoints: register / login / me / logout / update settings."""
from fastapi import APIRouter, Depends, HTTPException, Response

from db import db
from auth_lib import (
    hash_password, verify_password, create_access_token,
    set_auth_cookie, get_current_user, gen_id, now_iso,
)
from models import RegisterIn, LoginIn, UserOut, SettingsUpdate
from seed import seed_user_defaults

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut)
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = gen_id()
    doc = {
        "id": user_id,
        "email": email,
        "name": payload.name,
        "business_name": payload.business_name,
        "password_hash": hash_password(payload.password),
        "currency": "USD",
        "role": "user",
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await seed_user_defaults(user_id)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@router.post("/login", response_model=UserOut)
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
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
async def update_settings(payload: SettingsUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh
