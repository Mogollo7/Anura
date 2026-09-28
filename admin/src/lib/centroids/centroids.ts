import { getAllSpecies, type SpeciesEntry } from "@/lib/mock/catalog";
import { getCurationSample, CURRENT_DATASET_VERSION } from "@/lib/mock/curation";
import { GRUPO_A_MIN_INDIVIDUOS } from "@/lib/mock/reference";
import { ANTIOQUIA_SUBREGIONES, speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import { TOPE_DEFAULT } from "@/lib/packages/constants";
import { ENCODER } from "@/lib/worker/encoder";
import { getSeedJobs, speciesHasEmbeddings } from "@/lib/worker/jobs";
import { datasetMembership, vectorsFor } from "@/lib/worker/membership";
import { subregionOf } from "./assign";
import { nearestSpecies, simDispersion } from "./sim-vectors";

/**
 * Centroides (19_ADMIN fase 6, Centroides y Muestras, decisión #10):
 * global siempre; regional si el paquete tiene ≥ 3 individuos de la
 * especie, si no `borrowed: true` (se presta el global); sub-centroide de
 * morfo solo si el herpetólogo lo declaró en ese paquete. Nunca se promedian
 * morfos opuestos. Juveniles: contrato vacío hasta juntar 10 fotos.
 *
 * El centroide sale solo de los individuos de ENTRENAMIENTO. El 20 % de los
 * individuos queda apartado para calibrar el rechazo (F21) y validar (F22):
 * el corte es por individuo, no por foto (decisión #9).
 *
 * Por decisión del usuario se calculan también las piezas del camino
 * Mahalanobis (covarianza Grupo A propia / Grupo B agrupada) para
 * compararlo contra el camino de coseno del vault. Ninguno gana aquí.
 */

export { MIN_INDIVIDUOS as MIN_INDIVIDUOS_REGIONAL } from "@/lib/dataset/reglas";
import { MIN_INDIVIDUOS as MIN_INDIVIDUOS_REGIONAL } from "@/lib/dataset/reglas";
export const MIN_FOTOS_SUBCENTROIDE_JUVENIL = 10;
export const TRAIN_FRACTION = 0.8;
export const CENTROID_BATCH = "CENT-2026-09-25";
export const CENTROID_BYTES = ENCODER.dimensiones * 2; // FP16 → 1 KiB
export const COVARIANZA_BYTES = ENCODER.dimensiones * ENCODER.dimensiones * 4; // FP32 → 1 MiB

export type MorphInput = {
  declarations: { id: string; speciesId: string; subregion: string; nombre: string }[];
  tags: Record<string, string>;
};

/** Estado de la especie DENTRO de un paquete (decisión del usuario: el aviso es por especie y subregión). */
export type RegionalCentroid = {
  subregionId: string;
  nombre: string;
  individuos: number;
  borrowed: boolean;
  estado: "CENTROID_READY" | "WARNING";
  avisos: string[];
};

export type MorphCentroid = {
  morphId: string;
  nombre: string;
  subregionId: string;
  individuosEtiquetados: number;
  calculado: boolean;
};

export type SpeciesCentroids = {
  species: SpeciesEntry;
  tieneEmbeddings: boolean;
  individuos: number;
  individuosTrain: number;
  individuosTest: number;
  vectoresTrain: number;
  vectoresTest: number;
  global: boolean;
  regionales: RegionalCentroid[];
  morfos: MorphCentroid[];
  juveniles: { fotosEstimadas: number; elegible: boolean };
  grupoMahalanobis: "A" | "B";
  /** Medidos sobre los embeddings simulados (ver embedding-sim.ts). */
  dispersion: number;
  vecino: { speciesId: string; especie: string; cos: number } | null;
  /** Estado de la especie en sí; los avisos de cada paquete viven en `regionales[].estado`. */
  estado: "SIN_EMBEDDINGS" | "INSUFICIENTE" | "CENTROID_READY" | "WARNING";
  avisos: string[];
  paquetesConAviso: number;
};

export const PROCEDENCIA = {
  dataset: CURRENT_DATASET_VERSION,
  experimento: "EXP-0042",
  job: "JOB-2026-09-24-001",
  encoder: ENCODER.id,
  lote: CENTROID_BATCH,
  fecha: "2026-09-25",
};

export function getSpeciesCentroids(species: SpeciesEntry, morphs: MorphInput): SpeciesCentroids {
  const m = datasetMembership(species);
  const vectores = vectorsFor(m, TOPE_DEFAULT);
  const tieneEmbeddings = speciesHasEmbeddings(species.id, getSeedJobs());

  const individuosTrain = m.individuos >= 2 ? Math.max(1, Math.round(m.individuos * TRAIN_FRACTION)) : m.individuos;
  const individuosTest = m.individuos - individuosTrain;
  const vectoresTrain = Math.round(vectores * (individuosTrain / Math.max(1, m.individuos)));

  // Presencia regional: qué fracción de los individuos curados cae en cada subregión.
  const sample = getCurationSample(species);
  const indSubs = new Map<string, Set<string>>();
  for (const o of sample.observations) {
    const sub = subregionOf(o);
    if (!indSubs.has(sub)) indSubs.set(sub, new Set());
    indSubs.get(sub)!.add(o.individualId);
  }
  const nSample = Math.max(1, sample.individuals.length);

  const sampleIds = new Set(sample.individuals.map((i) => i.id));
  const morfos: MorphCentroid[] = morphs.declarations
    .filter((d) => d.speciesId === species.id)
    .map((d) => {
      const etiquetados = Object.entries(morphs.tags).filter(([ind, mid]) => mid === d.id && sampleIds.has(ind)).length;
      return {
        morphId: d.id,
        nombre: d.nombre,
        subregionId: d.subregion,
        individuosEtiquetados: etiquetados,
        calculado: etiquetados >= MIN_INDIVIDUOS_REGIONAL,
      };
    });

  const juvShare = sample.individuals.filter((i) => i.estadio === "juvenil").length / nSample;
  const fotosJuv = Math.round(m.fotosActivas * juvShare);

  const regionales: RegionalCentroid[] = ANTIOQUIA_SUBREGIONES.filter((s) =>
    speciesForSubregion(s.id).some((x) => x.id === species.id)
  ).map((s) => {
    const share = (indSubs.get(s.id)?.size ?? 0) / nSample;
    const individuos = Math.round(individuosTrain * share);
    const borrowed = individuos < MIN_INDIVIDUOS_REGIONAL;
    const avisosReg: string[] = [];
    if (borrowed) avisosReg.push(`Se presta el centroide global: ${individuos} individuos en esta subregión (mínimo ${MIN_INDIVIDUOS_REGIONAL}).`);
    const sinDatos = morfos.filter((x) => x.subregionId === s.id && !x.calculado);
    if (sinDatos.length) avisosReg.push(`Morfo declarado sin ${MIN_INDIVIDUOS_REGIONAL} individuos etiquetados: ${sinDatos.map((x) => x.nombre).join(", ")}. El compilador rechaza un único centroide si los morfos son opuestos.`);
    return {
      subregionId: s.id,
      nombre: `${s.numero} ${s.nombre}`,
      individuos,
      borrowed,
      estado: avisosReg.length ? "WARNING" : "CENTROID_READY",
      avisos: avisosReg,
    };
  });

  const global = tieneEmbeddings && individuosTrain >= MIN_INDIVIDUOS_REGIONAL;
  const avisos: string[] = [];
  if (regionales.length === 0) avisos.push("La especie no entra en ninguna subregión de Antioquia por su rango de altitud.");
  const morfosHuerfanos = morfos.filter((x) => !regionales.some((r) => r.subregionId === x.subregionId));
  if (morfosHuerfanos.length) avisos.push(`Morfo declarado en una subregión donde la especie no está: ${morfosHuerfanos.map((x) => x.nombre).join(", ")}.`);

  const estado: SpeciesCentroids["estado"] = !tieneEmbeddings
    ? "SIN_EMBEDDINGS"
    : !global
      ? "INSUFICIENTE"
      : avisos.length
        ? "WARNING"
        : "CENTROID_READY";
  const vecino = global ? nearestSpecies(species) : null;

  return {
    species,
    tieneEmbeddings,
    individuos: m.individuos,
    individuosTrain,
    individuosTest,
    vectoresTrain,
    vectoresTest: vectores - vectoresTrain,
    global,
    regionales,
    morfos,
    juveniles: { fotosEstimadas: fotosJuv, elegible: fotosJuv >= MIN_FOTOS_SUBCENTROIDE_JUVENIL },
    grupoMahalanobis: m.individuos >= GRUPO_A_MIN_INDIVIDUOS ? "A" : "B",
    dispersion: global ? simDispersion(species) : 0,
    vecino: vecino ? { speciesId: vecino.species.id, especie: vecino.species.especie, cos: vecino.cos } : null,
    estado,
    avisos,
    paquetesConAviso: regionales.filter((r) => r.estado === "WARNING").length,
  };
}

export function getAllSpeciesCentroids(morphs: MorphInput) {
  return getAllSpecies().map((s) => getSpeciesCentroids(s, morphs));
}

export type PackageCentroidSummary = {
  subregionId: string;
  especies: SpeciesCentroids[];
  regionalesPropios: number;
  prestados: number;
  subCentroidesMorfo: number;
  generos: number;
  familias: number;
  /** Camino coseno (vault): centroides regionales o prestados + morfos + supercentroides, FP16. */
  bytesCoseno: number;
  /** Camino Mahalanobis: lo anterior + una covarianza por especie Grupo A + una agrupada para el Grupo B. */
  bytesMahalanobis: number;
  /** Paquete .sqlite viejo: todos los vectores de referencia en float32. */
  bytesSqliteViejo: number;
};

export function getPackageCentroids(subregionId: string, all: SpeciesCentroids[]): PackageCentroidSummary {
  const ids = new Set(speciesForSubregion(subregionId).map((s) => s.id));
  const especies = all.filter((c) => ids.has(c.species.id) && c.global);
  const regs = especies.map((c) => c.regionales.find((r) => r.subregionId === subregionId)!).filter(Boolean);
  const subCentroidesMorfo = especies.reduce(
    (n, c) => n + c.morfos.filter((x) => x.calculado && x.subregionId === subregionId).length,
    0
  );
  // Supercentroides: suma L2 de sus especies (género) y de sus géneros (familia), un voto por género.
  const generos = new Set(especies.map((c) => c.species.genero)).size;
  const familias = new Set(especies.map((c) => c.species.familia)).size;
  const vectoresCentroide = especies.length + subCentroidesMorfo + generos + familias;
  const bytesCoseno = vectoresCentroide * CENTROID_BYTES;
  const grupoA = especies.filter((c) => c.grupoMahalanobis === "A").length;
  const grupoB = especies.length - grupoA;
  const bytesMahalanobis = bytesCoseno + (grupoA + (grupoB ? 1 : 0)) * COVARIANZA_BYTES;
  const bytesSqliteViejo = especies.reduce((n, c) => n + (c.vectoresTrain + c.vectoresTest) * ENCODER.dimensiones * 4, 0);

  return {
    subregionId,
    especies,
    regionalesPropios: regs.filter((r) => !r.borrowed).length,
    prestados: regs.filter((r) => r.borrowed).length,
    subCentroidesMorfo,
    generos,
    familias,
    bytesCoseno,
    bytesMahalanobis,
    bytesSqliteViejo,
  };
}
