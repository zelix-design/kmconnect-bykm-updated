"""Student fee collection — single-page view per student.

Each student document embeds:
- schedules[]: planned installments
- payments[]:  actual receipts, each with its own received_in + adjustments
"""
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from db import db
from auth_lib import get_current_user, gen_id, now_iso, require_edit


router = APIRouter(prefix="/api/students", tags=["students"])


# ---------- Models ----------
PackageStatus = Literal["admission_tuition", "incl_food_accomm"]
InstallmentMode = Literal["semester", "yearly"]


class FeesPlan(BaseModel):
    installment_mode: InstallmentMode = "yearly"
    year_1: float = 0.0
    year_2: float = 0.0
    year_3: Optional[float] = None
    year_4: Optional[float] = None
    has_scholarship: bool = False
    scholarship_amount: float = 0.0
    package_status: PackageStatus = "admission_tuition"

    @model_validator(mode="after")
    def _scholarship_amount(self):
        if not self.has_scholarship:
            self.scholarship_amount = 0.0
        return self


class StudentIn(BaseModel):
    name: str
    course: Optional[str] = None
    college: Optional[str] = None
    reference: Optional[str] = None
    sc_out_fixed: float = 0.0
    status: Literal["inquiry", "enrolled", "cancelled", "completed"] = "inquiry"
    enrollment_date: Optional[str] = None
    notes: Optional[str] = ""
    fees_plan: Optional[FeesPlan] = None


class ScheduleItemIn(BaseModel):
    label: str = Field(..., description="e.g. '1st Payment'")
    amount: float = 0.0
    remarks: Optional[str] = ""
    due_date: Optional[str] = None


ReceivedInType = Literal["college", "km", "sub_agent", "associate", "cash", "bank"]
SubAgentType = Literal["sub_agent", "associate", "km"]
PaymentMode = Literal["cash", "bank_transfer", "upi", "cheque", "card", "other"]
FeeType = Literal["booking_admission", "tution", "other"]
AdjustmentKind = Literal["paid_to_college", "sc_adjusted"]


class ReceivedIn(BaseModel):
    type: ReceivedInType
    name: Optional[str] = None      # sub-agent / KM / associate / contact name
    account_id: Optional[str] = None  # internal account where money was received

    @model_validator(mode="after")
    def _name_required_for_agent(self):
        if self.type in {"sub_agent", "associate", "km"}:
            if not self.name or not self.name.strip():
                raise ValueError(
                    f"received_in.name is required when type is '{self.type}'"
                )
        return self


class Adjustment(BaseModel):
    id: Optional[str] = None
    kind: AdjustmentKind
    amount: float
    payment_date: str
    payment_mode: PaymentMode = "bank_transfer"
    sub_agent_type: Optional[SubAgentType] = None  # only when kind=sc_adjusted
    sub_agent_name: Optional[str] = None
    remarks: Optional[str] = ""

    @model_validator(mode="after")
    def _sub_agent_required_for_sc_adjusted(self):
        if self.kind == "sc_adjusted":
            if not self.sub_agent_type:
                raise ValueError(
                    "sub_agent_type is required when adjustment kind is 'sc_adjusted'"
                )
            if not self.sub_agent_name or not self.sub_agent_name.strip():
                raise ValueError(
                    "sub_agent_name is required when adjustment kind is 'sc_adjusted'"
                )
        return self


class PaymentItemIn(BaseModel):
    date: str
    amount: float
    fee_type: FeeType = "other"
    received_in: ReceivedIn
    has_adjustment: bool = False
    adjustments: List[Adjustment] = []
    schedule_id: Optional[str] = None
    remarks: Optional[str] = ""


