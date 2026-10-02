/**
 * Descarga de fotos de iNaturalist desde el panel (Admin → Scraping). Mismo criterio que
 * scraper_inaturalist.py: Colombia (place_id 7196), original → large → medium, sin renacuajos.
 * Cada foto se recodifica a JPEG 95 sin metadatos, se guarda en MinIO con su sha256 y queda en
 * dataset.foto con licencia, autor y coordenada: lista para Curación, Contenido y el dataset.
 *
 * El progreso vive en memoria (una descarga a la vez, para respetar el límite de iNaturalist):
 * si el servicio se reinicia, la descarga se corta y lo ya guardado se conserva; al repetirla
 * se omiten las fotos que ya están.
 */
const crypto = require('crypto');
const sharp = require('sharp');
const auditar = require('./audit').registrar;
const altitud = require('./altitud');

const INAT = process.env.INAT_API_URL || 'https://api.inaturalist.org/v1';
const COLOMBIA = '7196';
const GRADOS = ['research', 'needs_id', 'casual', 'none'];
const MAX_POR_DESCARGA = 500;
const MAX_PAGINAS = 20;
const ESPERA_MS = Number(process.env.INAT_ESPERA_MS ?? 1000);

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const dormir = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// especie_id → progreso. Solo hay una descarga activa a la vez.
const trabajos = new Map();
let activa = null;

async function inatGet(ruta, params) {
  const url = `${INAT}/${ruta}?${params}`;
  for (let intento = 0; intento < 3; intento++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (res.status === 429 || res.status >= 500) { await dormir(2000 * (intento + 1)); continue; }
    if (!res.ok) throw falla(`iNaturalist respondió ${res.status}`, 502);
    return res.json();
  }
  throw falla('iNaturalist no responde ahora (límite de peticiones o caída). Inténtalo en unos minutos.', 502);
}

function esRenacuajo(obs) {
  for (const a of obs.annotations ?? []) {
    const atributo = (a.controlled_attribute?.label ?? '').toLowerCase();
    const valor = (a.controlled_value?.label ?? '').toLowerCase();
    if (['life stage', 'etapa de vida', 'stage'].includes(atributo) && ['tadpole', 'renacuajo', 'larva', 'larvae'].includes(valor)) return true;
  }
  return false;
}

async function buscarTaxon(nombre) {
  const r = await inatGet('taxa', new URLSearchParams({ q: nombre, rank: 'species', per_page: '5', is_active: 'true' }));
  const exacto = (r.results ?? []).find((t) => (t.name || '').toLowerCase() === nombre.toLowerCase());
  return exacto || null;
}

function paramsObs(taxonId, grado, extra = {}) {
  const p = new URLSearchParams({ taxon_id: String(taxonId), place_id: COLOMBIA, order_by: 'id', order: 'desc', ...extra });
  p.append('has[]', 'photos');
  if (grado !== 'none') p.set('quality_grade', grado);
  return p;
}

/** Lo que ya hay guardado de la especie, medido en la base. */
async function conteosLocales(pool, especieId) {
  const { rows: [c] } = await pool.query(`
    SELECT COUNT(f.sha256)::int AS almacenadas,
           COUNT(f.sha256) FILTER (WHERE o.fuente = 'inaturalist')::int AS de_inaturalist,
           COUNT(f.sha256) FILTER (WHERE f.licencia IS NOT NULL AND f.licencia <> 'all-rights-reserved')::int AS con_licencia_cc,
           COUNT(f.sha256) FILTER (WHERE f.licencia IS NULL OR f.licencia = 'all-rights-reserved')::int AS sin_licencia_cc,
           COUNT(DISTINCT o.fuente_id) FILTER (WHERE o.fuente = 'inaturalist')::int AS observaciones_inat
    FROM dataset.foto f LEFT JOIN dataset.observacion o ON o.id = f.observacion_id
    WHERE f.especie_id = $1`, [especieId]);
  return c;
}

/**
 * GET resumen: candidatas en iNaturalist (observaciones con foto en Colombia) frente a lo
 * almacenado. Si iNaturalist no responde, se devuelven solo los conteos locales y el motivo.
 */
