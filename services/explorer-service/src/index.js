const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'anura_secret';

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'explorer-service' }));

// Feed (Latest observations)
app.get('/api/explorer/feed', async (req, res) => {
  const { username } = req.query;
  try {
    const header = req.headers.authorization;
    let loggedInUsername = null;
    if (header && header.startsWith('Bearer ')) {
      try {
        const token = header.slice(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        loggedInUsername = decoded.username;
      } catch (err) {}
    }

    let query = `
      SELECT o.id, o.image_key, o.thumbnail_key, o.lat, o.lon, o.place_guess, o.notes, o.is_private, o.created_at,
             u.username, u.profile_image,
             p.top_class as ai_class, p.top_probability as ai_prob,
             t.id as taxon_id, t.class_name, t.order_name, t.family, t.genus, t.species, t.common_name
      FROM observations.observations o
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      LEFT JOIN species.taxonomy t ON p.top_class = CONCAT(t.genus, ' ', t.species) OR p.top_class = t.species
    `;
    const params = [];
    if (username) {
      if (loggedInUsername && loggedInUsername.toLowerCase() === username.toLowerCase()) {
        query += ` WHERE u.username = $1`;
      } else {
        query += ` WHERE u.username = $1 AND (o.is_private = FALSE OR o.is_private IS NOT TRUE)`;
      }
      params.push(username);
    } else {
      query += ` WHERE (o.is_private = FALSE OR o.is_private IS NOT TRUE)`;
    }
    query += ` ORDER BY o.created_at DESC LIMIT 100`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching feed:', err);
    res.status(500).json({ message: 'Error fetching observations' });
  }
});

// ── Favorites ────────────────────────────────────────────────────────
// jwt and JWT_SECRET are defined at the top of the file

// Ensure favorites table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS observations.favorites (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    observation_id UUID NOT NULL REFERENCES observations.observations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, observation_id)
  )
