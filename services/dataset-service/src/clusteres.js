/**
 * Clústeres de especies que se confunden (Admin → Clústeres). Todo sale de los vectores reales:
 *
 * - Matriz de confusión: cada foto de VALIDACIÓN (no entró al centroide) se asigna al centroide
 *   más cercano por coseno, entre las especies del lote (o de una subregión). Fila = especie
 *   real, columna = especie asignada.
 * - Pares señalados: los que se confunden en ≥ UMBRAL_CONFUSION de sus fotos, o cuyos
 *   centroides tienen coseno ≥ UMBRAL_COSENO (los mismos umbrales de m3.sugerir).
 * - La persona decide: acepta o descarta un clúster (dos o más especies). Al decidir se mide
 *   ArcFace con los vectores reales (train para entrenar, val para medir, semilla fija) y la
 *   decisión queda en dataset.cluster y en audit.log. El sistema nunca crea un clúster solo.
 */
const { registrar } = require('./audit');
const { trainArcFace, acierto, normalizar, UMBRAL_COSENO, UMBRAL_CONFUSION } = require('./m3');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const MAX_MIEMBROS = 12;
const MAX_PARES = 50;
const TRAIN_POR_ESPECIE = 200;
const SEMILLA = 20260928;

/** Generador con semilla (mulberry32): medir dos veces el mismo clúster da lo mismo. */
function azarCon(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clave = (ids) => [...ids].sort((a, b) => a - b).join(',');

async function ultimoLote(pool) {
  const { rows: [exp] } = await pool.query(`
    SELECT id, encoder_sha256, version_id, creado, especies FROM dataset.experimento
    WHERE tipo = 'centroides' ORDER BY id DESC LIMIT 1`);
  return exp || null;
}

/** Vectores de una partición del manifiesto del lote, sin exclusión, de ciertas especies. */
async function vectores(pool, exp, particion, especies, tope = null) {
  const { rows } = await pool.query(`
    SELECT especie_id, v FROM (
      SELECT f.especie_id, e.vector::real[] AS v,
             row_number() OVER (PARTITION BY f.especie_id ORDER BY e.sha256) AS r
      FROM dataset.embedding e
      JOIN dataset.foto f ON f.sha256 = e.sha256
      JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = $2
      WHERE e.encoder_sha256 = $1 AND vf.particion = $3 AND f.especie_id = ANY($4)
        AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = e.sha256 AND x.revertida IS NULL)
    ) s WHERE $5::int IS NULL OR r <= $5`, [exp.encoder_sha256, exp.version_id, particion, especies, tope]);
  return rows;
}

async function decisiones(pool) {
  const { rows } = await pool.query(`
    SELECT c.id, c.miembros, c.nombre, c.origen, c.estado, c.motivo, c.experimento_id, c.medicion,
           c.decidido_por, c.decidido_en,
           ARRAY(SELECT es.nombre_cientifico FROM unnest(c.miembros) m JOIN dataset.especie es ON es.id = m
                 ORDER BY es.nombre_cientifico) AS nombres
    FROM dataset.cluster c ORDER BY c.decidido_en DESC`);
  return rows;
}

/** Decisión que cubre un par: la del par exacto, o un clúster aceptado que contiene a ambos. */
function decisionDe(lista, a, b) {
  const exacta = lista.find((c) => c.miembros.length === 2 && clave(c.miembros) === clave([a, b]));
  if (exacta) return { id: exacta.id, estado: exacta.estado, nombre: exacta.nombre };
  const contiene = lista.find((c) => c.estado === 'aceptado' && c.miembros.includes(a) && c.miembros.includes(b));
  return contiene ? { id: contiene.id, estado: 'aceptado', nombre: contiene.nombre } : null;
}

async function panorama(pool, { subregion_id: subQ } = {}) {
  const exp = await ultimoLote(pool);
  const clusteres = await decisiones(pool);
  const base = { umbrales: { confusion: UMBRAL_CONFUSION, coseno: UMBRAL_COSENO }, clusteres };
  if (!exp) return { ...base, experimento: null, subregiones: [], especies: [], celdas: [], pares: [], sugerencias: [], acierto: null };

  const { rows: subregiones } = await pool.query(`
    SELECT DISTINCT s.id, s.nombre, s.numero, r.nombre AS region
    FROM dataset.centroide_regional cr
    JOIN dataset.subregion s ON s.id = cr.subregion_id
    JOIN dataset.region r ON r.codigo_dane = s.region
    WHERE cr.experimento_id = $1 ORDER BY r.nombre, s.numero`, [exp.id]);
  const subregionId = subQ ? Number(subQ) : null;
  if (subregionId && !subregiones.some((s) => s.id === subregionId)) throw falla('Esa subregión no tiene especies en el último lote', 404);

  const { rows: especies } = await pool.query(`
    SELECT es.id, es.nombre_cientifico, es.genero, es.familia
    FROM dataset.centroide c JOIN dataset.especie es ON es.id = c.especie_id
    WHERE c.experimento_id = $1
      AND ($2::int IS NULL OR EXISTS (SELECT 1 FROM dataset.centroide_regional cr
             WHERE cr.experimento_id = $1 AND cr.subregion_id = $2 AND cr.especie_id = c.especie_id))
    ORDER BY es.nombre_cientifico`, [exp.id, subregionId]);
  const ids = especies.map((e) => e.id);

  // Cada foto de validación contra el centroide más cercano, solo entre las especies elegidas.
  const { rows: celdas } = exp.version_id && ids.length ? await pool.query(`
    SELECT f.especie_id AS real, p.especie_id AS asignada, COUNT(*)::int AS n
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = $3 AND vf.particion = 'val'
    JOIN LATERAL (
      SELECT c.especie_id FROM dataset.centroide c
      WHERE c.experimento_id = $2 AND c.especie_id = ANY($4)
      ORDER BY e.vector <=> c.vector LIMIT 1
    ) p ON TRUE
    WHERE e.encoder_sha256 = $1 AND f.especie_id = ANY($4)
      AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = e.sha256 AND x.revertida IS NULL)
    GROUP BY f.especie_id, p.especie_id`, [exp.encoder_sha256, exp.id, exp.version_id, ids]) : { rows: [] };

  const nVal = new Map();
  const aciertos = new Map();
  for (const c of celdas) {
    nVal.set(c.real, (nVal.get(c.real) || 0) + c.n);
    if (c.real === c.asignada) aciertos.set(c.real, c.n);
  }
  const totalVal = [...nVal.values()].reduce((a, b) => a + b, 0);
  const totalAciertos = [...aciertos.values()].reduce((a, b) => a + b, 0);

  const { rows: cosenos } = ids.length > 1 ? await pool.query(`
    SELECT a.especie_id AS a, b.especie_id AS b, (1 - (a.vector <=> b.vector))::float8 AS coseno
    FROM dataset.centroide a JOIN dataset.centroide b
      ON b.experimento_id = a.experimento_id AND a.especie_id < b.especie_id
    WHERE a.experimento_id = $1 AND a.especie_id = ANY($2) AND b.especie_id = ANY($2)`, [exp.id, ids]) : { rows: [] };

  const cruce = new Map(celdas.filter((c) => c.real !== c.asignada).map((c) => [`${c.real}>${c.asignada}`, c.n]));
  const pares = [];
  for (const { a, b, coseno } of cosenos) {
    const ab = cruce.get(`${a}>${b}`) || 0;
    const ba = cruce.get(`${b}>${a}`) || 0;
    const n = (nVal.get(a) || 0) + (nVal.get(b) || 0);
    const tasa = n ? (ab + ba) / n : null;
    const senal = (tasa != null && tasa >= UMBRAL_CONFUSION) || coseno >= UMBRAL_COSENO;
    if (!ab && !ba && !senal) continue;
    pares.push({ a, b, a_como_b: ab, b_como_a: ba, n_a: nVal.get(a) || 0, n_b: nVal.get(b) || 0, tasa, coseno, senal,
      decision: decisionDe(clusteres, a, b) });
  }
  pares.sort((x, y) => (y.tasa ?? -1) - (x.tasa ?? -1) || y.coseno - x.coseno);

  const { rows: sugeridos } = await pool.query(`
    SELECT s.especie_a AS a, s.especie_b AS b, ea.nombre_cientifico AS nombre_a, eb.nombre_cientifico AS nombre_b,
           s.coseno, s.n_val, s.confusiones, s.acc_antes, s.acc_despues
    FROM dataset.cluster_sugerido s
    JOIN dataset.especie ea ON ea.id = s.especie_a
    JOIN dataset.especie eb ON eb.id = s.especie_b
    WHERE s.experimento_id = $1 ORDER BY s.coseno DESC`, [exp.id]);

  return {
    ...base,
    experimento: exp,
    subregion_id: subregionId,
    subregiones,
    especies: especies.map((e) => ({ ...e, n_val: nVal.get(e.id) || 0, aciertos: aciertos.get(e.id) || 0 })),
    celdas,
    acierto: totalVal ? totalAciertos / totalVal : null,
    fotos_val: totalVal,
    pares: pares.slice(0, MAX_PARES),
    sugerencias: sugeridos.map((s) => ({ ...s, decision: decisionDe(clusteres, s.a, s.b) })),
  };
}

/**
 * ArcFace sobre los vectores reales de los miembros: prototipos entrenados con train (hasta
 * TRAIN_POR_ESPECIE por especie) y acierto medido en val, antes (centroide L2) y después.
 */
async function medir(pool, exp, miembros) {
  if (!exp?.version_id) return null;
  const train = await vectores(pool, exp, 'train', miembros, TRAIN_POR_ESPECIE);
  const val = await vectores(pool, exp, 'val', miembros);
  const porClase = miembros.map((id) => train.filter((r) => r.especie_id === id).map((r) => normalizar(r.v)));
  const sinTrain = miembros.filter((_, i) => !porClase[i].length);
  const evaluar = val.map((r) => ({ z: normalizar(r.v), y: miembros.indexOf(r.especie_id) }));
  const base = { n_train: train.length, n_val: val.length, sin_vectores: sinTrain, semilla: SEMILLA, particion: 'val' };
  if (sinTrain.length || !evaluar.length) return { ...base, acc_antes: null, acc_despues: null };
  const media = (vs) => normalizar(vs[0].map((_, d) => vs.reduce((s, v) => s + v[d], 0) / vs.length));
  const antes = porClase.map(media);
  const despues = trainArcFace(porClase, azarCon(SEMILLA));
  return { ...base, acc_antes: acierto(evaluar, antes), acc_despues: acierto(evaluar, despues) };
}

/** POST /api/dataset/clusteres { miembros[], nombre?, origen, estado, motivo? } */
async function decidir(pool, body, userId) {
  const miembros = [...new Set((Array.isArray(body?.miembros) ? body.miembros : []).map(Number))].sort((a, b) => a - b);
  if (miembros.length < 2 || miembros.some((id) => !Number.isInteger(id))) throw falla('Elige al menos dos especies');
  if (miembros.length > MAX_MIEMBROS) throw falla(`Un clúster tiene como máximo ${MAX_MIEMBROS} especies; divídelo en dos`);
  const estado = body?.estado;
  if (!['aceptado', 'descartado'].includes(estado)) throw falla('La decisión debe ser aceptar o descartar');
  const origen = ['sugerido', 'matriz', 'manual'].includes(body?.origen) ? body.origen : 'manual';
  const motivo = typeof body?.motivo === 'string' && body.motivo.trim() ? body.motivo.trim().slice(0, 500) : null;
  if (estado === 'descartado' && !motivo) throw falla('Escribe por qué descartas este clúster');

  const { rows: especies } = await pool.query(
    'SELECT id, genero, nombre_cientifico FROM dataset.especie WHERE id = ANY($1) ORDER BY id', [miembros]);
  if (especies.length !== miembros.length) throw falla('Alguna de esas especies no existe en el dataset', 404);
  const generos = [...new Set(especies.map((e) => e.genero))];
  const nombre = typeof body?.nombre === 'string' && body.nombre.trim()
    ? body.nombre.trim().slice(0, 80)
    : `${generos.join('-')} (${miembros.length} especies)`;

  const exp = await ultimoLote(pool);
  const medicion = estado === 'aceptado' ? await medir(pool, exp, miembros) : null;

  const { rows: [fila] } = await pool.query(`
    INSERT INTO dataset.cluster (miembros, nombre, origen, estado, motivo, experimento_id, medicion, decidido_por, decidido_en)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (miembros) DO UPDATE SET nombre = EXCLUDED.nombre, origen = EXCLUDED.origen, estado = EXCLUDED.estado,
      motivo = EXCLUDED.motivo, experimento_id = EXCLUDED.experimento_id, medicion = EXCLUDED.medicion,
      decidido_por = EXCLUDED.decidido_por, decidido_en = NOW()
    RETURNING id, miembros, nombre, origen, estado, motivo, experimento_id, medicion, decidido_por, decidido_en`,
    [miembros, nombre, origen, estado, motivo, exp?.id ?? null, medicion, userId]);
  await registrar(pool, userId, `dataset.cluster.${estado}`, 'cluster', fila.id, {
    miembros: especies.map((e) => e.nombre_cientifico), origen, motivo, experimento_id: exp?.id ?? null,
    acc_antes: medicion?.acc_antes ?? null, acc_despues: medicion?.acc_despues ?? null,
  });
  return fila;
}

/** DELETE /api/dataset/clusteres/:id — retira la decisión; el par vuelve a quedar pendiente. */
async function retirar(pool, id, userId) {
  const { rows: [c] } = await pool.query('DELETE FROM dataset.cluster WHERE id = $1 RETURNING id, miembros, estado, nombre', [id]);
  if (!c) throw falla('Ese clúster no existe', 404);
  await registrar(pool, userId, 'dataset.cluster.retirado', 'cluster', c.id, { miembros: c.miembros, estado_previo: c.estado, nombre: c.nombre });
  return { ok: true };
}

module.exports = { panorama, decidir, retirar, medir };
