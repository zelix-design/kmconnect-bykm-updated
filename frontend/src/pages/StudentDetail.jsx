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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, PencilSimple, Trash, Bank, Wallet, UsersThree, CaretDown, CaretUp, Briefcase, IdentificationBadge, X, FilePdf } from "@phosphor-icons/react";
import { toast } from "sonner";
import { downloadStudentPdf } from "@/lib/studentExports";
import FeesPlanFields, { emptyFeesPlan, feesPlanFromApi, normalizeFeesPlanForApi } from "@/components/FeesPlanFields";

const STATUS_OPTIONS = [
  { value: "inquiry", label: "Inquiry" },
  { value: "enrolled", label: "Enrolled" },
  { value: "cancelled", label: "Cancelled" },
];

const RECEIVED_IN = {
  college: { label: "College Acc.", icon: Bank, color: "bg-sky-100/60 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  cash: { label: "Cash", icon: Wallet, color: "bg-amber-100/60 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  bank: { label: "Bank Acc.", icon: Bank, color: "bg-muted text-foreground" },
  sub_agent: { label: "Sub Agent Acc.", icon: UsersThree, color: "bg-violet-100/60 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  associate: { label: "Associate Acc.", icon: Briefcase, color: "bg-amber-100/60 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  km: { label: "KM Acc.", icon: IdentificationBadge, color: "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

const FEE_TYPE_LABELS = {
  booking_admission: "Booking / Admission Fees",
  tution: "Tution Fees",
  other: "Other Fees",
};

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

const SUB_AGENT_TYPES = [
  { value: "sub_agent", label: "Sub Agent" },
  { value: "associate", label: "Associate" },
  { value: "km", label: "KM" },
];

const PRESET_SCHEDULE_LABELS = ["1st Payment", "2nd Payment", "3rd Payment", "4th Payment", "5th Payment"];

export default function StudentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  const [s, setS] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [clients, setClients] = useState([]);
  const [editHeader, setEditHeader] = useState(false);
  const [header, setHeader] = useState({});
  const [schDlg, setSchDlg] = useState({ open: false, editing: null, form: { label: "1st Payment", amount: "", remarks: "", due_date: "" } });
  const [payDlg, setPayDlg] = useState({ open: false, editing: null, form: emptyPayment() });
  const [entryDlg, setEntryDlg] = useState({ open: false, form: emptyEntry() });
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    try {
      const [sr, a, c] = await Promise.all([
        api.get(`/students/${id}`),
        api.get("/accounts"),
        api.get("/clients"),
      ]);
      setS(sr.data); setAccounts(a.data); setClients(c.data);
      setHeader({
        name: sr.data.name, course: sr.data.course || "", college: sr.data.college || "",
        reference: sr.data.reference || "", sc_out_fixed: sr.data.sc_out_fixed || 0,
        status: sr.data.status, enrollment_date: sr.data.enrollment_date || "", notes: sr.data.notes || "",
        fees_plan: feesPlanFromApi(sr.data.fees_plan),
      });
    } catch { toast.error("Could not load student"); nav("/students"); }
  }, [id, nav]);
  useEffect(() => { load(); }, [load]);

  if (!s) return <div className="p-8 text-sm text-muted-foreground" data-testid="loading">Loading…</div>;

  const saveHeader = async () => {
    try {
      const payload = {
        ...header,
        sc_out_fixed: parseFloat(header.sc_out_fixed) || 0,
        fees_plan: normalizeFeesPlanForApi(header.fees_plan),
      };
      const { data } = await api.patch(`/students/${id}`, payload);
      setS(data); setEditHeader(false); toast.success("Saved");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
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
  const openPayEdit = (p) => setPayDlg({
    open: true, editing: p,
    form: {
      date: p.date, amount: String(p.amount), fee_type: p.fee_type || "other",
      received_in: {
        type: p.received_in?.type || "college",
        name: p.received_in?.name || "",
        account_id: p.received_in?.account_id || "",
      },
      has_adjustment: !!p.has_adjustment,
      adjustments: (p.adjustments || []).map(a => ({ ...a, amount: String(a.amount) })),
      schedule_id: p.schedule_id || "",
      remarks: p.remarks || "",
    }
  });

  const submitPay = async (e) => {
    e.preventDefault();
    const f = payDlg.form;
    const payload = {
      date: f.date,
      amount: parseFloat(f.amount) || 0,
      fee_type: f.fee_type,
      received_in: {
        type: f.received_in.type,
        name: f.received_in.name || null,
        account_id: f.received_in.account_id || null,
      },
      has_adjustment: !!f.has_adjustment,
      adjustments: f.has_adjustment ? f.adjustments.map(a => ({
        kind: a.kind,
        amount: parseFloat(a.amount) || 0,
        payment_date: a.payment_date,
        payment_mode: a.payment_mode,
        sub_agent_type: a.kind === "sc_adjusted" ? (a.sub_agent_type || null) : null,
        sub_agent_name: a.kind === "sc_adjusted" ? (a.sub_agent_name || null) : null,
        remarks: a.remarks || "",
      })) : [],
      schedule_id: f.schedule_id || null,
      remarks: f.remarks || "",
    };
    try {
      const { data } = payDlg.editing
        ? await api.patch(`/students/${id}/payments/${payDlg.editing.id}`, payload)
        : await api.post(`/students/${id}/payments`, payload);
      setS(data); setPayDlg({ ...payDlg, open: false }); toast.success("Saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };
  const removePay = async (pid) => {
    if (!confirm("Delete payment?")) return;
    const { data } = await api.delete(`/students/${id}/payments/${pid}`); setS(data);
  };

  const updateAdj = (idx, k, v) => {
    const adjs = payDlg.form.adjustments.slice();
    adjs[idx] = { ...adjs[idx], [k]: v };
    setPayDlg({ ...payDlg, form: { ...payDlg.form, adjustments: adjs } });
  };
  const addAdj = () => setPayDlg({
    ...payDlg,
    form: {
      ...payDlg.form,
      adjustments: [...payDlg.form.adjustments, {
        kind: "paid_to_college", amount: "", payment_date: payDlg.form.date,
        payment_mode: "bank_transfer", sub_agent_type: "sub_agent", sub_agent_name: "", remarks: "",
      }],
    },
  });
  const removeAdj = (idx) => setPayDlg({
    ...payDlg,
    form: { ...payDlg.form, adjustments: payDlg.form.adjustments.filter((_, i) => i !== idx) },
  });

  const fAdjTotal = payDlg.form.adjustments.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const fAmount = parseFloat(payDlg.form.amount) || 0;
  const adjBalance = fAmount - fAdjTotal;

  // ----- Combined Add Entry -----
  const openEntryAdd = () => {
    const defaultLabel = nextScheduleLabel(s.schedules);
    setEntryDlg({
      open: true,
      form: {
        ...emptyEntry(),
        schedule: { ...emptyEntry().schedule, label: defaultLabel },
      },
    });
  };
  const updateEntry = (patch) => setEntryDlg({ ...entryDlg, form: { ...entryDlg.form, ...patch } });
  const updateEntrySch = (patch) => updateEntry({ schedule: { ...entryDlg.form.schedule, ...patch } });
  const updateEntryPay = (patch) => updateEntry({ payment: { ...entryDlg.form.payment, ...patch } });
  const updateEntryPayRecv = (patch) => updateEntryPay({ received_in: { ...entryDlg.form.payment.received_in, ...patch } });

  const submitEntry = async (e) => {
    e.preventDefault();
    const f = entryDlg.form;
    if (!f.create_schedule && !f.log_payment) {
      toast.error("Select at least one of Schedule or Payment");
      return;
    }
    try {
      let scheduleId = f.existing_schedule_id || null;
      let updated = s;
      // 1) Create schedule first
      if (f.create_schedule) {
        const schPayload = {
          label: f.schedule.label,
          amount: parseFloat(f.schedule.amount) || 0,
          remarks: f.schedule.remarks || "",
          due_date: f.schedule.due_date || null,
        };
        const { data } = await api.post(`/students/${id}/schedules`, schPayload);
        updated = data;
        const created = (data.schedules || []).find((x) =>
          x.label === schPayload.label && x.amount === schPayload.amount
        );
        scheduleId = created?.id || null;
      }
      // 2) Log payment
      if (f.log_payment) {
        const pf = f.payment;
        const payPayload = {
          date: pf.date,
          amount: parseFloat(pf.amount) || (f.create_schedule ? (parseFloat(f.schedule.amount) || 0) : 0),
          fee_type: pf.fee_type,
          received_in: {
            type: pf.received_in.type,
            name: pf.received_in.name || null,
            account_id: pf.received_in.account_id || null,
          },
          has_adjustment: !!pf.has_adjustment,
          adjustments: pf.has_adjustment ? pf.adjustments.map((a) => ({
            kind: a.kind,
            amount: parseFloat(a.amount) || 0,
            payment_date: a.payment_date,
            payment_mode: a.payment_mode,
            sub_agent_type: a.kind === "sc_adjusted" ? (a.sub_agent_type || null) : null,
            sub_agent_name: a.kind === "sc_adjusted" ? (a.sub_agent_name || null) : null,
            remarks: a.remarks || "",
          })) : [],
          schedule_id: scheduleId,
          remarks: pf.remarks || "",
        };
        const { data } = await api.post(`/students/${id}/payments`, payPayload);
        updated = data;
      }
      setS(updated);
      setEntryDlg({ open: false, form: emptyEntry() });
      toast.success("Entry saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const updateEntryAdj = (idx, k, v) => {
    const adjs = entryDlg.form.payment.adjustments.slice();
    adjs[idx] = { ...adjs[idx], [k]: v };
    updateEntryPay({ adjustments: adjs });
  };
  const addEntryAdj = () => updateEntryPay({
    adjustments: [...entryDlg.form.payment.adjustments, {
      kind: "paid_to_college", amount: "", payment_date: entryDlg.form.payment.date,
      payment_mode: "bank_transfer", sub_agent_type: "sub_agent", sub_agent_name: "", remarks: "",
    }],
  });
  const removeEntryAdj = (idx) => updateEntryPay({
    adjustments: entryDlg.form.payment.adjustments.filter((_, i) => i !== idx),
  });

  const eAmount = parseFloat(entryDlg.form.payment.amount) || (entryDlg.form.create_schedule ? (parseFloat(entryDlg.form.schedule.amount) || 0) : 0);
  const eAdjTotal = entryDlg.form.payment.adjustments.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const eAdjBalance = eAmount - eAdjTotal;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="student-detail">
      <Link to="/students" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-list">
        <ArrowLeft size={14} /> All students
      </Link>

      {/* Header card */}
      <Card className="p-6 border border-border bg-card rounded-lg shadow-none">
        {editHeader ? (
          <div className="space-y-4" data-testid="header-edit">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={header.name} onChange={(e) => setHeader({ ...header, name: e.target.value })} /></div>
              <div><Label>Course</Label><Input value={header.course} onChange={(e) => setHeader({ ...header, course: e.target.value })} /></div>
              <div><Label>College</Label><Input value={header.college} onChange={(e) => setHeader({ ...header, college: e.target.value })} /></div>
              <div>
                <Label>Reference</Label>
                <Select
                  value={header.reference || "_none"}
                  onValueChange={(v) => setHeader({ ...header, reference: v === "_none" ? "" : v })}
                >
                  <SelectTrigger data-testid="hdr-reference"><SelectValue placeholder="Select referring client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                    {header.reference && !clients.some((c) => c.name === header.reference) && (
                      <SelectItem value={header.reference}>{header.reference} (legacy)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>SC Earned</Label><Input type="number" step="0.01" value={header.sc_out_fixed} onChange={(e) => setHeader({ ...header, sc_out_fixed: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={header.status} onValueChange={(v) => setHeader({ ...header, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Enrollment Date</Label><Input type="date" value={header.enrollment_date} onChange={(e) => setHeader({ ...header, enrollment_date: e.target.value })} /></div>
            </div>
            <FeesPlanFields
              fp={header.fees_plan || emptyFeesPlan()}
              onChange={(next) => setHeader({ ...header, fees_plan: next })}
              currency={currency}
            />
            <div><Label>Notes</Label><Textarea rows={2} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditHeader(false)}>Cancel</Button>
              <Button onClick={saveHeader} className="btn-amber border-0" data-testid="header-save">Save</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1">
              <p className="label-eyebrow">Student</p>
              <h1 className="font-display text-3xl tracking-tight mt-1.5">{s.name}</h1>
              <div className="mt-2 text-sm text-muted-foreground space-x-2">
                {s.course && <span>{s.course}</span>}
                {s.college && <span>· {s.college}</span>}
                {s.reference && <span>· Referred by {s.reference}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className={`uppercase tracking-wider px-2 py-0.5 rounded ${s.status === "enrolled" ? "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : s.status === "cancelled" ? "bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400" : s.status === "completed" ? "bg-sky-100/60 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400" : "bg-muted text-foreground"}`}>{s.status}</span>
                {s.enrollment_date && <span className="text-muted-foreground">Enrolled {formatDate(s.enrollment_date)}</span>}
              </div>
              {s.notes && <p className="mt-3 text-sm text-muted-foreground">{s.notes}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={openEntryAdd}
                className="btn-amber border-0"
                data-testid="add-entry-btn"
              >
                <Plus size={14} className="mr-1.5" /> Add entry
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    downloadStudentPdf({ student: s, user });
                    toast.success("PDF generated");
                  } catch (err) {
                    console.error(err);
                    toast.error("Export failed");
                  }
                }}
                data-testid="export-student-pdf"
              >
                <FilePdf size={14} className="mr-1.5" /> PDF
              </Button>
              <Button variant="outline" onClick={() => setEditHeader(true)} data-testid="edit-header"><PencilSimple size={14} className="mr-1.5" /> Edit</Button>
              <Button variant="outline" className="text-rose-700 dark:text-rose-400 hover:text-rose-800" onClick={removeStudent} data-testid="delete-student"><Trash size={14} className="mr-1.5" /> Delete</Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="summary-tiles">
        <Tile label="SC Earned" value={formatMoney(s.sc_out_fixed, currency)} />
        <Tile label="Scheduled total" value={formatMoney(s.scheduled_total, currency)} />
        <Tile label="Collected" value={formatMoney(s.collected_total, currency)} tone="success" />
        <Tile label="Balance vs SC Earned" value={formatMoney(s.balance_vs_sc, currency)} tone={s.balance_vs_sc > 0 ? "danger" : "default"} />
      </div>

      {/* Schedules */}
      <Card className="border border-border bg-card rounded-lg shadow-none overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <div>
            <p className="label-eyebrow">Payment schedule</p>
            <h3 className="font-display text-lg mt-0.5">Planned installments</h3>
          </div>
          <Dialog open={schDlg.open} onOpenChange={(v) => setSchDlg({ ...schDlg, open: v })}>
            <DialogContent className="bg-card">
              <DialogHeader>
                <DialogTitle className="font-display">{schDlg.editing ? "Edit" : "Add"} schedule</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">Define a planned payment installment.</DialogDescription>
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
                  <Button type="submit" className="btn-amber border-0" data-testid="sch-save">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {(!s.schedules || s.schedules.length === 0) ? (
          <div className="p-10 text-center text-sm text-muted-foreground" data-testid="empty-schedules">No schedules yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-muted/40 border-b border-border">
                <th className="px-6 py-3 label-eyebrow">Schedule</th>
                <th className="px-6 py-3 label-eyebrow text-right">Amount</th>
                <th className="px-6 py-3 label-eyebrow">Remarks</th>
                <th className="px-6 py-3 label-eyebrow">Due</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.schedules.map(sc => (
                <tr key={sc.id} className="hover:bg-muted/40" data-testid={`sch-row-${sc.id}`}>
                  <td className="px-6 py-3 font-medium">{sc.label}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{formatMoney(sc.amount, currency)}</td>
                  <td className="px-6 py-3 text-muted-foreground">{sc.remarks || "—"}</td>
                  <td className="px-6 py-3 text-muted-foreground">{sc.due_date ? formatDate(sc.due_date) : "—"}</td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openSchEdit(sc)} data-testid={`sch-edit-${sc.id}`} className="text-muted-foreground hover:text-foreground p-1.5"><PencilSimple size={14} /></button>
                    <button onClick={() => removeSch(sc.id)} data-testid={`sch-del-${sc.id}`} className="text-muted-foreground hover:text-rose-700 dark:text-rose-400 p-1.5"><Trash size={14} /></button>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td className="px-6 py-3 text-muted-foreground label-eyebrow">Total</td>
                <td className="px-6 py-3 text-right tabular-nums" data-testid="sch-total">{formatMoney(s.scheduled_total, currency)}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      {/* Payments */}
      <Card className="border border-border bg-card rounded-lg shadow-none overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <div>
            <p className="label-eyebrow">Payments received</p>
            <h3 className="font-display text-lg mt-0.5">Money trail</h3>
          </div>
          <Dialog open={payDlg.open} onOpenChange={(v) => setPayDlg({ ...payDlg, open: v })}>
            <DialogContent className="bg-card max-w-2xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">{payDlg.editing ? "Edit" : "Log"} payment</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">Record an installment received from this student.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submitPay} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date credited</Label><Input type="date" required value={payDlg.form.date} onChange={(e) => setPayDlg({ ...payDlg, form: { ...payDlg.form, date: e.target.value } })} data-testid="pay-date" /></div>
                  <div>
                    <Label>Against schedule</Label>
                    <Select value={payDlg.form.schedule_id || "_none"} onValueChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, schedule_id: v === "_none" ? "" : v } })}>
                      <SelectTrigger data-testid="pay-schedule"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {(s.schedules || []).map(sc => <SelectItem key={sc.id} value={sc.id}>{sc.label} — {formatMoney(sc.amount, currency)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Fee type</Label>
                    <Select value={payDlg.form.fee_type} onValueChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, fee_type: v } })}>
                      <SelectTrigger data-testid="pay-fee-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="booking_admission">Booking / Admission Fees</SelectItem>
                        <SelectItem value="tution">Tution Fees</SelectItem>
                        <SelectItem value="other">Other Fees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Amount</Label><Input type="number" step="0.01" required value={payDlg.form.amount} onChange={(e) => setPayDlg({ ...payDlg, form: { ...payDlg.form, amount: e.target.value } })} data-testid="pay-amount" /></div>
                </div>

                <div className="rounded-md border border-border p-4 space-y-3" data-testid="received-in-block">
                  <Label>Received in</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={payDlg.form.received_in.type} onValueChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, received_in: { ...payDlg.form.received_in, type: v } } })}>
                      <SelectTrigger data-testid="pay-recv-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="college">College Acc.</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank Acc.</SelectItem>
                        <SelectItem value="km">KM Acc.</SelectItem>
                        <SelectItem value="sub_agent">Sub Agent Acc.</SelectItem>
                        <SelectItem value="associate">Associate Acc.</SelectItem>
                      </SelectContent>
                    </Select>
                    {(["sub_agent", "associate", "km"].includes(payDlg.form.received_in.type)) && (
                      <Input
                        value={payDlg.form.received_in.name}
                        onChange={(e) => setPayDlg({ ...payDlg, form: { ...payDlg.form, received_in: { ...payDlg.form.received_in, name: e.target.value } } })}
                        placeholder="Name (e.g. Rohan Mehta)"
                        data-testid="pay-recv-name"
                      />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Internal account (optional — enables auto-logging as income transaction)</Label>
                    <Select value={payDlg.form.received_in.account_id || "_none"} onValueChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, received_in: { ...payDlg.form.received_in, account_id: v === "_none" ? "" : v } } })}>
                      <SelectTrigger className="h-9" data-testid="pay-recv-account"><SelectValue placeholder="No internal account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No auto-log</SelectItem>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-md border border-border p-4 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={!!payDlg.form.has_adjustment}
                      onCheckedChange={(v) => setPayDlg({ ...payDlg, form: { ...payDlg.form, has_adjustment: !!v, adjustments: v && payDlg.form.adjustments.length === 0 ? [{ kind: "paid_to_college", amount: "", payment_date: payDlg.form.date, payment_mode: "bank_transfer", sub_agent_type: "sub_agent", sub_agent_name: "", remarks: "" }] : payDlg.form.adjustments } })}
                      data-testid="pay-has-adjustment"
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">This payment has an adjustment</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Split the amount across "Paid to College" and "SC Adjusted with Sub/KM" (specify type).</p>
                    </div>
                  </label>

                  {payDlg.form.has_adjustment && (
                    <div className="space-y-3 pt-2 border-t border-border" data-testid="adjustments-block">
                      {payDlg.form.adjustments.map((adj, idx) => (
                        <div key={idx} className="rounded-md bg-muted/40 p-3 space-y-2" data-testid={`adj-row-${idx}`}>
                          <div className="grid grid-cols-12 gap-2 items-start">
                            <Select value={adj.kind} onValueChange={(v) => updateAdj(idx, "kind", v)}>
                              <SelectTrigger className="col-span-5" data-testid={`adj-kind-${idx}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="paid_to_college">Paid to College</SelectItem>
                                <SelectItem value="sc_adjusted">SC Adjusted (with Sub / Associate / KM)</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input className="col-span-6" type="number" step="0.01" placeholder="Amount" value={adj.amount} onChange={(e) => updateAdj(idx, "amount", e.target.value)} data-testid={`adj-amount-${idx}`} />
                            <button type="button" onClick={() => removeAdj(idx)} className="col-span-1 h-10 flex items-center justify-center text-muted-foreground/70 hover:text-rose-700 dark:text-rose-400" data-testid={`adj-remove-${idx}`}><X size={14} /></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input type="date" value={adj.payment_date} onChange={(e) => updateAdj(idx, "payment_date", e.target.value)} data-testid={`adj-date-${idx}`} />
                            <Select value={adj.payment_mode} onValueChange={(v) => updateAdj(idx, "payment_mode", v)}>
                              <SelectTrigger data-testid={`adj-mode-${idx}`}><SelectValue /></SelectTrigger>
                              <SelectContent>{PAYMENT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          {adj.kind === "sc_adjusted" && (
                            <div className="grid grid-cols-2 gap-2" data-testid={`adj-sub-${idx}`}>
                              <Select value={adj.sub_agent_type} onValueChange={(v) => updateAdj(idx, "sub_agent_type", v)}>
                                <SelectTrigger data-testid={`adj-sub-type-${idx}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{SUB_AGENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                              </Select>
                              <Input value={adj.sub_agent_name} onChange={(e) => updateAdj(idx, "sub_agent_name", e.target.value)} placeholder="Name" data-testid={`adj-sub-name-${idx}`} />
                            </div>
                          )}
                          <Input value={adj.remarks} onChange={(e) => updateAdj(idx, "remarks", e.target.value)} placeholder="Remarks" data-testid={`adj-remarks-${idx}`} />
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <Button type="button" size="sm" variant="outline" onClick={addAdj} data-testid="adj-add"><Plus size={14} className="mr-1" /> Add adjustment row</Button>
                        <span className={`text-xs tabular-nums ${Math.abs(adjBalance) < 0.01 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`} data-testid="adj-balance">
                          Adjustments {formatMoney(fAdjTotal, currency)} of {formatMoney(fAmount, currency)} · Δ {formatMoney(adjBalance, currency)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div><Label>Remarks</Label><Input value={payDlg.form.remarks} onChange={(e) => setPayDlg({ ...payDlg, form: { ...payDlg.form, remarks: e.target.value } })} placeholder="e.g. Booking Amount" data-testid="pay-remarks" /></div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setPayDlg({ ...payDlg, open: false })}>Cancel</Button>
                  <Button type="submit" className="btn-amber border-0" data-testid="pay-save">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {(!s.payments || s.payments.length === 0) ? (
          <div className="p-10 text-center text-sm text-muted-foreground" data-testid="empty-payments">No payments logged yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-muted/40 border-b border-border">
                <th className="px-6 py-3 label-eyebrow w-8"></th>
                <th className="px-6 py-3 label-eyebrow">Date credited</th>
                <th className="px-6 py-3 label-eyebrow">Schedule / Fee</th>
                <th className="px-6 py-3 label-eyebrow">Received in</th>
                <th className="px-6 py-3 label-eyebrow text-right">Amount</th>
                <th className="px-6 py-3 label-eyebrow">Remarks</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.payments.map(p => {
                const ri = RECEIVED_IN[p.received_in?.type] || RECEIVED_IN.cash;
                const Icon = ri.icon;
                const sch = (s.schedules || []).find(x => x.id === p.schedule_id);
                const isExp = !!expanded[p.id];
                const hasAdj = p.has_adjustment && (p.adjustments || []).length > 0;
                return (
                  <React.Fragment key={p.id}>
                    <tr className="hover:bg-muted/40" data-testid={`pay-row-${p.id}`}>
                      <td className="px-6 py-3">
                        {hasAdj && (
                          <button onClick={() => setExpanded({ ...expanded, [p.id]: !isExp })} className="text-muted-foreground/70 hover:text-foreground" data-testid={`pay-expand-${p.id}`}>
                            {isExp ? <CaretUp size={14} /> : <CaretDown size={14} />}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-3 tabular-nums text-muted-foreground">{formatDate(p.date)}</td>
                      <td className="px-6 py-3">
                        <div className="font-medium">{sch ? sch.label : "Unscheduled"}</div>
                        <div className="text-xs text-muted-foreground">{FEE_TYPE_LABELS[p.fee_type] || "Other Fees"}</div>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded ${ri.color}`}>
                          <Icon size={12} /> {ri.label}
                        </span>
                        {p.received_in?.name && <div className="text-xs text-muted-foreground mt-1">{p.received_in.name}</div>}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{formatMoney(p.amount, currency)}</td>
                      <td className="px-6 py-3 text-muted-foreground">{p.remarks || "—"}</td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <button onClick={() => openPayEdit(p)} data-testid={`pay-edit-${p.id}`} className="text-muted-foreground hover:text-foreground p-1.5"><PencilSimple size={14} /></button>
                        <button onClick={() => removePay(p.id)} data-testid={`pay-del-${p.id}`} className="text-muted-foreground hover:text-rose-700 dark:text-rose-400 p-1.5"><Trash size={14} /></button>
                      </td>
                    </tr>
                    {hasAdj && isExp && (
                      <tr className="bg-muted/40">
                        <td colSpan={7} className="px-6 py-3">
                          <p className="label-eyebrow mb-2">Adjustments</p>
                          <div className="space-y-1.5">
                            {p.adjustments.map((a, idx) => (
                              <div key={a.id || idx} className="flex items-center gap-2 text-xs text-foreground">
                                <span className={`px-1.5 py-0.5 rounded ${a.kind === "paid_to_college" ? "bg-sky-100 text-sky-700 dark:text-sky-400" : "bg-emerald-100 text-emerald-700 dark:text-emerald-400"}`}>
                                  {a.kind === "paid_to_college" ? "Paid to College" : "SC Adjusted"}
                                </span>
                                <span className="tabular-nums font-medium">{formatMoney(a.amount, currency)}</span>
                                <span className="text-muted-foreground">on {formatDate(a.payment_date)} · {PAYMENT_MODES.find(m => m.value === a.payment_mode)?.label}</span>
                                {a.kind === "sc_adjusted" && a.sub_agent_name && (
                                  <span className="text-muted-foreground">· with {SUB_AGENT_TYPES.find(t => t.value === a.sub_agent_type)?.label} {a.sub_agent_name}</span>
                                )}
                                {a.remarks && <span className="text-muted-foreground">· {a.remarks}</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              <tr className="bg-muted/40 font-medium">
                <td colSpan={4} className="px-6 py-3 text-muted-foreground label-eyebrow">Total collected</td>
                <td className="px-6 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400" data-testid="pay-total">{formatMoney(s.collected_total, currency)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      {/* Combined Add entry dialog */}
      <Dialog open={entryDlg.open} onOpenChange={(v) => setEntryDlg({ ...entryDlg, open: v })}>
        <DialogContent className="bg-card max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="entry-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Add entry</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Add a planned schedule and / or record a payment received — both in one step.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEntry} className="space-y-5">
            {/* Schedule section */}
            <div className="rounded-md border border-border p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!entryDlg.form.create_schedule}
                  onCheckedChange={(v) => updateEntry({ create_schedule: !!v, existing_schedule_id: v ? "" : entryDlg.form.existing_schedule_id })}
                  data-testid="entry-create-schedule"
                />
                <span className="text-sm font-medium">Create a new schedule row</span>
              </label>

              {entryDlg.form.create_schedule ? (
                <div className="space-y-3 pt-1">
                  <div>
                    <Label>Schedule</Label>
                    <Select value={entryDlg.form.schedule.label} onValueChange={(v) => updateEntrySch({ label: v })}>
                      <SelectTrigger data-testid="entry-sch-label"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRESET_SCHEDULE_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                        {!PRESET_SCHEDULE_LABELS.includes(entryDlg.form.schedule.label) && entryDlg.form.schedule.label && (
                          <SelectItem value={entryDlg.form.schedule.label}>{entryDlg.form.schedule.label}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <Input className="mt-2" placeholder="Or type a custom label" value={entryDlg.form.schedule.label} onChange={(e) => updateEntrySch({ label: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount</Label><Input type="number" step="0.01" required value={entryDlg.form.schedule.amount} onChange={(e) => updateEntrySch({ amount: e.target.value })} data-testid="entry-sch-amount" /></div>
                    <div><Label>Due date</Label><Input type="date" value={entryDlg.form.schedule.due_date} onChange={(e) => updateEntrySch({ due_date: e.target.value })} /></div>
                  </div>
                  <div><Label>Remarks</Label><Input value={entryDlg.form.schedule.remarks} onChange={(e) => updateEntrySch({ remarks: e.target.value })} placeholder="e.g. Booking Amount paid towards Tution Fees" /></div>
                </div>
              ) : (
                <div>
                  <Label>Pick an existing schedule</Label>
                  <Select
                    value={entryDlg.form.existing_schedule_id || "_none"}
                    onValueChange={(v) => updateEntry({ existing_schedule_id: v === "_none" ? "" : v })}
                  >
                    <SelectTrigger data-testid="entry-existing-schedule"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {(s.schedules || []).map((sc) => (
                        <SelectItem key={sc.id} value={sc.id}>{sc.label} — {formatMoney(sc.amount, currency)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Payment section */}
            <div className="rounded-md border border-border p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!entryDlg.form.log_payment}
                  onCheckedChange={(v) => updateEntry({ log_payment: !!v })}
                  data-testid="entry-log-payment"
                />
                <span className="text-sm font-medium">Also log a payment now</span>
              </label>

              {entryDlg.form.log_payment && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Date credited</Label><Input type="date" required value={entryDlg.form.payment.date} onChange={(e) => updateEntryPay({ date: e.target.value })} data-testid="entry-pay-date" /></div>
                    <div>
                      <Label>Fee type</Label>
                      <Select value={entryDlg.form.payment.fee_type} onValueChange={(v) => updateEntryPay({ fee_type: v })}>
                        <SelectTrigger data-testid="entry-pay-fee-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="booking_admission">Booking / Admission Fees</SelectItem>
                          <SelectItem value="tution">Tution Fees</SelectItem>
                          <SelectItem value="other">Other Fees</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Amount</Label>
                    <Input
                      type="number" step="0.01"
                      placeholder={entryDlg.form.create_schedule ? `Default: ${entryDlg.form.schedule.amount || "0"}` : "0.00"}
                      value={entryDlg.form.payment.amount}
                      onChange={(e) => updateEntryPay({ amount: e.target.value })}
                      data-testid="entry-pay-amount"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave blank to use the schedule amount.</p>
                  </div>
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <Label>Received in</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={entryDlg.form.payment.received_in.type} onValueChange={(v) => updateEntryPayRecv({ type: v })}>
                        <SelectTrigger data-testid="entry-pay-recv-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="college">College Acc.</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="bank">Bank Acc.</SelectItem>
                          <SelectItem value="km">KM Acc.</SelectItem>
                          <SelectItem value="sub_agent">Sub Agent Acc.</SelectItem>
                          <SelectItem value="associate">Associate Acc.</SelectItem>
                        </SelectContent>
                      </Select>
                      {(["sub_agent", "associate", "km"].includes(entryDlg.form.payment.received_in.type)) && (
                        <Input
                          value={entryDlg.form.payment.received_in.name}
                          onChange={(e) => updateEntryPayRecv({ name: e.target.value })}
                          placeholder="Name (e.g. Rohan Mehta)"
                          data-testid="entry-pay-recv-name"
                        />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Internal account (auto-log to income)</Label>
                      <Select value={entryDlg.form.payment.received_in.account_id || "_none"} onValueChange={(v) => updateEntryPayRecv({ account_id: v === "_none" ? "" : v })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="No internal account" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">No auto-log</SelectItem>
                          {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={!!entryDlg.form.payment.has_adjustment}
                        onCheckedChange={(v) => updateEntryPay({
                          has_adjustment: !!v,
                          adjustments: v && entryDlg.form.payment.adjustments.length === 0
                            ? [{ kind: "paid_to_college", amount: "", payment_date: entryDlg.form.payment.date, payment_mode: "bank_transfer", sub_agent_type: "sub_agent", sub_agent_name: "", remarks: "" }]
                            : entryDlg.form.payment.adjustments,
                        })}
                        data-testid="entry-has-adjustment"
                      />
                      <span className="text-sm font-medium">Add adjustment (Paid to College / SC Adjusted)</span>
                    </label>
                    {entryDlg.form.payment.has_adjustment && (
                      <div className="space-y-2 pt-1">
                        {entryDlg.form.payment.adjustments.map((adj, idx) => (
                          <div key={idx} className="rounded-md bg-muted/40 p-3 space-y-2">
                            <div className="grid grid-cols-12 gap-2 items-start">
                              <Select value={adj.kind} onValueChange={(v) => updateEntryAdj(idx, "kind", v)}>
                                <SelectTrigger className="col-span-5"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="paid_to_college">Paid to College</SelectItem>
                                  <SelectItem value="sc_adjusted">SC Adjusted (Sub / Associate / KM)</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input className="col-span-6" type="number" step="0.01" placeholder="Amount" value={adj.amount} onChange={(e) => updateEntryAdj(idx, "amount", e.target.value)} />
                              <button type="button" onClick={() => removeEntryAdj(idx)} className="col-span-1 h-10 flex items-center justify-center text-muted-foreground/70 hover:text-rose-700 dark:text-rose-400"><X size={14} /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input type="date" value={adj.payment_date} onChange={(e) => updateEntryAdj(idx, "payment_date", e.target.value)} />
                              <Select value={adj.payment_mode} onValueChange={(v) => updateEntryAdj(idx, "payment_mode", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            {adj.kind === "sc_adjusted" && (
                              <div className="grid grid-cols-2 gap-2">
                                <Select value={adj.sub_agent_type} onValueChange={(v) => updateEntryAdj(idx, "sub_agent_type", v)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>{SUB_AGENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                                </Select>
                                <Input value={adj.sub_agent_name} onChange={(e) => updateEntryAdj(idx, "sub_agent_name", e.target.value)} placeholder="Name" />
                              </div>
                            )}
                            <Input value={adj.remarks} onChange={(e) => updateEntryAdj(idx, "remarks", e.target.value)} placeholder="Remarks" />
                          </div>
                        ))}
                        <div className="flex items-center justify-between">
                          <Button type="button" size="sm" variant="outline" onClick={addEntryAdj}><Plus size={14} className="mr-1" /> Add adjustment</Button>
                          <span className={`text-xs tabular-nums ${Math.abs(eAdjBalance) < 0.01 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                            Adjustments {formatMoney(eAdjTotal, currency)} of {formatMoney(eAmount, currency)} · Δ {formatMoney(eAdjBalance, currency)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div><Label>Remarks</Label><Input value={entryDlg.form.payment.remarks} onChange={(e) => updateEntryPay({ remarks: e.target.value })} placeholder="Payment remarks" /></div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEntryDlg({ ...entryDlg, open: false })}>Cancel</Button>
              <Button type="submit" className="btn-amber border-0" data-testid="entry-save">Save entry</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <Card className="p-4 border border-border bg-card rounded-lg shadow-none">
      <p className="label-eyebrow">{label}</p>
      <p className={`font-display text-2xl mt-2 tabular-nums ${tone === "success" ? "text-emerald-700 dark:text-emerald-400" : tone === "danger" ? "text-rose-700 dark:text-rose-400" : "text-foreground"}`}>{value}</p>
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
    date: todayISO(),
    amount: "",
    fee_type: "booking_admission",
    received_in: { type: "college", name: "", account_id: "" },
    has_adjustment: false,
    adjustments: [],
    schedule_id: "",
    remarks: "",
  };
}

function emptyEntry() {
  return {
    // Schedule section
    create_schedule: true,
    schedule: { label: "1st Payment", amount: "", remarks: "", due_date: "" },
    existing_schedule_id: "",
    // Payment section
    log_payment: true,
    payment: emptyPayment(),
  };
}
