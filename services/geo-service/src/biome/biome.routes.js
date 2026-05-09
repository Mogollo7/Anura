const router = require('express').Router();

// GET /api/geo/biome?lat=4.6&lon=-74.0
// Simple rule-based biome from altitude + lat (MVP - replace with shapefile lookup later)
router.get('/', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const alt = parseFloat(req.query.altitude_m ?? 0);
  if (isNaN(lat)) return res.status(400).json({ error: 'lat required' });

  let biome = 'Tropical rainforest';
  if (alt > 3000)      biome = 'Páramo';
  else if (alt > 2000) biome = 'Andean cloud forest';
  else if (alt > 1000) biome = 'Sub-Andean forest';
  else if (lat < -1)   biome = 'Amazon basin';

  res.json({ lat, altitude_m: alt, biome });
});

module.exports = router;
