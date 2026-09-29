/**
 * Arma los artefactos del paquete de una subregión con el MISMO formato que ya lee el teléfono
 * (PackageVectorIndex.kt, NearbySpecies.kt, SpeciesOccurrences.kt): un sqlite con `taxa`,
 * `vec_references` (vec0 de sqlite-vec 0.1.9, coseno, igual que la app) y `package_info`, más
 * un JSON (manifiesto) que describe qué lleva. Lo usan el compilador del servidor (release.js)
 * y el CLI scripts/publicar-paquetes.mjs: una sola implementación.
 *
 * Todo sale de la base:
 * - taxa: las especies que la validación técnica dejó entrar.
 * - vec_references + reference_images: los vectores de train (manifiesto vigente, sin exclusión)
 *   del encoder del teléfono, con licencia y atribución de su foto.
 * - centroids: centroide regional propio si lo hay, si no el global; y los supercentroides de
 *   género y familia de la misma corrida.
 * - morph_centroids: centroide por morfo (bloque 5) de los morfos declarados en la subregión que
 *   llegaron al mínimo de individuos; un morfo sin centroide usa el de su especie.
 * - clusters: clústeres de especies que se confunden, ACEPTADOS por una persona (dataset.cluster),
 *   con sus miembros dentro del paquete y la medición ArcFace de cuando se decidió.
 * - taxon_context: rango de altitud, pesos wv/wg/wm y LRC efectivos de la Ficha técnica (lo que
 *   decidió una persona o, si no, lo calculado); NULL donde la Ficha no tiene el dato.
 * - occurrence_points: coordenadas de las observaciones del dataset (no ocultas, no
 *   invalidadas, no excluidas por uso geográfico), hasta 300 por especie.
 * - zones, grid_cells, zone_prior, zone_prior_meta, weather_prior, weather_prior_meta: el servidor todavía no calcula priors de zona
 *   ni de clima. Las tablas van VACÍAS (la app las consulta y un paquete sin ellas fallaría);
 *   package_info lo dice. Vacías = sin ajuste de contexto, nunca un prior inventado.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const sqliteVec = require('sqlite-vec');
const { ENCODER } = require('./centroides');

const MAX_PUNTOS_POR_ESPECIE = 300;

const blob = (valores) => {
  const buf = Buffer.alloc(valores.length * 4);
  valores.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
};

const epiteto = (nombre) => nombre.trim().split(/\s+/).slice(1).join(' ');

const ESQUEMA = `
  CREATE TABLE package_info (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE taxa (
    taxon_id TEXT PRIMARY KEY, scientific_name TEXT NOT NULL, family TEXT NOT NULL, genus TEXT NOT NULL,
    species_epithet TEXT NOT NULL, gbif_species_key INTEGER, occurrence_evidence TEXT NOT NULL,
    visual_status TEXT NOT NULL, flags TEXT NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE reference_images (
    ref_id INTEGER PRIMARY KEY, source_record_id TEXT, license_code TEXT NOT NULL, attribution TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE vec_references USING vec0(taxon_id TEXT, embedding FLOAT[512] distance_metric=cosine);
  CREATE TABLE centroids (
    level TEXT NOT NULL, name TEXT NOT NULL, origin TEXT NOT NULL, n_vectors INTEGER, n_observations INTEGER,
    dispersion REAL, vector BLOB NOT NULL, PRIMARY KEY (level, name)
  ) WITHOUT ROWID;
  CREATE TABLE morph_centroids (
    morph_id INTEGER PRIMARY KEY, taxon_id TEXT NOT NULL, name TEXT NOT NULL, n_vectors INTEGER NOT NULL,
    n_observations INTEGER NOT NULL, dispersion REAL, vector BLOB NOT NULL
  );
  CREATE TABLE clusters (cluster_id INTEGER PRIMARY KEY, name TEXT NOT NULL, members TEXT NOT NULL, measurement TEXT);
  CREATE TABLE taxon_context (
    taxon_id TEXT PRIMARY KEY, altitude_min REAL, altitude_max REAL, altitude_origin TEXT,
    w_visual REAL, w_geo REAL, w_habitat REAL, weights_origin TEXT, lrc_method TEXT, lrc_min REAL, lrc_max REAL
  ) WITHOUT ROWID;
  CREATE TABLE zones (zone_id TEXT PRIMARY KEY, label TEXT NOT NULL, cells INTEGER NOT NULL, elev_median_m INTEGER) WITHOUT ROWID;
  CREATE TABLE grid_cells (
    row INTEGER NOT NULL, col INTEGER NOT NULL, zone_id TEXT NOT NULL REFERENCES zones(zone_id),
    assignment TEXT NOT NULL, PRIMARY KEY (row, col)
  ) WITHOUT ROWID;
  CREATE TABLE zone_prior_meta (zone_id TEXT PRIMARY KEY, prior_weight REAL NOT NULL, p_unobserved REAL NOT NULL) WITHOUT ROWID;
  CREATE TABLE zone_prior (zone_id TEXT NOT NULL, taxon_id TEXT NOT NULL, p REAL NOT NULL, PRIMARY KEY (zone_id, taxon_id)) WITHOUT ROWID;
  CREATE TABLE weather_prior (
    taxon_id TEXT PRIMARY KEY, n INTEGER NOT NULL, temp_mean REAL NOT NULL, temp_std REAL NOT NULL,
    hum_mean REAL NOT NULL, hum_std REAL NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE weather_prior_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE occurrence_points (taxon_id TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL);
  CREATE INDEX idx_occurrence_points_taxon ON occurrence_points(taxon_id);
`;

/**
 * @param db        cliente pg (idealmente dentro de la transacción del compilador)
 * @param validacion resultado de validacionTecnica.evaluar() con `lista: true`
 * @param meta      { paqueteId, version, generado }
 * @returns { sqlite: Buffer, sha256, size_bytes, manifiesto }
 */
