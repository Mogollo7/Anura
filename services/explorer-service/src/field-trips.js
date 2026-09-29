const jwt = require('jsonwebtoken');
const { coincide, columnasTaxon } = require('./especiePublica');

// Salidas de campo, lado lectura (phase21.sql). Las escribe observation-service.
//
// Privacidad: la misma que las observaciones. Una persona ajena ve una salida solo si tiene al
// menos una observación pública, y dentro de ella solo esas observaciones (con sus recuentos);
// la autora ve todas las suyas, privadas incluidas. Una salida sin observaciones (o solo con
// privadas) no se lista para nadie más: revelaría dónde y cuándo estuvo alguien.

const LUGAR = 'COALESCE(ft.place_label, agg.primer_lugar)';

const SELECT_SALIDA = `
  SELECT ft.id, ft.user_id, u.username, u.profile_image,
         ${LUGAR} AS place_label,
         COALESCE(ft.lat, agg.centro_lat) AS lat, COALESCE(ft.lon, agg.centro_lon) AS lon,
         ft.started_at, ft.ended_at,
         agg.total AS observation_count, agg.especies AS species_count,
         COALESCE(ft.user_id = $1, FALSE) AS is_mine
  FROM observations.field_trips ft
  JOIN auth.users u ON u.id = ft.user_id
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE o.is_private IS NOT TRUE)::int AS publicas,
           COUNT(DISTINCT lower(replace(p.top_class, '_', ' ')))::int AS especies,
           (array_agg(o.place_guess ORDER BY COALESCE(o.recorded_at, o.created_at))
              FILTER (WHERE o.place_guess IS NOT NULL))[1] AS primer_lugar,
           AVG(o.lat) AS centro_lat, AVG(o.lon) AS centro_lon
    FROM observations.observations o
    LEFT JOIN ai.predictions p ON p.observation_id = o.id
    WHERE o.field_trip_id = ft.id AND (o.is_private IS NOT TRUE OR o.user_id = $1)
  ) agg
`;

// La salida es visible si es de quien mira o si tiene alguna observación pública.
const VISIBLE = '(ft.user_id = $1 OR agg.publicas > 0)';

function personaQueMira(req, jwtSecret) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), jwtSecret).id || null;
  } catch {
    return null;
  }
}

function registrarSalidasDeCampo(app, pool, jwtSecret) {
  // GET /api/explorer/field-trips[?username=…] — más recientes primero.
  app.get('/api/explorer/field-trips', async (req, res) => {
    try {
      const viewer = personaQueMira(req, jwtSecret);
      const params = [viewer];
      let filtro = '';
      if (typeof req.query.username === 'string' && req.query.username.trim()) {
        params.push(req.query.username.trim());
        filtro = ` AND LOWER(u.username) = LOWER($${params.length})`;
      }
      const { rows } = await pool.query(
        `${SELECT_SALIDA} WHERE ${VISIBLE}${filtro} ORDER BY ft.started_at DESC LIMIT 100`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error('Error listando salidas de campo:', err.message);
      res.status(500).json({ message: 'No se pudieron leer las salidas de campo' });
    }
  });

  // GET /api/explorer/field-trips/:id — salida y sus observaciones visibles, en orden cronológico.
  app.get('/api/explorer/field-trips/:id', async (req, res) => {
    try {
      const viewer = personaQueMira(req, jwtSecret);
      const salida = await pool.query(`${SELECT_SALIDA} WHERE ft.id = $2 AND ${VISIBLE}`, [viewer, req.params.id]);
      if (salida.rowCount === 0) return res.status(404).json({ message: 'Salida de campo no encontrada' });
      const obs = await pool.query(
        `SELECT o.id, o.image_key, o.thumbnail_key, o.lat, o.lon, o.place_guess, o.is_private,
                o.recorded_at, o.created_at,
                p.top_class AS ai_class, p.top_probability AS ai_prob,
                ${columnasTaxon()}
         FROM observations.observations o
         LEFT JOIN LATERAL (
           SELECT top_class, top_probability FROM ai.predictions
           WHERE observation_id = o.id ORDER BY created_at DESC LIMIT 1
         ) p ON TRUE
         LEFT JOIN dataset.especie_publica ep ON ${coincide('p.top_class')}
         WHERE o.field_trip_id = $2 AND (o.is_private IS NOT TRUE OR o.user_id = $1)
         ORDER BY COALESCE(o.recorded_at, o.created_at)`,
        [viewer, req.params.id]
      );
      res.json({ ...salida.rows[0], observations: obs.rows });
    } catch (err) {
      if (err.code === '22P02') return res.status(404).json({ message: 'Salida de campo no encontrada' });
      console.error('Error leyendo la salida de campo:', err.message);
      res.status(500).json({ message: 'No se pudo leer la salida de campo' });
    }
  });
}

module.exports = { registrarSalidasDeCampo };
