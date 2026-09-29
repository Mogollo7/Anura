/**
 * Validación técnica (Admin → Resultado → Validación): ¿se puede compilar el paquete de esta
 * subregión? Responde `{ lista, motivos: [{ codigo, texto, pantalla }] }` a partir de lo que hay
 * en la base, sin métricas inventadas. `pantalla` es la ruta del Admin donde se arregla.
 *
 * Qué especies entran al paquete de una subregión:
 * - Las que tienen individuos de entrenamiento ubicados DENTRO de la subregión en la última
 *   corrida de centroides (`dataset.centroide_regional`, point-in-polygon sobre los municipios
 *   DANE asignados en Regiones). Si hay menos de MIN_INDIVIDUOS_REGIONAL ahí, el paquete presta
 *   el centroide global (aviso, no bloqueo).
 * - Que sean entrenables con las MISMAS reglas que el Admin y la Ficha (src/reglas.js, espejo de
 *   `admin/src/lib/dataset/reglas.ts`): al menos MIN_FOTOS_ENTRENABLE fotos activas y
 *   MIN_INDIVIDUOS individuos.
 * - Que tengan taxon_id del catálogo (la app identifica por taxon_id; sin él no hay ficha).
 *
 * Bloquea (motivos): departamento sin activar, encoder del teléfono sin registrar, sin corrida
 * de centroides o corrida vieja (otra versión del dataset, o cambiaron los vectores de train
 * desde que se calculó), fotos de train de las especies del paquete sin vector del encoder
 * vigente, ninguna especie que entre, y el umbral OSR sin validar por una persona.
 *
 * Contexto de la Ficha técnica (ficha.js, decidido o propuesto por una persona): rango de
 * altitud, pesos wv/wg/wm y LRC viajan en el paquete. Sin pesos no se bloquea (el paquete no
 * ajusta por contexto esa especie, aviso); pesos que no suman 1 sí bloquean.
 *
 * Morfos y clústeres (bloque 5): viajan en el paquete los centroides por morfo
 * (`dataset.centroide_morfo`) de los morfos declarados en ESTA subregión que llegaron al mínimo de
 * individuos (los demás usan el centroide de la especie: aviso), y los clústeres ACEPTADOS por una
 * persona (`dataset.cluster`) con al menos dos miembros dentro del paquete.
 *
 * Umbral OSR (contrato con phase20, agente "osr"): `dataset.osr_umbral` con al menos
 * (id, subregion_id, tau, validado_por, validado, creado). Vale la fila más reciente de esa
 * subregión con `validado IS NOT NULL`. Si la tabla no existe todavía, el motivo es el mismo:
 * "Falta validar el umbral OSR".
 */
const crypto = require('crypto');
const { ENCODER, BASE, MIN_INDIVIDUOS_REGIONAL } = require('./centroides');
const { MIN_FOTOS_ENTRENABLE, MIN_INDIVIDUOS, esEntrenable } = require('./reglas');
const ficha = require('./ficha');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const SIN_EXCLUSION = (col) =>
  `NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = ${col} AND x.revertida IS NULL)`;

const nombres = (lista, max = 4) => {
  const n = lista.map((e) => e.nombre_cientifico);
  return n.length > max ? `${n.slice(0, max).join(', ')} y ${n.length - max} más` : n.join(', ');
};

/** Lo que no depende de la subregión: encoder, última corrida de centroides y si sigue vigente. */
async function contexto(db) {
  const { rows: [enc] } = await db.query(
    'SELECT sha256, archivo, dimension, preprocesado, normalizacion FROM dataset.encoder WHERE sha256 = $1', [ENCODER]);
  const { rows: [version] } = await db.query('SELECT id, nombre FROM dataset.version ORDER BY id DESC LIMIT 1');
  const { rows: [exp] } = await db.query(`
    SELECT id, version_id, fotos_train_con_vector, creado FROM dataset.experimento
    WHERE tipo = 'centroides' AND encoder_sha256 = $1 ORDER BY id DESC LIMIT 1`, [ENCODER]);
  let vigente = false;
  if (exp) {
    const { rows: [n] } = await db.query(`SELECT COUNT(*)::int AS n FROM (${BASE}) b`, [ENCODER]);
    vigente = exp.version_id === (version?.id ?? null) && n.n === exp.fotos_train_con_vector;
  }
  const { rows: [t] } = await db.query(`SELECT to_regclass('dataset.osr_umbral') IS NOT NULL AS osr,
    to_regclass('dataset.centroide_morfo') IS NOT NULL AS morfo, to_regclass('dataset.cluster') IS NOT NULL AS cluster`);
  return {
    encoder: enc || null, version: version || null, experimento: exp || null, vigente,
    tablaOsr: t.osr, tablaMorfo: t.morfo, tablaCluster: t.cluster, fichas: new Map(),
  };
}

