import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import {
  ShoppingBag, ChartPie, UsersThree, Receipt, FileText, CalendarBlank,
  Student, Notebook, ArrowUpRight, ArrowDownRight,
  IdentificationBadge, Briefcase, Buildings, GraduationCap,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import OfficeDashboard from "./OfficeDashboard";
import {
  rangeFor, withinFilter, monthlyBuckets, allTimeMonthlyBuckets, todayISO,
  FILTER_OPTIONS, LEDGER_TYPE_LABEL, LEDGER_TYPE_COLOR, PALETTES,
} from "@/lib/dashboardUtils";
import { StatCard, ChartHeader, Empty } from "@/components/dashboard/StatCard";
import { TxList, StudentList, ClientList, LedgerList } from "@/components/dashboard/OverviewLists";

const TILES = [
  { key: "transactions", label: "Transactions", icon: Receipt, palette: "amber" },
  { key: "students", label: "Students", icon: Student, palette: "emerald" },
  { key: "clients", label: "Clients", icon: UsersThree, palette: "sky" },
  { key: "ledger", label: "Ledger", icon: Notebook, palette: "violet" },
];
export default function Dashboard() {
  const { user } = useAuth();
  // Office admins get their bespoke dashboard
  if (user?.role === "office_admin") {
    return <OfficeDashboard />;
  }
  return <SuperAdminDashboard />;
}

function SuperAdminDashboard() {
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
          <Link to="/quick-entry" data-testid="quick-add-tx" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg btn-amber text-sm font-medium">
            <Receipt size={16} /> Quick entry
          </Link>
          <Link to="/invoices" data-testid="quick-add-invoice" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-card text-sm hover:bg-muted lift">
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
                  ? "bg-amber-gradient text-white border border-orange-500"
                  : "bg-card border border-border hover:border-border"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? "bg-white/20 text-white" : p.icon}`}>
                <t.icon size={18} weight={active ? "fill" : "duotone"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${active ? "text-white" : "text-foreground"}`}>{t.label}</p>
                <p className={`text-xs ${active ? "text-white/80" : "text-muted-foreground"}`}>{active ? "Selected" : "Open"}</p>
              </div>
              <ArrowUpRight size={14} className={active ? "text-white/80" : "text-muted-foreground/70 group-hover:text-foreground"} />
            </button>
          );
        })}
      </section>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-3" data-testid="date-range-filter">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarBlank size={16} />
          <span className="label-eyebrow">Period</span>
        </div>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-44 h-9 bg-card" data-testid="range-preset"><SelectValue /></SelectTrigger>
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
            <Input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="h-9 w-44 bg-card" data-testid="range-start" />
            <span className="text-muted-foreground/70 text-sm">→</span>
            <Input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="h-9 w-44 bg-card" data-testid="range-end" />
          </>
        )}
      </div>

      {/* Tile-driven overview */}
      <div data-testid={`overview-${activeTile}`} className="space-y-7">
        {activeTile === "transactions" && (
          <TransactionsOverview summary={summary} cashflow={cashflow} byCat={byCat} transactions={transactions} currency={currency} range={range} />
        )}
        {activeTile === "students" && (
          <StudentsOverview students={students} currency={currency} range={range} />
        )}
        {activeTile === "clients" && (
          <ClientsOverview clients={clients} students={students} />
        )}
        {activeTile === "ledger" && (
          <LedgerOverview ledger={ledger} students={students} currency={currency} />
        )}
      </div>

      {/* Inline list driven by active tile */}
      <section data-testid="active-tile-section">
        <Card className="border border-border bg-card rounded-xl shadow-none">
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60">
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
                <div className="inline-flex rounded-md bg-muted p-0.5" data-testid="list-filter-tabs">
                  {FILTER_OPTIONS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setListFilter(f.value)}
                      data-testid={`filter-${f.value}`}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${
                        listFilter === f.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
              <Link
                to={activeTile === "ledger" ? "/agents" : `/${activeTile}`}
                className="text-sm text-foreground hover:text-foreground underline underline-offset-4"
                data-testid="view-all-link"
              >View all →</Link>
            </div>
          </div>

          {activeTile === "transactions" && <TxList items={filteredTransactions} currency={currency} />}
          {activeTile === "students" && <StudentList items={filteredStudents} currency={currency} />}
          {activeTile === "clients" && <ClientList items={filteredClients} />}
          {activeTile === "ledger" && <LedgerList items={ledger} currency={currency} />}
        </Card>
      </section>
    </div>
  );
}

