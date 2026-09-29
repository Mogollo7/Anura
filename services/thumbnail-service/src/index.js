const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const Minio = require('minio');

const app = express();
const port = process.env.PORT || 3004;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379' });

function createMinioClient() {
  const p = parseInt(String(process.env.MINIO_PORT || '9000'), 10);
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: Number.isFinite(p) ? p : 9000,
    useSSL: String(process.env.MINIO_USE_SSL || '').toLowerCase() === 'true',
    accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD || 'change_me',
  });
}

const minioClient = createMinioClient();
const BUCKET = process.env.MINIO_BUCKET || 'anura-images';

const THUMBS_DIR = path.join(__dirname, '../../uploads/thumbnails');
const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

(async () => {
  try {
    await redisClient.connect();
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) await minioClient.makeBucket(BUCKET, 'us-east-1');
    console.log(`Thumbnail Service: MinIO bucket "${BUCKET}" listo`);
  } catch (err) {
    console.warn('Thumbnail Service: MinIO no disponible al arranque (se usará disco/DB):', err.message);
  }
})();

const SIZES = { small: 100, medium: 400, large: 1200 };

function readSourceFromDisk(filename) {
  const candidates = [
    path.join(UPLOADS_ROOT, filename),
    path.join(UPLOADS_ROOT, 'thumbnails', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

// Un solo segmento de archivo (uuid.webp, profile_<uuid>.webp…). Express decodifica %2F en los parámetros:
// sin esta comprobación, "x/../../etc/passwd" salía del directorio de miniaturas y res.sendFile lo entregaba.
const NOMBRE_ARCHIVO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

app.get('/api/thumbnail/:size/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!NOMBRE_ARCHIVO.test(filename) || filename.includes('..')) return res.status(400).send('Nombre de archivo inválido');
  // Solo tamaños conocidos; cualquier otro cae en "medium" (como antes) pero ya no entra crudo en la ruta de disco.
  const size = req.params.size === 'original' || Object.hasOwn(SIZES, req.params.size) ? req.params.size : 'medium';
  // "original" es la imagen completa (frontend: getFullImageUrl/hero) — antes caía en
  // SIZES[size] || SIZES.medium y la servía recortada a 400x400 cuadrado como cualquier
  // miniatura, degradando en calidad sin que nadie lo notara (nunca fallaba, solo se veía mal).
  const isOriginal = size === 'original';
  const targetWidth = SIZES[size];
  const localThumbPath = path.join(THUMBS_DIR, `${size}_${filename}`);

  try {
    if (fs.existsSync(localThumbPath)) {
      return res.sendFile(localThumbPath);
    }

    let sourceBuffer = readSourceFromDisk(filename);
    if (sourceBuffer) {
      console.log(`Loaded ${filename} from volumen uploads`);
    }

    if (!sourceBuffer) {
      try {
        const stream = await minioClient.getObject(BUCKET, filename);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        sourceBuffer = Buffer.concat(chunks);
        console.log(`Loaded ${filename} from MinIO`);
      } catch (minioErr) {
        console.log(`MinIO miss ${filename}:`, minioErr.message);
      }
    }

    if (!sourceBuffer) {
      const obsRes = await pool.query(
        'SELECT thumbnail_blob FROM observations.observations WHERE image_key LIKE $1 OR thumbnail_key LIKE $1',
        [`%${filename}`]
      );
      if (obsRes.rows[0]?.thumbnail_blob) {
        sourceBuffer = obsRes.rows[0].thumbnail_blob;
      } else {
        const userRes = await pool.query(
          'SELECT profile_image_blob FROM auth.users WHERE profile_image LIKE $1',
          [`%${filename}`]
        );
        if (userRes.rows[0]?.profile_image_blob) sourceBuffer = userRes.rows[0].profile_image_blob;
      }
    }

    if (!sourceBuffer) return res.status(404).send('Image not found');

    const thumbBuffer = isOriginal
      ? await sharp(sourceBuffer).webp({ quality: 90 }).toBuffer()
      : await sharp(sourceBuffer)
          .resize(targetWidth, targetWidth, { fit: 'cover' })
          .webp({ quality: 80 })
          .toBuffer();

    fs.writeFileSync(localThumbPath, thumbBuffer);

    res.set('Content-Type', 'image/webp');
    res.send(thumbBuffer);
  } catch (err) {
    console.error('Thumbnail Processing Error:', err);
    res.status(500).send('Error processing image');
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'thumbnail-service' }));

app.listen(port, () => console.log(`Thumbnail Service on :${port}`));
