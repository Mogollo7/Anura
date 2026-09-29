/** Una fila en audit.log: quién, qué acción, sobre qué objeto. Único punto de escritura del servicio. */
async function registrar(db, userId, action, targetType, targetId, metadata) {
  await db.query(`INSERT INTO audit.log (actor_id, action, target_type, target_id, metadata)
    VALUES ($1, $2, $3, $4, $5)`, [userId, action, targetType, String(targetId), metadata ?? null]);
}

/** Atajo para un módulo que siempre audita el mismo tipo de objeto. */
const auditorDe = (targetType) => (db, userId, action, targetId, metadata) =>
  registrar(db, userId, action, targetType, targetId, metadata);

module.exports = { registrar, auditorDe };
