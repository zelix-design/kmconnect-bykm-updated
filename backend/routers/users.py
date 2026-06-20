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


@router.get("/me/ledger")
async def my_ledger(user: dict = Depends(get_current_user)):
    """Combined credit/debit ledger for a linked sub-agent / associate
    consultant ``user`` account. Aggregates every Service-Charge (and other)
    invoice + every transaction the office has booked against their
    ``linked_client_id``. The page surfaces this list with totals.

    Returns:
        {
          "client_id":   <str | null>,
          "client_name": <str>,
          "totals": {
            "credits": <float>,     # sum of income transactions (money received)
            "debits":  <float>,     # sum of expense transactions (money paid out)
            "invoices_total": <float>,
            "net":     <float>,     # credits - debits + invoices_total
          },
          "entries": [             # combined chronological list, newest first
            {"kind": "invoice" | "credit" | "debit",
             "id": str, "date": str, "label": str, "amount": float,
             "invoice_number": str | null, "invoice_type": str | null}
          ]
        }

    Non-linked accounts (super/office admin or unlinked user) get an empty
    payload with totals=0 so the UI can render gracefully.
    """
    linked_id = user.get("linked_client_id")
    linked_name = user.get("linked_client_name") or ""
    empty = {
        "client_id": None,
        "client_name": "",
        "totals": {"credits": 0.0, "debits": 0.0, "invoices_total": 0.0, "net": 0.0},
        "entries": [],
    }
    if not linked_id:
        return empty

    # Invoices the office issued to this client (SC + any other type).
    invoices = await db.invoices.find(
        {"client_id": linked_id},
        {
            "_id": 0, "id": 1, "invoice_number": 1, "invoice_type": 1,
            "issue_date": 1, "total": 1, "status": 1,
        },
    ).to_list(500)

    # Transactions the office booked against this client. Skip auto-mirrored
    # ones (invoice line-item expense mirror or SC-payment income mirror) so
    # the invoice itself isn't double-counted. The fields can be missing OR
    # explicitly stored as null on legacy docs — both excluded below.
    raw_txs = await db.transactions.find(
        {"client_id": linked_id},
        {
            "_id": 0, "id": 1, "type": 1, "amount": 1, "date": 1,
            "description": 1, "created_at": 1,
            "linked_invoice_id": 1, "linked_sc_payment_invoice_id": 1,
        },
    ).to_list(2000)
    txs = [
        t for t in raw_txs
        if not t.get("linked_invoice_id")
        and not t.get("linked_sc_payment_invoice_id")
    ]

    entries: list[dict] = []
    invoices_total = 0.0
    for inv in invoices:
        amount = float(inv.get("total") or 0)
        invoices_total += amount
        inv_type = inv.get("invoice_type") or "invoice"
        label = (
            f"Service Charge · #{inv.get('invoice_number') or inv.get('id')}"
            if inv_type == "service_charge"
            else f"Invoice · #{inv.get('invoice_number') or inv.get('id')}"
        )
        entries.append({
            "kind": "invoice",
            "id": inv.get("id"),
            "date": inv.get("issue_date"),
            "label": label,
            "amount": round(amount, 2),
            "invoice_number": inv.get("invoice_number"),
            "invoice_type": inv_type,
            "status": inv.get("status"),
        })

    credits = 0.0
    debits = 0.0
    for tx in txs:
        amount = float(tx.get("amount") or 0)
        is_income = tx.get("type") == "income"
        if is_income:
            credits += amount
        else:
            debits += amount
        entries.append({
            "kind": "credit" if is_income else "debit",
            "id": tx.get("id"),
            "date": tx.get("date") or tx.get("created_at"),
            "label": tx.get("description") or ("Credit" if is_income else "Debit"),
            "amount": round(amount, 2),
            "invoice_number": None,
            "invoice_type": None,
        })

    # Newest first; fall back to created_at when date is missing.
    entries.sort(key=lambda r: str(r.get("date") or ""), reverse=True)

    net = round(credits - debits + invoices_total, 2)
    return {
        "client_id": linked_id,
        "client_name": linked_name,
        "totals": {
            "credits": round(credits, 2),
            "debits": round(debits, 2),
            "invoices_total": round(invoices_total, 2),
            "net": net,
        },
        "entries": entries,
    }


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
