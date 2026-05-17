import React from "react";
import { Card } from "@/components/ui/card";
import { CaretUp, CaretDown } from "@phosphor-icons/react";
import { PALETTES } from "@/lib/dashboardUtils";

export function StatCard({ eyebrow, value, trend, hint, palette, icon: Icon, testId }) {
  const p = PALETTES[palette] || PALETTES.amber;
  const positive = trend != null && trend >= 0;
  return (
    <Card className={`p-5 rounded-xl shadow-none border-0 ${p.bg}`} data-testid={testId}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.icon}`}>
          {Icon && <Icon size={18} weight="duotone" />}
        </div>
        {trend != null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
            {positive ? <CaretUp size={12} weight="fill" /> : <CaretDown size={12} weight="fill" />}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="font-display text-2xl mt-4 text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{eyebrow}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </Card>
  );
}

export function ChartHeader({ eyebrow, title, right }) {
  return (
    <div className="flex items-start justify-between mb-3 gap-3">
      <div>
        <p className="label-eyebrow">{eyebrow}</p>
        <h3 className="font-display text-xl mt-1">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function Empty({ label }) {
  return <div className="p-10 text-center text-sm text-muted-foreground" data-testid="tile-empty">{label}</div>;
}
