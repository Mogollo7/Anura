/**
 * Clave de identificación «Paso a paso» (app Android). No es una clave taxonómica escrita a mano:
 * se ARMA con los datos que ya hay en el sistema para las especies de UN paquete de subregión, y la
 * app la recorre sin conexión. El JSON (formato 1) se descarga con el paquete y se guarda junto
 * a él; no va dentro del sqlite, porque el sustrato, los morfos y la ficha publicada pueden
 * cambiar sin recompilar el paquete. core/key/IdentificationKey.kt implementa el mismo
 * `resolver` de aquí.
 *
 * Especies: exactamente las del paquete que tiene el teléfono (el `manifiesto` guardado al
 * compilar: packages.regional_packages). Nunca especies de relleno. La subregión ya es el paquete:
 * no se pregunta.
 *
 * Caracteres (solo los que existen en los datos; cada especie sin el dato queda compatible con
 * todas las respuestas — "sin dato" nunca descarta):
 *  - altitud  (rango): la altitud efectiva de la Ficha técnica que viajó en el paquete
 *              (manual, o p5–p95 de los registros); si no hay, la altitud de literatura de la
 *              ficha pública publicada.
 *  - sustrato (categoría): etiquetas de Imágenes (dataset.observacion_etiqueta) de las
 *              observaciones válidas de la especie. Solo cuenta con al menos MIN_PUNTOS
 *              individuos etiquetados (la misma regla de la Ficha); con menos, "sin dato".
 *  - actividad (categoría): `actividad` de la ficha pública publicada (día / noche).
 *  - morfo    (categoría): morfos declarados para la especie EN esta subregión (dataset.morfo).
 *              Morfos con el mismo nombre (sin mayúsculas ni tildes) de especies distintas son
 *              la misma respuesta.
 *  - tamano   (rango): LRC decidida en la Ficha técnica (paquete); si no, la LHC de literatura
 *              de la ficha pública.
 * El estadio de vida no se pregunta: todas las especies tienen adultos, no separa especies.
 *
 * Rangos → bandas: cortes tomados de los propios límites de las especies, elegidos con avidez
 * para maximizar la ganancia sobre todas las especies del paquete (hasta MAX_BANDAS bandas).
 * Una especie es compatible con una banda si su rango se solapa con ella.
 *
 * Ganancia (bits) de preguntar un carácter sobre las especies que quedan R (uniforme): si la
 * especie es s, la persona responde una de sus opciones compatibles C(s) con igual probabilidad.
 *   P(a) = Σ_s [a ∈ C(s)] / (|R|·|C(s)|),  R_a = {s : a ∈ C(s)}
 *   ganancia = log2|R| − Σ_a P(a)·log2|R_a|
 * La siguiente pregunta es la de mayor ganancia entre las no respondidas (empate: orden del
 * arreglo `caracteres`, que ya viene ordenado por ganancia sobre todas las especies). "No sé"
 * marca el carácter como respondido sin filtrar.
 */
const crypto = require('crypto');
const { MIN_PUNTOS } = require('./ficha');

const FORMATO = 1;
const MAX_BANDAS = 4;
const EPS = 1e-9;

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const SUSTRATO_LABEL = { hojarasca: 'Hojarasca', vegetacion: 'Vegetación / hoja', quebrada: 'Quebrada / agua', roca: 'Roca' };
const ACTIVIDAD_LABEL = { diurna: 'Diurna', nocturna: 'Nocturna', crepuscular: 'Crepuscular', diurna_y_nocturna: 'Diurna y nocturna' };
// Crepuscular y "diurna y nocturna" quedan compatibles con las dos respuestas: nunca descartan.
const ACTIVIDAD_OPCIONES = { diurna: ['dia'], nocturna: ['noche'], crepuscular: ['dia', 'noche'], diurna_y_nocturna: ['dia', 'noche'] };

