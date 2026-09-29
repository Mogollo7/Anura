const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

/**
 * Exige una cuenta del panel (auth.panel_accounts) con el permiso pedido. La decide auth-service,
 * dueño de esas cuentas: aquí solo se reenvía el mismo token a /api/panel/me.
 */
module.exports = (action) => async (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).json({ message: 'Inicia sesión en el panel' });
  try {
    const r = await fetch(`${AUTH_SERVICE_URL}/api/panel/me`, {
      headers: { Authorization: req.headers.authorization },
      signal: AbortSignal.timeout(5000),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ message: body.message || 'Sin acceso al panel' });
    const account = body.account;
    if (action && !account.isSuperAdmin && !account.permissions?.[action]) {
      return res.status(403).json({ message: `Falta el permiso "${action}"` });
    }
    req.panelAccount = account;
    next();
  } catch {
    res.status(502).json({ message: 'auth-service no responde' });
  }
};
