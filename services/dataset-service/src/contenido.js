/**
 * Ficha pública (K): una sola fuente de contenido, editada en Admin → Contenido y publicada
 * con el aval del herpetólogo. Es CONTENIDO, no modelo: vive aparte del paquete de
 * identificación — corregir un nombre común no recompila centroides. Ver 19_ADMIN/
 * Ficha Publica, Explorador y Destacados.md.
 *
 * Reglas:
 * - Un campo vacío no se muestra (lo decide quien lee el catálogo, no aquí).
 * - Todo dato con fuente (nombre común, UICN, toxicidad, altitud de literatura, LHC, dato
 *   curioso) se guarda como {valor|categoria|min/max|nivel, fuente}; sin fuente, no se puede
 *   enviar a revisión ni publicar.
 * - Publicar exige el aval del herpetólogo (permiso publicarContenido), separado de quien
 *   edita (editarContenido) — misma idea que la regla de dos personas del paquete, con un
 *   solo aval porque el contenido no toca el modelo.
 */
const crypto = require('crypto');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const ESTADOS = ['borrador', 'en_revision', 'publicada'];
const CATEGORIAS_DESTACADO = ['rana_del_dia', 'donde_buscarla', 'foto_destacada', 'especie_amenazada'];
const TOXICIDAD = ['inofensiva', 'toxica_tacto', 'toxica_ingestion'];
const UICN = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD'];
// Endemismo y amenazas son afirmaciones de conservación: llevan fuente, como la UICN.
const CON_FUENTE = ['nombre_comun', 'uicn', 'toxicidad', 'altitud_literatura', 'lhc', 'dato_curioso', 'endemismo', 'amenazas'];
const ACTIVIDAD = ['diurna', 'nocturna', 'crepuscular', 'diurna_y_nocturna'];

const auditar = require('./audit').auditorDe('species_content');

const texto = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/** Valida y normaliza un bloque {valor|..., fuente}; null si viene vacío del todo. */
function bloqueConFuente(bloque, campo) {
  if (bloque === null || bloque === undefined) return null;
  if (typeof bloque !== 'object' || Array.isArray(bloque)) throw falla(`${campo}: formato inválido`);
  const fuente = texto(bloque.fuente, 300);
  switch (campo) {
    case 'nombre_comun': {
      const valor = texto(bloque.valor, 120);
      return valor || fuente ? { valor, fuente } : null;
    }
    case 'uicn': {
      const categoria = bloque.categoria ? String(bloque.categoria).toUpperCase() : null;
      if (categoria && !UICN.includes(categoria)) throw falla(`Categoría UICN inválida: ${categoria}`);
      const anio = bloque.anio ? Number(bloque.anio) : null;
      if (anio !== null && (!Number.isInteger(anio) || anio < 1950 || anio > new Date().getFullYear())) {
        throw falla('Año de la UICN inválido');
      }
      return categoria || anio || fuente ? { categoria, anio, fuente } : null;
    }
    case 'toxicidad': {
      const nivel = bloque.nivel || null;
      if (nivel && !TOXICIDAD.includes(nivel)) throw falla(`Nivel de toxicidad inválido: ${nivel}`);
      const nota = texto(bloque.nota, 300);
      return nivel || nota || fuente ? { nivel, nota, fuente } : null;
    }
    case 'altitud_literatura': {
      const min = bloque.min !== undefined && bloque.min !== null && bloque.min !== '' ? Number(bloque.min) : null;
      const max = bloque.max !== undefined && bloque.max !== null && bloque.max !== '' ? Number(bloque.max) : null;
      if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) throw falla('Altitud de literatura inválida');
      if (min !== null && max !== null && min > max) throw falla('La altitud mínima de literatura no puede ser mayor que la máxima');
      return min !== null || max !== null || fuente ? { min, max, fuente } : null;
    }
    case 'lhc': {
      const min = bloque.min !== undefined && bloque.min !== null && bloque.min !== '' ? Number(bloque.min) : null;
      const max = bloque.max !== undefined && bloque.max !== null && bloque.max !== '' ? Number(bloque.max) : null;
      if ((min !== null && !(min > 0)) || (max !== null && !(max > 0))) throw falla('LHC debe ser un número de milímetros mayor que 0');
      if (min !== null && max !== null && min > max) throw falla('La LHC mínima no puede ser mayor que la máxima');
      return min !== null || max !== null || fuente ? { min, max, fuente } : null;
    }
    case 'dato_curioso': {
      const valor = texto(bloque.valor, 120);
      return valor || fuente ? { valor, fuente } : null;
    }
    case 'endemismo': {
      // endemica: true (de Colombia o de una zona más chica, dicha en `alcance`) o false.
      const endemica = bloque.endemica === true || bloque.endemica === 'true' ? true
        : bloque.endemica === false || bloque.endemica === 'false' ? false : null;
      const alcance = texto(bloque.alcance, 160);
      return endemica !== null || alcance || fuente ? { endemica, alcance, fuente } : null;
    }
    case 'amenazas': {
      if (bloque.lista !== undefined && !Array.isArray(bloque.lista)) throw falla('amenazas: la lista debe ser una lista');
      const lista = (bloque.lista || []).map((a) => texto(a, 80)).filter(Boolean);
      return lista.length || fuente ? { lista, fuente } : null;
    }
    default:
      throw falla(`Campo desconocido: ${campo}`);
  }
}