async function resumen(pool, especieId, grado = 'research') {
  if (!GRADOS.includes(grado)) throw falla('Grado de calidad no válido');
  const { rows: [especie] } = await pool.query('SELECT id, nombre_cientifico FROM dataset.especie WHERE id = $1', [especieId]);
  if (!especie) throw falla('La especie no existe en el dataset', 404);
  const local = await conteosLocales(pool, especieId);
  const salida = { especie_id: especie.id, nombre_cientifico: especie.nombre_cientifico, calidad: grado, local,
    remoto: null, remoto_error: null, pendientes_observaciones: null, descarga: trabajos.get(especieId) || null };
  try {
    const taxon = await buscarTaxon(especie.nombre_cientifico);
    if (!taxon) {
      salida.remoto_error = 'iNaturalist no tiene una especie con ese nombre exacto. Revisa la ortografía en Especies.';
      return salida;
    }
    const r = await inatGet('observations', paramsObs(taxon.id, grado, { per_page: '1' }));
    salida.remoto = { taxon_id: taxon.id, observaciones_candidatas: r.total_results ?? 0 };
    salida.pendientes_observaciones = Math.max(0, (r.total_results ?? 0) - local.observaciones_inat);
  } catch (err) {
    salida.remoto_error = err.message;
  }
  return salida;
}

