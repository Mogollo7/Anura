-- Roles por servicio. Las contraseñas llegan como variables de psql
-- (-v auth_pw=...) y se guardan en la sesión antes del bloque DO,
-- porque psql no sustituye :'var' dentro de dollar-quoting.

SELECT set_config('anura.auth_pw', :'auth_pw', false);
SELECT set_config('anura.obs_pw', :'obs_pw', false);
SELECT set_config('anura.explorer_pw', :'explorer_pw', false);
SELECT set_config('anura.geo_pw', :'geo_pw', false);
SELECT set_config('anura.thumb_pw', :'thumb_pw', false);
SELECT set_config('anura.notif_pw', :'notif_pw', false);
SELECT set_config('anura.dataset_pw', :'dataset_pw', false);

DO $body$
DECLARE
  auth_pw text := current_setting('anura.auth_pw');
  obs_pw text := current_setting('anura.obs_pw');
  explorer_pw text := current_setting('anura.explorer_pw');
  geo_pw text := current_setting('anura.geo_pw');
  thumb_pw text := current_setting('anura.thumb_pw');
  notif_pw text := current_setting('anura.notif_pw');
  dataset_pw text := current_setting('anura.dataset_pw');
BEGIN
  IF auth_pw = '' OR obs_pw = '' OR explorer_pw = ''
     OR geo_pw = '' OR thumb_pw = '' OR notif_pw = '' OR dataset_pw = '' THEN
    RAISE EXCEPTION 'faltan contraseñas de roles';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_service') THEN
    EXECUTE format('CREATE ROLE auth_service LOGIN PASSWORD %L', auth_pw);
  ELSE
    EXECUTE format('ALTER ROLE auth_service WITH LOGIN PASSWORD %L', auth_pw);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'observation_service') THEN
    EXECUTE format('CREATE ROLE observation_service LOGIN PASSWORD %L', obs_pw);
  ELSE
    EXECUTE format('ALTER ROLE observation_service WITH LOGIN PASSWORD %L', obs_pw);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'explorer_service') THEN
    EXECUTE format('CREATE ROLE explorer_service LOGIN PASSWORD %L', explorer_pw);
  ELSE
    EXECUTE format('ALTER ROLE explorer_service WITH LOGIN PASSWORD %L', explorer_pw);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'geo_service') THEN
    EXECUTE format('CREATE ROLE geo_service LOGIN PASSWORD %L', geo_pw);
  ELSE
    EXECUTE format('ALTER ROLE geo_service WITH LOGIN PASSWORD %L', geo_pw);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thumbnail_service') THEN
    EXECUTE format('CREATE ROLE thumbnail_service LOGIN PASSWORD %L', thumb_pw);
  ELSE
    EXECUTE format('ALTER ROLE thumbnail_service WITH LOGIN PASSWORD %L', thumb_pw);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notification_service') THEN
    EXECUTE format('CREATE ROLE notification_service LOGIN PASSWORD %L', notif_pw);
  ELSE
    EXECUTE format('ALTER ROLE notification_service WITH LOGIN PASSWORD %L', notif_pw);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dataset_service') THEN
    EXECUTE format('CREATE ROLE dataset_service LOGIN PASSWORD %L', dataset_pw);
  ELSE
    EXECUTE format('ALTER ROLE dataset_service WITH LOGIN PASSWORD %L', dataset_pw);
  END IF;
END
$body$;

ALTER ROLE auth_service SET search_path TO auth, public;
ALTER ROLE observation_service SET search_path TO observations, public;
ALTER ROLE explorer_service SET search_path TO species, geo, observations, auth, ai, public;
ALTER ROLE geo_service SET search_path TO geo, public;
ALTER ROLE notification_service SET search_path TO notifications, public;
ALTER ROLE dataset_service SET search_path TO dataset, public;

DO $grant_connect$
DECLARE
  db text := current_database();
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO auth_service, observation_service, explorer_service, geo_service, thumbnail_service, notification_service, dataset_service',
    db
  );
END
$grant_connect$;

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
REVOKE ALL ON SCHEMA observations FROM PUBLIC;
REVOKE ALL ON SCHEMA species FROM PUBLIC;
REVOKE ALL ON SCHEMA geo FROM PUBLIC;
REVOKE ALL ON SCHEMA notifications FROM PUBLIC;
REVOKE ALL ON SCHEMA packages FROM PUBLIC;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON SCHEMA ai FROM PUBLIC;

GRANT USAGE ON SCHEMA auth TO auth_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO auth_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO auth_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO auth_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO auth_service;

-- authService.getPublicProfile hace COUNT sobre observations.observations y
-- ai.predictions para las estadísticas del perfil público (GET /api/auth/public/:username).
GRANT USAGE ON SCHEMA observations TO auth_service;
GRANT SELECT ON observations.observations TO auth_service;
GRANT USAGE ON SCHEMA ai TO auth_service;
GRANT SELECT ON ai.predictions TO auth_service;
GRANT USAGE ON SCHEMA audit TO auth_service;
GRANT SELECT ON audit.log TO auth_service;
GRANT USAGE ON SCHEMA species TO auth_service;
GRANT SELECT ON ALL TABLES IN SCHEMA species TO auth_service;

