/**
 * Centroides reales (M3, parcial). La media L2 se calcula en Postgres, donde ya viven los
 * vectores de M2: no se inventa un embedding ni se mueve el lote al navegador.
 *
 * Reglas (Centroides y Muestras):
 * - Solo fotos de la partición train del manifiesto vigente, sin exclusión activa.
 * - Centroide = normalizar L2 la media de esos vectores.
 * - Dispersión = distancia coseno media de cada vector a su centroide.
 * - Supercentroide de género o familia = normalizar L2 la media de los centroides de especie
 *   (un voto por especie, no por foto).
 * - Centroide regional = lo mismo, pero solo con las observaciones que caen DENTRO de la
 *   subregión (point-in-polygon de geo-service sobre los municipios DANE asignados en Regiones),
 *   y solo si hay ≥ 3 individuos ahí; si no, ese paquete presta el global. Las
 *   coordenadas ocultas de iNaturalist no cuentan: pueden caer en la subregión vecina.
 */
const { completar } = require('./m3');
const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const GEO = process.env.GEO_SERVICE_URL || "http://geo-service:3003";
const MIN_INDIVIDUOS_REGIONAL = 3;

const ENCODER = '219e860e6fa9a80fb30a59fc8f61911421bbd53a4537dca831803d3ab446b2ad';

const auditar = require('./audit').auditorDe('experimento');

/** Fotos de entrenamiento del manifiesto vigente que todavía no están excluidas. */
const BASE = `
  SELECT f.especie_id, f.observacion_id, e.vector
  FROM dataset.embedding e
  JOIN dataset.foto f ON f.sha256 = e.sha256
  JOIN dataset.version_foto vf ON vf.sha256 = e.sha256
    AND vf.version_id = (SELECT MAX(id) FROM dataset.version)
  WHERE e.encoder_sha256 = $1
    AND vf.particion = 'train'
    AND NOT EXISTS (
      SELECT 1 FROM dataset.exclusion x WHERE x.sha256 = e.sha256 AND x.revertida IS NULL
    )`;

