/**
 * Especies (Admin → Especies): la puerta de entrada del sistema. dataset.especie es el único
 * catálogo — la curación de fotos, los centroides, los paquetes, la ficha pública y la app
 * cuelgan de una fila de aquí, así que crear una especie es una sola escritura.
 *
 * Reglas:
 * - El nombre es un binomial "Género epíteto"; el género sale del nombre, no se teclea aparte.
 * - `carpeta` (Género_epíteto) se deriva al crear y no cambia después: un cambio de nombre por
 *   taxonomía no mueve archivos (phase4.sql). `taxon_id` (COL_ANURA_NNNN) lo da una secuencia y
 *   tampoco cambia ni se reutiliza.
 * - Un género pertenece a una sola familia: si el nombre nuevo choca con las especies que ya
 *   están en ese género, se avisa (409) y solo se corrige a todo el género si se confirma.
 * - Todo cambio queda en audit.log.
 */
const { registrar } = require('./audit');

const falla = (mensaje, status = 400, extra = {}) => Object.assign(new Error(mensaje), { status, ...extra });

// Nombres sin identificar del todo ("Boana sp.", "Pristimantis cf. paisa") no son una especie.
const EPITETOS_NO_VALIDOS = ['sp', 'spp', 'cf', 'aff', 'gr', 'nov', 'indet'];

const pone = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/** "boana  Boans" → { nombre: 'Boana boans', genero: 'Boana', epiteto: 'boans' }. Falla con un 400 que dice qué corregir. */
function normalizarNombre(entrada) {
  const limpio = pone(entrada);
  if (!limpio) throw falla('Escribe el nombre científico: género y epíteto, por ejemplo «Boana boans».');
  const partes = limpio.split(' ');
  if (partes.length !== 2) {
    throw falla('El nombre científico lleva dos palabras: género y epíteto, por ejemplo «Boana boans». Las subespecies y los autores no van aquí.');
  }
  const [g, e] = partes;
  const genero = g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
  const epiteto = e.toLowerCase();
  if (!/^[A-Z][a-z]{2,}$/.test(genero)) throw falla(`El género «${g}» no es válido: solo letras sin tilde, mínimo tres.`);
  if (!/^[a-z]{2,}(-[a-z]{2,})?$/.test(epiteto)) throw falla(`El epíteto «${e}» no es válido: solo letras sin tilde, en minúscula.`);
  if (EPITETOS_NO_VALIDOS.includes(epiteto)) {
    throw falla(`«${genero} ${epiteto}» es un nombre sin identificar: una especie entra con su epíteto completo.`);
  }
  return { nombre: `${genero} ${epiteto}`, genero, epiteto };
}

/** "hylidae" → "Hylidae". Las familias de anuros terminan en «-idae». */
function normalizarFamilia(entrada) {
  const limpia = pone(entrada);
  if (!limpia) throw falla('Escribe la familia, por ejemplo «Hylidae».');
  const familia = limpia.charAt(0).toUpperCase() + limpia.slice(1).toLowerCase();
  if (!/^[A-Z][a-z]{2,}idae$/.test(familia)) {
    throw falla(`La familia «${limpia}» no es válida: una sola palabra, sin tilde, que termina en «-idae» (por ejemplo Hylidae).`);
  }
  return familia;
}

/** Si vino `genero` aparte, tiene que ser el del nombre. */
function generoCoherente(genero, esperado) {
  if (genero === undefined || genero === null || genero === '') return;
  if (pone(genero).toLowerCase() !== esperado.toLowerCase()) {
    throw falla(`El género «${pone(genero)}» no coincide con el nombre científico: el nombre empieza por «${esperado}».`);
  }
}

const COLUMNAS = 'id, carpeta, nombre_cientifico, genero, familia, taxon_id, creado';

/** Congéneres (mismo género, otra especie) que están en una familia distinta de `familia`. */
async function congeneresEnOtraFamilia(db, genero, familia, salvoId) {
  const { rows } = await db.query(
    `SELECT id, nombre_cientifico, familia FROM dataset.especie
     WHERE lower(genero) = lower($1) AND familia <> $2 AND ($3::int IS NULL OR id <> $3)
     ORDER BY nombre_cientifico`,
    [genero, familia, salvoId ?? null]
  );
  return rows;
}