async function subregionDe(db, id) {
  const { rows: [s] } = await db.query(`
    SELECT s.id, s.numero, s.clave, s.nombre, s.region, r.nombre AS region_nombre, r.estado AS region_estado
    FROM dataset.subregion s JOIN dataset.region r ON r.codigo_dane = s.region WHERE s.id = $1`, [id]);
  return s || null;
}

async function especiesDe(db, ctx, subregionId) {
  if (!ctx.experimento) return [];
  const { rows } = await db.query(`
    SELECT e.id AS especie_id, e.taxon_id, e.nombre_cientifico, e.genero, e.familia,
           cr.n_observaciones AS individuos_subregion, (cr.vector IS NOT NULL) AS centroide_propio,
           (c.especie_id IS NOT NULL) AS centroide_global,
           act.fotos_activas, act.individuos, tr.fotos_train, tr.sin_vector
    FROM dataset.centroide_regional cr
    JOIN dataset.especie e ON e.id = cr.especie_id
    LEFT JOIN dataset.centroide c ON c.experimento_id = cr.experimento_id AND c.especie_id = cr.especie_id
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS fotos_activas, COUNT(DISTINCT f.observacion_id)::int AS individuos
      FROM dataset.foto f
      WHERE f.especie_id = e.id AND ${SIN_EXCLUSION('f.sha256')}
    ) act
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS fotos_train,
             COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM dataset.embedding m
               WHERE m.sha256 = f.sha256 AND m.encoder_sha256 = $3))::int AS sin_vector
      FROM dataset.foto f
      JOIN dataset.version_foto vf ON vf.sha256 = f.sha256 AND vf.version_id = $4 AND vf.particion = 'train'
      WHERE f.especie_id = e.id AND ${SIN_EXCLUSION('f.sha256')}
    ) tr
    WHERE cr.experimento_id = $1 AND cr.subregion_id = $2
    ORDER BY e.nombre_cientifico`, [ctx.experimento.id, subregionId, ENCODER, ctx.version?.id ?? null]);
  const especies = [];
  for (const r of rows) {
    const entrenable = esEntrenable(r);
    const incluida = entrenable && !!r.taxon_id && r.centroide_global;
    especies.push({ ...r, entrenable, incluida, contexto: incluida ? await contextoDe(db, ctx, r.especie_id) : null });
  }
  return especies;
}

/** Altitud, pesos y LRC efectivos de la Ficha técnica (una lectura por especie y evaluación). */
async function contextoDe(db, ctx, especieId) {
  if (!ctx.fichas.has(especieId)) {
    const f = await ficha.deEspecie(db, especieId);
    ctx.fichas.set(especieId, { altitud: f.altitud.efectivo, pesos: f.pesos.efectivo, lrc: f.lrc });
  }
  return ctx.fichas.get(especieId);
}

/** Morfos declarados en la subregión para las especies del paquete, con su centroide del lote. */
async function morfosDe(db, ctx, subregionId, especieIds) {
  if (!ctx.tablaMorfo || !ctx.experimento || !especieIds.length) return [];
  const { rows } = await db.query(`
    SELECT mo.id AS morfo_id, mo.nombre, mo.especie_id, COALESCE(cm.n_observaciones, 0) AS individuos,
           (cm.vector IS NOT NULL) AS calculado
    FROM dataset.morfo mo
    LEFT JOIN dataset.centroide_morfo cm ON cm.morfo_id = mo.id AND cm.experimento_id = $1
    WHERE mo.subregion_id = $2 AND mo.especie_id = ANY($3::int[])
    ORDER BY mo.especie_id, mo.nombre`, [ctx.experimento.id, subregionId, especieIds]);
  return rows;
}