/** observacion_id → subregion_id, para los departamentos que ya tienen municipios asignados. */
async function subregionPorObservacion(pool) {
  const { rows: asignados } = await pool.query(
    "SELECT m.municipio_dane, m.subregion_id, s.region FROM dataset.subregion_municipio m JOIN dataset.subregion s ON s.id = m.subregion_id");
  const mapa = new Map();
  if (!asignados.length) return mapa;
  const subDeMunicipio = new Map(asignados.map((a) => [a.municipio_dane.trim(), a.subregion_id]));
  const { rows: obs } = await pool.query(`
    SELECT o.id, COALESCE(o.latitud_limpia, o.latitud) AS lat, COALESCE(o.longitud_limpia, o.longitud) AS lon
    FROM dataset.observacion o
    WHERE o.invalidada_motivo IS NULL AND o.latitud IS NOT NULL AND NOT o.coordenada_oculta
      AND o.uso_geografico IS DISTINCT FROM 'excluida'
      AND EXISTS (SELECT 1 FROM dataset.foto f WHERE f.observacion_id = o.id)`);
  for (const region of new Set(asignados.map((a) => a.region))) {
    const pendientes = obs.filter((o) => !mapa.has(String(o.id)));
    if (!pendientes.length) break;
    const res = await fetch(`${GEO}/api/geo/regiones/departamentos/${region}/ubicar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntos: pendientes.map((o) => [o.lat, o.lon]) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 404) continue;
    if (!res.ok) throw falla(`geo-service respondió ${res.status} al ubicar las observaciones`, 502);
    const { municipios } = await res.json();
    pendientes.forEach((o, i) => {
      const sub = municipios[i] && subDeMunicipio.get(municipios[i]);
      if (sub) mapa.set(String(o.id), sub);
    });
  }
  return mapa;
}

async function calcular(pool, userId) {
  const { rows: [enc] } = await pool.query('SELECT sha256 FROM dataset.encoder WHERE sha256 = $1', [ENCODER]);
  if (!enc) throw falla('El encoder del teléfono todavía no está registrado', 409);

  const { rows: [cob] } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM dataset.version_foto
        WHERE version_id = (SELECT MAX(id) FROM dataset.version) AND particion = 'train') AS fotos_train,
      (SELECT COUNT(*)::int FROM (${BASE}) b) AS fotos_train_con_vector`, [ENCODER]);
  if (!cob.fotos_train_con_vector) {
    throw falla('Todavía no hay vectores de entrenamiento para calcular centroides', 409);
  }

  // Fuera de la transacción: es una llamada HTTP a geo-service, no toca la base.
  const ubicadas = await subregionPorObservacion(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [version] } = await client.query('SELECT MAX(id) AS id FROM dataset.version');
    const { rows: [exp] } = await client.query(`
      INSERT INTO dataset.experimento
        (tipo, encoder_sha256, version_id, fotos_train, fotos_train_con_vector, especies, creado_por)
      VALUES ('centroides', $1, $2, $3, $4, 0, $5)
      RETURNING id`, [ENCODER, version.id, cob.fotos_train, cob.fotos_train_con_vector, userId]);

    const insertados = await client.query(`
      WITH base AS (${BASE}),
      medias AS (
        SELECT especie_id,
               l2_normalize(avg(vector)::vector) AS centroide,
               COUNT(*)::int AS n_vectores,
               COUNT(DISTINCT observacion_id)::int AS n_observaciones
        FROM base
        GROUP BY especie_id
      ),
      disp AS (
        SELECT b.especie_id, avg(b.vector <=> m.centroide)::float8 AS dispersion
        FROM base b JOIN medias m ON m.especie_id = b.especie_id
        GROUP BY b.especie_id
      ),
      vecinos AS (
        SELECT m.especie_id, v.especie_id AS vecino_especie_id,
               (1 - (m.centroide <=> v.centroide))::float8 AS coseno_vecino
        FROM medias m
        JOIN LATERAL (
          SELECT especie_id, centroide FROM medias o
          WHERE o.especie_id <> m.especie_id
          ORDER BY m.centroide <=> o.centroide
          LIMIT 1
        ) v ON TRUE
      )
      INSERT INTO dataset.centroide
        (experimento_id, especie_id, n_vectores, n_observaciones, dispersion, vecino_especie_id, coseno_vecino, vector)
      SELECT $2, m.especie_id, m.n_vectores, m.n_observaciones, d.dispersion, v.vecino_especie_id, v.coseno_vecino, m.centroide
      FROM medias m
      JOIN disp d ON d.especie_id = m.especie_id
      JOIN vecinos v ON v.especie_id = m.especie_id`,
      [ENCODER, exp.id]);
    const especies = insertados.rowCount;

    await client.query(`
      INSERT INTO dataset.supercentroide (experimento_id, nivel, nombre, n_especies, vector)
      SELECT $1, 'genero', e.genero, COUNT(*)::int, l2_normalize(avg(c.vector)::vector)
      FROM dataset.centroide c JOIN dataset.especie e ON e.id = c.especie_id
      WHERE c.experimento_id = $1 GROUP BY e.genero`, [exp.id]);
    await client.query(`
      INSERT INTO dataset.supercentroide (experimento_id, nivel, nombre, n_especies, vector)
      SELECT $1, 'familia', e.familia, COUNT(*)::int, l2_normalize(avg(c.vector)::vector)
      FROM dataset.centroide c JOIN dataset.especie e ON e.id = c.especie_id
      WHERE c.experimento_id = $1 GROUP BY e.familia`, [exp.id]);

    let regionales = 0;
    if (ubicadas.size) {
      await client.query("CREATE TEMP TABLE obs_subregion (observacion_id BIGINT PRIMARY KEY, subregion_id INT NOT NULL) ON COMMIT DROP");
      await client.query(
        "INSERT INTO obs_subregion SELECT * FROM unnest($1::bigint[], $2::int[])",
        [[...ubicadas.keys()], [...ubicadas.values()]]);
      await client.query(`
        WITH base AS (${BASE}),
        reg AS (
          SELECT b.especie_id, os.subregion_id, b.observacion_id, b.vector
          FROM base b JOIN obs_subregion os ON os.observacion_id = b.observacion_id
        ),
        medias AS (
          SELECT especie_id, subregion_id, l2_normalize(avg(vector)::vector) AS centroide,
                 COUNT(*)::int AS n_vectores, COUNT(DISTINCT observacion_id)::int AS n_observaciones
          FROM reg GROUP BY especie_id, subregion_id
        ),
        disp AS (
          SELECT r.especie_id, r.subregion_id, avg(r.vector <=> m.centroide)::float8 AS dispersion
          FROM reg r JOIN medias m ON m.especie_id = r.especie_id AND m.subregion_id = r.subregion_id
          GROUP BY r.especie_id, r.subregion_id
        )
        INSERT INTO dataset.centroide_regional
          (experimento_id, especie_id, subregion_id, n_vectores, n_observaciones, dispersion, coseno_global, vector)
        SELECT $2, m.especie_id, m.subregion_id, m.n_vectores, m.n_observaciones,
               CASE WHEN propio THEN d.dispersion END,
               CASE WHEN propio THEN (1 - (m.centroide <=> c.vector))::float8 END,
               CASE WHEN propio THEN m.centroide END
        FROM medias m
        CROSS JOIN LATERAL (SELECT m.n_observaciones >= ${MIN_INDIVIDUOS_REGIONAL} AS propio) p
        JOIN disp d ON d.especie_id = m.especie_id AND d.subregion_id = m.subregion_id
        JOIN dataset.centroide c ON c.experimento_id = $2 AND c.especie_id = m.especie_id`,
        [ENCODER, exp.id]);
      const { rows: [n] } = await client.query(
        "SELECT COUNT(*)::int AS n FROM dataset.centroide_regional WHERE experimento_id = $1 AND vector IS NOT NULL", [exp.id]);
      regionales = n.n;
    }

    const evaluacion = await completar(client, ENCODER, exp.id);
    await client.query('UPDATE dataset.experimento SET especies = $2 WHERE id = $1', [exp.id, especies]);
    await auditar(client, userId, 'dataset.centroides.calculados', exp.id, {
      especies,
      regionales,
      observaciones_ubicadas: ubicadas.size,
      kar: evaluacion.kar,
      fotos_train_con_vector: cob.fotos_train_con_vector,
      fotos_train: cob.fotos_train,
    });
    await client.query('COMMIT');
    return ultimo(pool);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ultimo(pool) {
  const { rows: [exp] } = await pool.query(`
    SELECT id, encoder_sha256, fotos_train, fotos_train_con_vector, especies, creado, evaluacion
    FROM dataset.experimento WHERE tipo = 'centroides' ORDER BY id DESC LIMIT 1`);
  if (!exp) return { experimento: null, especies: [], supercentroides: { generos: 0, familias: 0 }, sugerencias: [], regionales: [] };

  const { rows: especies } = await pool.query(`
    SELECT e.nombre_cientifico, e.genero, e.familia, e.taxon_id,
           c.n_vectores, c.n_observaciones, c.dispersion, c.tau, c.radio,
           v.nombre_cientifico AS vecino, c.coseno_vecino
    FROM dataset.centroide c
    JOIN dataset.especie e ON e.id = c.especie_id
    LEFT JOIN dataset.especie v ON v.id = c.vecino_especie_id
    WHERE c.experimento_id = $1
    ORDER BY e.nombre_cientifico`, [exp.id]);

  const { rows: supers } = await pool.query(`
    SELECT nivel, COUNT(*)::int AS n FROM dataset.supercentroide
    WHERE experimento_id = $1 GROUP BY nivel`, [exp.id]);
  const porNivel = Object.fromEntries(supers.map((s) => [s.nivel, s.n]));
  const { rows: sugerencias } = await pool.query(`
    SELECT ea.nombre_cientifico AS a, eb.nombre_cientifico AS b, s.coseno, s.n_val, s.confusiones,
           s.acc_antes, s.acc_despues
    FROM dataset.cluster_sugerido s
    JOIN dataset.especie ea ON ea.id = s.especie_a
    JOIN dataset.especie eb ON eb.id = s.especie_b
    WHERE s.experimento_id = $1
    ORDER BY s.coseno DESC`, [exp.id]);

  // Por especie y subregión: propio (≥ 3 individuos, con vector) o prestado (usa el global).
  const { rows: regionales } = await pool.query(`
    SELECT s.id AS subregion_id, s.nombre AS subregion, s.region, e.nombre_cientifico,
           cr.n_observaciones, cr.n_vectores, cr.dispersion, cr.coseno_global,
           (cr.vector IS NOT NULL) AS propio
    FROM dataset.centroide_regional cr
    JOIN dataset.subregion s ON s.id = cr.subregion_id
    JOIN dataset.especie e ON e.id = cr.especie_id
    WHERE cr.experimento_id = $1
    ORDER BY s.numero, e.nombre_cientifico`, [exp.id]);

  return {
    experimento: exp,
    especies,
    regionales,
    supercentroides: { generos: porNivel.genero || 0, familias: porNivel.familia || 0 },
    sugerencias,
  };
}

module.exports = { calcular, ultimo };
