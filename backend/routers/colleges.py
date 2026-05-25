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
    deal_with: Optional[str] = ""


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
        "deal_with": (payload.deal_with or "").strip(),
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
        "deal_with": (payload.deal_with or "").strip(),
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
    w.writerow(["name", "courses", "place", "deal_with"])
    w.writerow(["ABC College of Engineering", "B.Tech CSE, B.Tech ECE, MBA", "Bangalore", "Mr. Ravi"])
    w.writerow(["XYZ Institute of Science", "B.Sc Physics, B.Sc Chemistry", "Chennai", ""])
    return buf.getvalue()


# ---------- Bulk-upload helpers (kept small for testability + readability) ----------


def _decode_csv(raw: bytes) -> str:
    """UTF-8 with BOM stripping, falling back to latin-1 — covers Excel exports."""
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="ignore")


def _resolve_headers(fieldnames: list[str] | None) -> tuple[str, str | None, str | None, str | None]:
    """Map the user's CSV headers to our canonical column names, tolerating
    capitalisation and accepting ``course`` / ``location`` as synonyms.

    Returns ``(name_header, courses_header, place_header, deal_with_header)``
    and raises 400 when the mandatory ``name`` column is missing or the file
    has no header row."""
    if fieldnames is None:
        raise HTTPException(400, "CSV is empty")
    norm = {(h or "").strip().lower(): h for h in fieldnames}
    name_h = norm.get("name")
    if not name_h:
        raise HTTPException(400, "CSV must include a 'name' column")
    courses_h = norm.get("courses") or norm.get("course")
    place_h = norm.get("place") or norm.get("location")
    deal_h = norm.get("deal_with") or norm.get("dealwith") or norm.get("contact")
    return name_h, courses_h, place_h, deal_h


def _split_courses_cell(cell: str) -> list[str]:
    """Split a courses cell on both ``;`` and ``,`` so users can quote
    comma-containing course names with a semicolon delimiter when needed."""
    parts: list[str] = []
    for chunk in (cell or "").split(";"):
        parts.extend(chunk.split(","))
    return parts


def _build_college_doc(
    *, raw_name: str, courses_cell: str, place: str, deal_with: str, user_id: str,
) -> dict:
    """Build the Mongo doc for a single CSV row (used by the bulk endpoint)."""
    return {
        "id": gen_id(),
        "name": raw_name,
        "name_lower": raw_name.lower(),
        "courses": _normalize_courses(_split_courses_cell(courses_cell)),
        "place": (place or "").strip(),
        "deal_with": (deal_with or "").strip(),
        "created_at": now_iso(),
        "created_by": user_id,
    }


async def _existing_name_set() -> set[str]:
    """Snapshot all lower-cased college names so we don't issue one query per row."""
    out: set[str] = set()
    async for d in db.colleges.find({}, {"name_lower": 1, "_id": 0}):
        if d.get("name_lower"):
            out.add(d["name_lower"])
    return out


@router.post("/bulk", status_code=201)
async def bulk_upload(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Bulk-add colleges from a CSV file with header ``name,courses,place``.

    - ``courses`` accepts both ``,`` and ``;`` as delimiters so the user can
      quote commas inside a course label when needed.
    - Rows with an empty ``name`` are skipped (and their 1-based line numbers
      returned under ``skipped_blank_rows``).
    - Names already in the DB or earlier in the same file are skipped and
      surfaced under ``duplicates_*``.
    """
    _require_super_admin(user)
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Only .csv files are supported")
    text = _decode_csv(await file.read())
    reader = csv.DictReader(io.StringIO(text))
    name_h, courses_h, place_h, deal_h = _resolve_headers(reader.fieldnames)

    existing_lower = await _existing_name_set()
    seen_in_file: set[str] = set()
    created: list[dict] = []
    duplicates: list[str] = []
    skipped_rows: list[int] = []

    for idx, row in enumerate(reader, start=2):  # start=2 → header is line 1
        raw_name = str(row.get(name_h) or "").strip()
        if not raw_name:
            skipped_rows.append(idx)
            continue
        lower = raw_name.lower()
        if lower in existing_lower or lower in seen_in_file:
            duplicates.append(raw_name)
            continue
        created.append(_build_college_doc(
            raw_name=raw_name,
            courses_cell=str(row.get(courses_h) or "") if courses_h else "",
            place=str(row.get(place_h) or "") if place_h else "",
            deal_with=str(row.get(deal_h) or "") if deal_h else "",
            user_id=user["id"],
        ))
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
        {}, {"_id": 0, "id": 1, "name": 1, "courses": 1, "place": 1, "deal_with": 1}
    ).sort("name", 1).to_list(2000)
    return {"colleges": items}
