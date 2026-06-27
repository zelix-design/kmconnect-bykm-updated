"""Unified staff management.

Treats a staff member as ONE entity that bundles:
  - the staff PROFILE  (clients collection, client_type='staff' — photo,
    employee_id, DOB, place, address, incentive)
  - the staff LOGIN    (users collection, role='staff' — email + password)

Used by the Office Admin 'Staff' page where the previously-separate
"Employees" (profiles) and "Staff" (login accounts) pages are merged.

Scope:
  - office_admin → staff in their own office only
  - super_admin  → all staff (optionally filtered by ?office=)
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from db import db
from auth_lib import get_current_user, hash_password, gen_id, now_iso
from models import STAFF_DEFAULT_PERMISSIONS, OfficeCode
from routers.clients import _next_employee_id

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _norm(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def _require_manager(user: dict) -> None:
    if user.get("role") not in ("super_admin", "office_admin"):
        raise HTTPException(403, "Not allowed")


def _client_scope_filter(client_id: str, user: dict) -> dict:
    if user.get("role") == "super_admin":
        return {"id": client_id, "client_type": "staff"}
    off = user.get("office")
    return {
        "id": client_id,
        "client_type": "staff",
        "$or": [{"user_id": user["id"]}, {"home_office": off}, {"office": off}, {"home_office": "ALL"}],
    }


def _row_from_client(c: dict, lu: Optional[dict]) -> dict:
    return {
        "kind": "full" if lu else "profile_only",
        "client_id": c["id"],
        "login_user_id": (lu or {}).get("id"),
        "name": c.get("name"),
        "email": (lu or {}).get("email") or c.get("email") or "",
        "office": c.get("office") or (lu or {}).get("office"),
        "photo_url": c.get("photo_url") or "",
        "employee_id": c.get("employee_id") or "",
        "date_of_birth": c.get("date_of_birth") or "",
        "place": c.get("place") or "",
        "address": c.get("address") or "",
        "eligible_incentive": c.get("eligible_incentive"),
        "has_login": bool(lu),
    }


def _row_from_login(u: dict) -> dict:
    return {
        "kind": "login_only",
        "client_id": None,
        "login_user_id": u["id"],
        "name": u.get("name"),
        "email": u.get("email") or "",
        "office": u.get("office"),
        "photo_url": "",
        "employee_id": "",
        "date_of_birth": "",
        "place": "",
        "address": "",
        "eligible_incentive": None,
        "has_login": True,
    }


@router.get("/members")
async def list_members(user: dict = Depends(get_current_user), office: Optional[str] = None):
    """Merged staff roster — staff profile rows joined with their login account
    (by explicit link or name match), plus any login-only / profile-only rows."""
    _require_manager(user)
    if user.get("role") == "super_admin":
        cq: dict = {"client_type": "staff"}
        uq: dict = {"role": "staff"}
        if office:
            cq["$or"] = [{"office": office}, {"home_office": office}]
            uq["office"] = office
    else:
        off = user.get("office")
        cq = {"client_type": "staff", "$or": [
            {"user_id": user["id"]}, {"home_office": off}, {"office": off}, {"home_office": "ALL"}]}
        uq = {"role": "staff", "office": off}

    clients = await db.clients.find(cq, {"_id": 0}).sort("created_at", -1).to_list(1000)
    logins = await db.users.find(uq, {"_id": 0, "password_hash": 0}).to_list(1000)

    login_by_id = {u["id"]: u for u in logins}
    login_by_name: dict = {}
    for u in logins:
        login_by_name.setdefault(_norm(u.get("name")), u)

    used: set = set()
    rows: list[dict] = []
    for c in clients:
        lu = None
        lid = c.get("login_user_id")
        if lid and lid in login_by_id:
            lu = login_by_id[lid]
        else:
            lu = login_by_name.get(_norm(c.get("name")))
        if lu:
            used.add(lu["id"])
        rows.append(_row_from_client(c, lu))

    for u in logins:
        if u["id"] in used:
            continue
        rows.append(_row_from_login(u))

    rows.sort(key=lambda r: _norm(r.get("name")))
    return rows


class StaffMemberIn(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)
    office: Optional[OfficeCode] = None  # required for super_admin; forced for office_admin
    photo_url: Optional[str] = None
    employee_id: Optional[str] = None
    date_of_birth: Optional[str] = None
    place: Optional[str] = None
    address: Optional[str] = None
    eligible_incentive: Optional[float] = None


@router.post("/members", status_code=201)
async def create_member(payload: StaffMemberIn, user: dict = Depends(get_current_user)):
    """Create a staff member = login account + profile in one shot."""
    _require_manager(user)
    office = user.get("office") if user.get("role") == "office_admin" else payload.office
    if not office:
        raise HTTPException(400, "Office is required")
    email = str(payload.email).lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "A user with this email already exists")

    name = payload.name.strip()
    uid = gen_id()
    await db.users.insert_one({
        "id": uid,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": name,
        "business_name": "",
        "currency": "INR",
        "role": "staff",
        "office": office,
        "approval_status": "approved",
        "created_at": now_iso(),
        "created_by_admin": user["id"],
        "permissions": dict(STAFF_DEFAULT_PERMISSIONS),
    })

    emp = (payload.employee_id or "").strip() or await _next_employee_id(office)
    cid = gen_id()
    await db.clients.insert_one({
        "id": cid,
        "user_id": user["id"],
        "created_at": now_iso(),
        "name": name,
        "client_type": "staff",
        "email": email,
        "phone": "",
        "company": "",
        "office": office,
        "home_office": office,
        "eligible_incentive": payload.eligible_incentive,
        "date_of_birth": payload.date_of_birth or None,
        "employee_id": emp,
        "address": payload.address or "",
        "place": payload.place or "",
        "photo_url": payload.photo_url or "",
        "login_user_id": uid,
    })
    return {"ok": True, "client_id": cid, "login_user_id": uid, "employee_id": emp}


class StaffMemberUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    photo_url: Optional[str] = None
    employee_id: Optional[str] = None
    date_of_birth: Optional[str] = None
    place: Optional[str] = None
    address: Optional[str] = None
    eligible_incentive: Optional[float] = None


@router.patch("/members/{client_id}")
async def update_member(client_id: str, payload: StaffMemberUpdate, user: dict = Depends(get_current_user)):
    """Update a staff profile; name/email changes sync to the linked login."""
    _require_manager(user)
    c = await db.clients.find_one(_client_scope_filter(client_id, user), {"_id": 0})
    if not c:
        raise HTTPException(404, "Staff member not found")
    data = payload.model_dump(exclude_unset=True)
    patch: dict = {}
    for k in ("name", "photo_url", "employee_id", "place", "address"):
        if k in data:
            patch[k] = (data[k] or "").strip() if isinstance(data[k], str) else data[k]
    if "date_of_birth" in data:
        patch["date_of_birth"] = data["date_of_birth"] or None
    if "eligible_incentive" in data:
        patch["eligible_incentive"] = data["eligible_incentive"]
    if "email" in data and data["email"]:
        patch["email"] = str(data["email"]).lower()
    if patch:
        await db.clients.update_one({"id": client_id}, {"$set": patch})

    lu_id = c.get("login_user_id")
    if lu_id:
        usync: dict = {}
        if "name" in data and data["name"]:
            usync["name"] = data["name"].strip()
        if "email" in data and data["email"]:
            new_email = str(data["email"]).lower()
            clash = await db.users.find_one({"email": new_email, "id": {"$ne": lu_id}})
            if clash:
                raise HTTPException(409, "Another account already uses this email")
            usync["email"] = new_email
        if usync:
            await db.users.update_one({"id": lu_id}, {"$set": usync})
    return {"ok": True, "client_id": client_id}


@router.delete("/members/{client_id}")
async def delete_member(client_id: str, user: dict = Depends(get_current_user)):
    """Delete the staff profile AND its linked login account."""
    _require_manager(user)
    c = await db.clients.find_one(_client_scope_filter(client_id, user), {"_id": 0})
    if not c:
        raise HTTPException(404, "Staff member not found")
    await db.clients.delete_one({"id": client_id})
    lu_id = c.get("login_user_id")
    if lu_id:
        # Office admins may only remove staff logins; guard via role filter.
        await db.users.delete_one({"id": lu_id, "role": "staff"})
    return {"ok": True}


class AddLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


@router.post("/members/{client_id}/login", status_code=201)
async def add_login_to_profile(client_id: str, payload: AddLoginIn, user: dict = Depends(get_current_user)):
    """Attach a login account to an existing profile-only staff record."""
    _require_manager(user)
    c = await db.clients.find_one(_client_scope_filter(client_id, user), {"_id": 0})
    if not c:
        raise HTTPException(404, "Staff member not found")
    if c.get("login_user_id"):
        existing = await db.users.find_one({"id": c["login_user_id"]}, {"_id": 0, "id": 1})
        if existing:
            raise HTTPException(409, "This staff member already has a login")
    email = str(payload.email).lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "A user with this email already exists")
    office = c.get("office") or (user.get("office") if user.get("role") == "office_admin" else None)
    if not office:
        raise HTTPException(400, "This profile has no office set")
    uid = gen_id()
    await db.users.insert_one({
        "id": uid,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": (c.get("name") or "").strip(),
        "business_name": "",
        "currency": "INR",
        "role": "staff",
        "office": office,
        "approval_status": "approved",
        "created_at": now_iso(),
        "created_by_admin": user["id"],
        "permissions": dict(STAFF_DEFAULT_PERMISSIONS),
    })
    await db.clients.update_one({"id": client_id}, {"$set": {"login_user_id": uid, "email": email}})
    return {"ok": True, "login_user_id": uid}
