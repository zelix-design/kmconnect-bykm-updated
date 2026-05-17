"""Client CRUD."""
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit
from models import ClientIn

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("")
async def list_clients(user: dict = Depends(get_current_user)):
    """Office admin sees their own clients. Super admin sees clients from ALL users
    (so staff onboarded by office admins are visible too). Each returned doc gets a
    `_creator_name` / `_creator_office` for UI attribution."""
    if user.get("role") == "super_admin":
        docs = await db.clients.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        if docs:
            user_ids = list({d.get("user_id") for d in docs if d.get("user_id")})
            users = await db.users.find(
                {"id": {"$in": user_ids}},
                {"_id": 0, "id": 1, "name": 1, "office": 1, "role": 1},
            ).to_list(500)
            umap = {u["id"]: u for u in users}
            for d in docs:
                u = umap.get(d.get("user_id"))
                if u and u.get("role") == "office_admin":
                    d["_creator_name"] = u.get("name")
                    d["_creator_office"] = u.get("office")
        return docs
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
