import { create } from 'zustand'
import { apiGet, apiPost, apiDelete } from '../services/api'

// Avisos reales de notification-service (C5) — misma fuente que consume la app
// (DeviceRemote.kt → NotificationsRemote), ver notification-service/src/index.js.

export const useNotificationsStore = create((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,

  fetch: () => {
    apiGet('/api/notifications')
      .then((data) => set({ items: data?.avisos || [], unread: data?.sin_leer || 0, loaded: true }))
      .catch((err) => console.error('No se pudieron cargar los avisos:', err.message))
  },

  markRead: (id) => {
    const current = get().items.find((n) => n.id === id)
    if (!current || current.is_read) return
    set((state) => ({
      items: state.items.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      unread: Math.max(0, state.unread - 1),
    }))
    apiPost(`/api/notifications/${id}/leido`).catch((err) => console.error('No se pudo marcar el aviso como leído:', err.message))
  },

  remove: (id) => {
    const removed = get().items.find((n) => n.id === id)
    if (!removed) return
    set((state) => ({
      items: state.items.filter((n) => n.id !== id),
      unread: removed.is_read ? state.unread : Math.max(0, state.unread - 1),
    }))
    apiDelete(`/api/notifications/${id}`).catch((err) => console.error('No se pudo eliminar el aviso:', err.message))
  },
}))
