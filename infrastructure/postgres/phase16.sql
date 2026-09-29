-- Fase 16 — Bloque 2: altitud por observación y Ficha técnica en el servidor.
-- (Antes la altitud solo existía como un resumen por especie exportado y la ficha vivía en el
-- navegador.) Idempotente (03-roles.sh).
--
-- Altitud: metros sobre el nivel del mar de la coordenada que usa la observación (latitud_limpia
-- si la limpieza ya decidió, si no la original), consultada a geo-service. NUNCA se inventa:
-- si geo-service no responde o no devuelve dato, la columna queda NULL.
--   altitud_lat/lon    coordenada con la que se calculó. Si la limpieza la cambia después, la
--                      altitud deja de contar y se vuelve a calcular ("Calcular altitudes").
--   altitud_fuente     de dónde salió (opentopodata:srtm30m, cache, …).
--   altitud_calculada  cuándo.
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS altitud_m         DOUBLE PRECISION;
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS altitud_lat       DOUBLE PRECISION;
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS altitud_lon       DOUBLE PRECISION;
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS altitud_fuente    TEXT;
ALTER TABLE dataset.observacion ADD COLUMN IF NOT EXISTS altitud_calculada TIMESTAMPTZ;

-- Lo que una persona decide en la Ficha de una especie. Lo calculado (percentiles de altitud,
-- priors de sustrato, pesos propuestos) no se guarda: se recalcula con las observaciones
-- vigentes. Cada columna es nula = "sin decisión, vale lo calculado".
CREATE TABLE IF NOT EXISTS dataset.ficha_ajuste (
  especie_id       INT PRIMARY KEY REFERENCES dataset.especie(id) ON DELETE CASCADE,
  -- Rango de altitud fijado a mano (m). Pisa al p5–p95 calculado.
  altitud_min      DOUBLE PRECISION,
  altitud_max      DOUBLE PRECISION,
  -- Pesos wv/wg/wm confirmados por el herpetólogo; suman 1.
  peso_wv          DOUBLE PRECISION CHECK (peso_wv BETWEEN 0 AND 1),
  peso_wg          DOUBLE PRECISION CHECK (peso_wg BETWEEN 0 AND 1),
  peso_wm          DOUBLE PRECISION CHECK (peso_wm BETWEEN 0 AND 1),
  -- Longitud rostro-cloaca en mm. 'pendiente' = nadie la ha medido.
  lrc_metodo       TEXT NOT NULL DEFAULT 'pendiente' CHECK (lrc_metodo IN ('pendiente', 'manual')),
  lrc_min          DOUBLE PRECISION,
  lrc_max          DOUBLE PRECISION,
  altitud_por      UUID,
  altitud_en       TIMESTAMPTZ,
  pesos_por        UUID,
  pesos_en         TIMESTAMPTZ,
  lrc_por          UUID,
  lrc_en           TIMESTAMPTZ,
  CHECK ((altitud_min IS NULL) = (altitud_max IS NULL)),
  CHECK ((peso_wv IS NULL) = (peso_wg IS NULL) AND (peso_wg IS NULL) = (peso_wm IS NULL)),
  CHECK (altitud_min IS NULL OR altitud_min < altitud_max),
  CHECK (lrc_min IS NULL OR lrc_max IS NULL OR lrc_min <= lrc_max)
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
