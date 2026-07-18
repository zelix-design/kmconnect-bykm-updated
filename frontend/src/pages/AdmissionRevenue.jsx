import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CurrencyInr, Lock, TrendUp, Coins, CheckCircle, Warning,
  ArrowsClockwise, GraduationCap, Buildings, Users,
} from "@phosphor-icons/react";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import PinLock from "@/components/PinLock";

/** Wrapper: gate the whole dashboard behind a 4-digit PIN (per super admin,
 * per browser-tab session). Non-super-admin fall-through renders the
 * inner component which shows its own "no access" state. */
export default function AdmissionRevenueGate() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  if (!isSuper) return <AdmissionRevenue />;
  return (
    <PinLock
      basePath="admission-revenue"
      title="Admission Revenue"
      subtitle="This page shows confidential per-college revenue. Enter your 4-digit PIN to unlock."
    >
      <AdmissionRevenue />
    </PinLock>
  );
}

/** Super-admin-only revenue dashboard. Aggregates college-side SC across
 * enrolled admissions for the selected Indian financial year (Apr → Mar).
 * Presents three tiers of confidence:
 *   Committed  → all enrolled admissions in FY (accrued rev at enrollment)
 *   Accrued    → committed + at least 1 recorded payment
 *   Confirmed  → committed + fully paid OR status="completed"
 */
