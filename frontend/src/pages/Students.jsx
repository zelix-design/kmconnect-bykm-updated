import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canEdit } from "@/lib/perm";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowRight, Student as StudentIcon, FileXls, MagnifyingGlass, GraduationCap, Buildings, UserCircle, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { downloadStudentsXlsx } from "@/lib/studentExports";
import FeesPlanFields, { emptyFeesPlan, normalizeFeesPlanForApi } from "@/components/FeesPlanFields";
import { CLIENT_TYPES, clientTypeLabel } from "@/pages/Clients";

const STATUS_STYLES = {
  inquiry: "bg-muted text-foreground",
  enrolled: "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
  completed: "bg-sky-100/60 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400",
};

const STATUS_LABEL = {
  inquiry: "Inquiry",
  enrolled: "Enrolled",
  cancelled: "Cancelled",
  completed: "Completed",
};

// Card tint per status — soft pastel background
const CARD_TINT = {
  inquiry: "bg-muted/40 border-border",
  enrolled: "bg-emerald-100/40 dark:bg-emerald-500/10 border-emerald-200/70 dark:border-emerald-500/30",
  cancelled: "bg-rose-100/40 dark:bg-rose-500/10 border-rose-200/70 dark:border-rose-500/30",
  completed: "bg-sky-100/40 dark:bg-sky-500/10 border-sky-200/70 dark:border-sky-500/30",
};

const STATUS_OPTIONS = [
  { value: "inquiry", label: "Inquiry" },
  { value: "enrolled", label: "Enrolled" },
  { value: "cancelled", label: "Cancelled" },
];

const emptyForm = () => ({
  name: "", course: "", college: "", reference: "",
  sc_out_fixed: 0, status: "inquiry", enrollment_date: "", notes: "",
  fees_plan: emptyFeesPlan(),
});

function recentRank(s) {
  // Sort: enrollment_date desc, then created_at desc
  return s.enrollment_date || s.created_at || "";
}

