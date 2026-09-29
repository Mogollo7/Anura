-- Fase 18 — Release de paquetes por subregión desde el Admin (bloque 4).
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- packages.regional_packages (phase2) existía sin nadie que escribiera en ella: el paquete del
-- teléfono se copiaba a mano con scripts/publicar-paquetes.mjs. Ahora dataset-service compila
-- el paquete de una subregión (sqlite + JSON) desde el estado real, lo guarda en MinIO y deja
-- aquí su registro con estados borrador → aprobado → publicado (→ retirado cuando otro lo
-- reemplaza). Publicar exige dos aprobaciones de cuentas del panel distintas; la base lo
-- garantiza con UNIQUE (paquete_id, cuenta), no solo el servidor.

ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS subregion_id   INTEGER REFERENCES dataset.subregion(id) ON DELETE SET NULL;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS estado         TEXT NOT NULL DEFAULT 'borrador';
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS especies       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS encoder_sha256 CHAR(64);
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS experimento_id INTEGER REFERENCES dataset.experimento(id) ON DELETE SET NULL;
-- Fila de dataset.osr_umbral (phase20) con la que se compiló; sin FK: esa tabla puede no existir aún.
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS osr_umbral_id  BIGINT;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS tau            DOUBLE PRECISION;
-- Huella de lo que alimentó la compilación (corrida de centroides, umbral OSR, versión del
-- dataset, especies). Si cambia, el borrador queda desactualizado y no se aprueba ni publica.
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS huella         TEXT;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS manifiesto     JSONB;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS manifiesto_key TEXT;
-- Quién: usuario (auth.users.id, el mismo de audit.log) y nombre de su cuenta del panel.
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS compilado_por  UUID;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS compilado_cuenta TEXT;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS compilado_nombre TEXT;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS publicado_por  UUID;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS publicado_nombre TEXT;
ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS retirado       TIMESTAMPTZ;

ALTER TABLE packages.regional_packages DROP CONSTRAINT IF EXISTS regional_packages_estado_check;
ALTER TABLE packages.regional_packages
  ADD CONSTRAINT regional_packages_estado_check
  CHECK (estado IN ('borrador', 'aprobado', 'publicado', 'retirado'));

-- Una sola versión publicada por paquete (subregión) a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS regional_packages_publicado_idx
  ON packages.regional_packages (region_id) WHERE estado = 'publicado';
CREATE INDEX IF NOT EXISTS regional_packages_subregion_idx
  ON packages.regional_packages (subregion_id, version DESC);

-- Dos aprobaciones por paquete: científica (aprobarCientifico) y técnica (publicarPaquete),
-- cada una de una cuenta distinta. Quien compila puede dar una, nunca las dos.
-- `cuenta` = auth.panel_accounts.id (la identidad del panel); `usuario` = auth.users.id.
CREATE TABLE IF NOT EXISTS packages.aprobacion (
  paquete_id  INTEGER NOT NULL REFERENCES packages.regional_packages(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('cientifica', 'tecnica')),
  cuenta      TEXT NOT NULL,
  nombre      TEXT,
  usuario     UUID,
  creado      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (paquete_id, tipo),
  UNIQUE (paquete_id, cuenta)
);

GRANT USAGE ON SCHEMA packages TO dataset_service;
GRANT SELECT, INSERT, UPDATE ON packages.regional_packages TO dataset_service;
GRANT SELECT, INSERT ON packages.aprobacion TO dataset_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA packages TO dataset_service;
