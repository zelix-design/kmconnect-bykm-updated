"""User management — super_admin only. Approve / reject office-admin signups."""
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_lib import get_current_user
from models import UserApprovalUpdate

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
    await db.users.update_one({"id": user_id}, {"$set": patch})
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return fresh


@router.delete("/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user)):
    """Permanently delete a non-super-admin user and *only their auth row* (their
    data remains for audit). Super admin cannot delete themselves."""
    _require_super_admin(user)
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot delete another super admin")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}