export default function Students() {
  const { user } = useAuth();
  const allowEdit = canEdit(user, "students");
  const isSuper = user?.role === "super_admin";
  const currency = user?.currency || "USD";
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  // Filters
  const [qName, setQName] = useState("");
  const [qCollege, setQCollege] = useState("");
  const [qRef, setQRef] = useState("");

  // Super admin: client picker dialog before opening the student form
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const openAddStudent = () => {
    // Reset form to blank
    setForm({ ...emptyForm(), reference: "" });
    // Both super_admin (full client picker) AND office_admin (staff-only picker)
    // pick a reference FIRST, then the student form opens with it pre-filled.
    setPickerSearch("");
    setPickerOpen(true);
  };
  const pickClientAndEnrol = (client) => {
    setForm((f) => ({ ...f, reference: client?.name || "" }));
    setPickerOpen(false);
    setOpen(true);
  };
  const skipPicker = () => {
    setForm((f) => ({ ...f, reference: "" }));
    setPickerOpen(false);
    setOpen(true);
  };

  const filteredPickerClients = useMemo(() => {
    // Defense-in-depth: office admins only ever pick from staff. Their /clients data
    // is staff-only today, but if that invariant ever breaks the filter still holds.
    let base = isSuper ? clients : clients.filter((c) => c.client_type === "staff");
    if (!pickerSearch) return base;
    const q = pickerSearch.toLowerCase();
    return base.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q) ||
      (c.office || "").toLowerCase().includes(q)
    );
  }, [clients, pickerSearch, isSuper]);

  const pickerGroups = useMemo(() => {
    return CLIENT_TYPES
      .map((t) => ({ ...t, items: filteredPickerClients.filter((c) => c.client_type === t.value) }))
      .filter((g) => g.items.length > 0);
  }, [filteredPickerClients]);

  const load = async () => {
    const [s, c] = await Promise.all([api.get("/students"), api.get("/clients")]);
    setList(s.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  // Auto-open the Add dialog when arriving with ?new=1 (from Quick Entry hub or Add-an-admission flow)
  const [searchParams, setSearchParams] = useSearchParams();
  const newFlag = searchParams.get("new");
  const staffParam = searchParams.get("staff");
  const action = searchParams.get("action");
  useEffect(() => {
    if (newFlag === "1") {
      if (staffParam) {
        // Came from "Add an admission" with a pre-selected staff → open form direct
        setForm((f) => ({ ...f, reference: decodeURIComponent(staffParam) }));
        setOpen(true);
      } else {
        // Plain ?new=1 from Quick Entry → open the reference picker first
        setForm((f) => ({ ...emptyForm(), reference: "" }));
        setPickerSearch("");
        setPickerOpen(true);
      }
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      next.delete("staff");
      setSearchParams(next, { replace: true });
    }
  }, [newFlag, staffParam, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const m = (v, q) => !q || String(v || "").toLowerCase().includes(q.toLowerCase());
    return [...list]
      .filter((s) => m(s.name, qName) && m(s.college, qCollege) && m(s.reference, qRef))
      .sort((a, b) => String(recentRank(b)).localeCompare(String(recentRank(a))));
  }, [list, qName, qCollege, qRef]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        sc_out_fixed: parseFloat(form.sc_out_fixed) || 0,
        fees_plan: normalizeFeesPlanForApi(form.fees_plan),
      };
      await api.post("/students", payload);
      toast.success("Student added");
      setOpen(false); setForm(emptyForm()); load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="students-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="label-eyebrow">Pipeline</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">Students</h1>
          <p className="text-sm text-muted-foreground mt-1">Recent enrollments — search by name, college, or reference.</p>
          {action === "log_payment" && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-gradient-soft border border-amber-500/30 text-sm text-foreground" data-testid="log-payment-banner">
              <ArrowRight size={14} className="text-amber-700 dark:text-amber-400" />
              <span><strong>Log Payment:</strong> click a student card below to open their fees ledger.</span>
            </div>
          )}
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm()); }}>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!list.length) { toast.error("No students to export"); return; }
                try {
                  downloadStudentsXlsx({ students: list, currency });
                  toast.success("Exported XLSX");
                } catch (err) {
                  console.error(err);
                  toast.error("Export failed");
                }
              }}
              className="h-10"
              data-testid="export-students-xlsx-btn"
            >
              <FileXls size={16} className="mr-1.5" /> Export XLSX
            </Button>
            {allowEdit && (
              <Button onClick={openAddStudent} data-testid="add-student-btn" className="h-10 btn-amber border-0">
                <Plus size={16} className="mr-1.5" /> Add student
              </Button>
            )}
          </div>
          <DialogContent className="bg-card max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">New student</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">Enrol a student and lock in the fee structure. Schedules are generated automatically.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Student Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="st-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Course</Label><Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="B.Tech CSE" data-testid="st-course" /></div>
                <div><Label>College</Label><Input value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} placeholder="IIT Delhi" data-testid="st-college" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {form.reference ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-gradient-soft px-3 py-2.5 flex items-center justify-between gap-2" data-testid="st-reference-chip">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reference (staff)</p>
                      <p className="text-sm font-medium text-foreground truncate">{form.reference}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, reference: "" })}
                      data-testid="st-reference-clear"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5 flex items-center text-[12px] text-muted-foreground">
                    No staff reference (use "Add an admission" on the dashboard to attach one)
                  </div>
                )}
                <div><Label>SC Earned</Label><Input type="number" step="0.01" value={form.sc_out_fixed} onChange={(e) => setForm({ ...form, sc_out_fixed: e.target.value })} data-testid="st-sc" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger data-testid="st-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Enrollment Date</Label><Input type="date" value={form.enrollment_date} onChange={(e) => setForm({ ...form, enrollment_date: e.target.value })} data-testid="st-enroll-date" /></div>
              </div>

              <FeesPlanFields
                fp={form.fees_plan}
                onChange={(next) => setForm({ ...form, fees_plan: next })}
                currency={currency}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" className="btn-amber border-0" data-testid="st-save">Add</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Super-admin: client picker dialog (opens before the student form) */}
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-lg p-0 overflow-hidden" data-testid="client-picker-dialog">
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
              <DialogTitle className="flex items-center gap-2">
                <UserCircle size={18} weight="duotone" className="text-orange-600 dark:text-orange-400" />
                {isSuper ? "Pick a reference" : "Pick the referring staff"}
              </DialogTitle>
              <DialogDescription>
                {isSuper
                  ? "Select the client this admission should be attributed to. Skip to enrol without a reference."
                  : "Select the staff this student is being enrolled under. Skip if there's no referrer."}
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 py-3 border-b border-border">
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, company or office…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="pl-10 h-10"
                  data-testid="client-picker-search"
                />
              </div>
            </div>
            <div className="max-h-[55vh] overflow-y-auto" data-testid="client-picker-list">
              {pickerGroups.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground" data-testid="client-picker-empty">
                  {clients.length === 0
                    ? <>No clients yet. <Link to="/clients" onClick={() => setPickerOpen(false)} className="text-orange-600 dark:text-orange-400 underline">Add one</Link>.</>
                    : "No clients matched your search."}
                </div>
              ) : (
                pickerGroups.map((g) => (
                  <div key={g.value} data-testid={`picker-group-${g.value}`}>
                    <div className="px-5 py-2 bg-muted/40 border-b border-border flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">{g.label}</span>
                      <span className="text-[10px] text-muted-foreground/70">{g.items.length}</span>
                    </div>
                    {g.items.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => pickClientAndEnrol(c)}
                        data-testid={`picker-pick-${c.id}`}
                        className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors border-b border-border/40"
                      >
                        <div className="w-9 h-9 rounded-md bg-muted text-foreground text-sm font-semibold flex items-center justify-center shrink-0">
                          {(c.name || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {clientTypeLabel(c.client_type)}
                            {c.client_type === "staff" && c.office ? ` · ${c.office.replace("KM_", "KM ")}` : ""}
                            {c.company ? ` · ${c.company}` : ""}
                          </p>
                        </div>
                        <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
            <DialogFooter className="px-5 py-3 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>
                <X size={14} className="mr-1.5" /> Cancel
              </Button>
              <Button type="button" onClick={skipPicker} data-testid="picker-skip" className="bg-muted text-foreground hover:bg-muted/80">
                Skip & enrol without reference
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="students-filters">
        <div className="relative">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={qName}
            onChange={(e) => setQName(e.target.value)}
            placeholder="Student name"
            className="pl-9 bg-card"
            data-testid="filter-name"
          />
        </div>
        <div className="relative">
          <Buildings size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={qCollege}
            onChange={(e) => setQCollege(e.target.value)}
            placeholder="College"
            className="pl-9 bg-card"
            data-testid="filter-college"
          />
        </div>
        <div className="relative">
          <UserCircle size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={qRef}
            onChange={(e) => setQRef(e.target.value)}
            placeholder="Reference"
            className="pl-9 bg-card"
            data-testid="filter-reference"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground border border-border shadow-none" data-testid="empty-students">
          <StudentIcon size={32} className="mx-auto text-muted-foreground/50 mb-3" />
          {list.length === 0 ? "No students yet. Add one to start tracking fees." : "No students match these filters."}
        </Card>
      ) : (
        <>
          <p className="label-eyebrow" data-testid="recent-eyebrow">Recent enrollments — {filtered.length}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="students-grid">
            {filtered.map((s) => (
              <Link
                key={s.id}
                to={`/students/${s.id}`}
                data-testid={`st-card-${s.id}`}
                className="group block"
              >
                <Card className={`p-5 border rounded-lg shadow-none hover:shadow-sm hover:border-border transition-all h-full flex flex-col ${CARD_TINT[s.status] || "bg-card border-border"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-md bg-card/70 text-foreground flex items-center justify-center font-medium shrink-0 border border-border">
                        {(s.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid={`st-card-name-${s.id}`}>{s.name}</p>
                        {s.course && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><GraduationCap size={12} /> {s.course}</p>}
                      </div>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${STATUS_STYLES[s.status] || "bg-muted text-foreground"}`}>
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                  </div>

                  {isSuper && s._creator_office && (
                    <div className="mt-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-orange-100/60 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 self-start" data-testid={`st-creator-${s.id}`}>
                      <Buildings size={11} weight="duotone" /> {s._creator_office.replace("KM_", "KM ")} · {s._creator_name}
                    </div>
                  )}

                  <div className="mt-4 space-y-1.5 text-sm text-muted-foreground flex-1">
                    <p className="flex items-center gap-2"><Buildings size={14} className="text-muted-foreground/70" /> <span className="truncate">{s.college || "—"}</span></p>
                    <p className="flex items-center gap-2"><UserCircle size={14} className="text-muted-foreground/70" /> <span className="truncate">{s.reference || "—"}</span></p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Collected</span>
                    <span className="tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{formatMoney(s.collected_total, currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Balance</span>
                    <span className={`tabular-nums font-medium ${s.balance_vs_sc > 0 ? "text-rose-700 dark:text-rose-400" : "text-foreground"}`}>{formatMoney(s.balance_vs_sc, currency)}</span>
                  </div>

                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-foreground group-hover:text-foreground">
                    Open <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
