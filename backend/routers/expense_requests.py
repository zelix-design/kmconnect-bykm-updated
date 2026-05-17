"""Expense / salary requests — Office Admin submits, Super Admin approves.
Approving an expense request auto-creates a real expense transaction on the
requester's books, debiting the chosen account."""
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit
from models import ExpenseRequestIn, ExpenseRequestApproval, ExpenseRequestRejection

router = APIRouter(prefix="/api/expense-requests", tags=["expense-requests"])


@router.get("")
async def list_requests(user: dict = Depends(get_current_user), status: str | None = None):
    """Office admins see only their own requests; super admins see all."""
    q: dict = {}
    if user.get("role") == "super_admin":
        # all requests, optionally filtered by status
        pass
    else:
        q["requested_by_user_id"] = user["id"]
    if status:
        q["status"] = status
    docs = await db.expense_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with requester name / office for super admin UI
    if user.get("role") == "super_admin" and docs:
        user_ids = list({d["requested_by_user_id"] for d in docs})
        users = await db.users.find(
            {"id": {"$in": user_ids}},
            {"_id": 0, "id": 1, "name": 1, "office": 1, "email": 1},
        ).to_list(500)
        u_map = {u["id"]: u for u in users}
        for d in docs:
            u = u_map.get(d["requested_by_user_id"], {})
            d["requested_by_name"] = u.get("name")
            d["requested_by_email"] = u.get("email")
            d["requested_by_office"] = u.get("office")
    return docs


@router.post("")
async def create_request(payload: ExpenseRequestIn, user: dict = Depends(require_edit("expense_requests"))):
    if user.get("role") != "office_admin":
        raise HTTPException(status_code=403, detail="Only office admins can submit expense requests")
    doc = {
        "id": gen_id(),
        "requested_by_user_id": user["id"],
        "requester_office": user.get("office"),
        "status": "pending",
        "created_at": now_iso(),
        **payload.model_dump(),
    }
    await db.expense_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/{req_id}")
async def cancel_request(req_id: str, user: dict = Depends(get_current_user)):
    """Office admin can cancel their own *pending* request."""
    req = await db.expense_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    is_super = user.get("role") == "super_admin"
    if not is_super and req.get("requested_by_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your request")
    if not is_super and req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be cancelled")
    await db.expense_requests.delete_one({"id": req_id})
    return {"ok": True}


@router.post("/{req_id}/approve")
async def approve_request(req_id: str, payload: ExpenseRequestApproval, user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    req = await db.expense_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Already actioned")

    # Verify the chosen account belongs to the requester
    account = await db.accounts.find_one({"id": payload.account_id, "user_id": req["requested_by_user_id"]})
    if not account:
        raise HTTPException(status_code=400, detail="Account does not belong to the requester")

    # Create the real expense transaction on the requester's books
    tx_id = gen_id()
    description = req.get("description") or ("Salary" if req.get("kind") == "salary" else "Office expense")
    tx_doc = {
        "id": tx_id,
        "user_id": req["requested_by_user_id"],
        "type": "expense",
        "amount": float(req["amount"]),
        "account_id": payload.account_id,
        "category_id": req.get("category_id"),
        "date": req["date"],
        "description": f"[Approved request] {description}",
        "client_id": None,
        "linked_expense_request_id": req_id,
        "created_at": now_iso(),
    }
    await db.transactions.insert_one(tx_doc)

    patch = {
        "status": "approved",
        "approved_by_user_id": user["id"],
        "approved_at": now_iso(),
        "approved_account_id": payload.account_id,
        "linked_transaction_id": tx_id,
    }
    if payload.note:
        patch["decision_note"] = payload.note
    await db.expense_requests.update_one({"id": req_id}, {"$set": patch})
    fresh = await db.expense_requests.find_one({"id": req_id}, {"_id": 0})
    return fresh


@router.post("/{req_id}/reject")
async def reject_request(req_id: str, payload: ExpenseRequestRejection, user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    req = await db.expense_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Already actioned")
    patch = {
        "status": "rejected",
        "approved_by_user_id": user["id"],
        "approved_at": now_iso(),
    }
    if payload.note:
        patch["decision_note"] = payload.note
    await db.expense_requests.update_one({"id": req_id}, {"$set": patch})
    fresh = await db.expense_requests.find_one({"id": req_id}, {"_id": 0})
    return fresh
