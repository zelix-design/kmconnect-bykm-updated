import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/format";

export const PARTICULAR_PRESETS = [
  "Car Rent",
  "Fuel Expense",
  "Cab Expense",
  "Toll",
  "Food",
  "Driver Salary",
  "Other",
];

export const emptyParticular = () => ({ kind: "Car Rent", specify: "", amount: "" });

export default function InvoiceForm({ form, setForm, clients, accounts, currency, editing, onSubmit, onCancel }) {
  const updatePart = (idx, k, v) => {
    const items = form.particulars.slice();
    items[idx] = { ...items[idx], [k]: v };
    setForm({ ...form, particulars: items });
  };
  const addPart = () => setForm({ ...form, particulars: [...form.particulars, emptyParticular()] });
  const removePart = (idx) => setForm({ ...form, particulars: form.particulars.filter((_, i) => i !== idx) });

  const totalExpense = form.particulars.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const taxAmount = totalExpense * ((parseFloat(form.tax_rate) || 0) / 100);
  const credit = parseFloat(form.credit_amount) || 0;
  const grandTotal = totalExpense + taxAmount - credit;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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

      {/* Auto-log toggle */}
      <div className="rounded-md border border-stone-200 bg-stone-50 p-4 space-y-3" data-testid="auto-log-block">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={!!form.auto_log_expenses}
            onCheckedChange={(v) => setForm({ ...form, auto_log_expenses: !!v })}
            data-testid="inv-auto-log"
            className="mt-1"
          />
          <div className="flex-1">
            <p className="text-sm font-medium">Also log particulars as expense transactions</p>
            <p className="text-xs text-stone-600 mt-0.5">
              Each row is recorded as an expense in your ledger, mapped to its category (Car Rent → Cab Exp, Driver Salary → Salaries, etc.). Updating the invoice re-syncs the transactions.
            </p>
          </div>
        </label>
        {form.auto_log_expenses && (
          <div className="pl-7">
            <Label className="text-xs">Expense account</Label>
            <Select value={form.expense_account_id || (accounts[0]?.id ?? "")} onValueChange={(v) => setForm({ ...form, expense_account_id: v })}>
              <SelectTrigger className="h-9 bg-white" data-testid="inv-expense-account"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
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

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="bg-stone-900 hover:bg-stone-800" data-testid="inv-save">{editing ? "Save" : "Create"}</Button>
      </div>
    </form>
  );
}
