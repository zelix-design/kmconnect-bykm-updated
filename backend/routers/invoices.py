"""Invoice CRUD with auto-linked expense transactions + open-credit lookups."""
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import OperationFailure

from db import client, db
from auth_lib import get_current_user, gen_id, now_iso
from models import InvoiceIn

router = APIRouter(prefix="/api/invoices", tags=["invoices"])
log = logging.getLogger(__name__)


# Map preset particular descriptions to default category names
PARTICULAR_TO_CATEGORY = {
    "car rent": "Cab Exp",
    "fuel expense": "Fuel Exp",
    "cab expense": "Cab Exp",
    "toll": "Toll",
    "food": "Food",
    "driver salary": "Salaries",
}


def _compute_totals(items: List[dict], tax_rate: float, credit_amount: float = 0.0) -> dict:
    subtotal = sum(it["quantity"] * it["unit_price"] for it in items)
    tax_amount = round(subtotal * (tax_rate / 100.0), 2)
    total = round(subtotal + tax_amount - (credit_amount or 0.0), 2)
    return {"subtotal": round(subtotal, 2), "tax_amount": tax_amount, "total": total}


async def _sync_invoice_expense_transactions(user_id: str, invoice: dict) -> None:
    """Delete prior linked expense transactions and re-create them per particulars.
    Uses a Mongo session/transaction when supported (replica set); falls back to a
    best-effort delete-then-insert on standalone MongoDB."""
    invoice_id = invoice["id"]

    # Build the new tx docs first (so we don't delete if nothing valid to insert).
    auto_log = bool(invoice.get("auto_log_expenses", True))
    new_docs: List[dict] = []

    if auto_log:
        items = invoice.get("items") or []
        if items:
            account_id = invoice.get("expense_account_id")
            if not account_id:
                first_account = await db.accounts.find_one({"user_id": user_id}, {"_id": 0})
                if first_account:
                    account_id = first_account["id"]
            if account_id:
                cats = await db.categories.find(
                    {"user_id": user_id, "type": "expense"}, {"_id": 0}
                ).to_list(500)
                by_name = {c["name"].lower(): c["id"] for c in cats}

                def resolve_category(description: str) -> Optional[str]:
                    d = (description or "").strip().lower()
                    if d.startswith("other:") or d == "other":
                        return by_name.get("other")
                    if d in by_name:
                        return by_name[d]
                    mapped = PARTICULAR_TO_CATEGORY.get(d)
                    if mapped:
                        return by_name.get(mapped.lower())
                    return None

                for it in items:
                    amount = (it.get("quantity") or 1) * (it.get("unit_price") or 0)
                    if amount <= 0:
                        continue
                    desc = it.get("description") or "Expense"
                    new_docs.append({
                        "id": gen_id(),
                        "user_id": user_id,
                        "created_at": now_iso(),
                        "type": "expense",
                        "amount": round(amount, 2),
                        "account_id": account_id,
                        "category_id": resolve_category(desc),
                        "date": invoice.get("issue_date"),
                        "description": f"{desc} · Invoice {invoice.get('invoice_number')}",
                        "client_id": invoice.get("client_id"),
                        "linked_invoice_id": invoice_id,
                    })

    # Atomic sync with fallback for standalone MongoDB.
    try:
        async with await client.start_session() as session:
            async with session.start_transaction():
                await db.transactions.delete_many(
                    {"user_id": user_id, "linked_invoice_id": invoice_id},
                    session=session,
                )
                if new_docs:
                    await db.transactions.insert_many(new_docs, session=session)
    except OperationFailure as e:
        # MongoDB without replica set rejects transactions — degrade gracefully.
        log.warning("Transaction unsupported, syncing non-atomically: %s", e)
        await db.transactions.delete_many(
            {"user_id": user_id, "linked_invoice_id": invoice_id}
        )
        if new_docs:
            await db.transactions.insert_many(new_docs)


@router.get("/open-credits")
async def open_credits(
    user: dict = Depends(get_current_user),
    client_id: Optional[str] = None,
):
    """Return campus-visit invoices with their pending balance.

    pending_amount = invoice.total minus the sum of credit_amount on
    service-charge invoices that linked back to this campus visit.
    """
    user_id = user["id"]
    q = {
        "user_id": user_id,
        "$or": [
            {"invoice_type": "campus_visit"},
            {"invoice_type": {"$exists": False}},
        ],
    }
    if client_id:
        q["client_id"] = client_id
    visits = await db.invoices.find(q, {"_id": 0}).sort("issue_date", -1).to_list(500)

    # Aggregate credit already drawn against each visit by service-charge invoices.
    used_pipeline = [
        {"$match": {
            "user_id": user_id,
            "invoice_type": "service_charge",
            "linked_visit_invoice_id": {"$ne": None},
        }},
        {"$group": {"_id": "$linked_visit_invoice_id", "used": {"$sum": "$credit_amount"}}},
    ]
    used = {row["_id"]: round(row["used"], 2)
            async for row in db.invoices.aggregate(used_pipeline)}

    out = []
    for v in visits:
        total = v.get("total", 0) or 0
        drawn = used.get(v["id"], 0)
        remaining = round(total - drawn, 2)
        out.append({
            "id": v["id"],
            "invoice_number": v.get("invoice_number"),
            "issue_date": v.get("issue_date"),
            "client_id": v.get("client_id"),
            "student_name": v.get("student_name"),
            "campus_visit_no": v.get("campus_visit_no"),
            "total": round(total, 2),
            "used_credit": drawn,
            "remaining_credit": remaining,
        })
    return out


@router.get("")
async def list_invoices(user: dict = Depends(get_current_user)):
    return await db.invoices.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("")
async def create_invoice(payload: InvoiceIn, user: dict = Depends(get_current_user)):
    items = [i.model_dump() for i in payload.items]
    totals = _compute_totals(items, payload.tax_rate, payload.credit_amount)
    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "created_at": now_iso(),
        **payload.model_dump(),
        **totals,
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    await _sync_invoice_expense_transactions(user["id"], doc)
    return doc


@router.patch("/{invoice_id}")
async def update_invoice(invoice_id: str, payload: InvoiceIn, user: dict = Depends(get_current_user)):
    items = [i.model_dump() for i in payload.items]
    totals = _compute_totals(items, payload.tax_rate, payload.credit_amount)
    update = {**payload.model_dump(), **totals}
    res = await db.invoices.update_one(
        {"id": invoice_id, "user_id": user["id"]},
        {"$set": update},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Invoice not found")
    fresh = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    await _sync_invoice_expense_transactions(user["id"], fresh)
    return fresh


@router.patch("/{invoice_id}/status")
async def set_invoice_status(invoice_id: str, body: dict, user: dict = Depends(get_current_user)):
    status = body.get("status")
    if status not in {"draft", "sent", "paid", "overdue"}:
        raise HTTPException(400, "Invalid status")
    res = await db.invoices.update_one(
        {"id": invoice_id, "user_id": user["id"]},
        {"$set": {"status": status}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Invoice not found")
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    res = await db.invoices.delete_one({"id": invoice_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Invoice not found")
    await db.transactions.delete_many(
        {"user_id": user["id"], "linked_invoice_id": invoice_id}
    )
    return {"ok": True}
