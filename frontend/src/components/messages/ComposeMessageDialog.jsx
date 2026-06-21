import React, { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Megaphone, Clock, PaperPlaneRight, X,
} from "@phosphor-icons/react";

const PRIORITIES = [
  { value: "low",    label: "Low",    color: "text-muted-foreground" },
  { value: "normal", label: "Normal", color: "text-foreground" },
  { value: "urgent", label: "Urgent", color: "text-rose-600 dark:text-rose-400" },
];

const OFFICE_OPTIONS = [
  { value: "KM_BLR", label: "KM BLR" },
  { value: "KM_TCR", label: "KM TCR" },
  { value: "KM_KMLY", label: "KM KMLY" },
];

const KIND_META = {
  announcement: { icon: Megaphone, label: "Announcement", color: "text-amber-700 dark:text-amber-400" },
  reminder:     { icon: Clock,     label: "Reminder",     color: "text-sky-700 dark:text-sky-400" },
};

/** Role-aware composer for Announcement / Reminder. The parent owns `open`
 * + onOpenChange + onSent. Internally derives the available "send-to" options
 * from the current user's role:
 *
 *   super_admin  : Announcement to (User | Office Admin), Reminder to anyone
 *   office_admin : Announcement to peer Office Admins, Reminder to Super Admin
 *   user         : Reminder to Super Admin
 */
