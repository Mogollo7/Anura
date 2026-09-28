import { realSpecies } from "@/lib/data/real";
import type { SpeciesEntry } from "./catalog";
import { getSpeciesDetail } from "./catalog";
import { getCurationSample, MIN_FOTOS_ENTRENABLE, type MockCurationObservation, type Substrato } from "./curation";
import { ANTIOQUIA_SUBREGIONES, speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import { datasetMembership } from "@/lib/worker/membership";
import { getSeedJobs, speciesHasEmbeddings } from "@/lib/worker/jobs";

export { MIN_INDIVIDUOS as MIN_INDIVIDUOS_ENTRENABLE } from "@/lib/dataset/reglas";
import { esEntrenable } from "@/lib/dataset/reglas";

/**
 * Ficha de especie (19_ADMIN/Entradas y Ficha de Especie, bloque 2 y parte
 * del 4). Nada de esto se escribe a mano desde cero: el perfil altitudinal,
 * los priors de sustrato y la propuesta de pesos wv/wg/wm salen de agregar
 * las observaciones YA CURADAS en `/curacion` — mismo dataset, misma versión.
 * Lo único manual desde el primer momento es lo que el vault dice que
 * decide una persona: morfos, LRC, pesos efectivos si el herpetólogo corrige.
 */

export type HabitatPriors = Record<Substrato, number>;

export type Pesos = { wv: number; wg: number; wm: number };

/** Margen sobre el rango real de la especie (Catálogo) para marcar una observación como atípica. */
export const OUTLIER_MARGIN_M = 150;

export type EcologicalObservation = {
  id: string;
  individualId: string;
  fuente: MockCurationObservation["fuente"];
  fuenteId: string | null;
  fecha: string;
  altitudRaw: number;
  substrato: Substrato;
  esAtipica: boolean;
};

/** Observaciones curadas con su origen (id real de iNaturalist/GBIF) y si su altitud sale del rango conocido. */
export function getEcologicalObservations(species: SpeciesEntry): EcologicalObservation[] {
  const detail = getSpeciesDetail(species.id);
  const lo = detail.altitudMin - OUTLIER_MARGIN_M;
  const hi = detail.altitudMax + OUTLIER_MARGIN_M;
  return getCurationSample(species).observations.map((o) => ({
    id: o.id,
    individualId: o.individualId,
    fuente: o.fuente,
    fuenteId: o.fuenteId,
    fecha: o.fecha,
    altitudRaw: o.altitudRaw,
    substrato: o.substrato,
    esAtipica: o.altitudRaw < lo || o.altitudRaw > hi,
  }));
}

export type AltitudRango = { min: number; max: number };

export type SpeciesSheetCalculado = {
  nObservaciones: number;
  nExcluidas: number;
  altitudMedia: number;
  /** De dónde sale la altitud: registros reales del departamento o, si no hay, la muestra de curación. */
  altitudFuente: "registros_reales" | "muestra_simulada";
  nRegistrosAltitud: number;
  altitudDesviacion: number;
  altitudRango: AltitudRango;
  habitatPriors: HabitatPriors;
  distribucion: string[]; // departamentos con registro (otros departamentos, sin subregión propia todavía)
  /** Subregiones reales de Antioquia (F16) cuyo rango de altitud solapa el de la especie. */
  subregionesAntioquia: string[];
  pesos: Pesos;
  perfil: "generalista" | "endemica_montana" | "especialista_quebrada" | "par_criptico";
};

/**
 * Estados de Modo Administrativo. Solo se asignan los que el pipeline ya
 * puede producir de verdad: DRAFT / DATASET_READY (curación, F13) y
 * EMBEDDINGS_READY (worker, F17). CENTROID_READY en adelante esperan a F18+.
 */
export type EstadoCientifico = "DRAFT" | "DATASET_READY" | "EMBEDDINGS_READY";

export type SpeciesSheet = {
  speciesId: string;
  datasetVersion: string;
  calculado: SpeciesSheetCalculado;
  entrenable: boolean;
  estado: EstadoCientifico;
  fotosActivas: number;
  individuos: number;
};

/**
 * Lo que el herpetólogo corrigió en la ficha (F15/F20), guardado por especie.
 * Antes vivía en el estado del componente y se perdía al recargar; ahora lo
 * guarda `lib/species-sheet/sheet-store.ts` y lo leen OSR, compilador y
 * laboratorio para usar el valor EFECTIVO, no el calculado a secas.
 */
export type LrcMetodo = "manual" | "regla_lrc" | "pendiente";

export type SheetOverride = {
  excluidas?: string[];
  altitudManual?: AltitudRango | null;
  pesosManual?: Pesos | null;
  lrc?: { metodo: LrcMetodo; min: number | null; max: number | null };
};

export type SheetOverrides = Record<string, SheetOverride>;

export type EffectiveSheet = SpeciesSheet & { pesosEfectivos: Pesos; pesosManuales: boolean };

/** Ficha con las correcciones aplicadas: exclusiones y rango manual recalculan; pesos manuales pisan los propuestos. */
export function getEffectiveSheet(species: SpeciesEntry, o?: SheetOverride): EffectiveSheet {
  const sheet = getSpeciesSheet(species, { excluidas: new Set(o?.excluidas ?? []), altitudManual: o?.altitudManual ?? null });
  return { ...sheet, pesosEfectivos: o?.pesosManual ?? sheet.calculado.pesos, pesosManuales: !!o?.pesosManual };
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function computeHabitatPriors(substratos: Substrato[]): HabitatPriors {
  const counts: Record<Substrato, number> = { hojarasca: 0, vegetacion: 0, quebrada: 0, roca: 0 };
  for (const s of substratos) counts[s] += 1;
  const total = substratos.length || 1;
  const priors = {} as HabitatPriors;
  (Object.keys(counts) as Substrato[]).forEach((k) => {
    priors[k] = Math.max(0.01, Math.round((counts[k] / total) * 100) / 100);
  });
  return priors;
}

/** Deriva un perfil de pesos wv/wg/wm de lo que YA se midió — no de una tabla elegida a ojo. */
function derivePesos(altitudDesviacion: number, priors: HabitatPriors): { pesos: Pesos; perfil: SpeciesSheetCalculado["perfil"] } {
  const maxPrior = Math.max(...Object.values(priors));
  const quebradaHeavy = priors.quebrada >= 0.4;

  if (quebradaHeavy) {
    return { pesos: { wv: 0.5, wg: 0.2, wm: 0.3 }, perfil: "especialista_quebrada" };
  }
  if (altitudDesviacion < 200 && maxPrior >= 0.5) {
    return { pesos: { wv: 0.3, wg: 0.6, wm: 0.1 }, perfil: "endemica_montana" };
  }
  if (altitudDesviacion >= 600) {
    return { pesos: { wv: 0.78, wg: 0.12, wm: 0.1 }, perfil: "generalista" };
  }
  return { pesos: { wv: 0.35, wg: 0.35, wm: 0.3 }, perfil: "par_criptico" };
}

export function getSpeciesSheet(
  species: SpeciesEntry,
  opts: { excluidas?: Set<string>; altitudManual?: AltitudRango | null } = {}
): SpeciesSheet {
  const sample = getCurationSample(species);
  const excluidas = opts.excluidas ?? new Set<string>();
  const activas = sample.observations.filter((o) => !excluidas.has(o.id));
  // Con todo excluido no hay de dónde calcular: se vuelve a la muestra completa en vez de dividir por 0.
  const base = activas.length ? activas : sample.observations;
  const altitudes = base.map((o) => o.altitudRaw);
  const substratos = base.map((o) => o.substrato);

  // Altitud: registros REALES del departamento (GBIF + iNaturalist, lib/data/real.ts), rango p5–p95 para que
  // un GPS malo no estire el corte. La muestra de curación (simulada) solo aporta el sustrato.
  const real = realSpecies(species.id)?.altitud ?? null;
  const altitudMedia = real ? real.media : Math.round(mean(altitudes));
  const altitudDesviacion = real ? real.desviacion : Math.round(stdDev(altitudes));
  const altitudRangoCalc: AltitudRango = real ? { min: real.p05, max: real.p95 } : { min: Math.min(...altitudes), max: Math.max(...altitudes) };
  const altitudRango = opts.altitudManual ?? altitudRangoCalc;
  const habitatPriors = computeHabitatPriors(substratos);
  const { pesos, perfil } = derivePesos(altitudDesviacion, habitatPriors);
  const membership = datasetMembership(species);
  const entrenable = esEntrenable(membership);

  return {
    speciesId: species.id,
    datasetVersion: sample.datasetVersion,
    calculado: {
      nObservaciones: base.length,
      altitudFuente: real ? "registros_reales" : "muestra_simulada",
      nRegistrosAltitud: real?.n ?? base.length,
      nExcluidas: sample.observations.length - base.length,
      altitudMedia,
      altitudDesviacion,
      altitudRango,
      habitatPriors,
      distribucion: getSpeciesDetail(species.id).distribucion,
      subregionesAntioquia: ANTIOQUIA_SUBREGIONES.filter((sub) =>
        speciesForSubregion(sub.id).some((s) => s.id === species.id)
      ).map((sub) => `${sub.numero} ${sub.nombre}`),
      pesos,
      perfil,
    },
    entrenable,
    estado: !entrenable ? "DRAFT" : speciesHasEmbeddings(species.id, getSeedJobs()) ? "EMBEDDINGS_READY" : "DATASET_READY",
    fotosActivas: membership.fotosActivas,
    individuos: membership.individuos,
  };
}
