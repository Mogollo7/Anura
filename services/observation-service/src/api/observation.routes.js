const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { createClient, commandOptions } = require('redis');
const pool = require('../config/database');
const authMiddleware = require('./auth.middleware');

// Redis Client Configuration
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.error('Could not connect to Redis', err);
  }
})();

// Configuración de almacenamiento local
const uploadDir = path.join(__dirname, '../../uploads');
const thumbnailDir = path.join(uploadDir, 'thumbnails');

// Crear directorios si no existen
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(thumbnailDir)) fs.mkdirSync(thumbnailDir, { recursive: true });

const storage = multer.memoryStorage();

// Una imagen por petición y con tope (el mismo de nginx, 25 MB): sin límite, cada subida vive entera en memoria.
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
const uploadObservation = multer({ storage, limits: { fileSize: 25 * 1024 * 1024, files: 8 } });

function parseObservationUploads(req, res, next) {
  uploadObservation.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 8 }])(req, res, (err) => {
    if (!err) return next();
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ message: status === 413 ? 'Una foto supera el límite de 25 MB' : 'No se pudieron leer las fotos enviadas' });
  });
}

function galeriaDe(req) {
  const files = req.files || {};
  return [...(files.image || []), ...(files.images || [])];
}

async function respuestaSubida(observationId) {
  const { rows: [observation] } = await pool.query(
    'SELECT id, image_key, thumbnail_key FROM observations.observations WHERE id = $1', [observationId]);
  if (!observation) return null;
  const { rows } = await pool.query(`
    SELECT image_key, thumbnail_key FROM observations.observation_media
    WHERE observation_id = $1 ORDER BY position`, [observationId]);
  const photos = rows.length ? rows : [{ image_key: observation.image_key, thumbnail_key: observation.thumbnail_key }];
  const url = (size, key) => `/api/explorer/thumbnail/${size}/${encodeURIComponent(String(key || '').split('/').pop())}`;
  return {
    message: 'Observación guardada correctamente',
    observation_id: observation.id,
    image_url: url('original', observation.image_key),
    thumbnail_url: url('medium', observation.thumbnail_key),
    photos: photos.map((photo) => ({
      image_url: url('original', photo.image_key),
      thumbnail_url: url('medium', photo.thumbnail_key),
    })),
  };
}

async function borrarObjetos(minioClient, bucket, assets) {
  await Promise.all(assets.flatMap((asset) => [asset.imageFilename, asset.thumbnailFilename].map(async (name) => {
    if (!name) return;
    await minioClient.removeObject(bucket, name).catch(() => {});
  })));
}

function createMinioClient() {
  const Minio = require('minio');
  const port = parseInt(String(process.env.MINIO_PORT || '9000'), 10);
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: Number.isFinite(port) ? port : 9000,
    useSSL: String(process.env.MINIO_USE_SSL || '').toLowerCase() === 'true',
    accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD || 'change_me',
  });
}

async function ensureMinioBucket(client, bucket) {
  const exists = await client.bucketExists(bucket);
  if (!exists) await client.makeBucket(bucket, 'us-east-1');
}

// Centralized thumbnail handling moved to thumbnail-service

// POST /api/observations/stash — la web y la app no lo usan hoy. Exige sesión: abierto a cualquiera,
// cada llamada escribía un archivo en disco que nunca se borraba (el TTL de una hora es solo de Redis).
router.post('/stash', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se envió ninguna imagen' });
    }

    const filename = `${uuidv4()}.webp`;
    const filePath = path.join(uploadDir, filename);
    await sharp(req.file.buffer).webp({ quality: 80 }).toFile(filePath);

    const stashId = uuidv4();
    const { lat, lon, notes, is_private, ai_top_class, ai_top_prob, ai_location_used } = req.body;

    const stashData = {
      filename: filename,
      lat: lat || null,
      lon: lon || null,
      notes: notes || '',
      is_private: is_private === 'true' || is_private === true,
      ai_top_class: ai_top_class || null,
      ai_top_prob: ai_top_prob || null,
      ai_location_used: ai_location_used === 'true' || ai_location_used === true
    };

    // Guardar metadatos en Redis (TTL 1 hora)
    await redisClient.set(`stash:${stashId}`, JSON.stringify(stashData), {
      EX: 3600
    });

    res.json({ stash_id: stashId });
  } catch (err) {
    console.error('Error stashing observation:', err);
    res.status(500).json({ message: 'Error al temporalizar la observación' });
  }
});

