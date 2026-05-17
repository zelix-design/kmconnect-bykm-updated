import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, CheckCircle, XCircle, ClockClockwise, CurrencyInr,
  Buildings, X, ReceiptX, ArrowRight,
} from "@phosphor-icons/react";
import { formatMoney } from "@/lib/format";

const OFFICE_LABEL = { KM_BLR: "KM BLR", KM_TCR: "KM TCR", KM_KMLY: "KM KMLY" };
const STATUS_STYLE = {
  pending: "bg-amber-100/60 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseRequests() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const currency = user?.currency || "INR";

  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [actioning, setActioning] = useState(null); // {req, mode: 'approve'|'reject'}

  // For office admin: account + category lists (for creating a request)
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);

  // For super admin: when approving, we need the requester's accounts
  const [requesterAccounts, setRequesterAccounts] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/expense-requests${tab === "all" ? "" : `?status=${tab}`}`);
      setRequests(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [tab]);

  useEffect(() => {
    if (!isSuper) {
      Promise.all([api.get("/accounts"), api.get("/categories")])
        .then(([a, c]) => { setAccounts(a.data); setCategories(c.data); })
        .catch(() => {});
    }
  }, [isSuper]);

  // ----- Office admin: create request -----
  const [form, setForm] = useState({
    amount: "", category_id: "", account_id: "", date: todayISO(),
    description: "", urgency: "normal", kind: "expense",
  });
  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories]);

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Amount must be > 0");
    if (!form.date) return toast.error("Pick a date");
    try {
      await api.post("/expense-requests", {
        ...form,
        amount: Number(form.amount),
        category_id: form.category_id || null,
        account_id: form.account_id || null,
      });
      toast.success("Request submitted for approval");
      setCreateOpen(false);
      setForm({ amount: "", category_id: "", account_id: "", date: todayISO(), description: "", urgency: "normal", kind: "expense" });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Submit failed");
    }
  };

  // ----- Super admin: approve / reject -----
  const [approveAccountId, setApproveAccountId] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const openAction = async (req, mode) => {
    setActioning({ req, mode });
    setDecisionNote("");
    if (mode === "approve" && isSuper) {
      try {
        const { data } = await api.get(`/accounts?for_user_id=${req.requested_by_user_id}`);
        // Backend may not support for_user_id yet; if so, prompt manually
        setRequesterAccounts(Array.isArray(data) ? data : []);
      } catch {
        setRequesterAccounts([]);
      }
      setApproveAccountId(req.account_id || "");
    }
  };

  const submitDecision = async () => {
    if (!actioning) return;
    const { req, mode } = actioning;
    try {
      if (mode === "approve") {
        const accId = approveAccountId || req.account_id;
        if (!accId) return toast.error("Account is required");
        await api.post(`/expense-requests/${req.id}/approve`, { account_id: accId, note: decisionNote });
        toast.success("Request approved · transaction created");
      } else {
        await api.post(`/expense-requests/${req.id}/reject`, { note: decisionNote });
        toast.success("Request rejected");
      }
      setActioning(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const cancelRequest = async (req) => {
    if (!window.confirm("Cancel this request?")) return;
    try {
      await api.delete(`/expense-requests/${req.id}`);
      toast.success("Cancelled");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const TABS = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="space-y-6" data-testid="expense-requests-page">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">{isSuper ? "Approvals" : "My requests"}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {isSuper ? "Expense approvals" : "Office expense requests"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSuper
              ? "Review pending office-admin requests. Approving creates the expense transaction automatically."
              : "Raise an office expense or salary. A super admin will review and approve."}
          </p>
        </div>
        {!isSuper && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-request-btn" className="btn-amber border-0">
                <Plus size={16} className="mr-1.5" /> New request
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="new-request-dialog">
              <DialogHeader>
                <DialogTitle>New expense request</DialogTitle>
                <DialogDescription>Submit for super-admin approval.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submitCreate} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="kind">Kind</Label>
                    <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                      <SelectTrigger id="kind" data-testid="req-kind" className="bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Office expense</SelectItem>
                        <SelectItem value="salary">Salary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="urgency">Urgency</Label>
                    <Select value={form.urgency} onValueChange={(v) => setForm({ ...form, urgency: v })}>
                      <SelectTrigger id="urgency" data-testid="req-urgency" className="bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Amount</Label>
                    <Input id="amount" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="req-amount" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="date">Date</Label>
                    <Input id="date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="req-date" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">Category (optional)</Label>
                  <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                    <SelectTrigger id="category" data-testid="req-category" className="bg-card"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                    <SelectContent>
                      {expenseCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account">Suggest account to debit (optional)</Label>
                  <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                    <SelectTrigger id="account" data-testid="req-account" className="bg-card"><SelectValue placeholder="Suggested account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description / reason</Label>
                  <Textarea id="description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="req-description" placeholder="Stationery for office, salary for Ravi, etc." />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" data-testid="req-save" className="btn-amber border-0">Submit for approval</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap gap-2" data-testid="req-tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            data-testid={`req-tab-${t.value}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              tab === t.value
                ? "bg-amber-gradient text-white shadow-md shadow-orange-500/25"
                : "bg-card border border-border text-foreground hover:bg-muted/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground" data-testid="req-loading">Loading…</div>
      ) : requests.length === 0 ? (
        <Card className="p-10 text-center" data-testid="req-empty">
          <ReceiptX size={32} weight="duotone" className="mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No {tab === "all" ? "" : tab} requests.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="req-list">
          {requests.map((r) => (
            <Card key={r.id} className="p-5 space-y-3" data-testid={`req-card-${r.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display text-2xl font-semibold tabular-nums">
                      {formatMoney(r.amount, currency)}
                    </p>
                    <Badge className={`${STATUS_STYLE[r.status] || ""} border-0`}>{r.status}</Badge>
                    {r.kind === "salary" && <Badge variant="outline">salary</Badge>}
                    {r.urgency === "urgent" && (
                      <Badge className="bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border-0">urgent</Badge>
                    )}
                  </div>
                  {r.description && <p className="text-sm text-foreground mt-1">{r.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {new Date(r.date).toLocaleDateString()}
                    {isSuper && r.requested_by_name && (
                      <> · by <span className="font-medium">{r.requested_by_name}</span></>
                    )}
                    {r.requester_office && (
                      <> · <span className="inline-flex items-center gap-1"><Buildings size={11} /> {OFFICE_LABEL[r.requester_office]}</span></>
                    )}
                  </p>
                  {r.decision_note && r.status !== "pending" && (
                    <p className="text-xs text-muted-foreground mt-1 italic">Note: {r.decision_note}</p>
                  )}
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <CurrencyInr size={18} weight="duotone" />
                </div>
              </div>

              {r.status === "pending" && (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  {isSuper ? (
                    <>
                      <Button size="sm" onClick={() => openAction(r, "approve")} data-testid={`approve-${r.id}`} className="btn-amber border-0 h-8 flex-1">
                        <CheckCircle size={14} className="mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openAction(r, "reject")} data-testid={`reject-${r.id}`} className="h-8 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400">
                        <XCircle size={14} className="mr-1" /> Reject
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <ClockClockwise size={12} /> Awaiting super-admin
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => cancelRequest(r)} data-testid={`cancel-${r.id}`} className="ml-auto h-8 text-muted-foreground hover:text-rose-600">
                        <X size={14} className="mr-1" /> Cancel
                      </Button>
                    </>
                  )}
                </div>
              )}
              {r.status === "approved" && r.linked_transaction_id && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5 pt-2 border-t border-border">
                  <CheckCircle size={12} weight="fill" /> Logged as expense transaction <ArrowRight size={11} />
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Action dialog (approve/reject) */}
      <Dialog open={!!actioning} onOpenChange={(o) => { if (!o) setActioning(null); }}>
        <DialogContent data-testid="action-dialog">
          <DialogHeader>
            <DialogTitle>
              {actioning?.mode === "approve" ? "Approve request" : "Reject request"}
            </DialogTitle>
            <DialogDescription>
              {actioning?.mode === "approve"
                ? "An expense transaction will be created on the requester's books in the chosen account."
                : "The requester will see this status. You can add a note."}
            </DialogDescription>
          </DialogHeader>
          {actioning?.mode === "approve" && (
            <div className="space-y-1.5">
              <Label>Account to debit</Label>
              <Select value={approveAccountId} onValueChange={setApproveAccountId}>
                <SelectTrigger className="bg-card" data-testid="approve-account-select">
                  <SelectValue placeholder="Pick requester's account" />
                </SelectTrigger>
                <SelectContent>
                  {(requesterAccounts.length ? requesterAccounts : []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                  {requesterAccounts.length === 0 && actioning.req?.account_id && (
                    <SelectItem value={actioning.req.account_id}>(Suggested account)</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Defaults to the requester's suggested account.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} data-testid="decision-note" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActioning(null)}>Cancel</Button>
            <Button
              onClick={submitDecision}
              data-testid="action-confirm"
              className={actioning?.mode === "approve" ? "btn-amber border-0" : "bg-rose-600 hover:bg-rose-700 text-white"}
            >
              {actioning?.mode === "approve" ? "Approve & create txn" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
