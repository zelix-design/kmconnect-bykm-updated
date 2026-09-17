"""Iteration 66 — Attendance bulk upload + admin upsert + delete + payroll recompute."""
import os
import calendar
from datetime import date

import pytest
import requests

def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # load from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/") + "/api"


BASE = _base()

SUPER = ("muneer@kmfoundation.co", "kmf@0786")
OFFICE_ADMIN = ("blr1@finflow.com", "Office@123")
STAFF = ("staff.blr@kmfoundation.online", "Staff@123")


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def super_s():
    return _login(*SUPER)


@pytest.fixture(scope="module")
def oa_s():
    return _login(*OFFICE_ADMIN)


@pytest.fixture(scope="module")
def staff_info(super_s):
    r = super_s.get(f"{BASE}/users?role=staff&limit=500", timeout=20)
    assert r.status_code == 200
    j = r.json()
    if isinstance(j, dict):
        users = j.get("users") or j.get("items") or []
    else:
        users = j
    blr = next((u for u in users if u.get("email") == STAFF[0]), None)
    other = next((u for u in users
                  if u.get("office") and u.get("office") != "KM_BLR"
                  and u.get("role") in ("staff", "office_admin")), None)
    assert blr, "KM_BLR test staff not found"
    return {"blr": blr, "other": other}


# Use a target month = 2 months back to avoid clashing with today/future rules
def _target_month():
    today = date.today()
    y, m = today.year, today.month - 2
    while m < 1:
        m += 12
        y -= 1
    return f"{y:04d}-{m:02d}"


MONTH = _target_month()


def _pick_dates():
    y, m = int(MONTH[:4]), int(MONTH[5:7])
    days = [d for d in range(1, calendar.monthrange(y, m)[1] + 1) if date(y, m, d).weekday() != 6]
    return [f"{MONTH}-{d:02d}" for d in days[:3]]


D1, D2, D3 = _pick_dates()


