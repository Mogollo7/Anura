-- Fase 26 — Inclusión manual de especies en paquetes de subregión.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
-- Relación muchos-a-muchos: una especie puede incluirse en varias subregiones.
CREATE TABLE IF NOT EXISTS dataset.subregion_especie (
  subregion_id INT NOT NULL REFERENCES dataset.subregion(id) ON DELETE CASCADE,
  especie_id   INT NOT NULL REFERENCES dataset.especie(id) ON DELETE CASCADE,
  creado_por   UUID,
  creado       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subregion_id, especie_id)
);

CREATE INDEX IF NOT EXISTS subregion_especie_especie_idx
  ON dataset.subregion_especie (especie_id);

GRANT ALL PRIVILEGES ON TABLE dataset.subregion_especie TO dataset_service;