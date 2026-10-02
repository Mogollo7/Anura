/**
 * Release (Admin → Resultado → Release): compilar, aprobar y publicar el paquete de una
 * subregión, todo en el servidor.
 *
 * Ciclo (packages.regional_packages, phase18):
 *   borrador  — compilado. Exige validación técnica lista (validacionTecnica.js).
 *   aprobado  — tiene las DOS aprobaciones: científica (permiso aprobarCientifico) y técnica
 *               (permiso publicarPaquete). Las dan dos cuentas del panel distintas; la cuenta SUPER
 *               puede darlas las dos. Quien compila puede dar una. Para una cuenta que no es super
 *               la base impone «una sola aprobación por paquete» con un índice único parcial
 *               (aprobacion_cuenta_no_super_idx, phase23); el tipo es único por la PK.
 *   publicado — lo que la app descarga. Uno por subregión: el anterior pasa a retirado.
 *   retirado  — ya no se entrega, pero su archivo sigue guardado (inmutable y autocontenido): se puede
 *               RESTAURAR (restaurar()), que es el retroceso a una versión anterior. Restaurar no repite las
 *               aprobaciones (ya las tuvo, o es un paquete anterior importado por legado.js).
 * Una versión con origen 'legado' (legado.js) es un paquete anterior ya validado, importado sin pasar por las
 * dos aprobaciones: no deriva del estado actual de la base, así que nunca está «desactualizado».
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
const priors = require('./priors');
const clave = require('./clave');
const { registrar } = require('./audit');

const falla = (mensaje, status = 400, extra = {}) => Object.assign(new Error(mensaje), { status }, extra);
const auditar = (db, userId, action, id, metadata) => registrar(db, userId, action, 'paquete', id, metadata);

const TIPOS = { cientifica: 'aprobarCientifico', tecnica: 'publicarPaquete' };
const TIPO_LABEL = { cientifica: 'científica', tecnica: 'técnica' };
const puede = (account, accion) => account.isSuperAdmin || !!account.permissions?.[accion];

// La regla de las aprobaciones, en las palabras que ve la persona (Admin → Release).
const REGLA_APROBACIONES = 'Publicar necesita dos aprobaciones: científica y técnica. Las dan dos cuentas distintas; una cuenta super puede darlas las dos.';
const misma = (cuentas) => cuentas.length > 0 && new Set(cuentas).size === 1;

const paqueteIdDe = (sub) => `${sub.region}.${sub.clave}`;

const COLUMNAS = `
  p.id, p.region_id AS paquete_id, p.subregion_id, p.version, p.estado, p.sha256, p.size_bytes, p.especies,
  p.encoder_sha256, p.experimento_id, p.osr_umbral_id, p.tau, p.huella, p.manifiesto,
  p.compilado_por, p.compilado_nombre, p.created_at AS compilado, p.publicado_por, p.publicado_nombre,
  p.published_at AS publicado, p.retirado, p.origen,
  COALESCE((SELECT json_agg(json_build_object('tipo', a.tipo, 'cuenta', a.cuenta, 'nombre', a.nombre, 'es_super', a.es_super, 'creado', a.creado)
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
    if ((p.estado === 'borrador' || p.estado === 'aprobado') && p.origen !== 'legado' && p.subregion_id && !huellas.has(p.subregion_id)) {
      huellas.set(p.subregion_id, (await validacion.evaluar(db, p.subregion_id)).huella);
    }
  }
  return {
    paquetes: rows.map((p) => ({
      ...p,
      desactualizado: (p.estado === 'borrador' || p.estado === 'aprobado') && p.origen !== 'legado' && huellas.get(p.subregion_id) !== p.huella,
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
    // Prior de zona y de clima: se sacan del paquete anterior que la app ya tiene (priors.js).
    const prior = await priors.delPaqueteAnterior({ pool, minio, bucket }, v.subregion.region);
    const art = await construir(client, v, { paqueteId, version, generado, priors: prior });
    // La clave del paso a paso queda congelada con las especies y el contexto que entraron a este paquete.
    art.manifiesto.clave = await clave.armarDesde(client, v.subregion.id, art.manifiesto.especies, {
      paquete: { id: paqueteId, version, sha256: art.sha256, estado: 'borrador', origen: 'compilado' },
      subregion: { id: v.subregion.id, nombre: v.subregion.nombre },
    });

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
      priors: art.manifiesto.priors?.origen ? { de: art.manifiesto.priors.origen.paquete_id, zona: art.manifiesto.priors.zona, clima: art.manifiesto.priors.clima } : null,
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

/**
 * Serializa publicar y restaurar dentro de un mismo paquete (subregión): los dos retiran la versión
 * vigente y publican otra, y el índice único regional_packages_publicado_idx no debe llegar a saltar.
 * Tiene que llamarse justo después de BEGIN.
 */
