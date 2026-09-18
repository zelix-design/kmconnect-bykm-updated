// Monthly payslip PDF (client-side jsPDF) — matches the invoice / statement style.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMoneyForPdf as fmt } from "@/lib/format";

const OFFICE_LABEL = {
  KM_BLR: "KM Bangalore",
  KM_TCR: "KM Thrissur",
  KM_KMLY: "KM Kollam",
};

function monthLabel(month) {
  try {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } catch {
    return month;
  }
}

export function downloadPayslipPdf({ row, month, currency = "INR", org = "KM Foundation" }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;

  // Header bar
  doc.setFillColor(190, 24, 60); // crimson
  doc.rect(0, 0, pageWidth, 96, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("PAYSLIP", margin, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(org, margin, 66);
  doc.setFontSize(10);
  doc.text(monthLabel(month), pageWidth - margin, 46, { align: "right" });
  doc.text(OFFICE_LABEL[row.office] || row.office || "", pageWidth - margin, 64, { align: "right" });

  // Employee block
  let y = 128;
  doc.setTextColor(28, 25, 23);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(row.name || "—", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120, 113, 108);
  doc.text(
    `${row.role === "office_admin" ? "Office Admin" : "Staff"} · Pay period: ${monthLabel(month)}`,
    margin,
    y + 16,
  );

  // Attendance summary
  autoTable(doc, {
    startY: y + 36,
    theme: "grid",
    head: [["Attendance summary", ""]],
    body: [
      ["Working days", String(row.working_days)],
      ["Present days", String(row.present_days)],
      ["Half days", String(row.half_days)],
      ["Paid leave days", String(row.leave_days)],
      ["Total paid days", String(row.paid_days)],
      ["Absent days", String(row.absent_days)],
    ],
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [244, 244, 245], textColor: [28, 25, 23], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });

  // Salary structure (CTC breakup)
  const breakup = Array.isArray(row.salary_breakup) ? row.salary_breakup : [];
  if (breakup.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 18,
      theme: "grid",
      head: [["Salary component", "% of CTC", "Taxable", "Amount"]],
      body: breakup.map((b) => [b.label, `${b.pct}%`, b.taxable, fmt(b.amount, currency)]),
      foot: [["Monthly CTC", "100%", "", fmt(row.monthly_salary, currency)]],
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [244, 244, 245], textColor: [28, 25, 23], fontStyle: "bold" },
      footStyles: { fillColor: [244, 244, 245], textColor: [28, 25, 23], fontStyle: "bold" },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" } },
      margin: { left: margin, right: margin },
    });
  }

  // Earnings / deductions
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    theme: "grid",
    head: [["Salary computation", "Amount"]],
    body: [
      ["Monthly fixed salary (CTC)", fmt(row.monthly_salary, currency)],
      ["Per-day rate", fmt(row.per_day, currency)],
      [`Absent deduction (${row.absent_days} × ${fmt(row.per_day, currency)})`, `- ${fmt(row.deduction, currency)}`],
    ],
    foot: [[row.salary_hold ? "Net payable (ON HOLD)" : "Net payable", row.salary_hold ? fmt(0, currency) : fmt(row.net_pay, currency)]],
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [244, 244, 245], textColor: [28, 25, 23], fontStyle: "bold" },
    footStyles: { fillColor: [190, 24, 60], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 12 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });

  if (row.salary_hold) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(180, 83, 9);
    doc.text(
      `Salary is currently ON HOLD. Computed net before hold: ${fmt(row.net_before_hold ?? row.net_pay, currency)}.`,
      margin,
      doc.lastAutoTable.finalY + 18,
    );
    doc.setFont("helvetica", "normal");
  }

  doc.setFontSize(8);
  doc.setTextColor(150, 143, 138);
  doc.text(
    `Generated ${new Date().toLocaleString()} · This is a system-generated payslip.`,
    margin,
    doc.internal.pageSize.getHeight() - 30,
  );

  const safe = (row.name || "employee").replace(/[^\w]+/g, "-");
  doc.save(`${safe}-payslip-${month}.pdf`);
}
