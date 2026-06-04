"""Server-side admission Application PDF.

Generates a 1-2 page A4 PDF that mirrors the client-side `applicationPdf.js`
layout for the KM Foundation admission form (large applicant banner, blue
"AdmissionForm" title, KM logo top-right, blue section underlines, declaration
paragraph + signature blocks + contact footer).

Returns raw PDF bytes suitable for emailing as an attachment.
"""
from __future__ import annotations

import os
from datetime import datetime
from io import BytesIO
from textwrap import wrap
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Table, TableStyle


PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 40
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

# Brand palette tuned to the sample (deep blue accent + soft gray rules).
BRAND_BLUE = colors.HexColor("#194182")
BRAND_BLUE_SOFT = colors.HexColor("#b4c8e6")
SECTION_TINT = colors.HexColor("#f5f7fc")
INK = colors.HexColor("#1c1917")
MUTED = colors.HexColor("#78716c")
RULE = colors.HexColor("#dcdad7")
FOOTER_GRAY = colors.HexColor("#a8a29e")


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
    "information will make me in-eligble for admission.\n\n"
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
    name = (college_name or "").strip() or "__________________"
    return DECLARATION_TEXT.replace("{college_name}", name)


def _logo_path() -> str | None:
    """Resolve the absolute path to /app/frontend/public/km-mark.png."""
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "km-mark.png")),
        "/app/frontend/public/km-mark.png",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None


def _draw_header(c: Canvas, ref_code: str, submitted_at: str) -> float:
    # Logo top-right (60×60), if available
    logo = _logo_path()
    if logo:
        try:
            c.drawImage(logo, PAGE_WIDTH - MARGIN - 60, PAGE_HEIGHT - 92,
                        width=60, height=60, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    # "AdmissionForm" main title — top-left, bold blue
    c.setFillColor(BRAND_BLUE)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(MARGIN, PAGE_HEIGHT - 56, "AdmissionForm")

    # Ref + submitted timestamp — right aligned, below the logo
    c.setFillColor(INK)
    c.setFont("Helvetica", 9)
    c.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 102, f"Ref: {ref_code}")
    c.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 116, f"Submitted: {_fmt_date(submitted_at)}")

    # Horizontal rule
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    c.line(MARGIN, PAGE_HEIGHT - 130, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 130)
    return PAGE_HEIGHT - 148


def _draw_applicant_banner(c: Canvas, opts: dict, y: float) -> float:
    name = (opts.get("student_name") or "—").upper()
    course = (opts.get("course") or "—").upper()
    college = (opts.get("college") or "—").upper()

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(MARGIN, y, name)

    c.setFont("Helvetica-Bold", 16)
    c.drawString(MARGIN, y - 24, course)

    c.setFont("Helvetica", 13)
    c.drawString(MARGIN, y - 42, college)

    # Admission Type + Academic Year rows
    row_y = y - 66
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(INK)
    c.drawString(MARGIN, row_y, "Admission Type:")
    c.drawString(MARGIN, row_y - 16, "Academic Year :")
    c.drawRightString(PAGE_WIDTH - MARGIN, row_y, opts.get("admission_type") or "—")
    c.drawRightString(PAGE_WIDTH - MARGIN, row_y - 16, opts.get("academic_year") or "—")

    # Soft separator
    c.setStrokeColor(RULE)
    c.line(MARGIN, row_y - 28, PAGE_WIDTH - MARGIN, row_y - 28)
    return row_y - 44


def _draw_section_header(c: Canvas, title: str, y: float, sub: str | None = None) -> float:
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(MARGIN, y, title.upper())
    # Blue underline
    c.setStrokeColor(BRAND_BLUE_SOFT)
    c.setLineWidth(1.2)
    c.line(MARGIN, y - 4, PAGE_WIDTH - MARGIN, y - 4)
    if sub:
        c.setFont("Helvetica-Oblique", 8.5)
        c.setFillColor(MUTED)
        c.drawString(MARGIN, y - 18, sub)
        return y - 30
    return y - 22


