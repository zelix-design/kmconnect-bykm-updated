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

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
