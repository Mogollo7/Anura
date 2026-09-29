/**
 * Solo cuentas del panel (auth.panel_accounts, S1). No se decide aquí mirando el JWT: se le
 * pregunta a auth-service con el mismo token, que ya sabe permisos y super usuario.
 * Caché corta para no llamar a auth-service en cada foto de una grilla.
 */
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const TTL_MS = 60_000;
const cache = new Map();

async function panelAccountFor(authorization) {
  const hit = cache.get(authorization);
  if (hit && hit.expira > Date.now()) return hit.account;
  const res = await fetch(`${AUTH_SERVICE_URL}/api/panel/me`, { headers: { Authorization: authorization } });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`auth-service respondió ${res.status}`);
  const { account } = await res.json();
  cache.set(authorization, { account, expira: Date.now() + TTL_MS });
  return account;
}

function requirePanelAction(action) {
  return async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) return res.status(401).json({ message: 'Falta iniciar sesión' });
    try {
      const account = await panelAccountFor(authorization);
      if (!account) return res.status(403).json({ message: 'Esta cuenta no está en el panel administrativo' });
      if (!account.isSuperAdmin && !account.permissions[action]) {
        return res.status(403).json({ message: `Falta el permiso "${action}"` });
      }
      req.panelAccount = account;
      // auth-service ya validó este JWT en /api/panel/me; aquí solo se lee su id para audit.log.
      req.userId = JSON.parse(Buffer.from(authorization.split(' ')[1].split('.')[1], 'base64url').toString()).id;
      next();
    } catch (err) {
      console.error(err);
      res.status(502).json({ message: 'No se pudo verificar la cuenta con auth-service' });
    }
  };
}

module.exports = { requirePanelAction };
