-- Fase 9 — M3 (parcial): centroide global L2 y supercentroides, desde los embeddings reales.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- El centroide de una especie es la media L2 de sus fotos de entrenamiento (partición train
-- del manifiesto), no un vector simulado. El supercentroide de género o familia es la media
-- L2 de esos centroides, un voto por especie. El vector se guarda para el paquete (M4);
-- el Admin lee conteos, dispersión y vecino, no los 512 floats. Ver Plan del Backend Real (M3).

CREATE TABLE IF NOT EXISTS dataset.experimento (
  id                        SERIAL PRIMARY KEY,
  tipo                      TEXT NOT NULL CHECK (tipo IN ('centroides')),
  encoder_sha256            CHAR(64) NOT NULL REFERENCES dataset.encoder(sha256),
  version_id                INT REFERENCES dataset.version(id),
  fotos_train               INT NOT NULL,
  fotos_train_con_vector    INT NOT NULL,
  especies                  INT NOT NULL,
  creado_por                UUID,
  creado                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un centroide por especie y corrida. dispersion = distancia coseno media al centroide
-- (1 − coseno medio). vecino = otra especie de la misma corrida con mayor coseno.
CREATE TABLE IF NOT EXISTS dataset.centroide (
  experimento_id      INT NOT NULL REFERENCES dataset.experimento(id) ON DELETE CASCADE,
  especie_id          INT NOT NULL REFERENCES dataset.especie(id),
  n_vectores          INT NOT NULL,
  n_observaciones     INT NOT NULL,
  dispersion          DOUBLE PRECISION NOT NULL,
  vecino_especie_id   INT REFERENCES dataset.especie(id),
  coseno_vecino       DOUBLE PRECISION,
  vector              vector(512) NOT NULL,
  PRIMARY KEY (experimento_id, especie_id)
);

CREATE TABLE IF NOT EXISTS dataset.supercentroide (
  experimento_id  INT NOT NULL REFERENCES dataset.experimento(id) ON DELETE CASCADE,
  nivel           TEXT NOT NULL CHECK (nivel IN ('genero', 'familia')),
  nombre          TEXT NOT NULL,
  n_especies      INT NOT NULL,
  vector          vector(512) NOT NULL,
  PRIMARY KEY (experimento_id, nivel, nombre)
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
