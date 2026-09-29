/**
 * Paquete anterior (legado): adapta el paquete que traía el APK antes de que el servidor compilara
 * los paquetes, y lo importa como una versión más del historial de una subregión.
 *
 * El objetivo es que la app NO cambie: lo que se adapta es el paquete. La app (PackageInstaller.kt,
 * PackageVectorIndex.kt, PackageOpenSet.kt, NearbySpecies.kt, SpeciesOccurrences.kt) solo lee del sqlite:
 *   taxa · vec_references (vec0, coseno) · open_set_model (ANOS v1) · grid_cells · zone_prior · zone_prior_meta ·
 *   weather_prior · weather_prior_meta · occurrence_points
 * y exige que los ids del modelo Open Set coincidan EXACTAMENTE con los de `taxa`
 * (PackageOpenSets.decode: `model.centroidIds.toSet() != packageTaxonIds`). Por eso `taxa` del paquete
 * adaptado se reduce a las especies con vectores y modelo de rechazo (las 30 visuales); las otras 261 del
 * paquete original eran solo catálogo (VISUAL_EXCLUDED_REVIEW / CATALOG_ONLY: sin vectores ni centroide).
 *
 * Qué conserva del paquete viejo (todo dato real, ninguno inventado):
 *  - vec_references + reference_images: los 4.034 vectores con su licencia y atribución, mismos rowid.
 *  - open_set_model: el modelo del release 1.1.0 (openset_v1.1.0_clean.bin: Ledoit-Wolf compartida, τ 39,354…)
 *    FILTRADO a las especies del paquete. Es lo mismo que hacía la app vieja con `allowed_by_package.json`.
 *    Precisión y medias se copian byte a byte; solo cambia el orden/ids (ANU_COL_… → COL_ANURA_…).
 *  - zone_prior / zones / grid_cells / weather_prior(_meta) / occurrence_points: tal cual (filtrados a las especies del paquete).
 * Lo que el paquete viejo no tenía (morfos, clústeres, contexto de la Ficha, supercentroides) queda VACÍO y
 * package_info lo declara; `centroids` (nivel especie) es la media L2 de los vectores de referencia del propio
 * paquete, con su origen dicho.
 *
 * El resultado es un sqlite NUEVO en el formato de paqueteSqlite.js (mismo ESQUEMA); el original no se toca.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const sqliteVec = require('sqlite-vec');
const { ENCODER } = require('./centroides');
const osrModelo = require('./osrModelo');
const M = require('./mahalanobis');
const { ESQUEMA } = require('./paqueteSqlite');
const { registrar } = require('./audit');

const FORMATO_ADAPTADOR = 1;
const K = 5;
const falla = (mensaje, status = 400, extra = {}) => Object.assign(new Error(mensaje), { status }, extra);
const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const blob = (valores) => {
  const buf = Buffer.alloc(valores.length * 4);
  valores.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
};
const floatsRapido = (bytes) => {
  const b = Buffer.from(bytes);
  const salida = new Float64Array(b.length / 4);
  for (let i = 0; i < salida.length; i++) salida[i] = b.readFloatLE(i * 4);
  return salida;
};

function abrir(ruta) {
  const db = new DatabaseSync(ruta, { readOnly: true, allowExtension: true });
  sqliteVec.load(db);
  return db;
}

/** Lo que hay en la carpeta del paquete viejo. Nunca modifica nada. */
function archivosDe(carpeta) {
  if (!carpeta || !fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) throw falla(`No existe la carpeta del paquete anterior: ${carpeta}`);
  const nombres = fs.readdirSync(carpeta);
  const unico = (re, que) => {
    const hallados = nombres.filter((n) => re.test(n));
    if (hallados.length !== 1) throw falla(`En ${carpeta} tiene que haber exactamente un ${que} y hay ${hallados.length}`);
    return path.join(carpeta, hallados[0]);
  };
  return {
    sqlite: unico(/^package\.sqlite$/, 'package.sqlite'),
    modelo: unico(/^openset_.*\.bin$/, 'modelo Open Set (openset_*.bin)'),
    modeloJson: unico(/^openset_.*\.json$/, 'descripción del modelo Open Set (openset_*.json)'),
    permitidas: unico(/^allowed_by_package\.json$/, 'allowed_by_package.json'),
  };
}

/**
 * Lee y cruza el paquete viejo con su modelo Open Set. Falla con el motivo si algo no cuadra: un paquete
 * que la app va a rechazar (o que aceptaría con un modelo que no es el suyo) no se adapta.
 */
