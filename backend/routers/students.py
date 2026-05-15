"""Student fee collection — single-page view per student.

Each student document embeds two arrays:
- schedules[]: planned installments (1st payment, 2nd payment, …)
- payments[]:  actual receipts (paid to college / cash / sub-agent)
"""
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from auth_lib import get_current_user, gen_id, now_iso


router = APIRouter(prefix="/api/students", tags=["students"])


# ---------- Models ----------
class StudentIn(BaseModel):
    name: str
    course: Optional[str] = None
    college: Optional[str] = None
    reference: Optional[str] = None
    sc_out_fixed: float = 0.0
    status: Literal["inquiry", "enrolled", "completed"] = "inquiry"
    enrollment_date: Optional[str] = None
    notes: Optional[str] = ""


class ScheduleItemIn(BaseModel):
    label: str = Field(..., description="e.g. '1st Payment'")
    amount: float = 0.0
    remarks: Optional[str] = ""
    due_date: Optional[str] = None


class PaymentItemIn(BaseModel):
    date: str
    amount: float
    route: Literal["college", "cash", "sub_agent"]
    sub_agent_type: Optional[Literal["sub_agent", "associate", "km"]] = None
    sub_agent_name: Optional[str] = None
    account_id: Optional[str] = None
    remarks: Optional[str] = ""
    schedule_id: Optional[str] = None


# ---------- Helpers ----------
def _summarize(s: dict) -> dict:
    schedules = s.get("schedules") or []
    payments = s.get("payments") or []
    scheduled_total = round(sum(x.get("amount", 0) for x in schedules), 2)
    collected_total = round(sum(x.get("amount", 0) for x in payments), 2)
    sc_fixed = s.get("sc_out_fixed", 0) or 0
    s["scheduled_total"] = scheduled_total
    s["collected_total"] = collected_total
    s["balance_vs_scheduled"] = round(scheduled_total - collected_total, 2)
    s["balance_vs_sc"] = round(sc_fixed - collected_total, 2)
    return s


# ---------- Student CRUD ----------
@router.get("")
async def list_students(user: dict = Depends(get_current_user)):
    items = await db.students.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    return [_summarize(s) for s in items]


@router.post("")
async def create_student(payload: StudentIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "created_at": now_iso(),
        "schedules": [],
        "payments": [],
        **payload.model_dump(),
    }
    await db.students.insert_one(doc)
    doc.pop("_id", None)
    return _summarize(doc)


@router.get("/{student_id}")
async def get_student(student_id: str, user: dict = Depends(get_current_user)):
    s = await db.students.find_one({"id": student_id, "user_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    return _summarize(s)


@router.patch("/{student_id}")
async def update_student(student_id: str, payload: StudentIn, user: dict = Depends(get_current_user)):
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$set": payload.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Student not found")
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.delete("/{student_id}")
async def delete_student(student_id: str, user: dict = Depends(get_current_user)):
    res = await db.students.delete_one({"id": student_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Student not found")
    return {"ok": True}


# ---------- Schedules ----------
async def _load_student_or_404(student_id: str, user_id: str) -> dict:
    s = await db.students.find_one({"id": student_id, "user_id": user_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    return s


@router.post("/{student_id}/schedules")
async def add_schedule(student_id: str, payload: ScheduleItemIn, user: dict = Depends(get_current_user)):
    await _load_student_or_404(student_id, user["id"])
    item = {"id": gen_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$push": {"schedules": item}},
    )
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.patch("/{student_id}/schedules/{schedule_id}")
async def update_schedule(student_id: str, schedule_id: str, payload: ScheduleItemIn, user: dict = Depends(get_current_user)):
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"], "schedules.id": schedule_id},
        {"$set": {f"schedules.$.{k}": v for k, v in payload.model_dump().items()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Schedule item not found")
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.delete("/{student_id}/schedules/{schedule_id}")
async def delete_schedule(student_id: str, schedule_id: str, user: dict = Depends(get_current_user)):
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$pull": {"schedules": {"id": schedule_id}}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Student not found")
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


# ---------- Payments ----------
@router.post("/{student_id}/payments")
async def add_payment(student_id: str, payload: PaymentItemIn, user: dict = Depends(get_current_user)):
    await _load_student_or_404(student_id, user["id"])
    item = {"id": gen_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$push": {"payments": item}},
    )
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.patch("/{student_id}/payments/{payment_id}")
async def update_payment(student_id: str, payment_id: str, payload: PaymentItemIn, user: dict = Depends(get_current_user)):
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"], "payments.id": payment_id},
        {"$set": {f"payments.$.{k}": v for k, v in payload.model_dump().items()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Payment not found")
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)


@router.delete("/{student_id}/payments/{payment_id}")
async def delete_payment(student_id: str, payment_id: str, user: dict = Depends(get_current_user)):
    res = await db.students.update_one(
        {"id": student_id, "user_id": user["id"]},
        {"$pull": {"payments": {"id": payment_id}}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Student not found")
    s = await db.students.find_one({"id": student_id}, {"_id": 0})
    return _summarize(s)
