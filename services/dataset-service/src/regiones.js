/**
 * Regiones (Admin → Regiones): qué departamentos tiene ANURA y cómo se divide cada uno en
 * subregiones — la unidad que se versiona y se descarga (19_ADMIN/Decisiones de Escalabilidad
 * #8). Tablas en phase12.sql; los límites (departamentos y municipios DANE) los sirve
 * geo-service, sin red externa.
 *
 * Reglas:
 * - Agregar un departamento lo deja en borrador. Solo se activa cuando todos sus municipios
 *   tienen subregión: un municipio sin subregión sería un hueco en el mapa de paquetes.
 * - Un municipio está en una sola subregión.
 * - Las cifras por subregión salen de las observaciones del dataset ubicadas por
 *   point-in-polygon en geo-service, no de una tabla escrita a mano.
 */
const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const GEO = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';

async function geo(ruta, init) {
  // Solo estas rutas de geo-service, con el código DANE de departamento de 2 dígitos
  // (dataset.region.codigo_dane CHAR(2)): un "05/../../x" venido de la URL no puede salirse de /departamentos.
  if (!/^\/departamentos(\?geometria=1|\/\d{2}\/(ubicar|municipios))?$/.test(ruta)) throw falla('Código DANE de departamento inválido', 400);
  let res;
  try {
    res = await fetch(`${GEO}/api/geo/regiones${ruta}`, init);
  } catch {
    throw falla('geo-service no responde: no se pueden leer los límites de departamentos y municipios.', 502);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 404) return null;
  if (!res.ok) throw falla(`geo-service respondió ${res.status}: ${body.error || ''}`, 502);
  return body;
}

const auditar = require('./audit').auditorDe('region');

/** Los 33 departamentos DANE, con lo que ANURA sabe de cada uno. */
async function listar(pool, conGeometria = false) {
  const { departamentos } = await geo(`/departamentos${conGeometria ? '?geometria=1' : ''}`);
  const { rows } = await pool.query(`
    SELECT r.codigo_dane, r.estado, r.creado,
           (SELECT COUNT(*)::int FROM dataset.subregion s WHERE s.region = r.codigo_dane) AS subregiones,
           (SELECT COUNT(*)::int FROM dataset.subregion_municipio m JOIN dataset.subregion s ON s.id = m.subregion_id
             WHERE s.region = r.codigo_dane) AS municipios_asignados
    FROM dataset.region r`);
  const porCodigo = new Map(rows.map((r) => [r.codigo_dane, r]));
  return {
    departamentos: departamentos.map((d) => {
      const r = porCodigo.get(d.codigo);
      return {
        ...d,
        en_anura: !!r,
        estado: r?.estado ?? null,
        subregiones: r?.subregiones ?? 0,
        municipios_asignados: r?.municipios_asignados ?? 0,
      };
    }),
  };
}

// Cifras por subregión: se recalculan como mucho cada 5 minutos por departamento.
const CIFRAS_TTL_MS = 5 * 60_000;
const cifrasCache = new Map();

