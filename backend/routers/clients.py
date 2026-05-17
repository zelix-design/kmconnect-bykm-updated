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



def _client_filter(client_id: str, user: dict) -> dict:
    q: dict = {"id": client_id}
    if user.get("role") != "super_admin":
        q["user_id"] = user["id"]
    return q


@router.get("/{client_id}/detail")
async def client_detail(client_id: str, user: dict = Depends(get_current_user)):
    """Per-client summary: students they admitted (reference name match, case+space
    insensitive), SC earned, transactions (income/expense), and — for staff only —
    incentive earned/paid/pending (3+ admissions/month rule).
    Super admin can look up any client across users. Office admin scoped to own."""
    from datetime import datetime, timezone

    client = await db.clients.find_one(_client_filter(client_id, user), {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    owner_id = client["user_id"]
    name_norm = (client.get("name") or "").strip().lower()
    is_staff = client.get("client_type") == "staff"

    # Students that reference this client (scoped to the same owner_id — staff/clients
    # only matter to admissions on the same office_admin's books).
    students = await db.students.find({"user_id": owner_id}, {"_id": 0}).to_list(2000)
    matched = [s for s in students if (s.get("reference") or "").strip().lower() == name_norm]

    # Incentive math (staff-only) — replicate the OfficeDashboard monthly rule
    def adm_dt(s):
        v = s.get("enrollment_date") or s.get("created_at") or ""
        try:
            return datetime.strptime(v[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc) if len(v) >= 10 else None
        except Exception:
            return None

    month_counts: dict[str, int] = {}
    for s in matched:
        dt = adm_dt(s)
        if dt:
            key = f"{dt.year:04d}-{dt.month:02d}"
            month_counts[key] = month_counts.get(key, 0) + 1

    incentive_amount = float(client.get("eligible_incentive") or 0)
    eligible_count = 0
    incentive_paid = 0.0
    enriched_students = []
    for s in matched:
        dt = adm_dt(s)
        key = f"{dt.year:04d}-{dt.month:02d}" if dt else None
        is_eligible_month = is_staff and key and month_counts.get(key, 0) >= 3
        paid = bool(s.get("incentive_paid"))
        if is_eligible_month:
            eligible_count += 1
            if paid:
                incentive_paid += incentive_amount
        enriched_students.append({
            "id": s["id"],
            "name": s.get("name"),
            "course": s.get("course"),
            "college": s.get("college"),
            "status": s.get("status"),
            "enrollment_date": s.get("enrollment_date") or s.get("created_at"),
            "sc_out_fixed": float(s.get("sc_out_fixed") or 0),
            "incentive_eligible": bool(is_eligible_month),
            "incentive_paid": paid,
            "incentive_amount": incentive_amount if is_eligible_month else 0.0,
        })
    enriched_students.sort(key=lambda x: x.get("enrollment_date") or "", reverse=True)

    sc_earned = round(sum(s["sc_out_fixed"] for s in enriched_students), 2)
    incentive_earned = round(eligible_count * incentive_amount, 2)
    incentive_pending = round(incentive_earned - incentive_paid, 2)

    # Transactions linked to this client (debit/credit)
    txs = await db.transactions.find(
        {"user_id": owner_id, "client_id": client_id}, {"_id": 0}
    ).sort("date", -1).to_list(500)
    total_income = round(sum(float(t.get("amount") or 0) for t in txs if t.get("type") == "income"), 2)
    total_expense = round(sum(float(t.get("amount") or 0) for t in txs if t.get("type") == "expense"), 2)

    return {
        "client": client,
        "is_staff": is_staff,
        "students": enriched_students,
        "transactions": txs,
        "totals": {
            "students_count": len(enriched_students),
            "sc_earned": sc_earned,
            "incentive_earned": incentive_earned,
            "incentive_paid": round(incentive_paid, 2),
            "incentive_pending": incentive_pending,
            "eligible_count": eligible_count,
            "total_income": total_income,
            "total_expense": total_expense,
            "net": round(total_income - total_expense, 2),
        },
    }
