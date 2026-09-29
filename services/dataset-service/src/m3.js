/**
 * Lo que sigue del centroide global (M3), con los mismos vectores de pgvector.
 *
 * - Radio Weibull: d = 1 − coseno de cada foto de entrenamiento a su centroide;
 *   τ = 1 − α · F⁻¹(0,95). Igual para el supercentroide de género y de familia.
 * - Tres capas, medidas en la partición val (no se usó para el centroide ni para τ):
 *   especie si pasa su τ, si no género, si no familia, si no rechazo.
 * - ArcFace (margen angular aditivo) solo sobre pares que ya se parecen o se confunden.
 *   El resultado es una sugerencia: el herpetólogo arma el clúster, esto no lo publica.
 *
 * No hay gaussiana de altitud (la observación no trae metros) ni centroide regional
 * (no hay polígono de subregión). No se rellena con el JSON exportado ni con la cabecera.
 */
const COBERTURA = 0.95;
const ALPHA = 1;
const EPOCAS = 20;
const LR = 0.01;
const MARGEN = 0.35;
const ESCALA = 30;
const MAX_PARES = 5;
const UMBRAL_COSENO = 0.9;
const UMBRAL_CONFUSION = 0.08;

const FOTOS = (particion) => `
  SELECT e.sha256, e.vector, f.especie_id, es.genero, es.familia
  FROM dataset.embedding e
  JOIN dataset.foto f ON f.sha256 = e.sha256
  JOIN dataset.especie es ON es.id = f.especie_id
  JOIN dataset.version_foto vf ON vf.sha256 = e.sha256
    AND vf.version_id = (SELECT MAX(id) FROM dataset.version)
  WHERE e.encoder_sha256 = $1 AND vf.particion = '${particion}'
    AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = e.sha256 AND x.revertida IS NULL)`;

