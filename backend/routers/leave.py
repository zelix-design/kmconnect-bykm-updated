"""Leave Request & Management.

Requesters: staff + office_admin (+ super_admin for completeness).
Approval hierarchy (single-level per requester):
  - staff        → approved by an Office Admin of their office (super admin may also act)
  - office_admin → approved by a Super Admin
  - super_admin  → approved by a Super Admin peer

Boxes:
  - mine  : requests I submitted
  - inbox : requests awaiting / handled by me as approver
"""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit
from routers.notifications import notify_users

router = APIRouter(prefix="/api/leave", tags=["leave"])

LEAVE_TYPES = ("casual", "sick", "earned", "unpaid")


class LeaveIn(BaseModel):
    leave_type: str = "casual"
    from_date: str  # YYYY-MM-DD
    to_date: str
    reason: str = Field(default="", max_length=1000)


class LeaveDecision(BaseModel):
    status: Literal["approved", "rejected"]
    note: Optional[str] = ""


def _days(from_date: str, to_date: str) -> int:
    try:
        a = date.fromisoformat(from_date)
        b = date.fromisoformat(to_date)
        return max(1, (b - a).days + 1)
    except (TypeError, ValueError):
        return 1


async def _approver_ids(requester: dict) -> list[str]:
    role = requester.get("role")
    if role == "staff":
        q = {"role": "office_admin", "approval_status": "approved", "office": requester.get("office")}
    elif role == "office_admin":
        q = {"role": "super_admin"}
    else:  # super_admin requester → notify peer super admins
        q = {"role": "super_admin"}
    docs = await db.users.find(q, {"_id": 0, "id": 1}).to_list(100)
    return [d["id"] for d in docs if d["id"] != requester["id"]]


def _can_approve(approver: dict, req: dict) -> bool:
    if req.get("requester_user_id") == approver["id"]:
        return False  # never self-approve
    rrole = req.get("requester_role")
    arole = approver.get("role")
    if rrole == "staff":
        return arole == "super_admin" or (arole == "office_admin" and approver.get("office") == req.get("office"))
    # office_admin & super_admin requests are approved by super admins
    return arole == "super_admin"


@router.post("", status_code=201)
async def create_leave(payload: LeaveIn, user: dict = Depends(require_edit("leave"))):
    if payload.leave_type not in LEAVE_TYPES:
        raise HTTPException(400, "Invalid leave type")
    if payload.to_date < payload.from_date:
        raise HTTPException(400, "End date can't be before start date")
    now = now_iso()
    doc = {
        "id": gen_id(),
        "requester_user_id": user["id"],
        "requester_name": user.get("name") or user.get("email"),
        "requester_role": user.get("role"),
        "office": user.get("office"),
        "leave_type": payload.leave_type,
        "from_date": payload.from_date,
        "to_date": payload.to_date,
        "days": _days(payload.from_date, payload.to_date),
        "reason": (payload.reason or "").strip(),
        "status": "pending",
        "approver_user_id": None,
        "approver_name": None,
        "decided_at": None,
        "decision_note": "",
        "created_at": now,
        "updated_at": now,
    }
    await db.leave_requests.insert_one(doc)
    doc.pop("_id", None)
    approvers = await _approver_ids(user)
    if approvers:
        await notify_users(
            approvers,
            type="leave_request",
            title="New leave request",
            message=f"{doc['requester_name']} · {payload.leave_type.title()} · {payload.from_date} → {payload.to_date}",
            link="/leave",
            actor_user_id=user["id"],
            metadata={"leave_id": doc["id"]},
        )
    return doc


@router.get("")
async def list_leave(
    box: Literal["mine", "inbox"] = "mine",
    user: dict = Depends(get_current_user),
):
    if user.get("role") not in ("super_admin", "office_admin", "staff"):
        raise HTTPException(403, "Not allowed")
    if box == "mine":
        q = {"requester_user_id": user["id"]}
    else:  # inbox — requests I can act on
        role = user.get("role")
        if role == "office_admin":
            q = {"requester_role": "staff", "office": user.get("office")}
        elif role == "super_admin":
            q = {"requester_role": {"$in": ["office_admin", "super_admin"]}, "requester_user_id": {"$ne": user["id"]}}
        else:
            return []  # staff have no approval inbox
    docs = await db.leave_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.get("/stats")
async def leave_stats(user: dict = Depends(get_current_user)):
    mine = await db.leave_requests.find({"requester_user_id": user["id"]}, {"_id": 0, "status": 1}).to_list(1000)
    pending_mine = sum(1 for d in mine if d.get("status") == "pending")
    pending_inbox = 0
    role = user.get("role")
    if role in ("office_admin", "super_admin"):
        if role == "office_admin":
            iq = {"requester_role": "staff", "office": user.get("office"), "status": "pending"}
        else:
            iq = {"requester_role": {"$in": ["office_admin", "super_admin"]}, "requester_user_id": {"$ne": user["id"]}, "status": "pending"}
        pending_inbox = await db.leave_requests.count_documents(iq)
    return {"pending_mine": pending_mine, "pending_inbox": pending_inbox, "total_mine": len(mine)}


@router.patch("/{leave_id}")
async def decide_leave(leave_id: str, payload: LeaveDecision, user: dict = Depends(require_edit("leave"))):
    req = await db.leave_requests.find_one({"id": leave_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Leave request not found")
    if req.get("status") != "pending":
        raise HTTPException(400, "This request has already been decided")
    if not _can_approve(user, req):
        raise HTTPException(403, "You can't decide this leave request")
    now = now_iso()
    await db.leave_requests.update_one(
        {"id": leave_id},
        {"$set": {
            "status": payload.status,
            "approver_user_id": user["id"],
            "approver_name": user.get("name") or user.get("email"),
            "decided_at": now,
            "decision_note": (payload.note or "").strip(),
            "updated_at": now,
        }},
    )
    await notify_users(
        [req["requester_user_id"]],
        type="leave_decision",
        title=f"Leave {payload.status}",
        message=f"{req['leave_type'].title()} {req['from_date']} → {req['to_date']} was {payload.status} by {user.get('name')}",
        link="/leave",
        actor_user_id=user["id"],
        metadata={"leave_id": leave_id},
    )
    return await db.leave_requests.find_one({"id": leave_id}, {"_id": 0})


@router.delete("/{leave_id}")
async def cancel_leave(leave_id: str, user: dict = Depends(require_edit("leave"))):
    """Requester cancels their own still-pending request."""
    req = await db.leave_requests.find_one({"id": leave_id}, {"_id": 0, "requester_user_id": 1, "status": 1})
    if not req:
        raise HTTPException(404, "Leave request not found")
    if req.get("requester_user_id") != user["id"]:
        raise HTTPException(403, "You can only cancel your own request")
    if req.get("status") != "pending":
        raise HTTPException(400, "Only pending requests can be cancelled")
    await db.leave_requests.delete_one({"id": leave_id})
    return {"ok": True}
