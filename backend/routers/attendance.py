"""Staff attendance (GPS check-in/out) + monthly payroll.

Working day: 10:00–19:00, 10-min grace (check-in after 10:10 = late).
Payroll: monthly fixed salary; deduction = (salary / working_days) * absent_days.
Working days = all days of the month except Sundays. Half-day counts as 0.5.
"""
from __future__ import annotations

import calendar
import csv
import io
from datetime import datetime, timezone, date
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit
from routers.notifications import notify_users

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


async def _notify_admins_attendance(actor: dict, action: str, when_local: datetime, extra: str = "") -> None:
    """Push + in-app notify super admins and the actor's office admins on check-in/out."""
    office = actor.get("office")
    ids: set[str] = set()
    sups = await db.users.find(
        {"role": "super_admin", "approval_status": "approved"}, {"_id": 0, "id": 1}
    ).to_list(50)
    ids.update(s["id"] for s in sups)
    if office:
        oas = await db.users.find(
            {"role": "office_admin", "approval_status": "approved", "office": office}, {"_id": 0, "id": 1}
        ).to_list(200)
        ids.update(o["id"] for o in oas)
    ids.discard(actor["id"])
    if not ids:
        return
    tstr = when_local.strftime("%I:%M %p")
    verb = "checked in" if action == "check_in" else "checked out"
    await notify_users(
        list(ids),
        type=f"attendance_{action}",
        title=f"{actor.get('name') or 'A staff member'} {verb}",
        message=f"{actor.get('name') or 'Staff'} · {office or ''} {verb} at {tstr}{extra}".strip(),
        link="/attendance?tab=payroll",
        actor_user_id=actor["id"],
        metadata={"office": office, "action": action},
    )


LATE_ALERT = (10, 30)  # ping office admins if not checked in by 10:30 IST


async def sweep_late_checkins() -> None:
    """Once past 10:30 IST on a working day, notify admins about staff/office
    admins who still haven't checked in (idempotent per person per day)."""
    local = datetime.now(TZ)
    if local.weekday() == 6:  # Sunday
        return
    cutoff = local.replace(hour=LATE_ALERT[0], minute=LATE_ALERT[1], second=0, microsecond=0)
    end = local.replace(hour=OFFICE_END[0], minute=OFFICE_END[1], second=0, microsecond=0)
    if local < cutoff or local > end:
        return
    today = local.strftime("%Y-%m-%d")
    users = await db.users.find(
        {"role": {"$in": ["staff", "office_admin"]}, "approval_status": "approved",
         "deleted_at": {"$in": [None, ""]}},
        {"_id": 0, "id": 1, "name": 1, "office": 1, "role": 1},
    ).to_list(5000)
    att = await db.attendance.find({"date": today}, {"_id": 0, "user_id": 1, "check_in": 1, "status": 1}).to_list(20000)
    ok = {a["user_id"] for a in att if a.get("check_in") or a.get("status") in ("weekoff", "leave")}
    leaves = await db.leave_requests.find(
        {"status": "approved", "from_date": {"$lte": today}, "to_date": {"$gte": today}},
        {"_id": 0, "requester_user_id": 1},
    ).to_list(5000)
    on_leave = {leave["requester_user_id"] for leave in leaves}
    alerted = {a["user_id"] for a in await db.attendance_alerts.find({"date": today}, {"_id": 0, "user_id": 1}).to_list(20000)}
    supers = [s["id"] for s in await db.users.find(
        {"role": "super_admin", "approval_status": "approved"}, {"_id": 0, "id": 1}).to_list(50)]
    oa_by_office: dict = {}
    for u in users:
        uid = u["id"]
        if uid in ok or uid in on_leave or uid in alerted:
            continue
        office = u.get("office")
        if office and office not in oa_by_office:
            oa_by_office[office] = [o["id"] for o in await db.users.find(
                {"role": "office_admin", "approval_status": "approved", "office": office},
                {"_id": 0, "id": 1}).to_list(200)]
        recips = set(supers) | set(oa_by_office.get(office, []))
        recips.discard(uid)
        if recips:
            await notify_users(
                list(recips),
                type="attendance_no_show",
                title=f"{u.get('name') or 'A staff member'} not checked in",
                message=f"{u.get('name') or 'Staff'} ({office or '—'}) hasn't checked in by 10:30 AM today.",
                link="/attendance?tab=payroll",
                metadata={"office": office, "user_id": uid, "date": today},
            )
        await db.attendance_alerts.update_one(
            {"user_id": uid, "date": today},
            {"$set": {"user_id": uid, "date": today, "created_at": now_iso()}},
            upsert=True,
        )


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
        "break_seconds": 0,
        "breaks": [],
        "on_break": False,
        "created_at": now_iso(),
    }
    await db.attendance.update_one({"user_id": user["id"], "date": today}, {"$set": rec}, upsert=True)
    await _notify_admins_attendance(user, "check_in", local, extra=(" · LATE" if status == "late" else ""))
    return {"record": _public(rec)}


