import { mulberry32 } from "@/lib/mock/rng";
import { getAllSpecies, type SpeciesEntry } from "@/lib/mock/catalog";
import { CURRENT_DATASET_VERSION } from "@/lib/mock/curation";
import { TOPE_DEFAULT } from "@/lib/packages/constants";
import { getAntioquiaSubregion, speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import { AUDIT_ENCODER, ENCODER, WORKER_GPU } from "./encoder";
import { datasetMembership, vectorsFor } from "./membership";

/**
 * Job de extracción de embeddings (19_ADMIN, fase 5):
 * Admin → Job → Worker PC → BioCLIP 1 → Embeddings 512D → Validación → almacenamiento.
 *
 * Todo el resultado se calcula de antemano y de forma determinista a partir
 * de la membresía curada del dataset; la UI solo lo "reproduce" en el tiempo.
 * El día que exista el worker real, este contrato (JobSpec → JobPlan) no
 * cambia: cambia quién lo llena.
 */

export type JobScope =
  | { kind: "subregion"; id: string }
  | { kind: "especie"; id: string }
  | { kind: "catalogo" };

export type JobStage =
  | "en_cola"
  | "cargando_dataset"
  | "preprocesando"
  | "inferencia"
  | "validando"
  | "almacenando";

export const STAGES: { id: JobStage; label: string }[] = [
  { id: "en_cola", label: "En cola" },
  { id: "cargando_dataset", label: "Dataset" },
  { id: "preprocesando", label: "Preproceso" },
  { id: "inferencia", label: "Encoder" },
  { id: "validando", label: "Validación" },
  { id: "almacenando", label: "Almacenamiento" },
];

export const BATCH_SIZES = [32, 64, 128, 256] as const;
export type BatchSize = (typeof BATCH_SIZES)[number];

/** Estimaciones (no medidas en el vault) para ViT-B/16 FP16 a 224 px en la RTX 4050. */
const CUDA_CONTEXT_MB = 420;
const ACTIVACION_POR_IMAGEN_MB = 22;
const THROUGHPUT: Record<BatchSize, number> = { 32: 110, 64: WORKER_GPU.imgsPorSegundoEstimado, 128: 165, 256: 170 };

export function vramPicoMb(batch: BatchSize) {
  return CUDA_CONTEXT_MB + WORKER_GPU.pesoModeloVramMb + batch * ACTIVACION_POR_IMAGEN_MB;
}

export type JobSpec = {
  id: string;
  experimento: string;
  scope: JobScope;
  datasetVersion: string;
  tope: number;
  batch: BatchSize;
  inyectarVectorAuditoria: boolean;
  lanzadoPor: string;
  lanzadoEn: string;
  /** Fotos que la curación manual (F13) sacó, por especie: se descuentan de la membresía de este job. */
  exclusionesManuales?: Record<string, number>;
};

export type SpeciesJobResult = {
  speciesId: string;
  fotosActivas: number;
  vectores: number;
  enCuarentena: number;
};

export type ValidationCheck = { id: string; label: string; ok: boolean; detalle: string };

export type Artifact = { nombre: string; bytes: number; sha256: string };

export type LogLine = { tMs: number; nivel: "info" | "warn" | "error"; texto: string };

export type JobPlan = {
  spec: JobSpec;
  scopeLabel: string;
  especies: SpeciesJobResult[];
  totalImagenes: number;
  descartadasCuracion: number;
  totalVectores: number;
  enCuarentena: number;
  /** Tiempo de inicio de cada etapa, en ms simulados desde que el worker toma el job. */
  etapas: Record<JobStage, number>;
  duracionMs: number;
  falloEn: JobStage | null;
  checks: ValidationCheck[];
  artifacts: Artifact[];
  logs: LogLine[];
};

export function scopeSpecies(scope: JobScope): SpeciesEntry[] {
  if (scope.kind === "catalogo") return getAllSpecies();
  if (scope.kind === "subregion") return speciesForSubregion(scope.id);
  return getAllSpecies().filter((s) => s.id === scope.id);
}

export function scopeLabel(scope: JobScope) {
  if (scope.kind === "catalogo") return "Catálogo completo";
  if (scope.kind === "subregion") {
    const sub = getAntioquiaSubregion(scope.id);
    return sub ? `Subregión ${sub.numero} ${sub.nombre}` : scope.id;
  }
  return getAllSpecies().find((s) => s.id === scope.id)?.especie ?? scope.id;
}

function seedOf(text: string) {
  return text.split("").reduce((a, c) => (a * 33 + c.charCodeAt(0)) | 0, 5381);
}

function fakeSha(text: string) {
  const rand = mulberry32(seedOf(text));
  return Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");
}

function fmt(n: number) {
  return n.toLocaleString("es-CO");
}

export function planJob(spec: JobSpec): JobPlan {
  const especiesScope = scopeSpecies(spec.scope);
  const label = scopeLabel(spec.scope);
  const logs: LogLine[] = [];
  const log = (tMs: number, nivel: LogLine["nivel"], texto: string) => logs.push({ tMs, nivel, texto });

  const memberships = especiesScope.map((s) => {
    const m = datasetMembership(s);
    const ex = spec.exclusionesManuales?.[s.id] ?? 0;
    return ex ? { ...m, fotosActivas: Math.max(0, m.fotosActivas - ex) } : m;
  });
  const totalManuales = especiesScope.reduce((n, s) => n + (spec.exclusionesManuales?.[s.id] ?? 0), 0);
  const especies: SpeciesJobResult[] = memberships.map((m, i) => ({
    speciesId: m.speciesId,
    fotosActivas: m.fotosActivas,
    vectores: vectorsFor(m, spec.tope),
    enCuarentena: spec.inyectarVectorAuditoria && i === 0 ? 1 : 0,
  }));
  const totalImagenes = especies.reduce((s, e) => s + e.vectores, 0) + (spec.inyectarVectorAuditoria ? 1 : 0);
  const descartadasCuracion = memberships.reduce((s, m) => s + m.descartadasDuplicado + m.descartadasBorrosa, 0);

  const vramPico = vramPicoMb(spec.batch);
  const oom = vramPico > WORKER_GPU.vramMb;
  const throughput = THROUGHPUT[spec.batch];

  const etapas: Record<JobStage, number> = {
    en_cola: 0,
    cargando_dataset: 900,
    preprocesando: 2600,
    inferencia: 2600 + Math.round((totalImagenes / 900) * 1000),
    validando: 0,
    almacenando: 0,
  };
  const inferenciaMs = Math.round((totalImagenes / throughput) * 1000);
  etapas.validando = etapas.inferencia + 1800 + inferenciaMs;
  etapas.almacenando = etapas.validando + 1500;
  const duracionTotal = etapas.almacenando + 1400;

  log(0, "info", `Job ${spec.id} (${spec.experimento}) recibido · alcance: ${label} · lanzado por ${spec.lanzadoPor}`);
  log(etapas.cargando_dataset, "info", `Leyendo membresía ${spec.datasetVersion}: ${especies.length} especies, ${fmt(memberships.reduce((s, m) => s + m.fotosActivas, 0))} fotos activas`);
  log(etapas.cargando_dataset + 300, "info", `Curación ya descartó ${fmt(descartadasCuracion)} fotos (duplicados pHash + Laplaciano Var<100); no se vuelven a procesar`);
  if (totalManuales) log(etapas.cargando_dataset + 450, "info", `Curación manual: ${fmt(totalManuales)} foto(s) excluidas o de observaciones invalidadas, fuera de este job`);
  log(etapas.cargando_dataset + 600, "info", `Tope ${spec.tope} vectores/especie, round-robin por individuo → ${fmt(totalImagenes)} imágenes a procesar`);
  log(etapas.preprocesando, "info", "Preproceso: recorte central 224×224 y normalización del encoder (misma que en el teléfono)");
  log(etapas.inferencia, "info", `Cargando ${ENCODER.archivo} (${ENCODER.precision}, ${fmt(ENCODER.onnxMb)} MB) en CUDAExecutionProvider — mismo artefacto que el teléfono, mismo espacio vectorial`);
  log(etapas.inferencia + 400, "info", `Batch ${spec.batch} · VRAM estimada ${fmt(vramPico)} / ${fmt(WORKER_GPU.vramMb)} MB`);

  if (oom) {
    log(etapas.inferencia + 900, "error", `CUDA out of memory: batch ${spec.batch} necesita ~${fmt(vramPico)} MB y la ${WORKER_GPU.nombre} tiene ${fmt(WORKER_GPU.vramMb)} MB. Reintentar con batch menor.`);
    log(etapas.inferencia + 1000, "error", `Job ${spec.id} FALLIDO en inferencia. No se escribió ningún artefacto.`);
    return {
      spec, scopeLabel: label, especies, totalImagenes, descartadasCuracion,
      totalVectores: 0, enCuarentena: 0, etapas, duracionMs: etapas.inferencia + 1000,
      falloEn: "inferencia", checks: [], artifacts: [], logs,
    };
  }

  const batches = Math.ceil(totalImagenes / spec.batch);
  const hitos = [0.25, 0.5, 0.75, 1];
  hitos.forEach((h) => {
    log(etapas.inferencia + 1800 + Math.round(inferenciaMs * h), "info", `Batch ${Math.round(batches * h)}/${batches} · ${throughput} img/s (estimado)`);
  });
  if (spec.inyectarVectorAuditoria) {
    log(etapas.inferencia + 1800 + Math.round(inferenciaMs * 0.3), "warn", `Entró al lote un vector de ${AUDIT_ENCODER.id} (${AUDIT_ENCODER.dimensiones}-d) — prueba de validación inyectada a mano`);
  }

  const enCuarentena = especies.reduce((s, e) => s + e.enCuarentena, 0);
  const totalVectores = especies.reduce((s, e) => s + e.vectores, 0);
  const checks: ValidationCheck[] = [
    {
      id: "dim",
      label: `Dimensión = ${ENCODER.dimensiones}`,
      ok: enCuarentena === 0,
      detalle: enCuarentena ? `${enCuarentena} vector de ${AUDIT_ENCODER.dimensiones}-d a cuarentena` : `${fmt(totalVectores)} vectores de ${ENCODER.dimensiones}-d`,
    },
    {
      id: "encoder",
      label: `Encoder = ${ENCODER.id}`,
      ok: enCuarentena === 0,
      detalle: enCuarentena ? `${AUDIT_ENCODER.id} solo audita rechazos; nunca entra a un paquete` : "Todos los vectores traen el mismo encoder",
    },
    { id: "nan", label: "Sin NaN / Inf", ok: true, detalle: "0 vectores con valores no finitos" },
    { id: "l2", label: "Norma L2 = 1 ± 1e-3", ok: true, detalle: "Normalizados a la hiperesfera antes de guardar" },
    { id: "dup", label: "Sin vectores repetidos", ok: true, detalle: "Cada photo_id aparece una sola vez (pHash ya filtró en curación)" },
    { id: "prov", label: "Procedencia completa", ok: true, detalle: "photo_id, individual_id, taxon_id, dataset y encoder en cada fila" },
  ];
  checks.forEach((c, i) => log(etapas.validando + i * 200, c.ok ? "info" : "warn", `${c.ok ? "OK" : "RECHAZO"} · ${c.label} — ${c.detalle}`));

  const base = `${spec.scope.kind === "catalogo" ? "catalogo" : spec.scope.id}_${spec.datasetVersion}`;
  const artifacts: Artifact[] = [
    { nombre: `emb_${base}.f32.npy`, bytes: totalVectores * ENCODER.dimensiones * 4 + 128, sha256: "" },
    { nombre: `emb_${base}.meta.parquet`, bytes: totalVectores * 96 + 4096, sha256: "" },
    { nombre: `validation_${spec.id}.json`, bytes: 2048 + checks.length * 180, sha256: "" },
  ];
  if (enCuarentena) artifacts.push({ nombre: `cuarentena_${spec.id}.npy`, bytes: enCuarentena * AUDIT_ENCODER.dimensiones * 4 + 128, sha256: "" });
  artifacts.forEach((a) => (a.sha256 = fakeSha(`${spec.id}:${a.nombre}:${a.bytes}`)));
  artifacts.push({ nombre: `manifest_${spec.id}.json`, bytes: 900 + artifacts.length * 140, sha256: fakeSha(`${spec.id}:manifest`) });

  artifacts.forEach((a, i) => log(etapas.almacenando + i * 250, "info", `Escrito ${a.nombre} (${fmt(a.bytes)} B) sha256 ${a.sha256.slice(0, 12)}…`));
  log(duracionTotal, enCuarentena ? "warn" : "info", `Job ${spec.id} completado · ${fmt(totalVectores)} vectores guardados${enCuarentena ? ` · ${enCuarentena} en cuarentena` : ""}`);

  return {
    spec, scopeLabel: label, especies, totalImagenes, descartadasCuracion,
    totalVectores, enCuarentena, etapas, duracionMs: duracionTotal,
    falloEn: null, checks, artifacts, logs,
  };
}

export function stageAt(plan: JobPlan, tMs: number): JobStage {
  let current: JobStage = "en_cola";
  for (const s of STAGES) if (tMs >= plan.etapas[s.id]) current = s.id;
  if (plan.falloEn && tMs >= plan.etapas[plan.falloEn]) return plan.falloEn;
  return current;
}

export type Telemetry = { gpuPct: number; vramMb: number; cpuPct: number; imgsPorSeg: number };

/** Telemetría simulada del worker en el instante t — depende de la etapa real del job, no de un dado libre. */
export function telemetryAt(plan: JobPlan, tMs: number): Telemetry {
  const stage = stageAt(plan, tMs);
  const done = tMs >= plan.duracionMs;
  const rand = mulberry32(seedOf(plan.spec.id) + Math.floor(tMs / 400));
  const jitter = (a: number) => (rand() - 0.5) * a;
  const modelLoaded = !done && tMs >= plan.etapas.inferencia;
  const vramBase = modelLoaded ? CUDA_CONTEXT_MB + WORKER_GPU.pesoModeloVramMb : 0;

  if (done) return { gpuPct: 1, vramMb: 0, cpuPct: 3, imgsPorSeg: 0 };
  if (stage === "inferencia") {
    if (plan.falloEn === "inferencia") return { gpuPct: 12, vramMb: WORKER_GPU.vramMb, cpuPct: 20, imgsPorSeg: 0 };
    const running = tMs >= plan.etapas.inferencia + 1800;
    return running
      ? { gpuPct: Math.round(91 + jitter(8)), vramMb: Math.round(vramPicoMb(plan.spec.batch) + jitter(60)), cpuPct: Math.round(62 + jitter(10)), imgsPorSeg: Math.round(THROUGHPUT[plan.spec.batch] + jitter(12)) }
      : { gpuPct: Math.round(18 + jitter(6)), vramMb: vramBase, cpuPct: 35, imgsPorSeg: 0 };
  }
  if (stage === "preprocesando") return { gpuPct: 2, vramMb: 0, cpuPct: Math.round(84 + jitter(10)), imgsPorSeg: 0 };
  if (stage === "validando") return { gpuPct: Math.round(6 + jitter(4)), vramMb: vramBase, cpuPct: Math.round(41 + jitter(8)), imgsPorSeg: 0 };
  if (stage === "almacenando") return { gpuPct: 1, vramMb: vramBase, cpuPct: Math.round(22 + jitter(6)), imgsPorSeg: 0 };
  return { gpuPct: 1, vramMb: 0, cpuPct: Math.round(8 + jitter(4)), imgsPorSeg: 0 };
}

/** Job ya ejecutado sobre el catálogo completo con el dataset vigente — punto de partida de Centroides (F18). */
export function getSeedJobs(): JobPlan[] {
  return [
    planJob({
      id: "JOB-2026-09-24-001",
      experimento: "EXP-0042",
      scope: { kind: "catalogo" },
      datasetVersion: CURRENT_DATASET_VERSION,
      tope: TOPE_DEFAULT,
      batch: 64,
      inyectarVectorAuditoria: false,
      lanzadoPor: "Sebastián Martínez",
      lanzadoEn: "2026-09-24 22:10",
    }),
  ];
}

/** Estado de embeddings de una especie según los jobs completados con el dataset vigente. */
export function speciesHasEmbeddings(speciesId: string, jobs: JobPlan[]) {
  return jobs.some(
    (j) =>
      !j.falloEn &&
      j.spec.datasetVersion === CURRENT_DATASET_VERSION &&
      j.especies.some((e) => e.speciesId === speciesId && e.vectores > 0)
  );
}
