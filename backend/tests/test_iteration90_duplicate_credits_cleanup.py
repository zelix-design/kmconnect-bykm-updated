# Iteration 90: verify duplicate-credit (pytest junk) data cleanup + student-payment auto-log idempotency
import os
import re
from collections import Counter

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
# ZELIX AXIS ACCOUNT is owned by the legacy super admin (user 289a7cc9)
ADMIN_EMAIL = "admin@kmfoundation.online"
ADMIN_PASSWORD = "Admin@786"
MUNEER = ("muneer@kmfoundation.co", "kmf@0786")
PYTEST_RE = re.compile(r"pytest", re.I)


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def txns(admin):
    r = admin.get(f"{API}/transactions", params={"limit": 10000}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    return data


@pytest.fixture(scope="module")
def zelix(admin):
    accs = admin.get(f"{API}/accounts", timeout=20).json()
    z = [a for a in accs if (a.get("name") or "").strip().upper() == "ZELIX AXIS ACCOUNT"]
    assert z, f"ZELIX AXIS ACCOUNT not found; names={[a.get('name') for a in accs]}"
    return z[0]


# --- Transactions: no pytest junk ---
def test_no_pytest_transactions(txns):
    bad = [t for t in txns if PYTEST_RE.search(t.get("description") or "") or (t.get("description") or "") == "Manual credit"]
    assert not bad, f"{len(bad)} junk txns: {[t['description'] for t in bad][:10]}"


# --- Transactions: no duplicate income rows ---
def test_no_duplicate_income_rows(txns):
    keys = Counter(
        (t.get("amount"), t.get("account_id"), t.get("date"), t.get("description"))
        for t in txns if t.get("type") == "income"
    )
    dups = {k: v for k, v in keys.items() if v > 1}
    print(f"total txns={len(txns)} income={sum(1 for t in txns if t.get('type')=='income')} dup_groups={len(dups)}")
    for k, v in dups.items():
        print("DUP", v, k)
    assert not dups, f"duplicate income groups: {dups}"


# --- ZELIX AXIS ACCOUNT: 9 genuine txns and balance reconciles ---
def test_zelix_account_txns_and_balance(admin, zelix):
    r = admin.get(f"{API}/transactions", params={"account_id": zelix["id"], "limit": 1000}, timeout=20)
    assert r.status_code == 200
    rows = r.json()
    for t in rows:
        print(t.get("date"), t.get("type"), t.get("amount"), t.get("description"))
    assert len(rows) == 9, f"expected 9 txns, got {len(rows)}"
    assert not any(PYTEST_RE.search(t.get("description") or "") for t in rows)
    inc = sum(t["amount"] for t in rows if t["type"] == "income")
    exp = sum(t["amount"] for t in rows if t["type"] == "expense")
    expected = round(zelix.get("opening_balance", 0) + inc - exp, 2)
    print(f"opening={zelix.get('opening_balance')} inc={inc} exp={exp} balance={zelix.get('current_balance')}")
    assert zelix["current_balance"] == expected
    descs = " | ".join(t.get("description") or "" for t in rows)
    assert "SOURAV" in descs.upper()


# --- Clients / users junk ---
def test_no_pytest_clients(admin):
    r = admin.get(f"{API}/clients", timeout=20)
    assert r.status_code == 200
    bad = [c["name"] for c in r.json() if (c.get("name") or "").lower().startswith("pytest")]
    assert not bad, bad


def test_no_pytest_users(admin):
    r = admin.get(f"{API}/users", timeout=20)
    assert r.status_code == 200
    bad = [u["email"] for u in r.json() if (u.get("email") or "").lower().startswith("pytest_")]
    assert not bad, bad


@pytest.mark.parametrize("who", ["legacy", "muneer"])
def test_no_pytest_invoices(admin, who):
    sess = admin
    if who == "muneer":
        sess = requests.Session()
        assert sess.post(f"{API}/auth/login", json={"email": MUNEER[0], "password": MUNEER[1]}, timeout=20).status_code == 200
    r = sess.get(f"{API}/invoices", timeout=20)
    assert r.status_code == 200
    bad = [i.get("invoice_number") for i in r.json() if "PYTEST" in (i.get("invoice_number") or "").upper()]
    assert not bad, f"{who}: {len(bad)} leftover pytest invoices {bad}"


# --- Idempotency: one student payment -> exactly one income tx (incl. after edit) ---
def test_student_payment_single_income_tx(admin, zelix):
    s = admin.post(f"{API}/students", json={"name": "TEST_IdemStudent", "status": "inquiry"}, timeout=20)
    assert s.status_code in (200, 201), s.text
    sid = s.json()["id"]
    try:
        payload = {
            "date": "2026-01-15", "amount": 1234.0, "fee_type": "application_fees",
            "received_in": {"type": "bank", "account_id": zelix["id"]}, "remarks": "TEST_idem",
        }
        r = admin.post(f"{API}/students/{sid}/payments", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        stu = admin.get(f"{API}/students/{sid}", timeout=20).json()
        pid = stu["payments"][-1]["id"]

        def linked():
            all_t = admin.get(f"{API}/transactions", params={"account_id": zelix["id"], "limit": 1000}, timeout=20).json()
            return [t for t in all_t if t.get("linked_student_payment_id") == pid]

        rows = linked()
        assert len(rows) == 1 and rows[0]["type"] == "income" and rows[0]["amount"] == 1234.0
        # PATCH twice -> still exactly one
        for amt in (1500.0, 1500.0):
            pr = admin.patch(f"{API}/students/{sid}/payments/{pid}", json={**payload, "amount": amt}, timeout=20)
            assert pr.status_code == 200, pr.text
        rows = linked()
        assert len(rows) == 1 and rows[0]["amount"] == 1500.0
        # delete payment -> cascade removes tx
        dr = admin.delete(f"{API}/students/{sid}/payments/{pid}", timeout=20)
        assert dr.status_code == 200
        assert linked() == []
    finally:
        admin.delete(f"{API}/students/{sid}", timeout=20)
        # safety purge
        all_t = admin.get(f"{API}/transactions", params={"limit": 10000}, timeout=30).json()
        for t in all_t:
            if t.get("linked_student_id") == sid:
                admin.delete(f"{API}/transactions/{t['id']}", timeout=15)
    assert admin.get(f"{API}/students/{sid}", timeout=20).status_code == 404
