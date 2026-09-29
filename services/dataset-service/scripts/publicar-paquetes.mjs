/**
 * CLI del mismo compilador que usa Admin → Release (src/release.js + src/paqueteSqlite.js).
 * Antes este script copiaba a mano el sqlite empaquetado en el APK; ahora el paquete se compila
 * desde la base y se publica desde el Admin. Aquí solo se puede validar y compilar un borrador:
 * aprobar y publicar exigen dos cuentas del panel distintas y se hacen en el Admin.
 *
 *   node scripts/publicar-paquetes.mjs validar  <subregion_id>
 *   node scripts/publicar-paquetes.mjs compilar <subregion_id> <user_id_del_panel>
 *
 * Variables: DATABASE_URL, MINIO_ENDPOINT, MINIO_PORT, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD,
 * DATASET_BUCKET (las mismas de dataset-service).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const Minio = require('minio');
const validacion = require('../src/validacionTecnica.js');
const release = require('../src/release.js');

const [accion, subregion, userId] = process.argv.slice(2);
const subregionId = Number(subregion);
if (!['validar', 'compilar'].includes(accion) || !Number.isInteger(subregionId) || (accion === 'compilar' && !userId)) {
  console.error('Uso: publicar-paquetes.mjs validar <subregion_id> | compilar <subregion_id> <user_id>');
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (accion === 'validar') {
    const v = await validacion.evaluar(pool, subregionId);
    console.log(v.lista ? `${v.subregion.nombre}: lista para compilar` : `${v.subregion.nombre}: no está lista`);
    for (const m of v.motivos) console.log(`  - ${m.texto} (${m.pantalla})`);
    for (const a of v.avisos) console.log(`  · ${a.texto}`);
    process.exitCode = v.lista ? 0 : 1;
  } else {
    const minio = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: Number(process.env.MINIO_PORT) || 9000,
      useSSL: false,
      accessKey: process.env.MINIO_ROOT_USER,
      secretKey: process.env.MINIO_ROOT_PASSWORD,
      region: 'us-east-1',
    });
    const cuenta = { id: `cli:${userId}`, name: 'Línea de comandos', isSuperAdmin: false, permissions: {} };
    const p = await release.compilar({ pool, minio, bucket: process.env.DATASET_BUCKET || 'anura-dataset' }, subregionId, cuenta, userId);
    console.log(`borrador ${p.paquete_id} v${p.version}: ${p.especies} especies, ${p.size_bytes} bytes, sha256 ${p.sha256}`);
  }
} catch (err) {
  console.error(err.message);
  for (const m of err.motivos || []) console.error(`  - ${m.texto} (${m.pantalla})`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
