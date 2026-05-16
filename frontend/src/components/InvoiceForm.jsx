import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Car, Receipt, Link as LinkIcon } from "@phosphor-icons/react";
import { formatMoney, formatDate } from "@/lib/format";

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
export const serviceParticular = () => ({ kind: "Service Charge", specify: "", amount: "" });

export default function InvoiceForm({ form, setForm, clients, accounts, currency, editing, onSubmit, onCancel }) {
  const isService = form.invoice_type === "service_charge";
  const [openCredits, setOpenCredits] = useState([]);

  // Fetch open campus-visit credits for the selected client when in service mode.
  useEffect(() => {
    if (!isService) { setOpenCredits([]); return; }
    if (!form.client_id) { setOpenCredits([]); return; }
    let cancelled = false;
    api.get("/invoices/open-credits", { params: { client_id: form.client_id } })
      .then(({ data }) => { if (!cancelled) setOpenCredits(data); })
      .catch(() => { if (!cancelled) setOpenCredits([]); });
    return () => { cancelled = true; };
  }, [isService, form.client_id]);

  const linkedVisit = openCredits.find(v => v.id === form.linked_visit_invoice_id);

  const updatePart = (idx, k, v) => {
    const items = form.particulars.slice();
    items[idx] = { ...items[idx], [k]: v };
    setForm({ ...form, particulars: items });
  };
  const addPart = () => setForm({ ...form, particulars: [...form.particulars, emptyParticular()] });
  const removePart = (idx) => setForm({ ...form, particulars: form.particulars.filter((_, i) => i !== idx) });

  const switchType = (t) => {
    if (t === form.invoice_type) return;
    setForm({
      ...form,
      invoice_type: t,
      particulars: t === "service_charge" ? [serviceParticular()] : [emptyParticular()],
      // service charge doesn't auto-log expenses (it's revenue, not cost)
      auto_log_expenses: t === "service_charge" ? false : true,
    });
  };

  const totalAmount = form.particulars.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const taxAmount = totalAmount * ((parseFloat(form.tax_rate) || 0) / 100);
  const credit = parseFloat(form.credit_amount) || 0;
  const psp = form.previous_sc_payment || { has: false, amount: 0 };
  const prevPay = isService && psp.has ? (parseFloat(psp.amount) || 0) : 0;
  const grandTotal = totalAmount + taxAmount - credit - prevPay;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Type selector */}
      <div className="grid grid-cols-2 gap-2" data-testid="invoice-type-toggle">
        <button
          type="button"
          onClick={() => switchType("campus_visit")}
          data-testid="type-campus"
          className={`p-3 rounded-md border text-left lift ${form.invoice_type === "campus_visit" ? "border-stone-900 bg-stone-50 ring-2 ring-stone-200" : "border-stone-200 bg-white hover:bg-stone-50"}`}
        >
          <div className="flex items-center gap-2">
            <Car size={18} weight="regular" className="text-stone-700" />
            <div>
              <p className="text-sm font-medium">Campus Visit Invoice</p>
              <p className="text-xs text-stone-500">Travel particulars · auto-logs expenses</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => switchType("service_charge")}
          data-testid="type-service"
          className={`p-3 rounded-md border text-left lift ${form.invoice_type === "service_charge" ? "border-stone-900 bg-stone-50 ring-2 ring-stone-200" : "border-stone-200 bg-white hover:bg-stone-50"}`}
        >
          <div className="flex items-center gap-2">
            <Receipt size={18} weight="regular" className="text-stone-700" />
            <div>
              <p className="text-sm font-medium">Service Charge Invoice</p>
              <p className="text-xs text-stone-500">Single fee · academic year</p>
            </div>
          </div>
        </button>
      </div>

      {/* Top meta — shared */}
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
        {!isService && (
          <div><Label>Campus Visit No.</Label><Input value={form.campus_visit_no} onChange={(e) => setForm({ ...form, campus_visit_no: e.target.value })} placeholder="CV-2026-001" data-testid="inv-visit-no" /></div>
        )}
      </div>

      {/* Variant-specific meta */}
      {isService ? (
        <div className="rounded-md border border-stone-200 p-4 space-y-3" data-testid="service-meta">
          <p className="label-eyebrow">Service Charge towards</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Student Name</Label><Input value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} placeholder="Full name" data-testid="inv-student" /></div>
            <div><Label>Course</Label><Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="e.g. B.Tech CSE" data-testid="inv-course" /></div>
            <div><Label>College</Label><Input value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} placeholder="e.g. IIT Delhi" data-testid="inv-college" /></div>
            <div><Label>Academic Year</Label><Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} placeholder="e.g. 2026-27" data-testid="inv-academic-year" /></div>
          </div>

          {/* Link to a prior campus visit (auto-fills credit) */}
          <div className="border-t border-stone-200 pt-3 mt-2">
            <Label className="flex items-center gap-1.5"><LinkIcon size={14} /> Link to a campus visit (optional)</Label>
            {openCredits.length === 0 ? (
              <p className="text-xs text-stone-500 mt-1.5" data-testid="no-open-credits">
                {form.client_id ? "No campus-visit invoices with open balance for this client." : "Pick a client to see their open campus visits."}
              </p>
            ) : (
              <>
                <Select
                  value={form.linked_visit_invoice_id || "_none"}
                  onValueChange={(v) => {
                    if (v === "_none") {
                      setForm({ ...form, linked_visit_invoice_id: null });
                    } else {
                      const picked = openCredits.find(c => c.id === v);
                      setForm({
                        ...form,
                        linked_visit_invoice_id: v,
                        // Auto-fill credit with remaining balance.
                        credit_amount: picked ? picked.remaining_credit : form.credit_amount,
                      });
                    }
                  }}
                >
                  <SelectTrigger data-testid="inv-linked-visit"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None — no linked visit</SelectItem>
                    {openCredits.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.invoice_number}
                        {v.student_name ? ` · ${v.student_name}` : ""}
                        {" · "}remaining {formatMoney(v.remaining_credit, currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkedVisit && (
                  <p className="text-xs text-stone-500 mt-1.5" data-testid="linked-visit-hint">
                    {linkedVisit.invoice_number} · {formatDate(linkedVisit.issue_date)} · pending {formatMoney(linkedVisit.remaining_credit, currency)} of {formatMoney(linkedVisit.total, currency)}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Student Name</Label><Input value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} placeholder="Full name" data-testid="inv-student" /></div>
          <div><Label>Course</Label><Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="e.g. B.Tech CSE" data-testid="inv-course" /></div>
          <div className="sm:col-span-2">
            <Label>Visited Colleges</Label>
            <Textarea rows={2} value={form.visited_colleges} onChange={(e) => setForm({ ...form, visited_colleges: e.target.value })} placeholder="Comma-separated list of colleges visited" data-testid="inv-colleges" />
          </div>
        </div>
      )}

      {/* Particulars */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Particulars</Label>
          {!isService && (
            <Button type="button" size="sm" variant="outline" onClick={addPart} data-testid="inv-add-part"><Plus size={14} className="mr-1" /> Add row</Button>
          )}
        </div>
        {isService ? (
          <div className="grid grid-cols-12 gap-2 items-center">
            <Input
              className="col-span-5 bg-stone-50"
              value="Service Charge"
              readOnly
              data-testid="inv-service-label"
            />
            <Input
              className="col-span-7"
              type="number"
              step="0.01"
              placeholder="Service charge amount"
              value={form.particulars[0]?.amount || ""}
              onChange={(e) => updatePart(0, "amount", e.target.value)}
              data-testid="inv-service-amount"
            />
          </div>
        ) : (
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
        )}
      </div>

      {/* Auto-log toggle (only for campus visit type) */}
      {!isService && (
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
                Each row is recorded as an expense in your ledger, mapped to its category. Updating the invoice re-syncs the transactions.
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
      )}

      {/* Totals controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>{isService ? "Expense Credit of Campus Visit" : "Credit toward expense"}</Label>
          <Input type="number" step="0.01" value={form.credit_amount} onChange={(e) => setForm({ ...form, credit_amount: e.target.value })} data-testid="inv-credit" />
          {isService && <p className="text-[11px] text-stone-500 mt-1">Pending / clear from a previous campus visit</p>}
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

      {/* Previous payment towards SC (service charge only) */}
      {isService && (
        <div className="rounded-md border border-stone-200 p-4 space-y-3" data-testid="prev-sc-block">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={!!psp.has}
              onCheckedChange={(v) => setForm({
                ...form,
                previous_sc_payment: {
                  has: !!v,
                  amount: psp.amount || "",
                  mode: psp.mode || "bank_transfer",
                  date: psp.date || form.issue_date,
                  account_id: psp.account_id || (accounts[0]?.id || ""),
                },
              })}
              data-testid="prev-sc-has"
            />
            <div>
              <p className="text-sm font-medium">Previous payment towards SC</p>
              <p className="text-xs text-stone-500 mt-0.5">A prior part-payment already received against this service charge. Logged as income and subtracted from the balance.</p>
            </div>
          </label>
          {psp.has && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-7">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number" step="0.01"
                  value={psp.amount}
                  onChange={(e) => setForm({ ...form, previous_sc_payment: { ...psp, amount: e.target.value } })}
                  data-testid="prev-sc-amount"
                />
              </div>
              <div>
                <Label className="text-xs">Mode</Label>
                <Select
                  value={psp.mode || "bank_transfer"}
                  onValueChange={(v) => setForm({ ...form, previous_sc_payment: { ...psp, mode: v } })}
                >
                  <SelectTrigger className="h-9" data-testid="prev-sc-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date of Payment</Label>
                <Input
                  type="date"
                  value={psp.date || ""}
                  onChange={(e) => setForm({ ...form, previous_sc_payment: { ...psp, date: e.target.value } })}
                  data-testid="prev-sc-date"
                />
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs">Credit to account</Label>
                <Select
                  value={psp.account_id || (accounts[0]?.id || "")}
                  onValueChange={(v) => setForm({ ...form, previous_sc_payment: { ...psp, account_id: v } })}
                >
                  <SelectTrigger className="h-9" data-testid="prev-sc-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live totals */}
      <div className="border-t border-stone-200 pt-4 space-y-1.5 text-sm bg-stone-50 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
        <div className="flex justify-between"><span className="text-stone-600">{isService ? "Total Amount" : "Total Expense"}</span><span className="tabular-nums font-medium" data-testid="inv-subtotal">{formatMoney(totalAmount, currency)}</span></div>
        {parseFloat(form.tax_rate) > 0 && (
          <div className="flex justify-between"><span className="text-stone-600">Tax</span><span className="tabular-nums">{formatMoney(taxAmount, currency)}</span></div>
        )}
        {credit > 0 && (
          <div className="flex justify-between"><span className="text-stone-600">{isService ? "Expense Credit of Campus Visit" : "Credit toward expense"}</span><span className="tabular-nums text-rose-700">− {formatMoney(credit, currency)}</span></div>
        )}
        {prevPay > 0 && (
          <div className="flex justify-between" data-testid="totals-prev-sc"><span className="text-stone-600">Previous payment towards SC</span><span className="tabular-nums text-rose-700">− {formatMoney(prevPay, currency)}</span></div>
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