function choqueDeFamilia(genero, familia, otros, alEditar) {
  const actual = [...new Set(otros.map((o) => o.familia))].join(' y ');
  return falla(
    `El género ${genero} ya está en ${actual} (${otros.length === 1 ? '1 especie' : `${otros.length} especies`}), no en ${familia}. ` +
      (alEditar
        ? 'Revisa la familia; si la taxonomía cambió, confirma y se corrige el género completo.'
        : 'Usa esa familia; si la taxonomía cambió, corrige antes la familia de esas especies desde su ficha en Especies.'),
    409,
    { codigo: 'familia_del_genero', detalle: { genero, familia_actual: otros[0].familia, familia_nueva: familia, especies: otros.map((o) => o.nombre_cientifico) } }
  );
}

async function nombreExistente(db, nombre, salvoId) {
  const { rows: [e] } = await db.query(
    'SELECT id, nombre_cientifico, taxon_id FROM dataset.especie WHERE lower(nombre_cientifico) = lower($1) AND ($2::int IS NULL OR id <> $2)',
    [nombre, salvoId ?? null]
  );
  return e || null;
}

function yaExiste(e) {
  return falla(`Ya existe ${e.nombre_cientifico}${e.taxon_id ? ` (${e.taxon_id})` : ''}: ábrela en el catálogo en vez de crearla otra vez.`, 409,
    { codigo: 'especie_existente', detalle: { especie_id: e.id } });
}

/** Carpeta estable: Género_epíteto; si otra especie renombrada ya la ocupa, se le añade _2, _3… */
async function carpetaLibre(db, genero, epiteto) {
  const base = `${genero}_${epiteto.replace(/-/g, '_')}`;
  for (let n = 1; n < 50; n += 1) {
    const candidata = n === 1 ? base : `${base}_${n}`;
    const { rows } = await db.query('SELECT 1 FROM dataset.especie WHERE lower(carpeta) = lower($1)', [candidata]);
    if (!rows.length) return candidata;
  }
  throw falla('No se pudo derivar una carpeta libre para esta especie', 409);
}

/** Siguiente COL_ANURA_NNNN que no esté en uso (la secuencia nunca repite; el bucle cubre ids importados a mano). */
async function siguienteTaxonId(db) {
  for (let i = 0; i < 20; i += 1) {
    const { rows: [{ n }] } = await db.query(`SELECT nextval('dataset.taxon_id_seq')::int AS n`);
    const id = `COL_ANURA_${String(n).padStart(4, '0')}`;
    const { rows } = await db.query('SELECT 1 FROM dataset.especie WHERE taxon_id = $1', [id]);
    if (!rows.length) return id;
  }
  throw falla('No se pudo asignar un identificador de taxón libre', 409);
}

async function enTransaccion(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw falla('Esa especie ya existe (otra persona la creó al mismo tiempo). Recarga el catálogo.', 409, { codigo: 'especie_existente' });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * POST /api/dataset/especies { nombre_cientifico, familia, genero? }.
 * Devuelve la especie con el mismo formato que una fila de /resumen (sin fotos todavía).
 */
async function crear(pool, body, userId) {
  const { nombre, genero, epiteto } = normalizarNombre(body?.nombre_cientifico);
  generoCoherente(body?.genero, genero);
  const familia = normalizarFamilia(body?.familia);

  return enTransaccion(pool, async (db) => {
    // Serializa las altas: dos personas creando el mismo género a la vez no se cruzan.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['dataset.especie.alta']);
    const previa = await nombreExistente(db, nombre);
    if (previa) throw yaExiste(previa);
    const otros = await congeneresEnOtraFamilia(db, genero, familia);
    if (otros.length) throw choqueDeFamilia(genero, familia, otros);

    const carpeta = await carpetaLibre(db, genero, epiteto);
    const taxonId = await siguienteTaxonId(db);
    const { rows: [e] } = await db.query(
      `INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS}`,
      [carpeta, nombre, genero, familia, taxonId]
    );
    await registrar(db, userId, 'dataset.especie.creada', 'especie', e.id, {
      nombre_cientifico: nombre, familia, carpeta, taxon_id: taxonId,
    });
    return e;
  });
}

/**
 * PUT /api/dataset/especies/:id { nombre_cientifico?, familia?, aplicar_a_congeneres? }.
 * El id, la carpeta y el taxon_id no cambian. Con `aplicar_a_congeneres` la familia nueva
 * también se pone a las demás especies del género (corrección taxonómica del género completo).
 */
async function editar(pool, especieId, body, userId) {
  if (!Number.isInteger(especieId)) throw falla('Esa especie no existe', 404);
  const trae = (k) => body && body[k] !== undefined;
  if (!trae('nombre_cientifico') && !trae('familia')) throw falla('No hay nada que cambiar: envía el nombre científico o la familia.');

  return enTransaccion(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['dataset.especie.alta']);
    const { rows: [antes] } = await db.query(`SELECT ${COLUMNAS} FROM dataset.especie WHERE id = $1 FOR UPDATE`, [especieId]);
    if (!antes) throw falla('Esa especie no existe', 404);

    let nombre = antes.nombre_cientifico;
    let genero = antes.genero;
    if (trae('nombre_cientifico')) {
      ({ nombre, genero } = normalizarNombre(body.nombre_cientifico));
      generoCoherente(body.genero, genero);
    }
    const familia = trae('familia') ? normalizarFamilia(body.familia) : antes.familia;
    if (nombre === antes.nombre_cientifico && familia === antes.familia && genero === antes.genero) {
      throw falla('No hay nada que cambiar: los datos son los mismos.');
    }

    if (nombre.toLowerCase() !== antes.nombre_cientifico.toLowerCase()) {
      const previa = await nombreExistente(db, nombre, especieId);
      if (previa) throw yaExiste(previa);
    }
    const otros = await congeneresEnOtraFamilia(db, genero, familia, especieId);
    const aplicar = body?.aplicar_a_congeneres === true;
    if (otros.length && !aplicar) throw choqueDeFamilia(genero, familia, otros, true);

    const { rows: [e] } = await db.query(
      `UPDATE dataset.especie SET nombre_cientifico = $2, genero = $3, familia = $4 WHERE id = $1 RETURNING ${COLUMNAS}`,
      [especieId, nombre, genero, familia]
    );
    let congeneres = [];
    if (otros.length) {
      await db.query(`UPDATE dataset.especie SET familia = $2 WHERE id = ANY($1::int[])`, [otros.map((o) => o.id), familia]);
      congeneres = otros.map((o) => ({ id: o.id, nombre_cientifico: o.nombre_cientifico, familia_antes: o.familia }));
    }
    await registrar(db, userId, 'dataset.especie.editada', 'especie', especieId, {
      antes: { nombre_cientifico: antes.nombre_cientifico, genero: antes.genero, familia: antes.familia },
      despues: { nombre_cientifico: e.nombre_cientifico, genero: e.genero, familia: e.familia },
      ...(congeneres.length ? { congeneres_corregidos: congeneres } : {}),
    });
    return { ...e, congeneres_corregidos: congeneres.length };
  });
}

