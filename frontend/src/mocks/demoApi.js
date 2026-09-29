import { ApiError } from '../services/api'
import { getDemoConfig, DEMO_LATENCIES, DEMO_USERNAME } from '../lib/demoMode'
import { buildDemoDataset } from './demoData'

// Responde las mismas rutas que usan las páginas (ver services/api.js), con
// la misma forma de datos que el backend real. El estado vive en memoria:
// favoritos, seguir, editar o eliminar funcionan hasta recargar la página.

let db = null
let dbScenario = null

function data(scenario) {
  if (!db || dbScenario !== scenario) {
    db = buildDemoDataset(scenario)
    dbScenario = scenario
  }
  return db
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function me(session) {
  return session === 'guest' ? null : db.users[0]
}

function publicUser(u, session) {
  return { ...u, role: u.id === 'demo-1' && session === 'admin' ? 'admin' : u.role }
}

function visibleObservations(viewer, { ownerView = false } = {}) {
  return db.observations.filter((o) => !o.is_private || (ownerView && viewer && o.username === viewer.username))
}

function userStats(username) {
  const obs = db.observations.filter((o) => o.username === username)
  const species = new Set(obs.map((o) => o.scientific_name).filter(Boolean))
  const dates = obs.map((o) => o.created_at).sort()
  return {
    observations: obs.length,
    species: species.size,
    followers: username === DEMO_USERNAME ? 3 : (db.follows.has(username) ? 1 : 0) + (username.length % 4),
    following: username === DEMO_USERNAME ? db.follows.size : username.length % 5,
    joined: db.users.find((u) => u.username === username)?.created_at,
    last_activity: dates[dates.length - 1] || null,
  }
}

function observerRow(u) {
  const obs = db.observations.filter((o) => o.username === u.username && !o.is_private)
  return {
    username: u.username,
    profile_image: u.profile_image,
    created_at: u.created_at,
    obs_count: obs.length,
    species_count: new Set(obs.map((o) => o.scientific_name).filter(Boolean)).size,
  }
}

function speciesRows() {
  return db.species.map((s) => ({
    ...s,
    id: s.taxon_id,
    slug: `${s.taxon_id}-${s.scientific_name.replace(/ /g, '-')}`,
    thumbnail_key: s.photo,
    obs_count: db.observations.filter((o) => o.scientific_name === s.scientific_name && !o.is_private).length,
  }))
}

const matches = (text, q) => String(text || '').toLowerCase().includes(q)

function route(method, path, body, session) {
  const [pathname, qs] = path.split('?')
  const params = new URLSearchParams(qs || '')
  const viewer = me(session)
  const requireAuth = () => { if (!viewer) throw new ApiError('Inicia sesión para continuar', 401, null) }
  let m

  if (method === 'POST' && (pathname === '/api/auth/login' || pathname === '/api/auth/register')) {
    throw new ApiError('Modo datos de prueba activo: elige la sesión desde el asistente de datos de prueba.', 400, null)
  }

  if (pathname === '/api/auth/me') {
    requireAuth()
    return { user: publicUser(viewer, session) }
  }

  if (method === 'PUT' && pathname === '/api/auth/profile') {
    requireAuth()
    if (body instanceof FormData) {
      const username = body.get('username')
      const bio = body.get('biography')
      if (username) viewer.username = String(username)
      if (bio != null) viewer.biography = String(bio)
    }
    return { user: publicUser(viewer, session) }
  }

  if ((m = pathname.match(/^\/api\/auth\/public\/(.+)$/))) {
    const username = decodeURIComponent(m[1])
    const u = db.users.find((x) => x.username === username)
    if (!u) throw new ApiError('Usuario no encontrado', 404, { message: 'Este explorador no existe' })
    return { user: publicUser(u, session), stats: userStats(username) }
  }

  if ((m = pathname.match(/^\/api\/auth\/follow\/(.+?)(\/status)?$/))) {
    const username = decodeURIComponent(m[1])
    if (m[2]) return { following: db.follows.has(username) }
    requireAuth()
    if (db.follows.has(username)) db.follows.delete(username)
    else db.follows.add(username)
    return { following: db.follows.has(username) }
  }

  if (pathname === '/api/preferences') {
    if (method === 'PUT' && typeof body === 'string') db.prefs = JSON.parse(body)
    return db.prefs || {
      theme: localStorage.getItem('anura_theme') || 'dark',
      accessibility_mode: localStorage.getItem('anura_accessibility_mode') === 'true',
    }
  }

  if (pathname === '/api/explorer/stats') {
    const pub = visibleObservations(null)
    return {
      observations: pub.length,
      species: new Set(pub.map((o) => o.scientific_name).filter(Boolean)).size,
      observers: new Set(pub.map((o) => o.username)).size,
    }
  }

  if (pathname === '/api/explorer/feed') {
    const username = params.get('username')
    if (username) {
      const ownerView = viewer?.username === username
      return visibleObservations(viewer, { ownerView }).filter((o) => o.username === username)
    }
    return visibleObservations(null)
  }

  // Salidas de campo: el modo de prueba no las simula; la lista sale vacía para revisar ese estado.
  if (pathname === '/api/explorer/field-trips') return []
  if (pathname.startsWith('/api/explorer/field-trips/')) throw new ApiError('Salida no encontrada', 404, null)

  if (pathname === '/api/explorer/species') return speciesRows()

  if (pathname === '/api/explorer/observers') {
    return db.users.map(observerRow).filter((r) => r.obs_count > 0).sort((a, b) => b.obs_count - a.obs_count)
  }

  if (pathname === '/api/explorer/observers/by-species') {
    const q = (params.get('q') || '').toLowerCase()
    return db.users.map((u) => {
      const row = observerRow(u)
      row.species_obs_count = db.observations.filter((o) => o.username === u.username && !o.is_private
        && (matches(o.scientific_name, q) || matches(o.common_name, q))).length
      return row
    }).filter((r) => r.species_obs_count > 0).sort((a, b) => b.species_obs_count - a.species_obs_count)
  }

  if ((m = pathname.match(/^\/api\/explorer\/observation\/(.+)$/))) {
    const obs = db.observations.find((o) => o.id === decodeURIComponent(m[1]))
    if (!obs) throw new ApiError('No encontrada', 404, null)
    if (obs.is_private && obs.username !== viewer?.username) throw new ApiError('Privada', 403, null)
    return { ...obs, user_obs_count: db.observations.filter((o) => o.username === obs.username).length }
  }

  if ((m = pathname.match(/^\/api\/explorer\/favorites\/feed\/user\/(.+)$/))) {
    const username = decodeURIComponent(m[1])
    if (username !== DEMO_USERNAME) return []
    return db.observations.filter((o) => db.favorites.has(o.id))
  }

  if (pathname === '/api/explorer/favorites') {
    requireAuth()
    return [...db.favorites]
  }

  if ((m = pathname.match(/^\/api\/explorer\/favorites\/(.+)$/)) && method === 'POST') {
    requireAuth()
    const id = decodeURIComponent(m[1])
    if (db.favorites.has(id)) db.favorites.delete(id)
    else db.favorites.add(id)
    return { liked: db.favorites.has(id) }
  }

  if (pathname === '/api/explorer/search' || pathname === '/api/explorer/suggest') {
    const q = (params.get('q') || '').toLowerCase().trim()
    const taxa = speciesRows().filter((s) => matches(s.scientific_name, q) || matches(s.common_name, q) || matches(s.family, q) || matches(s.genus, q))
    const users = db.users.filter((u) => matches(u.username, q)).map(observerRow)
    if (pathname.endsWith('/search')) return { taxa, users }
    return [
      ...taxa.slice(0, 6).map((t) => ({ type: 'taxon', ...t })),
      ...users.slice(0, 3).map((u) => ({ type: 'user', ...u })),
    ]
  }

  if ((m = pathname.match(/^\/api\/observations\/(.+)$/))) {
    requireAuth()
    const id = decodeURIComponent(m[1])
    const idx = db.observations.findIndex((o) => o.id === id && o.username === viewer.username)
    if (idx === -1) throw new ApiError('No puedes modificar esta observación', 403, null)
    if (method === 'DELETE') {
      db.observations.splice(idx, 1)
      return {}
    }
    if (method === 'PUT') {
      const patch = typeof body === 'string' ? JSON.parse(body) : {}
      db.observations[idx] = { ...db.observations[idx], ...patch }
      return db.observations[idx]
    }
  }

  throw new ApiError(`Ruta sin simular en modo datos de prueba: ${method} ${pathname}`, 404, null)
}

export async function handleDemoRequest(path, { method = 'GET', body } = {}) {
  const cfg = getDemoConfig()
  await sleep(DEMO_LATENCIES[cfg.latency]?.ms ?? 0)
  if (cfg.scenario === 'error') {
    throw new ApiError('Error 500 (simulado: servidor caído)', 500, null)
  }
  data(cfg.scenario)
  // Copia profunda: las páginas no deben poder mutar la "base de datos".
  return structuredClone(route(method, path, body, cfg.session))
}
