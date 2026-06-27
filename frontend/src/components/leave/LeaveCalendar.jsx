import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { LEAVE_TYPES } from "./LeaveRequestDialog";

const TYPE_COLOR = {
  casual: "bg-sky-500", sick: "bg-rose-500", earned: "bg-emerald-500", unpaid: "bg-stone-500",
};
const pad = (n) => String(n).padStart(2, "0");

export default function LeaveCalendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
  const [items, setItems] = useState([]);

  useEffect(() => {
    const month = `${cursor.y}-${pad(cursor.m)}`;
    api.get(`/leave/calendar?month=${month}`).then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, [cursor]);

  const first = new Date(cursor.y, cursor.m - 1, 1);
  const daysInMonth = new Date(cursor.y, cursor.m, 0).getDate();
  const startWeekday = first.getDay();
  const monthLabel = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const dayLeaves = (day) => {
    const d = `${cursor.y}-${pad(cursor.m)}-${pad(day)}`;
    return items.filter((it) => it.from_date <= d && it.to_date >= d);
  };
  const prev = () => setCursor((c) => (c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCursor((c) => (c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }));

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div data-testid="leave-calendar" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold" data-testid="cal-month-label">{monthLabel}</h3>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev} data-testid="cal-prev"><CaretLeft size={16} /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={next} data-testid="cal-next"><CaretRight size={16} /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1 font-medium">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div key={i} className={`min-h-[64px] rounded-lg border p-1 ${day ? "border-border bg-card" : "border-transparent"}`}>
            {day && (
              <>
                <span className="text-xs text-foreground">{day}</span>
                <div className="space-y-0.5 mt-0.5">
                  {dayLeaves(day).slice(0, 3).map((it) => (
                    <div key={it.id + "-" + day} className="flex items-center gap-1 truncate" title={`${it.requester_name} · ${it.leave_type}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_COLOR[it.leave_type] || "bg-stone-400"}`} />
                      <span className="text-[9px] text-muted-foreground truncate">{(it.requester_name || "").split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground pt-1">
        {LEAVE_TYPES.map((t) => (
          <span key={t.value} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${TYPE_COLOR[t.value]}`} />{t.label}</span>
        ))}
      </div>
    </div>
  );
}
