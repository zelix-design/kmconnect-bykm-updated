import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Bell, Check, ReceiptX, Receipt, GraduationCap, Trash, BellSlash,
} from "@phosphor-icons/react";

const TYPE_ICON = {
  expense_request: { icon: ReceiptX, palette: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  transaction: { icon: Receipt, palette: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  student_enrolled: { icon: GraduationCap, palette: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

function timeAgo(iso) {
  try {
    const t = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ""; }
}

export default function NotificationsBell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const popRef = useRef(null);

  const loadUnread = useCallback(async () => {
    if (!user || user === false) return;
    try {
      const { data } = await api.get("/notifications/unread-count");
      setUnread(data?.count || 0);
    } catch { /* silent */ }
  }, [user]);

  const loadList = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications?limit=25");
      setItems(data || []);
    } catch { /* silent */ }
  }, []);

  // Initial fetch + polling
  useEffect(() => { loadUnread(); }, [loadUnread]);
  useEffect(() => {
    if (!user || user === false) return undefined;
    const id = setInterval(loadUnread, 30000);
    return () => clearInterval(id);
  }, [user, loadUnread]);

  // Refresh on tab focus
  useEffect(() => {
    if (!user || user === false) return undefined;
    const onVisible = () => { if (document.visibilityState === "visible") loadUnread(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, loadUnread]);

  // Click-away
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const onClickItem = async (n) => {
    if (!n.read) {
      try { await api.post(`/notifications/${n.id}/read`); } catch { /* ignore */ }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) nav(n.link);
  };

  const onMarkAll = async () => {
    try { await api.post("/notifications/read-all"); } catch { /* ignore */ }
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  const onDelete = async (e, n) => {
    e.stopPropagation();
    try { await api.delete(`/notifications/${n.id}`); } catch { /* ignore */ }
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
  };

  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        data-testid="notifications-bell"
        className="relative w-10 h-10 rounded-full bg-muted/60 hover:bg-muted text-foreground flex items-center justify-center transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            data-testid="notifications-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-background"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notifications-popover"
          className="absolute right-0 mt-2 w-[360px] max-h-[480px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/40 z-50 flex flex-col"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p className="label-eyebrow">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {unread > 0 ? `${unread} unread` : "All caught up"}
              </p>
            </div>
            {unread > 0 && (
              <button
                onClick={onMarkAll}
                data-testid="notifications-mark-all"
                className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 inline-flex items-center gap-1"
              >
                <Check size={12} weight="bold" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center" data-testid="notifications-empty">
                <BellSlash size={28} weight="duotone" className="mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground mt-2">No notifications yet.</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  You'll see new expense requests, transactions and student admissions here.
                </p>
              </div>
            ) : (
              items.map((n) => {
                const meta = TYPE_ICON[n.type] || TYPE_ICON.transaction;
                const Icon = meta.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => onClickItem(n)}
                    data-testid={`notification-${n.id}`}
                    className={`group w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted/40 transition-colors flex gap-3 ${
                      n.read ? "" : "bg-orange-500/5 dark:bg-orange-500/10"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.palette}`}>
                      <Icon size={16} weight="duotone" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <p className={`text-sm flex-1 ${n.read ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                          {n.title}
                        </p>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-orange-500 mt-2 shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    <button
                      onClick={(e) => onDelete(e, n)}
                      data-testid={`notification-delete-${n.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-rose-600 self-start p-1"
                      title="Delete"
                    >
                      <Trash size={14} />
                    </button>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
