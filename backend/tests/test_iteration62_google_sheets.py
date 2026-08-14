"""Iteration 62 — Google Sheets lead-import integration tests.

Covers /api/google/* + /api/oauth/sheets/callback graceful behavior when NO
Google account is connected (which is the current state of the seed DB).
"""
from __future__ import annotations

import os
import time
from urllib.parse import parse_qs, urlparse

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

SUPER = ("muneer@kmfoundation.co", "kmf@0786")
OFFICE = ("blr1@finflow.com", "Office@123")


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok, f"no access_token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def super_token() -> str:
    return _login(*SUPER)


@pytest.fixture(scope="module")
def office_token() -> str:
    return _login(*OFFICE)


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------------------------------------------------------- STATUS
class TestGoogleStatus:
    def test_status_super_admin_configured_not_connected(self, super_token):
        r = requests.get(f"{BASE_URL}/api/google/status", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["configured"] is True
        assert data["connected"] is False

    def test_status_office_admin_ok(self, office_token):
        r = requests.get(f"{BASE_URL}/api/google/status", headers=_h(office_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["configured"] is True
        assert d["connected"] is False


# ---------------------------------------------------------------- CONNECT
class TestGoogleConnect:
    def test_connect_super_admin_returns_valid_url(self, super_token):
        r = requests.get(f"{BASE_URL}/api/google/connect", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        url = r.json()["authorization_url"]
        parsed = urlparse(url)
        assert parsed.netloc == "accounts.google.com", parsed.netloc
        q = parse_qs(parsed.query)
        assert q.get("access_type") == ["offline"]
        assert q.get("prompt") == ["consent"]
        redirect_uri = q.get("redirect_uri", [""])[0]
        assert redirect_uri.endswith("/api/oauth/sheets/callback"), redirect_uri
        assert q.get("state"), "state must be present"

    def test_connect_office_admin_allowed(self, office_token):
        # office_admin is admin-level per _require_admin
        r = requests.get(f"{BASE_URL}/api/google/connect", headers=_h(office_token), timeout=15)
        assert r.status_code == 200, r.text
        assert "authorization_url" in r.json()

    def test_connect_staff_forbidden(self, super_token):
        # create a TEST staff user
        staff_email = f"TEST_staff_gs_{int(time.time())}@finflow.com"
        create = requests.post(
            f"{BASE_URL}/api/users",
            headers=_h(super_token),
            json={"name": "TEST Staff GS", "email": staff_email,
                  "password": "Staff@123", "role": "staff", "office": "KM_BLR"},
            timeout=20,
        )
        assert create.status_code in (200, 201), create.text
        # Approve if pending
        uid = create.json().get("id") or create.json().get("user", {}).get("id")
        # Try login (may need approval)
        login = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": staff_email, "password": "Staff@123"}, timeout=15)
        if login.status_code != 200 and uid:
            # try approve
            requests.patch(f"{BASE_URL}/api/users/{uid}",
                           headers=_h(super_token),
                           json={"approval_status": "approved"}, timeout=15)
            login = requests.post(f"{BASE_URL}/api/auth/login",
                                  json={"email": staff_email, "password": "Staff@123"}, timeout=15)
        if login.status_code != 200:
            pytest.skip(f"could not login staff user: {login.status_code} {login.text}")
        staff_tok = login.json()["access_token"]

        r = requests.get(f"{BASE_URL}/api/google/connect", headers=_h(staff_tok), timeout=15)
        assert r.status_code == 403, f"expected 403 for staff, got {r.status_code} {r.text}"

        # cleanup best-effort
        if uid:
            requests.delete(f"{BASE_URL}/api/users/{uid}", headers=_h(super_token), timeout=15)


# ---------------------------------------------------------------- NOT-CONNECTED 404s
class TestNotConnectedGraceful:
    def test_list_spreadsheets_404(self, super_token):
        r = requests.get(f"{BASE_URL}/api/google/spreadsheets", headers=_h(super_token), timeout=15)
        assert r.status_code == 404, f"expected 404 not-connected, got {r.status_code}: {r.text}"
        assert "not connected" in r.text.lower()

    def test_worksheets_404(self, super_token):
        r = requests.get(f"{BASE_URL}/api/google/spreadsheets/fake_id/worksheets",
                         headers=_h(super_token), timeout=15)
        assert r.status_code == 404, r.text

    def test_values_404(self, super_token):
        r = requests.get(f"{BASE_URL}/api/google/spreadsheets/fake_id/values?sheet=Sheet1",
                         headers=_h(super_token), timeout=15)
        assert r.status_code == 404, r.text

    def test_template_404(self, super_token):
        r = requests.post(f"{BASE_URL}/api/google/template",
                          headers=_h(super_token), json={"title": "TEST_template"}, timeout=15)
        assert r.status_code == 404, r.text


# ---------------------------------------------------------------- IMPORT
class TestImport:
    def test_import_bogus_campaign_404(self, super_token):
        r = requests.post(f"{BASE_URL}/api/google/import",
                          headers=_h(super_token),
                          json={"campaign_id": "does_not_exist",
                                "rows": [{"name": "X", "phone": "9999999999"}]},
                          timeout=20)
        assert r.status_code == 404, r.text

    def test_import_valid_campaign_dedup_and_invalid(self, super_token):
        # create a campaign under KM_BLR
        camp_name = f"TEST_camp_gs_{int(time.time())}"
        cr = requests.post(
            f"{BASE_URL}/api/campaigns",
            headers=_h(super_token),
            json={"name": camp_name, "office": "KM_BLR", "source": "google_sheets"},
            timeout=15,
        )
        assert cr.status_code in (200, 201), cr.text
        cid = cr.json().get("id") or cr.json().get("campaign", {}).get("id")
        assert cid, cr.json()

        try:
            unique_phone = f"9{int(time.time()) % 10**9:09d}"
            rows = [
                {"name": "TEST_GS_A", "phone": unique_phone, "place": "BLR"},
                {"name": "TEST_GS_B", "phone": unique_phone, "place": "BLR"},   # dup phone in payload
                {"name": "", "phone": "8888888888"},                              # invalid
                {"name": "TEST_GS_C", "phone": "7777777777", "place": "BLR"},
            ]
            r = requests.post(f"{BASE_URL}/api/google/import",
                              headers=_h(super_token),
                              json={"campaign_id": cid, "rows": rows}, timeout=30)
            assert r.status_code in (200, 201), r.text
            data = r.json()
            for k in ("created_count", "duplicate_count", "invalid_count", "duplicates", "invalids"):
                assert k in data, f"missing key {k} in {data}"
            assert data["invalid_count"] == 1
            assert data["duplicate_count"] >= 1
            assert data["created_count"] >= 2
        finally:
            # cleanup created leads for the campaign
            try:
                lst = requests.get(f"{BASE_URL}/api/leads?campaign_id={cid}",
                                   headers=_h(super_token), timeout=15).json()
                items = lst.get("items") or lst if isinstance(lst, (list, dict)) else []
                if isinstance(items, dict):
                    items = items.get("items", [])
                for L in items:
                    lid = L.get("id")
                    if lid:
                        requests.delete(f"{BASE_URL}/api/leads/{lid}",
                                        headers=_h(super_token), timeout=10)
            except Exception:
                pass
            requests.delete(f"{BASE_URL}/api/campaigns/{cid}",
                            headers=_h(super_token), timeout=15)


# ---------------------------------------------------------------- OAUTH CALLBACK
class TestOAuthCallback:
    def test_callback_with_error_redirects(self):
        r = requests.get(f"{BASE_URL}/api/oauth/sheets/callback?error=access_denied",
                         allow_redirects=False, timeout=15)
        assert r.status_code in (302, 307), r.status_code
        loc = r.headers.get("location", "")
        assert "/settings" in loc and "google=error" in loc, loc

    def test_callback_missing_code_state_redirects(self):
        r = requests.get(f"{BASE_URL}/api/oauth/sheets/callback",
                         allow_redirects=False, timeout=15)
        assert r.status_code in (302, 307)
        loc = r.headers.get("location", "")
        assert "google=error" in loc, loc
