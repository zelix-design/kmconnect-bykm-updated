// Shared lead pipeline metadata + datetime helpers for the Leads CRM.

export const LEAD_STATUSES = ["new", "contacted", "interested", "follow_up", "converted", "lost"];

export const LEAD_STATUS_META = {
  new: { label: "New", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  contacted: { label: "Contacted", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  interested: { label: "Interested", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  follow_up: { label: "Follow-up", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  converted: { label: "Converted", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  lost: { label: "Lost", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" },
};

export const LEAD_SOURCES = [
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "social", label: "Social media" },
  { value: "website", label: "Website" },
  { value: "csv", label: "CSV import" },
  { value: "other", label: "Other" },
];

export function sourceLabel(v) {
  return LEAD_SOURCES.find((s) => s.value === v)?.label || "Other";
}

export const VISIT_STATUSES = ["scheduled", "confused", "admitted", "lost"];

export const VISIT_STATUS_META = {
  scheduled: { label: "Scheduled", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  confused: { label: "Confused", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  admitted: { label: "Admitted", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  lost: { label: "Lost", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" },
};

export const TRAVEL_MODES = ["Bus", "Train", "Flight", "Own vehicle", "Cab / Taxi", "Other"];

export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
