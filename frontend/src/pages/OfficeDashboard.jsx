import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import {
  GraduationCap, CurrencyInr, Cake, Trophy, CheckCircle, ClockClockwise,
  Buildings, Lightning, ArrowRight, Sparkle, UserCircle, Calendar,
} from "@phosphor-icons/react";

const OFFICE_LABEL = { KM_BLR: "KM BLR", KM_TCR: "KM TCR", KM_KMLY: "KM KMLY" };

const WINDOWS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

function StatCard({ icon: Icon, eyebrow, value, hint, palette, testId }) {
  const palettes = {
    amber: { bg: "bg-amber-50 dark:bg-amber-500/15", chip: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-500/15", chip: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" },
    violet: { bg: "bg-violet-50 dark:bg-violet-500/15", chip: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400" },
    rose: { bg: "bg-rose-50 dark:bg-rose-500/15", chip: "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400" },
  };
  const p = palettes[palette] || palettes.amber;
  return (
    <Card className={`p-5 rounded-xl shadow-none border-0 ${p.bg}`} data-testid={testId}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.chip}`}>
        <Icon size={18} weight="duotone" />
      </div>
      <p className="font-display text-2xl mt-4 text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{eyebrow}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </Card>
  );
}

export default function OfficeDashboard() {
  const { user } = useAuth();
  const currency = user?.currency || "INR";
  const [window, setWindow] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/dashboard/office-admin?window=${window}`);
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [window]);

  const markPaid = async (studentId) => {
    try {
      await api.post(`/students/${studentId}/incentive/mark-paid`);
      toast.success("Incentive marked paid");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const unmarkPaid = async (studentId) => {
    try {
      await api.post(`/students/${studentId}/incentive/unmark-paid`);
      toast.success("Marked unpaid");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const t = data?.totals || {};
  const breakdown = data?.staff_breakdown || [];
  const birthdays = data?.upcoming_birthdays || [];

  return (
    <div className="space-y-6 animate-fade-in" data-testid="office-dashboard">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="label-eyebrow">{user?.office ? `${OFFICE_LABEL[user.office] || user.office} · office` : "Office"}</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">
            Hi {user?.name?.split(" ")[0] || "there"}, here's your office today.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track admissions, staff incentives & upcoming birthdays.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-testid="window-toggle">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              data-testid={`window-${w.value}`}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                window === w.value
                  ? "bg-amber-gradient text-white shadow-md shadow-orange-500/25"
                  : "bg-card border border-border text-foreground hover:bg-muted/40"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="stat-admissions" icon={GraduationCap} palette="amber"
          eyebrow="Admissions"
          value={loading ? "—" : (t.admissions ?? 0)}
          hint={`in ${WINDOWS.find((x) => x.value === window)?.label?.toLowerCase()}`}
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
        {/* Staff breakdown — 2/3 */}
        <Card className="lg:col-span-2 p-5 rounded-xl border border-border shadow-none" data-testid="staff-breakdown">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="label-eyebrow">Admissions by staff</p>
              <h2 className="font-display text-lg mt-1">Who's bringing students in</h2>
            </div>
            <Link to="/clients" className="text-xs text-orange-600 dark:text-orange-400 inline-flex items-center gap-1 hover:text-orange-700">
              Manage staff <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : breakdown.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <Sparkle size={28} weight="duotone" className="mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No admissions this window.</p>
              <p className="text-xs text-muted-foreground">Add staff in <Link to="/clients" className="text-orange-600 dark:text-orange-400 underline">Our Staff</Link> and reference them when enrolling students.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {breakdown.map((row) => (
                <details key={row.staff_id} className="rounded-lg border border-border bg-card overflow-hidden group" data-testid={`staff-row-${row.staff_id}`}>
                  <summary className="cursor-pointer list-none flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <div className="w-10 h-10 rounded-full bg-amber-gradient text-white text-sm font-semibold flex items-center justify-center shrink-0">
                      {(row.name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground truncate">{row.name}</p>
                        {row.office && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            <Buildings size={10} className="mr-1" /> {OFFICE_LABEL[row.office] || row.office}
                          </Badge>
                        )}
                        {row.eligible_count > 0 && (
                          <Badge className="bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 text-[10px] py-0">
                            <Lightning size={10} className="mr-0.5" /> eligible
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.admissions_count} admission{row.admissions_count === 1 ? "" : "s"}
                        {row.eligible_count > 0 && ` · ${row.eligible_count} eligible`}
                        {row.eligible_incentive > 0 && ` · ₹${row.eligible_incentive}/admission`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display text-base font-semibold tabular-nums text-foreground">
                        {formatMoney(row.incentive_earned, currency)}
                      </p>
                      {row.incentive_pending > 0 && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400">
                          {formatMoney(row.incentive_pending, currency)} pending
                        </p>
                      )}
                    </div>
                  </summary>

                  {/* Per-admission expand */}
                  <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-2">
                    {row.admissions.map((a) => (
                      <div key={a.student_id} className="flex items-center gap-3 text-sm" data-testid={`adm-${a.student_id}`}>
                        <Link to={`/students/${a.student_id}`} className="flex-1 min-w-0 hover:underline">
                          <p className="font-medium text-foreground truncate">{a.student_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {a.college || "—"} · {new Date(a.enrolled_at).toLocaleDateString()}
                          </p>
                        </Link>
                        {a.eligible ? (
                          a.incentive_paid ? (
                            <Button
                              size="sm" variant="outline"
                              data-testid={`unmark-${a.student_id}`}
                              onClick={() => unmarkPaid(a.student_id)}
                              className="h-7 text-[11px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                            >
                              <CheckCircle size={12} weight="fill" className="mr-1" /> Paid
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              data-testid={`mark-paid-${a.student_id}`}
                              onClick={() => markPaid(a.student_id)}
                              className="h-7 text-[11px] btn-amber border-0 px-2"
                            >
                              Mark paid · {formatMoney(a.incentive_amount, currency)}
                            </Button>
                          )
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            not eligible yet
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </Card>

        {/* Right column: birthdays + quick links */}
        <div className="space-y-4">
          <Card className="p-5 rounded-xl border border-border shadow-none" data-testid="upcoming-birthdays">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 flex items-center justify-center">
                <Cake size={16} weight="duotone" />
              </div>
              <div>
                <p className="label-eyebrow">Coming up</p>
                <h2 className="font-display text-base">Birthdays · next 30 days</h2>
              </div>
            </div>
            {birthdays.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No birthdays in the next 30 days.
              </p>
            ) : (
              <div className="space-y-2">
                {birthdays.map((b) => (
                  <div key={b.staff_id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40" data-testid={`bday-${b.staff_id}`}>
                    <Cake size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(b.date_of_birth).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
                    </div>
                    <Badge className="bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border-0 text-[10px]">
                      {b.days_until === 0 ? "Today!" : b.days_until === 1 ? "Tomorrow" : `in ${b.days_until}d`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 rounded-xl bg-amber-gradient-soft border border-amber-500/20" data-testid="incentive-rule-card">
            <Lightning size={20} weight="duotone" className="text-amber-700 dark:text-amber-400" />
            <h3 className="font-display text-base mt-3">Incentive rule</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Each staff member becomes <span className="text-foreground font-medium">eligible</span> for their per-admission incentive after their <span className="text-foreground font-medium">3rd admission in a month</span>. The first two admissions get backdated automatically.
            </p>
            <Link to="/quick-entry" className="inline-flex items-center gap-1 mt-3 text-xs text-orange-700 dark:text-orange-400 font-medium hover:underline">
              <Calendar size={12} /> Add an admission
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
