"""Leads CRM router.

Super Admin / Office Admin / Staff manage sales leads (prospective students):
manual + CSV bulk upload, status pipeline, assignment, scheduled follow-ups
with reminders, and a "Missed leads" view.

Scope rules:
  - super_admin  → every lead
  - office_admin → leads in their office
  - staff        → leads assigned to them
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit
from routers.notifications import notify_users

router = APIRouter(prefix="/api/leads", tags=["leads"])

LEAD_STATUSES = ("new", "contacted", "interested", "follow_up", "converted", "lost")
LEAD_SOURCES = ("walk_in", "referral", "social", "website", "csv", "other")
OPEN_STATUSES = ("new", "contacted", "interested", "follow_up")

LeadStatus = str
LeadSource = str


class LeadIn(BaseModel):
    name: str = Field(min_length=1)
    phone: Optional[str] = ""
    email: Optional[str] = ""
    course: Optional[str] = ""
    place: Optional[str] = ""
    source: str = "other"
    status: str = "new"
    assigned_to_user_id: Optional[str] = None
    next_follow_up: Optional[str] = None  # ISO datetime (UTC) or null
    notes: Optional[str] = ""


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    course: Optional[str] = None
    place: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    next_follow_up: Optional[str] = None
    notes: Optional[str] = None


class FollowUpIn(BaseModel):
    at: str  # scheduled ISO datetime (UTC)
    note: Optional[str] = ""
    status: Optional[str] = None  # optionally move the lead's status


# ---------- helpers ----------
def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None


def _scope_filter(user: dict) -> dict:
    role = user.get("role")
    if role == "super_admin":
        return {}
    if role == "office_admin":
        return {"office": user.get("office")}
    if role == "staff":
        return {"assigned_to_user_id": user["id"]}
    return {"id": "__none__"}  # deny everyone else


def _is_missed(lead: dict, now: datetime) -> bool:
    if lead.get("status") not in OPEN_STATUSES:
        return False
    dt = _parse_dt(lead.get("next_follow_up"))
    return bool(dt and dt < now)


async def _validate_assignee(assignee_id: str, office: Optional[str], require_office: bool) -> dict:
    assignee = await db.users.find_one(
        {"id": assignee_id}, {"_id": 0, "id": 1, "name": 1, "role": 1, "office": 1}
    )
    if not assignee or assignee.get("role") not in ("staff", "office_admin"):
        raise HTTPException(400, "Assignee must be a staff member or office admin")
    if require_office and assignee.get("office") != office:
        raise HTTPException(400, "Assignee must belong to your office")
    return assignee


def _public(lead: dict) -> dict:
    lead.pop("_id", None)
    return lead


# ---------- list / stats ----------
@router.get("")
async def list_leads(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    source: Optional[str] = None,
    q: Optional[str] = None,
    view: Optional[str] = None,  # "missed" | "today" | None
):
    if user.get("role") not in ("super_admin", "office_admin", "staff"):
        raise HTTPException(403, "Not allowed")
    query = _scope_filter(user)
    if status and status in LEAD_STATUSES:
        query["status"] = status
    if assigned_to:
        query["assigned_to_user_id"] = assigned_to
    if source and source in LEAD_SOURCES:
        query["source"] = source
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"name": rx}, {"phone": rx}, {"email": rx}, {"course": rx}, {"place": rx}]
    docs = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)

    now = datetime.now(timezone.utc)
    for d in docs:
        d["is_missed"] = _is_missed(d, now)
    if view == "missed":
        docs = [d for d in docs if d["is_missed"]]

    # Enrich assignee names for the UI (single round-trip)
    ids = list({d.get("assigned_to_user_id") for d in docs if d.get("assigned_to_user_id")})
    if ids:
        users = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        umap = {u["id"]: u.get("name") for u in users}
        for d in docs:
            d["assigned_to_name"] = umap.get(d.get("assigned_to_user_id"))
    return docs


@router.get("/stats")
async def lead_stats(user: dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "office_admin", "staff"):
        raise HTTPException(403, "Not allowed")
    docs = await db.leads.find(_scope_filter(user), {"_id": 0, "status": 1, "next_follow_up": 1}).to_list(5000)
    now = datetime.now(timezone.utc)
    by_status = {s: 0 for s in LEAD_STATUSES}
    missed = 0
    for d in docs:
        st = d.get("status")
        if st in by_status:
            by_status[st] += 1
        if _is_missed(d, now):
            missed += 1
    return {"total": len(docs), "by_status": by_status, "missed": missed}


# ---------- create / update / delete ----------
@router.post("", status_code=201)
async def create_lead(payload: LeadIn, user: dict = Depends(require_edit("leads"))):
    role = user.get("role")
    assigned_to = payload.assigned_to_user_id
    office: Optional[str] = None

    if role == "staff":
        assigned_to = user["id"]
        office = user.get("office")
    elif role == "office_admin":
        office = user.get("office")
        if assigned_to:
            await _validate_assignee(assigned_to, office, require_office=True)
        else:
            assigned_to = user["id"]
    else:  # super_admin
        if assigned_to:
            assignee = await _validate_assignee(assigned_to, None, require_office=False)
            office = assignee.get("office")

    if payload.status not in LEAD_STATUSES:
        raise HTTPException(400, "Invalid status")
    src = payload.source if payload.source in LEAD_SOURCES else "other"

    doc = {
        "id": gen_id(),
        "name": payload.name.strip(),
        "phone": (payload.phone or "").strip(),
        "email": (payload.email or "").strip(),
        "course": (payload.course or "").strip(),
        "place": (payload.place or "").strip(),
        "source": src,
        "status": payload.status,
        "assigned_to_user_id": assigned_to,
        "office": office,
        "next_follow_up": payload.next_follow_up or None,
        "notes": (payload.notes or "").strip(),
        "follow_ups": [],
        "created_by_user_id": user["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.leads.insert_one(doc)
    await _notify_assignment(doc, actor=user)
    return _public(doc)


@router.patch("/{lead_id}")
async def update_lead(lead_id: str, payload: LeadUpdate, user: dict = Depends(require_edit("leads"))):
    lead = await db.leads.find_one({**_scope_filter(user), "id": lead_id})
    if not lead:
        raise HTTPException(404, "Lead not found")
    data = payload.model_dump(exclude_unset=True)
    patch: dict = {}
    for k in ("name", "phone", "email", "course", "place", "notes"):
        if k in data and data[k] is not None:
            patch[k] = str(data[k]).strip()
    if "status" in data and data["status"]:
        if data["status"] not in LEAD_STATUSES:
            raise HTTPException(400, "Invalid status")
        patch["status"] = data["status"]
    if "source" in data and data["source"]:
        patch["source"] = data["source"] if data["source"] in LEAD_SOURCES else "other"
    if "next_follow_up" in data:
        patch["next_follow_up"] = data["next_follow_up"] or None
        patch["follow_up_reminded_for"] = None  # re-arm the reminder
    new_assignee = None
    if "assigned_to_user_id" in data and data["assigned_to_user_id"] != lead.get("assigned_to_user_id"):
        if user.get("role") == "staff":
            raise HTTPException(403, "Staff cannot reassign leads")
        if data["assigned_to_user_id"]:
            require_office = user.get("role") == "office_admin"
            assignee = await _validate_assignee(
                data["assigned_to_user_id"], user.get("office"), require_office
            )
            patch["assigned_to_user_id"] = assignee["id"]
            if user.get("role") == "super_admin":
                patch["office"] = assignee.get("office")
            new_assignee = assignee["id"]
        else:
            patch["assigned_to_user_id"] = None
    patch["updated_at"] = now_iso()
    await db.leads.update_one({"id": lead_id}, {"$set": patch})
    fresh = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if new_assignee:
        await _notify_assignment(fresh, actor=user)
    return fresh


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_edit("leads"))):
    lead = await db.leads.find_one({**_scope_filter(user), "id": lead_id})
    if not lead:
        raise HTTPException(404, "Lead not found")
    await db.leads.delete_one({"id": lead_id})
    return {"ok": True}


# ---------- follow-ups ----------
@router.post("/{lead_id}/followups", status_code=201)
async def add_followup(lead_id: str, payload: FollowUpIn, user: dict = Depends(require_edit("leads"))):
    lead = await db.leads.find_one({**_scope_filter(user), "id": lead_id})
    if not lead:
        raise HTTPException(404, "Lead not found")
    entry = {
        "id": gen_id(),
        "at": payload.at,
        "note": (payload.note or "").strip(),
        "created_by_user_id": user["id"],
        "created_by_name": user.get("name"),
        "created_at": now_iso(),
    }
    patch: dict = {
        "next_follow_up": payload.at or None,
        "follow_up_reminded_for": None,
        "last_followup_at": now_iso(),
        "updated_at": now_iso(),
    }
    if payload.status and payload.status in LEAD_STATUSES:
        patch["status"] = payload.status
    elif lead.get("status") == "new":
        patch["status"] = "contacted"
    await db.leads.update_one(
        {"id": lead_id},
        {"$push": {"follow_ups": entry}, "$set": patch},
    )
    fresh = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    # Tell the assignee a follow-up was scheduled (if someone else scheduled it)
    assignee_id = fresh.get("assigned_to_user_id")
    if assignee_id and assignee_id != user["id"]:
        await notify_users(
            [assignee_id],
            type="lead_followup",
            title="Follow-up scheduled",
            message=f"{fresh.get('name')} · {(payload.at or '')[:16].replace('T', ' ')}",
            link="/leads",
            actor_user_id=user["id"],
            metadata={"lead_id": lead_id},
        )
    return fresh


async def _notify_assignment(lead: dict, actor: dict) -> None:
    assignee_id = lead.get("assigned_to_user_id")
    if not assignee_id or assignee_id == actor.get("id"):
        return
    await notify_users(
        [assignee_id],
        type="lead_assigned",
        title="New lead assigned to you",
        message=f"{lead.get('name')}{' · ' + lead.get('course') if lead.get('course') else ''}",
        link="/leads",
        actor_user_id=actor.get("id"),
        metadata={"lead_id": lead.get("id")},
    )


# ---------- CSV bulk upload ----------
@router.get("/template", response_class=PlainTextResponse)
async def csv_template(user: dict = Depends(get_current_user)) -> str:
    if user.get("role") not in ("super_admin", "office_admin", "staff"):
        raise HTTPException(403, "Not allowed")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "phone", "email", "course", "place", "source", "notes"])
    w.writerow(["Aravind Kumar", "9876543210", "aravind@example.com", "B.Tech CSE", "Bangalore", "walk_in", "Walked in, interested in CSE"])
    w.writerow(["Priya Nair", "9988776655", "", "B.Sc Nursing", "Kochi", "referral", ""])
    return buf.getvalue()


@router.post("/bulk", status_code=201)
async def bulk_upload(
    file: UploadFile = File(...),
    assigned_to_user_id: Optional[str] = Form(None),
    user: dict = Depends(require_edit("leads")),
) -> dict:
    """Bulk-add leads from a CSV with header name,phone,email,course,place,source,notes.
    Leads are assigned to the uploader by default, or to a chosen assignee
    (must be in the uploader's office for office admins)."""
    role = user.get("role")
    # Resolve the assignee for all rows
    assignee_id = user["id"]
    office = user.get("office")
    if role == "staff":
        assignee_id = user["id"]
        office = user.get("office")
    elif role == "office_admin":
        office = user.get("office")
        if assigned_to_user_id:
            await _validate_assignee(assigned_to_user_id, office, require_office=True)
            assignee_id = assigned_to_user_id
    else:  # super_admin
        if assigned_to_user_id:
            a = await _validate_assignee(assigned_to_user_id, None, require_office=False)
            assignee_id = a["id"]
            office = a.get("office")
        else:
            office = None  # super admin without assignee → unassigned/global

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Only .csv files are supported")
    try:
        text = (await file.read()).decode("utf-8-sig")
    except UnicodeDecodeError:
        text = (await file.read()).decode("latin-1", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(400, "CSV is empty")
    norm = {(h or "").strip().lower(): h for h in reader.fieldnames}
    name_h = norm.get("name")
    if not name_h:
        raise HTTPException(400, "CSV must include a 'name' column")

    def cell(row, key):
        h = norm.get(key)
        return str(row.get(h) or "").strip() if h else ""

    created: list[dict] = []
    skipped_rows: list[int] = []
    now = now_iso()
    for idx, row in enumerate(reader, start=2):
        name = str(row.get(name_h) or "").strip()
        if not name:
            skipped_rows.append(idx)
            continue
        src = cell(row, "source").lower()
        created.append({
            "id": gen_id(),
            "name": name,
            "phone": cell(row, "phone"),
            "email": cell(row, "email"),
            "course": cell(row, "course"),
            "place": cell(row, "place"),
            "source": src if src in LEAD_SOURCES else "csv",
            "status": "new",
            "assigned_to_user_id": assignee_id,
            "office": office,
            "next_follow_up": None,
            "notes": cell(row, "notes"),
            "follow_ups": [],
            "created_by_user_id": user["id"],
            "created_at": now,
            "updated_at": now,
        })

    if created:
        await db.leads.insert_many([dict(d) for d in created])
    return {
        "created_count": len(created),
        "skipped_blank_rows": skipped_rows,
        "created_sample": [c["name"] for c in created[:10]],
    }


# ---------- background reminder sweep ----------
async def sweep_due_followups() -> int:
    """Find open leads whose next_follow_up is due (<= now) and not yet
    reminded for that value, then notify the assignee. Idempotent per
    follow-up value. Returns the number of reminders sent."""
    now = datetime.now(timezone.utc)
    cursor = db.leads.find(
        {
            "status": {"$in": list(OPEN_STATUSES)},
            "next_follow_up": {"$ne": None},
            "assigned_to_user_id": {"$ne": None},
        },
        {"_id": 0, "id": 1, "name": 1, "next_follow_up": 1, "assigned_to_user_id": 1, "follow_up_reminded_for": 1},
    )
    sent = 0
    async for lead in cursor:
        nfu = lead.get("next_follow_up")
        if lead.get("follow_up_reminded_for") == nfu:
            continue
        dt = _parse_dt(nfu)
        if not dt or dt > now:
            continue
        await notify_users(
            [lead["assigned_to_user_id"]],
            type="lead_followup_due",
            title="Follow-up due",
            message=f"{lead.get('name')} — follow up now",
            link="/leads",
            metadata={"lead_id": lead["id"]},
        )
        await db.leads.update_one({"id": lead["id"]}, {"$set": {"follow_up_reminded_for": nfu}})
        sent += 1
    return sent
