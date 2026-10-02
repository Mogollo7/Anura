// Uso: docker cp _pruebas/prueba_priors.js anura_dataset:/tmp/ && docker exec -e NODE_PATH=/app/node_modules anura_dataset node /tmp/prueba_priors.js
// Prueba REAL de priors.js: baja el paquete anterior de MinIO, escribe los priors en un sqlite nuevo con el ESQUEMA
// del compilador y lo consulta con las MISMAS consultas SQL que usa la app (PackageVectorIndex.kt / NearbySpecies.kt).
// Solo lectura sobre Postgres y MinIO. Corre dentro de anura_dataset.
const { Pool } = require('pg');
const Minio = require('minio');
const { DatabaseSync } = require('node:sqlite');
const assert = require('assert/strict');
const priors = require('/app/src/priors');
const { ESQUEMA } = require('/app/src/paqueteSqlite');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const minio = new Minio.Client({ endPoint: process.env.MINIO_ENDPOINT || 'minio', port: Number(process.env.MINIO_PORT) || 9000, useSSL: false, accessKey: process.env.MINIO_ROOT_USER, secretKey: process.env.MINIO_ROOT_PASSWORD, region: 'us-east-1' });
  const bucket = process.env.DATASET_BUCKET || 'anura-dataset';
  const out = [];
  const ok = (m) => out.push(`✔ ${m}`);

  const p = await priors.delPaqueteAnterior({ pool, minio, bucket }, '05');
  assert.ok(p, 'no se pudo leer el paquete anterior');
  ok(`paquete anterior leído: ${p.origen.paquete_id} v${p.origen.package_version}, ${p.zones.length} zonas, ${p.grid.length} celdas, ${p.zonePrior.length} filas de zona, ${p.weather.length} especies con clima`);

  // Las especies del dataset (las que podrían entrar a un paquete) con taxon_id.
  const { rows } = await pool.query('SELECT taxon_id, nombre_cientifico FROM dataset.especie WHERE taxon_id IS NOT NULL ORDER BY taxon_id');
  const ids = new Set(rows.map((r) => r.taxon_id));

  const lite = new DatabaseSync(':memory:');
  lite.exec(ESQUEMA.replace(/CREATE VIRTUAL TABLE[^;]*;/, ''));   // sin vec0: aquí solo se prueban los priors
  lite.exec('BEGIN');
  const r = priors.escribir(lite, p, ids);
  lite.exec('COMMIT');
  ok(`escritos: ${r.zonas} zonas, ${r.celdas} celdas, ${r.filas_zona} filas de zona (${r.especies_con_prior_zona}/${ids.size} especies), clima ${r.especies_con_prior_clima}/${ids.size}`);
  assert.ok(r.especies_con_prior_zona > 0 && r.especies_con_prior_clima > 0);
  const nuevas = rows.filter((x) => r.sin_prior_zona.includes(x.taxon_id)).map((x) => x.nombre_cientifico);
  ok(`especies sin fila (la app usa p_unobserved / no ajusta): ${nuevas.length}${nuevas.length ? ' → ' + nuevas.slice(0, 5).join(', ') + (nuevas.length > 5 ? '…' : '') : ''}`);

  // === Las consultas EXACTAS de la app ===
  // zoneIdFor(lat, lon): celda 0.25°, redondeo half-even (Math.rint)
  const rint = (x) => { const f = Math.floor(x); const d = x - f; if (d < 0.5) return f; if (d > 0.5) return f + 1; return f % 2 === 0 ? f : f + 1; };
  const zonaDe = (lat, lon) => lite.prepare('select zone_id from grid_cells where row = ? and col = ?').get(rint(lat / 0.25), rint(lon / 0.25))?.zone_id;
  const medellin = zonaDe(6.2518, -75.5636);
  assert.ok(medellin, 'Medellín no cae en ninguna zona'); ok(`zoneIdFor(Medellín 6.2518, -75.5636) = ${medellin}`);
  assert.equal(zonaDe(40.0, 10.0), undefined); ok('una coordenada fuera de cobertura no tiene zona (la app lo trata como sin ajuste)');

  // zonePrior(zoneId)
  const meta = lite.prepare('select prior_weight, p_unobserved from zone_prior_meta where zone_id = ?').get(medellin);
  assert.ok(meta && meta.prior_weight > 0 && meta.p_unobserved > 0 && meta.p_unobserved < 1); ok(`zone_prior_meta[${medellin}]: peso ${meta.prior_weight}, p_unobserved ${meta.p_unobserved.toExponential(2)}`);
  const porTaxon = lite.prepare('select taxon_id, p from zone_prior where zone_id = ?').all(medellin);
  assert.ok(porTaxon.length > 0 && porTaxon.every((x) => x.p > 0 && x.p <= 1 && ids.has(x.taxon_id))); ok(`zone_prior[${medellin}]: ${porTaxon.length} especies, todas con p en (0,1]`);

  // NearbySpecies: especies más probables de la zona
  const cerca = lite.prepare('select taxon_id from zone_prior where zone_id = ? order by p desc limit ?').all(medellin, 5);
  assert.equal(cerca.length, Math.min(5, porTaxon.length)); ok(`NearbySpecies: top ${cerca.length} de ${medellin}`);

  // weatherPrior() y weatherPriorWeight()
  const clima = lite.prepare('select taxon_id, n, temp_mean, temp_std, hum_mean, hum_std from weather_prior').all();
  assert.ok(clima.length > 0 && clima.every((c) => c.n > 0 && Number.isFinite(c.temp_mean) && c.temp_std > 0 && c.hum_std > 0));
  const peso = lite.prepare("select value from weather_prior_meta where key = 'weight'").get();
  assert.ok(peso && Number.isFinite(Number(peso.value)) && Number(peso.value) > 0); ok(`weather_prior: ${clima.length} especies; weather_prior_meta.weight = ${peso.value}`);

  // Integridad: toda zona de la rejilla existe en zones (FK) y cada zona tiene su meta
  const zonasRej = lite.prepare('select distinct zone_id from grid_cells').all().map((x) => x.zone_id);
  const zonasDef = new Set(lite.prepare('select zone_id from zones').all().map((x) => x.zone_id));
  const zonasMeta = new Set(lite.prepare('select zone_id from zone_prior_meta').all().map((x) => x.zone_id));
  assert.ok(zonasRej.every((z) => zonasDef.has(z) && zonasMeta.has(z))); ok('toda zona de la rejilla tiene su definición y su peso');

  // Idéntico al origen para las especies compartidas (nada recalculado, nada inventado)
  const orig = p.zonePrior.filter((x) => ids.has(x.taxon_id));
  const nuevoMap = new Map(lite.prepare('select zone_id, taxon_id, p from zone_prior').all().map((x) => [`${x.zone_id}|${x.taxon_id}`, x.p]));
  assert.ok(orig.every((x) => nuevoMap.get(`${x.zone_id}|${x.taxon_id}`) === x.p) && nuevoMap.size === orig.length); ok('las filas son idénticas a las del paquete anterior (valor a valor)');

  // package_info
  const info = priors.infoDe(r, ids.size);
  assert.match(info.zone_prior, /tomadas del paquete anterior/); ok(`package_info.zone_prior: ${info.zone_prior}`);

  console.log(out.join('\n'));
  await pool.end();
})().catch((e) => { console.error('✖', e.message); process.exit(1); });