function AdmissionRevenue() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const currency = user?.currency || "INR";
  const [fyOptions, setFyOptions] = useState([]);
  const [fy, setFy] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSuper) return;
    (async () => {
      try {
        const r = await api.get("/admission-revenue/fy-options");
        setFyOptions(r.data?.options || []);
        setFy(r.data?.current || "");
      } catch {
        toast.error("Could not load financial-year list");
      }
    })();
  }, [isSuper]);

  const load = async (fyLabel) => {
    if (!fyLabel) return;
    setLoading(true);
    try {
      const r = await api.get("/admission-revenue/summary", { params: { fy: fyLabel } });
      setData(r.data);
    } catch (err) {
      toast.error("Could not load revenue summary");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (fy) load(fy); /* eslint-disable-next-line */ }, [fy]);

  const fmtInr = (n) => formatMoney(n || 0, "INR").replace(/^[₹$€£¥]\s?/, "");

  const tiers = data?.tiers || {};

  if (!isSuper) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground" data-testid="rev-no-access">
        <Warning size={32} className="mx-auto text-muted-foreground/50 mb-3" />
        Only super admins can view Admission Revenue.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="admission-revenue-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="label-eyebrow flex items-center gap-1.5">
            <Lock size={11} weight="fill" /> Confidential · Super Admin
          </p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2 flex items-center gap-2">
            <GraduationCap size={30} className="text-amber-700 dark:text-amber-400" />
            Admission Revenue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Service charges received from colleges for every enrolled admission —
            aggregated by Indian financial year (Apr → Mar).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Financial year</label>
          <Select value={fy} onValueChange={setFy}>
            <SelectTrigger className="w-36" data-testid="fy-select">
              <SelectValue placeholder="Pick FY" />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map((y) => (
                <SelectItem key={y} value={y} data-testid={`fy-opt-${y}`}>
                  FY {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => load(fy)}
            className="h-10 w-10"
            data-testid="fy-refresh-btn"
            title="Refresh"
          >
            <ArrowsClockwise size={14} />
          </Button>
        </div>
      </header>

      {loading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground bg-card border border-border shadow-none">
          Loading revenue…
        </Card>
      ) : !data ? (
        <Card className="p-12 text-center text-sm text-muted-foreground bg-card border border-border shadow-none">
          No data for this financial year.
        </Card>
      ) : (
        <>
          {/* Three-tier KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TierCard
              tier="committed"
              label="Committed"
              hint="All enrolled admissions in FY"
              icon={TrendUp}
              accent="orange"
              count={tiers.committed?.count}
              amount={tiers.committed?.amount}
              scOut={tiers.committed?.sc_out}
              net={tiers.committed?.net}
              fmtInr={fmtInr}
            />
            <TierCard
              tier="accrued"
              label="Accrued"
              hint="Committed + at least 1 payment"
              icon={Coins}
              accent="amber"
              count={tiers.accrued?.count}
              amount={tiers.accrued?.amount}
              scOut={tiers.accrued?.sc_out}
              net={tiers.accrued?.net}
              fmtInr={fmtInr}
            />
            <TierCard
              tier="confirmed"
              label="Confirmed"
              hint="Fully paid or completed"
              icon={CheckCircle}
              accent="emerald"
              count={tiers.confirmed?.count}
              amount={tiers.confirmed?.amount}
              scOut={tiers.confirmed?.sc_out}
              net={tiers.confirmed?.net}
              fmtInr={fmtInr}
            />
          </div>

          {/* Formula legend */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground" data-testid="rev-formula-legend">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500/70"></span>
              <strong className="text-foreground">In</strong> = SC received from college
            </span>
            <span className="text-muted-foreground/40">−</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500/70"></span>
              <strong className="text-foreground">Out</strong> = SC Earned by sub-agent
            </span>
            <span className="text-muted-foreground/40">=</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500/70"></span>
              <strong className="text-foreground">Net revenue</strong>
            </span>
          </div>

          {/* Zero-rate hint */}
          {(tiers.committed?.count || 0) > 0 && (tiers.committed?.amount || 0) === 0 && (
            <Card className="p-4 border border-amber-500/40 bg-amber-500/5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2" data-testid="rev-zero-rate-hint">
              <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
              <div>
                <strong>{tiers.committed.count}</strong> admission(s) counted but zero rupees
                attributed — no SC rates set on the matching (college × course).
                Head to <a href="/colleges" className="underline">Colleges</a> and set the
                per-course amount for each partner college.
              </div>
            </Card>
          )}

          {/* Split tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownTable
              title="By College"
              icon={Buildings}
              keyField="college"
              rows={data.by_college || []}
              fmtInr={fmtInr}
              testid="by-college"
            />
            <ClientOfficeTable
              rows={data.by_client || []}
              fmtInr={fmtInr}
            />
          </div>

          <p className="text-[11px] text-muted-foreground text-right">
            Range · {data.range?.start} → {data.range?.end}. Only students with
            status <code className="px-1 rounded bg-muted">enrolled</code> or
            <code className="px-1 rounded bg-muted ml-1">completed</code> are counted.
          </p>
        </>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

const ACCENT_MAP = {
  orange: {
    ring: "border-orange-500/40 bg-orange-500/5",
    tag: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
    iconWrap: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  amber: {
    ring: "border-amber-500/40 bg-amber-500/5",
    tag: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    iconWrap: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  emerald: {
    ring: "border-emerald-500/40 bg-emerald-500/5",
    tag: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    iconWrap: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
};

function TierCard({ tier, label, hint, icon: Icon, accent, count, amount, scOut, net, fmtInr }) {
  const a = ACCENT_MAP[accent] || ACCENT_MAP.orange;
  const netVal = Number(net || 0);
  const netColor = netVal >= 0
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-rose-700 dark:text-rose-400";
  return (
    <Card
      className={`p-5 border ${a.ring} shadow-none`}
      data-testid={`tier-${tier}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${a.iconWrap}`}>
          <Icon size={18} weight="duotone" />
        </div>
        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${a.tag}`}>
          {label}
        </span>
      </div>
      <div className="mt-4 space-y-2.5">
        {/* Gross in */}
        <div>
          <div
            className="text-2xl sm:text-3xl font-display tabular-nums flex items-center gap-1"
            data-testid={`tier-${tier}-amount`}
          >
            <CurrencyInr size={22} weight="regular" className="text-muted-foreground" />
            {fmtInr(amount)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            <span className="tabular-nums font-medium text-foreground" data-testid={`tier-${tier}-count`}>{count || 0}</span> admission{(count || 0) === 1 ? "" : "s"} · {hint}
          </div>
        </div>
        {/* SC Out + Net */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              SC Out
            </div>
            <div
              className="text-sm tabular-nums font-medium text-rose-700 dark:text-rose-400 flex items-center gap-0.5"
              data-testid={`tier-${tier}-sc-out`}
            >
              <CurrencyInr size={11} />
              {fmtInr(scOut)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Net revenue
            </div>
            <div
              className={`text-base tabular-nums font-semibold flex items-center justify-end gap-0.5 ${netColor}`}
              data-testid={`tier-${tier}-net`}
            >
              <CurrencyInr size={12} weight="bold" />
              {fmtInr(netVal)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function BreakdownTable({ title, icon: Icon, keyField, rows, fmtInr, testid }) {
  return (
    <Card className="p-5 border border-border bg-card shadow-none" data-testid={`table-${testid}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
          <Icon size={16} className="text-muted-foreground" />
        </div>
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No admissions yet.</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto -mx-1">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-card">
              <tr>
                <th className="text-left py-1.5 pl-1 font-semibold">{keyField}</th>
                <th className="text-right py-1.5 font-semibold w-10">#</th>
                <th className="text-right py-1.5 font-semibold w-24">In (₹)</th>
                <th className="text-right py-1.5 font-semibold w-24">Out (₹)</th>
                <th className="text-right py-1.5 pr-1 font-semibold w-24">Net (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r, idx) => {
                const netVal = Number(r.net || 0);
                const netCls = netVal > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : netVal < 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-muted-foreground";
                return (
                  <tr
                    key={`${r[keyField]}-${idx}`}
                    data-testid={`row-${testid}-${idx}`}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="py-1.5 pl-1 truncate max-w-[180px]" title={r[keyField]}>
                      {r[keyField]}
                    </td>
                    <td className="text-right py-1.5 tabular-nums text-muted-foreground">
                      {r.count}
                    </td>
                    <td className="text-right py-1.5 tabular-nums">
                      {fmtInr(r.amount)}
                    </td>
                    <td className="text-right py-1.5 tabular-nums text-rose-700/80 dark:text-rose-400/80">
                      {fmtInr(r.sc_out)}
                    </td>
                    <td className={`text-right py-1.5 pr-1 tabular-nums font-medium ${netCls}`}>
                      {fmtInr(netVal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}


/* ── By Client / Office table ────────────────────────────────────────────── */

const OFFICE_LABEL = {
  KM_BLR: "Bengaluru",
  KM_TCR: "Thrissur",
  KM_KMLY: "Kotamangalam",
  ALL: "All offices",
};
const OFFICE_TONE = {
  KM_BLR: "bg-orange-500/12 text-orange-800 dark:text-orange-300 border-orange-500/40",
  KM_TCR: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/40",
  KM_KMLY: "bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/40",
  ALL: "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/40",
};

function OfficeBadge({ office }) {
  const label = OFFICE_LABEL[office] || (office && office !== "—" ? office : "No office");
  const tone = OFFICE_TONE[office] || "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${tone}`}
      data-testid={`office-badge-${office || "none"}`}
    >
      {label}
    </span>
  );
}

function ClientOfficeTable({ rows, fmtInr }) {
  return (
    <Card
      className="p-5 border border-border bg-card shadow-none"
      data-testid="table-by-client"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
          <Users size={16} className="text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-semibold">By Client / Office</h3>
          <p className="text-[11px] text-muted-foreground">
            Revenue = In (from college) − Out (to sub-agent)
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No admissions yet.</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto -mx-1">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-card">
              <tr>
                <th className="text-left py-1.5 pl-1 font-semibold">Client / Office</th>
                <th className="text-right py-1.5 font-semibold w-12">Count</th>
                <th className="text-right py-1.5 pr-1 font-semibold w-32">Revenue (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r, idx) => {
                const netVal = Number(r.net || 0);
                const netCls = netVal > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : netVal < 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-muted-foreground";
                return (
                  <tr
                    key={`${r.client}-${r.office}-${idx}`}
                    className="hover:bg-muted/40 transition-colors"
                    data-testid={`row-by-client-${idx}`}
                  >
                    <td className="py-2 pl-1">
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="truncate font-medium text-foreground" title={r.client}>
                          {r.client}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <OfficeBadge office={r.office} />
                        </div>
                      </div>
                    </td>
                    <td className="text-right py-2 tabular-nums text-muted-foreground">
                      {r.count}
                    </td>
                    <td className={`text-right py-2 pr-1 tabular-nums font-semibold ${netCls}`}>
                      {fmtInr(netVal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
