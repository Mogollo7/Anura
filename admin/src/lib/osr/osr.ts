import type { SpeciesEntry } from "@/lib/mock/catalog";
import { getAllSpecies } from "@/lib/mock/catalog";
import { GRUPO_A_MIN_INDIVIDUOS } from "@/lib/mock/reference";
import { getEcologicalObservations, getSpeciesSheet } from "@/lib/mock/species-sheet";
import { speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import {
  DIM,
  cosine,
  normalize,
  simulateSpecies,
  testVectors,
  trainVectors,
  type SimSpecies,
} from "@/lib/centroids/embedding-sim";
import { CRYPTIC_GENERA, simCentroid, toSim } from "@/lib/centroids/sim-vectors";

/**
 * OSR en tres capas (19_ADMIN fase 9, `/admin/osr`; ETI-OSR-2026; decisiones
 * #3, #4, #5 y #14). El worker PROPONE, la persona valida o ajusta.
 *
 * Por decisión del usuario (F17) se calculan los dos calibradores sobre los
 * mismos vectores y se comparan con métricas medidas, sin elegir uno a mano:
 *  - Coseno: Weibull por especie sobre d = 1 − coseno de SUS vectores de
 *    entrenamiento → radio r_k = α · F⁻¹(p) → corte guardado ya convertido
 *    en similitud (`tau_kind: cosine_similarity`), que es lo que viaja.
 *  - Mahalanobis: covarianza del Grupo A propia y del Grupo B agrupada,
 *    umbral al percentil del entrenamiento (lo que hace la app Android hoy).
 *
 * Todo se ajusta con el 80 % de individuos de entrenamiento y se MIDE con el
 * 20 % apartado (decisión #9) más un banco de especies que el paquete no
 * conoce. Nada se mide contra los mismos vectores que lo calibraron.
 */

export const COBERTURA_DEFAULT = 0.95;
export const ALPHA_DEFAULT = 1;
export const PERCENTIL_MAHALANOBIS_DEFAULT = 95;
export const UMBRAL_GEO_DEFAULT = 0.05;

/** Rangos de τ que da la fuente — hipótesis, no calibración (Cascada Taxonómica; Entradas, bloque 4). */
export const RANGO_TAU_FUENTE = {
  especie: [0.72, 0.85],
  genero: [0.6, 0.7],
  familia: [0.5, 0.58],
} as const;

/** Medido en el vault (DECISION_LOG C-16, FASE_13): Mahalanobis real, no esta simulación. */
export const MEDIDO_VAULT = { tauMahalanobis: 39.35, kar: 0.95, far: 0.91, auroc: 0.6248 };

/** Copia local: dentro de bucles calientes, leer la constante importada cuesta un acceso a propiedad por vuelta. */
const D = DIM;
const PCA_DIMS = 16;
const PCA_MAX_ROWS = 360;
const PCA_ITER = 10;
/** Grupo A: covarianza propia contraída hacia la agrupada (la simulación tiene ≤ 16 individuos de entrenamiento, no 200). */
const SHRINK_GRUPO_A = 0.3;

export type OsrConfig = {
  cobertura: number;
  alpha: number;
  percentilMahalanobis: number;
  umbralGeo: number;
  politicaGeo: "rechazo" | "penalizacion";
  tauGeneroManual: Record<string, number>;
  tauFamiliaManual: Record<string, number>;
  epsilonManual: Record<string, number>;
};

export const DEFAULT_OSR_CONFIG: OsrConfig = {
  cobertura: COBERTURA_DEFAULT,
  alpha: ALPHA_DEFAULT,
  percentilMahalanobis: PERCENTIL_MAHALANOBIS_DEFAULT,
  umbralGeo: UMBRAL_GEO_DEFAULT,
  politicaGeo: "rechazo",
  tauGeneroManual: {},
  tauFamiliaManual: {},
  epsilonManual: {},
};

// ── Weibull ───────────────────────────────────────────────────────────────
export type Weibull = { beta: number; eta: number };

/** Máxima verosimilitud de una Weibull (β por bisección; η cerrado). */
export function fitWeibull(xs: number[]): Weibull {
  const x = xs.filter((v) => v > 1e-9);
  if (x.length < 2) return { beta: 1, eta: x[0] ?? 1e-3 };
  const max = Math.max(...x);
  const u = x.map((v) => v / max); // la escala no cambia β; evita desbordes con β grandes
  const lnu = u.map(Math.log);
  const meanLn = lnu.reduce((a, b) => a + b, 0) / u.length;
  const g = (b: number) => {
    let s = 0;
    let sl = 0;
    for (let i = 0; i < u.length; i++) {
      const p = Math.pow(u[i], b);
      s += p;
      sl += p * lnu[i];
    }
    return sl / s - 1 / b - meanLn;
  };
  let lo = 0.05;
  let hi = 200;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) hi = mid;
    else lo = mid;
  }
  const beta = (lo + hi) / 2;
  const eta = max * Math.pow(u.reduce((s, v) => s + Math.pow(v, beta), 0) / u.length, 1 / beta);
  return { beta, eta };
}

