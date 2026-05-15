-- Ejecutar una vez en bases ya inicializadas (init.sql nuevo ya lo incluye en instalaciones limpias).
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS profile_image_blob BYTEA;
