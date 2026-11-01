# SC-to-Client (sc_adjusted) adjustment -> SC payout DEBIT when sc_given (iteration 92)
import os
from collections import Counter
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "admin@kmfoundation.online"
PASSWORD = "Admin@786"
SC_AMT = 1234.0
FEE_AMT = 50000.0


@pytest.fixture(scope="module")
def c():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


def _txs(c):
    r = c.get(f"{BASE_URL}/api/transactions", params={"limit": 5000})
    assert r.status_code == 200
    d = r.json()
    return d if isinstance(d, list) else d.get("items", d.get("transactions", []))


def _accounts(c):
    r = c.get(f"{BASE_URL}/api/accounts")
    assert r.status_code == 200
    return {a["id"]: a for a in r.json()}


def _pick(c):
    accs = _accounts(c)
    acc = next((a for a in accs.values() if a.get("type") == "bank"), None) or next(iter(accs.values()))
    r = c.get(f"{BASE_URL}/api/clients")
    assert r.status_code == 200
    cl = r.json()
    cl = cl if isinstance(cl, list) else cl.get("items", [])
    client = next(x for x in cl if x.get("client_type") in ("sub_agent_associate", "associate_consultant"))
    return acc, client


def _body(acc, client, sc_given, remarks=""):
    return {
        "amount": FEE_AMT, "date": "2026-01-10", "fee_type": "tuition_fees",
        "received_in": {"type": "bank", "account_id": acc["id"], "name": acc["name"]},
        "has_adjustment": True, "remarks": remarks,
        "adjustments": [{
            "kind": "sc_adjusted", "amount": SC_AMT, "payment_date": "2026-01-10",
            "payment_mode": "cash", "sub_agent_type": "sub_agent" if client["client_type"] == "sub_agent_associate" else "associate",
            "sub_agent_name": client["name"], "client_id": client["id"], "sc_given": sc_given,
        }],
    }


def _payouts(txs, name, client_id):
    return [t for t in txs if t.get("is_sc_payout") and t.get("student_name") == name
            and t.get("client_id") == client_id]


def test_sc_pending_then_given_then_idempotent(c):
    acc, client = _pick(c)
    name = "TEST_SCDebit Throwaway A"
    bal0 = _accounts(c)[acc["id"]]["current_balance"]
    r = c.post(f"{BASE_URL}/api/students", json={"name": name, "status": "inquiry"})
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    try:
        r = c.post(f"{BASE_URL}/api/students/{sid}/payments", json=_body(acc, client, False))
        assert r.status_code in (200, 201), r.text
        pid = r.json()["payments"][-1]["id"]
        # pending: no debit
        txs = _txs(c)
        linked = [t for t in txs if t.get("linked_student_payment_id") == pid]
        print("pending linked", [(t["type"], t["amount"]) for t in linked])
        assert not any(t["type"] == "expense" for t in linked)
        assert not _payouts(txs, name, client["id"])
        bal1 = _accounts(c)[acc["id"]]["current_balance"]
        assert round(bal1 - bal0, 2) == FEE_AMT

        # given via edit: one debit, same account
        r = c.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=_body(acc, client, True))
        assert r.status_code == 200, r.text
        txs = _txs(c)
        p = _payouts(txs, name, client["id"])
        print("given payouts", [(t["amount"], t["account_id"], t["description"]) for t in p])
        assert len(p) == 1
        assert p[0]["type"] == "expense" and p[0]["amount"] == SC_AMT
        assert p[0]["account_id"] == acc["id"]
        assert p[0]["description"].startswith(f"SC payout — {name}")
        assert f"to {client['name']}" in p[0]["description"]
        assert p[0]["linked_student_payment_id"] == pid
        bal2 = _accounts(c)[acc["id"]]["current_balance"]
        assert round(bal1 - bal2, 2) == SC_AMT

        # idempotent re-edit
        r = c.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=_body(acc, client, True, "re-save"))
        assert r.status_code == 200
        txs = _txs(c)
        assert len(_payouts(txs, name, client["id"])) == 1
        assert _accounts(c)[acc["id"]]["current_balance"] == bal2

        # Toggle back to pending -> debit removed
        r = c.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=_body(acc, client, False))
        assert r.status_code == 200
        assert len(_payouts(_txs(c), name, client["id"])) == 0
        r = c.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=_body(acc, client, True))
        assert len(_payouts(_txs(c), name, client["id"])) == 1

        # delete payment cascades
        r = c.delete(f"{BASE_URL}/api/students/{sid}/payments/{pid}")
        assert r.status_code == 200
        txs = _txs(c)
        assert not [t for t in txs if t.get("linked_student_payment_id") == pid]
        assert not _payouts(txs, name, client["id"])
        assert round(_accounts(c)[acc["id"]]["current_balance"], 2) == round(bal0, 2)
    finally:
        c.delete(f"{BASE_URL}/api/students/{sid}")