/**
 * GET /api/dataset/especies/nombres — lo que ya está guardado, para los combobox del panel.
 * Género y familia no son filas: salen de `genero` y `familia` de dataset.especie, así que
 * una familia o un género "nuevo" existe solo cuando se guarda una especie con ese nombre.
 */
async function nombres(pool) {
  const { rows } = await pool.query(
    'SELECT id, nombre_cientifico, genero, familia FROM dataset.especie ORDER BY nombre_cientifico');
  const generos = new Map();
  const familias = new Map();
  for (const e of rows) {
    const g = generos.get(e.genero) || { nombre: e.genero, familia: e.familia, especies: 0 };
    g.especies += 1;
    generos.set(e.genero, g);
    const f = familias.get(e.familia) || { nombre: e.familia, generos: new Set(), especies: 0 };
    f.generos.add(e.genero);
    f.especies += 1;
    familias.set(e.familia, f);
  }
  return {
    especies: rows,
    generos: [...generos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    familias: [...familias.values()]
      .map((f) => ({ nombre: f.nombre, generos: f.generos.size, especies: f.especies }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

// Cómo se llama, para una persona, cada tabla que cuelga de una especie sin borrarse sola, y qué hacer.
const COLGANTES = {
  'dataset.centroide': ['vectores', 'centroides calculados', 'Genera de nuevo los centroides en Centroides sin esta especie.'],
  'dataset.centroide_regional': ['vectores', 'centroides regionales', 'Genera de nuevo los centroides en Centroides sin esta especie.'],
  'dataset.centroide_morfo': ['vectores', 'centroides de morfo', 'Quita sus morfos y genera de nuevo los centroides.'],
  'dataset.species_content': ['ficha', 'ficha de contenido', 'La ficha de Contenido no se puede borrar desde el panel todavía: pide que la retiren.'],
  'dataset.destacado': ['destacados', 'días en el carrusel de inicio', 'Quítala del calendario en Contenido → Destacados.'],
  'dataset.cluster_sugerido': ['clusteres', 'clústeres sugeridos', 'Descarta esos clústeres en Clústeres.'],
  'dataset.cluster': ['clusteres', 'clústeres aceptados', 'Quítala de esos clústeres en Clústeres.'],
  'dataset.evaluacion_especie': ['evaluaciones', 'evaluaciones guardadas', 'Las evaluaciones guardadas la citan: no se pueden borrar sin perder el historial.'],
  'dataset.hallazgo': ['hallazgos', 'hallazgos de limpieza', 'Resuelve sus hallazgos en Calidad.'],
};

/**
 * Qué impide borrar una especie: fotos, vectores (de sus fotos y centroides), paquetes que la
 * listan y cualquier otra tabla que la referencie sin ON DELETE CASCADE (se descubre en el
 * catálogo de Postgres, así una tabla futura no se cuela). Lista vacía = se puede borrar.
 */
async function dependencias(db, especieId) {
  const out = [];
  const agrega = (clave, que, total, quitar) => { if (total > 0) out.push({ clave, que, total, quitar }); };

  const { rows: [e] } = await db.query('SELECT taxon_id FROM dataset.especie WHERE id = $1', [especieId]);
  const { rows: [{ fotos }] } = await db.query('SELECT COUNT(*)::int AS fotos FROM dataset.foto WHERE especie_id = $1', [especieId]);
  agrega('fotos', 'fotos', fotos, 'Quita o traslada todas sus fotos en Imágenes antes de borrarla.');
  const { rows: [{ n: embeddings }] } = await db.query(
    'SELECT COUNT(*)::int AS n FROM dataset.embedding m JOIN dataset.foto f ON f.sha256 = m.sha256 WHERE f.especie_id = $1', [especieId]);
  agrega('vectores', 'vectores de sus fotos', embeddings, 'Salen con sus fotos: quita las fotos primero.');

  if (e?.taxon_id) {
    const { rows: [{ n: paquetes }] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM packages.regional_packages
       WHERE manifiesto -> 'especies' @> jsonb_build_array(jsonb_build_object('taxon_id', $1::text))`, [e.taxon_id]);
    agrega('paquetes', 'paquetes regionales que la incluyen', paquetes, 'Un paquete compilado la lista: compila uno nuevo sin ella y retira el anterior en Paquetes.');
  }

  const { rows: refs } = await db.query(
    `SELECT c.conrelid::regclass::text AS tabla, quote_ident(a.attname) AS columna
     FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f' AND c.confrelid = 'dataset.especie'::regclass AND c.confdeltype <> 'c'`);
  // centroide_regional guarda especie_id sin llave foránea, pero es un vector de esa especie.
  const sinFk = [{ tabla: 'dataset.centroide_regional', columna: 'especie_id' }];
  const vistas = new Set();
  for (const { tabla, columna } of [...refs, ...sinFk]) {
    if (tabla === 'dataset.foto') continue;
    const clave = `${tabla}.${columna}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const { rows: [{ n }] } = await db.query(`SELECT COUNT(*)::int AS n FROM ${tabla} WHERE ${columna} = $1`, [especieId]);
    const [grupo, que, quitar] = COLGANTES[tabla] || [tabla, `filas en ${tabla}`, `Quita esas filas de ${tabla} antes de borrarla.`];
    agrega(grupo, que, n, quitar);
  }
  return out;
}

const mensajeDeBloqueo = (nombre, deps) =>
  `No se puede borrar ${nombre} todavía: tiene ${deps.map((d) => `${d.que}: ${d.total.toLocaleString('es-CO')}`).join(', ')}. ` +
  'Quítalos antes y vuelve a intentarlo.';

/**
 * DELETE /api/dataset/especies/:id. Solo si nada apunta a la fila; si algo apunta, 409 con
 * `detalle.dependencias` (qué hay y cómo quitarlo). Se bloquea la fila: una foto que llegue
 * al mismo tiempo espera a que esto termine y la llave foránea hace de red de seguridad.
 */
async function borrar(pool, especieId, userId) {
  if (!Number.isInteger(especieId)) throw falla('Esa especie no existe', 404);
  return enTransaccion(pool, async (db) => {
    const { rows: [e] } = await db.query(`SELECT ${COLUMNAS} FROM dataset.especie WHERE id = $1 FOR UPDATE`, [especieId]);
    if (!e) throw falla('Esa especie no existe', 404);
    const deps = await dependencias(db, especieId);
    if (deps.length) {
      throw falla(mensajeDeBloqueo(e.nombre_cientifico, deps), 409, { codigo: 'especie_con_datos', detalle: { dependencias: deps } });
    }
    await db.query('DELETE FROM dataset.especie WHERE id = $1', [especieId]);
    await registrar(db, userId, 'dataset.especie.borrada', 'especie', especieId, {
      nombre_cientifico: e.nombre_cientifico, familia: e.familia, carpeta: e.carpeta, taxon_id: e.taxon_id,
    });
    return { id: especieId, nombre_cientifico: e.nombre_cientifico, borrada: true };
  });
}

module.exports = { crear, editar, borrar, nombres, dependencias, normalizarNombre, normalizarFamilia };
