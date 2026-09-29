-- Fase 14 — Comentarios reales de observación (app + web), reemplaza el localStorage de la web
-- y el mock de la app. Dueño: observation-service (ya dueño del schema observations).
--
-- Forma elegida porque app y web ya habían convergido, cada uno por su lado, en casi la misma:
-- id, observationId, parentId (hilo de una sola capa), autor, body, postura (agree/neutral/
-- disagree), propuesta de taxón opcional (cuando alguien refuta con otra especie). Ver
-- ObservationCommentModels.kt (app) y store/commentsStore.js (web, antes de esta migración).
CREATE TABLE IF NOT EXISTS observations.comments (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id                  UUID NOT NULL REFERENCES observations.observations(id) ON DELETE CASCADE,
  author_id                       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id                       UUID REFERENCES observations.comments(id) ON DELETE CASCADE,
  body                            TEXT NOT NULL,
  stance                          TEXT NOT NULL DEFAULT 'neutral' CHECK (stance IN ('agree', 'neutral', 'disagree')),
  taxon_proposal_scientific_name  TEXT,
  taxon_proposal_common_name      TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_observation_idx ON observations.comments (observation_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON observations.comments (parent_id);

GRANT SELECT, INSERT ON observations.comments TO observation_service;