/** Observaciones válidas del dataset ubicadas en municipios del departamento. */
async function cifrasPorMunicipio(pool, codigo) {
  const hit = cifrasCache.get(codigo);
  if (hit && hit.expira > Date.now()) return hit.valor;
  const { rows } = await pool.query(`
    SELECT o.id, COALESCE(o.latitud_limpia, o.latitud) AS lat, COALESCE(o.longitud_limpia, o.longitud) AS lon,
           (SELECT f.especie_id FROM dataset.foto f WHERE f.observacion_id = o.id LIMIT 1) AS especie_id
    FROM dataset.observacion o
    WHERE o.invalidada_motivo IS NULL AND o.latitud IS NOT NULL`);
  const r = await geo(`/departamentos/${codigo}/ubicar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puntos: rows.map((o) => [o.lat, o.lon]) }),
  });
  const porMunicipio = new Map();
  rows.forEach((o, i) => {
    const m = r?.municipios[i];
    if (!m) return;
    const acc = porMunicipio.get(m) ?? { observaciones: 0, especies: new Set() };
    acc.observaciones += 1;
    if (o.especie_id) acc.especies.add(o.especie_id);
    porMunicipio.set(m, acc);
  });
  cifrasCache.set(codigo, { valor: porMunicipio, expira: Date.now() + CIFRAS_TTL_MS });
  return porMunicipio;
}

async function detalle(pool, codigo) {
  const { rows: [region] } = await pool.query('SELECT * FROM dataset.region WHERE codigo_dane = $1', [codigo]);
  if (!region) throw falla('Ese departamento todavía no está en ANURA', 404);
  const { departamentos } = await geo('/departamentos');
  const dep = departamentos.find((d) => d.codigo === codigo);
  const { rows: subregiones } = await pool.query(`
    SELECT s.id, s.numero, s.clave, s.nombre, COALESCE(array_agg(m.municipio_dane ORDER BY m.municipio_dane)
             FILTER (WHERE m.municipio_dane IS NOT NULL), '{}') AS municipios
    FROM dataset.subregion s LEFT JOIN dataset.subregion_municipio m ON m.subregion_id = s.id
    WHERE s.region = $1 GROUP BY s.id ORDER BY s.numero`, [codigo]);
  const municipiosGeo = await geo(`/departamentos/${codigo}/municipios`);
  const municipios = municipiosGeo ? municipiosGeo.features.map((f) => f.properties) : [];

  let cifras = null;
  if (municipiosGeo) {
    const porMunicipio = await cifrasPorMunicipio(pool, codigo);
    const { rows: especies } = await pool.query('SELECT id, nombre_cientifico FROM dataset.especie');
    const nombre = new Map(especies.map((e) => [e.id, e.nombre_cientifico]));
    const resumir = (codigos) => {
      let observaciones = 0;
      const ids = new Set();
      for (const c of codigos) {
        const m = porMunicipio.get(c);
        if (!m) continue;
        observaciones += m.observaciones;
        m.especies.forEach((id) => ids.add(id));
      }
      return { observaciones, especies: [...ids].map((id) => nombre.get(id)).filter(Boolean).sort() };
    };
    cifras = {
      departamento: resumir(municipios.map((m) => m.codigo)),
      subregiones: Object.fromEntries(subregiones.map((s) => [s.id, resumir(s.municipios)])),
      municipios: Object.fromEntries(municipios.map((m) => [m.codigo, porMunicipio.get(m.codigo)?.observaciones ?? 0])),
    };
  }
  const asignados = new Set(subregiones.flatMap((s) => s.municipios));
  return {
    region: { ...region, nombre: dep?.nombre ?? region.nombre },
    limites_municipales: !!municipiosGeo,
    subregiones,
    municipios,
    // Para dibujar el mapa de municipios en el Admin (el Admin no habla con geo-service).
    geometria: municipiosGeo,
    sin_subregion: municipios.filter((m) => !asignados.has(m.codigo)).map((m) => m.codigo),
    cifras,
  };
}

async function agregar(pool, codigo, userId) {
  const { departamentos } = await geo('/departamentos');
  const dep = departamentos.find((d) => d.codigo === codigo);
  if (!dep) throw falla('Código DANE de departamento inválido');
  const { rows: [r] } = await pool.query(`
    INSERT INTO dataset.region (codigo_dane, nombre, creado_por) VALUES ($1, $2, $3)
    ON CONFLICT (codigo_dane) DO NOTHING RETURNING *`, [codigo, dep.nombre, userId]);
  if (!r) throw falla(`${dep.nombre} ya está en ANURA`, 409);
  await auditar(pool, userId, 'dataset.region.agregada', codigo, { nombre: dep.nombre });
  return r;
}

const clave = (nombre) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

async function crearSubregion(pool, codigo, nombre, userId) {
  const limpio = String(nombre ?? '').trim().slice(0, 80);
  if (!limpio) throw falla('La subregión necesita un nombre');
  const { rows: [region] } = await pool.query('SELECT codigo_dane FROM dataset.region WHERE codigo_dane = $1', [codigo]);
  if (!region) throw falla('Ese departamento todavía no está en ANURA', 404);
  const { rows: [s] } = await pool.query(`
    INSERT INTO dataset.subregion (region, numero, clave, nombre)
    SELECT $1, COALESCE(MAX(numero), 0) + 1, $2, $3 FROM dataset.subregion WHERE region = $1
    ON CONFLICT (region, clave) DO NOTHING RETURNING *`, [codigo, clave(limpio), limpio]);
  if (!s) throw falla(`Ya hay una subregión «${limpio}»`, 409);
  await auditar(pool, userId, 'dataset.subregion.creada', codigo, { subregion: s.id, nombre: limpio });
  return s;
}

async function renombrarSubregion(pool, id, nombre, userId) {
  const limpio = String(nombre ?? '').trim().slice(0, 80);
  if (!limpio) throw falla('La subregión necesita un nombre');
  const { rows: [s] } = await pool.query('UPDATE dataset.subregion SET nombre = $2 WHERE id = $1 RETURNING *', [id, limpio]);
  if (!s) throw falla('No existe esa subregión', 404);
  await auditar(pool, userId, 'dataset.subregion.renombrada', s.region, { subregion: id, nombre: limpio });
  return s;
}

async function borrarSubregion(pool, id, userId) {
  const { rows: [n] } = await pool.query('SELECT COUNT(*)::int AS total FROM dataset.subregion_municipio WHERE subregion_id = $1', [id]);
  if (n.total) throw falla('Primero pasa sus municipios a otra subregión');
  const { rows: [s] } = await pool.query('DELETE FROM dataset.subregion WHERE id = $1 RETURNING *', [id]);
  if (!s) throw falla('No existe esa subregión', 404);
  await auditar(pool, userId, 'dataset.subregion.borrada', s.region, { subregion: id, nombre: s.nombre });
  return { ok: true };
}

/** Pasa municipios (código DANE de 5 dígitos) a una subregión del mismo departamento. */
async function asignarMunicipios(pool, codigo, subregionId, municipios, userId) {
  if (!Array.isArray(municipios) || !municipios.length) throw falla('municipios: lista de códigos DANE');
  const geoMunicipios = await geo(`/departamentos/${codigo}/municipios`);
  if (!geoMunicipios) throw falla('Este departamento todavía no tiene límites municipales cargados');
  const validos = new Set(geoMunicipios.features.map((f) => f.properties.codigo));
  const malos = municipios.filter((m) => !validos.has(m));
  if (malos.length) throw falla(`Municipios que no son de este departamento: ${malos.join(', ')}`);
  const { rows: [s] } = await pool.query('SELECT id FROM dataset.subregion WHERE id = $1 AND region = $2', [subregionId, codigo]);
  if (!s) throw falla('Esa subregión no es de este departamento', 404);
  await pool.query(`
    INSERT INTO dataset.subregion_municipio (municipio_dane, subregion_id) SELECT unnest($1::char(5)[]), $2
    ON CONFLICT (municipio_dane) DO UPDATE SET subregion_id = EXCLUDED.subregion_id`, [municipios, subregionId]);
  await auditar(pool, userId, 'dataset.subregion.municipios', codigo, { subregion: subregionId, municipios });
  return { ok: true };
}

async function especiesSubregion(pool, codigo, subregionId) {
  const { rows: [subregion] } = await pool.query(
    'SELECT id FROM dataset.subregion WHERE id = $1 AND region = $2', [subregionId, codigo]);
  if (!subregion) throw falla('Esa subregión no es de este departamento', 404);
  const { rows } = await pool.query(`
    SELECT e.id, e.nombre_cientifico, (se.especie_id IS NOT NULL) AS asignada_manual
    FROM dataset.especie e
    LEFT JOIN dataset.subregion_especie se ON se.especie_id = e.id AND se.subregion_id = $1
    ORDER BY e.nombre_cientifico`, [subregionId]);
  return rows;
}

async function asignarEspecie(pool, codigo, subregionId, especieId, userId) {
  const { rows: [subregion] } = await pool.query(
    'SELECT id FROM dataset.subregion WHERE id = $1 AND region = $2', [subregionId, codigo]);
  if (!subregion) throw falla('Esa subregión no es de este departamento', 404);
  const { rows: [especie] } = await pool.query('SELECT id FROM dataset.especie WHERE id = $1', [especieId]);
  if (!especie) throw falla('Esa especie no existe', 404);
  const { rowCount } = await pool.query(`
    INSERT INTO dataset.subregion_especie (subregion_id, especie_id, creado_por)
    VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [subregionId, especieId, userId]);
  if (rowCount) {
    await auditar(pool, userId, 'dataset.subregion.especie_asignada', codigo, { subregion: subregionId, especie: especieId });
  }
  return { ok: true, nueva: !!rowCount };
}