export function weibullQuantile(w: Weibull, p: number) {
  return w.eta * Math.pow(-Math.log(1 - p), 1 / w.beta);
}

export function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1))];
}

/** AUROC por Mann-Whitney: probabilidad de que una conocida tenga menor puntaje de rechazo que una desconocida. */
export function auroc(conocidas: number[], desconocidas: number[]) {
  if (!conocidas.length || !desconocidas.length) return 0.5;
  const all = [...conocidas.map((v) => [v, 1] as const), ...desconocidas.map((v) => [v, 0] as const)].sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let t = i; t <= j; t++) if (all[t][1] === 1) rankSum += avg;
    i = j + 1;
  }
  const n1 = conocidas.length;
  const n0 = desconocidas.length;
  // U de las conocidas cuenta cuántas veces una conocida puntúa MÁS alto; se invierte: menos puntaje = más conocida.
  return 1 - (rankSum - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

// ── Banco de especies que el paquete no conoce ───────────────────────────
export type UnknownKind = "congenere" | "genero_nuevo" | "familia_ausente" | "fuera_del_paquete";

export type UnknownSpecies = { sim: SimSpecies; nombre: string; kind: UnknownKind; nota: string };

/**
 * Especies reales de Colombia que NO están en el catálogo (o no en este
 * paquete). Sus vectores se simulan con la misma jerarquía familia → género
 * que el resto, así que una congénere cae cerca de su género, como pasaría
 * con BioCLIP. Es lo que la app va a ver en campo y debe rechazar o bajar
 * de nivel, no confundir con una especie del paquete.
 */
/**
 * Las 11 especies desconocidas REALES de unknown_open_set_v2 (primario + suplementario),
 * las mismas de la prueba viejo-contra-nuevo. Ninguna viaja en el paquete de Antioquia.
 */
const UNKNOWN_BANK: { nombre: string; genero: string; familia: string; nota: string }[] = [
  { nombre: "Pristimantis w-nigrum", genero: "Pristimantis", familia: "Craugastoridae", nota: "congénere de 10 Pristimantis del paquete" },
  { nombre: "Dendropsophus labialis", genero: "Dendropsophus", familia: "Hylidae", nota: "congénere" },
  { nombre: "Dendropsophus minutus", genero: "Dendropsophus", familia: "Hylidae", nota: "congénere" },
  { nombre: "Rhinella marina", genero: "Rhinella", familia: "Bufonidae", nota: "congénere" },
  { nombre: "Craugastor metriosistus", genero: "Craugastor", familia: "Craugastoridae", nota: "congénere" },
  { nombre: "Scinax rostratus", genero: "Scinax", familia: "Hylidae", nota: "congénere" },
  { nombre: "Leptodactylus fragilis", genero: "Leptodactylus", familia: "Leptodactylidae", nota: "congénere" },
  { nombre: "Smilisca phaeota", genero: "Smilisca", familia: "Hylidae", nota: "género fuera del paquete" },
  { nombre: "Hyloxalus picachos", genero: "Hyloxalus", familia: "Dendrobatidae", nota: "género fuera del paquete" },
  { nombre: "Espadarana prosoblepon", genero: "Espadarana", familia: "Centrolenidae", nota: "familia fuera del paquete" },
  { nombre: "Sachatamia electrops", genero: "Sachatamia", familia: "Centrolenidae", nota: "familia fuera del paquete (en revisión en el catálogo)" },
];
const UNKNOWN_INDIVIDUOS = 10;

function unknownBankFor(pkg: SpeciesEntry[]): UnknownSpecies[] {
  const generos = new Set(pkg.map((s) => s.genero));
  const familias = new Set(pkg.map((s) => s.familia));
  const kindOf = (genero: string, familia: string): UnknownKind =>
    generos.has(genero) ? "congenere" : familias.has(familia) ? "genero_nuevo" : "familia_ausente";

  const bank: UnknownSpecies[] = UNKNOWN_BANK.map((u) => ({
    sim: {
      id: `desconocida:${u.nombre}`,
      genero: u.genero,
      familia: u.familia,
      individuos: UNKNOWN_INDIVIDUOS,
      cryptic: CRYPTIC_GENERA.has(u.genero),
    },
    nombre: u.nombre,
    kind: kindOf(u.genero, u.familia),
    nota: u.nota,
  }));
  const ids = new Set(pkg.map((s) => s.id));
  for (const s of getAllSpecies().filter((x) => !ids.has(x.id)).slice(0, 8)) {
    bank.push({ sim: toSim(s), nombre: s.especie, kind: "fuera_del_paquete", nota: `del catálogo, no de este paquete (${kindOf(s.genero, s.familia) === "congenere" ? "género presente" : "género ausente"})` });
  }
  return bank;
}

/** Desenlace correcto de una desconocida según lo que el paquete sí conoce (cascada familia → género → especie). */
export function idealFor(genero: string, familia: string, pkg: SpeciesEntry[]): "MATCH_GENUS" | "MATCH_FAMILY" | "OSR_GLOBAL" {
  if (pkg.some((s) => s.genero === genero)) return "MATCH_GENUS";
  if (pkg.some((s) => s.familia === familia)) return "MATCH_FAMILY";
  return "OSR_GLOBAL";
}

// ── Calibración pesada del paquete (se cachea por subregión) ─────────────
type EvalVector = {
  grupo: "conocida" | UnknownKind;
  origen: string; // speciesId real o id de la desconocida
  nombre: string;
  genero: string;
  familia: string;
  x: Float32Array;
  cosEsp: number[];
  cosGen: number[];
  cosFam: number[];
  dMahal: number[];
};

export type SpeciesCalib = {
  species: SpeciesEntry;
  nTrain: number;
  nTest: number;
  weibull: Weibull;
  dispersion: number;
  grupo: "A" | "B";
  dTrainMahal: number[];
};

export type NodeCalib = { id: string; familia?: string; especies: number; weibull: Weibull; n: number };

export type PackageCalib = {
  subregionId: string;
  species: SpeciesCalib[];
  generos: NodeCalib[];
  familias: NodeCalib[];
  pooledWeibull: Weibull;
  unknown: UnknownSpecies[];
  vectores: EvalVector[];
};

const calibCache = new Map<string, PackageCalib>();

/**
 * Ejes principales por iteración de subespacio (los k a la vez, con
 * Gram-Schmidt en cada vuelta). Sobre una submuestra de residuos: lo que se
 * busca son las direcciones grandes, no cada detalle.
 */
function principal(rows: Float32Array[], k: number): Float32Array[] {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) | 0;
    return ((seed >>> 0) % 10000) / 10000 - 0.5;
  };
  const R = rows.map((r) => Float64Array.from(r));
  let V: Float64Array[] = Array.from({ length: k }, () => Float64Array.from({ length: D }, rand));
  const orthonormalize = (vs: Float64Array[]) => {
    const out: Float64Array[] = [];
    for (const v of vs) {
      for (const b of out) {
        let p = 0;
        for (let i = 0; i < D; i++) p += v[i] * b[i];
        for (let i = 0; i < D; i++) v[i] -= p * b[i];
      }
      let n = 0;
      for (let i = 0; i < D; i++) n += v[i] * v[i];
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < D; i++) v[i] /= n;
      out.push(v);
    }
    return out;
  };
  V = orthonormalize(V);
  for (let it = 0; it < PCA_ITER; it++) {
    const next = V.map(() => new Float64Array(D));
    for (const r of R) {
      for (let c = 0; c < k; c++) {
        const v = V[c];
        let p = 0;
        for (let i = 0; i < D; i++) p += r[i] * v[i];
        const n = next[c];
        for (let i = 0; i < D; i++) n[i] += p * r[i];
      }
    }
    V = orthonormalize(next);
  }
  return V.map((v) => Float32Array.from(v));
}