GRANT USAGE ON SCHEMA observations TO observation_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA observations TO observation_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA observations TO observation_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA observations GRANT ALL ON TABLES TO observation_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA observations GRANT ALL ON SEQUENCES TO observation_service;
GRANT EXECUTE ON FUNCTION observations.lookup_iucn(INTEGER, TEXT, TEXT) TO observation_service;

GRANT USAGE ON SCHEMA audit TO observation_service;
GRANT INSERT, SELECT ON audit.log TO observation_service;

-- observation.routes.js (feed y comentarios) y panel.routes.js hacen JOIN con auth.users y
-- solo leen id/username/profile_image; el resto de ai.predictions al crear, listar y eliminar.
-- GRANT por columnas: sin acceso a email, password_hash, google_id, profile_image_blob, etc.
-- El REVOKE va antes para que re-aplicar este archivo quite un GRANT de tabla completa previo.
GRANT USAGE ON SCHEMA auth TO observation_service;
REVOKE SELECT ON auth.users FROM observation_service;
GRANT SELECT (id, username, profile_image) ON auth.users TO observation_service;
GRANT USAGE ON SCHEMA ai TO observation_service;
GRANT SELECT, INSERT, DELETE ON ai.predictions TO observation_service;

-- Lectura de catálogo y geo, más lo que el Explorador realmente necesita para el feed, el
-- perfil y los favoritos: observaciones y usuarios en solo lectura (con 2 columnas editables
-- por el propio dueño de la observación) y las predicciones IA que el feed muestra junto al
-- catálogo. El servicio no toca auth.users más allá de leer username/profile_image, ni escribe
-- en observations.observations salvo altitude_m/place_guess (edición de metadatos por el autor).
GRANT USAGE ON SCHEMA species TO explorer_service;
GRANT USAGE ON SCHEMA geo TO explorer_service;
GRANT USAGE ON SCHEMA observations TO explorer_service;
GRANT USAGE ON SCHEMA auth TO explorer_service;
GRANT USAGE ON SCHEMA ai TO explorer_service;
GRANT SELECT ON ALL TABLES IN SCHEMA species TO explorer_service;
GRANT SELECT ON ALL TABLES IN SCHEMA geo TO explorer_service;
-- Solo lo público de cada persona; sin email, password_hash, google_id ni el blob del avatar. El REVOKE va
-- antes para que re-aplicar este archivo quite el GRANT de tabla completa de versiones anteriores.
REVOKE SELECT ON auth.users FROM explorer_service;
GRANT SELECT (id, username, profile_image, created_at) ON auth.users TO explorer_service;
GRANT SELECT ON ai.predictions TO explorer_service;
GRANT SELECT, UPDATE (altitude_m, place_guess) ON observations.observations TO explorer_service;
GRANT SELECT, INSERT, DELETE ON observations.favorites TO explorer_service;
-- favorites usa PK compuesta (phase2): la secuencia solo existe en bases viejas.
DO $$ BEGIN
  IF to_regclass('observations.favorites_id_seq') IS NOT NULL THEN
    GRANT USAGE ON SEQUENCE observations.favorites_id_seq TO explorer_service;
  END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA species GRANT SELECT ON TABLES TO explorer_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA geo GRANT SELECT ON TABLES TO explorer_service;

GRANT USAGE ON SCHEMA geo TO geo_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA geo TO geo_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA geo TO geo_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA geo GRANT ALL ON TABLES TO geo_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA geo GRANT ALL ON SEQUENCES TO geo_service;

GRANT USAGE ON SCHEMA notifications TO notification_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA notifications TO notification_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA notifications TO notification_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA notifications GRANT ALL ON TABLES TO notification_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA notifications GRANT ALL ON SEQUENCES TO notification_service;

-- index.js sirve el blob original desde observations.observations.thumbnail_blob y el
-- avatar desde auth.users.profile_image_blob (GET /api/explorer/thumbnail/:size/:filename).
GRANT USAGE ON SCHEMA observations TO thumbnail_service;
GRANT SELECT ON observations.observations TO thumbnail_service;
GRANT USAGE ON SCHEMA auth TO thumbnail_service;
-- Solo el avatar (profile_image para buscarlo, profile_image_blob para servirlo): sin email ni password_hash.
REVOKE SELECT ON auth.users FROM thumbnail_service;
GRANT SELECT (profile_image) ON auth.users TO thumbnail_service;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'profile_image_blob') THEN
    GRANT SELECT (profile_image_blob) ON auth.users TO thumbnail_service;
  END IF;
END $$;

-- dataset_service (M1/M2/M3 del admin): dueño exclusivo del esquema dataset, más el log
-- de auditoría que ya usan el resto de servicios de escritura.
-- En una base nueva roles.sql corre antes que phase4.sql (que crea el esquema).
CREATE SCHEMA IF NOT EXISTS dataset;
GRANT USAGE ON SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA dataset GRANT ALL ON TABLES TO dataset_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA dataset GRANT ALL ON SEQUENCES TO dataset_service;

GRANT USAGE ON SCHEMA audit TO dataset_service;
GRANT INSERT ON audit.log TO dataset_service;

-- La bitácora ya se escribe desde auth y notificaciones. El panel la lee (GET /api/panel/auditoria).
GRANT USAGE ON SCHEMA audit TO auth_service;
GRANT SELECT, INSERT ON audit.log TO auth_service;
GRANT USAGE ON SCHEMA audit TO notification_service;
GRANT INSERT ON audit.log TO notification_service;
