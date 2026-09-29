/**
 * Especies públicas para el Explorador. La fuente es la vista dataset.especie_publica
 * (infrastructure/postgres/phase22.sql): especies con ficha publicada en Admin → Contenido, la
 * misma regla que sirve /api/dataset/publico/catalogo. species.taxonomy ya no se lee.
 *
 * Las observaciones apuntan a la especie por nombre científico (ai.predictions.top_class); el cruce
 * no distingue mayúsculas y trata "_" como espacio, así que "Boana_boans" y "Boana boans" cuentan igual.
 * Una clase sin ficha publicada no cruza: la observación se muestra igual, sin datos de catálogo.
 */

/** Condición de cruce entre una columna con el nombre de la predicción y la vista (alias `alias`). */
const coincide = (columna, alias = 'ep') =>
  `lower(replace(${columna}, '_', ' ')) = lower(${alias}.nombre_cientifico)`;

/** LEFT JOIN de la especie pública de una predicción, para feeds y detalle. */
const unirEspecie = (columna = 'p.top_class', alias = 'ep') =>
  `LEFT JOIN dataset.especie_publica ${alias} ON ${coincide(columna, alias)}`;

/** Columnas con los nombres que la web ya consume (los de species.taxonomy). taxon_id = COL_ANURA_NNNN. */
const columnasTaxon = (alias = 'ep') =>
  `${alias}.taxon_id, ${alias}.clase AS class_name, ${alias}.orden AS order_name, ${alias}.familia AS family, ` +
  `${alias}.genero AS genus, ${alias}.epiteto AS species, ${alias}.nombre_comun AS common_name`;

/** "COL_ANURA_0001-Boana-boans": el id primero, después el nombre; TaxonDetail parte por el primer guion. */
const slugDe = (taxonId, nombreCientifico) => `${taxonId}-${nombreCientifico}`.replace(/\s+/g, '-');

module.exports = { coincide, unirEspecie, columnasTaxon, slugDe };
