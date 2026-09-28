"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import type { SpeciesValidationRow } from "@/lib/mock/validation";
import { speciesName } from "@/lib/mock/species-names";

type SortKey = "recall" | "precision" | "support";

export function SpeciesResultsTable({ rows }: { rows: SpeciesValidationRow[] }) {
  const [sort, setSort] = useState<SortKey>("recall");
  const sorted = [...rows].sort((a, b) => a[sort] - b[sort]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-label-secondary">
        Ordenar por:
        {(["recall", "precision", "support"] as SortKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSort(k)}
            className={cn(
              "rounded-full px-2.5 py-1 font-medium",
              sort === k ? "bg-cta-bg text-cta-fg" : "bg-surface-subtle hover:text-label-primary"
            )}
          >
            {k === "recall" ? "recall" : k === "precision" ? "precisión" : "soporte"}
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
            <TH>Recall</TH>
            <TH>Precisión</TH>
            <TH>Errores principales</TH>
          </tr>
        </THead>
        <TBody>
          {sorted.map((r) => (
            <TRow key={r.speciesId}>
              <TD className="italic">{speciesName(r.speciesId)}</TD>
              <TD><Badge tone={r.grupo === "A" ? "accent" : "warning"}>{r.grupo}</Badge></TD>
              <TD className="tabular-nums">{r.support}</TD>
              <TD>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className={cn("h-full", r.recall < 0.4 ? "bg-danger" : r.recall < 0.7 ? "bg-warning" : "bg-accent-ink")}
                      style={{ width: `${r.recall * 100}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-xs">{Math.round(r.recall * 100)} %</span>
                </div>
              </TD>
              <TD className="tabular-nums">{Math.round(r.precision * 100)} %</TD>
              <TD className="text-xs text-label-secondary">
                {r.confusions.length === 0
                  ? "—"
                  : r.confusions
                      .slice(0, 2)
                      .map((c) => `${speciesName(c.predictedId)} (${c.count})`)
                      .join(" · ")}
              </TD>
            </TRow>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
