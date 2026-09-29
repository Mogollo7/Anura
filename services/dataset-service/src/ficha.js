/**
 * Ficha técnica de una especie (Admin → Limpiar → Ficha). Todo lo que se puede CALCULAR sale de
 * las observaciones del dataset y se recalcula en cada lectura (no se guarda); lo que decide una
 * PERSONA (rango de altitud a mano, pesos wv/wg/wm, LRC) vive en dataset.ficha_ajuste con su
 * permiso propio y su fila en audit.log. Ver 19_ADMIN/Entradas y Ficha de Especie, bloque 2.
 *
 * Observación válida de una especie: no invalidada en Curación y con al menos una foto de la
 * especie sin exclusión activa. Para la altitud además exige coordenada decidida por la limpieza
 * (uso_geografico = 'punto') y que la altitud sea la de esa misma coordenada: una observación
 * aproximada o por decidir no puede aportar metros. Los morfos NO se gestionan aquí: la Ficha
 * los muestra (GET .../etiquetas) y Imágenes los edita.
 */
const { registrar } = require('./audit');
const { DEFAULTS, mediana, zRobusto } = require('./limpieza');
const { CANDIDATA, FALTA } = require('./altitud');
const regiones = require('./regiones');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const puede = (account, accion) => account.isSuperAdmin || !!account.permissions?.[accion];

const SUSTRATOS = ['hojarasca', 'vegetacion', 'quebrada', 'roca'];
// Mismos umbrales que admin/src/lib/dataset/reglas.ts (MIN_FOTOS_ENTRENABLE, MIN_INDIVIDUOS).
const MIN_FOTOS_ENTRENABLE = 10;
const MIN_INDIVIDUOS = 3;
// Con menos registros que esto (la misma regla de la limpieza) un percentil, una desviación o un
// "atípico" no dicen nada: se muestran con aviso y no proponen pesos.
const MIN_PUNTOS = DEFAULTS.min_puntos_especie;
// Una altitud atípica además tiene que estar a más de esto de la mediana (el margen de la ficha
// anterior): con MAD chico, unos pocos metros de diferencia no son un GPS malo.
const ATIPICA_MIN_DESVIACION_M = 150;
const MAX_ATIPICAS = 100;

const redondear = (x, d = 1) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Percentil por interpolación lineal (igual que numpy.percentile y percentile_cont). `ordenado` de menor a mayor. */
function percentil(ordenado, p) {
  if (!ordenado.length) return null;
  const pos = (ordenado.length - 1) * p;
  const i = Math.floor(pos);
  const f = pos - i;
  return i + 1 < ordenado.length ? ordenado[i] + f * (ordenado[i + 1] - ordenado[i]) : ordenado[i];
}

/** Resumen de altitudes: n, media, desviación (poblacional), mínimo, máximo y p5–p95. */
function resumenAltitud(valores) {
  const n = valores.length;
  if (!n) return null;
  const s = [...valores].sort((a, b) => a - b);
  const media = s.reduce((a, b) => a + b, 0) / n;
  const desviacion = Math.sqrt(s.reduce((a, b) => a + (b - media) ** 2, 0) / n);
  return {
    n, media, desviacion, min: s[0], max: s[n - 1],
    p05: percentil(s, 0.05), p95: percentil(s, 0.95),
    poco_confiable: n < MIN_PUNTOS,
  };
}

/**
 * Atípicos de altitud: la misma idea mediana/MAD de la limpieza (limpieza.js: mediana y zRobusto,
 * umbral z_atipica), más una desviación mínima en metros. Solo propone: la persona decide
 * invalidando la observación en Imágenes.
 */
