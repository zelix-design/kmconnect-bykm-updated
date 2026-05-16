import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import {
  ShoppingBag, ChartPie, UsersThree, Receipt, FileText, CalendarBlank,
  Student, Notebook, ArrowUpRight, ArrowDownRight, CaretUp, CaretDown,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";

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
  return null;
}

const PALETTES = {
  amber: { bg: "bg-amber-50", text: "text-amber-700", icon: "bg-amber-100 text-amber-700" },
  violet: { bg: "bg-violet-50", text: "text-violet-700", icon: "bg-violet-100 text-violet-700" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "bg-emerald-100 text-emerald-700" },
  rose: { bg: "bg-rose-50", text: "text-rose-700", icon: "bg-rose-100 text-rose-700" },
  sky: { bg: "bg-sky-50", text: "text-sky-700", icon: "bg-sky-100 text-sky-700" },
};

function StatCard({ eyebrow, value, trend, hint, palette, icon: Icon, testId }) {
  const p = PALETTES[palette] || PALETTES.amber;
  const positive = trend != null && trend >= 0;
  return (
    <Card className={`p-5 rounded-xl shadow-none border-0 ${p.bg}`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.icon}`}>
          {Icon && <Icon size={18} weight="duotone" />}
        </div>
        {trend != null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-700" : "text-rose-700"}`}>
            {positive ? <CaretUp size={12} weight="fill" /> : <CaretDown size={12} weight="fill" />}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="font-display text-2xl mt-4 text-stone-900 tabular-nums" data-testid={`${testId}-value`}>{value}</p>
      <p className="text-xs text-stone-600 mt-1" data-testid={`${testId}-label`}>{eyebrow}</p>
      {hint && <p className="text-[10px] text-stone-500 mt-0.5">{hint}</p>}
    </Card>
  );
}

const TILES = [
  { key: "transactions", label: "Transactions", icon: Receipt, palette: "amber" },
  { key: "students", label: "Students", icon: Student, palette: "emerald" },
  { key: "clients", label: "Clients", icon: UsersThree, palette: "sky" },
  { key: "ledger", label: "Ledger", icon: Notebook, palette: "violet" },
];

const FILTER_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function withinFilter(dateStr, filter) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "today") return d >= startOfDay;
  if (filter === "weekly") {
    const s = new Date(startOfDay); s.setDate(s.getDate() - 6);
    return d >= s;
  }
  if (filter === "monthly") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= s;
  }
  return true;
}