async function quitarEspecie(pool, codigo, subregionId, especieId, userId) {
  const { rows: [asignacion] } = await pool.query(`
    DELETE FROM dataset.subregion_especie se USING dataset.subregion s
    WHERE se.subregion_id = s.id AND s.region = $1 AND s.id = $2 AND se.especie_id = $3
    RETURNING se.especie_id`, [codigo, subregionId, especieId]);
  if (!asignacion) throw falla('La especie no tenía asignación manual en esa subregión', 404);
  await auditar(pool, userId, 'dataset.subregion.especie_quitada', codigo, { subregion: subregionId, especie: especieId });
  return { ok: true };
}

async function activar(pool, codigo, userId) {
  const d = await detalle(pool, codigo);
  if (!d.limites_municipales) throw falla('Sin límites municipales no se puede dividir en subregiones');
  if (!d.subregiones.length) throw falla('Crea al menos una subregión');
  if (d.sin_subregion.length) throw falla(`Faltan ${d.sin_subregion.length} municipios por asignar a una subregión`);
  await pool.query("UPDATE dataset.region SET estado = 'activa' WHERE codigo_dane = $1", [codigo]);
  await auditar(pool, userId, 'dataset.region.activada', codigo, { subregiones: d.subregiones.length });
  return { ok: true };
}

/** Solo un borrador: un departamento activo ya tiene paquetes que dependen de sus subregiones. */
async function quitar(pool, codigo, userId) {
  const { rows: [r] } = await pool.query("DELETE FROM dataset.region WHERE codigo_dane = $1 AND estado = 'borrador' RETURNING *", [codigo]);
  if (!r) throw falla('Solo se puede quitar un departamento en borrador', 409);
  await auditar(pool, userId, 'dataset.region.quitada', codigo, { nombre: r.nombre });
  return { ok: true };
}

module.exports = {
  cifrasPorMunicipio, quitar, listar, detalle, agregar, crearSubregion, renombrarSubregion,
  borrarSubregion, asignarMunicipios, especiesSubregion, asignarEspecie, quitarEspecie, activar,
};
