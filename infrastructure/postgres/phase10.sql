-- Fase 10 — M3: radio Weibull, cascada de tres capas y sugerencias de clúster (ArcFace).
-- La gaussiana de altitud y el centroide regional no se guardan: no hay altitud en las
-- observaciones ni polígono de subregión. Inventarlos sería otro dato fijo.

ALTER TABLE dataset.centroide
  ADD COLUMN IF NOT EXISTS weibull_beta DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS weibull_eta  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS radio         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tau           DOUBLE PRECISION;

ALTER TABLE dataset.supercentroide
  ADD COLUMN IF NOT EXISTS weibull_beta DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS weibull_eta  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tau          DOUBLE PRECISION;

ALTER TABLE dataset.experimento
  ADD COLUMN IF NOT EXISTS evaluacion JSONB;

-- El sistema señala pares que se confunden. No es un clúster del herpetólogo:
-- acc_antes / acc_despues es ArcFace medido en validación, para decidir si vale armarlo.
CREATE TABLE IF NOT EXISTS dataset.cluster_sugerido (
  experimento_id  INT NOT NULL REFERENCES dataset.experimento(id) ON DELETE CASCADE,
  especie_a       INT NOT NULL REFERENCES dataset.especie(id),
  especie_b       INT NOT NULL REFERENCES dataset.especie(id),
  coseno          DOUBLE PRECISION NOT NULL,
  n_val           INT NOT NULL,
  confusiones     INT NOT NULL,
  acc_antes       DOUBLE PRECISION,
  acc_despues     DOUBLE PRECISION,
  PRIMARY KEY (experimento_id, especie_a, especie_b)
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA dataset TO dataset_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dataset TO dataset_service;
