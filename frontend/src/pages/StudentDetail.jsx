import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, PencilSimple, Trash, CaretDown, CaretUp } from "@phosphor-icons/react";
import { toast } from "sonner";
import { downloadStudentPdf } from "@/lib/studentExports";
import { downloadApplicationPdf } from "@/lib/applicationPdf";
import { feesPlanFromApi, normalizeFeesPlanForApi } from "@/components/FeesPlanFields";
import HeaderCard from "@/components/student-detail/HeaderCard";
import SummaryTiles from "@/components/student-detail/SummaryTiles";
import PaymentDialog from "@/components/student-detail/PaymentDialog";
import AddEntryDialog from "@/components/student-detail/AddEntryDialog";
import {
  RECEIVED_IN, FEE_TYPE_LABELS, PAYMENT_MODES, SUB_AGENT_TYPES,
  PRESET_SCHEDULE_LABELS,
  nextScheduleLabel, emptyPayment, emptyEntry,
} from "@/components/student-detail/constants";

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
    } catch {
      toast.error("Could not load student"); nav("/students");
    }
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
      adjustments: (p.adjustments || []).map((a) => ({
        _key: a.id || a._key || `loaded-${a.kind}-${a.amount}-${a.payment_date}`,
        ...a,
        amount: String(a.amount),
      })),
      schedule_id: p.schedule_id || "",
      remarks: p.remarks || "",
    },
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
      adjustments: f.has_adjustment ? f.adjustments.map((a) => ({
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

  const onExportPdf = () => {
    try {
      downloadStudentPdf({ student: s, user });
      toast.success("PDF generated");
    } catch (err) {
      console.error("[student-detail] export failed:", err);
      toast.error("Export failed");
    }
  };

  const onExportApplicationPdf = () => {
    try {
      downloadApplicationPdf({ student: s, user });
      toast.success("Application PDF generated");
    } catch (err) {
      console.error("[student-detail] application pdf failed:", err);
      toast.error(err?.message || "Export failed");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="student-detail">
      <Link to="/students" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-list">
        <ArrowLeft size={14} /> All students
      </Link>

      <HeaderCard
        s={s}
        editing={editHeader}
        setEditing={setEditHeader}
        header={header}
        setHeader={setHeader}
        clients={clients}
        currency={currency}
        onSave={saveHeader}
        onDelete={removeStudent}
        onAddEntry={openEntryAdd}
        onExportPdf={onExportPdf}
        onExportApplicationPdf={onExportApplicationPdf}
      />

      <SummaryTiles s={s} currency={currency} />

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
                      {PRESET_SCHEDULE_LABELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
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
              {s.schedules.map((sc) => (
                <tr key={sc.id} className="hover:bg-muted/40" data-testid={`sch-row-${sc.id}`}>
                  <td className="px-6 py-3 font-medium">{sc.label}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{formatMoney(sc.amount, currency)}</td>
                  <td className="px-6 py-3 text-muted-foreground">{sc.remarks || "—"}</td>
                  <td className="px-6 py-3 tabular-nums text-muted-foreground">{sc.due_date ? formatDate(sc.due_date) : "—"}</td>
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
            <p className="label-eyebrow">Payments collected</p>
            <h3 className="font-display text-lg mt-0.5">Actual collections</h3>
          </div>
          <Button onClick={openPayAdd} size="sm" className="btn-amber border-0" data-testid="open-pay">
            <Plus size={14} className="mr-1.5" /> Log payment
          </Button>
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
              {s.payments.map((p) => {
                const ri = RECEIVED_IN[p.received_in?.type] || RECEIVED_IN.cash;
                const Icon = ri.icon;
                const sch = (s.schedules || []).find((x) => x.id === p.schedule_id);
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
                                  {a.kind === "paid_to_college" ? "Paid to College" : "Payment adjusted towards SC"}
                                </span>
                                <span className="tabular-nums font-medium">{formatMoney(a.amount, currency)}</span>
                                <span className="text-muted-foreground">on {formatDate(a.payment_date)} · {PAYMENT_MODES.find((m) => m.value === a.payment_mode)?.label}</span>
                                {a.kind === "sc_adjusted" && a.sub_agent_name && (
                                  <span className="text-muted-foreground">· with {SUB_AGENT_TYPES.find((t) => t.value === a.sub_agent_type)?.label} {a.sub_agent_name}</span>
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

      <PaymentDialog
        open={payDlg.open}
        onOpenChange={(v) => setPayDlg({ ...payDlg, open: v })}
        state={{ ...payDlg, currency }}
        setState={setPayDlg}
        schedules={s.schedules}
        accounts={accounts}
        onSubmit={submitPay}
      />

      <AddEntryDialog
        open={entryDlg.open}
        onOpenChange={(v) => setEntryDlg({ ...entryDlg, open: v })}
        state={entryDlg}
        setState={setEntryDlg}
        schedules={s.schedules}
        accounts={accounts}
        currency={currency}
        onSubmit={submitEntry}
      />
    </div>
  );
}
