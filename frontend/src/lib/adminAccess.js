import { apiGet } from '../services/api'

/**
 * ¿Esta sesión es también una cuenta del panel administrativo (auth.panel_accounts,
 * D:\server\Anura\admin)? Es una autorización aparte del rol de moderación de
 * auth.users: la valida el propio auth-service en /api/panel/me con el mismo JWT,
 * nunca se decide solo mirando el token en el navegador.
 */
export async function isPanelAccount() {
  try {
    await apiGet('/api/panel/me')
    return true
  } catch {
    return false
  }
}

export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || 'http://localhost:3010'

/** URL que autentica de una vez en el Admin con esta misma sesión. El token va en el
 * fragmento (#token=): el navegador no lo manda al servidor ni queda en sus logs. */
export function adminLoginUrl(token) {
  return `${ADMIN_URL}/login#token=${encodeURIComponent(token)}`
}
