/**
 * Migra imágenes de perfil locales (bytea en BD y/o ficheros bajo uploads/) al bucket MinIO.
 * Clave de objeto = último segmento de profile_image (ej. profile_xxx.jpg), igual que en runtime.
 *
 * Local:   DATABASE_URL=... MINIO_*=... node src/cli/migrate-profile-images-to-minio.js
 * Docker:  docker compose build auth-service && docker compose run --rm auth-service node src/cli/migrate-profile-images-to-minio.js
 *
 * MIGRATE_PROFILE_MINIO_FORCE=true  → vuelve a subir aunque el objeto ya exista
 * UPLOADS_ROOT=/ruta                → raíz del volumen uploads (defecto: /app/uploads en imagen)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { createMinioClient, ensureBucket, getBucket } = require('../services/minioUpload');

const UPLOADS_ROOT =
  process.env.UPLOADS_ROOT || path.join(__dirname, '../../uploads');
const FORCE = String(process.env.MIGRATE_PROFILE_MINIO_FORCE || '').toLowerCase() === 'true';

async function hasProfileImageBlobColumn(pool) {
  const r = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'profile_image_blob'
    LIMIT 1
  `);
  return r.rows.length > 0;
}

function bufferFromBlob(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(value);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bucket = getBucket();
  const minio = createMinioClient();
  await ensureBucket(minio, bucket);

  const blobCol = await hasProfileImageBlobColumn(pool);
  const sql = blobCol
    ? `SELECT id, email, profile_image, profile_image_blob
       FROM auth.users
       WHERE profile_image IS NOT NULL AND btrim(profile_image) <> ''`
    : `SELECT id, email, profile_image, NULL::bytea AS profile_image_blob
       FROM auth.users
       WHERE profile_image IS NOT NULL AND btrim(profile_image) <> ''`;

  const { rows } = await pool.query(sql);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const pi = String(row.profile_image).trim();
    if (/^https?:\/\//i.test(pi)) {
      console.log(`[omitir] ${row.email || row.id}: URL externa`);
      skipped += 1;
      continue;
    }

    const parts = pi.split('/').filter(Boolean);
    const key = parts.pop();
    if (!key) {
      console.warn(`[fallo] ${row.id}: ruta de perfil vacía`);
      failed += 1;
      continue;
    }

    if (!FORCE) {
      try {
        await minio.statObject(bucket, key);
        console.log(`[omitir] ${key}: ya en MinIO`);
        skipped += 1;
        continue;
      } catch {
        /* no existe, seguimos */
      }
    }

    let buf = bufferFromBlob(row.profile_image_blob);
    if (!buf?.length && pi.startsWith('/uploads/')) {
      const rel = pi.replace(/^\/uploads\/?/, '');
      const full = path.join(UPLOADS_ROOT, rel);
      if (fs.existsSync(full)) {
        buf = fs.readFileSync(full);
      }
    }

    if (!buf?.length) {
      console.warn(`[fallo] ${row.email || row.id}: sin blob ni fichero (${pi})`);
      failed += 1;
      continue;
    }

    try {
      await minio.putObject(bucket, key, buf);
      console.log(`[ok] ${key} (${buf.length} bytes)`);
      ok += 1;
    } catch (err) {
      console.error(`[fallo] ${key}:`, err.message);
      failed += 1;
    }
  }

  console.log(`\nResumen: subidas=${ok} omitidas=${skipped} fallidas=${failed} total_filas=${rows.length}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
