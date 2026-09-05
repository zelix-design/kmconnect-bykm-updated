"""Staff attendance (GPS check-in/out) + monthly payroll.

Working day: 10:00–19:00, 10-min grace (check-in after 10:10 = late).
Payroll: monthly fixed salary; deduction = (salary / working_days) * absent_days.
Working days = all days of the month except Sundays. Half-day counts as 0.5.
"""
from __future__ import annotations

import calendar
from datetime import datetime, timezone, date
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

# Org runs on India Standard Time — the shift window + day bucket are all IST.
TZ = ZoneInfo("Asia/Kolkata")
OFFICE_START = (10, 0)          # 10:00 AM IST
OFFICE_END = (19, 0)            # 7:00 PM IST
GRACE_MIN = 10
HALF_DAY_SECONDS = 4 * 3600     # < 4h worked = half day


def _is_admin(u: dict) -> bool:
    return u.get("role") in ("super_admin", "office_admin")


def _require_admin(u: dict):
    if not _is_admin(u):
        raise HTTPException(403, "Admins only")


def _today() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%d")


def _month_days(month: str) -> tuple[int, int, int]:
    y, m = int(month[:4]), int(month[5:7])
    ndays = calendar.monthrange(y, m)[1]
    working = sum(1 for d in range(1, ndays + 1) if date(y, m, d).weekday() != 6)  # skip Sun
    return y, m, working


class CheckInIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


def _public(rec: dict) -> dict:
    rec.pop("_id", None)
    return rec


@router.get("/today")
async def my_today(user: dict = Depends(get_current_user)):
    rec = await db.attendance.find_one({"user_id": user["id"], "date": _today()}, {"_id": 0})
    return {"record": rec}


@router.post("/check-in")
async def check_in(body: CheckInIn, user: dict = Depends(require_edit("attendance"))):
    today = _today()
    existing = await db.attendance.find_one({"user_id": user["id"], "date": today})
    if existing and existing.get("check_in"):
        raise HTTPException(400, "Already checked in today")
    now = datetime.now(timezone.utc)
    local = now.astimezone(TZ)
    late_cutoff = local.replace(hour=OFFICE_START[0], minute=OFFICE_START[1] + GRACE_MIN, second=0, microsecond=0)
    status = "late" if local > late_cutoff else "present"
    rec = {
        "id": gen_id(),
        "user_id": user["id"],
        "user_name": user.get("name"),
        "office": user.get("office"),
        "date": today,
        "check_in": now.isoformat(),
        "check_out": None,
        "check_in_lat": body.lat,
        "check_in_lng": body.lng,
        "status": status,
        "work_seconds": 0,
        "created_at": now_iso(),
    }
    await db.attendance.update_one({"user_id": user["id"], "date": today}, {"$set": rec}, upsert=True)
    return {"record": _public(rec)}


@router.post("/check-out")
async def check_out(user: dict = Depends(require_edit("attendance"))):
    today = _today()
    rec = await db.attendance.find_one({"user_id": user["id"], "date": today})
    if not rec or not rec.get("check_in"):
        raise HTTPException(400, "You haven't checked in today")
    if rec.get("check_out"):
        raise HTTPException(400, "Already checked out today")
    now = datetime.now(timezone.utc)
    ci = datetime.fromisoformat(rec["check_in"])
    work = max(0, int((now - ci).total_seconds()))
    status = rec.get("status") or "present"
    if work < HALF_DAY_SECONDS:
        status = "half_day"
    await db.attendance.update_one(
        {"id": rec["id"]},
        {"$set": {"check_out": now.isoformat(), "work_seconds": work, "status": status}},
    )
    rec.update({"check_out": now.isoformat(), "work_seconds": work, "status": status})
    return {"record": _public(rec)}


@router.get("/me")
async def my_month(month: str, user: dict = Depends(get_current_user)):
    rows = await db.attendance.find(
        {"user_id": user["id"], "date": {"$regex": f"^{month}"}}, {"_id": 0}
    ).sort("date", 1).to_list(40)
    return {"records": rows}


