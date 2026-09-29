/**
 * Métricas reales (Admin → Métricas, bloque 6). Una evaluación toma las fotos de la partición
 * test de las especies de un paquete y las ordena por coseno contra los centroides vigentes del
 * paquete (el regional propio si la especie tiene ≥ 3 individuos en la subregión, si no el
 * global, como en Centroides). Guarda top-1 y top-3 por especie y la fila de la matriz de
 * confusión; los pares más confundidos se leen de ahí. No escribe en centroides ni en paquetes.
 */
const { registrar } = require('./audit');
const osr = require('./osr');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

/** Centroide de cada especie del paquete: regional propio (con vector) o el global. Normalizado. */
async function centroidesDelPaquete(db, expId, ids, subregionId) {
  const { rows } = await db.query(`
    SELECT c.especie_id, COALESCE(cr.vector, c.vector)::text AS v, (cr.vector IS NOT NULL) AS regional
    FROM dataset.centroide c
    LEFT JOIN dataset.centroide_regional cr
      ON cr.experimento_id = c.experimento_id AND cr.especie_id = c.especie_id AND cr.subregion_id = $3
    WHERE c.experimento_id = $1 AND c.especie_id = ANY($2::int[])`, [expId, ids, subregionId]);
  return rows.map((r) => ({ especie_id: r.especie_id, regional: r.regional, c: unitario(osr.vector(r.v)) }));
}

function unitario(x) {
  let n = 0;
  for (const v of x) n += v * v;
  n = Math.sqrt(n) || 1;
  return x.map((v) => v / n);
}

/** Especies del paquete ordenadas de más a menos parecidas (coseno). */
function ranking(x, centroides) {
  const u = unitario(x);
  return centroides
    .map(({ especie_id, c }) => {
      let cos = 0;
      for (let d = 0; d < u.length; d++) cos += u[d] * c[d];
      return { especie_id, coseno: cos };
    })
    .sort((a, b) => b.coseno - a.coseno);
}

