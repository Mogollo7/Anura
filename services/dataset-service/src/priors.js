/**
 * Prior de zona y de clima de los paquetes compilados por el servidor.
 *
 * La app (PackageVectorIndex.kt: zoneIdFor, zonePrior, weatherPrior, weatherPriorWeight) lee del sqlite
 * `grid_cells`, `zones`, `zone_prior_meta`, `zone_prior`, `weather_prior` y `weather_prior_meta`. Esos datos no se
 * calculan en el servidor: salieron de `pipeline_dataset/paquetes_zonales.py` (P(s|z) = (N(s,z)+α)/(N(z)+α·K), con
 * tope de esfuerzo) y de `evaluation/geo_weather_v1/` (estadísticos de temperatura y humedad por especie), con datos
 * y control de fuga que el servidor no tiene. Ya los trae el paquete que la app descargó antes (importado por
 * legado.js, que los copió tal cual). Aquí se SACAN de ese paquete, sin tocar la app ni recalcular nada:
 *
 *  - grid_cells, zones, zone_prior_meta, weather_prior_meta: la rejilla de zonas y los pesos, completos.
 *  - zone_prior y weather_prior: solo las filas de las especies del paquete nuevo.
 *  - Una especie que el paquete anterior no tenía (creada después en el panel) no tiene fila: la app ya sabe qué
 *    hacer (zona: usa p_unobserved, nunca cero; clima: queda fuera del mapa, sin ajuste ni penalización). Se declara
 *    en package_info y en el manifiesto, nunca se inventa una fila.
 *
 * Los priors no deciden la especie en la app (solo reordenan candidatas), así que un paquete sin fila para una
 * especie nueva no la rechaza: simplemente no recibe ajuste de contexto de zona ni de clima.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

/** Claves de package_info que describen la rejilla y se conservan del paquete anterior. */
const CLAVES_REJILLA = ['cell_rule', 'cell_size_degrees', 'grid_sha256'];

/**
 * Baja el paquete anterior del departamento (el más reciente con origen 'legado') y lee sus priors a memoria.
 * @returns {Promise<object|null>} null si el departamento no tiene paquete anterior o no trae las tablas.
 */
async function delPaqueteAnterior({ pool, minio, bucket }, departamentoDane) {
  const { rows: [fila] } = await pool.query(`
    SELECT id, region_id, storage_key, sha256 FROM packages.regional_packages
    WHERE origen = 'legado' AND region_id LIKE $1 ORDER BY id DESC LIMIT 1`, [`${departamentoDane}.%`]);
  if (!fila) return null;

  const tmp = path.join(os.tmpdir(), `anura-priors-${process.pid}-${crypto.randomBytes(6).toString('hex')}.sqlite`);
  try {
    await minio.fGetObject(bucket, fila.storage_key, tmp);
    return leer(tmp, { paquete_id: fila.region_id, sha256: fila.sha256, storage_key: fila.storage_key });
  } catch (err) {
    // Sin el archivo del paquete anterior el nuevo sale como antes (sin priors) y lo dice; no se frena la compilación.
    console.error('[priors] no se pudo leer el paquete anterior:', err.message);
    return null;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Lee las seis tablas de un package.sqlite. Devuelve null si falta alguna: no se ofrece un prior a medias. */
function leer(ruta, origen) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const tablas = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    for (const t of ['zones', 'grid_cells', 'zone_prior_meta', 'zone_prior', 'weather_prior', 'weather_prior_meta']) {
      if (!tablas.has(t)) return null;
    }
    const todo = (sql) => db.prepare(sql).all();
    const info = Object.fromEntries(todo('SELECT key, value FROM package_info').map((r) => [r.key, r.value]));
    const priors = {
      origen: { ...origen, package_version: info.package_version || null },
      rejilla: Object.fromEntries(CLAVES_REJILLA.filter((k) => info[k]).map((k) => [k, info[k]])),
      zones: todo('SELECT zone_id, label, cells, elev_median_m FROM zones ORDER BY zone_id'),
      grid: todo('SELECT row, col, zone_id, assignment FROM grid_cells ORDER BY row, col'),
      zonePriorMeta: todo('SELECT zone_id, prior_weight, p_unobserved FROM zone_prior_meta ORDER BY zone_id'),
      zonePrior: todo('SELECT zone_id, taxon_id, p FROM zone_prior ORDER BY zone_id, taxon_id'),
      weather: todo('SELECT taxon_id, n, temp_mean, temp_std, hum_mean, hum_std FROM weather_prior ORDER BY taxon_id'),
      weatherMeta: todo('SELECT key, value FROM weather_prior_meta ORDER BY key'),
    };
    if (!priors.zones.length || !priors.grid.length) return null;
    return priors;
  } finally {
    db.close();
  }
}

