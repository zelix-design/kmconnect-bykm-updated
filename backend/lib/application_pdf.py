"""Server-side admission Application PDF.

Generates a 1-2 page A4 PDF that mirrors the client-side `applicationPdf.js`
layout (amber banner, Section A–D, signature strip). Returns raw PDF bytes
suitable for emailing as an attachment.
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, Table, TableStyle


PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 48
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

AMBER = colors.HexColor("#d97706")          # 600 — banner fill
AMBER_BG = colors.HexColor("#fffbeb")       # 50 — section strip
AMBER_INK = colors.HexColor("#b45309")      # 700 — eyebrow text
INK = colors.HexColor("#1c1917")            # text
MUTED = colors.HexColor("#78716c")          # labels
BORDER = colors.HexColor("#e7e5e4")         # signature lines
FOOTER_GRAY = colors.HexColor("#a8a29e")    # footer caption


GENDER_MAP = {"male": "Male", "female": "Female", "other": "Other"}
ADMISSION_MAP = {
    "management": "Management",
    "government": "Government",
    "merit": "Merit",
    "lateral_entry": "Lateral Entry",
    "other": "Other",
}


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
        # Accept either YYYY-MM-DD or ISO datetime.
        d = datetime.fromisoformat(s.replace("Z", "+00:00")) if "T" in s else datetime.strptime(s, "%Y-%m-%d")
        return d.strftime("%b %d, %Y")
    except (ValueError, TypeError):
        return s


def _draw_banner(c: Canvas, ref_code: str, submitted_at: str) -> None:
    c.setFillColor(AMBER)
    c.rect(0, PAGE_HEIGHT - 64, PAGE_WIDTH, 64, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(MARGIN, PAGE_HEIGHT - 34, "Student Admission Application")
    c.setFont("Helvetica", 9)
    c.drawString(MARGIN, PAGE_HEIGHT - 50, "FinFlow by KM Foundation")
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 34, f"Ref: {ref_code}")
    c.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 50, f"Submitted: {_fmt_date(submitted_at)}")


def _section_header_flowable(eyebrow: str, title: str):
    """Returns a small Table that renders the amber section header strip."""
    para_eyebrow = Paragraph(
        f'<font color="#b45309"><b>{eyebrow.upper()}</b></font>',
        ParagraphStyle("eyebrow", fontSize=8, leading=10),
    )
    para_title = Paragraph(
        f'<font color="#1c1917"><b>{title}</b></font>',
        ParagraphStyle("sechead", fontSize=11, leading=14),
    )
    stack = Table(
        [[para_eyebrow], [para_title]],
        colWidths=[CONTENT_WIDTH - 20],
        rowHeights=[12, 14],
    )
    stack.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    wrapper = Table([[stack]], colWidths=[CONTENT_WIDTH])
    wrapper.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AMBER_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return wrapper


def _kv_grid(pairs: list[tuple[str, Any]], wide_rows: list[tuple[str, Any]] | None = None) -> Table:
    """4-column key/value table. `pairs` is paired 2-up. `wide_rows` are
    full-width rows with one label + spanning value, inserted in order.
    """
    body: list[list[Any]] = []
    buf: tuple[str, Any] | None = None

    def flush() -> None:
        nonlocal buf
        if buf is not None:
            body.append([buf[0], _v(buf[1]), "", ""])
            buf = None

    iterator = iter(pairs)
    for label, value in iterator:
        if buf is None:
            buf = (label, value)
        else:
            body.append([buf[0], _v(buf[1]), label, _v(value)])
            buf = None
    flush()

    table = Table(
        body,
        colWidths=[105, 144, 105, 145],
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
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    table.setStyle(TableStyle(style))
    return table


def _wide_row(label: str, value: Any) -> Table:
    table = Table([[label, _v(value)]], colWidths=[105, CONTENT_WIDTH - 105])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def _academic_block(record: dict, title: str) -> Table:
    body = [
        [title, "", "", "", "", ""],
        ["Register No.", _v(record.get("register_number")),
         "Board", _v(record.get("board")),
         "Year", _v(record.get("year_of_passing"))],
        ["School", _v(record.get("school_name")),
         "Place", _v(record.get("school_place")),
         "Percentage", _v(record.get("percentage"))],
    ]
    col_widths = [70, 115, 50, 100, 70, 94]
    table = Table(body, colWidths=col_widths)
    style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fafaf9")),
        ("SPAN", (0, 0), (-1, 0)),
        ("LEFTPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        # Rows 1 + 2
        ("FONTSIZE", (0, 1), (-1, 2), 9.5),
        ("TEXTCOLOR", (0, 1), (-1, 2), INK),
        ("FONTNAME", (0, 1), (0, 2), "Helvetica-Bold"),
        ("FONTNAME", (2, 1), (2, 2), "Helvetica-Bold"),
        ("FONTNAME", (4, 1), (4, 2), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 1), (0, 2), MUTED),
        ("TEXTCOLOR", (2, 1), (2, 2), MUTED),
        ("TEXTCOLOR", (4, 1), (4, 2), MUTED),
        ("LEFTPADDING", (0, 1), (-1, 2), 6),
        ("RIGHTPADDING", (0, 1), (-1, 2), 6),
        ("TOPPADDING", (0, 1), (-1, 2), 5),
        ("BOTTOMPADDING", (0, 1), (-1, 2), 5),
    ]
    table.setStyle(TableStyle(style))
    return table


def _draw_signature_strip(c: Canvas, y: float) -> None:
    c.setStrokeColor(BORDER)
    c.line(MARGIN, y, MARGIN + 160, y)
    c.line(PAGE_WIDTH - MARGIN - 160, y, PAGE_WIDTH - MARGIN, y)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN, y - 12, "Applicant Signature")
    c.drawString(PAGE_WIDTH - MARGIN - 160, y - 12, "Admissions Officer")

    # Footer
    c.setFillColor(FOOTER_GRAY)
    c.setFont("Helvetica", 7)
    footer = f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} · FinFlow by KM Foundation"
    c.drawCentredString(PAGE_WIDTH / 2, 22, footer)


def render_application_pdf(student: dict) -> bytes:
    """Generate the admission application PDF from a `students` document.

    Returns raw PDF bytes — used for email attachments.
    Raises ValueError if the student has no `application` payload.
    """
    app = student.get("application")
    if not app:
        raise ValueError("Student has no application data attached")

    ref_code = student.get("id", "")[:8].upper() or "—"
    submitted_at = student.get("application_submitted_at") or ""

    buf = BytesIO()
    c = Canvas(buf, pagesize=A4)
    _draw_banner(c, ref_code, submitted_at)

    # Cursor starts below banner; reportlab y-axis grows upward.
    y = PAGE_HEIGHT - 90

    def draw_block(flowable, gap_top: int = 0) -> None:
        nonlocal y
        y -= gap_top
        w, h = flowable.wrap(CONTENT_WIDTH, y)
        if y - h < 90:  # not enough room → new page
            c.showPage()
            _draw_banner(c, ref_code, submitted_at)
            y = PAGE_HEIGHT - 90
            w, h = flowable.wrap(CONTENT_WIDTH, y)
        flowable.drawOn(c, MARGIN, y - h)
        y -= h

    # ----- Section A — Candidate Details -----
    bi = app.get("basic_info") or {}
    draw_block(_section_header_flowable("Section A", "Candidate Details"))
    draw_block(_kv_grid([
        ("Full Name", bi.get("student_full_name")),
        ("Date of Birth", _fmt_date(bi.get("date_of_birth"))),
        ("Mobile", bi.get("mobile_number")),
        ("Gender", _label_of(GENDER_MAP, bi.get("gender"))),
        ("Email", bi.get("email")),
        ("Aadhaar", bi.get("aadhaar_number")),
        ("Nationality", bi.get("nationality") or "Indian"),
        ("Religion", bi.get("religion")),
        ("Caste", bi.get("caste")),
    ]), gap_top=4)

    # ----- Section B — Course -----
    co = app.get("course") or {}
    draw_block(_section_header_flowable("Section B", "Course & Admission"), gap_top=12)
    draw_block(_kv_grid([
        ("Interested Course", co.get("interested_course")),
        ("Admission Type", _label_of(ADMISSION_MAP, co.get("admission_type"))),
    ]), gap_top=4)
    draw_block(_wide_row("Preferred College", co.get("preferred_college")))
    draw_block(_kv_grid([
        ("Academic Year", co.get("academic_year")),
    ]))

    # ----- Section C — Communication -----
    cm = app.get("communication") or {}
    addr = ", ".join(filter(None, [cm.get("address_line_1"), cm.get("address_line_2")]))
    draw_block(_section_header_flowable("Section C", "Parents & Address"), gap_top=12)
    draw_block(_kv_grid([
        ("Father's Name", cm.get("father_name")),
        ("Father's Mobile", cm.get("father_mobile")),
        ("Mother's Name", cm.get("mother_name")),
        ("Mother's Mobile", cm.get("mother_mobile")),
    ]), gap_top=4)
    draw_block(_wide_row("Address", addr or "—"))
    draw_block(_kv_grid([
        ("City", cm.get("city")),
        ("State", cm.get("state")),
        ("Pincode", cm.get("pincode")),
    ]))

    # ----- Section D — Academic -----
    ac = app.get("academic") or {}
    draw_block(_section_header_flowable("Section D", "Academic Qualifications"), gap_top=12)
    draw_block(_academic_block(ac.get("tenth") or {}, "10th Standard"), gap_top=4)
    draw_block(_academic_block(ac.get("twelfth") or {}, "12th Standard / Diploma"), gap_top=4)

    # ----- Signature strip -----
    _draw_signature_strip(c, max(y - 30, 105))

    c.showPage()
    c.save()
    return buf.getvalue()
