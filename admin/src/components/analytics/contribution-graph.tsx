"use client";

import { useMemo, useState, Fragment } from "react";
import type { DayActivity } from "@/lib/analytics/activity";

const MONTH_LABELS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const DOW_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function levelFor(count: number, max: number) {
  if (count === 0) return 0;
  const ratio = count / Math.max(max, 1);
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

const LEVEL_CLASSES = [
  "bg-surface-subtle",
  "bg-accent-tint/25",
  "bg-accent-tint/50",
  "bg-accent-tint/75",
  "bg-accent-tint",
];

// Tooltip flotante posicionado junto al cursor
function HoverTooltip({
  day,
  anchor,
}: {
  day: DayActivity;
  anchor: { x: number; y: number };
}) {
  const dateLabel = new Date(day.date).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border border-border bg-surface px-2.5 py-1.5 shadow-md"
      style={{ left: anchor.x, top: anchor.y - 64, transform: "translateX(-50%)" }}
    >
      <p className="text-[11px] text-label-tertiary">{dateLabel}</p>
      <p className="text-xs font-semibold text-label-primary tabular-nums">
        {day.count.toLocaleString("es-CO")}
      </p>
    </div>
  );
}

export function ContributionGraph({ data, unitLabel }: { data: DayActivity[]; unitLabel: string }) {
  const [hovered, setHovered] = useState<DayActivity | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const { weeks, max, monthMarkers } = useMemo(() => {
    const w: DayActivity[][] = [];
    for (let i = 0; i < data.length; i += 7) w.push(data.slice(i, i + 7));

    const maxCount = Math.max(...data.map((d) => d.count), 1);

    const markers: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    w.forEach((week, i) => {
      const firstDay = week[0];
      if (!firstDay) return;
      const month = new Date(firstDay.date).getMonth();
      if (month !== lastMonth) {
        markers.push({ weekIndex: i, label: MONTH_LABELS[month] });
        lastMonth = month;
      }
    });

    return { weeks: w, max: maxCount, monthMarkers: markers };
  }, [data]);

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <p className="shrink-0 text-xs text-label-secondary">
          <span className="font-semibold text-label-primary">{total.toLocaleString("es-CO")}</span>{" "}
          {unitLabel} en los últimos 12 meses
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-max pb-1 pr-4">
          <div
            className="grid w-full gap-[3px]"
            style={{
              maxWidth: weeks.length <= 26 ? `${weeks.length * 16 + 40}px` : "none",
              gridTemplateRows: "20px repeat(7, auto)",
              gridTemplateColumns: `28px repeat(${weeks.length}, minmax(11px, 1fr))`
            }}
          >
            {DOW_LABELS.map((label, i) => (
              <div
                key={`dow-${i}`}
                style={{ gridRow: i + 2, gridColumn: 1 }}
                className="flex items-center justify-end pr-2 text-[11px] font-medium text-label-secondary/70 uppercase tracking-widest"
              >
                {label}
              </div>
            ))}

            {weeks.map((week, wi) => {
              const marker = monthMarkers.find((m) => m.weekIndex === wi);
              return (
                <Fragment key={wi}>
                  {marker && (
                    <div
                      className="relative flex items-end"
                      style={{ gridRow: 1, gridColumn: wi + 2 }}
                    >
                      <span className="absolute bottom-1 left-0 text-[11px] text-label-tertiary">
                        {marker.label}
                      </span>
                    </div>
                  )}

                  {week.map((day, di) => (
                    <div
                      key={day.date}
                      style={{ gridRow: di + 2, gridColumn: wi + 2 }}
                      onMouseEnter={(e) => {
                        setHovered(day);
                        setPos({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHovered(null)}
                      className={`w-full aspect-square rounded-[2px] ${LEVEL_CLASSES[levelFor(day.count, max)]} outline outline-1 outline-offset-0 outline-black/[0.04] transition-transform hover:scale-125 cursor-default`}
                    />
                  ))}
                </Fragment>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-label-tertiary">
            <span>menos</span>
            {LEVEL_CLASSES.map((cls, i) => (
              <span key={i} className={`h-[11px] w-[11px] rounded-[2px] ${cls}`} />
            ))}
            <span>más</span>
          </div>
        </div>
      </div>

      {/* Tooltip flotante posicionado junto al cursor */}
      {hovered && <HoverTooltip day={hovered} anchor={pos} />}
    </div>
  );
}
