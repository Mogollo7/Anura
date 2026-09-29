-- Fase 3 — S1: cuentas, roles y sesión reales del panel administrativo.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).

-- Bug preexistente (bloqueaba cualquier registro nuevo, incluido Google OAuth):
-- preferencesRepository.create() inserta esta columna y nunca estuvo en una migración
-- aplicada automáticamente (solo en el script suelto src/cli/migrate.js, nunca ejecutado).
ALTER TABLE auth.user_preferences
  ADD COLUMN IF NOT EXISTS preferences_completed BOOLEAN DEFAULT FALSE;

-- Cuentas del panel administrativo (D:\server\Anura\admin), distintas de auth.users
-- (usuarios de ANURA Mobile). El permiso es por ACCIÓN, no por pantalla — ver
-- 19_ADMIN/Roles del Admin. user_id se llena solo cuando esa persona inicia sesión
-- por primera vez con ese email (ver panelService.getMe).
CREATE TABLE IF NOT EXISTS auth.panel_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(150) NOT NULL,
  is_super    BOOLEAN NOT NULL DEFAULT FALSE,
  permissions JSONB NOT NULL,
  created_by  UUID REFERENCES auth.panel_accounts(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS panel_accounts_email_lower_idx ON auth.panel_accounts (lower(email));

GRANT ALL PRIVILEGES ON auth.panel_accounts TO auth_service;

GRANT USAGE ON SCHEMA audit TO auth_service;
GRANT INSERT ON audit.log TO auth_service;

-- Único super usuario real de arranque: no degradable, no suspendible (regla del vault).
-- Otras cuentas (herpetólogos, administradores técnicos) las crea este super usuario
-- ya en producción, con datos reales — no se siembran cuentas de ejemplo aquí.
INSERT INTO auth.panel_accounts (email, name, is_super, permissions)
VALUES (
  'sebastianmartinez06.js@gmail.com',
  'Sebastián Martínez',
  TRUE,
  '{
    "verEspecies": true, "editarTaxonomia": true, "revisarFotografias": true,
    "validarEstadio": true, "definirMorfo": true, "definirLRC": true,
    "definirMicrohabitat": true, "definirPesos": true, "crearComplejo": true,
    "ejecutarEntrenamiento": true, "modificarWorker": true, "verGPU": true,
    "configurarOSR": true, "generarPaquete": true, "aprobarCientifico": true,
    "publicarPaquete": true, "gestionarCuentas": true, "debugTecnico": true
  }'::jsonb
)
ON CONFLICT (email) DO NOTHING;