@router.post("/break/start")
async def break_start(user: dict = Depends(require_edit("attendance"))):
    today = _today()
    rec = await db.attendance.find_one({"user_id": user["id"], "date": today})
    if not rec or not rec.get("check_in"):
        raise HTTPException(400, "You haven't checked in today")
    if rec.get("check_out"):
        raise HTTPException(400, "You've already checked out")
    if rec.get("on_break"):
        raise HTTPException(400, "You're already on a break")
    now = datetime.now(timezone.utc)
    breaks = rec.get("breaks") or []
    breaks.append({"start": now.isoformat(), "end": None, "seconds": 0})
    await db.attendance.update_one({"id": rec["id"]}, {"$set": {"on_break": True, "breaks": breaks}})
    rec.update({"on_break": True, "breaks": breaks})
    return {"record": _public(rec)}


@router.post("/break/end")
async def break_end(user: dict = Depends(require_edit("attendance"))):
    today = _today()
    rec = await db.attendance.find_one({"user_id": user["id"], "date": today})
    if not rec or not rec.get("on_break"):
        raise HTTPException(400, "You're not on a break")
    now = datetime.now(timezone.utc)
    breaks = rec.get("breaks") or []
    total = 0
    for b in breaks:
        if b.get("end") is None and b.get("start"):
            secs = max(0, int((now - datetime.fromisoformat(b["start"])).total_seconds()))
            b["end"] = now.isoformat()
            b["seconds"] = secs
        total += int(b.get("seconds") or 0)
    await db.attendance.update_one(
        {"id": rec["id"]}, {"$set": {"on_break": False, "breaks": breaks, "break_seconds": total}}
    )
    rec.update({"on_break": False, "breaks": breaks, "break_seconds": total})
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
    # Auto-close any open break at checkout.
    breaks = rec.get("breaks") or []
    break_total = 0
    for b in breaks:
        if b.get("end") is None and b.get("start"):
            secs = max(0, int((now - datetime.fromisoformat(b["start"])).total_seconds()))
            b["end"] = now.isoformat()
            b["seconds"] = secs
        break_total += int(b.get("seconds") or 0)
    net_work = max(0, work - break_total)
    status = rec.get("status") or "present"
    if net_work < HALF_DAY_SECONDS:
        status = "half_day"
    await db.attendance.update_one(
        {"id": rec["id"]},
        {"$set": {"check_out": now.isoformat(), "work_seconds": work, "break_seconds": break_total,
                  "breaks": breaks, "on_break": False, "status": status}},
    )
    rec.update({"check_out": now.isoformat(), "work_seconds": work, "break_seconds": break_total,
                "breaks": breaks, "on_break": False, "status": status})
    await _notify_admins_attendance(user, "check_out", now.astimezone(TZ),
                                    extra=f" · {round(net_work / 3600, 1)}h net")
    return {"record": _public(rec)}