/**
 * Escribe los priors en un package.sqlite NUEVO (esquema de paqueteSqlite.js), solo para `taxonIds`.
 * @param lite      DatabaseSync abierta, dentro de una transacción, con el ESQUEMA ya creado
 * @param priors    resultado de delPaqueteAnterior()
 * @param taxonIds  Set de taxon_id del paquete nuevo
 * @returns resumen para package_info y el manifiesto
 */
function escribir(lite, priors, taxonIds) {
  const z = lite.prepare('INSERT INTO zones VALUES (?, ?, ?, ?)');
  for (const r of priors.zones) z.run(r.zone_id, r.label, r.cells, r.elev_median_m);
  const g = lite.prepare('INSERT INTO grid_cells VALUES (?, ?, ?, ?)');
  for (const r of priors.grid) g.run(r.row, r.col, r.zone_id, r.assignment);
  const m = lite.prepare('INSERT INTO zone_prior_meta VALUES (?, ?, ?)');
  for (const r of priors.zonePriorMeta) m.run(r.zone_id, r.prior_weight, r.p_unobserved);

  const zp = lite.prepare('INSERT INTO zone_prior VALUES (?, ?, ?)');
  let filasZona = 0;
  const conZona = new Set();
  for (const r of priors.zonePrior) {
    if (!taxonIds.has(r.taxon_id)) continue;
    zp.run(r.zone_id, r.taxon_id, r.p);
    filasZona += 1;
    conZona.add(r.taxon_id);
  }

  const wp = lite.prepare('INSERT INTO weather_prior VALUES (?, ?, ?, ?, ?, ?)');
  const conClima = new Set();
  for (const r of priors.weather) {
    if (!taxonIds.has(r.taxon_id)) continue;
    wp.run(r.taxon_id, r.n, r.temp_mean, r.temp_std, r.hum_mean, r.hum_std);
    conClima.add(r.taxon_id);
  }
  const wm = lite.prepare('INSERT INTO weather_prior_meta VALUES (?, ?)');
  for (const r of priors.weatherMeta) wm.run(r.key, r.value);

  const sinZona = [...taxonIds].filter((t) => !conZona.has(t)).sort();
  const sinClima = [...taxonIds].filter((t) => !conClima.has(t)).sort();
  return {
    origen: priors.origen,
    rejilla: priors.rejilla,
    zonas: priors.zones.length,
    celdas: priors.grid.length,
    filas_zona: filasZona,
    especies_con_prior_zona: conZona.size,
    especies_con_prior_clima: conClima.size,
    // Sin fila propia: la app usa p_unobserved (zona) o no ajusta (clima). Nada inventado.
    sin_prior_zona: sinZona,
    sin_prior_clima: sinClima,
  };
}

/** Líneas de package_info que describen lo que se escribió. */
function infoDe(resumen, nEspecies) {
  return {
    zone_prior: `${resumen.zonas} zonas, ${resumen.filas_zona} filas de ${resumen.especies_con_prior_zona} de ${nEspecies} especies, `
      + `tomadas del paquete anterior ${resumen.origen.paquete_id} v${resumen.origen.package_version || '?'}; `
      + `${resumen.sin_prior_zona.length} especies sin fila usan p_unobserved`,
    weather_prior: `${resumen.especies_con_prior_clima} de ${nEspecies} especies, tomadas del paquete anterior; `
      + `${resumen.sin_prior_clima.length} especies sin dato de clima quedan sin ajuste`,
    priors_origen_sha256: resumen.origen.sha256 || '',
    ...resumen.rejilla,
  };
}

module.exports = { delPaqueteAnterior, leer, escribir, infoDe };