type Ppca = { lambdas: number[]; sigma2: number };

/** Covarianza regularizada (PCA probabilístico): q ejes propios + varianza isotrópica en el resto. */
function ppcaOn(residuals: Float32Array[], U: Float32Array[]): Ppca {
  const lambdas = U.map(() => 0);
  let resto = 0;
  for (const r of residuals) {
    let e = cosine(r, r);
    U.forEach((u, j) => {
      const p = cosine(r, u);
      lambdas[j] += p * p;
      e -= p * p;
    });
    resto += Math.max(0, e);
  }
  const n = Math.max(1, residuals.length);
  return { lambdas: lambdas.map((l) => Math.max(l / n, 1e-6)), sigma2: Math.max(resto / n / (D - U.length), 1e-8) };
}

function meanOf(vs: Float32Array[]) {
  const m = new Float32Array(D);
  for (const v of vs) for (let i = 0; i < D; i++) m[i] += v[i] / vs.length;
  return m;
}

export function calibratePackage(subregionId: string): PackageCalib {
  const hit = calibCache.get(subregionId);
  if (hit) return hit;

  const pkg = speciesForSubregion(subregionId);
  const sims = pkg.map((s) => simulateSpecies(toSim(s)));
  const trains = sims.map(trainVectors);
  const centroids = pkg.map(simCentroid);

  // Supercentroides: género = suma L2 de sus especies; familia = suma L2 de sus géneros (un voto por género).
  const generoIds = [...new Set(pkg.map((s) => s.genero))];
  const genCent = generoIds.map((g) => {
    const sum = new Float32Array(D);
    pkg.forEach((s, i) => { if (s.genero === g) for (let d = 0; d < D; d++) sum[d] += centroids[i][d]; });
    return normalize(sum);
  });
  const familiaIds = [...new Set(pkg.map((s) => s.familia))];
  const famCent = familiaIds.map((f) => {
    const sum = new Float32Array(D);
    generoIds.forEach((g, gi) => {
      if (pkg.find((s) => s.genero === g)!.familia === f) for (let d = 0; d < D; d++) sum[d] += genCent[gi][d];
    });
    return normalize(sum);
  });

  // ── Camino coseno: Weibull por especie sobre sus distancias de entrenamiento.
  const dTrain = trains.map((vs, i) => vs.map((x) => 1 - cosine(x, centroids[i])));
  const pooledWeibull = fitWeibull(dTrain.flat());
  const generos: NodeCalib[] = generoIds.map((g, gi) => {
    const d = pkg.flatMap((s, i) => (s.genero === g ? trains[i].map((x) => 1 - cosine(x, genCent[gi])) : []));
    return { id: g, familia: pkg.find((s) => s.genero === g)!.familia, especies: pkg.filter((s) => s.genero === g).length, weibull: fitWeibull(d), n: d.length };
  });
  const familias: NodeCalib[] = familiaIds.map((f, fi) => {
    const d = pkg.flatMap((s, i) => (s.familia === f ? trains[i].map((x) => 1 - cosine(x, famCent[fi])) : []));
    return { id: f, especies: pkg.filter((s) => s.familia === f).length, weibull: fitWeibull(d), n: d.length };
  });

  // ── Camino Mahalanobis: ejes de la varianza DENTRO de especie, agrupada.
  const means = trains.map(meanOf);
  const residuals = trains.flatMap((vs, i) =>
    vs.map((x) => {
      const r = new Float32Array(D);
      for (let d = 0; d < D; d++) r[d] = x[d] - means[i][d];
      return r;
    })
  );
  const stride = Math.max(1, Math.ceil(residuals.length / PCA_MAX_ROWS));
  const U = principal(residuals.filter((_, i) => i % stride === 0), PCA_DIMS);
  const pooled = ppcaOn(residuals, U);
  let offset = 0;
  const models = pkg.map((s, i) => {
    const own = residuals.slice(offset, offset + trains[i].length);
    offset += trains[i].length;
    const grupo: "A" | "B" = toSim(s).individuos >= GRUPO_A_MIN_INDIVIDUOS ? "A" : "B";
    if (grupo === "B") return { grupo, m: pooled };
    const o = ppcaOn(own, U);
    return {
      grupo,
      m: {
        lambdas: o.lambdas.map((l, j) => (1 - SHRINK_GRUPO_A) * l + SHRINK_GRUPO_A * pooled.lambdas[j]),
        sigma2: (1 - SHRINK_GRUPO_A) * o.sigma2 + SHRINK_GRUPO_A * pooled.sigma2,
      },
    };
  });
  const Umu = means.map((mu) => U.map((u) => cosine(mu, u)));
  const muNorm2 = means.map((mu) => cosine(mu, mu));
  // D² = Σ_j (u_jᵀr)² / λ_j + (‖r‖² − Σ_j (u_jᵀr)²) / σ², con r = x − μ_k; se arma con productos punto, sin formar r.
  const mahalTo = (x: Float32Array, Ux: number[], xx: number, k: number) => {
    const { lambdas, sigma2 } = models[k].m;
    const r2 = xx - 2 * cosine(x, means[k]) + muNorm2[k];
    let enSub = 0;
    let q = 0;
    for (let j = 0; j < U.length; j++) {
      const p = Ux[j] - Umu[k][j];
      enSub += (p * p) / lambdas[j];
      q += p * p;
    }
    return Math.sqrt(enSub + Math.max(0, r2 - q) / sigma2);
  };
  const mahal = (x: Float32Array) => {
    const Ux = U.map((u) => cosine(x, u));
    const xx = cosine(x, x);
    return means.map((_, k) => mahalTo(x, Ux, xx, k));
  };

  const species: SpeciesCalib[] = pkg.map((s, i) => ({
    species: s,
    nTrain: trains[i].length,
    nTest: testVectors(sims[i]).length,
    weibull: fitWeibull(dTrain[i]),
    dispersion: dTrain[i].reduce((a, b) => a + b, 0) / Math.max(1, dTrain[i].length),
    grupo: models[i].grupo,
    dTrainMahal: trains[i].map((x) => mahalTo(x, U.map((u) => cosine(x, u)), cosine(x, x), i)),
  }));

  const project = (x: Float32Array, base: Omit<EvalVector, "x" | "cosEsp" | "cosGen" | "cosFam" | "dMahal">): EvalVector => ({
    ...base,
    x,
    cosEsp: centroids.map((c) => cosine(x, c)),
    cosGen: genCent.map((c) => cosine(x, c)),
    cosFam: famCent.map((c) => cosine(x, c)),
    dMahal: mahal(x),
  });

  const vectores: EvalVector[] = [];
  pkg.forEach((s, i) => {
    for (const x of testVectors(sims[i])) {
      vectores.push(project(x, { grupo: "conocida", origen: s.id, nombre: s.especie, genero: s.genero, familia: s.familia }));
    }
  });
  const unknown = unknownBankFor(pkg);
  for (const u of unknown) {
    // Todas sus fotos: el paquete nunca las vio.
    for (const ind of simulateSpecies(u.sim).individuals) {
      for (const x of ind.embeddings) {
        vectores.push(project(x, { grupo: u.kind, origen: u.sim.id, nombre: u.nombre, genero: u.sim.genero, familia: u.sim.familia }));
      }
    }
  }

  const out: PackageCalib = { subregionId, species, generos, familias, pooledWeibull, unknown, vectores };
  calibCache.set(subregionId, out);
  return out;
}

