/**
 * Altitud por observación (phase16.sql). La consulta la hace geo-service (GET /api/geo/altitude:
 * caché propia + OpenTopoData); aquí solo se guarda el resultado en dataset.observacion.
 *
 * Regla de oro: NUNCA se inventa una altitud. Si geo-service no responde se corta con un error
 * claro (502); si responde sin dato, la observación queda sin altitud y se cuenta como "sin dato".
 *
 * La altitud es la de la coordenada que usa la observación: latitud_limpia/longitud_limpia si la
 * limpieza (Calidad) ya decidió, si no la original. Se guarda la coordenada con la que se calculó
 * (altitud_lat/lon): si la limpieza la cambia después, esa altitud deja de valer y aparece otra vez
 * como faltante.
 */
const { registrar } = require('./audit');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const GEO = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';

/** Fragmentos SQL sobre `dataset.observacion o`, compartidos con ficha.js. */
const COORD_LAT = 'COALESCE(o.latitud_limpia, o.latitud)';
const COORD_LON = 'COALESCE(o.longitud_limpia, o.longitud)';
// Observaciones a las que vale la pena pedirles altitud: vigentes, con coordenada, y que la
// limpieza no haya sacado ('excluida'), reducido a la celda ('celda') ni dejado por decidir.
const CANDIDATA = `o.invalidada_en IS NULL AND ${COORD_LAT} IS NOT NULL AND ${COORD_LON} IS NOT NULL
  AND COALESCE(o.uso_geografico, 'punto') = 'punto' AND o.limpieza_metodo IS DISTINCT FROM 'pendiente_de_decision'`;
const FALTA = `(o.altitud_calculada IS NULL OR o.altitud_lat IS DISTINCT FROM ${COORD_LAT} OR o.altitud_lon IS DISTINCT FROM ${COORD_LON})`;

const LOTE_POR_DEFECTO = 20;
const LOTE_MAXIMO = 50;
// Un lote no puede pasar de aquí: OpenTopoData público atiende ~1 punto por segundo y el
// navegador/proxy no espera minutos. Lo que no alcanza queda para la siguiente llamada.
const LOTE_MAX_MS = 40_000;

