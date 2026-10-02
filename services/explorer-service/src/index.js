const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { coincide, unirEspecie, columnasTaxon, slugDe } = require('./especiePublica');
// Sin JWT_SECRET no se arranca: con un valor por defecto en el código, cualquiera podría firmarse un token.
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET no está definido: explorer-service no arranca sin él.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const DATASET_SERVICE_URL = process.env.DATASET_SERVICE_URL || 'http://dataset-service:3008';
const CATALOGO_TTL_MS = 60_000;
let catalogoCache = null;

/**
 * Recuentos del catálogo publicado (K): especies con ficha publicada por un herpetólogo, no
 * predicciones del modelo. `ai.predictions` cuenta clases distintas que el modelo alguna vez
 * dijo (incluye errores y especies sin ficha); el catálogo público es lo que el Explorador
 * realmente puede mostrar. Caché corta: el catálogo no cambia más que una vez cada tanto.
 */
async function catalogoPublicado() {
  if (catalogoCache && catalogoCache.expira > Date.now()) return catalogoCache.valor;
  try {
    const { data } = await axios.get(`${DATASET_SERVICE_URL}/api/dataset/publico/catalogo`, { timeout: 5000 });
    catalogoCache = { valor: data, expira: Date.now() + CATALOGO_TTL_MS };
    return data;
  } catch (err) {
    console.error('No se pudo leer el catálogo publicado de dataset-service:', err.message);
    return catalogoCache?.valor ?? { especies: [] };
  }
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'explorer-service' }));

// Salidas de campo (lectura): rutas en ./field-trips.js
require('./field-trips').registrarSalidasDeCampo(app, pool, JWT_SECRET);

