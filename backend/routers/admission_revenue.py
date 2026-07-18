"""Admission Revenue Dashboard — SUPER ADMIN ONLY.

Aggregates the confidential per-college service-charge (SC) revenue across
all enrolled students within a given Indian financial year (Apr → Mar).

Revenue per admission = (per-student override) OR (college.sc_rates[course])
When neither is available the admission is counted but contributes 0.

The endpoint returns a 3-tier breakdown of the SAME cohort of enrolled
students, keyed off how "confirmed" the revenue is:

  - **committed** : student.status ∈ {enrolled, completed}
  - **accrued**   : committed + at least one recorded payment
  - **confirmed** : student.status == "completed" OR the full scheduled fees
                    have been collected (collected_total >= scheduled_total)

Also returned:
  - by_college — [{college, count, amount}], top-first
  - by_course  — [{course, count, amount}], top-first
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from auth_lib import get_current_user
from lib.student_math import compute_summary


router = APIRouter(prefix="/api/admission-revenue", tags=["admission-revenue"])


ENROLLED_STATUSES = ("enrolled", "completed")


def _current_fy_label(today: Optional[date] = None) -> str:
    """Return the current Indian financial year in 'YYYY-YY' form (Apr → Mar)."""
    d = today or date.today()
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _parse_fy(label: str) -> tuple[str, str]:
    """Turn ``'2025-26'`` into ISO-date bounds ``('2025-04-01', '2026-04-01')``
    (upper bound is exclusive). Also accepts a bare ``'2025'`` for the FY
    that starts in that calendar year."""
    label = (label or "").strip()
    if "-" in label:
        start_str, _ = label.split("-", 1)
    else:
        start_str = label
    try:
        start_year = int(start_str)
    except ValueError:
        raise HTTPException(400, f"Invalid financial year: {label!r}")
    return (f"{start_year}-04-01", f"{start_year + 1}-04-01")


def _student_fy_date(s: dict) -> Optional[str]:
    """Best-effort admission date for FY bucketing. Prefer explicit
    enrollment_date, fall back to created_at (ISO 8601 in the DB)."""
    d = s.get("enrollment_date")
    if d:
        # enrollment_date is stored as 'YYYY-MM-DD' — good enough.
        return str(d)[:10]
    c = s.get("created_at")
    if c:
        return str(c)[:10]
    return None


def _sc_for_student(s: dict, college_rates: dict[str, dict[str, float]]) -> float:
    """Resolve the SC revenue attributed to a single admission.
    Priority: per-student override > college.sc_rates[course] > 0."""
    override = s.get("sc_from_college_override")
    if override is not None:
        try:
            return round(max(0.0, float(override)), 2)
        except (TypeError, ValueError):
            pass
    college = (s.get("college") or "").strip()
    course = (s.get("course") or "").strip()
    if not college or not course:
        return 0.0
    rates = college_rates.get(college.lower())
    if not rates:
        return 0.0
    # Case-insensitive course match.
    for k, v in rates.items():
        if (k or "").strip().lower() == course.lower():
            try:
                return round(max(0.0, float(v)), 2)
            except (TypeError, ValueError):
                return 0.0
    return 0.0


def _is_fully_paid(s: dict) -> bool:
    """True when the student's collected total meets or exceeds the scheduled
    total. Reuses the canonical student_math summary so the definition
    matches the rest of the app."""
    try:
        summary = compute_summary(s)
    except Exception:
        return False
    scheduled = float(summary.get("scheduled_total") or 0)
    collected = float(summary.get("collected_total") or 0)
    if scheduled <= 0:
        return False
    return collected + 0.5 >= scheduled  # 50-paise tolerance


@router.get("/summary")
async def revenue_summary(
    fy: Optional[str] = Query(default=None, description="Financial year label, e.g. '2025-26'. Defaults to the current FY."),
    user: dict = Depends(get_current_user),
) -> dict:
    """Super-admin-only. Returns the tiered admission revenue for the given
    financial year (Apr → Mar) plus a per-college / per-course breakdown."""
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Super admin only")

    fy_label = (fy or _current_fy_label()).strip()
    start_iso, end_iso = _parse_fy(fy_label)

    # Load all confidential college SC rates in ONE query so per-student lookup
    # stays O(1). Key by lower-cased name for case-insensitive matching.
    colleges = await db.colleges.find(
        {}, {"_id": 0, "name": 1, "sc_rates": 1}
    ).to_list(5000)
    college_rates: dict[str, dict[str, float]] = {}
    for c in colleges:
        rates = c.get("sc_rates") or {}
        if rates:
            college_rates[(c.get("name") or "").strip().lower()] = rates

    # Fetch enrolled students within the FY. We filter in Python for the
    # date bucketing so an FY that spans two calendar years handles the
    # created_at fallback cleanly (some rows have no enrollment_date).
    cursor = db.students.find(
        {"status": {"$in": list(ENROLLED_STATUSES)}}, {"_id": 0}
    )
    students = await cursor.to_list(10000)

    tiers = {
        "committed": {"count": 0, "amount": 0.0},
        "accrued":   {"count": 0, "amount": 0.0},
        "confirmed": {"count": 0, "amount": 0.0},
    }
    by_college: dict[str, dict] = {}
    by_course: dict[str, dict] = {}

    for s in students:
        fy_date = _student_fy_date(s)
        if not fy_date or not (start_iso <= fy_date < end_iso):
            continue

        amount = _sc_for_student(s, college_rates)
        has_payment = bool(s.get("payments"))
        is_completed = (s.get("status") or "").lower() == "completed"
        fully_paid = is_completed or _is_fully_paid(s)

        # Committed = all enrolled (or completed) students in FY.
        tiers["committed"]["count"] += 1
        tiers["committed"]["amount"] += amount
        if has_payment:
            tiers["accrued"]["count"] += 1
            tiers["accrued"]["amount"] += amount
        if fully_paid:
            tiers["confirmed"]["count"] += 1
            tiers["confirmed"]["amount"] += amount

        college_name = (s.get("college") or "—").strip() or "—"
        course_name = (s.get("course") or "—").strip() or "—"
        bc = by_college.setdefault(college_name, {"college": college_name, "count": 0, "amount": 0.0})
        bc["count"] += 1
        bc["amount"] += amount
        bcr = by_course.setdefault(course_name, {"course": course_name, "count": 0, "amount": 0.0})
        bcr["count"] += 1
        bcr["amount"] += amount

    # Round outputs.
    for t in tiers.values():
        t["amount"] = round(t["amount"], 2)
    by_college_list = sorted(
        ({**v, "amount": round(v["amount"], 2)} for v in by_college.values()),
        key=lambda r: (-r["amount"], -r["count"], r["college"]),
    )
    by_course_list = sorted(
        ({**v, "amount": round(v["amount"], 2)} for v in by_course.values()),
        key=lambda r: (-r["amount"], -r["count"], r["course"]),
    )

    return {
        "fy": fy_label,
        "range": {"start": start_iso, "end": end_iso},
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "tiers": tiers,
        "by_college": by_college_list,
        "by_course": by_course_list,
    }


@router.get("/fy-options")
async def fy_options(user: dict = Depends(get_current_user)) -> dict:
    """Return the list of financial years the super admin can pick from —
    based on the earliest & latest enrollment/created dates on record. Always
    includes the current FY."""
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Super admin only")
    cur = _current_fy_label()
    # Cheap min/max scan — enrollment_date first, then created_at as fallback.
    dates = await db.students.find(
        {"status": {"$in": list(ENROLLED_STATUSES)}},
        {"_id": 0, "enrollment_date": 1, "created_at": 1},
    ).to_list(20000)
    years: set[int] = set()
    for row in dates:
        d = row.get("enrollment_date") or row.get("created_at")
        if not d:
            continue
        try:
            year = int(str(d)[:4])
            month = int(str(d)[5:7]) if len(str(d)) >= 7 else 4
        except ValueError:
            continue
        start = year if month >= 4 else year - 1
        years.add(start)
    # Include current FY start so the dropdown always has an option.
    cur_start = int(cur.split("-")[0])
    years.add(cur_start)
    labels = [f"{y}-{str(y+1)[-2:]}" for y in sorted(years, reverse=True)]
    return {"options": labels, "current": cur}
