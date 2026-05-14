import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, PencilSimple, Trash, DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { downloadInvoicePDF } from "@/lib/invoicePdf";
import InvoiceForm, { PARTICULAR_PRESETS, emptyParticular, serviceParticular } from "@/components/InvoiceForm";

const STATUS_STYLES = {
  draft: "bg-stone-100 text-stone-700",
  sent: "bg-sky-50 text-sky-700",
  paid: "bg-emerald-50 text-emerald-700",
  overdue: "bg-rose-50 text-rose-700",
};

const blankForm = () => ({
  client_id: "",
  invoice_number: "",
  issue_date: todayISO(),
  due_date: todayISO(),
  particulars: [emptyParticular()],
  tax_rate: 0,
  notes: "",
  status: "draft",
  campus_visit_no: "",
  student_name: "",
  course: "",
  visited_colleges: "",
  credit_amount: 0,
  auto_log_expenses: true,
  expense_account_id: "",
  invoice_type: "campus_visit",
  college: "",
  academic_year: "",
});

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

function itemsToParticulars(items) {
  if (!items?.length) return [emptyParticular()];
  return items.map((it) => {
    const d = (it.description || "").trim();
    const m = d.match(/^Other:\s*(.+)$/i);
    if (m) return { kind: "Other", specify: m[1], amount: String(it.unit_price * (it.quantity || 1)) };
    if (PARTICULAR_PRESETS.includes(d)) return { kind: d, specify: "", amount: String(it.unit_price * (it.quantity || 1)) };
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
  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [i, c, a] = await Promise.all([
      api.get("/invoices"),
      api.get("/clients"),
      api.get("/accounts"),
    ]);
    setList(i.data); setClients(c.data); setAccounts(a.data);
  };
  useEffect(() => { load(); }, []);

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...blankForm(),
      invoice_number: nextInvoiceNumber(list),
      client_id: clients[0]?.id || "",
      expense_account_id: accounts[0]?.id || "",
    });
    setOpen(true);
  };

  const openEdit = (inv) => {
    setEditing(inv);
    const invType = inv.invoice_type || "campus_visit";
    const isService = invType === "service_charge";
    setForm({
      client_id: inv.client_id,
      invoice_number: inv.invoice_number,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      particulars: isService
        ? [{ kind: "Service Charge", specify: "", amount: String((inv.items?.[0]?.unit_price ?? 0) * (inv.items?.[0]?.quantity ?? 1)) }]
        : itemsToParticulars(inv.items),
      tax_rate: inv.tax_rate || 0,
      notes: inv.notes || "",
      status: inv.status,
      campus_visit_no: inv.campus_visit_no || "",
      student_name: inv.student_name || "",
      course: inv.course || "",
      visited_colleges: inv.visited_colleges || "",
      credit_amount: inv.credit_amount || 0,
      auto_log_expenses: isService ? false : (inv.auto_log_expenses !== false),
      expense_account_id: inv.expense_account_id || accounts[0]?.id || "",
      invoice_type: invType,
      college: inv.college || "",
      academic_year: inv.academic_year || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_id) { toast.error("Select a client"); return; }
    const isService = form.invoice_type === "service_charge";
    let items;
    if (isService) {
      const amt = parseFloat(form.particulars[0]?.amount) || 0;
      if (amt <= 0) { toast.error("Enter the service charge amount"); return; }
      items = [{ description: "Service Charge", quantity: 1, unit_price: amt }];
    } else {
      items = particularsToItems(form.particulars);
      if (items.length === 0) { toast.error("Add at least one particular with amount"); return; }
    }
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
      campus_visit_no: isService ? null : (form.campus_visit_no || null),
      student_name: form.student_name || null,
      course: form.course || null,
      visited_colleges: isService ? null : (form.visited_colleges || null),
      auto_log_expenses: !isService && !!form.auto_log_expenses,
      expense_account_id: form.expense_account_id || null,
      invoice_type: form.invoice_type,
      college: isService ? (form.college || null) : null,
      academic_year: isService ? (form.academic_year || null) : null,
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
    if (!confirm("Delete invoice? Linked expense transactions will also be removed.")) return;
    await api.delete(`/invoices/${id}`);
    toast.success("Deleted"); load();
  };

  const updateStatus = async (id, status) => {
    await api.patch(`/invoices/${id}/status`, { status });
    load();
  };

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
            <DialogHeader>
              <DialogTitle className="font-display">{editing ? "Edit" : "New"} invoice</DialogTitle>
              <DialogDescription className="text-xs text-stone-500">
                Fill in client, visit details, particulars and totals. Particulars can optionally auto-log as expense transactions.
              </DialogDescription>
            </DialogHeader>
            <InvoiceForm
              form={form}
              setForm={setForm}
              clients={clients}
              accounts={accounts}
              currency={currency}
              editing={!!editing}
              onSubmit={submit}
              onCancel={() => setOpen(false)}
            />
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
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${inv.invoice_type === "service_charge" ? "bg-indigo-50 text-indigo-700" : "bg-stone-100 text-stone-700"}`}>
                          {inv.invoice_type === "service_charge" ? "Service" : "Campus visit"}
                        </span>
                        {inv.campus_visit_no && <p className="text-xs text-stone-500">Visit #{inv.campus_visit_no}</p>}
                        {inv.auto_log_expenses && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Auto-logged</span>}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <p>{clientMap[inv.client_id]?.name || "—"}</p>
                      {inv.student_name && <p className="text-xs text-stone-500">{inv.student_name}{inv.course ? ` · ${inv.course}` : ""}{inv.college ? ` · ${inv.college}` : ""}</p>}
                      {inv.academic_year && <p className="text-xs text-stone-400">AY {inv.academic_year}</p>}
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
