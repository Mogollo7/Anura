// Formato compartido de las salidas de campo (lista y detalle).

export const fmtTripDate = (iso) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

export const fmtTripTime = (iso) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/** "2 h 15 min" entre inicio y fin; '' si la salida no ha terminado. */
export function fmtTripDuration(startedAt, endedAt) {
  if (!endedAt) return ''
  const min = Math.max(0, Math.round((new Date(endedAt) - new Date(startedAt)) / 60000))
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** El lugar corto (primer tramo del nombre) o, sin lugar, la fecha de la salida. */
export function tripTitle(trip) {
  const place = trip.place_label?.split(',').slice(0, 2).join(',').trim()
  return place || `Salida del ${fmtTripDate(trip.started_at)}`
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
