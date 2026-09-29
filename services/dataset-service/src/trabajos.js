/**
 * Trabajos del worker (M2). model-service vive en el PC con GPU y no recibe conexiones: él
 * PIDE trabajo a este servicio por HTTP (token X-Worker-Token), baja las fotos por aquí (MinIO
 * no se expone) y devuelve los vectores. Sirve igual por LAN que detrás de un túnel.
 *
 * Qué falta procesar se calcula siempre desde la base ("fotos sin embedding para este
 * encoder"), no se lleva en memoria: si el worker se cae a la mitad, al volver sigue donde iba.
 */
const crypto = require('crypto');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';
// Sin latido en este tiempo, un trabajo "en curso" se considera abandonado y otro worker lo retoma.
const LATIDO_VENCIDO_S = 120;
// El worker pide trabajo cada 15 s: sin contacto en 60 s, el Admin lo muestra desconectado.
const WORKER_VIVO_S = 60;
const DIM = 512;

function requireWorker(req, res, next) {
  const enviado = Buffer.from(req.headers['x-worker-token'] || '');
  const esperado = Buffer.from(WORKER_TOKEN);
  if (!WORKER_TOKEN || enviado.length !== esperado.length || !crypto.timingSafeEqual(enviado, esperado)) {
    return res.status(401).json({ message: 'Falta el token del worker o no coincide' });
  }
  req.worker = String(req.headers['x-worker-name'] || 'worker').slice(0, 80);
  next();
}

const auditar = require('./audit').auditorDe('trabajo');

// ── Lado del worker ─────────────────────────────────────────────────────────────────────

/** El worker declara su encoder al arrancar (EMBEDDING_CONTRACT.md) y queda visto. */
async function registrarEncoder(pool, worker, body) {
  const c = body?.contrato || {};
  if (!/^[0-9a-f]{64}$/.test(c.encoder_sha256 || '')) throw falla('Falta contrato.encoder_sha256');
  if (c.embedding_dimension !== DIM) throw falla(`Este servidor guarda vectores de ${DIM}; el encoder declara ${c.embedding_dimension}`);
  await pool.query(`
    INSERT INTO dataset.encoder (sha256, nombre, archivo, dimension, preprocesado, normalizacion, contrato)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (sha256) DO NOTHING`,
    [c.encoder_sha256, c.encoder_id, c.onnx_export, c.embedding_dimension, c.preprocessing_version, c.normalization_version, c]);
  await pool.query(`
    INSERT INTO dataset.worker (nombre, encoder_sha256, info, visto) VALUES ($1, $2, $3, NOW())
    ON CONFLICT (nombre) DO UPDATE SET encoder_sha256 = EXCLUDED.encoder_sha256, info = EXCLUDED.info, visto = NOW()`,
    [worker, c.encoder_sha256, body.info || {}]);
}

/** Toma el trabajo pendiente más viejo, o retoma uno en curso cuyo worker dejó de latir. */
async function tomar(pool, worker) {
  await pool.query('UPDATE dataset.worker SET visto = NOW() WHERE nombre = $1', [worker]);
  const { rows: [t] } = await pool.query(`
    UPDATE dataset.trabajo SET estado = 'en_curso', worker = $1, latido = NOW(),
      empezado = COALESCE(empezado, NOW()), mensaje = 'Tomado por ' || $1
    WHERE id = (
      SELECT id FROM dataset.trabajo
      WHERE estado = 'pendiente'
         OR (estado = 'en_curso' AND (worker = $1 OR latido < NOW() - make_interval(secs => $2)))
      ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id, tipo, parametros`, [worker, LATIDO_VENCIDO_S]);
  return t || null;
}

async function trabajoActivo(pool, id, worker) {
  const { rows: [t] } = await pool.query('SELECT * FROM dataset.trabajo WHERE id = $1', [id]);
  if (!t) throw falla('El trabajo no existe', 404);
  if (t.worker !== worker) throw falla('Este trabajo lo tiene otro worker', 409);
  return t;
}