/** Bloques sin regla de fuente: texto libre u objeto simple, se guardan tal cual (recortados). */
function bloqueLibre(bloque, campo) {
  if (bloque === null || bloque === undefined) return null;
  if (campo === 'habitat') {
    const t = texto(bloque.texto ?? bloque, 600);
    return t ? { texto: t } : null;
  }
  if (campo === 'morfologia') {
    if (typeof bloque !== 'object' || Array.isArray(bloque)) throw falla('morfologia: formato inválido');
    const claves = ['timpano', 'discos', 'pliegues', 'patron_dorsal', 'patron_ventral', 'membranas'];
    const out = {};
    let algo = false;
    for (const k of claves) {
      const t = texto(bloque[k], 300);
      if (t) algo = true;
      out[k] = t;
    }
    // Rasgos que la separan de las especies con que se confunde (la web los lista aparte).
    if (bloque.diagnosticos !== undefined && bloque.diagnosticos !== null && !Array.isArray(bloque.diagnosticos)) {
      throw falla('morfologia.diagnosticos: debe ser una lista');
    }
    const diagnosticos = (bloque.diagnosticos || []).map((d) => texto(d, 120)).filter(Boolean);
    out.diagnosticos = diagnosticos.length ? diagnosticos : null;
    if (diagnosticos.length) algo = true;
    return algo ? out : null;
  }
  if (campo === 'actividad') {
    const v = bloque === '' ? null : String(bloque);
    if (v && !ACTIVIDAD.includes(v)) throw falla(`Actividad inválida: ${v}`);
    return v;
  }
  const LARGO = { autoria: 120, descripcion: 1200, dieta: 300, reproduccion: 400, distribucion: 400 };
  if (LARGO[campo]) return texto(bloque, LARGO[campo]);
  if (campo === 'sinonimos') {
    if (!Array.isArray(bloque)) throw falla('sinonimos: debe ser una lista');
    const nombres = bloque.map((n) => texto(n, 120)).filter(Boolean);
    return nombres.length ? nombres : null;
  }
  if (campo === 'especies_confusion') {
    if (!Array.isArray(bloque)) throw falla('especies_confusion: debe ser una lista de especie_id');
    const ids = bloque.map(Number).filter(Number.isInteger);
    return ids.length ? ids : null;
  }
  if (campo === 'otros_nombres') {
    if (!Array.isArray(bloque)) throw falla('otros_nombres: debe ser una lista');
    const nombres = bloque.map((n) => texto(n, 80)).filter(Boolean);
    return nombres.length ? nombres : null;
  }
  throw falla(`Campo desconocido: ${campo}`);
}

const CAMPOS_LIBRES = ['habitat', 'morfologia', 'especies_confusion', 'otros_nombres',
  'autoria', 'sinonimos', 'descripcion', 'actividad', 'dieta', 'reproduccion', 'distribucion'];

