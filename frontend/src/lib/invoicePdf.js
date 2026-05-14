import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMoney, formatDate } from "@/lib/format";

export function downloadInvoicePDF({ invoice, client, user }) {
  const currency = user?.currency || "USD";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(28, 25, 23);
  doc.text("INVOICE", margin, 70);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120, 113, 108);
  doc.text(`#${invoice.invoice_number}`, margin, 88);

  // Business block (right)
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.setFont("helvetica", "bold");
  doc.text(user?.business_name || user?.name || "FinFlow", pageWidth - margin, 70, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108);
  if (user?.email) doc.text(user.email, pageWidth - margin, 86, { align: "right" });

  // Status badge
  const statusColors = {
    draft: [231, 229, 228], sent: [186, 230, 253], paid: [187, 247, 208], overdue: [254, 205, 211],
  };
  const sc = statusColors[invoice.status] || [231, 229, 228];
  doc.setFillColor(sc[0], sc[1], sc[2]);
  doc.roundedRect(pageWidth - margin - 70, 96, 70, 18, 3, 3, "F");
  doc.setTextColor(41, 37, 36);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text((invoice.status || "draft").toUpperCase(), pageWidth - margin - 35, 108, { align: "center" });

  // Bill to / dates
  let y = 150;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108);
  doc.text("BILL TO", margin, y);
  doc.text("DATE", pageWidth / 2, y);
  if (invoice.due_date && invoice.due_date !== invoice.issue_date) {
    doc.text("DUE DATE", pageWidth / 2 + 120, y);
  }

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text(client?.name || "Client", margin, y);
  doc.text(formatDate(invoice.issue_date), pageWidth / 2, y);
  if (invoice.due_date && invoice.due_date !== invoice.issue_date) {
    doc.text(formatDate(invoice.due_date), pageWidth / 2 + 120, y);
  }

  y += 14;
  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108);
  if (client?.company) { doc.text(client.company, margin, y); y += 12; }
  if (client?.email)   { doc.text(client.email, margin, y); y += 12; }
  if (client?.phone)   { doc.text(client.phone, margin, y); y += 12; }

  // Campus Visit meta block (if any present)
  const meta = [
    ["Campus Visit No.", invoice.campus_visit_no],
    ["Student Name", invoice.student_name],
    ["Course", invoice.course],
    ["Visited Colleges", invoice.visited_colleges],
  ].filter(([, v]) => v && String(v).trim().length > 0);

  if (meta.length) {
    y += 12;
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 113, 108);
    doc.text("VISIT DETAILS", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const [label, value] of meta) {
      doc.setTextColor(120, 113, 108);
      doc.text(label, margin, y);
      doc.setTextColor(28, 25, 23);
      const lines = doc.splitTextToSize(String(value), pageWidth - margin * 2 - 140);
      doc.text(lines, margin + 140, y);
      y += 14 * Math.max(1, lines.length);
    }
  }

  const tableStart = Math.max(y + 18, 250);

  // Particulars table — two columns
  autoTable(doc, {
    startY: tableStart,
    head: [["Particulars", "Amount"]],
    body: (invoice.items || []).map((it) => [
      it.description || "—",
      formatMoney((it.quantity || 1) * (it.unit_price || 0), currency),
    ]),
    theme: "plain",
    styles: { fontSize: 10, textColor: [28, 25, 23], cellPadding: 8 },
    headStyles: {
      fillColor: [245, 245, 244],
      textColor: [120, 113, 108],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 120 },
    },
    margin: { left: margin, right: margin },
  });

  let endY = doc.lastAutoTable.finalY + 20;

  // Totals
  const rightX = pageWidth - margin;
  const labelX = rightX - 200;
  const subtotal = invoice.subtotal || 0;
  const tax = invoice.tax_amount || 0;
  const credit = invoice.credit_amount || 0;

  doc.setFontSize(10);
  doc.setTextColor(120, 113, 108);
  doc.text("Total Expense", labelX, endY);
  doc.setTextColor(28, 25, 23);
  doc.text(formatMoney(subtotal, currency), rightX, endY, { align: "right" });

  if (tax > 0) {
    endY += 16;
    doc.setTextColor(120, 113, 108);
    doc.text(`Tax (${invoice.tax_rate || 0}%)`, labelX, endY);
    doc.setTextColor(28, 25, 23);
    doc.text(formatMoney(tax, currency), rightX, endY, { align: "right" });
  }

  if (credit > 0) {
    endY += 16;
    doc.setTextColor(120, 113, 108);
    doc.text("Credit toward expense", labelX, endY);
    doc.setTextColor(190, 18, 60);
    doc.text(`− ${formatMoney(credit, currency)}`, rightX, endY, { align: "right" });
  }

  endY += 10;
  doc.setDrawColor(231, 229, 228);
  doc.line(labelX, endY, rightX, endY);
  endY += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(28, 25, 23);
  doc.text("Total", labelX, endY);
  doc.text(formatMoney(invoice.total, currency), rightX, endY, { align: "right" });

  // Notes
  if (invoice.notes) {
    endY += 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 113, 108);
    doc.text("NOTES", margin, endY);
    endY += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(28, 25, 23);
    const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(noteLines, margin, endY);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(168, 162, 158);
  doc.text("Generated with FinFlow", margin, pageHeight - 28);
  doc.text(new Date().toLocaleString(), pageWidth - margin, pageHeight - 28, { align: "right" });

  doc.save(`${invoice.invoice_number}.pdf`);
}
