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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({ storage });

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

// POST /api/observations/stash (For Guests)
router.post('/stash', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se envió ninguna imagen' });
    }

    const stashId = uuidv4();
    const { lat, lon, notes, ai_top_class, ai_top_prob, ai_location_used } = req.body;

    const stashData = {
      filename: req.file.filename,
      lat: lat || null,
      lon: lon || null,
      notes: notes || '',
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
        (user_id, image_key, thumbnail_key, thumbnail_blob, lat, lon, altitude_m, place_guess, notes, status, recorded_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
      RETURNING id
    `;
    const obsRes = await client.query(obsQuery, [
      userId, imageKey, thumbnailKey, thumbBuffer,
      data.lat ? parseFloat(data.lat) : null,
      data.lon ? parseFloat(data.lon) : null,
      altitude,
      place_guess,
      data.notes || null
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
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { lat, lon, notes, ai_top_class, ai_top_prob, ai_location_used } = req.body;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: 'No se envió ninguna imagen' });
    }

    const imageFilename = req.file.filename;
    const thumbnailFilename = `thumb_${imageFilename}`;
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

    // Generar thumbnail
    const thumbBuffer = await sharp(req.file.path)
      .resize(300, 300, { fit: 'cover' })
      .toBuffer();

    // Guardar en disco
    fs.writeFileSync(thumbnailPath, thumbBuffer);

    // Guardar en Redis
    try {
      await redisClient.set(`thumb:${thumbnailFilename}`, thumbBuffer, {
        EX: 3600 * 24 // 24 hours
      });
    } catch (redisErr) {
      console.error('Error saving thumbnail to Redis:', redisErr);
    }

    await client.query('BEGIN');

    // Fetch altitude & weather & place_guess from Geo Service
    let altitude = null;
    let place_guess = null;
    if (lat && lon) {
      try {
        const geoUrl = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';
        const geoRes = await fetch(`${geoUrl}/api/geo/altitude?lat=${lat}&lon=${lon}`);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          altitude = geoData.altitude_m;
        }

        const revRes = await fetch(`${geoUrl}/api/geo/geocoding/reverse?lat=${lat}&lon=${lon}`);
        if (revRes.ok) {
          const revData = await revRes.json();
          place_guess = revData.display_name;
        }
      } catch (err) {
        console.warn('Could not fetch geo metadata from geo-service:', err.message);
      }
    }

    const imageKey = `uploads/${imageFilename}`;
    const thumbnailKey = `thumbnails/${thumbnailFilename}`;

    // Réplica en MinIO (objeto = nombre de fichero, igual que en disco)
    const BUCKET = process.env.MINIO_BUCKET || 'anura-images';
    try {
      const minioClient = createMinioClient();
      await ensureMinioBucket(minioClient, BUCKET);
      await minioClient.putObject(BUCKET, imageFilename, fs.readFileSync(req.file.path));
      await minioClient.putObject(BUCKET, thumbnailFilename, thumbBuffer);
      console.log(`[minio] OK ${imageFilename}, ${thumbnailFilename}`);
    } catch (minioErr) {
      console.error('[minio] Subida fallida (se mantiene disco + DB):', minioErr.message);
    }

    // Insertar Observación
    const obsQuery = `
      INSERT INTO observations.observations 
        (user_id, image_key, thumbnail_key, thumbnail_blob, lat, lon, altitude_m, place_guess, notes, status, recorded_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
      RETURNING id
    `;
    const obsValues = [
      userId,
      imageKey,
      thumbnailKey,
      thumbBuffer,
      lat ? parseFloat(lat) : null,
      lon ? parseFloat(lon) : null,
      altitude,
      place_guess,
      notes || null
    ];
    const obsRes = await client.query(obsQuery, obsValues);
    const observationId = obsRes.rows[0].id;

    // Insertar Predicción
    if (ai_top_class && ai_top_prob) {
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
    
    res.status(201).json({
      message: 'Observación guardada correctamente',
      observation_id: observationId,
      image_url: `/api/explorer/thumbnail/large/${imageFilename}`,
      thumbnail_url: `/api/explorer/thumbnail/medium/${thumbnailFilename}`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving observation:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /api/observations (Explorer/Feed)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT o.id, o.image_key, o.thumbnail_key, o.lat, o.lon, o.notes, o.created_at,
             u.username, u.profile_image,
             p.top_class as ai_class, p.top_probability as ai_prob
      FROM observations.observations o
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
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

module.exports = router;
