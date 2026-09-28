/**
 * Simulación geométrica de los embeddings de BioCLIP 1 (512-d, L2), para que
 * centroides, similitudes, confusión y micro-adaptadores salgan de cálculos
 * reales sobre vectores y no de números sueltos. NO son vectores de BioCLIP:
 * la estructura imita lo que se sabe del espacio real —
 *  - familia → género → especie como jerarquía de direcciones;
 *  - Pristimantis (y géneros marcados como crípticos) con especies muy juntas;
 *  - variación por individuo y por foto;
 *  - una componente de ESCENA compartida por todas las especies (sustrato y
 *    luz: hojarasca, hoja, agua, roca, flash nocturno), que es lo que en el
 *    espacio real acerca fotos de especies distintas tomadas en el mismo fondo.
 * Las métricas medidas del vault (Top-1 66,2 %, AUROC 0,6248…) siguen siendo
 * la referencia; esta simulación sirve para la mecánica, no las reemplaza.
 *
 * Sin imports a propósito: se puede ejecutar con Node para calibrarla.
 */

export const DIM = 512;

export type SimSpecies = {
  id: string;
  genero: string;
  familia: string;
  individuos: number;
  cryptic: boolean;
};

export type SimIndividual = { id: string; train: boolean; embeddings: Float32Array[] };

export type SimSpeciesVectors = { speciesId: string; individuals: SimIndividual[] };

const ANURO_WEIGHT = 1.4; // todo es una rana: dirección común a las 41 especies
const GENUS_SPREAD = 0.42; // géneros de una misma familia
const SPECIES_SPREAD = 0.36; // especies de un mismo género
const CRYPTIC_SPREAD = 0.2; // complejos crípticos (Pristimantis…)
const INDIVIDUAL_NOISE = 0.42;
const SCENE_WEIGHT = 0.5;
const PHOTO_NOISE = 0.5;
/** Ruido repartido en las 512 dimensiones: casi no afecta la clasificación, sí la reconstrucción (E_rec). */
const ISOTROPIC_NOISE = 0.3;
const SCENES = 8;
export const MAX_SIM_INDIVIDUALS = 20;
export const PHOTOS_PER_INDIVIDUAL = 3;
export const TRAIN_FRACTION = 0.8;

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianUnit(key: string): Float32Array {
  const r = rng(hash(key));
  const v = new Float32Array(DIM);
  for (let i = 0; i < DIM; i += 2) {
    const u1 = Math.max(r(), 1e-12);
    const u2 = r();
    const m = Math.sqrt(-2 * Math.log(u1));
    v[i] = m * Math.cos(2 * Math.PI * u2);
    if (i + 1 < DIM) v[i + 1] = m * Math.sin(2 * Math.PI * u2);
  }
  return normalize(v);
}

/**
 * Subespacio de baja dimensión donde viven a la vez las diferencias entre
 * especies y las variaciones de pose, luz y fondo. Por eso una foto con mala
 * luz se puede parecer más a otra especie: el ruido no es ortogonal a lo que
 * separa especies, como sí lo sería un ruido isotrópico en 512-d.
 */
const SUBSPACE_DIM = 24;

function subspaceUnit(key: string): Float32Array {
  const r = rng(hash(`sub:${key}`));
  const out = new Float32Array(DIM);
  for (let b = 0; b < SUBSPACE_DIM; b++) {
    const basis = cached(`basis:${b}`, () => gaussianUnit(`basis:${b}`));
    const u1 = Math.max(r(), 1e-12);
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * r());
    for (let i = 0; i < DIM; i++) out[i] += g * basis[i];
  }
  return normalize(out);
}

/**
 * Rasgos diagnósticos finos (patrón, tubérculos, tímpano): pesan poco en el
 * coseno de 512-d porque la variación de escena los tapa, pero casi no
 * tienen ruido. Es la premisa del micro-adaptador: una proyección aprendida
 * los amplifica donde el coseno crudo no alcanza.
 */
const DETAIL_DIM = 16;
const DETAIL_WEIGHT = 0.12;

function detailUnit(key: string): Float32Array {
  const r = rng(hash(`det:${key}`));
  const out = new Float32Array(DIM);
  for (let b = 0; b < DETAIL_DIM; b++) {
    const basis = cached(`detail-basis:${b}`, () => gaussianUnit(`detail-basis:${b}`));
    const u1 = Math.max(r(), 1e-12);
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * r());
    for (let i = 0; i < DIM; i++) out[i] += g * basis[i];
  }
  return normalize(out);
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

