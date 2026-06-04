// Per-student admission application PDF — formal A4 layout matching the
// official KM Foundation Admission Form sample (large applicant banner,
// blue "AdmissionForm" title, KM logo top-right, blue section underlines,
// declaration paragraph, signature blocks, contact footer).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/format";
import { renderDeclaration } from "@/lib/applicationSchema";

const LABELS = {
  gender: { male: "Male", female: "Female", other: "Other" },
  admission_type: {
    management: "MANAGEMENT", government: "GOVERNMENT",
    merit: "MERIT", lateral_entry: "LATERAL ENTRY", other: "OTHER",
  },
};

const MARGIN = 40;
// Brand palette tuned to the sample (deep blue accent + soft gray rules).
const BRAND_BLUE = [25, 65, 130];
const BRAND_BLUE_SOFT = [180, 200, 230];
const INK = [28, 25, 23];
const MUTED = [120, 113, 108];
const RULE = [220, 218, 215];

function v(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
function labelOf(map, value) {
  if (!value) return "—";
  return map[value] || value;
}

// Load /km-mark.png from the same origin and convert it to a base64 PNG
// data URI that jsPDF can embed. Returns null on any failure so the PDF
// still generates without the logo.
async function loadLogoDataUrl() {
  try {
    const res = await fetch("/km-mark.png", { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("[applicationPdf] logo load failed:", err?.message || err);
    return null;
  }
}

function drawHeader(doc, opts) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Logo top-right (optional). Slot reserved 64×64.
  if (opts.logoDataUrl) {
    try {
      doc.addImage(opts.logoDataUrl, "PNG", pageWidth - MARGIN - 60, 32, 60, 60);
    } catch (err) {
      // Silently skip if the PNG can't be decoded by jsPDF.
    }
  }

  // "AdmissionForm" main title — top-left, bold blue.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...BRAND_BLUE);
  doc.text("AdmissionForm", MARGIN, 56);

  // Ref + submitted timestamp — sits just below the logo, right aligned.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(`Ref: ${opts.refCode}`, pageWidth - MARGIN, 102, { align: "right" });
  doc.text(`Submitted: ${opts.submittedAt}`, pageWidth - MARGIN, 116, { align: "right" });

  // Horizontal rule
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 130, pageWidth - MARGIN, 130);
  return 148;
}

function drawApplicantBanner(doc, opts, y) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Big applicant name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text((opts.studentName || "—").toUpperCase(), MARGIN, y);

  // Course (large)
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text((opts.course || "—").toUpperCase(), MARGIN, y + 24);

  // College (medium)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text((opts.college || "—").toUpperCase(), MARGIN, y + 42);

  // Admission Type + Academic Year row (label : value, right-aligned values)
  const rowY = y + 66;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Admission Type:", MARGIN, rowY);
  doc.text("Academic Year :", MARGIN, rowY + 16);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text((opts.admissionType || "—"), pageWidth - MARGIN, rowY, { align: "right" });
  doc.text((opts.academicYear || "—"), pageWidth - MARGIN, rowY + 16, { align: "right" });

  // Soft separator
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, rowY + 28, pageWidth - MARGIN, rowY + 28);
  return rowY + 44;
}

function drawSectionHeader(doc, title, y, opts = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(title.toUpperCase(), MARGIN, y);
  // Blue underline
  doc.setDrawColor(...BRAND_BLUE_SOFT);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y + 4, pageWidth - MARGIN, y + 4);

  if (opts.sub) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(opts.sub, MARGIN, y + 18);
    return y + 30;
  }
  return y + 22;
}

