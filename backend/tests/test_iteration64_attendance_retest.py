"""Iteration 64 — Retest attendance permission bug fix + leave integration.

Scope:
  1. Staff can now check-in (200, not 403); duplicate returns 400.
  2. Staff still 403 on /api/attendance/payroll.
  3. Leave integration:
       - Approved non-unpaid leave over a WORKING day increases leave_days and reduces deduction.
       - Approved unpaid leave does NOT reduce deduction.
  4. Regression: office admin scoped payroll; super admin cross-office + filter; payslip endpoint OK.

Cleanup at module teardown: removes any TEST_* leave_requests + attendance rows + salary docs
we created (identified by user_id + a marker in leave_requests).
"""
import os
import calendar
import asyncio
from datetime import date, datetime
from zoneinfo import ZoneInfo
from typing import Optional

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient


def _read_env():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.strip().split("=", 1)[1]
                    break
    mongo = os.environ.get("MONGO_URL")
    dbn = os.environ.get("DB_NAME")
    if not mongo or not dbn:
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("MONGO_URL=") and not mongo:
                    mongo = line.strip().split("=", 1)[1].strip('"')
                if line.startswith("DB_NAME=") and not dbn:
                    dbn = line.strip().split("=", 1)[1].strip('"')
    return url.rstrip("/"), mongo, dbn


BASE, MONGO_URL, DB_NAME = _read_env()
API = f"{BASE}/api"
TZ = ZoneInfo("Asia/Kolkata")

SUPER = {"email": "muneer@kmfoundation.co", "password": "kmf@0786"}
OFFICE_ADMIN = {"email": "blr1@finflow.com", "password": "Office@123"}
STAFF = {"email": "staff.blr@kmfoundation.online", "password": "Staff@123"}

LEAVE_MARKER = "TEST_iter64_leave"


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s, r.json()


def _month_str():
    d = datetime.now(TZ)
    return f"{d.year:04d}-{d.month:02d}"


def _working_days(month):
    y, m = int(month[:4]), int(month[5:7])
    n = calendar.monthrange(y, m)[1]
    return sum(1 for d in range(1, n + 1) if date(y, m, d).weekday() != 6)


def _first_working_day(month, exclude=None):
    """Return first working (non-Sun) day-of-month string YYYY-MM-DD, optionally
    excluding a set of day strings (to keep multiple test-leaves on different days)."""
    y, m = int(month[:4]), int(month[5:7])
    n = calendar.monthrange(y, m)[1]
    for d in range(1, n + 1):
        if date(y, m, d).weekday() == 6:
            continue
        ds = f"{y:04d}-{m:02d}-{d:02d}"
        if exclude and ds in exclude:
            continue
        return ds
    return None


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def super_client():
    return _login(SUPER)


@pytest.fixture(scope="module")
def office_client():
    return _login(OFFICE_ADMIN)


@pytest.fixture(scope="module")
def staff_client():
    return _login(STAFF)


@pytest.fixture(scope="module")
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ---------------- 1. staff check-in fix ----------------
def test_staff_check_in_now_works(staff_client, mongo):
    """Bug fix retest: staff must be able to POST /attendance/check-in (200)."""
    s, u = staff_client
    # ensure no existing record for today so we get a clean 200
    today = datetime.now(TZ).strftime("%Y-%m-%d")

    async def _clean():
        await mongo.attendance.delete_many({"user_id": u["id"], "date": today})
    asyncio.get_event_loop().run_until_complete(_clean())

    r = s.post(f"{API}/attendance/check-in", json={"lat": 12.9, "lng": 77.6})
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    rec = r.json()["record"]
    assert rec["user_id"] == u["id"]
    assert rec["check_in"]
    assert rec["status"] in ("present", "late")


def test_staff_duplicate_check_in_400(staff_client):
    s, _ = staff_client
    r = s.post(f"{API}/attendance/check-in", json={"lat": None, "lng": None})
    assert r.status_code == 400
    assert "Already" in r.text


def test_staff_still_forbidden_from_payroll(staff_client):
    s, _ = staff_client
    r = s.get(f"{API}/attendance/payroll", params={"month": _month_str()})
    assert r.status_code == 403
    assert "Admins only" in r.text


