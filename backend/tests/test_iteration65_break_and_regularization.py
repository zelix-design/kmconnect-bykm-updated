"""Iteration 65 — Break tracking + Regularization (attendance).

See top of iteration_65.json in test_reports for scope.
"""
from __future__ import annotations

import os
import time
import calendar
import asyncio
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient


def _env():
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


BASE, MONGO_URL, DB_NAME = _env()
API = f"{BASE}/api"
TZ = ZoneInfo("Asia/Kolkata")

SUPER = {"email": "muneer@kmfoundation.co", "password": "kmf@0786"}
OFFICE_ADMIN = {"email": "blr1@finflow.com", "password": "Office@123"}
STAFF = {"email": "staff.blr@kmfoundation.online", "password": "Staff@123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return s, r.json()


def db_run(coro_factory):
    """Run a coroutine against a fresh motor client bound to a fresh loop."""
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            return loop.run_until_complete(coro_factory(client[DB_NAME]))
        finally:
            client.close()
    finally:
        loop.close()


@pytest.fixture(scope="module")
def sessions():
    ss, su = _login(SUPER)
    os_, ou = _login(OFFICE_ADMIN)
    sts, stu = _login(STAFF)
    return {"super": (ss, su), "office": (os_, ou), "staff": (sts, stu)}


def _today_ist() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%d")


def _past_working_day(days_back: int = 3) -> str:
    d = date.today() - timedelta(days=days_back)
    while d.weekday() == 6:
        d -= timedelta(days=1)
    return d.strftime("%Y-%m-%d")


# ---------- Break tracking ----------
class TestBreaks:
    def _ensure_checked_in(self, sess):
        r = sess.post(f"{API}/attendance/check-in", json={"lat": None, "lng": None}, timeout=10)
        assert r.status_code in (200, 400), r.text

    def test_break_needs_checkin_first(self, sessions):
        sess, stu = sessions["staff"]
        db_run(lambda d: d.attendance.delete_many({"user_id": stu["id"], "date": _today_ist()}))
        r = sess.post(f"{API}/attendance/break/start", timeout=10)
        assert r.status_code == 400
        assert "checked in" in r.text.lower()

    def test_start_and_double_start(self, sessions):
        sess, _ = sessions["staff"]
        self._ensure_checked_in(sess)
        r1 = sess.post(f"{API}/attendance/break/start", timeout=10)
        assert r1.status_code == 200, r1.text
        rec = r1.json()["record"]
        assert rec["on_break"] is True
        assert rec["breaks"] and rec["breaks"][-1]["end"] is None
        r2 = sess.post(f"{API}/attendance/break/start", timeout=10)
        assert r2.status_code == 400
        assert "already on a break" in r2.text.lower()

    def test_end_break_accumulates(self, sessions):
        sess, _ = sessions["staff"]
        time.sleep(1.5)
        r = sess.post(f"{API}/attendance/break/end", timeout=10)
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["on_break"] is False
        assert rec["break_seconds"] >= 1
        r2 = sess.post(f"{API}/attendance/break/end", timeout=10)
        assert r2.status_code == 400

    def test_checkout_auto_closes_open_break(self, sessions):
        sess, stu = sessions["staff"]
        db_run(lambda d: d.attendance.delete_many({"user_id": stu["id"], "date": _today_ist()}))
        ci = sess.post(f"{API}/attendance/check-in", json={}, timeout=10)
        assert ci.status_code == 200, ci.text
        rs = sess.post(f"{API}/attendance/break/start", timeout=10)
        assert rs.status_code == 200
        time.sleep(2)
        co = sess.post(f"{API}/attendance/check-out", timeout=10)
        assert co.status_code == 200, co.text
        rec = co.json()["record"]
        assert rec["on_break"] is False
        assert rec["break_seconds"] >= 1
        assert rec["status"] == "half_day"


# ---------- Regularization ----------
class TestRegularization:
    def test_reg_future_and_today_rejected(self, sessions):
        sess, _ = sessions["staff"]
        r = sess.post(f"{API}/attendance/regularize",
                      json={"date": _today_ist(), "kind": "weekoff", "reason": "x"}, timeout=10)
        assert r.status_code == 400
        future = (date.today() + timedelta(days=2)).strftime("%Y-%m-%d")
        r2 = sess.post(f"{API}/attendance/regularize",
                       json={"date": future, "kind": "weekoff", "reason": "x"}, timeout=10)
        assert r2.status_code == 400

    def test_staff_creates_weekoff_reg(self, sessions):
        sess, stu = sessions["staff"]
        past = _past_working_day(3)
        async def _clean(d):
            await d.attendance_regularizations.delete_many({"user_id": stu["id"], "date": past})
            await d.attendance.delete_many({"user_id": stu["id"], "date": past})
        db_run(_clean)
        r = sess.post(f"{API}/attendance/regularize",
                      json={"date": past, "kind": "weekoff", "reason": "TEST iter65"}, timeout=10)
        assert r.status_code == 201, r.text
        req = r.json()["request"]
        assert req["status"] == "pending"
        assert req["kind"] == "weekoff"
        assert req["office"] == stu.get("office")
        r2 = sess.post(f"{API}/attendance/regularize",
                       json={"date": past, "kind": "weekoff", "reason": "x"}, timeout=10)
        assert r2.status_code == 400
        pytest.reg_id = req["id"]
        pytest.reg_date = past
        pytest.staff_id = stu["id"]
        pytest.staff_office = stu.get("office")

    def test_office_admin_sees_staff_request(self, sessions):
        sess, _ = sessions["office"]
        r = sess.get(f"{API}/attendance/regularizations", params={"status": "pending"}, timeout=10)
        assert r.status_code == 200, r.text
        ids = [x["id"] for x in r.json()["requests"]]
        assert pytest.reg_id in ids

    def test_staff_cannot_approve_own(self, sessions):
        sess, _ = sessions["staff"]
        r = sess.patch(f"{API}/attendance/regularizations/{pytest.reg_id}",
                       json={"status": "approved"}, timeout=10)
        assert r.status_code == 403

    def test_office_admin_approves_and_creates_attendance(self, sessions):
        sess, _ = sessions["office"]
        r = sess.patch(f"{API}/attendance/regularizations/{pytest.reg_id}",
                       json={"status": "approved", "note": "ok"}, timeout=10)
        assert r.status_code == 200, r.text
        rec = db_run(lambda d: d.attendance.find_one(
            {"user_id": pytest.staff_id, "date": pytest.reg_date}))
        assert rec is not None
        assert rec.get("status") == "weekoff"
        assert rec.get("regularized") is True

    def test_office_admin_out_of_office_reject(self, sessions):
        _, ou = sessions["office"]
        fake_id = "TEST_reg_other_office_65"
        other_office = "KM_TCR" if ou.get("office") != "KM_TCR" else "KM_KMLY"
        db_run(lambda d: d.attendance_regularizations.insert_one({
            "id": fake_id, "user_id": "TEST_ghost_user", "user_name": "Ghost",
            "user_role": "staff", "office": other_office, "date": _past_working_day(5),
            "kind": "weekoff", "leave_type": None, "reason": "t", "status": "pending",
            "created_at": datetime.utcnow().isoformat(),
        }))
        sess = sessions["office"][0]
        r = sess.patch(f"{API}/attendance/regularizations/{fake_id}",
                       json={"status": "approved"}, timeout=10)
        assert r.status_code == 403

    def test_reject_does_not_create_attendance(self, sessions):
        sess_staff, stu = sessions["staff"]
        past = _past_working_day(6)
        async def _clean(d):
            await d.attendance_regularizations.delete_many({"user_id": stu["id"], "date": past})
            await d.attendance.delete_many({"user_id": stu["id"], "date": past})
        db_run(_clean)
        rc = sess_staff.post(f"{API}/attendance/regularize",
                             json={"date": past, "kind": "leave", "leave_type": "casual",
                                   "reason": "TEST iter65 reject"}, timeout=10)
        assert rc.status_code == 201
        rid = rc.json()["request"]["id"]
        pytest.reg_reject_id = rid
        pytest.reg_reject_date = past
        sess_off, _ = sessions["office"]
        rr = sess_off.patch(f"{API}/attendance/regularizations/{rid}",
                            json={"status": "rejected", "note": "no"}, timeout=10)
        assert rr.status_code == 200
        att = db_run(lambda d: d.attendance.find_one({"user_id": stu["id"], "date": past}))
        assert att is None

    def test_approved_reg_counts_paid_in_payroll(self, sessions):
        sess_off, _ = sessions["office"]
        month = pytest.reg_date[:7]
        y, m = int(month[:4]), int(month[5:7])
        working = sum(1 for d in range(1, calendar.monthrange(y, m)[1] + 1)
                      if date(y, m, d).weekday() != 6)
        db_run(lambda d: d.staff_salaries.update_one(
            {"user_id": pytest.staff_id},
            {"$set": {"user_id": pytest.staff_id, "monthly_salary": 30000.0,
                      "office": pytest.staff_office, "updated_at": datetime.utcnow().isoformat()}},
            upsert=True,
        ))
        r = sess_off.get(f"{API}/attendance/payroll", params={"month": month}, timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]
        row = next((x for x in rows if x["user_id"] == pytest.staff_id), None)
        assert row is not None
        assert row["paid_days"] >= 1, f"expected paid_days>=1, got {row}"
        per_day = round(30000 / working, 2)
        max_absent_deduction = round(per_day * working, 2)
        assert row["deduction"] <= max_absent_deduction - per_day + 0.01


def test_zzz_cleanup(sessions):
    _, stu = sessions["staff"]
    today = _today_ist()
    dates = [today, getattr(pytest, "reg_date", None), getattr(pytest, "reg_reject_date", None)]
    async def _clean(d):
        for ds in dates:
            if ds:
                await d.attendance.delete_many({"user_id": stu["id"], "date": ds})
                await d.attendance_regularizations.delete_many({"user_id": stu["id"], "date": ds})
        await d.attendance_regularizations.delete_many({"id": "TEST_reg_other_office_65"})
        await d.staff_salaries.delete_many({"user_id": stu["id"]})
    db_run(_clean)