/** Siguiente lote: fotos sin vector de este encoder que no fallaron ya en este trabajo. */
async function lote(pool, id, worker, limit) {
  const t = await trabajoActivo(pool, id, worker);
  if (t.estado !== 'en_curso') return { estado: t.estado, fotos: [] };
  // parametros.especie_id (opcional) acota el trabajo a una especie; sin él, todas las fotos.
  const { rows } = await pool.query(`
    SELECT f.sha256 FROM dataset.foto f
    WHERE NOT EXISTS (SELECT 1 FROM dataset.embedding e WHERE e.sha256 = f.sha256 AND e.encoder_sha256 = $2)
      AND NOT EXISTS (SELECT 1 FROM dataset.trabajo_error x WHERE x.trabajo_id = $1 AND x.sha256 = f.sha256)
      AND ($4::int IS NULL OR f.especie_id = $4)
    ORDER BY f.sha256 LIMIT $3`,
    [id, t.parametros.encoder_sha256, Math.min(Math.max(limit, 1), 256), t.parametros.especie_id ?? null]);
  return { estado: t.estado, fotos: rows.map((r) => r.sha256) };
}

/** float32 little-endian en base64 → literal de pgvector "[a,b,…]", validando forma y norma. */
function vectorDe(b64) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== DIM * 4) throw falla(`Vector de ${buf.length / 4} dimensiones; se esperaban ${DIM}`);
  const v = new Float32Array(buf.buffer, buf.byteOffset, DIM);
  let norma = 0;
  for (const x of v) {
    if (!Number.isFinite(x)) throw falla('Vector con NaN o infinito');
    norma += x * x;
  }
  if (Math.abs(Math.sqrt(norma) - 1) > 1e-3) throw falla('El vector no está normalizado (L2)');
  return `[${Array.from(v).join(',')}]`;
}

async function guardarVectores(pool, id, worker, body) {
  const t = await trabajoActivo(pool, id, worker);
  if (t.estado !== 'en_curso') return { estado: t.estado };
  const vectores = Array.isArray(body?.vectores) ? body.vectores : [];
  const errores = Array.isArray(body?.errores) ? body.errores : [];
  const filas = vectores.map((x) => ({ sha256: x.sha256, vector: vectorDe(x.v) }));
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rowCount: nuevos } = await db.query(`
      INSERT INTO dataset.embedding (sha256, encoder_sha256, vector, trabajo_id)
      SELECT x.sha256, $2, x.vector::vector, $1
      FROM jsonb_to_recordset($3::jsonb) AS x(sha256 char(64), vector text)
      ON CONFLICT (sha256, encoder_sha256) DO NOTHING`, [id, t.parametros.encoder_sha256, JSON.stringify(filas)]);
    const { rowCount: fallidos } = await db.query(`
      INSERT INTO dataset.trabajo_error (trabajo_id, sha256, error)
      SELECT $1, x.sha256, left(x.error, 500) FROM jsonb_to_recordset($2::jsonb) AS x(sha256 char(64), error text)
      ON CONFLICT DO NOTHING`, [id, JSON.stringify(errores)]);
    const { rows: [u] } = await db.query(`
      UPDATE dataset.trabajo SET hechos = hechos + $2, fallidos = fallidos + $3, latido = NOW(), mensaje = $4
      WHERE id = $1 RETURNING estado, hechos, fallidos, total`,
      [id, nuevos, fallidos, body?.mensaje ? String(body.mensaje).slice(0, 300) : null]);
    // Cada lote cuenta como contacto: sin esto el Admin lo mostraba "sin contacto" mientras trabajaba.
    await db.query('UPDATE dataset.worker SET visto = NOW() WHERE nombre = $1', [worker]);
    await db.query('COMMIT');
    return u;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