// -------- Tile-specific overview blocks --------

function TransactionsOverview({ summary, cashflow, byCat, transactions, currency, range }) {
  const cfTrend = useMemo(() => {
    if (!cashflow || cashflow.length < 2) return { income: 0, expense: 0 };
    const cur = cashflow[cashflow.length - 1];
    const prev = cashflow[cashflow.length - 2];
    const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : (a > 0 ? 100 : 0));
    return { income: pct(cur.income, prev.income), expense: pct(cur.expense, prev.expense) };
  }, [cashflow]);
  const totalSpendings = byCat.reduce((s, c) => s + (c.total || 0), 0);
  const todaysSpend = useMemo(() => {
    const today = todayISO();
    return (transactions || [])
      .filter((t) => t.type === "expense" && (t.date || "").slice(0, 10) === today)
      .reduce((s, t) => s + (t.amount || 0), 0);
  }, [transactions]);

  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="stat-today-spend" eyebrow="Today's spend" value={formatMoney(todaysSpend, currency)} palette="amber" icon={ShoppingBag} hint="All expense transactions today" />
        <StatCard testId="stat-income" eyebrow={`Income · ${range?.label || ""}`} value={formatMoney(summary?.month_income ?? 0, currency)} trend={cfTrend.income} palette="emerald" icon={ArrowUpRight} />
        <StatCard testId="stat-expense" eyebrow={`Expenses · ${range?.label || ""}`} value={formatMoney(summary?.month_expense ?? 0, currency)} trend={cfTrend.expense} palette="rose" icon={ArrowDownRight} />
        <StatCard testId="stat-outstanding" eyebrow="Outstanding invoices" value={formatMoney(summary?.outstanding_invoices ?? 0, currency)} palette="violet" icon={FileText} hint="Sent + overdue" />
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 border border-border bg-card rounded-xl shadow-none">
          <ChartHeader eyebrow="Activity" title="Last 6 months" right={
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />Income</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" />Expense</span>
            </div>
          } />
          <div className="h-72 -ml-2" style={{ minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflow}>
                <defs>
                  <linearGradient id="grad-inc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="grad-exp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} formatter={(v) => formatMoney(v, currency)} />
                <Area type="monotone" dataKey="income" stroke="#059669" strokeWidth={2.5} fill="url(#grad-inc)" />
                <Area type="monotone" dataKey="expense" stroke="#e11d48" strokeWidth={2.5} fill="url(#grad-exp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6 border border-border bg-card rounded-xl shadow-none">
          <ChartHeader eyebrow="Latest spendings" title="By category" right={<span className="text-xs text-muted-foreground">{formatMoney(totalSpendings, currency)}</span>} />
          {byCat.length === 0 ? (
            <Empty label="No expenses in this period." />
          ) : (
            <>
              <div className="h-40 mt-2" style={{ minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCat} dataKey="total" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {byCat.map((entry) => (<Cell key={`${entry.name}-${entry.color}`} fill={entry.color || "hsl(var(--muted-foreground))"} />))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(v, currency)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 space-y-2.5">
                {byCat.slice(0, 5).map((c) => (
                  <li key={c.category_id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${c.color}1A`, color: c.color }}><ChartPie size={14} weight="duotone" /></span>
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{formatMoney(c.total, currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </section>
    </>
  );
}

const STATUS_COLORS = { inquiry: "#a8a29e", enrolled: "#10b981", cancelled: "#e11d48", completed: "#0ea5e9" };
const STATUS_LABEL = { inquiry: "Inquiry", enrolled: "Enrolled", cancelled: "Cancelled", completed: "Completed" };

function StudentsOverview({ students, currency, range }) {
  const stats = useMemo(() => {
    const total = students.length;
    const counts = { inquiry: 0, enrolled: 0, cancelled: 0, completed: 0 };
    let scFixed = 0, collected = 0, balance = 0;
    students.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1;
      scFixed += s.sc_out_fixed || 0;
      collected += s.collected_total || 0;
      balance += s.balance_vs_sc || 0;
    });
    return { total, counts, scFixed, collected, balance };
  }, [students]);

  // Enrolled in period
  const periodStats = useMemo(() => {
    if (!range) return { count: 0, collected: 0 };
    const inRange = (s) => {
      const d = s.enrollment_date || s.created_at;
      if (!d) return false;
      const ds = String(d).slice(0, 10);
      return ds >= range.start && ds <= range.end;
    };
    const subset = students.filter(inRange);
    return {
      count: subset.length,
      collected: subset.reduce((sum, s) => sum + (s.collected_total || 0), 0),
    };
  }, [students, range]);

  const trend = useMemo(
    () => monthlyBuckets(students.map((s) => ({ date: s.enrollment_date || s.created_at, value: 1 }))),
    [students]
  );

  const statusPie = useMemo(
    () => Object.entries(stats.counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: STATUS_LABEL[k], status: k, value: v, color: STATUS_COLORS[k] })),
    [stats]
  );

  const enrolledColleges = useMemo(() => {
    const m = {};
    students.forEach((s) => {
      if (s.college && s.status === "enrolled") {
        m[s.college] = (m[s.college] || 0) + 1;
      }
    });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [students]);

  const topReferences = useMemo(() => {
    const m = {};
    students.forEach((s) => {
      const ref = (s.reference || "").trim();
      if (ref) m[ref] = (m[ref] || 0) + 1;
    });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [students]);

  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="st-stat-total" eyebrow="Total students" value={String(stats.total)} palette="amber" icon={Student} />
        <StatCard testId="st-stat-collected" eyebrow="Collected" value={formatMoney(stats.collected, currency)} palette="emerald" icon={ArrowUpRight} />
        <StatCard testId="st-stat-balance" eyebrow="Outstanding balance" value={formatMoney(stats.balance, currency)} palette="rose" icon={ArrowDownRight} hint="vs. SC Earned" />
        <StatCard testId="st-stat-period" eyebrow={`Enrolled · ${range?.label || ""}`} value={String(periodStats.count)} palette="violet" icon={FileText} hint={`${formatMoney(periodStats.collected, currency)} collected`} />
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 border border-border bg-card rounded-xl shadow-none">
          <ChartHeader eyebrow="Activity" title="Enrollments · last 6 months" right={<span className="text-xs text-muted-foreground">{stats.total} total</span>} />
          <div className="h-72 -ml-2" style={{ minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs><linearGradient id="grad-enroll" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} />
                <Area type="monotone" dataKey="count" stroke="#059669" strokeWidth={2.5} fill="url(#grad-enroll)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6 border border-border bg-card rounded-xl shadow-none">
          <ChartHeader eyebrow="Pipeline" title="By status" right={<span className="text-xs text-muted-foreground">{stats.total} students</span>} />
          {statusPie.length === 0 ? <Empty label="No students yet." /> : (
            <>
              <div className="h-40 mt-2" style={{ minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {statusPie.map((e) => (<Cell key={`status-${e.name || e.color}`} fill={e.color} />))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 space-y-2.5">
                {statusPie.map((s) => (
                  <li key={s.status} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                      <span>{s.name}</span>
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{s.value}</span>
                  </li>
                ))}
              </ul>
              {topReferences.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border/60" data-testid="top-references">
                  <p className="label-eyebrow mb-2">Top references</p>
                  <ul className="space-y-1.5">
                    {topReferences.map((r, i) => (
                      <li key={`${r.name}-${i}`} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 min-w-0 truncate"><IdentificationBadge size={12} className="text-muted-foreground/70 shrink-0" /> <span className="truncate">{r.name}</span></span>
                        <span className="font-medium tabular-nums text-foreground">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {enrolledColleges.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border/60" data-testid="enrolled-colleges">
                  <p className="label-eyebrow mb-2">Enrolled colleges</p>
                  <ul className="space-y-1.5">
                    {enrolledColleges.map((c, i) => (
                      <li key={`${c.name}-${i}`} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 min-w-0 truncate"><Buildings size={12} className="text-muted-foreground/70 shrink-0" /> <span className="truncate">{c.name}</span></span>
                        <span className="font-medium tabular-nums text-foreground">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
      </section>
    </>
  );
}

const CLIENT_TYPES = [
  { value: "sub_agent_associate", label: "Sub Agent / Associate", short: "Sub / Assoc.", color: "#7c3aed" },
  { value: "associate_consultant", label: "Associate Consultant", short: "Consultant", color: "#d97706" },
  { value: "km_blr_office", label: "KM BLR Office", short: "KM BLR", color: "#059669" },
  { value: "km_tcr_office", label: "KM TCR Office", short: "KM TCR", color: "#0284c7" },
  { value: "km_kmly_office", label: "KM KMLY Office", short: "KM KMLY", color: "#e11d48" },
];

function ClientsOverview({ clients, students }) {
  const stats = useMemo(() => {
    const total = clients.length;
    const counts = Object.fromEntries(CLIENT_TYPES.map((t) => [t.value, 0]));
    clients.forEach((c) => { if (c.client_type && counts[c.client_type] != null) counts[c.client_type]++; });
    const kmTotal = counts.km_blr_office + counts.km_tcr_office + counts.km_kmly_office;
    return { total, counts, kmTotal };
  }, [clients]);

  const trend = useMemo(
    () => monthlyBuckets(clients.map((c) => ({ date: c.created_at, value: 1 }))),
    [clients]
  );

  const typePie = useMemo(
    () => CLIENT_TYPES.map((t) => ({ name: t.short, value: stats.counts[t.value] || 0, color: t.color })).filter((x) => x.value > 0),
    [stats]
  );

  // Top referrers — count students whose `reference` matches a client name
  const topReferrers = useMemo(() => {
    const studentCountByRef = {};
    (students || []).forEach((s) => {
      const ref = (s.reference || "").trim();
      if (ref) studentCountByRef[ref] = (studentCountByRef[ref] || 0) + 1;
    });
    const rows = (clients || []).map((c) => ({
      name: c.name,
      type: c.client_type,
      count: studentCountByRef[c.name] || 0,
    }));
    return rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [clients, students]);

  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="cl-stat-total" eyebrow="Total clients" value={String(stats.total)} palette="amber" icon={UsersThree} />
        <StatCard testId="cl-stat-sub" eyebrow="Sub Agents / Associates" value={String(stats.counts.sub_agent_associate)} palette="violet" icon={IdentificationBadge} />
        <StatCard testId="cl-stat-consultant" eyebrow="Associate Consultants" value={String(stats.counts.associate_consultant)} palette="rose" icon={Briefcase} />
        <StatCard testId="cl-stat-km" eyebrow="KM Offices" value={String(stats.kmTotal)} palette="emerald" icon={Buildings} hint="BLR · TCR · KMLY combined" />
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 border border-border bg-card rounded-xl shadow-none">
          <ChartHeader eyebrow="Activity" title="Clients added · last 6 months" right={<span className="text-xs text-muted-foreground">{stats.total} total</span>} />
          <div className="h-72 -ml-2" style={{ minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs><linearGradient id="grad-client" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} />
                <Area type="monotone" dataKey="count" stroke="#0284c7" strokeWidth={2.5} fill="url(#grad-client)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6 border border-border bg-card rounded-xl shadow-none">
          <ChartHeader eyebrow="Mix" title="By client type" right={<span className="text-xs text-muted-foreground">{stats.total} clients</span>} />
          {typePie.length === 0 ? <Empty label="No clients yet." /> : (
            <>
              <div className="h-40 mt-2" style={{ minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typePie} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {typePie.map((e) => (<Cell key={`tp-st-${e.name || e.color}`} fill={e.color} />))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 space-y-2.5">
                {CLIENT_TYPES.map((t) => (
                  <li key={t.value} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0"><span className="w-2 h-2 rounded-sm shrink-0" style={{ background: t.color }} /><span className="truncate">{t.short}</span></span>
                    <span className="font-medium tabular-nums text-foreground">{stats.counts[t.value] || 0}</span>
                  </li>
                ))}
              </ul>

              {/* KM offices breakdown */}
              <div className="mt-5 pt-4 border-t border-border/60" data-testid="km-breakdown">
                <p className="label-eyebrow mb-2">KM offices</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "BLR", value: stats.counts.km_blr_office, color: "#059669" },
                    { label: "TCR", value: stats.counts.km_tcr_office, color: "#0284c7" },
                    { label: "KMLY", value: stats.counts.km_kmly_office, color: "#e11d48" },
                  ].map((k) => (
                    <div key={k.label} className="rounded-md bg-muted/40 p-2 text-center" data-testid={`km-${k.label.toLowerCase()}`}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
                      <p className="font-display text-base tabular-nums" style={{ color: k.color }}>{k.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top referrers (clients who referred students) */}
              {topReferrers.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border/60" data-testid="top-referrers">
                  <p className="label-eyebrow mb-2">Top referrers</p>
                  <ul className="space-y-1.5">
                    {topReferrers.map((r, i) => (
                      <li key={`${r.name}-${i}`} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          <IdentificationBadge size={12} className="text-muted-foreground/70 shrink-0" />
                          <span className="truncate">{r.name}</span>
                        </span>
                        <span className="text-foreground tabular-nums">
                          <span className="font-medium">{r.count}</span>
                          <span className="text-muted-foreground/70 ml-1">student{r.count === 1 ? "" : "s"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
      </section>
    </>
  );
}

function LedgerOverview({ ledger, students, currency }) {
  const stats = useMemo(() => {
    let totalReceived = 0, paidToCollege = 0, scAdjusted = 0, holding = 0;
    const byType = { sub_agent: 0, associate: 0, km: 0 };
    const countByType = { sub_agent: 0, associate: 0, km: 0 };
    (ledger || []).forEach((r) => {
      totalReceived += r.total_received || 0;
      paidToCollege += r.paid_to_college || 0;
      scAdjusted += r.sc_adjusted || 0;
      holding += r.holding || 0;
      if (byType[r.type] != null) {
        byType[r.type] += r.total_received || 0;
        countByType[r.type] += 1;
      }
    });
    return { totalReceived, paidToCollege, scAdjusted, holding, byType, countByType };
  }, [ledger]);

  // Monthly routed amount from students' adjustments (sc_adjusted) — ALL TIME
  const trend = useMemo(() => {
    const dates = [];
    (students || []).forEach((s) => {
      (s.payments || []).forEach((p) => {
        (p.adjustments || []).forEach((a) => {
          if (a.kind === "sc_adjusted") {
            dates.push({ date: a.payment_date || p.date, value: a.amount || 0 });
          }
        });
        const recv = p.received_in;
        if (recv && ["sub_agent", "associate", "km"].includes(recv.type)) {
          dates.push({ date: p.date, value: p.amount || 0 });
        }
      });
    });
    return allTimeMonthlyBuckets(dates);
  }, [students]);

  const topAgents = useMemo(
    () => [...(ledger || [])].slice(0, 5).map((r) => ({ name: r.name, value: r.total_received, type: r.type })),
    [ledger]
  );

  const typePie = useMemo(
    () => Object.entries(stats.byType).filter(([, v]) => v > 0).map(([k, v]) => ({ name: LEDGER_TYPE_LABEL[k], value: v, color: LEDGER_TYPE_COLOR[k], type: k })),
    [stats]
  );

  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="lg-stat-received" eyebrow="Total routed" value={formatMoney(stats.totalReceived, currency)} palette="amber" icon={Notebook} hint={`${(ledger || []).length} contacts`} />
        <StatCard testId="lg-stat-college" eyebrow="Paid to college" value={formatMoney(stats.paidToCollege, currency)} palette="sky" icon={Buildings} />
        <StatCard testId="lg-stat-sc" eyebrow="Sub-Agents Routed" value={formatMoney(stats.scAdjusted, currency)} palette="emerald" icon={ArrowDownRight} hint="SC adjusted out" />
        <div className="relative" data-testid="lg-stat-holding-wrapper">
          <StatCard testId="lg-stat-holding" eyebrow="Holding" value={formatMoney(stats.holding, currency)} palette={stats.holding > 0 ? "rose" : "violet"} icon={FileText} hint="Routed − settled" />
          {stats.holding > 0 && (
            <Link
              to="/agents"
              data-testid="settle-pending-badge"
              className="absolute right-4 bottom-4 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full bg-rose-900 text-rose-50 hover:bg-rose-800 lift"
            >
              Settle pending <ArrowUpRight size={10} weight="bold" />
            </Link>
          )}
        </div>
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 border border-border bg-card rounded-xl shadow-none">
          <ChartHeader eyebrow="Activity" title="Amount routed · all time, monthly" right={<span className="text-xs text-muted-foreground">{formatMoney(stats.totalReceived, currency)}</span>} />
          <div className="h-72 -ml-2" style={{ minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs><linearGradient id="grad-ledger" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} /><stop offset="100%" stopColor="#7c3aed" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} formatter={(v) => formatMoney(v, currency)} />
                <Area type="monotone" dataKey="value" stroke="#6d28d9" strokeWidth={2.5} fill="url(#grad-ledger)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {topAgents.length > 0 && (
            <div className="mt-6">
              <p className="label-eyebrow mb-2">Top contacts</p>
              <div className="h-44 -ml-2" style={{ minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={topAgents} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v, currency)} />
                    <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }} axisLine={false} tickLine={false} width={120} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} formatter={(v) => formatMoney(v, currency)} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {topAgents.map((a) => (<Cell key={`ag-${a.type}-${a.name}`} fill={LEDGER_TYPE_COLOR[a.type] || "#7c3aed"} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Card>
        <Card className="p-6 border border-border bg-card rounded-xl shadow-none">
          <ChartHeader eyebrow="Mix" title="By contact type" right={<span className="text-xs text-muted-foreground">{formatMoney(stats.totalReceived, currency)}</span>} />
          {typePie.length === 0 ? <Empty label="No ledger activity yet." /> : (
            <>
              <div className="h-40 mt-2" style={{ minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typePie} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {typePie.map((e) => (<Cell key={`tp-ag-${e.name || e.color}`} fill={e.color} />))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(v, currency)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--foreground))" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 space-y-2.5">
                {typePie.map((s) => (
                  <li key={s.type} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                      <span className="truncate">{s.name} <span className="text-muted-foreground/70">· {stats.countByType[s.type]}</span></span>
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{formatMoney(s.value, currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </section>
    </>
  );
}
