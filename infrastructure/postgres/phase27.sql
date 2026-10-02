-- Fase 27 — Huella de la configuración que alimenta centroides regionales.
-- Cambios de municipios o asignaciones manuales requieren recalcular antes de publicar paquetes.
ALTER TABLE dataset.experimento
  ADD COLUMN IF NOT EXISTS configuracion_regional_sha256 CHAR(64);

GRANT ALL PRIVILEGES ON TABLE dataset.experimento TO dataset_service;