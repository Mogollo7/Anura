import { create } from 'zustand'
import { apiGet, apiPost } from '../services/api'

// Comentarios reales de observation-service (fase 14) — antes vivían enteramente en el
// cliente (localStorage + comentarios semilla inventados, ver historial de este archivo).
// Mismo contrato de hilos/postura/propuesta de taxón que ya usa la app
// (ObservationCommentsSheet.kt): de acuerdo/neutral/en desacuerdo nunca se elige a mano,
// "en desacuerdo" solo sale de traer una propuesta de taxón.

function toThread(rows) {
  const byParent = {}
  rows.forEach((r) => {
    const key = r.parent_id || '__root__'
    if (!byParent[key]) byParent[key] = []
    byParent[key].push(r)
  })
  const toUi = (row) => ({
    id: row.id,
    observationId: row.observation_id,
    parentId: row.parent_id,
    username: row.author_username,
    body: row.body,
    stance: row.stance,
    taxonProposal: row.taxon_proposal_scientific_name
      ? { scientificName: row.taxon_proposal_scientific_name, commonName: row.taxon_proposal_common_name }
      : null,
    createdAt: row.created_at,
    replies: (byParent[row.id] || []).map(toUi),
  })
  return (byParent.__root__ || []).map(toUi)
}

async function fetchThread(observationId) {
  const rows = await apiGet(`/api/observations/${observationId}/comments`, { auth: false })
  return toThread(rows || [])
}

export const useCommentsStore = create((set, get) => ({
  byObservation: {},
  loadedIds: new Set(),

  commentsFor: (observationId) => get().byObservation[observationId] || [],

  // Nombre conservado (antes generaba comentarios de prueba) para no tocar
  // CommentsSection.jsx: ahora trae los comentarios reales una vez por observación.
  ensureSeeded: (observationId) => {
    if (!observationId || get().loadedIds.has(observationId)) return
    set((state) => ({ loadedIds: new Set(state.loadedIds).add(observationId) }))
    fetchThread(observationId)
      .then((thread) => set((state) => ({ byObservation: { ...state.byObservation, [observationId]: thread } })))
      .catch((err) => console.error('No se pudieron cargar los comentarios:', err.message))
  },

  addComment: (observationId, { body, username, parentId = null, taxonProposal = null }) => {
    const stance = taxonProposal ? 'disagree' : 'neutral'
    const optimistic = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      observationId,
      parentId,
      username: username || '',
      body,
      stance,
      taxonProposal,
      createdAt: new Date().toISOString(),
      replies: [],
    }
    set((state) => {
      const list = state.byObservation[observationId] || []
      const next = parentId
        ? list.map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, optimistic] } : c))
        : [...list, optimistic]
      return { byObservation: { ...state.byObservation, [observationId]: next } }
    })
    apiPost(`/api/observations/${observationId}/comments`, { body, stance, parentId, taxonProposal })
      .then(() => fetchThread(observationId))
      .then((thread) => set((state) => ({ byObservation: { ...state.byObservation, [observationId]: thread } })))
      .catch((err) => console.error('No se pudo publicar el comentario:', err.message))
  },

  hasExpertReview: (observationId) => {
    const list = get().byObservation[observationId] || []
    return list.some((c) => c.taxonProposal || c.replies.some((r) => r.taxonProposal))
  },
}))
