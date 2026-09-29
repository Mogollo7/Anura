/**
 * Release (Admin → Resultado → Release): compilar, aprobar y publicar el paquete de una
 * subregión, todo en el servidor.
 *
 * Ciclo (packages.regional_packages, phase18):
 *   borrador  — compilado. Exige validación técnica lista (validacionTecnica.js).
 *   aprobado  — tiene las DOS aprobaciones: científica (permiso aprobarCientifico) y técnica
 *               (permiso publicarPaquete), de dos cuentas del panel distintas. Quien compila
 *               puede dar una, nunca las dos. La base lo impone con UNIQUE (paquete_id, cuenta).
 *   publicado — lo que la app descarga. Uno por subregión: el anterior pasa a retirado.
 * Un borrador cuya huella ya no coincide con la validación actual (se recalcularon centroides,
 * cambió el umbral OSR…) está desactualizado: no se aprueba ni se publica; se compila otro.
 * Cada paso queda en audit.log.
 *
 * Artefactos: package.sqlite + paquete.json en MinIO (mismo bucket del dataset), bajo
 * paquetes/<paquete_id>/v<version>/. El id de paquete es "<DANE>.<CLAVE>" (p. ej.
 * 05.VALLE_DE_ABURRA): estable aunque la subregión cambie de nombre.
 */
const validacion = require('./validacionTecnica');
const { construir } = require('./paqueteSqlite');
const { registrar } = require('./audit');

const falla = (mensaje, status = 400, extra = {}) => Object.assign(new Error(mensaje), { status }, extra);
const auditar = (db, userId, action, id, metadata) => registrar(db, userId, action, 'paquete', id, metadata);

const TIPOS = { cientifica: 'aprobarCientifico', tecnica: 'publicarPaquete' };
const TIPO_LABEL = { cientifica: 'científica', tecnica: 'técnica' };
const puede = (account, accion) => account.isSuperAdmin || !!account.permissions?.[accion];

const paqueteIdDe = (sub) => `${sub.region}.${sub.clave}`;

const COLUMNAS = `
  p.id, p.region_id AS paquete_id, p.subregion_id, p.version, p.estado, p.sha256, p.size_bytes, p.especies,
  p.encoder_sha256, p.experimento_id, p.osr_umbral_id, p.tau, p.huella, p.manifiesto,
  p.compilado_por, p.compilado_nombre, p.created_at AS compilado, p.publicado_por, p.publicado_nombre,
  p.published_at AS publicado, p.retirado,
  COALESCE((SELECT json_agg(json_build_object('tipo', a.tipo, 'cuenta', a.cuenta, 'nombre', a.nombre, 'creado', a.creado)
            ORDER BY a.creado) FROM packages.aprobacion a WHERE a.paquete_id = p.id), '[]') AS aprobaciones`;

async function uno(db, id) {
  const { rows: [p] } = await db.query(`SELECT ${COLUMNAS} FROM packages.regional_packages p WHERE p.id = $1`, [id]);
  if (!p) throw falla('Ese paquete no existe', 404);
  return p;
}

/** GET /api/dataset/releases?subregion_id= — versiones de una subregión (o todas), la más nueva primero. */
async function listar(db, subregionId) {
  const filtro = subregionId ? 'WHERE p.subregion_id = $1' : '';
  const { rows } = await db.query(
    `SELECT ${COLUMNAS} FROM packages.regional_packages p ${filtro} ORDER BY p.subregion_id, p.version DESC`,
    subregionId ? [subregionId] : []);
  // Vigencia de los borradores y aprobados contra la validación de HOY.
  const huellas = new Map();
  for (const p of rows) {
    if ((p.estado === 'borrador' || p.estado === 'aprobado') && p.subregion_id && !huellas.has(p.subregion_id)) {
      huellas.set(p.subregion_id, (await validacion.evaluar(db, p.subregion_id)).huella);
    }
  }
  return {
    paquetes: rows.map((p) => ({
      ...p,
      desactualizado: (p.estado === 'borrador' || p.estado === 'aprobado') && huellas.get(p.subregion_id) !== p.huella,
    })),
  };
}

