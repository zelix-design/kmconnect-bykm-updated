"""Client CRUD."""
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit
from models import ClientIn

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("")
async def list_clients(user: dict = Depends(get_current_user)):
    return await db.clients.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("")
async def create_client(payload: ClientIn, user: dict = Depends(require_edit("clients"))):
    doc = {"id": gen_id(), "user_id": user["id"], "created_at": now_iso(), **payload.model_dump()}
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/{client_id}")
async def update_client(client_id: str, payload: ClientIn, user: dict = Depends(require_edit("clients"))):
    res = await db.clients.update_one(
        {"id": client_id, "user_id": user["id"]},
        {"$set": payload.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Client not found")
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@router.delete("/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(require_edit("clients"))):
    res = await db.clients.delete_one({"id": client_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Client not found")
    return {"ok": True}
