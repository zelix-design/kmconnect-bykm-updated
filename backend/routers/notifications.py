"""In-app notifications. Currently only super_admin users receive notifications
on three events fired by office-admin actions:
  - new expense_request submitted
  - new transaction logged
  - new student enrolled
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_lib import get_current_user, gen_id, now_iso

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# --- helper used by other routers --------------------------------------
async def notify_super_admins(
    *,
    type: str,
    title: str,
    message: str,
    link: str = "",
    metadata: dict | None = None,
    actor_user_id: str | None = None,
) -> None:
    """Fan-out a notification to every super_admin (except the actor themselves)."""
    admins = await db.users.find(
        {"role": "super_admin", "approval_status": "approved"},
        {"_id": 0, "id": 1},
    ).to_list(50)
    docs: List[dict] = []
    now = now_iso()
    for a in admins:
        if actor_user_id and a["id"] == actor_user_id:
            continue
        docs.append({
            "id": gen_id(),
            "recipient_user_id": a["id"],
            "type": type,
            "title": title,
            "message": message,
            "link": link,
            "metadata": metadata or {},
            "read": False,
            "created_at": now,
        })
    if docs:
        await db.notifications.insert_many(docs)


# --- endpoints ----------------------------------------------------------
@router.get("")
async def list_notifications(
    user: dict = Depends(get_current_user),
    limit: int = 50,
    unread_only: bool = False,
):
    q: dict = {"recipient_user_id": user["id"]}
    if unread_only:
        q["read"] = False
    return await (
        db.notifications.find(q, {"_id": 0})
        .sort("created_at", -1)
        .limit(max(1, min(limit, 200)))
        .to_list(200)
    )


@router.get("/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    n = await db.notifications.count_documents(
        {"recipient_user_id": user["id"], "read": False}
    )
    return {"count": n}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    res = await db.notifications.update_one(
        {"id": notif_id, "recipient_user_id": user["id"]},
        {"$set": {"read": True, "read_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    res = await db.notifications.update_many(
        {"recipient_user_id": user["id"], "read": False},
        {"$set": {"read": True, "read_at": now_iso()}},
    )
    return {"ok": True, "updated": res.modified_count}


@router.delete("/{notif_id}")
async def delete_notification(notif_id: str, user: dict = Depends(get_current_user)):
    res = await db.notifications.delete_one(
        {"id": notif_id, "recipient_user_id": user["id"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}
