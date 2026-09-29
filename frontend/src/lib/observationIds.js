/**
 * Clave estable para UUIDs de observación (Set, rutas API, comparación con el feed).
 */
export function obsIdKey(id) {
  if (id == null || id === '') return '';
  return String(id).trim();
}

function decodeTokenPayload(token) {
  if (!token || token === 'null' || token === 'undefined') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 += '='.repeat(pad);
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/**
 * id del usuario en el JWT (mismo secreto que usa explorer-service para favoritos).
 */
export function currentUserIdFromToken() {
  const token = localStorage.getItem('anura_token');
  const payload = decodeTokenPayload(token);
  return payload?.id != null ? String(payload.id) : null;
}

/**
 * role del usuario en el JWT (auth-service ya lo incluye en el payload).
 * Usado solo para mostrar/ocultar UI (p.ej. el tab de Admin); cualquier
 * endpoint admin real debe validar el rol en el servidor, no confiar en esto.
 */
export function currentUserRoleFromToken() {
  const token = localStorage.getItem('anura_token');
  const payload = decodeTokenPayload(token);
  return payload?.role || null;
}
