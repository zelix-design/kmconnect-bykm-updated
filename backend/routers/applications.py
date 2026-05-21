"""Public student application form endpoints.

Routes under ``/api/public/*`` — **no auth required** so prospective students
can submit their admission application without an account. Submissions are
written into the existing ``students`` collection (status=``inquiry``) under
the FIRST super-admin's ``user_id`` so they immediately surface in the admin
Students page.

Extra application data (parents, address, academic records, payment, reference)
is preserved as a nested ``application`` sub-document on the student doc.
"""
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field

from db import db
from auth_lib import gen_id, now_iso, get_current_user

# Re-use the notifier so super-admins get pinged in real time.
from routers.notifications import notify_super_admins


router = APIRouter(prefix="/api/public", tags=["public"])
admin_router = APIRouter(prefix="/api/applications", tags=["applications"])


# ---------- Pydantic models (mirror the 6-step wizard) ----------

Gender = Literal["male", "female", "other"]
AdmissionType = Literal["management", "government", "merit", "lateral_entry", "other"]
PaymentMode = Literal["cash", "bank_transfer", "upi", "cheque", "card", "other"]
ReferenceType = Literal["sub_agent", "associate", "km", "staff", "self", "other"]


class BasicInfo(BaseModel):
    student_full_name: str
    mobile_number: str
    email: EmailStr
    date_of_birth: str
    gender: Gender = "male"
    aadhaar_number: Optional[str] = None
    nationality: Optional[str] = "Indian"
    religion: Optional[str] = None
    caste: Optional[str] = None


class CourseDetails(BaseModel):
    interested_course: str
    preferred_college: Optional[str] = None
    academic_year: Optional[str] = None
    admission_type: AdmissionType = "management"


class Communication(BaseModel):
    father_name: str
    father_mobile: str
    mother_name: Optional[str] = None
    mother_mobile: Optional[str] = None
    address_line_1: str
    address_line_2: Optional[str] = None
    city: str
    state: str = "Tamil Nadu"
    pincode: str


class AcademicQualification(BaseModel):
    register_number: Optional[str] = None
    school_name: Optional[str] = None
    school_place: Optional[str] = None
    board: Optional[str] = None
    year_of_passing: Optional[str] = None
    percentage: Optional[str] = None


class Academic(BaseModel):
    tenth: AcademicQualification = Field(default_factory=AcademicQualification)
    twelfth: AcademicQualification = Field(default_factory=AcademicQualification)


class Payment(BaseModel):
    registration_amount: float = 0.0
    payment_date: Optional[str] = None
    payment_mode: PaymentMode = "upi"
    transaction_id: Optional[str] = None
    screenshot_url: Optional[str] = None


class Reference(BaseModel):
    type: ReferenceType = "sub_agent"
    name: Optional[str] = None
    contact_number: Optional[str] = None
    place: Optional[str] = None
    notes: Optional[str] = None


class ApplicationIn(BaseModel):
    basic_info: BasicInfo
    course: CourseDetails
    communication: Communication
    academic: Academic = Field(default_factory=Academic)
    payment: Payment = Field(default_factory=Payment)
    reference: Reference = Field(default_factory=Reference)


# ---------- Helpers ----------

async def _resolve_owner_user_id() -> str:
    """Find the user_id under which to land this application.

    Strategy: pick the first ``super_admin`` user (seeded admin). If none exists
    yet, fall back to the very first user in the database so the row still gets
    persisted.
    """
    admin = await db.users.find_one({"role": "super_admin"}, {"id": 1})
    if admin and admin.get("id"):
        return admin["id"]
    fallback = await db.users.find_one({}, {"id": 1})
    if fallback and fallback.get("id"):
        return fallback["id"]
    raise HTTPException(503, "Admin account not provisioned yet")