`).catch(e => console.error('[favorites] table init error:', e.message));

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No autorizado' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido' });
  }
}

// GET /api/explorer/favorites — get IDs liked by the current user
app.get('/api/explorer/favorites', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT observation_id FROM observations.favorites WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows.map(r => r.observation_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/explorer/favorites/feed/user/:username — public favorites of a specific user
app.get('/api/explorer/favorites/feed/user/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const query = `
      SELECT o.id, o.image_key, o.thumbnail_key, o.lat, o.lon, o.place_guess, o.notes, o.created_at,
             u.username, u.profile_image,
             p.top_class as ai_class, p.top_probability as ai_prob,
             t.class_name, t.order_name, t.family, t.genus, t.species, t.common_name
      FROM auth.users profile_user
      JOIN observations.favorites f ON profile_user.id = f.user_id
      JOIN observations.observations o ON f.observation_id = o.id
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      LEFT JOIN species.taxonomy t ON p.top_class = CONCAT(t.genus, ' ', t.species) OR p.top_class = t.species
      WHERE profile_user.username = $1
      ORDER BY f.created_at DESC
    `;
    const result = await pool.query(query, [username]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/explorer/favorites/feed — current logged in user favorites
app.get('/api/explorer/favorites/feed', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT o.id, o.image_key, o.thumbnail_key, o.lat, o.lon, o.place_guess, o.notes, o.created_at,
             u.username, u.profile_image,
             p.top_class as ai_class, p.top_probability as ai_prob,
             t.class_name, t.order_name, t.family, t.genus, t.species, t.common_name
      FROM observations.favorites f
      JOIN observations.observations o ON f.observation_id = o.id
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      LEFT JOIN species.taxonomy t ON p.top_class = CONCAT(t.genus, ' ', t.species) OR p.top_class = t.species
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
    `;
    const result = await pool.query(query, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/explorer/favorites/:id — toggle like
app.post('/api/explorer/favorites/:id', authMiddleware, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'Falta id de observación' });
  }
  try {
    const existing = await pool.query(
      'SELECT id FROM observations.favorites WHERE user_id = $1 AND observation_id = $2',
      [req.user.id, id]
    );
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM observations.favorites WHERE user_id = $1 AND observation_id = $2', [req.user.id, id]);
      res.json({ liked: false });
    } else {
      await pool.query('INSERT INTO observations.favorites (user_id, observation_id) VALUES ($1, $2)', [req.user.id, id]);
      res.json({ liked: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// GET /api/explorer/stats
app.get('/api/explorer/stats', async (req, res) => {
  try {
    const obsCount = await pool.query('SELECT COUNT(*) FROM observations.observations');
    const speciesCount = await pool.query('SELECT COUNT(DISTINCT top_class) FROM ai.predictions');
    const userCount = await pool.query('SELECT COUNT(DISTINCT user_id) FROM observations.observations');
    
    res.json({
      observations: parseInt(obsCount.rows[0].count),
      species: parseInt(speciesCount.rows[0].count),
      identifiers: parseInt(userCount.rows[0].count), // Simplified for now
      observers: parseInt(userCount.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/explorer/species
app.get('/api/explorer/species', async (req, res) => {
  try {
    const query = `
      WITH SpeciesStats AS (
        SELECT 
          p.top_class as scientific_name,
          COUNT(*) as obs_count,
          MAX(o.created_at) as last_obs
        FROM ai.predictions p
        JOIN observations.observations o ON p.observation_id = o.id
        GROUP BY p.top_class
      )
      SELECT 
        s.*,
        o.thumbnail_key,
        t.common_name,
        t.id as taxon_id
      FROM SpeciesStats s
      JOIN observations.observations o ON s.last_obs = o.created_at
      LEFT JOIN species.taxonomy t ON s.scientific_name = CONCAT(t.genus, ' ', t.species) OR s.scientific_name = t.species
      ORDER BY s.obs_count DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/explorer/observers
app.get('/api/explorer/observers', async (req, res) => {
  try {
    const query = `
      SELECT 
        u.username,
        u.profile_image,
        COUNT(o.id) as obs_count,
        COUNT(DISTINCT p.top_class) as species_count
      FROM auth.users u
      JOIN observations.observations o ON u.id = o.user_id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      GROUP BY u.id, u.username, u.profile_image
      ORDER BY obs_count DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single observation details
app.get('/api/explorer/observation/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const header = req.headers.authorization;
    let loggedInUserId = null;
    if (header && header.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(header.slice(7), JWT_SECRET);
        loggedInUserId = decoded.id;
      } catch (err) {}
    }

    const query = `
      SELECT o.id, o.image_key, o.thumbnail_key, o.lat, o.lon, o.place_guess, o.altitude_m, o.notes, o.is_private, o.created_at,
             u.username, u.profile_image, o.user_id,
             (SELECT COUNT(*) FROM observations.observations WHERE user_id = u.id)::int as user_obs_count,
             p.top_class as ai_class, p.top_probability as ai_prob,
             t.id as taxon_id,
             COALESCE(t.class_name, CASE WHEN p.top_class ~* 'achatinus' THEN 'Amphibia' ELSE NULL END) as class_name,
             COALESCE(t.order_name, CASE WHEN p.top_class ~* 'achatinus' THEN 'Anura' ELSE NULL END) as order_name,
             COALESCE(t.family, CASE WHEN p.top_class ~* 'achatinus' THEN 'Craugastoridae' ELSE NULL END) as family,
             COALESCE(t.genus, CASE WHEN p.top_class ~* 'achatinus' THEN 'Pristimantis' ELSE NULL END) as genus,
             COALESCE(t.species, CASE WHEN p.top_class ~* 'achatinus' THEN 'achatinus' ELSE NULL END) as species,
             COALESCE(t.common_name, CASE WHEN p.top_class ~* 'achatinus' THEN 'Pristimantis achatinus' ELSE NULL END) as common_name
      FROM observations.observations o
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      LEFT JOIN species.taxonomy t ON REPLACE(p.top_class, '_', ' ') = CONCAT(t.genus, ' ', t.species) 
                                   OR p.top_class = t.species
                                   OR p.top_class = CONCAT(t.genus, ' ', t.species)
      WHERE o.id = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Observación no encontrada' });
    }

    let row = result.rows[0];
    if (row.is_private && row.user_id !== loggedInUserId) {
      return res.status(403).json({ message: 'Esta observación es privada' });
    }
    const needsAlt =
      (row.altitude_m === null || row.altitude_m === undefined) &&
      row.lat != null &&
      row.lon != null;
    // Backfill Altitude
    if (needsAlt) {
      const geoBase = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';
      try {
        const { data: geo } = await axios.get(`${geoBase}/api/geo/altitude`, {
          params: { lat: row.lat, lon: row.lon },
          timeout: 20000,
        });
        if (geo.altitude_m != null && !Number.isNaN(Number(geo.altitude_m))) {
          const alt = Number(geo.altitude_m);
          await pool.query(
            'UPDATE observations.observations SET altitude_m = $1 WHERE id = $2',
            [alt, id]
          );
          row = { ...row, altitude_m: alt };
        }
      } catch (e) {
        console.warn('[explorer] altitude backfill:', e.message);
      }
    }

    // Backfill Place Guess (Reverse Geocoding)
    if (!row.place_guess && row.lat != null && row.lon != null) {
      const geoBase = process.env.GEO_SERVICE_URL || 'http://geo-service:3003';
      try {
        const { data: geo } = await axios.get(`${geoBase}/api/geo/geocoding/reverse`, {
          params: { lat: row.lat, lon: row.lon },
          timeout: 20000,
        });
        if (geo.display_name) {
          await pool.query(
            'UPDATE observations.observations SET place_guess = $1 WHERE id = $2',
            [geo.display_name, id]
          );
          row = { ...row, place_guess: geo.display_name };
        }
      } catch (e) {
        console.warn('[explorer] reverse geocoding backfill:', e.message);
      }
    }

    res.json(row);
  } catch (err) {
    console.error('Error fetching observation:', err);
    res.status(500).json({ message: 'Error fetching observation details' });
  }
});

// ── Global Search: Suggest (for TopBar autocomplete) ─────────────────────
// GET /api/explorer/suggest?q=query  — returns taxa and users suggestions (partial match)
app.get('/api/explorer/suggest', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const taxaResult = await pool.query(
      `SELECT id, genus, species, common_name, family, order_name
       FROM species.taxonomy
       WHERE common_name ILIKE $1
          OR CONCAT(genus, ' ', species) ILIKE $1
          OR genus ILIKE $1
          OR family ILIKE $1
          OR species ILIKE $1
       ORDER BY
         CASE WHEN LOWER(CONCAT(genus, ' ', species)) = LOWER($2) THEN 0
              WHEN CONCAT(genus, ' ', species) ILIKE $3 THEN 1
              ELSE 2 END,
         genus, species
       LIMIT 6`,
      [`%${q}%`, q, `${q}%`]
    );
    
    const usersResult = await pool.query(
      `SELECT username, profile_image
       FROM auth.users
       WHERE username ILIKE $1
       ORDER BY
         CASE WHEN LOWER(username) = LOWER($2) THEN 0 ELSE 1 END,
         username
       LIMIT 4`,
      [`%${q}%`, q]
    );

    const suggestions = [
      ...taxaResult.rows.map(r => ({
        type: 'taxon',
        id: r.id,
        scientific_name: `${r.genus} ${r.species}`,
        common_name: r.common_name,
        family: r.family,
        order_name: r.order_name,
        slug: `${r.id}-${r.genus}-${r.species}`.replace(/\s+/g, '-')
      })),
      ...usersResult.rows.map(r => ({
        type: 'user',
        username: r.username,
        profile_image: r.profile_image
      }))
    ];

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Global Search: Full results (for /search page) ────────────────────────
// GET /api/explorer/search?q=query  — returns { taxa: [...], users: [...] }
app.get('/api/explorer/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ taxa: [], users: [] });
  try {
    // Taxones: partial match
    const taxaResult = await pool.query(
      `SELECT t.id, t.genus, t.species, t.common_name, t.family, t.order_name, t.class_name,
              (SELECT o.thumbnail_key FROM observations.observations o
               JOIN ai.predictions p ON p.observation_id = o.id
               WHERE REPLACE(p.top_class, '_', ' ') = CONCAT(t.genus, ' ', t.species)
                  OR p.top_class = CONCAT(t.genus, ' ', t.species)
               ORDER BY o.created_at DESC LIMIT 1) as thumbnail_key,
              COUNT(DISTINCT obs.id) as obs_count
       FROM species.taxonomy t
       LEFT JOIN ai.predictions pred ON REPLACE(pred.top_class,'_',' ') = CONCAT(t.genus,' ',t.species)
                                     OR pred.top_class = CONCAT(t.genus,' ',t.species)
       LEFT JOIN observations.observations obs ON obs.id = pred.observation_id
       WHERE t.common_name ILIKE $1
          OR CONCAT(t.genus, ' ', t.species) ILIKE $1
          OR t.genus ILIKE $1
          OR t.family ILIKE $1
          OR t.species ILIKE $1
       GROUP BY t.id, t.genus, t.species, t.common_name, t.family, t.order_name, t.class_name
       ORDER BY
         CASE WHEN LOWER(CONCAT(t.genus,' ',t.species)) = LOWER($2) THEN 0
              WHEN CONCAT(t.genus,' ',t.species) ILIKE $3 THEN 1 ELSE 2 END,
         obs_count DESC
       LIMIT 30`,
      [`%${q}%`, q, `${q}%`]
    );

    // Usuarios: partial match by username
    const usersResult = await pool.query(
      `SELECT u.username, u.profile_image, u.created_at,
              COUNT(o.id) as obs_count
       FROM auth.users u
       LEFT JOIN observations.observations o ON o.user_id = u.id
       WHERE u.username ILIKE $1
       GROUP BY u.username, u.profile_image, u.created_at
       ORDER BY
         CASE WHEN LOWER(u.username) = LOWER($2) THEN 0
              WHEN u.username ILIKE $3 THEN 1
              ELSE 2 END,
         obs_count DESC, u.username`,
      [`%${q}%`, q, `${q}%`]
    );

    res.json({
      taxa: taxaResult.rows.map(r => ({
        id: r.id,
        scientific_name: `${r.genus} ${r.species}`,
        common_name: r.common_name,
        family: r.family,
        order_name: r.order_name,
        class_name: r.class_name,
        thumbnail_key: r.thumbnail_key,
        obs_count: parseInt(r.obs_count) || 0,
        slug: `${r.id}-${r.genus}-${r.species}`.replace(/\s+/g, '-')
      })),
      users: usersResult.rows.map(r => ({
        username: r.username,
        profile_image: r.profile_image,
        created_at: r.created_at,
        obs_count: parseInt(r.obs_count) || 0
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Observers ranked by species observations ──────────────────────────────
// GET /api/explorer/observers/by-species?q=query
// Returns users ordered by how many observations they have of the searched species/genus/family
app.get('/api/explorer/observers/by-species', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT u.username, u.profile_image,
              COUNT(o.id) as species_obs_count,
              COUNT(DISTINCT p.top_class) as species_count
       FROM auth.users u
       JOIN observations.observations o ON o.user_id = u.id
       JOIN ai.predictions p ON p.observation_id = o.id
       JOIN species.taxonomy t ON REPLACE(p.top_class,'_',' ') = CONCAT(t.genus,' ',t.species)
                               OR p.top_class = CONCAT(t.genus,' ',t.species)
       WHERE t.common_name ILIKE $1
          OR CONCAT(t.genus, ' ', t.species) ILIKE $1
          OR t.genus ILIKE $1
          OR t.family ILIKE $1
          OR t.species ILIKE $1
       GROUP BY u.username, u.profile_image
       ORDER BY species_obs_count DESC
       LIMIT 50`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Búsqueda avanzada y filtros ecológicos
// Proxy to Thumbnail Service
app.get('/api/explorer/thumbnail/:size/:filename', async (req, res) => {
  const { size, filename } = req.params;
  try {
    const response = await axios({
      url: `http://thumbnail-service:3004/api/thumbnail/${size}/${filename}`,
      method: 'GET',
      responseType: 'stream'
    });
    res.set('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`explorer-service running on :${PORT}`));
