"""Attendance & Payroll module tests (iteration 63)."""
import os
import calendar
from datetime import date, datetime
from zoneinfo import ZoneInfo
import pytest
import requests

def _read_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1].rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _read_backend_url()
API = f"{BASE}/api"
TZ = ZoneInfo("Asia/Kolkata")

SUPER = {"email": "muneer@kmfoundation.co", "password": "kmf@0786"}
OFFICE_ADMIN = {"email": "blr1@finflow.com", "password": "Office@123"}
STAFF = {"email": "staff.blr@kmfoundation.online", "password": "Staff@123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="module")
def super_client():
    return _login(SUPER)


@pytest.fixture(scope="module")
def office_client():
    return _login(OFFICE_ADMIN)


@pytest.fixture(scope="module")
def staff_client():
    return _login(STAFF)


def _month_str():
    d = datetime.now(TZ)
    return f"{d.year:04d}-{d.month:02d}"


def _working_days(month):
    y, m = int(month[:4]), int(month[5:7])
    n = calendar.monthrange(y, m)[1]
    return sum(1 for d in range(1, n + 1) if date(y, m, d).weekday() != 6)


# ---------- health / basic access ----------
def test_super_can_list_payroll_all_offices(super_client):
    s, _ = super_client
    r = s.get(f"{API}/attendance/payroll", params={"month": _month_str()})
    assert r.status_code == 200
    data = r.json()
    assert "rows" in data and isinstance(data["rows"], list)


def test_office_admin_payroll_is_scoped(office_client):
    s, u = office_client
    r = s.get(f"{API}/attendance/payroll", params={"month": _month_str()})
    assert r.status_code == 200
    for row in r.json()["rows"]:
        assert row["office"] == u["office"] == "KM_BLR"


def test_staff_forbidden_from_payroll(staff_client):
    s, _ = staff_client
    r = s.get(f"{API}/attendance/payroll", params={"month": _month_str()})
    assert r.status_code == 403


def test_today_endpoint(office_client):
    s, _ = office_client
    r = s.get(f"{API}/attendance/today")
    assert r.status_code == 200
    assert "record" in r.json()


# ---------- check-in / out flow using staff account ----------
def test_staff_check_in_and_duplicate(staff_client):
    s, u = staff_client
    # First remove any existing today record so test is idempotent — via admin patch is complex,
    # so just call and tolerate either success or "Already checked in".
    r = s.post(f"{API}/attendance/check-in", json={"lat": None, "lng": None})
    if r.status_code == 400 and "Already" in r.text:
        # ok - already checked in from prior run
        pass
    else:
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["user_id"] == u["id"]
        assert rec["check_in"]
        assert rec["status"] in ("present", "late")

    # duplicate must 400
    r2 = s.post(f"{API}/attendance/check-in", json={"lat": None, "lng": None})
    assert r2.status_code == 400
    assert "Already" in r2.text


def test_staff_check_out(staff_client):
    s, _ = staff_client
    # ensure checked in
    s.post(f"{API}/attendance/check-in", json={"lat": None, "lng": None})
    r = s.post(f"{API}/attendance/check-out")
    # first checkout ok; if already checked out earlier we accept 400
    assert r.status_code in (200, 400), r.text
    if r.status_code == 200:
        rec = r.json()["record"]
        assert rec["check_out"]
        assert rec["work_seconds"] >= 0


# ---------- salary + payroll math ----------
def test_set_salary_and_payroll_math(office_client):
    s, admin = office_client
    # find a staff user in KM_BLR
    ru = s.get(f"{API}/users")
    assert ru.status_code == 200
    users = ru.json() if isinstance(ru.json(), list) else ru.json().get("users", [])
    target = next(
        (u for u in users if u.get("role") == "staff" and u.get("office") == "KM_BLR"),
        None,
    )
    assert target, "no staff user found in KM_BLR"
    uid = target["id"]

    # set salary
    r = s.put(f"{API}/attendance/salary/{uid}", json={"monthly_salary": 26000})
    assert r.status_code == 200, r.text

    month = _month_str()
    wd = _working_days(month)
    r2 = s.get(f"{API}/attendance/payroll", params={"month": month})
    assert r2.status_code == 200
    row = next((x for x in r2.json()["rows"] if x["user_id"] == uid), None)
    assert row, "target not present in payroll"
    assert row["working_days"] == wd
    assert row["monthly_salary"] == 26000
    expected_per_day = round(26000 / wd, 2)
    assert abs(row["per_day"] - expected_per_day) < 0.02
    expected_absent = round(row["working_days"] - row["paid_days"], 1)
    assert abs(row["absent_days"] - expected_absent) < 0.05
    expected_deduction = round(row["per_day"] * row["absent_days"], 2)
    # allow tiny rounding drift
    assert abs(row["deduction"] - expected_deduction) < 1.0
    assert abs(row["net_pay"] - (26000 - row["deduction"])) < 1.0


def test_office_admin_cannot_set_salary_other_office(office_client, super_client):
    oa_s, _ = office_client
    sup_s, _ = super_client
    users = sup_s.get(f"{API}/users").json()
    users = users if isinstance(users, list) else users.get("users", [])
    other = next(
        (u for u in users if u.get("role") in ("staff", "office_admin") and u.get("office") and u["office"] != "KM_BLR"),
        None,
    )
    if not other:
        pytest.skip("No non-BLR staff to test scope")
    r = oa_s.put(f"{API}/attendance/salary/{other['id']}", json={"monthly_salary": 100})
    assert r.status_code == 403


def test_payslip_endpoint(office_client):
    s, _ = office_client
    month = _month_str()
    rows = s.get(f"{API}/attendance/payroll", params={"month": month}).json()["rows"]
    if not rows:
        pytest.skip("No payroll rows")
    uid = rows[0]["user_id"]
    r = s.get(f"{API}/attendance/payslip/{uid}", params={"month": month})
    assert r.status_code == 200
    j = r.json()
    assert j["month"] == month
    assert j["staff"]["id"] == uid
    assert j["payslip"]["user_id"] == uid


def test_super_admin_office_filter(super_client):
    s, _ = super_client
    month = _month_str()
    all_rows = s.get(f"{API}/attendance/payroll", params={"month": month}).json()["rows"]
    blr = s.get(f"{API}/attendance/payroll", params={"month": month, "office": "KM_BLR"}).json()["rows"]
    assert all(r["office"] == "KM_BLR" for r in blr)
    assert len(blr) <= len(all_rows)