def _kv_block_flowable(pairs: list[tuple[str, Any]], wide_rows: list[tuple[str, Any]] | None = None) -> Table:
    """4-column key/value table + optional full-width rows below."""
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

    if wide_rows:
        for label, value in wide_rows:
            rows.append([{"content": label, "colSpan": 1}, {"content": _v(value), "colSpan": 3}])

    table = Table(
        [[r[0], r[1], r[2], r[3]] for r in rows],
        colWidths=[95, 158, 95, 158],
    )
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (2, 0), (2, -1), MUTED),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    table.setStyle(TableStyle(style))
    return table


def _wide_row_flowable(label: str, value: Any) -> Table:
    table = Table([[label, _v(value)]], colWidths=[95, CONTENT_WIDTH - 95])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _academic_table_flowable(tenth: dict, twelfth: dict) -> Table:
    head = ["Register No.", "School", "Board", "Place", "Year", "Percentage"]
    body = [
        head,
        [{"colSpan": 6, "content": "10th Standard"}, "", "", "", "", ""],
        [
            _v(tenth.get("register_number")), _v(tenth.get("school_name")), _v(tenth.get("board")),
            _v(tenth.get("school_place")), _v(tenth.get("year_of_passing")), _v(tenth.get("percentage")),
        ],
        [{"colSpan": 6, "content": "12th Standard / Diploma"}, "", "", "", "", ""],
        [
            _v(twelfth.get("register_number")), _v(twelfth.get("school_name")), _v(twelfth.get("board")),
            _v(twelfth.get("school_place")), _v(twelfth.get("year_of_passing")), _v(twelfth.get("percentage")),
        ],
    ]
    # Flatten colSpan dicts (ReportLab uses SPAN style instead)
    norm: list[list[Any]] = []
    for row in body:
        norm.append([cell.get("content") if isinstance(cell, dict) else cell for cell in row])

    col_widths = [70, 110, 60, 80, 55, CONTENT_WIDTH - 70 - 110 - 60 - 80 - 55]
    table = Table(norm, colWidths=col_widths)
    style = [
        # Header
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        # Section rows (10th / 12th)
        ("SPAN", (0, 1), (-1, 1)),
        ("SPAN", (0, 3), (-1, 3)),
        ("BACKGROUND", (0, 1), (-1, 1), SECTION_TINT),
        ("BACKGROUND", (0, 3), (-1, 3), SECTION_TINT),
        ("TEXTCOLOR", (0, 1), (-1, 1), BRAND_BLUE),
        ("TEXTCOLOR", (0, 3), (-1, 3), BRAND_BLUE),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 10),
        ("FONTSIZE", (0, 3), (-1, 3), 10),
        # Body cells
        ("FONTSIZE", (0, 2), (-1, 2), 9),
        ("FONTSIZE", (0, 4), (-1, 4), 9),
        ("TEXTCOLOR", (0, 2), (-1, 2), INK),
        ("TEXTCOLOR", (0, 4), (-1, 4), INK),
        # Borders
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    table.setStyle(TableStyle(style))
    return table


def _draw_declaration(c: Canvas, college_name: str | None, y: float) -> float:
    """Render the declaration heading + paragraph block. Returns y after."""
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN, y, "DECLARATION")
    c.setStrokeColor(BRAND_BLUE_SOFT)
    c.setLineWidth(1.2)
    c.line(MARGIN, y - 4, PAGE_WIDTH - MARGIN, y - 4)

    y -= 18
    text = _render_declaration(college_name)
    paragraphs = text.split("\n\n")
    c.setFont("Helvetica", 9.5)
    c.setFillColor(INK)
    max_chars = 110  # rough wrap width for Helvetica 9.5pt at CONTENT_WIDTH
    for para in paragraphs:
        lines = wrap(para, width=max_chars)
        for ln in lines:
            c.drawString(MARGIN, y, ln)
            y -= 12
        y -= 6
    return y


def _draw_signature_strip(c: Canvas, y: float) -> None:
    c.setStrokeColor(INK)
    c.setLineWidth(0.4)
    c.line(MARGIN, y, MARGIN + 170, y)
    c.line(PAGE_WIDTH - MARGIN - 170, y, PAGE_WIDTH - MARGIN, y)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN, y - 14, "Applicant Signature")
    c.drawString(PAGE_WIDTH - MARGIN - 170, y - 14, "Admissions Officer")


