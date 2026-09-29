import { create } from 'zustand'
import { apiGet, apiPut } from '../services/api'

// Recortado a lo que la app Android realmente tiene en Apariencia
// (SettingsScreen.kt/AppearanceScreen.kt): tema. Modo de uso, idioma y
// privacidad se eliminaron porque no existen como concepto en Android — ver
// Fase 2 del rediseño web. accessibility_mode sigue vivo porque el backend
// ya lo persiste, aunque el web dejó de exponer un control para él (Android
// tampoco tiene "Alto contraste": tiene "Reducir movimiento"/"Texto grande",
// que no son lo mismo). notify_new_packages / notify_featured_observations
// son preferencias solo-web sin respaldo en Android ni en el backend.

// Temas de la web: claro, oscuro o el del sistema. El modo luz roja de la app
// (salida de campo nocturna) no aplica a la web; si llega guardado desde el
// móvil se trata como oscuro.
const THEMES = ['light', 'dark', 'system']
export const normalizeTheme = (theme) => (THEMES.includes(theme) ? theme : 'dark')

const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme)
}

const applyContrast = (enabled) => {
  document.documentElement.setAttribute('data-high-contrast', enabled)
}

// ── Mappers ──────────────────────────────────────────────────────────────────
// DB / backend  →  frontend store
const mapBackendToFrontend = (backend) => ({
  theme: normalizeTheme(backend?.theme),
  accessibility_mode: backend?.accessibility_mode ?? false,
  preferencesCompleted: true,
})

// frontend store  →  DB / backend
const mapFrontendToBackend = (frontend) => ({
  theme: frontend.theme,
  accessibility_mode: frontend.accessibility_mode ?? false,
})

// ── Default state (mirrors DB defaults in init.sql) ──────────────────────────
// notify_new_packages / notify_featured_observations no existen en el backend
// (init.sql solo tiene theme y accessibility_mode) — son preferencias locales
// nuevas de la sección "Notificaciones" del web, guardadas solo en
// localStorage como accessibility_mode ya hacía antes de sincronizarse.
const DEFAULT_PREFERENCES = {
  theme: 'dark',
  accessibility_mode: false,
  notify_new_packages: true,
  notify_featured_observations: true,
  preferencesCompleted: false,
}

const readBool = (key, fallback) => {
  const v = localStorage.getItem(key)
  return v === null ? fallback : v === 'true'
}

const storedTheme = () => normalizeTheme(localStorage.getItem('anura_theme') || DEFAULT_PREFERENCES.theme)

// El backend no conoce estas dos preferencias (ver DEFAULT_PREFERENCES), así
// que cada vez que se reemplaza `preferences` con lo que devuelve el backend
// hay que releerlas de localStorage aparte para no perderlas.
const readNotifyPrefs = () => ({
  notify_new_packages: readBool('anura_notify_new_packages', DEFAULT_PREFERENCES.notify_new_packages),
  notify_featured_observations: readBool('anura_notify_featured_observations', DEFAULT_PREFERENCES.notify_featured_observations),
})

// Aplicar el tema guardado desde el primer render (antes solo se aplicaba al
// responder el backend, así que un invitado siempre veía el tema del sistema).
applyTheme(storedTheme())
applyContrast(readBool('anura_accessibility_mode', false))

// ── Store ─────────────────────────────────────────────────────────────────────
export const usePreferencesStore = create((set, get) => ({
  preferences: {
    ...DEFAULT_PREFERENCES,
    theme: storedTheme(),
    accessibility_mode: readBool('anura_accessibility_mode', DEFAULT_PREFERENCES.accessibility_mode),
    notify_new_packages: readBool('anura_notify_new_packages', DEFAULT_PREFERENCES.notify_new_packages),
    notify_featured_observations: readBool('anura_notify_featured_observations', DEFAULT_PREFERENCES.notify_featured_observations),
    preferencesCompleted: localStorage.getItem('anura_preferencesCompleted') === 'true',
  },

  // ── Setters ────────────────────────────────────────────────────────────────
  setTheme: (value) => set((state) => {
    const theme = normalizeTheme(value)
    localStorage.setItem('anura_theme', theme)
    applyTheme(theme)
    return { preferences: { ...state.preferences, theme } }
  }),

  setAccessibilityMode: (enabled) => set((state) => {
    localStorage.setItem('anura_accessibility_mode', enabled)
    applyContrast(enabled)
    return { preferences: { ...state.preferences, accessibility_mode: enabled } }
  }),

  // Preferencias de notificaciones — solo locales, no viajan al backend
  // (ver DEFAULT_PREFERENCES). Mismo patrón que accessibility_mode.
  setNotifyNewPackages: (enabled) => set((state) => {
    localStorage.setItem('anura_notify_new_packages', enabled)
    return { preferences: { ...state.preferences, notify_new_packages: enabled } }
  }),

  setNotifyFeaturedObservations: (enabled) => set((state) => {
    localStorage.setItem('anura_notify_featured_observations', enabled)
    return { preferences: { ...state.preferences, notify_featured_observations: enabled } }
  }),

  completePreferences: () => set((state) => {
    localStorage.setItem('anura_preferencesCompleted', 'true')
    return { preferences: { ...state.preferences, preferencesCompleted: true } }
  }),

  // ── Backend sync ───────────────────────────────────────────────────────────
  initializeFromBackend: (backendPreferences) => set(() => {
    const mapped = mapBackendToFrontend(backendPreferences)
    localStorage.setItem('anura_theme', mapped.theme)
    localStorage.setItem('anura_accessibility_mode', mapped.accessibility_mode)
    applyTheme(mapped.theme)
    applyContrast(mapped.accessibility_mode)
    return { preferences: { ...mapped, ...readNotifyPrefs() } }
  }),

  loadPreferences: () => set(() => {
    const theme = storedTheme()
    const accessibility_mode = readBool('anura_accessibility_mode', DEFAULT_PREFERENCES.accessibility_mode)
    applyTheme(theme)
    applyContrast(accessibility_mode)
    const preferencesCompleted = localStorage.getItem('anura_preferencesCompleted') === 'true'
    return {
      preferences: { ...DEFAULT_PREFERENCES, theme, accessibility_mode, preferencesCompleted, ...readNotifyPrefs() },
    }
  }),

  fetchPreferences: async () => {
    const token = localStorage.getItem('anura_token')
    if (!token) return
    try {
      const data = await apiGet('/api/preferences')
      const mapped = mapBackendToFrontend(data)
      set({ preferences: { ...mapped, ...readNotifyPrefs() } })
      localStorage.setItem('anura_theme', mapped.theme)
      localStorage.setItem('anura_accessibility_mode', mapped.accessibility_mode)
      applyTheme(mapped.theme)
      applyContrast(mapped.accessibility_mode)
    } catch (err) {
      console.error('Failed to fetch preferences:', err)
    }
  },

  savePreferences: async () => {
    const token = localStorage.getItem('anura_token')
    if (!token) return
    const { preferences } = get()
    const payload = mapFrontendToBackend(preferences)
    await apiPut('/api/preferences', payload)
  },
}))
