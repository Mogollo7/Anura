/**
 * Versión del dataset (Admin → Centroides → «Versión del dataset»).
 *
 * Una versión es la foto congelada de qué fotos entrenan, cuáles validan y cuáles prueban
 * (dataset.version + dataset.version_foto). Centroides, OSR, Métricas y el paquete leen siempre
 * la ÚLTIMA versión. Antes solo la creaba el importador de Python (training/prepare_dataset.py);
 * sin ella, una base recién vaciada nunca podía calcular centroides. Aquí se crea desde el panel
 * con la misma regla del importador:
 *
 * - Se reparte por individuo (observación): las fotos de una misma observación van juntas a una
 *   sola partición, así una foto de prueba nunca tiene una «hermana» en entrenamiento.
 * - 70 / 15 / 15 por especie, en un orden reproducible (hash con la semilla), y con al menos un
 *   individuo en validación y otro en prueba cuando la especie tiene 3 o más.
 * - Entran las fotos de especies del catálogo (con taxon_id) que no estén excluidas y cuya
 *   observación no esté invalidada: lo que se excluye en Imágenes «sale desde la próxima versión».
 *
 * Al crear una versión nueva, los centroides y todo lo que dependa de ellos quedan
 * desactualizados (la Validación técnica lo dice): hay que recalcular.
 */
const crypto = require('crypto');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
const auditar = require('./audit').auditorDe('version');

const PROPORCIONES = [0.7, 0.15, 0.15];
const SEMILLA = 'anura';

/** Fotos que entrarían a una versión creada hoy. */
const ELEGIBLES = `
  SELECT f.sha256, f.especie_id, COALESCE(f.observacion_id::text, 'foto:' || f.sha256) AS individuo
  FROM dataset.foto f
  JOIN dataset.especie e ON e.id = f.especie_id AND e.taxon_id IS NOT NULL
  LEFT JOIN dataset.observacion o ON o.id = f.observacion_id
  WHERE o.invalidada_motivo IS NULL
    AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = f.sha256 AND x.revertida IS NULL)`;

// Como round() de Python (el importador): la mitad va al par.
function redondear(x) {
  const piso = Math.floor(x);
  if (Math.abs(x - piso - 0.5) < 1e-9) return piso % 2 === 0 ? piso : piso + 1;
  return Math.round(x);
}

/** Cuántos individuos van a cada partición (misma regla que repartir() del importador). */
function repartir(n, proporciones = PROPORCIONES) {
  let train = redondear(n * proporciones[0]);
  let val = redondear(n * proporciones[1]);
  if (n >= 3) {
    train = Math.min(train, n - 2);
    val = Math.max(1, Math.min(val, n - train - 1));
  }
  return { train, val, test: n - train - val };
}

const orden = (semilla, especieId, individuo) =>
  crypto.createHash('sha256').update(`${semilla}:${especieId}:${individuo}`).digest('hex');

/** Asigna partición a cada foto. Devuelve [{ sha256, particion }]. Pura: no toca la base. */
function asignar(fotos, proporciones = PROPORCIONES, semilla = SEMILLA) {
  const porEspecie = new Map();
  for (const f of fotos) {
    if (!porEspecie.has(f.especie_id)) porEspecie.set(f.especie_id, new Map());
    const inds = porEspecie.get(f.especie_id);
    if (!inds.has(f.individuo)) inds.set(f.individuo, []);
    inds.get(f.individuo).push(f.sha256);
  }
  const salida = [];
  for (const [especieId, inds] of porEspecie) {
    const claves = [...inds.keys()].sort((a, b) => orden(semilla, especieId, a).localeCompare(orden(semilla, especieId, b)));
    const cupo = repartir(claves.length, proporciones);
    claves.forEach((k, i) => {
      const particion = i < cupo.train ? 'train' : i < cupo.train + cupo.val ? 'val' : 'test';
      for (const sha256 of inds.get(k)) salida.push({ sha256, particion });
    });
  }
  return salida;
}

const contar = (filas) => {
  const c = { train: 0, val: 0, test: 0 };
  for (const f of filas) c[f.particion] += 1;
  return c;
};

