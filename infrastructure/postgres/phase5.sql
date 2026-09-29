-- Fase 5 — M1: limpieza del dataset con decisiones tomadas desde el Admin.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- La limpieza automática (dataset-service, POST /api/dataset/limpieza) solo PROPONE: marca
-- vacíos y datos dudosos como hallazgos, con su evidencia y una propuesta (p. ej. la mediana
-- de los registros precisos de la misma especie en la celda de 0,2° donde iNaturalist
-- desplaza las coordenadas ocultas). Una persona decide en Admin → Calidad. La coordenada
-- original (latitud/longitud) nunca se sobrescribe: lo limpio va en columnas aparte.

ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS latitud_limpia DOUBLE PRECISION;
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS longitud_limpia DOUBLE PRECISION;
-- punto: sirve como coordenada; celda: solo aporta a capas por zona/celda (altitud por
-- mediana de zona, presencia); excluida: no entra a ninguna capa geográfica.
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS uso_geografico TEXT
  CHECK (uso_geografico IN ('punto', 'celda', 'excluida'));
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS limpieza_metodo TEXT;

CREATE TABLE IF NOT EXISTS dataset.limpieza_corrida (
  id           SERIAL PRIMARY KEY,
  parametros   JSONB NOT NULL,
  resumen      JSONB,
  iniciada_por UUID,
  creado       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dataset.hallazgo (
  id             BIGSERIAL PRIMARY KEY,
  corrida_id     INT REFERENCES dataset.limpieza_corrida(id),
  tipo           TEXT NOT NULL CHECK (tipo IN (
                   'coordenada_aproximada', 'coordenada_atipica', 'sin_coordenada',
                   'derechos_reservados', 'sin_licencia')),
  observacion_id BIGINT REFERENCES dataset.observacion(id) ON DELETE CASCADE,
  sha256         CHAR(64) REFERENCES dataset.foto(sha256) ON DELETE CASCADE,
  especie_id     INT REFERENCES dataset.especie(id),
  detalle        JSONB NOT NULL,   -- evidencia: vecinos, distancia a la mediana, incertidumbre…
  propuesta      JSONB NOT NULL,   -- {opcion, opciones[], latitud?, longitud?, metodo, explicacion}
  estado         TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'decidido')),
  decision       JSONB,            -- {opcion, latitud?, longitud?}
  motivo         TEXT,
  decidido_por   UUID,
  decidido_en    TIMESTAMPTZ,
  creado         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hallazgo_obs_tipo_idx
  ON dataset.hallazgo (tipo, observacion_id) WHERE observacion_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hallazgo_foto_tipo_idx
  ON dataset.hallazgo (tipo, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS hallazgo_estado_tipo_idx ON dataset.hallazgo (estado, tipo);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