# ---------- Helpers ----------
def _normalize_legacy_payment(p: dict) -> dict:
    """Promote old route/sub_agent_* schema into the new received_in/adjustments shape.
    No-op if already normalized."""
    if "received_in" in p and isinstance(p["received_in"], dict):
        # Ensure adjustments exist
        p.setdefault("has_adjustment", bool(p.get("adjustments")))
        p.setdefault("adjustments", [])
        p.setdefault("fee_type", "other")
        return p

    route = p.get("route", "cash")
    if route == "sub_agent":
        sa_type = p.get("sub_agent_type") or "sub_agent"
        p["received_in"] = {
            "type": sa_type,  # sub_agent / associate / km
            "name": p.get("sub_agent_name"),
            "account_id": p.get("account_id"),
        }
    elif route == "college":
        p["received_in"] = {"type": "college", "name": None, "account_id": p.get("account_id")}
    else:
        p["received_in"] = {"type": route or "cash", "name": None, "account_id": p.get("account_id")}
    p.setdefault("fee_type", "other")
    p["has_adjustment"] = False
    p["adjustments"] = []
    return p


def _summarize(s: dict) -> dict:
    schedules = s.get("schedules") or []
    payments = [_normalize_legacy_payment(p) for p in (s.get("payments") or [])]
    s["payments"] = payments
    scheduled_total = round(sum(x.get("amount", 0) for x in schedules), 2)
    collected_total = round(sum(x.get("amount", 0) for x in payments), 2)
    sc_fixed = s.get("sc_out_fixed", 0) or 0
    fp = s.get("fees_plan") or {}
    total_fees = round(
        (fp.get("year_1") or 0) + (fp.get("year_2") or 0)
        + (fp.get("year_3") or 0) + (fp.get("year_4") or 0)
        - (fp.get("scholarship_amount", 0) or 0 if fp.get("has_scholarship") else 0),
        2,
    )
    if fp:
        fp["total_fees"] = total_fees
        s["fees_plan"] = fp
    s["scheduled_total"] = scheduled_total
    s["collected_total"] = collected_total
    s["balance_vs_scheduled"] = round(scheduled_total - collected_total, 2)
    s["balance_vs_sc"] = round(sc_fixed - collected_total, 2)
    return s


# Auto-generate schedule rows from a fees_plan. Returns list of {label, amount, year_key}.
_YEAR_FIELDS = [
    ("1st Year", "year_1"),
    ("2nd Year", "year_2"),
    ("3rd Year", "year_3"),
    ("4th Year", "year_4"),
]


def _fees_plan_rows(fees_plan: Optional[dict]) -> List[dict]:
    if not fees_plan:
        return []
    rows = []
    for label, key in _YEAR_FIELDS:
        amt = fees_plan.get(key)
        if amt is None:
            continue
        try:
            amt = float(amt)
        except (TypeError, ValueError):
            continue
        if amt <= 0:
            continue
        rows.append({"label": label, "amount": round(amt, 2), "year_key": key})
    return rows


def _merge_fees_plan_schedules(
    existing: List[dict], fees_plan: Optional[dict], referenced_ids: set
) -> List[dict]:
    """Reconcile existing schedules with a (possibly updated) fees_plan.
    - Preserves manually-added schedules (source != 'fees_plan') untouched.
    - For each year amount > 0, upserts a fees_plan-sourced schedule by year_key.
    - For year_keys that drop to 0/None, deletes the schedule only if not referenced
      by any payment; otherwise zeroes its amount.
    """
    desired = {r["year_key"]: r for r in _fees_plan_rows(fees_plan)}
    out: List[dict] = []
    seen_keys = set()
    for sc in existing or []:
        if sc.get("source") != "fees_plan":
            out.append(sc)
            continue
        yk = sc.get("year_key")
        if not yk:
            out.append(sc)
            continue
        if yk in desired:
            sc = {**sc, "label": desired[yk]["label"], "amount": desired[yk]["amount"]}
            out.append(sc)
            seen_keys.add(yk)
        else:
            # year was zeroed/removed
            if sc.get("id") in referenced_ids:
                sc = {**sc, "amount": 0.0}
                out.append(sc)
                seen_keys.add(yk)
            # otherwise drop it
    # Add new fees_plan rows that didn't exist before
    for yk, row in desired.items():
        if yk in seen_keys:
            continue
        out.append({
            "id": gen_id(),
            "created_at": now_iso(),
            "label": row["label"],
            "amount": row["amount"],
            "remarks": "Auto from fees plan",
            "due_date": None,
            "source": "fees_plan",
            "year_key": yk,
        })
    return out


