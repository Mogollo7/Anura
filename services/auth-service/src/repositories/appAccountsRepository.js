const pool = require('../config/database');

/** Cuentas de ANURA Mobile/web vistas desde el Admin (área App), con sus dispositivos. */
exports.listUsers = async () => {
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.email, u.auth_provider, u.role, u.is_active, u.suspension_reason,
           u.is_verified, u.created_at, u.profile_image,
           EXISTS (SELECT 1 FROM auth.panel_accounts pa
                   WHERE pa.user_id = u.id OR lower(pa.email) = lower(u.email)) AS en_panel,
           COUNT(d.id)::int AS dispositivos,
           MAX(d.last_seen) AS ultima_conexion
    FROM auth.users u
    LEFT JOIN auth.user_devices d ON d.user_id = u.id AND d.device_key IS NOT NULL
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  return rows;
};

exports.findUser = async (id) => {
  const { rows } = await pool.query('SELECT id, username, email, is_active FROM auth.users WHERE id = $1', [id]);
  return rows[0] || null;
};

exports.setActive = async (id, active, reason) => {
  const { rows } = await pool.query(
    `UPDATE auth.users SET is_active = $2, suspension_reason = $3, updated_at = NOW()
     WHERE id = $1 RETURNING id, is_active, suspension_reason`,
    [id, active, active ? null : reason]
  );
  return rows[0] || null;
};

exports.listDevices = async () => {
  const { rows } = await pool.query(`
    SELECT d.id, d.user_id, u.username, d.device_name AS modelo, d.os AS android, d.app_version,
           d.paquetes, d.espacio_libre_mb, d.last_seen, d.created_at, d.bloqueado, d.bloqueo_motivo,
           u.is_active AS cuenta_activa
    FROM auth.user_devices d
    JOIN auth.users u ON u.id = d.user_id
    WHERE d.device_key IS NOT NULL
    ORDER BY d.last_seen DESC NULLS LAST
  `);
  return rows;
};

exports.setBlocked = async (id, blocked, reason) => {
  const { rows } = await pool.query(
    `UPDATE auth.user_devices SET bloqueado = $2, bloqueo_motivo = $3
     WHERE id = $1 AND device_key IS NOT NULL RETURNING id, user_id, bloqueado, bloqueo_motivo`,
    [id, blocked, blocked ? reason : null]
  );
  return rows[0] || null;
};

/** Reporte del teléfono en cada arranque: una fila por instalación (user_id, device_key). */
exports.upsertDevice = async (userId, d) => {
  const { rows } = await pool.query(
    `INSERT INTO auth.user_devices
       (user_id, device_key, device_name, device_type, os, app_version, paquetes, espacio_libre_mb, last_seen, last_login)
     VALUES ($1, $2, $3, 'android', $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (user_id, device_key) DO UPDATE SET
       device_name = EXCLUDED.device_name, os = EXCLUDED.os, app_version = EXCLUDED.app_version,
       paquetes = EXCLUDED.paquetes, espacio_libre_mb = EXCLUDED.espacio_libre_mb,
       last_seen = NOW(), last_login = NOW()
     RETURNING id, bloqueado, bloqueo_motivo`,
    [userId, d.deviceKey, d.modelo, d.android, d.appVersion, JSON.stringify(d.paquetes), d.espacioLibreMb]
  );
  return rows[0];
};
