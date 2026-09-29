// Modo "datos de prueba": solo en desarrollo. Cuando está activo, services/api.js
// responde desde mocks/demoApi.js en vez de ir al backend, para revisar cómo se
// ve cada pantalla (normal, textos extremos, vacía, servidor caído) sin
// depender de que los servicios estén levantados.

const STORAGE_KEY = 'anura_demo_mode'
export const DEMO_MEDIA_PREFIX = 'demo-media__'

export const DEMO_SCENARIOS = {
  normal: {
    label: 'Uso normal',
    description: 'Unas 40 observaciones realistas de las 15 especies del catálogo, 6 exploradores, fotos y ubicaciones.',
  },
  stress: {
    label: 'Estrés de diseño',
    description: 'Textos muy largos o sin espacios, especies sin nombre común, sin foto, sin ubicación, notas extensas y 150 observaciones. Sirve para encontrar cortes y desbordes.',
  },
  empty: {
    label: 'Sin datos',
    description: 'Todas las listas vuelven vacías. Sirve para revisar los estados vacíos.',
  },
  error: {
    label: 'Servidor caído',
    description: 'Todas las peticiones fallan con error 500. Sirve para revisar los estados de error.',
  },
}

export const DEMO_SESSIONS = {
  guest: { label: 'Invitado', description: 'Sin sesión: solo lectura, las acciones piden iniciar sesión.' },
  user: { label: 'Explorador demo', description: 'Sesión propia: ves tu perfil, puedes editar y eliminar tus observaciones.' },
  admin: { label: 'Administrador demo', description: 'Como el explorador, más la pestaña Admin.' },
}

export const DEMO_LATENCIES = {
  instant: { label: 'Instantánea', ms: 0, description: 'Respuestas inmediatas.' },
  slow: { label: 'Lenta', ms: 1500, description: '1,5 s por petición, para ver los estados de carga.' },
}

export const DEMO_USERNAME = 'exploradora_demo'
const DEMO_TOKEN_MARK = 'anura-demo'

export function getDemoConfig() {
  if (!import.meta.env.DEV) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const cfg = raw ? JSON.parse(raw) : null
    return cfg?.enabled ? cfg : null
  } catch {
    return null
  }
}

function base64Url(obj) {
  return btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// Token sin firma, solo para que la UI (que decodifica el payload para saber
// "quién soy") se comporte como con sesión. Nunca llega al backend: mientras
// el modo está activo todas las peticiones se responden localmente.
function makeDemoToken(role) {
  return `${base64Url({ alg: 'none', typ: DEMO_TOKEN_MARK })}.${base64Url({ id: 'demo-1', username: DEMO_USERNAME, role, demo: true })}.${DEMO_TOKEN_MARK}`
}

function isDemoToken(token) {
  return typeof token === 'string' && token.endsWith(`.${DEMO_TOKEN_MARK}`)
}

export function enableDemoMode({ scenario, session, latency }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true, scenario, session, latency }))
  const current = localStorage.getItem('anura_token')
  if (session === 'guest') {
    if (isDemoToken(current)) localStorage.removeItem('anura_token')
  } else {
    localStorage.setItem('anura_token', makeDemoToken(session === 'admin' ? 'admin' : 'user'))
    localStorage.setItem('anura_preferencesCompleted', 'true')
  }
}

export function disableDemoMode() {
  localStorage.removeItem(STORAGE_KEY)
  if (isDemoToken(localStorage.getItem('anura_token'))) localStorage.removeItem('anura_token')
}

/** URL local de una imagen de ejemplo (public/*.webp), o null si no es de demo. */
export function demoMediaUrl(filename) {
  if (!import.meta.env.DEV || typeof filename !== 'string') return null
  const name = filename.split('/').pop()
  if (!name.startsWith(DEMO_MEDIA_PREFIX)) return null
  return `/${encodeURIComponent(name.slice(DEMO_MEDIA_PREFIX.length))}`
}
