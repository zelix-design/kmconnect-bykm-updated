import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, PencilSimple, Trash, X, DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { downloadInvoicePDF } from "@/lib/invoicePdf";

const STATUS_STYLES = {
  draft: "bg-stone-100 text-stone-700",
  sent: "bg-sky-50 text-sky-700",
  paid: "bg-emerald-50 text-emerald-700",
  overdue: "bg-rose-50 text-rose-700",
};

// Preset particulars for campus-visit invoices
const PARTICULAR_PRESETS = [
  "Car Rent",
  "Fuel Expense",
  "Cab Expense",
  "Toll",
  "Food",
  "Driver Salary",
  "Other",
];

const emptyItem = () => ({ kind: "Car Rent", specify: "", amount: "" });

const empty = {
  client_id: "",
  invoice_number: "",
  issue_date: todayISO(),
  due_date: todayISO(),
  particulars: [emptyItem()],
  tax_rate: 0,
  notes: "",
  status: "draft",
  campus_visit_no: "",
  student_name: "",
  course: "",
  visited_colleges: "",
  credit_amount: 0,
};

function nextInvoiceNumber(list) {
  const year = new Date().getFullYear();
  const ns = list.map(i => i.invoice_number).filter(Boolean);
  const max = ns.reduce((acc, n) => {
    const m = n.match(/INV-(\d{4})-(\d+)/);
    if (m && parseInt(m[1]) === year) return Math.max(acc, parseInt(m[2]));
    return acc;
  }, 0);
  return `INV-${year}-${String(max + 1).padStart(4, "0")}`;
}

// Convert items (from API) back to particulars for editing
function itemsToParticulars(items) {
  if (!items?.length) return [emptyItem()];
  return items.map((it) => {
    const d = (it.description || "").trim();
    // Try to extract "Other: spec" form
    const m = d.match(/^Other:\s*(.+)$/i);
    if (m) return { kind: "Other", specify: m[1], amount: String(it.unit_price * (it.quantity || 1)) };
    if (PARTICULAR_PRESETS.includes(d)) return { kind: d, specify: "", amount: String(it.unit_price * (it.quantity || 1)) };
    // Legacy / freeform — treat as Other with specify
    return { kind: "Other", specify: d, amount: String(it.unit_price * (it.quantity || 1)) };
  });
}

function particularsToItems(particulars) {
  return particulars
    .map((p) => {
      const amt = parseFloat(p.amount) || 0;
      if (amt <= 0) return null;
      const description = p.kind === "Other"
        ? `Other: ${p.specify?.trim() || "Misc"}`
        : p.kind;
      return { description, quantity: 1, unit_price: amt };
    })
    .filter(Boolean);
}