/** Clústeres aceptados con al menos dos miembros dentro del paquete (solo esos miembros). */
async function clusteresDe(db, ctx, especieIds) {
  if (!ctx.tablaCluster || especieIds.length < 2) return [];
  const { rows } = await db.query(`
    SELECT id, nombre, miembros, medicion, decidido_en FROM dataset.cluster
    WHERE estado = 'aceptado' AND miembros && $1::int[] ORDER BY id`, [especieIds]);
  const dentro = new Set(especieIds);
  return rows
    .map((c) => ({ ...c, miembros: c.miembros.filter((id) => dentro.has(id)) }))
    .filter((c) => c.miembros.length >= 2);
}

async function umbralOsr(db, ctx, subregionId) {
  if (!ctx.tablaOsr) return null;
  const { rows: [u] } = await db.query(`
    SELECT id, tau, validado, validado_por FROM dataset.osr_umbral
    WHERE subregion_id = $1 AND validado IS NOT NULL ORDER BY id DESC LIMIT 1`, [subregionId]);
  return u || null;
}

/** Evalúa una subregión. `ctx` se reusa al evaluar varias (resumen). */
async function evaluar(db, subregionId, ctx = null) {
  const sub = await subregionDe(db, subregionId);
  if (!sub) throw falla('Esa subregión no existe', 404);
  ctx = ctx || (await contexto(db));
  const especies = await especiesDe(db, ctx, sub.id);
  const osr = await umbralOsr(db, ctx, sub.id);
  const incluidas = especies.filter((e) => e.incluida);
  const idsIncluidas = incluidas.map((e) => e.especie_id);
  const morfos = await morfosDe(db, ctx, sub.id, idsIncluidas);
  const clusteres = await clusteresDe(db, ctx, idsIncluidas);

  const motivos = [];
  const avisos = [];
  const m = (codigo, texto, pantalla) => motivos.push({ codigo, texto, pantalla });
  const a = (codigo, texto, pantalla) => avisos.push({ codigo, texto, pantalla });

  if (sub.region_estado !== 'activa') {
    m('region_inactiva', `${sub.region_nombre} sigue en borrador: asigna todos sus municipios a una subregión y actívalo en Regiones.`, '/paquetes');
  }
  if (!ctx.encoder) {
    m('sin_encoder', 'El encoder del teléfono no está registrado. Arranca el worker para que lo registre.', '/ia');
  } else if (!ctx.experimento) {
    m('sin_centroides', 'Todavía no hay centroides calculados con el encoder del teléfono. Calcúlalos en Centroides.', '/centroides');
  } else if (!ctx.vigente) {
    m('centroides_desactualizados', 'Los centroides son anteriores al dataset o a los vectores actuales. Vuelve a calcularlos en Centroides.', '/centroides');
  }
  if (ctx.experimento && !incluidas.length) {
    m('sin_especies', especies.length
      ? 'Ninguna especie de esta subregión cumple el piso de entrenamiento con taxon_id del catálogo.'
      : 'Ninguna especie tiene individuos de entrenamiento ubicados en esta subregión. Sube fotos con coordenada en Imágenes y recalcula los centroides.',
    '/curacion');
  }
  const sinVector = incluidas.filter((e) => e.sin_vector > 0);
  if (sinVector.length) {
    const total = sinVector.reduce((s, e) => s + e.sin_vector, 0);
    m('faltan_vectores', `${total} fotos de entrenamiento de ${nombres(sinVector)} no tienen vector del encoder vigente. Corre el trabajo de embeddings.`, '/ia');
  }
  const pesosMalos = incluidas.filter((e) => e.contexto.pesos
    && Math.abs(e.contexto.pesos.wv + e.contexto.pesos.wg + e.contexto.pesos.wm - 1) > 1e-6);
  if (pesosMalos.length) {
    m('pesos_invalidos', `Los pesos wv + wg + wm de ${nombres(pesosMalos)} no suman 1. Corrígelos en la Ficha.`, '/ficha-especie');
  }
  if (!osr) m('osr_sin_validar', 'Falta validar el umbral OSR', '/osr');

  const noEntrenables = especies.filter((e) => !e.entrenable);
  if (noEntrenables.length) {
    a('no_entrenables', `${nombres(noEntrenables)} no llegan a ${MIN_FOTOS_ENTRENABLE} fotos activas y ${MIN_INDIVIDUOS} individuos: quedan fuera del paquete.`, '/curacion');
  }
  const sinTaxon = especies.filter((e) => e.entrenable && !e.taxon_id);
  if (sinTaxon.length) {
    a('sin_taxon_id', `${nombres(sinTaxon)} no tienen taxon_id del catálogo: quedan fuera del paquete.`, '/catalogo');
  }
  const sinPesos = incluidas.filter((e) => !e.contexto.pesos);
  if (sinPesos.length) {
    a('sin_pesos', `${nombres(sinPesos)} no tienen pesos wv/wg/wm en la Ficha: el paquete no ajusta su resultado por altitud ni sustrato.`, '/ficha-especie');
  }
  const morfosSinCentroide = morfos.filter((mo) => !mo.calculado);
  if (morfosSinCentroide.length) {
    const lista = morfosSinCentroide.slice(0, 4).map((mo) => `«${mo.nombre}»`).join(', ');
    a('morfo_sin_centroide', `Los morfos ${lista}${morfosSinCentroide.length > 4 ? ' y otros' : ''} no llegan a ${MIN_INDIVIDUOS_REGIONAL} individuos con vector: el paquete usa el centroide de su especie.`, '/centroides');
  }
  const prestadas = incluidas.filter((e) => !e.centroide_propio);
  if (prestadas.length) {
    a('centroide_prestado', `${nombres(prestadas)} tienen menos de ${MIN_INDIVIDUOS_REGIONAL} individuos aquí: el paquete usa su centroide global.`, '/centroides');
  }

  // Si algo de esto cambia, un borrador compilado con la huella anterior ya no se aprueba.
  const huella = crypto.createHash('sha256').update(JSON.stringify([
    ENCODER, ctx.version?.id ?? null, ctx.experimento?.id ?? null, osr?.id ?? null, osr?.tau ?? null,
    incluidas.map((e) => [e.especie_id, e.contexto]),
    morfos.map((mo) => [mo.morfo_id, mo.nombre, mo.calculado]),
    clusteres.map((c) => [c.id, c.miembros, c.decidido_en]),
  ])).digest('hex');

  return {
    subregion: sub,
    lista: motivos.length === 0,
    motivos,
    avisos,
    reglas: { min_fotos_entrenable: MIN_FOTOS_ENTRENABLE, min_individuos: MIN_INDIVIDUOS, min_individuos_regional: MIN_INDIVIDUOS_REGIONAL },
    encoder: ctx.encoder ? { sha256: ctx.encoder.sha256, archivo: ctx.encoder.archivo, dimension: ctx.encoder.dimension } : null,
    dataset_version: ctx.version,
    centroides: ctx.experimento ? { experimento_id: ctx.experimento.id, creado: ctx.experimento.creado, vigente: ctx.vigente } : null,
    osr: osr ? { umbral_id: Number(osr.id), tau: osr.tau, validado: osr.validado, validado_por: osr.validado_por } : null,
    especies,
    morfos,
    clusteres: clusteres.map(({ id, nombre, miembros, medicion }) => ({ id, nombre, miembros, medicion })),
    huella,
  };
}

/** Todas las subregiones de los departamentos en ANURA, con su estado de validación. */
async function resumen(db) {
  const ctx = await contexto(db);
  const { rows } = await db.query(`
    SELECT s.id FROM dataset.subregion s JOIN dataset.region r ON r.codigo_dane = s.region
    ORDER BY r.nombre, s.numero`);
  const subregiones = [];
  for (const { id } of rows) {
    const v = await evaluar(db, id, ctx);
    subregiones.push({
      ...v.subregion,
      lista: v.lista,
      motivos: v.motivos,
      especies: v.especies.filter((e) => e.incluida).length,
    });
  }
  return { subregiones };
}

module.exports = { evaluar, resumen, MIN_FOTOS_ENTRENABLE, MIN_INDIVIDUOS };
