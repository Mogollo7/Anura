const pool = require('../config/database');

/** Bitácora real (audit.log, ya creada en phase2.sql): quién hizo qué, a qué. */
exports.log = async ({ actorId, action, targetType, targetId, metadata }) => {
  await pool.query(
    `INSERT INTO audit.log (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId || null, action, targetType, String(targetId), metadata ? JSON.stringify(metadata) : null]
  );
};

/** Lo que el panel muestra en Auditoría. Vacío si todavía nadie escribió en la bitácora. */
exports.list = async (limit = 200) => {
  const { rows } = await pool.query(
    `SELECT l.id, l.action, l.target_type, l.target_id, l.metadata, l.created_at,
            COALESCE(u.username, 'sistema') AS actor
     FROM audit.log l
     LEFT JOIN auth.users u ON u.id = l.actor_id
     ORDER BY l.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
};
