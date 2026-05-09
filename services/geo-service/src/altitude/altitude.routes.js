const router = require('express').Router();
const axios  = require('axios');

// GET /api/geo/altitude?lat=4.6&lon=-74.0
router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
  try {
    const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
    const { data } = await axios.get(url);
    const alt = data?.results?.[0]?.elevation;
    res.json({ lat: Number(lat), lon: Number(lon), altitude_m: alt });
  } catch (e) {
    res.status(502).json({ error: 'Elevation API error', detail: e.message });
  }
});

module.exports = router;
