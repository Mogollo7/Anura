/**
 * CLI del paquete anterior (src/legado.js): adapta el paquete que traía el APK antes al formato que arma el
 * compilador del servidor —sin tocar la app ni el original— y lo importa como versión de cada subregión del
 * departamento. Queda auditado (dataset.paquete.importado_legado) y marcado origen = 'legado'.
 *
 *   node scripts/importar-paquete-legado.mjs adaptar  <carpeta_del_paquete_anterior> <salida.sqlite>
 *       Solo genera y valida el sqlite adaptado (no usa base ni MinIO). Sirve para revisarlo antes de importar.
 *   node scripts/importar-paquete-legado.mjs importar <carpeta_del_paquete_anterior> <user_id_del_panel> [--departamento 05]
 *       Sube el sqlite a MinIO (una sola vez) y registra una versión por subregión del departamento:
 *       'publicado' si la subregión aún no tiene una publicada, 'retirado' (restaurable) si ya la tiene.
 *       Repetirlo no duplica nada.
 *
 * La carpeta trae: package.sqlite, openset_*.bin, openset_*.json y allowed_by_package.json.
 * Variables (las mismas de dataset-service): DATABASE_URL, MINIO_ENDPOINT, MINIO_PORT, MINIO_ROOT_USER,
 * MINIO_ROOT_PASSWORD, DATASET_BUCKET.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const legado = require('../src/legado.js');

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  if (i < 0) return null;
  const [valor] = args.splice(i, 2).slice(1);
  return valor ?? null;
};
const departamento = opcion('--departamento');
const [accion, carpeta, tercero] = args;

const usoMal = () => {
  console.error('Uso: importar-paquete-legado.mjs adaptar <carpeta> <salida.sqlite> | importar <carpeta> <user_id> [--departamento 05]');
  process.exit(2);
};
if (!['adaptar', 'importar'].includes(accion) || !carpeta || !tercero) usoMal();

const mb = (n) => `${(n / 1_048_576).toFixed(1)} MB`;

try {
  if (accion === 'adaptar') {
    const art = legado.adaptar(carpeta, { departamentoDane: departamento });
    const medidas = legado.validar(art.sqlite, art.plan);
    fs.writeFileSync(tercero, art.sqlite);
    console.log(`Adaptado: ${tercero} (${mb(art.size_bytes)}) sha256 ${art.sha256}`);
    console.log(`  original sha256 ${art.plan.sqliteSha256}`);
    console.log(`  ${art.resumen.taxa.length} especies (de ${art.plan.totalTaxaOriginal} taxones del original), ${art.resumen.vectores} vectores, ${art.resumen.puntos_ocurrencia} puntos de ocurrencia`);
    console.log(`  modelo de rechazo ${art.resumen.modelo.formato}: ${art.resumen.modelo.especies} especies, τ ${art.resumen.tau}, sha256 ${art.resumen.modelo.sha256.slice(0, 16)}…`);
    console.log(`  comprobado como la app: k-NN propio ${medidas.knn_propio}/${medidas.especies}, Mahalanobis igual al original (dif. máx. ${medidas.mahalanobis_max_dif})`);
    for (const a of art.plan.avisos) console.log(`  · ${a}`);
  } else {
    const { Pool } = require('pg');
    const Minio = require('minio');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const minio = new Minio.Client({
        endPoint: process.env.MINIO_ENDPOINT || 'minio',
        port: Number(process.env.MINIO_PORT) || 9000,
        useSSL: false,
        accessKey: process.env.MINIO_ROOT_USER,
        secretKey: process.env.MINIO_ROOT_PASSWORD,
        region: 'us-east-1',
      });
      const cuenta = { id: `cli:${tercero}`, name: 'Línea de comandos', isSuperAdmin: false, permissions: {} };
      const r = await legado.importar({ pool, minio, bucket: process.env.DATASET_BUCKET || 'anura-dataset' }, carpeta, { userId: tercero, cuenta, departamento });
      console.log(`Importado el paquete anterior de ${r.departamento.nombre} (${r.departamento.codigo_dane}): ${r.especies} especies, ${r.vectores} vectores, ${mb(r.size_bytes)}`);
      console.log(`  sha256 ${r.sha256}`);
      console.log(`  original sha256 ${r.sha256_original}`);
      console.log(`  objeto en MinIO: ${r.storage_key}`);
      for (const s of r.subregiones) console.log(`  ${s.nuevo ? 'registrada' : 'ya estaba'}: ${s.paquete_id} v${s.version} (${s.estado})`);
      if (r.taxon_id_desconocidos.length) console.log(`  aviso: ${r.taxon_id_desconocidos.length} taxon_id del paquete no están en dataset.especie (${r.taxon_id_desconocidos.join(', ')}): la clave «Paso a paso» no tendrá sus datos`);
      for (const a of r.avisos) console.log(`  · ${a}`);
    } finally {
      await pool.end();
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
