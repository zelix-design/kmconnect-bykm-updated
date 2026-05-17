export const CURRENCIES = {
  USD: { symbol: "$", code: "USD", locale: "en-US" },
  INR: { symbol: "₹", code: "INR", locale: "en-IN" },
};

export function formatMoney(amount, currency = "USD") {
  const c = CURRENCIES[currency] || CURRENCIES.USD;
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(c.locale, {
      style: "currency",
      currency: c.code,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${c.symbol}${n.toFixed(2)}`;
  }
}

// PDF-safe money formatter. jsPDF's built-in Helvetica is WinAnsi-encoded and
// doesn't carry the Indian Rupee glyph (U+20B9), so the symbol renders as "¹"
// in downloaded PDFs. We sidestep font embedding by emitting "Rs." instead of
// "₹" for INR — keeps PDFs portable across all readers/printers.
export function formatMoneyForPdf(amount, currency = "USD") {
  const n = Number(amount) || 0;
  if (currency === "INR") {
    // Use the Indian numbering grouping (1,00,000) but with "Rs." prefix.
    try {
      const formatted = new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
      return `Rs. ${formatted}`;
    } catch {
      return `Rs. ${n.toFixed(2)}`;
    }
  }
  return formatMoney(n, currency);
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