/** Normaliza y valida el objeto `campos` completo de una escritura (parcial: solo lo enviado). */
function normalizarCampos(entrada = {}) {
  if (typeof entrada !== 'object' || Array.isArray(entrada)) throw falla('campos: formato inválido');
  const out = {};
  for (const [k, v] of Object.entries(entrada)) {
    if (CON_FUENTE.includes(k)) out[k] = bloqueConFuente(v, k);
    else if (CAMPOS_LIBRES.includes(k)) out[k] = bloqueLibre(v, k);
    else throw falla(`Campo desconocido: ${k}`);
  }
  return out;
}

async function obtenerOCrear(db, especieId) {
  const { rows: [e] } = await db.query('SELECT id, taxon_id FROM dataset.especie WHERE id = $1', [especieId]);
  if (!e) throw falla('La especie no existe', 404);
  const { rows: [c] } = await db.query(`
    INSERT INTO dataset.species_content (especie_id) VALUES ($1)
    ON CONFLICT (especie_id) DO UPDATE SET especie_id = EXCLUDED.especie_id
    RETURNING *`, [especieId]);
  return c;
}

/** Ficha con los datos automáticos (identidad, altitud de registros, subregiones, fotos) unidos a lo manual. */
async function ficha(pool, especieId) {
  const { rows: [e] } = await pool.query(`
    SELECT id, carpeta, nombre_cientifico, genero, familia, taxon_id FROM dataset.especie WHERE id = $1`, [especieId]);
  if (!e) throw falla('La especie no existe', 404);
  const contenido = await obtenerOCrear(pool, especieId);
  const { rows: [fotos] } = await pool.query(`
    SELECT COUNT(*)::int AS total FROM dataset.foto f
    WHERE f.especie_id = $1 AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = f.sha256 AND x.revertida IS NULL)`,
    [especieId]);
  let fotoPrincipal = null;
  if (contenido.foto_principal_sha256) {
    const { rows: [f] } = await pool.query(
      'SELECT sha256, object_key, licencia, atribucion FROM dataset.foto WHERE sha256 = $1', [contenido.foto_principal_sha256]);
    fotoPrincipal = f || null;
  }
  const faltan = contenido.estado === 'publicada' ? [] : await faltantesParaPublicar(pool, especieId, contenido);
  return {
    especie: e,
    contenido: { ...contenido, foto_principal: fotoPrincipal },
    auto: { fotos_referencia: fotos.total },
    faltan,
  };
}

async function listar(pool) {
  const { rows } = await pool.query(`
    SELECT e.id AS especie_id, e.carpeta, e.nombre_cientifico, e.taxon_id,
           c.estado, c.campos, c.foto_principal_sha256, c.version, c.actualizado, c.publicado_en,
           c.publicada IS NOT NULL AS en_catalogo
    FROM dataset.especie e LEFT JOIN dataset.species_content c ON c.especie_id = e.id
    ORDER BY e.nombre_cientifico`);
  return rows.map((r) => ({
    especie_id: r.especie_id,
    carpeta: r.carpeta,
    nombre_cientifico: r.nombre_cientifico,
    taxon_id: r.taxon_id,
    estado: r.estado || 'borrador',
    nombre_comun: r.campos?.nombre_comun?.valor ?? null,
    version: r.version || 0,
    actualizado: r.actualizado,
    publicado_en: r.publicado_en,
    // true si la app y la web ya sirven una versión (aunque ahora haya un borrador encima).
    en_catalogo: !!r.en_catalogo,
  }));
}

