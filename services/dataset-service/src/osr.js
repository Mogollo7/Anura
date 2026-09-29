/**
 * OSR real (Admin → OSR, bloque 6). El servidor calcula el umbral de rechazo con los vectores
 * de pgvector y lo PROPONE; una persona lo VALIDA (o lo ajusta y valida). Nada se inventa:
 * sin centroides, sin fotos de calibración o sin desconocidas, la respuesta dice qué falta.
 *
 * Métrica: la del teléfono (OpenSetModel.kt, M5_LedoitWolf_Shared), ver mahalanobis.js.
 * - Medias y covarianza: partición train del manifiesto del lote de centroides vigente, sin
 *   exclusiones. La covarianza es compartida (todas las especies con centroide); las medias
 *   que se comparan son las de las especies del paquete (el teléfono restringe igual con
 *   `allowedIds`).
 * - τ: percentil KAR objetivo de los puntajes de las conocidas de la partición val (el vault la
 *   llama CALIBRATION).
 * - KAR / FAR / AUROC: se MIDEN en la partición test (si no hay, en val y se avisa). Las
 *   desconocidas son fotos reales, fuera de train, de especies que no están en el paquete:
 *   las de otras subregiones y las que no tienen centroide.
 *
 * Paquete de una subregión = especies con centroide en el lote vigente y con fotos dentro de
 * su polígono (fila en centroide_regional, propia o prestada) que además entran al paquete según la
 * validación técnica (entrenables y con taxon_id): el modelo calibrado es el que compila
 * paqueteSqlite.js, con esas mismas especies. subregion_id null = todas.
 */
const M = require('./mahalanobis');
const { registrar } = require('./audit');
const validacion = require('./validacionTecnica');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const KAR_OBJETIVO = 0.95;
const PUNTOS_KAR = [0.8, 0.85, 0.9, 0.95, 0.975, 0.99];
const METRICA = 'mahalanobis_min_ledoit_wolf';

const NO_EXCLUIDA = `NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = e.sha256 AND x.revertida IS NULL)`;

const vector = (texto) => JSON.parse(texto);
const redondear = (x, d = 4) => (x == null ? null : Number(x.toFixed(d)));

/** subregion_id del query o del cuerpo: número, o null para "todas las especies". */
function leerSubregion(valor) {
  if (valor === undefined || valor === null || valor === '' || valor === 'todas') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw falla('La subregión no es válida');
  return n;
}

/** El lote de centroides vigente: el último calculado. */
async function vigente(db) {
  const { rows: [exp] } = await db.query(`
    SELECT id, encoder_sha256, version_id, creado FROM dataset.experimento
    WHERE tipo = 'centroides' ORDER BY id DESC LIMIT 1`);
  return exp || null;
}

async function exigirVigente(db) {
  const exp = await vigente(db);
  if (!exp) throw falla('Todavía no hay centroides. Calcúlalos en Centroides y vuelve aquí.', 409);
  return exp;
}

async function exigirSubregion(db, subregionId) {
  if (subregionId === null) return null;
  const { rows: [s] } = await db.query(
    'SELECT s.id, s.nombre, r.nombre AS region FROM dataset.subregion s JOIN dataset.region r ON r.codigo_dane = s.region WHERE s.id = $1',
    [subregionId]);
  if (!s) throw falla('Esa subregión no existe', 404);
  return s;
}

/** Especies del paquete: con centroide en el lote y, si hay subregión, con fotos dentro de ella. */
async function especiesDelPaquete(db, expId, subregionId) {
  const { rows } = await db.query(`
    SELECT e.id, e.nombre_cientifico, e.genero, e.familia, e.taxon_id, c.n_observaciones
    FROM dataset.centroide c JOIN dataset.especie e ON e.id = c.especie_id
    WHERE c.experimento_id = $1
      AND ($2::int IS NULL OR EXISTS (SELECT 1 FROM dataset.centroide_regional cr
           WHERE cr.experimento_id = $1 AND cr.subregion_id = $2 AND cr.especie_id = c.especie_id))
    ORDER BY e.nombre_cientifico`, [expId, subregionId]);
  return rows;
}

/** Vectores de train de todas las especies con centroide en el lote (para medias y covarianza). */
async function vectoresTrain(db, exp) {
  const { rows } = await db.query(`
    SELECT f.especie_id, e.vector::text AS v
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = $2
    WHERE e.encoder_sha256 = $1 AND vf.particion = 'train' AND ${NO_EXCLUIDA}
      AND f.especie_id IN (SELECT especie_id FROM dataset.centroide WHERE experimento_id = $3)`,
    [exp.encoder_sha256, exp.version_id, exp.id]);
  return rows.map((r) => ({ especie_id: r.especie_id, x: vector(r.v) }));
}