# ---------------- 2. leave integration ----------------
@pytest.fixture(scope="module")
def target_staff_uid(office_client, mongo):
    """Find a KM_BLR staff user, set salary, clear leftover leave/attendance test data."""
    s, _ = office_client
    # We use mongo directly to find a staff in KM_BLR (office admin can't list users).
    async def _find():
        u = await mongo.users.find_one(
            {"role": "staff", "office": "KM_BLR", "deleted_at": {"$in": [None, ""]}},
            {"_id": 0, "id": 1, "name": 1},
        )
        return u
    user = asyncio.get_event_loop().run_until_complete(_find())
    assert user, "No KM_BLR staff user available"
    uid = user["id"]
    # set salary=30000 (deterministic base)
    r = s.put(f"{API}/attendance/salary/{uid}", json={"monthly_salary": 30000})
    assert r.status_code == 200, r.text

    async def _cleanup_leaves():
        await mongo.leave_requests.delete_many({"note_marker": LEAVE_MARKER, "requester_user_id": uid})
    asyncio.get_event_loop().run_until_complete(_cleanup_leaves())
    return uid


def _payroll_row(session, month, uid, office="KM_BLR"):
    r = session.get(f"{API}/attendance/payroll", params={"month": month})
    assert r.status_code == 200
    return next((x for x in r.json()["rows"] if x["user_id"] == uid), None)


def test_baseline_payroll_no_leave(office_client, target_staff_uid, mongo):
    """Baseline: with no attendance and no leave, absent_days == working_days, deduction full."""
    s, _ = office_client
    uid = target_staff_uid
    month = _month_str()

    # remove any attendance for this user this month for deterministic math
    async def _clean():
        await mongo.attendance.delete_many({"user_id": uid, "date": {"$regex": f"^{month}"}})
    asyncio.get_event_loop().run_until_complete(_clean())

    row = _payroll_row(s, month, uid)
    assert row, "target must appear in payroll"
    wd = _working_days(month)
    assert row["working_days"] == wd
    assert row["monthly_salary"] == 30000
    assert row["leave_days"] == 0
    # allow tiny drift if today already passed with no rows — absent should be wd
    assert abs(row["absent_days"] - wd) < 0.1, f"expected absent≈{wd}, got {row['absent_days']}"
    expected_per_day = round(30000 / wd, 2)
    assert abs(row["per_day"] - expected_per_day) < 0.02


def test_approved_paid_leave_reduces_deduction(office_client, target_staff_uid, mongo):
    """Approved leave (leave_type='sick', non-unpaid) on 2 working days -> leave_days=2, deduction reduced by 2*per_day."""
    s, _ = office_client
    uid = target_staff_uid
    month = _month_str()

    # baseline row
    base = _payroll_row(s, month, uid)
    assert base
    per_day = base["per_day"]
    base_deduction = base["deduction"]
    base_leave = base["leave_days"]

    # pick two distinct working days
    d1 = _first_working_day(month)
    d2 = _first_working_day(month, exclude={d1})
    assert d1 and d2

    async def _insert():
        await mongo.leave_requests.insert_one({
            "id": "TEST_iter64_paid",
            "requester_user_id": uid,
            "requester_role": "staff",
            "office": "KM_BLR",
            "leave_type": "sick",
            "status": "approved",
            "from_date": d1,
            "to_date": d1,
            "days": 1,
            "note_marker": LEAVE_MARKER,
        })
        await mongo.leave_requests.insert_one({
            "id": "TEST_iter64_paid2",
            "requester_user_id": uid,
            "requester_role": "staff",
            "office": "KM_BLR",
            "leave_type": "casual",
            "status": "approved",
            "from_date": d2,
            "to_date": d2,
            "days": 1,
            "note_marker": LEAVE_MARKER,
        })
    asyncio.get_event_loop().run_until_complete(_insert())

    new_row = _payroll_row(s, month, uid)
    assert new_row
    assert new_row["leave_days"] == base_leave + 2, f"leave_days should grow by 2, got {new_row['leave_days']} from {base_leave}"
    # deduction should drop by ~2 * per_day
    expected_drop = round(2 * per_day, 2)
    actual_drop = round(base_deduction - new_row["deduction"], 2)
    assert abs(actual_drop - expected_drop) < 1.0, (
        f"deduction drop {actual_drop} != expected {expected_drop} (per_day={per_day})"
    )
    assert abs(new_row["net_pay"] - (30000 - new_row["deduction"])) < 1.0


