import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, PencilSimple, Trash, Bank, Wallet, UsersThree } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "inquiry", label: "Inquiry" },
  { value: "enrolled", label: "Enrolled" },
  { value: "completed", label: "Completed" },
];

const ROUTE_LABELS = {
  college: { label: "Paid to college", icon: Bank, color: "bg-sky-50 text-sky-700" },
  cash: { label: "Cash", icon: Wallet, color: "bg-amber-50 text-amber-700" },
  sub_agent: { label: "Via Sub-agent", icon: UsersThree, color: "bg-violet-50 text-violet-700" },
};

const SUB_AGENT_LABEL = { sub_agent: "Sub Agent", associate: "Associate", km: "KM" };

const PRESET_SCHEDULE_LABELS = ["1st Payment", "2nd Payment", "3rd Payment", "4th Payment", "5th Payment"];

export default function StudentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  const [s, setS] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [editHeader, setEditHeader] = useState(false);
  const [header, setHeader] = useState({});
  const [schDlg, setSchDlg] = useState({ open: false, editing: null, form: { label: "1st Payment", amount: "", remarks: "", due_date: "" } });
  const [payDlg, setPayDlg] = useState({ open: false, editing: null, form: emptyPayment() });

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([api.get(`/students/${id}`), api.get("/accounts")]);
      setS(s.data); setAccounts(a.data);
      setHeader({
        name: s.data.name, course: s.data.course || "", college: s.data.college || "",
        reference: s.data.reference || "", sc_out_fixed: s.data.sc_out_fixed || 0,
        status: s.data.status, enrollment_date: s.data.enrollment_date || "", notes: s.data.notes || "",
      });
    } catch { toast.error("Could not load student"); nav("/students"); }
  }, [id, nav]);
  useEffect(() => { load(); }, [load]);

  if (!s) return <div className="p-8 text-sm text-stone-500" data-testid="loading">Loading…</div>;

  const saveHeader = async () => {
    try {
      const payload = { ...header, sc_out_fixed: parseFloat(header.sc_out_fixed) || 0 };
      const { data } = await api.patch(`/students/${id}`, payload);
      setS(data); setEditHeader(false); toast.success("Saved");
    } catch { toast.error("Failed"); }
  };

  const removeStudent = async () => {
    if (!confirm("Delete this student? All schedules and payments will be removed.")) return;
    await api.delete(`/students/${id}`);
    toast.success("Deleted"); nav("/students");
  };

  // ----- Schedules -----
  const openSchAdd = () => setSchDlg({ open: true, editing: null, form: { label: nextScheduleLabel(s.schedules), amount: "", remarks: "", due_date: "" } });
  const openSchEdit = (sc) => setSchDlg({ open: true, editing: sc, form: { label: sc.label, amount: sc.amount, remarks: sc.remarks || "", due_date: sc.due_date || "" } });
  const submitSch = async (e) => {
    e.preventDefault();
    const payload = { ...schDlg.form, amount: parseFloat(schDlg.form.amount) || 0, due_date: schDlg.form.due_date || null };
    try {
      const { data } = schDlg.editing
        ? await api.patch(`/students/${id}/schedules/${schDlg.editing.id}`, payload)
        : await api.post(`/students/${id}/schedules`, payload);
      setS(data); setSchDlg({ ...schDlg, open: false }); toast.success("Saved");
    } catch { toast.error("Failed"); }
  };
  const removeSch = async (sid) => {
    if (!confirm("Delete schedule?")) return;
    const { data } = await api.delete(`/students/${id}/schedules/${sid}`); setS(data);
  };

  // ----- Payments -----
  const openPayAdd = () => setPayDlg({ open: true, editing: null, form: emptyPayment() });
  const openPayEdit = (p) => setPayDlg({ open: true, editing: p, form: {
    date: p.date, amount: p.amount, route: p.route, sub_agent_type: p.sub_agent_type || "sub_agent",
    sub_agent_name: p.sub_agent_name || "", account_id: p.account_id || "", remarks: p.remarks || "",
    schedule_id: p.schedule_id || "",
  } });
  const submitPay = async (e) => {
    e.preventDefault();
    const f = payDlg.form;
    const payload = {
      date: f.date, amount: parseFloat(f.amount) || 0, route: f.route,
      sub_agent_type: f.route === "sub_agent" ? f.sub_agent_type : null,
      sub_agent_name: f.route === "sub_agent" ? (f.sub_agent_name || null) : null,
      account_id: f.account_id || null,
      remarks: f.remarks || "",
      schedule_id: f.schedule_id || null,
    };
    try {
      const { data } = payDlg.editing
        ? await api.patch(`/students/${id}/payments/${payDlg.editing.id}`, payload)
        : await api.post(`/students/${id}/payments`, payload);
      setS(data); setPayDlg({ ...payDlg, open: false }); toast.success("Saved");
    } catch { toast.error("Failed"); }
  };
  const removePay = async (pid) => {
    if (!confirm("Delete payment?")) return;
    const { data } = await api.delete(`/students/${id}/payments/${pid}`); setS(data);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="student-detail">
      {/* Back nav */}
      <Link to="/students" className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900" data-testid="back-to-list">
        <ArrowLeft size={14} /> All students
      </Link>

      {/* Header card */}
      <Card className="p-6 border border-stone-200 bg-white rounded-lg shadow-none">
        {editHeader ? (
          <div className="space-y-4" data-testid="header-edit">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={header.name} onChange={(e) => setHeader({ ...header, name: e.target.value })} /></div>
              <div><Label>Course</Label><Input value={header.course} onChange={(e) => setHeader({ ...header, course: e.target.value })} /></div>
              <div><Label>College</Label><Input value={header.college} onChange={(e) => setHeader({ ...header, college: e.target.value })} /></div>
              <div><Label>Reference</Label><Input value={header.reference} onChange={(e) => setHeader({ ...header, reference: e.target.value })} /></div>
              <div><Label>SC Out Fixed</Label><Input type="number" step="0.01" value={header.sc_out_fixed} onChange={(e) => setHeader({ ...header, sc_out_fixed: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={header.status} onValueChange={(v) => setHeader({ ...header, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Enrollment Date</Label><Input type="date" value={header.enrollment_date} onChange={(e) => setHeader({ ...header, enrollment_date: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditHeader(false)}>Cancel</Button>
              <Button onClick={saveHeader} className="bg-stone-900 hover:bg-stone-800" data-testid="header-save">Save</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1">
              <p className="label-eyebrow">Student</p>
              <h1 className="font-display text-3xl tracking-tight mt-1.5">{s.name}</h1>
              <div className="mt-2 text-sm text-stone-600 space-x-2">
                {s.course && <span>{s.course}</span>}
                {s.college && <span>· {s.college}</span>}
                {s.reference && <span>· Referred by {s.reference}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className={`uppercase tracking-wider px-2 py-0.5 rounded ${s.status === "enrolled" ? "bg-emerald-50 text-emerald-700" : s.status === "completed" ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-700"}`}>{s.status}</span>
                {s.enrollment_date && <span className="text-stone-500">Enrolled {formatDate(s.enrollment_date)}</span>}
              </div>
              {s.notes && <p className="mt-3 text-sm text-stone-600">{s.notes}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditHeader(true)} data-testid="edit-header"><PencilSimple size={14} className="mr-1.5" /> Edit</Button>
              <Button variant="outline" className="text-rose-700 hover:text-rose-800" onClick={removeStudent} data-testid="delete-student"><Trash size={14} className="mr-1.5" /> Delete</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="summary-tiles">
        <Tile label="SC Out Fixed" value={formatMoney(s.sc_out_fixed, currency)} />
        <Tile label="Scheduled total" value={formatMoney(s.scheduled_total, currency)} />
        <Tile label="Collected" value={formatMoney(s.collected_total, currency)} tone="success" />
        <Tile label="Balance vs SC" value={formatMoney(s.balance_vs_sc, currency)} tone={s.balance_vs_sc > 0 ? "danger" : "default"} />
      </div>

      {/* Schedules */}
      <Card className="border border-stone-200 bg-white rounded-lg shadow-none overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-stone-200">
          <div>
            <p className="label-eyebrow">Payment schedule</p>
            <h3 className="font-display text-lg mt-0.5">Planned installments</h3>
          </div>
          <Dialog open={schDlg.open} onOpenChange={(v) => setSchDlg({ ...schDlg, open: v })}>
            <DialogTrigger asChild>
              <Button onClick={openSchAdd} data-testid="add-schedule" className="h-9 bg-stone-900 hover:bg-stone-800 text-stone-50"><Plus size={14} className="mr-1.5" /> Add schedule</Button>
            </DialogTrigger>
            <DialogContent className="bg-white">
              <DialogHeader>
                <DialogTitle className="font-display">{schDlg.editing ? "Edit" : "Add"} schedule</DialogTitle>
                <DialogDescription className="text-xs text-stone-500">Define a planned payment installment.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submitSch} className="space-y-3">
                <div>
                  <Label>Schedule</Label>
                  <Select value={schDlg.form.label} onValueChange={(v) => setSchDlg({ ...schDlg, form: { ...schDlg.form, label: v } })}>
                    <SelectTrigger data-testid="sch-label"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRESET_SCHEDULE_LABELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      {!PRESET_SCHEDULE_LABELS.includes(schDlg.form.label) && schDlg.form.label && (
                        <SelectItem value={schDlg.form.label}>{schDlg.form.label}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Input className="mt-2" placeholder="Or type a custom label" value={schDlg.form.label} onChange={(e) => setSchDlg({ ...schDlg, form: { ...schDlg.form, label: e.target.value } })} />
                </div>
                <div><Label>Amount</Label><Input type="number" step="0.01" required value={schDlg.form.amount} onChange={(e) => setSchDlg({ ...schDlg, form: { ...schDlg.form, amount: e.target.value } })} data-testid="sch-amount" /></div>
                <div><Label>Remarks</Label><Input value={schDlg.form.remarks} onChange={(e) => setSchDlg({ ...schDlg, form: { ...schDlg.form, remarks: e.target.value } })} placeholder="e.g. Booking Amount" data-testid="sch-remarks" /></div>
                <div><Label>Due date</Label><Input type="date" value={schDlg.form.due_date} onChange={(e) => setSchDlg({ ...schDlg, form: { ...schDlg.form, due_date: e.target.value } })} /></div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setSchDlg({ ...schDlg, open: false })}>Cancel</Button>
                  <Button type="submit" className="bg-stone-900 hover:bg-stone-800" data-testid="sch-save">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {(!s.schedules || s.schedules.length === 0) ? (
          <div className="p-10 text-center text-sm text-stone-500" data-testid="empty-schedules">No schedules yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-3 label-eyebrow">Schedule</th>
                <th className="px-6 py-3 label-eyebrow text-right">Amount</th>
                <th className="px-6 py-3 label-eyebrow">Remarks</th>
                <th className="px-6 py-3 label-eyebrow">Due</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {s.schedules.map(sc => (
                <tr key={sc.id} className="hover:bg-stone-50" data-testid={`sch-row-${sc.id}`}>
                  <td className="px-6 py-3 font-medium">{sc.label}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{formatMoney(sc.amount, currency)}</td>
                  <td className="px-6 py-3 text-stone-600">{sc.remarks || "—"}</td>
                  <td className="px-6 py-3 text-stone-600">{sc.due_date ? formatDate(sc.due_date) : "—"}</td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openSchEdit(sc)} data-testid={`sch-edit-${sc.id}`} className="text-stone-500 hover:text-stone-900 p-1.5"><PencilSimple size={14} /></button>
                    <button onClick={() => removeSch(sc.id)} data-testid={`sch-del-${sc.id}`} className="text-stone-500 hover:text-rose-700 p-1.5"><Trash size={14} /></button>
                  </td>
                </tr>
              ))}
              <tr className="bg-stone-50 font-medium">
                <td className="px-6 py-3 text-stone-600 label-eyebrow">Total</td>
                <td className="px-6 py-3 text-right tabular-nums" data-testid="sch-total">{formatMoney(s.scheduled_total, currency)}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      {/* Payments */}
      <Card className="border border-stone-200 bg-white rounded-lg shadow-none overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-stone-200">
          <div>
            <p className="label-eyebrow">Payments received</p>
            <h3 className="font-display text-lg mt-0.5">Money trail</h3>
          </div>
          <Dialog open={payDlg.open} onOpenChange={(v) => setPayDlg({ ...payDlg, open: v })}>
            <DialogTrigger asChild>
              <Button onClick={openPayAdd} data-testid="add-payment" className="h-9 bg-stone-900 hover:bg-stone-800 text-stone-50"><Plus size={14} className="mr-1.5" /> Log payment</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">{payDlg.editing ? "Edit" : "Log"} payment</DialogTitle>
                <DialogDescription className="text-xs text-stone-500">Record an installment received from this student.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submitPay} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date</Label><Input type="date" required value={payDlg.form.date} onChange={(e) => setPayDlg({ ...payDlg, form: { ...payDlg.form, date: e.target.value } })} data-testid="pay-date" /></div>
                  <div><Label>Amount</Label><Input type="number" step="0.01" required value={payDlg.form.amount} onChange={(e) => setPayDlg({ ...payDlg, form: { ...payDlg.form, amount: e.target.value } })} data-testid="pay-amount" /></div>
                </div>
                <div>
                  <Label>Route</Label>
                  <Select value={payDlg.form.route} onValueChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, route: v } })}>
                    <SelectTrigger data-testid="pay-route"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="college">Paid to college</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="sub_agent">With Sub-agent / Associate / KM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {payDlg.form.route === "sub_agent" && (
                  <div className="grid grid-cols-2 gap-3" data-testid="pay-subagent-block">
                    <div>
                      <Label>Type</Label>
                      <Select value={payDlg.form.sub_agent_type} onValueChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, sub_agent_type: v } })}>
                        <SelectTrigger data-testid="pay-sub-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sub_agent">Sub Agent</SelectItem>
                          <SelectItem value="associate">Associate</SelectItem>
                          <SelectItem value="km">KM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Name</Label><Input value={payDlg.form.sub_agent_name} onChange={(e) => setPayDlg({ ...payDlg, form: { ...payDlg.form, sub_agent_name: e.target.value } })} placeholder="e.g. Rohan Mehta" data-testid="pay-sub-name" /></div>
                  </div>
                )}
                <div>
                  <Label>Account (optional)</Label>
                  <Select value={payDlg.form.account_id || "_none"} onValueChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, account_id: v === "_none" ? "" : v } })}>
                    <SelectTrigger data-testid="pay-account"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Against schedule (optional)</Label>
                  <Select value={payDlg.form.schedule_id || "_none"} onValueChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, schedule_id: v === "_none" ? "" : v } })}>
                    <SelectTrigger data-testid="pay-schedule"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {(s.schedules || []).map(sc => <SelectItem key={sc.id} value={sc.id}>{sc.label} — {formatMoney(sc.amount, currency)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Remarks</Label><Input value={payDlg.form.remarks} onChange={(e) => setPayDlg({ ...payDlg, form: { ...payDlg.form, remarks: e.target.value } })} placeholder="e.g. SC Adjusted, Booking Amount" data-testid="pay-remarks" /></div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setPayDlg({ ...payDlg, open: false })}>Cancel</Button>
                  <Button type="submit" className="bg-stone-900 hover:bg-stone-800" data-testid="pay-save">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {(!s.payments || s.payments.length === 0) ? (
          <div className="p-10 text-center text-sm text-stone-500" data-testid="empty-payments">No payments logged yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-3 label-eyebrow">Date</th>
                <th className="px-6 py-3 label-eyebrow">Route</th>
                <th className="px-6 py-3 label-eyebrow">Channel / Account</th>
                <th className="px-6 py-3 label-eyebrow text-right">Amount</th>
                <th className="px-6 py-3 label-eyebrow">Against</th>
                <th className="px-6 py-3 label-eyebrow">Remarks</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {s.payments.map(p => {
                const route = ROUTE_LABELS[p.route] || ROUTE_LABELS.cash;
                const Icon = route.icon;
                const sch = (s.schedules || []).find(x => x.id === p.schedule_id);
                const acc = accounts.find(a => a.id === p.account_id);
                return (
                  <tr key={p.id} className="hover:bg-stone-50" data-testid={`pay-row-${p.id}`}>
                    <td className="px-6 py-3 tabular-nums text-stone-600">{formatDate(p.date)}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded ${route.color}`}>
                        <Icon size={12} />
                        {route.label}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {p.route === "sub_agent" ? (
                        <span>{SUB_AGENT_LABEL[p.sub_agent_type] || "—"}{p.sub_agent_name ? ` · ${p.sub_agent_name}` : ""}</span>
                      ) : acc ? acc.name : "—"}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-medium text-emerald-700">{formatMoney(p.amount, currency)}</td>
                    <td className="px-6 py-3 text-stone-600">{sch ? sch.label : "—"}</td>
                    <td className="px-6 py-3 text-stone-600">{p.remarks || "—"}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openPayEdit(p)} data-testid={`pay-edit-${p.id}`} className="text-stone-500 hover:text-stone-900 p-1.5"><PencilSimple size={14} /></button>
                      <button onClick={() => removePay(p.id)} data-testid={`pay-del-${p.id}`} className="text-stone-500 hover:text-rose-700 p-1.5"><Trash size={14} /></button>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-stone-50 font-medium">
                <td colSpan={3} className="px-6 py-3 text-stone-600 label-eyebrow">Total collected</td>
                <td className="px-6 py-3 text-right tabular-nums text-emerald-700" data-testid="pay-total">{formatMoney(s.collected_total, currency)}</td>
                <td colSpan={3}></td>
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
      <p className={`font-display text-2xl mt-2 tabular-nums ${tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-rose-700" : "text-stone-900"}`}>{value}</p>
    </Card>
  );
}

function nextScheduleLabel(schedules) {
  const used = new Set((schedules || []).map(s => s.label));
  for (const l of PRESET_SCHEDULE_LABELS) {
    if (!used.has(l)) return l;
  }
  return `${(schedules?.length || 0) + 1}th Payment`;
}

function emptyPayment() {
  return {
    date: todayISO(), amount: "", route: "college",
    sub_agent_type: "sub_agent", sub_agent_name: "",
    account_id: "", remarks: "", schedule_id: "",
  };
}
