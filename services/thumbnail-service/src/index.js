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

app.get('/api/thumbnail/:size/:filename', async (req, res) => {
  const { size, filename } = req.params;
  const targetWidth = SIZES[size] || SIZES.medium;
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

    const thumbBuffer = await sharp(sourceBuffer)
      .resize(targetWidth, targetWidth, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    fs.writeFileSync(localThumbPath, thumbBuffer);

    res.set('Content-Type', 'image/jpeg');
    res.send(thumbBuffer);
  } catch (err) {
    console.error('Thumbnail Processing Error:', err);
    res.status(500).send('Error processing image');
  }
});

app.listen(port, () => console.log(`Thumbnail Service on :${port}`));