function mix(parts: [Float32Array, number][]): Float32Array {
  const out = new Float32Array(DIM);
  for (const [v, w] of parts) for (let i = 0; i < DIM; i++) out[i] += v[i] * w;
  return normalize(out);
}

export function cosine(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Centroide L2: C = Σe / ‖Σe‖ (Centroides y Muestras). */
export function centroidOf(vectors: Float32Array[]): Float32Array {
  const sum = new Float32Array(DIM);
  for (const v of vectors) for (let i = 0; i < DIM; i++) sum[i] += v[i];
  return normalize(sum);
}

const dirCache = new Map<string, Float32Array>();

function cached(key: string, make: () => Float32Array) {
  let v = dirCache.get(key);
  if (!v) {
    v = make();
    dirCache.set(key, v);
  }
  return v;
}

export function speciesDirection(sp: SimSpecies) {
  const anuro = cached("anuro", () => gaussianUnit("anuro"));
  const fam = cached(`fam:${sp.familia}`, () => mix([[anuro, ANURO_WEIGHT], [gaussianUnit(`fam:${sp.familia}`), 1]]));
  const gen = cached(`gen:${sp.genero}`, () => mix([[fam, 1], [gaussianUnit(`gen:${sp.genero}`), GENUS_SPREAD]]));
  return cached(`sp:${sp.id}`, () =>
    mix([
      [gen, 1],
      [subspaceUnit(`sp:${sp.id}`), sp.cryptic ? CRYPTIC_SPREAD : SPECIES_SPREAD],
      [detailUnit(`sp:${sp.id}`), DETAIL_WEIGHT],
    ])
  );
}

export function sceneDirection(k: number) {
  return cached(`scene:${k}`, () => subspaceUnit(`scene:${k}`));
}

const vecCache = new Map<string, SimSpeciesVectors>();

/** Embeddings simulados por individuo, con el corte train/test por individuo (decisión #9). */
export function simulateSpecies(sp: SimSpecies, morphOf?: (individualId: string) => string | null): SimSpeciesVectors {
  const key = `${sp.id}:${morphOf ? "m" : ""}`;
  const hit = !morphOf && vecCache.get(key);
  if (hit) return hit;

  const dir = speciesDirection(sp);
  const n = Math.min(sp.individuos, MAX_SIM_INDIVIDUALS);
  const nTrain = n >= 2 ? Math.max(1, Math.round(n * TRAIN_FRACTION)) : n;
  const individuals: SimIndividual[] = [];

  for (let i = 0; i < n; i++) {
    // Mismo formato de id que la muestra de Curación: los primeros individuos son los mismos animales.
    const id = `${sp.id}-ind-${String(i + 1).padStart(3, "0")}`;
    const morph = morphOf?.(id) ?? null;
    const base = morph ? mix([[dir, 1], [subspaceUnit(`morph:${morph}`), 0.3]]) : dir;
    const indOffset = subspaceUnit(`ind:${id}`);
    const embeddings: Float32Array[] = [];
    for (let p = 0; p < PHOTOS_PER_INDIVIDUAL; p++) {
      const scene = sceneDirection(hash(`${id}:${p}`) % SCENES);
      embeddings.push(
        mix([
          [base, 1],
          [indOffset, INDIVIDUAL_NOISE],
          [scene, SCENE_WEIGHT],
          [subspaceUnit(`photo:${id}:${p}`), PHOTO_NOISE],
          [gaussianUnit(`iso:${id}:${p}`), ISOTROPIC_NOISE],
        ])
      );
    }
    individuals.push({ id, train: i < nTrain, embeddings });
  }

  const out = { speciesId: sp.id, individuals };
  if (!morphOf) vecCache.set(key, out);
  return out;
}

export function trainVectors(v: SimSpeciesVectors) {
  return v.individuals.filter((i) => i.train).flatMap((i) => i.embeddings);
}

export function testVectors(v: SimSpeciesVectors) {
  return v.individuals.filter((i) => !i.train).flatMap((i) => i.embeddings);
}

/** Dispersión: 1 − similitud media de los vectores de entrenamiento a su centroide. */
export function dispersion(vectors: Float32Array[], centroid: Float32Array) {
  if (!vectors.length) return 0;
  return 1 - vectors.reduce((s, v) => s + cosine(v, centroid), 0) / vectors.length;
}
