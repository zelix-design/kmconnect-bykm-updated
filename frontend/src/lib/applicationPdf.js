// Per-student admission application PDF — KM Foundation branded design.
//
// Mirrors /app/backend/lib/application_pdf.py exactly:
//   - Red→black gradient bar at the very top
//   - Logo TOP-LEFT (km-mark.png), Ref/Submitted TOP-RIGHT
//   - Applicant name banner (Montserrat-Bold 22pt)
//   - Course / College in semibold 10pt
//   - Section headers 11pt bold with thin black underline
//   - Two-column key/value blocks at 9pt
//   - Pink accent (#FFE7F3) on 10th / 12th sub-header rows
//   - Declaration paragraph at 8pt
//   - Signature blocks + KM Foundation contact footer at 7pt
//
// Single A4 page output. Montserrat TTFs are loaded once per session.
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

const MARGIN = 36;
// Brand palette per design spec
const BRAND_RED = [199, 0, 0];      // #C70000
const BRAND_BLACK = [16, 16, 16];   // #101010
const PINK = [255, 231, 243];       // #FFE7F3
const INK = [0, 0, 0];
const MUTED = [90, 90, 90];
const RULE = [212, 212, 212];

// ---- Font registry ----
// jsPDF needs the TTF as a base64 string. We fetch it once per page-session
// and stash on `window` so subsequent PDFs reuse without refetching.
const FONT_FILES = [
  { name: "Montserrat", style: "normal", file: "Montserrat-Regular.ttf" },
  { name: "Montserrat", style: "bold", file: "Montserrat-Bold.ttf" },
  { name: "MontserratSemi", style: "normal", file: "Montserrat-SemiBold.ttf" },
  { name: "MontserratLight", style: "normal", file: "Montserrat-Light.ttf" },
];

async function loadFontDataUrl(file) {
  try {
    const res = await fetch(`/fonts/${file}`, { cache: "force-cache" });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // Convert ArrayBuffer to base64 in chunks to avoid stack overflow
    const bytes = new Uint8Array(buf);
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  } catch (err) {
    console.warn(`[applicationPdf] font load failed (${file}):`, err?.message || err);
    return null;
  }
}

let FONTS_BASE64 = null;
async function ensureFonts(doc) {
  if (!FONTS_BASE64) {
    const entries = await Promise.all(FONT_FILES.map(async (f) => ({
      ...f, b64: await loadFontDataUrl(f.file),
    })));
    FONTS_BASE64 = entries.filter((e) => e.b64);
  }
  // If no fonts loaded, fall back silently to Helvetica
  if (!FONTS_BASE64.length) return { primary: "helvetica", bold: "helvetica", semi: "helvetica", light: "helvetica" };
  // Register each font with this jsPDF doc instance
  for (const f of FONTS_BASE64) {
    doc.addFileToVFS(f.file, f.b64);
    doc.addFont(f.file, f.name, f.style);
  }
  return { primary: "Montserrat", bold: "Montserrat", semi: "MontserratSemi", light: "MontserratLight" };
}

// ---- Helpers ----
function v(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
function labelOf(map, value) {
  if (!value) return "—";
  return map[value] || value;
}

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

function drawGradientBar(doc, height = 8) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const steps = 200;
  const stripeW = pageWidth / steps;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const r = Math.round(BRAND_RED[0] + (BRAND_BLACK[0] - BRAND_RED[0]) * t);
    const g = Math.round(BRAND_RED[1] + (BRAND_BLACK[1] - BRAND_RED[1]) * t);
    const b = Math.round(BRAND_RED[2] + (BRAND_BLACK[2] - BRAND_RED[2]) * t);
    doc.setFillColor(r, g, b);
    doc.rect(i * stripeW, 0, stripeW + 0.6, height, "F");
  }
}