async function evaluar(pool, body, userId) {
  const subregionId = osr.leerSubregion(body.subregion_id);
  const exp = await osr.exigirVigente(pool);
  await osr.exigirSubregion(pool, subregionId);
  const paquete = await osr.especiesDelPaquete(pool, exp.id, subregionId);
  if (!paquete.length) {
    throw falla('Este paquete no tiene especies con centroide. Asigna municipios en Regiones y vuelve a calcular los centroides.', 409);
  }
  const ids = paquete.map((e) => e.id);
  const centroides = await centroidesDelPaquete(pool, exp.id, ids, subregionId);
  const { rows: fotos } = await pool.query(`
    SELECT f.especie_id, e.vector::text AS v
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = $2
    WHERE e.encoder_sha256 = $1 AND vf.particion = 'test' AND ${osr.NO_EXCLUIDA}
      AND f.especie_id = ANY($3::int[])`, [exp.encoder_sha256, exp.version_id, ids]);
  if (!fotos.length) {
    throw falla('Las especies de este paquete no tienen fotos en la partición test con vector. Sin ellas no hay qué evaluar.', 409);
  }

  const filas = new Map(ids.map((id) => [id, { soporte: 0, top1: 0, top3: 0, predichas: {} }]));
  for (const f of fotos) {
    const r = ranking(osr.vector(f.v), centroides);
    const fila = filas.get(f.especie_id);
    fila.soporte++;
    const pred = r[0].especie_id;
    fila.predichas[pred] = (fila.predichas[pred] || 0) + 1;
    if (pred === f.especie_id) fila.top1++;
    if (r.slice(0, 3).some((p) => p.especie_id === f.especie_id)) fila.top3++;
  }
  const conSoporte = [...filas].filter(([, f]) => f.soporte > 0);
  const n = fotos.length;
  const top1 = conSoporte.reduce((s, [, f]) => s + f.top1, 0) / n;
  const top3 = conSoporte.reduce((s, [, f]) => s + f.top3, 0) / n;

  const client = await pool.connect();
  let id;
  try {
    await client.query('BEGIN');
    const { rows: [ev] } = await client.query(`
      INSERT INTO dataset.evaluacion (subregion_id, experimento_id, version_id, especies, n, top1, top3, creado_por)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [subregionId, exp.id, exp.version_id, ids.length, n, top1, top3, userId]);
    id = ev.id;
    for (const [especieId, f] of filas) {
      await client.query(`
        INSERT INTO dataset.evaluacion_especie (evaluacion_id, especie_id, soporte, top1, top3, predichas)
        VALUES ($1, $2, $3, $4, $5, $6)`, [id, especieId, f.soporte, f.top1, f.top3, f.predichas]);
    }
    await registrar(client, userId, 'dataset.evaluacion.calculada', 'evaluacion', id, {
      subregion_id: subregionId, experimento_id: exp.id, especies: ids.length, fotos: n,
      top1: Number(top1.toFixed(4)), top3: Number(top3.toFixed(4)),
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return detalle(pool, id);
}

/** GET /api/dataset/evaluaciones — paquetes y la última evaluación de cada uno. */
async function listar(pool) {
  const exp = await osr.vigente(pool);
  const { rows } = await pool.query(`
    WITH paquetes AS (
      SELECT NULL::int AS id, 'Todas las especies' AS nombre, NULL::text AS region, 0 AS orden, 0 AS numero
      UNION ALL
      SELECT s.id, s.nombre, r.nombre, 1, s.numero FROM dataset.subregion s JOIN dataset.region r ON r.codigo_dane = s.region
    )
    SELECT p.id, p.nombre, p.region, ev.id AS evaluacion_id, ev.top1, ev.top3, ev.n, ev.especies, ev.experimento_id, ev.creado
    FROM paquetes p
    LEFT JOIN LATERAL (
      SELECT id, top1, top3, n, especies, experimento_id, creado FROM dataset.evaluacion e
      WHERE e.subregion_id IS NOT DISTINCT FROM p.id ORDER BY id DESC LIMIT 1
    ) ev ON TRUE
    ORDER BY p.orden, p.region, p.numero`);
  return { experimento: exp ? { id: exp.id, creado: exp.creado } : null, paquetes: rows };
}

/** GET /api/dataset/evaluaciones/:id — filas por especie, con nombres, y el OSR vigente del paquete. */
async function detalle(pool, id) {
  const { rows: [ev] } = await pool.query(`
    SELECT ev.*, s.nombre AS subregion, r.nombre AS region
    FROM dataset.evaluacion ev
    LEFT JOIN dataset.subregion s ON s.id = ev.subregion_id
    LEFT JOIN dataset.region r ON r.codigo_dane = s.region
    WHERE ev.id = $1`, [id]);
  if (!ev) throw falla('Esa evaluación no existe', 404);
  const { rows: filas } = await pool.query(`
    SELECT ee.especie_id, e.nombre_cientifico, e.genero, e.familia, e.taxon_id, ee.soporte, ee.top1, ee.top3, ee.predichas,
           c.n_observaciones
    FROM dataset.evaluacion_especie ee
    JOIN dataset.especie e ON e.id = ee.especie_id
    LEFT JOIN dataset.centroide c ON c.experimento_id = $2 AND c.especie_id = ee.especie_id
    WHERE ee.evaluacion_id = $1
    ORDER BY e.nombre_cientifico`, [id, ev.experimento_id]);
  const exp = await osr.vigente(pool);
  const umbral = await osr.umbralVigente(pool, ev.subregion_id);
  return {
    evaluacion: ev,
    filas,
    vigente: !!exp && exp.id === ev.experimento_id,
    osr: umbral && {
      tau: umbral.tau, kar: umbral.kar, far: umbral.far, auroc: umbral.auroc, validado: umbral.validado,
      validado_nombre: umbral.validado_nombre, experimento_id: umbral.experimento_id,
    },
  };
}

module.exports = { evaluar, listar, detalle, centroidesDelPaquete, ranking };
