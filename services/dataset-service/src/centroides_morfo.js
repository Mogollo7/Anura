/**
 * Centroide por morfo (Admin → Centroides). Los morfos los declara el herpetólogo por especie y
 * subregión, y los asigna a cada individuo en Curación (dataset.morfo, observacion_etiqueta).
 *
 * Regla: media L2 de las fotos de ENTRENAMIENTO (con vector, sin exclusión) de los individuos
 * etiquetados con ese morfo. Solo con ≥ `min` individuos; con menos queda la fila sin vector y
 * el paquete usa el centroide de la especie. Nunca se mezclan morfos distintos en un centroide.
 */

/** Se llama dentro de la transacción de centroides.calcular, después del centroide global. */
async function calcular(client, base, encoder, expId, min) {
  await client.query(`
    WITH base AS (${base}),
    m AS (
      SELECT oe.morfo_id, b.especie_id, b.observacion_id, b.vector
      FROM base b
      JOIN dataset.observacion_etiqueta oe ON oe.observacion_id = b.observacion_id
      JOIN dataset.morfo mo ON mo.id = oe.morfo_id AND mo.especie_id = b.especie_id
    ),
    medias AS (
      SELECT morfo_id, especie_id, l2_normalize(avg(vector)::vector) AS centroide,
             COUNT(*)::int AS n_vectores, COUNT(DISTINCT observacion_id)::int AS n_observaciones
      FROM m GROUP BY morfo_id, especie_id
    ),
    disp AS (
      SELECT m.morfo_id, avg(m.vector <=> md.centroide)::float8 AS dispersion
      FROM m JOIN medias md ON md.morfo_id = m.morfo_id GROUP BY m.morfo_id
    )
    INSERT INTO dataset.centroide_morfo
      (experimento_id, morfo_id, especie_id, n_vectores, n_observaciones, dispersion, coseno_especie, vector)
    SELECT $2, md.morfo_id, md.especie_id, md.n_vectores, md.n_observaciones,
           CASE WHEN p.propio THEN d.dispersion END,
           CASE WHEN p.propio THEN (1 - (md.centroide <=> c.vector))::float8 END,
           CASE WHEN p.propio THEN md.centroide END
    FROM medias md
    CROSS JOIN LATERAL (SELECT md.n_observaciones >= $3 AS propio) p
    JOIN disp d ON d.morfo_id = md.morfo_id
    LEFT JOIN dataset.centroide c ON c.experimento_id = $2 AND c.especie_id = md.especie_id`,
    [encoder, expId, min]);
  const { rows: [n] } = await client.query(
    'SELECT COUNT(*)::int AS n FROM dataset.centroide_morfo WHERE experimento_id = $1 AND vector IS NOT NULL', [expId]);
  return n.n;
}

/**
 * Todos los morfos declarados, con lo que hay hoy (individuos etiquetados y cuántos de ellos
 * tienen vector de entrenamiento) y lo que calculó el último lote. `faltan` = individuos con
 * vector que faltan para el mínimo; `desactualizado` = las etiquetas cambiaron desde el lote.
 */
async function estado(pool, base, encoder, min) {
  const { rows: [exp] } = await pool.query(
    "SELECT id, creado FROM dataset.experimento WHERE tipo = 'centroides' ORDER BY id DESC LIMIT 1");
  const { rows } = await pool.query(`
    WITH base AS (${base}),
    con_vector AS (
      SELECT oe.morfo_id, COUNT(DISTINCT b.observacion_id)::int AS n
      FROM base b JOIN dataset.observacion_etiqueta oe ON oe.observacion_id = b.observacion_id
      WHERE oe.morfo_id IS NOT NULL GROUP BY oe.morfo_id
    )
    SELECT mo.id, mo.nombre, mo.nota, mo.especie_id, es.nombre_cientifico, s.id AS subregion_id,
           s.nombre AS subregion, r.nombre AS region,
           (SELECT COUNT(*)::int FROM dataset.observacion_etiqueta oe WHERE oe.morfo_id = mo.id) AS etiquetados,
           COALESCE(cv.n, 0) AS con_vector,
           cm.n_vectores, cm.n_observaciones, cm.dispersion, cm.coseno_especie,
           (cm.vector IS NOT NULL) AS calculado
    FROM dataset.morfo mo
    JOIN dataset.especie es ON es.id = mo.especie_id
    JOIN dataset.subregion s ON s.id = mo.subregion_id
    JOIN dataset.region r ON r.codigo_dane = s.region
    LEFT JOIN con_vector cv ON cv.morfo_id = mo.id
    LEFT JOIN dataset.centroide_morfo cm ON cm.experimento_id = $2 AND cm.morfo_id = mo.id
    ORDER BY es.nombre_cientifico, s.numero, mo.nombre`, [encoder, exp?.id ?? null]);
  return {
    minimo: min,
    experimento: exp || null,
    morfos: rows.map((m) => ({
      ...m,
      calculado: !!m.calculado,
      faltan: Math.max(0, min - m.con_vector),
      desactualizado: !!exp && (m.n_observaciones ?? 0) !== m.con_vector,
    })),
  };
}

module.exports = { calcular, estado };
