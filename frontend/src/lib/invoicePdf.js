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
  doc.text(invoice.status.toUpperCase(), pageWidth - margin - 35, 108, { align: "center" });

  // Bill to / dates
  let y = 150;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108);
  doc.text("BILL TO", margin, y);
  doc.text("ISSUE DATE", pageWidth / 2, y);
  doc.text("DUE DATE", pageWidth / 2 + 120, y);

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text(client?.name || "Client", margin, y);
  doc.text(formatDate(invoice.issue_date), pageWidth / 2, y);
  doc.text(formatDate(invoice.due_date), pageWidth / 2 + 120, y);

  y += 14;
  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108);
  if (client?.company) { doc.text(client.company, margin, y); y += 12; }
  if (client?.email)   { doc.text(client.email, margin, y); y += 12; }
  if (client?.phone)   { doc.text(client.phone, margin, y); y += 12; }
  if (client?.address) {
    const lines = doc.splitTextToSize(client.address, 200);
    doc.text(lines, margin, y); y += 12 * lines.length;
  }

  const tableStart = Math.max(y + 16, 240);

  // Items table
  autoTable(doc, {
    startY: tableStart,
    head: [["Description", "Qty", "Unit price", "Amount"]],
    body: invoice.items.map((it) => [
      it.description || "—",
      String(it.quantity),
      formatMoney(it.unit_price, currency),
      formatMoney(it.quantity * it.unit_price, currency),
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
      1: { halign: "right", cellWidth: 50 },
      2: { halign: "right", cellWidth: 90 },
      3: { halign: "right", cellWidth: 90 },
    },
    margin: { left: margin, right: margin },
  });

  let endY = doc.lastAutoTable.finalY + 20;

  // Totals (right aligned)
  const rightX = pageWidth - margin;
  const labelX = rightX - 160;
  doc.setFontSize(10);
  doc.setTextColor(120, 113, 108);
  doc.text("Subtotal", labelX, endY);
  doc.setTextColor(28, 25, 23);
  doc.text(formatMoney(invoice.subtotal, currency), rightX, endY, { align: "right" });

  endY += 16;
  doc.setTextColor(120, 113, 108);
  doc.text(`Tax (${invoice.tax_rate || 0}%)`, labelX, endY);
  doc.setTextColor(28, 25, 23);
  doc.text(formatMoney(invoice.tax_amount, currency), rightX, endY, { align: "right" });

  endY += 8;
  doc.setDrawColor(231, 229, 228);
  doc.line(labelX, endY, rightX, endY);
  endY += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(28, 25, 23);
  doc.text("Total", labelX, endY);
  doc.text(formatMoney(invoice.total, currency), rightX, endY, { align: "right" });

  // Notes
  if (invoice.notes) {
    endY += 36;
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
