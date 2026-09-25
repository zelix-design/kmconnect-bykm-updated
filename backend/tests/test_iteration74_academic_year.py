"""Tests for Iteration 74: Global Academic Year feature.

- GET /api/academic-years returns years + current
- Year filter narrows results and is no-op when omitted
- Dashboard summary/cashflow scoped by year
- Endpoints without year handler still 200 when ?year= passed
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

ADMIN_EMAIL = "admin@kmfoundation.online"
ADMIN_PASS = "Admin@786"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def _get(path, headers, **params):
    return requests.get(f"{BASE_URL}{path}", headers=headers, params=params, timeout=30)


# --- academic-years endpoint --------------------------------------------------

def test_academic_years_endpoint(headers):
    r = _get("/api/academic-years", headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "years" in data and "current" in data
    assert isinstance(data["years"], list)
    assert isinstance(data["current"], int)
    assert data["current"] == 2026
    assert 2026 in data["years"]


def test_academic_years_requires_auth():
    r = requests.get(f"{BASE_URL}/api/academic-years", timeout=30)
    assert r.status_code in (401, 403)


# --- year filter regression across list endpoints -----------------------------

@pytest.mark.parametrize("path", [
    "/api/transactions",
    "/api/invoices",
    "/api/students",
    "/api/leads",
    "/api/clients",
])
def test_list_year_filter_noop_and_scope(headers, path):
    all_r = _get(path, headers)
    assert all_r.status_code == 200, f"{path} all failed: {all_r.text}"
    y2026_r = _get(path, headers, year=2026)
    assert y2026_r.status_code == 200, f"{path} 2026 failed: {y2026_r.text}"
    y2020_r = _get(path, headers, year=2020)
    assert y2020_r.status_code == 200, f"{path} 2020 failed: {y2020_r.text}"

    def _rows(resp):
        j = resp.json()
        if isinstance(j, list):
            return j
        for k in ("items", "results", "data", "transactions", "invoices",
                  "students", "leads", "clients"):
            if isinstance(j.get(k), list):
                return j[k]
        return []

    all_rows = _rows(all_r)
    r2026 = _rows(y2026_r)
    r2020 = _rows(y2020_r)

    # 2020 should be empty (all data is calendar year 2026)
    assert len(r2020) == 0, f"{path} 2020 not empty: {len(r2020)}"
    # No-op: omitting year matches 2026
    assert len(all_rows) == len(r2026), (
        f"{path} no-op mismatch all={len(all_rows)} 2026={len(r2026)}"
    )
    # And has data
    assert len(r2026) > 0, f"{path} 2026 unexpectedly empty"


# --- dashboard scoped by year -------------------------------------------------

def test_dashboard_summary_year(headers):
    r26 = _get("/api/dashboard/summary", headers, year=2026)
    assert r26.status_code == 200, r26.text
    d26 = r26.json()
    assert "period_start" in d26 and "period_end" in d26
    assert "2026" in str(d26["period_start"])
    assert "2026" in str(d26["period_end"])

    r20 = _get("/api/dashboard/summary", headers, year=2020)
    assert r20.status_code == 200, r20.text
    d20 = r20.json()
    # zeros in 2020
    zero_keys = [k for k, v in d20.items() if isinstance(v, (int, float))]
    assert zero_keys, "no numeric fields to check"
    for k in zero_keys:
        assert d20[k] == 0, f"expected zero for {k} in 2020, got {d20[k]}"


def test_dashboard_cashflow_year(headers):
    r = _get("/api/dashboard/cashflow", headers, year=2026)
    assert r.status_code == 200, r.text
    j = r.json()
    buckets = j if isinstance(j, list) else (
        j.get("items") or j.get("buckets") or j.get("data") or []
    )
    assert len(buckets) == 12, f"expected 12 monthly buckets, got {len(buckets)}"


# --- regression: endpoints without year handler ignore ?year= -----------------

@pytest.mark.parametrize("path", ["/api/accounts", "/api/auth/me"])
def test_non_year_endpoints_accept_year_param(headers, path):
    r = _get(path, headers, year=2026)
    assert r.status_code == 200, f"{path} broke with ?year=: {r.status_code} {r.text}"
