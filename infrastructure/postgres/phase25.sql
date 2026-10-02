-- Fase 25 — Avisos enriquecidos desde el Admin (texto largo, enlaces, imagen) sin tocar la app móvil.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- La app y la web siguen leyendo notifications.notifications (title/body, sin cambios). El envío
-- rico vive aparte, UNA vez por envío (no una copia por destinatario):
--   avisos_envios — el contenido completo (texto largo, enlaces, imagen) con un token público.
--                   El cuerpo que ve el teléfono lleva un resumen y el enlace /a/<token>.
--   avisos_media  — los bytes de la imagen adjunta (hasta 2 MB), servidos por el propio
--                   notification-service; no usa MinIO.

CREATE TABLE IF NOT EXISTS notifications.avisos_media (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mime        TEXT        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  bytes       BYTEA       NOT NULL,
  size_bytes  INTEGER     NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  sha256      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS avisos_media_sha_idx ON notifications.avisos_media (sha256);

CREATE TABLE IF NOT EXISTS notifications.avisos_envios (
  id          UUID        PRIMARY KEY,                       -- = metadata.envio de cada fila de notifications
  token       TEXT        NOT NULL UNIQUE,                   -- enlace público /a/<token>, no adivinable
  titulo      TEXT        NOT NULL,
  cuerpo      TEXT        NOT NULL DEFAULT '',
  enlaces     JSONB       NOT NULL DEFAULT '[]'::jsonb,      -- [{ "texto": "...", "url": "https://..." }]
  imagen_id   UUID        REFERENCES notifications.avisos_media(id) ON DELETE SET NULL,
  imagen_url  TEXT,                                          -- alternativa: imagen ya alojada en https
  destino     TEXT        NOT NULL,
  autor       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS avisos_envios_creado_idx ON notifications.avisos_envios (created_at DESC);

-- Para listar y retirar un envío por metadata.envio sin recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS notif_envio_idx ON notifications.notifications ((metadata->>'envio')) WHERE type = 'aviso';

GRANT ALL PRIVILEGES ON notifications.avisos_media, notifications.avisos_envios TO notification_service;
-- Retirar un aviso borra sus filas por destinatario.
GRANT DELETE ON notifications.notifications TO notification_service;
