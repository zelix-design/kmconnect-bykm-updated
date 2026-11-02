# SC Settled / Credited from College feature: POST /api/students/{id}/sc-settle & /sc-unsettle
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
STUDENT_ID = "6cb768ec-cf8c-46de-b20e-481fbc1dc83a"  # SOURAV C M


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def sa():
    return _login("muneer@kmfoundation.co", "kmf@0786")


@pytest.fixture(scope="module")
def accs(sa):
    """Two throwaway ZZ_TMP accounts for the super admin, deleted after."""
    ids = []
    for n in ("ZZ_TMP_SC_A", "ZZ_TMP_SC_B"):
        r = sa.post(f"{API}/accounts", json={"name": n, "type": "bank", "opening_balance": 0})
        assert r.status_code in (200, 201), r.text
        ids.append(r.json()["id"])
    yield ids
    # cleanup: undo settlement + delete accounts
    st = sa.get(f"{API}/students/{STUDENT_ID}").json()
    if st.get("sc_settled"):
        sa.post(f"{API}/students/{STUDENT_ID}/sc-unsettle")
    for i in ids:
        sa.delete(f"{API}/accounts/{i}")


def _bal(sa, acc_id):
    for a in sa.get(f"{API}/accounts").json():
        if a["id"] == acc_id:
            return float(a.get("current_balance") or 0)
    raise AssertionError("account missing")


def _settle_txs(sa):
    r = sa.get(f"{API}/transactions", params={"limit": 1000})
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    return [t for t in items if t.get("is_sc_settlement") and t.get("linked_student_id") == STUDENT_ID], items


class TestScSettlement:
    def test_initial_state_pending(self, sa, accs):
        s = sa.get(f"{API}/students/{STUDENT_ID}").json()
        assert s["sc_earned_effective"] > 0
        assert not s.get("sc_settled")

    def test_amount_zero_rejected(self, sa, accs):
        r = sa.post(f"{API}/students/{STUDENT_ID}/sc-settle", json={"amount": 0, "account_id": accs[0]})
        assert r.status_code == 400
        r = sa.post(f"{API}/students/{STUDENT_ID}/sc-settle", json={"amount": -5, "account_id": accs[0]})
        assert r.status_code == 400

    def test_settle_credit_and_balance(self, sa, accs):
        _, before_all = _settle_txs(sa)
        payout_before = sorted(t["id"] for t in before_all if t.get("is_sc_payout"))
        b0 = _bal(sa, accs[0])
        r = sa.post(f"{API}/students/{STUDENT_ID}/sc-settle",
                    json={"amount": 1234.5, "account_id": accs[0], "date": "2026-01-10", "payment_mode": "upi"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["sc_settled"] is True
        assert d["sc_settlement"]["amount"] == 1234.5
        assert d["sc_settlement"]["account_id"] == accs[0]
        assert d["sc_settlement"]["payment_mode"] == "upi"
        assert abs(_bal(sa, accs[0]) - b0 - 1234.5) < 0.01
        txs, after_all = _settle_txs(sa)
        assert len(txs) == 1
        t = txs[0]
        assert t["type"] == "income" and t["account_id"] == accs[0]
        assert t["description"] == "SC received from college — SOURAV C M"
        assert t["id"] == d["sc_settlement"]["tx_id"]
        assert sorted(x["id"] for x in after_all if x.get("is_sc_payout")) == payout_before

    def test_get_persisted(self, sa, accs):
        s = sa.get(f"{API}/students/{STUDENT_ID}").json()
        assert s["sc_settled"] is True and s["sc_settlement"]["amount"] == 1234.5

    def test_resettle_idempotent(self, sa, accs):
        sa.post(f"{API}/students/{STUDENT_ID}/sc-settle", json={"amount": 1234.5, "account_id": accs[0]})
        txs, _ = _settle_txs(sa)
        assert len(txs) == 1
        assert abs(_bal(sa, accs[0]) - 1234.5) < 0.01

    def test_edit_repoints_single_tx(self, sa, accs):
        r = sa.post(f"{API}/students/{STUDENT_ID}/sc-settle",
                    json={"amount": 999, "account_id": accs[1], "date": "2026-01-11", "payment_mode": "cash"})
        assert r.status_code == 200
        txs, _ = _settle_txs(sa)
        assert len(txs) == 1 and txs[0]["account_id"] == accs[1] and txs[0]["amount"] == 999
        assert abs(_bal(sa, accs[0])) < 0.01
        assert abs(_bal(sa, accs[1]) - 999) < 0.01

    def test_list_shows_sc_settled(self, sa, accs):
        r = sa.get(f"{API}/students", params={"limit": 1000})
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        row = next((x for x in items if x["id"] == STUDENT_ID), None)
        if row is None:
            pytest.skip("student not in first page")
        assert row.get("sc_settled") is True

    def test_unsettle_reverts(self, sa, accs):
        _, before_all = _settle_txs(sa)
        payout_before = sorted(t["id"] for t in before_all if t.get("is_sc_payout"))
        r = sa.post(f"{API}/students/{STUDENT_ID}/sc-unsettle")
        assert r.status_code == 200
        d = r.json()
        assert d["sc_settled"] is False and not d.get("sc_settlement")
        txs, after_all = _settle_txs(sa)
        assert len(txs) == 0
        assert abs(_bal(sa, accs[1])) < 0.01
        assert sorted(x["id"] for x in after_all if x.get("is_sc_payout")) == payout_before

    def test_unsettle_twice_safe(self, sa, accs):
        r = sa.post(f"{API}/students/{STUDENT_ID}/sc-unsettle")
        assert r.status_code == 200 and r.json()["sc_settled"] is False

    def test_nonexistent_student_404(self, sa, accs):
        r = sa.post(f"{API}/students/does-not-exist/sc-settle", json={"amount": 10, "account_id": accs[0]})
        assert r.status_code == 404

    def test_bogus_account_id(self, sa, accs):
        """Records behaviour: settling into an account the user doesn't own."""
        r = sa.post(f"{API}/students/{STUDENT_ID}/sc-settle", json={"amount": 10, "account_id": "bogus-acc-id"})
        code = r.status_code
        if code == 200:
            sa.post(f"{API}/students/{STUDENT_ID}/sc-unsettle")
        assert code in (400, 404), f"bogus account accepted with {code}"
