# Paid-to-College adjustment -> auto EXPENSE debit on the received account (iteration 91)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "admin@kmfoundation.online"  # owner of historical data (transactions are user-scoped)
PASSWORD = "Admin@786"


@pytest.fixture(scope="module")
def client():
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


def _students(c):
    r = c.get(f"{BASE_URL}/api/students")
    assert r.status_code == 200
    d = r.json()
    return d if isinstance(d, list) else d.get("items", [])


# ---- Historical backfill ----
@pytest.mark.parametrize("name,amount,acc_prefix", [
    ("NAFATHULLA R K", 5000, "3ad2613f"),
    ("ANAMIKA PRAJITH", 25000, "5edd2a2c"),
])
def test_historical_debit_exists(client, name, amount, acc_prefix):
    txs = _txs(client)
    rows = [t for t in txs if t.get("type") == "expense"
            and (t.get("description") or "").startswith(f"Paid to College — {name}")]
    print(name, [(t["amount"], t["account_id"], t.get("linked_student_payment_id")) for t in rows])
    assert len(rows) == 1, f"expected exactly 1 debit, got {len(rows)}"
    t = rows[0]
    assert t["amount"] == amount
    assert t["account_id"].startswith(acc_prefix)
    # account balance must equal opening + income - expense on that account
    accs = _accounts(client)
    acc = accs[t["account_id"]]
    acc_txs = [x for x in txs if x.get("account_id") == acc["id"]]
    inc = sum(x["amount"] for x in acc_txs if x["type"] == "income")
    exp = sum(x["amount"] for x in acc_txs if x["type"] == "expense")
    print("acc", acc["name"], acc["current_balance"], acc.get("opening_balance"), inc, exp)
    # (transfers may exist; only assert the debit is counted when no transfers)
    if not any(x["type"] not in ("income", "expense") for x in acc_txs):
        assert round(acc.get("opening_balance", 0) + inc - exp, 2) == acc["current_balance"]
    # also there must be a matching income for the same payment
    pay_id = t["linked_student_payment_id"]
    linked = [x for x in txs if x.get("linked_student_payment_id") == pay_id]
    print("linked for payment", [(x["type"], x["amount"]) for x in linked])
    assert sum(1 for x in linked if x["type"] == "expense") == 1


# ---- End-to-end ----
def test_e2e_paid_to_college(client):
    accs = _accounts(client)
    acc = next((a for a in accs.values() if a.get("type") in ("bank", "cash")), None) or next(iter(accs.values()))
    acc_id = acc["id"]
    bal0 = acc["current_balance"]
    r = client.post(f"{BASE_URL}/api/students", json={"name": "TEST_P2C Throwaway", "status": "inquiry"})
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    try:
        body = {"amount": 10000, "date": "2026-01-15", "fee_type": "admission_fees",
                "received_in": {"type": "bank", "account_id": acc_id, "name": acc["name"]},
                "has_adjustment": False, "adjustments": []}
        r = client.post(f"{BASE_URL}/api/students/{sid}/payments", json=body)
        assert r.status_code == 200, r.text
        pid = r.json()["payments"][-1]["id"]
        assert _accounts(client)[acc_id]["current_balance"] == round(bal0 + 10000, 2)

        body["has_adjustment"] = True
        body["adjustments"] = [{"kind": "paid_to_college", "amount": 4000,
                                "payment_date": "2026-01-16", "payment_mode": "bank_transfer"}]
        r = client.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=body)
        assert r.status_code == 200, r.text
        linked = [t for t in _txs(client) if t.get("linked_student_payment_id") == pid]
        exps = [t for t in linked if t["type"] == "expense"]
        incs = [t for t in linked if t["type"] == "income"]
        assert len(exps) == 1 and len(incs) == 1, linked
        e = exps[0]
        assert e["amount"] == 4000 and e["account_id"] == acc_id
        assert e["description"].startswith("Paid to College — TEST_P2C Throwaway")
        assert e["date"] == "2026-01-16"
        assert _accounts(client)[acc_id]["current_balance"] == round(bal0 + 6000, 2)

        # idempotency: PATCH again (keep adjustment id)
        adj_id = next(p for p in client.get(f"{BASE_URL}/api/students/{sid}").json()["payments"] if p["id"] == pid)["adjustments"][0]["id"]
        body["adjustments"][0]["id"] = adj_id
        for _ in range(2):
            r = client.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=body)
            assert r.status_code == 200
        linked = [t for t in _txs(client) if t.get("linked_student_payment_id") == pid]
        assert sum(1 for t in linked if t["type"] == "expense") == 1
        assert sum(1 for t in linked if t["type"] == "income") == 1
        assert _accounts(client)[acc_id]["current_balance"] == round(bal0 + 6000, 2)

        # change amount -> still one expense, updated amount
        body["adjustments"][0]["amount"] = 2500
        client.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=body)
        exps = [t for t in _txs(client) if t.get("linked_student_payment_id") == pid and t["type"] == "expense"]
        assert len(exps) == 1 and exps[0]["amount"] == 2500

        # remove adjustment -> expense gone
        body["has_adjustment"] = False
        body["adjustments"] = []
        client.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=body)
        exps = [t for t in _txs(client) if t.get("linked_student_payment_id") == pid and t["type"] == "expense"]
        assert exps == []

        # re-add and then delete payment -> cascade
        body["has_adjustment"] = True
        body["adjustments"] = [{"kind": "paid_to_college", "amount": 4000,
                                "payment_date": "2026-01-16", "payment_mode": "bank_transfer"}]
        client.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=body)
        r = client.delete(f"{BASE_URL}/api/students/{sid}/payments/{pid}")
        assert r.status_code == 200
        assert [t for t in _txs(client) if t.get("linked_student_payment_id") == pid] == []
        assert _accounts(client)[acc_id]["current_balance"] == bal0
    finally:
        client.delete(f"{BASE_URL}/api/students/{sid}")
    assert client.get(f"{BASE_URL}/api/students/{sid}").status_code == 404
    assert not [t for t in _txs(client) if t.get("linked_student_id") == sid]


# ---- College Acc. case ----
def test_college_acc_no_transactions(client):
    n0 = len(_txs(client))
    r = client.post(f"{BASE_URL}/api/students", json={"name": "TEST_P2C College", "status": "inquiry"})
    sid = r.json()["id"]
    try:
        body = {"amount": 8000, "date": "2026-01-15", "fee_type": "admission_fees",
                "received_in": {"type": "college", "name": "College Acc."},
                "has_adjustment": True,
                "adjustments": [{"kind": "paid_to_college", "amount": 3000,
                                 "payment_date": "2026-01-15", "payment_mode": "bank_transfer"}]}
        r = client.post(f"{BASE_URL}/api/students/{sid}/payments", json=body)
        assert r.status_code == 200, r.text
        pid = r.json()["payments"][-1]["id"]
        client.patch(f"{BASE_URL}/api/students/{sid}/payments/{pid}", json=body)
        txs = _txs(client)
        assert [t for t in txs if t.get("linked_student_payment_id") == pid] == []
        assert len(txs) == n0
        client.delete(f"{BASE_URL}/api/students/{sid}/payments/{pid}")
    finally:
        client.delete(f"{BASE_URL}/api/students/{sid}")