function atipicas(obs) {
  if (obs.length < MIN_PUNTOS) return [];
  const alt = obs.map((o) => o.altitud_m);
  const med = mediana(alt);
  const mad = mediana(alt.map((a) => Math.abs(a - med)));
  return obs
    .map((o) => ({ ...o, z_robusto: zRobusto(o.altitud_m, med, mad), desviacion_m: o.altitud_m - med, mediana_m: med }))
    .filter((o) => Math.abs(o.z_robusto) > DEFAULTS.z_atipica && Math.abs(o.desviacion_m) > ATIPICA_MIN_DESVIACION_M)
    .sort((a, b) => Math.abs(b.z_robusto) - Math.abs(a.z_robusto))
    .slice(0, MAX_ATIPICAS)
    .map((o) => ({
      observacion_id: Number(o.id), fuente: o.fuente, fuente_id: o.fuente_id, observada_en: o.observada_en,
      altitud_m: redondear(o.altitud_m), mediana_m: redondear(o.mediana_m),
      desviacion_m: redondear(o.desviacion_m), z_robusto: redondear(o.z_robusto),
    }));
}

/**
 * Prior de sustrato = proporción de individuos con ese sustrato entre los que tienen sustrato
 * etiquetado, redondeada a 2 decimales y con piso de 0,01 (el prior vive entre 0,01 y 1,0:
 * un 0 anularía la capa de hábitat del OSR para un sustrato apenas no visto). Sin ninguna
 * etiqueta no hay prior: no se rellena con 0,01 a todos.
 */
function priorsDeSustrato(sustratos) {
  const conteos = Object.fromEntries(SUSTRATOS.map((s) => [s, 0]));
  for (const s of sustratos) if (s in conteos) conteos[s] += 1;
  const n = sustratos.length;
  if (!n) return { n, conteos, priors: null };
  return {
    n, conteos,
    priors: Object.fromEntries(SUSTRATOS.map((s) => [s, Math.max(0.01, Math.round((conteos[s] / n) * 100) / 100)])),
  };
}

/**
 * Pesos wv/wg/wm PROPUESTOS por lo medido (no un dato de la persona): una regla por perfil
 * ecológico, la misma de la ficha anterior. El herpetólogo puede confirmar otros; el efectivo es
 * el manual si existe, si no este.
 *  - quebrada ≥ 0,40                    → especialista de quebrada  (0,50 / 0,20 / 0,30)
 *  - σ altitud < 200 m y prior máx ≥ 0,5 → endémica de montaña      (0,30 / 0,60 / 0,10)
 *  - σ altitud ≥ 600 m                   → generalista              (0,78 / 0,12 / 0,10)
 *  - otro caso                           → par críptico / indefinido (0,35 / 0,35 / 0,30)
 */
function proponerPesos(desviacion, priors) {
  const maxPrior = Math.max(...Object.values(priors));
  if (priors.quebrada >= 0.4) return { wv: 0.5, wg: 0.2, wm: 0.3, perfil: 'especialista_quebrada' };
  if (desviacion < 200 && maxPrior >= 0.5) return { wv: 0.3, wg: 0.6, wm: 0.1, perfil: 'endemica_montana' };
  if (desviacion >= 600) return { wv: 0.78, wg: 0.12, wm: 0.1, perfil: 'generalista' };
  return { wv: 0.35, wg: 0.35, wm: 0.3, perfil: 'par_criptico' };
}

// ── Lectura ─────────────────────────────────────────────────────────────────────────────

// Fotos de la especie que siguen en el dataset (sin exclusión activa).
const FOTO_ACTIVA = `f.especie_id = $1 AND NOT EXISTS (
  SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = f.sha256 AND x.revertida IS NULL)`;
const VALIDA = `o.invalidada_en IS NULL AND EXISTS (
  SELECT 1 FROM dataset.foto f WHERE f.observacion_id = o.id AND ${FOTO_ACTIVA})`;

