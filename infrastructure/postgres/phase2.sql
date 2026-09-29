-- Fase 2 — migración idempotente.
-- La aplica infrastructure/postgres/03-roles.sh (db-migrate).
-- init.sql solo corre en un volumen nuevo; esta migración cubre ambos casos.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Coordenada real. lat/lon se conservan para los lectores existentes.
ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS place_guess TEXT;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS ai_class TEXT;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS common_name TEXT;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS genus TEXT;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS species TEXT;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS family TEXT;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS order_name TEXT;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS class_name TEXT;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS taxon_id INTEGER;

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS iucn_status TEXT;

UPDATE observations.observations
SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
WHERE location IS NULL
  AND lat IS NOT NULL
  AND lon IS NOT NULL;

CREATE INDEX IF NOT EXISTS obs_location_gix
  ON observations.observations USING GIST (location);

CREATE INDEX IF NOT EXISTS obs_feed_created_idx
  ON observations.observations (created_at DESC);

-- El default histórico 'pending' no entra en la máquina de estados.
UPDATE observations.observations
SET status = 'synced'
WHERE status IS NULL
   OR status NOT IN ('draft', 'synced', 'in_review', 'validated', 'rejected');

ALTER TABLE observations.observations
  ALTER COLUMN status SET DEFAULT 'synced';

ALTER TABLE observations.observations
  DROP CONSTRAINT IF EXISTS observations_status_check;

ALTER TABLE observations.observations
  ADD CONSTRAINT observations_status_check
  CHECK (status IN ('draft', 'synced', 'in_review', 'validated', 'rejected'));

CREATE TABLE IF NOT EXISTS auth.follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id)
);

-- Esquema previo usaba following_id + id serial; alinearlo con Fase 2.
DO $migrate_follows$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'follows' AND column_name = 'following_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'follows' AND column_name = 'followee_id'
  ) THEN
    ALTER TABLE auth.follows RENAME COLUMN following_id TO followee_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'follows' AND column_name = 'id'
  ) THEN
    ALTER TABLE auth.follows DROP CONSTRAINT IF EXISTS follows_pkey;
    ALTER TABLE auth.follows DROP CONSTRAINT IF EXISTS follows_follower_id_following_id_key;
    ALTER TABLE auth.follows DROP COLUMN IF EXISTS id;
    BEGIN
      ALTER TABLE auth.follows ADD PRIMARY KEY (follower_id, followee_id);
    EXCEPTION WHEN invalid_table_definition THEN
      NULL;
    END;
  END IF;
END
$migrate_follows$;

ALTER TABLE auth.follows DROP CONSTRAINT IF EXISTS follows_no_self;
ALTER TABLE auth.follows
  ADD CONSTRAINT follows_no_self CHECK (follower_id <> followee_id);

CREATE INDEX IF NOT EXISTS follows_followee_idx ON auth.follows (followee_id);

CREATE TABLE IF NOT EXISTS observations.favorites (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  observation_id UUID NOT NULL REFERENCES observations.observations(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, observation_id)
);

CREATE INDEX IF NOT EXISTS favorites_observation_idx
  ON observations.favorites (observation_id);

CREATE SCHEMA IF NOT EXISTS packages;

CREATE TABLE IF NOT EXISTS packages.regional_packages (
  id           SERIAL PRIMARY KEY,
  region_id    TEXT NOT NULL,
  version      INT NOT NULL,
  storage_key  TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, version)
);

ALTER TABLE ai.model_versions
  ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'mobile-onnx';

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit.log (actor_id, created_at DESC);

-- Lee species.taxonomy como el dueño de la función. observation_service
-- no recibe GRANT sobre el schema species.
CREATE OR REPLACE FUNCTION observations.lookup_iucn(
  p_taxon_id INTEGER,
  p_genus TEXT,
  p_epithet TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = species, pg_temp
AS $$
  SELECT iucn_status
  FROM species.taxonomy
  WHERE (p_taxon_id IS NOT NULL AND id = p_taxon_id)
     OR (
       p_genus IS NOT NULL
       AND p_epithet IS NOT NULL
       AND lower(genus) = lower(p_genus)
       AND lower(species) = lower(p_epithet)
     )
  ORDER BY CASE WHEN p_taxon_id IS NOT NULL AND id = p_taxon_id THEN 0 ELSE 1 END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION observations.lookup_iucn(INTEGER, TEXT, TEXT) FROM PUBLIC;
