"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Cpu, FileArchive, Lock, Play, ScrollText, Server, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SpeciesEntry } from "@/lib/mock/catalog";
import { usePanelSession } from "@/lib/session/panel-session";
import { CURRENT_DATASET_VERSION, getCurationSample } from "@/lib/mock/curation";
import { manualExclusionsFor, useCurationStore } from "@/lib/curation/curation-store";
import { useJobStore } from "@/lib/worker/job-store";
import { ANTIOQUIA_SUBREGIONES } from "@/lib/packages/antioquia-subregiones";
import { AUDIT_ENCODER, ENCODER, WORKER_GPU } from "@/lib/worker/encoder";
import {
  BATCH_SIZES,
  STAGES,
  stageAt,
  telemetryAt,
  vramPicoMb,
  type BatchSize,
  type JobPlan,
  type JobScope,
  type JobSpec,
} from "@/lib/worker/jobs";

const PLAYBACK_MS = 8000;

function fmt(n: number) {
  return n.toLocaleString("es-CO");
}

function fmtBytes(b: number) {
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

export function WorkerConsole({
  species,
  seedJobs,
  defaultTope,
}: {
  species: SpeciesEntry[];
  seedJobs: JobPlan[];
  defaultTope: number;
}) {
  const session = usePanelSession();
  const acting = session.acting;
  const canRun = session.can("ejecutarEntrenamiento");
  const canSeeGpu = session.can("verGPU");

  const [scopeKey, setScopeKey] = useState("catalogo");
  const [speciesId, setSpeciesId] = useState(species[0]?.id ?? "");
  const [tope, setTope] = useState(String(defaultTope));
  const [batch, setBatch] = useState<BatchSize>(64);
  const [inject, setInject] = useState(false);

  const jobStore = useJobStore(seedJobs);
  const jobs = jobStore.jobs;
  const curation = useCurationStore();
  const [selectedId, setSelectedId] = useState(seedJobs[0]?.spec.id ?? "");
  const [running, setRunning] = useState<{ id: string; t: number } | null>(null);

  const selected = jobs.find((j) => j.spec.id === selectedId) ?? null;
  const t = selected && running?.id === selected.spec.id ? running.t : selected?.duracionMs ?? 0;
  const vramEstimada = vramPicoMb(batch);

  useEffect(() => {
    if (!running) return;
    const plan = jobs.find((j) => j.spec.id === running.id);
    if (!plan) return;
    const step = plan.duracionMs / (PLAYBACK_MS / 100);
    const timer = setInterval(() => {
      setRunning((r) => {
        if (!r) return r;
        const next = r.t + step;
        return next >= plan.duracionMs ? null : { ...r, t: next };
      });
    }, 100);
    return () => clearInterval(timer);
  }, [running?.id, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  function launch() {
    if (!acting || !canRun || running) return;
    const scope: JobScope =
      scopeKey === "catalogo" ? { kind: "catalogo" } : scopeKey === "especie" ? { kind: "especie", id: speciesId } : { kind: "subregion", id: scopeKey };
    const n = jobs.length + 1;
    // Solo las especies con alguna decisión de curación: los ids de foto y
    // observación llevan el id de la especie como prefijo.
    const tocadas = [...curation.state.excludedPhotos, ...Object.keys(curation.state.invalidated)];
    const exclusionesManuales: Record<string, number> = {};
    for (const s of species) {
      if (!tocadas.some((id) => id.startsWith(`${s.id}-`))) continue;
      const ex = manualExclusionsFor(curation.state, getCurationSample(s).photos);
      if (ex) exclusionesManuales[s.id] = ex;
    }
    const spec: JobSpec = {
      id: `JOB-2026-09-26-${String(n).padStart(3, "0")}`,
      experimento: `EXP-${String(42 + n - 1).padStart(4, "0")}`,
      scope,
      datasetVersion: CURRENT_DATASET_VERSION,
      tope: Math.max(10, Number(tope) || defaultTope),
      batch,
      inyectarVectorAuditoria: inject,
      lanzadoPor: acting.name,
      lanzadoEn: new Date().toISOString().slice(0, 16).replace("T", " "),
      exclusionesManuales,
    };
    jobStore.add(spec);
    setSelectedId(spec.id);
    setRunning({ id: spec.id, t: 0 });
  }

  const speciesName = useMemo(() => new Map(species.map((s) => [s.id, s.especie])), [species]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-label-tertiary">Operando como {acting?.name} (cámbialo arriba a la derecha):</span>
        <Badge tone={canRun ? "accent" : "neutral"}>
          {canRun ? "Puede lanzar jobs" : "Sin permiso para ejecutar entrenamiento"}
        </Badge>
        <Badge tone={canSeeGpu ? "accent" : "neutral"}>
          {canSeeGpu ? "Ve GPU y VRAM" : "GPU/VRAM ocultas por permisos"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="mb-2">
            <CardTitle><Server size={14} className="mr-1.5 inline" />Worker del PC</CardTitle>
            <Badge tone="accent">En línea · simulado</Badge>
          </CardHeader>
          <dl className="space-y-1 text-xs">
            <Row label="GPU" value={canSeeGpu ? WORKER_GPU.nombre : "—"} />
            <Row label="VRAM total" value={canSeeGpu ? `${fmt(WORKER_GPU.vramMb)} MB` : "—"} />
            <Row label="Jobs en curso" value={running ? "1" : "0"} />
            <Row label="Heartbeat" value="cada 5 s (simulado)" />
          </dl>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="mb-2">
            <CardTitle><Cpu size={14} className="mr-1.5 inline" aria-hidden />Encoder del teléfono</CardTitle>
            <Badge tone="neutral">{ENCODER.id}</Badge>
          </CardHeader>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Stat label="Artefacto" value={`${fmt(ENCODER.onnxMb)} MB`} sub={`${ENCODER.archivo} · ${ENCODER.precision}`} />
            <Stat label="Dimensiones" value={String(ENCODER.dimensiones)} sub="L2 normalizado" />
            <Stat label="Latencia teléfono" value={`${ENCODER.latencia4HilosMs} ms`} sub={`4 hilos · ${ENCODER.latencia1HiloMs} ms a 1`} />
            <Stat label="Pico de RAM" value={`~${ENCODER.picoRamMb} MB`} sub="en el teléfono" />
          </div>
          <p className="mt-2 text-xs text-label-secondary">
            {ENCODER.nombre}. Medido: {ENCODER.fuente}. El worker usa este mismo archivo para que sus vectores caigan en el
            mismo espacio que los del teléfono. No se reentrena: una especie nueva es un centroide nuevo, no otro ONNX.
          </p>
          <p className="mt-1 text-xs text-label-secondary">
            El servidor usa otro modelo, {AUDIT_ENCODER.nombre} ({AUDIT_ENCODER.dimensiones} dimensiones), para la web y para
            auditar rechazos. Sus vectores viven en otro espacio y no se mezclan con estos.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="mb-3">
          <CardTitle>Nuevo job de embeddings</CardTitle>
          <Badge tone="neutral">Dataset {CURRENT_DATASET_VERSION}</Badge>
        </CardHeader>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Alcance">
            <Select value={scopeKey} onChange={(e) => setScopeKey(e.target.value)} className="min-w-[220px]">
              <option value="catalogo">Catálogo completo</option>
              {ANTIOQUIA_SUBREGIONES.map((s) => (
                <option key={s.id} value={s.id}>Subregión {s.numero} {s.nombre}</option>
              ))}
              <option value="especie">Una especie…</option>
            </Select>
          </Field>
          {scopeKey === "especie" && (
            <Field label="Especie">
              <Select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} className="min-w-[220px]">
                {species.map((s) => <option key={s.id} value={s.id}>{s.especie}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Tope por especie">
            <Input type="number" min={10} value={tope} onChange={(e) => setTope(e.target.value)} className="w-24" />
          </Field>
          <Field
            label="Batch"
            hint={canSeeGpu ? `VRAM estimada ${fmt(vramEstimada)} / ${fmt(WORKER_GPU.vramMb)} MB` : undefined}
            error={canSeeGpu && vramEstimada > WORKER_GPU.vramMb ? "No cabe en la GPU: el job fallará por falta de VRAM" : null}
          >
            <Select value={batch} onChange={(e) => setBatch(Number(e.target.value) as BatchSize)} className="w-24">
              {BATCH_SIZES.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </Field>
          <label className="mb-2 flex items-center gap-2 text-xs text-label-secondary">
            <input type="checkbox" checked={inject} onChange={(e) => setInject(e.target.checked)} />
            Prueba de la compuerta: meter 1 vector de 1024 del BioCLIP 2.5 del servidor y comprobar que va a cuarentena
          </label>
          <Button variant="primary" onClick={launch} disabled={!canRun || !!running} className="mb-0.5">
            {canRun ? <Play size={14} /> : <Lock size={14} />} Lanzar job
          </Button>
        </div>
        {!canRun && (
          <p className="mt-2 text-xs text-label-tertiary">
            {acting?.name} no tiene el permiso &quot;Ejecutar entrenamiento&quot; (se asigna en Sistema → Roles y permisos).
            Puede revisar los resultados de jobs ya ejecutados.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="p-3">
          <p className="mb-2 px-1 text-xs font-medium text-label-secondary">Jobs</p>
          <ul className="space-y-1">
            {jobs.map((j) => {
              const isRunning = running?.id === j.spec.id;
              return (
                <li key={j.spec.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(j.spec.id)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-xs",
                      selectedId === j.spec.id ? "bg-accent-wash text-accent-ink" : "hover:bg-surface-subtle"
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{j.spec.id}</span>
                      <JobStatusIcon plan={j} running={isRunning} />
                    </span>
                    <span className="block truncate text-label-tertiary">{j.scopeLabel} · {j.spec.experimento}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {selected && <JobDetail plan={selected} t={t} running={running?.id === selected.spec.id} canSeeGpu={canSeeGpu} speciesName={speciesName} />}
      </div>
    </div>
  );
}

function JobStatusIcon({ plan, running }: { plan: JobPlan; running: boolean }) {
  if (running) return <Badge tone="info" className="text-[11px]">corriendo</Badge>;
  if (plan.falloEn) return <XCircle size={13} className="text-danger" />;
  if (plan.enCuarentena) return <AlertTriangle size={13} className="text-warning" />;
  return <CheckCircle2 size={13} className="text-accent-ink" />;
}

function JobDetail({
  plan,
  t,
  running,
  canSeeGpu,
  speciesName,
}: {
  plan: JobPlan;
  t: number;
  running: boolean;
  canSeeGpu: boolean;
  speciesName: Map<string, string>;
}) {
  const stage = stageAt(plan, t);
  const finished = !running;
  const pct = Math.min(100, Math.round((t / plan.duracionMs) * 100));
  const tel = telemetryAt(plan, running ? t : plan.duracionMs + 1);
  const stageIdx = STAGES.findIndex((s) => s.id === stage);
  const visibleLogs = plan.logs.filter((l) => l.tMs <= t);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="mb-3">
          <CardTitle>{plan.spec.id} · {plan.scopeLabel}</CardTitle>
          <span className="text-xs text-label-tertiary">
            {plan.spec.lanzadoPor} · {plan.spec.lanzadoEn} · batch {plan.spec.batch} · tope {plan.spec.tope}
          </span>
        </CardHeader>
        <ol className="mb-3 grid grid-cols-3 gap-1 sm:grid-cols-6">
          {STAGES.map((s, i) => {
            const failed = plan.falloEn === s.id && (finished || t >= plan.etapas[s.id]);
            const done = finished ? !plan.falloEn || i < STAGES.findIndex((x) => x.id === plan.falloEn) : i < stageIdx;
            const active = running && i === stageIdx;
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-md border px-2 py-1 text-center text-[11px]",
                  failed ? "border-danger/40 bg-danger/10 text-danger" : done ? "border-accent-wash bg-accent-wash text-accent-ink" : active ? "border-info/40 bg-info/10 text-info" : "border-border text-label-tertiary"
                )}
              >
                {s.label}
              </li>
            );
          })}
        </ol>
        <div className="h-1 rounded-full bg-surface-subtle">
          <div className={cn("h-1 rounded-full", plan.falloEn && finished ? "bg-danger" : "bg-accent-ink")} style={{ width: `${finished ? 100 : pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-label-tertiary">
          Tiempo simulado del worker: {(Math.min(t, plan.duracionMs) / 1000).toFixed(1)} s de {(plan.duracionMs / 1000).toFixed(1)} s
          (reproducido acelerado)
        </p>

        {canSeeGpu ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Meter label="GPU" value={`${tel.gpuPct}%`} pct={tel.gpuPct} />
            <Meter label="VRAM" value={`${fmt(tel.vramMb)} MB`} pct={(tel.vramMb / WORKER_GPU.vramMb) * 100} />
            <Meter label="CPU" value={`${tel.cpuPct}%`} pct={tel.cpuPct} />
            <Meter label="Rendimiento" value={tel.imgsPorSeg ? `${tel.imgsPorSeg} img/s` : "—"} pct={(tel.imgsPorSeg / 200) * 100} />
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-label-tertiary"><Lock size={12} /> Telemetría técnica oculta para esta cuenta.</p>
        )}
        {canSeeGpu && <p className="mt-1 text-[11px] text-label-tertiary">Telemetría simulada; el rendimiento de la RTX 4050 no está medido en el vault.</p>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="mb-2"><CardTitle><ScrollText size={14} className="mr-1.5 inline" />Logs</CardTitle></CardHeader>
          <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md bg-surface-subtle p-2 font-mono text-[11px]">
            {visibleLogs.map((l, i) => (
              <p key={i} className={cn(l.nivel === "error" ? "text-danger" : l.nivel === "warn" ? "text-warning" : "text-label-secondary")}>
                <span className="text-label-tertiary">[{(l.tMs / 1000).toFixed(1).padStart(5, " ")}s]</span> {l.texto}
              </p>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader className="mb-2"><CardTitle>Validación de embeddings</CardTitle></CardHeader>
          {finished && plan.checks.length > 0 ? (
            <ul className="space-y-1.5 text-xs">
              {plan.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  {c.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-accent-ink" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-danger" />}
                  <span><span className="font-medium">{c.label}</span> <span className="text-label-tertiary">— {c.detalle}</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-label-tertiary">{plan.falloEn && finished ? "El job falló antes de validar: no hay vectores que revisar." : "Se ejecuta al terminar la inferencia."}</p>
          )}
        </Card>
      </div>

      {finished && !plan.falloEn && (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader className="mb-2">
              <CardTitle>Vectores por especie</CardTitle>
              <span className="text-xs text-label-tertiary">
                {fmt(plan.totalVectores)} vectores · {fmt(plan.descartadasCuracion)} fotos ya descartadas en curación
              </span>
            </CardHeader>
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <THead>
                  <tr><TH>Especie</TH><TH>Fotos activas</TH><TH>Vectores</TH><TH>Cuarentena</TH></tr>
                </THead>
                <TBody>
                  {plan.especies.map((e) => (
                    <TRow key={e.speciesId}>
                      <TD className="text-xs italic">{speciesName.get(e.speciesId) ?? e.speciesId}</TD>
                      <TD className="text-xs">{fmt(e.fotosActivas)}</TD>
                      <TD className="text-xs">{fmt(e.vectores)}</TD>
                      <TD className="text-xs">{e.enCuarentena || "—"}</TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>
          </Card>
          <Card>
            <CardHeader className="mb-2"><CardTitle><FileArchive size={14} className="mr-1.5 inline" />Artefactos</CardTitle></CardHeader>
            <ul className="space-y-2 text-xs">
              {plan.artifacts.map((a) => (
                <li key={a.nombre}>
                  <p className="break-all font-mono">{a.nombre}</p>
                  <p className="text-label-tertiary">{fmtBytes(a.bytes)} · sha256 {a.sha256.slice(0, 16)}…</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-label-tertiary">
              Procedencia: {plan.spec.datasetVersion} · {ENCODER.id} · {plan.spec.experimento}. Estos vectores son la
              entrada de Centroides; no se publican por sí solos.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-label-tertiary">{label}</dt>
      <dd className="text-right text-label-primary">{value}</dd>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-label-tertiary">{label}</p>
      <p className="text-base font-semibold text-label-primary">{value}</p>
      <p className="text-[11px] text-label-tertiary">{sub}</p>
    </div>
  );
}

function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-[11px] text-label-tertiary">{label}</p>
      <p className="text-sm font-semibold text-label-primary">{value}</p>
      <div className="mt-1 h-1 rounded-full bg-surface-subtle">
        <div className="h-1 rounded-full bg-accent-ink transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}