async function construir(db, validacion, meta) {
  const { subregion, encoder, centroides, osr, dataset_version: datasetVersion } = validacion;
  const incluidas = validacion.especies.filter((e) => e.incluida);
  if (!incluidas.length) throw new Error('No hay especies para el paquete');
  const ids = incluidas.map((e) => e.especie_id);
  const taxonDe = new Map(incluidas.map((e) => [e.especie_id, e.taxon_id]));

  // Las mismas fotos que promedia el centroide (BASE de centroides.js): train del manifiesto
  // vigente, sin exclusión, con vector del encoder del teléfono.
  const { rows: refs } = await db.query(`
    SELECT f.especie_id, e.vector::real[] AS vector, f.licencia, f.atribucion, o.fuente, o.fuente_id, o.id AS obs
    FROM dataset.embedding e
    JOIN dataset.foto f ON f.sha256 = e.sha256
    JOIN dataset.version_foto vf ON vf.sha256 = e.sha256 AND vf.version_id = (SELECT MAX(id) FROM dataset.version)
    LEFT JOIN dataset.observacion o ON o.id = f.observacion_id
    WHERE e.encoder_sha256 = $1 AND vf.particion = 'train' AND f.especie_id = ANY($2::int[])
      AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = e.sha256 AND x.revertida IS NULL)
    ORDER BY f.especie_id, f.sha256`, [ENCODER, ids]);

  const { rows: centros } = await db.query(`
    SELECT e.id AS especie_id, COALESCE(cr.vector, c.vector)::real[] AS vector,
           CASE WHEN cr.vector IS NOT NULL THEN 'regional' ELSE 'global' END AS origen,
           CASE WHEN cr.vector IS NOT NULL THEN cr.n_vectores ELSE c.n_vectores END AS n_vectores,
           CASE WHEN cr.vector IS NOT NULL THEN cr.n_observaciones ELSE c.n_observaciones END AS n_observaciones,
           CASE WHEN cr.vector IS NOT NULL THEN cr.dispersion ELSE c.dispersion END AS dispersion
    FROM dataset.especie e
    JOIN dataset.centroide c ON c.experimento_id = $1 AND c.especie_id = e.id
    LEFT JOIN dataset.centroide_regional cr ON cr.experimento_id = $1 AND cr.especie_id = e.id AND cr.subregion_id = $2
    WHERE e.id = ANY($3::int[])`, [centroides.experimento_id, subregion.id, ids]);

  const generos = [...new Set(incluidas.map((e) => e.genero))];
  const familias = [...new Set(incluidas.map((e) => e.familia))];
  const { rows: supers } = await db.query(`
    SELECT nivel, nombre, n_especies, vector::real[] AS vector FROM dataset.supercentroide
    WHERE experimento_id = $1 AND ((nivel = 'genero' AND nombre = ANY($2)) OR (nivel = 'familia' AND nombre = ANY($3)))`,
  [centroides.experimento_id, generos, familias]);

  const { rows: puntos } = await db.query(`
    SELECT especie_id, lat, lon FROM (
      SELECT f.especie_id, COALESCE(o.latitud_limpia, o.latitud) AS lat, COALESCE(o.longitud_limpia, o.longitud) AS lon,
             ROW_NUMBER() OVER (PARTITION BY f.especie_id ORDER BY o.id) AS n
      FROM dataset.observacion o
      JOIN LATERAL (SELECT especie_id FROM dataset.foto WHERE observacion_id = o.id LIMIT 1) f ON TRUE
      WHERE f.especie_id = ANY($1::int[]) AND o.latitud IS NOT NULL AND NOT o.coordenada_oculta
        AND o.invalidada_motivo IS NULL AND o.uso_geografico IS DISTINCT FROM 'excluida'
    ) p WHERE n <= ${MAX_PUNTOS_POR_ESPECIE}`, [ids]);

  const conMorfo = validacion.morfos.filter((mo) => mo.calculado).map((mo) => mo.morfo_id);
  const { rows: morfos } = conMorfo.length ? await db.query(`
    SELECT cm.morfo_id, cm.especie_id, mo.nombre, cm.n_vectores, cm.n_observaciones, cm.dispersion, cm.vector::real[] AS vector
    FROM dataset.centroide_morfo cm JOIN dataset.morfo mo ON mo.id = cm.morfo_id
    WHERE cm.experimento_id = $1 AND cm.morfo_id = ANY($2::int[]) AND cm.vector IS NOT NULL
    ORDER BY cm.morfo_id`, [centroides.experimento_id, conMorfo]) : { rows: [] };

  const { rows: [enc] } = await db.query('SELECT preprocesado, normalizacion FROM dataset.encoder WHERE sha256 = $1', [ENCODER]);

  const tmp = path.join(os.tmpdir(), `anura-paquete-${process.pid}-${crypto.randomBytes(6).toString('hex')}.sqlite`);
  const lite = new DatabaseSync(tmp, { allowExtension: true });
  try {
    sqliteVec.load(lite);
    lite.exec(ESQUEMA);
    lite.exec('BEGIN');
    const taxa = lite.prepare(`INSERT INTO taxa VALUES (?, ?, ?, ?, ?, NULL, 'DATASET_SUBREGION', 'VISUAL_ENABLED', ?)`);
    for (const e of incluidas) {
      taxa.run(e.taxon_id, e.nombre_cientifico, e.familia, e.genero, epiteto(e.nombre_cientifico), e.centroide_propio ? '' : 'centroide_global');
    }
    const ctxSt = lite.prepare('INSERT INTO taxon_context VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const e of incluidas) {
      const { altitud: alt, pesos: w, lrc } = e.contexto || {};
      ctxSt.run(e.taxon_id, alt?.min ?? null, alt?.max ?? null, alt?.origen ?? null, w?.wv ?? null, w?.wg ?? null, w?.wm ?? null,
        w?.origen ?? null, lrc?.metodo ?? null, lrc?.min ?? null, lrc?.max ?? null);
    }
    const img = lite.prepare('INSERT INTO reference_images VALUES (?, ?, ?, ?)');
    const vec = lite.prepare('INSERT INTO vec_references (rowid, taxon_id, embedding) VALUES (?, ?, ?)');
    const porEspecie = new Map();
    refs.forEach((r, i) => {
      const rowid = BigInt(i + 1);
      const origen = r.fuente === 'inaturalist' && r.fuente_id ? `inat:${r.fuente_id}` : r.obs ? `anura:${r.obs}` : null;
      img.run(rowid, origen, r.licencia || '', r.atribucion || '');
      vec.run(rowid, taxonDe.get(r.especie_id), blob(r.vector));
      porEspecie.set(r.especie_id, (porEspecie.get(r.especie_id) || 0) + 1);
    });
    const cen = lite.prepare('INSERT INTO centroids VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const c of centros) {
      cen.run('especie', taxonDe.get(c.especie_id), c.origen, c.n_vectores, c.n_observaciones, c.dispersion, blob(c.vector));
    }
    for (const s of supers) cen.run(s.nivel, s.nombre, 'global', null, null, null, blob(s.vector));
    const mf = lite.prepare('INSERT INTO morph_centroids VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const mo of morfos) {
      mf.run(mo.morfo_id, taxonDe.get(mo.especie_id), mo.nombre, mo.n_vectores, mo.n_observaciones, mo.dispersion, blob(mo.vector));
    }
    const cl = lite.prepare('INSERT INTO clusters VALUES (?, ?, ?, ?)');
    for (const c of validacion.clusteres) {
      cl.run(c.id, c.nombre, JSON.stringify(c.miembros.map((id) => taxonDe.get(id))), c.medicion ? JSON.stringify(c.medicion) : null);
    }
    const pt = lite.prepare('INSERT INTO occurrence_points VALUES (?, ?, ?)');
    for (const p of puntos) pt.run(taxonDe.get(p.especie_id), p.lat, p.lon);

    const info = {
      package_id: meta.paqueteId,
      package_version: String(meta.version),
      department: subregion.region_nombre,
      department_dane: subregion.region,
      subregion: subregion.nombre,
      subregion_key: subregion.clave,
      created_on: meta.generado.slice(0, 10),
      generated_at: meta.generado,
      data_version: datasetVersion ? datasetVersion.nombre : '',
      centroids_run: String(centroides.experimento_id),
      encoder_onnx_file: encoder.archivo,
      encoder_onnx_sha256: encoder.sha256,
      embedding_dim: String(encoder.dimension),
      distance: 'cosine (embeddings L2-normalizados)',
      preprocessing: enc?.preprocesado || '',
      normalization: enc?.normalizacion || '',
      visual_taxa: String(incluidas.length),
      k_taxa: String(incluidas.length),
      reference_vectors: String(refs.length),
      occurrence_points: String(puntos.length),
      osr_threshold_id: osr ? String(osr.umbral_id) : '',
      osr_tau: osr ? String(osr.tau) : '',
      zone_prior: 'sin datos: el servidor todavía no calcula el prior de zona',
      weather_prior: 'sin datos: el servidor todavía no calcula el prior de clima',
    };
    const pi = lite.prepare('INSERT INTO package_info VALUES (?, ?)');
    for (const [k, v] of Object.entries(info)) pi.run(k, v);
    lite.exec('COMMIT');
    lite.close();

    const sqlite = fs.readFileSync(tmp);
    const sha256 = crypto.createHash('sha256').update(sqlite).digest('hex');
    const centroDe = new Map(centros.map((c) => [c.especie_id, c]));
    const manifiesto = {
      formato: 1,
      paquete_id: meta.paqueteId,
      version: meta.version,
      generado: meta.generado,
      departamento: { codigo_dane: subregion.region, nombre: subregion.region_nombre },
      subregion: { id: subregion.id, clave: subregion.clave, nombre: subregion.nombre },
      encoder: { sha256: encoder.sha256, archivo: encoder.archivo, dimension: encoder.dimension },
      dataset_version: datasetVersion,
      centroides: { experimento_id: centroides.experimento_id },
      osr: osr ? { umbral_id: osr.umbral_id, tau: osr.tau, validado: osr.validado } : null,
      especies: incluidas.map((e) => ({
        taxon_id: e.taxon_id,
        nombre_cientifico: e.nombre_cientifico,
        genero: e.genero,
        familia: e.familia,
        referencias: porEspecie.get(e.especie_id) || 0,
        individuos_en_subregion: e.individuos_subregion,
        centroide: centroDe.get(e.especie_id)?.origen || null,
        contexto: e.contexto,
      })),
      morfos: morfos.map((mo) => ({ id: mo.morfo_id, taxon_id: taxonDe.get(mo.especie_id), nombre: mo.nombre, individuos: mo.n_observaciones })),
      clusteres: validacion.clusteres.map((c) => ({ id: c.id, nombre: c.nombre, taxon_ids: c.miembros.map((id) => taxonDe.get(id)) })),
      supercentroides: { generos: supers.filter((s) => s.nivel === 'genero').length, familias: supers.filter((s) => s.nivel === 'familia').length },
      vectores: refs.length,
      puntos_ocurrencia: puntos.length,
      priors: { zona: null, clima: null },
      archivo: { nombre: 'package.sqlite', formato: 'sqlite', sha256, size_bytes: sqlite.length },
    };
    return { sqlite, sha256, size_bytes: sqlite.length, manifiesto };
  } finally {
    try { lite.close(); } catch { /* ya cerrada */ }
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { construir };
