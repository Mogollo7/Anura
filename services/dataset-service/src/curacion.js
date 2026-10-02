/**
 * Curación en el servidor (Admin → Curación): subir una foto a mano con su coordenada,
 * excluir o reincluir una foto, invalidar o revertir una observación.
 * También expone borrarTodasLasFotos, que elimina permanentemente todas las fotos de
 * una especie (BD + MinIO) cuando se va a borrar la especie del catálogo.
 */
const crypto = require('crypto');
const sharp = require('sharp');

const falla = (mensaje, status = 400, extra = {}) => Object.assign(new Error(mensaje), { status, ...extra });
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const GEO_SERVICE_URL = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';

const LICENCIAS = ['cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nd', 'cc-by-nc-nd', 'all-rights-reserved'];
const FORMATOS = ['jpeg', 'png', 'webp'];

const auditar = require('./audit').registrar;
const altitud = require('./altitud');

/** Pregunta a geo-service en qué departamento cae el punto (límites DANE, sin red externa). */
async function ubicar(lat, lon) {
  let res;
  try {
    res = await fetch(`${GEO_SERVICE_URL}/api/geo/ubicacion?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw falla('No se pudo validar la coordenada: geo-service no responde. Revisa que esté corriendo.', 502);
  }
  if (!res.ok) throw falla('geo-service no aceptó la coordenada', 400);
  return res.json();
}

function coordenada(latitud, longitud) {
  // Coma decimal aceptada: "6,25" es como se escribe en Colombia.
  const lat = Number(String(latitud).trim().replace(',', '.'));
  const lon = Number(String(longitud).trim().replace(',', '.'));
  if (latitud === undefined || latitud === '' || longitud === undefined || longitud === '') {
    throw falla('Falta la coordenada: escríbela o usa la del EXIF de la foto');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw falla('Coordenada inválida: la latitud va de -90 a 90 y la longitud de -180 a 180, en grados decimales');
  }
  return [lat, lon];
}

/**
 * POST /api/dataset/especies/:id/fotos (multipart). Igual que el importador: la foto se
 * recodifica a JPEG 95 (sin metadatos, así el GPS no viaja en el archivo), la clave de MinIO
 * es el sha256 del JPEG limpio y sha256_origen el del archivo subido.
 */
async function subirFoto({ pool, minio, bucket }, especieId, archivo, campos, userId) {
  if (!archivo) throw falla('Falta la foto');
  const { rows: [especie] } = await pool.query('SELECT id, taxon_id FROM dataset.especie WHERE id = $1', [especieId]);
  if (!especie) throw falla('La especie no existe en el dataset', 404);

  const [lat, lon] = coordenada(campos.latitud, campos.longitud);
  const fuente = campos.coordenada_fuente === 'exif' ? 'exif' : 'manual';
  const incertidumbre = campos.incertidumbre_m ? Number(campos.incertidumbre_m) : null;
  if (incertidumbre !== null && !(incertidumbre > 0)) throw falla('La precisión debe ser un número de metros mayor que 0');
  const fecha = campos.observada_en || null;
  if (fecha && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || new Date(fecha) > new Date())) {
    throw falla('Fecha de observación inválida o en el futuro');
  }
  if (!LICENCIAS.includes(campos.licencia)) throw falla('Elige la licencia de la foto');
  const atribucion = String(campos.atribucion || '').trim();
  if (!atribucion) throw falla('Escribe el autor de la foto (va en la atribución)');
  if (atribucion.length > 200) throw falla('La atribución no puede pasar de 200 caracteres');

  const ubicacion = await ubicar(lat, lon);
  if (!ubicacion.en_colombia && campos.confirmar_fuera_de_colombia !== 'true') {
    const c = ubicacion.cercano;
    throw falla(`La coordenada cae fuera de Colombia (a ${c.distancia_km.toLocaleString('es-CO')} km de ${c.departamento}).`,
      422, { codigo: 'fuera_de_colombia', ubicacion });
  }

  // Altitud de la coordenada (geo-service). Si no responde, la subida sigue y "Calcular altitudes" la llena luego.
  const alt = await altitud.alCrear(lat, lon);

  let meta;
  try {
    meta = await sharp(archivo.buffer).metadata();
  } catch {
    throw falla('No se pudo leer la imagen. Sube un JPG, PNG o WebP.');
  }
  if (!FORMATOS.includes(meta.format)) throw falla(`Formato no admitido (${meta.format}). Sube un JPG, PNG o WebP.`);

  const origen = sha256(archivo.buffer);
  const { data: jpeg, info } = await sharp(archivo.buffer).rotate().jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true });
  const hash = sha256(jpeg);
  const { rows: dup } = await pool.query(
    // También si suben el JPEG limpio tal cual lo sirve MinIO (su hash es el sha256 de la fila).
    'SELECT sha256 FROM dataset.foto WHERE sha256 IN ($1, $2) OR sha256_origen = $2 LIMIT 1', [hash, origen]);
  if (dup.length) throw falla('Esta foto ya está en el dataset', 409);

  const objectKey = `fotos/${hash.slice(0, 2)}/${hash}.jpg`;
  await minio.putObject(bucket, objectKey, jpeg, jpeg.length, { 'Content-Type': 'image/jpeg' });

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [obs] } = await db.query(`
      INSERT INTO dataset.observacion (fuente, latitud, longitud, incertidumbre_m, coordenada_fuente, lugar,
        departamento, observada_en, limpieza_metodo, altitud_m, altitud_lat, altitud_lon, altitud_fuente, altitud_calculada)
      VALUES ('manual', $1, $2, $3, $4, $5, $6, $7, 'pendiente_de_limpieza', $8, $9, $10, $11, $12) RETURNING id`,
      [lat, lon, incertidumbre, fuente, ubicacion.departamento ? `${ubicacion.departamento}, Colombia` : null,
        ubicacion.departamento, fecha, alt.altitud_m, alt.altitud_m === null ? null : lat, alt.altitud_m === null ? null : lon,
        alt.fuente, alt.altitud_m === null ? null : new Date()]);
    await db.query(`
      INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, ancho, alto, bytes,
        licencia, atribucion, estado, sha256_origen, subida_por)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [hash, objectKey, especie.id, obs.id, String(archivo.originalname || 'subida').slice(0, 255), info.width, info.height,
        jpeg.length, campos.licencia, atribucion, especie.taxon_id ? 'catalogo' : 'fuera_de_catalogo', origen, userId]);
    await auditar(db, userId, 'dataset.foto.subida', 'foto', hash,
      { especie_id: especie.id, observacion_id: obs.id, coordenada_fuente: fuente, departamento: ubicacion.departamento,
        fuera_de_colombia: !ubicacion.en_colombia, licencia: campos.licencia });
    await db.query('COMMIT');
    return { sha256: hash, observacion_id: Number(obs.id), departamento: ubicacion.departamento, ancho: info.width, alto: info.height };
  } catch (err) {
    await db.query('ROLLBACK');
    await minio.removeObject(bucket, objectKey).catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

async function excluirFoto(pool, sha, motivo, userId) {
  motivo = String(motivo || '').trim();
  if (!motivo) throw falla('Escribe por qué se excluye la foto');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [foto] } = await db.query('SELECT sha256 FROM dataset.foto WHERE sha256 = $1 FOR UPDATE', [sha]);
    if (!foto) throw falla('La foto no existe', 404);
    const { rows: activa } = await db.query(
      'SELECT motivo FROM dataset.exclusion WHERE sha256 = $1 AND revertida IS NULL LIMIT 1', [sha]);
    if (activa.length) throw falla(`La foto ya está excluida: ${activa[0].motivo}`);
    await db.query(`INSERT INTO dataset.exclusion (sha256, motivo, por, origen) VALUES ($1, $2, $3, 'curacion')`, [sha, motivo, userId]);
    await auditar(db, userId, 'dataset.foto.exclusion', 'foto', sha, { motivo });
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

/** Solo revierte exclusiones hechas en Curación; las de Calidad o de una observación invalidada, no. */
async function reincluirFoto(pool, sha, userId) {
  const { rows: activas } = await pool.query(
    'SELECT id, origen FROM dataset.exclusion WHERE sha256 = $1 AND revertida IS NULL', [sha]);
  if (!activas.length) throw falla('La foto no está excluida');
  if (activas.some((x) => x.origen === 'observacion_invalidada')) {
    throw falla('La foto está fuera porque su observación fue invalidada: revierte la invalidación');
  }
  if (activas.some((x) => x.origen !== 'curacion')) {
    throw falla('Esta exclusión se decidió en Calidad (licencia); se cambia allá, no en Curación');
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`UPDATE dataset.exclusion SET revertida = NOW() WHERE sha256 = $1 AND revertida IS NULL AND origen = 'curacion'`, [sha]);
    await auditar(db, userId, 'dataset.foto.reinclusion', 'foto', sha, {});
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

/**
 * Invalidar = la observación completa no sirve (duplicado de otro individuo, fecha o lugar
 * inconsistentes…): excluye todas sus fotos del entrenamiento y la saca de las capas
 * geográficas. Guarda lo limpio de antes para que revertir no pierda lo decidido en Calidad.
 */
async function invalidarObservacion(pool, obsId, motivo, userId) {
  motivo = String(motivo || '').trim();
  if (!motivo) throw falla('Elige el motivo de la invalidación');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [obs] } = await db.query('SELECT * FROM dataset.observacion WHERE id = $1 FOR UPDATE', [obsId]);
    if (!obs) throw falla('La observación no existe', 404);
    if (obs.invalidada_en) throw falla(`La observación ya está invalidada: ${obs.invalidada_motivo}`);
    const previo = { latitud_limpia: obs.latitud_limpia, longitud_limpia: obs.longitud_limpia,
      uso_geografico: obs.uso_geografico, limpieza_metodo: obs.limpieza_metodo };
    await db.query(`UPDATE dataset.observacion SET invalidada_motivo = $2, invalidada_por = $3, invalidada_en = NOW(),
      invalidada_previo = $4, latitud_limpia = NULL, longitud_limpia = NULL, uso_geografico = 'excluida',
      limpieza_metodo = 'observacion_invalidada' WHERE id = $1`, [obsId, motivo, userId, previo]);
    // Una fila por foto aunque ya estuviera excluida por otra razón: así reincluirla desde
    // Curación queda bloqueado mientras la observación siga invalidada, y revertir la
    // invalidación no deshace una exclusión que se hizo aparte.
    const { rowCount: fotos } = await db.query(`
      INSERT INTO dataset.exclusion (sha256, motivo, por, origen, observacion_id)
      SELECT f.sha256, $2, $3, 'observacion_invalidada', $1 FROM dataset.foto f
      WHERE f.observacion_id = $1`,
      [obsId, `observación invalidada: ${motivo}`, userId]);
    // Sus hallazgos pendientes ya no tienen nada que decidir.
    await db.query(`DELETE FROM dataset.hallazgo WHERE estado = 'pendiente'
      AND (observacion_id = $1 OR sha256 IN (SELECT sha256 FROM dataset.foto WHERE observacion_id = $1))`, [obsId]);
    await auditar(db, userId, 'dataset.observacion.invalidacion', 'observacion', obsId, { motivo, fotos_excluidas: fotos });
    await db.query('COMMIT');
    return { fotos_excluidas: fotos };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

async function revertirInvalidacion(pool, obsId, userId) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [obs] } = await db.query('SELECT * FROM dataset.observacion WHERE id = $1 FOR UPDATE', [obsId]);
    if (!obs) throw falla('La observación no existe', 404);
    if (!obs.invalidada_en) throw falla('La observación no está invalidada');
    const p = obs.invalidada_previo || {};
    await db.query(`UPDATE dataset.observacion SET invalidada_motivo = NULL, invalidada_por = NULL, invalidada_en = NULL,
      invalidada_previo = NULL, latitud_limpia = $2, longitud_limpia = $3, uso_geografico = $4, limpieza_metodo = $5
      WHERE id = $1`, [obsId, p.latitud_limpia ?? null, p.longitud_limpia ?? null, p.uso_geografico ?? null,
      p.limpieza_metodo ?? 'pendiente_de_limpieza']);
    await db.query(`UPDATE dataset.exclusion SET revertida = NOW()
      WHERE observacion_id = $1 AND origen = 'observacion_invalidada' AND revertida IS NULL`, [obsId]);
    // Solo cuentan las que de verdad vuelven: una excluida aparte en Curación sigue fuera.
    const { rows: [{ fotos }] } = await db.query(`SELECT COUNT(*)::int AS fotos FROM dataset.foto f
      WHERE f.observacion_id = $1
        AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = f.sha256 AND x.revertida IS NULL)`, [obsId]);
    await auditar(db, userId, 'dataset.observacion.reversion', 'observacion', obsId, { motivo_anterior: obs.invalidada_motivo, fotos_reincluidas: fotos });
    await db.query('COMMIT');
    return { fotos_reincluidas: fotos };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}


