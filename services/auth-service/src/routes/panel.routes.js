const router = require('express').Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requirePanelAccount, requirePanelAction } = require('../middleware/panelMiddleware');
const panelController = require('../controllers/panelController');
const appAccountsController = require('../controllers/appAccountsController');

router.use(authMiddleware, requirePanelAccount);

// GET /api/panel/me
router.get('/me', panelController.getMe);

// GET /api/panel/actividad — series y puntos geográficos reales para Analítica
router.get('/actividad', panelController.getActivitySeries);

// GET /api/panel/accounts — cualquier cuenta del panel puede ver la lista (no editarla)
router.get('/accounts', panelController.listAccounts);

// POST /api/panel/accounts
router.post('/accounts', requirePanelAction('gestionarCuentas'), panelController.createAccount);

// PATCH /api/panel/accounts/:id/permissions
router.patch('/accounts/:id/permissions', requirePanelAction('gestionarCuentas'), panelController.updatePermission);

// DELETE /api/panel/accounts/:id
router.delete('/accounts/:id', requirePanelAction('gestionarCuentas'), panelController.removeAccount);

// Área App del Admin: cuentas de ANURA Mobile/web y sus teléfonos (datos personales →
// solo con "Administrar cuentas").
router.get('/usuarios', requirePanelAction('gestionarCuentas'), appAccountsController.listUsers);
router.patch('/usuarios/:id', requirePanelAction('gestionarCuentas'), appAccountsController.setUserActive);
router.get('/auditoria', appAccountsController.listAudit);
router.get('/dispositivos', requirePanelAction('gestionarCuentas'), appAccountsController.listDevices);
router.patch('/dispositivos/:id', requirePanelAction('gestionarCuentas'), appAccountsController.setDeviceBlocked);

module.exports = router;
