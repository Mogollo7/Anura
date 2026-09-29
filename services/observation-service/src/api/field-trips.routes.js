const router = require('express').Router();
const { z } = require('zod');
const pool = require('../config/database');
const authMiddleware = require('./auth.middleware');

// Salidas de campo (phase21.sql). Aquí solo se escribe; la lectura pública la sirve
// explorer-service (GET /api/explorer/field-trips) con la misma regla de privacidad de las
// observaciones. Solo la autora modifica su salida (un administrador puede borrarla).

const fecha = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: 'custom', message: 'Fecha inválida' });
    return z.NEVER;
  }
  return d;
});

const texto = z.string().trim().max(200).transform((v) => v || null);

const cuerpoSalida = z.object({
  clientId: z.string().trim().min(1).max(80),
  placeLabel: texto.nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  startedAt: fecha,
  endedAt: fecha.nullish(),
  observationIds: z.array(z.string().uuid()).max(500).optional(),
});

const cuerpoCambio = z.object({
  placeLabel: texto.nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  endedAt: fecha.nullish(),
  observationIds: z.array(z.string().uuid()).max(500).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'No hay campos para actualizar' });

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalido(res, err) {
  return res.status(400).json({ message: err.issues.map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`).join('; ') });
}

// Vincula a la salida las observaciones que son de la misma persona. Ignora en silencio las
// ajenas o inexistentes: el resultado dice cuántas quedaron vinculadas.
async function vincular(client, tripId, userId, ids) {
  if (!ids || ids.length === 0) return 0;
  const r = await client.query(
    `UPDATE observations.observations SET field_trip_id = $1
     WHERE id = ANY($2::uuid[]) AND user_id = $3`,
    [tripId, ids, userId]
  );
  return r.rowCount;
}

// POST /api/observations/field-trips — crea o actualiza (idempotente por clientId) la salida
// de la persona autenticada y vincula sus observaciones. 201 si la creó, 200 si ya existía.
router.post('/', authMiddleware, async (req, res) => {
  const parsed = cuerpoSalida.safeParse(req.body);
  if (!parsed.success) return invalido(res, parsed.error);
  const b = parsed.data;
  if (b.endedAt && b.endedAt < b.startedAt) {
    return res.status(400).json({ message: 'La salida no puede terminar antes de empezar' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO observations.field_trips (user_id, client_id, place_label, lat, lon, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, client_id) DO UPDATE
         SET place_label = EXCLUDED.place_label, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
             started_at = EXCLUDED.started_at, ended_at = EXCLUDED.ended_at, updated_at = NOW()
       RETURNING id, client_id, place_label, lat, lon, started_at, ended_at, (xmax = 0) AS creada`,
      [req.user.id, b.clientId, b.placeLabel ?? null, b.latitude ?? null, b.longitude ?? null, b.startedAt, b.endedAt ?? null]
    );
    const trip = rows[0];
    const vinculadas = await vincular(client, trip.id, req.user.id, b.observationIds);
    await client.query('COMMIT');
    const { creada, ...salida } = trip;
    res.status(creada ? 201 : 200).json({ ...salida, observaciones_vinculadas: vinculadas });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error guardando la salida de campo:', err.message);
    res.status(500).json({ message: 'No se pudo guardar la salida de campo' });
  } finally {
    client.release();
  }
});

// PATCH /api/observations/field-trips/:id — solo la autora. Campos opcionales; observationIds
// suma observaciones suyas a la salida (nunca quita).
router.patch('/:id', authMiddleware, async (req, res) => {
  if (!uuidRegex.test(req.params.id)) return res.status(400).json({ message: 'ID de salida inválido' });
  const parsed = cuerpoCambio.safeParse(req.body);
  if (!parsed.success) return invalido(res, parsed.error);
  const b = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dueno = await client.query(
      'SELECT user_id, started_at FROM observations.field_trips WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (dueno.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Salida no encontrada' });
    }
    if (dueno.rows[0].user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Solo quien la registró puede modificar esta salida' });
    }
    if (b.endedAt && b.endedAt < dueno.rows[0].started_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La salida no puede terminar antes de empezar' });
    }
    const sets = [];
    const params = [];
    const poner = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (b.placeLabel !== undefined) poner('place_label', b.placeLabel);
    if (b.latitude !== undefined) poner('lat', b.latitude);
    if (b.longitude !== undefined) poner('lon', b.longitude);
    if (b.endedAt !== undefined) poner('ended_at', b.endedAt);
    let salida;
    if (sets.length > 0) {
      params.push(req.params.id);
      const r = await client.query(
        `UPDATE observations.field_trips SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING id, client_id, place_label, lat, lon, started_at, ended_at`,
        params
      );
      salida = r.rows[0];
    } else {
      const r = await client.query(
        'SELECT id, client_id, place_label, lat, lon, started_at, ended_at FROM observations.field_trips WHERE id = $1',
        [req.params.id]
      );
      salida = r.rows[0];
    }
    const vinculadas = await vincular(client, req.params.id, req.user.id, b.observationIds);
    await client.query('COMMIT');
    res.json({ ...salida, observaciones_vinculadas: vinculadas });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error modificando la salida de campo:', err.message);
    res.status(500).json({ message: 'No se pudo modificar la salida de campo' });
  } finally {
    client.release();
  }
});

// DELETE /api/observations/field-trips/:id — la autora o un administrador. Las observaciones
// se conservan (solo pierden el vínculo).
router.delete('/:id', authMiddleware, async (req, res) => {
  if (!uuidRegex.test(req.params.id)) return res.status(400).json({ message: 'ID de salida inválido' });
  try {
    const dueno = await pool.query('SELECT user_id FROM observations.field_trips WHERE id = $1', [req.params.id]);
    if (dueno.rowCount === 0) return res.status(404).json({ message: 'Salida no encontrada' });
    if (dueno.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Solo quien la registró puede eliminar esta salida' });
    }
    await pool.query('DELETE FROM observations.field_trips WHERE id = $1', [req.params.id]);
    res.json({ message: 'Salida eliminada. Sus observaciones se conservan.' });
  } catch (err) {
    console.error('Error eliminando la salida de campo:', err.message);
    res.status(500).json({ message: 'No se pudo eliminar la salida de campo' });
  }
});

module.exports = router;
