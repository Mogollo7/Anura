/**
 * Clave estable para UUIDs de observación (Set, rutas API, comparación con el feed).
 */
export function obsIdKey(id) {
  if (id == null || id === '') return '';
  return String(id).trim();
}

/**
 * id del usuario en el JWT (mismo secreto que usa explorer-service para favoritos).
 */
export function currentUserIdFromToken() {
  const token = localStorage.getItem('anura_token');
  if (!token || token === 'null' || token === 'undefined') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 += '='.repeat(pad);
    const payload = JSON.parse(atob(b64));
    return payload.id != null ? String(payload.id) : null;
  } catch {
    return null;
  }
}
