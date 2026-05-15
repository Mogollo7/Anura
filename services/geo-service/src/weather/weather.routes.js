const router = require('express').Router();
const axios  = require('axios');

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET /api/geo/weather?lat=4.6&lon=-74.0
router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

  try {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    // 1. Check cache (only return if it was fetched within the last 24 hours, but here we just check existence)
    const cacheRes = await pool.query('SELECT weather_data FROM geo.weather_cache WHERE lat = $1 AND lon = $2', [latNum, lonNum]);
    if (cacheRes.rows.length > 0) {
      return res.json({ ...cacheRes.rows[0].weather_data, source: 'cache' });
    }

    // 2. Fetch from external API (OpenWeatherMap)
    const apiKey = 'f4c2d73de01eeee2ff598e6ec98708b9'; // Provided by user
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const { data } = await axios.get(url);

    // 3. Save to cache
    await pool.query(
      'INSERT INTO geo.weather_cache (lat, lon, weather_data) VALUES ($1, $2, $3) ON CONFLICT (lat, lon) DO UPDATE SET weather_data = $3, cached_at = NOW()',
      [latNum, lonNum, data]
    );

    res.json({ ...data, source: 'openweathermap' });
  } catch (e) {
    res.status(502).json({ error: 'Weather API error', detail: e.message });
  }
});

module.exports = router;
