"use client";

import { useState } from "react";
import { ShieldCheck, ShieldX } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PackageValidationReport } from "@/lib/mock/validation";
import { ConfusionMatrix } from "./confusion-matrix";
import { SpeciesResultsTable } from "./species-results-table";
import { SimilarSpeciesList } from "./similar-species";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-surface-subtle p-3">
      <p className="text-lg font-semibold tabular-nums text-label-primary">{value}</p>
      <p className="text-xs text-label-secondary">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-label-tertiary">{hint}</p>}
    </div>
  );
}

export function ValidationExplorer({ reports }: { reports: PackageValidationReport[] }) {
  const [selectedId, setSelectedId] = useState(reports[0]?.packageId);
  const report = reports.find((r) => r.packageId === selectedId) ?? reports[0];
  if (!report) return <p className="text-sm text-label-secondary">Sin paquetes con especies suficientes para validar.</p>;

  const approved = report.kar >= 0.8 && report.top1 >= 0.6;
  const worst = [...report.rows].sort((a, b) => a.recall - b.recall).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {reports.map((r) => (
          <button
            key={r.packageId}
            type="button"
            onClick={() => setSelectedId(r.packageId)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              r.packageId === report.packageId
                ? "bg-cta-bg text-cta-fg"
                : "bg-surface-subtle text-label-secondary hover:text-label-primary"
            )}
          >
            {r.packageName}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-label-primary">{report.packageName}</h2>
            <p className="text-xs text-label-secondary">{report.speciesIds.length} especies evaluadas</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              approved ? "bg-accent-wash text-accent-ink" : "bg-danger/10 text-danger"
            )}
          >
            {approved ? <ShieldCheck size={14} /> : <ShieldX size={14} />}
            {approved ? "Gate aprobado" : "Gate no aprobado"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Top-1" value={`${(report.top1 * 100).toFixed(1).replace(".", ",")} %`} hint="mínimo 60 %" />
          <Metric label="Top-5" value={`${(report.top5 * 100).toFixed(1).replace(".", ",")} %`} />
          <Metric label="AUROC open set" value={report.auroc.toFixed(4).replace(".", ",")} />
          <Metric label="KAR" value={`${(report.kar * 100).toFixed(2).replace(".", ",")} %`} hint="mínimo 80 %" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Badge tone="accent">{report.groupA} Grupo A</Badge>
          <Badge tone="warning">{report.groupB} Grupo B</Badge>
          {worst.length > 0 && (
            <span className="text-xs text-label-secondary">
              Recall más bajo: {worst.map((w) => `${w.speciesId.split("-")[0]} ${Math.round(w.recall * 100)}%`).join(" · ")}
            </span>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Matriz de confusión</CardTitle></CardHeader>
        <ConfusionMatrix report={report} />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle>Resultados por especie</CardTitle></CardHeader>
          <SpeciesResultsTable rows={report.rows} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Especies similares</CardTitle></CardHeader>
          <SimilarSpeciesList pairs={report.similarPairs} />
        </Card>
      </div>
    </div>
  );
}
