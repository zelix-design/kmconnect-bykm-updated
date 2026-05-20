// Shared constants + small helpers for the Student Detail page and its dialogs.
// Extracted to keep the page component small and let dialogs be reused.
import { Bank, Wallet, UsersThree, Briefcase, IdentificationBadge } from "@phosphor-icons/react";
import { todayISO } from "@/lib/format";

export const STATUS_OPTIONS = [
  { value: "inquiry", label: "Inquiry" },
  { value: "enrolled", label: "Enrolled" },
  { value: "cancelled", label: "Cancelled" },
];

export const RECEIVED_IN = {
  college: { label: "College Acc.", icon: Bank, color: "bg-sky-100/60 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  cash: { label: "Cash", icon: Wallet, color: "bg-amber-100/60 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  bank: { label: "Bank Acc.", icon: Bank, color: "bg-muted text-foreground" },
  sub_agent: { label: "Sub Agent Acc.", icon: UsersThree, color: "bg-violet-100/60 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  associate: { label: "Associate Acc.", icon: Briefcase, color: "bg-amber-100/60 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  km: { label: "KM Acc.", icon: IdentificationBadge, color: "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

export const FEE_TYPE_LABELS = {
  booking_admission: "Booking / Admission Fees",
  tution: "Tution Fees",
  other: "Other Fees",
};

export const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

export const SUB_AGENT_TYPES = [
  { value: "sub_agent", label: "Sub Agent" },
  { value: "associate", label: "Associate" },
  { value: "km", label: "KM" },
];

export const PRESET_SCHEDULE_LABELS = ["1st Payment", "2nd Payment", "3rd Payment", "4th Payment", "5th Payment"];

export const _uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `adj-${Date.now()}-${Math.random()}`;

export function nextScheduleLabel(schedules) {
  const used = new Set((schedules || []).map((s) => s.label));
  for (const l of PRESET_SCHEDULE_LABELS) {
    if (!used.has(l)) return l;
  }
  return `${(schedules?.length || 0) + 1}th Payment`;
}

export function emptyPayment() {
  return {
    date: todayISO(),
    amount: "",
    fee_type: "booking_admission",
    received_in: { type: "college", name: "", account_id: "" },
    has_adjustment: false,
    adjustments: [],
    schedule_id: "",
    remarks: "",
  };
}

export function emptyEntry() {
  return {
    create_schedule: true,
    schedule: { label: "1st Payment", amount: "", remarks: "", due_date: "" },
    existing_schedule_id: "",
    log_payment: true,
    payment: emptyPayment(),
  };
}

export function emptyAdjustment(date) {
  return {
    _key: _uid(),
    kind: "paid_to_college",
    amount: "",
    payment_date: date,
    payment_mode: "bank_transfer",
    sub_agent_type: "sub_agent",
    sub_agent_name: "",
    remarks: "",
  };
}
