import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Phone, EnvelopeSimple, GraduationCap, MapPin, ClockCountdown, PencilSimple, Trash, CalendarPlus } from "@phosphor-icons/react";
import { LEAD_STATUSES, LEAD_STATUS_META, LEAD_SOURCES, sourceLabel, fmtDateTime, fromLocalInput } from "./constants";
import { canEdit } from "@/lib/perm";

function InfoRow({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-foreground">
      <Icon size={15} className="text-muted-foreground shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

export default function LeadDetailDialog({ open, onOpenChange, lead, user, onChanged, onEdit }) {
  const [local, setLocal] = useState(lead);
  const [fuAt, setFuAt] = useState("");
  const [fuNote, setFuNote] = useState("");
  const [fuStatus, setFuStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable = canEdit(user, "leads");

  useEffect(() => { setLocal(lead); setFuAt(""); setFuNote(""); setFuStatus(""); }, [lead]);

  if (!local) return null;
  const meta = LEAD_STATUS_META[local.status] || LEAD_STATUS_META.new;

  const refresh = (updated) => { setLocal(updated); onChanged?.(); };

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/leads/${local.id}`, { status });
      refresh(data);
      toast.success(`Marked ${LEAD_STATUS_META[status].label}`);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Update failed");
    } finally { setBusy(false); }
  };

  const addFollowup = async () => {
    if (!fuAt) { toast.error("Pick a follow-up date & time"); return; }
    setBusy(true);
    try {
      const body = { at: fromLocalInput(fuAt), note: fuNote.trim() };
      if (fuStatus) body.status = fuStatus;
      const { data } = await api.post(`/leads/${local.id}/followups`, body);
      refresh(data);
      setFuAt(""); setFuNote(""); setFuStatus("");
      toast.success("Follow-up logged");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Could not add follow-up");
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/leads/${local.id}`);
      toast.success("Lead deleted");
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Delete failed");
    } finally { setBusy(false); setConfirmDelete(false); }
  };

  const history = [...(local.follow_ups || [])].reverse();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-lg" data-testid="lead-detail-dialog">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <DialogTitle className="font-display text-xl" data-testid="lead-detail-name">{local.name}</DialogTitle>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`} data-testid="lead-detail-status">{meta.label}</span>
          </div>
          <DialogDescription className="sr-only">Lead details, status and follow-up history for {local.name}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <InfoRow icon={Phone}>{local.phone}</InfoRow>
            <InfoRow icon={EnvelopeSimple}>{local.email}</InfoRow>
            <InfoRow icon={GraduationCap}>{local.course}</InfoRow>
            <InfoRow icon={MapPin}>{local.place}</InfoRow>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded-full bg-muted">{sourceLabel(local.source)}</span>
            {local.assigned_to_name && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">{local.assigned_to_name}</span>}
            {local.next_follow_up && (
              <span className={`px-2 py-0.5 rounded-full flex items-center gap-1 ${local.is_missed ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-blue-500/10 text-blue-700 dark:text-blue-300"}`}>
                <ClockCountdown size={12} /> {fmtDateTime(local.next_follow_up)}{local.is_missed ? " · Missed" : ""}
              </span>
            )}
          </div>
          {local.notes && <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-2.5">{local.notes}</p>}

          {/* Quick status */}
          {editable && (
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || s === local.status}
                  onClick={() => changeStatus(s)}
                  data-testid={`lead-status-chip-${s}`}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${s === local.status ? LEAD_STATUS_META[s].cls : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {LEAD_STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}

          {/* Log follow-up */}
          {editable && (
            <div className="rounded-lg border border-border p-3 space-y-2.5" data-testid="followup-form">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><CalendarPlus size={14} /> Log a follow-up</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input type="datetime-local" value={fuAt} onChange={(e) => setFuAt(e.target.value)} data-testid="followup-at-input" />
                <Select value={fuStatus || "keep"} onValueChange={(v) => setFuStatus(v === "keep" ? "" : v)}>
                  <SelectTrigger data-testid="followup-status-select" className="bg-card"><SelectValue placeholder="Keep status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep current status</SelectItem>
                    {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{LEAD_STATUS_META[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Textarea value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="Outcome / note" rows={2} data-testid="followup-note-input" />
              <Button type="button" size="sm" onClick={addFollowup} disabled={busy} data-testid="followup-save-btn" className="btn-amber border-0">Save follow-up</Button>
            </div>
          )}

          {/* Timeline */}
          {history.length > 0 && (
            <div className="space-y-2" data-testid="followup-history">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</p>
              {history.map((f) => (
                <div key={f.id} className="text-sm border-l-2 border-amber-500/40 pl-3 py-0.5">
                  <p className="text-foreground">{fmtDateTime(f.at)}{f.note ? ` · ${f.note}` : ""}</p>
                  <p className="text-[11px] text-muted-foreground">{f.created_by_name || "Someone"} · logged {fmtDateTime(f.created_at)}</p>
                </div>
              ))}
            </div>
          )}

          {editable && (
            <div className="flex items-center justify-between pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => { onOpenChange(false); onEdit?.(local); }} data-testid="lead-edit-btn">
                <PencilSimple size={14} className="mr-1.5" /> Edit details
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} data-testid="lead-delete-btn" className="text-rose-600 hover:text-rose-700 hover:bg-rose-500/10">
                <Trash size={14} className="mr-1.5" /> Delete
              </Button>
            </div>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent data-testid="lead-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes {local.name} and its follow-up history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-rose-600 hover:bg-rose-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