const TEXTOS = {
  altitud: { pregunta: '¿A qué altitud la viste?', ayuda: 'Mírala en el GPS del teléfono o en un mapa.', unidad: 'm' },
  sustrato: { pregunta: '¿Sobre qué estaba?', ayuda: 'El sitio exacto donde la encontraste.' },
  actividad: { pregunta: '¿La viste de día o de noche?', ayuda: 'La hora en que estaba activa.' },
  morfo: { pregunta: '¿A cuál de estas formas se parece?', ayuda: 'Formas de color y patrón registradas en esta subregión.' },
  tamano: { pregunta: '¿Cuánto medía del hocico a la cloaca?', ayuda: 'El largo del cuerpo, sin contar las patas.', unidad: 'mm' },
};
// Orden fijo solo para desempatar.
const CANONICO = ['altitud', 'sustrato', 'actividad', 'morfo', 'tamano'];

// ── Números en español de Colombia: 1.235 y 20,3 (Intl "es" no agrupa los de 4 cifras) ──
function numero(x) {
  const r = Math.round(x * 10) / 10;
  const [ent, dec] = Math.abs(r).toString().split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${r < 0 ? '−' : ''}${miles}${dec ? `,${dec}` : ''}`;
}

function textoRango(r, unidad) {
  if (r.min != null && r.max != null) return `${numero(r.min)}–${numero(r.max)} ${unidad}`;
  if (r.min != null) return `Desde ${numero(r.min)} ${unidad}`;
  return `Hasta ${numero(r.max)} ${unidad}`;
}

const mayuscula = (s) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1);
const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── Algoritmo puro (el mismo que la app) ─────────────────────────────────────────────────

/** Opciones compatibles de la especie para el carácter; null = sin dato (compatible con todas). */
function compatibles(especie, caracter) {
  const c = especie.estados[caracter.id];
  return c && c.length ? c : null;
}

function ganancia(caracter, restantes) {
  const n = restantes.length;
  if (n <= 1 || !caracter.opciones.length) return 0;
  const p = new Map();
  const tam = new Map();
  for (const s of restantes) {
    const c = compatibles(s, caracter) || caracter.opciones.map((o) => o.id);
    for (const a of c) {
      p.set(a, (p.get(a) || 0) + 1 / (n * c.length));
      tam.set(a, (tam.get(a) || 0) + 1);
    }
  }
  let esperado = 0;
  for (const o of caracter.opciones) {
    const pa = p.get(o.id) || 0;
    if (pa > 0) esperado += pa * Math.log2(tam.get(o.id));
  }
  return Math.log2(n) - esperado;
}

function siguiente(clave, restantes, respondidos) {
  let mejor = null;
  let g = EPS;
  for (const c of clave.caracteres) {
    if (respondidos.has(c.id)) continue;
    const x = ganancia(c, restantes);
    if (x > g + EPS) {
      mejor = c;
      g = x;
    }
  }
  return mejor;
}

/**
 * Recorre la clave con las respuestas dadas: [{ caracter, opcion }] (opcion null = "no sé").
 * estado: 'pregunta' (falta `siguiente`), 'una', 'varias' o 'ninguna'.
 */
function resolver(clave, respuestas = []) {
  let restantes = clave.especies;
  const respondidos = new Set();
  const noSe = new Set();
  const conDato = new Map(clave.especies.map((s) => [s.taxon_id, 0]));
  for (const r of respuestas) {
    const c = clave.caracteres.find((x) => x.id === r.caracter);
    if (!c) throw falla(`Carácter desconocido: ${r.caracter}`);
    respondidos.add(c.id);
    if (r.opcion == null) {
      noSe.add(c.id);
      continue;
    }
    if (!c.opciones.some((o) => o.id === r.opcion)) throw falla(`Opción desconocida: ${r.opcion}`);
    restantes = restantes.filter((s) => {
      const comp = compatibles(s, c);
      if (comp && !comp.includes(r.opcion)) return false;
      if (comp) conDato.set(s.taxon_id, conDato.get(s.taxon_id) + 1);
      return true;
    });
  }
  if (!restantes.length) return { estado: 'ninguna', especies: [] };
  if (restantes.length === 1) return { estado: 'una', especies: restantes.map((s) => s.taxon_id) };
  const sig = siguiente(clave, restantes, respondidos);
  if (sig) return { estado: 'pregunta', siguiente: sig.id, ganancia: ganancia(sig, restantes), especies: restantes.map((s) => s.taxon_id) };
  // Ya no queda pregunta que separe. Las que quedaron en "no sé" y separarían: pendientes. Si no
  // hay ninguna, con los datos de la clave estas especies no se pueden separar (indistinguibles).
  const pendientes = clave.caracteres.filter((c) => noSe.has(c.id) && ganancia(c, restantes) > EPS).map((c) => c.id);
  // Primero las que coincidieron con más respuestas en las que había dato; luego por nombre.
  const orden = [...restantes].sort((a, b) =>
    conDato.get(b.taxon_id) - conDato.get(a.taxon_id) || (a.nombre_cientifico < b.nombre_cientifico ? -1 : a.nombre_cientifico > b.nombre_cientifico ? 1 : 0));
  return {
    estado: 'varias',
    especies: orden.map((s) => s.taxon_id),
    pendientes,
    indistinguibles: pendientes.length === 0,
  };
}

// ── Construcción de la matriz ─────────────────────────────────────────────────────────────

/** Bandas para un carácter de rango: cortes en los límites de las especies, elegidos con avidez. */
function bandas(id, rangos) {
  const lo = (r) => (r.min == null ? -Infinity : r.min);
  // Un rango de un solo punto se trata como un poquito más ancho para que no quede fuera de todo.
  const hi = (r) => (r.max == null ? Infinity : r.max > lo(r) ? r.max : lo(r) + 1e-6);
  const candidatos = [...new Set(rangos.flatMap(([, r]) => [r.min, r.max]).filter((v) => v != null))].sort((a, b) => a - b);
  const armar = (cortes) => {
    const limites = [-Infinity, ...cortes, Infinity];
    const opciones = limites.slice(0, -1).map((desde, i) => ({ id: `${id}_${i}`, desde, hasta: limites[i + 1] }));
    const especies = rangos.map(([taxon, r]) => ({
      taxon_id: taxon,
      estados: { [id]: opciones.filter((o) => lo(r) < o.hasta && hi(r) > o.desde).map((o) => o.id) },
    }));
    return { caracter: { id, opciones }, especies };
  };
  const gananciaDe = (cortes) => {
    const a = armar(cortes);
    return ganancia(a.caracter, a.especies);
  };
  let cortes = [];
  let actual = 0;
  while (cortes.length < MAX_BANDAS - 1) {
    let mejor = null;
    let g = actual + EPS;
    for (const c of candidatos) {
      if (cortes.includes(c)) continue;
      const x = gananciaDe([...cortes, c].sort((a, b) => a - b));
      if (x > g + EPS) {
        mejor = c;
        g = x;
      }
    }
    if (mejor === null) break;
    cortes = [...cortes, mejor].sort((a, b) => a - b);
    actual = g;
  }
  return armar(cortes);
}

function etiquetaBanda(o, unidad) {
  if (o.desde === -Infinity && o.hasta === Infinity) return 'Cualquiera';
  if (o.desde === -Infinity) return `Menos de ${numero(o.hasta)} ${unidad}`;
  if (o.hasta === Infinity) return `${numero(o.desde)} ${unidad} o más`;
  return `De ${numero(o.desde)} a ${numero(o.hasta)} ${unidad}`;
}

/**
 * Arma la clave (pura, sin base) a partir de lo que se sabe de cada especie:
 * { taxon_id, nombre_cientifico, genero, familia, nombre_comun?,
 *   altitud?: {min,max,fuente}, tamano?: {min,max,fuente}, sustrato?: {n, conteos},
 *   actividad?: 'diurna'|..., morfos?: [nombre] }
 */
function construirClave(crudas) {
  const especies = crudas.map((e) => ({
    taxon_id: e.taxon_id,
    nombre_cientifico: e.nombre_cientifico,
    genero: e.genero,
    familia: e.familia,
    nombre_comun: e.nombre_comun || null,
    estados: {},
    resumen: {},
  }));
  const porTaxon = new Map(especies.map((s) => [s.taxon_id, s]));
  const caracteres = [];

  for (const id of ['altitud', 'tamano']) {
    const rangos = crudas.filter((e) => e[id] && (e[id].min != null || e[id].max != null)).map((e) => [e.taxon_id, e[id]]);
    if (!rangos.length) continue;
    const { caracter, especies: estados } = bandas(id, rangos);
    const unidad = TEXTOS[id].unidad;
    caracteres.push({
      id, tipo: 'rango', ...TEXTOS[id],
      opciones: caracter.opciones.map((o) => ({
        id: o.id, etiqueta: etiquetaBanda(o, unidad),
        desde: Number.isFinite(o.desde) ? o.desde : null, hasta: Number.isFinite(o.hasta) ? o.hasta : null,
      })),
    });
    for (const s of estados) porTaxon.get(s.taxon_id).estados[id] = s.estados[id];
    for (const [taxon, r] of rangos) porTaxon.get(taxon).resumen[id] = textoRango(r, unidad);
  }

  const conSustrato = crudas.filter((e) => e.sustrato && e.sustrato.n >= MIN_PUNTOS);
  if (conSustrato.length) {
    caracteres.push({
      id: 'sustrato', tipo: 'categoria', ...TEXTOS.sustrato,
      opciones: Object.entries(SUSTRATO_LABEL).map(([k, etiqueta]) => ({ id: k, etiqueta })),
    });
    for (const e of conSustrato) {
      const presentes = Object.keys(SUSTRATO_LABEL).filter((k) => (e.sustrato.conteos[k] || 0) > 0);
      porTaxon.get(e.taxon_id).estados.sustrato = presentes;
      porTaxon.get(e.taxon_id).resumen.sustrato = presentes
        .map((k) => `${SUSTRATO_LABEL[k]} (${e.sustrato.conteos[k]})`).join(' · ');
    }
  }

  const conActividad = crudas.filter((e) => ACTIVIDAD_OPCIONES[e.actividad]);
  if (conActividad.length) {
    caracteres.push({
      id: 'actividad', tipo: 'categoria', ...TEXTOS.actividad,
      opciones: [{ id: 'dia', etiqueta: 'De día' }, { id: 'noche', etiqueta: 'De noche' }],
    });
    for (const e of conActividad) {
      porTaxon.get(e.taxon_id).estados.actividad = ACTIVIDAD_OPCIONES[e.actividad];
      porTaxon.get(e.taxon_id).resumen.actividad = ACTIVIDAD_LABEL[e.actividad];
    }
  }

  const conMorfo = crudas.filter((e) => e.morfos && e.morfos.length);
  if (conMorfo.length) {
    const opciones = new Map(); // normalizado → etiqueta (la primera en orden alfabético)
    for (const nombre of conMorfo.flatMap((e) => e.morfos).sort((a, b) => a.localeCompare(b, 'es'))) {
      const k = normalizar(nombre);
      if (k && !opciones.has(k)) opciones.set(k, mayuscula(nombre.trim()));
    }
    const ids = [...opciones.keys()].sort((a, b) => a.localeCompare(b, 'es'));
    caracteres.push({
      id: 'morfo', tipo: 'categoria', ...TEXTOS.morfo,
      opciones: ids.map((k, i) => ({ id: `morfo_${i}`, etiqueta: opciones.get(k) })),
    });
    for (const e of conMorfo) {
      const propios = [...new Set(e.morfos.map(normalizar))].sort((a, b) => a.localeCompare(b, 'es'));
      porTaxon.get(e.taxon_id).estados.morfo = propios.map((k) => `morfo_${ids.indexOf(k)}`).sort();
      porTaxon.get(e.taxon_id).resumen.morfo = propios.map((k) => opciones.get(k)).join(' · ');
    }
  }

  // Solo caracteres que separan algo en el paquete, del que más separa al que menos.
  const conGanancia = caracteres
    .map((c) => ({ c, g: ganancia(c, especies) }))
    .filter((x) => x.g > EPS)
    .sort((a, b) => b.g - a.g || CANONICO.indexOf(a.c.id) - CANONICO.indexOf(b.c.id))
    .map(({ c, g }) => ({ ...c, ganancia_bits: Math.round(g * 1000) / 1000 }));
  const usados = new Set(conGanancia.map((c) => c.id));
  for (const s of especies) {
    for (const k of Object.keys(s.estados)) if (!usados.has(k)) delete s.estados[k];
  }
  especies.sort((a, b) => a.nombre_cientifico.localeCompare(b.nombre_cientifico));
  return { caracteres: conGanancia, especies };
}

/**
 * Cuántas especies tienen dato en cada carácter. Lo que la clave sabe hoy, sin suponer nada de lo que falta:
 * una especie sin dato sigue siendo compatible con todas las respuestas.
 */
function cobertura(caracteres, especies) {
  return {
    especies: especies.length,
    caracteres: caracteres.map((c) => ({ id: c.id, especies_con_dato: especies.filter((s) => (s.estados[c.id] || []).length > 0).length })),
  };
}

/** Texto que avisa cuando la clave separa poco. Null si hay datos suficientes para que ayude. */
function avisoDe(caracteres, especies) {
  if (especies.length < 2) return null;
  if (!caracteres.length) {
    return 'Con los datos de hoy ninguna pregunta separa estas especies: la clave no puede ayudar a distinguirlas. Faltan altitud, sustrato, actividad, morfos o tamaño en sus fichas.';
  }
  const conDato = new Set(especies.filter((s) => Object.values(s.estados).some((e) => e.length)).map((s) => s.taxon_id));
  if (conDato.size * 2 < especies.length) {
    return `Solo ${conDato.size} de ${especies.length} especies tienen algún dato para responder las preguntas: la clave separa poco. Las que no tienen dato quedan compatibles con cualquier respuesta.`;
  }
  return null;
}

// ── Lectura de la base ────────────────────────────────────────────────────────────────────

/**
 * El paquete de la subregión (id "05.VALLE_DE_ABURRA" o id numérico de subregión). Sin versión:
 * el publicado. Con versión: esa, si está o estuvo publicada (el teléfono puede tener una
 * anterior mientras no actualice).
 */
async function paqueteDe(db, subregion, version) {
  const v = version == null || version === '' ? null : Number(version);
  if (v !== null && !Number.isInteger(v)) throw falla('version debe ser un número entero');
  const { rows: [p] } = await db.query(`
    SELECT p.id, p.region_id, p.version, p.sha256, p.estado, p.origen, p.manifiesto, p.subregion_id, s.nombre AS subregion
    FROM packages.regional_packages p JOIN dataset.subregion s ON s.id = p.subregion_id
    WHERE (p.region_id = $1 OR p.subregion_id::text = $1)
      AND (($2::int IS NULL AND p.estado = 'publicado') OR (p.version = $2::int AND p.estado IN ('publicado', 'retirado')))
    ORDER BY p.version DESC LIMIT 1`, [String(subregion), v]);
  return p || null;
}

/** GET /api/dataset/publico/clave?subregion=<paquete o id>&version=<n> */
async function deSubregion(db, subregion, version) {
  if (!subregion) throw falla('Indica la subregión (?subregion=05.VALLE_DE_ABURRA)');
  const p = await paqueteDe(db, subregion, version);
  if (!p) {
    throw falla(version ? 'Esa versión del paquete no existe o nunca se publicó' : 'Esa subregión no tiene un paquete publicado', 404);
  }
  const delPaquete = (p.manifiesto?.especies || []).filter((e) => e.taxon_id);
  const taxones = delPaquete.map((e) => e.taxon_id);
  const { rows: ids } = await db.query('SELECT id, taxon_id FROM dataset.especie WHERE taxon_id = ANY($1)', [taxones]);
  const idDe = new Map(ids.map((r) => [r.taxon_id, r.id]));
  const especieIds = ids.map((r) => r.id);

  const { rows: sust } = await db.query(`
    SELECT f.especie_id, et.sustrato, COUNT(DISTINCT o.id)::int AS n
    FROM dataset.observacion o
    JOIN dataset.observacion_etiqueta et ON et.observacion_id = o.id AND et.sustrato IS NOT NULL
    JOIN dataset.foto f ON f.observacion_id = o.id AND f.especie_id = ANY($1::int[])
    WHERE o.invalidada_en IS NULL
      AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = f.sha256 AND x.revertida IS NULL)
    GROUP BY f.especie_id, et.sustrato`, [especieIds]);
  const { rows: morfos } = await db.query(`
    SELECT especie_id, nombre FROM dataset.morfo
    WHERE subregion_id = $1 AND especie_id = ANY($2::int[]) ORDER BY especie_id, nombre`, [p.subregion_id, especieIds]);
  const { rows: fichas } = await db.query(`
    SELECT c.especie_id, c.publicada->'campos' AS campos FROM dataset.species_content c
    WHERE c.publicada IS NOT NULL AND c.especie_id = ANY($1::int[])`, [especieIds]);
  const campos = new Map(fichas.map((f) => [f.especie_id, f.campos || {}]));

  const crudas = delPaquete.map((e) => {
    const id = idDe.get(e.taxon_id);
    const c = campos.get(id) || {};
    const ctx = e.contexto || {};
    const rango = (r, fuente) => (r && (r.min != null || r.max != null) ? { min: r.min ?? null, max: r.max ?? null, fuente } : null);
    const conteos = {};
    let n = 0;
    for (const s of sust.filter((x) => x.especie_id === id)) {
      conteos[s.sustrato] = s.n;
      n += s.n;
    }
    return {
      taxon_id: e.taxon_id,
      nombre_cientifico: e.nombre_cientifico,
      genero: e.genero,
      familia: e.familia,
      nombre_comun: c.nombre_comun?.valor || null,
      altitud: rango(ctx.altitud, ctx.altitud?.origen === 'manual' ? 'ficha_tecnica_manual' : 'ficha_tecnica')
        || rango(c.altitud_literatura, 'ficha_publica'),
      tamano: (ctx.lrc?.metodo === 'manual' ? rango(ctx.lrc, 'ficha_tecnica_manual') : null) || rango(c.lhc, 'ficha_publica'),
      sustrato: n ? { n, conteos } : null,
      actividad: c.actividad || null,
      morfos: morfos.filter((m) => m.especie_id === id).map((m) => m.nombre),
    };
  });

  const { caracteres, especies } = construirClave(crudas);
  const huella = crypto.createHash('sha256').update(JSON.stringify({ caracteres, especies })).digest('hex');
  return {
    formato: FORMATO,
    paquete: { id: p.region_id, version: p.version, sha256: p.sha256, estado: p.estado, origen: p.origen },
    subregion: { id: p.subregion_id, nombre: p.subregion },
    generado: new Date().toISOString(),
    huella,
    min_individuos_sustrato: MIN_PUNTOS,
    cobertura: cobertura(caracteres, especies),
    aviso: avisoDe(caracteres, especies),
    caracteres,
    especies,
  };
}

module.exports = { deSubregion, construirClave, resolver, ganancia, siguiente, bandas, numero, FORMATO, MAX_BANDAS };
