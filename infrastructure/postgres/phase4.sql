-- Fase 4 — M1: dataset de entrenamiento en el servidor.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
-- Las fotos viven en MinIO (bucket anura-dataset, clave fotos/<sha[0:2]>/<sha256>.jpg);
-- aquí solo su procedencia. La especie vive en Postgres, no en la ruta: cambiar un nombre
-- por taxonomía no mueve archivos. Ver 19_ADMIN/Plan del Backend Real (M1).

CREATE SCHEMA IF NOT EXISTS dataset;

CREATE TABLE IF NOT EXISTS dataset.especie (
  id                SERIAL PRIMARY KEY,
  carpeta           TEXT UNIQUE NOT NULL,   -- "Boana_boans", nombre en data cleaned
  nombre_cientifico TEXT NOT NULL,
  genero            TEXT NOT NULL,
  familia           TEXT NOT NULL,
  -- COL_ANURA_XXXX del catálogo de Antioquia; NULL si la especie no está en ese catálogo.
  taxon_id          TEXT UNIQUE,
  creado            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dataset.observacion (
  id                BIGSERIAL PRIMARY KEY,
  fuente            TEXT NOT NULL CHECK (fuente IN ('inaturalist', 'manual')),
  fuente_id         TEXT,                   -- id de observación en iNaturalist
  latitud           DOUBLE PRECISION,
  longitud          DOUBLE PRECISION,
  incertidumbre_m   DOUBLE PRECISION,
  coordenada_oculta BOOLEAN NOT NULL DEFAULT FALSE,
  coordenada_fuente TEXT CHECK (coordenada_fuente IN ('records_v1', 'inaturalist_api', 'exif', 'manual')),
  lugar             TEXT,
  observada_en      DATE,
  creado            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fuente, fuente_id)
);

CREATE TABLE IF NOT EXISTS dataset.foto (
  sha256            CHAR(64) PRIMARY KEY,
  object_key        TEXT UNIQUE NOT NULL,
  especie_id        INT NOT NULL REFERENCES dataset.especie(id),
  observacion_id    BIGINT REFERENCES dataset.observacion(id),
  archivo_original  TEXT NOT NULL,
  fuente_foto_id    TEXT,                   -- photo_id de iNaturalist
  ancho             INT,
  alto              INT,
  bytes             BIGINT,
  content_type      TEXT NOT NULL DEFAULT 'image/jpeg',
  -- Código de iNaturalist (cc-by, cc-by-nc, cc0…), 'all-rights-reserved' cuando iNaturalist
  -- no da licencia, o NULL si la foto no tiene metadatos. Solo las CC se pueden mostrar en la
  -- ficha pública o el Explorador; las otras dos sirven, a lo sumo, para entrenar y evaluar.
  licencia          TEXT,
  atribucion        TEXT,
  url_origen        TEXT,
  estado            TEXT NOT NULL CHECK (estado IN ('catalogo', 'fuera_de_catalogo')),
  creado            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sha256 del archivo original descargado (data dirty). El de la fila es el del JPEG limpio,
-- que limpiar_dataset.py recodifica (calidad 95): son distintos a propósito.
ALTER TABLE dataset.foto ADD COLUMN IF NOT EXISTS sha256_origen CHAR(64);

CREATE INDEX IF NOT EXISTS foto_especie_idx ON dataset.foto (especie_id);
CREATE INDEX IF NOT EXISTS foto_observacion_idx ON dataset.foto (observacion_id);

-- Sin FK a foto: incluye fotos que nunca se subieron (duplicados en _cuarentena).
CREATE TABLE IF NOT EXISTS dataset.exclusion (
  id                BIGSERIAL PRIMARY KEY,
  sha256            CHAR(64),
  ruta_original     TEXT,
  motivo            TEXT NOT NULL,
  por               UUID,                   -- auth.users.id; NULL = limpieza automática
  creado            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revertida         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS exclusion_ruta_motivo_idx
  ON dataset.exclusion (ruta_original, motivo) WHERE por IS NULL;

-- Un entrenamiento es reproducible solo si se sabe exactamente qué fotos vio.
CREATE TABLE IF NOT EXISTS dataset.version (
  id                SERIAL PRIMARY KEY,
  nombre            TEXT UNIQUE NOT NULL,
  descripcion       TEXT,
  manifiesto_sha256 CHAR(64),
  parametros        JSONB,
  creado            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por        UUID
);

CREATE TABLE IF NOT EXISTS dataset.version_foto (
  version_id        INT NOT NULL REFERENCES dataset.version(id) ON DELETE CASCADE,
  sha256            CHAR(64) NOT NULL REFERENCES dataset.foto(sha256),
  particion         TEXT NOT NULL CHECK (particion IN ('train', 'val', 'test')),
  copias            INT NOT NULL DEFAULT 1,  -- sobremuestreo del manifiesto
  PRIMARY KEY (version_id, sha256)
);

REVOKE ALL ON SCHEMA dataset FROM PUBLIC;
GRANT USAGE ON SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA dataset GRANT ALL ON TABLES TO dataset_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA dataset GRANT ALL ON SEQUENCES TO dataset_service;

GRANT USAGE ON SCHEMA audit TO dataset_service;
GRANT INSERT ON audit.log TO dataset_service;
