-- Fase 23 — Paquete anterior (legado) y versiones restaurables.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- `origen` dice de dónde salió una versión de packages.regional_packages:
--   'compilado' — la armó el compilador del servidor desde la base (release.js), con sus dos aprobaciones.
--   'legado'    — es un paquete anterior que ya estaba validado y se importó tal cual (legado.js): no pasó por
--                 las aprobaciones de este flujo y no depende del estado actual de la base, así que nunca se
--                 marca como desactualizado. Un mismo archivo puede registrarse para varias subregiones
--                 (`storage_key` compartido); ese objeto en MinIO no se borra nunca: es la versión anterior.
-- Restaurar una versión retirada no necesita columnas nuevas: cambia `estado` y queda en audit.log.

ALTER TABLE packages.regional_packages ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'compilado';

ALTER TABLE packages.regional_packages DROP CONSTRAINT IF EXISTS regional_packages_origen_check;
ALTER TABLE packages.regional_packages
  ADD CONSTRAINT regional_packages_origen_check CHECK (origen IN ('compilado', 'legado'));

-- Aprobaciones de un paquete (packages.aprobacion, phase18): una por TIPO (la PK (paquete_id, tipo) ya lo impone).
-- Antes además había UNIQUE (paquete_id, cuenta): ninguna cuenta podía dar las dos. Ahora la cuenta SUPER sí puede
-- (`es_super` guarda si quien aprobó lo era al momento de hacerlo). Una cuenta que no es super sigue sin poder dar
-- las dos: lo impone el índice parcial de abajo, no solo el servidor.
ALTER TABLE packages.aprobacion ADD COLUMN IF NOT EXISTS es_super BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  restriccion TEXT;
BEGIN
  -- La restricción se creó sin nombre propio (phase18): se busca por sus columnas, no por el nombre.
  FOR restriccion IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'packages.aprobacion'::regclass
      AND con.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(con.conkey) AS k(attnum)
           JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) = ARRAY['cuenta', 'paquete_id']
  LOOP
    EXECUTE format('ALTER TABLE packages.aprobacion DROP CONSTRAINT %I', restriccion);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS aprobacion_cuenta_no_super_idx
  ON packages.aprobacion (paquete_id, cuenta) WHERE NOT es_super;