/** Guarda campos (fusiona con lo existente, no reemplaza todo el objeto) y/o la foto principal/galería. */
async function guardar(pool, especieId, body, userId) {
  const actual = await obtenerOCrear(pool, especieId);
  // Editar una ficha publicada la vuelve a borrador; la app y la web siguen sirviendo la copia
  // `publicada` (phase11.sql) hasta el próximo aval.
  const nuevos = body.campos !== undefined ? normalizarCampos(body.campos) : {};
  const campos = { ...actual.campos, ...nuevos };

  let fotoPrincipal = actual.foto_principal_sha256;
  if (body.foto_principal_sha256 !== undefined) {
    fotoPrincipal = body.foto_principal_sha256 || null;
    if (fotoPrincipal) {
      const { rows: [f] } = await pool.query(
        'SELECT especie_id, licencia FROM dataset.foto WHERE sha256 = $1', [fotoPrincipal]);
      if (!f) throw falla('La foto principal no existe', 404);
      if (f.especie_id !== especieId) throw falla('Esa foto no es de esta especie');
    }
  }
  let galeria = actual.galeria;
  if (body.galeria !== undefined) {
    if (!Array.isArray(body.galeria)) throw falla('galeria: debe ser una lista de sha256');
    const { rows } = await pool.query(
      'SELECT sha256 FROM dataset.foto WHERE especie_id = $1 AND sha256 = ANY($2::char(64)[])', [especieId, body.galeria]);
    const validas = new Set(rows.map((r) => r.sha256));
    if (rows.length !== new Set(body.galeria).size) throw falla('La galería solo puede tener fotos de esta especie');
    galeria = body.galeria.filter((s) => validas.has(s));
  }

  const estadoNuevo = actual.estado === 'publicada' ? 'borrador' : actual.estado;
  const { rows: [c] } = await pool.query(`
    UPDATE dataset.species_content SET campos = $2, foto_principal_sha256 = $3, galeria = $4,
      estado = $5, actualizado_por = $6, actualizado = NOW()
    WHERE especie_id = $1 RETURNING *`, [especieId, campos, fotoPrincipal, galeria, estadoNuevo, userId]);
  await auditar(pool, userId, 'dataset.contenido.guardado', especieId, { campos: Object.keys(nuevos) });
  // El editor pinta el checklist con esto mismo: sin devolverlo aquí quedaba con el de la carga anterior.
  const faltan = c.estado === 'publicada' ? [] : await faltantesParaPublicar(pool, especieId, c);
  return { ...c, faltan };
}

/** Qué falta para poder publicar (también sirve para pintar el checklist en el editor). */
async function faltantesParaPublicar(pool, especieId, contenido) {
  const faltan = [];
  const c = contenido.campos || {};
  if (!c.nombre_comun?.valor) faltan.push('Nombre común en español');
  else if (!c.nombre_comun?.fuente) faltan.push('Fuente del nombre común');
  if (!c.uicn?.categoria) faltan.push('Categoría UICN');
  else if (!c.uicn?.fuente) faltan.push('Fuente de la UICN');
  if (!c.toxicidad?.nivel) faltan.push('Toxicidad');
  else if (!c.toxicidad?.fuente) faltan.push('Fuente de la toxicidad');
  if (!contenido.foto_principal_sha256) faltan.push('Foto principal');
  else {
    const { rows: [f] } = await pool.query('SELECT licencia FROM dataset.foto WHERE sha256 = $1', [contenido.foto_principal_sha256]);
    const cc = f?.licencia && f.licencia !== 'all-rights-reserved';
    if (!cc) faltan.push('La foto principal necesita licencia Creative Commons (la actual no se puede mostrar en público)');
  }
  // Altitud de registros y subregiones (point-in-polygon DANE) son "auto": salen del pipeline
  // de datos reales (tools/admin/export_admin_seed.py → antioquia-real.json), no de esta base.
  // Aquí solo se exige un mínimo de registros geolocalizados; el dato en sí lo muestra el Admin.
  const { rows: [e] } = await pool.query(`
    SELECT COUNT(*)::int AS con_coordenada FROM dataset.observacion o JOIN dataset.foto f ON f.observacion_id = o.id
    WHERE f.especie_id = $1 AND o.latitud IS NOT NULL`, [especieId]);
  if (!e.con_coordenada) faltan.push('Sin ninguna observación con coordenada: falta altitud y subregiones automáticas');
  return faltan;
}

async function enviarRevision(pool, especieId, userId) {
  const c = await obtenerOCrear(pool, especieId);
  if (c.estado === 'publicada') throw falla('Ya está publicada; edítala para volver a borrador');
  const faltan = await faltantesParaPublicar(pool, especieId, c);
  if (faltan.length) throw falla(`Falta antes de enviar a revisión: ${faltan.join('; ')}`, 422, { faltan });
  const { rows: [u] } = await pool.query(`
    UPDATE dataset.species_content SET estado = 'en_revision', enviado_revision_por = $2, enviado_revision_en = NOW()
    WHERE especie_id = $1 RETURNING *`, [especieId, userId]);
  await auditar(pool, userId, 'dataset.contenido.enviado_revision', especieId, {});
  return u;
}

