/**
 * DB vectorial (Admin → DB vectorial): lo que hay en dataset.embedding, sin inventar nada.
 *
 * - Resumen por encoder y por especie: vectores, individuos, partición y exclusiones.
 * - Proyección 2D: PCA por iteración de potencia sobre una muestra acotada y determinista
 *   (hasta N vectores por especie, en orden de sha256). Mismo resultado cada vez que se pide
 *   con los mismos vectores. Los centroides del último lote de ese encoder se proyectan en los
 *   mismos ejes.
 * - Metadatos de cada vector y latencia medida de una búsqueda k-NN real en pgvector.
 */
const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const POR_ESPECIE_DEFECTO = 60;
const POR_ESPECIE_MAX = 200;
const MUESTRA_MAX = 4000;
const ITERACIONES_MAX = 500;
const TOLERANCIA = 1e-10;
const CONSULTAS_LATENCIA = 15;
const K_LATENCIA = 5;

const SIN_EXCLUSION = `NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = e.sha256 AND x.revertida IS NULL)`;

/** El encoder pedido, o el que más vectores tiene (el del teléfono en la práctica). */
async function encoderDe(pool, sha) {
  const { rows } = await pool.query(`
    SELECT e.sha256, e.nombre, e.archivo, e.dimension, e.preprocesado, e.normalizacion, e.registrado,
           (SELECT COUNT(*)::int FROM dataset.embedding m WHERE m.encoder_sha256 = e.sha256) AS vectores
    FROM dataset.encoder e ORDER BY e.registrado`);
  if (!rows.length) return { encoders: [], encoder: null };
  if (sha) {
    const e = rows.find((r) => r.sha256 === sha);
    if (!e) throw falla('Ese encoder no está registrado', 404);
    return { encoders: rows, encoder: e };
  }
  const encoder = rows.reduce((a, b) => (b.vectores > a.vectores ? b : a));
  return { encoders: rows, encoder };
}

async function resumen(pool, sha) {
  const { encoders, encoder } = await encoderDe(pool, sha);
  const { rows: [{ fotos }] } = await pool.query('SELECT COUNT(*)::int AS fotos FROM dataset.foto');
  if (!encoder) return { encoders, encoder: null, fotos, especies: [], indice: null, experimento: null };

  const { rows: especies } = await pool.query(`
    WITH v AS (SELECT MAX(id) AS id FROM dataset.version)
    SELECT es.id, es.nombre_cientifico, es.genero, es.familia,
           COUNT(f.sha256)::int AS fotos,
           COUNT(e.sha256)::int AS vectores,
           COUNT(DISTINCT f.observacion_id) FILTER (WHERE e.sha256 IS NOT NULL)::int AS individuos,
           COUNT(e.sha256) FILTER (WHERE vf.particion = 'train')::int AS train,
           COUNT(e.sha256) FILTER (WHERE vf.particion = 'val')::int AS val,
           COUNT(e.sha256) FILTER (WHERE vf.particion = 'test')::int AS test,
           COUNT(e.sha256) FILTER (WHERE EXISTS (
             SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = f.sha256 AND x.revertida IS NULL))::int AS excluidas
    FROM dataset.especie es
    JOIN dataset.foto f ON f.especie_id = es.id
    LEFT JOIN dataset.embedding e ON e.sha256 = f.sha256 AND e.encoder_sha256 = $1
    LEFT JOIN dataset.version_foto vf ON vf.sha256 = f.sha256 AND vf.version_id = (SELECT id FROM v)
    GROUP BY es.id ORDER BY es.nombre_cientifico`, [encoder.sha256]);

  const { rows: indices } = await pool.query(`
    SELECT indexname AS nombre, indexdef AS definicion,
           (regexp_match(indexdef, 'USING (\\w+)'))[1] AS tipo,
           pg_relation_size(format('%I.%I', schemaname, indexname)::regclass)::bigint AS bytes
    FROM pg_indexes WHERE schemaname = 'dataset' AND tablename = 'embedding' ORDER BY indexname`);
  const { rows: [tam] } = await pool.query(`
    SELECT pg_total_relation_size('dataset.embedding')::bigint AS total,
           pg_relation_size('dataset.embedding')::bigint AS tabla`);
  const aproximado = indices.find((i) => ['hnsw', 'ivfflat'].includes(i.tipo));

  const { rows: [experimento] } = await pool.query(`
    SELECT id, creado, especies FROM dataset.experimento
    WHERE tipo = 'centroides' AND encoder_sha256 = $1 ORDER BY id DESC LIMIT 1`, [encoder.sha256]);

  return {
    encoders,
    encoder,
    fotos,
    especies,
    indice: {
      tabla: 'dataset.embedding',
      tipo_columna: `vector(${encoder.dimension})`,
      metrica: 'coseno (operador <=>)',
      busqueda: aproximado ? `aproximada (${aproximado.tipo})` : 'exacta: recorre todos los vectores del encoder',
      indices: indices.map((i) => ({ nombre: i.nombre, tipo: i.tipo, bytes: Number(i.bytes) })),
      bytes_total: Number(tam.total),
      bytes_tabla: Number(tam.tabla),
    },
    experimento: experimento || null,
  };
}

