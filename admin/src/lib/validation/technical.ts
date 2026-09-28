import type { SpeciesEntry } from "@/lib/mock/catalog";
import { CURRENT_DATASET_VERSION, MIN_FOTOS_ENTRENABLE } from "@/lib/mock/curation";
import { MIN_INDIVIDUOS_ENTRENABLE } from "@/lib/mock/species-sheet";
import { datasetMembership } from "@/lib/worker/membership";
import { getSeedJobs, speciesHasEmbeddings, type JobPlan } from "@/lib/worker/jobs";
import { speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import { getSpeciesCentroids, MIN_INDIVIDUOS_REGIONAL, type MorphInput, type SpeciesCentroids } from "@/lib/centroids/centroids";
import { clusterFingerprint, trainAdapter, type ClusterDef } from "@/lib/adapters/adapters";
import { calibratePackage, evaluateOsr, osrFingerprint, type ClusterGate, type OsrConfig, type OsrEvaluation } from "@/lib/osr/osr";

/**
 * Validación técnica (19_ADMIN fase 11, `/admin/validation`): antes de
 * compilar (F23), revisa que la cadena curación → embeddings → centroides →
 * morfos → OSR sea CONSISTENTE para un paquete (subregión), sin inventar
 * ninguna métrica que no exista todavía. "Cuando haya datos reales:
 * accuracy, precision, recall, FAR, KAR, AUROC..." — mientras no los haya,
 * esta pantalla NO calcula un accuracy propio: reutiliza el mismo cálculo
 * honesto de KAR/FAR/AUROC que ya midió el OSR (F21) sobre embeddings
 * simulados, con la misma advertencia.
 *
 * Estados de especie, en el orden del vault (Modo Administrativo):
 * DRAFT → DATASET_READY → EMBEDDINGS_READY → CENTROID_READY → WARNING/BLOCKED
 * → VALIDATING → VALIDATED. `PUBLISHED` no se asigna aquí: es de Releases (F23).
 */

export type CheckStatus = "ok" | "warning" | "blocked" | "pendiente";

export type Check = { id: string; label: string; status: CheckStatus; detalle: string };

export type EstadoPipeline =
  | "DRAFT"
  | "DATASET_READY"
  | "EMBEDDINGS_READY"
  | "CENTROID_READY"
  | "WARNING"
  | "BLOCKED"
  | "VALIDATING"
  | "VALIDATED";

export type SpeciesValidation = {
  species: SpeciesEntry;
  estado: EstadoPipeline;
  checks: Check[];
  centroides: SpeciesCentroids;
};

export type EmbeddingsCheck = { job: JobPlan | null; datasetVigente: boolean };

export type PackageValidation = {
  subregionId: string;
  species: SpeciesValidation[];
  embeddings: EmbeddingsCheck;
  osr: { evaluacion: OsrEvaluation; fingerprint: string; validada: boolean; vencida: boolean };
  resumen: Record<EstadoPipeline, number>;
  gate: { aprobado: boolean; motivos: string[] };
  compilacion: Check;
};

const peorStatus = (a: CheckStatus, b: CheckStatus): CheckStatus => {
  const orden: CheckStatus[] = ["ok", "pendiente", "warning", "blocked"];
  return orden.indexOf(a) >= orden.indexOf(b) ? a : b;
};

function estadoDe(checks: Check[], baseEntrenable: EstadoPipeline, osrValidada: boolean): EstadoPipeline {
  const peor = checks.reduce<CheckStatus>((acc, c) => peorStatus(acc, c.status), "ok");
  if (baseEntrenable === "DRAFT") return "DRAFT";
  if (peor === "blocked") return "BLOCKED";
  if (peor === "warning") return "WARNING";
  return osrValidada ? "VALIDATED" : "VALIDATING";
}

export function evaluateSpecies(
  species: SpeciesEntry,
  subregionId: string,
  morphs: MorphInput,
  clusters: ClusterDef[],
  osrEval: OsrEvaluation,
  jobs: JobPlan[],
  osrValidada: boolean
): SpeciesValidation {
  const membership = datasetMembership(species);
  const centroides = getSpeciesCentroids(species, morphs);
  const regional = centroides.regionales.find((r) => r.subregionId === subregionId) ?? null;
  const tieneEmbeddings = speciesHasEmbeddings(species.id, jobs);
  const entrenable = membership.fotosActivas >= MIN_FOTOS_ENTRENABLE && membership.individuos >= MIN_INDIVIDUOS_ENTRENABLE;

  const checks: Check[] = [];

  checks.push({
    id: "dataset",
    label: "Dataset entrenable",
    status: entrenable ? "ok" : "blocked",
    detalle: entrenable
      ? `${membership.fotosActivas} fotos activas, ${membership.individuos} individuos (piso ${MIN_FOTOS_ENTRENABLE} fotos / ${MIN_INDIVIDUOS_ENTRENABLE} individuos)`
      : `Bajo el piso: ${membership.fotosActivas} fotos, ${membership.individuos} individuos — queda en riesgo de huérfana`,
  });

  checks.push({
    id: "individuos",
    label: "Corte por individuo (80/20)",
    status: centroides.individuosTrain >= MIN_INDIVIDUOS_REGIONAL ? "ok" : entrenable ? "warning" : "pendiente",
    detalle: `${centroides.individuosTrain} entrenamiento / ${centroides.individuosTest} apartados de ${centroides.individuos} — sin cruzar train/test (F17)`,
  });

  checks.push({
    id: "duplicados",
    label: "Duplicados y borrosas excluidos antes del worker",
    status: "ok",
    detalle: `${membership.descartadasDuplicado} duplicado(s) pHash + ${membership.descartadasBorrosa} borrosa(s) (Var<100) descartadas en Curación (F13)`,
  });

  checks.push({
    id: "embeddings",
    label: "Embeddings del encoder vigente",
    status: !entrenable ? "pendiente" : tieneEmbeddings ? "ok" : "blocked",
    detalle: tieneEmbeddings
      ? `${centroides.vectoresTrain + centroides.vectoresTest} vectores del job vigente (${CURRENT_DATASET_VERSION})`
      : "Sin job de embeddings con el dataset vigente — falta correr Worker · embeddings (F17)",
  });

  checks.push({
    id: "centroide",
    label: "Centroide de esta subregión",
    status: !tieneEmbeddings ? "pendiente" : !regional ? "blocked" : regional.avisos.length ? "warning" : "ok",
    detalle: !regional
      ? "La especie no entra en esta subregión por su rango de altitud"
      : regional.avisos.length
        ? regional.avisos.join(" ")
        : `${regional.individuos} individuos propios de la subregión, sin préstamo`,
  });

  const morfosSub = centroides.morfos.filter((m) => m.subregionId === subregionId);
  checks.push({
    id: "morfos",
    label: "Morfos declarados en esta subregión",
    status: morfosSub.length === 0 ? "ok" : morfosSub.every((m) => m.calculado) ? "ok" : "warning",
    detalle:
      morfosSub.length === 0
        ? "Sin morfos declarados aquí"
        : morfosSub.map((m) => `${m.nombre}: ${m.individuosEtiquetados} etiquetados${m.calculado ? "" : " (falta llegar a 3)"}`).join(" · "),
  });

  const gate = clusters.find((c) => c.subregionId === subregionId && c.miembros.includes(species.id));
  const entrenado = !!gate?.entrenado && gate.entrenado.fingerprint === clusterFingerprint(gate);
  const validado = entrenado && !!gate?.validado && gate.validado.fingerprint === clusterFingerprint(gate);
  checks.push({
    id: "cluster",
    label: "Complejo críptico",
    status: !gate ? "ok" : validado ? "ok" : entrenado ? "warning" : "warning",
    detalle: !gate
      ? "No pertenece a ningún clúster en esta subregión"
      : validado
        ? `Validado en ${gate.clusterId}`
        : entrenado
          ? `${gate.clusterId} entrenado, falta aprobación científica (Micro-adaptadores)`
          : `${gate.clusterId} creado, falta entrenar (Micro-adaptadores)`,
  });

  const especieOsr = osrEval.especies.find((e) => e.species.id === species.id);
  checks.push({
    id: "osr",
    label: "Radio OSR calibrado",
    status: !especieOsr ? "pendiente" : especieOsr.karCos < 0.7 ? "warning" : "ok",
    detalle: especieOsr
      ? `τ ${especieOsr.tauCos.toFixed(3)} · ${(especieOsr.karCos * 100).toFixed(0)} % de sus apartados pasan la capa 1`
      : "Sin calibración OSR para esta subregión",
  });

  const baseEntrenable: EstadoPipeline = !entrenable
    ? "DRAFT"
    : !tieneEmbeddings
      ? "DATASET_READY"
      : !centroides.global
        ? "EMBEDDINGS_READY"
        : "CENTROID_READY";

  return { species, estado: estadoDe(checks, baseEntrenable, osrValidada), checks, centroides };
}

export function buildTechnicalValidation(
  subregionId: string,
  morphs: MorphInput,
  clusters: ClusterDef[],
  osrConfig: OsrConfig,
  osrValidacion: { fingerprint: string } | null
): PackageValidation {
  const pkgSpecies = speciesForSubregion(subregionId);
  const jobs = getSeedJobs();
  const job = jobs.find((j) => j.spec.scope.kind === "catalogo" || (j.spec.scope.kind === "subregion" && j.spec.scope.id === subregionId)) ?? null;

  const calib = calibratePackage(subregionId);
  const byId = new Map(pkgSpecies.map((s) => [s.id, s]));
  // Misma huella que /osr: solo los clústeres ENTRENADOS de esta subregión entran al fingerprint.
  const gates: ClusterGate[] = clusters
    .filter((c) => c.subregionId === subregionId && c.entrenado?.fingerprint === clusterFingerprint(c))
    .map((c) => {
      const miembros = c.miembros.map((id) => byId.get(id)).filter((s): s is SpeciesEntry => !!s);
      const r = trainAdapter(c, miembros, pkgSpecies);
      return { id: c.id, clusterId: c.clusterId, miembros: c.miembros, epsilonPropuesto: r.epsilon, erecMiembros: r.erecMiembros, intrusos: r.intrusos, erec: r.erec };
    });
  const osrEval = evaluateOsr(calib, osrConfig, gates);
  const fingerprint = osrFingerprint(subregionId, osrConfig, gates);
  const validada = osrValidacion?.fingerprint === fingerprint;
  const vencida = !!osrValidacion && !validada;

  const species = pkgSpecies.map((sp) => evaluateSpecies(sp, subregionId, morphs, clusters, osrEval, jobs, validada));

  const resumen = species.reduce(
    (acc, s) => ({ ...acc, [s.estado]: acc[s.estado] + 1 }),
    { DRAFT: 0, DATASET_READY: 0, EMBEDDINGS_READY: 0, CENTROID_READY: 0, WARNING: 0, BLOCKED: 0, VALIDATING: 0, VALIDATED: 0 } as Record<EstadoPipeline, number>
  );

  const motivos: string[] = [];
  if (resumen.BLOCKED > 0) motivos.push(`${resumen.BLOCKED} especie(s) bloqueada(s): revisa sus checks.`);
  if (resumen.DRAFT > 0) motivos.push(`${resumen.DRAFT} especie(s) sin piso de dataset (DRAFT).`);
  if (!validada) motivos.push(vencida ? "La calibración OSR cambió después de la última validación." : "La calibración OSR de esta subregión no está validada (/osr).");
  const aprobado = motivos.length === 0;

  return {
    subregionId,
    species,
    embeddings: { job, datasetVigente: !!job && job.spec.datasetVersion === CURRENT_DATASET_VERSION },
    osr: { evaluacion: osrEval, fingerprint, validada, vencida },
    resumen,
    gate: { aprobado, motivos },
    compilacion: {
      id: "compilador",
      label: "JSON, manifest y checksum del paquete",
      status: "pendiente",
      detalle: "El compilador (F23) todavía no existe: esta validación se repetirá sobre el artefacto real cuando lo genere.",
    },
  };
}
