-- Fase 17 — Añadir especie desde el Admin (Especies → Añadir especie).
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
-- dataset.especie es el único catálogo de especies: la curación, los paquetes, la ficha pública
-- y la app leen de ahí. Aquí solo se añade lo que hace falta para crear una a mano sin choques.

-- taxon_id (COL_ANURA_0001…) de las especies nuevas. Es una secuencia y no "máximo + 1" para que
-- un id nunca se reutilice: la app y las observaciones ya subidas pueden recordarlo.
CREATE SEQUENCE IF NOT EXISTS dataset.taxon_id_seq;

-- Si ya hay especies con taxon_id, la secuencia sigue después del mayor.
DO $$
DECLARE
  mayor INT;
  actual BIGINT;
BEGIN
  SELECT COALESCE(MAX(substring(taxon_id FROM '^COL_ANURA_(\d+)$')::int), 0) INTO mayor FROM dataset.especie;
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO actual FROM dataset.taxon_id_seq;
  IF mayor > actual THEN
    PERFORM setval('dataset.taxon_id_seq', mayor, true);
  END IF;
END $$;

-- Un mismo nombre científico no puede estar dos veces (sin distinguir mayúsculas). Si una base
-- vieja ya tiene duplicados el índice no se crea y la validación del servicio sigue cubriéndolo.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS especie_nombre_cientifico_uk ON dataset.especie (lower(nombre_cientifico));
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'especie_nombre_cientifico_uk no se creó: hay nombres científicos repetidos en dataset.especie';
END $$;

GRANT USAGE, SELECT, UPDATE ON SEQUENCE dataset.taxon_id_seq TO dataset_service;
