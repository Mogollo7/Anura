-- Fase 20 — Bloque 6: OSR, Métricas y Simulador desde los vectores reales.
-- Migración idempotente, aplicada por infrastructure/postgres/03-roles.sh (db-migrate).
--
-- OSR: el mismo rechazo que el teléfono (OpenSetModel.kt, M5_LedoitWolf_Shared): distancia de
-- Mahalanobis mínima a las medias de las especies del paquete, con una precisión compartida
-- (inversa de la covarianza Ledoit-Wolf de los vectores de entrenamiento centrados por especie).
-- τ = percentil de esas distancias en la partición val (calibración) al KAR objetivo.
-- El servidor PROPONE (osr_calibracion + fila de osr_umbral sin validar); una persona VALIDA
-- (fila nueva de osr_umbral con validado/validado_por). Umbral vigente de una subregión =
-- la fila más reciente con validado IS NOT NULL. subregion_id NULL = todas las especies con
-- centroide (sin recorte por subregión).

CREATE TABLE IF NOT EXISTS dataset.osr_calibracion (
  id                     SERIAL PRIMARY KEY,
  subregion_id           INT REFERENCES dataset.subregion(id) ON DELETE CASCADE,
  experimento_id         INT NOT NULL REFERENCES dataset.experimento(id) ON DELETE CASCADE,
  encoder_sha256         CHAR(64) NOT NULL REFERENCES dataset.encoder(sha256),
  version_id             INT REFERENCES dataset.version(id),
  metrica                TEXT NOT NULL DEFAULT 'mahalanobis_min_ledoit_wolf',
  particion_calibracion  TEXT NOT NULL DEFAULT 'val',
  -- Donde se midieron KAR/FAR/AUROC: 'test' si hay; 'val' si no (entonces el KAR es optimista).
  particion_medida       TEXT NOT NULL,
  kar_objetivo           DOUBLE PRECISION NOT NULL,
  tau_propuesto          DOUBLE PRECISION NOT NULL,
  shrinkage              DOUBLE PRECISION NOT NULL,
  especies               INT NOT NULL,
  n_train                INT NOT NULL,
  n_calibracion          INT NOT NULL,
  n_conocidas            INT NOT NULL,
  n_desconocidas         INT NOT NULL,
  -- Métricas, puntos de operación, filas por especie, comparación con el coseno y las
  -- distancias medidas (para ver KAR/FAR de otro τ sin recalcular).
  resultado              JSONB NOT NULL,
  -- Lo que necesita un paquete para reproducir el rechazo en el teléfono (formato ANOS):
  -- especie_ids en el orden de las filas de `medias`; float64 little-endian.
  especie_ids            INT[] NOT NULL,
  medias                 BYTEA NOT NULL,   -- especies × 512, media cruda de train (sin normalizar)
  precision              BYTEA NOT NULL,   -- 512 × 512, inversa de la covarianza Ledoit-Wolf
  creado_por             UUID,
  creado                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS osr_calibracion_sub_idx ON dataset.osr_calibracion (subregion_id, id DESC);

-- Contrato con el compilador de releases: (id, subregion_id, tau, validado_por, validado, creado).
CREATE TABLE IF NOT EXISTS dataset.osr_umbral (
  id               SERIAL PRIMARY KEY,
  subregion_id     INT REFERENCES dataset.subregion(id) ON DELETE CASCADE,
  tau              DOUBLE PRECISION NOT NULL,
  validado_por     UUID NULL,
  validado         TIMESTAMPTZ NULL,
  creado           TIMESTAMPTZ DEFAULT NOW(),
  metrica          TEXT NOT NULL DEFAULT 'mahalanobis_min_ledoit_wolf',
  calibracion_id   INT REFERENCES dataset.osr_calibracion(id) ON DELETE SET NULL,
  experimento_id   INT REFERENCES dataset.experimento(id) ON DELETE SET NULL,
  kar_objetivo     DOUBLE PRECISION,
  -- Medidos con este τ en la partición de la calibración (particion_medida).
  kar              DOUBLE PRECISION,
  far              DOUBLE PRECISION,
  auroc            DOUBLE PRECISION,
  validado_nombre  TEXT,
  nota             TEXT
);
CREATE INDEX IF NOT EXISTS osr_umbral_sub_idx ON dataset.osr_umbral (subregion_id, id DESC);

-- Métricas: una evaluación = fotos de la partición test de las especies de un paquete contra
-- sus centroides vigentes (regional propio si lo hay, si no el global), por coseno.
CREATE TABLE IF NOT EXISTS dataset.evaluacion (
  id               SERIAL PRIMARY KEY,
  subregion_id     INT REFERENCES dataset.subregion(id) ON DELETE CASCADE,
  experimento_id   INT NOT NULL REFERENCES dataset.experimento(id) ON DELETE CASCADE,
  version_id       INT REFERENCES dataset.version(id),
  particion        TEXT NOT NULL DEFAULT 'test',
  especies         INT NOT NULL,
  n                INT NOT NULL,
  top1             DOUBLE PRECISION NOT NULL,
  top3             DOUBLE PRECISION NOT NULL,
  creado_por       UUID,
  creado           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS evaluacion_sub_idx ON dataset.evaluacion (subregion_id, id DESC);

-- Una fila por especie verdadera: soporte, aciertos y su fila de la matriz de confusión
-- ({especie_id predicha: fotos}, incluida la diagonal).
CREATE TABLE IF NOT EXISTS dataset.evaluacion_especie (
  evaluacion_id    INT NOT NULL REFERENCES dataset.evaluacion(id) ON DELETE CASCADE,
  especie_id       INT NOT NULL REFERENCES dataset.especie(id),
  soporte          INT NOT NULL,
  top1             INT NOT NULL,
  top3             INT NOT NULL,
  predichas        JSONB NOT NULL,
  PRIMARY KEY (evaluacion_id, especie_id)
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