// POST /api/observations/claim (For Logged-in users after guest redirect)
router.post('/claim', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { stash_id } = req.body;
    const userId = req.user.id;

    if (!stash_id) {
      return res.status(400).json({ message: 'ID de temporalización faltante' });
    }

    const rawData = await redisClient.get(`stash:${stash_id}`);
    if (!rawData) {
      return res.status(404).json({ message: 'La observación temporal ha expirado o no existe' });
    }

    const data = JSON.parse(rawData);
    const imageFilename = data.filename;
    const filePath = path.join(uploadDir, imageFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'El archivo de imagen ya no existe' });
    }

    const thumbnailFilename = `thumb_${imageFilename}`;
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
    
    // Generar thumbnail si no existe
    let thumbBuffer;
    if (fs.existsSync(thumbnailPath)) {
      thumbBuffer = fs.readFileSync(thumbnailPath);
    } else {
      thumbBuffer = await sharp(filePath)
        .resize(300, 300, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
      fs.writeFileSync(thumbnailPath, thumbBuffer);
    }

    await client.query('BEGIN');

    // Fetch altitude & place_guess
    let altitude = null;
    let place_guess = null;
    if (data.lat && data.lon) {
      try {
        const geoUrl = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';
        const geoRes = await fetch(`${geoUrl}/api/geo/altitude?lat=${data.lat}&lon=${data.lon}`);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          altitude = geoData.altitude_m;
        }

        const revRes = await fetch(`${geoUrl}/api/geo/geocoding/reverse?lat=${data.lat}&lon=${data.lon}`);
        if (revRes.ok) {
          const revData = await revRes.json();
          place_guess = revData.display_name;
        }
      } catch (err) {
        console.warn('Could not fetch geo metadata:', err.message);
      }
    }

    const imageKey = `uploads/${imageFilename}`;
    const thumbnailKey = `thumbnails/${thumbnailFilename}`;

    // Subir a MinIO
    try {
      const minioClient = createMinioClient();
      await ensureMinioBucket(minioClient, process.env.MINIO_BUCKET || 'anura-images');
      await minioClient.putObject(process.env.MINIO_BUCKET || 'anura-images', imageFilename, fs.readFileSync(filePath));
      await minioClient.putObject(process.env.MINIO_BUCKET || 'anura-images', thumbnailFilename, thumbBuffer);
    } catch (minioErr) {
      console.error('[minio] Claim fail:', minioErr.message);
    }

    const obsQuery = `
      INSERT INTO observations.observations 
        (user_id, image_key, thumbnail_key, thumbnail_blob, lat, lon, altitude_m, place_guess, notes, status, is_private, recorded_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'synced', $10, NOW())
      RETURNING id
    `;
    const obsRes = await client.query(obsQuery, [
      userId, imageKey, thumbnailKey, thumbBuffer,
      data.lat ? parseFloat(data.lat) : null,
      data.lon ? parseFloat(data.lon) : null,
      altitude,
      place_guess,
      data.notes || null,
      data.is_private === true || data.is_private === 'true'
    ]);
    const observationId = obsRes.rows[0].id;

    // Insertar Predicción
    if (data.ai_top_class) {
      const predQuery = `
        INSERT INTO ai.predictions 
          (observation_id, model_version, top_class, top_probability, location_used)
        VALUES ($1, $2, $3, $4, $5)
      `;
      await client.query(predQuery, [
        observationId, 'bioclip-2.5-vith14', data.ai_top_class,
        parseFloat(data.ai_top_prob), data.ai_location_used
      ]);
    }

    await client.query('COMMIT');
    await redisClient.del(`stash:${stash_id}`);

    res.status(201).json({ message: 'Observación reclamada y guardada correctamente', id: observationId });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error claiming observation:', err);
    res.status(500).json({ message: 'Error interno al reclamar observación' });
  } finally {
    client.release();
  }
});
router.post('/', authMiddleware, parseObservationUploads, async (req, res) => {
  const client = await pool.connect();
  const assets = [];
  let minioClient = null;
  let transaction = false;
  let committed = false;
  const BUCKET = process.env.MINIO_BUCKET || 'anura-images';
  try {
    const { lat, lon, notes, is_private, ai_top_class, ai_top_prob, ai_location_used, client_id, recorded_at } = req.body;
    const userId = req.user.id;
    const clientId = typeof client_id === 'string' ? client_id.trim() : '';
    const files = galeriaDe(req);

    if (!files.length) {
      return res.status(400).json({ message: 'No se envió ninguna imagen' });
    }
    if (files.length > 8) return res.status(400).json({ message: 'Una observación admite hasta 8 fotos' });
    if (clientId && (clientId.length > 80 || clientId.length === 0)) {
      return res.status(400).json({ message: 'client_id inválido' });
    }

    if (clientId) {
      const { rows: [existing] } = await client.query(
        'SELECT id FROM observations.observations WHERE user_id = $1 AND client_id = $2', [userId, clientId]);
      if (existing) return res.status(200).json(await respuestaSubida(existing.id));
    }

    for (const [position, file] of files.entries()) {
      const imageBuffer = await sharp(file.buffer).rotate().webp({ quality: 80 }).toBuffer();
      const thumbBuffer = await sharp(imageBuffer).resize(300, 300, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
      const imageFilename = `${uuidv4()}.webp`;
      const thumbnailFilename = `thumb_${imageFilename}`;
      const filePath = path.join(uploadDir, imageFilename);
      const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
      await fs.promises.writeFile(filePath, imageBuffer);
      await fs.promises.writeFile(thumbnailPath, thumbBuffer);
      assets.push({
        position,
        imageFilename,
        thumbnailFilename,
        imageKey: `uploads/${imageFilename}`,
        thumbnailKey: `thumbnails/${thumbnailFilename}`,
        imageBuffer,
        thumbBuffer,
        filePath,
        thumbnailPath,
      });
    }

    minioClient = createMinioClient();
    try {
      await ensureMinioBucket(minioClient, BUCKET);
      for (const asset of assets) {
        await minioClient.putObject(BUCKET, asset.imageFilename, asset.imageBuffer, asset.imageBuffer.length, { 'Content-Type': 'image/webp' });
        await minioClient.putObject(BUCKET, asset.thumbnailFilename, asset.thumbBuffer, asset.thumbBuffer.length, { 'Content-Type': 'image/webp' });
        await redisClient.set(`thumb:${asset.thumbnailFilename}`, asset.thumbBuffer, { EX: 3600 * 24 }).catch(() => {});
      }
    } catch (minioErr) {
      throw Object.assign(new Error(`No se pudieron guardar todas las fotos en MinIO: ${minioErr.message}`), { status: 503 });
    }

    // Fetch altitude & weather & place_guess from Geo Service
    let altitude = null;
    let place_guess = null;
    const parsedLat = lat == null || lat === '' ? null : Number(lat);
    const parsedLon = lon == null || lon === '' ? null : Number(lon);
    if ((parsedLat == null) !== (parsedLon == null) || (parsedLat != null && !Number.isFinite(parsedLat)) || (parsedLon != null && !Number.isFinite(parsedLon))) {
      throw Object.assign(new Error('Coordenadas inválidas'), { status: 400 });
    }
    if (parsedLat != null && parsedLon != null) {
      try {
        const geoUrl = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';
        const geoRes = await fetch(`${geoUrl}/api/geo/altitude?lat=${parsedLat}&lon=${parsedLon}`);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          altitude = geoData.altitude_m;
        }

        const revRes = await fetch(`${geoUrl}/api/geo/geocoding/reverse?lat=${parsedLat}&lon=${parsedLon}`);
        if (revRes.ok) {
          const revData = await revRes.json();
          place_guess = revData.display_name;
        }
      } catch (err) {
        console.warn('Could not fetch geo metadata from geo-service:', err.message);
      }
    }

    // Insertar Observación
    const obsQuery = `
      INSERT INTO observations.observations 
        (user_id, image_key, thumbnail_key, thumbnail_blob, lat, lon, altitude_m, place_guess, notes, status, is_private, recorded_at, client_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'synced', $10, COALESCE($11::timestamptz, NOW()), $12)
      ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
      RETURNING id
    `;
    const obsValues = [
      userId,
      assets[0].imageKey,
      assets[0].thumbnailKey,
      assets[0].thumbBuffer,
      parsedLat,
      parsedLon,
      altitude,
      place_guess,
      notes || null,
      is_private === 'true' || is_private === true || is_private === 'private',
      recorded_at || null,
      clientId || null,
    ];
    await client.query('BEGIN');
    transaction = true;
    const obsRes = await client.query(obsQuery, obsValues);
    if (!obsRes.rows[0]) {
      await client.query('ROLLBACK');
      transaction = false;
      await borrarObjetos(minioClient, BUCKET, assets);
      assets.forEach((asset) => { fs.rmSync(asset.filePath, { force: true }); fs.rmSync(asset.thumbnailPath, { force: true }); });
      const { rows: [existing] } = await client.query(
        'SELECT id FROM observations.observations WHERE user_id = $1 AND client_id = $2', [userId, clientId]);
      if (!existing) throw new Error('No se pudo confirmar la observación idempotente');
      return res.status(200).json(await respuestaSubida(existing.id));
    }
    const observationId = obsRes.rows[0].id;
    transaction = true;

    for (const asset of assets) {
      await client.query(`
        INSERT INTO observations.observation_media
          (observation_id, client_media_id, position, image_key, thumbnail_key)
        VALUES ($1, $2, $3, $4, $5)`, [
        observationId,
        clientId ? `${clientId}:${asset.position}` : uuidv4(),
        asset.position,
        asset.imageKey,
        asset.thumbnailKey,
      ]);
    }

    // Insertar Predicción
    if (ai_top_class && ai_top_prob != null && Number.isFinite(Number(ai_top_prob))) {
      const predQuery = `
        INSERT INTO ai.predictions 
          (observation_id, model_version, top_class, top_probability, location_used)
        VALUES ($1, $2, $3, $4, $5)
      `;
      const predValues = [
        observationId,
        'bioclip-2.5-vith14',
        ai_top_class,
        parseFloat(ai_top_prob),
        ai_location_used === 'true' || ai_location_used === true
      ];
      await client.query(predQuery, predValues);
    }

    await client.query('COMMIT');
    transaction = false;
    committed = true;
    res.status(201).json(await respuestaSubida(observationId));

  } catch (err) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    if (!committed && minioClient) await borrarObjetos(minioClient, BUCKET, assets);
    if (!committed) assets.forEach((asset) => { fs.rmSync(asset.filePath, { force: true }); fs.rmSync(asset.thumbnailPath, { force: true }); });
    console.error('Error saving observation:', err);
    res.status(err.status || 500).json({ message: err.message || 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /api/observations (Explorer/Feed)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT o.id, o.image_key, o.thumbnail_key, o.lat, o.lon, o.notes, o.is_private, o.created_at,
             u.username, u.profile_image,
             p.top_class as ai_class, p.top_probability as ai_prob
      FROM observations.observations o
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      WHERE (o.is_private = FALSE OR o.is_private IS NOT TRUE)
      ORDER BY o.created_at DESC
      LIMIT 50
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching observations:', err);
    res.status(500).json({ message: 'Error fetching observations' });
  }
});

// PUT /api/observations/:id (Update observation details)
router.put('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const observationId = req.params.id;
    const userId = req.user.id;
    const { lat, lon, notes, is_private } = req.body;

    const checkQuery = 'SELECT user_id FROM observations.observations WHERE id = $1';
    const checkRes = await client.query(checkQuery, [observationId]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ message: 'Observación no encontrada' });
    }

    const obsOwnerId = checkRes.rows[0].user_id;
    if (obsOwnerId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'No tienes permiso para editar esta observación' });
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (notes !== undefined) {
      updates.push(`notes = $${idx}`);
      params.push(notes || null);
      idx += 1;
    }

    if (is_private !== undefined) {
      updates.push(`is_private = $${idx}`);
      params.push(is_private === true || is_private === 'true' || is_private === 'private');
      idx += 1;
    }

    let parsedLat = null;
    let parsedLon = null;
    const latProvided = lat !== undefined && lat !== null && String(lat).trim() !== '';
    const lonProvided = lon !== undefined && lon !== null && String(lon).trim() !== '';

    if (latProvided && lonProvided) {
      parsedLat = parseFloat(lat);
      parsedLon = parseFloat(lon);
      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
        return res.status(400).json({ message: 'Coordenadas inválidas' });
      }
      updates.push(`lat = $${idx}`);
      params.push(parsedLat);
      idx += 1;

      updates.push(`lon = $${idx}`);
      params.push(parsedLon);
      idx += 1;

      try {
        const geoUrl = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';
        const geoRes = await fetch(`${geoUrl}/api/geo/altitude?lat=${parsedLat}&lon=${parsedLon}`);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.altitude_m != null && !Number.isNaN(Number(geoData.altitude_m))) {
            updates.push(`altitude_m = $${idx}`);
            params.push(parseFloat(geoData.altitude_m));
            idx += 1;
          }
        }
        const revRes = await fetch(`${geoUrl}/api/geo/geocoding/reverse?lat=${parsedLat}&lon=${parsedLon}`);
        if (revRes.ok) {
          const revData = await revRes.json();
          if (revData.display_name) {
            updates.push(`place_guess = $${idx}`);
            params.push(revData.display_name);
            idx += 1;
          }
        }
      } catch (geoErr) {
        console.warn('Could not backfill geo metadata while updating observation:', geoErr.message);
      }
    } else if (latProvided || lonProvided) {
      return res.status(400).json({ message: 'Se requieren ambas coordenadas latitud y longitud' });
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar' });
    }

    const updateQuery = `UPDATE observations.observations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    params.push(observationId);

    const updateRes = await client.query(updateQuery, params);
    res.json({ message: 'Observación actualizada', observation: updateRes.rows[0] });
  } catch (err) {
    console.error('Error updating observation:', err);
    res.status(500).json({ message: 'Error interno al actualizar la observación' });
  } finally {
    client.release();
  }
});

// DELETE /api/observations/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const observationId = req.params.id;
    const userId = req.user.id;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(observationId)) {
      return res.status(400).json({ message: 'ID de observación inválido' });
    }

    // 1. Verificar que la observación pertenezca al usuario o que sea admin
    const checkQuery = 'SELECT user_id, image_key, thumbnail_key FROM observations.observations WHERE id = $1';
    const checkRes = await client.query(checkQuery, [observationId]);
    if (checkRes.rowCount === 0) {
      return res.status(404).json({ message: 'Observación no encontrada' });
    }

    const obs = checkRes.rows[0];
    if (obs.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'No tienes permiso para eliminar esta observación' });
    }

    const { rows: media } = await client.query(
      'SELECT image_key, thumbnail_key FROM observations.observation_media WHERE observation_id = $1',
      [observationId],
    );
    const allMedia = media.length ? media : [obs];

    await client.query('BEGIN');

    // 2. Eliminar predicciones asociadas de la base de datos
    await client.query('DELETE FROM ai.predictions WHERE observation_id = $1', [observationId]);

    // 3. Eliminar la observación de la base de datos
    await client.query('DELETE FROM observations.observations WHERE id = $1', [observationId]);

    await client.query('COMMIT');

    // 4. Intentar eliminar los archivos de MinIO
    try {
      const minioClient = createMinioClient();
      const BUCKET = process.env.MINIO_BUCKET || 'anura-images';
      
      await Promise.all(allMedia.flatMap((item) => [item.image_key, item.thumbnail_key].map(async (key) => {
        if (key) await minioClient.removeObject(BUCKET, key.split('/').pop());
      })));
    } catch (minioErr) {
      console.warn('No se pudo borrar el objeto de MinIO:', minioErr.message);
    }

    // 5. Intentar eliminar los archivos locales del disco
    try {
      allMedia.forEach((item) => {
        if (item.image_key) fs.rmSync(path.join(uploadDir, item.image_key.split('/').pop()), { force: true });
        if (item.thumbnail_key) fs.rmSync(path.join(thumbnailDir, item.thumbnail_key.split('/').pop()), { force: true });
      });
    } catch (fsErr) {
      console.warn('No se pudo borrar el archivo local:', fsErr.message);
    }

    // 6. Borrar de Redis
    try {
      await Promise.all(allMedia.map((item) => item.thumbnail_key && redisClient.del(`thumb:${item.thumbnail_key.split('/').pop()}`)));
    } catch (redisErr) {
      console.warn('No se pudo borrar el thumbnail de Redis:', redisErr.message);
    }

    res.json({ message: 'Observación eliminada correctamente' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting observation:', err);
    res.status(500).json({ message: 'Error interno al eliminar la observación' });
  } finally {
    client.release();
  }
});

// ── Comentarios (Fase 14) ──────────────────────────────────────────────────
// GET /api/observations/:id/comments — lista con hilos (una capa de respuestas), público.
router.get('/:id/comments', async (req, res) => {
  try {
    const query = `
      SELECT c.id, c.observation_id, c.parent_id, c.body, c.stance,
             c.taxon_proposal_scientific_name, c.taxon_proposal_common_name, c.created_at,
             u.id as author_id, u.username as author_username, u.profile_image as author_profile_image
      FROM observations.comments c
      JOIN auth.users u ON u.id = c.author_id
      WHERE c.observation_id = $1
      ORDER BY c.created_at ASC
    `;
    const result = await pool.query(query, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ message: 'Error al leer los comentarios' });
  }
});

// POST /api/observations/:id/comments — {body, stance?, parentId?, taxonProposal?:{scientificName,commonName}}
router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { body, stance, parentId, taxonProposal } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ message: 'El comentario no puede estar vacío' });
    }
    const validStances = ['agree', 'neutral', 'disagree'];
    const finalStance = validStances.includes(stance) ? stance : 'neutral';
    const insertQuery = `
      INSERT INTO observations.comments
        (observation_id, author_id, parent_id, body, stance, taxon_proposal_scientific_name, taxon_proposal_common_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, observation_id, parent_id, body, stance, taxon_proposal_scientific_name, taxon_proposal_common_name, created_at
    `;
    const result = await pool.query(insertQuery, [
      req.params.id,
      req.user.id,
      parentId || null,
      body.trim(),
      finalStance,
      taxonProposal?.scientificName || null,
      taxonProposal?.commonName || null,
    ]);
    res.status(201).json({
      ...result.rows[0],
      author_id: req.user.id,
      author_username: req.user.username,
      author_profile_image: null,
    });
  } catch (err) {
    console.error('Error posting comment:', err);
    res.status(500).json({ message: 'Error al guardar el comentario' });
  }
});

module.exports = router;
