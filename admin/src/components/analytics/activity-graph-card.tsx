"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ACTIVITY_METRICS, type ActivityMetric, type DayActivity } from "@/lib/analytics/activity";
import { ContributionGraph } from "./contribution-graph";

const DATE_RANGES = [
  { id: 4, label: "1 mes" },
  { id: 12, label: "3 meses" },
  { id: 26, label: "6 meses" },
  { id: 52, label: "1 año" },
];

export function ActivityGraphCard({
  series,
}: {
  series: Record<ActivityMetric, DayActivity[]>;
}) {
  const [metric, setMetric] = useState<ActivityMetric>("actividad");
  const [weeks, setWeeks] = useState<number>(52);
  const [menuOpen, setMenuOpen] = useState(false);

  const slicedSeries = Object.fromEntries(
    Object.entries(series).map(([key, days]) => [
      key,
      days.slice(-weeks * 7),
    ])
  ) as Record<ActivityMetric, DayActivity[]>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad de ANURA</CardTitle>
      </CardHeader>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {ACTIVITY_METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMetric(m.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all",
              metric === m.id
                ? "border-accent-tint bg-cta-bg text-cta-fg shadow-sm"
                : "border-border bg-surface-subtle text-label-secondary hover:border-accent-wash hover:bg-surface hover:text-label-primary"
            )}
          >
            {m.label}
          </button>
        ))}

        <span className="ml-auto flex items-center gap-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setWeeks(r.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                weeks === r.id
                  ? "border-accent-tint bg-cta-bg text-cta-fg shadow-sm"
                  : "border-border bg-surface-subtle text-label-secondary hover:border-accent-wash hover:bg-surface hover:text-label-primary"
              )}
            >
              {r.label}
            </button>
          ))}
          
          <div className="relative ml-1">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border bg-surface-subtle text-label-tertiary transition-all hover:border-accent-wash hover:bg-surface hover:text-label-primary"
              title="Rango personalizado"
            >
              <CalendarDays size={13} />
            </button>

            {menuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setMenuOpen(false)} 
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-surface p-3 shadow-lg">
                  <h4 className="mb-3 text-xs font-medium text-label-primary">Rango personalizado</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-label-secondary">Desde</label>
                      <input type="date" className="w-full rounded-sm border border-border bg-surface-subtle px-2 py-1 text-xs text-label-primary outline-none focus:border-accent-tint" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-label-secondary">Hasta</label>
                      <input type="date" className="w-full rounded-sm border border-border bg-surface-subtle px-2 py-1 text-xs text-label-primary outline-none focus:border-accent-tint" />
                    </div>
                  </div>
                  <button 
                    onClick={() => setMenuOpen(false)}
                    className="mt-3 w-full rounded-sm bg-accent-tint py-1.5 text-xs font-medium text-white hover:bg-accent-tint/90"
                  >
                    Aplicar
                  </button>
                </div>
              </>
            )}
          </div>
        </span>
      </div>

      <ContributionGraph
        data={slicedSeries[metric]}
        unitLabel={ACTIVITY_METRICS.find((m) => m.id === metric)!.label.toLowerCase()}
      />
    </Card>
  );
}