async function devolverBorrador(pool, especieId, motivo, userId) {
  const c = await obtenerOCrear(pool, especieId);
  if (c.estado === 'borrador') throw falla('Ya está en borrador');
  const { rows: [u] } = await pool.query(`
    UPDATE dataset.species_content SET estado = 'borrador' WHERE especie_id = $1 RETURNING *`, [especieId]);
  await auditar(pool, userId, 'dataset.contenido.devuelto', especieId, { motivo: texto(motivo, 300) });
  return u;
}

/** Publicar es el aval del herpetólogo: separado de quien edita (regla de dos personas, un solo aval). */
async function publicar(pool, especieId, userId) {
  const c = await obtenerOCrear(pool, especieId);
  if (c.estado !== 'en_revision') throw falla('Solo se publica lo que está en revisión');
  const faltan = await faltantesParaPublicar(pool, especieId, c);
  if (faltan.length) throw falla(`No se puede publicar: ${faltan.join('; ')}`, 422, { faltan });
  const { rows: [u] } = await pool.query(`
    UPDATE dataset.species_content SET estado = 'publicada', publicado_por = $2, publicado_en = NOW(), version = version + 1,
      publicada = jsonb_build_object('campos', campos, 'foto_principal_sha256', foto_principal_sha256, 'galeria', to_jsonb(galeria))
    WHERE especie_id = $1 RETURNING *`, [especieId, userId]);
  await auditar(pool, userId, 'dataset.contenido.publicado', especieId, { version: u.version });
  return u;
}

// ── Destacados (carrusel de inicio) ──────────────────────────────────────────────────────

/** Especies elegibles para una categoría del carrusel, según la regla de la nota. */
async function elegiblesPara(pool, categoria) {
  if (!CATEGORIAS_DESTACADO.includes(categoria)) throw falla(`Categoría inválida: ${categoria}`);
  const { rows } = await pool.query(`
    SELECT e.id, e.nombre_cientifico, c.publicada->'campos' AS campos, c.publicada->>'foto_principal_sha256' AS foto_principal_sha256
    FROM dataset.especie e JOIN dataset.species_content c ON c.especie_id = e.id
    WHERE c.publicada IS NOT NULL`);
  const conFoto = async (r) => {
    if (!r.foto_principal_sha256) return false;
    const { rows: [f] } = await pool.query('SELECT licencia, atribucion FROM dataset.foto WHERE sha256 = $1', [r.foto_principal_sha256]);
    return !!(f?.licencia && f.licencia !== 'all-rights-reserved' && f.atribucion);
  };
  const salida = [];
  for (const r of rows) {
    const ok = {
      rana_del_dia: !!(r.foto_principal_sha256 && r.campos?.dato_curioso?.valor),
      donde_buscarla: !!(r.campos?.habitat?.texto),
      foto_destacada: await conFoto(r),
      especie_amenazada: !!(r.campos?.uicn?.categoria && ['VU', 'EN', 'CR'].includes(r.campos.uicn.categoria)),
    }[categoria];
    if (ok) salida.push({ especie_id: r.id, nombre_cientifico: r.nombre_cientifico });
  }
  return salida;
}

async function calendario(pool, desde, hasta) {
  const { rows } = await pool.query(`
    SELECT d.id, d.fecha, d.categoria, d.especie_id, e.nombre_cientifico, c.campos->'nombre_comun'->>'valor' AS nombre_comun
    FROM dataset.destacado d
    JOIN dataset.especie e ON e.id = d.especie_id
    LEFT JOIN dataset.species_content c ON c.especie_id = d.especie_id
    WHERE d.fecha BETWEEN $1 AND $2 ORDER BY d.fecha, d.categoria`, [desde, hasta]);
  return rows;
}

