// Per-student admission application PDF — formal A4 layout mirroring the
// 6-section public form (Basic / Course / Communication / Academic / Payment /
// Reference). Used by the admin from the Student Detail page when the student
// has an `application` sub-document.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMoneyForPdf, formatDate } from "@/lib/format";

const LABELS = {
  gender: { male: "Male", female: "Female", other: "Other" },
  admission_type: {
    management: "Management", government: "Government",
    merit: "Merit", lateral_entry: "Lateral Entry", other: "Other",
  },
  payment_mode: {
    cash: "Cash", bank_transfer: "Bank Transfer", upi: "UPI",
    cheque: "Cheque", card: "Card", other: "Other",
  },
  reference_type: {
    sub_agent: "Sub Agent / Associate", associate: "Associate Consultant",
    km: "KM Office", staff: "Staff", self: "Self / Walk-in", other: "Other",
  },
};

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
  const margin = 48;
  // Eyebrow strip
  doc.setFillColor(255, 251, 235); // amber-50
  doc.rect(margin, y, pageWidth - margin * 2, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9); // amber-700
  doc.text(eyebrow.toUpperCase(), margin + 10, y + 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text(title, margin + 10, y + 30);
  return y + 44;
}

// Renders 2-column key/value table using autoTable for safe wrapping.
function drawKeyValueTable(doc, rows, startY) {
  autoTable(doc, {
    startY,
    head: [],
    body: rows,
    theme: "plain",
    styles: { fontSize: 9, textColor: [28, 25, 23], cellPadding: 5 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [120, 113, 108], cellWidth: 130 },
      1: { textColor: [28, 25, 23] },
      2: { fontStyle: "bold", textColor: [120, 113, 108], cellWidth: 130 },
      3: { textColor: [28, 25, 23] },
    },
    margin: { left: 48, right: 48 },
  });
  return doc.lastAutoTable.finalY;
}

function pairRows(items) {
  // items = [[label, value], …]. Renders 2-up in a 4-col table.
  const out = [];
  for (let i = 0; i < items.length; i += 2) {
    const [l1, v1] = items[i];
    const [l2, v2] = items[i + 1] || ["", ""];
    out.push([l1, valOrDash(v1), l2, valOrDash(v2)]);
  }
  return out;
}

function ensureSpace(doc, y, needed = 80) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 60) {
    doc.addPage();
    return 60;
  }
  return y;
}

