-- Fase 24 — Petición de sincronización desde el admin hacia el teléfono.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- El teléfono sube fotos y observaciones por su cuenta (al abrir la app y, como máximo,
-- cada 15 minutos). sync_pedida marca que el admin pidió esa subida ya. El teléfono la
-- borra cuando la atiende (POST /api/auth/dispositivos/sincronizada).

ALTER TABLE auth.user_devices
  ADD COLUMN IF NOT EXISTS sync_pedida TIMESTAMPTZ;