@router.get("")
async def list_attendance(month: str, office: Optional[str] = None,
                          user_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    _require_admin(user)
    q: dict = {"date": {"$regex": f"^{month}"}}
    if user.get("role") == "office_admin":
        q["office"] = user.get("office")
    elif office and office != "all":
        q["office"] = office
    if user_id:
        q["user_id"] = user_id
    rows = await db.attendance.find(q, {"_id": 0}).sort("date", -1).to_list(5000)
    return {"records": rows}


class AdjustIn(BaseModel):
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: Optional[str] = None


@router.patch("/{rec_id}")
async def adjust(rec_id: str, body: AdjustIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    rec = await db.attendance.find_one({"id": rec_id})
    if not rec:
        raise HTTPException(404, "Not found")
    if user.get("role") == "office_admin" and rec.get("office") != user.get("office"):
        raise HTTPException(403, "Out of scope")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.check_in and body.check_out:
        try:
            patch["work_seconds"] = max(0, int(
                (datetime.fromisoformat(body.check_out) - datetime.fromisoformat(body.check_in)).total_seconds()))
        except Exception:
            pass
    await db.attendance.update_one({"id": rec_id}, {"$set": patch})
    return {"ok": True}


class SalaryIn(BaseModel):
    monthly_salary: float


@router.put("/salary/{uid}")
async def set_salary(uid: str, body: SalaryIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    target = await db.users.find_one({"id": uid}, {"_id": 0, "office": 1})
    if not target:
        raise HTTPException(404, "User not found")
    if user.get("role") == "office_admin" and target.get("office") != user.get("office"):
        raise HTTPException(403, "Out of scope")
    await db.staff_salaries.update_one(
        {"user_id": uid},
        {"$set": {"user_id": uid, "monthly_salary": float(body.monthly_salary),
                  "office": target.get("office"), "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


async def _salary_map(office_scope: Optional[str]) -> dict:
    q = {"office": office_scope} if office_scope else {}
    rows = await db.staff_salaries.find(q, {"_id": 0, "user_id": 1, "monthly_salary": 1}).to_list(5000)
    return {r["user_id"]: r.get("monthly_salary", 0) for r in rows}


def _working_days_set(y: int, m: int) -> set[str]:
    ndays = calendar.monthrange(y, m)[1]
    return {f"{y:04d}-{m:02d}-{d:02d}" for d in range(1, ndays + 1) if date(y, m, d).weekday() != 6}


async def _paid_leave_dates(month: str, office_scope: Optional[str], working_set: set[str]) -> dict:
    """user_id -> set of working-day dates covered by APPROVED, non-unpaid leave in `month`."""
    y, m = int(month[:4]), int(month[5:7])
    start = f"{y:04d}-{m:02d}-01"
    end = f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"
    q: dict = {"status": "approved", "leave_type": {"$ne": "unpaid"}}
    if office_scope:
        q["office"] = office_scope
    docs = await db.leave_requests.find(
        q, {"_id": 0, "requester_user_id": 1, "from_date": 1, "to_date": 1}
    ).to_list(5000)
    out: dict = {}
    for d in docs:
        fd, td = d.get("from_date", ""), d.get("to_date", "")
        if not fd or not td or td < start or fd > end:
            continue
        bucket = out.setdefault(d["requester_user_id"], set())
        for ds in working_set:
            if fd <= ds <= td:
                bucket.add(ds)
    return out


async def _payroll_rows(month: str, office_scope: Optional[str]) -> list[dict]:
    y, m, working_days = _month_days(month)
    working_set = _working_days_set(y, m)
    uq: dict = {"role": {"$in": ["staff", "office_admin"]}, "deleted_at": {"$in": [None, ""]}}
    if office_scope:
        uq["office"] = office_scope
    staff = await db.users.find(uq, {"_id": 0, "id": 1, "name": 1, "office": 1, "role": 1}).to_list(5000)
    salaries = await _salary_map(office_scope)
    att = await db.attendance.find(
        {"date": {"$regex": f"^{month}"}, **({"office": office_scope} if office_scope else {})},
        {"_id": 0, "user_id": 1, "date": 1, "status": 1},
    ).to_list(20000)
    leave_map = await _paid_leave_dates(month, office_scope, working_set)
    present: dict = {}
    half: dict = {}
    for a in att:
        uid, ds, st = a["user_id"], a.get("date"), a.get("status")
        if st in ("present", "late"):
            present.setdefault(uid, set()).add(ds)
        elif st == "half_day":
            half.setdefault(uid, set()).add(ds)
    out = []
    for s in staff:
        uid = s["id"]
        pset = present.get(uid, set())
        hset = half.get(uid, set()) - pset
        lset = leave_map.get(uid, set()) - pset - hset  # paid leave not already worked
        present_days, half_days, leave_days = len(pset), len(hset), len(lset)
        present_eq = present_days + 0.5 * half_days + leave_days
        absent = max(0, working_days - present_eq)
        salary = float(salaries.get(uid, 0) or 0)
        per_day = round(salary / working_days, 2) if working_days else 0
        deduction = round(per_day * absent, 2)
        out.append({
            "user_id": uid, "name": s.get("name"), "office": s.get("office"), "role": s.get("role"),
            "monthly_salary": salary, "working_days": working_days,
            "present_days": present_days, "half_days": half_days, "leave_days": leave_days,
            "paid_days": round(present_eq, 1), "absent_days": round(absent, 1),
            "per_day": per_day, "deduction": deduction,
            "net_pay": round(salary - deduction, 2),
        })
    return out


@router.get("/payroll")
async def payroll(month: str, office: Optional[str] = None, user: dict = Depends(get_current_user)):
    _require_admin(user)
    scope = user.get("office") if user.get("role") == "office_admin" else (office if office and office != "all" else None)
    return {"month": month, "rows": await _payroll_rows(month, scope)}


@router.get("/payslip/{uid}")
async def payslip(uid: str, month: str, user: dict = Depends(get_current_user)):
    if not _is_admin(user) and user["id"] != uid:
        raise HTTPException(403, "Not allowed")
    target = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "office": 1})
    if not target:
        raise HTTPException(404, "User not found")
    if user.get("role") == "office_admin" and target.get("office") != user.get("office"):
        raise HTTPException(403, "Out of scope")
    rows = await _payroll_rows(month, target.get("office"))
    row = next((r for r in rows if r["user_id"] == uid), None)
    if not row:
        raise HTTPException(404, "No payroll for this staff/month")
    return {"month": month, "staff": target, "payslip": row}