async function estadoDeLaEspecie(pool, especieId) {
  const { rows: [r] } = await pool.query(`
    SELECT COUNT(*)::int AS fotos_activas,
           COUNT(DISTINCT f.observacion_id)::int AS individuos,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM dataset.embedding e WHERE e.sha256 = f.sha256))::int AS con_vector,
           EXISTS (SELECT 1 FROM dataset.centroide c
                   WHERE c.especie_id = $1 AND c.experimento_id = (SELECT MAX(id) FROM dataset.experimento)) AS con_centroide
    FROM dataset.foto f WHERE ${FOTO_ACTIVA}`, [especieId]);
  const entrenable = r.fotos_activas >= MIN_FOTOS_ENTRENABLE && r.individuos >= MIN_INDIVIDUOS;
  // DRAFT: no alcanza para entrenar. Después, lo más avanzado que el pipeline ya hizo de verdad.
  const estado = !entrenable ? 'DRAFT'
    : r.con_centroide ? 'CENTROID_READY'
      : r.con_vector === r.fotos_activas ? 'EMBEDDINGS_READY' : 'DATASET_READY';
  const { rows: [v] } = await pool.query('SELECT nombre FROM dataset.version ORDER BY id DESC LIMIT 1');
  return { estado, entrenable, fotos_activas: r.fotos_activas, individuos: r.individuos, con_vector: r.con_vector,
    version: v?.nombre ?? null, min_fotos: MIN_FOTOS_ENTRENABLE, min_individuos: MIN_INDIVIDUOS };
}

/** Subregiones (de departamentos activos) donde hay al menos una observación de la especie. Sin geo-service: null + motivo. */
async function subregionesConRegistros(pool, especieId) {
  try {
    const { rows: activas } = await pool.query("SELECT codigo_dane FROM dataset.region WHERE estado = 'activa'");
    if (!activas.length) return { lista: [], motivo: 'Ningún departamento está activo todavía (Paquetes → Regiones).' };
    const lista = [];
    for (const { codigo_dane: codigo } of activas) {
      const porMunicipio = await regiones.cifrasPorMunicipio(pool, codigo);
      const { rows } = await pool.query(`
        SELECT s.id, s.nombre, r.nombre AS region,
               COALESCE(array_agg(m.municipio_dane) FILTER (WHERE m.municipio_dane IS NOT NULL), '{}') AS municipios
        FROM dataset.subregion s JOIN dataset.region r ON r.codigo_dane = s.region
        LEFT JOIN dataset.subregion_municipio m ON m.subregion_id = s.id
        WHERE s.region = $1 GROUP BY s.id, r.nombre ORDER BY s.numero`, [codigo]);
      for (const s of rows) {
        if (s.municipios.some((m) => porMunicipio.get(m.trim())?.especies.has(especieId))) {
          lista.push({ id: s.id, nombre: s.nombre, region: s.region });
        }
      }
    }
    return { lista, motivo: null };
  } catch (err) {
    return { lista: null, motivo: err.status === 502 ? err.message : `No se pudieron ubicar las observaciones (${err.message}).` };
  }
}

