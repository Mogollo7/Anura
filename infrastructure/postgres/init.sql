-- ================================================================
-- Anura PostgreSQL DB - Multi-service Schema
-- ================================================================

-- ── Schemas ──────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS observations;
CREATE SCHEMA IF NOT EXISTS species;
CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS notifications;

-- Activar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- SCHEMA: auth
-- ================================================================

-- USERS
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT,
    auth_provider VARCHAR(20) DEFAULT 'email',
    google_id VARCHAR(255),
    profile_image TEXT,
    biography TEXT,
    role VARCHAR(20) DEFAULT 'user',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    allow_ai_training BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS profile_image_blob BYTEA;

-- USER PREFERENCES
CREATE TABLE IF NOT EXISTS auth.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'dark',
    interface_mode VARCHAR(30) DEFAULT 'standard',
    accessibility_mode BOOLEAN DEFAULT FALSE,
    language VARCHAR(10) DEFAULT 'es',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    exact_location_enabled BOOLEAN DEFAULT FALSE,
    public_profile BOOLEAN DEFAULT TRUE,
    preferences_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OAUTH ACCOUNTS
CREATE TABLE IF NOT EXISTS auth.oauth_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PASSWORD RESET CODES (Eliminado - no se usa recuperación de contraseña)
-- EMAIL VERIFICATION CODES


-- USER SESSIONS
CREATE TABLE IF NOT EXISTS auth.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL,
    ip_address VARCHAR(100),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- USER DEVICES
CREATE TABLE IF NOT EXISTS auth.user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    device_type VARCHAR(50),
    os VARCHAR(100),
    browser VARCHAR(100),
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- USER PERMISSIONS
CREATE TABLE IF NOT EXISTS auth.user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    can_upload BOOLEAN DEFAULT TRUE,
    can_comment BOOLEAN DEFAULT TRUE,
    can_validate BOOLEAN DEFAULT FALSE,
    can_moderate BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON auth.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON auth.users(username);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON auth.oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences ON auth.user_preferences(user_id);
-- INDEX for password_reset_codes removed (table eliminated)

-- ================================================================
-- SCHEMA: species
-- ================================================================
CREATE TABLE IF NOT EXISTS species.taxonomy (
  id         SERIAL      PRIMARY KEY,
  class_name TEXT        NOT NULL,
  order_name TEXT,
  family     TEXT,
  genus      TEXT        NOT NULL,
  species    TEXT        NOT NULL,
  common_name TEXT,
  gbif_key   BIGINT,
  iucn_status TEXT,
  UNIQUE (genus, species)
);

CREATE TABLE IF NOT EXISTS species.distribution (
  id         SERIAL      PRIMARY KEY,
  species_id INT         NOT NULL REFERENCES species.taxonomy(id),
  country    TEXT,
  department TEXT,
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
  image_key       TEXT        NOT NULL,
  thumbnail_key   TEXT,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  altitude_m      DOUBLE PRECISION,
  recorded_at     TIMESTAMPTZ,
  notes           TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending',
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
  raw_results     JSONB,
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
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications.notifications(user_id, is_read);
