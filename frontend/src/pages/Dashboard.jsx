import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendUp, TrendDown, Receipt, FileText, ArrowUpRight, ArrowDownRight, CalendarBlank, Student, UsersThree, Notebook } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

function StatCard({ eyebrow, value, hint, accent, icon: Icon, testId }) {
  return (
    <Card className="p-6 border border-stone-200 bg-white rounded-lg shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <p className="label-eyebrow" data-testid={`${testId}-label`}>{eyebrow}</p>
          <p className="font-display text-3xl mt-3 text-stone-900" data-testid={`${testId}-value`}>{value}</p>
          {hint && <p className={`text-xs mt-1.5 ${accent === 'danger' ? 'text-rose-700' : 'text-stone-500'}`}>{hint}</p>}
        </div>
        <div className={`w-10 h-10 rounded-md flex items-center justify-center ${
          accent === 'success' ? 'bg-emerald-50 text-emerald-700' :
          accent === 'danger' ? 'bg-rose-50 text-rose-700' :
          accent === 'warn' ? 'bg-amber-50 text-amber-700' :
          'bg-stone-100 text-stone-700'
        }`}>
          {Icon && <Icon size={18} weight="regular" />}
        </div>
      </div>
    </Card>
  );
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function rangeFor(preset) {
  const now = new Date();
  if (preset === "this_month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: isoDate(s), end: isoDate(now), label: "This month" };
  }
  if (preset === "last_30") {
    const s = new Date(now); s.setDate(now.getDate() - 29);
    return { start: isoDate(s), end: isoDate(now), label: "Last 30 days" };
  }
  if (preset === "last_90") {
    const s = new Date(now); s.setDate(now.getDate() - 89);
    return { start: isoDate(s), end: isoDate(now), label: "Last 90 days" };
  }
  if (preset === "ytd") {
    const s = new Date(now.getFullYear(), 0, 1);
    return { start: isoDate(s), end: isoDate(now), label: "Year to date" };
  }
  return null; // custom
}

export default function Dashboard() {
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  const [preset, setPreset] = useState("this_month");
  const [custom, setCustom] = useState({ start: "", end: "" });

  const range = useMemo(() => {
    if (preset === "custom") {
      if (custom.start && custom.end) return { start: custom.start, end: custom.end, label: "Custom" };
      return rangeFor("this_month");
    }
    return rangeFor(preset);
  }, [preset, custom]);

  const [summary, setSummary] = useState(null);
  const [cashflow, setCashflow] = useState([]);
  const [byCat, setByCat] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      const params = { start: range.start, end: range.end };
      const [s, c, b, t] = await Promise.all([
        api.get("/dashboard/summary", { params }),
        api.get("/dashboard/cashflow", { params: { months: 6 } }),
        api.get("/dashboard/expense-by-category", { params }),
        api.get("/transactions", { params: { limit: 6 } }),
      ]);
      setSummary(s.data);
      setCashflow(c.data);
      setByCat(b.data);
      setRecent(t.data);
    })().catch(() => {});
  }, [range]);

  return (
    <div className="space-y-8 animate-fade-in" data-testid="dashboard-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="label-eyebrow">Overview</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">
            Hi {user?.name?.split(" ")[0] || "there"}, here's your money today.
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/quick-entry" data-testid="quick-add-tx" className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-stone-900 text-stone-50 text-sm hover:bg-stone-800 lift">
            <Receipt size={16} /> Quick entry
          </Link>
          <Link to="/invoices" data-testid="quick-add-invoice" className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-stone-300 bg-white text-sm hover:bg-stone-100 lift">
            <FileText size={16} /> New invoice
          </Link>
        </div>
      </header>

      {/* Quick navigation tiles */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="quick-nav-tiles">
        {[
          { to: "/transactions", label: "Transactions", icon: Receipt, accent: "bg-stone-100 text-stone-700", tid: "tile-transactions" },
          { to: "/students", label: "Students", icon: Student, accent: "bg-emerald-50 text-emerald-700", tid: "tile-students" },
          { to: "/clients", label: "Clients", icon: UsersThree, accent: "bg-sky-50 text-sky-700", tid: "tile-clients" },
          { to: "/agents", label: "Ledger", icon: Notebook, accent: "bg-amber-50 text-amber-700", tid: "tile-ledger" },
        ].map((t) => (
          <Link
            key={t.to}
            to={t.to}
            data-testid={t.tid}
            className="group flex items-center gap-3 p-4 rounded-lg bg-white border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all"
          >
            <div className={`w-10 h-10 rounded-md flex items-center justify-center ${t.accent}`}>
              <t.icon size={18} weight="regular" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900">{t.label}</p>
              <p className="text-xs text-stone-500">Open</p>
            </div>
            <ArrowUpRight size={14} className="text-stone-400 group-hover:text-stone-900 transition-colors" />
          </Link>
        ))}
      </section>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-3" data-testid="date-range-filter">
        <div className="flex items-center gap-2 text-stone-600">
          <CalendarBlank size={16} />
          <span className="label-eyebrow">Period</span>
        </div>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-44 h-9 bg-white" data-testid="range-preset"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This month</SelectItem>
            <SelectItem value="last_30">Last 30 days</SelectItem>
            <SelectItem value="last_90">Last 90 days</SelectItem>
            <SelectItem value="ytd">Year to date</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {preset === "custom" && (
          <>
            <Input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="h-9 w-44 bg-white" data-testid="range-start" />
            <span className="text-stone-400 text-sm">→</span>
            <Input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="h-9 w-44 bg-white" data-testid="range-end" />
          </>
        )}
        {range && (
          <span className="text-xs text-stone-500" data-testid="range-label">
            {range.label} · {range.start} → {range.end}
          </span>
        )}
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="stat-balance" eyebrow="Total balance" value={formatMoney(summary?.total_balance ?? 0, currency)} hint="All time, all accounts" accent="default" icon={ArrowUpRight} />
        <StatCard testId="stat-income" eyebrow={`Income · ${range?.label || ""}`} value={formatMoney(summary?.month_income ?? 0, currency)} accent="success" icon={TrendUp} />
        <StatCard testId="stat-expense" eyebrow={`Expenses · ${range?.label || ""}`} value={formatMoney(summary?.month_expense ?? 0, currency)} accent="danger" icon={TrendDown} />
        <StatCard testId="stat-outstanding" eyebrow="Outstanding invoices" value={formatMoney(summary?.outstanding_invoices ?? 0, currency)} hint="Sent + overdue" accent="warn" icon={FileText} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 border border-stone-200 bg-white rounded-lg shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="label-eyebrow">Cash flow</p>
              <h3 className="font-display text-xl mt-1">Last 6 months</h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-700 inline-block" />Income</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-700 inline-block" />Expense</span>
            </div>
          </div>
          <div className="h-72 -ml-2" data-testid="cashflow-chart" style={{ minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#78716c", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#78716c", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12 }}
                  formatter={(v) => formatMoney(v, currency)}
                />
                <Bar dataKey="income" fill="#047857" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#be123c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 border border-stone-200 bg-white rounded-lg shadow-none">
          <p className="label-eyebrow">Where it went</p>
          <h3 className="font-display text-xl mt-1 mb-4">Expenses by category</h3>
          {byCat.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-sm text-stone-500" data-testid="empty-categories">
              No expenses in this period.
            </div>
          ) : (
            <>
              <div className="h-44" data-testid="category-pie" style={{ minHeight: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCat} dataKey="total" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {byCat.map((entry, i) => (<Cell key={i} fill={entry.color || "#78716c"} />))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(v, currency)} contentStyle={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 space-y-2">
                {byCat.slice(0, 5).map((c) => (
                  <li key={c.category_id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm" style={{ background: c.color }} />{c.name}</span>
                    <span className="font-medium tabular-nums">{formatMoney(c.total, currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </section>

      <section>
        <Card className="border border-stone-200 bg-white rounded-lg shadow-none">
          <div className="p-6 flex items-center justify-between">
            <div>
              <p className="label-eyebrow">Recent activity</p>
              <h3 className="font-display text-xl mt-1">Latest transactions</h3>
            </div>
            <Link to="/transactions" data-testid="view-all-tx" className="text-sm text-stone-700 hover:text-stone-900 underline underline-offset-4">View all →</Link>
          </div>
          <div className="border-t border-stone-200">
            {recent.length === 0 ? (
              <div className="p-8 text-center text-sm text-stone-500" data-testid="empty-transactions">No transactions yet. Add one to get started.</div>
            ) : (
              <ul className="divide-y divide-stone-200">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-stone-50">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t.description || (t.type === 'income' ? 'Income' : 'Expense')}</p>
                        <p className="text-xs text-stone-500">{t.date}</p>
                      </div>
                    </div>
                    <span className={`tabular-nums text-sm font-medium ${t.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
