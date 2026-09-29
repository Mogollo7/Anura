-- Fase 15 — Bloque 1: etiquetas de curación en el servidor (antes vivían en el navegador).
-- Morfos declarados por el herpetólogo para una especie en una subregión, y por cada
-- observación del dataset (un individuo): estadio de vida, sustrato donde se encontró y morfo.
-- Ficha técnica, Centroides y el compilador leen de aquí. Idempotente (03-roles.sh).

CREATE TABLE IF NOT EXISTS dataset.morfo (
  id            SERIAL PRIMARY KEY,
  especie_id    INT NOT NULL REFERENCES dataset.especie(id) ON DELETE CASCADE,
  subregion_id  INT NOT NULL REFERENCES dataset.subregion(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 60),
  nota          TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  creado_por    UUID,
  creado        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (especie_id, subregion_id, nombre)
);
CREATE INDEX IF NOT EXISTS morfo_especie_idx ON dataset.morfo (especie_id);

CREATE TABLE IF NOT EXISTS dataset.observacion_etiqueta (
  observacion_id  BIGINT PRIMARY KEY REFERENCES dataset.observacion(id) ON DELETE CASCADE,
  estadio         TEXT CHECK (estadio IN ('adulto', 'juvenil', 'metamorfico', 'larva', 'desconocido')),
  sustrato        TEXT CHECK (sustrato IN ('hojarasca', 'vegetacion', 'quebrada', 'roca')),
  morfo_id        INT REFERENCES dataset.morfo(id) ON DELETE SET NULL,
  actualizado_por UUID,
  actualizado     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS observacion_etiqueta_morfo_idx ON dataset.observacion_etiqueta (morfo_id);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
