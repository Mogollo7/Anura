-- Fase 12 — Regiones: departamentos en ANURA y sus subregiones (Admin → Regiones).
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- La unidad que se versiona y se descarga es la SUBREGIÓN (19_ADMIN/Decisiones de
-- Escalabilidad #8). Hasta ahora las 9 de Antioquia vivían escritas en el Admin; aquí pasan a
-- ser datos: agregar un departamento es una fila en `region`, y dividirlo es asignar sus
-- municipios (código DANE) a subregiones. Los polígonos no se guardan aquí: los sirve
-- geo-service (límites DANE, sin red externa).
CREATE TABLE IF NOT EXISTS dataset.region (
  codigo_dane CHAR(2) PRIMARY KEY,             -- DPTO del DANE: '05' Antioquia, '19' Cauca…
  nombre      TEXT NOT NULL,
  -- borrador: agregado pero sin subregiones completas; activa: se compilan paquetes para él.
  estado      TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activa')),
  creado_por  UUID,
  creado      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dataset.subregion (
  id          SERIAL PRIMARY KEY,
  region      CHAR(2) NOT NULL REFERENCES dataset.region(codigo_dane) ON DELETE CASCADE,
  numero      INT NOT NULL,
  clave       TEXT NOT NULL,                   -- estable: VALLE_DE_ABURRA (carpeta en COLOMBIA_ANURA)
  nombre      TEXT NOT NULL,
  creado      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region, clave)
);

-- Un municipio está en una sola subregión (PK por municipio).
CREATE TABLE IF NOT EXISTS dataset.subregion_municipio (
  municipio_dane CHAR(5) PRIMARY KEY,
  subregion_id   INT NOT NULL REFERENCES dataset.subregion(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS subregion_municipio_sub_idx ON dataset.subregion_municipio (subregion_id);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;

\i /sql/seed_regiones_antioquia.sql
