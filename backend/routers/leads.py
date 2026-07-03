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
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit
from lib.followup_slots import compute_next_slot, SLOT_MINUTES, WORK_START_HOUR, WORK_END_HOUR
from lib.whatsapp import send_visit_scheduled, send_application_link, fmt_dt_ist
from routers.notifications import notify_users, notify_super_admins

router = APIRouter(prefix="/api/leads", tags=["leads"])

LEAD_STATUSES = (
    "new", "not_connected", "interested", "follow_up", "converted",
    "application_submitted", "admission_confirmed", "fee_paid", "completed",
    "not_turned", "lost",
)
LEAD_SOURCES = ("walk_in", "referral", "social", "website", "csv", "other")
OPEN_STATUSES = ("new", "not_connected", "interested", "follow_up")
VISIT_STATUSES = ("scheduled", "completed", "confused", "admitted", "lost")
CONVERTED_STATUSES = ("converted", "application_submitted", "admission_confirmed", "fee_paid", "completed")

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
    lost_reason: Optional[str] = None


class FollowUpIn(BaseModel):
    at: str  # scheduled ISO datetime (UTC)
    note: Optional[str] = ""
    status: Optional[str] = None  # optionally move the lead's status


class VisitIn(BaseModel):
    departure_at: Optional[str] = None  # ISO datetime (UTC)
    arrival_at: Optional[str] = None
    institution: Optional[str] = ""  # campus/college being visited
    travel_mode: Optional[str] = ""
    who_comes: Optional[str] = ""
    drop_point: Optional[str] = ""


class InterestedIn(BaseModel):
    parent_number: Optional[str] = ""
    alternate_number: Optional[str] = ""
    campus_visit_interested: bool = False
    visit: Optional[VisitIn] = None


class VisitUpdate(BaseModel):
    status: Optional[str] = None  # scheduled | confused | admitted | lost
    attending_admin_id: Optional[str] = None  # "" clears the assignment


class ConvertIn(BaseModel):
    city: Optional[str] = ""
    course: Optional[str] = ""
    college: Optional[str] = ""
    send_link: bool = True
    campus_visit_interested: bool = False
    visit: Optional[VisitIn] = None


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


def _referral_link(ref: str) -> str:
    base = (os.environ.get("APPLY_PUBLIC_URL") or "").rstrip("/")
    return f"{base}/ref={ref}" if base else f"/apply?ref={ref}"


def _status_event(from_status, to_status, user: dict, note: str = "") -> dict:
    """One entry in a lead's status_history journey log."""
    return {
        "id": gen_id(),
        "at": now_iso(),
        "from": from_status,
        "to": to_status,
        "by_user_id": user["id"],
        "by_name": user.get("name"),
        "note": note,
    }


async def _notify_visit_admins(lead: dict, title: str, message: str, actor_id: str) -> None:
    """Best-effort notification to super admins + the lead office's admins."""
    try:
        await notify_super_admins(
            type="campus_visit", title=title, message=message,
            link="/leads", actor_user_id=actor_id,
        )
        q: dict = {"role": "office_admin", "approval_status": "approved"}
        if lead.get("office"):
            q["office"] = lead["office"]
        offs = await db.users.find(q, {"_id": 0, "id": 1}).to_list(50)
        if offs:
            await notify_users(
                [o["id"] for o in offs],
                type="campus_visit", title=title, message=message,
                link="/leads", actor_user_id=actor_id,
            )
    except Exception:
        pass