function preparar(carpeta) {
  const f = archivosDe(carpeta);
  const sqliteBytes = fs.readFileSync(f.sqlite);
  const modeloBytes = fs.readFileSync(f.modelo);
  const desc = JSON.parse(fs.readFileSync(f.modeloJson, 'utf8'));
  const permitidasBytes = fs.readFileSync(f.permitidas);
  const permitidasPorDepto = JSON.parse(permitidasBytes.toString('utf8'));

  // Integridad de lo que se recibió.
  if (desc.sha256 && desc.sha256 !== sha256Hex(modeloBytes)) throw falla('El modelo Open Set no coincide con el sha256 de su descripción: el archivo está alterado o incompleto');
  // El sha256 que declara la descripción es el de OTRO allowed_by_package.json (el del repositorio original, con
  // todos los departamentos). No bloquea: lo que sí se exige es que las permitidas de este departamento sean
  // exactamente las especies visuales del paquete (más abajo), que es una prueba más fuerte que un hash.
  const avisos = [];
  if (desc.allowed_by_package_sha256 && desc.allowed_by_package_sha256 !== sha256Hex(permitidasBytes)) {
    avisos.push('allowed_by_package.json no tiene el sha256 que declara openset_*.json (es una copia recortada al departamento); se comprobó contra las especies del paquete');
  }
  const modelo = osrModelo.decodificar(modeloBytes);
  if (!(Number.isFinite(modelo.tau) && modelo.tau > 0)) throw falla('El modelo Open Set no trae un τ válido');
  if (desc.tau != null && Math.abs(desc.tau - modelo.tau) > 1e-12) throw falla('El τ de la descripción no coincide con el del modelo');
  if (desc.centroid_count != null && desc.centroid_count !== modelo.k) throw falla('La cantidad de especies de la descripción no coincide con la del modelo');

  const db = abrir(f.sqlite);
  try {
    const info = Object.fromEntries(db.prepare('SELECT key, value FROM package_info').all().map((r) => [r.key, r.value]));
    for (const k of ['package_id', 'department', 'embedding_dim', 'encoder_onnx_sha256']) if (!info[k]) throw falla(`El paquete anterior no trae package_info.${k}`);
    if (info.encoder_onnx_sha256 !== ENCODER) throw falla(`El paquete anterior usa otro encoder (${info.encoder_onnx_sha256.slice(0, 12)}…) que el del teléfono (${ENCODER.slice(0, 12)}…)`);
    if (desc.encoder_onnx_sha256 && desc.encoder_onnx_sha256 !== info.encoder_onnx_sha256) throw falla('El modelo Open Set y el paquete anterior usan encoders distintos');
    if (Number(info.embedding_dim) !== modelo.dim) throw falla(`El paquete es de ${info.embedding_dim} dimensiones y el modelo Open Set de ${modelo.dim}`);

    const taxaVisuales = db.prepare(`SELECT taxon_id, scientific_name, family, genus, species_epithet, gbif_species_key,
        occurrence_evidence, visual_status, flags FROM taxa WHERE visual_status = 'VISUAL_ENABLED' ORDER BY taxon_id`).all();
    const conVectores = new Set(db.prepare('SELECT DISTINCT taxon_id FROM vec_references').all().map((r) => r.taxon_id));
    const idsTaxa = new Set(taxaVisuales.map((t) => t.taxon_id));
    const sobran = [...conVectores].filter((id) => !idsTaxa.has(id));
    const faltan = [...idsTaxa].filter((id) => !conVectores.has(id));
    if (sobran.length || faltan.length) {
      throw falla(`Las especies con vectores no son las visuales del paquete (con vectores y sin estar habilitadas: ${sobran.join(', ') || 'ninguna'}; habilitadas sin vectores: ${faltan.join(', ') || 'ninguna'})`);
    }

    // Las permitidas del departamento → taxon_id del paquete, con la regla que generó los ids
    // (tools/catalog/generate_species_id.py): ANU_COL_<GÉNERO 4>_<ESPECIE 3>_<seq>.
    const permitidas = permitidasPorDepto[info.department];
    if (!Array.isArray(permitidas) || !permitidas.length) throw falla(`allowed_by_package.json no trae especies para ${info.department}`);
    const codigo = (t) => `ANU_COL_${t.genus.slice(0, 4).toUpperCase()}_${t.species_epithet.slice(0, 3).toUpperCase()}`;
    const mapa = new Map(); // ANU_COL_… → COL_ANURA_…
    for (const anu of permitidas) {
      const candidatos = taxaVisuales.filter((t) => anu.replace(/_\d{3}$/, '') === codigo(t));
      if (candidatos.length !== 1) throw falla(`La especie permitida ${anu} corresponde a ${candidatos.length} taxones del paquete: no se puede asignar un taxon_id sin adivinar`);
      mapa.set(anu, candidatos[0].taxon_id);
    }
    if (new Set(mapa.values()).size !== mapa.size) throw falla('Dos especies permitidas apuntan al mismo taxon_id');
    const mapeados = new Set(mapa.values());
    const sinPermiso = [...idsTaxa].filter((id) => !mapeados.has(id));
    if (sinPermiso.length) throw falla(`Especies visuales del paquete que no están en allowed_by_package.json: ${sinPermiso.join(', ')}`);

    // Filas del modelo original que sobreviven (en su orden) y a qué taxon_id corresponden.
    const filas = [];
    modelo.ids.forEach((anu, i) => { if (mapa.has(anu)) filas.push({ i, anu, taxon: mapa.get(anu) }); });
    if (filas.length !== mapa.size) {
      const enModelo = new Set(modelo.ids);
      throw falla(`El modelo Open Set no trae a todas las especies del paquete (faltan: ${permitidas.filter((a) => !enModelo.has(a)).join(', ')})`);
    }

    const conteo = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
    return {
      carpeta,
      archivos: f,
      sqliteSha256: sha256Hex(sqliteBytes),
      sqliteSize: sqliteBytes.length,
      modeloBytes,
      modeloSha256: sha256Hex(modeloBytes),
      desc,
      modelo,
      info,
      taxa: taxaVisuales,
      mapa,
      filas,
      totalTaxaOriginal: conteo('taxa'),
      avisos,
    };
  } finally {
    db.close();
  }
}