async function programar(pool, { fecha, categoria, especie_id }, userId) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw falla('Fecha inválida (usa AAAA-MM-DD)');
  if (!CATEGORIAS_DESTACADO.includes(categoria)) throw falla(`Categoría inválida: ${categoria}`);
  const elegibles = await elegiblesPara(pool, categoria);
  if (!elegibles.some((e) => e.especie_id === Number(especie_id))) {
    throw falla('Esa especie no cumple la condición de esta categoría todavía');
  }
  const { rows: [d] } = await pool.query(`
    INSERT INTO dataset.destacado (fecha, categoria, especie_id, creado_por) VALUES ($1, $2, $3, $4)
    ON CONFLICT (fecha, categoria) DO UPDATE SET especie_id = EXCLUDED.especie_id, creado_por = EXCLUDED.creado_por
    RETURNING *`, [fecha, categoria, especie_id, userId]);
  await auditar(pool, userId, 'dataset.destacado.programado', d.id, { fecha, categoria, especie_id });
  return d;
}

async function quitarProgramado(pool, id, userId) {
  const { rows: [d] } = await pool.query('DELETE FROM dataset.destacado WHERE id = $1 RETURNING *', [id]);
  if (!d) throw falla('No existe ese destacado', 404);
  await auditar(pool, userId, 'dataset.destacado.quitado', id, { fecha: d.fecha, categoria: d.categoria });
  return { ok: true };
}

// ── Catálogo de contenido: lo que leen la app y la web ──────────────────────────────────

const LICENCIA_CC = (l) => !!l && l !== 'all-rights-reserved';
const DIAS_DESTACADOS = 30;

/**
 * Solo la copia publicada (nunca el borrador), solo campos con valor — un campo vacío no se
 * muestra. Trae además lo automático que la ficha pinta (fotos de referencia) y los destacados
 * de los próximos 30 días, para que el carrusel funcione sin red. `version` es el sha256 del
 * contenido: la app y la web solo vuelven a bajar si cambió.
 */