@router.get("/me")
async def my_month(month: str, user: dict = Depends(get_current_user)):
    rows = await db.attendance.find(
        {"user_id": user["id"], "date": {"$regex": f"^{month}"}}, {"_id": 0}
    ).sort("date", 1).to_list(40)
    return {"records": rows}


@router.get("/board")
async def whos_in_board(office: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Live per-office roster for admins: who is in / on break / checked out / on leave / absent today."""
    _require_admin(user)
    scope = user.get("office") if user.get("role") == "office_admin" else (office if office and office != "all" else None)
    today = _today()
    uq: dict = {"role": {"$in": ["staff", "office_admin"]}, "approval_status": "approved",
                "deleted_at": {"$in": [None, ""]}}
    if scope:
        uq["office"] = scope
    users = await db.users.find(uq, {"_id": 0, "id": 1, "name": 1, "office": 1, "role": 1}).to_list(5000)
    att = await db.attendance.find({"date": today, **({"office": scope} if scope else {})}, {"_id": 0}).to_list(20000)
    by_user = {a["user_id"]: a for a in att}
    leaves = await db.leave_requests.find(
        {"status": "approved", "from_date": {"$lte": today}, "to_date": {"$gte": today}},
        {"_id": 0, "requester_user_id": 1},
    ).to_list(5000)
    on_leave = {leave["requester_user_id"] for leave in leaves}
    rows = []
    counts = {"in": 0, "on_break": 0, "checked_out": 0, "leave": 0, "absent": 0}
    for u in users:
        rec = by_user.get(u["id"])
        if rec and rec.get("status") in ("leave", "weekoff"):
            state = "leave"
        elif rec and rec.get("check_out"):
            state = "checked_out"
        elif rec and rec.get("on_break"):
            state = "on_break"
        elif rec and rec.get("check_in"):
            state = "in"
        elif u["id"] in on_leave:
            state = "leave"
        else:
            state = "absent"
        counts[state] += 1
        rows.append({
            "user_id": u["id"], "name": u.get("name"), "office": u.get("office"), "role": u.get("role"),
            "state": state, "check_in": rec.get("check_in") if rec else None,
            "check_out": rec.get("check_out") if rec else None,
            "attendance_status": rec.get("status") if rec else None,
        })
    rows.sort(key=lambda r: (r["state"] != "in", r["state"] != "on_break", r.get("name") or ""))
    return {"date": today, "counts": counts, "rows": rows}


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


@router.delete("/{rec_id}")
async def delete_attendance(rec_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    rec = await db.attendance.find_one({"id": rec_id})
    if not rec:
        raise HTTPException(404, "Not found")
    if user.get("role") == "office_admin" and rec.get("office") != user.get("office"):
        raise HTTPException(403, "Out of scope")
    await db.attendance.delete_one({"id": rec_id})
    return {"ok": True}


VALID_STATUS = ("present", "late", "half_day", "absent", "leave", "weekoff")


def _to_iso_ist(date_str: str, val: Optional[str]) -> Optional[str]:
    """Normalise a check-in/out value to an ISO timestamp. Accepts 'HH:MM',
    'HH:MM:SS' (assumed IST on `date_str`) or a full ISO string."""
    if not val:
        return None
    val = val.strip()
    if not val:
        return None
    if "T" in val or " " in val:
        return val
    parts = val.split(":")
    hh = parts[0].zfill(2)
    mm = (parts[1] if len(parts) > 1 else "00").zfill(2)
    ss = (parts[2] if len(parts) > 2 else "00").zfill(2)
    return f"{date_str}T{hh}:{mm}:{ss}+05:30"


class AdminUpsertIn(BaseModel):
    user_id: str
    date: str
    status: str = "present"
    check_in: Optional[str] = None
    check_out: Optional[str] = None


@router.post("/admin/upsert")
async def admin_upsert(body: AdminUpsertIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    if body.status not in VALID_STATUS:
        raise HTTPException(400, "Invalid status")
    target = await db.users.find_one({"id": body.user_id}, {"_id": 0, "id": 1, "name": 1, "office": 1})
    if not target:
        raise HTTPException(404, "Staff not found")
    if user.get("role") == "office_admin" and target.get("office") != user.get("office"):
        raise HTTPException(403, "Out of scope")
    ci = _to_iso_ist(body.date, body.check_in)
    co = _to_iso_ist(body.date, body.check_out)
    work = 0
    if ci and co:
        try:
            work = max(0, int((datetime.fromisoformat(co) - datetime.fromisoformat(ci)).total_seconds()))
        except Exception:
            work = 0
    await db.attendance.update_one(
        {"user_id": body.user_id, "date": body.date},
        {"$set": {"user_name": target.get("name"), "office": target.get("office"),
                  "status": body.status, "check_in": ci, "check_out": co,
                  "work_seconds": work, "edited_by": user["id"]},
         "$setOnInsert": {"id": gen_id(), "user_id": body.user_id, "date": body.date,
                          "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


class BulkIn(BaseModel):
    kind: str   # "attendance" | "salaries"
    csv: str
    preview: bool = False


async def _resolve_user(ref: str, cache: dict) -> Optional[dict]:
    ref = (ref or "").strip()
    if not ref:
        return None
    if ref in cache:
        return cache[ref]
    q = {"email": ref.lower()} if "@" in ref else {"id": ref}
    u = await db.users.find_one(q, {"_id": 0, "id": 1, "name": 1, "office": 1, "role": 1})
    cache[ref] = u
    return u


@router.post("/bulk")
async def bulk_upload(body: BulkIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    if body.kind not in ("attendance", "salaries"):
        raise HTTPException(400, "Invalid kind")
    reader = csv.DictReader(io.StringIO(body.csv))
    if not reader.fieldnames:
        raise HTTPException(400, "Empty or invalid CSV")
    norm = {(f or "").strip().lower(): f for f in reader.fieldnames}

    def col(row, *names):
        for n in names:
            if n in norm:
                return (row.get(norm[n]) or "").strip()
        return ""

    scope = user.get("office") if user.get("role") == "office_admin" else None
    preview = body.preview
    cache: dict = {}
    created = updated = 0
    errors: list[str] = []
    out_rows: list[dict] = []

    def add(line, ref, action, message="", **extra):
        nonlocal created, updated
        if action == "create":
            created += 1
        elif action == "update":
            updated += 1
        else:
            errors.append(f"Row {line}: {message}")
        out_rows.append({"line": line, "ref": ref, "action": action, "message": message, **extra})

    for i, row in enumerate(reader, start=2):
        ref = col(row, "email", "user_id", "user", "id")
        try:
            u = await _resolve_user(ref, cache)
            if not u:
                add(i, ref, "error", "staff not found")
                continue
            if scope and u.get("office") != scope:
                add(i, ref, "error", "staff outside your office", name=u.get("name"), office=u.get("office"))
                continue

            if body.kind == "salaries":
                sal = col(row, "monthly_salary", "salary")
                if not preview:
                    await db.staff_salaries.update_one(
                        {"user_id": u["id"]},
                        {"$set": {"user_id": u["id"], "monthly_salary": float(sal or 0),
                                  "office": u.get("office"), "updated_at": now_iso()}},
                        upsert=True,
                    )
                exists = await db.staff_salaries.find_one({"user_id": u["id"]}, {"_id": 1})
                add(i, ref, "update" if exists else "create", "",
                    name=u.get("name"), office=u.get("office"), salary=float(sal or 0))
                continue

            # attendance
            d = col(row, "date")
            if not d:
                add(i, ref, "error", "missing date", name=u.get("name"))
                continue
            st = (col(row, "status") or "present").lower().replace(" ", "_")
            if st == "halfday":
                st = "half_day"
            if st not in VALID_STATUS:
                add(i, ref, "error", f"invalid status '{st}'", name=u.get("name"), date=d)
                continue
            ci = _to_iso_ist(d, col(row, "check_in", "checkin", "in"))
            co = _to_iso_ist(d, col(row, "check_out", "checkout", "out"))
            work = 0
            if ci and co:
                try:
                    work = max(0, int((datetime.fromisoformat(co) - datetime.fromisoformat(ci)).total_seconds()))
                except Exception:
                    work = 0
            existing = await db.attendance.find_one({"user_id": u["id"], "date": d}, {"_id": 1})
            if not preview:
                await db.attendance.update_one(
                    {"user_id": u["id"], "date": d},
                    {"$set": {"user_name": u.get("name"), "office": u.get("office"), "status": st,
                              "check_in": ci, "check_out": co, "work_seconds": work,
                              "edited_by": user["id"]},
                     "$setOnInsert": {"id": gen_id(), "user_id": u["id"], "date": d, "created_at": now_iso()}},
                    upsert=True,
                )
            add(i, ref, "update" if existing else "create", "",
                name=u.get("name"), office=u.get("office"), date=d, status=st)
        except Exception as e:  # noqa: BLE001
            add(i, ref, "error", str(e))

    return {"kind": body.kind, "preview": preview, "created": created, "updated": updated,
            "errors": errors[:50], "error_count": len(errors), "rows": out_rows[:500]}


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


# CTC → component breakup (matches HR salary structure). Percentages of CTC.
SALARY_COMPONENTS = [
    {"key": "basic", "label": "Basic Salary", "pct": 50, "taxable": "Yes"},
    {"key": "hra", "label": "HRA", "pct": 25, "taxable": "Partially"},
    {"key": "special", "label": "Special Allowance", "pct": 15, "taxable": "Yes"},
    {"key": "lta", "label": "LTA", "pct": 10, "taxable": "Yes"},
]


def _salary_breakup(ctc: float) -> list[dict]:
    """Split a monthly CTC into its fixed-percentage components."""
    ctc = float(ctc or 0)
    return [{**c, "amount": round(ctc * c["pct"] / 100, 2)} for c in SALARY_COMPONENTS]


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
    staff = await db.users.find(uq, {"_id": 0, "id": 1, "name": 1, "office": 1, "role": 1, "suspended": 1, "salary_hold": 1}).to_list(5000)
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
        if st in ("present", "late", "weekoff", "leave"):
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
        net = round(salary - deduction, 2)
        held = bool(s.get("salary_hold"))
        out.append({
            "user_id": uid, "name": s.get("name"), "office": s.get("office"), "role": s.get("role"),
            "monthly_salary": salary, "working_days": working_days,
            "present_days": present_days, "half_days": half_days, "leave_days": leave_days,
            "paid_days": round(present_eq, 1), "absent_days": round(absent, 1),
            "per_day": per_day, "deduction": deduction,
            "net_pay": 0 if held else net,
            "net_before_hold": net,
            "salary_hold": held,
            "suspended": bool(s.get("suspended")),
            "salary_breakup": _salary_breakup(salary),
        })
    return out


@router.get("/payroll")
async def payroll(month: str, office: Optional[str] = None, user: dict = Depends(get_current_user)):
    _require_admin(user)
    scope = user.get("office") if user.get("role") == "office_admin" else (office if office and office != "all" else None)
    return {"month": month, "rows": await _payroll_rows(month, scope)}


DEFAULT_COMPANY = {
    "legal_name": "KM FOUNDATION (Zelix Ventures LLP)",
    "address": "4th Floor A Block, AKR Tech Park, Garebhavi Palya, Krishna Reddy Layout, AMR Tech Park, Karnataka – 560100",
    "logo_url": "",
}

# Fields lifted from the staff profile (clients) onto the payslip.
_PAYSLIP_PROFILE_FIELDS = (
    "employee_id", "designation", "department", "date_of_joining",
    "leave_balance", "tax_regime", "bank_account_no", "ifsc_code",
)


async def _company_profile() -> dict:
    doc = await db.company_profile.find_one({"id": "default"}, {"_id": 0, "id": 0})
    return {**DEFAULT_COMPANY, **(doc or {})}


async def _payslip_employee(uid: str, target: dict) -> dict:
    """Merge the staff profile (clients) payslip fields onto the login user."""
    client = await db.clients.find_one(
        {"client_type": "staff", "login_user_id": uid}, {"_id": 0}
    )
    client = client or {}
    emp = {
        "name": target.get("name") or client.get("name") or "",
        "office": target.get("office") or client.get("office"),
        "employee_code": client.get("employee_id") or "",
    }
    for f in _PAYSLIP_PROFILE_FIELDS:
        emp[f] = client.get(f)
    return emp


@router.get("/company-profile")
async def get_company_profile(user: dict = Depends(get_current_user)):
    return await _company_profile()


class CompanyProfileIn(BaseModel):
    legal_name: str
    address: str = ""
    logo_url: str = ""


@router.put("/company-profile")
async def set_company_profile(body: CompanyProfileIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    await db.company_profile.update_one(
        {"id": "default"},
        {"$set": {"id": "default", "legal_name": body.legal_name.strip(),
                  "address": body.address.strip(), "logo_url": (body.logo_url or "").strip(),
                  "updated_at": now_iso(), "updated_by": user["id"]}},
        upsert=True,
    )
    return await _company_profile()


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
    return {
        "month": month,
        "staff": target,
        "payslip": row,
        "company": await _company_profile(),
        "employee": await _payslip_employee(uid, target),
    }


class PayslipEmailIn(BaseModel):
    month: str
    pdf_base64: str
    filename: Optional[str] = None


@router.post("/payslip/{uid}/email")
async def email_payslip(uid: str, body: PayslipEmailIn, user: dict = Depends(get_current_user)):
    """Email a client-generated payslip PDF (base64) to the employee."""
    _require_admin(user)
    target = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "email": 1, "office": 1})
    if not target:
        raise HTTPException(404, "User not found")
    if user.get("role") == "office_admin" and target.get("office") != user.get("office"):
        raise HTTPException(403, "Out of scope")
    to_email = (target.get("email") or "").strip()
    if not to_email:
        raise HTTPException(400, "This employee has no email on their login account")
    b64 = body.pdf_base64
    if "," in b64 and b64.strip().lower().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    company = await _company_profile()
    fname = body.filename or f"payslip-{body.month}.pdf"
    from lib.email_notifier import send_email
    name = target.get("name") or "there"
    html = (
        f"<div style=\"font-family:-apple-system,Segoe UI,sans-serif;color:#1c1917;\">"
        f"<p>Hi {name},</p>"
        f"<p>Please find attached your payslip for <strong>{body.month}</strong>.</p>"
        f"<p style=\"color:#78716c;font-size:13px;\">Regards,<br/>{company.get('legal_name')}</p>"
        f"</div>"
    )
    try:
        resp = await send_email(
            to=to_email,
            subject=f"Payslip · {body.month}",
            html=html,
            attachments=[{"filename": fname, "content": b64}],
        )
    except RuntimeError as exc:
        msg = str(exc)
        if "not verified" in msg.lower():
            raise HTTPException(400, "Email could not be sent — the sender domain isn't verified in Resend yet. Verify it at resend.com/domains, then try again.")
        raise HTTPException(400, f"Email could not be sent: {msg}")
    if resp.get("skipped"):
        raise HTTPException(400, "Email service is not configured (RESEND_API_KEY missing).")
    return {"ok": True, "sent_to": to_email}


# ---------- Regularization: fix a PAST day (Absent → Week-off / Leave) ----------
REG_KINDS = ("weekoff", "leave")


class RegularizeIn(BaseModel):
    date: str                              # YYYY-MM-DD (must be in the past)
    kind: str = "weekoff"                  # weekoff | leave
    leave_type: Optional[str] = None       # casual/sick/earned when kind=leave
    reason: str = ""


class RegDecision(BaseModel):
    status: str                            # approved | rejected
    note: Optional[str] = ""


@router.post("/regularize", status_code=201)
async def create_regularization(body: RegularizeIn, user: dict = Depends(require_edit("attendance"))):
    if body.kind not in REG_KINDS:
        raise HTTPException(400, "Invalid kind")
    if body.date >= _today():
        raise HTTPException(400, "You can only regularize a past date")
    existing = await db.attendance_regularizations.find_one(
        {"user_id": user["id"], "date": body.date, "status": "pending"}
    )
    if existing:
        raise HTTPException(400, "A pending request already exists for this date")
    now = now_iso()
    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_role": user.get("role"),
        "office": user.get("office"),
        "date": body.date,
        "kind": body.kind,
        "leave_type": body.leave_type if body.kind == "leave" else None,
        "reason": (body.reason or "").strip(),
        "status": "pending",
        "approver_user_id": None,
        "approver_name": None,
        "decided_at": None,
        "decision_note": "",
        "created_at": now,
    }
    await db.attendance_regularizations.insert_one(doc)
    doc.pop("_id", None)
    return {"request": doc}


@router.get("/regularizations")
async def list_regularizations(status: Optional[str] = None, month: Optional[str] = None,
                               user: dict = Depends(get_current_user)):
    q: dict = {}
    role = user.get("role")
    if role == "super_admin":
        pass
    elif role == "office_admin":
        # own requests + team requests in their office
        q["$or"] = [{"user_id": user["id"]}, {"office": user.get("office")}]
    else:
        q["user_id"] = user["id"]
    if status:
        q["status"] = status
    if month:
        q["date"] = {"$regex": f"^{month}"}
    rows = await db.attendance_regularizations.find(q, {"_id": 0}).sort("created_at", -1).to_list(3000)
    return {"requests": rows}


@router.patch("/regularizations/{req_id}")
async def decide_regularization(req_id: str, body: RegDecision, user: dict = Depends(get_current_user)):
    _require_admin(user)
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "Invalid status")
    req = await db.attendance_regularizations.find_one({"id": req_id})
    if not req:
        raise HTTPException(404, "Request not found")
    if req.get("status") != "pending":
        raise HTTPException(400, "This request has already been decided")
    if req.get("user_id") == user["id"]:
        raise HTTPException(403, "You can't approve your own request")
    # office_admin decides only staff requests in their own office
    if user.get("role") == "office_admin":
        if req.get("office") != user.get("office") or req.get("user_role") != "staff":
            raise HTTPException(403, "Out of scope")
    await db.attendance_regularizations.update_one(
        {"id": req_id},
        {"$set": {"status": body.status, "approver_user_id": user["id"],
                  "approver_name": user.get("name"), "decided_at": now_iso(),
                  "decision_note": (body.note or "").strip()}},
    )
    if body.status == "approved":
        # Upsert an attendance record for that date marked as a paid day.
        status = "leave" if req.get("kind") == "leave" else "weekoff"
        await db.attendance.update_one(
            {"user_id": req["user_id"], "date": req["date"]},
            {
                "$set": {
                    "user_name": req.get("user_name"),
                    "office": req.get("office"),
                    "status": status,
                    "regularized": True,
                    "regularization_id": req_id,
                    "leave_type": req.get("leave_type"),
                },
                "$setOnInsert": {
                    "id": gen_id(),
                    "user_id": req["user_id"],
                    "date": req["date"],
                    "created_at": now_iso(),
                },
            },
            upsert=True,
        )
    return {"ok": True}
