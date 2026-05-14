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
import { Plus, PencilSimple, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_STYLES = {
  draft: "bg-stone-100 text-stone-700",
  sent: "bg-sky-50 text-sky-700",
  paid: "bg-emerald-50 text-emerald-700",
  overdue: "bg-rose-50 text-rose-700",
};

const empty = {
  client_id: "",
  invoice_number: "",
  issue_date: todayISO(),
  due_date: todayISO(),
  items: [{ description: "", quantity: 1, unit_price: 0 }],
  tax_rate: 0,
  notes: "",
  status: "draft",
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
      client_id: inv.client_id, invoice_number: inv.invoice_number,
      issue_date: inv.issue_date, due_date: inv.due_date,
      items: inv.items.length ? inv.items : empty.items,
      tax_rate: inv.tax_rate, notes: inv.notes || "", status: inv.status,
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_id) { toast.error("Select a client"); return; }
    const payload = {
      ...form,
      tax_rate: parseFloat(form.tax_rate) || 0,
      items: form.items.map(it => ({
        description: it.description || "Item",
        quantity: parseFloat(it.quantity) || 0,
        unit_price: parseFloat(it.unit_price) || 0,
      })),
    };
    try {
      if (editing) await api.patch(`/invoices/${editing.id}`, payload);
      else await api.post("/invoices", payload);
      toast.success(editing ? "Invoice updated" : "Invoice created");
      setOpen(false); load();
    } catch { toast.error("Failed"); }
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

  const updateItem = (idx, k, v) => {
    const items = form.items.slice();
    items[idx] = { ...items[idx], [k]: v };
    setForm({ ...form, items });
  };
  const addItem = () => setForm({ ...form, items: [...form.items, { description: "", quantity: 1, unit_price: 0 }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const subtotal = form.items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);
  const taxAmount = subtotal * ((parseFloat(form.tax_rate) || 0) / 100);
  const total = subtotal + taxAmount;

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
          <DialogContent className="bg-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display">{editing ? "Edit" : "New"} invoice</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger data-testid="inv-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Invoice #</Label><Input required value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} data-testid="inv-number" /></div>
                <div><Label>Issue date</Label><Input type="date" required value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} data-testid="inv-issue" /></div>
                <div><Label>Due date</Label><Input type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} data-testid="inv-due" /></div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Items</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addItem} data-testid="inv-add-item"><Plus size={14} className="mr-1" /> Add line</Button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <Input className="col-span-6" placeholder="Description" value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} data-testid={`inv-item-desc-${idx}`} />
                      <Input className="col-span-2" type="number" step="0.01" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} data-testid={`inv-item-qty-${idx}`} />
                      <Input className="col-span-3" type="number" step="0.01" placeholder="Unit price" value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", e.target.value)} data-testid={`inv-item-price-${idx}`} />
                      <button type="button" onClick={() => removeItem(idx)} className="col-span-1 text-stone-400 hover:text-rose-700" data-testid={`inv-item-remove-${idx}`}><X size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

              <div className="border-t border-stone-200 pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-stone-600">Subtotal</span><span className="tabular-nums">{formatMoney(subtotal, currency)}</span></div>
                <div className="flex justify-between"><span className="text-stone-600">Tax</span><span className="tabular-nums">{formatMoney(taxAmount, currency)}</span></div>
                <div className="flex justify-between text-base font-medium"><span>Total</span><span className="tabular-nums" data-testid="inv-total">{formatMoney(total, currency)}</span></div>
              </div>

              <DialogFooter>
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
                  <th className="px-6 py-3 label-eyebrow">Client</th>
                  <th className="px-6 py-3 label-eyebrow">Issue</th>
                  <th className="px-6 py-3 label-eyebrow">Due</th>
                  <th className="px-6 py-3 label-eyebrow">Status</th>
                  <th className="px-6 py-3 label-eyebrow text-right">Total</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {list.map(inv => (
                  <tr key={inv.id} className="hover:bg-stone-50" data-testid={`inv-row-${inv.id}`}>
                    <td className="px-6 py-3.5 font-medium">{inv.invoice_number}</td>
                    <td className="px-6 py-3.5">{clientMap[inv.client_id]?.name || "—"}</td>
                    <td className="px-6 py-3.5 text-stone-600">{formatDate(inv.issue_date)}</td>
                    <td className="px-6 py-3.5 text-stone-600">{formatDate(inv.due_date)}</td>
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
