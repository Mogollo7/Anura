-- Fase 8 — K: ficha pública, Explorador y destacados.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- La ficha pública es CONTENIDO, no modelo: se versiona y se publica aparte del paquete de
-- identificación (corregir un nombre común no recompila centroides). Hoy vive escrita a mano
-- en SpeciesCatalog.kt/HomeCarouselCatalog.kt (app) y en species.taxonomy (web); esta tabla
-- pasa a ser la única fuente. Ver 19_ADMIN/Ficha Publica, Explorador y Destacados.md.

-- `campos` guarda los bloques editables por el herpetólogo. Cada dato que exige fuente según
-- la nota (nombre común, UICN, toxicidad, altitud de literatura, LHC, dato curioso) se guarda
-- como {"valor"|"categoria"|"min"/"max"|"nivel", "fuente"}, nunca el valor suelto — así el
-- editor y la validación de publicar comparten la misma forma. Los bloques sin regla de fuente
-- (hábitat, morfología, especies con que se confunde) son texto u objetos simples. Documentado
-- en dataset-service/src/contenido.ts (no hay CHECK de forma: JSONB no lo permite bien y el
-- servicio ya valida antes de cada escritura).
CREATE TABLE IF NOT EXISTS dataset.species_content (
  id                  SERIAL PRIMARY KEY,
  especie_id          INT NOT NULL UNIQUE REFERENCES dataset.especie(id),
  estado              TEXT NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador', 'en_revision', 'publicada')),
  campos              JSONB NOT NULL DEFAULT '{}',
  foto_principal_sha256 CHAR(64) REFERENCES dataset.foto(sha256),
  galeria             CHAR(64)[] NOT NULL DEFAULT '{}',
  version             INT NOT NULL DEFAULT 0,        -- se sube 1 cada vez que se publica
  creado_por          UUID,
  actualizado_por     UUID,
  enviado_revision_por UUID,
  enviado_revision_en TIMESTAMPTZ,
  publicado_por       UUID,
  publicado_en        TIMESTAMPTZ,
  creado              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Carrusel de inicio ("Rana del día"): un calendario, un día y categoría a la vez.
CREATE TABLE IF NOT EXISTS dataset.destacado (
  id          SERIAL PRIMARY KEY,
  fecha       DATE NOT NULL,
  categoria   TEXT NOT NULL CHECK (categoria IN (
                'rana_del_dia', 'donde_buscarla', 'foto_destacada', 'especie_amenazada')),
  especie_id  INT NOT NULL REFERENCES dataset.especie(id),
  creado_por  UUID,
  creado      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fecha, categoria)
);
CREATE INDEX IF NOT EXISTS destacado_fecha_idx ON dataset.destacado (fecha);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
