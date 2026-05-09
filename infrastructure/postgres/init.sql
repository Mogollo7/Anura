-- ================================================================
-- Anura PostgreSQL DB - Schema único con múltiples schemas
-- Ejecutar como superuser o el usuario dueño de la DB "anura"
-- ================================================================

-- ── Schemas ──────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS observations;
CREATE SCHEMA IF NOT EXISTS species;
CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS notifications;

-- ================================================================
-- SCHEMA: auth
-- ================================================================
CREATE TABLE IF NOT EXISTS auth.users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  display_name  TEXT,
  role          TEXT        NOT NULL DEFAULT 'user',  -- 'user' | 'expert' | 'admin'
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      TEXT        UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SCHEMA: species
-- ================================================================
CREATE TABLE IF NOT EXISTS species.taxonomy (
  id         SERIAL      PRIMARY KEY,
  class_name TEXT        NOT NULL,             -- e.g. Amphibia
  order_name TEXT,                             -- e.g. Anura
  family     TEXT,                             -- e.g. Hylidae
  genus      TEXT        NOT NULL,
  species    TEXT        NOT NULL,             -- binomial epithet
  common_name TEXT,
  gbif_key   BIGINT,
  iucn_status TEXT,
  UNIQUE (genus, species)
);

CREATE TABLE IF NOT EXISTS species.distribution (
  id         SERIAL      PRIMARY KEY,
  species_id INT         NOT NULL REFERENCES species.taxonomy(id),
  country    TEXT,
  department TEXT,                             -- Colombian dept / state
  lat_mean   DOUBLE PRECISION,
  lon_mean   DOUBLE PRECISION,
  lat_std    DOUBLE PRECISION,
  lon_std    DOUBLE PRECISION,
  record_count INT       DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SCHEMA: observations
-- ================================================================
CREATE TABLE IF NOT EXISTS observations.observations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id),
  image_key       TEXT        NOT NULL,         -- MinIO object key
  thumbnail_key   TEXT,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  altitude_m      DOUBLE PRECISION,
  recorded_at     TIMESTAMPTZ,
  notes           TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending', -- pending | ai_classified | expert_verified
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS obs_user_idx   ON observations.observations(user_id);
CREATE INDEX IF NOT EXISTS obs_status_idx ON observations.observations(status);

-- ================================================================
-- SCHEMA: ai
-- ================================================================
CREATE TABLE IF NOT EXISTS ai.predictions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id  UUID        NOT NULL REFERENCES observations.observations(id) ON DELETE CASCADE,
  model_version   TEXT        NOT NULL,
  top_class       TEXT        NOT NULL,
  top_probability DOUBLE PRECISION NOT NULL,
  location_used   BOOLEAN     NOT NULL DEFAULT FALSE,
  raw_results     JSONB,                        -- full top-5 array
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pred_obs_idx ON ai.predictions(observation_id);

CREATE TABLE IF NOT EXISTS ai.model_versions (
  id          SERIAL  PRIMARY KEY,
  version     TEXT    UNIQUE NOT NULL,
  description TEXT,
  artifact_path TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  trained_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SCHEMA: geo
-- ================================================================
CREATE TABLE IF NOT EXISTS geo.biomes (
  id        SERIAL PRIMARY KEY,
  name      TEXT   NOT NULL,
  code      TEXT   UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS geo.altitude_cache (
  id        SERIAL PRIMARY KEY,
  lat       DOUBLE PRECISION NOT NULL,
  lon       DOUBLE PRECISION NOT NULL,
  altitude_m DOUBLE PRECISION,
  source    TEXT,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lat, lon)
);

CREATE TABLE IF NOT EXISTS geo.weather_cache (
  id          SERIAL PRIMARY KEY,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  weather_data JSONB,
  cached_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lat, lon)
);

-- ================================================================
-- SCHEMA: notifications
-- ================================================================
CREATE TABLE IF NOT EXISTS notifications.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,             -- 'prediction_ready' | 'expert_review' | 'system'
  title       TEXT        NOT NULL,
  body        TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications.notifications(user_id, is_read);
