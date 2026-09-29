-- Fase 21 — Salidas de campo reales (app Android -> servidor -> web).
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- Una salida la crea y modifica solo su autora (observation-service, dueño del schema
-- observations). La app la sube al cerrarla, con las observaciones que ya están en el servidor;
-- las observaciones apuntan a su salida con observations.observations.field_trip_id.
-- (user_id, client_id) hace la subida idempotente: reintentar no duplica la salida. client_id es el
-- id local de la sesión en el teléfono.
--
-- Lectura: la sirve explorer-service (lado lectura del feed) con la misma regla de privacidad que
-- las observaciones. Una persona ajena ve la salida solo si tiene al menos una observación pública
-- y solo ve esas observaciones; la autora ve todo lo suyo.
-- lat/lon/place_label de la salida son opcionales (la app aún no los registra): sin ellos, la
-- lectura usa la ubicación de las observaciones visibles.

CREATE TABLE IF NOT EXISTS observations.field_trips (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 80),
  place_label  TEXT,
  lat          DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lon          DOUBLE PRECISION CHECK (lon BETWEEN -180 AND 180),
  started_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_id),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS field_trips_started_idx ON observations.field_trips (started_at DESC);
CREATE INDEX IF NOT EXISTS field_trips_user_idx ON observations.field_trips (user_id, started_at DESC);

ALTER TABLE observations.observations
  ADD COLUMN IF NOT EXISTS field_trip_id UUID REFERENCES observations.field_trips(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS obs_field_trip_idx ON observations.observations (field_trip_id)
  WHERE field_trip_id IS NOT NULL;

-- observation_service: ALTER DEFAULT PRIVILEGES de roles.sql ya le da todo sobre tablas nuevas de
-- observations; se repite aquí para que la migración se sostenga sola si esos defaults faltan.
GRANT ALL PRIVILEGES ON observations.field_trips TO observation_service;
-- explorer_service solo lee (el SELECT de tabla completa de observations.observations ya cubre
-- la columna nueva field_trip_id).
GRANT SELECT ON observations.field_trips TO explorer_service;
