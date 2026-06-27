import React, { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, CalendarCheck, Check, X, Trash, Clock } from "@phosphor-icons/react";
import LeaveRequestDialog, { LEAVE_TYPES } from "@/components/leave/LeaveRequestDialog";

const STATUS_META = {
  pending: { label: "Pending", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  approved: { label: "Approved", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  rejected: { label: "Rejected", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" },
};
const typeLabel = (v) => LEAVE_TYPES.find((t) => t.value === v)?.label || v;
const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");

function LeaveCard({ r, showRequester, canDecide, onDecide, onCancel, busy }) {
  const meta = STATUS_META[r.status] || STATUS_META.pending;
  return (
    <Card className="p-4" data-testid={`leave-card-${r.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showRequester && <p className="font-medium text-foreground truncate">{r.requester_name} <span className="text-xs text-muted-foreground">· {r.requester_role === "office_admin" ? "Office Admin" : "Staff"}</span></p>}
          <p className={`text-sm ${showRequester ? "text-muted-foreground" : "text-foreground font-medium"}`}>
            {typeLabel(r.leave_type)} · <span className="tabular-nums">{r.days}</span> day{r.days > 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{fmt(r.from_date)} → {fmt(r.to_date)}</p>
          {r.reason && <p className="text-xs text-muted-foreground mt-1.5 bg-muted/40 rounded p-2">{r.reason}</p>}
          {r.status !== "pending" && r.approver_name && (
            <p className="text-[11px] text-muted-foreground mt-1.5">{meta.label} by {r.approver_name}{r.decision_note ? ` · "${r.decision_note}"` : ""}</p>
          )}
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${meta.cls}`} data-testid={`leave-status-${r.id}`}>{meta.label}</span>
      </div>
      {r.status === "pending" && (canDecide || onCancel) && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          {canDecide ? (
            <>
              <Button size="sm" className="h-8 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => onDecide(r, "approved")} data-testid={`leave-approve-${r.id}`}>
                <Check size={14} className="mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="h-8 flex-1 text-rose-600 hover:text-rose-700" disabled={busy} onClick={() => onDecide(r, "rejected")} data-testid={`leave-reject-${r.id}`}>
                <X size={14} className="mr-1" /> Reject
              </Button>
            </>
          ) : onCancel ? (
            <Button size="sm" variant="ghost" className="h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10" disabled={busy} onClick={() => onCancel(r)} data-testid={`leave-cancel-${r.id}`}>
              <Trash size={14} className="mr-1" /> Cancel request
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

export default function Leave() {
  const { user } = useAuth();
  const isApprover = user?.role === "super_admin" || user?.role === "office_admin";
  const [tab, setTab] = useState("mine");
  const [mine, setMine] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const reqs = [api.get("/leave?box=mine")];
      if (isApprover) reqs.push(api.get("/leave?box=inbox"));
      const res = await Promise.all(reqs);
      setMine(res[0].data);
      if (isApprover) setInbox(res[1].data);
    } catch (err) {
      console.error("[leave] fetch failed:", err);
      toast.error("Could not load leave");
    } finally { setLoading(false); }
  }, [isApprover]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const decide = async (r, status) => {
    let note = "";
    if (status === "rejected") {
      note = window.prompt("Reason for rejection (optional):") || "";
    }
    setBusy(true);
    try {
      await api.patch(`/leave/${r.id}`, { status, note });
      toast.success(`Leave ${status}`);
      fetchAll();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Action failed");
    } finally { setBusy(false); }
  };

  const cancel = async (r) => {
    setBusy(true);
    try {
      await api.delete(`/leave/${r.id}`);
      toast.success("Request cancelled");
      fetchAll();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Could not cancel");
    } finally { setBusy(false); }
  };

  const pendingInbox = inbox.filter((r) => r.status === "pending").length;
  const list = tab === "mine" ? mine : inbox;

  return (
    <div className="space-y-6" data-testid="leave-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow">Time off</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Leave</h1>
          <p className="text-sm text-muted-foreground mt-1">Request time off and track approvals.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="request-leave-btn" className="btn-amber border-0">
          <Plus size={16} className="mr-1.5" /> Request leave
        </Button>
      </div>

      {isApprover && (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setTab("mine")} data-testid="leave-tab-mine"
            className={`text-sm px-4 py-2 rounded-full border transition-colors ${tab === "mine" ? "bg-amber-gradient text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}>
            My requests
          </button>
          <button type="button" onClick={() => setTab("inbox")} data-testid="leave-tab-inbox"
            className={`text-sm px-4 py-2 rounded-full border transition-colors ${tab === "inbox" ? "bg-amber-gradient text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}>
            Approvals {pendingInbox > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300 text-[10px]">{pendingInbox}</span>}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : list.length === 0 ? (
        <Card className="py-16 text-center" data-testid="leave-empty">
          <CalendarCheck size={40} className="mx-auto text-muted-foreground mb-3" weight="duotone" />
          <p className="text-foreground font-medium">{tab === "mine" ? "No leave requests yet" : "No requests to review"}</p>
          <p className="text-sm text-muted-foreground mt-1">{tab === "mine" ? "Tap 'Request leave' to submit one." : "Requests from your team will show up here."}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="leave-list">
          {list.map((r) => (
            <LeaveCard
              key={r.id}
              r={r}
              showRequester={tab === "inbox"}
              canDecide={tab === "inbox"}
              onDecide={decide}
              onCancel={tab === "mine" ? cancel : null}
              busy={busy}
            />
          ))}
        </div>
      )}

      <LeaveRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmitted={fetchAll} />
    </div>
  );
}
