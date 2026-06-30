"""Campaigns router — group leads into campaigns and distribute them to staff.

Super Admin / Office Admin only. A campaign tags a batch of leads; admins
populate it (manual add or CSV upload, both unassigned by default) and then
distribute its leads across employees by equal / count / percentage methods.

Scope:
  - super_admin  → every campaign; must pick a target office per campaign.
  - office_admin → campaigns in their own office only.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import UpdateOne

from db import db
from auth_lib import get_current_user, gen_id, now_iso
from models import OfficeCode
from lib.lead_distribution import distribute
from routers.leads import LEAD_SOURCES
from routers.notifications import notify_users

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])

TAG_TYPES = ("course", "place", "source")
DISTRIBUTE_METHODS = ("equal", "count", "percentage")


class CampaignIn(BaseModel):
    name: str = Field(min_length=1)
    description: Optional[str] = ""
    tag_type: Optional[str] = None      # course | place | source | None
    tag_value: Optional[str] = ""
    office: Optional[OfficeCode] = None  # required for super_admin


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tag_type: Optional[str] = None
    tag_value: Optional[str] = None


class LeadRowIn(BaseModel):
    name: str = Field(min_length=1)
    phone: Optional[str] = ""
    email: Optional[str] = ""
    course: Optional[str] = ""
    place: Optional[str] = ""
    source: Optional[str] = "other"
    notes: Optional[str] = ""


class CampaignLeadsIn(BaseModel):
    leads: List[LeadRowIn]


class DistributeIn(BaseModel):
    method: str
    employee_ids: List[str]
    counts: Optional[Dict[str, int]] = None
    percentages: Optional[Dict[str, float]] = None
    scope: str = "unassigned"  # unassigned | all


# ---------- helpers ----------
async def campaign_manager(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("super_admin", "office_admin"):
        raise HTTPException(403, "Not allowed")
    return user


def _scope(user: dict) -> dict:
    if user.get("role") == "super_admin":
        return {}
    return {"office": user.get("office")}


async def _get_campaign(campaign_id: str, user: dict) -> dict:
    c = await db.campaigns.find_one({**_scope(user), "id": campaign_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campaign not found")
    return c


async def _stats(campaign_id: str) -> dict:
    leads = await db.leads.find(
        {"campaign_id": campaign_id}, {"_id": 0, "status": 1, "assigned_to_user_id": 1}
    ).to_list(50000)
    total = len(leads)
    assigned = sum(1 for l in leads if l.get("assigned_to_user_id"))
    converted = sum(1 for l in leads if l.get("status") == "converted")
    return {"total": total, "assigned": assigned, "unassigned": total - assigned, "converted": converted}


async def _office_employees(office: str) -> List[dict]:
    docs = await db.users.find(
        {"role": {"$in": ["staff", "office_admin"]}, "approval_status": "approved", "office": office},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "office": 1},
    ).sort("name", 1).to_list(2000)
    return docs


# ---------- CRUD ----------
@router.post("", status_code=201)
async def create_campaign(payload: CampaignIn, user: dict = Depends(campaign_manager)):
    role = user.get("role")
    if role == "office_admin":
        office = user.get("office")
    else:
        if not payload.office:
            raise HTTPException(400, "Select a target office for the campaign")
        office = payload.office
    tag_type = payload.tag_type if payload.tag_type in TAG_TYPES else None
    doc = {
        "id": gen_id(),
        "name": payload.name.strip(),
        "description": (payload.description or "").strip(),
        "tag_type": tag_type,
        "tag_value": (payload.tag_value or "").strip() if tag_type else "",
        "office": office,
        "created_by_user_id": user["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.campaigns.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "stats": {"total": 0, "assigned": 0, "unassigned": 0, "converted": 0}}


@router.get("")
async def list_campaigns(user: dict = Depends(campaign_manager)):
    docs = await db.campaigns.find(_scope(user), {"_id": 0}).sort("created_at", -1).to_list(2000)
    for d in docs:
        d["stats"] = await _stats(d["id"])
    return docs


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, user: dict = Depends(campaign_manager)):
    campaign = await _get_campaign(campaign_id, user)
    employees = await _office_employees(campaign["office"])
    # Current per-employee distribution within this campaign.
    leads = await db.leads.find(
        {"campaign_id": campaign_id, "assigned_to_user_id": {"$ne": None}},
        {"_id": 0, "assigned_to_user_id": 1},
    ).to_list(50000)
    name_map = {e["id"]: e["name"] for e in employees}
    counts: dict = {}
    for l in leads:
        eid = l.get("assigned_to_user_id")
        counts[eid] = counts.get(eid, 0) + 1
    distribution = sorted(
        ({"id": eid, "name": name_map.get(eid, "—"), "count": c} for eid, c in counts.items()),
        key=lambda x: -x["count"],
    )
    return {
        "campaign": campaign,
        "stats": await _stats(campaign_id),
        "employees": employees,
        "distribution": distribution,
    }


@router.patch("/{campaign_id}")
async def update_campaign(campaign_id: str, payload: CampaignUpdate, user: dict = Depends(campaign_manager)):
    await _get_campaign(campaign_id, user)
    data = payload.model_dump(exclude_unset=True)
    patch: dict = {}
    if "name" in data and data["name"]:
        patch["name"] = str(data["name"]).strip()
    if "description" in data:
        patch["description"] = str(data["description"] or "").strip()
    if "tag_type" in data:
        tt = data["tag_type"] if data["tag_type"] in TAG_TYPES else None
        patch["tag_type"] = tt
        if tt is None:
            patch["tag_value"] = ""
    if "tag_value" in data:
        patch["tag_value"] = str(data["tag_value"] or "").strip()
    if patch:
        patch["updated_at"] = now_iso()
        await db.campaigns.update_one({"id": campaign_id}, {"$set": patch})
    fresh = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    return {**fresh, "stats": await _stats(campaign_id)}


@router.delete("/{campaign_id}")
async def delete_campaign(campaign_id: str, user: dict = Depends(campaign_manager)):
    await _get_campaign(campaign_id, user)
    # Detach leads (keep them in the pipeline, just drop the campaign tag).
    await db.leads.update_many({"campaign_id": campaign_id}, {"$set": {"campaign_id": None}})
    await db.campaigns.delete_one({"id": campaign_id})
    return {"ok": True}


# ---------- populate ----------
@router.post("/{campaign_id}/leads", status_code=201)
async def add_campaign_leads(campaign_id: str, payload: CampaignLeadsIn, user: dict = Depends(campaign_manager)):
    campaign = await _get_campaign(campaign_id, user)
    now = now_iso()
    docs = []
    for row in payload.leads:
        if not (row.name or "").strip():
            continue
        src = row.source if row.source in LEAD_SOURCES else "other"
        docs.append({
            "id": gen_id(),
            "name": row.name.strip(),
            "phone": (row.phone or "").strip(),
            "email": (row.email or "").strip(),
            "course": (row.course or "").strip(),
            "place": (row.place or "").strip(),
            "source": src,
            "status": "new",
            "assigned_to_user_id": None,
            "office": campaign["office"],
            "campaign_id": campaign_id,
            "next_follow_up": None,
            "notes": (row.notes or "").strip(),
            "follow_ups": [],
            "created_by_user_id": user["id"],
            "created_at": now,
            "updated_at": now,
        })
    if docs:
        await db.leads.insert_many(docs)
    return {"created_count": len(docs), "stats": await _stats(campaign_id)}


# ---------- distribute ----------
@router.post("/{campaign_id}/distribute")
async def distribute_campaign(campaign_id: str, payload: DistributeIn, user: dict = Depends(campaign_manager)):
    campaign = await _get_campaign(campaign_id, user)
    if payload.method not in DISTRIBUTE_METHODS:
        raise HTTPException(400, "Invalid distribution method")

    valid = {e["id"]: e for e in await _office_employees(campaign["office"])}
    emp_ids = [eid for eid in payload.employee_ids if eid in valid]
    if not emp_ids:
        raise HTTPException(400, "Select at least one employee from this office")

    lead_q: dict = {"campaign_id": campaign_id}
    if payload.scope != "all":
        lead_q["$or"] = [{"assigned_to_user_id": None}, {"assigned_to_user_id": {"$exists": False}}]
    leads = await db.leads.find(lead_q, {"_id": 0, "id": 1}).sort("created_at", 1).to_list(50000)
    lead_ids = [l["id"] for l in leads]
    if not lead_ids:
        raise HTTPException(400, "No leads to distribute for the selected scope")

    assignments = distribute(
        lead_ids, payload.method, emp_ids,
        counts=payload.counts, percentages=payload.percentages,
    )
    if not assignments:
        raise HTTPException(400, "Nothing was distributed — check your counts/percentages")

    now = now_iso()
    per_emp: dict = {}
    ops = []
    for lid, eid in assignments:
        ops.append(UpdateOne(
            {"id": lid},
            {"$set": {"assigned_to_user_id": eid, "office": campaign["office"], "updated_at": now}},
        ))
        per_emp[eid] = per_emp.get(eid, 0) + 1
    if ops:
        await db.leads.bulk_write(ops)

    # Notify each employee once with their batch size.
    for eid, cnt in per_emp.items():
        await notify_users(
            [eid],
            type="leads_assigned",
            title=f"{cnt} new lead(s) assigned",
            message=f"From campaign “{campaign['name']}”",
            link="/leads",
            actor_user_id=user["id"],
            metadata={"campaign_id": campaign_id},
        )

    summary = sorted(
        ({"id": eid, "name": valid[eid]["name"], "count": cnt} for eid, cnt in per_emp.items()),
        key=lambda x: -x["count"],
    )
    return {
        "assigned": len(assignments),
        "targeted": len(lead_ids),
        "per_employee": summary,
        "stats": await _stats(campaign_id),
    }