async function descargarImagen(urlCuadrada) {
  for (const talla of ['original', 'large', 'medium']) {
    try {
      const res = await fetch(urlCuadrada.replace('/square.', `/${talla}.`), { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0 && buf.length <= 25 * 1024 * 1024) return buf;
    } catch { /* prueba la talla siguiente */ }
  }
  return null;
}

async function guardarFoto({ pool, minio, bucket }, especie, obs, foto, buffer) {
  let jpeg, info;
  try {
    ({ data: jpeg, info } = await sharp(buffer).rotate().jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true }));
  } catch {
    throw falla('Archivo de imagen ilegible');
  }
  const hash = sha256(jpeg);
  const { rows: dup } = await pool.query('SELECT 1 FROM dataset.foto WHERE sha256 = $1 OR sha256_origen = $2', [hash, sha256(buffer)]);
  if (dup.length) return 'duplicada';
  const objectKey = `fotos/${hash.slice(0, 2)}/${hash}.jpg`;
  await minio.putObject(bucket, objectKey, jpeg, jpeg.length, { 'Content-Type': 'image/jpeg' });

  const [lat, lon] = typeof obs.location === 'string' && obs.location.includes(',') ? obs.location.split(',').map(Number) : [null, null];
  const hayCoord = Number.isFinite(lat) && Number.isFinite(lon);
  const alt = hayCoord ? await altitud.alCrear(lat, lon).catch(() => ({ altitud_m: null, fuente: null })) : { altitud_m: null, fuente: null };
  const oculta = Boolean(obs.obscured || (obs.geoprivacy && obs.geoprivacy !== 'open') || (obs.taxon_geoprivacy && obs.taxon_geoprivacy !== 'open'));

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [o] } = await db.query(`
      INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud, incertidumbre_m, coordenada_oculta, coordenada_fuente,
        lugar, observada_en, limpieza_metodo, altitud_m, altitud_lat, altitud_lon, altitud_fuente, altitud_calculada)
      VALUES ('inaturalist', $1, $2, $3, $4, $5, $6, $7, $8, 'pendiente_de_limpieza', $9, $10, $11, $12, $13)
      ON CONFLICT (fuente, fuente_id) DO UPDATE SET fuente_id = EXCLUDED.fuente_id RETURNING id`,
      [String(obs.id), hayCoord ? lat : null, hayCoord ? lon : null, obs.positional_accuracy ?? null, oculta,
        hayCoord ? 'inaturalist_api' : null, obs.place_guess ?? null, obs.observed_on || null,
        alt.altitud_m, alt.altitud_m === null || !hayCoord ? null : lat, alt.altitud_m === null || !hayCoord ? null : lon,
        alt.fuente, alt.altitud_m === null ? null : new Date()]);
    await db.query(`
      INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, fuente_foto_id, ancho, alto, bytes,
        licencia, atribucion, url_origen, estado, sha256_origen)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [hash, objectKey, especie.id, o.id, `col_obs_${obs.id}_photo_${foto.id}.jpg`, String(foto.id), info.width, info.height, jpeg.length,
        foto.license_code || 'all-rights-reserved', foto.attribution || null, obs.uri || null,
        especie.taxon_id ? 'catalogo' : 'fuera_de_catalogo', sha256(buffer)]);
    await db.query('COMMIT');
    return 'guardada';
  } catch (err) {
    await db.query('ROLLBACK');
    await minio.removeObject(bucket, objectKey).catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

async function correr(ctx, especie, taxonId, opciones, progreso, userId) {
  const { pool } = ctx;
  try {
    for (let pagina = 1; pagina <= MAX_PAGINAS && progreso.estado === 'en_curso'; pagina++) {
      const r = await inatGet('observations', paramsObs(taxonId, opciones.calidad, { per_page: '50', page: String(pagina) }));
      const lote = r.results ?? [];
      if (pagina === 1) progreso.observaciones_total = r.total_results ?? lote.length;
      for (const obs of lote) {
        if (progreso.guardadas >= opciones.max) break;
        progreso.observaciones_revisadas++;
        if (esRenacuajo(obs)) { progreso.renacuajos_omitidos++; continue; }
        for (const foto of obs.photos ?? []) {
          if (progreso.guardadas >= opciones.max || progreso.estado !== 'en_curso') break;
          if (!foto.url) continue;
          const licencia = foto.license_code || 'all-rights-reserved';
          if (opciones.solo_cc && licencia === 'all-rights-reserved') { progreso.sin_licencia_omitidas++; continue; }
          const { rows: ya } = await pool.query('SELECT 1 FROM dataset.foto WHERE fuente_foto_id = $1 AND especie_id = $2', [String(foto.id), especie.id]);
          if (ya.length) { progreso.ya_estaban++; continue; }
          try {
            const buf = await descargarImagen(foto.url);
            if (!buf) throw falla('No se pudo bajar la imagen');
            const destino = await guardarFoto(ctx, especie, obs, foto, buf);
            if (destino === 'guardada') progreso.guardadas++; else progreso.ya_estaban++;
          } catch (err) {
            progreso.fallidas++;
            if (progreso.errores.length < 5) progreso.errores.push(`foto ${foto.id}: ${err.message}`);
          }
          await dormir(ESPERA_MS);
        }
      }
      if (lote.length < 50 || progreso.guardadas >= opciones.max) break;
      await dormir(ESPERA_MS);
    }
    if (progreso.estado === 'en_curso') progreso.estado = 'terminada';
  } catch (err) {
    progreso.estado = 'con_error';
    progreso.error = err.message;
  } finally {
    progreso.termino = new Date().toISOString();
    activa = null;
    await auditar(pool, userId, 'dataset.foto.descarga_inaturalist', 'especie', String(especie.id),
      { estado: progreso.estado, guardadas: progreso.guardadas, fallidas: progreso.fallidas, ya_estaban: progreso.ya_estaban, calidad: opciones.calidad })
      .catch(() => {});
  }
}

/** POST descargar: valida, deja la descarga corriendo en segundo plano y responde al instante. */
async function iniciar(ctx, especieId, cuerpo, userId) {
  const calidad = cuerpo.calidad || 'research';
  if (!GRADOS.includes(calidad)) throw falla('Grado de calidad no válido');
  const max = Math.floor(Number(cuerpo.max));
  if (!(max >= 1)) throw falla('Indica cuántas fotos nuevas bajar (al menos 1)');
  if (max > MAX_POR_DESCARGA) throw falla(`Cada descarga admite hasta ${MAX_POR_DESCARGA} fotos. Repite la descarga para traer más.`);
  if (activa !== null) {
    throw falla(activa === especieId ? 'Esta especie ya se está descargando' : 'Ya hay otra descarga en curso. Espera a que termine.', 409);
  }
  const { rows: [especie] } = await ctx.pool.query('SELECT id, nombre_cientifico, taxon_id FROM dataset.especie WHERE id = $1', [especieId]);
  if (!especie) throw falla('La especie no existe en el dataset', 404);
  const taxon = await buscarTaxon(especie.nombre_cientifico);
  if (!taxon) throw falla('iNaturalist no tiene una especie con ese nombre exacto. Revisa la ortografía en Especies.', 404);
  if (activa !== null) throw falla('Ya hay otra descarga en curso. Espera a que termine.', 409);
  activa = especieId;
  const progreso = { estado: 'en_curso', calidad, max, solo_cc: Boolean(cuerpo.solo_cc), inicio: new Date().toISOString(), termino: null,
    observaciones_total: null, observaciones_revisadas: 0, guardadas: 0, ya_estaban: 0, fallidas: 0, renacuajos_omitidos: 0,
    sin_licencia_omitidas: 0, errores: [], error: null };
  trabajos.set(especieId, progreso);
  correr(ctx, especie, taxon.id, { calidad, max, solo_cc: progreso.solo_cc }, progreso, userId);
  return progreso;
}

function estado(especieId) {
  return trabajos.get(especieId) || null;
}

/** Cancela cooperativamente: termina tras la foto en curso. */
function cancelar(especieId) {
  const p = trabajos.get(especieId);
  if (!p || p.estado !== 'en_curso') throw falla('No hay una descarga en curso para esta especie', 409);
  p.estado = 'cancelada';
  return p;
}

module.exports = { resumen, iniciar, estado, cancelar, GRADOS };
