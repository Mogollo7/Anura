/**
 * Simulador (Admin → Simulador, bloque 6): una foto contra un paquete, sin modificarlo.
 *
 * El servidor no puede embeber una foto nueva: el encoder del teléfono corre en model-service
 * (el PC con GPU) y solo PIDE trabajos por HTTP; no hay un endpoint que devuelva el vector de
 * una foto al momento. Por eso el simulador trabaja con fotos que ya tienen vector en
 * dataset.embedding (mismo encoder que el teléfono).
 *
 * Con ese vector hace lo mismo que AnuraIdentifier.kt:
 * - especie: voto de los k = 5 vecinos más cercanos (coseno) entre las fotos de referencia del
 *   paquete (train de sus especies), cada voto pesa 1 − distancia;
 * - aceptar o rechazar: distancia de Mahalanobis mínima a las medias del paquete, con la
 *   precisión y el τ de la calibración OSR (el umbral validado o la propuesta sin validar).
 * Además muestra las tres especies con centroide más parecido. No escribe nada.
 */
const M = require('./mahalanobis');
const osr = require('./osr');
const evaluacion = require('./evaluacion');
const ficha = require('./ficha');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const K = 5;

/** GET /api/dataset/simulador?subregion_id= — especies con fotos embebidas y umbrales disponibles. */
async function opciones(pool, subregionId) {
  const exp = await osr.exigirVigente(pool);
  await osr.exigirSubregion(pool, subregionId);
  const paquete = await osr.especiesDelPaquete(pool, exp.id, subregionId);
  const enPaquete = new Set(paquete.map((e) => e.id));
  const { rows: especies } = await pool.query(`
    SELECT es.id, es.nombre_cientifico, es.genero, es.familia, COUNT(*)::int AS fotos
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.especie es ON es.id = f.especie_id
    WHERE e.encoder_sha256 = $1 AND ${osr.NO_EXCLUIDA}
    GROUP BY es.id ORDER BY es.nombre_cientifico`, [exp.encoder_sha256]);
  const resumen = (u) => u && {
    id: u.id, tau: u.tau, calibracion_id: u.calibracion_id, experimento_id: u.experimento_id,
    validado: u.validado, validado_nombre: u.validado_nombre, kar: u.kar, far: u.far, auroc: u.auroc,
  };
  return {
    experimento: { id: exp.id, encoder_sha256: exp.encoder_sha256 },
    especies: especies.map((e) => ({ ...e, en_paquete: enPaquete.has(e.id) })),
    paquete: paquete.length,
    umbrales: {
      validado: resumen(await osr.umbralVigente(pool, subregionId)),
      propuesta: resumen(await osr.umbralPropuesto(pool, subregionId)),
    },
  };
}

/** GET /api/dataset/simulador/fotos?especie_id=&offset= — fotos con vector de una especie. */
async function fotos(pool, firmar, especieId, offset) {
  const exp = await osr.exigirVigente(pool);
  const { rows } = await pool.query(`
    SELECT f.sha256, f.object_key, vf.particion, o.observada_en, o.lugar
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    LEFT JOIN dataset.observacion o ON o.id = f.observacion_id
    LEFT JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = $3
    WHERE e.encoder_sha256 = $1 AND f.especie_id = $2 AND ${osr.NO_EXCLUIDA}
    -- Primero las que el paquete no vio: test, val, fuera del manifiesto; train al final.
    ORDER BY CASE vf.particion WHEN 'test' THEN 0 WHEN 'val' THEN 1 WHEN 'train' THEN 3 ELSE 2 END, f.sha256
    LIMIT 24 OFFSET $4`, [exp.encoder_sha256, especieId, exp.version_id, Math.max(0, offset || 0)]);
  return {
    fotos: await Promise.all(rows.map(async ({ object_key, ...r }) => ({ ...r, url: await firmar(object_key) }))),
  };
}

