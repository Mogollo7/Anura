const Minio = require('minio');
const fs = require('fs');
const path = require('path');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER || 'admin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'password123'
});

const BUCKET = process.env.MINIO_BUCKET || 'anura-images';
const UPLOADS_DIR = '/app/uploads'; // Path inside container

async function migrate() {
  try {
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) await minioClient.makeBucket(BUCKET);
    console.log(`Starting migration to bucket: ${BUCKET}`);

    const files = fs.readdirSync(UPLOADS_DIR);
    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      if (fs.lstatSync(filePath).isFile()) {
        console.log(`Migrating ${file}...`);
        await minioClient.fPutObject(BUCKET, file, filePath);
      }
    }

    // Thumbnails
    const thumbDir = path.join(UPLOADS_DIR, 'thumbnails');
    if (fs.existsSync(thumbDir)) {
      const thumbFiles = fs.readdirSync(thumbDir);
      for (const file of thumbFiles) {
        const filePath = path.join(thumbDir, file);
        if (fs.lstatSync(filePath).isFile()) {
          console.log(`Migrating thumbnail ${file}...`);
          await minioClient.fPutObject(BUCKET, file, filePath);
        }
      }
    }

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

migrate();