async function catalogo(pool) {
  const { rows } = await pool.query(`
    -- dataset.especie_publica (phase22.sql) es la definición de "especie pública": la misma que lee explorer-service.
    SELECT e.especie_id, e.taxon_id, e.carpeta, e.nombre_cientifico, e.genero, e.familia,
           e.publicada, e.version, e.publicado_en,
           (SELECT COUNT(*)::int FROM dataset.foto f WHERE f.especie_id = e.especie_id AND NOT EXISTS (
              SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = f.sha256 AND x.revertida IS NULL)) AS fotos_referencia
    FROM dataset.especie_publica e
    ORDER BY e.nombre_cientifico`);
  const shas = rows.flatMap((r) => [r.publicada.foto_principal_sha256, ...(r.publicada.galeria || [])]).filter(Boolean);
  const { rows: fotos } = shas.length ? await pool.query(
    'SELECT sha256, licencia, atribucion, url_origen FROM dataset.foto WHERE sha256 = ANY($1::char(64)[])', [shas]) : { rows: [] };
  const fotoPorSha = new Map(fotos.map((f) => [f.sha256, f]));
  // Una foto sin licencia CC nunca sale del servidor, aunque se haya elegido antes de que cambiara.
  const foto = (sha) => {
    const f = sha && fotoPorSha.get(sha);
    return f && LICENCIA_CC(f.licencia)
      ? quitarVacios({ sha256: f.sha256, licencia: f.licencia, atribucion: f.atribucion || undefined, url_origen: f.url_origen || undefined })
      : undefined;
  };
  const taxonDe = new Map(rows.map((r) => [r.especie_id, r.taxon_id]));
  const especies = rows.map((r) => {
    const c = r.publicada.campos || {};
    const m = c.morfologia || {};
    const morfologia = quitarVacios({
      timpano: limpiar(m.timpano), discos: limpiar(m.discos), pliegues: limpiar(m.pliegues),
      patron_dorsal: limpiar(m.patron_dorsal), patron_ventral: limpiar(m.patron_ventral),
      membranas: limpiar(m.membranas), diagnosticos: limpiar(m.diagnosticos),
    });
    return quitarVacios({
      taxon_id: r.taxon_id,
      nombre_cientifico: r.nombre_cientifico,
      autoria: limpiar(c.autoria),
      genero: r.genero,
      familia: r.familia,
      nombre_comun: limpiar(c.nombre_comun?.valor),
      otros_nombres: limpiar(c.otros_nombres),
      sinonimos: limpiar(c.sinonimos),
      uicn: c.uicn?.categoria ? quitarVacios({ categoria: c.uicn.categoria, anio: limpiar(c.uicn.anio), fuente: c.uicn.fuente }) : undefined,
      toxicidad: c.toxicidad?.nivel ? quitarVacios({ nivel: c.toxicidad.nivel, nota: limpiar(c.toxicidad.nota), fuente: c.toxicidad.fuente }) : undefined,
      endemismo: typeof c.endemismo?.endemica === 'boolean'
        ? quitarVacios({ endemica: c.endemismo.endemica, alcance: limpiar(c.endemismo.alcance), fuente: limpiar(c.endemismo.fuente) }) : undefined,
      amenazas: c.amenazas?.lista?.length ? quitarVacios({ lista: c.amenazas.lista, fuente: limpiar(c.amenazas.fuente) }) : undefined,
      descripcion: limpiar(c.descripcion),
      actividad: limpiar(c.actividad),
      dieta: limpiar(c.dieta),
      reproduccion: limpiar(c.reproduccion),
      distribucion: limpiar(c.distribucion),
      altitud_literatura: c.altitud_literatura?.min != null || c.altitud_literatura?.max != null
        ? quitarVacios({ min: limpiar(c.altitud_literatura.min), max: limpiar(c.altitud_literatura.max), fuente: c.altitud_literatura.fuente }) : undefined,
      habitat: limpiar(c.habitat?.texto),
      lhc: c.lhc?.min != null || c.lhc?.max != null
        ? quitarVacios({ min: limpiar(c.lhc.min), max: limpiar(c.lhc.max), fuente: c.lhc.fuente }) : undefined,
      morfologia: Object.keys(morfologia).length ? morfologia : undefined,
      especies_confusion: limpiar((c.especies_confusion || []).map((id) => taxonDe.get(id)).filter(Boolean)),
      dato_curioso: c.dato_curioso?.valor ? quitarVacios({ valor: c.dato_curioso.valor, fuente: limpiar(c.dato_curioso.fuente) }) : undefined,
      foto_principal: foto(r.publicada.foto_principal_sha256),
      galeria: limpiar((r.publicada.galeria || []).map(foto).filter(Boolean)),
      fotos_referencia: r.fotos_referencia,
      version: r.version,
      publicado_en: r.publicado_en,
    });
  });
  const { rows: destacados } = await pool.query(`
    SELECT to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.categoria, e.taxon_id
    FROM dataset.destacado d JOIN dataset.especie e ON e.id = d.especie_id
    JOIN dataset.species_content c ON c.especie_id = d.especie_id AND c.publicada IS NOT NULL
    -- "Hoy" es el de Colombia, no el del reloj UTC del servidor: a las 19:00 en Bogotá ya es
    -- mañana en UTC y el destacado de hoy desaparecía del catálogo.
    WHERE d.fecha BETWEEN (NOW() AT TIME ZONE 'America/Bogota')::date - 1
                      AND (NOW() AT TIME ZONE 'America/Bogota')::date + $1::int
    ORDER BY d.fecha, d.categoria`, [DIAS_DESTACADOS]);
  const cuerpo = { especies, destacados };
  const version = crypto.createHash('sha256').update(JSON.stringify(cuerpo)).digest('hex');
  return { formato: 1, version, generado: new Date().toISOString(), ...cuerpo };
}

function limpiar(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) ? undefined : v;
}

function quitarVacios(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/**
 * Foto que el catálogo público puede servir: solo si es la principal o de la galería de una
 * ficha publicada, y con licencia CC. Cualquier otra foto del dataset sigue siendo privada.
 */
async function fotoPublica(pool, sha256) {
  const { rows: [f] } = await pool.query(`
    SELECT f.object_key, f.licencia FROM dataset.foto f
    WHERE f.sha256 = $1 AND EXISTS (
      SELECT 1 FROM dataset.species_content c WHERE c.publicada IS NOT NULL AND (
        c.publicada->>'foto_principal_sha256' = $1 OR c.publicada->'galeria' ? $1))`, [sha256]);
  return f && LICENCIA_CC(f.licencia) ? f : null;
}

module.exports = {
  ESTADOS, CATEGORIAS_DESTACADO,
  listar, ficha, guardar, enviarRevision, devolverBorrador, publicar,
  elegiblesPara, calendario, programar, quitarProgramado, catalogo, fotoPublica,
};
