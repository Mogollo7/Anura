const fs = require('fs');
const Minio = require('minio');

function createMinioClient() {
  const port = parseInt(String(process.env.MINIO_PORT || '9000'), 10);
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: Number.isFinite(port) ? port : 9000,
    useSSL: String(process.env.MINIO_USE_SSL || '').toLowerCase() === 'true',
    accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD || 'change_me',
  });
}

async function ensureBucket(client, bucket) {
  const exists = await client.bucketExists(bucket);
  if (!exists) await client.makeBucket(bucket, 'us-east-1');
}

function getBucket() {
  return process.env.MINIO_BUCKET || 'anura-images';
}

/** Replica la imagen de perfil en MinIO (misma clave que el nombre de fichero, como observation-service). */
async function uploadProfileImage(localPath, filename) {
  const bucket = getBucket();
  const client = createMinioClient();
  await ensureBucket(client, bucket);
  await client.putObject(bucket, filename, fs.readFileSync(localPath));
}

module.exports = {
  createMinioClient,
  ensureBucket,
  getBucket,
  uploadProfileImage,
};