// ── Evaluación con la configuración de la persona (barata: reusa las distancias) ──
export type ClusterGate = {
  id: string;
  clusterId: string;
  miembros: string[];
  epsilonPropuesto: number;
  erecMiembros: number[];
  intrusos: { speciesId: string; relacion: string; erec: number[] }[];
  erec: (x: Float32Array) => number;
};

export type Estado = "MATCH_SPECIES" | "MATCH_GENUS" | "MATCH_FAMILY" | "OSR_GLOBAL" | "OSR_CLUSTER";

export const ESTADOS: Estado[] = ["MATCH_SPECIES", "MATCH_GENUS", "MATCH_FAMILY", "OSR_CLUSTER", "OSR_GLOBAL"];

export type PathMetrics = {
  id: "coseno_unico" | "coseno_weibull" | "mahalanobis";
  nombre: string;
  viaja: string;
  kar: number;
  far: number;
  auroc: number;
  aciertoAceptadas: number;
  conocidas: number;
  desconocidas: number;
};

export type SpeciesThreshold = {
  species: SpeciesEntry;
  nTrain: number;
  nTest: number;
  beta: number;
  eta: number;
  dispersion: number;
  radio: number;
  tauCos: number;
  grupo: "A" | "B";
  tauMahal: number;
  karCos: number;
  karMahal: number;
};