/**
 * Borra permanentemente TODAS las fotos de una especie: primero las filas de dataset.foto
 * (y en cascada sus exclusiones y versiones), luego los objetos de MinIO. Se registra en
 * auditoría. Solo usar cuando la intención es borrar la especie entera.
 *
 * Las observaciones de tipo 'inaturalist' (fuente = iNaturalist) NO se borran: son del
 * importador y pueden compartirse con otras fotos. Las observaciones huérfanas de tipo
 * 'manual' (subidas a mano) SÍ se borran porque no tienen otro propietario.
 */
async function borrarTodasLasFotos({ pool, minio, bucket }, especieId, userId) {
  if (!Number.isInteger(especieId)) throw falla('La especie no existe', 404);
  const db = await pool.connect();
  let objectKeys = [];
  let totalFotos = 0;
  let obsManualBorradas = 0;
  try {
    await db.query('BEGIN');
    const { rows: [e] } = await db.query(
      'SELECT id, nombre_cientifico FROM dataset.especie WHERE id = $1 FOR UPDATE', [especieId]);
    if (!e) throw falla('La especie no existe', 404);

    // Recoge las object_keys antes de borrar.
    const { rows: fotas } = await db.query(
      'SELECT sha256, object_key, observacion_id FROM dataset.foto WHERE especie_id = $1', [especieId]);
    totalFotos = fotas.length;
    objectKeys = fotas.map((f) => f.object_key).filter(Boolean);

    // IDs de observaciones 'manual' (subidas a mano) que solo tienen fotos de esta especie.
    const obsManualIds = [...new Set(fotas.map((f) => f.observacion_id).filter(Boolean))];
    if (obsManualIds.length) {
      // Borra solo las observaciones cuyo fuente = 'manual' y cuyas fotos son todas de esta especie.
      const { rowCount } = await db.query(
        `DELETE FROM dataset.observacion
         WHERE id = ANY($1::int[])
           AND fuente = 'manual'
           AND NOT EXISTS (
             SELECT 1 FROM dataset.foto f2
             WHERE f2.observacion_id = dataset.observacion.id
               AND f2.especie_id <> $2
           )`,
        [obsManualIds, especieId]);
      obsManualBorradas = rowCount;
    }

    // Las filas de dataset.foto tienen ON DELETE CASCADE hacia dataset.exclusion,
    // dataset.embedding y dataset.version_foto, así que basta con borrar foto.
    await db.query('DELETE FROM dataset.foto WHERE especie_id = $1', [especieId]);

    await auditar(db, userId, 'dataset.especie.fotos_borradas', 'especie', especieId, {
      nombre_cientifico: e.nombre_cientifico,
      fotos_borradas: totalFotos,
      obs_manual_borradas: obsManualBorradas,
    });
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }

  // Limpieza de MinIO fuera de la transacción: si falla, las filas ya se borraron pero los
  // archivos quedan huérfanos (se pueden limpiar luego con una tarea de mantenimiento).
  let eliminados = 0;
  for (const key of objectKeys) {
    try {
      await minio.removeObject(bucket, key);
      eliminados++;
    } catch {
      // Sin llave = ya no existía o nunca se subió; no es un error fatal.
    }
  }

  return {
    fotos_borradas: totalFotos,
    archivos_eliminados: eliminados,
    obs_manual_borradas: obsManualBorradas,
  };
}

module.exports = { LICENCIAS, ubicar, coordenada, subirFoto, excluirFoto, reincluirFoto, invalidarObservacion, revertirInvalidacion, borrarTodasLasFotos };

