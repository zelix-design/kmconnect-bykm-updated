"""Iteration 7 tests: Students Fees Collection module.

Covers:
- Student CRUD with computed totals (scheduled_total, collected_total, balance_vs_*)
- Embedded schedules CRUD (UUID per row, positional $ update)
- Embedded payments CRUD with routes (college/cash/sub_agent)
- sub_agent_type/name persistence rules
- Cascade delete (schedules + payments gone with student)
- Seeded 'Aarav Sharma' totals match spec
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@finflow.com", "password": "Admin@123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return s


# ---------- Student CRUD ----------
def test_create_student_with_empty_arrays_and_totals(session):
    payload = {"name": "TEST_IT7_Student", "course": "MBA", "college": "TEST College",
               "reference": "TEST_Ref", "sc_out_fixed": 50000, "status": "inquiry"}
    r = session.post(f"{API}/students", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["name"] == "TEST_IT7_Student"
    assert d["schedules"] == [] and d["payments"] == []
    assert d["scheduled_total"] == 0 and d["collected_total"] == 0
    assert d["balance_vs_scheduled"] == 0
    assert d["balance_vs_sc"] == 50000
    assert "id" in d and "_id" not in d
    # cleanup
    session.delete(f"{API}/students/{d['id']}")


def test_list_and_get_student(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_List", "sc_out_fixed": 1000})
    sid = r.json()["id"]
    lr = session.get(f"{API}/students")
    assert lr.status_code == 200
    items = lr.json()
    found = [x for x in items if x["id"] == sid]
    assert len(found) == 1
    assert "scheduled_total" in found[0] and "balance_vs_sc" in found[0]
    gr = session.get(f"{API}/students/{sid}")
    assert gr.status_code == 200
    assert gr.json()["name"] == "TEST_IT7_List"
    session.delete(f"{API}/students/{sid}")


def test_patch_student_preserves_embedded(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_Patch", "sc_out_fixed": 100})
    sid = r.json()["id"]
    session.post(f"{API}/students/{sid}/schedules", json={"label": "1st Payment", "amount": 50})
    session.post(f"{API}/students/{sid}/payments",
                 json={"date": "2026-01-15", "amount": 25, "route": "college"})
    upd = session.patch(f"{API}/students/{sid}",
                        json={"name": "TEST_IT7_Patched", "sc_out_fixed": 200, "status": "enrolled"})
    assert upd.status_code == 200
    d = upd.json()
    assert d["name"] == "TEST_IT7_Patched"
    assert d["status"] == "enrolled"
    assert d["sc_out_fixed"] == 200
    assert len(d["schedules"]) == 1 and len(d["payments"]) == 1
    assert d["scheduled_total"] == 50 and d["collected_total"] == 25
    assert d["balance_vs_sc"] == 175
    session.delete(f"{API}/students/{sid}")


def test_delete_student_cascades(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_Del"})
    sid = r.json()["id"]
    session.post(f"{API}/students/{sid}/schedules", json={"label": "1st Payment", "amount": 100})
    session.post(f"{API}/students/{sid}/payments",
                 json={"date": "2026-01-01", "amount": 30, "route": "cash"})
    dr = session.delete(f"{API}/students/{sid}")
    assert dr.status_code == 200
    gr = session.get(f"{API}/students/{sid}")
    assert gr.status_code == 404


def test_get_missing_student_404(session):
    r = session.get(f"{API}/students/nonexistent-uuid-xyz")
    assert r.status_code == 404


# ---------- Schedules ----------
def test_schedule_add_update_delete(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_Sched", "sc_out_fixed": 1000})
    sid = r.json()["id"]
    # add two
    a = session.post(f"{API}/students/{sid}/schedules",
                     json={"label": "1st Payment", "amount": 300, "remarks": "Booking"})
    assert a.status_code == 200 and a.json()["scheduled_total"] == 300
    b = session.post(f"{API}/students/{sid}/schedules",
                     json={"label": "2nd Payment", "amount": 400})
    d = b.json()
    assert d["scheduled_total"] == 700
    assert len(d["schedules"]) == 2
    s1 = d["schedules"][0]
    assert "id" in s1 and len(s1["id"]) > 8  # has UUID
    # update
    u = session.patch(f"{API}/students/{sid}/schedules/{s1['id']}",
                      json={"label": "1st Payment", "amount": 500, "remarks": "Updated"})
    assert u.status_code == 200
    assert u.json()["scheduled_total"] == 900
    updated = [x for x in u.json()["schedules"] if x["id"] == s1["id"]][0]
    assert updated["amount"] == 500 and updated["remarks"] == "Updated"
    # delete
    de = session.delete(f"{API}/students/{sid}/schedules/{s1['id']}")
    assert de.status_code == 200
    assert de.json()["scheduled_total"] == 400
    assert len(de.json()["schedules"]) == 1
    session.delete(f"{API}/students/{sid}")


def test_schedule_update_404_on_unknown(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_Sched404"})
    sid = r.json()["id"]
    u = session.patch(f"{API}/students/{sid}/schedules/missing-id",
                      json={"label": "x", "amount": 1})
    assert u.status_code == 404
    session.delete(f"{API}/students/{sid}")


# ---------- Payments ----------
def test_payment_routes_college_cash_subagent(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_Pay", "sc_out_fixed": 10000})
    sid = r.json()["id"]
    # college
    p1 = session.post(f"{API}/students/{sid}/payments",
                      json={"date": "2026-01-10", "amount": 1000, "route": "college"})
    assert p1.status_code == 200
    d = p1.json()
    pay_college = [x for x in d["payments"] if x["route"] == "college"][0]
    assert pay_college["sub_agent_type"] is None and pay_college["sub_agent_name"] is None
    # cash
    session.post(f"{API}/students/{sid}/payments",
                 json={"date": "2026-01-11", "amount": 500, "route": "cash"})
    # sub_agent with all three types
    for st_type, name in [("sub_agent", "Rohan Mehta"), ("associate", "Anika"), ("km", "KM Sharma")]:
        sp = session.post(f"{API}/students/{sid}/payments",
                          json={"date": "2026-01-12", "amount": 200,
                                "route": "sub_agent", "sub_agent_type": st_type,
                                "sub_agent_name": name})
        assert sp.status_code == 200
        last = sp.json()["payments"][-1]
        assert last["route"] == "sub_agent"
        assert last["sub_agent_type"] == st_type
        assert last["sub_agent_name"] == name
    final = session.get(f"{API}/students/{sid}").json()
    assert final["collected_total"] == 1000 + 500 + 200 * 3
    assert final["balance_vs_sc"] == 10000 - final["collected_total"]
    session.delete(f"{API}/students/{sid}")


def test_payment_update_and_delete(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_PayCRUD"})
    sid = r.json()["id"]
    p = session.post(f"{API}/students/{sid}/payments",
                     json={"date": "2026-01-01", "amount": 100, "route": "college"}).json()
    pid = p["payments"][0]["id"]
    u = session.patch(f"{API}/students/{sid}/payments/{pid}",
                      json={"date": "2026-01-02", "amount": 250,
                            "route": "sub_agent", "sub_agent_type": "associate",
                            "sub_agent_name": "Alice"})
    assert u.status_code == 200
    upd = [x for x in u.json()["payments"] if x["id"] == pid][0]
    assert upd["amount"] == 250 and upd["route"] == "sub_agent"
    assert upd["sub_agent_type"] == "associate" and upd["sub_agent_name"] == "Alice"
    assert u.json()["collected_total"] == 250
    de = session.delete(f"{API}/students/{sid}/payments/{pid}")
    assert de.status_code == 200 and de.json()["collected_total"] == 0
    session.delete(f"{API}/students/{sid}")


def test_payment_invalid_route_rejected(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_BadRoute"})
    sid = r.json()["id"]
    p = session.post(f"{API}/students/{sid}/payments",
                     json={"date": "2026-01-01", "amount": 50, "route": "bogus"})
    assert p.status_code == 422
    session.delete(f"{API}/students/{sid}")


def test_payment_schedule_link(session):
    r = session.post(f"{API}/students", json={"name": "TEST_IT7_Link", "sc_out_fixed": 500})
    sid = r.json()["id"]
    sc = session.post(f"{API}/students/{sid}/schedules",
                      json={"label": "1st Payment", "amount": 250}).json()
    sch_id = sc["schedules"][0]["id"]
    pay = session.post(f"{API}/students/{sid}/payments",
                       json={"date": "2026-01-15", "amount": 250,
                             "route": "college", "schedule_id": sch_id}).json()
    assert pay["payments"][0]["schedule_id"] == sch_id
    assert pay["balance_vs_scheduled"] == 0
    session.delete(f"{API}/students/{sid}")


# ---------- Seeded Aarav Sharma ----------
def test_seeded_aarav_sharma_totals(session):
    items = session.get(f"{API}/students").json()
    aarav = [x for x in items if x.get("name") == "Aarav Sharma"]
    if not aarav:
        pytest.skip("Aarav Sharma not seeded (run main agent's seed first)")
    a = aarav[0]
    assert a["sc_out_fixed"] == 75000, f"sc_out_fixed mismatch: {a['sc_out_fixed']}"
    assert a["scheduled_total"] == 75000, f"scheduled mismatch: {a['scheduled_total']}"
    assert a["collected_total"] == 25000, f"collected mismatch: {a['collected_total']}"
    assert a["balance_vs_sc"] == 50000, f"balance mismatch: {a['balance_vs_sc']}"
    # Verify the two payment composition: 10k college + 15k sub_agent (Rohan Mehta)
    detail = session.get(f"{API}/students/{a['id']}").json()
    pays = detail["payments"]
    college_sum = sum(p["amount"] for p in pays if p["route"] == "college")
    subagent_pays = [p for p in pays if p["route"] == "sub_agent"]
    subagent_sum = sum(p["amount"] for p in subagent_pays)
    assert college_sum == 10000, f"college sum: {college_sum}"
    assert subagent_sum == 15000, f"sub_agent sum: {subagent_sum}"
    assert any("Rohan" in (p.get("sub_agent_name") or "") for p in subagent_pays), \
        f"Rohan Mehta not in sub-agent payments: {subagent_pays}"


# ---------- File existence & registration ----------
def test_router_file_exists():
    assert os.path.isfile("/app/backend/routers/students.py")
    with open("/app/backend/server.py") as f:
        src = f.read()
    assert "students" in src and "students.router" in src
    assert "db.students.create_index" in src
