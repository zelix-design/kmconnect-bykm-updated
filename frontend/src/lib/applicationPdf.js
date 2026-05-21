// Per-student admission application PDF — formal A4 layout mirroring the
// public form's first 4 sections (Basic / Course / Communication / Academic).
// Payment + Reference sections are intentionally omitted from the printed
// application; those are handled inside FinFlow's admin views instead.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/format";

const LABELS = {
  gender: { male: "Male", female: "Female", other: "Other" },
  admission_type: {
    management: "Management", government: "Government",
    merit: "Merit", lateral_entry: "Lateral Entry", other: "Other",
  },
};

const MARGIN = 48;
// 4-column layout uses fixed widths so labels and values line up across every
// section. Total content width = pageWidth − 2*margin = 499pt on A4 (595pt).
const COL_LABEL = 105;
const COL_VALUE = 144;
const FULL_VALUE = COL_LABEL + COL_VALUE * 2 + COL_LABEL; // for wide rows

function valOrDash(v) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
function labelOf(map, v) {
  if (!v) return "—";
  return map[v] || v;
}

function drawSectionHeader(doc, title, eyebrow, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(255, 251, 235);
  doc.rect(MARGIN, y, pageWidth - MARGIN * 2, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9);
  doc.text(eyebrow.toUpperCase(), MARGIN + 10, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text(title, MARGIN + 10, y + 22);
  return y + 38;
}

/**
 * Render a 4-column key/value grid (label · value · label · value) with strict
 * column widths so every row lines up. Pass `rows` as flat array of [k, v]
 * pairs — the helper pairs them 2-up. Use `wideRow(label, value)` to span a
 * full row when the value is long (e.g. address).
 */
function drawKVGrid(doc, rows, startY) {
  const body = [];
  let buffer = null;
  for (const r of rows) {
    if (r.__wide) {
      // flush any single pending left-side pair
      if (buffer) { body.push([buffer[0], buffer[1], "", ""]); buffer = null; }
      body.push([{ content: r.label, styles: { fontStyle: "bold", textColor: [120, 113, 108] } },
                 { content: valOrDash(r.value), colSpan: 3 }]);
    } else if (!buffer) {
      buffer = [r[0], valOrDash(r[1])];
    } else {
      body.push([buffer[0], buffer[1], r[0], valOrDash(r[1])]);
      buffer = null;
    }
  }
  if (buffer) body.push([buffer[0], buffer[1], "", ""]);

  autoTable(doc, {
    startY,
    body,
    theme: "plain",
    styles: { fontSize: 9.5, textColor: [28, 25, 23], cellPadding: { top: 5, right: 8, bottom: 5, left: 0 }, valign: "top" },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [120, 113, 108], cellWidth: COL_LABEL },
      1: { cellWidth: COL_VALUE },
      2: { fontStyle: "bold", textColor: [120, 113, 108], cellWidth: COL_LABEL },
      3: { cellWidth: COL_VALUE },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  return doc.lastAutoTable.finalY;
}

const wideRow = (label, value) => ({ __wide: true, label, value });

function ensureSpace(doc, y, needed = 120) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 80) {
    doc.addPage();
    return 60;
  }
  return y;
}