export default function Invoices() {
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [i, c] = await Promise.all([api.get("/invoices"), api.get("/clients")]);
    setList(i.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty, invoice_number: nextInvoiceNumber(list), client_id: clients[0]?.id || "" });
    setOpen(true);
  };

  const openEdit = (inv) => {
    setEditing(inv);
    setForm({
      client_id: inv.client_id,
      invoice_number: inv.invoice_number,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      particulars: itemsToParticulars(inv.items),
      tax_rate: inv.tax_rate || 0,
      notes: inv.notes || "",
      status: inv.status,
      campus_visit_no: inv.campus_visit_no || "",
      student_name: inv.student_name || "",
      course: inv.course || "",
      visited_colleges: inv.visited_colleges || "",
      credit_amount: inv.credit_amount || 0,
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_id) { toast.error("Select a client"); return; }
    const items = particularsToItems(form.particulars);
    if (items.length === 0) { toast.error("Add at least one particular with amount"); return; }
    const payload = {
      client_id: form.client_id,
      invoice_number: form.invoice_number,
      issue_date: form.issue_date,
      due_date: form.due_date,
      items,
      tax_rate: parseFloat(form.tax_rate) || 0,
      credit_amount: parseFloat(form.credit_amount) || 0,
      notes: form.notes,
      status: form.status,
      campus_visit_no: form.campus_visit_no || null,
      student_name: form.student_name || null,
      course: form.course || null,
      visited_colleges: form.visited_colleges || null,
    };
    try {
      if (editing) await api.patch(`/invoices/${editing.id}`, payload);
      else await api.post("/invoices", payload);
      toast.success(editing ? "Invoice updated" : "Invoice created");
      setOpen(false); load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete invoice?")) return;
    await api.delete(`/invoices/${id}`);
    toast.success("Deleted"); load();
  };

  const updateStatus = async (id, status) => {
    await api.patch(`/invoices/${id}/status`, { status });
    load();
  };

  const updatePart = (idx, k, v) => {
    const items = form.particulars.slice();
    items[idx] = { ...items[idx], [k]: v };
    setForm({ ...form, particulars: items });
  };
  const addPart = () => setForm({ ...form, particulars: [...form.particulars, emptyItem()] });
  const removePart = (idx) => setForm({ ...form, particulars: form.particulars.filter((_, i) => i !== idx) });

  const totalExpense = form.particulars.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const taxAmount = totalExpense * ((parseFloat(form.tax_rate) || 0) / 100);
  const credit = parseFloat(form.credit_amount) || 0;
  const grandTotal = totalExpense + taxAmount - credit;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="invoices-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="label-eyebrow">Billables</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">Invoices</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} disabled={clients.length === 0} data-testid="add-invoice-btn" className="h-10 bg-stone-900 hover:bg-stone-800 text-stone-50 lift">
              <Plus size={16} className="mr-1.5" /> New invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-3xl max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display">{editing ? "Edit" : "New"} invoice</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-5">
              {/* Top meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Generate invoice to (Client)</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger data-testid="inv-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Invoice #</Label><Input required value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} data-testid="inv-number" /></div>
                <div><Label>Date</Label><Input type="date" required value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value, due_date: e.target.value })} data-testid="inv-issue" /></div>
                <div><Label>Campus Visit No.</Label><Input value={form.campus_visit_no} onChange={(e) => setForm({ ...form, campus_visit_no: e.target.value })} placeholder="CV-2026-001" data-testid="inv-visit-no" /></div>
                <div><Label>Student Name</Label><Input value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} placeholder="Full name" data-testid="inv-student" /></div>
                <div><Label>Course</Label><Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="e.g. B.Tech CSE" data-testid="inv-course" /></div>
                <div className="sm:col-span-2">
                  <Label>Visited Colleges</Label>
                  <Textarea rows={2} value={form.visited_colleges} onChange={(e) => setForm({ ...form, visited_colleges: e.target.value })} placeholder="Comma-separated list of colleges visited" data-testid="inv-colleges" />
                </div>
              </div>

              {/* Particulars */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Particulars</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addPart} data-testid="inv-add-part"><Plus size={14} className="mr-1" /> Add row</Button>
                </div>
                <div className="space-y-2">
                  {form.particulars.map((p, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-5">
                        <Select value={p.kind} onValueChange={(v) => updatePart(idx, "kind", v)}>
                          <SelectTrigger data-testid={`inv-part-kind-${idx}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PARTICULAR_PRESETS.map(k => <SelectItem key={k} value={k}>{k}{k === "Other" ? " (Specify)" : ""}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {p.kind === "Other" && (
                          <Input
                            className="mt-2"
                            value={p.specify}
                            onChange={(e) => updatePart(idx, "specify", e.target.value)}
                            placeholder="Specify…"
                            data-testid={`inv-part-spec-${idx}`}
                          />
                        )}
                      </div>
                      <Input
                        className="col-span-6"
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={p.amount}
                        onChange={(e) => updatePart(idx, "amount", e.target.value)}
                        data-testid={`inv-part-amt-${idx}`}
                      />
                      <button
                        type="button"
                        onClick={() => removePart(idx)}
                        disabled={form.particulars.length === 1}
                        className="col-span-1 text-stone-400 hover:text-rose-700 disabled:opacity-30 h-10 flex items-center justify-center"
                        data-testid={`inv-part-remove-${idx}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Credit toward expense</Label>
                  <Input type="number" step="0.01" value={form.credit_amount} onChange={(e) => setForm({ ...form, credit_amount: e.target.value })} data-testid="inv-credit" />
                </div>
                <div>
                  <Label>Tax rate %</Label>
                  <Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} data-testid="inv-tax" />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger data-testid="inv-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, thank you note…" /></div>

              {/* Live totals */}
              <div className="border-t border-stone-200 pt-4 space-y-1.5 text-sm bg-stone-50 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
                <div className="flex justify-between"><span className="text-stone-600">Total Expense</span><span className="tabular-nums font-medium" data-testid="inv-subtotal">{formatMoney(totalExpense, currency)}</span></div>
                {parseFloat(form.tax_rate) > 0 && (
                  <div className="flex justify-between"><span className="text-stone-600">Tax</span><span className="tabular-nums">{formatMoney(taxAmount, currency)}</span></div>
                )}
                {credit > 0 && (
                  <div className="flex justify-between"><span className="text-stone-600">Credit toward expense</span><span className="tabular-nums text-rose-700">− {formatMoney(credit, currency)}</span></div>
                )}
                <div className="flex justify-between border-t border-stone-200 mt-2 pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums" data-testid="inv-total">{formatMoney(grandTotal, currency)}</span></div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-stone-900 hover:bg-stone-800" data-testid="inv-save">{editing ? "Save" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {clients.length === 0 && (
        <Card className="p-6 border border-amber-200 bg-amber-50 text-amber-900 rounded-lg shadow-none text-sm" data-testid="no-clients-warn">
          Add a client first to create invoices.
        </Card>
      )}

      <Card className="border border-stone-200 bg-white rounded-lg shadow-none overflow-hidden">
        {list.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-500" data-testid="empty-invoices">No invoices yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-stone-50 border-b border-stone-200">
                  <th className="px-6 py-3 label-eyebrow">Invoice</th>
                  <th className="px-6 py-3 label-eyebrow">Client / Student</th>
                  <th className="px-6 py-3 label-eyebrow">Date</th>
                  <th className="px-6 py-3 label-eyebrow">Status</th>
                  <th className="px-6 py-3 label-eyebrow text-right">Total</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {list.map(inv => (
                  <tr key={inv.id} className="hover:bg-stone-50" data-testid={`inv-row-${inv.id}`}>
                    <td className="px-6 py-3.5">
                      <p className="font-medium">{inv.invoice_number}</p>
                      {inv.campus_visit_no && <p className="text-xs text-stone-500">Visit #{inv.campus_visit_no}</p>}
                    </td>
                    <td className="px-6 py-3.5">
                      <p>{clientMap[inv.client_id]?.name || "—"}</p>
                      {inv.student_name && <p className="text-xs text-stone-500">{inv.student_name}{inv.course ? ` · ${inv.course}` : ""}</p>}
                    </td>
                    <td className="px-6 py-3.5 text-stone-600">{formatDate(inv.issue_date)}</td>
                    <td className="px-6 py-3.5">
                      <Select value={inv.status} onValueChange={(v) => updateStatus(inv.id, v)}>
                        <SelectTrigger className={`h-7 w-28 text-xs ${STATUS_STYLES[inv.status]}`} data-testid={`inv-status-${inv.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-nums font-medium">{formatMoney(inv.total, currency)}</td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      <button onClick={() => downloadInvoicePDF({ invoice: inv, client: clientMap[inv.client_id], user })} data-testid={`pdf-inv-${inv.id}`} className="text-stone-500 hover:text-stone-900 p-1.5" title="Download PDF"><DownloadSimple size={16} /></button>
                      <button onClick={() => openEdit(inv)} data-testid={`edit-inv-${inv.id}`} className="text-stone-500 hover:text-stone-900 p-1.5"><PencilSimple size={16} /></button>
                      <button onClick={() => remove(inv.id)} data-testid={`delete-inv-${inv.id}`} className="text-stone-500 hover:text-rose-700 p-1.5"><Trash size={16} /></button>
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
