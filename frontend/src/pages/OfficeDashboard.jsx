import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatMoney, greetingForNow } from "@/lib/format";
import {
  GraduationCap, Trophy, ClockClockwise, UserCircle,
} from "@phosphor-icons/react";
import { StatCard } from "@/components/dashboard/StatCard";
import StaffBreakdownList from "@/components/office-dashboard/StaffBreakdownList";
import {
  UpcomingBirthdaysCard, IncentiveRuleCard,
} from "@/components/office-dashboard/AsideCards";
import StaffPickerDialog from "@/components/office-dashboard/StaffPickerDialog";
import AnnouncementBanners from "@/components/messages/AnnouncementBanners";
import LeadFunnel from "@/components/leads/LeadFunnel";

const OFFICE_LABEL = { KM_BLR: "KM BLR", KM_TCR: "KM TCR", KM_KMLY: "KM KMLY" };

const WINDOWS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

export default function OfficeDashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const currency = user?.currency || "INR";
  const [windowKey, setWindowKey] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [allStaff, setAllStaff] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/dashboard/office-admin?window=${windowKey}`);
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [windowKey]);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (studentId) => {
    try {
      const { data } = await api.post(`/students/${studentId}/incentive/mark-paid`);
      toast.success(data?.expense_request_id
        ? "Incentive marked paid · salary request sent for approval"
        : "Incentive marked paid");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const unmarkPaid = async (studentId) => {
    try {
      await api.post(`/students/${studentId}/incentive/unmark-paid`);
      toast.success("Marked unpaid · any pending salary request cancelled");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const openAdmissionPicker = async () => {
    try {
      const { data } = await api.get("/clients");
      setAllStaff((data || []).filter((c) => c.client_type === "staff"));
      setPickerSearch("");
      setPickerOpen(true);
    } catch (err) {
      console.error("[office-dashboard] staff fetch failed:", err?.message || err);
      toast.error("Couldn't load staff list");
    }
  };

  const pickStaffAndEnrol = (staff) => {
    setPickerOpen(false);
    nav(`/students?new=1&staff=${encodeURIComponent(staff.name)}`);
  };

  const t = data?.totals || {};
  const breakdown = data?.staff_breakdown || [];
  const birthdays = data?.upcoming_birthdays || [];
  const windowLabel = WINDOWS.find((x) => x.value === windowKey)?.label?.toLowerCase();

  return (
    <div className="space-y-6 animate-fade-in" data-testid="office-dashboard">
      <AnnouncementBanners />
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="label-eyebrow">{user?.office ? `${OFFICE_LABEL[user.office] || user.office} · office` : "Office"}</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2" data-testid="office-greeting">
            {greetingForNow()}, {user?.name?.split(" ")[0] || "there"}.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track admissions, staff incentives & upcoming birthdays.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-testid="window-toggle">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setWindowKey(w.value)}
              data-testid={`window-${w.value}`}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                windowKey === w.value
                  ? "bg-amber-gradient text-white shadow-md shadow-orange-500/25"
                  : "bg-card border border-border text-foreground hover:bg-muted/40"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="stat-admissions" icon={GraduationCap} palette="amber"
          eyebrow="Admissions"
          value={loading ? "—" : (t.admissions ?? 0)}
          hint={`in ${windowLabel}`}
        />
        <StatCard testId="stat-incentive-earned" icon={Trophy} palette="emerald"
          eyebrow="Incentive earned"
          value={loading ? "—" : formatMoney(t.incentive_earned ?? 0, currency)}
          hint={`${t.eligible_admissions ?? 0} eligible admissions`}
        />
        <StatCard testId="stat-incentive-pending" icon={ClockClockwise} palette="rose"
          eyebrow="Incentive pending"
          value={loading ? "—" : formatMoney(t.incentive_pending ?? 0, currency)}
          hint="Yet to mark paid"
        />
        <StatCard testId="stat-staff-count" icon={UserCircle} palette="violet"
          eyebrow="Staff on roster"
          value={loading ? "—" : (t.staff_count ?? 0)}
          hint="Add more in Clients"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StaffBreakdownList
          breakdown={breakdown}
          loading={loading}
          currency={currency}
          onMarkPaid={markPaid}
          onUnmarkPaid={unmarkPaid}
        />

        <div className="space-y-4">
          <UpcomingBirthdaysCard birthdays={birthdays} />
          <IncentiveRuleCard onAddAdmission={openAdmissionPicker} />
        </div>
      </div>

      <LeadFunnel />

      <StaffPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        search={pickerSearch}
        onSearchChange={setPickerSearch}
        staff={allStaff}
        onPick={pickStaffAndEnrol}
      />
    </div>
  );
}
