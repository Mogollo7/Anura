-- Fase 19 — Bloque 5: la mitad vectorial del Modelo, real (Worker, DB vectorial, Centroides, Clústeres).
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- Solo añade: no cambia la forma de centroide, supercentroide, centroide_regional ni
-- cluster_sugerido (otras pantallas los leen tal cual).

-- Centroide por morfo (bloque 1 guarda dataset.morfo y el morfo de cada individuo). Misma regla
-- que el regional: media L2 de las fotos de entrenamiento de los individuos etiquetados con ese
-- morfo, y solo con ≥ MIN_INDIVIDUOS individuos con vector; si no, fila sin vector (el paquete
-- usa el centroide de la especie). Nunca se promedian morfos distintos entre sí.
CREATE TABLE IF NOT EXISTS dataset.centroide_morfo (
  experimento_id  INT NOT NULL REFERENCES dataset.experimento(id) ON DELETE CASCADE,
  morfo_id        INT NOT NULL REFERENCES dataset.morfo(id) ON DELETE CASCADE,
  especie_id      INT NOT NULL REFERENCES dataset.especie(id),
  n_vectores      INT NOT NULL,
  n_observaciones INT NOT NULL,
  dispersion      DOUBLE PRECISION,           -- 1 − coseno medio al centroide del morfo
  coseno_especie  DOUBLE PRECISION,           -- coseno con el centroide global de la especie
  vector          vector(512),                -- NULL = menos individuos que el mínimo
  PRIMARY KEY (experimento_id, morfo_id)
);

-- Clúster de especies que se confunden, decidido por una persona (Admin → Clústeres). El sistema
-- solo sugiere (dataset.cluster_sugerido, matriz de confusión); aquí queda qué se aceptó o se
-- descartó, quién y por qué. Una fila por conjunto de miembros (ordenados): decidir de nuevo
-- actualiza la fila; el historial completo está en audit.log.
CREATE TABLE IF NOT EXISTS dataset.cluster (
  id              SERIAL PRIMARY KEY,
  miembros        INT[] NOT NULL CHECK (cardinality(miembros) >= 2),
  nombre          TEXT NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  origen          TEXT NOT NULL CHECK (origen IN ('sugerido', 'matriz', 'manual')),
  estado          TEXT NOT NULL CHECK (estado IN ('aceptado', 'descartado')),
  motivo          TEXT CHECK (motivo IS NULL OR length(motivo) <= 500),
  experimento_id  INT REFERENCES dataset.experimento(id) ON DELETE SET NULL,
  -- ArcFace medido con los vectores reales al decidir: acierto antes/después en validación.
  medicion        JSONB,
  decidido_por    UUID,
  decidido_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (miembros)
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