export default function Dashboard() {
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  const [preset, setPreset] = useState("this_month");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [activeTile, setActiveTile] = useState("transactions");
  const [listFilter, setListFilter] = useState("monthly");

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
  const [transactions, setTransactions] = useState([]);
  const [students, setStudents] = useState([]);
  const [clients, setClients] = useState([]);
  const [ledger, setLedger] = useState([]);

  useEffect(() => {
    (async () => {
      const params = range ? { start: range.start, end: range.end } : {};
      const [s, c, b, t, st, cl, lg] = await Promise.all([
        api.get("/dashboard/summary", { params }),
        api.get("/dashboard/cashflow", { params: { months: 6 } }),
        api.get("/dashboard/expense-by-category", { params }),
        api.get("/transactions"),
        api.get("/students"),
        api.get("/clients"),
        api.get("/students/agent-ledger"),
      ]);
      setSummary(s.data);
      setCashflow(c.data);
      setByCat(b.data);
      setTransactions(t.data);
      setStudents(st.data);
      setClients(cl.data);
      setLedger(lg.data);
    })().catch(() => {});
  }, [range]);

  // Trend % from cashflow series
  const cfTrend = useMemo(() => {
    if (!cashflow || cashflow.length < 2) return { income: 0, expense: 0 };
    const cur = cashflow[cashflow.length - 1];
    const prev = cashflow[cashflow.length - 2];
    const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : (a > 0 ? 100 : 0));
    return { income: pct(cur.income, prev.income), expense: pct(cur.expense, prev.expense) };
  }, [cashflow]);

  const totalSpendings = useMemo(
    () => byCat.reduce((s, c) => s + (c.total || 0), 0),
    [byCat]
  );

  const filteredTransactions = useMemo(
    () => transactions.filter((t) => withinFilter(t.date, listFilter)),
    [transactions, listFilter]
  );
  const filteredStudents = useMemo(
    () => [...students]
      .filter((s) => withinFilter(s.enrollment_date || s.created_at, listFilter))
      .sort((a, b) => String(b.enrollment_date || b.created_at || "").localeCompare(String(a.enrollment_date || a.created_at || ""))),
    [students, listFilter]
  );
  const filteredClients = useMemo(
    () => [...clients]
      .filter((c) => withinFilter(c.created_at, listFilter))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    [clients, listFilter]
  );

  return (
    <div className="space-y-7 animate-fade-in" data-testid="dashboard-page">
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

      {/* Inline tile tabs */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="quick-nav-tiles">
        {TILES.map((t) => {
          const p = PALETTES[t.palette];
          const active = activeTile === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => { setActiveTile(t.key); setListFilter("monthly"); }}
              data-testid={`tile-${t.key}`}
              className={`group flex items-center gap-3 p-4 rounded-xl text-left transition-all lift ${
                active
                  ? "bg-stone-900 text-stone-50 border border-stone-900"
                  : "bg-white border border-stone-200 hover:border-stone-400"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? "bg-stone-800 text-emerald-300" : p.icon}`}>
                <t.icon size={18} weight={active ? "fill" : "duotone"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${active ? "text-stone-50" : "text-stone-900"}`}>{t.label}</p>
                <p className={`text-xs ${active ? "text-stone-400" : "text-stone-500"}`}>{active ? "Selected" : "Open"}</p>
              </div>
              <ArrowUpRight size={14} className={active ? "text-stone-300" : "text-stone-400 group-hover:text-stone-900"} />
            </button>
          );
        })}
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
      </div>

      {/* Pastel summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          testId="stat-balance"
          eyebrow="Total balance"
          value={formatMoney(summary?.total_balance ?? 0, currency)}
          palette="amber"
          icon={ShoppingBag}
          hint="All time, all accounts"
        />
        <StatCard
          testId="stat-income"
          eyebrow={`Income · ${range?.label || ""}`}
          value={formatMoney(summary?.month_income ?? 0, currency)}
          trend={cfTrend.income}
          palette="emerald"
          icon={ArrowUpRight}
        />
        <StatCard
          testId="stat-expense"
          eyebrow={`Expenses · ${range?.label || ""}`}
          value={formatMoney(summary?.month_expense ?? 0, currency)}
          trend={cfTrend.expense}
          palette="rose"
          icon={ArrowDownRight}
        />
        <StatCard
          testId="stat-outstanding"
          eyebrow="Outstanding invoices"
          value={formatMoney(summary?.outstanding_invoices ?? 0, currency)}
          palette="violet"
          icon={FileText}
          hint="Sent + overdue"
        />
      </section>

      {/* Activity + Latest spendings (with donut) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 border border-stone-200 bg-white rounded-xl shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="label-eyebrow">Activity</p>
              <h3 className="font-display text-xl mt-1">Last 6 months</h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />Income</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" />Expense</span>
            </div>
          </div>
          <div className="h-72 -ml-2" data-testid="cashflow-chart" style={{ minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflow}>
                <defs>
                  <linearGradient id="grad-inc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#78716c", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#78716c", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12 }}
                  formatter={(v) => formatMoney(v, currency)}
                />
                <Area type="monotone" dataKey="income" stroke="#059669" strokeWidth={2.5} fill="url(#grad-inc)" />
                <Area type="monotone" dataKey="expense" stroke="#e11d48" strokeWidth={2.5} fill="url(#grad-exp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 border border-stone-200 bg-white rounded-xl shadow-none">
          <div className="flex items-start justify-between">
            <div>
              <p className="label-eyebrow">Latest spendings</p>
              <h3 className="font-display text-xl mt-1">By category</h3>
            </div>
            <span className="text-xs text-stone-500" data-testid="spendings-total">{formatMoney(totalSpendings, currency)}</span>
          </div>
          {byCat.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-stone-500" data-testid="empty-categories">
              No expenses in this period.
            </div>
          ) : (
            <>
              <div className="h-40 mt-2" data-testid="category-pie" style={{ minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCat} dataKey="total" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {byCat.map((entry, i) => (<Cell key={i} fill={entry.color || "#78716c"} />))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(v, currency)} contentStyle={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 6, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 space-y-2.5">
                {byCat.slice(0, 5).map((c) => (
                  <li key={c.category_id} className="flex items-center justify-between text-sm" data-testid={`cat-row-${c.category_id}`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${c.color}1A`, color: c.color }}>
                        <ChartPie size={14} weight="duotone" />
                      </span>
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="font-medium tabular-nums text-stone-700">{formatMoney(c.total, currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </section>

      {/* Inline list driven by active tile */}
      <section data-testid="active-tile-section">
        <Card className="border border-stone-200 bg-white rounded-xl shadow-none">
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-100">
            <div>
              <p className="label-eyebrow">{TILES.find(t => t.key === activeTile)?.label}</p>
              <h3 className="font-display text-xl mt-1">
                {activeTile === "transactions" && "Recent transactions"}
                {activeTile === "students" && "Recent enrollments"}
                {activeTile === "clients" && "Recent clients"}
                {activeTile === "ledger" && "Sub-agent ledger"}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {activeTile !== "ledger" && (
                <div className="inline-flex rounded-md bg-stone-100 p-0.5" data-testid="list-filter-tabs">
                  {FILTER_OPTIONS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setListFilter(f.value)}
                      data-testid={`filter-${f.value}`}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${
                        listFilter === f.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
              <Link
                to={activeTile === "ledger" ? "/agents" : `/${activeTile}`}
                className="text-sm text-stone-700 hover:text-stone-900 underline underline-offset-4"
                data-testid="view-all-link"
              >View all →</Link>
            </div>
          </div>

          {activeTile === "transactions" && (
            <TxList items={filteredTransactions} currency={currency} />
          )}
          {activeTile === "students" && (
            <StudentList items={filteredStudents} currency={currency} />
          )}
          {activeTile === "clients" && (
            <ClientList items={filteredClients} />
          )}
          {activeTile === "ledger" && (
            <LedgerList items={ledger} currency={currency} />
          )}
        </Card>
      </section>
    </div>
  );
}

function TxList({ items, currency }) {
  if (!items.length) return <Empty label="No transactions in this window." />;
  return (
    <ul className="divide-y divide-stone-100" data-testid="tx-list">
      {items.slice(0, 10).map((t) => (
        <li key={t.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-stone-50">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            </div>
            <div>
              <p className="text-sm font-medium">{t.description || (t.type === 'income' ? 'Income' : 'Expense')}</p>
              <p className="text-xs text-stone-500">{formatDate(t.date)}</p>
            </div>
          </div>
          <span className={`tabular-nums text-sm font-medium ${t.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
            {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_BADGE = {
  inquiry: "bg-stone-100 text-stone-700",
  enrolled: "bg-emerald-50 text-emerald-700",
  completed: "bg-sky-50 text-sky-700",
};

function StudentList({ items, currency }) {
  if (!items.length) return <Empty label="No enrollments in this window." />;
  return (
    <ul className="divide-y divide-stone-100" data-testid="student-list">
      {items.slice(0, 10).map((s) => (
        <li key={s.id}>
          <Link to={`/students/${s.id}`} className="flex items-center justify-between px-6 py-3.5 hover:bg-stone-50">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-medium shrink-0">
                {(s.name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-stone-500 truncate">{[s.course, s.college, s.reference].filter(Boolean).join(" · ") || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_BADGE[s.status] || "bg-stone-100 text-stone-700"}`}>{s.status}</span>
              <span className="tabular-nums text-sm text-stone-700 hidden sm:inline">{formatMoney(s.collected_total, currency)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const CLIENT_TYPE_LABEL = {
  sub_agent_associate: "Sub Agent / Associate",
  associate_consultant: "Associate Consultant",
  km_blr_office: "KM BLR Office",
  km_tcr_office: "KM TCR Office",
  km_kmly_office: "KM KMLY Office",
};

function ClientList({ items }) {
  if (!items.length) return <Empty label="No clients added in this window." />;
  return (
    <ul className="divide-y divide-stone-100" data-testid="client-list">
      {items.slice(0, 10).map((c) => (
        <li key={c.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-stone-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-medium shrink-0">
              {(c.name || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-xs text-stone-500 truncate">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
            {CLIENT_TYPE_LABEL[c.client_type] || "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function LedgerList({ items, currency }) {
  if (!items?.length) return <Empty label="No sub-agent activity yet." />;
  return (
    <ul className="divide-y divide-stone-100" data-testid="ledger-list">
      {items.slice(0, 10).map((row, i) => (
        <li key={`${row.type}-${row.name}-${i}`}>
          <Link
            to={`/agents/detail?type=${encodeURIComponent(row.type)}&name=${encodeURIComponent(row.name)}`}
            className="flex items-center justify-between px-6 py-3.5 hover:bg-stone-50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
                <Notebook size={16} weight="duotone" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{row.name}</p>
                <p className="text-xs text-stone-500 truncate">{row.type}</p>
              </div>
            </div>
            <span className="tabular-nums text-sm font-medium text-stone-700">{formatMoney(row.total ?? 0, currency)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ label }) {
  return <div className="p-10 text-center text-sm text-stone-500" data-testid="tile-empty">{label}</div>;
}
