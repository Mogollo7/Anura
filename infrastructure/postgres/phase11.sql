-- Fase 11 — K (entrega): lo publicado es una foto fija, no el borrador vivo.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- Antes, editar una ficha publicada la devolvía a borrador y el catálogo (que filtraba por
-- estado = 'publicada') dejaba de servirla hasta volver a publicar: la app y la web perdían la
-- especie mientras alguien corregía una coma. Ahora publicar copia {campos, foto_principal_sha256,
-- galeria} a `publicada`, y el catálogo lee solo esa copia. El borrador puede cambiar sin tocar
-- lo que ve la gente hasta el próximo aval.
ALTER TABLE dataset.species_content ADD COLUMN IF NOT EXISTS publicada JSONB;

-- Las fichas publicadas antes de esta fase (si las hay) quedan con su copia actual.
UPDATE dataset.species_content
   SET publicada = jsonb_build_object('campos', campos, 'foto_principal_sha256', foto_principal_sha256,
                                      'galeria', to_jsonb(galeria))
 WHERE estado = 'publicada' AND publicada IS NULL;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