/** POST /api/dataset/simulador/identificar { subregion_id, sha256, umbral: 'validado' | 'propuesta' } */
async function identificar(pool, body) {
  const subregionId = osr.leerSubregion(body.subregion_id);
  const sha = String(body.sha256 || '');
  if (!/^[0-9a-f]{64}$/.test(sha)) throw falla('Elige una foto');
  const cual = body.umbral === 'propuesta' ? 'propuesta' : 'validado';
  const exp = await osr.exigirVigente(pool);
  await osr.exigirSubregion(pool, subregionId);
  const paquete = await osr.especiesDelPaquete(pool, exp.id, subregionId);
  if (!paquete.length) throw falla('Este paquete no tiene especies con centroide.', 409);
  const ids = paquete.map((e) => e.id);
  const nombres = new Map(paquete.map((e) => [e.id, e]));

  const { rows: [foto] } = await pool.query(`
    SELECT e.vector::text AS v, f.especie_id, es.nombre_cientifico, es.genero, es.familia, vf.particion, o.altitud_m
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.especie es ON es.id = f.especie_id
    LEFT JOIN dataset.observacion o ON o.id = f.observacion_id
    LEFT JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = $3
    WHERE e.sha256 = $1 AND e.encoder_sha256 = $2`, [sha, exp.encoder_sha256, exp.version_id]);
  if (!foto) throw falla('Esa foto no tiene vector del encoder vigente', 404);
  const x = osr.vector(foto.v);

  // k-NN entre las referencias del paquete (train de sus especies), como sqlite-vec en el teléfono.
  const { rows: vecinos } = await pool.query(`
    SELECT f.especie_id, (e.vector <=> $1::vector)::float8 AS distancia, e.sha256 = $5 AS ella_misma
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = $3 AND vf.particion = 'train'
    WHERE e.encoder_sha256 = $2 AND f.especie_id = ANY($4::int[]) AND ${osr.NO_EXCLUIDA}
    ORDER BY e.vector <=> $1::vector
    LIMIT ${K}`, [foto.v, exp.encoder_sha256, exp.version_id, ids, sha]);
  const votos = new Map();
  for (const v of vecinos) votos.set(v.especie_id, (votos.get(v.especie_id) || 0) + (1 - v.distancia));
  const total = [...votos.values()].reduce((a, b) => a + b, 0);
  const candidatas = [...votos]
    .map(([id, voto]) => ({ especie_id: id, nombre_cientifico: nombres.get(id).nombre_cientifico, parte: total > 0 ? voto / total : 0 }))
    .sort((a, b) => b.parte - a.parte);
  const ganadora = candidatas[0] || null;

  const centroides = await evaluacion.centroidesDelPaquete(pool, exp.id, ids, subregionId);
  const cercanos = evaluacion.ranking(x, centroides).slice(0, 3)
    .map((r) => ({ ...r, nombre_cientifico: nombres.get(r.especie_id).nombre_cientifico }));

  // Rechazo: la calibración que respalda el umbral elegido (sus medias y su precisión).
  const umbral = cual === 'propuesta' ? await osr.umbralPropuesto(pool, subregionId) : await osr.umbralVigente(pool, subregionId);
  let rechazo = null;
  if (umbral?.calibracion_id) {
    const { rows: [c] } = await pool.query(
      'SELECT id, experimento_id, especie_ids, medias, precision FROM dataset.osr_calibracion WHERE id = $1', [umbral.calibracion_id]);
    const dim = x.length;
    const P = M.deBytes(c.precision);
    const plano = M.deBytes(c.medias);
    const medias = c.especie_ids.map((_, i) => plano.subarray(i * dim, (i + 1) * dim));
    const m = M.minimaConPrecision(x, medias, P, dim);
    const cerca = c.especie_ids[m.indice];
    rechazo = {
      umbral_id: umbral.id,
      calibracion_id: c.id,
      tau: umbral.tau,
      validado: umbral.validado,
      validado_nombre: umbral.validado_nombre,
      distancia: m.distancia,
      acepta: m.distancia <= umbral.tau,
      especie_mas_cercana: { especie_id: cerca, nombre_cientifico: nombres.get(cerca)?.nombre_cientifico ?? null },
      otro_lote: c.experimento_id !== exp.id,
    };
  }

  // Capa 3, solo informativa: la altitud de la observación frente al rango de la ficha técnica de la
  // especie nombrada. El teléfono todavía no la aplica, así que aquí no cambia la decisión.
  let altitud = null;
  if (ganadora) {
    const f = await ficha.deEspecie(pool, ganadora.especie_id);
    const rango = f.altitud.efectivo;
    altitud = {
      observacion_m: foto.altitud_m,
      especie_id: ganadora.especie_id,
      rango: rango ? { min: rango.min, max: rango.max, origen: rango.origen } : null,
      dentro: rango && foto.altitud_m != null ? foto.altitud_m >= rango.min && foto.altitud_m <= rango.max : null,
    };
  }

  const delPaquete = nombres.has(foto.especie_id);
  const codigo = !rechazo ? null : rechazo.acepta ? 'MATCH_SPECIES' : 'OSR_GLOBAL';
  const acierto = !rechazo ? null : delPaquete
    ? rechazo.acepta && ganadora?.especie_id === foto.especie_id
    : !rechazo.acepta;

  let norma = 0;
  for (const v of x) norma += v * v;
  return {
    foto: {
      sha256: sha, especie_id: foto.especie_id, nombre_cientifico: foto.nombre_cientifico, genero: foto.genero,
      familia: foto.familia, particion: foto.particion, del_paquete: delPaquete,
    },
    umbral: cual,
    codigo,
    acierto,
    esperado: delPaquete ? 'su especie' : 'rechazo',
    knn: { k: K, vecinos: vecinos.map((v) => ({ ...v, nombre_cientifico: nombres.get(v.especie_id).nombre_cientifico })), candidatas },
    centroides: cercanos,
    rechazo,
    altitud,
    traza: { encoder_sha256: exp.encoder_sha256, dim: x.length, norma2: norma, experimento_id: exp.id },
  };
}

module.exports = { opciones, fotos, identificar };
