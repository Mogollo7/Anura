-- Fase 28 — Sincronización idempotente de observaciones y sus fotos desde el móvil.
ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS client_id TEXT
  CHECK (client_id IS NULL OR char_length(client_id) BETWEEN 1 AND 80);

CREATE UNIQUE INDEX IF NOT EXISTS observations_user_client_idx
  ON observations.observations (user_id, client_id)
  WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS observations.observation_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id  UUID NOT NULL REFERENCES observations.observations(id) ON DELETE CASCADE,
  client_media_id TEXT NOT NULL CHECK (char_length(client_media_id) BETWEEN 1 AND 100),
  position        SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),
  image_key       TEXT NOT NULL,
  thumbnail_key   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (observation_id, client_media_id),
  UNIQUE (observation_id, position)
);
CREATE INDEX IF NOT EXISTS observation_media_observation_idx
  ON observations.observation_media (observation_id, position);

GRANT ALL PRIVILEGES ON TABLE observations.observation_media TO observation_service;
GRANT SELECT ON observations.observation_media TO explorer_service;