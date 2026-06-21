import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Megaphone, X, ArrowRight, CalendarBlank } from "@phosphor-icons/react";

const PRIO_CLS = {
  urgent: "border-rose-500/40 bg-rose-50/60 dark:bg-rose-500/10",
  normal: "border-amber-500/30 bg-amber-gradient-soft",
  low:    "border-border bg-card",
};
const PRIO_ICON_CLS = {
  urgent: "text-rose-700 dark:text-rose-400",
  normal: "text-amber-700 dark:text-amber-400",
  low:    "text-muted-foreground",
};

/** Pinned banner stack of un-dismissed announcement messages addressed to me.
 * Polls `/messages/banners` on mount + when bumper changes. Each banner has a
 * dismiss button that hides it forever for THIS user only.
 */
export default function AnnouncementBanners({ bumper = 0 }) {
  const [banners, setBanners] = useState([]);

  const load = async () => {
    try {
      const r = await api.get("/messages/banners");
      setBanners(r.data || []);
    } catch (_e) { /* silent */ }
  };

  useEffect(() => { load(); }, [bumper]);

  const dismiss = async (id) => {
    try {
      await api.post(`/messages/${id}/dismiss`);
      setBanners((b) => b.filter((x) => x.id !== id));
    } catch (_e) { /* silent */ }
  };

  if (banners.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="announcement-banners">
      {banners.map((b) => {
        const prio = b.priority || "normal";
        return (
          <div
            key={b.id}
            data-testid={`banner-${b.id}`}
            className={`rounded-lg border ${PRIO_CLS[prio]} px-4 py-3 flex items-start gap-3`}
          >
            <Megaphone size={18} weight="duotone" className={`${PRIO_ICON_CLS[prio]} mt-0.5 shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {prio === "urgent" && (
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-400">
                    URGENT
                  </span>
                )}
                <p className="text-sm font-semibold text-foreground" data-testid={`banner-subject-${b.id}`}>
                  {b.subject}
                </p>
              </div>
              <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{b.body}</p>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                <span>From {b.sender_name}</span>
                {b.due_date && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarBlank size={10} /> Due {new Date(b.due_date).toLocaleDateString()}
                  </span>
                )}
                <Link
                  to={`/messages/${b.id}`}
                  data-testid={`banner-open-${b.id}`}
                  className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 hover:underline"
                >
                  Open <ArrowRight size={10} />
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(b.id)}
              className="text-muted-foreground hover:text-foreground p-1 -mr-1 shrink-0"
              data-testid={`banner-dismiss-${b.id}`}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
