import { create } from 'zustand'

const API_BASE = import.meta.env.VITE_API_URL || ''

// ── Mappers ──────────────────────────────────────────────────────────────────
// DB / backend  →  frontend store
const mapBackendToFrontend = (backend) => ({
  theme: backend.theme || 'dark',
  mode: backend.interface_mode || 'standard',
  language: backend.language || 'es',
  accessibility_mode: backend.accessibility_mode ?? false,
  notifications_enabled: backend.notifications_enabled ?? true,
  email_notifications: backend.email_notifications ?? true,
  push_notifications: backend.push_notifications ?? true,
  exact_location_enabled: backend.exact_location_enabled ?? false,
  public_profile: backend.public_profile ?? true,
  preferencesCompleted: backend.preferences_completed ?? false,
})

// frontend store  →  DB / backend
const mapFrontendToBackend = (frontend) => ({
  theme: frontend.theme,
  interface_mode: frontend.mode,
  accessibility_mode: frontend.accessibility_mode ?? false,
  language: frontend.language,
  notifications_enabled: frontend.notifications_enabled,
  email_notifications: frontend.email_notifications,
  push_notifications: frontend.push_notifications,
  exact_location_enabled: frontend.exact_location_enabled,
  public_profile: frontend.public_profile,
  preferences_completed: frontend.preferencesCompleted,
})

// ── Default state (mirrors DB defaults in init.sql) ──────────────────────────
const DEFAULT_PREFERENCES = {
  theme: 'dark',
  mode: 'standard',
  language: 'es',
  accessibility_mode: false,
  notifications_enabled: true,
  email_notifications: true,
  push_notifications: true,
  exact_location_enabled: false,
  public_profile: true,
  preferencesCompleted: false,
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const usePreferencesStore = create((set, get) => ({
  preferences: {
    ...DEFAULT_PREFERENCES,
    theme: localStorage.getItem('anura_theme') || DEFAULT_PREFERENCES.theme,
    mode: localStorage.getItem('anura_mode') || DEFAULT_PREFERENCES.mode,
    language: localStorage.getItem('anura_language') || DEFAULT_PREFERENCES.language,
    accessibility_mode: localStorage.getItem('anura_accessibility_mode') === 'true',
    preferencesCompleted: localStorage.getItem('anura_preferencesCompleted') === 'true',
    isGuest: localStorage.getItem('anura_guest') === 'true',
  },

  // ── Setters ────────────────────────────────────────────────────────────────
  updateAllPreferences: (newPrefs) => set((state) => {
    const updated = { ...state.preferences, ...newPrefs }
    
    // Save UI affecting variables to localStorage
    localStorage.setItem('anura_theme', updated.theme)
    localStorage.setItem('anura_mode', updated.mode)
    localStorage.setItem('anura_language', updated.language)
    localStorage.setItem('anura_accessibility_mode', updated.accessibility_mode)
    
    // Update DOM
    document.documentElement.setAttribute('data-theme', updated.theme)
    document.documentElement.setAttribute('lang', updated.language)
    document.documentElement.setAttribute('data-high-contrast', updated.accessibility_mode)
    
    return { preferences: updated }
  }),

  completePreferences: () => set((state) => {
    localStorage.setItem('anura_preferencesCompleted', 'true')
    return { preferences: { ...state.preferences, preferencesCompleted: true } }
  }),

  // ── Backend sync ───────────────────────────────────────────────────────────
  initializeFromBackend: (backendPreferences) => set(() => {
    const mapped = mapBackendToFrontend(backendPreferences)
    localStorage.setItem('anura_theme', mapped.theme)
    localStorage.setItem('anura_mode', mapped.mode)
    localStorage.setItem('anura_language', mapped.language)
    localStorage.setItem('anura_accessibility_mode', mapped.accessibility_mode)
    localStorage.setItem('anura_preferencesCompleted', mapped.preferencesCompleted)
    document.documentElement.setAttribute('data-theme', mapped.theme)
    document.documentElement.setAttribute('lang', mapped.language)
    document.documentElement.setAttribute('data-high-contrast', mapped.accessibility_mode)
    return { preferences: { ...mapped, isGuest: false } }
  }),

  loadPreferences: () => set(() => {
    const theme = localStorage.getItem('anura_theme') || DEFAULT_PREFERENCES.theme
    const mode = localStorage.getItem('anura_mode') || DEFAULT_PREFERENCES.mode
    const language = localStorage.getItem('anura_language') || DEFAULT_PREFERENCES.language
    const accessibility_mode = localStorage.getItem('anura_accessibility_mode') === 'true'
    const preferencesCompleted = localStorage.getItem('anura_preferencesCompleted') === 'true'
    const isGuest = localStorage.getItem('anura_guest') === 'true'
    return {
      preferences: {
        ...DEFAULT_PREFERENCES,
        theme, mode, language, accessibility_mode, preferencesCompleted, isGuest
      }
    }
  }),

  fetchPreferences: async () => {
    const token = localStorage.getItem('anura_token')
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        const mapped = mapBackendToFrontend(data)
        set({ preferences: mapped })
        // persist to localStorage
        localStorage.setItem('anura_theme', mapped.theme)
        localStorage.setItem('anura_mode', mapped.mode)
        localStorage.setItem('anura_language', mapped.language)
        localStorage.setItem('anura_accessibility_mode', mapped.accessibility_mode)
        document.documentElement.setAttribute('data-theme', mapped.theme)
        document.documentElement.setAttribute('lang', mapped.language)
        document.documentElement.setAttribute('data-high-contrast', mapped.accessibility_mode)
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err)
    }
  },

  savePreferences: async () => {
    const token = localStorage.getItem('anura_token')
    if (!token) return
    const { preferences } = get()
    const payload = mapFrontendToBackend(preferences)
    try {
      const res = await fetch(`${API_BASE}/api/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Failed to save preferences: ${res.status} ${errorText}`)
      }
    } catch (err) {
      console.error('Failed to save preferences:', err)
    }
  },
}))