/** Latencia real de k-NN (top 5 por coseno) con vectores del propio encoder como consulta. */
async function latencia(pool, sha) {
  const { encoder } = await encoderDe(pool, sha);
  if (!encoder || !encoder.vectores) throw falla('Aún no hay vectores para medir la búsqueda', 409);
  const { rows: consultas } = await pool.query(`
    SELECT vector::text AS v FROM dataset.embedding WHERE encoder_sha256 = $1 ORDER BY sha256 LIMIT $2`,
    [encoder.sha256, CONSULTAS_LATENCIA]);
  const tiempos = [];
  for (const c of consultas) {
    const t0 = process.hrtime.bigint();
    await pool.query(`
      SELECT sha256 FROM dataset.embedding WHERE encoder_sha256 = $1
      ORDER BY vector <=> $2::vector LIMIT ${K_LATENCIA}`, [encoder.sha256, c.v]);
    tiempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  tiempos.sort((a, b) => a - b);
  const p = (q) => tiempos[Math.min(tiempos.length - 1, Math.ceil(q * tiempos.length) - 1)];
  return { consultas: tiempos.length, k: K_LATENCIA, vectores: encoder.vectores, p50_ms: p(0.5), p95_ms: p(0.95), medido: new Date().toISOString() };
}

// ── PCA por iteración de potencia ─────────────────────────────────────────────────────────

/** Arranque fijo y no degenerado: el mismo en cada llamada. */
function arranque(d) {
  const v = new Float64Array(d);
  for (let i = 0; i < d; i++) v[i] = ((i * 7919) % 101) / 50 - 1;
  return unitario(v);
}

function unitario(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** C·v sin formar C: Xᵀ(X·v)/n, con X ya centrada (n × d, por filas). */
function covPor(X, n, d, v) {
  const xv = new Float64Array(n);
  for (let r = 0; r < n; r++) {
    let s = 0;
    const o = r * d;
    for (let j = 0; j < d; j++) s += X[o + j] * v[j];
    xv[r] = s;
  }
  const out = new Float64Array(d);
  for (let r = 0; r < n; r++) {
    const o = r * d;
    const s = xv[r];
    for (let j = 0; j < d; j++) out[j] += X[o + j] * s;
  }
  for (let j = 0; j < d; j++) out[j] /= n;
  return out;
}

function quitarProyeccion(v, u) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * u[i];
  for (let i = 0; i < v.length; i++) v[i] -= s * u[i];
  return v;
}

function componente(X, n, d, previas) {
  let v = arranque(d);
  for (const u of previas) quitarProyeccion(v, u);
  unitario(v);
  let iteraciones = 0;
  for (; iteraciones < ITERACIONES_MAX; iteraciones++) {
    const w = covPor(X, n, d, v);
    for (const u of previas) quitarProyeccion(w, u);
    unitario(w);
    let cos = 0;
    for (let i = 0; i < d; i++) cos += w[i] * v[i];
    v = w;
    if (1 - Math.abs(cos) < TOLERANCIA) break;
  }
  // Signo fijo: la coordenada de mayor magnitud queda positiva (si no, el eje podría voltearse).
  let k = 0;
  for (let i = 1; i < d; i++) if (Math.abs(v[i]) > Math.abs(v[k])) k = i;
  if (v[k] < 0) for (let i = 0; i < d; i++) v[i] = -v[i];
  const cv = covPor(X, n, d, v);
  let lambda = 0;
  for (let i = 0; i < d; i++) lambda += v[i] * cv[i];
  return { v, lambda, iteraciones: iteraciones + 1 };
}

/** Dos componentes principales de filas (arrays de números). Devuelve ejes, media y varianza explicada. */
function pca2(filas) {
  const n = filas.length;
  const d = filas[0].length;
  const media = new Float64Array(d);
  for (const f of filas) for (let j = 0; j < d; j++) media[j] += f[j] / n;
  const X = new Float64Array(n * d);
  let total = 0;
  filas.forEach((f, r) => {
    for (let j = 0; j < d; j++) {
      const x = f[j] - media[j];
      X[r * d + j] = x;
      total += x * x;
    }
  });
  total /= n;
  const c1 = componente(X, n, d, []);
  const c2 = componente(X, n, d, [c1.v]);
  return {
    media,
    ejes: [c1.v, c2.v],
    varianza: [total ? c1.lambda / total : 0, total ? c2.lambda / total : 0],
    iteraciones: [c1.iteraciones, c2.iteraciones],
  };
}

function proyectar(fila, { media, ejes }) {
  return ejes.map((u) => {
    let s = 0;
    for (let j = 0; j < u.length; j++) s += (fila[j] - media[j]) * u[j];
    return s;
  });
}

async function proyeccion(pool, sha, porEspecieQ) {
  const { encoder } = await encoderDe(pool, sha);
  const porEspecie = Math.min(Math.max(Number(porEspecieQ) || POR_ESPECIE_DEFECTO, 5), POR_ESPECIE_MAX);
  if (!encoder || !encoder.vectores) {
    return { encoder, por_especie: porEspecie, muestra: 0, puntos: [], centroides: [], especies: [], varianza: null };
  }
  const { rows } = await pool.query(`
    SELECT sha256, especie_id, observacion_id, vector::real[] AS v FROM (
      SELECT e.sha256, f.especie_id, f.observacion_id, e.vector,
             row_number() OVER (PARTITION BY f.especie_id ORDER BY e.sha256) AS r
      FROM dataset.embedding e JOIN dataset.foto f ON f.sha256 = e.sha256
      WHERE e.encoder_sha256 = $1 AND ${SIN_EXCLUSION}
    ) s WHERE r <= $2 ORDER BY especie_id, sha256 LIMIT $3`, [encoder.sha256, porEspecie, MUESTRA_MAX]);
  if (rows.length < 3) {
    return { encoder, por_especie: porEspecie, muestra: rows.length, puntos: [], centroides: [], especies: [], varianza: null };
  }
  const modelo = pca2(rows.map((r) => r.v));

  const { rows: [exp] } = await pool.query(`
    SELECT id FROM dataset.experimento WHERE tipo = 'centroides' AND encoder_sha256 = $1 ORDER BY id DESC LIMIT 1`,
    [encoder.sha256]);
  const { rows: cents } = exp
    ? await pool.query('SELECT especie_id, vector::real[] AS v FROM dataset.centroide WHERE experimento_id = $1', [exp.id])
    : { rows: [] };

  const ids = [...new Set(rows.map((r) => r.especie_id))];
  const { rows: especies } = await pool.query(`
    SELECT es.id, es.nombre_cientifico, es.genero, es.familia,
           (SELECT COUNT(*)::int FROM dataset.embedding e JOIN dataset.foto f ON f.sha256 = e.sha256
             WHERE f.especie_id = es.id AND e.encoder_sha256 = $2 AND ${SIN_EXCLUSION}) AS vectores
    FROM dataset.especie es WHERE es.id = ANY($1) ORDER BY es.familia, es.nombre_cientifico`, [ids, encoder.sha256]);

  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  return {
    encoder: { sha256: encoder.sha256, nombre: encoder.nombre },
    por_especie: porEspecie,
    muestra: rows.length,
    varianza: modelo.varianza,
    iteraciones: modelo.iteraciones,
    experimento_id: exp?.id ?? null,
    especies,
    puntos: rows.map((r) => {
      const [x, y] = proyectar(r.v, modelo);
      return { sha256: r.sha256.slice(0, 12), especie_id: r.especie_id, observacion_id: r.observacion_id, x: r4(x), y: r4(y) };
    }),
    centroides: cents.filter((c) => ids.includes(c.especie_id)).map((c) => {
      const [x, y] = proyectar(c.v, modelo);
      return { especie_id: c.especie_id, x: r4(x), y: r4(y) };
    }),
  };
}

/** Metadatos de cada vector, paginados; opcionalmente de una especie. */
async function metadatos(pool, sha, { especie_id: especieQ, offset: offQ, limit: limQ } = {}) {
  const { encoder } = await encoderDe(pool, sha);
  if (!encoder) return { total: 0, filas: [] };
  const especie = especieQ ? Number(especieQ) : null;
  const offset = Math.max(Number(offQ) || 0, 0);
  const limit = Math.min(Math.max(Number(limQ) || 25, 1), 100);
  const { rows: [{ total }] } = await pool.query(`
    SELECT COUNT(*)::int AS total FROM dataset.embedding e JOIN dataset.foto f ON f.sha256 = e.sha256
    WHERE e.encoder_sha256 = $1 AND ($2::int IS NULL OR f.especie_id = $2)`, [encoder.sha256, especie]);
  const { rows: filas } = await pool.query(`
    SELECT e.sha256, es.nombre_cientifico AS especie, f.observacion_id, o.fuente, f.licencia,
           vf.particion, e.trabajo_id, e.creado,
           NOT ${SIN_EXCLUSION} AS excluida,
           (e.vector::real[])[1:6] AS inicio,
           vector_norm(e.vector)::float8 AS norma
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.especie es ON es.id = f.especie_id
    LEFT JOIN dataset.observacion o ON o.id = f.observacion_id
    LEFT JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = (SELECT MAX(id) FROM dataset.version)
    WHERE e.encoder_sha256 = $1 AND ($2::int IS NULL OR f.especie_id = $2)
    ORDER BY es.nombre_cientifico, e.sha256 OFFSET $3 LIMIT $4`, [encoder.sha256, especie, offset, limit]);
  return { total, filas };
}

module.exports = { resumen, latencia, proyeccion, metadatos, pca2 };
