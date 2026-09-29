"use client";

import { useMemo, useState } from "react";
import type { FilaEvaluacion } from "@/lib/dataset/osr";

const CELL = 16;

function shortLabel(f: FilaEvaluacion) {
  const [genero = "", epiteto = ""] = f.nombre_cientifico.split(" ");
  return `${genero.slice(0, 3)}. ${epiteto.slice(0, 6)}`;
}

/** Fila = especie real, columna = especie en primer lugar (top-1). Sale de la evaluación guardada en el servidor. */
export function ConfusionMatrix({ filas }: { filas: FilaEvaluacion[] }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const matriz = useMemo(() => filas.map((f) => filas.map((g) => f.predichas[String(g.especie_id)] ?? 0)), [filas]);
  const rowMax = useMemo(() => matriz.map((row) => Math.max(...row, 1)), [matriz]);
  const n = filas.length;

  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 520 }}>
        <div className="inline-block p-2">
          <div className="flex">
            <div style={{ width: 140 }} className="shrink-0" />
            <div className="flex">
              {filas.map((f, j) => (
                <div
                  key={f.especie_id}
                  style={{ width: CELL, height: 120 }}
                  className={`shrink-0 origin-bottom-left -rotate-[60deg] whitespace-nowrap text-[11px] leading-none ${
                    hover?.j === j ? "font-semibold text-accent-ink" : "text-label-tertiary"
                  }`}
                >
                  <span className="inline-block translate-y-[110px]">{shortLabel(f)}</span>
                </div>
              ))}
            </div>
          </div>

          {filas.map((fila, i) => (
            <div key={fila.especie_id} className="flex items-center">
              <div
                style={{ width: 140, height: CELL }}
                title={fila.nombre_cientifico}
                className={`shrink-0 truncate pr-2 text-right text-[11px] italic leading-none ${
                  hover?.i === i ? "font-semibold text-accent-ink" : "text-label-secondary"
                }`}
              >
                {shortLabel(fila)}
              </div>
              <div className="flex">
                {filas.map((col, j) => {
                  const count = matriz[i][j];
                  const ratio = count / rowMax[i];
                  const bg =
                    count === 0
                      ? "transparent"
                      : i === j
                        ? `rgba(30,122,52,${0.15 + ratio * 0.75})`
                        : `rgba(215,0,21,${0.15 + ratio * 0.75})`;
                  return (
                    <div
                      key={col.especie_id}
                      onMouseEnter={() => setHover({ i, j })}
                      onMouseLeave={() => setHover(null)}
                      title={`${fila.nombre_cientifico} → ${col.nombre_cientifico}: ${count}`}
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
