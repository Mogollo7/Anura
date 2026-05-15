const router = require('express').Router();
const axios = require('axios');
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

/** OpenTopoData datasets in order: SRTM first, then ASTER as fallback for gaps. */
const OPENTOPO_DATASETS = ['srtm30m', 'aster30m'];

async function fetchFromOpenTopo(lat, lon) {
  for (const dataset of OPENTOPO_DATASETS) {
    try {
      const url = `https://api.opentopodata.org/v1/${dataset}?locations=${lat},${lon}`;
      const { data } = await axios.get(url, { timeout: 15000 });
      const el = data?.results?.[0]?.elevation;
      if (el != null && !Number.isNaN(Number(el))) {
        return { altitude_m: Number(el), source: `opentopodata:${dataset}` };
      }
    } catch (e) {
      // try next dataset
    }
  }
  return { altitude_m: null, source: null };
}

async function readCache(latNum, lonNum) {
  if (!pool) return null;
  try {
    const cacheRes = await pool.query(
      'SELECT altitude_m FROM geo.altitude_cache WHERE lat = $1 AND lon = $2',
      [latNum, lonNum]
    );
    if (cacheRes.rows.length > 0) return cacheRes.rows[0].altitude_m;
  } catch (e) {
    console.warn('[altitude] cache read failed:', e.message);
  }
  return null;
}

async function writeCache(latNum, lonNum, alt, source) {
  if (!pool || alt == null) return;
  try {
    await pool.query(
      `INSERT INTO geo.altitude_cache (lat, lon, altitude_m, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lat, lon) DO UPDATE SET
         altitude_m = EXCLUDED.altitude_m,
         source = EXCLUDED.source`,
      [latNum, lonNum, alt, source]
    );
  } catch (e) {
    console.warn('[altitude] cache write failed:', e.message);
  }
}

// GET /api/geo/altitude?lat=4.6&lon=-74.0
router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  try {
    const cached = await readCache(latNum, lonNum);
    if (cached != null) {
      return res.json({ lat: latNum, lon: lonNum, altitude_m: cached, source: 'cache' });
    }

    const { altitude_m: alt, source } = await fetchFromOpenTopo(lat, lon);
    await writeCache(latNum, lonNum, alt, source || 'opentopodata');

    res.json({
      lat: latNum,
      lon: lonNum,
      altitude_m: alt,
      source: source || 'opentopodata',
    });
  } catch (e) {
    res.status(502).json({ error: 'Elevation API error', detail: e.message });
  }
});

module.exports = router;