/** GET /api/dataset/especies/:id/ficha */
async function deEspecie(pool, especieId) {
  const { rows: [especie] } = await pool.query(
    'SELECT id, carpeta, nombre_cientifico, genero, familia, taxon_id FROM dataset.especie WHERE id = $1', [especieId]);
  if (!especie) throw falla('La especie no existe en el dataset', 404);

  const { rows: obs } = await pool.query(`
    SELECT o.id, o.fuente, o.fuente_id, o.observada_en, o.altitud_m,
           o.uso_geografico, o.latitud IS NULL AS sin_coordenada,
           (o.altitud_m IS NOT NULL AND o.uso_geografico = 'punto'
             AND o.altitud_lat = o.latitud_limpia AND o.altitud_lon = o.longitud_limpia) AS altitud_vale,
           (${CANDIDATA} AND ${FALTA}) AS falta_altitud,
           e.sustrato
    FROM dataset.observacion o
    LEFT JOIN dataset.observacion_etiqueta e ON e.observacion_id = o.id
    WHERE ${VALIDA}`, [especieId]);

  const conAltitud = obs.filter((o) => o.altitud_vale);
  const resumen = resumenAltitud(conAltitud.map((o) => o.altitud_m));
  const sust = priorsDeSustrato(obs.map((o) => o.sustrato).filter(Boolean));

  const { rows: [aj] } = await pool.query('SELECT * FROM dataset.ficha_ajuste WHERE especie_id = $1', [especieId]);
  const manualAltitud = aj?.altitud_min != null ? { min: aj.altitud_min, max: aj.altitud_max } : null;
  const manualPesos = aj?.peso_wv != null ? { wv: aj.peso_wv, wg: aj.peso_wg, wm: aj.peso_wm } : null;
  const calcAltitud = resumen ? { min: redondear(resumen.p05, 0), max: redondear(resumen.p95, 0) } : null;

  let calcPesos = null;
  let motivoPesos = null;
  if (!resumen || resumen.n < MIN_PUNTOS) {
    motivoPesos = `Faltan altitudes: se necesitan al menos ${MIN_PUNTOS} observaciones con altitud (hay ${resumen?.n ?? 0}).`;
  } else if (sust.n < MIN_PUNTOS) {
    motivoPesos = `Faltan sustratos: se necesitan al menos ${MIN_PUNTOS} individuos con sustrato etiquetado en Imágenes (hay ${sust.n}).`;
  } else {
    calcPesos = proponerPesos(resumen.desviacion, sust.priors);
  }

  const { lista: subregiones, motivo: subregionesMotivo } = await subregionesConRegistros(pool, especieId);
  const estado = await estadoDeLaEspecie(pool, especieId);

  return {
    especie,
    dataset: estado,
    observaciones: {
      validas: obs.length,
      sin_coordenada: obs.filter((o) => o.sin_coordenada).length,
      // Todavía sin decisión de limpieza (Calidad): no aportan metros hasta que se decida.
      sin_limpiar: obs.filter((o) => !o.sin_coordenada && o.uso_geografico === null).length,
      solo_celda: obs.filter((o) => o.uso_geografico === 'celda').length,
      excluidas_geografia: obs.filter((o) => o.uso_geografico === 'excluida').length,
      con_altitud: conAltitud.length,
      falta_altitud: obs.filter((o) => o.falta_altitud).length,
    },
    altitud: {
      resumen: resumen && {
        n: resumen.n,
        media: redondear(resumen.media), desviacion: redondear(resumen.desviacion),
        min: redondear(resumen.min), max: redondear(resumen.max),
        p05: redondear(resumen.p05), p95: redondear(resumen.p95),
        poco_confiable: resumen.poco_confiable,
      },
      calculado: calcAltitud,
      manual: manualAltitud,
      efectivo: manualAltitud ? { ...manualAltitud, origen: 'manual' } : calcAltitud ? { ...calcAltitud, origen: 'calculado' } : null,
      atipicas: atipicas(conAltitud),
      min_puntos: MIN_PUNTOS,
    },
    sustrato: { n: sust.n, conteos: sust.conteos, priors: sust.priors },
    pesos: {
      calculado: calcPesos,
      motivo: motivoPesos,
      manual: manualPesos,
      efectivo: manualPesos ? { ...manualPesos, origen: 'manual' } : calcPesos ? { wv: calcPesos.wv, wg: calcPesos.wg, wm: calcPesos.wm, origen: 'calculado' } : null,
    },
    lrc: { metodo: aj?.lrc_metodo ?? 'pendiente', min: aj?.lrc_min ?? null, max: aj?.lrc_max ?? null },
    subregiones,
    subregiones_motivo: subregionesMotivo,
    decisiones: aj ? { altitud_en: aj.altitud_en, pesos_en: aj.pesos_en, lrc_en: aj.lrc_en } : null,
  };
}

// ── Decisiones de una persona ───────────────────────────────────────────────────────────

const numero = (v) => (v === null || v === undefined || v === '' ? NaN : Number(String(v).replace(',', '.')));

/**
 * PUT /api/dataset/especies/:id/ficha { altitud?: {min,max}|null, pesos?: {wv,wg,wm}|null,
 * lrc?: {metodo, min?, max?} }. Solo cambia lo que viene; null vuelve a lo calculado. Cada bloque
 * exige su permiso y se valida todo antes de escribir.
 */
