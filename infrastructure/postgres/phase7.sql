-- Fase 7 — M2: embeddings del encoder y trabajos del worker (model-service).
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- model-service corre en el PC con GPU y PIDE trabajos por HTTP a dataset-service (solo
-- conexiones salientes: funciona igual detrás de un túnel). Los vectores quedan aquí, en
-- pgvector, con el mismo formato que usa sqlite-vec en el teléfono: float32 x 512,
-- normalizados L2, y atados al sha256 del encoder que los produjo (EMBEDDING_CONTRACT.md:
-- dos vectores solo son comparables si comparten encoder, preprocesado y normalización).

CREATE EXTENSION IF NOT EXISTS vector;

-- Un encoder = un archivo ONNX exacto. El worker lo registra al arrancar.
CREATE TABLE IF NOT EXISTS dataset.encoder (
  sha256          CHAR(64) PRIMARY KEY,
  nombre          TEXT NOT NULL,              -- "bioclip_anura_v1"
  archivo         TEXT NOT NULL,              -- "encoder_anura_fp16.onnx"
  dimension       INT NOT NULL,
  preprocesado    TEXT NOT NULL,
  normalizacion   TEXT NOT NULL,
  contrato        JSONB NOT NULL,             -- el bloque completo de EMBEDDING_CONTRACT.md
  registrado      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- vector(512) de pgvector guarda float4, igual que un vec0 float[512] de sqlite-vec:
-- exportar es leer vector::real[] y escribirlo como blob little-endian, sin conversiones.
CREATE TABLE IF NOT EXISTS dataset.embedding (
  sha256          CHAR(64) NOT NULL REFERENCES dataset.foto(sha256) ON DELETE CASCADE,
  encoder_sha256  CHAR(64) NOT NULL REFERENCES dataset.encoder(sha256),
  vector          vector(512) NOT NULL,
  trabajo_id      BIGINT,
  creado          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sha256, encoder_sha256)
);
CREATE INDEX IF NOT EXISTS embedding_encoder_idx ON dataset.embedding (encoder_sha256);

CREATE TABLE IF NOT EXISTS dataset.trabajo (
  id              BIGSERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL CHECK (tipo IN ('embeddings')),
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_curso', 'hecho', 'fallido', 'cancelado')),
  parametros      JSONB NOT NULL DEFAULT '{}',
  total           INT,                        -- fotos por procesar al crearlo
  hechos          INT NOT NULL DEFAULT 0,
  fallidos        INT NOT NULL DEFAULT 0,
  worker          TEXT,                       -- nombre del worker que lo tomó
  mensaje         TEXT,                       -- último avance o error legible
  latido          TIMESTAMPTZ,                -- último contacto del worker con este trabajo
  creado_por      UUID,
  creado          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empezado        TIMESTAMPTZ,
  terminado       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS trabajo_estado_idx ON dataset.trabajo (estado, id);

-- Fotos que el worker no pudo procesar en un trabajo: no se reintentan en ese trabajo.
CREATE TABLE IF NOT EXISTS dataset.trabajo_error (
  trabajo_id      BIGINT NOT NULL REFERENCES dataset.trabajo(id) ON DELETE CASCADE,
  sha256          CHAR(64) NOT NULL,
  error           TEXT NOT NULL,
  creado          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trabajo_id, sha256)
);

-- Último contacto de cada worker (aunque no tenga trabajo): el Admin muestra si está vivo.
CREATE TABLE IF NOT EXISTS dataset.worker (
  nombre          TEXT PRIMARY KEY,
  encoder_sha256  CHAR(64) REFERENCES dataset.encoder(sha256),
  info            JSONB,                      -- proveedor de ONNX, versión, ms por foto…
  visto           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
