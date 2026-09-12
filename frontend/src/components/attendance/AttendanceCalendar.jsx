import React, { useMemo } from "react";

const WD = ["S", "M", "T", "W", "T", "F", "S"];

const STATUS_DOT = {
  present: "bg-emerald-500",
  late: "bg-amber-500",
  half_day: "bg-orange-500",
  absent: "bg-rose-500",
};

const STATUS_CELL = {
  present: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  late: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  half_day: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
};

// Monthly calendar grid for the signed-in user's own attendance.
export default function AttendanceCalendar({ month, records }) {
  const [y, m] = month.split("-").map(Number);
  const byDate = useMemo(() => {
    const map = {};
    (records || []).forEach((r) => { map[r.date] = r; });
    return map;
  }, [records]);

  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1);
    const lead = first.getDay(); // 0=Sun
    const daysInMonth = new Date(y, m, 0).getDate();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isSunday = new Date(y, m - 1, d).getDay() === 0;
      out.push({ d, ds, rec: byDate[ds] || null, isSunday });
    }
    return out;
  }, [y, m, byDate]);

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div data-testid="attendance-calendar">
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {WD.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          if (!c) return <div key={`b${i}`} />;
          const status = c.rec?.status;
          const cellCls = status ? (STATUS_CELL[status] || "bg-muted border-border") : "border-transparent";
          const isToday = c.ds === todayIso;
          return (
            <div
              key={c.ds}
              data-testid={`cal-day-${c.ds}`}
              className={`aspect-square rounded-lg border flex flex-col items-center justify-center text-xs relative ${cellCls} ${c.isSunday && !status ? "opacity-45" : ""} ${isToday ? "ring-2 ring-primary" : ""}`}
            >
              <span className={`tabular-nums ${status ? "font-semibold" : "text-muted-foreground"}`}>{c.d}</span>
              {status && <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] || "bg-muted-foreground"}`} />}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Present</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Late</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Half day</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Sunday / off</span>
      </div>
    </div>
  );
}