// Observaciones de la sesión actual. No depende del nombre de usuario (que puede cambiar) y
// conserva las privadas: solo la dueña llega a esta ruta autenticada.
app.get('/api/explorer/mine', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ message: 'No autorizado' });
  let viewer;
  try {
    viewer = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Token inválido' });
  }
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.image_key, o.thumbnail_key, o.lat, o.lon, o.place_guess, o.altitude_m, o.notes,
             o.is_private, o.created_at, u.username, u.profile_image, o.user_id,
             COALESCE((
               SELECT json_agg(json_build_object('image_key', m.image_key, 'thumbnail_key', m.thumbnail_key) ORDER BY m.position)
               FROM observations.observation_media m WHERE m.observation_id = o.id
             ), '[]'::json) AS photos,
             p.top_class AS ai_class, p.top_probability AS ai_prob,
             ${columnasTaxon()}
      FROM observations.observations o
      JOIN auth.users u ON u.id = o.user_id
      LEFT JOIN LATERAL (
        SELECT top_class, top_probability FROM ai.predictions
        WHERE observation_id = o.id ORDER BY created_at DESC LIMIT 1
      ) p ON TRUE
      ${unirEspecie()}
      WHERE o.user_id = $1
      ORDER BY COALESCE(o.recorded_at, o.created_at) DESC
    `, [viewer.id]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching own observations:', err);
    res.status(500).json({ message: 'Error fetching own observations' });
  }
});

// Feed (Latest observations)
app.get('/api/explorer/feed', async (req, res) => {
  const { username } = req.query;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
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
             COALESCE((
               SELECT json_agg(json_build_object('image_key', m.image_key, 'thumbnail_key', m.thumbnail_key) ORDER BY m.position)
               FROM observations.observation_media m WHERE m.observation_id = o.id
             ), '[]'::json) AS photos,
             u.username, u.profile_image,
             p.top_class as ai_class, p.top_probability as ai_prob,
             ${columnasTaxon()}
      FROM observations.observations o
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      ${unirEspecie()}
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
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      query += ` AND (
        u.username ILIKE $${n} OR COALESCE(o.notes, '') ILIKE $${n}
        OR COALESCE(o.place_guess, '') ILIKE $${n} OR COALESCE(p.top_class, '') ILIKE $${n}
        OR COALESCE(ep.nombre_comun, '') ILIKE $${n} OR COALESCE(ep.epiteto, '') ILIKE $${n}
      )`;
    }
    query += ` ORDER BY o.created_at DESC LIMIT ${q ? 200 : 100}`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching feed:', err);
    res.status(500).json({ message: 'Error fetching observations' });
  }
});

// ── Favorites ────────────────────────────────────────────────────────
// jwt and JWT_SECRET are defined at the top of the file
// La tabla observations.favorites la crea infrastructure/postgres/phase2.sql; explorer_service
// solo tiene permiso de lectura/escritura de filas (roles.sql), no de crear tablas.

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
             ${columnasTaxon()}
      FROM auth.users profile_user
      JOIN observations.favorites f ON profile_user.id = f.user_id
      JOIN observations.observations o ON f.observation_id = o.id
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      ${unirEspecie()}
      WHERE profile_user.username = $1
        AND o.is_private IS NOT TRUE   -- endpoint público: una observación privada nunca sale, ni por favoritos
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
             ${columnasTaxon()}
      FROM observations.favorites f
      JOIN observations.observations o ON f.observation_id = o.id
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      ${unirEspecie()}
      WHERE f.user_id = $1
        AND (o.is_private IS NOT TRUE OR o.user_id = $1)   -- las privadas ajenas no se ven aunque estén marcadas
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
      // SELECT 1: en una base nueva (phase2.sql) favorites tiene PK compuesta y no existe la columna id.
      'SELECT 1 FROM observations.favorites WHERE user_id = $1 AND observation_id = $2',
      [req.user.id, id]
    );
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM observations.favorites WHERE user_id = $1 AND observation_id = $2', [req.user.id, id]);
      res.json({ liked: false });
    } else {
      // Solo se marca una observación que la persona puede ver: pública o propia.
      const visible = await pool.query(
        'SELECT 1 FROM observations.observations WHERE id = $1 AND (is_private IS NOT TRUE OR user_id = $2)',
        [id, req.user.id]
      );
      if (visible.rowCount === 0) return res.status(404).json({ error: 'Observación no encontrada' });
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
    const userCount = await pool.query('SELECT COUNT(DISTINCT user_id) FROM observations.observations');
    const catalogo = await catalogoPublicado();

    res.json({
      observations: parseInt(obsCount.rows[0].count),
      // Especies (y géneros y familias) del catálogo publicado, no de ai.predictions — ver
      // 19_ADMIN/Ficha Publica, Explorador y Destacados.md §3.
      species: catalogo.especies.length,
      genera: new Set(catalogo.especies.map((e) => e.genero).filter(Boolean)).size,
      families: new Set(catalogo.especies.map((e) => e.familia).filter(Boolean)).size,
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
        ep.nombre_comun AS common_name,
        ep.taxon_id
      FROM SpeciesStats s
      JOIN observations.observations o ON s.last_obs = o.created_at
      LEFT JOIN dataset.especie_publica ep ON ${coincide('s.scientific_name')}
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
             COALESCE((
               SELECT json_agg(json_build_object('image_key', m.image_key, 'thumbnail_key', m.thumbnail_key) ORDER BY m.position)
               FROM observations.observation_media m WHERE m.observation_id = o.id
             ), '[]'::json) AS photos,
             u.username, u.profile_image, o.user_id,
             (SELECT COUNT(*) FROM observations.observations WHERE user_id = u.id)::int as user_obs_count,
             p.top_class as ai_class, p.top_probability as ai_prob,
             ${columnasTaxon()}
      FROM observations.observations o
      JOIN auth.users u ON o.user_id = u.id
      LEFT JOIN ai.predictions p ON p.observation_id = o.id
      ${unirEspecie()}
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
      `SELECT taxon_id, nombre_cientifico, nombre_comun, familia, orden
       FROM dataset.especie_publica
       WHERE nombre_comun ILIKE $1
          OR nombre_cientifico ILIKE $1
          OR genero ILIKE $1
          OR familia ILIKE $1
          OR epiteto ILIKE $1
       ORDER BY
         CASE WHEN LOWER(nombre_cientifico) = LOWER($2) THEN 0
              WHEN nombre_cientifico ILIKE $3 THEN 1
              ELSE 2 END,
         nombre_cientifico
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
        id: r.taxon_id,
        scientific_name: r.nombre_cientifico,
        common_name: r.nombre_comun,
        family: r.familia,
        order_name: r.orden,
        slug: slugDe(r.taxon_id, r.nombre_cientifico)
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
      `SELECT ep.taxon_id, ep.nombre_cientifico, ep.nombre_comun, ep.familia, ep.orden, ep.clase,
              (SELECT o.thumbnail_key FROM observations.observations o
               JOIN ai.predictions p ON p.observation_id = o.id
               WHERE ${coincide('p.top_class')} AND o.is_private IS NOT TRUE
               ORDER BY o.created_at DESC LIMIT 1) as thumbnail_key,
              COUNT(DISTINCT obs.id) as obs_count
       FROM dataset.especie_publica ep
       LEFT JOIN ai.predictions pred ON ${coincide('pred.top_class')}
       LEFT JOIN observations.observations obs ON obs.id = pred.observation_id
       WHERE ep.nombre_comun ILIKE $1
          OR ep.nombre_cientifico ILIKE $1
          OR ep.genero ILIKE $1
          OR ep.familia ILIKE $1
          OR ep.epiteto ILIKE $1
       GROUP BY ep.taxon_id, ep.nombre_cientifico, ep.nombre_comun, ep.familia, ep.orden, ep.clase
       ORDER BY
         CASE WHEN LOWER(ep.nombre_cientifico) = LOWER($2) THEN 0
              WHEN ep.nombre_cientifico ILIKE $3 THEN 1 ELSE 2 END,
         obs_count DESC, ep.nombre_cientifico
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
        id: r.taxon_id,
        scientific_name: r.nombre_cientifico,
        common_name: r.nombre_comun,
        family: r.familia,
        order_name: r.orden,
        class_name: r.clase,
        thumbnail_key: r.thumbnail_key,
        obs_count: parseInt(r.obs_count) || 0,
        slug: slugDe(r.taxon_id, r.nombre_cientifico)
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
       JOIN dataset.especie_publica ep ON ${coincide('p.top_class')}
       WHERE ep.nombre_comun ILIKE $1
          OR ep.nombre_cientifico ILIKE $1
          OR ep.genero ILIKE $1
          OR ep.familia ILIKE $1
          OR ep.epiteto ILIKE $1
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
  // Este endpoint es público: nada de "/", ".." ni "%2F" (doble codificación) hacia thumbnail-service.
  if (!/^[a-z]{1,16}$/.test(size) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(filename) || filename.includes('..')) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }
  try {
    const response = await axios({
      url: `http://thumbnail-service:3004/api/thumbnail/${size}/${encodeURIComponent(filename)}`,
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
