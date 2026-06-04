"""Server-side admission Application PDF — KM Foundation branded design.

Implements the design spec on page 2 of the user-provided sample:
  - Header: linear gradient bar (#C70000 → #101010) at the top
  - Logo: TOP-LEFT (km-mark.png), Ref + Submitted block TOP-RIGHT
  - Applicant Name banner: Montserrat-Bold 25pt
  - Course / College: Montserrat-SemiBold 10pt
  - Section headers: Montserrat-Bold 11pt
  - Field labels + values: Montserrat-SemiBold 10pt
  - Declaration: Montserrat-Light 8pt
  - Footer: Century Gothic 7pt (fallback Montserrat-Bold) — contact info
  - Pink accent (#FFE7F3) for visual interest

Layout is tuned to fit ONE A4 page.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from io import BytesIO
from textwrap import wrap
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Table, TableStyle


log = logging.getLogger("finflow.application_pdf")

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 36
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

# Brand palette from the user's design spec.
BRAND_RED = colors.HexColor("#C70000")
BRAND_BLACK = colors.HexColor("#101010")
PINK_ACCENT = colors.HexColor("#FFE7F3")
INK = colors.HexColor("#000000")
MUTED = colors.HexColor("#5a5a5a")
RULE = colors.HexColor("#d4d4d4")

# ---------- Font registration (Montserrat from /app/backend/lib/fonts) ----------
_FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
_FONT_FAMILY_PRIMARY = "Helvetica"            # Safe default — overridden below
_FONT_FAMILY_BOLD = "Helvetica-Bold"
_FONT_FAMILY_SEMI = "Helvetica-Bold"
_FONT_FAMILY_LIGHT = "Helvetica"


def _register_fonts() -> None:
    """Register Montserrat once at import. Falls back to Helvetica silently."""
    global _FONT_FAMILY_PRIMARY, _FONT_FAMILY_BOLD, _FONT_FAMILY_SEMI, _FONT_FAMILY_LIGHT
    mappings = [
        ("Montserrat", "Montserrat-Regular.ttf"),
        ("Montserrat-Bold", "Montserrat-Bold.ttf"),
        ("Montserrat-SemiBold", "Montserrat-SemiBold.ttf"),
        ("Montserrat-Light", "Montserrat-Light.ttf"),
    ]
    registered = []
    for name, filename in mappings:
        path = os.path.join(_FONTS_DIR, filename)
        if not os.path.isfile(path):
            continue
        try:
            if name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(name, path))
            registered.append(name)
        except Exception as exc:  # pragma: no cover — best-effort
            log.warning("[pdf] failed to register %s: %s", name, exc)

    if "Montserrat" in registered:
        _FONT_FAMILY_PRIMARY = "Montserrat"
    if "Montserrat-Bold" in registered:
        _FONT_FAMILY_BOLD = "Montserrat-Bold"
    if "Montserrat-SemiBold" in registered:
        _FONT_FAMILY_SEMI = "Montserrat-SemiBold"
    if "Montserrat-Light" in registered:
        _FONT_FAMILY_LIGHT = "Montserrat-Light"


_register_fonts()


# ---------- Helpers ----------
GENDER_MAP = {"male": "Male", "female": "Female", "other": "Other"}
ADMISSION_MAP = {
    "management": "MANAGEMENT",
    "government": "GOVERNMENT",
    "merit": "MERIT",
    "lateral_entry": "LATERAL ENTRY",
    "other": "OTHER",
}

DECLARATION_TEXT = (
    "I certify all the information furnished in this application form for "
    "getting admission in {college_name} are correct, complete and to the "
    "best of my knowledge. I agree to abide by all the rules and regulations "
    "on the institution. I understand that with holding or giving false "
    "information will make me in-eligble for admission. "
    "I understand the fee paid to {college_name} are neither refundable nor "
    "transferrable any circumstances."
)


def _v(value: Any) -> str:
    if value is None or value == "":
        return "—"
    return str(value)


def _label_of(mapping: dict, key: Any) -> str:
    if not key:
        return "—"
    return mapping.get(key, key)


def _fmt_date(s: str | None) -> str:
    if not s:
        return "—"
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00")) if "T" in s else datetime.strptime(s, "%Y-%m-%d")
        return d.strftime("%b %d, %Y")
    except (ValueError, TypeError):
        return s


def _render_declaration(college_name: str | None) -> str:
    name = (college_name or "").strip() or "_________________"
    return DECLARATION_TEXT.replace("{college_name}", name)


def _logo_path() -> str | None:
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "km-mark.png")),
        "/app/frontend/public/km-mark.png",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None


def _draw_gradient_bar(c: Canvas, y_top: float, height: float = 10) -> None:
    """Approximate a linear gradient from #C70000 (left) to #101010 (right)
    by drawing many thin vertical stripes. ReportLab's `linearGradient` API
    is fiddly with canvas state, so this brute-force approach is the cleanest.
    """
    steps = 200
    stripe_w = PAGE_WIDTH / steps
    for i in range(steps):
        t = i / (steps - 1)
        r = int(0xC7 + (0x10 - 0xC7) * t)
        g = int(0x00 + (0x10 - 0x00) * t)
        b = int(0x00 + (0x10 - 0x00) * t)
        c.setFillColorRGB(r / 255, g / 255, b / 255)
        c.rect(i * stripe_w, y_top - height, stripe_w + 0.6, height, stroke=0, fill=1)


def _draw_header(c: Canvas, ref_code: str, submitted_at: str) -> float:
    """Draws gradient bar + logo (TOP-LEFT) + Ref/Submitted (TOP-RIGHT).
    Returns the y-cursor at which the body content can begin.
    """
    # 1) Gradient bar at the very top
    _draw_gradient_bar(c, PAGE_HEIGHT, height=8)

    # 2) Logo top-left (50×50, hugs the left margin just under the bar)
    logo = _logo_path()
    logo_y = PAGE_HEIGHT - 70
    if logo:
        try:
            c.drawImage(logo, MARGIN, logo_y, width=50, height=50,
                        preserveAspectRatio=True, mask="auto")
        except Exception as exc:
            log.warning("[pdf] logo drawImage failed: %s", exc)

    # 3) "AdmissionForm" wordmark — top-left, sits right of the logo
    c.setFillColor(INK)
    c.setFont(_FONT_FAMILY_BOLD, 18)
    c.drawString(MARGIN + 60, PAGE_HEIGHT - 38, "AdmissionForm")
    c.setFont(_FONT_FAMILY_SEMI, 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN + 60, PAGE_HEIGHT - 50, "KM Foundation Educational Services LLP")

    # 4) Ref + Submitted timestamp — right side
    c.setFillColor(INK)
    c.setFont(_FONT_FAMILY_SEMI, 8.5)
    c.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 38, f"Ref: {ref_code}")
    c.setFont(_FONT_FAMILY_PRIMARY, 8)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 50, f"Submitted: {_fmt_date(submitted_at)}")

    # 5) Subtle rule under the header
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(MARGIN, PAGE_HEIGHT - 78, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 78)

    return PAGE_HEIGHT - 92


def _draw_applicant_banner(c: Canvas, opts: dict, y: float) -> float:
    """Renders the large applicant name + course + college block plus the
    Admission Type / Academic Year right-aligned rows."""
    name = (opts.get("student_name") or "—").upper()
    course = (opts.get("course") or "—").upper()
    college = (opts.get("college") or "—").upper()

    # Big applicant name — 25pt Bold per spec
    c.setFillColor(INK)
    c.setFont(_FONT_FAMILY_BOLD, 22)
    c.drawString(MARGIN, y, name)

    # Course (10pt Semibold)
    c.setFont(_FONT_FAMILY_SEMI, 10)
    c.drawString(MARGIN, y - 16, course)

    # College (10pt Semibold)
    c.setFont(_FONT_FAMILY_SEMI, 10)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, y - 30, college)

    # Right-aligned Admission Type + Academic Year (label : value)
    c.setFillColor(INK)
    c.setFont(_FONT_FAMILY_SEMI, 8.5)
    c.drawRightString(PAGE_WIDTH - MARGIN, y - 4,
                      f"Admission Type:  {opts.get('admission_type') or '—'}")
    c.drawRightString(PAGE_WIDTH - MARGIN, y - 18,
                      f"Academic Year:  {opts.get('academic_year') or '—'}")

    # Subtle rule
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(MARGIN, y - 42, PAGE_WIDTH - MARGIN, y - 42)
    return y - 56


def _draw_section_header(c: Canvas, title: str, y: float, sub: str | None = None) -> float:
    c.setFillColor(INK)
    c.setFont(_FONT_FAMILY_BOLD, 11)
    c.drawString(MARGIN, y, title.upper())
    # Thin black underline per the spec (sample shows a black underline strip)
    c.setStrokeColor(INK)
    c.setLineWidth(0.8)
    c.line(MARGIN, y - 3, PAGE_WIDTH - MARGIN, y - 3)
    if sub:
        c.setFillColor(MUTED)
        c.setFont(_FONT_FAMILY_PRIMARY, 7)
        c.drawString(MARGIN, y - 13, sub)
        return y - 22
    return y - 14


def _kv_table(pairs: list[tuple[str, Any]]) -> Table:
    """Compact 4-column table (label · value · label · value) at 10pt."""
    rows: list[list[Any]] = []
    buf: tuple[str, Any] | None = None
    for label, value in pairs:
        if buf is None:
            buf = (label, value)
        else:
            rows.append([buf[0], _v(buf[1]), label, _v(value)])
            buf = None
    if buf is not None:
        rows.append([buf[0], _v(buf[1]), "", ""])

    table = Table(rows, colWidths=[80, 175, 80, 175])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _FONT_FAMILY_SEMI),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (2, 0), (2, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("TEXTCOLOR", (3, 0), (3, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return table


def _wide_row(label: str, value: Any) -> Table:
    table = Table([[label, _v(value)]], colWidths=[80, CONTENT_WIDTH - 80])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), _FONT_FAMILY_SEMI),
        ("FONTNAME", (1, 0), (1, -1), _FONT_FAMILY_SEMI),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return table


def _academic_table(tenth: dict, twelfth: dict) -> Table:
    """Compact academic block — pink header rows for 10th / 12th."""
    body = [
        [{"colSpan": 6, "content": "10th Standard"}, "", "", "", "", ""],
        ["Register No.", _v(tenth.get("register_number")),
         "Board", _v(tenth.get("board")),
         "Year", _v(tenth.get("year_of_passing"))],
        ["School", _v(tenth.get("school_name")),
         "Place", _v(tenth.get("school_place")),
         "Percentage", _v(tenth.get("percentage"))],
        [{"colSpan": 6, "content": "12th Standard / Diploma"}, "", "", "", "", ""],
        ["Register No.", _v(twelfth.get("register_number")),
         "Board", _v(twelfth.get("board")),
         "Year", _v(twelfth.get("year_of_passing"))],
        ["School", _v(twelfth.get("school_name")),
         "Place", _v(twelfth.get("school_place")),
         "Percentage", _v(twelfth.get("percentage"))],
    ]
    norm: list[list[Any]] = []
    for row in body:
        norm.append([cell.get("content") if isinstance(cell, dict) else cell for cell in row])

    col_widths = [60, 95, 50, 95, 60, CONTENT_WIDTH - 60 - 95 - 50 - 95 - 60]
    table = Table(norm, colWidths=col_widths)
    style = [
        # Pink section rows
        ("SPAN", (0, 0), (-1, 0)),
        ("SPAN", (0, 3), (-1, 3)),
        ("BACKGROUND", (0, 0), (-1, 0), PINK_ACCENT),
        ("BACKGROUND", (0, 3), (-1, 3), PINK_ACCENT),
        ("FONTNAME", (0, 0), (-1, 0), _FONT_FAMILY_BOLD),
        ("FONTNAME", (0, 3), (-1, 3), _FONT_FAMILY_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 9.5),
        ("FONTSIZE", (0, 3), (-1, 3), 9.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 3), (-1, 3), INK),
        ("LEFTPADDING", (0, 0), (-1, 0), 6),
        ("LEFTPADDING", (0, 3), (-1, 3), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 4),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("TOPPADDING", (0, 3), (-1, 3), 4),
        ("BOTTOMPADDING", (0, 3), (-1, 3), 4),
        # Body cells (rows 1,2,4,5)
        ("FONTNAME", (0, 1), (-1, 2), _FONT_FAMILY_SEMI),
        ("FONTNAME", (0, 4), (-1, 5), _FONT_FAMILY_SEMI),
        ("FONTSIZE", (0, 1), (-1, 2), 9),
        ("FONTSIZE", (0, 4), (-1, 5), 9),
        # Label cells (cols 0, 2, 4 of rows 1,2,4,5)
        ("TEXTCOLOR", (0, 1), (0, 2), MUTED),
        ("TEXTCOLOR", (2, 1), (2, 2), MUTED),
        ("TEXTCOLOR", (4, 1), (4, 2), MUTED),
        ("TEXTCOLOR", (0, 4), (0, 5), MUTED),
        ("TEXTCOLOR", (2, 4), (2, 5), MUTED),
        ("TEXTCOLOR", (4, 4), (4, 5), MUTED),
        # Value cells
        ("TEXTCOLOR", (1, 1), (1, 2), INK),
        ("TEXTCOLOR", (3, 1), (3, 2), INK),
        ("TEXTCOLOR", (5, 1), (5, 2), INK),
        ("TEXTCOLOR", (1, 4), (1, 5), INK),
        ("TEXTCOLOR", (3, 4), (3, 5), INK),
        ("TEXTCOLOR", (5, 4), (5, 5), INK),
        # Grid lines
        ("LINEBELOW", (0, 1), (-1, 1), 0.3, RULE),
        ("LINEBELOW", (0, 4), (-1, 4), 0.3, RULE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 1), (-1, -1), 4),
        ("RIGHTPADDING", (0, 1), (-1, -1), 4),
        ("TOPPADDING", (0, 1), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
    ]
    table.setStyle(TableStyle(style))
    return table


def _draw_declaration(c: Canvas, college_name: str | None, y: float) -> float:
    """Section header + 8pt light text declaration paragraph."""
    c.setFillColor(INK)
    c.setFont(_FONT_FAMILY_BOLD, 11)
    c.drawString(MARGIN, y, "DECLARATION")
    c.setStrokeColor(INK)
    c.setLineWidth(0.8)
    c.line(MARGIN, y - 3, PAGE_WIDTH - MARGIN, y - 3)

    y -= 14
    text = _render_declaration(college_name)
    c.setFont(_FONT_FAMILY_LIGHT, 8)
    c.setFillColor(INK)
    # Wrap to ~125 chars per line at 8pt — fits the content width comfortably
    lines = wrap(text, width=125)
    for ln in lines:
        c.drawString(MARGIN, y, ln)
        y -= 10
    return y


def _draw_signature(c: Canvas, y: float) -> None:
    """Applicant Signature / Admissions Officer signature lines."""
    c.setStrokeColor(INK)
    c.setLineWidth(0.5)
    c.line(MARGIN, y, MARGIN + 150, y)
    c.line(PAGE_WIDTH - MARGIN - 150, y, PAGE_WIDTH - MARGIN, y)
    c.setFillColor(INK)
    c.setFont(_FONT_FAMILY_BOLD, 8)
    c.drawString(MARGIN, y - 11, "Applicant Signature")
    c.drawString(PAGE_WIDTH - MARGIN - 150, y - 11, "Admissions Officer")


def _draw_footer(c: Canvas) -> None:
    """Contact info bar + generated timestamp."""
    c.setStrokeColor(RULE)
    c.setLineWidth(0.4)
    c.line(MARGIN, 40, PAGE_WIDTH - MARGIN, 40)

    c.setFillColor(INK)
    c.setFont(_FONT_FAMILY_BOLD, 7)
    c.drawCentredString(
        PAGE_WIDTH / 2, 26,
        "More Information: +91 88846 27275  |  info@kmfoundation.co.in  |  www.kmfoundation.co.in",
    )
    c.setFillColor(MUTED)
    c.setFont(_FONT_FAMILY_PRIMARY, 6.5)
    c.drawCentredString(
        PAGE_WIDTH / 2, 14,
        f"Generated {datetime.now().strftime('%d/%m/%Y, %H:%M:%S')}.  FinFlow by KM Foundation",
    )


def render_application_pdf(student: dict) -> bytes:
    """Generate the admission application PDF from a `students` document.

    Single-page A4 output. Returns raw PDF bytes.
    """
    app = student.get("application")
    if not app:
        raise ValueError("Student has no application data attached")

    ref_code = (student.get("id") or "")[:8].upper() or "—"
    submitted_at = student.get("application_submitted_at") or ""

    buf = BytesIO()
    c = Canvas(buf, pagesize=A4)

    # ---- Header (gradient + logo + ref) ----
    y = _draw_header(c, ref_code, submitted_at)

    # ---- Applicant banner ----
    bi = app.get("basic_info") or {}
    co = app.get("course") or {}
    y = _draw_applicant_banner(c, {
        "student_name": bi.get("student_full_name") or student.get("name") or "",
        "course": co.get("interested_course") or "",
        "college": co.get("preferred_college") or "",
        "admission_type": _label_of(ADMISSION_MAP, co.get("admission_type")),
        "academic_year": co.get("academic_year") or "",
    }, y)

    # ---- CANDIDATE DETAILS ----
    y = _draw_section_header(c, "Candidate Details", y, sub="*Your personal information")
    block = _kv_table([
        ("Mobile", bi.get("mobile_number")),
        ("Date of Birth", _fmt_date(bi.get("date_of_birth"))),
        ("Email", bi.get("email")),
        ("Gender", _label_of(GENDER_MAP, bi.get("gender"))),
        ("Nationality", bi.get("nationality") or "Indian"),
        ("Aadhaar", bi.get("aadhaar_number")),
        ("Caste", bi.get("caste")),
        ("Religion", bi.get("religion")),
    ])
    w, h = block.wrap(CONTENT_WIDTH, y)
    block.drawOn(c, MARGIN, y - h)
    y -= h + 8

    # ---- PARENTS & ADDRESS ----
    cm = app.get("communication") or {}
    addr = ", ".join(filter(None, [cm.get("address_line_1"), cm.get("address_line_2")]))
    y = _draw_section_header(c, "Parents & Address", y)
    block = _kv_table([
        ("Father's Name", cm.get("father_name")),
        ("Mother's Name", cm.get("mother_name")),
        ("Father's Mobile", cm.get("father_mobile")),
        ("Mother's Mobile", cm.get("mother_mobile")),
    ])
    w, h = block.wrap(CONTENT_WIDTH, y)
    block.drawOn(c, MARGIN, y - h)
    y -= h + 2

    block = _wide_row("Address", addr or "—")
    w, h = block.wrap(CONTENT_WIDTH, y)
    block.drawOn(c, MARGIN, y - h)
    y -= h + 2

    block = _kv_table([
        ("City", cm.get("city")),
        ("Pincode", cm.get("pincode")),
        ("State", cm.get("state")),
        ("", ""),  # spacer
    ])
    w, h = block.wrap(CONTENT_WIDTH, y)
    block.drawOn(c, MARGIN, y - h)
    y -= h + 8

    # ---- ACADEMIC QUALIFICATIONS ----
    ac = app.get("academic") or {}
    y = _draw_section_header(c, "Academic Qualifications", y)
    block = _academic_table(ac.get("tenth") or {}, ac.get("twelfth") or {})
    w, h = block.wrap(CONTENT_WIDTH, y)
    block.drawOn(c, MARGIN, y - h)
    y -= h + 8

    # ---- DECLARATION ----
    y = _draw_declaration(c, co.get("preferred_college"), y)

    # ---- Signature strip — anchored above the footer ----
    sig_y = max(y - 24, 78)
    _draw_signature(c, sig_y)

    # ---- Footer ----
    _draw_footer(c)

    c.showPage()
    c.save()
    return buf.getvalue()