function fitWeibull(xs) {
  const x = xs.filter((v) => v > 1e-9);
  if (x.length < 2) return { beta: 1, eta: x[0] ?? 1e-3 };
  const max = Math.max(...x);
  const u = x.map((v) => v / max);
  const lnu = u.map(Math.log);
  const meanLn = lnu.reduce((a, b) => a + b, 0) / u.length;
  const g = (b) => {
    let s = 0;
    let sl = 0;
    for (let i = 0; i < u.length; i++) {
      const p = u[i] ** b;
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
  const eta = max * (u.reduce((s, v) => s + v ** beta, 0) / u.length) ** (1 / beta);
  return { beta, eta };
}

function quantile(w, p) {
  return w.eta * (-Math.log(1 - p)) ** (1 / w.beta);
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalizar(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

function parseVector(texto) {
  return texto.replace(/[[\]{}]/g, '').split(',').map(Number);
}

/** Prototipos unitarios, margen angular aditivo, el mismo SGD que adapters.ts. */
function trainArcFace(porClase) {
  const k = porClase.length;
  const q = porClase[0][0].length;
  const W = porClase.map((cs) => {
    const m = new Array(q).fill(0);
    for (const c of cs) for (let d = 0; d < q; d++) m[d] += c[d] / cs.length;
    return normalizar(m);
  });
  const samples = [];
  porClase.forEach((cs, y) => cs.forEach((z) => samples.push({ z, y })));
  if (samples.length < 2 || k < 2) return W;
  const cosM = Math.cos(MARGEN);
  const sinM = Math.sin(MARGEN);
  let step = 0;
  for (let epoch = 0; epoch < EPOCAS; epoch++) {
    for (let i = samples.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [samples[i], samples[j]] = [samples[j], samples[i]];
    }
    for (const { z, y } of samples) {
      const lr = LR / (1 + 0.02 * step);
      step++;
      const cosj = W.map((w) => dot(z, w));
      const cosY = Math.min(1, Math.max(-1, cosj[y]));
      const sinY = Math.sqrt(Math.max(0, 1 - cosY * cosY));
      const cosYAdj = cosY * cosM - sinY * sinM;
      const logits = cosj.map((c, j) => ESCALA * (j === y ? cosYAdj : c));
      const maxLogit = Math.max(...logits);
      const exps = logits.map((l) => Math.exp(l - maxLogit));
      const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
      const probs = exps.map((e) => e / sumExp);
      for (let j = 0; j < k; j++) {
        const dLdLogit = probs[j] - (j === y ? 1 : 0);
        const dLdCos = j === y
          ? dLdLogit * ESCALA * (cosM + (sinM * cosY) / Math.max(sinY, 1e-6))
          : dLdLogit * ESCALA;
        for (let d = 0; d < q; d++) W[j][d] -= lr * dLdCos * z[d];
      }
      for (let j = 0; j < k; j++) {
        let n = 0;
        for (let d = 0; d < q; d++) n += W[j][d] * W[j][d];
        n = Math.sqrt(n) || 1;
        for (let d = 0; d < q; d++) W[j][d] /= n;
      }
    }
  }
  return W;
}

function acierto(vectores, proto) {
  if (!vectores.length) return null;
  let ok = 0;
  for (const { z, y } of vectores) {
    let best = 0;
    let score = -Infinity;
    proto.forEach((w, j) => {
      const c = dot(z, w);
      if (c > score) { score = c; best = j; }
    });
    if (best === y) ok++;
  }
  return ok / vectores.length;
}

async function ponerTau(client, tabla, clave, id, distancias) {
  const w = fitWeibull(distancias);
  const radio = ALPHA * quantile(w, COBERTURA);
  const tau = 1 - radio;
  if (tabla === 'centroide') {
    await client.query(`UPDATE dataset.centroide
      SET weibull_beta = $3, weibull_eta = $4, radio = $5, tau = $6
      WHERE experimento_id = $1 AND especie_id = $2`, [id, clave, w.beta, w.eta, radio, tau]);
  } else {
    await client.query(`UPDATE dataset.supercentroide
      SET weibull_beta = $4, weibull_eta = $5, tau = $6
      WHERE experimento_id = $1 AND nivel = $2 AND nombre = $3`, [id, tabla, clave, w.beta, w.eta, tau]);
  }
}

async function radios(client, encoder, expId) {
  const { rows: distEsp } = await client.query(`
    SELECT f.especie_id, (e.vector <=> c.vector)::float8 AS d
    FROM (${FOTOS('train')}) e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.centroide c ON c.experimento_id = $2 AND c.especie_id = f.especie_id`, [encoder, expId]);
  const porEsp = new Map();
  for (const r of distEsp) {
    if (!porEsp.has(r.especie_id)) porEsp.set(r.especie_id, []);
    porEsp.get(r.especie_id).push(r.d);
  }
  for (const [especie, ds] of porEsp) await ponerTau(client, 'centroide', especie, expId, ds);

  for (const nivel of ['genero', 'familia']) {
    const { rows } = await client.query(`
      SELECT s.nombre, (e.vector <=> s.vector)::float8 AS d
      FROM (${FOTOS('train')}) e
      JOIN dataset.supercentroide s ON s.experimento_id = $2 AND s.nivel = $3
        AND s.nombre = ${nivel === 'genero' ? 'e.genero' : 'e.familia'}`, [encoder, expId, nivel]);
    const por = new Map();
    for (const r of rows) {
      if (!por.has(r.nombre)) por.set(r.nombre, []);
      por.get(r.nombre).push(r.d);
    }
    for (const [nombre, ds] of por) await ponerTau(client, nivel, nombre, expId, ds);
  }
}

async function cascada(client, encoder, expId) {
  const { rows } = await client.query(`
    SELECT v.especie_id AS verdad, v.genero, v.familia,
           sp.especie_id AS pred_sp, ge.nombre AS pred_ge, fa.nombre AS pred_fa
    FROM (${FOTOS('val')}) v
    LEFT JOIN LATERAL (
      SELECT c.especie_id
      FROM dataset.centroide c
      WHERE c.experimento_id = $2 AND (1 - (v.vector <=> c.vector)) >= c.tau
      ORDER BY v.vector <=> c.vector LIMIT 1
    ) sp ON TRUE
    LEFT JOIN LATERAL (
      SELECT s.nombre
      FROM dataset.supercentroide s
      WHERE s.experimento_id = $2 AND s.nivel = 'genero' AND s.tau IS NOT NULL
        AND (1 - (v.vector <=> s.vector)) >= s.tau
      ORDER BY v.vector <=> s.vector LIMIT 1
    ) ge ON TRUE
    LEFT JOIN LATERAL (
      SELECT s.nombre
      FROM dataset.supercentroide s
      WHERE s.experimento_id = $2 AND s.nivel = 'familia' AND s.tau IS NOT NULL
        AND (1 - (v.vector <=> s.vector)) >= s.tau
      ORDER BY v.vector <=> s.vector LIMIT 1
    ) fa ON TRUE
    WHERE EXISTS (SELECT 1 FROM dataset.centroide c WHERE c.experimento_id = $2 AND c.especie_id = v.especie_id)`,
    [encoder, expId]);

  const cuenta = { MATCH_SPECIES: 0, MATCH_GENUS: 0, MATCH_FAMILY: 0, OSR_GLOBAL: 0 };
  let correcta = 0;
  let equivocada = 0;
  let generoCorrecto = 0;
  let familiaCorrecta = 0;
  for (const r of rows) {
    if (r.pred_sp) {
      cuenta.MATCH_SPECIES++;
      if (r.pred_sp === r.verdad) correcta++;
      else equivocada++;
    } else if (r.pred_ge) {
      cuenta.MATCH_GENUS++;
      if (r.pred_ge === r.genero) generoCorrecto++;
    } else if (r.pred_fa) {
      cuenta.MATCH_FAMILY++;
      if (r.pred_fa === r.familia) familiaCorrecta++;
    } else cuenta.OSR_GLOBAL++;
  }
  const n = rows.length;
  const aceptadas = correcta + equivocada;
  return {
    particion: 'val',
    n,
    cobertura: COBERTURA,
    alpha: ALPHA,
    cascada: cuenta,
    especie_correcta: correcta,
    especie_equivocada: equivocada,
    genero_correcto: generoCorrecto,
    familia_correcta: familiaCorrecta,
    kar: n ? aceptadas / n : null,
    acierto_entre_aceptadas: aceptadas ? correcta / aceptadas : null,
    far: null,
    far_motivo: 'No hay vectores de especies fuera del paquete. No se arma un banco simulado para inventar el FAR.',
    altitud: null,
    altitud_motivo: 'Las observaciones no traen altitud. La gaussiana espera el DEM, no un rango escrito a mano.',
    regional: null,
    regional_motivo: 'Los centroides regionales ya se calculan por subregión (point-in-polygon); esta evaluación todavía mide solo el global.',
  };
}

async function vectoresDe(client, encoder, especieId, particion) {
  const { rows } = await client.query(`
    SELECT e.vector::text AS v FROM (${FOTOS(particion)}) e WHERE e.especie_id = $2`,
    [encoder, especieId]);
  return rows.map((r) => parseVector(r.v));
}

async function sugerir(client, encoder, expId) {
  const { rows: pares } = await client.query(`
    SELECT c.especie_id AS a, c.vecino_especie_id AS b, c.coseno_vecino AS coseno,
           ea.nombre_cientifico AS nombre_a, eb.nombre_cientifico AS nombre_b
    FROM dataset.centroide c
    JOIN dataset.especie ea ON ea.id = c.especie_id
    JOIN dataset.especie eb ON eb.id = c.vecino_especie_id
    WHERE c.experimento_id = $1 AND c.coseno_vecino >= $2 AND c.especie_id < c.vecino_especie_id
    ORDER BY c.coseno_vecino DESC
    LIMIT $3`, [expId, UMBRAL_COSENO, MAX_PARES]);

  const { rows: conf } = await client.query(`
    SELECT v.especie_id AS verdad, p.especie_id AS pred, COUNT(*)::int AS n
    FROM (${FOTOS('val')}) v
    JOIN LATERAL (
      SELECT c.especie_id FROM dataset.centroide c
      WHERE c.experimento_id = $2
      ORDER BY v.vector <=> c.vector LIMIT 1
    ) p ON TRUE
    WHERE EXISTS (SELECT 1 FROM dataset.centroide c WHERE c.experimento_id = $2 AND c.especie_id = v.especie_id)
    GROUP BY v.especie_id, p.especie_id`, [encoder, expId]);

  const cruzado = new Map();
  for (const r of conf) {
    if (r.verdad === r.pred) continue;
    const lo = Math.min(r.verdad, r.pred);
    const hi = Math.max(r.verdad, r.pred);
    const key = `${lo}:${hi}`;
    cruzado.set(key, (cruzado.get(key) || 0) + r.n);
  }
  const totalVal = new Map();
  for (const r of conf) totalVal.set(r.verdad, (totalVal.get(r.verdad) || 0) + r.n);

  const elegidos = new Map(pares.map((p) => [`${p.a}:${p.b}`, p]));
  for (const [key, n] of cruzado) {
    if (elegidos.size >= MAX_PARES) break;
    const [a, b] = key.split(':').map(Number);
    const denom = (totalVal.get(a) || 0) + (totalVal.get(b) || 0);
    if (denom && n / denom >= UMBRAL_CONFUSION && !elegidos.has(`${a}:${b}`)) {
      elegidos.set(`${a}:${b}`, { a, b, coseno: null, confusiones: n });
    }
  }

  for (const p of elegidos.values()) {
    const lo = Math.min(p.a, p.b);
    const hi = Math.max(p.a, p.b);
    const nVal = (totalVal.get(lo) || 0) + (totalVal.get(hi) || 0);
    const confusiones = cruzado.get(`${lo}:${hi}`) || 0;
    const trainA = await vectoresDe(client, encoder, lo, 'train');
    const trainB = await vectoresDe(client, encoder, hi, 'train');
    const valA = await vectoresDe(client, encoder, lo, 'val');
    const valB = await vectoresDe(client, encoder, hi, 'val');
    let accAntes = null;
    let accDespues = null;
    if (trainA.length && trainB.length && valA.length + valB.length) {
      const media = (vs) => normalizar(vs[0].map((_, d) => vs.reduce((s, v) => s + v[d], 0) / vs.length));
      const antes = [media(trainA), media(trainB)];
      const despues = trainArcFace([trainA.map(normalizar), trainB.map(normalizar)]);
      const val = [
        ...valA.map((z) => ({ z: normalizar(z), y: 0 })),
        ...valB.map((z) => ({ z: normalizar(z), y: 1 })),
      ];
      accAntes = acierto(val, antes);
      accDespues = acierto(val, despues);
    }
    const { rows: [cos] } = await client.query(`
      SELECT (1 - (ca.vector <=> cb.vector))::float8 AS cos
      FROM dataset.centroide ca, dataset.centroide cb
      WHERE ca.experimento_id = $1 AND cb.experimento_id = $1 AND ca.especie_id = $2 AND cb.especie_id = $3`,
      [expId, lo, hi]);
    await client.query(`
      INSERT INTO dataset.cluster_sugerido
        (experimento_id, especie_a, especie_b, coseno, n_val, confusiones, acc_antes, acc_despues)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [expId, lo, hi, cos?.cos ?? p.coseno ?? 0, nVal, confusiones, accAntes, accDespues]);
  }
}

async function completar(client, encoder, expId) {
  await radios(client, encoder, expId);
  const evaluacion = await cascada(client, encoder, expId);
  await sugerir(client, encoder, expId);
  await client.query('UPDATE dataset.experimento SET evaluacion = $2 WHERE id = $1', [expId, evaluacion]);
  return evaluacion;
}

module.exports = { completar };
