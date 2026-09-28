import type { SpeciesEntry } from "@/lib/mock/catalog";
import { getSpeciesSheet } from "@/lib/mock/species-sheet";
import { SUBSTRATO_LABEL, type Substrato } from "@/lib/mock/curation";
import { ENCODER } from "@/lib/worker/encoder";
import { DIM, cosine, normalize, simulateSpecies, testVectors, trainVectors } from "@/lib/centroids/embedding-sim";
import { confusionAmong, simCentroid, toSim } from "@/lib/centroids/sim-vectors";

/**
 * Micro-adaptadores (19_ADMIN fase 7, Microadaptadores y Transfer Learning,
 * decisión #6). El encoder no se toca: solo se entrena la matriz W del
 * clúster (512 × m, FP16 por defecto → 64 KiB). Los miembros los elige el
 * herpetólogo; el sistema solo alerta confusión medida.
 *
 * ArcFace REAL (no una proyección discriminante cerrada): descenso de
 * gradiente con margen angular aditivo sobre los embeddings simulados,
 * proyectados al subespacio Q del clúster. Cada especie es un prototipo
 * unitario que se entrena `epocas` veces con `lr`, margen `m` y escala `s`
 * (los mismos números que ya se pedían en la UI sin usarse). En inferencia,
 * la especie se decide por el coseno más alto contra esos prototipos —
 * igual que ArcFace real en el momento de clasificar. Las métricas se MIDEN
 * con los individuos apartados. `W` (para el error de reconstrucción, capa 2
 * del OSR) sigue siendo un subespacio aparte: ArcFace entrena la regla de
 * clasificación, no el subespacio de reconstrucción.
 */

export const ARCFACE_MARGEN = 0.35;
export const ARCFACE_ESCALA = 30;
export const EPOCAS_DEFAULT = 30; // la fuente da 20–50
export const LR_DEFAULT = 0.01; // paso inicial por muestra (SGD, con decaimiento); medido: estable entre 0,002 y 0,01, diverge por encima de 0,02
export const COLUMNAS_DEFAULT = 64;
export const MAX_CLUSTER_SPECIES = 12; // límite configurable del pipeline, no una ley biológica
/** Decisión #6: dos miembros a menos de 0,02 de coseno tras entrenar → aviso. Antes y después se miden en la misma unidad (distancia coseno entre prototipos). */
export const GAP_MINIMO = 0.02;
export const UMBRAL_ALERTA_CONFUSION = 0.08;
export const UMBRAL_ALERTA_COSENO = 0.93;
const PERCENTIL_EPSILON = 0.95;

export type AdapterConfig = {
  columnas: number;
  epocas: number;
  lr: number;
  margen: number;
  escala: number;
  dtype: "FP16" | "FP32";
};

export const DEFAULT_CONFIG: AdapterConfig = {
  columnas: COLUMNAS_DEFAULT,
  epocas: EPOCAS_DEFAULT,
  lr: LR_DEFAULT,
  margen: ARCFACE_MARGEN,
  escala: ARCFACE_ESCALA,
  dtype: "FP16",
};

export function matrixBytes(cols: number, dtype: AdapterConfig["dtype"]) {
  return ENCODER.dimensiones * cols * (dtype === "FP16" ? 2 : 4);
}

export type ClusterDef = {
  id: string;
  clusterId: string;
  subregionId: string;
  miembros: string[];
  config: AdapterConfig;
  creadoPor: string;
  entrenado?: { fingerprint: string; por: string };
  validado?: { fingerprint: string; por: string };
};

export function clusterFingerprint(c: Pick<ClusterDef, "miembros" | "config" | "subregionId">) {
  return JSON.stringify([c.subregionId, [...c.miembros].sort(), c.config]);
}

// ── Avisos: el sistema señala, no crea ────────────────────────────────────
export type ConfusionAlert = {
  a: SpeciesEntry;
  b: SpeciesEntry;
  tasa: number; // fracción de vectores apartados de A y B asignados al otro
  cos: number;
};

export function confusionAlerts(species: SpeciesEntry[]): { accuracy: number; alerts: ConfusionAlert[] } {
  const byId = new Map(species.map((s) => [s.id, s]));
  const { accuracy, pairs } = confusionAmong(species);
  const alerts = pairs
    .map((p) => ({ a: byId.get(p.a)!, b: byId.get(p.b)!, tasa: (p.ab + p.ba) / Math.max(1, p.nA + p.nB), cos: p.cos }))
    .filter((p) => p.tasa >= UMBRAL_ALERTA_CONFUSION || p.cos >= UMBRAL_ALERTA_COSENO);
  return { accuracy, alerts };
}

