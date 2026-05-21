"""Colleges master-data router.

Super admin maintains a partner-college catalogue (name + courses + place)
that is consumed by the Student admission form and the public ``/apply``
wizard. Read access is open to any authenticated user so office admins can
also pick from the catalogue while enrolling students. Bulk upload supports
plain CSV with the header ``name,courses,place``.
"""
from __future__ import annotations

import csv
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from db import db
from auth_lib import get_current_user, gen_id, now_iso


router = APIRouter(prefix="/api/colleges", tags=["colleges"])


class CollegeIn(BaseModel):
    name: str = Field(min_length=1)
    courses: List[str] = Field(default_factory=list)
    place: Optional[str] = ""


def _require_super_admin(user: dict) -> None:
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Super admin only")


def _normalize_courses(raw) -> List[str]:
    """Accept either a list[str] or a comma-separated string."""
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, str):
        items = raw.split(",")
    else:
        items = []
    cleaned = []
    seen = set()
    for it in items:
        s = str(it or "").strip()
        if not s or s.lower() in seen:
            continue
        seen.add(s.lower())
        cleaned.append(s)
    return cleaned


@router.get("")
async def list_colleges(user: dict = Depends(get_current_user)) -> list[dict]:
    """List all colleges (any authenticated user). Sorted by name asc."""
    items = await db.colleges.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    return items


@router.post("", status_code=201)
async def create_college(payload: CollegeIn, user: dict = Depends(get_current_user)) -> dict:
    _require_super_admin(user)
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "College name is required")
    # Block exact-duplicate names (case-insensitive) to keep the dropdown clean.
    existing = await db.colleges.find_one({"name_lower": name.lower()})
    if existing:
        raise HTTPException(409, "A college with this name already exists")
    doc = {
        "id": gen_id(),
        "name": name,
        "name_lower": name.lower(),
        "courses": _normalize_courses(payload.courses),
        "place": (payload.place or "").strip(),
        "created_at": now_iso(),
        "created_by": user["id"],
    }
    await db.colleges.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/{college_id}")
async def update_college(college_id: str, payload: CollegeIn, user: dict = Depends(get_current_user)) -> dict:
    _require_super_admin(user)
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "College name is required")
    # Guard against renaming to a name another college already has.
    clash = await db.colleges.find_one({"name_lower": name.lower(), "id": {"$ne": college_id}})
    if clash:
        raise HTTPException(409, "Another college already uses this name")
    patch = {
        "name": name,
        "name_lower": name.lower(),
        "courses": _normalize_courses(payload.courses),
        "place": (payload.place or "").strip(),
        "updated_at": now_iso(),
    }
    res = await db.colleges.update_one({"id": college_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(404, "College not found")
    return await db.colleges.find_one({"id": college_id}, {"_id": 0})


@router.delete("/{college_id}")
async def delete_college(college_id: str, user: dict = Depends(get_current_user)) -> dict:
    _require_super_admin(user)
    res = await db.colleges.delete_one({"id": college_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "College not found")
    return {"ok": True}


@router.get("/template", response_class=PlainTextResponse)
async def csv_template(user: dict = Depends(get_current_user)) -> str:
    """Return a downloadable CSV template — useful when prepping a bulk upload."""
    _require_super_admin(user)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "courses", "place"])
    w.writerow(["ABC College of Engineering", "B.Tech CSE, B.Tech ECE, MBA", "Bangalore"])
    w.writerow(["XYZ Institute of Science", "B.Sc Physics, B.Sc Chemistry", "Chennai"])
    return buf.getvalue()


@router.post("/bulk", status_code=201)
async def bulk_upload(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Bulk-add colleges from a CSV file with header ``name,courses,place``.

    - ``courses`` cell may hold a comma-separated list (use a semicolon to keep
      commas inside the cell, e.g. ``"B.Tech CSE; B.Tech ECE"``). We accept both
      and split on ``,`` and ``;`` so the user template is forgiving.
    - Rows with an empty ``name`` are skipped.
    - Rows whose name already exists are skipped (case-insensitive) and counted
      under ``duplicates`` in the response so the user knows.
    """
    _require_super_admin(user)
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Only .csv files are supported")
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    # Tolerate header capitalisation differences.
    if reader.fieldnames is None:
        raise HTTPException(400, "CSV is empty")
    norm_map = {(h or "").strip().lower(): h for h in reader.fieldnames}
    name_h = norm_map.get("name")
    courses_h = norm_map.get("courses") or norm_map.get("course")
    place_h = norm_map.get("place") or norm_map.get("location")
    if not name_h:
        raise HTTPException(400, "CSV must include a 'name' column")

    created: list[dict] = []
    duplicates: list[str] = []
    skipped_rows: list[int] = []
    # Snapshot existing lowercase names so a single huge file doesn't issue a query per row.
    existing_lower = set()
    async for d in db.colleges.find({}, {"name_lower": 1, "_id": 0}):
        if d.get("name_lower"):
            existing_lower.add(d["name_lower"])
    seen_in_file: set[str] = set()
    for idx, row in enumerate(reader, start=2):  # start=2 → 1-based with header
        raw_name = str(row.get(name_h) or "").strip()
        if not raw_name:
            skipped_rows.append(idx)
            continue
        lower = raw_name.lower()
        if lower in existing_lower or lower in seen_in_file:
            duplicates.append(raw_name)
            continue
        raw_courses = str(row.get(courses_h) or "") if courses_h else ""
        # Allow ';' as an alternate delimiter inside the courses cell.
        courses_parts: list[str] = []
        for chunk in raw_courses.split(";"):
            courses_parts.extend(chunk.split(","))
        place_val = str(row.get(place_h) or "").strip() if place_h else ""
        doc = {
            "id": gen_id(),
            "name": raw_name,
            "name_lower": lower,
            "courses": _normalize_courses(courses_parts),
            "place": place_val,
            "created_at": now_iso(),
            "created_by": user["id"],
        }
        created.append(doc)
        seen_in_file.add(lower)

    if created:
        await db.colleges.insert_many([dict(d) for d in created])  # copy guards _id mutation
        for d in created:
            d.pop("_id", None)

    return {
        "created_count": len(created),
        "duplicates_count": len(duplicates),
        "skipped_blank_rows": skipped_rows,
        "duplicates_sample": duplicates[:10],
        "created_sample": [c["name"] for c in created[:10]],
    }


# ---------- Public read-only endpoint for the /apply form ----------

public_router = APIRouter(prefix="/api/public", tags=["public"])


@public_router.get("/colleges")
async def public_colleges() -> dict:
    """Lightweight, unauthenticated catalogue used by the public application form."""
    items = await db.colleges.find(
        {}, {"_id": 0, "name": 1, "courses": 1, "place": 1}
    ).sort("name", 1).to_list(2000)
    return {"colleges": items}