/** POST /api/dataset/releases { subregion_id } — compila un borrador desde el estado real. */
async function compilar({ pool, minio, bucket }, subregionId, account, userId) {
  const v = await validacion.evaluar(pool, subregionId);
  if (!v.lista) throw falla('Esta subregión todavía no está lista para compilar.', 409, { motivos: v.motivos });
  const paqueteId = paqueteIdDe(v.subregion);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Dos compilaciones a la vez de la misma subregión no pueden tomar el mismo número.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`paquete:${paqueteId}`]);
    const { rows: [{ version }] } = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM packages.regional_packages WHERE region_id = $1', [paqueteId]);
    const generado = new Date().toISOString();
    const art = await construir(client, v, { paqueteId, version, generado });

    const base = `paquetes/${paqueteId}/v${version}`;
    const jsonTexto = `${JSON.stringify(art.manifiesto, null, 2)}\n`;
    await minio.putObject(bucket, `${base}/package.sqlite`, art.sqlite, art.size_bytes, { 'Content-Type': 'application/vnd.sqlite3' });
    await minio.putObject(bucket, `${base}/paquete.json`, Buffer.from(jsonTexto), Buffer.byteLength(jsonTexto), { 'Content-Type': 'application/json' });

    const { rows: [p] } = await client.query(`
      INSERT INTO packages.regional_packages
        (region_id, version, storage_key, sha256, size_bytes, subregion_id, estado, especies, encoder_sha256,
         experimento_id, osr_umbral_id, tau, huella, manifiesto, manifiesto_key, compilado_por, compilado_cuenta, compilado_nombre)
      VALUES ($1, $2, $3, $4, $5, $6, 'borrador', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id`,
    [paqueteId, version, `${base}/package.sqlite`, art.sha256, art.size_bytes, v.subregion.id,
      art.manifiesto.especies.length, v.encoder.sha256, v.centroides.experimento_id, v.osr?.umbral_id ?? null,
      v.osr?.tau ?? null, v.huella, art.manifiesto, `${base}/paquete.json`, userId, String(account.id), account.name || null]);
    await auditar(client, userId, 'dataset.paquete.compilado', p.id, {
      paquete: paqueteId, version, sha256: art.sha256, size_bytes: art.size_bytes,
      especies: art.manifiesto.especies.length, vectores: art.manifiesto.vectores,
      experimento_id: v.centroides.experimento_id, osr_umbral_id: v.osr?.umbral_id ?? null,
    });
    await client.query('COMMIT');
    return uno(pool, p.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function bloquear(client, id) {
  const { rows: [p] } = await client.query('SELECT * FROM packages.regional_packages WHERE id = $1 FOR UPDATE', [id]);
  if (!p) throw falla('Ese paquete no existe', 404);
  return p;
}

const desactualizado = () =>
  falla('Este paquete quedó desactualizado: cambiaron los centroides, el umbral OSR, la Ficha, los morfos, los clústeres o las especies desde que se compiló. Compila una versión nueva.', 409);

/** POST /api/dataset/releases/:id/aprobaciones { tipo: 'cientifica' | 'tecnica' } */
async function aprobar(pool, id, tipo, account, userId) {
  if (!TIPOS[tipo]) throw falla('tipo: "cientifica" o "tecnica"');
  if (!puede(account, TIPOS[tipo])) throw falla(`Falta el permiso "${TIPOS[tipo]}"`, 403);
  const cuenta = String(account.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await bloquear(client, id);
    if (p.estado !== 'borrador') throw falla(`Este paquete ya está ${p.estado}: no admite más aprobaciones.`, 409);
    const { rows: previas } = await client.query('SELECT tipo, cuenta FROM packages.aprobacion WHERE paquete_id = $1', [id]);
    if (previas.some((a) => a.cuenta === cuenta)) {
      throw falla('Esta cuenta ya aprobó este paquete. La otra aprobación la da otra cuenta del panel.', 409);
    }
    if (previas.some((a) => a.tipo === tipo)) throw falla(`El paquete ya tiene la aprobación ${TIPO_LABEL[tipo]}.`, 409);
    if ((await validacion.evaluar(client, p.subregion_id)).huella !== p.huella) throw desactualizado();

    await client.query(
      'INSERT INTO packages.aprobacion (paquete_id, tipo, cuenta, nombre, usuario) VALUES ($1, $2, $3, $4, $5)',
      [id, tipo, cuenta, account.name || null, userId]);
    const completo = previas.length + 1 === Object.keys(TIPOS).length;
    if (completo) await client.query("UPDATE packages.regional_packages SET estado = 'aprobado' WHERE id = $1", [id]);
    await auditar(client, userId, 'dataset.paquete.aprobado', id, {
      paquete: p.region_id, version: p.version, tipo, cuenta, estado: completo ? 'aprobado' : 'borrador',
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw falla('Esta cuenta ya aprobó este paquete. La otra aprobación la da otra cuenta del panel.', 409);
    throw err;
  } finally {
    client.release();
  }
  return uno(pool, id);
}

/** POST /api/dataset/releases/:id/publicar — pasa a ser lo que la app descarga para esa subregión. */
async function publicar(pool, id, account, userId) {
  const client = await pool.connect();
  let reemplazado = null;
  try {
    await client.query('BEGIN');
    const p = await bloquear(client, id);
    if (p.estado === 'publicado') throw falla('Este paquete ya está publicado.', 409);
    if (p.estado === 'retirado') throw falla('Este paquete fue retirado. Compila una versión nueva.', 409);
    const { rows: [ap] } = await client.query(
      'SELECT COUNT(*)::int AS n, COUNT(DISTINCT cuenta)::int AS cuentas FROM packages.aprobacion WHERE paquete_id = $1', [id]);
    if (p.estado !== 'aprobado' || ap.n < 2 || ap.cuentas < 2) {
      throw falla('Publicar exige dos aprobaciones, científica y técnica, de dos cuentas del panel distintas.', 409);
    }
    const v = await validacion.evaluar(client, p.subregion_id);
    if (!v.lista) throw falla('La subregión dejó de estar lista para compilar.', 409, { motivos: v.motivos });
    if (v.huella !== p.huella) throw desactualizado();

    const { rows: [prev] } = await client.query(`
      UPDATE packages.regional_packages SET estado = 'retirado', is_published = FALSE, retirado = NOW()
      WHERE region_id = $1 AND estado = 'publicado' RETURNING id, version`, [p.region_id]);
    reemplazado = prev || null;
    await client.query(`
      UPDATE packages.regional_packages
      SET estado = 'publicado', is_published = TRUE, published_at = NOW(), publicado_por = $2, publicado_nombre = $3
      WHERE id = $1`, [id, userId, account.name || null]);
    if (prev) {
      await auditar(client, userId, 'dataset.paquete.retirado', prev.id, { paquete: p.region_id, version: prev.version, reemplazado_por: p.version });
    }
    await auditar(client, userId, 'dataset.paquete.publicado', id, {
      paquete: p.region_id, version: p.version, sha256: p.sha256, reemplaza: prev ? prev.version : null,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { ...(await uno(pool, id)), reemplazado };
}

module.exports = { listar, compilar, aprobar, publicar, paqueteIdDe, TIPOS };
