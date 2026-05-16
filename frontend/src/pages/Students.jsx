import React, { useEffect, useState } from "react";
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
import { Plus, ArrowRight, Student as StudentIcon, FileXls } from "@phosphor-icons/react";
import { toast } from "sonner";
import { downloadStudentsXlsx } from "@/lib/studentExports";
import FeesPlanFields, { emptyFeesPlan, normalizeFeesPlanForApi } from "@/components/FeesPlanFields";

const STATUS_STYLES = {
  inquiry: "bg-stone-100 text-stone-700",
  enrolled: "bg-emerald-50 text-emerald-700",
  completed: "bg-sky-50 text-sky-700",
};

const emptyForm = () => ({
  name: "", course: "", college: "", reference: "",
  sc_out_fixed: 0, status: "inquiry", enrollment_date: "", notes: "",
  fees_plan: emptyFeesPlan(),
});

export default function Students() {
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = async () => {
    const [s, c] = await Promise.all([api.get("/students"), api.get("/clients")]);
    setList(s.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

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
          <p className="text-sm text-stone-600 mt-1">Track fees collection, schedules, and payment routes per student.</p>
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

      <Card className="border border-stone-200 bg-white rounded-lg shadow-none overflow-hidden">
        {list.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-500" data-testid="empty-students">
            <StudentIcon size={32} className="mx-auto text-stone-300 mb-3" />
            No students yet. Add one to start tracking fees.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-stone-50 border-b border-stone-200">
                  <th className="px-6 py-3 label-eyebrow">Student</th>
                  <th className="px-6 py-3 label-eyebrow">College · Course</th>
                  <th className="px-6 py-3 label-eyebrow">Reference</th>
                  <th className="px-6 py-3 label-eyebrow">Status</th>
                  <th className="px-6 py-3 label-eyebrow text-right">SC Fixed</th>
                  <th className="px-6 py-3 label-eyebrow text-right">Collected</th>
                  <th className="px-6 py-3 label-eyebrow text-right">Balance</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {list.map(s => (
                  <tr key={s.id} className="hover:bg-stone-50" data-testid={`st-row-${s.id}`}>
                    <td className="px-6 py-3.5 font-medium">{s.name}</td>
                    <td className="px-6 py-3.5 text-stone-600">
                      <div>{s.college || "—"}</div>
                      <div className="text-xs text-stone-500">{s.course || ""}</div>
                    </td>
                    <td className="px-6 py-3.5 text-stone-600">{s.reference || "—"}</td>
                    <td className="px-6 py-3.5">
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-nums">{formatMoney(s.sc_out_fixed, currency)}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-emerald-700">{formatMoney(s.collected_total, currency)}</td>
                    <td className={`px-6 py-3.5 text-right tabular-nums font-medium ${s.balance_vs_sc > 0 ? "text-rose-700" : "text-stone-700"}`}>{formatMoney(s.balance_vs_sc, currency)}</td>
                    <td className="px-6 py-3.5 text-right">
                      <Link to={`/students/${s.id}`} data-testid={`st-open-${s.id}`} className="inline-flex items-center gap-1 text-stone-700 hover:text-stone-900 text-xs">
                        Open <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