/** Todo lo que no es train (val, test o fuera del manifiesto): de aquí salen calibración, prueba y desconocidas. */
async function vectoresFueraDeTrain(db, exp) {
  const { rows } = await db.query(`
    SELECT e.sha256, f.especie_id, vf.particion, e.vector::text AS v
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    LEFT JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = $2
    WHERE e.encoder_sha256 = $1 AND ${NO_EXCLUIDA}
      AND (vf.particion IS NULL OR vf.particion <> 'train')`,
    [exp.encoder_sha256, exp.version_id]);
  return rows.map((r) => ({ sha256: r.sha256, especie_id: r.especie_id, particion: r.particion, x: vector(r.v) }));
}

const dimDe = (filas) => (filas.length ? filas[0].x.length : 512);

/** Medias por especie, covarianza Ledoit-Wolf compartida y su factor de Cholesky. */
function geometria(train) {
  const dim = dimDe(train);
  const porEspecie = new Map();
  for (const t of train) {
    if (!porEspecie.has(t.especie_id)) porEspecie.set(t.especie_id, []);
    porEspecie.get(t.especie_id).push(t.x);
  }
  const medias = new Map([...porEspecie].map(([id, xs]) => [id, M.media(xs, dim)]));
  const centradas = train.map((t) => {
    const mu = medias.get(t.especie_id);
    const r = new Float64Array(dim);
    for (let d = 0; d < dim; d++) r[d] = t.x[d] - mu[d];
    return r;
  });
  const { cov, shrinkage } = M.ledoitWolf(centradas, dim);
  const L = M.cholesky(cov, dim);
  return { dim, medias, conteo: new Map([...porEspecie].map(([id, xs]) => [id, xs.length])), shrinkage, L };
}

/** Coseno: el τ Weibull por especie que ya guarda Centroides (dataset.centroide.tau). */
async function centroidesCoseno(db, expId, ids) {
  const { rows } = await db.query(`
    SELECT especie_id, tau, vector::text AS v FROM dataset.centroide
    WHERE experimento_id = $1 AND especie_id = ANY($2::int[]) AND tau IS NOT NULL`, [expId, ids]);
  return rows.map((r) => ({ especie_id: r.especie_id, tau: r.tau, c: vector(r.v) }));
}

function puntajeCoseno(x, centroides) {
  let n = 0;
  for (const v of x) n += v * v;
  n = Math.sqrt(n) || 1;
  let mejor = Infinity;
  for (const { tau, c } of centroides) {
    let cos = 0;
    for (let d = 0; d < x.length; d++) cos += x[d] * c[d];
    cos /= n;
    const radio = 1 - tau;
    if (radio > 0) mejor = Math.min(mejor, (1 - cos) / radio);
  }
  return mejor;
}

