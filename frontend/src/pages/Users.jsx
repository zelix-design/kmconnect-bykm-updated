import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERMISSION_PAGES, PERMISSION_LEVELS, defaultPermissions } from "@/lib/perm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, XCircle, ClockClockwise, Buildings, Trash, MagnifyingGlass, Lock, ShieldCheck, UserPlus, Eye, EyeSlash, Key } from "@phosphor-icons/react";

const OFFICE_OPTIONS = [
  { value: "KM_BLR", label: "KM BLR" },
  { value: "KM_TCR", label: "KM TCR" },
  { value: "KM_KMLY", label: "KM KMLY" },
];

const emptyNewUser = () => ({
  email: "", password: "", name: "",
  role: "office_admin", office: "KM_BLR", currency: "INR",
});

const OFFICE_LABEL = { KM_BLR: "KM BLR", KM_TCR: "KM TCR", KM_KMLY: "KM KMLY" };

const STATUS_STYLE = {
  pending: "bg-amber-100/60 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const isSuper = currentUser?.role === "super_admin";
  const [tab, setTab] = useState("pending");
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState("");
  const [permTarget, setPermTarget] = useState(null);     // user obj when permissions dialog is open
  const [permDraft, setPermDraft] = useState({});         // working permission map
  const [permSaving, setPermSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyNewUser);
  const [createSaving, setCreateSaving] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [resetTarget, setResetTarget] = useState(null); // user obj when reset-password dialog is open
  const [resetForm, setResetForm] = useState({ new_password: "", confirm: "" });
  const [resetShow, setResetShow] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);

  const load = async (status) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/users${status === "all" ? "" : `?status=${status}`}`);
      setUsers(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(tab); }, [tab]);

  const approve = async (u) => {
    try {
      await api.patch(`/users/${u.id}/approval`, { status: "approved" });
      toast.success(`${u.name} approved`);
      load(tab);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Approve failed");
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    try {
      await api.patch(`/users/${rejecting.id}/approval`, { status: "rejected", note });
      toast.success(`${rejecting.name} rejected`);
      setRejecting(null);
      setNote("");
      load(tab);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Reject failed");
    }
  };

  const openReset = (u) => {
    setResetTarget(u);
    setResetForm({ new_password: "", confirm: "" });
    setResetShow(false);
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    const pwd = resetForm.new_password;
    if (!pwd || pwd.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (pwd !== resetForm.confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setResetSaving(true);
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { new_password: pwd });
      toast.success(`Password reset for ${resetTarget.name}`);
      setResetTarget(null);
      setResetForm({ new_password: "", confirm: "" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Reset failed");
    } finally {
      setResetSaving(false);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete user ${u.name} permanently?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("User deleted");
      load(tab);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    }
  };

  const openPermissions = (u) => {
    setPermTarget(u);
    setPermDraft({ ...defaultPermissions(), ...(u.permissions || {}) });
  };

  const savePermissions = async () => {
    if (!permTarget) return;
    setPermSaving(true);
    try {
      await api.patch(`/users/${permTarget.id}/permissions`, { permissions: permDraft });
      toast.success(`Permissions updated for ${permTarget.name}`);
      setPermTarget(null);
      load(tab);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setPermSaving(false);
    }
  };

  const submitCreate = async (e) => {
    e?.preventDefault();
    const f = createForm;
    if (!f.email.trim() || !f.password || !f.name.trim()) {
      toast.error("Email, password and name are required"); return;
    }
    if (f.password.length < 6) {
      toast.error("Password must be at least 6 characters"); return;
    }
    if (f.role === "office_admin" && !f.office) {
      toast.error("Pick the office for the office admin"); return;
    }
    setCreateSaving(true);
    try {
      const payload = {
        email: f.email.trim().toLowerCase(),
        password: f.password,
        name: f.name.trim(),
        role: f.role,
        currency: f.currency || "INR",
        ...(f.role === "office_admin" ? { office: f.office } : {}),
      };
      const { data } = await api.post("/users", payload);
      toast.success(`${data.name} created · can sign in immediately`);
      setCreateOpen(false);
      setCreateForm(emptyNewUser());
      setShowPwd(false);
      // Show approved tab so the new user is visible (super_admin role always goes there too)
      setTab("approved");
      load("approved");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Create failed");
    } finally {
      setCreateSaving(false);
    }
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const TABS = [
    { value: "pending", label: "Pending", icon: ClockClockwise },
    { value: "approved", label: "Approved", icon: CheckCircle },
    { value: "rejected", label: "Rejected", icon: XCircle },
    { value: "all", label: "All" },
  ];

  return (
    <div className="space-y-6" data-testid="users-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">Access control</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Team & approvals</h1>
          <p className="text-sm text-muted-foreground mt-1">Approve new office-admin signups, create users directly, and manage access.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="users-search"
            />
          </div>
          {isSuper && (
            <Button
              type="button"
              onClick={() => { setCreateForm(emptyNewUser()); setShowPwd(false); setCreateOpen(true); }}
              className="h-10 btn-amber border-0 shrink-0"
              data-testid="create-user-btn"
            >
              <UserPlus size={16} className="mr-1.5" /> Create user
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2" data-testid="users-tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            data-testid={`users-tab-${t.value}`}
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

      {/* List */}
      {loading ? (
        <div className="text-sm text-muted-foreground" data-testid="users-loading">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center" data-testid="users-empty">
          <p className="text-sm text-muted-foreground">No users to show.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="users-list">
          {filtered.map((u) => (
            <Card key={u.id} className="p-5 flex items-start gap-4" data-testid={`user-card-${u.id}`}>
              <div className="w-11 h-11 rounded-full bg-amber-gradient text-white font-display font-semibold flex items-center justify-center shrink-0">
                {(u.name || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-foreground truncate">{u.name}</p>
                  <Badge className={`${STATUS_STYLE[u.approval_status] || ""} border-0`}>{u.approval_status}</Badge>
                  {u.role === "super_admin" && <Badge variant="outline">super admin</Badge>}
                  {u.role === "user" && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">user</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {u.office && (
                    <span className="inline-flex items-center gap-1">
                      <Buildings size={12} /> {OFFICE_LABEL[u.office] || u.office}
                    </span>
                  )}
                  <span>· joined {new Date(u.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {u.role !== "super_admin" && (
                <div className="flex flex-col gap-2 shrink-0">
                  {u.approval_status !== "approved" && (
                    <Button size="sm" onClick={() => approve(u)} data-testid={`approve-${u.id}`} className="btn-amber border-0 h-8">
                      <CheckCircle size={14} className="mr-1" /> Approve
                    </Button>
                  )}
                  {u.approval_status !== "rejected" && (
                    <Button size="sm" variant="outline" onClick={() => setRejecting(u)} data-testid={`reject-${u.id}`} className="h-8 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400">
                      <XCircle size={14} className="mr-1" /> Reject
                    </Button>
                  )}
                  {u.approval_status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => openPermissions(u)} data-testid={`permissions-${u.id}`} className="h-8">
                      <Lock size={14} className="mr-1" /> Permissions
                    </Button>
                  )}
                  {u.id !== currentUser?.id && (
                    <Button size="sm" variant="outline" onClick={() => openReset(u)} data-testid={`reset-pwd-${u.id}`} className="h-8">
                      <Key size={14} className="mr-1" /> Reset password
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(u)} data-testid={`delete-${u.id}`} className="h-8 text-muted-foreground hover:text-rose-600">
                    <Trash size={14} />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) { setRejecting(null); setNote(""); } }}>
        <DialogContent data-testid="reject-dialog">
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.name}?</DialogTitle>
            <DialogDescription>They won't be able to sign in. You can add a note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-note">Note (optional)</Label>
            <Input id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason…" data-testid="reject-note" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button onClick={reject} data-testid="reject-confirm" className="bg-rose-600 hover:bg-rose-700 text-white">Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions dialog */}
      <Dialog open={!!permTarget} onOpenChange={(o) => { if (!o) setPermTarget(null); }}>
        <DialogContent className="max-w-lg" data-testid="permissions-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={20} weight="duotone" className="text-orange-600 dark:text-orange-400" />
              {permTarget?.name} · permissions
            </DialogTitle>
            <DialogDescription>
              Control what this office-admin can see and edit. Changes take effect on their next sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[55vh] overflow-y-auto py-2" data-testid="permissions-list">
            {PERMISSION_PAGES.map((p) => (
              <div key={p.key} className="rounded-lg border border-border bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-3" data-testid={`perm-row-${p.key}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.label}</p>
                  <p className="text-[11px] text-muted-foreground">page key: <code>{p.key}</code></p>
                </div>
                <div className="flex gap-1 shrink-0 bg-muted/40 rounded-lg p-1">
                  {PERMISSION_LEVELS.map((lv) => {
                    const active = (permDraft[p.key] || "edit") === lv.value;
                    return (
                      <button
                        key={lv.value}
                        type="button"
                        onClick={() => setPermDraft({ ...permDraft, [p.key]: lv.value })}
                        data-testid={`perm-${p.key}-${lv.value}`}
                        title={lv.hint}
                        className={`px-3 py-1 text-xs rounded-md transition-all ${
                          active
                            ? lv.value === "edit"
                              ? "bg-amber-gradient text-white shadow-sm"
                              : lv.value === "view"
                              ? "bg-sky-500 text-white shadow-sm"
                              : "bg-rose-500 text-white shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {lv.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPermDraft(defaultPermissions())} data-testid="perm-reset" className="sm:mr-auto">
              Reset to default (all edit)
            </Button>
            <Button variant="outline" onClick={() => setPermTarget(null)}>Cancel</Button>
            <Button onClick={savePermissions} disabled={permSaving} data-testid="perm-save" className="btn-amber border-0">
              {permSaving ? "Saving…" : "Save permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateForm(emptyNewUser()); setShowPwd(false); } }}>
        <DialogContent className="max-w-lg" data-testid="create-user-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <UserPlus size={18} weight="duotone" className="text-orange-600 dark:text-orange-400" />
              Create user
            </DialogTitle>
            <DialogDescription>
              Add a user directly — they'll be approved immediately and can sign in with the password you set.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <div>
              <Label>Full name <span className="text-rose-600">*</span></Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Jane Doe"
                data-testid="cu-name"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Email <span className="text-rose-600">*</span></Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="user@finflow.com"
                  data-testid="cu-email"
                  required
                />
              </div>
              <div>
                <Label>Password <span className="text-rose-600">*</span></Label>
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Min 6 characters"
                    data-testid="cu-password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    data-testid="cu-toggle-pwd"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    title={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Share this password with the user securely.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Role <span className="text-rose-600">*</span></Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v) => setCreateForm({ ...createForm, role: v })}
                >
                  <SelectTrigger data-testid="cu-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="office_admin">Office Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="user">User (personal finance)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {createForm.role === "office_admin" ? (
                <div>
                  <Label>Office <span className="text-rose-600">*</span></Label>
                  <Select
                    value={createForm.office}
                    onValueChange={(v) => setCreateForm({ ...createForm, office: v })}
                  >
                    <SelectTrigger data-testid="cu-office"><SelectValue placeholder="Pick office" /></SelectTrigger>
                    <SelectContent>
                      {OFFICE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Currency</Label>
                  <Select
                    value={createForm.currency}
                    onValueChange={(v) => setCreateForm({ ...createForm, currency: v })}
                  >
                    <SelectTrigger data-testid="cu-currency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR (₹)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {createForm.role === "super_admin" ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-gradient-soft p-3 text-xs flex items-start gap-2.5" data-testid="cu-super-warning">
                <ShieldCheck size={16} weight="fill" className="text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                <span className="text-foreground">
                  <strong>Super Admin</strong> gets full access to every page across all offices and can manage other users. Use sparingly.
                </span>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/10 p-3 text-xs flex items-start gap-2.5">
                <CheckCircle size={16} weight="fill" className="text-emerald-700 dark:text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-foreground">
                  Office admins are created with <strong>all 8 pages set to edit</strong>. Fine-tune via the Permissions button on their card after creation.
                </span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createSaving} className="btn-amber border-0" data-testid="cu-save">
                <UserPlus size={14} className="mr-1.5" />
                {createSaving ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password dialog (super_admin only) */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setResetForm({ new_password: "", confirm: "" });
            setResetShow(false);
          }
        }}
      >
        <DialogContent data-testid="reset-pwd-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key size={20} weight="duotone" className="text-amber-500" />
              Reset password for {resetTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Set a new password directly. The user can sign in with the new password
              immediately. They will not receive any email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 inline-block">New password</label>
              <div className="relative">
                <Input
                  type={resetShow ? "text" : "password"}
                  value={resetForm.new_password}
                  onChange={(e) => setResetForm({ ...resetForm, new_password: e.target.value })}
                  placeholder="Min 8 characters"
                  data-testid="reset-pwd-new"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setResetShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="reset-pwd-toggle"
                >
                  {resetShow ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 inline-block">Confirm new password</label>
              <Input
                type={resetShow ? "text" : "password"}
                value={resetForm.confirm}
                onChange={(e) => setResetForm({ ...resetForm, confirm: e.target.value })}
                placeholder="Type the same password again"
                data-testid="reset-pwd-confirm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Make a note of this password and share it with{" "}
              <strong>{resetTarget?.name}</strong> securely.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button
              onClick={submitReset}
              disabled={resetSaving}
              className="btn-amber border-0"
              data-testid="reset-pwd-save"
            >
              {resetSaving ? "Saving…" : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