/** Versiones existentes (la última es la vigente) y cuánto cambió el dataset desde entonces. */
async function listar(pool) {
  const { rows: versiones } = await pool.query(`
    SELECT v.id, v.nombre, v.creado, v.creado_por, v.manifiesto_sha256, v.parametros,
           COUNT(*) FILTER (WHERE vf.particion = 'train')::int AS train,
           COUNT(*) FILTER (WHERE vf.particion = 'val')::int AS val,
           COUNT(*) FILTER (WHERE vf.particion = 'test')::int AS test
    FROM dataset.version v
    LEFT JOIN dataset.version_foto vf ON vf.version_id = v.id
    GROUP BY v.id
    ORDER BY v.id DESC`);
  const vigente = versiones[0]?.id ?? null;
  const { rows: [c] } = await pool.query(`
    WITH elegibles AS (${ELEGIBLES}),
         vig AS (SELECT sha256 FROM dataset.version_foto WHERE version_id = $1)
    SELECT (SELECT COUNT(*) FROM elegibles)::int AS elegibles,
           (SELECT COUNT(*) FROM elegibles WHERE sha256 NOT IN (SELECT sha256 FROM vig))::int AS nuevas,
           (SELECT COUNT(*) FROM vig WHERE sha256 NOT IN (SELECT sha256 FROM elegibles))::int AS salientes`,
    [vigente]);
  return { versiones, vigente, cambios: { elegibles: c.elegibles, nuevas: c.nuevas, salientes: c.salientes } };
}

/** POST /api/dataset/versiones { nombre?, proporciones?: [train, val, test] } */
async function crear(pool, cuerpo, userId) {
  const proporciones = cuerpo.proporciones ?? PROPORCIONES;
  if (!Array.isArray(proporciones) || proporciones.length !== 3 || proporciones.some((p) => !(p > 0))
    || Math.abs(proporciones.reduce((a, b) => a + b, 0) - 1) > 1e-6) {
    throw falla('Las proporciones son tres números positivos que suman 1 (por ejemplo 0,70 · 0,15 · 0,15)');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Una sola creación a la vez: dos versiones simultáneas se pisarían el número.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dataset.version'))");
    const { rows: fotos } = await client.query(ELEGIBLES);
    if (!fotos.length) {
      throw falla('Aún no hay fotos para crear una versión. Para empezar, sube o importa fotos de una especie del catálogo en Imágenes.', 409);
    }
    const asignadas = asignar(fotos, proporciones);
    const { rows: [previas] } = await client.query('SELECT COUNT(*)::int AS n FROM dataset.version');
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let nombre = String(cuerpo.nombre ?? '').trim().slice(0, 80);
    if (!nombre) {
      // Número por versiones que existen (no por id: los ids no se reinician al vaciar la tabla).
      nombre = `v${previas.n + 1}-${fecha}`;
      const { rows: [repetido] } = await client.query('SELECT 1 AS hay FROM dataset.version WHERE nombre = $1', [nombre]);
      if (repetido) nombre += `-${new Date().toISOString().slice(11, 16).replace(':', '')}`;
    }
    const huella = crypto.createHash('sha256')
      .update(asignadas.map((a) => `${a.sha256}\t${a.particion}`).sort().join('\n')).digest('hex');
    const cuenta = contar(asignadas);
    const individuos = new Set(fotos.map((f) => `${f.especie_id}:${f.individuo}`)).size;
    const especies = new Set(fotos.map((f) => f.especie_id)).size;
    let v;
    try {
      ({ rows: [v] } = await client.query(`
        INSERT INTO dataset.version (nombre, descripcion, manifiesto_sha256, parametros, creado_por)
        VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, creado`,
      [nombre, 'Creada desde el panel', huella,
        JSON.stringify({ origen: 'panel', proporciones, semilla: SEMILLA, fotos: cuenta, individuos, especies }), userId]));
    } catch (err) {
      if (err.code === '23505') throw falla(`Ya hay una versión llamada «${nombre}». Elige otro nombre.`, 409);
      throw err;
    }
    await client.query(`
      INSERT INTO dataset.version_foto (version_id, sha256, particion)
      SELECT $1, unnest($2::char(64)[]), unnest($3::text[])`,
    [v.id, asignadas.map((a) => a.sha256), asignadas.map((a) => a.particion)]);
    await auditar(client, userId, 'dataset.version.creada', v.id, { nombre, fotos: cuenta, individuos, especies, proporciones });
    await client.query('COMMIT');
    return { ...v, fotos: cuenta, individuos, especies };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listar, crear, asignar, repartir, PROPORCIONES };