export function downloadApplicationPdf({ student }) {
  const app = student.application;
  if (!app) throw new Error("This student has no application data attached.");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // -------- Header banner --------
  doc.setFillColor(217, 119, 6);
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("Student Admission Application", MARGIN, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("FinFlow by KM Foundation", MARGIN, 46);

  doc.setFontSize(8);
  doc.text(`Ref: ${student.id.slice(0, 8).toUpperCase()}`, pageWidth - MARGIN, 30, { align: "right" });
  doc.text(
    `Submitted: ${student.application_submitted_at ? formatDate(student.application_submitted_at) : "—"}`,
    pageWidth - MARGIN, 46, { align: "right" },
  );

  let y = 90;

  // -------- A. Basic Info --------
  const bi = app.basic_info || {};
  y = drawSectionHeader(doc, "Candidate Details", "Section A", y);
  y = drawKVGrid(doc, [
    ["Full Name", bi.student_full_name],
    ["Date of Birth", bi.date_of_birth ? formatDate(bi.date_of_birth) : null],
    ["Mobile", bi.mobile_number],
    ["Gender", labelOf(LABELS.gender, bi.gender)],
    ["Email", bi.email],
    ["Aadhaar", bi.aadhaar_number],
    ["Nationality", bi.nationality || "Indian"],
    ["Religion", bi.religion],
    ["Caste", bi.caste],
  ], y);

  // -------- B. Course --------
  y = ensureSpace(doc, y + 18);
  const co = app.course || {};
  y = drawSectionHeader(doc, "Course & Admission", "Section B", y);
  y = drawKVGrid(doc, [
    ["Interested Course", co.interested_course],
    ["Admission Type", labelOf(LABELS.admission_type, co.admission_type)],
    wideRow("Preferred College", co.preferred_college),
    ["Academic Year", co.academic_year],
  ], y);

  // -------- C. Communication --------
  y = ensureSpace(doc, y + 18);
  const cm = app.communication || {};
  const addrLine = [cm.address_line_1, cm.address_line_2].filter(Boolean).join(", ");
  y = drawSectionHeader(doc, "Parents & Address", "Section C", y);
  y = drawKVGrid(doc, [
    ["Father's Name", cm.father_name],
    ["Father's Mobile", cm.father_mobile],
    ["Mother's Name", cm.mother_name],
    ["Mother's Mobile", cm.mother_mobile],
    wideRow("Address", addrLine || "—"),
    ["City", cm.city],
    ["State", cm.state],
    ["Pincode", cm.pincode],
  ], y);

  // -------- D. Academic --------
  y = ensureSpace(doc, y + 18, 200);
  const ac = app.academic || {};
  y = drawSectionHeader(doc, "Academic Qualifications", "Section D", y);

  const academicRows = (rec, title) => [
    [{
      content: title,
      colSpan: 6,
      styles: { fillColor: [250, 250, 249], fontStyle: "bold", textColor: [120, 113, 108], fontSize: 9, cellPadding: { top: 5, bottom: 5, left: 8, right: 8 } },
    }],
    [
      { content: "Register No.", styles: { fontStyle: "bold", textColor: [120, 113, 108] } }, valOrDash(rec.register_number),
      { content: "Board", styles: { fontStyle: "bold", textColor: [120, 113, 108] } }, valOrDash(rec.board),
      { content: "Year", styles: { fontStyle: "bold", textColor: [120, 113, 108] } }, valOrDash(rec.year_of_passing),
    ],
    [
      { content: "School", styles: { fontStyle: "bold", textColor: [120, 113, 108] } }, valOrDash(rec.school_name),
      { content: "Place", styles: { fontStyle: "bold", textColor: [120, 113, 108] } }, valOrDash(rec.school_place),
      { content: "Percentage", styles: { fontStyle: "bold", textColor: [120, 113, 108] } }, valOrDash(rec.percentage),
    ],
  ];
  autoTable(doc, {
    startY: y + 2,
    body: [
      ...academicRows(ac.tenth || {}, "10th Standard"),
      ...academicRows(ac.twelfth || {}, "12th Standard / Diploma"),
    ],
    theme: "plain",
    styles: { fontSize: 9.5, textColor: [28, 25, 23], cellPadding: { top: 5, right: 6, bottom: 5, left: 6 } },
    columnStyles: {
      0: { cellWidth: 70 }, 1: { cellWidth: 115 },
      2: { cellWidth: 50 }, 3: { cellWidth: 100 },
      4: { cellWidth: 70 }, 5: { cellWidth: 94 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = doc.lastAutoTable.finalY;

  // -------- Signature strip --------
  const pageHeight = doc.internal.pageSize.getHeight();
  const sigY = Math.max(y + 70, pageHeight - 110);
  doc.setDrawColor(231, 229, 228);
  doc.line(MARGIN, sigY, MARGIN + 160, sigY);
  doc.line(pageWidth - MARGIN - 160, sigY, pageWidth - MARGIN, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 113, 108);
  doc.text("Applicant Signature", MARGIN, sigY + 14);
  doc.text("Admissions Officer", pageWidth - MARGIN - 160, sigY + 14);

  doc.setFontSize(7);
  doc.setTextColor(168, 162, 158);
  doc.text(
    `Generated ${new Date().toLocaleString()} · FinFlow by KM Foundation`,
    pageWidth / 2, pageHeight - 24, { align: "center" },
  );

  const safeName = (bi.student_full_name || student.name || "applicant").replace(/[^a-z0-9_\- ]/gi, "_");
  doc.save(`${safeName} - Application - ${new Date().toISOString().slice(0, 10)}.pdf`);
}