export type NodeThreshold = {
  id: string;
  familia?: string;
  especies: number;
  n: number;
  tauCalc: number;
  tauManual: number | null;
  tauEfectivo: number;
  enRangoFuente: boolean;
};

export type CascadeRow = {
  grupo: "conocida" | UnknownKind;
  etiqueta: string;
  esperado: string;
  n: number;
  estados: Record<Estado, number>;
  correctos: number;
};

export type ClusterEval = {
  id: string;
  clusterId: string;
  miembros: string[];
  epsilonPropuesto: number;
  epsilonManual: number | null;
  epsilonEfectivo: number;
  falsoRechazoMiembros: number;
  rechazoIntrusosGenero: number | null;
  rechazoIntrusosOtros: number | null;
  desconocidasQueEntran: number;
  desconocidasAtajadas: number;
  /** Mismo clúster con otros ε: el compromiso entre rechazar miembros y atajar desconocidas. */
  curva: { etiqueta: string; eps: number; falsoRechazo: number; atajadas: number }[];
};

/** Punto de operación de los dos caminos a la misma cobertura: comparar a igual exigencia, no a ojo. */
export type CurvaPunto = { cobertura: number; coseno: { kar: number; far: number }; mahalanobis: { kar: number; far: number } };

export type GeoEval = {
  umbral: number;
  politica: OsrConfig["politicaGeo"];
  observaciones: number;
  bajoUmbral: number;
  atipicasAtajadas: number;
  atipicasTotal: number;
  normalesAfectadas: number;
  peores: { species: SpeciesEntry; n: number; afectadas: number; mu: number; sigma: number }[];
};

