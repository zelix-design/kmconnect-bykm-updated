import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CurrencyInr, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

const MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

const today = () => new Date().toISOString().slice(0, 10);

// Pre-fill amount: super-admin college-side SC value when present, else the
// standard SC figure. Both editable at settlement time.
function defaultAmount(student) {
  const override = student?.sc_from_college_override;
  if (override !== null && override !== undefined && Number(override) > 0) {
    return String(override);
  }
  const std = student?.sc_earned_effective ?? student?.sc_out_fixed;
  return std ? String(std) : "";
}

export default function ScSettleDialog({ open, onOpenChange, student, accounts, currency, onSaved }) {
  const existing = student?.sc_settlement || {};
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState("bank_transfer");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(student?.sc_settled ? String(existing.amount ?? "") : defaultAmount(student));
    setAccountId(existing.account_id || "");
    setDate(existing.date || today());
    setMode(existing.payment_mode || "bank_transfer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  const preview = parseFloat(amount) || 0;

  const submit = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("SC amount must be greater than zero"); return; }
    if (!accountId) { toast.error("Pick the account that received the money"); return; }
    if (!date) { toast.error("Pick a date"); return; }
    setSaving(true);
    try {
      await api.post(`/students/${student.id}/sc-settle`, {
        amount: parseFloat(amount),
        account_id: accountId,
        date,
        payment_mode: mode,
      });
      toast.success(student?.sc_settled ? "SC settlement updated" : "Marked SC Settled · credit logged");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Could not save SC settlement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-md" data-testid="sc-settle-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <CurrencyInr size={18} weight="bold" className="text-emerald-700 dark:text-emerald-400" />
            {student?.sc_settled ? "Edit SC settlement" : "Mark SC Settled"}
          </DialogTitle>
          <DialogDescription>
            Record the service charge received from the college as a credit into one of your accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>SC amount <span className="text-rose-600">*</span></Label>
            <Input
              type="number" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              data-testid="sc-settle-amount"
            />
          </div>
          <div>
            <Label>Received in account <span className="text-rose-600">*</span></Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger data-testid="sc-settle-account"><SelectValue placeholder="Pick an account" /></SelectTrigger>
              <SelectContent>
                {(accounts || []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} <span className="text-muted-foreground text-xs">({a.type})</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date <span className="text-rose-600">*</span></Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="sc-settle-date" />
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger data-testid="sc-settle-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/30 p-3">
            <p className="text-xs text-emerald-800 dark:text-emerald-300">
              Credit of <strong>{formatMoney(preview, currency)}</strong> into the selected account
            </p>
            <span className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] uppercase tracking-wider font-semibold">Income</span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button" onClick={submit} disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            data-testid="sc-settle-submit"
          >
            <CheckCircle size={14} className="mr-1.5" />
            {saving ? "Saving…" : (student?.sc_settled ? "Update settlement" : "Mark SC Settled")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
