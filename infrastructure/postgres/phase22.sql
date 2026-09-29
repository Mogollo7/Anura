-- Fase 22 — Una sola definición de "especie pública" para la web (explorer-service) y el panel.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- La especie se crea en dataset.especie y se hace pública cuando su ficha se publica en Contenido
-- (dataset.species_content.publicada). species.taxonomy ya no se llena, así que el Explorador
-- (búsqueda, sugerencias, feed, detalle) y el panel leen esta vista y no esa tabla.
--
-- La regla es la misma que sirve /api/dataset/publico/catalogo (dataset-service, contenido.js):
-- ficha publicada Y taxon_id asignado. El dataset-service lee la vista para su catálogo; si la
-- regla cambia, cambia aquí y en un solo sitio.
--
-- Las observaciones apuntan a la especie por nombre científico: ai.predictions.top_class guarda el
-- binomial que mandó la app ("Boana boans", o "Boana_boans" en datos viejos). El cruce es por
-- nombre, sin distinguir mayúsculas y con "_" = " ", igual que antes con species.taxonomy.
--
-- clase/orden: dataset.especie no los guarda porque todo el catálogo son anuros (Amphibia, Anura);
-- se exponen aquí para que la web conserve los campos que ya mostraba.

CREATE OR REPLACE VIEW dataset.especie_publica AS
SELECT e.id                                   AS especie_id,
       e.taxon_id,
       e.carpeta,
       e.nombre_cientifico,
       e.genero,
       split_part(e.nombre_cientifico, ' ', 2) AS epiteto,
       e.familia,
       c.publicada->'campos'->'nombre_comun'->>'valor' AS nombre_comun,
       'Amphibia'::text                       AS clase,
       'Anura'::text                          AS orden,
       c.publicada,
       c.version,
       c.publicado_en
FROM dataset.especie e
JOIN dataset.species_content c ON c.especie_id = e.id
WHERE c.publicada IS NOT NULL AND e.taxon_id IS NOT NULL;

-- La vista corre con los permisos de su dueño: quien la lea no necesita acceso a dataset.especie
-- ni a species_content. Los servicios de lectura reciben solo las columnas que usan (no `publicada`,
-- el contenido completo de la ficha, que se sirve por /api/dataset/publico/catalogo).
GRANT SELECT ON dataset.especie_publica TO dataset_service;

GRANT USAGE ON SCHEMA dataset TO explorer_service;
REVOKE ALL ON dataset.especie_publica FROM explorer_service;
GRANT SELECT (especie_id, taxon_id, carpeta, nombre_cientifico, genero, epiteto, familia, nombre_comun, clase, orden)
  ON dataset.especie_publica TO explorer_service;

-- auth-service: el mapa del panel pone el nombre común de cada avistamiento.
GRANT USAGE ON SCHEMA dataset TO auth_service;
REVOKE ALL ON dataset.especie_publica FROM auth_service;
GRANT SELECT (nombre_cientifico, nombre_comun) ON dataset.especie_publica TO auth_service;