// ── Álgebra mínima ────────────────────────────────────────────────────────
function dot(a: Float32Array, b: Float32Array) {
  return cosine(a, b);
}

function axpy(y: Float32Array, a: number, x: Float32Array) {
  for (let i = 0; i < y.length; i++) y[i] += a * x[i];
}

function norm(v: Float32Array) {
  return Math.sqrt(dot(v, v));
}

/** Gram-Schmidt: agrega `v` a la base si aporta una dirección nueva. */
function pushOrthonormal(basis: Float32Array[], v: Float32Array, max: number) {
  if (basis.length >= max) return;
  const w = Float32Array.from(v);
  for (const b of basis) axpy(w, -dot(w, b), b);
  const n = norm(w);
  if (n > 1e-4) basis.push(normalize(w));
}

/** Componentes principales de un conjunto de residuos (iteración de potencias con deflación). */
function principalDirections(rows: Float32Array[], k: number, seedKey: string): Float32Array[] {
  const dirs: Float32Array[] = [];
  let seed = seedKey.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 17);
  const rand = () => {
    seed = (seed * 1103515245 + 12345) | 0;
    return ((seed >>> 0) % 10000) / 10000 - 0.5;
  };
  for (let c = 0; c < k; c++) {
    let v = normalize(Float32Array.from({ length: DIM }, rand));
    for (let it = 0; it < 14; it++) {
      const next = new Float32Array(DIM);
      for (const r of rows) axpy(next, dot(r, v), r);
      for (const d of dirs) axpy(next, -dot(next, d), d);
      const n = norm(next);
      if (n < 1e-8) break;
      v = normalize(next);
    }
    dirs.push(v);
  }
  return dirs;
}