def _build_student_doc(app: ApplicationIn, owner_id: str, source: str = "public_form") -> dict:
    """Translate the application payload → a row that fits the existing
    ``students`` schema, with the full application preserved on the side.

    ``source`` distinguishes between public form submissions (``public_form``)
    and admin-pasted entries (``admin_paste``) so the UI can badge them
    appropriately.
    """
    payment_amt = float(app.payment.registration_amount or 0)
    payments_list: list[dict] = []
    if payment_amt > 0:
        payments_list.append({
            "id": gen_id(),
            "created_at": now_iso(),
            "date": app.payment.payment_date or now_iso()[:10],
            "amount": round(payment_amt, 2),
            "fee_type": "booking_admission",
            "received_in": {
                "type": "college",
                "name": None,
                "account_id": None,
            },
            "has_adjustment": False,
            "adjustments": [],
            "schedule_id": None,
            "remarks": (
                f"Registration payment via {app.payment.payment_mode}"
                + (f" · UTR {app.payment.transaction_id}" if app.payment.transaction_id else "")
                + " · pending verification"
            ),
        })

    return {
        "id": gen_id(),
        "user_id": owner_id,
        "created_at": now_iso(),
        # Map application → top-level student fields (so it shows up cleanly in the grid)
        "name": app.basic_info.student_full_name,
        "course": app.course.interested_course,
        "college": app.course.preferred_college or "",
        "reference": app.reference.name or "",
        "sc_out_fixed": 0.0,
        "status": "inquiry",
        "enrollment_date": now_iso()[:10],
        "notes": (app.reference.notes or "").strip(),
        # No fees plan yet — admin sets it after reviewing the application.
        "fees_plan": None,
        "schedules": [],
        "payments": payments_list,
        # Preserve the entire application payload for the PDF & admin view.
        "application": app.model_dump(),
        "application_source": source,
        "application_submitted_at": now_iso(),
    }


# ---------- Routes ----------

@router.post("/applications", status_code=201)
async def submit_application(payload: ApplicationIn) -> dict:
    """Submit a new student application. Returns ``{id, reference_code}``."""
    owner_id = await _resolve_owner_user_id()
    doc = _build_student_doc(payload, owner_id)
    await db.students.insert_one(doc)
    # Fire-and-forget notification to all super admins.
    try:
        await notify_super_admins(
            type="student_application",
            title="New student application",
            message=f"{payload.basic_info.student_full_name} · {payload.course.interested_course}",
            link=f"/students/{doc['id']}",
        )
    except Exception:  # pragma: no cover — best-effort
        pass
    return {
        "id": doc["id"],
        "reference_code": doc["id"][:8].upper(),
        "submitted_at": doc["application_submitted_at"],
    }


@router.get("/courses")
async def list_courses() -> dict:
    """Convenience endpoint — returns a static list of common courses for the
    public form's dropdown. Customise as needed."""
    return {
        "courses": [
            "B.Tech — Computer Science",
            "B.Tech — Electronics & Communication",
            "B.Tech — Mechanical",
            "B.Tech — Civil",
            "B.Tech — Information Technology",
            "B.Sc — Nursing",
            "B.Sc — Physics",
            "B.Sc — Chemistry",
            "B.Sc — Mathematics",
            "B.Com",
            "BBA",
            "BCA",
            "MBA",
            "MCA",
            "M.Tech",
            "MBBS",
            "BDS",
            "Pharm.D",
            "B.Pharm",
            "Other",
        ]
    }


# Map our internal client_type → the form's reference_type enum.
_CLIENT_TYPE_TO_REF = {
    "staff": "staff",
    "sub_agent_associate": "sub_agent",
    "associate_consultant": "associate",
    "km_blr_office": "km",
    "km_tcr_office": "km",
    "km_kmly_office": "km",
}


@router.get("/referrer/{client_id}")
async def get_referrer(client_id: str) -> dict:
    """Public lookup for the referral landing page. Returns the bare-minimum
    info needed to pre-fill the Reference section of the application form.
    404 if the client doesn't exist."""
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Referrer not found")
    return {
        "id": c["id"],
        "name": c.get("name") or "",
        "type": _CLIENT_TYPE_TO_REF.get(c.get("client_type"), "other"),
        "contact_number": c.get("phone") or "",
        "place": c.get("office", "").replace("KM_", "KM ") if c.get("office") else (c.get("company") or ""),
    }



# ---------- Authenticated admin paste endpoint ----------

@admin_router.post("/admin", status_code=201)
async def admin_submit_application(payload: ApplicationIn, user: dict = Depends(get_current_user)) -> dict:
    """Create an inquiry student from an admin-pasted/edited application.

    Mirrors the public submission flow but:
    - requires authentication (super_admin only),
    - tags ``application_source="admin_paste"`` so the UI can badge it,
    - owner is the current super admin (not the seeded fallback).
    """
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Super admin only")
    doc = _build_student_doc(payload, owner_id=user["id"], source="admin_paste")
    await db.students.insert_one(doc)
    return {
        "id": doc["id"],
        "reference_code": doc["id"][:8].upper(),
        "submitted_at": doc["application_submitted_at"],
    }
