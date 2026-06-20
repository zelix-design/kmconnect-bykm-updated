"""User management — super_admin only. Approve / reject office-admin signups."""
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from db import db
from auth_lib import get_current_user, hash_password, gen_id, now_iso
from models import (
    UserApprovalUpdate, PermissionsUpdate, PERMISSION_PAGES, DEFAULT_PERMISSIONS,
    USER_DEFAULT_PERMISSIONS,
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
    role: Literal["super_admin", "office_admin", "user"] = "office_admin"
    office: Optional[OfficeCode] = None  # required when role=office_admin
    business_name: Optional[str] = None
    currency: Literal["USD", "INR"] = "INR"
    # Optional — only used when role="user". Links the login account to a
    # Client row (sub_agent / associate_consultant) so the user can view
    # only their own students and SC earned.
    linked_client_id: Optional[str] = None


@router.post("", status_code=201)
async def create_user(payload: CreateUserIn, user: dict = Depends(get_current_user)):
    """Super-admin creates a user directly (skips self-registration flow).
    Office admins are created already approved with default permissions so
    they can sign in immediately. The lightweight `user` role gets a
    stripped-down permission map covering only their personal finance pages."""
    _require_super_admin(user)
    if payload.role == "office_admin" and not payload.office:
        raise HTTPException(400, "Office is required for office admin")
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(409, "A user with this email already exists")

    # Validate the linked client (only meaningful for role="user").
    linked_client_id: Optional[str] = None
    linked_client_name: Optional[str] = None
    if payload.linked_client_id and payload.role == "user":
        client = await db.clients.find_one(
            {"id": payload.linked_client_id},
            {"_id": 0, "id": 1, "name": 1, "client_type": 1},
        )
        if not client:
            raise HTTPException(400, "Linked client not found")
        if client.get("client_type") not in ("sub_agent_associate", "associate_consultant"):
            raise HTTPException(400, "Linked client must be a sub-agent or associate consultant")
        # One-to-one: a client can only back one login account at a time.
        already = await db.users.find_one({"linked_client_id": payload.linked_client_id})
        if already:
            raise HTTPException(
                409,
                f"This client is already linked to another user account ({already.get('email')}).",
            )
        linked_client_id = client["id"]
        linked_client_name = client["name"]

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
    if linked_client_id:
        doc["linked_client_id"] = linked_client_id
        doc["linked_client_name"] = linked_client_name
    if payload.role == "office_admin":
        doc["permissions"] = dict(DEFAULT_PERMISSIONS)
    elif payload.role == "user":
        # Linked clients get students set to "view" so they can browse, but
        # all SC adjustment edits are blocked at the API level regardless.
        perms = dict(USER_DEFAULT_PERMISSIONS)
        if linked_client_id:
            perms["students"] = "view"
        doc["permissions"] = perms
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


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    payload: ResetPasswordIn,
    user: dict = Depends(get_current_user),
):
    """Super-admin-only: directly set a new password for any user (including
    other super admins). The target user can sign in with the new password
    immediately. Existing JWT tokens issued before the reset stay valid
    until they expire — out of scope for this iteration."""
    _require_super_admin(user)
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Clear any active brute-force lockout so the target can sign in right away.
    await db.login_attempts.delete_one({"email": target.get("email")})
    res = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_reset_at": now_iso(),
            "password_reset_by": user["id"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "user_id": user_id}
