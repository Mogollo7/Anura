"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ANTIOQUIA_SUBREGIONES } from "@/lib/packages/antioquia-subregiones";
import { useMorphStore } from "@/lib/centroids/morph-store";
import { useClusterStore } from "@/lib/adapters/cluster-store";
import { useOsrStore } from "@/lib/osr/osr-store";
import { buildTechnicalValidation, type Check, type CheckStatus, type EstadoPipeline, type SpeciesValidation } from "@/lib/validation/technical";

const pct = (x: number) => `${(x * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;

const ESTADO_TONE: Record<EstadoPipeline, "neutral" | "accent" | "warning" | "danger" | "info"> = {
  DRAFT: "neutral",
  DATASET_READY: "info",
  EMBEDDINGS_READY: "info",
  CENTROID_READY: "info",
  VALIDATING: "info",
  WARNING: "warning",
  BLOCKED: "danger",
  VALIDATED: "accent",
};

const ESTADO_LABEL: Record<EstadoPipeline, string> = {
  DRAFT: "Sin piso de dataset",
  DATASET_READY: "Dataset listo",
  EMBEDDINGS_READY: "Embeddings listos",
  CENTROID_READY: "Centroide listo",
  VALIDATING: "Falta validar la OSR",
  WARNING: "Con advertencias",
  BLOCKED: "Bloqueada",
  VALIDATED: "Validada",
};

function defaultSubregion() {
  return ANTIOQUIA_SUBREGIONES.find((s) => s.id === "01_valle_de_aburra")?.id ?? ANTIOQUIA_SUBREGIONES[0].id;
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "ok") return <CheckCircle2 size={13} className="text-accent-ink" />;
  if (status === "warning") return <AlertTriangle size={13} className="text-warning" />;
  if (status === "blocked") return <XCircle size={13} className="text-danger" />;
  return <Circle size={13} className="text-label-tertiary" />;
}

export function TechnicalValidationConsole() {
  const [subregionId, setSubregionId] = useState(defaultSubregion);
  const { store: morphs } = useMorphStore();
  const { clusters } = useClusterStore();
  const osr = useOsrStore(subregionId);

  const report = useMemo(
    () => buildTechnicalValidation(subregionId, morphs, clusters, osr.config, osr.validacion),
    [subregionId, morphs, clusters, osr.config, osr.validacion]
  );

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Subregión (una validación por paquete)">
          <Select value={subregionId} onChange={(e) => { setSubregionId(e.target.value); setExpanded(null); }} className="min-w-[220px]">
            {ANTIOQUIA_SUBREGIONES.map((s) => (
              <option key={s.id} value={s.id}>{s.numero} {s.nombre}</option>
            ))}
          </Select>
        </Field>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            report.gate.aprobado ? "bg-accent-wash text-accent-ink" : "bg-danger/10 text-danger"
          )}
        >
          {report.gate.aprobado ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
          {report.gate.aprobado ? "Listo para compilar (F23)" : "No listo para compilar"}
        </span>
      </div>

      {!report.gate.aprobado && (
        <Card>
          <ul className="space-y-1 text-xs text-danger">
            {report.gate.motivos.map((m) => <li key={m} className="flex items-start gap-1.5"><ShieldAlert size={12} className="mt-0.5 shrink-0" />{m}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {(Object.keys(report.resumen) as EstadoPipeline[])
          .filter((e) => report.resumen[e] > 0)
          .map((e) => (
            <div key={e} className="rounded-md border border-border p-2 text-center">
              <p className="text-lg font-semibold tabular-nums">{report.resumen[e]}</p>
              <Badge tone={ESTADO_TONE[e]} className="mt-1">{ESTADO_LABEL[e]}</Badge>
            </div>
          ))}
      </div>

      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Embeddings del encoder</CardTitle>
          <Badge tone={report.embeddings.job ? (report.embeddings.datasetVigente ? "accent" : "warning") : "danger"}>
            {report.embeddings.job ? (report.embeddings.datasetVigente ? "vigente" : "dataset desactualizado") : "sin job"}
          </Badge>
        </CardHeader>
        {report.embeddings.job ? (
          <>
            <p className="mb-2 text-xs text-label-tertiary">
              Job <span className="font-mono">{report.embeddings.job.spec.id}</span> ({report.embeddings.job.spec.experimento}) ·{" "}
              alcance: {report.embeddings.job.scopeLabel} · reutilizado de{" "}
              <Link href="/ia" className="text-accent-ink underline">Worker · embeddings</Link> (F17), no se recalcula aquí.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {report.embeddings.job.checks.map((c) => (
                <p key={c.id} className={cn("flex items-start gap-1.5 text-xs", !c.ok && "text-warning")}>
                  <StatusIcon status={c.ok ? "ok" : "warning"} /> <span><strong>{c.label}:</strong> {c.detalle}</span>
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-danger">No hay ningún job de embeddings que cubra esta subregión con el dataset vigente.</p>
        )}
      </Card>

      <Card>
        <CardHeader className="mb-2">
          <CardTitle>OSR calibrado (F21)</CardTitle>
          <Badge tone={report.osr.validada ? "accent" : report.osr.vencida ? "warning" : "neutral"}>
            {report.osr.validada ? "validado" : report.osr.vencida ? "vencido" : "sin validar"}
          </Badge>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          {report.osr.evaluacion.paths.map((p) => (
            <div key={p.id} className="rounded-md border border-border p-2">
              <p className="text-label-tertiary">{p.nombre}</p>
              <p className="text-base font-semibold tabular-nums">{pct(p.kar)} KAR</p>
              <p className="text-[11px] text-label-tertiary">FAR {pct(p.far)} · AUROC {p.auroc.toFixed(3)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-label-tertiary">
          Medido sobre embeddings simulados (misma corrida que <Link href="/osr" className="text-accent-ink underline">/osr</Link>), reutilizada
          aquí sin recalcular. No se inventa un accuracy propio para esta pantalla.
          {!report.osr.validada && " Valida la calibración en /osr antes de compilar."}
        </p>
      </Card>

      <Card>
        <CardHeader className="mb-2"><CardTitle>Especies del paquete</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Especie</TH><TH>Estado</TH><TH className="text-right">Checks con aviso</TH><TH></TH></tr></THead>
          <TBody>
            {report.species.map((s) => {
              const avisos = s.checks.filter((c) => c.status === "warning" || c.status === "blocked").length;
              const open = expanded === s.species.id;
              return (
                <Fragment key={s.species.id}>
                  <TRow clickable onClick={() => setExpanded(open ? null : s.species.id)}>
                    <TD className="text-xs italic">{s.species.especie}</TD>
                    <TD><Badge tone={ESTADO_TONE[s.estado]}>{ESTADO_LABEL[s.estado]}</Badge></TD>
                    <TD className={cn("text-right text-xs tabular-nums", avisos > 0 && "text-warning")}>{avisos || "—"}</TD>
                    <TD className="text-right text-xs text-label-tertiary">{open ? "ocultar" : "ver checks"}</TD>
                  </TRow>
                  {open && (
                    <TRow>
                      <TD colSpan={4} className="bg-surface-subtle">
                        <SpeciesChecks s={s} />
                      </TD>
                    </TRow>
                  )}
                </Fragment>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader className="mb-2"><CardTitle>{report.compilacion.label}</CardTitle></CardHeader>
        <p className="flex items-start gap-1.5 text-xs text-label-secondary">
          <StatusIcon status={report.compilacion.status} /> {report.compilacion.detalle}
        </p>
      </Card>
    </div>
  );
}

function SpeciesChecks({ s }: { s: SpeciesValidation }) {
  return (
    <div className="space-y-1 py-2">
      {s.checks.map((c: Check) => (
        <p key={c.id} className={cn("flex items-start gap-1.5 text-xs", c.status === "warning" && "text-warning", c.status === "blocked" && "text-danger")}>
          <StatusIcon status={c.status} /> <span><strong>{c.label}:</strong> {c.detalle}</span>
        </p>
      ))}
    </div>
  );
}