def test_one_click_dedup(c):
    acc, client = _pick(c)
    name = "TEST_SCDebit Throwaway B"
    bal0 = _accounts(c)[acc["id"]]["current_balance"]
    r = c.post(f"{BASE_URL}/api/students", json={"name": name, "status": "inquiry"})
    sid = r.json()["id"]
    standalone_ids = []
    try:
        r = c.post(f"{BASE_URL}/api/students/{sid}/payments", json=_body(acc, client, False))
        pid = r.json()["payments"][-1]["id"]
        r = c.post(f"{BASE_URL}/api/clients/{client['id']}/sc-payout", json={
            "student_id": sid, "payment_id": pid, "adjustment_idx": 0, "amount": SC_AMT,
            "account_id": acc["id"], "payment_mode": "cash", "date": "2026-01-11"})
        print("sc-payout", r.status_code, r.text[:300])
        assert r.status_code == 200, r.text
        standalone_ids.append(r.json()["transaction"]["id"])
        st = c.get(f"{BASE_URL}/api/students/{sid}").json()
        pay = next(p for p in st["payments"] if p["id"] == pid)
        assert pay["adjustments"][0]["sc_given"] is True
        assert len(_payouts(_txs(c), name, client["id"])) == 1

        # re-save (sc_given true) -> no second debit
        r = c.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=_body(acc, client, True, "edit"))
        assert r.status_code == 200
        p = _payouts(_txs(c), name, client["id"])
        print("after resave", [(t["id"], t.get("linked_student_payment_id")) for t in p])
        assert len(p) == 1 and p[0]["id"] == standalone_ids[0]
        bal = _accounts(c)[acc["id"]]["current_balance"]
        assert round(bal - bal0, 2) == round(FEE_AMT - SC_AMT, 2)
    finally:
        c.delete(f"{BASE_URL}/api/students/{sid}")
        for tid in standalone_ids:
            c.delete(f"{BASE_URL}/api/transactions/{tid}")
        left = _payouts(_txs(c), name, client["id"])
        for t in left:
            c.delete(f"{BASE_URL}/api/transactions/{t['id']}")
        assert round(_accounts(c)[acc["id"]]["current_balance"], 2) == round(bal0, 2)


def test_no_duplicate_payout_pairs(c):
    txs = _txs(c)
    cnt = Counter((t.get("student_name"), t.get("client_id")) for t in txs if t.get("is_sc_payout"))
    dups = {k: v for k, v in cnt.items() if v > 1}
    print("sc payout pairs", len(cnt), "dups", dups)
    assert not dups


def test_two_payments_same_client_each_debited(c):
    """Edge: 2 installments, each with SC given to the same client -> expect 2 debits."""
    acc, client = _pick(c)
    name = "TEST_SCDebit Throwaway C"
    r = c.post(f"{BASE_URL}/api/students", json={"name": name, "status": "inquiry"})
    sid = r.json()["id"]
    try:
        c.post(f"{BASE_URL}/api/students/{sid}/payments", json=_body(acc, client, True))
        c.post(f"{BASE_URL}/api/students/{sid}/payments", json=_body(acc, client, True))
        p = _payouts(_txs(c), name, client["id"])
        print("two-installment payouts", len(p))
        assert len(p) == 2
    finally:
        c.delete(f"{BASE_URL}/api/students/{sid}")