async function calibrar(pool, body, userId) {
  const subregionId = leerSubregion(body.subregion_id);
  const karObjetivo = body.kar_objetivo === undefined ? KAR_OBJETIVO : Number(body.kar_objetivo);
  if (!Number.isFinite(karObjetivo) || karObjetivo < 0.5 || karObjetivo > 0.999) {
    throw falla('El KAR objetivo va entre 0,5 y 0,999');
  }
  const exp = await exigirVigente(pool);
  await exigirSubregion(pool, subregionId);
  let paquete = await especiesDelPaquete(pool, exp.id, subregionId);
  if (subregionId !== null && paquete.length) {
    // El modelo viaja en el paquete con exactamente las especies que entran (validacionTecnica.js):
    // las que no llegan al piso de entrenamiento o no tienen taxon_id quedan como desconocidas.
    const entran = new Set(await validacion.especiesIncluidasIds(pool, subregionId));
    paquete = paquete.filter((e) => entran.has(e.id));
    if (!paquete.length) {
      throw falla('Ninguna especie de esta subregión cumple lo necesario para entrar al paquete (fotos, individuos y taxon_id). Revisa Validación.', 409);
    }
  }
  if (!paquete.length) {
    throw falla(subregionId === null
      ? 'El lote de centroides no tiene especies.'
      : 'Esta subregión no tiene especies con fotos dentro de su polígono. Asigna sus municipios en Regiones y vuelve a calcular los centroides.', 409);
  }
  const enPaquete = new Set(paquete.map((e) => e.id));

  const train = await vectoresTrain(pool, exp);
  const g = geometria(train);
  const ids = paquete.map((e) => e.id).filter((id) => g.medias.has(id));
  if (!ids.length) throw falla('Las especies de este paquete no tienen vectores de entrenamiento.', 409);
  const mediasBlancas = ids.map((id) => M.blanquear(g.L, g.medias.get(id), g.dim));

  const resto = await vectoresFueraDeTrain(pool, exp);
  const calib = [];
  const prueba = [];
  const desconocidas = [];
  for (const r of resto) {
    if (enPaquete.has(r.especie_id)) {
      if (r.particion === 'val') calib.push(r);
      else if (r.particion === 'test') prueba.push(r);
    } else {
      desconocidas.push(r);
    }
  }
  if (!calib.length) {
    throw falla('Las especies de este paquete no tienen fotos en la partición val con vector. Sin ellas no se calibra τ.', 409);
  }
  const particionMedida = prueba.length ? 'test' : 'val';
  const medidas = prueba.length ? prueba : calib;

  const puntuar = (r) => M.minima(M.blanquear(g.L, r.x, g.dim), mediasBlancas);
  const sCalib = calib.map((r) => puntuar(r).distancia);
  const sConocidas = medidas.map((r) => ({ especie_id: r.especie_id, ...puntuar(r) }));
  const sDesconocidas = desconocidas.map((r) => ({ especie_id: r.especie_id, ...puntuar(r) }));
  const conocidas = sConocidas.map((s) => s.distancia);
  const ajenas = sDesconocidas.map((s) => s.distancia);

  const tau = M.percentil(sCalib, karObjetivo * 100);
  const puntos = PUNTOS_KAR.map((p) => {
    const t = M.percentil(sCalib, p * 100);
    return { kar_objetivo: p, tau: redondear(t), kar: redondear(M.tasa(conocidas, t)), far: redondear(M.tasa(ajenas, t)) };
  });

  // La especie más cercana por Mahalanobis, entre las conocidas aceptadas (es la que nombraría el rechazo).
  const aceptadas = sConocidas.filter((s) => s.distancia <= tau);
  const bienNombradas = aceptadas.filter((s) => ids[s.indice] === s.especie_id).length;

  const nombres = new Map(paquete.map((e) => [e.id, e]));
  const porEspecie = ids.map((id) => {
    const mias = sConocidas.filter((s) => s.especie_id === id).map((s) => s.distancia);
    return {
      especie_id: id,
      nombre_cientifico: nombres.get(id).nombre_cientifico,
      genero: nombres.get(id).genero,
      n_observaciones: nombres.get(id).n_observaciones,
      n_train: g.conteo.get(id) || 0,
      n_val: calib.filter((r) => r.especie_id === id).length,
      n_medidas: mias.length,
      kar: redondear(M.tasa(mias, tau)),
      mediana: redondear(M.percentil(mias, 50), 3),
    };
  });

  const { rows: especiesAjenas } = desconocidas.length
    ? await pool.query(`
        SELECT e.id AS especie_id, e.nombre_cientifico, COUNT(*)::int AS fotos,
               EXISTS (SELECT 1 FROM dataset.centroide c WHERE c.experimento_id = $2 AND c.especie_id = e.id) AS con_centroide
        FROM unnest($1::int[]) u(especie_id) JOIN dataset.especie e ON e.id = u.especie_id
        GROUP BY e.id ORDER BY fotos DESC, e.nombre_cientifico`, [desconocidas.map((d) => d.especie_id), exp.id])
    : { rows: [] };
  const ajenasTau = sDesconocidas.filter((s) => s.distancia <= tau);
  const cuelan = new Map();
  for (const s of ajenasTau) {
    const cerca = ids[s.indice];
    cuelan.set(cerca, (cuelan.get(cerca) || 0) + 1);
  }

  // Comparación con el camino coseno + Weibull (mismos vectores, mismas particiones).
  const cos = await centroidesCoseno(pool, exp.id, ids);
  let coseno = null;
  if (cos.length) {
    const ck = medidas.map((r) => puntajeCoseno(r.x, cos));
    const cu = desconocidas.map((r) => puntajeCoseno(r.x, cos));
    coseno = {
      especies_con_tau: cos.length,
      kar: redondear(M.tasa(ck, 1)),
      far: redondear(M.tasa(cu, 1)),
      auroc: redondear(M.auroc(ck, cu)),
    };
  }

  const resultado = {
    metrica: METRICA,
    tau: redondear(tau, 6),
    kar: redondear(M.tasa(conocidas, tau)),
    far: redondear(M.tasa(ajenas, tau)),
    auroc: redondear(M.auroc(conocidas, ajenas)),
    acierto_entre_aceptadas: aceptadas.length ? redondear(bienNombradas / aceptadas.length) : null,
    puntos,
    especies: porEspecie,
    desconocidas: especiesAjenas.map((e) => ({ ...e, se_cuelan: sDesconocidas.filter((s) => s.especie_id === e.especie_id && s.distancia <= tau).length })),
    coseno,
    se_cuelan_en: [...cuelan].map(([id, n]) => ({ especie_id: id, nombre_cientifico: nombres.get(id).nombre_cientifico, fotos: n }))
      .sort((a, b) => b.fotos - a.fotos),
    puntajes: {
      calibracion: sCalib.map((x) => redondear(x, 3)),
      conocidas: conocidas.map((x) => redondear(x, 3)),
      desconocidas: ajenas.map((x) => redondear(x, 3)),
    },
  };

  const precision = M.precisionDe(g.L, g.dim);
  const medias = new Float64Array(ids.length * g.dim);
  ids.forEach((id, i) => medias.set(g.medias.get(id), i * g.dim));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [c] } = await client.query(`
      INSERT INTO dataset.osr_calibracion
        (subregion_id, experimento_id, encoder_sha256, version_id, metrica, particion_medida, kar_objetivo,
         tau_propuesto, shrinkage, especies, n_train, n_calibracion, n_conocidas, n_desconocidas, resultado,
         especie_ids, medias, precision, creado_por)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id`,
      [subregionId, exp.id, exp.encoder_sha256, exp.version_id, METRICA, particionMedida, karObjetivo, tau,
        g.shrinkage, ids.length, train.length, calib.length, medidas.length, desconocidas.length, resultado,
        ids, Buffer.from(medias.buffer), Buffer.from(precision.buffer), userId]);
    await client.query(`
      INSERT INTO dataset.osr_umbral (subregion_id, tau, metrica, calibracion_id, experimento_id, kar_objetivo, kar, far, auroc)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [subregionId, tau, METRICA, c.id, exp.id, karObjetivo, resultado.kar, resultado.far, resultado.auroc]);
    await registrar(client, userId, 'dataset.osr.calibrado', 'osr_calibracion', c.id, {
      subregion_id: subregionId, experimento_id: exp.id, kar_objetivo: karObjetivo, tau_propuesto: tau,
      especies: ids.length, kar: resultado.kar, far: resultado.far, auroc: resultado.auroc,
      particion_medida: particionMedida, desconocidas: desconocidas.length,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return estado(pool, subregionId);
}

/** Validar: la persona acepta el τ propuesto o uno ajustado. Queda una fila nueva y auditada. */
async function validar(pool, body, account, userId) {
  const calibracionId = Number(body.calibracion_id);
  if (!Number.isInteger(calibracionId)) throw falla('Falta la calibración que se valida');
  const tau = Number(body.tau);
  if (!Number.isFinite(tau) || tau <= 0) throw falla('τ tiene que ser un número mayor que 0');
  const nota = typeof body.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 500) : null;

  const { rows: [c] } = await pool.query(`
    SELECT id, subregion_id, experimento_id, kar_objetivo, tau_propuesto, particion_medida, resultado
    FROM dataset.osr_calibracion WHERE id = $1`, [calibracionId]);
  if (!c) throw falla('Esa calibración no existe', 404);
  const { rows: [ultima] } = await pool.query(
    'SELECT id FROM dataset.osr_calibracion WHERE subregion_id IS NOT DISTINCT FROM $1 ORDER BY id DESC LIMIT 1', [c.subregion_id]);
  if (ultima.id !== c.id) throw falla('Hay una calibración más reciente de este paquete. Valida esa.', 409);
  const exp = await vigente(pool);
  if (!exp || exp.id !== c.experimento_id) {
    throw falla('Los centroides cambiaron después de esta calibración. Vuelve a calibrar y valida la nueva.', 409);
  }

  const p = c.resultado.puntajes;
  const kar = M.tasa(p.conocidas, tau);
  const far = M.tasa(p.desconocidas, tau);
  const manual = Math.abs(tau - c.tau_propuesto) > 1e-9;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [u] } = await client.query(`
      INSERT INTO dataset.osr_umbral
        (subregion_id, tau, validado_por, validado, metrica, calibracion_id, experimento_id, kar_objetivo, kar, far, auroc,
         validado_nombre, nota)
      VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [c.subregion_id, tau, userId, METRICA, c.id, c.experimento_id, c.kar_objetivo, redondear(kar), redondear(far),
        c.resultado.auroc, account?.name || account?.email || null, nota]);
    await registrar(client, userId, 'dataset.osr.validado', 'osr_umbral', u.id, {
      subregion_id: c.subregion_id, calibracion_id: c.id, tau, tau_propuesto: c.tau_propuesto, manual,
      kar: redondear(kar), far: redondear(far), particion_medida: c.particion_medida, nota,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return estado(pool, c.subregion_id);
}

/** Umbral vigente (último validado) de un paquete; null si nunca se validó. */
async function umbralVigente(db, subregionId) {
  const { rows: [u] } = await db.query(`
    SELECT * FROM dataset.osr_umbral
    WHERE subregion_id IS NOT DISTINCT FROM $1 AND validado IS NOT NULL
    ORDER BY id DESC LIMIT 1`, [subregionId]);
  return u || null;
}

/** Propuesta: fila sin validar de la última calibración de ese paquete, si nadie la validó todavía. */
async function umbralPropuesto(db, subregionId) {
  const { rows: [u] } = await db.query(`
    SELECT u.* FROM dataset.osr_umbral u
    WHERE u.subregion_id IS NOT DISTINCT FROM $1 AND u.validado IS NULL
      AND u.calibracion_id = (SELECT MAX(id) FROM dataset.osr_calibracion WHERE subregion_id IS NOT DISTINCT FROM $1)
      -- Ya validada (tal cual o ajustada): deja de ser una propuesta pendiente.
      AND NOT EXISTS (SELECT 1 FROM dataset.osr_umbral v WHERE v.calibracion_id = u.calibracion_id AND v.validado IS NOT NULL)
    ORDER BY u.id DESC LIMIT 1`, [subregionId]);
  return u || null;
}

/** Paquetes que se pueden calibrar: "todas las especies" y cada subregión, con su τ vigente. */
async function paquetes(pool, exp) {
  const expId = exp?.id ?? null;
  const { rows: subregiones } = await pool.query(`
    SELECT s.id, s.nombre, r.nombre AS region,
           (SELECT COUNT(*)::int FROM dataset.centroide_regional cr
             WHERE cr.experimento_id = $1 AND cr.subregion_id = s.id
               AND EXISTS (SELECT 1 FROM dataset.centroide c WHERE c.experimento_id = $1 AND c.especie_id = cr.especie_id)) AS especies,
           (SELECT u.tau FROM dataset.osr_umbral u WHERE u.subregion_id = s.id AND u.validado IS NOT NULL
             ORDER BY u.id DESC LIMIT 1) AS tau_vigente
    FROM dataset.subregion s JOIN dataset.region r ON r.codigo_dane = s.region
    ORDER BY r.nombre, s.numero`, [expId]);
  const { rows: [todas] } = await pool.query(
    'SELECT COUNT(*)::int AS especies FROM dataset.centroide WHERE experimento_id = $1', [expId]);
  return [
    { id: null, nombre: 'Todas las especies', region: null, especies: todas.especies, tau_vigente: (await umbralVigente(pool, null))?.tau ?? null },
    ...subregiones,
  ];
}

/** GET /api/dataset/osr?subregion_id= — paquetes, calibración, propuesta, vigente e historial. */
async function estado(pool, subregionId) {
  const exp = await vigente(pool);
  const { rows: [calibracion] } = await pool.query(`
    SELECT id, subregion_id, experimento_id, encoder_sha256, version_id, metrica, particion_calibracion, particion_medida,
           kar_objetivo, tau_propuesto, shrinkage, especies, n_train, n_calibracion, n_conocidas, n_desconocidas,
           resultado, creado_por, creado
    FROM dataset.osr_calibracion WHERE subregion_id IS NOT DISTINCT FROM $1 ORDER BY id DESC LIMIT 1`, [subregionId]);
  const { rows: historial } = await pool.query(`
    SELECT id, tau, calibracion_id, experimento_id, kar, far, auroc, validado, validado_nombre, nota, creado
    FROM dataset.osr_umbral WHERE subregion_id IS NOT DISTINCT FROM $1 AND validado IS NOT NULL
    ORDER BY id DESC LIMIT 10`, [subregionId]);

  return {
    experimento: exp ? { id: exp.id, creado: exp.creado } : null,
    paquetes: await paquetes(pool, exp),
    subregion_id: subregionId,
    calibracion: calibracion || null,
    propuesta: await umbralPropuesto(pool, subregionId),
    vigente: await umbralVigente(pool, subregionId),
    historial,
  };
}

module.exports = {
  calibrar, validar, estado, paquetes, leerSubregion, vigente, exigirVigente, exigirSubregion, especiesDelPaquete,
  umbralVigente, umbralPropuesto, NO_EXCLUIDA, vector,
};