/** Pide la altitud de un punto a geo-service. Lanza 502 si no responde; { altitud_m: null } si no hay dato. */
async function consultar(lat, lon, timeoutMs = 35_000) {
  let res;
  try {
    res = await fetch(`${GEO}/api/geo/altitude?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw falla('geo-service no responde: no se pueden calcular altitudes. Revisa que esté corriendo y vuelve a intentarlo.', 502);
  }
  if (!res.ok) throw falla(`geo-service no pudo consultar la altitud (respondió ${res.status}). Vuelve a intentarlo en un momento.`, 502);
  const cuerpo = await res.json().catch(() => ({}));
  const m = cuerpo.altitude_m;
  if (m === null || m === undefined || !Number.isFinite(Number(m))) return { altitud_m: null, fuente: null };
  return { altitud_m: Number(m), fuente: cuerpo.source || 'geo-service' };
}

/**
 * Para una observación nueva (subida a mano): intenta la altitud sin frenar la subida. Sin
 * respuesta, queda vacía y "Calcular altitudes faltantes" la llena después.
 */
async function alCrear(lat, lon) {
  try {
    return await consultar(lat, lon, 8000);
  } catch {
    return { altitud_m: null, fuente: null };
  }
}

async function contarFaltantes(db, especieId) {
  const { rows: [r] } = await db.query(`
    SELECT COUNT(*)::int AS n FROM dataset.observacion o
    WHERE ${CANDIDATA} AND ${FALTA}
      AND EXISTS (SELECT 1 FROM dataset.foto f WHERE f.observacion_id = o.id AND ($1::int IS NULL OR f.especie_id = $1))`,
    [especieId]);
  return r.n;
}

/**
 * POST /api/dataset/altitudes/calcular { especie_id?, limite?, desde_id? }
 * Rellena por lotes las altitudes que faltan (o que dejaron de valer porque cambió la coordenada).
 * Devuelve `siguiente_id`: mientras no sea null hay más por revisar; el cliente vuelve a llamar
 * con desde_id = siguiente_id. (Las que geo-service no pudo resolver quedan como faltantes, y sin
 * cursor el mismo lote las volvería a pedir siempre.)
 */
async function calcularFaltantes(pool, body, userId) {
  const especieId = body.especie_id === undefined || body.especie_id === null ? null : Number(body.especie_id);
  if (especieId !== null && !Number.isInteger(especieId)) throw falla('especie_id inválido');
  const limite = Math.min(Math.max(parseInt(body.limite, 10) || LOTE_POR_DEFECTO, 1), LOTE_MAXIMO);
  const desde = Math.max(parseInt(body.desde_id, 10) || 0, 0);
  if (especieId !== null) {
    const { rows: [e] } = await pool.query('SELECT id FROM dataset.especie WHERE id = $1', [especieId]);
    if (!e) throw falla('La especie no existe en el dataset', 404);
  }

  const { rows: pendientes } = await pool.query(`
    SELECT o.id, ${COORD_LAT} AS lat, ${COORD_LON} AS lon FROM dataset.observacion o
    WHERE ${CANDIDATA} AND ${FALTA} AND o.id > $2
      AND EXISTS (SELECT 1 FROM dataset.foto f WHERE f.observacion_id = o.id AND ($1::int IS NULL OR f.especie_id = $1))
    ORDER BY o.id LIMIT $3`, [especieId, desde, limite]);

  const inicio = Date.now();
  let conAltitud = 0;
  let sinDato = 0;
  let ultimoId = null;
  let corte = false;
  let error = null;
  for (const o of pendientes) {
    if (Date.now() - inicio > LOTE_MAX_MS) { corte = true; break; }
    let r;
    try {
      r = await consultar(o.lat, o.lon);
    } catch (err) {
      error = err;
      break;
    }
    if (r.altitud_m === null) {
      // Sin dato: si tenía una altitud de otra coordenada, ya no vale.
      await pool.query(`UPDATE dataset.observacion SET altitud_m = NULL, altitud_lat = NULL, altitud_lon = NULL,
        altitud_fuente = NULL, altitud_calculada = NULL WHERE id = $1 AND altitud_calculada IS NOT NULL`, [o.id]);
      sinDato += 1;
    } else {
      await pool.query(`UPDATE dataset.observacion SET altitud_m = $2, altitud_lat = $3, altitud_lon = $4,
        altitud_fuente = $5, altitud_calculada = NOW() WHERE id = $1`, [o.id, r.altitud_m, o.lat, o.lon, r.fuente]);
      conAltitud += 1;
    }
    ultimoId = o.id;
  }

  const procesadas = conAltitud + sinDato;
  if (procesadas > 0) {
    await registrar(pool, userId, 'dataset.altitud.calculada', 'especie', especieId ?? 'todas',
      { especie_id: especieId, procesadas, con_altitud: conAltitud, sin_dato: sinDato, incompleto: !!error || corte });
  }
  if (error) {
    // Lo ya guardado se conserva; el error dice qué hacer y cuántas quedaron.
    throw Object.assign(error, { message: `${error.message}${procesadas ? ` Se guardaron ${procesadas} altitudes antes de fallar.` : ''}` });
  }
  const hayMas = corte || pendientes.length === limite;
  return {
    procesadas,
    con_altitud: conAltitud,
    sin_dato: sinDato,
    siguiente_id: hayMas && ultimoId !== null ? Number(ultimoId) : null,
    faltan: await contarFaltantes(pool, especieId),
  };
}

module.exports = { COORD_LAT, COORD_LON, CANDIDATA, FALTA, consultar, alCrear, contarFaltantes, calcularFaltantes };