async def _auto_log_payment_transaction(user_id: str, student: dict, payment: dict) -> None:
    """Mirror of invoice auto-log: create an income transaction when the
    payment's received_in carries an account_id (or is plain cash routed to
    the user's first cash account)."""
    received = payment.get("received_in") or {}
    account_id = received.get("account_id")

    if not account_id:
        # Optional: fall back to first cash account for received_in.type == 'cash'
        if received.get("type") == "cash":
            cash_acc = await db.accounts.find_one(
                {"user_id": user_id, "type": "cash"}, {"_id": 0}
            )
            account_id = cash_acc["id"] if cash_acc else None

    # Clean up any prior linked tx for this payment id (idempotent)
    await db.transactions.delete_many({
        "user_id": user_id,
        "linked_student_payment_id": payment["id"],
    })

    if not account_id:
        return

    # Resolve income category from fee_type label
    fee_label_map = {
        "booking_admission": "Admission Fees",
        "tution": "Tution Fees",
        "other": "Other Fees",
    }
    cat_name = fee_label_map.get(payment.get("fee_type", "other"), "Other Fees")
    cat = await db.categories.find_one(
        {"user_id": user_id, "type": "income", "name": cat_name},
        {"_id": 0, "id": 1},
    )

    desc_bits = [
        f"Student fee — {student.get('name')}",
        cat_name,
        payment.get("remarks") or "",
    ]
    description = " · ".join([b for b in desc_bits if b])

    await db.transactions.insert_one({
        "id": gen_id(),
        "user_id": user_id,
        "created_at": now_iso(),
        "type": "income",
        "amount": round(payment.get("amount") or 0, 2),
        "account_id": account_id,
        "category_id": cat["id"] if cat else None,
        "date": payment.get("date"),
        "description": description,
        "linked_student_id": student.get("id"),
        "linked_student_payment_id": payment["id"],
    })


async def _delete_payment_transaction(user_id: str, payment_id: str) -> None:
    await db.transactions.delete_many({
        "user_id": user_id,
        "linked_student_payment_id": payment_id,
    })


# ---------- Student CRUD ----------
@router.get("")
async def list_students(user: dict = Depends(get_current_user)):
    items = await db.students.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    return [_summarize(s) for s in items]


@router.post("")
async def create_student(payload: StudentIn, user: dict = Depends(require_edit("students"))):
    data = payload.model_dump()
    fees_plan = data.get("fees_plan")
    schedules = _merge_fees_plan_schedules([], fees_plan, set()) if fees_plan else []
    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "created_at": now_iso(),
        "schedules": schedules,
        "payments": [],
        **data,
    }
    await db.students.insert_one(doc)
    doc.pop("_id", None)
    return _summarize(doc)


@router.get("/agent-ledger")
async def agent_ledger(user: dict = Depends(get_current_user)):
    """Aggregate payments routed through sub-agents / associates / KMs.

    Returns a row per (received_in.type, received_in.name) combo with totals."""
    user_id = user["id"]
    students = await db.students.find({"user_id": user_id}, {"_id": 0}).to_list(2000)

    ledger: dict[tuple, dict] = {}

    def bucket(kind: str, name: str) -> dict:
        key = (kind, (name or "—").strip() or "—")
        if key not in ledger:
            ledger[key] = {
                "type": kind,
                "name": key[1],
                "total_received": 0.0,
                "paid_to_college": 0.0,
                "sc_adjusted": 0.0,
                "holding": 0.0,
                "payments_count": 0,
                "students": set(),
            }
        return ledger[key]

    for st in students:
        payments = [_normalize_legacy_payment(p) for p in (st.get("payments") or [])]
        for p in payments:
            received = p.get("received_in") or {}
            r_type = received.get("type")
            if r_type not in {"sub_agent", "associate", "km"}:
                continue
            row = bucket(r_type, received.get("name") or "—")
            row["total_received"] += float(p.get("amount") or 0)
            row["payments_count"] += 1
            row["students"].add(st["id"])
            for adj in p.get("adjustments") or []:
                kind = adj.get("kind")
                amt = float(adj.get("amount") or 0)
                if kind == "paid_to_college":
                    row["paid_to_college"] += amt
                elif kind == "sc_adjusted":
                    row["sc_adjusted"] += amt

    out = []
    for row in ledger.values():
        row["holding"] = round(
            row["total_received"] - row["paid_to_college"] - row["sc_adjusted"], 2
        )
        row["total_received"] = round(row["total_received"], 2)
        row["paid_to_college"] = round(row["paid_to_college"], 2)
        row["sc_adjusted"] = round(row["sc_adjusted"], 2)
        row["students_count"] = len(row["students"])
        row["students"] = list(row["students"])
        out.append(row)
    out.sort(key=lambda r: r["total_received"], reverse=True)
    return out


