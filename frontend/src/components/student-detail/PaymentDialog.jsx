import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdjustmentsSection, { ReceivedInBlock } from "./AdjustmentsSection";
import { emptyAdjustment } from "./constants";

export default function PaymentDialog({
  open,
  onOpenChange,
  state,           // { editing, form }
  setState,        // updater for the dialog state
  schedules,
  accounts,
  onSubmit,
}) {
  const setForm = (patch) => setState({ ...state, form: { ...state.form, ...patch } });

  const onAdjChange = (idx, k, v) => {
    const adjs = state.form.adjustments.slice();
    adjs[idx] = { ...adjs[idx], [k]: v };
    setForm({ adjustments: adjs });
  };
  const onAdjAdd = () => setForm({ adjustments: [...state.form.adjustments, emptyAdjustment(state.form.date)] });
  const onAdjRemove = (idx) => setForm({ adjustments: state.form.adjustments.filter((_, i) => i !== idx) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="payment-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">{state.editing ? "Edit" : "Log"} payment</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Record a fee collection and (optionally) split into adjustments.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date credited</Label><Input type="date" required value={state.form.date} onChange={(e) => setForm({ date: e.target.value })} data-testid="pay-date" /></div>
            <div>
              <Label>Schedule (optional)</Label>
              <Select value={state.form.schedule_id || "_none"} onValueChange={(v) => setForm({ schedule_id: v === "_none" ? "" : v })}>
                <SelectTrigger data-testid="pay-schedule"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {(schedules || []).map((sc) => (
                    <SelectItem key={sc.id} value={sc.id}>{sc.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fee type</Label>
              <Select value={state.form.fee_type} onValueChange={(v) => setForm({ fee_type: v })}>
                <SelectTrigger data-testid="pay-fee-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="booking_admission">Booking / Admission Fees</SelectItem>
                  <SelectItem value="tution">Tution Fees</SelectItem>
                  <SelectItem value="other">Other Fees</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" step="0.01" required value={state.form.amount} onChange={(e) => setForm({ amount: e.target.value })} data-testid="pay-amount" /></div>
          </div>

          <ReceivedInBlock
            state={state.form.received_in}
            onChange={(patch) => setForm({ received_in: { ...state.form.received_in, ...patch } })}
            accounts={accounts}
            testIdPrefix="pay-recv"
          />

          <AdjustmentsSection
            adjustments={state.form.adjustments}
            hasAdjustment={state.form.has_adjustment}
            onToggleHas={(v, seedAdjs) => setForm({ has_adjustment: v, adjustments: seedAdjs })}
            onChange={onAdjChange}
            onAdd={onAdjAdd}
            onRemove={onAdjRemove}
            amount={state.form.amount}
            currency={state.currency}
            testIdPrefix="adj"
            paymentDate={state.form.date}
          />

          <div><Label>Remarks</Label><Input value={state.form.remarks} onChange={(e) => setForm({ remarks: e.target.value })} placeholder="e.g. Booking Amount" data-testid="pay-remarks" /></div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="btn-amber border-0" data-testid="pay-save">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