def _draw_footer(c: Canvas) -> None:
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    c.line(MARGIN, 50, PAGE_WIDTH - MARGIN, 50)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawCentredString(PAGE_WIDTH / 2, 32,
                        "More Information: +91 88846 27275 | info@kmfoundation.co.in | www.kmfoundation.co.in")
    c.setFillColor(FOOTER_GRAY)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(PAGE_WIDTH / 2, 18,
                        f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}. FinFlow by KM Foundation")


def render_application_pdf(student: dict) -> bytes:
    """Generate the admission application PDF from a `students` document.

    Returns raw PDF bytes — used for email attachments.
    Raises ValueError if the student has no `application` payload.
    """
    app = student.get("application")
    if not app:
        raise ValueError("Student has no application data attached")

    ref_code = (student.get("id") or "")[:8].upper() or "—"
    submitted_at = student.get("application_submitted_at") or ""

    buf = BytesIO()
    c = Canvas(buf, pagesize=A4)

    # ---- Header ----
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

    # ---- Helper to draw flowable tables and advance cursor ----
    def draw_flowable(flowable, gap_top: float = 0):
        nonlocal y
        y -= gap_top
        w, h = flowable.wrap(CONTENT_WIDTH, y)
        if y - h < 90:
            _draw_footer(c)
            c.showPage()
            inner_y = _draw_header(c, ref_code, submitted_at)
            y = inner_y
            w, h = flowable.wrap(CONTENT_WIDTH, y)
        flowable.drawOn(c, MARGIN, y - h)
        y -= h

    # ---- CANDIDATE DETAILS ----
    y = _draw_section_header(c, "Candidate Details", y, sub="*Your personal information")
    draw_flowable(_kv_block_flowable([
        ("Mobile", bi.get("mobile_number")),
        ("Email", bi.get("email")),
        ("Nationality", bi.get("nationality") or "Indian"),
        ("Caste", bi.get("caste")),
        ("Religion", bi.get("religion")),
        ("Date of Birth", _fmt_date(bi.get("date_of_birth"))),
        ("Gender", _label_of(GENDER_MAP, bi.get("gender"))),
        ("Aadhaar", bi.get("aadhaar_number")),
    ]), gap_top=4)

    # ---- PARENTS & ADDRESS ----
    cm = app.get("communication") or {}
    addr = ", ".join(filter(None, [cm.get("address_line_1"), cm.get("address_line_2")]))
    y -= 10
    y = _draw_section_header(c, "Parents & Address", y)
    draw_flowable(_kv_block_flowable([
        ("Father's Name", cm.get("father_name")),
        ("Father's Mobile", cm.get("father_mobile")),
        ("Mother's Name", cm.get("mother_name")),
        ("Mother's Mobile", cm.get("mother_mobile")),
        ("City", cm.get("city")),
        ("State", cm.get("state")),
        ("Pincode", cm.get("pincode")),
    ]), gap_top=4)
    draw_flowable(_wide_row_flowable("Address", addr or "—"))

    # ---- ACADEMIC QUALIFICATIONS ----
    ac = app.get("academic") or {}
    y -= 10
    y = _draw_section_header(c, "Academic Qualifications", y)
    draw_flowable(_academic_table_flowable(ac.get("tenth") or {}, ac.get("twelfth") or {}), gap_top=4)

    # ---- DECLARATION ----
    # Make sure there's room (decl ≈ 100pt + signature ≈ 60pt + footer ≈ 60pt).
    if y < 230:
        _draw_footer(c)
        c.showPage()
        y = _draw_header(c, ref_code, submitted_at)
    y -= 14
    y = _draw_declaration(c, co.get("preferred_college"), y)

    # ---- Signature strip ----
    sig_y = max(y - 30, 110)
    _draw_signature_strip(c, sig_y)

    # ---- Footer on the final page ----
    _draw_footer(c)

    c.showPage()
    c.save()
    return buf.getvalue()
