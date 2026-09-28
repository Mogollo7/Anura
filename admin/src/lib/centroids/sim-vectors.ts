import { getAllSpecies, type SpeciesEntry } from "@/lib/mock/catalog";
import { datasetMembership } from "@/lib/worker/membership";
import {
  centroidOf,
  cosine,
  dispersion,
  simulateSpecies,
  testVectors,
  trainVectors,
  type SimSpecies,
} from "./embedding-sim";

/**
 * Puente entre el catálogo y el simulador de embeddings. Pristimantis es el
 * género críptico porque es el ejemplo que el vault usa una y otra vez
 * (clústeres de Pristimantis en una misma subregión).
 */
export const CRYPTIC_GENERA = new Set(["Pristimantis"]);

export function toSim(sp: SpeciesEntry): SimSpecies {
  return {
    id: sp.id,
    genero: sp.genero,
    familia: sp.familia,
    individuos: datasetMembership(sp).individuos,
    cryptic: CRYPTIC_GENERA.has(sp.genero),
  };
}

const centroidCache = new Map<string, Float32Array>();

export function simCentroid(sp: SpeciesEntry): Float32Array {
  let c = centroidCache.get(sp.id);
  if (!c) {
    c = centroidOf(trainVectors(simulateSpecies(toSim(sp))));
    centroidCache.set(sp.id, c);
  }
  return c;
}

export function simDispersion(sp: SpeciesEntry) {
  const v = simulateSpecies(toSim(sp));
  return dispersion(trainVectors(v), simCentroid(sp));
}

/** Especie cuyo centroide global está más cerca (coseno). */
export function nearestSpecies(sp: SpeciesEntry, pool: SpeciesEntry[] = getAllSpecies()) {
  const c = simCentroid(sp);
  let best: { species: SpeciesEntry; cos: number } | null = null;
  for (const o of pool) {
    if (o.id === sp.id) continue;
    const cos = cosine(c, simCentroid(o));
    if (!best || cos > best.cos) best = { species: o, cos };
  }
  return best;
}

export type ConfusionPair = { a: string; b: string; ab: number; ba: number; nA: number; nB: number; cos: number };

/**
 * Confusión medida con los individuos APARTADOS (no los de entrenamiento):
 * cada vector de test se asigna al centroide más cercano dentro del conjunto.
 */
export function confusionAmong(species: SpeciesEntry[]) {
  const cents = species.map(simCentroid);
  const counts = new Map<string, number>();
  const totals = new Map<string, number>();
  let ok = 0;
  let total = 0;
  species.forEach((sp, i) => {
    for (const x of testVectors(simulateSpecies(toSim(sp)))) {
      let best = 0;
      let bestCos = -2;
      cents.forEach((c, j) => {
        const cs = cosine(x, c);
        if (cs > bestCos) {
          bestCos = cs;
          best = j;
        }
      });
      total++;
      totals.set(sp.id, (totals.get(sp.id) ?? 0) + 1);
      if (best === i) ok++;
      else counts.set(`${sp.id}>${species[best].id}`, (counts.get(`${sp.id}>${species[best].id}`) ?? 0) + 1);
    }
  });

  const pairs: ConfusionPair[] = [];
  for (let i = 0; i < species.length; i++) {
    for (let j = i + 1; j < species.length; j++) {
      const a = species[i].id;
      const b = species[j].id;
      const ab = counts.get(`${a}>${b}`) ?? 0;
      const ba = counts.get(`${b}>${a}`) ?? 0;
      if (ab + ba > 0) {
        pairs.push({ a, b, ab, ba, nA: totals.get(a) ?? 0, nB: totals.get(b) ?? 0, cos: cosine(cents[i], cents[j]) });
      }
    }
  }
  pairs.sort((x, y) => (y.ab + y.ba) / (y.nA + y.nB) - (x.ab + x.ba) / (x.nA + x.nB));
  return { accuracy: total ? ok / total : 0, total, pairs };
}