@router.get("/agent-ledger/payments")
async def agent_payments(
    type: str,
    name: str,
    user: dict = Depends(get_current_user),
):
    """Flat list of every payment routed through a specific (type, name) agent.

    Each row includes the student context, the payment itself, and the
    breakdown of adjustments (paid_to_college / sc_adjusted)."""
    if type not in {"sub_agent", "associate", "km"}:
        raise HTTPException(400, "type must be one of sub_agent, associate, km")
    user_id = user["id"]
    students = await db.students.find({"user_id": user_id}, {"_id": 0}).to_list(2000)

    rows = []
    totals = {
        "total_received": 0.0,
        "paid_to_college": 0.0,
        "sc_adjusted": 0.0,
        "payments_count": 0,
        "students_count": 0,
    }
    student_set = set()

    target = name.strip()
    for st in students:
        payments = [_normalize_legacy_payment(p) for p in (st.get("payments") or [])]
        for p in payments:
            r = p.get("received_in") or {}
            if r.get("type") != type:
                continue
            if (r.get("name") or "—").strip() != target:
                continue
            paid_to_college = sum(
                float(a.get("amount") or 0)
                for a in (p.get("adjustments") or [])
                if a.get("kind") == "paid_to_college"
            )
            sc_adjusted = sum(
                float(a.get("amount") or 0)
                for a in (p.get("adjustments") or [])
                if a.get("kind") == "sc_adjusted"
            )
            totals["total_received"] += float(p.get("amount") or 0)
            totals["paid_to_college"] += paid_to_college
            totals["sc_adjusted"] += sc_adjusted
            totals["payments_count"] += 1
            student_set.add(st["id"])
            sch = next(
                (sc for sc in (st.get("schedules") or []) if sc.get("id") == p.get("schedule_id")),
                None,
            )
            rows.append({
                "payment_id": p["id"],
                "date": p.get("date"),
                "amount": round(float(p.get("amount") or 0), 2),
                "fee_type": p.get("fee_type"),
                "schedule_label": sch["label"] if sch else None,
                "remarks": p.get("remarks") or "",
                "has_adjustment": bool(p.get("has_adjustment")),
                "adjustments": p.get("adjustments") or [],
                "student_id": st["id"],
                "student_name": st.get("name"),
                "course": st.get("course"),
                "college": st.get("college"),
                "paid_to_college": round(paid_to_college, 2),
                "sc_adjusted": round(sc_adjusted, 2),
            })

    totals["students_count"] = len(student_set)
    totals["total_received"] = round(totals["total_received"], 2)
    totals["paid_to_college"] = round(totals["paid_to_college"], 2)
    totals["sc_adjusted"] = round(totals["sc_adjusted"], 2)
    totals["holding"] = round(
        totals["total_received"] - totals["paid_to_college"] - totals["sc_adjusted"], 2
    )

    rows.sort(key=lambda r: r["date"] or "", reverse=True)
    return {"type": type, "name": target, "totals": totals, "payments": rows}