export default function ComposeMessageDialog({ open, onOpenChange, onSent }) {
  const { user } = useAuth();
  const role = user?.role;
  const myOffice = user?.office;

  const allowedKinds = useMemo(() => {
    if (role === "super_admin") return ["announcement", "reminder"];
    if (role === "office_admin") return ["announcement", "reminder"];
    if (role === "user") return ["reminder"];
    return [];
  }, [role]);

  const [kind, setKind] = useState(allowedKinds[0] || "announcement");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [sending, setSending] = useState(false);

  // Audience controls
  const [audRole, setAudRole] = useState("user");         // super_admin announcement → user|office_admin
  const [audOfficeFilter, setAudOfficeFilter] = useState(""); // optional office scope
  const [selectedUserIds, setSelectedUserIds] = useState([]);   // reminder picker
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerOptions, setPickerOptions] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setKind(allowedKinds[0] || "announcement");
      setSubject(""); setBody("");
      setPriority("normal"); setDueDate("");
      setAudRole("user"); setAudOfficeFilter("");
      setSelectedUserIds([]); setPickerSearch("");
    }
  }, [open, allowedKinds]);

  // Load picker options when audience needs user-list
  useEffect(() => {
    if (!open) return;
    const needsUsers =
      kind === "reminder"
      || (role === "super_admin" && kind === "announcement"); // not needed but harmless to skip
    if (kind !== "reminder") return;
    let cancel = false;
    (async () => {
      setPickerLoading(true);
      try {
        // For office_admin & user: only need super_admins
        // For super_admin: load all approved users
        const r = await api.get("/users?status=approved");
        if (cancel) return;
        let opts = r.data || [];
        if (role !== "super_admin") {
          opts = opts.filter((u) => u.role === "super_admin");
        }
        setPickerOptions(opts);
      } catch (e) {
        console.error("[compose] picker load failed:", e);
      } finally {
        setPickerLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, kind, role]);

  // Build the audience object that goes to the API
  const buildAudience = () => {
    if (kind === "announcement") {
      if (role === "super_admin") {
        return audOfficeFilter && audRole === "office_admin"
          ? { type: "role_office", role: "office_admin", office: audOfficeFilter }
          : { type: "role", role: audRole };
      }
      // office_admin announcing to peers at their office
      return { type: "role_office", role: "office_admin", office: myOffice };
    }
    // reminder
    return { type: "users", user_ids: selectedUserIds };
  };

  const canSubmit = () => {
    if (!subject.trim() || !body.trim()) return false;
    if (kind === "reminder" && selectedUserIds.length === 0) return false;
    if (kind === "announcement" && role === "office_admin" && !myOffice) return false;
    return true;
  };

  const submit = async () => {
    if (!canSubmit()) {
      toast.error("Fill subject, message, and pick at least one recipient.");
      return;
    }
    setSending(true);
    try {
      const payload = {
        kind,
        subject: subject.trim(),
        body: body.trim(),
        priority,
        due_date: dueDate || null,
        audience: buildAudience(),
      };
      const { data } = await api.post("/messages", payload);
      toast.success(`Sent to ${data.recipient_ids?.length || 0} recipient(s)`);
      onSent?.(data);
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not send");
    } finally {
      setSending(false);
    }
  };

  // Picker label
  const togglePick = (uid) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };
  const filteredPicker = useMemo(() => {
    if (!pickerSearch) return pickerOptions;
    const s = pickerSearch.toLowerCase();
    return pickerOptions.filter(
      (u) => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s)
    );
  }, [pickerOptions, pickerSearch]);

  if (allowedKinds.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="compose-message-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <PaperPlaneRight size={18} weight="duotone" className="text-orange-600 dark:text-orange-400" />
            New message
          </DialogTitle>
          <DialogDescription>
            {role === "super_admin" && "Send a broadcast announcement to users / office admins, or a focused reminder to a specific person."}
            {role === "office_admin" && "Announce to your office peers, or send a reminder upward to a super admin."}
            {role === "user" && "Send a reminder to a super admin (e.g. profile changes, follow-up, escalation)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Kind selector */}
          {allowedKinds.length > 1 && (
            <div className="grid grid-cols-2 gap-2" data-testid="compose-kind-row">
              {allowedKinds.map((k) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    data-testid={`compose-kind-${k}`}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      active
                        ? "border-amber-500/60 bg-amber-gradient-soft ring-2 ring-orange-500/30"
                        : "border-border bg-card hover:border-orange-500/30"
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${meta.color}`}>
                      <Icon size={14} weight={active ? "fill" : "regular"} />
                      {meta.label}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {k === "announcement"
                        ? "Broadcast · everyone matched sees a pinned banner"
                        : "Focused · pick a specific person + optional due date"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Audience controls */}
          {kind === "announcement" && role === "super_admin" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="compose-audience-row">
              <div>
                <Label>Send to</Label>
                <Select value={audRole} onValueChange={setAudRole}>
                  <SelectTrigger data-testid="compose-aud-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">All Users (sub-agents / consultants)</SelectItem>
                    <SelectItem value="office_admin">All Office Admins</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {audRole === "office_admin" && (
                <div>
                  <Label>Scope (optional)</Label>
                  <Select
                    value={audOfficeFilter || "_all"}
                    onValueChange={(v) => setAudOfficeFilter(v === "_all" ? "" : v)}
                  >
                    <SelectTrigger data-testid="compose-aud-office"><SelectValue placeholder="All offices" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All offices</SelectItem>
                      {OFFICE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {kind === "announcement" && role === "office_admin" && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground" data-testid="compose-peer-info">
              Sending to <strong className="text-foreground">all office admins at {OFFICE_OPTIONS.find((o) => o.value === myOffice)?.label || myOffice}</strong> (your peers).
            </div>
          )}

          {kind === "reminder" && (
            <div data-testid="compose-picker-block">
              <Label>{role === "super_admin" ? "Recipients" : "Send to (super admin)"}</Label>
              <div className="mt-1 rounded-md border border-border bg-card">
                <div className="border-b border-border p-2">
                  <Input
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="h-8 text-sm"
                    data-testid="compose-picker-search"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {pickerLoading ? (
                    <div className="p-3 text-xs text-muted-foreground">Loading…</div>
                  ) : filteredPicker.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">No matching users.</div>
                  ) : filteredPicker.map((u) => {
                    const checked = selectedUserIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/30 ${checked ? "bg-amber-gradient-soft/40" : ""}`}
                        data-testid={`compose-picker-opt-${u.id}`}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => togglePick(u.id)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{u.name}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {u.role === "super_admin" ? "Super Admin" : u.role === "office_admin" ? "Office Admin" : "User"}
                            {" · "}{u.email}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              {selectedUserIds.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">{selectedUserIds.length} selected</p>
              )}
            </div>
          )}

          <div>
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick subject line"
              data-testid="compose-subject"
              maxLength={200}
            />
          </div>

          <div>
            <Label>Message</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type the message…"
              data-testid="compose-body"
              maxLength={4000}
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{body.length}/4000</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="compose-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={p.color}>{p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due date (optional)</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="compose-duedate"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X size={14} className="mr-1.5" /> Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={sending || !canSubmit()}
            className="btn-amber border-0"
            data-testid="compose-send"
          >
            <PaperPlaneRight size={14} className="mr-1.5" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
