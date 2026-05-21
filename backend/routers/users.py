"""User management — super_admin only. Approve / reject office-admin signups."""
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from db import db
from auth_lib import get_current_user, hash_password, gen_id, now_iso
from models import (
    UserApprovalUpdate, PermissionsUpdate, PERMISSION_PAGES, DEFAULT_PERMISSIONS,
    OfficeCode,
)

router = APIRouter(prefix="/api/users", tags=["users"])


def _require_super_admin(user: dict) -> None:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")


@router.get("")
async def list_users(user: dict = Depends(get_current_user), status: str | None = None):
    _require_super_admin(user)
    q: dict = {}
    if status:
        q["approval_status"] = status
    docs = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return docs


class CreateUserIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Literal["super_admin", "office_admin"] = "office_admin"
    office: Optional[OfficeCode] = None  # required when role=office_admin
    business_name: Optional[str] = None
    currency: Literal["USD", "INR"] = "INR"


@router.post("", status_code=201)
async def create_user(payload: CreateUserIn, user: dict = Depends(get_current_user)):
    """Super-admin creates a user directly (skips self-registration flow).
    Office admins are created already approved with default permissions so
    they can sign in immediately."""
    _require_super_admin(user)
    if payload.role == "office_admin" and not payload.office:
        raise HTTPException(400, "Office is required for office admin")
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(409, "A user with this email already exists")
    doc = {
        "id": gen_id(),
        "email": str(payload.email).lower(),
        "password_hash": hash_password(payload.password),
        "name": payload.name.strip(),
        "business_name": payload.business_name or "",
        "currency": payload.currency,
        "role": payload.role,
        "office": payload.office if payload.role == "office_admin" else None,
        "approval_status": "approved",
        "created_at": now_iso(),
        "created_by_admin": user["id"],
    }
    # Office admins get the full edit map by default — super admins ignore it.
    if payload.role == "office_admin":
        doc["permissions"] = dict(DEFAULT_PERMISSIONS)
    await db.users.insert_one(doc)
    return await db.users.find_one({"id": doc["id"]}, {"_id": 0, "password_hash": 0})


@router.patch("/{user_id}/approval")
async def update_approval(user_id: str, payload: UserApprovalUpdate, user: dict = Depends(get_current_user)):
    _require_super_admin(user)
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own approval status")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    patch = {"approval_status": payload.status}
    if payload.note:
        patch["approval_note"] = payload.note
    # When approving for the first time, seed default permissions if missing
    if payload.status == "approved" and not target.get("permissions"):
        patch["permissions"] = dict(DEFAULT_PERMISSIONS)
    await db.users.update_one({"id": user_id}, {"$set": patch})
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return fresh


@router.patch("/{user_id}/permissions")
async def update_permissions(user_id: str, payload: PermissionsUpdate, user: dict = Depends(get_current_user)):
    """Super-admin only. Replaces the user's full permission map.
    Permission keys must be in PERMISSION_PAGES; values must be one of edit/view/none.
    Note: `overview` is the home redirect target, so we never allow `none` on it
    (would cause a route-guard redirect loop)."""
    _require_super_admin(user)
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Super admin permissions cannot be changed")
    cleaned: dict = {}
    for page in PERMISSION_PAGES:
        level = payload.permissions.get(page, "edit")
        if level not in ("edit", "view", "none"):
            raise HTTPException(status_code=400, detail=f"Invalid permission level for {page}: {level}")
        # Overview must remain at least viewable — it's the home/redirect target
        if page == "overview" and level == "none":
            level = "view"
        cleaned[page] = level
    await db.users.update_one({"id": user_id}, {"$set": {"permissions": cleaned}})
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return fresh


@router.delete("/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user)):
    """Permanently delete a user row. Self-deletion is blocked; any other
    user (including additional super admins) can be removed by a super admin."""
    _require_super_admin(user)
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}