@router.get("/{student_id}")
async def get_student(student_id: str, user: dict = Depends(require_edit("students"))):
    s = await db.students.find_one({"id": student_id, "user_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    return _summarize(s)


@router.patch("/{student_id}")
async def update_student(student_id: str, payload: StudentIn, user: dict = Depends(require_edit("students"))):
    existing = await db.students.find_one(
        {"id": student_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, "Student not found")

    data = payload.model_dump()
    fees_plan = data.get("fees_plan")
    # Reconcile fees_plan rows with existing schedules. Preserve manual ones,
    # and don't drop fee_plan rows that already have payments linked.
    referenced_ids = {
        p.get("schedule_id") for p in (existing.get("payments") or []) if p.get("schedule_id")
    }
    new_schedules = _merge_fees_plan_schedules(
        existing.get("schedules") or [], fees_plan, referenced_ids
    )
    data["schedules"] = new_schedules

    await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$set": data},
    )
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.delete("/{student_id}")
async def delete_student(student_id: str, user: dict = Depends(require_edit("students"))):
    # Cascade delete any auto-logged income transactions linked to this student.
    res = await db.students.delete_one({"id": student_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Student not found")
    await db.transactions.delete_many({
        "user_id": user["id"], "linked_student_id": student_id,
    })
    return {"ok": True}


@router.post("/{student_id}/incentive/mark-paid")
async def mark_incentive_paid(student_id: str, user: dict = Depends(require_edit("students"))):
    """Mark the staff incentive earned on this admission as paid. Idempotent."""
    s = await db.students.find_one({"id": student_id, "user_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$set": {"incentive_paid": True, "incentive_paid_at": now_iso()}},
    )
    return {"ok": True, "student_id": student_id, "incentive_paid": True}


@router.post("/{student_id}/incentive/unmark-paid")
async def unmark_incentive_paid(student_id: str, user: dict = Depends(require_edit("students"))):
    s = await db.students.find_one({"id": student_id, "user_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$set": {"incentive_paid": False}, "$unset": {"incentive_paid_at": ""}},
    )
    return {"ok": True, "student_id": student_id, "incentive_paid": False}


# ---------- Schedules ----------
async def _load_student_or_404(student_id: str, user_id: str) -> dict:
    s = await db.students.find_one({"id": student_id, "user_id": user_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    return s


@router.post("/{student_id}/schedules")
async def add_schedule(student_id: str, payload: ScheduleItemIn, user: dict = Depends(require_edit("students"))):
    await _load_student_or_404(student_id, user["id"])
    item = {"id": gen_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$push": {"schedules": item}},
    )
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.patch("/{student_id}/schedules/{schedule_id}")
async def update_schedule(student_id: str, schedule_id: str, payload: ScheduleItemIn, user: dict = Depends(require_edit("students"))):
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"], "schedules.id": schedule_id},
        {"$set": {f"schedules.$.{k}": v for k, v in payload.model_dump().items()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Schedule item not found")
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.delete("/{student_id}/schedules/{schedule_id}")
async def delete_schedule(student_id: str, schedule_id: str, user: dict = Depends(require_edit("students"))):
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$pull": {"schedules": {"id": schedule_id}}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Student not found")
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


# ---------- Payments ----------
def _materialize_payment(payload: PaymentItemIn) -> dict:
    data = payload.model_dump()
    adjustments = data.get("adjustments") or []
    for adj in adjustments:
        if not adj.get("id"):
            adj["id"] = gen_id()
    data["adjustments"] = adjustments if data.get("has_adjustment") else []
    return data


@router.post("/{student_id}/payments")
async def add_payment(student_id: str, payload: PaymentItemIn, user: dict = Depends(require_edit("students"))):
    student = await _load_student_or_404(student_id, user["id"])
    item = {"id": gen_id(), "created_at": now_iso(), **_materialize_payment(payload)}
    await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$push": {"payments": item}},
    )
    await _auto_log_payment_transaction(user["id"], student, item)
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.patch("/{student_id}/payments/{payment_id}")
async def update_payment(student_id: str, payment_id: str, payload: PaymentItemIn, user: dict = Depends(require_edit("students"))):
    data = _materialize_payment(payload)
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"], "payments.id": payment_id},
        {"$set": {f"payments.$.{k}": v for k, v in data.items()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Payment not found")
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    # Re-fetch the freshly updated payment and re-sync transaction
    updated_payment = next((p for p in student.get("payments") or [] if p["id"] == payment_id), None)
    if updated_payment:
        await _auto_log_payment_transaction(user["id"], student, updated_payment)
    return _summarize(student)


@router.delete("/{student_id}/payments/{payment_id}")
async def delete_payment(student_id: str, payment_id: str, user: dict = Depends(require_edit("students"))):
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$pull": {"payments": {"id": payment_id}}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Student not found")
    await _delete_payment_transaction(user["id"], payment_id)
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)