export function downloadApplicationPdf({ student, user }) {
  const app = student.application;
  if (!app) {
    throw new Error("This student has no application data attached.");
  }
  const currency = user?.currency || "INR";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;

  // -------- Header banner --------
  doc.setFillColor(217, 119, 6); // amber-600
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("Student Admission Application", margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("FinFlow by KM Foundation", margin, 46);

  doc.setFontSize(8);
  doc.text(`Ref: ${student.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, 30, { align: "right" });
  doc.text(`Submitted: ${student.application_submitted_at ? formatDate(student.application_submitted_at) : "—"}`, pageWidth - margin, 46, { align: "right" });

  let y = 90;

  // -------- A. Basic Info --------
  const bi = app.basic_info || {};
  y = drawSectionHeader(doc, "Candidate Details", "Section A", y);
  y = drawKeyValueTable(doc, pairRows([
    ["Full Name", bi.student_full_name],
    ["Date of Birth", bi.date_of_birth ? formatDate(bi.date_of_birth) : "—"],
    ["Gender", labelOf(LABELS.gender, bi.gender)],
    ["Mobile", bi.mobile_number],
    ["Email", bi.email],
    ["Aadhaar", bi.aadhaar_number],
    ["Nationality", bi.nationality || "Indian"],
    ["Religion", bi.religion],
    ["Caste", bi.caste],
    ["", ""],
  ]), y + 4);

  // -------- B. Course --------
  y = ensureSpace(doc, y + 16);
  const co = app.course || {};
  y = drawSectionHeader(doc, "Course & Admission", "Section B", y);
  y = drawKeyValueTable(doc, pairRows([
    ["Interested Course", co.interested_course],
    ["Preferred College", co.preferred_college],
    ["Academic Year", co.academic_year],
    ["Admission Type", labelOf(LABELS.admission_type, co.admission_type)],
  ]), y + 4);

  // -------- C. Communication --------
  y = ensureSpace(doc, y + 16);
  const cm = app.communication || {};
  y = drawSectionHeader(doc, "Parents & Address", "Section C", y);
  const addrLines = [cm.address_line_1, cm.address_line_2].filter(Boolean).join(", ");
  y = drawKeyValueTable(doc, pairRows([
    ["Father's Name", cm.father_name],
    ["Father's Mobile", cm.father_mobile],
    ["Mother's Name", cm.mother_name],
    ["Mother's Mobile", cm.mother_mobile],
    ["Address", addrLines || "—"],
    ["City", cm.city],
    ["State", cm.state],
    ["Pincode", cm.pincode],
  ]), y + 4);

  // -------- D. Academic --------
  y = ensureSpace(doc, y + 24, 150);
  const ac = app.academic || {};
  y = drawSectionHeader(doc, "Academic Qualifications", "Section D", y);

  const academicRows = (rec, title) => [
    [{ content: title, colSpan: 6, styles: { fillColor: [250, 250, 249], fontStyle: "bold", textColor: [120, 113, 108], fontSize: 9 } }],
    ["Register No.", valOrDash(rec.register_number), "Board", valOrDash(rec.board), "Year", valOrDash(rec.year_of_passing)],
    ["School", valOrDash(rec.school_name), "Place", valOrDash(rec.school_place), "Percentage", valOrDash(rec.percentage)],
  ];
  autoTable(doc, {
    startY: y + 4,
    head: [],
    body: [
      ...academicRows(ac.tenth || {}, "10th Standard"),
      ...academicRows(ac.twelfth || {}, "12th Standard / Diploma"),
    ],
    theme: "plain",
    styles: { fontSize: 9, textColor: [28, 25, 23], cellPadding: 5 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [120, 113, 108], cellWidth: 75 },
      2: { fontStyle: "bold", textColor: [120, 113, 108], cellWidth: 60 },
      4: { fontStyle: "bold", textColor: [120, 113, 108], cellWidth: 75 },
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY;

  // -------- E. Payment --------
  y = ensureSpace(doc, y + 24);
  const pay = app.payment || {};
  y = drawSectionHeader(doc, "Registration Payment", "Section E", y);
  y = drawKeyValueTable(doc, pairRows([
    ["Amount", pay.registration_amount > 0 ? formatMoneyForPdf(pay.registration_amount, currency) : "—"],
    ["Payment Date", pay.payment_date ? formatDate(pay.payment_date) : "—"],
    ["Mode", labelOf(LABELS.payment_mode, pay.payment_mode)],
    ["Transaction ID / UTR", pay.transaction_id],
    ["Payment Screenshot URL", pay.screenshot_url],
    ["", ""],
  ]), y + 4);

  // -------- F. Reference --------
  y = ensureSpace(doc, y + 16);
  const ref = app.reference || {};
  y = drawSectionHeader(doc, "Reference / How they heard about us", "Section F", y);
  y = drawKeyValueTable(doc, pairRows([
    ["Reference Type", labelOf(LABELS.reference_type, ref.type)],
    ["Reference Name", ref.name],
    ["Contact Number", ref.contact_number],
    ["Place", ref.place],
  ]), y + 4);

  if (ref.notes) {
    autoTable(doc, {
      startY: y + 6,
      head: [],
      body: [["Additional Notes", ref.notes]],
      theme: "plain",
      styles: { fontSize: 9, textColor: [28, 25, 23], cellPadding: 6, valign: "top" },
      columnStyles: {
        0: { fontStyle: "bold", textColor: [120, 113, 108], cellWidth: 130 },
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY;
  }

  // -------- Signature strip --------
  const pageHeight = doc.internal.pageSize.getHeight();
  const sigY = Math.max(y + 60, pageHeight - 120);
  doc.setDrawColor(231, 229, 228);
  doc.line(margin, sigY, margin + 160, sigY);
  doc.line(pageWidth - margin - 160, sigY, pageWidth - margin, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 113, 108);
  doc.text("Applicant Signature", margin, sigY + 14);
  doc.text("Admissions Officer", pageWidth - margin - 160, sigY + 14);

  doc.setFontSize(7);
  doc.setTextColor(168, 162, 158);
  doc.text(`Generated ${new Date().toLocaleString()} · FinFlow by KM Foundation`, pageWidth / 2, pageHeight - 24, { align: "center" });

  const safeName = (bi.student_full_name || student.name || "applicant").replace(/[^a-z0-9_\- ]/gi, "_");
  doc.save(`${safeName} - Application - ${new Date().toISOString().slice(0, 10)}.pdf`);
}
