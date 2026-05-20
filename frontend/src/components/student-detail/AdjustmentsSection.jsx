import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/format";
import { PAYMENT_MODES, SUB_AGENT_TYPES, emptyAdjustment } from "./constants";

/**
 * Reusable Adjustments block — rendered inside both the Payment dialog and
 * the combined Add-Entry dialog. Keeps the SC-adjusted UX (kind selector,
 * date/mode, sub-agent picker, remarks) and totals strip in one place.
 *
 * Props:
 *  - adjustments : array of adjustment objects (each may have `_key`)
 *  - hasAdjustment, onToggleHas
 *  - onChange(idx, key, value)
 *  - onAdd, onRemove
 *  - amount, currency
 *  - testIdPrefix : "adj" | "entry-adj" etc.
 *  - paymentDate : ISO string — used as default for newly added rows
 */
export default function AdjustmentsSection({
  adjustments,
  hasAdjustment,
  onToggleHas,
  onChange,
  onAdd,
  onRemove,
  amount,
  currency,
  testIdPrefix = "adj",
  paymentDate,
}) {
  const adjTotal = adjustments.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const balance = (parseFloat(amount) || 0) - adjTotal;

  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <Checkbox
          checked={!!hasAdjustment}
          onCheckedChange={(v) => {
            const seed = adjustments.length === 0 ? [emptyAdjustment(paymentDate)] : adjustments;
            onToggleHas(!!v, !!v ? seed : adjustments);
          }}
          data-testid={`${testIdPrefix}-has`}
          className="mt-1"
        />
        <div className="flex-1">
          <p className="text-sm font-medium">This payment has an adjustment</p>
          <p className="text-xs text-muted-foreground mt-0.5">Split the amount across "Paid to College" and "SC Adjusted with Sub/KM" (specify type).</p>
        </div>
      </label>

      {hasAdjustment && (
        <div className="space-y-3 pt-2 border-t border-border" data-testid={`${testIdPrefix}-block`}>
          {adjustments.map((adj, idx) => (
            <div key={adj._key || idx} className="rounded-md bg-muted/40 p-3 space-y-2" data-testid={`${testIdPrefix}-row-${idx}`}>
              <div className="grid grid-cols-12 gap-2 items-start">
                <Select value={adj.kind} onValueChange={(v) => onChange(idx, "kind", v)}>
                  <SelectTrigger className="col-span-5" data-testid={`${testIdPrefix}-kind-${idx}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid_to_college">Paid to College</SelectItem>
                    <SelectItem value="sc_adjusted">SC Adjusted (with Sub / Associate / KM)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="col-span-6"
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={adj.amount}
                  onChange={(e) => onChange(idx, "amount", e.target.value)}
                  data-testid={`${testIdPrefix}-amount-${idx}`}
                />
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="col-span-1 h-10 flex items-center justify-center text-muted-foreground/70 hover:text-rose-700 dark:text-rose-400"
                  data-testid={`${testIdPrefix}-remove-${idx}`}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={adj.payment_date} onChange={(e) => onChange(idx, "payment_date", e.target.value)} data-testid={`${testIdPrefix}-date-${idx}`} />
                <Select value={adj.payment_mode} onValueChange={(v) => onChange(idx, "payment_mode", v)}>
                  <SelectTrigger data-testid={`${testIdPrefix}-mode-${idx}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {adj.kind === "sc_adjusted" && (
                <div className="grid grid-cols-2 gap-2" data-testid={`${testIdPrefix}-sub-${idx}`}>
                  <Select value={adj.sub_agent_type} onValueChange={(v) => onChange(idx, "sub_agent_type", v)}>
                    <SelectTrigger data-testid={`${testIdPrefix}-sub-type-${idx}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{SUB_AGENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={adj.sub_agent_name} onChange={(e) => onChange(idx, "sub_agent_name", e.target.value)} placeholder="Name" data-testid={`${testIdPrefix}-sub-name-${idx}`} />
                </div>
              )}
              <Input value={adj.remarks} onChange={(e) => onChange(idx, "remarks", e.target.value)} placeholder="Remarks" data-testid={`${testIdPrefix}-remarks-${idx}`} />
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button type="button" size="sm" variant="outline" onClick={onAdd} data-testid={`${testIdPrefix}-add`}>
              <Plus size={14} className="mr-1" /> Add adjustment row
            </Button>
            <span
              className={`text-xs tabular-nums ${Math.abs(balance) < 0.01 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
              data-testid={`${testIdPrefix}-balance`}
            >
              Adjustments {formatMoney(adjTotal, currency)} of {formatMoney(parseFloat(amount) || 0, currency)} · Δ {formatMoney(balance, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper used by parent components to mirror the per-row "Received in" UX
 * (account-picker + sub-agent name). Centralising it avoids the dialogs
 * drifting apart.
 */
export function ReceivedInBlock({
  state,           // { type, name, account_id }
  onChange,        // (patch) => void
  accounts,
  testIdPrefix = "pay-recv",
  showInternal = true,
}) {
  return (
    <div className="rounded-md border border-border p-4 space-y-3" data-testid={`${testIdPrefix}-block`}>
      <Label>Received in</Label>
      <div className="grid grid-cols-2 gap-3">
        <Select value={state.type} onValueChange={(v) => onChange({ type: v })}>
          <SelectTrigger data-testid={`${testIdPrefix}-type`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="college">College Acc.</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank">Bank Acc.</SelectItem>
            <SelectItem value="km">KM Acc.</SelectItem>
            <SelectItem value="sub_agent">Sub Agent Acc.</SelectItem>
            <SelectItem value="associate">Associate Acc.</SelectItem>
          </SelectContent>
        </Select>
        {(["sub_agent", "associate", "km"].includes(state.type)) && (
          <Input
            value={state.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Name (e.g. Rohan Mehta)"
            data-testid={`${testIdPrefix}-name`}
          />
        )}
      </div>
      {showInternal && (
        <div>
          <Label className="text-xs">Internal account (optional — enables auto-logging as income transaction)</Label>
          <Select
            value={state.account_id || "_none"}
            onValueChange={(v) => onChange({ account_id: v === "_none" ? "" : v })}
          >
            <SelectTrigger className="h-9" data-testid={`${testIdPrefix}-account`}>
              <SelectValue placeholder="No internal account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">No auto-log</SelectItem>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
