-- Fase 13 — Área App del Admin con datos reales (Usuarios, Dispositivos, Observaciones, Avisos).
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- auth.user_devices existía desde init.sql pero nadie escribía en ella. Aquí gana lo que el
-- teléfono reporta en cada arranque (POST /api/auth/dispositivos, C4): una fila por instalación
-- (device_key la genera la app y la guarda), versión de la app, paquetes instalados, espacio
-- libre y la última vez que se reportó. `bloqueado` lo decide una persona desde el Admin.
ALTER TABLE auth.user_devices ADD COLUMN IF NOT EXISTS device_key       TEXT;
ALTER TABLE auth.user_devices ADD COLUMN IF NOT EXISTS app_version      TEXT;
ALTER TABLE auth.user_devices ADD COLUMN IF NOT EXISTS paquetes         JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE auth.user_devices ADD COLUMN IF NOT EXISTS espacio_libre_mb INTEGER;
ALTER TABLE auth.user_devices ADD COLUMN IF NOT EXISTS last_seen        TIMESTAMPTZ;
ALTER TABLE auth.user_devices ADD COLUMN IF NOT EXISTS bloqueado        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth.user_devices ADD COLUMN IF NOT EXISTS bloqueo_motivo   TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS user_devices_key_idx ON auth.user_devices (user_id, device_key);

-- Motivo de suspensión de una cuenta de la app (is_active ya existía, sin motivo ni efecto).
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Motivo de la decisión de un revisor sobre una observación (validated / rejected).
ALTER TABLE observations.observations ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE observations.observations ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;

-- Avisos: un envío desde el Admin crea una fila por destinatario en notifications.notifications
-- (type 'aviso', metadata.envio = id común). La app los lee con GET /api/notifications.

-- notification-service resuelve "todos los usuarios activos". Solo las columnas que usa, nada
-- de correo ni contraseña.
GRANT USAGE ON SCHEMA auth TO notification_service;
GRANT SELECT (id, username, is_active) ON auth.users TO notification_service;
GRANT USAGE ON SCHEMA audit TO notification_service;
GRANT INSERT ON audit.log TO notification_service;

-- Centroide regional (M3): media L2 de las fotos de entrenamiento de una especie cuyas
-- observaciones caen DENTRO de una subregión (point-in-polygon de geo-service sobre los
-- municipios DANE asignados en Regiones). Solo con ≥ 3 individuos en esa subregión; si no, el
-- paquete de esa subregión presta el global (19_ADMIN/Centroides y Muestras, decisión #10).
CREATE TABLE IF NOT EXISTS dataset.centroide_regional (
  experimento_id  INTEGER NOT NULL REFERENCES dataset.experimento(id) ON DELETE CASCADE,
  especie_id      INTEGER NOT NULL,
  subregion_id    INTEGER NOT NULL REFERENCES dataset.subregion(id) ON DELETE CASCADE,
  n_vectores      INTEGER NOT NULL,
  n_observaciones INTEGER NOT NULL,
  -- Sin vector ni dispersión = menos individuos que el mínimo: ese paquete presta el global.
  dispersion      DOUBLE PRECISION,
  -- Coseno entre este centroide y el global de la misma especie en la misma corrida.
  coseno_global   DOUBLE PRECISION,
  vector          vector(512),
  PRIMARY KEY (experimento_id, especie_id, subregion_id)
);
ALTER TABLE dataset.centroide_regional ALTER COLUMN dispersion DROP NOT NULL;
ALTER TABLE dataset.centroide_regional ALTER COLUMN vector DROP NOT NULL;