async function ajustar(pool, especieId, body, account, userId) {
  const PERMISO = { altitud: 'definirMicrohabitat', pesos: 'definirPesos', lrc: 'definirLRC' };
  const bloques = Object.keys(PERMISO).filter((b) => b in body);
  if (!bloques.length) throw falla('No hay nada que cambiar');
  for (const b of bloques) if (!puede(account, PERMISO[b])) throw falla(`Falta el permiso "${PERMISO[b]}"`, 403);
  const { rows: [e] } = await pool.query('SELECT id FROM dataset.especie WHERE id = $1', [especieId]);
  if (!e) throw falla('La especie no existe en el dataset', 404);

  const set = {}; // columna → valor
  const meta = {}; // bloque → lo que queda en audit.log
  if ('altitud' in body) {
    if (body.altitud === null) {
      Object.assign(set, { altitud_min: null, altitud_max: null, altitud_por: userId, altitud_en: new Date() });
      meta.altitud = null;
    } else {
      const min = numero(body.altitud?.min);
      const max = numero(body.altitud?.max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) throw falla('Escribe el mínimo y el máximo de altitud en metros');
      if (min >= max) throw falla('El mínimo de altitud debe ser menor que el máximo');
      if (min < -500 || max > 9000) throw falla('La altitud debe estar entre -500 y 9000 m');
      Object.assign(set, { altitud_min: min, altitud_max: max, altitud_por: userId, altitud_en: new Date() });
      meta.altitud = { min, max };
    }
  }
  if ('pesos' in body) {
    if (body.pesos === null) {
      Object.assign(set, { peso_wv: null, peso_wg: null, peso_wm: null, pesos_por: userId, pesos_en: new Date() });
      meta.pesos = null;
    } else {
      const { wv, wg, wm } = { wv: numero(body.pesos?.wv), wg: numero(body.pesos?.wg), wm: numero(body.pesos?.wm) };
      if (![wv, wg, wm].every((x) => Number.isFinite(x) && x >= 0 && x <= 1)) throw falla('Cada peso va entre 0 y 1');
      const suma = wv + wg + wm;
      if (Math.abs(suma - 1) > 0.011) {
        throw falla(`wv + wg + wm debe sumar 1,0 (hoy suma ${suma.toFixed(2).replace('.', ',')})`);
      }
      // Se guarda normalizado: el compilador rechaza pesos que no sumen 1 exacto.
      const r = (v) => Math.round((v / suma) * 1000) / 1000;
      const nwv = r(wv);
      const nwg = r(wg);
      const nwm = Math.round((1 - nwv - nwg) * 1000) / 1000;
      Object.assign(set, { peso_wv: nwv, peso_wg: nwg, peso_wm: nwm, pesos_por: userId, pesos_en: new Date() });
      meta.pesos = { wv: nwv, wg: nwg, wm: nwm };
    }
  }
  if ('lrc' in body) {
    const metodo = body.lrc?.metodo;
    if (metodo === 'pendiente') {
      Object.assign(set, { lrc_metodo: 'pendiente', lrc_min: null, lrc_max: null, lrc_por: userId, lrc_en: new Date() });
      meta.lrc = { metodo };
    } else if (metodo === 'manual') {
      const min = numero(body.lrc.min);
      const max = numero(body.lrc.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) throw falla('Escribe la LRC mínima y máxima en milímetros');
      if (min > max) throw falla('La LRC mínima no puede ser mayor que la máxima');
      Object.assign(set, { lrc_metodo: 'manual', lrc_min: min, lrc_max: max, lrc_por: userId, lrc_en: new Date() });
      meta.lrc = { metodo, min, max };
    } else {
      throw falla('Método de LRC inválido (pendiente o manual)');
    }
  }

  const columnas = Object.keys(set);
  await pool.query(
    `INSERT INTO dataset.ficha_ajuste (especie_id, ${columnas.join(', ')})
     VALUES ($1, ${columnas.map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (especie_id) DO UPDATE SET ${columnas.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`,
    [especieId, ...columnas.map((c) => set[c])]);
  for (const b of bloques) await registrar(pool, userId, `dataset.ficha.${b}`, 'especie', especieId, { [b]: meta[b] });
  return deEspecie(pool, especieId);
}

module.exports = { deEspecie, ajustar, percentil, resumenAltitud, atipicas, priorsDeSustrato, proponerPesos, MIN_PUNTOS };