async function bloquearPaquete(client, id) {
  const { rows: [p] } = await client.query('SELECT region_id FROM packages.regional_packages WHERE id = $1', [id]);
  if (!p) throw falla('Ese paquete no existe', 404);
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`publicado:${p.region_id}`]);
}

const desactualizado = () =>
  falla('Este paquete quedó desactualizado: cambiaron los centroides, el umbral OSR, la Ficha, los morfos, los clústeres o las especies desde que se compiló. Compila una versión nueva.', 409);

/** POST /api/dataset/releases/:id/aprobaciones { tipo: 'cientifica' | 'tecnica' } */
async function aprobar(pool, id, tipo, account, userId) {
  if (!TIPOS[tipo]) throw falla('tipo: "cientifica" o "tecnica"');
  if (!puede(account, TIPOS[tipo])) throw falla(`Falta el permiso "${TIPOS[tipo]}"`, 403);
  const cuenta = String(account.id);
  const esSuper = !!account.isSuperAdmin;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await bloquear(client, id);
    if (p.estado !== 'borrador') throw falla(`Este paquete ya está ${p.estado}: no admite más aprobaciones.`, 409);
    const { rows: previas } = await client.query('SELECT tipo, cuenta FROM packages.aprobacion WHERE paquete_id = $1', [id]);
    const yaLaDio = previas.some((a) => a.cuenta === cuenta);
    // Solo la cuenta super puede dar las dos aprobaciones; las demás necesitan otra cuenta para la segunda.
    if (yaLaDio && !esSuper) throw falla(`Esta cuenta ya aprobó este paquete. ${REGLA_APROBACIONES}`, 409);
    if (previas.some((a) => a.tipo === tipo)) throw falla(`El paquete ya tiene la aprobación ${TIPO_LABEL[tipo]}.`, 409);
    if ((await validacion.evaluar(client, p.subregion_id)).huella !== p.huella) throw desactualizado();

    await client.query(
      'INSERT INTO packages.aprobacion (paquete_id, tipo, cuenta, nombre, usuario, es_super) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, tipo, cuenta, account.name || null, userId, esSuper]);
    const completo = previas.length + 1 === Object.keys(TIPOS).length;
    if (completo) await client.query("UPDATE packages.regional_packages SET estado = 'aprobado' WHERE id = $1", [id]);
    await auditar(client, userId, 'dataset.paquete.aprobado', id, {
      paquete: p.region_id, version: p.version, tipo, cuenta, es_super: esSuper, misma_cuenta: yaLaDio,
      estado: completo ? 'aprobado' : 'borrador',
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw err.constraint === 'aprobacion_pkey'
        ? falla(`El paquete ya tiene la aprobación ${TIPO_LABEL[tipo]}.`, 409)
        : falla(`Esta cuenta ya aprobó este paquete. ${REGLA_APROBACIONES}`, 409);
    }
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
    await bloquearPaquete(client, id);
    const p = await bloquear(client, id);
    if (p.estado === 'publicado') throw falla('Este paquete ya está publicado.', 409);
    if (p.estado === 'retirado') throw falla('Esta versión fue retirada. Restáurala para entregarla otra vez o compila una versión nueva.', 409);
    const { rows: aprobaciones } = await client.query('SELECT tipo, cuenta, es_super FROM packages.aprobacion WHERE paquete_id = $1', [id]);
    const cuentas = aprobaciones.map((a) => a.cuenta);
    // Una de cada tipo, de dos cuentas distintas; una sola cuenta solo si es super (y lo era al aprobar).
    const tiposCompletos = new Set(aprobaciones.map((a) => a.tipo)).size === Object.keys(TIPOS).length;
    const cuentasValidas = new Set(cuentas).size >= 2 || (misma(cuentas) && aprobaciones.every((a) => a.es_super));
    if (p.estado !== 'aprobado' || !tiposCompletos || !cuentasValidas) throw falla(REGLA_APROBACIONES, 409);
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
      misma_cuenta: misma(cuentas),
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

/**
 * POST /api/dataset/releases/:id/restaurar — vuelve a entregar una versión retirada (incluida la de un paquete
 * anterior importado): pasa a 'publicado' y la vigente de esa subregión pasa a 'retirado', en una sola
 * transacción. No pide aprobaciones nuevas ni compara con la validación de hoy: el archivo no cambia.
 * Solo se restaura lo retirado; un borrador o aprobado se publica con su flujo.
 */
async function restaurar({ pool, minio, bucket }, id, account, userId) {
  if (!puede(account, 'publicarPaquete')) throw falla('Falta el permiso "publicarPaquete"', 403);
  const previo = await uno(pool, id);
  if (previo.estado === 'publicado') throw falla('Esta versión ya es la que se entrega ahora.', 409);
  if (previo.estado !== 'retirado') {
    throw falla(`Esta versión está ${previo.estado}: solo se restauran las versiones retiradas. Una versión sin publicar se publica con sus dos aprobaciones.`, 409);
  }
  // El objeto es la reversión: si ya no está en el almacenamiento no se puede prometer que la app lo baje.
  const { rows: [obj] } = await pool.query('SELECT storage_key FROM packages.regional_packages WHERE id = $1', [id]);
  try {
    await minio.statObject(bucket, obj.storage_key);
  } catch (err) {
    if (err.code === 'NotFound' || err.code === 'NoSuchKey') throw falla('El archivo de esta versión ya no está guardado en el servidor: no se puede restaurar.', 409);
    throw err;
  }

  const client = await pool.connect();
  let reemplazado = null;
  try {
    await client.query('BEGIN');
    await bloquearPaquete(client, id);
    const p = await bloquear(client, id);
    if (p.estado === 'publicado') throw falla('Esta versión ya es la que se entrega ahora.', 409);
    if (p.estado !== 'retirado') throw falla(`Esta versión está ${p.estado}: solo se restauran las versiones retiradas.`, 409);

    const { rows: [prev] } = await client.query(`
      UPDATE packages.regional_packages SET estado = 'retirado', is_published = FALSE, retirado = NOW()
      WHERE region_id = $1 AND estado = 'publicado' RETURNING id, version, origen`, [p.region_id]);
    reemplazado = prev || null;
    await client.query(`
      UPDATE packages.regional_packages
      SET estado = 'publicado', is_published = TRUE, published_at = NOW(), retirado = NULL, publicado_por = $2, publicado_nombre = $3
      WHERE id = $1`, [id, userId, account.name || null]);
    if (prev) {
      await auditar(client, userId, 'dataset.paquete.retirado', prev.id, {
        paquete: p.region_id, version: prev.version, origen: prev.origen, restaurada: p.version, motivo: 'restauracion',
      });
    }
    await auditar(client, userId, 'dataset.paquete.restaurado', id, {
      paquete: p.region_id, version: p.version, origen: p.origen, sha256: p.sha256,
      de_version: prev ? prev.version : null, a_version: p.version,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw falla('Otra persona publicó una versión de esta subregión al mismo tiempo. Recarga el historial e inténtalo de nuevo.', 409);
    throw err;
  } finally {
    client.release();
  }
  return { ...(await uno(pool, id)), reemplazado };
}

module.exports = { listar, compilar, aprobar, publicar, restaurar, paqueteIdDe, TIPOS };
