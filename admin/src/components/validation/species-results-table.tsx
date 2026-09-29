"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { GRUPO_A_MIN_INDIVIDUOS } from "@/lib/dataset/reglas";
import type { FilaEvaluacion } from "@/lib/dataset/osr";

type SortKey = "top1" | "top3" | "precision" | "soporte";
const ETIQUETA: Record<SortKey, string> = { top1: "top-1", top3: "top-3", precision: "precisión", soporte: "soporte" };

export function SpeciesResultsTable({ filas }: { filas: FilaEvaluacion[] }) {
  const [sort, setSort] = useState<SortKey>("top1");
  const nombres = useMemo(() => new Map(filas.map((f) => [String(f.especie_id), f.nombre_cientifico])), [filas]);

  const conMetricas = useMemo(() => {
    // Precisión: de las fotos que el paquete puso en esta especie, cuántas eran de ella.
    const predichasComo = new Map<string, number>();
    for (const f of filas) for (const [pred, n] of Object.entries(f.predichas)) predichasComo.set(pred, (predichasComo.get(pred) ?? 0) + n);
    return filas.map((f) => {
      const total = predichasComo.get(String(f.especie_id)) ?? 0;
      const errores = Object.entries(f.predichas)
        .filter(([pred, n]) => pred !== String(f.especie_id) && n > 0)
        .sort((a, b) => b[1] - a[1]);
      return {
        f,
        top1: f.soporte ? f.top1 / f.soporte : 0,
        top3: f.soporte ? f.top3 / f.soporte : 0,
        precision: total ? f.top1 / total : 0,
        soporte: f.soporte,
        errores,
      };
    });
  }, [filas]);
  const sorted = [...conMetricas].sort((a, b) => a[sort] - b[sort]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-label-secondary">
        Ordenar por:
        {(Object.keys(ETIQUETA) as SortKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSort(k)}
            className={cn("rounded-full px-2.5 py-1 font-medium", sort === k ? "bg-cta-bg text-cta-fg" : "bg-surface-subtle hover:text-label-primary")}
          >
            {ETIQUETA[k]}
          </button>
        ))}
        <span className="ml-auto">peor primero</span>
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Especie</TH>
            <TH>Grupo</TH>
            <TH>Soporte (test)</TH>
            <TH>Top-1</TH>
            <TH>Top-3</TH>
            <TH>Precisión</TH>
            <TH>Errores principales</TH>
          </tr>
        </THead>
        <TBody>
          {sorted.map(({ f, top1, top3, precision, errores }) => {
            const grupoA = (f.n_observaciones ?? 0) >= GRUPO_A_MIN_INDIVIDUOS;
            return (
              <TRow key={f.especie_id}>
                <TD className="italic">{f.nombre_cientifico}</TD>
                <TD>
                  <Badge tone={grupoA ? "accent" : "warning"} title={`${f.n_observaciones ?? 0} individuos en entrenamiento`}>
                    {grupoA ? "A" : "B"}
                  </Badge>
                </TD>
                <TD className="tabular-nums">{f.soporte}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-subtle">
                      <div
                        className={cn("h-full", top1 < 0.4 ? "bg-danger" : top1 < 0.7 ? "bg-warning" : "bg-accent-ink")}
                        style={{ width: `${top1 * 100}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-xs">{f.soporte ? `${Math.round(top1 * 100)} %` : "—"}</span>
                  </div>
                </TD>
                <TD className="tabular-nums text-xs">{f.soporte ? `${Math.round(top3 * 100)} %` : "—"}</TD>
                <TD className="tabular-nums text-xs">{Math.round(precision * 100)} %</TD>
                <TD className="text-xs text-label-secondary">
                  {f.soporte === 0
                    ? "Sin fotos de test"
                    : errores.length === 0
                      ? "—"
                      : errores
                          .slice(0, 2)
                          .map(([pred, n]) => `${nombres.get(pred) ?? `#${pred}`} (${n})`)
                          .join(" · ")}
                </TD>
              </TRow>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
