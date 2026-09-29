const express = require('express');
const app = express();

// 2 MB: Regiones ubica miles de observaciones de una vez (POST /api/geo/regiones/.../ubicar).
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'geo-service' }));

app.use('/api/geo/weather',   require('./weather/weather.routes'));
app.use('/api/geo/altitude',  require('./altitude/altitude.routes'));
app.use('/api/geo/biome',     require('./biome/biome.routes'));
app.use('/api/geo/geocoding', require('./geocoding/geocoding.routes'));
app.use('/api/geo/ubicacion', require('./ubicacion/ubicacion.routes'));
app.use('/api/geo/regiones',  require('./regiones/regiones.routes'));

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`geo-service running on :${PORT}`));
