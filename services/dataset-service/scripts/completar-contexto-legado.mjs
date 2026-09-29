/**
 * Completa el contexto del paquete anterior (origen = 'legado') con la altitud REAL de los registros de
 * Antioquia (GBIF + iNaturalist, campo elevation_m de records_v1.csv). La clave de «Paso a paso»
 * (src/clave.js) lee la altitud de cada especie de `manifiesto.especies[].contexto`; el paquete importado
 * lo trae vacío, y sin altitud la clave no tiene ninguna pregunta que hacer.
 *
 *   node scripts/completar-contexto-legado.mjs revisar <registros.csv>
 *       Solo muestra, por especie, cuántos registros con elevación hay y el rango p5–p95. No escribe nada.
 *   node scripts/completar-contexto-legado.mjs aplicar <registros.csv> <user_id_del_panel> [--min 5]
 *       Guarda `contexto.altitud = {min, max, n, origen: 'registros', fuente}` en el manifiesto de cada
 *       versión legada (columna `manifiesto` y su paquete.json en MinIO) y lo deja en audit.log.
 *       Repetirlo da el mismo resultado. No toca el sqlite del paquete (su sha256 no cambia).
 *
 * Una especie con menos de --min registros con elevación (5 por defecto, la misma regla de la Ficha técnica)
 * queda sin altitud: no se inventa. Se descartan elevaciones imposibles para Antioquia (< -10 m o > 4.600 m).
 * Variables (las de dataset-service): DATABASE_URL, MINIO_ENDPOINT, MINIO_PORT, MINIO_ROOT_USER,
 * MINIO_ROOT_PASSWORD, DATASET_BUCKET.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { percentil } = require('../src/ficha.js');
const { registrar } = require('../src/audit.js');

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  if (i < 0) return null;
  return args.splice(i, 2)[1] ?? null;
};
const minimo = Number(opcion('--min') ?? 5);
const [accion, archivo, userId] = args;
if (!['revisar', 'aplicar'].includes(accion) || !archivo || (accion === 'aplicar' && !userId) || !(minimo >= 1)) {
  console.error('Uso: completar-contexto-legado.mjs revisar <registros.csv> | aplicar <registros.csv> <user_id> [--min 5]');
  process.exit(2);
}

/** CSV con comillas (RFC 4180), sin dependencias. */
function leerCsv(texto) {
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo.replace(/\r$/, '')); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo.replace(/\r$/, '')); filas.push(fila); }
  return filas;
}

const [cabecera, ...filas] = leerCsv(fs.readFileSync(archivo, 'utf8'));
const iTaxon = cabecera.indexOf('taxon_id');
const iElev = cabecera.indexOf('elevation_m');
if (iTaxon < 0 || iElev < 0) {
  console.error('El CSV no trae taxon_id y elevation_m.');
  process.exit(2);
}

const porTaxon = new Map();
let descartadas = 0;
for (const f of filas) {
  if (f.length <= Math.max(iTaxon, iElev) || f[iElev] === '') continue;
  const e = Number(f[iElev]);
  if (!Number.isFinite(e) || e < -10 || e > 4600) { descartadas++; continue; }
  if (!porTaxon.has(f[iTaxon])) porTaxon.set(f[iTaxon], []);
  porTaxon.get(f[iTaxon]).push(e);
}

const rangos = new Map();
for (const [taxon, valores] of porTaxon) {
  if (valores.length < minimo) continue;
  const s = [...valores].sort((a, b) => a - b);
  rangos.set(taxon, { min: Math.round(percentil(s, 0.05)), max: Math.round(percentil(s, 0.95)), n: s.length });
}

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows: paquetes } = await pool.query(
    `SELECT id, region_id, version, estado, manifiesto, manifiesto_key
       FROM packages.regional_packages WHERE origen = 'legado' AND estado IN ('publicado', 'retirado') ORDER BY id`);
  if (!paquetes.length) throw new Error('No hay versiones legadas: importa primero el paquete anterior.');

  const taxones = (paquetes[0].manifiesto?.especies || []).filter((e) => e.taxon_id);
  const filasTabla = taxones.map((e) => ({ taxon: e.taxon_id, nombre: e.nombre_cientifico, ...(rangos.get(e.taxon_id) || {}), registros: porTaxon.get(e.taxon_id)?.length || 0 }));
  console.log(`Registros con elevación válida: ${[...porTaxon.values()].reduce((a, v) => a + v.length, 0)} (descartados por imposibles: ${descartadas})`);
  console.log('especie'.padEnd(34), 'registros'.padStart(9), 'p5–p95 (m)'.padStart(14));
  for (const f of filasTabla) {
    console.log(f.nombre.padEnd(34), String(f.registros).padStart(9), (f.min != null ? `${f.min}–${f.max}` : 'sin datos suficientes').padStart(14));
  }
  const con = filasTabla.filter((f) => f.min != null).length;
  console.log(`\n${con} de ${taxones.length} especies con altitud (mínimo ${minimo} registros).`);
  if (accion === 'revisar') process.exit(0);

  const Minio = require('minio');
  const minio = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: Number(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USER,
    secretKey: process.env.MINIO_ROOT_PASSWORD,
  });
  const bucket = process.env.DATASET_BUCKET || 'anura-dataset';
  const fuente = 'Registros de GBIF e iNaturalist en Antioquia con elevación (percentiles 5 a 95)';

  for (const p of paquetes) {
    const manifiesto = structuredClone(p.manifiesto);
    for (const e of manifiesto.especies || []) {
      const r = rangos.get(e.taxon_id);
      if (!r) continue;
      e.contexto = { ...(e.contexto || {}), altitud: { min: r.min, max: r.max, n: r.n, origen: 'registros', fuente } };
    }
    const texto = JSON.stringify(manifiesto);
    if (p.manifiesto_key) {
      await minio.putObject(bucket, p.manifiesto_key, Buffer.from(texto), Buffer.byteLength(texto), { 'Content-Type': 'application/json' });
    }
    await pool.query('UPDATE packages.regional_packages SET manifiesto = $2::jsonb WHERE id = $1', [p.id, texto]);
  }
  await registrar(pool, userId, 'dataset.paquete.contexto_legado', 'paquete', paquetes[0].region_id, {
    especies_con_altitud: con, especies: taxones.length, versiones: paquetes.length, minimo, fuente, archivo: archivo.split(/[\\/]/).pop(),
  });
  console.log(`\nAplicado a ${paquetes.length} versiones legadas (base y paquete.json). Auditado.`);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