# --- Bulk attendance upload ---
class TestBulkAttendance:
    def test_super_bulk_create(self, super_s, staff_info):
        email = staff_info["blr"]["email"]
        csv = f"email,date,status,check_in,check_out\n{email},{D1},present,10:05,19:00\n{email},{D2},leave,,"
        r = super_s.post(f"{BASE}/attendance/bulk", json={"kind": "attendance", "csv": csv}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["error_count"] == 0
        assert data["created"] + data["updated"] == 2

    def test_super_bulk_overwrite(self, super_s, staff_info):
        email = staff_info["blr"]["email"]
        csv = f"email,date,status,check_in,check_out\n{email},{D1},late,10:20,18:00"
        r = super_s.post(f"{BASE}/attendance/bulk", json={"kind": "attendance", "csv": csv}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["updated"] >= 1 and data["created"] == 0
        # Verify via list
        r2 = super_s.get(f"{BASE}/attendance?month={MONTH}&user_id={staff_info['blr']['id']}", timeout=20)
        recs = r2.json()["records"]
        rec = next((x for x in recs if x["date"] == D1), None)
        assert rec and rec["status"] == "late"

    def test_bulk_invalid_status(self, super_s, staff_info):
        email = staff_info["blr"]["email"]
        csv = f"email,date,status\n{email},{D3},bogus_status"
        r = super_s.post(f"{BASE}/attendance/bulk", json={"kind": "attendance", "csv": csv}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["error_count"] >= 1
        assert any("invalid status" in e.lower() for e in data["errors"])

    def test_office_admin_scope_error(self, oa_s, staff_info):
        if not staff_info.get("other"):
            pytest.skip("No non-KM_BLR staff available to test cross-office scope")
        email = staff_info["other"]["email"]
        csv = f"email,date,status\n{email},{D3},present"
        r = oa_s.post(f"{BASE}/attendance/bulk", json={"kind": "attendance", "csv": csv}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["error_count"] >= 1
        assert any("outside" in e.lower() for e in data["errors"])

    def test_office_admin_can_upload_own_office(self, oa_s, staff_info):
        email = staff_info["blr"]["email"]
        csv = f"email,date,status,check_in,check_out\n{email},{D3},half_day,10:00,13:30"
        r = oa_s.post(f"{BASE}/attendance/bulk", json={"kind": "attendance", "csv": csv}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["error_count"] == 0
        assert (data["created"] + data["updated"]) == 1


# --- Bulk salaries upload ---
class TestBulkSalaries:
    def test_bulk_salary_upsert(self, super_s, staff_info):
        email = staff_info["blr"]["email"]
        csv = f"email,monthly_salary\n{email},28000"
        r = super_s.post(f"{BASE}/attendance/bulk", json={"kind": "salaries", "csv": csv}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["error_count"] == 0
        assert data["updated"] == 1

        # Verify payroll reflects it
        r2 = super_s.get(f"{BASE}/attendance/payroll?month={MONTH}&office=KM_BLR", timeout=30)
        assert r2.status_code == 200
        rows = r2.json()["rows"]
        row = next((x for x in rows if x["user_id"] == staff_info["blr"]["id"]), None)
        assert row and row["monthly_salary"] == 28000


# --- Admin upsert ---
class TestAdminUpsert:
    def test_upsert_create(self, super_s, staff_info):
        payload = {"user_id": staff_info["blr"]["id"], "date": D3, "status": "present",
                   "check_in": "10:00", "check_out": "19:30"}
        r = super_s.post(f"{BASE}/attendance/admin/upsert", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        # verify
        r2 = super_s.get(f"{BASE}/attendance?month={MONTH}&user_id={staff_info['blr']['id']}", timeout=20)
        rec = next((x for x in r2.json()["records"] if x["date"] == D3), None)
        assert rec and rec["status"] == "present"

    def test_upsert_invalid_status(self, super_s, staff_info):
        r = super_s.post(f"{BASE}/attendance/admin/upsert",
                         json={"user_id": staff_info["blr"]["id"], "date": D3, "status": "nope"}, timeout=20)
        assert r.status_code == 400

    def test_upsert_office_admin_out_of_scope(self, oa_s, staff_info):
        if not staff_info.get("other"):
            pytest.skip("No cross-office staff")
        r = oa_s.post(f"{BASE}/attendance/admin/upsert",
                      json={"user_id": staff_info["other"]["id"], "date": D3, "status": "present"}, timeout=20)
        assert r.status_code == 403


# --- Delete record ---
class TestDelete:
    def test_office_admin_delete_own_office(self, oa_s, super_s, staff_info):
        # Create a record via bulk first
        email = staff_info["blr"]["email"]
        csv = f"email,date,status\n{email},{D2},weekoff"
        super_s.post(f"{BASE}/attendance/bulk", json={"kind": "attendance", "csv": csv}, timeout=30)
        r2 = oa_s.get(f"{BASE}/attendance?month={MONTH}&user_id={staff_info['blr']['id']}", timeout=20)
        rec = next((x for x in r2.json()["records"] if x["date"] == D2), None)
        assert rec, "record should exist"
        r = oa_s.delete(f"{BASE}/attendance/{rec['id']}", timeout=20)
        assert r.status_code == 200
        # verify gone
        r3 = oa_s.get(f"{BASE}/attendance?month={MONTH}&user_id={staff_info['blr']['id']}", timeout=20)
        assert not any(x["date"] == D2 for x in r3.json()["records"])

    def test_office_admin_delete_out_of_scope(self, oa_s, super_s, staff_info):
        if not staff_info.get("other"):
            pytest.skip("No cross-office staff")
        # Create record for cross-office as super
        payload = {"user_id": staff_info["other"]["id"], "date": D1, "status": "present"}
        super_s.post(f"{BASE}/attendance/admin/upsert", json=payload, timeout=20)
        r2 = super_s.get(f"{BASE}/attendance?month={MONTH}&user_id={staff_info['other']['id']}", timeout=20)
        rec = next((x for x in r2.json()["records"] if x["date"] == D1), None)
        if not rec:
            pytest.skip("Setup failed")
        r = oa_s.delete(f"{BASE}/attendance/{rec['id']}", timeout=20)
        assert r.status_code == 403
        # cleanup
        super_s.delete(f"{BASE}/attendance/{rec['id']}", timeout=20)


# --- Payroll recompute ---
class TestPayroll:
    def test_payroll_reflects_changes(self, super_s, staff_info):
        # Set up: D1=late, D3=half_day (from earlier tests still present) — recompute
        r = super_s.get(f"{BASE}/attendance/payroll?month={MONTH}&office=KM_BLR", timeout=30)
        assert r.status_code == 200
        row = next((x for x in r.json()["rows"] if x["user_id"] == staff_info["blr"]["id"]), None)
        assert row is not None
        # present_days should include D1 (late), half_days should include D3
        # D3 was overwritten by admin/upsert to 'present', so half_days may be 0.
        assert row["present_days"] >= 2  # D1(late) + D3(present) both count in present_days
        assert row["monthly_salary"] == 28000
        # deduction is non-negative float
        assert row["deduction"] >= 0


# --- Cleanup ---
class TestZZZCleanup:
    def test_cleanup(self, super_s, staff_info):
        for uid in [staff_info["blr"]["id"]] + ([staff_info["other"]["id"]] if staff_info.get("other") else []):
            r = super_s.get(f"{BASE}/attendance?month={MONTH}&user_id={uid}", timeout=20)
            for rec in r.json().get("records", []):
                super_s.delete(f"{BASE}/attendance/{rec['id']}", timeout=15)
        # Reset salary to 0 (or leave? Leaving as-is per common test practice; delete via direct db not exposed)
        # We'll just log it — no salary delete endpoint.