/** Latido: mantiene el trabajo y le dice al worker si alguien lo canceló desde el Admin. */
async function latido(pool, id, worker, mensaje) {
  await trabajoActivo(pool, id, worker);
  const { rows: [t] } = await pool.query(`
    UPDATE dataset.trabajo SET latido = NOW(), mensaje = COALESCE($2, mensaje) WHERE id = $1 RETURNING estado`,
    [id, mensaje ? String(mensaje).slice(0, 300) : null]);
  await pool.query('UPDATE dataset.worker SET visto = NOW() WHERE nombre = $1', [worker]);
  return t;
}

async function terminar(pool, id, worker, { estado, mensaje }) {
  if (!['hecho', 'fallido'].includes(estado)) throw falla('estado debe ser hecho o fallido');
  await trabajoActivo(pool, id, worker);
  const { rows: [t] } = await pool.query(`
    UPDATE dataset.trabajo SET estado = $2, terminado = NOW(), latido = NOW(), mensaje = $3
    WHERE id = $1 AND estado = 'en_curso' RETURNING estado`, [id, estado, mensaje ? String(mensaje).slice(0, 500) : null]);
  return t || { estado: 'cancelado' };
}

/** Bytes de la foto desde MinIO (red interna). */
async function foto(pool, minio, bucket, sha) {
  const { rows: [f] } = await pool.query('SELECT object_key FROM dataset.foto WHERE sha256 = $1', [sha]);
  if (!f) throw falla('La foto no existe', 404);
  return minio.getObject(bucket, f.object_key);
}

// ── Lado del Admin ──────────────────────────────────────────────────────────────────────

const HISTORIAL = 50;

async function estado(pool) {
  const { rows: trabajos } = await pool.query(`
    SELECT t.id, t.tipo, t.estado, t.parametros, t.total, t.hechos, t.fallidos, t.worker, t.mensaje, t.latido,
           t.creado, t.empezado, t.terminado, es.nombre_cientifico AS especie,
           EXTRACT(EPOCH FROM (NOW() - t.latido))::int AS segundos_sin_latido
    FROM dataset.trabajo t
    LEFT JOIN dataset.especie es ON es.id = (t.parametros->>'especie_id')::int
    ORDER BY t.id DESC LIMIT $1`, [HISTORIAL]);
  const { rows: workers } = await pool.query(`
    SELECT w.nombre, w.encoder_sha256, w.info, w.visto, EXTRACT(EPOCH FROM (NOW() - w.visto))::int AS segundos_sin_ver,
           (SELECT t.id FROM dataset.trabajo t WHERE t.worker = w.nombre AND t.estado = 'en_curso' ORDER BY t.id DESC LIMIT 1)
             AS trabajo_en_curso
    FROM dataset.worker w ORDER BY w.visto DESC`);
  const { rows: encoders } = await pool.query(`
    SELECT e.sha256, e.nombre, e.archivo, e.dimension, e.preprocesado, e.normalizacion, e.registrado,
           (SELECT COUNT(*)::int FROM dataset.embedding m WHERE m.encoder_sha256 = e.sha256) AS vectores
    FROM dataset.encoder e ORDER BY e.registrado`);
  const { rows: [{ fotos }] } = await pool.query('SELECT COUNT(*)::int AS fotos FROM dataset.foto');
  const { rows: [{ total: historial }] } = await pool.query('SELECT COUNT(*)::int AS total FROM dataset.trabajo');
  return { trabajos, workers, encoders, fotos, historial, latido_vencido_s: LATIDO_VENCIDO_S, worker_vivo_s: WORKER_VIVO_S };
}

