const router = require('express').Router();
const axios  = require('axios');

// GET /api/geo/weather?lat=4.6&lon=-74.0
router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Weather API error', detail: e.message });
  }
});

module.exports = router;