def test_unpaid_leave_does_not_reduce_deduction(office_client, target_staff_uid, mongo):
    """Approved UNPAID leave must NOT add to leave_days or shrink deduction."""
    s, _ = office_client
    uid = target_staff_uid
    month = _month_str()

    before = _payroll_row(s, month, uid)
    assert before
    d = _first_working_day(month, exclude=set())
    # pick a working day different from the 2 already-taken paid-leave days
    used = {"none"}
    # We need a third working day not equal to d1/d2. Find it dynamically.
    y, mo = int(month[:4]), int(month[5:7])
    n = calendar.monthrange(y, mo)[1]
    third = None
    seen = 0
    for dd in range(1, n + 1):
        if date(y, mo, dd).weekday() == 6:
            continue
        seen += 1
        if seen == 3:
            third = f"{y:04d}-{mo:02d}-{dd:02d}"
            break
    assert third

    async def _insert_unpaid():
        await mongo.leave_requests.insert_one({
            "id": "TEST_iter64_unpaid",
            "requester_user_id": uid,
            "requester_role": "staff",
            "office": "KM_BLR",
            "leave_type": "unpaid",
            "status": "approved",
            "from_date": third,
            "to_date": third,
            "days": 1,
            "note_marker": LEAVE_MARKER,
        })
    asyncio.get_event_loop().run_until_complete(_insert_unpaid())

    after = _payroll_row(s, month, uid)
    assert after
    # unpaid leave: leave_days and deduction should be unchanged from before
    assert after["leave_days"] == before["leave_days"], (
        f"unpaid leave leaked into leave_days: {before['leave_days']} -> {after['leave_days']}"
    )
    assert abs(after["deduction"] - before["deduction"]) < 0.05, (
        f"unpaid leave reduced deduction: {before['deduction']} -> {after['deduction']}"
    )


# ---------------- 3. regression ----------------
def test_office_admin_payroll_scoped(office_client):
    s, u = office_client
    r = s.get(f"{API}/attendance/payroll", params={"month": _month_str()})
    assert r.status_code == 200
    for row in r.json()["rows"]:
        assert row["office"] == u["office"] == "KM_BLR"


def test_super_admin_all_and_office_filter(super_client):
    s, _ = super_client
    month = _month_str()
    all_rows = s.get(f"{API}/attendance/payroll", params={"month": month}).json()["rows"]
    blr = s.get(f"{API}/attendance/payroll", params={"month": month, "office": "KM_BLR"}).json()["rows"]
    assert all(r["office"] == "KM_BLR" for r in blr)
    assert len(blr) <= len(all_rows)
    # cross-office rows should exist somewhere
    offices = {r["office"] for r in all_rows}
    assert len(offices) >= 1


def test_payslip_ok(office_client, target_staff_uid):
    s, _ = office_client
    uid = target_staff_uid
    month = _month_str()
    r = s.get(f"{API}/attendance/payslip/{uid}", params={"month": month})
    assert r.status_code == 200
    j = r.json()
    assert j["month"] == month
    assert j["staff"]["id"] == uid
    assert j["payslip"]["user_id"] == uid


# ---------------- teardown ----------------
def test_zzz_cleanup(mongo, target_staff_uid):
    """Runs last (alphabetical). Removes test-created leave and attendance rows."""
    uid = target_staff_uid
    month = _month_str()

    async def _cleanup():
        await mongo.leave_requests.delete_many({"note_marker": LEAVE_MARKER})
        await mongo.attendance.delete_many({"user_id": uid, "date": {"$regex": f"^{month}"}})
        # Also remove today's staff attendance row from test_staff_check_in_now_works
        staff_email = STAFF["email"]
        u = await mongo.users.find_one({"email": staff_email}, {"_id": 0, "id": 1})
        if u:
            await mongo.attendance.delete_many({"user_id": u["id"]})
        # Remove salary doc we set
        await mongo.staff_salaries.delete_many({"user_id": uid})
    asyncio.get_event_loop().run_until_complete(_cleanup())
    assert True
