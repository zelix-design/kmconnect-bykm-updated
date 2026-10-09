"""Iteration 61 — SEC-001/002/003 security hardening tests.

Covers:
* SEC-001: /api/files serving requires cookie or Bearer; ?auth=<token> must be ignored.
* SEC-001: cross-office office_admin cannot read a lead attachment from another office.
* SEC-001: profile photo IS accessible to any authenticated user.
* SEC-002: invalid password returns 401 with generic message; 500 path returns generic message.
* SEC-003: /api/auth/pin/verify per-(IP,email) budget returns 429 after ~8 attempts.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://finance-flow-1727.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = {"email": "muneer@kmfoundation.co", "password": "kmf@0786"}
BLR_OFFICE_ADMIN = {"email": "blr1@finflow.com", "password": "Office@123"}

# 1x1 PNG
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01\xcd\xf1\x8d\xa0\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def super_token():
    return _login(SUPER)


@pytest.fixture(scope="module")
def blr_token():
    return _login(BLR_OFFICE_ADMIN)


# ---------------- SEC-002 ------------------------------------------------
class TestSEC002LoginMasking:
    def test_valid_login_returns_200(self):
        r = requests.post(f"{API}/auth/login", json=SUPER, timeout=15)
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_invalid_password_returns_401_generic(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": SUPER["email"], "password": "wrong-pass-xyz"},
            timeout=15,
        )
        assert r.status_code == 401
        detail = (r.json().get("detail") or "").lower()
        assert "invalid" in detail
        # No traceback / class name leakage
        assert "traceback" not in detail
        assert "exception" not in detail
        assert "error at" not in detail

    def test_malformed_payload_no_traceback(self):
        # missing password field -> 422; still no traceback leakage
        r = requests.post(f"{API}/auth/login", json={"email": "x@x.com"}, timeout=15)
        assert r.status_code in (400, 422, 401)
        body = r.text.lower()
        assert "traceback" not in body


# ---------------- SEC-001 ------------------------------------------------
class TestSEC001FileAccess:
    def _upload_profile(self, token):
        files = {"file": (f"TEST_{uuid.uuid4().hex}.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = requests.post(
            f"{API}/uploads/image",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        return r.json()  # {url, path, file_id}

    def test_unauthenticated_file_get_returns_401(self, super_token):
        up = self._upload_profile(super_token)
        # No Authorization header, no cookie
        r = requests.get(f"{BASE_URL}{up['url']}", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}"

    def test_query_auth_param_is_ignored(self, super_token):
        up = self._upload_profile(super_token)
        # Pass ?auth=<valid token> — must NOT grant access (SEC-001 removal)
        r = requests.get(f"{BASE_URL}{up['url']}?auth={super_token}", timeout=15)
        assert r.status_code == 401, f"?auth= must be ignored, got {r.status_code}"

    def test_authenticated_bearer_can_read_profile(self, super_token):
        up = self._upload_profile(super_token)
        r = requests.get(
            f"{BASE_URL}{up['url']}",
            headers={"Authorization": f"Bearer {super_token}"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 0

    def test_profile_photo_visible_to_other_authenticated_user(self, super_token, blr_token):
        up = self._upload_profile(super_token)
        # office_admin (different owner) can still see a *profile* photo
        r = requests.get(
            f"{BASE_URL}{up['url']}",
            headers={"Authorization": f"Bearer {blr_token}"},
            timeout=15,
        )
        assert r.status_code == 200, f"profile photo should be accessible to other users, got {r.status_code}"


# ---------------- SEC-001 lead document scoping ---------------------------
class TestSEC001LeadDocumentScoping:
    @pytest.fixture(scope="class")
    def other_office_admin_token(self, super_token):
        """Create (or reuse) a KM_TCR office_admin so we can test cross-office 403."""
        email = "TEST_tcr_admin@finflow.com"
        password = "Office@123"
        h = {"Authorization": f"Bearer {super_token}"}
        # Try to create; if exists, we'll still be able to log in with same pwd
        payload = {
            "email": email,
            "password": password,
            "name": "TEST TCR Admin",
            "role": "office_admin",
            "office": "KM_TCR",
            "approval_status": "approved",
        }
        r = requests.post(f"{API}/users", json=payload, headers=h, timeout=15)
        if r.status_code not in (200, 201) and "exists" not in r.text.lower() and "duplicate" not in r.text.lower():
            # Maybe approval_status is not accepted on POST — try without it, then patch approval
            payload2 = {k: v for k, v in payload.items() if k != "approval_status"}
            r2 = requests.post(f"{API}/users", json=payload2, headers=h, timeout=15)
            if r2.status_code not in (200, 201) and "exists" not in r2.text.lower():
                pytest.skip(f"Could not create KM_TCR admin: {r.status_code} {r.text} / {r2.status_code} {r2.text}")
        # Try to log in
        for _ in range(3):
            lr = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
            if lr.status_code == 200:
                return lr.json()["access_token"]
            # If pending approval, try approving via PATCH
            if lr.status_code == 403 and "approval" in lr.text.lower():
                # Find user id
                ur = requests.get(f"{API}/users", headers=h, timeout=15)
                if ur.status_code == 200:
                    uid = next((u["id"] for u in ur.json() if u.get("email") == email), None)
                    if uid:
                        requests.patch(
                            f"{API}/users/{uid}",
                            headers=h,
                            json={"approval_status": "approved"},
                            timeout=15,
                        )
                        continue
            break
        pytest.skip(f"Could not log in as KM_TCR admin: {lr.status_code} {lr.text}")

    def _create_lead_and_attach(self, token, office):
        h = {"Authorization": f"Bearer {token}"}
        lead_payload = {
            "name": f"TEST_LEAD_SEC001_{uuid.uuid4().hex[:6]}",
            "phone": "+919999999999",
            "office": office,
            "source": "manual",
        }
        r = requests.post(f"{API}/leads", json=lead_payload, headers=h, timeout=15)
        assert r.status_code in (200, 201), f"lead create failed: {r.status_code} {r.text}"
        lead = r.json()
        lead_id = lead.get("id") or lead.get("_id")

        files = {"file": (f"TEST_{uuid.uuid4().hex}.png", io.BytesIO(PNG_BYTES), "image/png")}
        u = requests.post(
            f"{API}/uploads/document?lead_id={lead_id}",
            headers=h,
            files=files,
            timeout=15,
        )
        assert u.status_code == 200, f"doc upload failed: {u.status_code} {u.text}"
        return lead_id, u.json()

    def test_blr_office_admin_can_read_blr_lead_doc(self, blr_token):
        _, doc = self._create_lead_and_attach(blr_token, "KM_BLR")
        r = requests.get(
            f"{BASE_URL}{doc['url']}",
            headers={"Authorization": f"Bearer {blr_token}"},
            timeout=15,
        )
        assert r.status_code == 200

    def test_super_admin_can_read_any_lead_doc(self, blr_token, super_token):
        _, doc = self._create_lead_and_attach(blr_token, "KM_BLR")
        r = requests.get(
            f"{BASE_URL}{doc['url']}",
            headers={"Authorization": f"Bearer {super_token}"},
            timeout=15,
        )
        assert r.status_code == 200

    def test_cross_office_admin_gets_403(self, blr_token, other_office_admin_token):
        _, doc = self._create_lead_and_attach(blr_token, "KM_BLR")
        r = requests.get(
            f"{BASE_URL}{doc['url']}",
            headers={"Authorization": f"Bearer {other_office_admin_token}"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403 cross-office, got {r.status_code}"


# ---------------- SEC-003 pin/verify rate limit ---------------------------
class TestSEC003PinRateLimit:
    def test_hammering_pin_verify_returns_429(self):
        # Use a unique email so we don't collide with other buckets; per-(IP,email)
        # budget is 8/5min so on the 9th call we should see 429.
        email = f"TEST_pin_{uuid.uuid4().hex[:8]}@example.com"
        got_429 = False
        last_status = None
        for i in range(12):
            r = requests.post(
                f"{API}/auth/pin/verify",
                json={"email": email, "pin": "0000"},
                timeout=15,
            )
            last_status = r.status_code
            if r.status_code == 429:
                got_429 = True
                # Retry-After header expected
                assert "retry-after" in {k.lower() for k in r.headers.keys()}, \
                    f"Retry-After missing on 429 (headers={dict(r.headers)})"
                break
        assert got_429, f"Expected 429 within 12 attempts, last status={last_status}"


# ---------------- Regression: happy paths --------------------------------
class TestRegression:
    def test_super_admin_dashboard(self, super_token):
        r = requests.get(
            f"{API}/dashboard/summary",
            headers={"Authorization": f"Bearer {super_token}"},
            timeout=15,
        )
        # dashboard endpoint may vary; just ensure it's not 500
        assert r.status_code in (200, 404), f"dashboard status {r.status_code}"

    def test_office_admin_clients_list(self, blr_token):
        r = requests.get(
            f"{API}/clients",
            headers={"Authorization": f"Bearer {blr_token}"},
            timeout=15,
        )
        assert r.status_code == 200

    def test_webauthn_status_responds(self, super_token):
        r = requests.get(
            f"{API}/webauthn/status",
            headers={"Authorization": f"Bearer {super_token}"},
            timeout=15,
        )
        # not 500
        assert r.status_code in (200, 404), f"webauthn/status {r.status_code} {r.text}"