/** Sub-blobs crudos del ANOS original (float64 LE) para las filas que se quedan. */
function modeloFiltrado(plan) {
  const { modelo, modeloBytes, filas } = plan;
  const dim = modelo.dim;
  const precision = modeloBytes.subarray(24, 24 + dim * dim * 8);
  const base = 24 + dim * dim * 8;
  const medias = Buffer.concat(filas.map((x) => modeloBytes.subarray(base + x.i * dim * 8, base + (x.i + 1) * dim * 8)));
  return osrModelo.codificar({ dim, tau: modelo.tau, precision: Buffer.from(precision), medias, ids: filas.map((x) => x.taxon) });
}

/**
 * Construye el sqlite del paquete adaptado. Determinista: `generated_at` sale de la fecha del paquete
 * original (la fecha real de la importación queda en la base y en audit.log), así el mismo paquete viejo
 * produce siempre el mismo archivo y el mismo sha256.
 * @returns { sqlite: Buffer, sha256, size_bytes, plan, resumen }
 */
function adaptar(carpeta, { departamentoDane = null, plan = preparar(carpeta) } = {}) {
  const { info: viejo, taxa, filas } = plan;
  const modelo = modeloFiltrado(plan);
  const ids = new Set(taxa.map((t) => t.taxon_id));

  const orig = abrir(plan.archivos.sqlite);
  const tmp = path.join(os.tmpdir(), `anura-legado-${process.pid}-${crypto.randomBytes(6).toString('hex')}.sqlite`);
  const lite = new DatabaseSync(tmp, { allowExtension: true });
  try {
    sqliteVec.load(lite);
    lite.exec(ESQUEMA);
    lite.exec('BEGIN');

    const st = lite.prepare('INSERT INTO taxa VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of taxa) st.run(t.taxon_id, t.scientific_name, t.family, t.genus, t.species_epithet, t.gbif_species_key, t.occurrence_evidence, t.visual_status, t.flags);

    // Sin dato en la Ficha: filas con NULL, igual que un paquete compilado cuando la Ficha no tiene el dato.
    const ctx = lite.prepare('INSERT INTO taxon_context (taxon_id) VALUES (?)');
    for (const t of taxa) ctx.run(t.taxon_id);

    const img = lite.prepare('INSERT INTO reference_images VALUES (?, ?, ?, ?)');
    for (const r of orig.prepare('SELECT ref_id, source_record_id, license_code, attribution FROM reference_images ORDER BY ref_id').all()) {
      img.run(r.ref_id, r.source_record_id, r.license_code, r.attribution);
    }
    const vec = lite.prepare('INSERT INTO vec_references (rowid, taxon_id, embedding) VALUES (?, ?, ?)');
    const porEspecie = new Map();
    const sumas = new Map();
    let nVectores = 0;
    for (const r of orig.prepare('SELECT rowid, taxon_id, embedding FROM vec_references ORDER BY rowid').all()) {
      if (!ids.has(r.taxon_id)) throw falla(`Un vector de referencia es de ${r.taxon_id}, que no está entre las especies del paquete`);
      const bytes = Buffer.from(r.embedding);
      vec.run(BigInt(r.rowid), r.taxon_id, bytes);
      nVectores += 1;
      porEspecie.set(r.taxon_id, (porEspecie.get(r.taxon_id) || 0) + 1);
      const v = floatsRapido(bytes);
      if (!sumas.has(r.taxon_id)) sumas.set(r.taxon_id, { suma: new Float64Array(v.length), vectores: [] });
      const acc = sumas.get(r.taxon_id);
      for (let d = 0; d < v.length; d++) acc.suma[d] += v[d];
      acc.vectores.push(v);
    }
    const refsEnImg = lite.prepare('SELECT COUNT(*) n FROM reference_images').get().n;
    if (refsEnImg !== nVectores) throw falla(`Hay ${nVectores} vectores de referencia y ${refsEnImg} fichas de licencia: no coinciden`);

    // Centroide de especie = media L2 de los vectores de referencia del PROPIO paquete (mismo cálculo que
    // centroides.js sobre train); la dispersión es la distancia coseno media al centroide.
    const cen = lite.prepare('INSERT INTO centroids VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const t of taxa) {
      const { suma, vectores } = sumas.get(t.taxon_id);
      const norma = Math.hypot(...suma) || 1;
      const c = Array.from(suma, (x) => x / norma);
      const disp = vectores.reduce((s, v) => {
        let dot = 0; let nv = 0;
        for (let d = 0; d < v.length; d++) { dot += v[d] * c[d]; nv += v[d] * v[d]; }
        return s + (1 - dot / (Math.sqrt(nv) || 1));
      }, 0) / vectores.length;
      cen.run('especie', t.taxon_id, 'referencias_del_paquete', vectores.length, null, disp, blob(c));
    }

    lite.prepare('INSERT INTO open_set_model VALUES (1, ?, ?, ?, ?, ?, ?)')
      .run(modelo.formato, modelo.dim, modelo.k, modelo.tau, modelo.sha256, modelo.data);

    const zonas = orig.prepare('SELECT zone_id, label, cells, elev_median_m FROM zones ORDER BY zone_id').all();
    const zSt = lite.prepare('INSERT INTO zones VALUES (?, ?, ?, ?)');
    for (const z of zonas) zSt.run(z.zone_id, z.label, z.cells, z.elev_median_m);
    const gSt = lite.prepare('INSERT INTO grid_cells VALUES (?, ?, ?, ?)');
    const celdas = orig.prepare('SELECT row, col, zone_id, assignment FROM grid_cells ORDER BY row, col').all();
    for (const g of celdas) gSt.run(g.row, g.col, g.zone_id, g.assignment);
    const zmSt = lite.prepare('INSERT INTO zone_prior_meta VALUES (?, ?, ?)');
    for (const z of orig.prepare('SELECT zone_id, prior_weight, p_unobserved FROM zone_prior_meta ORDER BY zone_id').all()) zmSt.run(z.zone_id, z.prior_weight, z.p_unobserved);
    const zpSt = lite.prepare('INSERT INTO zone_prior VALUES (?, ?, ?)');
    let zonePriorFilas = 0;
    let zonePriorDescartadas = 0;
    for (const z of orig.prepare('SELECT zone_id, taxon_id, p FROM zone_prior ORDER BY zone_id, taxon_id').all()) {
      if (ids.has(z.taxon_id)) { zpSt.run(z.zone_id, z.taxon_id, z.p); zonePriorFilas += 1; } else zonePriorDescartadas += 1;
    }
    const wpSt = lite.prepare('INSERT INTO weather_prior VALUES (?, ?, ?, ?, ?, ?)');
    let climaFilas = 0;
    for (const w of orig.prepare('SELECT taxon_id, n, temp_mean, temp_std, hum_mean, hum_std FROM weather_prior ORDER BY taxon_id').all()) {
      if (!ids.has(w.taxon_id)) continue;
      wpSt.run(w.taxon_id, w.n, w.temp_mean, w.temp_std, w.hum_mean, w.hum_std);
      climaFilas += 1;
    }
    const wmSt = lite.prepare('INSERT INTO weather_prior_meta VALUES (?, ?)');
    const climaMeta = orig.prepare('SELECT key, value FROM weather_prior_meta ORDER BY key').all();
    for (const m of climaMeta) wmSt.run(m.key, m.value);
    const ptSt = lite.prepare('INSERT INTO occurrence_points VALUES (?, ?, ?)');
    let puntos = 0;
    for (const p of orig.prepare('SELECT taxon_id, latitude, longitude FROM occurrence_points ORDER BY rowid').all()) {
      if (!ids.has(p.taxon_id)) continue;
      ptSt.run(p.taxon_id, p.latitude, p.longitude);
      puntos += 1;
    }

    const generado = `${viejo.created_on || '1970-01-01'}T00:00:00.000Z`;
    const info = {
      package_id: viejo.package_id,
      // El paquete viejo era 1.0.0; con el modelo Open Set del release 1.1.0 el paquete adaptado es 1.1.0.
      package_version: /openset_v([\d.]+?)_/.exec(plan.desc.artifact || '')?.[1] || viejo.package_version,
      ...(departamentoDane ? { department_dane: departamentoDane } : {}),
      department: viejo.department,
      subregion: 'Todo el departamento (paquete departamental)',
      subregion_key: 'DEPARTAMENTO',
      created_on: viejo.created_on || '',
      generated_at: generado,
      data_version: viejo.data_version || '',
      centroids_run: '',
      encoder_onnx_file: viejo.encoder_onnx_file || '',
      encoder_onnx_sha256: viejo.encoder_onnx_sha256,
      embedding_dim: String(modelo.dim),
      distance: viejo.distance || 'cosine (embeddings L2-normalizados)',
      preprocessing: viejo.preprocessing || '',
      normalization: viejo.normalization || '',
      visual_taxa: String(taxa.length),
      k_taxa: String(taxa.length),
      reference_vectors: String(nVectores),
      occurrence_points: String(puntos),
      osr_threshold_id: plan.desc.threshold_release || '',
      osr_tau: String(modelo.tau),
      osr_model_format: modelo.formato,
      osr_model_sha256: modelo.sha256,
      osr_model_species: String(modelo.k),
      // Del paquete viejo, tal cual: cómo se arma la rejilla de zonas y de dónde salen sus priors.
      cell_rule: viejo.cell_rule || '',
      cell_size_degrees: viejo.cell_size_degrees || '',
      grid_sha256: viejo.grid_sha256 || '',
      encoder_checkpoint_sha256: viejo.encoder_checkpoint_sha256 || '',
      vectors_sha256: viejo.vectors_sha256 || '',
      zone_prior: `${zonas.length} zonas, ${zonePriorFilas} filas (p por especie y zona) del paquete anterior`,
      weather_prior: `${climaFilas} especies con prior de clima del paquete anterior`,
      // Lo que el paquete anterior no tenía: vacío y dicho, nunca inventado.
      morph_centroids: 'sin datos: el paquete anterior no tenía morfos',
      clusters: 'sin datos: el paquete anterior no tenía clústeres aceptados',
      taxon_context: 'sin datos: el paquete anterior no tenía Ficha técnica (altitud, pesos, LRC)',
      centroids: 'media L2 de los vectores de referencia del paquete (nivel especie); sin supercentroides de género ni familia',
      // Rastro del origen.
      origen: 'legado',
      origen_package_id: viejo.package_id,
      origen_package_version: viejo.package_version || '',
      origen_sha256: plan.sqliteSha256,
      origen_taxa_catalogo: String(plan.totalTaxaOriginal),
      origen_taxa_sha256: viejo.taxa_sha256 || '',
      origen_openset_archivo: path.basename(plan.archivos.modelo),
      origen_openset_sha256: plan.modeloSha256,
      origen_openset_especies: String(plan.modelo.k),
      taxa_nota: `taxa se reduce a las ${taxa.length} especies con vectores y modelo de rechazo: la app exige que el modelo cubra exactamente las especies del paquete`,
      adaptador_formato: String(FORMATO_ADAPTADOR),
    };
    const pi = lite.prepare('INSERT INTO package_info VALUES (?, ?)');
    for (const [k, v] of Object.entries(info)) pi.run(k, v);
    lite.exec('COMMIT');
    lite.close();

    const sqlite = fs.readFileSync(tmp);
    const resumen = {
      taxa: taxa.map((t) => ({
        taxon_id: t.taxon_id,
        nombre_cientifico: t.scientific_name,
        genero: t.genus,
        familia: t.family,
        referencias: porEspecie.get(t.taxon_id) || 0,
      })),
      vectores: nVectores,
      puntos_ocurrencia: puntos,
      zonas: zonas.length,
      celdas: celdas.length,
      zone_prior_filas: zonePriorFilas,
      zone_prior_filas_descartadas: zonePriorDescartadas,
      clima_especies: climaFilas,
      taxa_descartadas: plan.totalTaxaOriginal - taxa.length,
      modelo: { formato: modelo.formato, tabla: 'open_set_model', sha256: modelo.sha256, size_bytes: modelo.size_bytes, especies: modelo.k, dim: modelo.dim },
      tau: modelo.tau,
      generado,
      origen: {
        tipo: 'legado',
        package_id: viejo.package_id,
        package_version: viejo.package_version || null,
        sha256_original: plan.sqliteSha256,
        openset: { archivo: path.basename(plan.archivos.modelo), sha256: plan.modeloSha256, especies_originales: plan.modelo.k, threshold_release: plan.desc.threshold_release || null },
        taxa_originales: plan.totalTaxaOriginal,
      },
      encoder: { sha256: viejo.encoder_onnx_sha256, archivo: viejo.encoder_onnx_file || '', dimension: modelo.dim },
      departamento: viejo.department,
      info,
    };
    return { sqlite, sha256: sha256Hex(sqlite), size_bytes: sqlite.length, plan, resumen };
  } finally {
    orig.close();
    try { lite.close(); } catch { /* ya cerrada */ }
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Comprueba el sqlite adaptado como lo hace la app: PackageOpenSets.decode (formato, sha256, ids ==
 * taxa), PackageVectorIndex.nearest (k-NN coseno con sqlite-vec) y OpenSetModel.score (Mahalanobis).
 * Además lo compara con el paquete y el modelo originales. Lanza con TODOS los fallos; si pasa devuelve
 * lo medido.
 */
function validar(sqliteBuf, plan) {
  const fallos = [];
  const ok = (cond, msg) => { if (!cond) fallos.push(msg); };
  const tmp = path.join(os.tmpdir(), `anura-legado-val-${process.pid}-${crypto.randomBytes(6).toString('hex')}.sqlite`);
  fs.writeFileSync(tmp, sqliteBuf);
  const db = abrir(tmp);
  try {
    const taxa = db.prepare('SELECT taxon_id FROM taxa').all().map((r) => r.taxon_id);
    const idsTaxa = new Set(taxa);
    ok(taxa.length === plan.taxa.length, `taxa tiene ${taxa.length} y deberían ser ${plan.taxa.length}`);

    // PackageOpenSets.decode
    const fila = db.prepare('SELECT id, format, dim, species, tau, sha256, data FROM open_set_model WHERE id = 1').get();
    ok(!!fila, 'falta la fila open_set_model id = 1');
    if (!fila) throw falla(`El paquete adaptado no pasa las comprobaciones de la app:\n - ${fallos.join('\n - ')}`, 500);
    const data = Buffer.from(fila.data);
    ok(fila.format === osrModelo.FORMATO, `formato de rechazo ${fila.format}`);
    ok(sha256Hex(data) === fila.sha256, 'el sha256 de open_set_model no coincide con su blob');
    let nuevo = null;
    try { nuevo = osrModelo.decodificar(data); } catch (e) { ok(false, `el ANOS no se decodifica: ${e.message}`); }
    if (nuevo) {
      ok(nuevo.ids.length === taxa.length && new Set(nuevo.ids).size === nuevo.ids.length && nuevo.ids.every((id) => idsTaxa.has(id)),
        'los ids del modelo no coinciden EXACTAMENTE con los de taxa');
      ok(nuevo.dim === 512 && fila.dim === 512 && fila.species === nuevo.k, 'dim/species de la fila no coinciden con el blob');
      ok(Math.abs(nuevo.tau - plan.modelo.tau) < 1e-12 && fila.tau === nuevo.tau, 'el τ del modelo adaptado no es el del original');
      const info = Object.fromEntries(db.prepare('SELECT key, value FROM package_info').all().map((r) => [r.key, r.value]));
      ok(info.osr_model_sha256 === fila.sha256 && info.osr_tau === String(nuevo.tau) && info.origen === 'legado' && info.origen_sha256 === plan.sqliteSha256,
        'package_info no describe el modelo y el origen');
      ok(info.encoder_onnx_sha256 === ENCODER, 'package_info trae otro encoder');
      // La precisión y cada media son las del modelo original, byte a byte.
      const orig = plan.modelo;
      ok(orig.precision.length === nuevo.precision.length && orig.precision.every((x, i) => x === nuevo.precision[i]), 'la precisión compartida difiere de la original');
      nuevo.ids.forEach((id, k) => {
        const anu = [...plan.mapa.entries()].find(([, t]) => t === id)?.[0];
        const io = orig.ids.indexOf(anu);
        let igual = io >= 0;
        for (let d = 0; igual && d < nuevo.dim; d++) igual = orig.centroides[io * nuevo.dim + d] === nuevo.centroides[k * nuevo.dim + d];
        ok(igual, `la media de ${id} difiere de la de ${anu} en el modelo original`);
      });
    }

    // Lo que la app consulta: tablas y columnas.
    for (const t of ['taxa', 'vec_references', 'reference_images', 'grid_cells', 'zone_prior', 'zone_prior_meta', 'weather_prior', 'weather_prior_meta', 'occurrence_points', 'zones', 'centroids', 'package_info']) {
      try { ok(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n > 0, `${t} está vacía`); } catch (e) { ok(false, `no se puede leer ${t}: ${e.message}`); }
    }
    for (const t of ['morph_centroids', 'clusters']) {
      ok(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n === 0, `${t} debería ir vacía`);
    }
    const zonas = new Set(db.prepare('SELECT zone_id FROM zones').all().map((r) => r.zone_id));
    ok(db.prepare('SELECT DISTINCT zone_id FROM grid_cells').all().every((r) => zonas.has(r.zone_id)), 'grid_cells apunta a una zona que no existe');
    ok(db.prepare('SELECT DISTINCT zone_id FROM zone_prior_meta').all().every((r) => zonas.has(r.zone_id)), 'zone_prior_meta apunta a una zona que no existe');
    for (const [t, c] of [['zone_prior', 'taxon_id'], ['weather_prior', 'taxon_id'], ['occurrence_points', 'taxon_id'], ['vec_references', 'taxon_id'], ['centroids', 'name']]) {
      ok(db.prepare(`SELECT DISTINCT ${c} AS id FROM ${t}`).all().every((r) => idsTaxa.has(r.id)), `${t} tiene una especie que no está en taxa`);
    }
    ok(db.prepare('SELECT COUNT(*) n FROM vec_references').get().n === db.prepare('SELECT COUNT(*) n FROM reference_images').get().n, 'vectores y fichas de licencia no coinciden');

    // k-NN (PackageVectorIndex.nearest) y Mahalanobis (OpenSetModel.score) con un vector de referencia por especie.
    const medidas = { especies: 0, knn_propio: 0, voto_propio: 0, aceptadas: 0, mahalanobis_max_dif: 0, centroide_propio: 0, mahalanobis_min: Infinity, mahalanobis_max: 0 };
    if (nuevo) {
      const mediasNuevas = Array.from({ length: nuevo.k }, (_, k) => nuevo.centroides.subarray(k * nuevo.dim, (k + 1) * nuevo.dim));
      const orig = plan.modelo;
      const filasOrig = plan.filas; // {i, anu, taxon} en el orden del original
      const mediasOrig = filasOrig.map((x) => orig.centroides.subarray(x.i * orig.dim, (x.i + 1) * orig.dim));
      const knn = db.prepare('SELECT taxon_id, distance FROM vec_references WHERE embedding MATCH ? AND k = ? ORDER BY distance');
      for (const t of taxa) {
        const r = db.prepare('SELECT embedding FROM vec_references WHERE taxon_id = ? ORDER BY rowid LIMIT 1').get(t);
        if (!r) { ok(false, `${t} no tiene vectores`); continue; }
        medidas.especies += 1;
        const bytes = Buffer.from(r.embedding);
        const vecinos = knn.all(bytes, K);
        if (vecinos[0]?.taxon_id === t && vecinos[0].distance < 1e-4) medidas.knn_propio += 1;
        else ok(false, `el k-NN de un vector de ${t} no devuelve su propia especie primero`);
        const votos = new Map();
        for (const v of vecinos) votos.set(v.taxon_id, (votos.get(v.taxon_id) || 0) + (1 - v.distance));
        if ([...votos.entries()].sort((a, b) => b[1] - a[1])[0][0] === t) medidas.voto_propio += 1;
        const x = floatsRapido(bytes);
        const a = M.minimaConPrecision(x, mediasNuevas, nuevo.precision, nuevo.dim);
        const b = M.minimaConPrecision(x, mediasOrig, orig.precision, orig.dim);
        const dif = Math.abs(a.distancia - b.distancia);
        medidas.mahalanobis_max_dif = Math.max(medidas.mahalanobis_max_dif, dif);
        ok(dif < 1e-9 && nuevo.ids[a.indice] === filasOrig[b.indice].taxon, `Mahalanobis de un vector de ${t}: adaptado ${a.distancia} contra original filtrado ${b.distancia}`);
        if (nuevo.ids[a.indice] === t) medidas.centroide_propio += 1;
        if (a.distancia <= nuevo.tau) medidas.aceptadas += 1;
        medidas.mahalanobis_min = Math.min(medidas.mahalanobis_min, a.distancia);
        medidas.mahalanobis_max = Math.max(medidas.mahalanobis_max, a.distancia);
      }
    }
    if (fallos.length) throw falla(`El paquete adaptado no pasa las comprobaciones de la app:\n - ${fallos.join('\n - ')}`, 500, { fallos });
    return medidas;
  } finally {
    db.close();
    fs.rmSync(tmp, { force: true });
  }
}

/** Manifiesto (paquete.json y columna `manifiesto`) de UNA subregión que comparte el archivo adaptado. */
function manifiestoDe(art, { paqueteId, version, departamento, subregion }) {
  const r = art.resumen;
  return {
    formato: 1,
    paquete_id: paqueteId,
    version,
    generado: r.generado,
    origen: r.origen,
    departamento,
    subregion: { id: subregion.id, clave: subregion.clave, nombre: subregion.nombre },
    cobertura: 'Paquete de todo el departamento: es el mismo archivo para todas sus subregiones',
    encoder: r.encoder,
    dataset_version: null,
    centroides: { experimento_id: null },
    osr: {
      umbral_id: null,
      tau: r.tau,
      validado: null,
      calibracion_id: null,
      origen: r.origen.openset.threshold_release,
      modelo: r.modelo,
    },
    especies: r.taxa.map((e) => ({
      taxon_id: e.taxon_id,
      nombre_cientifico: e.nombre_cientifico,
      genero: e.genero,
      familia: e.familia,
      referencias: e.referencias,
      individuos_en_subregion: null,
      centroide: 'referencias',
      contexto: null,
    })),
    morfos: [],
    clusteres: [],
    supercentroides: { generos: 0, familias: 0 },
    vectores: r.vectores,
    puntos_ocurrencia: r.puntos_ocurrencia,
    priors: {
      zona: { zonas: r.zonas, celdas: r.celdas, filas: r.zone_prior_filas, origen: 'paquete anterior' },
      clima: { especies: r.clima_especies, origen: 'paquete anterior' },
    },
    archivo: { nombre: 'package.sqlite', formato: 'sqlite', sha256: art.sha256, size_bytes: art.size_bytes },
  };
}

const existe = async (minio, bucket, key, size) => {
  try {
    const st = await minio.statObject(bucket, key);
    if (st.size !== size) throw falla(`En MinIO ya hay un objeto ${key} con otro tamaño (${st.size} en vez de ${size}); no se sobrescribe`, 409);
    return true;
  } catch (err) {
    if (err.status) throw err;
    if (err.code === 'NotFound' || err.code === 'NoSuchKey') return false;
    throw err;
  }
};

/**
 * Importa el paquete anterior al servidor: un registro por subregión del departamento (el servidor
 * publica por subregión), todos con el MISMO objeto en MinIO. Cada registro queda 'publicado' si su
 * subregión no tiene ya una versión publicada; si la tiene, entra 'retirado' (restaurable): un paquete
 * anterior nunca desplaza a uno vigente. No exige las dos aprobaciones (es un paquete ya validado
 * antes), pero queda auditado y marcado origen = 'legado'. Idempotente: repetirlo no duplica nada.
 *
 * @param opts { userId, cuenta: {id, name}, departamento?: código DANE }
 */
async function importar({ pool, minio, bucket }, carpeta, { userId, cuenta, departamento = null }) {
  if (!userId) throw falla('Indica quién importa (id de usuario del panel)');
  const plan = preparar(carpeta);
  const { rows: [region] } = departamento
    ? await pool.query('SELECT codigo_dane, nombre FROM dataset.region WHERE codigo_dane = $1', [departamento])
    : await pool.query('SELECT codigo_dane, nombre FROM dataset.region WHERE lower(nombre) = lower($1)', [plan.info.department]);
  if (!region) throw falla(`El departamento ${departamento || plan.info.department} no existe en Regiones: créalo (y sus subregiones) antes de importar`, 409);
  const { rows: subregiones } = await pool.query('SELECT id, clave, nombre, region FROM dataset.subregion WHERE region = $1 ORDER BY numero', [region.codigo_dane]);
  if (!subregiones.length) throw falla(`${region.nombre} no tiene subregiones: divídelo en Regiones antes de importar`, 409);

  const art = adaptar(carpeta, { departamentoDane: region.codigo_dane, plan });
  const medidas = validar(art.sqlite, plan);

  // Avisos (no bloquean): especies del paquete que la base no conoce por taxon_id.
  const { rows: conocidas } = await pool.query('SELECT taxon_id FROM dataset.especie WHERE taxon_id = ANY($1)', [plan.taxa.map((t) => t.taxon_id)]);
  const sabidas = new Set(conocidas.map((r) => r.taxon_id));
  const desconocidas = plan.taxa.filter((t) => !sabidas.has(t.taxon_id)).map((t) => t.taxon_id);

  const claveSqlite = `paquetes/legado/${region.codigo_dane}-${plan.sqliteSha256.slice(0, 12)}/package.sqlite`;
  if (!(await existe(minio, bucket, claveSqlite, art.size_bytes))) {
    await minio.putObject(bucket, claveSqlite, art.sqlite, art.size_bytes, { 'Content-Type': 'application/vnd.sqlite3' });
  }

  const resultado = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sub of subregiones) {
      const paqueteId = `${sub.region}.${sub.clave}`;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`paquete:${paqueteId}`]);
      const { rows: [ya] } = await client.query(
        `SELECT id, version, estado FROM packages.regional_packages
         WHERE region_id = $1 AND origen = 'legado' AND manifiesto->'origen'->>'sha256_original' = $2`, [paqueteId, plan.sqliteSha256]);
      if (ya) {
        resultado.push({ subregion: sub.nombre, paquete_id: paqueteId, id: ya.id, version: ya.version, estado: ya.estado, nuevo: false });
        continue;
      }
      const { rows: [{ version }] } = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM packages.regional_packages WHERE region_id = $1', [paqueteId]);
      const { rows: [vigente] } = await client.query("SELECT id FROM packages.regional_packages WHERE region_id = $1 AND estado = 'publicado'", [paqueteId]);
      const estado = vigente ? 'retirado' : 'publicado';
      const manifiesto = manifiestoDe(art, { paqueteId, version, departamento: { codigo_dane: region.codigo_dane, nombre: region.nombre }, subregion: sub });
      const claveJson = `paquetes/${paqueteId}/v${version}/paquete.json`;
      const texto = `${JSON.stringify(manifiesto, null, 2)}\n`;
      await minio.putObject(bucket, claveJson, Buffer.from(texto), Buffer.byteLength(texto), { 'Content-Type': 'application/json' });
      const publicado = estado === 'publicado';
      const { rows: [p] } = await client.query(`
        INSERT INTO packages.regional_packages
          (region_id, version, storage_key, sha256, size_bytes, subregion_id, estado, is_published, published_at, especies,
           encoder_sha256, tau, manifiesto, manifiesto_key, compilado_por, compilado_cuenta, compilado_nombre,
           publicado_por, publicado_nombre, origen)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${publicado ? 'NOW()' : 'NULL'}, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'legado')
        RETURNING id`,
      [paqueteId, version, claveSqlite, art.sha256, art.size_bytes, sub.id, estado, publicado, art.resumen.taxa.length,
        art.resumen.encoder.sha256, art.resumen.tau, manifiesto, claveJson, userId, cuenta?.id ? String(cuenta.id) : null, cuenta?.name || null,
        publicado ? userId : null, publicado ? cuenta?.name || null : null]);
      await registrar(client, userId, 'dataset.paquete.importado_legado', 'paquete', p.id, {
        paquete: paqueteId, version, estado, subregion: sub.nombre,
        sha256: art.sha256, size_bytes: art.size_bytes, sha256_original: plan.sqliteSha256,
        openset_sha256: plan.modeloSha256, especies: art.resumen.taxa.length, vectores: art.resumen.vectores,
        storage_key: claveSqlite, origen_package_id: plan.info.package_id,
      });
      resultado.push({ subregion: sub.nombre, paquete_id: paqueteId, id: p.id, version, estado, nuevo: true });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return {
    departamento: region,
    sha256: art.sha256,
    sha256_original: plan.sqliteSha256,
    size_bytes: art.size_bytes,
    storage_key: claveSqlite,
    especies: art.resumen.taxa.length,
    taxa_descartadas: art.resumen.taxa_descartadas,
    vectores: art.resumen.vectores,
    tau: art.resumen.tau,
    medidas,
    taxon_id_desconocidos: desconocidas,
    avisos: plan.avisos,
    subregiones: resultado,
  };
}

module.exports = { preparar, adaptar, validar, importar, manifiestoDe, modeloFiltrado };