/** Fotos que el worker no pudo procesar en un trabajo (foto dañada, formato raro…). */
async function errores(pool, id, limit = 100) {
  const { rows: [t] } = await pool.query('SELECT id FROM dataset.trabajo WHERE id = $1', [id]);
  if (!t) throw falla('El trabajo no existe', 404);
  const { rows } = await pool.query(`
    SELECT x.sha256, x.error, x.creado, f.archivo_original, es.nombre_cientifico AS especie
    FROM dataset.trabajo_error x
    LEFT JOIN dataset.foto f ON f.sha256 = x.sha256
    LEFT JOIN dataset.especie es ON es.id = f.especie_id
    WHERE x.trabajo_id = $1 ORDER BY x.creado, x.sha256 LIMIT $2`, [id, Math.min(Math.max(limit, 1), 500)]);
  const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int AS n FROM dataset.trabajo_error WHERE trabajo_id = $1', [id]);
  return { errores: rows, total: n };
}

/**
 * Un trabajo de embeddings calcula las fotos que aún no tienen vector con ese encoder: todas, o
 * solo las de una especie (especie_id). Uno a la vez por encoder: dos trabajos pedirían las
 * mismas fotos.
 */
async function crear(pool, body, userId) {
  const { rows: encoders } = await pool.query('SELECT sha256 FROM dataset.encoder ORDER BY registrado DESC');
  const encoder = body?.encoder_sha256 || encoders[0]?.sha256;
  if (!encoder) throw falla('Ningún worker ha registrado un encoder todavía: arranca model-service primero');
  if (!encoders.some((e) => e.sha256 === encoder)) throw falla('Ese encoder no está registrado');
  let especie = null;
  if (body?.especie_id != null && body.especie_id !== '') {
    const { rows: [e] } = await pool.query('SELECT id, nombre_cientifico FROM dataset.especie WHERE id = $1', [Number(body.especie_id)]);
    if (!e) throw falla('Esa especie no existe en el dataset', 404);
    especie = e;
  }
  const { rows: activo } = await pool.query(
    "SELECT id FROM dataset.trabajo WHERE estado IN ('pendiente', 'en_curso') AND parametros->>'encoder_sha256' = $1", [encoder]);
  if (activo.length) throw falla(`Ya hay un trabajo de embeddings en marcha con este encoder (#${activo[0].id}). Espera a que termine o cancélalo.`, 409);
  const { rows: [{ faltan }] } = await pool.query(`
    SELECT COUNT(*)::int AS faltan FROM dataset.foto f
    WHERE NOT EXISTS (SELECT 1 FROM dataset.embedding e WHERE e.sha256 = f.sha256 AND e.encoder_sha256 = $1)
      AND ($2::int IS NULL OR f.especie_id = $2)`, [encoder, especie?.id ?? null]);
  if (!faltan) {
    throw falla(especie
      ? `Todas las fotos de ${especie.nombre_cientifico} ya tienen vector con este encoder`
      : 'Todas las fotos ya tienen vector con este encoder', 409);
  }
  const parametros = especie ? { encoder_sha256: encoder, especie_id: especie.id } : { encoder_sha256: encoder };
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [t] } = await db.query(`
      INSERT INTO dataset.trabajo (tipo, parametros, total, creado_por, mensaje)
      VALUES ('embeddings', $1, $2, $3, 'Esperando a que un worker lo tome') RETURNING id`,
      [parametros, faltan, userId]);
    await auditar(db, userId, 'dataset.trabajo.creado', t.id, { tipo: 'embeddings', ...parametros, total: faltan });
    await db.query('COMMIT');
    return { id: Number(t.id), total: faltan };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

async function cancelar(pool, id, userId) {
  const { rows: [t] } = await pool.query(`
    UPDATE dataset.trabajo SET estado = 'cancelado', terminado = NOW(), mensaje = 'Cancelado desde el Admin'
    WHERE id = $1 AND estado IN ('pendiente', 'en_curso') RETURNING id, hechos`, [id]);
  if (!t) throw falla('Ese trabajo ya terminó o no existe');
  await auditar(pool, userId, 'dataset.trabajo.cancelado', id, { hechos: t.hechos });
  return { ok: true };
}

module.exports = { requireWorker, registrarEncoder, tomar, lote, guardarVectores, latido, terminar, foto, estado, errores, crear, cancelar };
