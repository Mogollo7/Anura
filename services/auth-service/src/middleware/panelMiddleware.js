const panelService = require('../services/panelService');

/** req.user ya viene de authMiddleware (JWT). Aquí se exige además ser cuenta del panel. */
async function requirePanelAccount(req, res, next) {
  try {
    const account = await panelService.getMe(req.user);
    if (!account) {
      return res.status(403).json({ message: 'Esta cuenta no está en el panel administrativo' });
    }
    req.panelAccount = account;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error verificando la cuenta del panel' });
  }
}

function requirePanelAction(action) {
  return (req, res, next) => {
    if (!req.panelAccount.isSuperAdmin && !req.panelAccount.permissions[action]) {
      return res.status(403).json({ message: `Falta el permiso "${action}"` });
    }
    next();
  };
}

module.exports = { requirePanelAccount, requirePanelAction };
