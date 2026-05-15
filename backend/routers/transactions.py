"""Transaction CRUD with filters."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_lib import get_current_user, gen_id, now_iso
from models import TransactionIn

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("")
async def list_transactions(
    user: dict = Depends(get_current_user),
    type: Optional[str] = None,
    account_id: Optional[str] = None,
    category_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 200,
):
    q: dict = {"user_id": user["id"]}
    if type:
        q["type"] = type
    if account_id:
        q["account_id"] = account_id
    if category_id:
        q["category_id"] = category_id
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    return await db.transactions.find(q, {"_id": 0}).sort("date", -1).limit(limit).to_list(limit)


@router.post("")
async def create_transaction(payload: TransactionIn, user: dict = Depends(get_current_user)):
    doc = {"id": gen_id(), "user_id": user["id"], "created_at": now_iso(), **payload.model_dump()}
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/{tx_id}")
async def update_transaction(tx_id: str, payload: TransactionIn, user: dict = Depends(get_current_user)):
    res = await db.transactions.update_one(
        {"id": tx_id, "user_id": user["id"]},
        {"$set": payload.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Transaction not found")
    return await db.transactions.find_one({"id": tx_id}, {"_id": 0})


@router.delete("/{tx_id}")
async def delete_transaction(tx_id: str, user: dict = Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": tx_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Transaction not found")
    return {"ok": True}