function drawHeader(doc, fonts, opts) {
  const pageWidth = doc.internal.pageSize.getWidth();
  // 1) Gradient bar
  drawGradientBar(doc, 8);

  // 2) Logo top-left
  if (opts.logoDataUrl) {
    try {
      doc.addImage(opts.logoDataUrl, "PNG", MARGIN, 16, 50, 50);
    } catch (err) {
      console.warn("[applicationPdf] addImage failed", err);
    }
  }

  // 3) AdmissionForm wordmark + sub-line
  doc.setFont(fonts.bold, "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text("AdmissionForm", MARGIN + 60, 38);
  doc.setFont(fonts.semi, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("KM Foundation Educational Services LLP", MARGIN + 60, 50);

  // 4) Right side: Ref + Submitted
  doc.setFont(fonts.semi, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(`Ref: ${opts.refCode}`, pageWidth - MARGIN, 38, { align: "right" });
  doc.setFont(fonts.primary, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Submitted: ${opts.submittedAt}`, pageWidth - MARGIN, 50, { align: "right" });

  // 5) Subtle rule
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 78, pageWidth - MARGIN, 78);

  return 96;
}

function drawApplicantBanner(doc, fonts, opts, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont(fonts.bold, "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text((opts.studentName || "—").toUpperCase(), MARGIN, y);

  doc.setFont(fonts.semi, "normal");
  doc.setFontSize(10);
  doc.text((opts.course || "—").toUpperCase(), MARGIN, y + 16);

  doc.setFont(fonts.semi, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text((opts.college || "—").toUpperCase(), MARGIN, y + 30);

  doc.setFont(fonts.semi, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(`Admission Type:  ${opts.admissionType || "—"}`,
    pageWidth - MARGIN, y + 4, { align: "right" });
  doc.text(`Academic Year:  ${opts.academicYear || "—"}`,
    pageWidth - MARGIN, y + 18, { align: "right" });

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y + 42, pageWidth - MARGIN, y + 42);
  return y + 56;
}

function drawSectionHeader(doc, fonts, title, y, sub) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont(fonts.bold, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(title.toUpperCase(), MARGIN, y);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y + 3, pageWidth - MARGIN, y + 3);
  if (sub) {
    doc.setFont(fonts.primary, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(sub, MARGIN, y + 13);
    return y + 22;
  }
  return y + 14;
}

function drawKvBlock(doc, fonts, rows, startY) {
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
    styles: {
      font: fonts.semi,
      fontStyle: "normal",
      fontSize: 9,
      textColor: INK,
      cellPadding: { top: 2, right: 6, bottom: 2, left: 0 },
      valign: "top",
    },
    columnStyles: {
      0: { textColor: MUTED, cellWidth: 80 },
      1: { textColor: INK, cellWidth: 175 },
      2: { textColor: MUTED, cellWidth: 80 },
      3: { textColor: INK, cellWidth: 175 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  return doc.lastAutoTable.finalY;
}

function drawWideRow(doc, fonts, label, value, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  autoTable(doc, {
    startY,
    body: [[label, v(value)]],
    theme: "plain",
    styles: {
      font: fonts.semi,
      fontStyle: "normal",
      fontSize: 9,
      textColor: INK,
      cellPadding: { top: 2, right: 6, bottom: 2, left: 0 },
      valign: "top",
    },
    columnStyles: {
      0: { textColor: MUTED, cellWidth: 80 },
      1: { textColor: INK, cellWidth: pageWidth - MARGIN * 2 - 80 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  return doc.lastAutoTable.finalY;
}

function drawAcademicTable(doc, fonts, tenth, twelfth, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;
  const colWidths = [60, 95, 50, 95, 60, contentW - 60 - 95 - 50 - 95 - 60];

  const body = [
    [
      { content: "10th Standard", colSpan: 6, styles: { fillColor: PINK, fontStyle: "bold", textColor: INK, fontSize: 9.5, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 } } },
    ],
    [
      { content: "Register No.", styles: { textColor: MUTED } }, v(tenth.register_number),
      { content: "Board", styles: { textColor: MUTED } }, v(tenth.board),
      { content: "Year", styles: { textColor: MUTED } }, v(tenth.year_of_passing),
    ],
    [
      { content: "School", styles: { textColor: MUTED } }, v(tenth.school_name),
      { content: "Place", styles: { textColor: MUTED } }, v(tenth.school_place),
      { content: "Percentage", styles: { textColor: MUTED } }, v(tenth.percentage),
    ],
    [
      { content: "12th Standard / Diploma", colSpan: 6, styles: { fillColor: PINK, fontStyle: "bold", textColor: INK, fontSize: 9.5, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 } } },
    ],
    [
      { content: "Register No.", styles: { textColor: MUTED } }, v(twelfth.register_number),
      { content: "Board", styles: { textColor: MUTED } }, v(twelfth.board),
      { content: "Year", styles: { textColor: MUTED } }, v(twelfth.year_of_passing),
    ],
    [
      { content: "School", styles: { textColor: MUTED } }, v(twelfth.school_name),
      { content: "Place", styles: { textColor: MUTED } }, v(twelfth.school_place),
      { content: "Percentage", styles: { textColor: MUTED } }, v(twelfth.percentage),
    ],
  ];

  autoTable(doc, {
    startY,
    body,
    theme: "plain",
    styles: {
      font: fonts.semi,
      fontStyle: "normal",
      fontSize: 9,
      textColor: INK,
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: colWidths[0] }, 1: { cellWidth: colWidths[1] },
      2: { cellWidth: colWidths[2] }, 3: { cellWidth: colWidths[3] },
      4: { cellWidth: colWidths[4] }, 5: { cellWidth: colWidths[5] },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  return doc.lastAutoTable.finalY;
}

function drawDeclaration(doc, fonts, collegeName, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = startY;
  doc.setFont(fonts.bold, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("DECLARATION", MARGIN, y);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y + 3, pageWidth - MARGIN, y + 3);
  y += 14;

  const text = renderDeclaration(collegeName).replace(/\n\n/g, " ");
  doc.setFont(fonts.light, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(text, pageWidth - MARGIN * 2);
  for (const ln of lines) {
    doc.text(ln, MARGIN, y);
    y += 10;
  }
  return y;
}

function drawSignatures(doc, fonts, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + 150, y);
  doc.line(pageWidth - MARGIN - 150, y, pageWidth - MARGIN, y);
  doc.setFont(fonts.bold, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text("Applicant Signature", MARGIN, y + 11);
  doc.text("Admissions Officer", pageWidth - MARGIN - 150, y + 11);
}

function drawFooter(doc, fonts) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, pageHeight - 40, pageWidth - MARGIN, pageHeight - 40);
  doc.setFont(fonts.bold, "bold");
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text(
    "More Information: +91 88846 27275  |  info@kmfoundation.co.in  |  www.kmfoundation.co.in",
    pageWidth / 2, pageHeight - 26, { align: "center" },
  );
  doc.setFont(fonts.primary, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  const ts = new Date().toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  doc.text(
    `Generated ${ts}.  FinFlow by KM Foundation`,
    pageWidth / 2, pageHeight - 14, { align: "center" },
  );
}

export async function downloadApplicationPdf({ student }) {
  const app = student.application;
  if (!app) throw new Error("This student has no application data attached.");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  // Load fonts + logo in parallel
  const [fonts, logoDataUrl] = await Promise.all([
    ensureFonts(doc),
    loadLogoDataUrl(),
  ]);

  const bi = app.basic_info || {};
  const co = app.course || {};
  const cm = app.communication || {};
  const ac = app.academic || {};

  const submittedAt = student.application_submitted_at
    ? formatDate(student.application_submitted_at) : "—";
  const refCode = (student.id || "").slice(0, 8).toUpperCase() || "—";

  // ---- Header ----
  let y = drawHeader(doc, fonts, { logoDataUrl, refCode, submittedAt });

  // ---- Applicant banner ----
  y = drawApplicantBanner(doc, fonts, {
    studentName: bi.student_full_name || student.name,
    course: co.interested_course,
    college: co.preferred_college,
    admissionType: labelOf(LABELS.admission_type, co.admission_type),
    academicYear: co.academic_year,
  }, y);

  // ---- CANDIDATE DETAILS ----
  y = drawSectionHeader(doc, fonts, "Candidate Details", y, "*Your personal information");
  y = drawKvBlock(doc, fonts, [
    ["Mobile", bi.mobile_number],
    ["Date of Birth", bi.date_of_birth ? formatDate(bi.date_of_birth) : null],
    ["Email", bi.email],
    ["Gender", labelOf(LABELS.gender, bi.gender)],
    ["Nationality", bi.nationality || "Indian"],
    ["Aadhaar", bi.aadhaar_number],
    ["Caste", bi.caste],
    ["Religion", bi.religion],
  ], y);
  y += 8;

  // ---- PARENTS & ADDRESS ----
  const addrLine = [cm.address_line_1, cm.address_line_2].filter(Boolean).join(", ");
  y = drawSectionHeader(doc, fonts, "Parents & Address", y);
  y = drawKvBlock(doc, fonts, [
    ["Father's Name", cm.father_name],
    ["Mother's Name", cm.mother_name],
    ["Father's Mobile", cm.father_mobile],
    ["Mother's Mobile", cm.mother_mobile],
  ], y);
  y = drawWideRow(doc, fonts, "Address", addrLine || "—", y + 2);
  y = drawKvBlock(doc, fonts, [
    ["City", cm.city],
    ["Pincode", cm.pincode],
    ["State", cm.state],
    ["", ""],
  ], y + 2);
  y += 8;

  // ---- ACADEMIC QUALIFICATIONS ----
  y = drawSectionHeader(doc, fonts, "Academic Qualifications", y);
  y = drawAcademicTable(doc, fonts, ac.tenth || {}, ac.twelfth || {}, y);
  y += 8;

  // ---- DECLARATION ----
  y = drawDeclaration(doc, fonts, co.preferred_college, y);

  // ---- Signature strip ----
  const pageHeight = doc.internal.pageSize.getHeight();
  const sigY = Math.max(y + 22, pageHeight - 78);
  drawSignatures(doc, fonts, sigY);

  // ---- Footer ----
  drawFooter(doc, fonts);

  const safeName = (bi.student_full_name || student.name || "applicant").replace(/[^a-z0-9_\- ]/gi, "_");
  doc.save(`${safeName} - Application - ${new Date().toISOString().slice(0, 10)}.pdf`);
}