async def _schedule_visit(lead: dict, visit_in: VisitIn, user: dict) -> tuple[dict, dict]:
    """Store a campus visit on the lead, WhatsApp the student, notify admins."""
    now = now_iso()
    doc = {
        "id": gen_id(),
        "status": "scheduled",
        "departure_at": visit_in.departure_at,
        "arrival_at": visit_in.arrival_at,
        "institution": (visit_in.institution or "").strip(),
        "travel_mode": (visit_in.travel_mode or "").strip(),
        "who_comes": (visit_in.who_comes or "").strip(),
        "drop_point": (visit_in.drop_point or "").strip(),
        "attending_admin_id": None,
        "attending_admin_name": None,
        "created_by_user_id": user["id"],
        "created_by_name": user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    wa = await send_visit_scheduled(
        name=lead.get("name") or "",
        phone=lead.get("phone") or "",
        institution=doc["institution"] or "KM Foundation partner campus",
        departure_at=visit_in.departure_at,
        arrival_at=visit_in.arrival_at,
        travel_mode=doc["travel_mode"],
        drop_point=doc["drop_point"],
    )
    doc["whatsapp_sent"] = bool(wa.get("ok"))
    await db.leads.update_one(
        {"id": lead["id"]},
        {"$set": {"visit": doc, "campus_visit_interested": True, "updated_at": now}},
    )
    await _notify_visit_admins(
        lead,
        "Campus visit scheduled",
        f"{lead.get('name')} · departure {fmt_dt_ist(visit_in.departure_at)}",
        user["id"],
    )
    return doc, wa


# ---------- list / stats ----------
@router.get("")
async def list_leads(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    source: Optional[str] = None,
    campaign_id: Optional[str] = None,
    uncategorized: Optional[bool] = None,
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
    if campaign_id:
        query["campaign_id"] = campaign_id
    if uncategorized:
        query["$and"] = [{"$or": [{"campaign_id": None}, {"campaign_id": {"$exists": False}}]}]
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        or_clause = [{"name": rx}, {"phone": rx}, {"email": rx}, {"course": rx}, {"place": rx}]
        if uncategorized:
            query["$and"].append({"$or": or_clause})
        else:
            query["$or"] = or_clause
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


class AssignCampaignIn(BaseModel):
    campaign_id: Optional[str] = None


@router.post("/{lead_id}/campaign")
async def assign_lead_campaign(
    lead_id: str,
    payload: AssignCampaignIn,
    user: dict = Depends(require_edit("leads")),
):
    """Attach a lead to a campaign (or detach with campaign_id=null).
    Super/Office Admin only; the campaign must be in the caller's scope."""
    if user.get("role") not in ("super_admin", "office_admin"):
        raise HTTPException(403, "Not allowed")
    lead = await db.leads.find_one({**_scope_filter(user), "id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    update = {"updated_at": now_iso()}
    if payload.campaign_id:
        cscope = {} if user["role"] == "super_admin" else {"office": user.get("office")}
        campaign = await db.campaigns.find_one(
            {**cscope, "id": payload.campaign_id}, {"_id": 0, "id": 1, "office": 1}
        )
        if not campaign:
            raise HTTPException(404, "Campaign not found")
        update["campaign_id"] = payload.campaign_id
        update["office"] = campaign["office"]
    else:
        update["campaign_id"] = None
    await db.leads.update_one({"id": lead_id}, {"$set": update})
    fresh = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if fresh.get("assigned_to_user_id"):
        u = await db.users.find_one({"id": fresh["assigned_to_user_id"]}, {"_id": 0, "name": 1})
        fresh["assigned_to_name"] = u.get("name") if u else None
    return fresh


@router.get("/stats")
async def lead_stats(user: dict = Depends(get_current_user), campaign_id: Optional[str] = None, uncategorized: Optional[bool] = None):
    if user.get("role") not in ("super_admin", "office_admin", "staff"):
        raise HTTPException(403, "Not allowed")
    scope = _scope_filter(user)
    if campaign_id:
        scope = {**scope, "campaign_id": campaign_id}
    if uncategorized:
        scope = {**scope, "$or": [{"campaign_id": None}, {"campaign_id": {"$exists": False}}]}
    docs = await db.leads.find(scope, {"_id": 0, "status": 1, "next_follow_up": 1}).to_list(50000)
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


@router.get("/next-followup-slot")
async def next_followup_slot(
    user: dict = Depends(get_current_user),
    exclude_lead_id: Optional[str] = None,
):
    """Compute the next available follow-up slot on the caller's own timeline.

    Slots are 5-minute steps inside a 10:00-19:00 IST working window. Returns
    `is_first=True` when the caller has no future follow-ups booked — the UI
    then lets them pick the time manually; every later one is auto-assigned."""
    if user.get("role") not in ("super_admin", "office_admin", "staff"):
        raise HTTPException(403, "Not allowed")
    now = datetime.now(timezone.utc)
    docs = await db.leads.find(
        {"assigned_to_user_id": user["id"], "next_follow_up": {"$ne": None}},
        {"_id": 0, "id": 1, "next_follow_up": 1},
    ).to_list(5000)
    booked = [
        d["next_follow_up"] for d in docs
        if d.get("next_follow_up") and d.get("id") != exclude_lead_id
    ]
    slot, is_first = compute_next_slot(booked, now)
    return {
        "slot": slot,
        "is_first": is_first,
        "window": {
            "start": f"{WORK_START_HOUR:02d}:00",
            "end": f"{WORK_END_HOUR:02d}:00",
            "step_minutes": SLOT_MINUTES,
        },
    }


LOST_REASONS = ("Admission Taken", "No Response", "Joined Competitor", "Not Eligible", "Other")


def _student_scope_for_analytics(user: dict) -> dict:
    if user.get("role") == "super_admin":
        return {}
    office = user.get("office")
    return {"$or": [{"user_id": user["id"]}, {"home_office": office}, {"home_office": "ALL"}]}


@router.get("/analytics")
async def lead_analytics(user: dict = Depends(get_current_user), office: Optional[str] = None):
    """Aggregated CRM analytics for the Office Admin / Super Admin dashboard:
    KPIs, lead funnel, college- & course-wise admissions, monthly seat trend
    and lost-reason breakdown — all scoped to the caller's office.

    A super admin may pass ?office=KM_BLR to inspect a specific office."""
    if user.get("role") not in ("super_admin", "office_admin"):
        raise HTTPException(403, "Not allowed")
    now = datetime.now(timezone.utc)

    if user.get("role") == "super_admin" and office:
        owner_users = await db.users.find({"office": office}, {"_id": 0, "id": 1}).to_list(1000)
        owner_ids = [u["id"] for u in owner_users]
        lead_scope = {"office": office}
        student_scope = {"$or": [
            {"user_id": {"$in": owner_ids}},
            {"home_office": office},
            {"home_office": "ALL"},
        ]}
    else:
        lead_scope = _scope_filter(user)
        student_scope = _student_scope_for_analytics(user)

    leads = await db.leads.find(
        lead_scope, {"_id": 0, "status": 1, "next_follow_up": 1, "lost_reason": 1}
    ).to_list(20000)
    by_status = {s: 0 for s in LEAD_STATUSES}
    missed = 0
    lost_reasons: dict = {}
    for d in leads:
        st = d.get("status")
        if st in by_status:
            by_status[st] += 1
        if _is_missed(d, now):
            missed += 1
        if st == "lost":
            lr = (d.get("lost_reason") or "").strip() or "Unspecified"
            lost_reasons[lr] = lost_reasons.get(lr, 0) + 1
    total_leads = len(leads)
    converted = sum(by_status[s] for s in CONVERTED_STATUSES)
    lost = by_status["lost"]
    positive = by_status["not_connected"] + by_status["interested"] + by_status["follow_up"]

    students = await db.students.find(
        student_scope,
        {"_id": 0, "status": 1, "college": 1, "course": 1, "enrollment_date": 1, "created_at": 1},
    ).to_list(50000)
    admissions = [s for s in students if s.get("status") != "cancelled"]
    total_admissions = len(admissions)

    college_counts: dict = {}
    course_counts: dict = {}
    monthly: dict = {}
    for s in admissions:
        col = (s.get("college") or "").strip() or "Unknown"
        college_counts[col] = college_counts.get(col, 0) + 1
        crs = (s.get("course") or "").strip() or "Unknown"
        course_counts[crs] = course_counts.get(crs, 0) + 1
        ym = (s.get("enrollment_date") or s.get("created_at") or "")[:7]
        if len(ym) == 7:
            monthly[ym] = monthly.get(ym, 0) + 1

    conv_rate = round(converted / total_leads * 100, 1) if total_leads else 0.0
    college_wise = sorted(
        ({"name": k, "value": v} for k, v in college_counts.items()), key=lambda x: -x["value"]
    )[:8]
    course_wise = sorted(
        ({"name": k, "value": v} for k, v in course_counts.items()), key=lambda x: -x["value"]
    )[:8]
    monthly_trend = [{"month": k, "value": monthly[k]} for k in sorted(monthly.keys())][-12:]
    funnel = [
        {"stage": "Leads", "value": total_leads},
        {"stage": "Interested", "value": by_status["interested"]},
        {"stage": "Converted", "value": converted},
        {"stage": "Completed", "value": by_status["completed"]},
        {"stage": "Lost", "value": lost + by_status["not_turned"]},
    ]
    lost_reasons_list = sorted(
        ({"name": k, "value": v} for k, v in lost_reasons.items()), key=lambda x: -x["value"]
    )

    return {
        "kpis": {
            "total_leads": total_leads,
            "total_admissions": total_admissions,
            "conversion_rate": conv_rate,
            "pending_followups": missed,
            "lost_leads": lost,
        },
        "funnel": funnel,
        "by_status": by_status,
        "college_wise": college_wise,
        "course_wise": course_wise,
        "monthly_trend": monthly_trend,
        "lost_reasons": lost_reasons_list,
    }


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
        # Clear the lost reason if the lead moves out of "lost"
        if data["status"] != "lost":
            patch["lost_reason"] = ""
    if "lost_reason" in data:
        patch["lost_reason"] = (data["lost_reason"] or "").strip()
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
    ops: dict = {"$set": patch}
    if patch.get("status") and patch["status"] != lead.get("status"):
        ops["$push"] = {"status_history": _status_event(lead.get("status"), patch["status"], user)}
    await db.leads.update_one({"id": lead_id}, ops)
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


@router.post("/{lead_id}/convert", status_code=201)
async def convert_lead(lead_id: str, payload: Optional[ConvertIn] = None, user: dict = Depends(require_edit("leads"))):
    """Convert a lead into an inquiry Student, credited to the lead's assignee
    (referrer_user_id). Optionally records city/course/college, WhatsApps the
    referral application link and schedules a campus visit. Idempotent —
    returns the existing student if already converted."""
    lead = await db.leads.find_one({**_scope_filter(user), "id": lead_id})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if lead.get("converted_student_id"):
        return {"ok": True, "student_id": lead["converted_student_id"], "already_converted": True}

    admin = await db.users.find_one({"role": "super_admin"}, {"_id": 0, "id": 1})
    owner_id = (admin or {}).get("id") or user["id"]
    referrer_user_id = lead.get("assigned_to_user_id") or user["id"]
    referrer = await db.users.find_one({"id": referrer_user_id}, {"_id": 0, "name": 1})
    student_id = gen_id()
    now = now_iso()
    note_bits = []
    if lead.get("phone"):
        note_bits.append(f"Phone: {lead['phone']}")
    if lead.get("email"):
        note_bits.append(f"Email: {lead['email']}")
    if lead.get("place"):
        note_bits.append(f"Place: {lead['place']}")
    if payload and payload.city:
        note_bits.append(f"City: {payload.city}")
    student_doc = {
        "id": student_id,
        "user_id": owner_id,
        "created_at": now,
        "name": lead.get("name"),
        "course": ((payload.course if payload else "") or lead.get("course") or ""),
        "college": ((payload.college or "") if payload else ""),
        "reference": (referrer or {}).get("name") or "",
        "referrer_user_id": referrer_user_id,
        "sc_out_fixed": 0.0,
        "status": "inquiry",
        "enrollment_date": now[:10],
        "notes": " · ".join(["Converted from CRM lead"] + note_bits),
        "fees_plan": None,
        "schedules": [],
        "payments": [],
        "application_source": "lead_conversion",
        "lead_id": lead_id,
    }
    await db.students.insert_one(student_doc)
    lead_patch = {"status": "converted", "converted_student_id": student_id, "updated_at": now}
    if payload and (payload.city or payload.course or payload.college):
        lead_patch["conversion_details"] = {
            "city": payload.city or "",
            "course": payload.course or "",
            "college": payload.college or "",
        }
    await db.leads.update_one({"id": lead_id}, {
        "$set": lead_patch,
        "$push": {"status_history": _status_event(lead.get("status"), "converted", user)},
    })

    wa_link = None
    if payload and payload.send_link and lead.get("phone"):
        wa_link = await send_application_link(
            name=lead.get("name") or "",
            phone=lead["phone"],
            course=((payload.course or "") or lead.get("course") or ""),
            college=payload.college or "",
            city=payload.city or "",
            link=_referral_link(referrer_user_id),
        )
    wa_visit = None
    if payload and payload.campus_visit_interested and payload.visit and (
        payload.visit.departure_at or payload.visit.arrival_at
    ):
        _, wa_visit = await _schedule_visit(lead, payload.visit, user)
    try:
        await notify_super_admins(
            type="student_application",
            title="Lead converted to student",
            message=f"{lead.get('name')} · {lead.get('course') or ''}",
            link=f"/students/{student_id}",
            actor_user_id=user["id"],
        )
    except Exception:
        pass
    return {"ok": True, "student_id": student_id, "whatsapp": wa_link, "visit_whatsapp": wa_visit}


# ---------- interested + campus visit ----------
@router.get("/attending-admins")
async def attending_admins(user: dict = Depends(get_current_user)):
    """Super + Office admins who can attend a campus visit."""
    if user.get("role") not in ("super_admin", "office_admin", "staff"):
        raise HTTPException(403, "Not allowed")
    return await db.users.find(
        {"role": {"$in": ["super_admin", "office_admin"]}, "approval_status": "approved"},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "office": 1},
    ).sort("name", 1).to_list(100)


@router.post("/{lead_id}/interested")
async def mark_interested(lead_id: str, payload: InterestedIn, user: dict = Depends(require_edit("leads"))):
    """Mark a lead Interested, capturing parent/alternate numbers and an
    optional campus-visit schedule (WhatsApps the student + notifies admins)."""
    lead = await db.leads.find_one({**_scope_filter(user), "id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    ops: dict = {"$set": {
        "status": "interested",
        "lost_reason": "",
        "parent_number": (payload.parent_number or "").strip(),
        "alternate_number": (payload.alternate_number or "").strip(),
        "campus_visit_interested": bool(payload.campus_visit_interested),
        "updated_at": now_iso(),
    }}
    if lead.get("status") != "interested":
        ops["$push"] = {"status_history": _status_event(lead.get("status"), "interested", user)}
    await db.leads.update_one({"id": lead_id}, ops)
    wa = None
    if payload.campus_visit_interested and payload.visit and (
        payload.visit.departure_at or payload.visit.arrival_at
    ):
        _, wa = await _schedule_visit(lead, payload.visit, user)
    fresh = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return {"lead": fresh, "whatsapp": wa}


@router.patch("/{lead_id}/visit")
async def update_visit(lead_id: str, payload: VisitUpdate, user: dict = Depends(require_edit("leads"))):
    """Assign the attending admin and/or move the visit outcome status."""
    if user.get("role") not in ("super_admin", "office_admin"):
        raise HTTPException(403, "Only super or office admins manage visits")
    lead = await db.leads.find_one({**_scope_filter(user), "id": lead_id}, {"_id": 0})
    if not lead or not lead.get("visit"):
        raise HTTPException(404, "No scheduled visit on this lead")
    sets: dict = {}
    notify_attending = None
    if payload.attending_admin_id is not None:
        if payload.attending_admin_id == "":
            sets["visit.attending_admin_id"] = None
            sets["visit.attending_admin_name"] = None
        else:
            admin = await db.users.find_one(
                {"id": payload.attending_admin_id, "role": {"$in": ["super_admin", "office_admin"]},
                 "approval_status": "approved"},
                {"_id": 0, "id": 1, "name": 1},
            )
            if not admin:
                raise HTTPException(400, "Attending person must be a super or office admin")
            sets["visit.attending_admin_id"] = admin["id"]
            sets["visit.attending_admin_name"] = admin.get("name")
            notify_attending = admin["id"]
    if payload.status:
        if payload.status not in VISIT_STATUSES:
            raise HTTPException(400, "Invalid visit status")
        sets["visit.status"] = payload.status
    if not sets:
        raise HTTPException(400, "Nothing to update")
    sets["visit.updated_at"] = now_iso()
    sets["updated_at"] = now_iso()
    await db.leads.update_one({"id": lead_id}, {"$set": sets})
    fresh = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if notify_attending and notify_attending != user["id"]:
        try:
            await notify_users(
                [notify_attending],
                type="campus_visit",
                title="You're attending a campus visit",
                message=f"{lead.get('name')} · departure {fmt_dt_ist((lead.get('visit') or {}).get('departure_at'))}",
                link=f"/leads?lead={lead_id}",
                actor_user_id=user["id"],
            )
        except Exception:
            pass
    return fresh


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
    push_ops: dict = {"follow_ups": entry}
    if patch.get("status") and patch["status"] != lead.get("status"):
        push_ops["status_history"] = _status_event(lead.get("status"), patch["status"], user, note="via follow-up")
    await db.leads.update_one(
        {"id": lead_id},
        {"$push": push_ops, "$set": patch},
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
            link=f"/leads?lead={lead_id}",
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
        link=f"/leads?lead={lead.get('id')}",
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
    w.writerow(["name", "phone", "email", "course", "place", "source", "notes", "employee"])
    w.writerow(["Aravind Kumar", "9876543210", "aravind@example.com", "B.Tech CSE", "Bangalore", "walk_in", "Walked in, interested in CSE", "Anjali Telecaller"])
    w.writerow(["Priya Nair", "9988776655", "", "B.Sc Nursing", "Kochi", "referral", "", ""])
    return buf.getvalue()


@router.post("/bulk", status_code=201)
async def bulk_upload(
    file: UploadFile = File(...),
    assigned_to_user_id: Optional[str] = Form(None),
    campaign_id: Optional[str] = Form(None),
    user: dict = Depends(require_edit("leads")),
) -> dict:
    """Bulk-add leads from a CSV with header
    name,phone,email,course,place,source,notes,employee.

    Each lead is assigned to the default assignee (the chosen ``assigned_to_user_id``
    or the uploader). When a row's optional ``employee`` cell names a staff member
    or office admin (scoped to the uploader's office for office admins), that row is
    assigned to them instead — unmatched names fall back to the default.

    When ``campaign_id`` is supplied (super/office admin only), rows are tagged to
    that campaign, scoped to its office and left UNASSIGNED by default so they can
    be distributed afterwards; a matching ``employee`` cell still overrides."""
    role = user.get("role")
    # Resolve the default assignee for all rows
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

    # Campaign uploads: tag + scope to the campaign's office, default unassigned.
    if campaign_id:
        if role == "staff":
            raise HTTPException(403, "Staff cannot upload to a campaign")
        cscope = {} if role == "super_admin" else {"office": user.get("office")}
        campaign = await db.campaigns.find_one(
            {**cscope, "id": campaign_id}, {"_id": 0, "id": 1, "office": 1}
        )
        if not campaign:
            raise HTTPException(404, "Campaign not found")
        office = campaign["office"]
        assignee_id = None

    # Per-row employee lookup (office/super admins only) — name → user.
    # Scoped to the campaign's office when uploading to a campaign, otherwise the
    # office admin's own office.
    emp_map: dict = {}
    if role != "staff":
        eq = {"role": {"$in": ["staff", "office_admin"]}, "approval_status": "approved"}
        emp_office = office if campaign_id else (user.get("office") if role == "office_admin" else None)
        if emp_office:
            eq["office"] = emp_office
        emp_docs = await db.users.find(
            eq, {"_id": 0, "id": 1, "name": 1, "office": 1}
        ).to_list(2000)
        for e in emp_docs:
            key = (e.get("name") or "").strip().lower()
            if key:
                emp_map.setdefault(key, []).append(e)

    def resolve_employee(raw):
        key = (raw or "").strip().lower()
        if not key:
            return None  # no employee specified → use default
        matches = emp_map.get(key)
        if matches and len(matches) == 1:
            return matches[0]
        return False  # named but unmatched / ambiguous

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
    unmatched_employees: list[str] = []
    now = now_iso()
    for idx, row in enumerate(reader, start=2):
        name = str(row.get(name_h) or "").strip()
        if not name:
            skipped_rows.append(idx)
            continue
        src = cell(row, "source").lower()
        row_assignee = assignee_id
        row_office = office
        if role != "staff":
            emp_raw = cell(row, "employee") or cell(row, "assigned_to")
            if emp_raw:
                matched = resolve_employee(emp_raw)
                if matched:
                    row_assignee = matched["id"]
                    row_office = matched.get("office")
                else:
                    unmatched_employees.append(emp_raw)
        created.append({
            "id": gen_id(),
            "name": name,
            "phone": cell(row, "phone"),
            "email": cell(row, "email"),
            "course": cell(row, "course"),
            "place": cell(row, "place"),
            "source": src if src in LEAD_SOURCES else "csv",
            "status": "new",
            "assigned_to_user_id": row_assignee,
            "office": row_office,
            "campaign_id": campaign_id,
            "next_follow_up": None,
            "notes": cell(row, "notes"),
            "follow_ups": [],
            "created_by_user_id": user["id"],
            "created_at": now,
            "updated_at": now,
        })

    if created:
        await db.leads.insert_many([dict(d) for d in created])
    # De-dupe unmatched names (case-insensitive) while preserving first spelling.
    seen: set = set()
    unmatched_unique: list[str] = []
    for n in unmatched_employees:
        k = n.strip().lower()
        if k and k not in seen:
            seen.add(k)
            unmatched_unique.append(n.strip())
    return {
        "created_count": len(created),
        "skipped_blank_rows": skipped_rows,
        "created_sample": [c["name"] for c in created[:10]],
        "unmatched_employees": unmatched_unique,
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
