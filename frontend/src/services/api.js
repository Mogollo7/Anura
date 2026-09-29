// Capa de API compartida. Antes cada página repetía su propio
// `API_BASE`/`fetch`/helpers de URL de imagen; esto centraliza esas 13 copias.

export const API_BASE = import.meta.env.VITE_API_URL || ''

class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function authHeaders() {
  const token = localStorage.getItem('anura_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * fetch envuelto con manejo de error consistente. Lanza ApiError en
 * respuestas no-ok en vez de dejar que cada página decida (algunas hacían
 * catch silencioso, otras alert(), otras console.error suelto).
 */
export async function apiFetch(path, { auth = true, headers, body, ...opts } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    body,
    headers: {
      ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? authHeaders() : {}),
      ...headers,
    },
  })

  // Body puede venir vacío (204/DELETE) o, mientras el backend no exista
  // todavía (Fase 2 del plan), como el index.html de fallback del dev
  // server — nunca lo tratamos como éxito silencioso con data=null.
  const raw = await res.text()
  let data = null
  let parseError = false
  if (raw) {
    try { data = JSON.parse(raw) } catch { parseError = true }
  }

  if (!res.ok) {
    throw new ApiError(data?.message || `Error ${res.status}`, res.status, data)
  }
  if (parseError) {
    throw new ApiError('Respuesta no válida del servidor (¿el backend está corriendo?)', res.status, null)
  }
  return data
}

export const apiGet = (path, opts) => apiFetch(path, { ...opts, method: 'GET' })
export const apiPost = (path, body, opts) =>
  apiFetch(path, { ...opts, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) })
export const apiPut = (path, body, opts) =>
  apiFetch(path, { ...opts, method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) })
export const apiDelete = (path, opts) => apiFetch(path, { ...opts, method: 'DELETE' })

// ── URLs de imagen ──────────────────────────────────────────────────────
// Unifica getImageUrl/mediaUrl/tunnelThumb/getFullImageUrl/getThumbUrl,
// que existían duplicados (con pequeñas variaciones) en Explorer.jsx,
// ObservationDetail.jsx, TaxonDetail.jsx y Search.jsx.
export function getThumbUrl(filename, size = 'md') {
  if (!filename) return null
  if (/^https?:\/\//.test(filename)) return filename
  return `${API_BASE}/api/explorer/thumbnail/${size}/${encodeURIComponent(filename)}`
}

export function getFullImageUrl(filename) {
  if (!filename) return null
  if (/^https?:\/\//.test(filename)) return filename
  return `${API_BASE}/api/explorer/thumbnail/original/${encodeURIComponent(filename)}`
}

export { ApiError }
