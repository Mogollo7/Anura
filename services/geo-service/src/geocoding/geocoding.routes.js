const router = require('express').Router();
const axios  = require('axios');

// GET /api/geo/geocoding/reverse?lat=4.6&lon=-74.0
router.get('/reverse', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Anura/1.0 (anura-project)' }
    });
    res.json({
      display_name: data.display_name,
      country:  data.address?.country,
      state:    data.address?.state,
      city:     data.address?.city || data.address?.town || data.address?.village,
    });
  } catch (e) {
    res.status(502).json({ error: 'Geocoding API error', detail: e.message });
  }
});

module.exports = router;
