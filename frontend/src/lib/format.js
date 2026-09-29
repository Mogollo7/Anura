import { getThumbUrl } from '../services/api'
import { demoMediaUrl } from './demoMode'

/**
 * Resuelve una ruta relativa del backend (ej. profile_image, image_key) a una URL
 * absoluta. Antes duplicado en Explorer.jsx, TaxonDetail.jsx y ObservationDetail.jsx.
 *
 * Ojo: antes armaba `${API_BASE}/uploads/<archivo>.webp` directo — nginx no tiene
 * mapeada esa ruta (cae al fallback de la SPA y devuelve HTML donde se esperaba una
 * imagen). El archivo real vive en MinIO/DB y solo es alcanzable a través de
 * /api/explorer/thumbnail/:size/:filename (mismo servicio que usan los thumbnails).
 */
export function mediaUrl(path) {
  if (!path) return ''
  if (/^(https?:\/\/|data:|blob:)/i.test(path)) return path
  const demo = demoMediaUrl(path)
  if (demo) return demo
  const filename = path.split('/').pop()
  return getThumbUrl(filename, 'original') || ''
}

/**
 * Tiempo relativo en español ("3 días", "ahora"). Antes duplicado en
 * Explorer.jsx, TaxonDetail.jsx y ObservationDetail.jsx.
 */
export function getRelativeTime(dateString) {
  if (!dateString) return ''
  const diff = Date.now() - new Date(dateString).getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `${years} año${years > 1 ? 's' : ''}`
  if (months > 0) return `${months} mes${months > 1 ? 'es' : ''}`
  if (weeks > 0) return `${weeks} semana${weeks > 1 ? 's' : ''}`
  if (days > 0) return `${days} día${days > 1 ? 's' : ''}`
  if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''}`
  if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''}`
  return 'ahora'
}

/**
 * Ruta a la ficha de una especie a partir de su taxon_id + nombre científico.
 * Antes duplicado en Explorer.jsx y ObservationDetail.jsx.
 */
export function getTaxonSlug(taxonId, sciName) {
  if (!sciName || sciName === 'Sin identificar') return null
  const id = taxonId || 0
  const nameSlug = sciName.replace(/\s*\(.*\)\s*$/, '').trim().replace(/\s+/g, '-')
  return `/taxa/${id}-${nameSlug}`
}

/**
 * Compara nombres de especie/clase de forma laxa (usado para emparejar el
 * feed de observaciones con una especie por texto, en vez de por id).
 * Antes duplicado (con el nombre normalizeKey) en TaxonDetail.jsx y
 * TaxonPhotoBrowse.jsx.
 */
/**
 * true si la observación se registró solo con audio (sin foto). Igual que en
 * Android, no es un estado de error: solo cambia el marcador que se muestra
 * donde iría la miniatura.
 */
export function isAudioOnly(obs) {
  return !obs?.thumbnail_key && !obs?.image_key && !!obs?.audio_key
}

/**
 * Probabilidad del modelo (`ai_prob` / `top_probability`, fracción 0–1) como
 * en la app: "87 %". `null`/`undefined`/NaN → null (no inventar número).
 */
export function formatAiProbPercent(prob) {
  if (prob == null || prob === '') return null
  const n = Number(prob)
  if (!Number.isFinite(n)) return null
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n)
  return `${pct} %`
}

export function normalizeKey(value) {
  return String(value || '').trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase()
}
