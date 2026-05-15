import React, { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { ArrowLeft, UsersThree, Briefcase, IdentificationBadge, CaretDown, CaretUp } from "@phosphor-icons/react";

const TYPE_META = {
  sub_agent: { label: "Sub Agent", icon: UsersThree, color: "bg-violet-50 text-violet-700" },
  associate: { label: "Associate", icon: Briefcase, color: "bg-amber-50 text-amber-700" },
  km: { label: "KM", icon: IdentificationBadge, color: "bg-sky-50 text-sky-700" },
};

const FEE_LABELS = {
  booking_admission: "Booking / Admission Fees",
  tution: "Tution Fees",
  other: "Other Fees",
};

const PAYMENT_MODE_LABELS = {
  cash: "Cash", bank_transfer: "Bank Transfer", upi: "UPI",
  cheque: "Cheque", card: "Card", other: "Other",
};

const SUB_AGENT_LABELS = { sub_agent: "Sub Agent", associate: "Associate", km: "KM" };

export default function AgentDetail() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  const type = sp.get("type");
  const name = sp.get("name");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!type || !name) { nav("/agents"); return; }
    setLoading(true);
    api.get("/students/agent-ledger/payments", { params: { type, name } })
      .then(({ data }) => setData(data))
      .catch(() => nav("/agents"))
      .finally(() => setLoading(false));
  }, [type, name, nav]);

  if (loading || !data) return <div className="p-8 text-sm text-stone-500" data-testid="loading">Loading…</div>;
  const meta = TYPE_META[type] || TYPE_META.sub_agent;
  const Icon = meta.icon;
  const t = data.totals;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="agent-detail">
      <Link to="/agents" className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900" data-testid="back-to-agents">
        <ArrowLeft size={14} /> All sub-agents
      </Link>

      <Card className="p-6 border border-stone-200 bg-white rounded-lg shadow-none">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-md flex items-center justify-center ${meta.color}`}>
            <Icon size={22} weight="regular" />
          </div>
          <div>
            <p className="label-eyebrow">{meta.label}</p>
            <h1 className="font-display text-3xl tracking-tight mt-0.5" data-testid="agent-name">{data.name}</h1>
            <p className="text-xs text-stone-500 mt-1">
              {t.payments_count} payments across {t.students_count} student{t.students_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="agent-totals">
        <Tile label="Total routed" value={formatMoney(t.total_received, currency)} />
        <Tile label="Paid to college" value={formatMoney(t.paid_to_college, currency)} tone="info" />
        <Tile label="SC adjusted" value={formatMoney(t.sc_adjusted, currency)} tone="success" />
        <Tile label="Currently holding" value={formatMoney(t.holding, currency)} tone={t.holding > 0 ? "danger" : "default"} />
      </div>

      <Card className="border border-stone-200 bg-white rounded-lg shadow-none overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-200">
          <p className="label-eyebrow">Payments</p>
          <h3 className="font-display text-lg mt-0.5">All money routed through {data.name}</h3>
        </div>
        {data.payments.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-500" data-testid="empty-agent-payments">No payments recorded.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-3 label-eyebrow w-8"></th>
                <th className="px-6 py-3 label-eyebrow">Date</th>
                <th className="px-6 py-3 label-eyebrow">Student</th>
                <th className="px-6 py-3 label-eyebrow">Schedule · Fee</th>
                <th className="px-6 py-3 label-eyebrow text-right">Amount</th>
                <th className="px-6 py-3 label-eyebrow text-right">→ College</th>
                <th className="px-6 py-3 label-eyebrow text-right">SC Adjusted</th>
                <th className="px-6 py-3 label-eyebrow">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {data.payments.map(p => {
                const isExp = !!expanded[p.payment_id];
                const hasAdj = p.has_adjustment && p.adjustments.length > 0;
                return (
                  <React.Fragment key={p.payment_id}>
                    <tr className="hover:bg-stone-50" data-testid={`agent-pay-${p.payment_id}`}>
                      <td className="px-6 py-3">
                        {hasAdj && (
                          <button onClick={() => setExpanded({ ...expanded, [p.payment_id]: !isExp })} className="text-stone-400 hover:text-stone-900">
                            {isExp ? <CaretUp size={14} /> : <CaretDown size={14} />}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-3 tabular-nums text-stone-600">{formatDate(p.date)}</td>
                      <td className="px-6 py-3">
                        <Link to={`/students/${p.student_id}`} className="font-medium text-stone-900 hover:text-emerald-700 underline-offset-4 hover:underline" data-testid={`agent-pay-student-${p.payment_id}`}>
                          {p.student_name}
                        </Link>
                        {(p.course || p.college) && (
                          <div className="text-xs text-stone-500">{[p.course, p.college].filter(Boolean).join(" · ")}</div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-sm">{p.schedule_label || "Unscheduled"}</div>
                        <div className="text-xs text-stone-500">{FEE_LABELS[p.fee_type] || "Other Fees"}</div>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium">{formatMoney(p.amount, currency)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-sky-700">{p.paid_to_college > 0 ? formatMoney(p.paid_to_college, currency) : "—"}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-emerald-700">{p.sc_adjusted > 0 ? formatMoney(p.sc_adjusted, currency) : "—"}</td>
                      <td className="px-6 py-3 text-stone-600">{p.remarks || "—"}</td>
                    </tr>
                    {hasAdj && isExp && (
                      <tr className="bg-stone-50">
                        <td colSpan={8} className="px-6 py-3">
                          <p className="label-eyebrow mb-2">Adjustments</p>
                          <div className="space-y-1.5">
                            {p.adjustments.map((a, idx) => (
                              <div key={a.id || idx} className="flex items-center gap-2 text-xs text-stone-700">
                                <span className={`px-1.5 py-0.5 rounded ${a.kind === "paid_to_college" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {a.kind === "paid_to_college" ? "Paid to College" : "SC Adjusted"}
                                </span>
                                <span className="tabular-nums font-medium">{formatMoney(a.amount, currency)}</span>
                                <span className="text-stone-500">on {formatDate(a.payment_date)} · {PAYMENT_MODE_LABELS[a.payment_mode]}</span>
                                {a.kind === "sc_adjusted" && a.sub_agent_name && (
                                  <span className="text-stone-500">· {SUB_AGENT_LABELS[a.sub_agent_type]} {a.sub_agent_name}</span>
                                )}
                                {a.remarks && <span className="text-stone-500">· {a.remarks}</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              <tr className="bg-stone-50 font-medium">
                <td colSpan={4} className="px-6 py-3 text-stone-600 label-eyebrow">Total</td>
                <td className="px-6 py-3 text-right tabular-nums" data-testid="agent-detail-total">{formatMoney(t.total_received, currency)}</td>
                <td className="px-6 py-3 text-right tabular-nums text-sky-700">{formatMoney(t.paid_to_college, currency)}</td>
                <td className="px-6 py-3 text-right tabular-nums text-emerald-700">{formatMoney(t.sc_adjusted, currency)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <Card className="p-4 border border-stone-200 bg-white rounded-lg shadow-none">
      <p className="label-eyebrow">{label}</p>
      <p className={`font-display text-2xl mt-2 tabular-nums ${
        tone === "success" ? "text-emerald-700" :
        tone === "danger" ? "text-rose-700" :
        tone === "info" ? "text-sky-700" : "text-stone-900"
      }`}>{value}</p>
    </Card>
  );
}
