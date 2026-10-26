import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PhoneCall } from "@phosphor-icons/react";
import { CALL_OUTCOMES, CALL_OUTCOME_META, NUMBER_TYPE_LABEL, toLocalInput, fromLocalInput } from "./constants";

// Tomorrow at 10:00 local, formatted for a datetime-local input.
function tomorrowTenLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

/**
 * "How did the call go?" prompt. Shown after the user taps a lead's phone,
 * parent or alternate number. Pick an outcome (Save stays disabled until one is
 * chosen), optionally add a note, and — for "Call back later" — schedule a
 * follow-up (defaults to tomorrow 10:00). Skip closes without saving.
 */
export default function CallLogDialog({ open, onOpenChange, leadId, number, numberType, onLogged }) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [fuAt, setFuAt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setOutcome("");
      setNote("");
      setFuAt(tomorrowTenLocal());
      setBusy(false);
    }
  }, [open]);

  const save = async () => {
    if (!outcome) return;
    setBusy(true);
    try {
      const body = { outcome, note: note.trim(), number: number || "", number_type: numberType || "phone" };
      if (outcome === "call_back") {
        const iso = fromLocalInput(fuAt);
        if (!iso) { toast.error("Pick a follow-up date & time"); setBusy(false); return; }
        body.followup_at = iso;
      }
      const { data } = await api.post(`/leads/${leadId}/call-log`, body);
      toast.success(outcome === "call_back" ? "Call logged · follow-up scheduled" : "Call logged");
      onLogged?.(data);
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Could not log call");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-sm" data-testid="call-log-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <PhoneCall size={20} weight="duotone" className="text-blue-500" /> How did the call go?
          </DialogTitle>
          <DialogDescription>
            {number ? (
              <>Logging the {NUMBER_TYPE_LABEL[numberType] || "primary"} number <span className="text-foreground font-medium">{number}</span>.</>
            ) : "Pick an outcome to log this call."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" data-testid="call-outcome-chips">
            {CALL_OUTCOMES.map((o) => {
              const m = CALL_OUTCOME_META[o];
              const active = outcome === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  data-testid={`call-outcome-${o}`}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${active ? m.cls : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {outcome === "call_back" && (
            <div className="space-y-1.5" data-testid="call-followup-block">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Follow-up on</label>
              <Input
                type="datetime-local"
                value={fuAt}
                onChange={(e) => setFuAt(e.target.value)}
                data-testid="call-followup-at"
              />
            </div>
          )}

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)…"
            rows={2}
            data-testid="call-log-note"
          />

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} data-testid="call-log-skip">
              Skip
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={!outcome || busy} data-testid="call-log-save" className="btn-amber border-0">
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
