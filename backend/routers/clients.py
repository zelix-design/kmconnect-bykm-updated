"""Client CRUD."""
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit
from models import ClientIn

router = APIRouter(prefix="/api/clients", tags=["clients"])


def _office_visibility_clause(user: dict) -> dict:
    """For office_admin, build a Mongo filter that matches records the admin
    is allowed to see: records owned by them OR scoped to their office OR
    shared with ALL via home_office."""
    return {
        "$or": [
            {"user_id": user["id"]},
            {"home_office": user.get("office")},
            {"home_office": "ALL"},
        ]
    }


@router.get("")
async def list_clients(user: dict = Depends(get_current_user)):
    """Office admin sees own clients PLUS clients scoped to their office (or
    shared with ALL) via home_office. Super admin sees clients from ALL users
    (so staff onboarded by office admins are visible too). Each returned doc
    gets a `_creator_name` / `_creator_office` for UI attribution."""
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
    return await db.clients.find(
        _office_visibility_clause(user), {"_id": 0}
    ).sort("created_at", -1).to_list(1000)


@router.post("")
async def create_client(payload: ClientIn, user: dict = Depends(require_edit("clients"))):
    data = payload.model_dump()
    if user.get("role") == "office_admin":
        data["home_office"] = user.get("office")
    doc = {"id": gen_id(), "user_id": user["id"], "created_at": now_iso(), **data}
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/{client_id}")
async def update_client(client_id: str, payload: ClientIn, user: dict = Depends(require_edit("clients"))):
    data = payload.model_dump()
    if user.get("role") == "office_admin":
        data["home_office"] = user.get("office")
    elif "home_office" not in payload.model_fields_set:
        existing = await db.clients.find_one(
            {"id": client_id}, {"_id": 0, "home_office": 1}
        )
        if existing is not None:
            data["home_office"] = existing.get("home_office")
    res = await db.clients.update_one(
        _client_filter(client_id, user),
        {"$set": data},
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
    if user.get("role") == "super_admin":
        return {"id": client_id}
    return {
        "id": client_id,
        **_office_visibility_clause(user),
    }


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

    # Students whose `reference` matches this client.
    # Scope so that all admissions visible to the staff's office surface here
    # (an office-admin staff's referrals can be created by ANY admin of the
    # same office, including super_admin records with home_office matching).
    office_code = client.get("home_office") or client.get("office")
    if user.get("role") == "super_admin":
        # Super admin sees every student across the database.
        student_scope: dict = {}
    else:
        scope_or: list = [{"user_id": owner_id}]
        if office_code:
            scope_or.append({"home_office": office_code})
        scope_or.append({"home_office": "ALL"})
        student_scope = {"$or": scope_or}
    students_raw = await db.students.find(student_scope, {"_id": 0}).to_list(2000)
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

    if user.get("role") == "super_admin":
        tx_query: dict = {"client_id": client_id}
    else:
        # Same office-scoping logic for tx linked to this client.
        owner_ids = {owner_id}
        if office_code:
            office_admins = await db.users.find(
                {"role": "office_admin", "office": office_code},
                {"_id": 0, "id": 1},
            ).to_list(100)
            owner_ids.update(u["id"] for u in office_admins)
        tx_query = {"user_id": {"$in": list(owner_ids)}, "client_id": client_id}
    txs = await db.transactions.find(
        tx_query, {"_id": 0}
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