export type OsrEvaluation = {
  paths: PathMetrics[];
  especies: SpeciesThreshold[];
  generos: NodeThreshold[];
  familias: NodeThreshold[];
  cascada: CascadeRow[];
  clusters: ClusterEval[];
  geo: GeoEval;
  tauUnico: number;
  curva: CurvaPunto[];
};

export const COBERTURAS_CURVA = [0.9, 0.95, 0.975, 0.99];

const ETIQUETA_GRUPO: Record<CascadeRow["grupo"], string> = {
  conocida: "Especies del paquete (individuos apartados)",
  congenere: "Congénere no catalogada",
  genero_nuevo: "Género fuera del catálogo",
  familia_ausente: "Familia fuera del catálogo",
  fuera_del_paquete: "Especie del catálogo que no está en este paquete",
};

/** P(altitud | especie) de dos colas: 2·(1 − Φ(|h − μ| / σ)). Con 0,05 equivale a |z| > 1,96. */
export function pAltitud(h: number, mu: number, sigma: number) {
  const z = Math.abs(h - mu) / Math.max(sigma, 1);
  return 2 * (1 - phi(z));
}

function phi(z: number) {
  // Abramowitz-Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}

export function evaluateOsr(calib: PackageCalib, config: OsrConfig, gates: ClusterGate[]): OsrEvaluation {
  const pkg = calib.species.map((c) => c.species);
  const radios = calib.species.map((c) => config.alpha * weibullQuantile(c.weibull, config.cobertura));
  const tauCos = radios.map((r) => 1 - r);
  const tauMahal = calib.species.map((c) => percentile(c.dTrainMahal, config.percentilMahalanobis / 100));
  const tauUnico = 1 - config.alpha * weibullQuantile(calib.pooledWeibull, config.cobertura);

  const node = (n: NodeCalib, manual: Record<string, number>, rango: readonly [number, number]): NodeThreshold => {
    const tauCalc = 1 - config.alpha * weibullQuantile(n.weibull, config.cobertura);
    const tauManual = manual[n.id] ?? null;
    return { id: n.id, familia: n.familia, especies: n.especies, n: n.n, tauCalc, tauManual, tauEfectivo: tauManual ?? tauCalc, enRangoFuente: tauCalc >= rango[0] && tauCalc <= rango[1] };
  };
  const generos = calib.generos.map((g) => node(g, config.tauGeneroManual, RANGO_TAU_FUENTE.genero));
  const familias = calib.familias.map((f) => node(f, config.tauFamiliaManual, RANGO_TAU_FUENTE.familia));

  const clusterOf = new Map<string, ClusterGate>();
  for (const g of gates) for (const m of g.miembros) if (!clusterOf.has(m)) clusterOf.set(m, g);
  const epsOf = (g: ClusterGate) => config.epsilonManual[g.id] ?? g.epsilonPropuesto;

  // ── Tres caminos de la capa 1, mismos vectores.
  type Decision = { acepta: boolean; especie: number; score: number };
  const decide: Record<PathMetrics["id"], (v: EvalVector) => Decision> = {
    coseno_unico: (v) => {
      const best = v.cosEsp.indexOf(Math.max(...v.cosEsp));
      return { acepta: v.cosEsp[best] >= tauUnico, especie: best, score: 1 - v.cosEsp[best] };
    },
    coseno_weibull: (v) => {
      let best = -1;
      let score = Infinity;
      v.cosEsp.forEach((c, k) => {
        if (c >= tauCos[k] && (best < 0 || c > v.cosEsp[best])) best = k;
        score = Math.min(score, (1 - c) / radios[k]);
      });
      return { acepta: best >= 0, especie: best, score };
    },
    mahalanobis: (v) => {
      let best = -1;
      let score = Infinity;
      v.dMahal.forEach((d, k) => {
        if (d <= tauMahal[k] && (best < 0 || d < v.dMahal[best])) best = k;
        score = Math.min(score, d / tauMahal[k]);
      });
      return { acepta: best >= 0, especie: best, score };
    },
  };
  const NOMBRES: Record<PathMetrics["id"], [string, string]> = {
    coseno_unico: ["Coseno, un solo umbral", "1 corte para todo el paquete (lo que el vault descarta)"],
    coseno_weibull: ["Coseno + Weibull por especie", "centroides L2 FP16 + τ por especie (JSON del vault)"],
    mahalanobis: [`Mahalanobis p${config.percentilMahalanobis}`, "vectores/covarianzas (.sqlite, app Android actual)"],
  };

  const known = calib.vectores.filter((v) => v.grupo === "conocida");
  const unknown = calib.vectores.filter((v) => v.grupo !== "conocida");
  const paths: PathMetrics[] = (Object.keys(decide) as PathMetrics["id"][]).map((id) => {
    const dk = known.map(decide[id]);
    const du = unknown.map(decide[id]);
    const aceptadas = dk.filter((d) => d.acepta).length;
    const correctas = dk.filter((d, i) => d.acepta && pkg[d.especie].id === known[i].origen).length;
    return {
      id,
      nombre: NOMBRES[id][0],
      viaja: NOMBRES[id][1],
      kar: aceptadas / Math.max(1, known.length),
      far: du.filter((d) => d.acepta).length / Math.max(1, unknown.length),
      auroc: auroc(dk.map((d) => d.score), du.map((d) => d.score)),
      aciertoAceptadas: correctas / Math.max(1, aceptadas),
      conocidas: known.length,
      desconocidas: unknown.length,
    };
  });

  const curva: CurvaPunto[] = COBERTURAS_CURVA.map((p) => {
    const tc = calib.species.map((c) => 1 - config.alpha * weibullQuantile(c.weibull, p));
    const tm = calib.species.map((c) => percentile(c.dTrainMahal, p));
    const accCos = (v: EvalVector) => v.cosEsp.some((c, k) => c >= tc[k]);
    const accMah = (v: EvalVector) => v.dMahal.some((d, k) => d <= tm[k]);
    const rate = (vs: EvalVector[], f: (v: EvalVector) => boolean) => vs.filter(f).length / Math.max(1, vs.length);
    return {
      cobertura: p,
      coseno: { kar: rate(known, accCos), far: rate(unknown, accCos) },
      mahalanobis: { kar: rate(known, accMah), far: rate(unknown, accMah) },
    };
  });

  // ── τ por especie, con su aceptación medida en los apartados.
  const especies: SpeciesThreshold[] = calib.species.map((c, k) => {
    const mine = known.filter((v) => v.origen === c.species.id);
    return {
      species: c.species,
      nTrain: c.nTrain,
      nTest: c.nTest,
      beta: c.weibull.beta,
      eta: c.weibull.eta,
      dispersion: c.dispersion,
      radio: radios[k],
      tauCos: tauCos[k],
      grupo: c.grupo,
      tauMahal: tauMahal[k],
      karCos: mine.filter((v) => v.cosEsp[k] >= tauCos[k]).length / Math.max(1, mine.length),
      karMahal: mine.filter((v) => v.dMahal[k] <= tauMahal[k]).length / Math.max(1, mine.length),
    };
  });

  // ── Cascada completa del camino que viaja al teléfono (coseno): capa 1 → capa 2 → género → familia → rechazo.
  const cascade = (v: EvalVector): { estado: Estado; especie?: string; genero?: string; familia?: string } => {
    const d = decide.coseno_weibull(v);
    if (d.acepta) {
      const sp = pkg[d.especie];
      const gate = clusterOf.get(sp.id);
      if (gate && gate.erec(v.x) > epsOf(gate)) return { estado: "OSR_CLUSTER", genero: sp.genero };
      return { estado: "MATCH_SPECIES", especie: sp.id };
    }
    let g = -1;
    v.cosGen.forEach((c, i) => { if (c >= generos[i].tauEfectivo && (g < 0 || c > v.cosGen[g])) g = i; });
    if (g >= 0) return { estado: "MATCH_GENUS", genero: generos[g].id };
    let f = -1;
    v.cosFam.forEach((c, i) => { if (c >= familias[i].tauEfectivo && (f < 0 || c > v.cosFam[f])) f = i; });
    if (f >= 0) return { estado: "MATCH_FAMILY", familia: familias[f].id };
    return { estado: "OSR_GLOBAL" };
  };

  const grupos: CascadeRow["grupo"][] = ["conocida", "congenere", "genero_nuevo", "familia_ausente", "fuera_del_paquete"];
  const cascada: CascadeRow[] = grupos
    .map((grupo) => {
      const vs = calib.vectores.filter((v) => v.grupo === grupo);
      const estados = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>;
      let correctos = 0;
      for (const v of vs) {
        const r = cascade(v);
        estados[r.estado]++;
        if (grupo === "conocida") {
          if (r.estado === "MATCH_SPECIES" && r.especie === v.origen) correctos++;
        } else {
          const ideal = idealFor(v.genero, v.familia, pkg);
          if (ideal === "MATCH_GENUS" && ((r.estado === "MATCH_GENUS" && r.genero === v.genero) || (r.estado === "OSR_CLUSTER" && r.genero === v.genero))) correctos++;
          else if (ideal === "MATCH_FAMILY" && r.estado === "MATCH_FAMILY" && r.familia === v.familia) correctos++;
          else if (ideal === "OSR_GLOBAL" && r.estado === "OSR_GLOBAL") correctos++;
        }
      }
      const esperado =
        grupo === "conocida"
          ? "su especie"
          : grupo === "congenere"
            ? "su género (u OSR_CLUSTER)"
            : grupo === "genero_nuevo"
              ? "su familia"
              : grupo === "familia_ausente"
                ? "OSR_GLOBAL"
                : "el nivel que el paquete conozca";
      return { grupo, etiqueta: ETIQUETA_GRUPO[grupo], esperado, n: vs.length, estados, correctos };
    })
    .filter((r) => r.n > 0);

  // ── Capa 2: ε de cada clúster entrenado, re-medido con el ε efectivo.
  const clusters: ClusterEval[] = gates.map((g) => {
    const eps = epsOf(g);
    const rate = (xs: number[]) => (xs.length ? xs.filter((e) => e > eps).length / xs.length : null);
    const gen = g.intrusos.filter((i) => i.relacion === "mismo género").flatMap((i) => i.erec);
    const otros = g.intrusos.filter((i) => i.relacion !== "mismo género").flatMap((i) => i.erec);
    // Desconocidas que la capa 1 mete en un miembro del clúster: ahí es donde la capa 2 tiene que atajarlas.
    const entran = unknown.filter((v) => {
      const d = decide.coseno_weibull(v);
      return d.acepta && g.miembros.includes(pkg[d.especie].id);
    });
    const erecEntran = entran.map((v) => g.erec(v.x));
    const curvaEps = [0.8, 0.9, 0.95, 0.99].map((p) => {
      const e = percentile(g.erecMiembros, p);
      return {
        etiqueta: `p${Math.round(p * 100)}`,
        eps: e,
        falsoRechazo: g.erecMiembros.filter((x) => x > e).length / Math.max(1, g.erecMiembros.length),
        atajadas: erecEntran.filter((x) => x > e).length,
      };
    });
    return {
      id: g.id,
      clusterId: g.clusterId,
      miembros: g.miembros,
      epsilonPropuesto: g.epsilonPropuesto,
      epsilonManual: config.epsilonManual[g.id] ?? null,
      epsilonEfectivo: eps,
      falsoRechazoMiembros: rate(g.erecMiembros) ?? 0,
      rechazoIntrusosGenero: rate(gen),
      rechazoIntrusosOtros: rate(otros),
      desconocidasQueEntran: entran.length,
      desconocidasAtajadas: erecEntran.filter((x) => x > eps).length,
      curva: curvaEps,
    };
  });

  // ── Capa 3: umbral_geo contra observaciones curadas reales (F13/F20). Son registros de la especie:
  // si caen bajo el umbral, o es un GPS malo (atípica) o es un rechazo injusto.
  let observaciones = 0;
  let bajoUmbral = 0;
  let atipicasAtajadas = 0;
  let atipicasTotal = 0;
  let normalesAfectadas = 0;
  const porEspecie = pkg.map((sp) => {
    const sheet = getSpeciesSheet(sp);
    const mu = sheet.calculado.altitudMedia;
    const sigma = sheet.calculado.altitudDesviacion;
    const obs = getEcologicalObservations(sp);
    let afectadas = 0;
    for (const o of obs) {
      observaciones++;
      if (o.esAtipica) atipicasTotal++;
      if (pAltitud(o.altitudRaw, mu, sigma) < config.umbralGeo) {
        bajoUmbral++;
        if (o.esAtipica) atipicasAtajadas++;
        else {
          normalesAfectadas++;
          afectadas++;
        }
      }
    }
    return { species: sp, n: obs.length, afectadas, mu, sigma };
  });

  return {
    paths,
    especies,
    generos,
    familias,
    cascada,
    clusters,
    tauUnico,
    curva,
    geo: {
      umbral: config.umbralGeo,
      politica: config.politicaGeo,
      observaciones,
      bajoUmbral,
      atipicasAtajadas,
      atipicasTotal,
      normalesAfectadas,
      peores: porEspecie.filter((p) => p.afectadas > 0).sort((a, b) => b.afectadas / b.n - a.afectadas / a.n).slice(0, 6),
    },
  };
}

/** Huella de lo que se valida: si cambia la configuración o un clúster, la validación queda vencida. */
export function osrFingerprint(subregionId: string, config: OsrConfig, gates: { id: string; epsilonPropuesto: number }[]) {
  return JSON.stringify([subregionId, config, gates.map((g) => [g.id, g.epsilonPropuesto.toFixed(4)])]);
}
