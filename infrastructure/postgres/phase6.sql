-- Fase 6 — M1: curación en el servidor y subida manual de fotos.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- "Excluir foto" e "Invalidar observación" de Admin → Curación dejan de vivir en el
-- navegador. Nada se borra: una exclusión se revierte marcando `revertida`, y una
-- observación invalidada guarda motivo, quién y cuándo.

-- Invalidar una observación excluye todas sus fotos (una fila de exclusion por foto, con
-- observacion_id) y la saca de las capas geográficas. Revertirla deshace ambas cosas.
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS invalidada_motivo TEXT;
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS invalidada_por UUID;
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS invalidada_en TIMESTAMPTZ;
-- latitud_limpia/longitud_limpia/uso_geografico/limpieza_metodo antes de invalidar, para
-- que revertir devuelva lo que se había decidido en Calidad y no lo pierda.
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS invalidada_previo JSONB;
-- Departamento que devolvió geo-service al validar una coordenada subida a mano.
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS departamento TEXT;

ALTER TABLE dataset.exclusion ADD COLUMN IF NOT EXISTS observacion_id BIGINT REFERENCES dataset.observacion(id);
-- De dónde viene la exclusión: cada pantalla solo revierte las suyas (Curación no deshace
-- una decisión de licencia tomada en Calidad).
ALTER TABLE dataset.exclusion ADD COLUMN IF NOT EXISTS origen TEXT
  CHECK (origen IN ('limpieza_original', 'curacion', 'observacion_invalidada', 'decision_licencia'));
UPDATE dataset.exclusion SET origen = 'limpieza_original' WHERE origen IS NULL AND por IS NULL;
UPDATE dataset.exclusion SET origen = 'decision_licencia' WHERE origen IS NULL AND por IS NOT NULL;
CREATE INDEX IF NOT EXISTS exclusion_sha_activa_idx ON dataset.exclusion (sha256) WHERE revertida IS NULL;

-- Fotos subidas desde el Admin: quién las subió (auth.users.id). NULL = importador.
ALTER TABLE dataset.foto ADD COLUMN IF NOT EXISTS subida_por UUID;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