// ── Vectores pequeños (q ≤ 28) para ArcFace ──────────────────────────────
function normalizeVec(v: number[]) {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

function dotVec(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Generador determinista (LCG), igual patrón que `principalDirections`. */
function seededRng(seedKey: string) {
  let seed = seedKey.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 17) || 1;
  return () => {
    seed = (seed * 1103515245 + 12345) | 0;
    return ((seed >>> 0) % 10000) / 10000;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * ArcFace desde cero: un prototipo unitario por especie, entrenado con
 * pérdida de margen angular aditivo (Deng et al. 2019) por descenso de
 * gradiente estocástico. `z` ya llega normalizado (coordenadas del
 * subespacio Q, en la hiperesfera). Deriva del logit con margen:
 * cos(θ+m) = cosθ·cos m − sinθ·sin m, y de ahí el gradiente respecto a
 * cosθ = z·w — el mismo cálculo que usa el paper, sin librería.
 */
function trainArcFace(coordsTrain: number[][][], q: number, config: AdapterConfig, seedKey: string): number[][] {
  const k = coordsTrain.length;
  const rand = seededRng(seedKey);
  // Init: media de cada especie, normalizada — parte cerca del centroide, no de un punto al azar.
  const W: number[][] = coordsTrain.map((cs) => {
    const m = new Array<number>(q).fill(0);
    for (const c of cs) for (let d = 0; d < q; d++) m[d] += c[d] / (cs.length || 1);
    return normalizeVec(m);
  });
  const samples: { z: number[]; y: number }[] = [];
  coordsTrain.forEach((cs, c) => cs.forEach((z) => samples.push({ z: normalizeVec(z), y: c })));
  if (!samples.length || k < 2) return W;

  const s = config.escala;
  const m = config.margen;
  const cosM = Math.cos(m);
  const sinM = Math.sin(m);
  let step = 0;

  for (let epoch = 0; epoch < config.epocas; epoch++) {
    shuffleInPlace(samples, rand);
    for (const { z, y } of samples) {
      // Con SGD de una muestra a la vez y escala 30, un lr fijo diverge (colapsa a un prototipo
      // por clúster, medido: precisión de entrenamiento cae a 50 % con especies que se confunden).
      // Decaimiento por paso (no por época, que no protege cuando hay muchas muestras por época):
      // 1/(1+0,02·paso). Medido con especies a coseno 0,94 entre sí: 88–95 % de acierto estable.
      const lr = config.lr / (1 + 0.02 * step);
      step++;
      const cosj = W.map((w) => dotVec(z, w));
      const cosY = Math.min(1, Math.max(-1, cosj[y]));
      const sinY = Math.sqrt(Math.max(0, 1 - cosY * cosY));
      const cosYAdj = cosY * cosM - sinY * sinM;
      const logits = cosj.map((c, j) => s * (j === y ? cosYAdj : c));
      const maxLogit = Math.max(...logits);
      const exps = logits.map((l) => Math.exp(l - maxLogit));
      const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
      const probs = exps.map((e) => e / sumExp);

      for (let j = 0; j < k; j++) {
        const dLdLogit = probs[j] - (j === y ? 1 : 0);
        let dLdCos: number;
        if (j === y) {
          // d(cos(θ+m))/d(cosθ) = cos m + sin m · cosθ/sinθ
          const dAdj = cosM + (sinM * cosY) / Math.max(sinY, 1e-6);
          dLdCos = dLdLogit * s * dAdj;
        } else {
          dLdCos = dLdLogit * s;
        }
        for (let d = 0; d < q; d++) W[j][d] -= lr * dLdCos * z[d];
      }
      for (let j = 0; j < k; j++) {
        const n = Math.hypot(...W[j]) || 1;
        for (let d = 0; d < q; d++) W[j][d] /= n;
      }
    }
  }
  return W;
}

// ── Entrenamiento (simulado) y validación ────────────────────────────────
export type ContextoMiembro = { speciesId: string; altitudMedia: number; altitudDesv: number; sustrato: string };

export type AdapterResult = {
  fingerprint: string;
  accAntes: number;
  accDespues: number;
  porEspecie: { speciesId: string; n: number; antes: number; despues: number }[];
  matriz: { ids: string[]; counts: number[][] };
  gapMin: { a: string; b: string; antes: number; despues: number } | null;
  epsilon: number;
  falsoRechazo: number;
  /** E_rec de los vectores apartados de los miembros: con esto el OSR (F21) re-mide cualquier ε sin reentrenar. */
  erecMiembros: number[];
  /** E_rec de cualquier vector contra el subespacio de este clúster (capa 2 del OSR). */
  erec: (x: Float32Array) => number;
  intrusos: { speciesId: string; relacion: "mismo género" | "misma familia" | "otra familia"; n: number; rechazados: number; erec: number[] }[];
  columnas: number;
  bytesMatriz: number;
  bytesCentroidesCluster: number;
  contexto: ContextoMiembro[];
  avisos: string[];
};

function dominantSubstrate(priors: Record<Substrato, number>) {
  return (Object.keys(priors) as Substrato[]).reduce((a, b) => (priors[a] >= priors[b] ? a : b));
}

export function trainAdapter(cluster: ClusterDef, members: SpeciesEntry[], intruderPool: SpeciesEntry[]): AdapterResult {
  const k = members.length;
  const cols = Math.max(k, Math.min(cluster.config.columnas, DIM));
  const sims = members.map((m) => simulateSpecies(toSim(m)));
  const train = sims.map(trainVectors);
  const test = sims.map(testVectors);
  const means = members.map(simCentroid);

  // Dirección media del clúster y residuos dentro de cada especie (pose, luz, fondo, individuo).
  const clusterMean = new Float32Array(DIM);
  means.forEach((m) => axpy(clusterMean, 1 / k, m));
  const residuals: Float32Array[] = [];
  train.forEach((vs, c) =>
    vs.forEach((x) => {
      const r = Float32Array.from(x);
      axpy(r, -1, means[c]);
      residuals.push(r);
    })
  );

  // Subespacio reducido Q donde vive casi toda la variación del clúster.
  const Q: Float32Array[] = [];
  const Q_DIM = 28;
  pushOrthonormal(Q, clusterMean, Q_DIM);
  means.forEach((m) => pushOrthonormal(Q, m, Q_DIM));
  principalDirections(residuals, Q_DIM - Q.length, cluster.id).forEach((d) => pushOrthonormal(Q, d, Q_DIM));
  const q = Q.length;
  const toQ = (x: Float32Array) => Q.map((b) => dot(x, b));

  // ArcFace real: un prototipo unitario por especie, entrenado con margen angular sobre el subespacio Q.
  const coordsTrain = train.map((vs) => vs.map(toQ));
  const protos = trainArcFace(coordsTrain, q, cluster.config, cluster.id);
  const proj = (x: Float32Array) => normalizeVec(toQ(x));

  // W (lo que viaja al teléfono): subespacio del clúster, completado con sus direcciones principales hasta m columnas.
  const W: Float32Array[] = [];
  Q.forEach((b) => pushOrthonormal(W, b, cols));
  principalDirections(train.flat(), Math.max(0, cols - W.length), `${cluster.id}:full`).forEach((e) => pushOrthonormal(W, e, cols));
  const erec = (x: Float32Array) => {
    let s = 0;
    for (const w of W) {
      const p = dot(x, w);
      s += p * p;
    }
    return Math.max(0, 1 - s);
  };

  // Antes: coseno contra los centroides de 512. Después: distancia en el espacio del adaptador.
  const counts = members.map(() => members.map(() => 0));
  const porEspecie = members.map((m, c) => {
    let antes = 0;
    let despues = 0;
    for (const x of test[c]) {
      const raw = means.map((mu) => dot(x, mu));
      if (raw.indexOf(Math.max(...raw)) === c) antes++;
      const z = proj(x);
      const scores = protos.map((p) => dotVec(p, z));
      const pred = scores.indexOf(Math.max(...scores));
      counts[c][pred]++;
      if (pred === c) despues++;
    }
    return { speciesId: m.id, n: test[c].length, antes, despues };
  });
  const totalTest = porEspecie.reduce((s, p) => s + p.n, 0) || 1;

  // Par más cercano, en la misma unidad antes y después: distancia coseno (1 − similitud).
  // Antes: entre los centroides de 512-d (lo que compara el teléfono sin adaptador).
  // Después: entre los prototipos de ArcFace ya entrenados, unitarios por construcción.
  let gapMin: AdapterResult["gapMin"] = null;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const antes = 1 - dot(means[i], means[j]);
      const despues = 1 - dotVec(protos[i], protos[j]);
      if (!gapMin || despues < gapMin.despues) gapMin = { a: members[i].id, b: members[j].id, antes, despues };
    }
  }

  // ε: percentil 95 del error de reconstrucción de los miembros apartados.
  const memberErrs = test.flat().map(erec).sort((a, b) => a - b);
  const epsilon = memberErrs.length ? memberErrs[Math.min(memberErrs.length - 1, Math.floor(memberErrs.length * PERCENTIL_EPSILON))] : 0;
  const falsoRechazo = memberErrs.filter((e) => e > epsilon).length / Math.max(1, memberErrs.length);

  // Intrusos: las especies del paquete que NO son miembros y más se parecen al clúster.
  const generos = new Set(members.map((m) => m.genero));
  const familias = new Set(members.map((m) => m.familia));
  const unitMean = normalize(clusterMean);
  const intrusos = intruderPool
    .filter((s) => !members.some((m) => m.id === s.id))
    .map((s) => ({ s, cos: dot(simCentroid(s), unitMean) }))
    .sort((a, b) => b.cos - a.cos)
    .slice(0, 6)
    .map(({ s }) => {
      const errs = testVectors(simulateSpecies(toSim(s))).map(erec);
      return {
        speciesId: s.id,
        relacion: generos.has(s.genero) ? "mismo género" : familias.has(s.familia) ? "misma familia" : "otra familia",
        n: errs.length,
        rechazados: errs.filter((e) => e > epsilon).length,
        erec: errs,
      } as const;
    });

  const contexto = members.map((m) => {
    const sheet = getSpeciesSheet(m);
    return {
      speciesId: m.id,
      altitudMedia: sheet.calculado.altitudMedia,
      altitudDesv: sheet.calculado.altitudDesviacion,
      sustrato: SUBSTRATO_LABEL[dominantSubstrate(sheet.calculado.habitatPriors)],
    };
  });

  const avisos: string[] = [];
  if (k > MAX_CLUSTER_SPECIES) {
    avisos.push(`Este clúster supera el límite operativo recomendado (${MAX_CLUSTER_SPECIES} especies): conviene dividirlo en subclústeres. Dividirlo lo decide el herpetólogo.`);
  }
  if (gapMin && gapMin.despues < GAP_MINIMO) {
    const a = contexto.find((c) => c.speciesId === gapMin!.a)!;
    const b = contexto.find((c) => c.speciesId === gapMin!.b)!;
    const contextoDesempata =
      Math.abs(a.altitudMedia - b.altitudMedia) > Math.max(a.altitudDesv, b.altitudDesv) || a.sustrato !== b.sustrato;
    avisos.push(
      `Dos miembros siguen a menos de ${GAP_MINIMO} de coseno tras entrenar (decisión #6). ${
        contextoDesempata ? "El contexto (altitud o sustrato) puede desempatar." : "Sin canto ni contexto que los separe: queda pendiente de auditoría."
      }`
    );
  }
  if (cluster.config.columnas < k) avisos.push(`Con ${cluster.config.columnas} columnas no caben ${k} especies: se usaron ${k}.`);

  return {
    fingerprint: clusterFingerprint(cluster),
    accAntes: porEspecie.reduce((s, p) => s + p.antes, 0) / totalTest,
    accDespues: porEspecie.reduce((s, p) => s + p.despues, 0) / totalTest,
    porEspecie,
    matriz: { ids: members.map((m) => m.id), counts },
    gapMin,
    epsilon,
    falsoRechazo,
    erecMiembros: memberErrs,
    erec,
    intrusos,
    columnas: cols,
    bytesMatriz: matrixBytes(cols, cluster.config.dtype),
    bytesCentroidesCluster: k * cols * (cluster.config.dtype === "FP16" ? 2 : 4),
    contexto,
    avisos,
  };
}
