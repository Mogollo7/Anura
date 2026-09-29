const router = require('express').Router();
const pool = require('../config/database');
const requirePanel = require('./panel.middleware');

// Estados que puede fijar una persona desde el Admin. draft/synced los pone la app.
const DECISIONES = new Set(['in_review', 'validated', 'rejected']);

// GET /api/observations/panel — todas las observaciones (incluidas las privadas) para revisión.
router.get('/', requirePanel('revisarFotografias'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.user_id, u.username, u.profile_image, o.thumbnail_key, o.image_key,
             o.status, o.is_private, o.notes, o.place_guess, o.lat, o.lon, o.altitude_m,
             o.recorded_at, o.created_at, o.review_reason, o.reviewed_at,
             COALESCE(p.top_class, o.ai_class) AS ai_class, p.top_probability AS ai_prob,
             o.common_name, o.field_trip_id, ft.place_label AS field_trip_place, ft.started_at AS field_trip_started,
             (SELECT COUNT(*)::int FROM observations.comments c
               WHERE c.observation_id = o.id AND c.stance = 'disagree') AS refutaciones
      FROM observations.observations o
      JOIN auth.users u ON u.id = o.user_id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      LEFT JOIN observations.field_trips ft ON ft.id = o.field_trip_id
      ORDER BY o.created_at DESC
      LIMIT 2000
    `);
    res.json({ observaciones: rows });
  } catch (err) {
    console.error('[panel] listar observaciones:', err.message);
    res.status(500).json({ message: 'No se pudieron leer las observaciones' });
  }
});

// PATCH /api/observations/panel/:id  { estado: 'validated' | 'rejected' | 'in_review', motivo? }
router.patch('/:id', requirePanel('revisarFotografias'), async (req, res) => {
  const { estado } = req.body;
  const motivo = typeof req.body.motivo === 'string' ? req.body.motivo.trim().slice(0, 500) : '';
  if (!DECISIONES.has(estado)) return res.status(400).json({ message: 'Estado inválido' });
  if (estado === 'rejected' && !motivo) {
    return res.status(400).json({ message: 'Escribe por qué se rechaza: la persona que la reportó lo va a leer' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE observations.observations
       SET status = $2, review_reason = $3, reviewed_at = NOW()
       WHERE id = $1
       RETURNING id, status, review_reason, reviewed_at`,
      [req.params.id, estado, motivo || null]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No existe esa observación' });
    }
    await client.query(
      `INSERT INTO audit.log (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, 'observation', $3, $4)`,
      [req.panelAccount.userId || null, `observation.${estado}`, rows[0].id, motivo ? JSON.stringify({ motivo }) : null]
    );
    await client.query('COMMIT');
    res.json({ observacion: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[panel] decisión de observación:', err.message);
    res.status(err.code === '22P02' ? 404 : 500).json({ message: 'No se pudo guardar la decisión' });
  } finally {
    client.release();
  }
});

module.exports = router;
