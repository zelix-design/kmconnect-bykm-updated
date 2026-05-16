import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowRight, Student as StudentIcon, FileXls, MagnifyingGlass, GraduationCap, Buildings, UserCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { downloadStudentsXlsx } from "@/lib/studentExports";
import FeesPlanFields, { emptyFeesPlan, normalizeFeesPlanForApi } from "@/components/FeesPlanFields";

const STATUS_STYLES = {
  inquiry: "bg-stone-100 text-stone-700",
  enrolled: "bg-emerald-50 text-emerald-700",
  completed: "bg-sky-50 text-sky-700",
};

const STATUS_LABEL = {
  inquiry: "Inquiry",
  enrolled: "Enrolled",
  completed: "Completed",
};

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
  const currency = user?.currency || "USD";
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  // Filters
  const [qName, setQName] = useState("");
  const [qCollege, setQCollege] = useState("");
  const [qRef, setQRef] = useState("");

  const load = async () => {
    const [s, c] = await Promise.all([api.get("/students"), api.get("/clients")]);
    setList(s.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

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
          <p className="text-sm text-stone-600 mt-1">Recent enrollments — search by name, college, or reference.</p>
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
            <DialogTrigger asChild>
              <Button data-testid="add-student-btn" className="h-10 bg-stone-900 hover:bg-stone-800 text-stone-50 lift">
                <Plus size={16} className="mr-1.5" /> Add student
              </Button>
            </DialogTrigger>
          </div>
          <DialogContent className="bg-white max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">New student</DialogTitle>
              <DialogDescription className="text-xs text-stone-500">Enrol a student and lock in the fee structure. Schedules are generated automatically.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Student Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="st-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Course</Label><Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="B.Tech CSE" data-testid="st-course" /></div>
                <div><Label>College</Label><Input value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} placeholder="IIT Delhi" data-testid="st-college" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Reference</Label>
                  <Select
                    value={form.reference || "_none"}
                    onValueChange={(v) => setForm({ ...form, reference: v === "_none" ? "" : v })}
                  >
                    <SelectTrigger data-testid="st-reference"><SelectValue placeholder="Select referring client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>SC Out Fixed</Label><Input type="number" step="0.01" value={form.sc_out_fixed} onChange={(e) => setForm({ ...form, sc_out_fixed: e.target.value })} data-testid="st-sc" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger data-testid="st-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inquiry">Inquiry</SelectItem>
                      <SelectItem value="enrolled">Enrolled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
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
                <Button type="submit" className="bg-stone-900 hover:bg-stone-800" data-testid="st-save">Add</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="students-filters">
        <div className="relative">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            value={qName}
            onChange={(e) => setQName(e.target.value)}
            placeholder="Student name"
            className="pl-9 bg-white"
            data-testid="filter-name"
          />
        </div>
        <div className="relative">
          <Buildings size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            value={qCollege}
            onChange={(e) => setQCollege(e.target.value)}
            placeholder="College"
            className="pl-9 bg-white"
            data-testid="filter-college"
          />
        </div>
        <div className="relative">
          <UserCircle size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            value={qRef}
            onChange={(e) => setQRef(e.target.value)}
            placeholder="Reference"
            className="pl-9 bg-white"
            data-testid="filter-reference"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-stone-500 border border-stone-200 shadow-none" data-testid="empty-students">
          <StudentIcon size={32} className="mx-auto text-stone-300 mb-3" />
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
                <Card className="p-5 border border-stone-200 bg-white rounded-lg shadow-none hover:border-stone-400 hover:shadow-sm transition-all h-full flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-md bg-stone-100 text-stone-700 flex items-center justify-center font-medium shrink-0">
                        {(s.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid={`st-card-name-${s.id}`}>{s.name}</p>
                        {s.course && <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5"><GraduationCap size={12} /> {s.course}</p>}
                      </div>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${STATUS_STYLES[s.status] || "bg-stone-100 text-stone-700"}`}>
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-sm text-stone-600 flex-1">
                    <p className="flex items-center gap-2"><Buildings size={14} className="text-stone-400" /> <span className="truncate">{s.college || "—"}</span></p>
                    <p className="flex items-center gap-2"><UserCircle size={14} className="text-stone-400" /> <span className="truncate">{s.reference || "—"}</span></p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                    <span className="text-stone-500">Collected</span>
                    <span className="tabular-nums font-medium text-emerald-700">{formatMoney(s.collected_total, currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-stone-500">Balance</span>
                    <span className={`tabular-nums font-medium ${s.balance_vs_sc > 0 ? "text-rose-700" : "text-stone-700"}`}>{formatMoney(s.balance_vs_sc, currency)}</span>
                  </div>

                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-stone-700 group-hover:text-stone-900">
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
