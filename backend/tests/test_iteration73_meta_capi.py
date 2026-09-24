"""Tests for Meta Conversions API integration (iteration 73).

Covers:
- GET /api/integrations/meta/settings masks token, admin-only
- PUT /api/integrations/meta/settings: save + preserve token on blank
- POST /api/integrations/meta/test: clean 400 with fake creds
- POST /api/leads/{id}/meta/send-lead: admin-only, clean 400 on fake creds
"""
import os
import pytest
import requests

def _load_backend_url():
    from pathlib import Path
    env = Path("/app/frontend/.env")
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE_URL = _load_backend_url().rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

SUPER = ("muneer@kmfoundation.co", "kmf@0786")
OFFICE = ("blr1@finflow.com", "Office@123")
STAFF = ("staff.blr@kmfoundation.online", "Staff@123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def super_token():
    return _login(*SUPER)


@pytest.fixture(scope="module")
def office_token():
    return _login(*OFFICE)


@pytest.fixture(scope="module")
def staff_token():
    return _login(*STAFF)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- GET settings ----------
class TestMetaSettingsGet:
    def test_get_settings_super_admin_masked(self, super_token):
        r = requests.get(f"{API}/integrations/meta/settings", headers=_h(super_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # Must never leak access_token
        assert "access_token" not in data
        # Required masked fields
        for k in ("configured", "has_token", "pixel_id", "test_event_code"):
            assert k in data, f"missing {k}"
        assert isinstance(data["has_token"], bool)

    def test_get_settings_office_admin_ok(self, office_token):
        r = requests.get(f"{API}/integrations/meta/settings", headers=_h(office_token), timeout=10)
        assert r.status_code == 200
        assert "access_token" not in r.json()

    def test_get_settings_staff_forbidden(self, staff_token):
        r = requests.get(f"{API}/integrations/meta/settings", headers=_h(staff_token), timeout=10)
        assert r.status_code == 403


# ---------- PUT settings ----------
class TestMetaSettingsPut:
    def test_put_and_preserve_token_on_blank(self, super_token):
        # First save with a fake token
        body1 = {
            "pixel_id": "123456789012345",
            "access_token": "FAKE_TOKEN_ABCDEFG",
            "test_event_code": "TEST12345",
            "enabled": True,
            "default_country_code": "+91",
        }
        r1 = requests.put(f"{API}/integrations/meta/settings", headers=_h(super_token), json=body1, timeout=10)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["has_token"] is True
        assert d1["pixel_id"] == "123456789012345"
        assert "access_token" not in d1

        # Second save with blank token — must preserve prior token
        body2 = {
            "pixel_id": "123456789012345",
            "access_token": "",
            "test_event_code": "TEST99999",
            "enabled": True,
            "default_country_code": "+91",
        }
        r2 = requests.put(f"{API}/integrations/meta/settings", headers=_h(super_token), json=body2, timeout=10)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["has_token"] is True, "Blank token must preserve existing"
        assert d2["test_event_code"] == "TEST99999"

        # GET to verify persistence
        r3 = requests.get(f"{API}/integrations/meta/settings", headers=_h(super_token), timeout=10)
        d3 = r3.json()
        assert d3["has_token"] is True
        assert d3["test_event_code"] == "TEST99999"

    def test_put_settings_staff_forbidden(self, staff_token):
        r = requests.put(
            f"{API}/integrations/meta/settings",
            headers=_h(staff_token),
            json={"pixel_id": "x", "access_token": "y", "test_event_code": "z", "enabled": True},
            timeout=10,
        )
        assert r.status_code == 403


# ---------- POST test event ----------
class TestMetaSendTest:
    def test_send_test_with_fake_creds_returns_clean_400(self, super_token):
        # Ensures settings are configured (from previous test); fake token -> Meta returns error -> our API returns 400
        r = requests.post(f"{API}/integrations/meta/test", headers=_h(super_token), json={}, timeout=25)
        assert r.status_code == 400, f"Expected clean 400, got {r.status_code}: {r.text}"
        # detail should contain Meta's error message string (or a fallback), NOT be a 500 crash
        body = r.json()
        assert "detail" in body

    def test_send_test_staff_forbidden(self, staff_token):
        r = requests.post(f"{API}/integrations/meta/test", headers=_h(staff_token), json={}, timeout=10)
        assert r.status_code == 403


# ---------- Manual send-lead ----------
class TestMetaSendLeadManual:
    @pytest.fixture(scope="class")
    def converted_lead_id(self, super_token):
        # Find any converted lead visible to super admin
        r = requests.get(f"{API}/leads?status=converted&limit=5", headers=_h(super_token), timeout=15)
        if r.status_code != 200:
            pytest.skip(f"leads list failed: {r.status_code}")
        items = r.json() if isinstance(r.json(), list) else r.json().get("items") or r.json().get("leads") or []
        if not items:
            pytest.skip("No converted lead available")
        return items[0]["id"]

    def test_manual_send_admin_returns_clean_400_with_fake_creds(self, super_token, converted_lead_id):
        r = requests.post(
            f"{API}/leads/{converted_lead_id}/meta/send-lead",
            headers=_h(super_token),
            json={},
            timeout=25,
        )
        # With fake creds, Meta rejects -> we should return 400 not 500.
        # If lead has no email/phone we accept 400 also. 404 would mean scope issue.
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_manual_send_staff_forbidden(self, staff_token, converted_lead_id):
        r = requests.post(
            f"{API}/leads/{converted_lead_id}/meta/send-lead",
            headers=_h(staff_token),
            json={},
            timeout=10,
        )
        assert r.status_code == 403


# ---------- Cleanup ----------
def test_cleanup_reset_meta_settings(super_token):
    """Reset stored fake credentials so no fake creds remain in DB."""
    # We can clear via PUT with empty pixel — but blank access_token preserves it.
    # Simpler: use admin PUT with new pixel="" AND expose a way? Not available.
    # Instead, hit an internal cleanup by directly saving empty values via PUT (token blank keeps it).
    # So we set access_token to a sentinel then... The API doesn't allow deleting.
    # Best effort: at least null out pixel & test code (has_token may remain true).
    r = requests.put(
        f"{API}/integrations/meta/settings",
        headers=_h(super_token),
        json={"pixel_id": "", "access_token": "", "test_event_code": "", "enabled": False, "default_country_code": "+91"},
        timeout=10,
    )
    assert r.status_code == 200
    # Confirm not configured (pixel empty => configured False)
    r2 = requests.get(f"{API}/integrations/meta/settings", headers=_h(super_token), timeout=10)
    d = r2.json()
    assert d["configured"] is False
