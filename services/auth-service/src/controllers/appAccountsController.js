const repo = require('../repositories/appAccountsRepository');
const auditRepository = require('../repositories/auditRepository');

const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

exports.listUsers = async (req, res) => {
  try {
    res.json({ usuarios: await repo.listUsers() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'No se pudo leer la lista de usuarios' });
  }
};

// PATCH /api/panel/usuarios/:id  { activo: boolean, motivo?: string }
exports.setUserActive = async (req, res) => {
  const { activo } = req.body;
  const motivo = text(req.body.motivo, 500);
  if (typeof activo !== 'boolean') return res.status(400).json({ message: 'Falta "activo" (true o false)' });
  if (!activo && !motivo) return res.status(400).json({ message: 'Escribe el motivo de la suspensión' });
  if (!activo && req.params.id === req.panelAccount.userId) {
    return res.status(400).json({ message: 'No puedes suspender tu propia cuenta' });
  }
  try {
    const user = await repo.setActive(req.params.id, activo, motivo);
    if (!user) return res.status(404).json({ message: 'No existe ese usuario' });
    await auditRepository.log({
      actorId: req.panelAccount.userId,
      action: activo ? 'app_user.reactivate' : 'app_user.suspend',
      targetType: 'app_user',
      targetId: user.id,
      metadata: motivo ? { motivo } : null,
    });
    res.json({ usuario: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'No se pudo cambiar el estado de la cuenta' });
  }
};

exports.listDevices = async (req, res) => {
  try {
    res.json({ dispositivos: await repo.listDevices() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'No se pudo leer la lista de dispositivos' });
  }
};

// PATCH /api/panel/dispositivos/:id  { bloqueado: boolean, motivo?: string }
exports.setDeviceBlocked = async (req, res) => {
  const { bloqueado } = req.body;
  const motivo = text(req.body.motivo, 500);
  if (typeof bloqueado !== 'boolean') return res.status(400).json({ message: 'Falta "bloqueado" (true o false)' });
  if (bloqueado && !motivo) return res.status(400).json({ message: 'Escribe el motivo del bloqueo' });
  try {
    const device = await repo.setBlocked(req.params.id, bloqueado, motivo);
    if (!device) return res.status(404).json({ message: 'No existe ese dispositivo' });
    await auditRepository.log({
      actorId: req.panelAccount.userId,
      action: bloqueado ? 'device.block' : 'device.unblock',
      targetType: 'device',
      targetId: device.id,
      metadata: motivo ? { motivo, usuario: device.user_id } : { usuario: device.user_id },
    });
    res.json({ dispositivo: device });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'No se pudo cambiar el bloqueo del dispositivo' });
  }
};

/**
 * POST /api/auth/dispositivos — lo llama la app en cada arranque con sesión (C4).
 * { device_key, modelo, android, app_version, paquetes: [{ subregion, version }], espacio_libre_mb }
 * Responde si el dispositivo está bloqueado, para que la app deje de sincronizar.
 */
exports.reportDevice = async (req, res) => {
  const deviceKey = text(req.body.device_key, 100);
  if (!deviceKey) return res.status(400).json({ message: 'Falta device_key' });
  const paquetes = Array.isArray(req.body.paquetes)
    ? req.body.paquetes.slice(0, 50).map((p) => ({ subregion: text(p?.subregion, 80), version: text(p?.version, 40) }))
    : [];
  const espacio = Number.isFinite(req.body.espacio_libre_mb) ? Math.max(0, Math.round(req.body.espacio_libre_mb)) : null;
  try {
    const user = await repo.findUser(req.user.id);
    if (!user) return res.status(401).json({ message: 'La sesión ya no es válida' });
    if (!user.is_active) return res.status(403).json({ message: 'Tu cuenta está suspendida', suspendida: true });
    const device = await repo.upsertDevice(user.id, {
      deviceKey,
      modelo: text(req.body.modelo, 120),
      android: text(req.body.android, 40),
      appVersion: text(req.body.app_version, 40),
      paquetes,
      espacioLibreMb: espacio,
    });
    res.json({ id: device.id, bloqueado: device.bloqueado, motivo: device.bloqueo_motivo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'No se pudo registrar el dispositivo' });
  }
};

exports.listAudit = async (_req, res) => {
  try {
    res.json({ entradas: await auditRepository.list() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'No se pudo leer la bitácora' });
  }
};