// Two-column key/value block. `rows` is a flat list of [label, value] tuples.
// Optionally `wideRows` are full-width rows inserted in order (used for
// addresses/long values).
function drawKvBlock(doc, rows, startY, wideRows = []) {
  const body = [];
  let buffer = null;
  for (const r of rows) {
    if (!buffer) {
      buffer = [r[0], v(r[1])];
    } else {
      body.push([buffer[0], buffer[1], r[0], v(r[1])]);
      buffer = null;
    }
  }
  if (buffer) body.push([buffer[0], buffer[1], "", ""]);

  autoTable(doc, {
    startY,
    body,
    theme: "plain",
    styles: { fontSize: 9.5, textColor: INK, cellPadding: { top: 4, right: 8, bottom: 4, left: 0 }, valign: "top" },
    columnStyles: {
      0: { fontStyle: "bold", textColor: MUTED, cellWidth: 95 },
      1: { cellWidth: 158 },
      2: { fontStyle: "bold", textColor: MUTED, cellWidth: 95 },
      3: { cellWidth: 158 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  let y = doc.lastAutoTable.finalY;

  // Render wide rows underneath
  if (wideRows.length) {
    autoTable(doc, {
      startY: y,
      body: wideRows.map(([k, val]) => [k, v(val)]),
      theme: "plain",
      styles: { fontSize: 9.5, textColor: INK, cellPadding: { top: 4, right: 8, bottom: 4, left: 0 }, valign: "top" },
      columnStyles: {
        0: { fontStyle: "bold", textColor: MUTED, cellWidth: 95 },
        1: { cellWidth: "auto" },
      },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = doc.lastAutoTable.finalY;
  }
  return y;
}

function drawAcademicTable(doc, tenth, twelfth, startY) {
  // Header row + one row per level. Layout: Reg.No | School | Board | Place | Year | %
  const head = [["Register No.", "School", "Board", "Place", "Year", "Percentage"]];
  const body = [
    [
      { content: "10th Standard", colSpan: 6, styles: { fillColor: [245, 247, 252], textColor: BRAND_BLUE, fontStyle: "bold", fontSize: 10 } },
    ],
    [
      v(tenth.register_number), v(tenth.school_name), v(tenth.board),
      v(tenth.school_place), v(tenth.year_of_passing), v(tenth.percentage),
    ],
    [
      { content: "12th Standard / Diploma", colSpan: 6, styles: { fillColor: [245, 247, 252], textColor: BRAND_BLUE, fontStyle: "bold", fontSize: 10 } },
    ],
    [
      v(twelfth.register_number), v(twelfth.school_name), v(twelfth.board),
      v(twelfth.school_place), v(twelfth.year_of_passing), v(twelfth.percentage),
    ],
  ];
  autoTable(doc, {
    startY,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, textColor: INK, cellPadding: 5, valign: "middle" },
    headStyles: { fillColor: [255, 255, 255], textColor: MUTED, fontStyle: "bold", fontSize: 8.5, lineColor: RULE, lineWidth: 0.4 },
    bodyStyles: { lineColor: RULE, lineWidth: 0.4 },
    columnStyles: {
      0: { cellWidth: 70 }, 1: { cellWidth: 110 },
      2: { cellWidth: 60 }, 3: { cellWidth: 80 },
      4: { cellWidth: 55 }, 5: { cellWidth: 'auto' },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  return doc.lastAutoTable.finalY;
}

function drawDeclaration(doc, collegeName, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = startY;
  // Heading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("DECLARATION", MARGIN, y);
  doc.setDrawColor(...BRAND_BLUE_SOFT);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y + 4, pageWidth - MARGIN, y + 4);
  y += 18;

  const text = renderDeclaration(collegeName);
  const paragraphs = text.split("\n\n");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  for (let i = 0; i < paragraphs.length; i += 1) {
    const lines = doc.splitTextToSize(paragraphs[i], pageWidth - MARGIN * 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 12 + 6;
  }
  return y;
}

function drawSignatureStrip(doc, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, MARGIN + 170, y);
  doc.line(pageWidth - MARGIN - 170, y, pageWidth - MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("Applicant Signature", MARGIN, y + 14);
  doc.text("Admissions Officer", pageWidth - MARGIN - 170, y + 14);
}

function drawFooter(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  // Top divider
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, pageHeight - 50, pageWidth - MARGIN, pageHeight - 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    "More Information: +91 88846 27275 | info@kmfoundation.co.in | www.kmfoundation.co.in",
    pageWidth / 2, pageHeight - 32, { align: "center" },
  );
  doc.setFontSize(7.5);
  doc.setTextColor(168, 162, 158);
  doc.text(
    `Generated ${new Date().toLocaleString()}. FinFlow by KM Foundation`,
    pageWidth / 2, pageHeight - 18, { align: "center" },
  );
}

function ensureSpace(doc, y, needed = 100) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 100) {
    doc.addPage();
    return 60;
  }
  return y;
}

export async function downloadApplicationPdf({ student }) {
  const app = student.application;
  if (!app) throw new Error("This student has no application data attached.");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logoDataUrl = await loadLogoDataUrl();

  const bi = app.basic_info || {};
  const co = app.course || {};
  const cm = app.communication || {};
  const ac = app.academic || {};

  const submittedAt = student.application_submitted_at
    ? formatDate(student.application_submitted_at)
    : "—";
  const refCode = (student.id || "").slice(0, 8).toUpperCase() || "—";

  // ---- Header (logo + title + ref) ----
  let y = drawHeader(doc, { logoDataUrl, refCode, submittedAt });

  // ---- Applicant banner ----
  y = drawApplicantBanner(doc, {
    studentName: bi.student_full_name || student.name,
    course: co.interested_course,
    college: co.preferred_college,
    admissionType: labelOf(LABELS.admission_type, co.admission_type),
    academicYear: co.academic_year,
  }, y);

  // ---- CANDIDATE DETAILS ----
  y = ensureSpace(doc, y, 200);
  y = drawSectionHeader(doc, "Candidate Details", y, { sub: "*Your personal information" });
  y = drawKvBlock(doc, [
    ["Mobile", bi.mobile_number],
    ["Email", bi.email],
    ["Nationality", bi.nationality || "Indian"],
    ["Caste", bi.caste],
    ["Religion", bi.religion],
    ["Date of Birth", bi.date_of_birth ? formatDate(bi.date_of_birth) : null],
    ["Gender", labelOf(LABELS.gender, bi.gender)],
    ["Aadhaar", bi.aadhaar_number],
  ], y);

  // ---- PARENTS & ADDRESS ----
  y = ensureSpace(doc, y + 10, 180);
  y = drawSectionHeader(doc, "Parents & Address", y);
  const addrLine = [cm.address_line_1, cm.address_line_2].filter(Boolean).join(", ");
  y = drawKvBlock(doc, [
    ["Father's Name", cm.father_name],
    ["Father's Mobile", cm.father_mobile],
    ["Mother's Name", cm.mother_name],
    ["Mother's Mobile", cm.mother_mobile],
    ["City", cm.city],
    ["State", cm.state],
    ["Pincode", cm.pincode],
  ], y, [["Address", addrLine || "—"]]);

  // ---- ACADEMIC QUALIFICATIONS ----
  y = ensureSpace(doc, y + 10, 160);
  y = drawSectionHeader(doc, "Academic Qualifications", y);
  y = drawAcademicTable(doc, ac.tenth || {}, ac.twelfth || {}, y);

  // ---- DECLARATION ----
  y = ensureSpace(doc, y + 14, 120);
  y = drawDeclaration(doc, co.preferred_college, y);

  // ---- Signature strip (always near the bottom of last page) ----
  const pageHeight = doc.internal.pageSize.getHeight();
  const sigY = Math.max(y + 50, pageHeight - 100);
  drawSignatureStrip(doc, sigY);

  // ---- Footer (every page) ----
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    drawFooter(doc);
  }

  const safeName = (bi.student_full_name || student.name || "applicant").replace(/[^a-z0-9_\- ]/gi, "_");
  doc.save(`${safeName} - Application - ${new Date().toISOString().slice(0, 10)}.pdf`);
}
