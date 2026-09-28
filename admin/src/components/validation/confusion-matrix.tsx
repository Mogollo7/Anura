"use client";

import { useMemo, useState } from "react";
import type { PackageValidationReport } from "@/lib/mock/validation";
import { speciesName, SPECIES_BY_ID } from "@/lib/mock/species-names";

const CELL = 16;

function shortLabel(id: string) {
  const sp = SPECIES_BY_ID.get(id);
  if (!sp) return id;
  return `${sp.genero.slice(0, 3)}. ${sp.epiteto.slice(0, 6)}`;
}

export function ConfusionMatrix({ report }: { report: PackageValidationReport }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const rowMax = useMemo(() => report.matrix.map((row) => Math.max(...row, 1)), [report.matrix]);

  const n = report.speciesIds.length;

  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 520 }}>
        <div className="inline-block p-2">
          <div className="flex">
            <div style={{ width: 140 }} className="shrink-0" />
            <div className="flex">
              {report.speciesIds.map((id, j) => (
                <div
                  key={id}
                  style={{ width: CELL, height: 120 }}
                  className={`shrink-0 origin-bottom-left -rotate-[60deg] whitespace-nowrap text-[11px] leading-none ${
                    hover?.j === j ? "font-semibold text-accent-ink" : "text-label-tertiary"
                  }`}
                >
                  <span className="inline-block translate-y-[110px]">{shortLabel(id)}</span>
                </div>
              ))}
            </div>
          </div>

          {report.speciesIds.map((rowId, i) => (
            <div key={rowId} className="flex items-center">
              <div
                style={{ width: 140, height: CELL }}
                title={speciesName(rowId)}
                className={`shrink-0 truncate pr-2 text-right text-[11px] italic leading-none ${
                  hover?.i === i ? "font-semibold text-accent-ink" : "text-label-secondary"
                }`}
              >
                {shortLabel(rowId)}
              </div>
              <div className="flex">
                {report.speciesIds.map((colId, j) => {
                  const count = report.matrix[i][j];
                  const ratio = count / rowMax[i];
                  const isDiag = i === j;
                  const bg =
                    count === 0
                      ? "transparent"
                      : isDiag
                        ? `rgba(30,122,52,${0.15 + ratio * 0.75})`
                        : `rgba(215,0,21,${0.15 + ratio * 0.75})`;
                  return (
                    <div
                      key={colId}
                      onMouseEnter={() => setHover({ i, j })}
                      onMouseLeave={() => setHover(null)}
                      title={`${speciesName(rowId)} → ${speciesName(colId)}: ${count}`}
                      style={{ width: CELL, height: CELL, background: bg }}
                      className="shrink-0 border border-black/[0.03]"
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-label-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(30,122,52,.7)" }} />
          Aciertos (diagonal)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(215,0,21,.7)" }} />
          Confusión con otra especie
        </span>
        <span>{n} × {n} especies · pasa el cursor por una celda para ver el conteo</span>
      </div>
    </div>
  );
}
