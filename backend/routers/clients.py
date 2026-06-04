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
        _client_filter(client_id, user),
        {"$set": payload.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Client not found")
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@router.delete("/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(require_edit("clients"))):
    res = await db.clients.delete_one(_client_filter(client_id, user))
    if res.deleted_count == 0:
        raise HTTPException(404, "Client not found")
    return {"ok": True}



def _client_filter(client_id: str, user: dict) -> dict:
    q: dict = {"id": client_id}
    if user.get("role") != "super_admin":
        q["user_id"] = user["id"]
    return q


@router.get("/{client_id}/detail")
async def client_detail(client_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Per-client summary: students they admitted, SC earned, transactions
    (income/expense), and — for staff only — incentive earned/paid/pending
    using the 3-admissions-per-month rule.

    Super admin can look up any client across users. Office admin scoped to own.
    """
    from lib.incentive_math import (
        filter_admissions_by_reference,
        compute_monthly_admission_counts,
        enrich_student_with_incentive,
        build_client_detail_totals,
    )

    client = await db.clients.find_one(_client_filter(client_id, user), {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    owner_id = client["user_id"]
    is_staff = client.get("client_type") == "staff"
    incentive_amount = float(client.get("eligible_incentive") or 0)

    # Students whose `reference` matches this client (same owner_id only —
    # admissions only matter to the office_admin who created them).
    students_raw = await db.students.find({"user_id": owner_id}, {"_id": 0}).to_list(2000)
    matched = filter_admissions_by_reference(students_raw, client.get("name"))
    month_counts = compute_monthly_admission_counts(matched)

    enriched_students = [
        enrich_student_with_incentive(
            s,
            is_staff=is_staff,
            incentive_amount=incentive_amount,
            month_counts=month_counts,
        )
        for s in matched
    ]
    enriched_students.sort(key=lambda x: x.get("enrollment_date") or "", reverse=True)

    txs = await db.transactions.find(
        {"user_id": owner_id, "client_id": client_id}, {"_id": 0}
    ).sort("date", -1).to_list(500)

    return {
        "client": client,
        "is_staff": is_staff,
        "students": enriched_students,
        "transactions": txs,
        "totals": build_client_detail_totals(
            enriched_students, txs, incentive_amount=incentive_amount
        ),
    }
