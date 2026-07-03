import React, { useMemo } from "react";
import {
  Sparkle, ArrowRight, ChatCircleDots, Bus, GraduationCap, PhoneCall,
} from "@phosphor-icons/react";
import { fmtDateTime, statusLabel, LEAD_STATUS_META } from "./constants";

/**
 * Merges the lead's status transitions, follow-ups, visit schedule and
 * conversion event into a single chronologically sorted journey timeline.
 *
 * Backend fields consumed:
 *   - lead.created_at
 *   - lead.status_history[]  ({id, at, from, to, by_name, note})
 *   - lead.follow_ups[]      ({id, at, note, created_by_name, created_at})
 *   - lead.visit             ({created_at, institution, ...})
 *   - lead.converted_student_id / lead.conversion_details
 */
function buildEvents(lead) {
  if (!lead) return [];
  const events = [];

  events.push({
    kind: "created",
    at: lead.created_at,
    who: lead.created_by_name || null,
  });

  (lead.status_history || []).forEach((h) => {
    events.push({
      kind: "status",
      at: h.at,
      from: h.from,
      to: h.to,
      who: h.by_name,
      note: h.note,
      id: h.id,
    });
  });

  (lead.follow_ups || []).forEach((f) => {
    events.push({
      kind: "followup",
      at: f.created_at || f.at,
      scheduledAt: f.at,
      note: f.note,
      who: f.created_by_name,
      id: f.id,
    });
  });

  if (lead.visit && lead.visit.created_at) {
    events.push({
      kind: "visit",
      at: lead.visit.created_at,
      institution: lead.visit.institution,
      departureAt: lead.visit.departure_at,
      who: lead.visit.created_by_name,
    });
  }

  // Sort chronologically (oldest first)
  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

function EventDot({ kind }) {
  const map = {
    created: { icon: Sparkle, cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/30" },
    status: { icon: ArrowRight, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30" },
    followup: { icon: PhoneCall, cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-blue-500/30" },
    visit: { icon: Bus, cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400 ring-violet-500/30" },
    conversion: { icon: GraduationCap, cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30" },
  };
  const { icon: Icon, cls } = map[kind] || map.status;
  return (
    <span className={`w-7 h-7 rounded-full flex items-center justify-center ring-2 shrink-0 ${cls}`}>
      <Icon size={14} weight="duotone" />
    </span>
  );
}

function StatusPill({ status }) {
  const meta = LEAD_STATUS_META[status];
  if (!status) return <span className="text-xs text-muted-foreground italic">—</span>;
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
        meta ? meta.cls : "bg-muted text-muted-foreground border-border"
      }`}
    >
      {meta ? meta.label : statusLabel(status)}
    </span>
  );
}

function EventRow({ ev }) {
  const timestamp = fmtDateTime(ev.at);
  const who = ev.who ? ` · ${ev.who}` : "";

  const contentByKind = {
    created: (
      <>
        <p className="text-sm text-foreground font-medium">Lead created</p>
        <p className="text-[11px] text-muted-foreground">{timestamp}{who}</p>
      </>
    ),
    status: (
      <>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
          <StatusPill status={ev.from} />
          <ArrowRight size={12} className="text-muted-foreground" />
          <StatusPill status={ev.to} />
          {ev.note && <span className="text-xs text-muted-foreground italic">· {ev.note}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground">{timestamp}{who}</p>
      </>
    ),
    followup: (
      <>
        <p className="text-sm text-foreground">
          Follow-up scheduled for <span className="font-medium">{fmtDateTime(ev.scheduledAt)}</span>
        </p>
        {ev.note && <p className="text-sm text-muted-foreground mt-0.5">{ev.note}</p>}
        <p className="text-[11px] text-muted-foreground">{timestamp}{who}</p>
      </>
    ),
    visit: (
      <>
        <p className="text-sm text-foreground">
          Campus visit scheduled{ev.institution ? ` at ${ev.institution}` : ""}
        </p>
        {ev.departureAt && (
          <p className="text-[11px] text-muted-foreground">Departure: {fmtDateTime(ev.departureAt)}</p>
        )}
        <p className="text-[11px] text-muted-foreground">{timestamp}{who}</p>
      </>
    ),
  };

  return (
    <div
      className="flex items-start gap-3"
      data-testid={`journey-event-${ev.kind}${ev.id ? `-${ev.id}` : ""}`}
    >
      <EventDot kind={ev.kind} />
      <div className="flex-1 min-w-0 pt-0.5">
        {contentByKind[ev.kind] || (
          <>
            <p className="text-sm text-foreground">{ev.kind}</p>
            <p className="text-[11px] text-muted-foreground">{timestamp}{who}</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Journey timeline shown inside the Lead Detail dialog. Renders each event
 * with an icon dot on a vertical connector, oldest → newest.
 */
export default function LeadJourney({ lead }) {
  const events = useMemo(() => buildEvents(lead), [lead]);
  if (!lead || events.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-3.5" data-testid="lead-journey">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ChatCircleDots size={14} /> Journey
        </p>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="relative space-y-3.5 pl-1">
        {/* Vertical connector line */}
        {events.length > 1 && (
          <div className="absolute left-[14px] top-2 bottom-2 w-px bg-border" aria-hidden="true" />
        )}
        {events.map((ev, i) => (
          <EventRow key={ev.id || `${ev.kind}-${i}`} ev={ev} />
        ))}
      </div>
    </div>
  );
}
