const router = require('express').Router();
const path = require('path');
const fs = require('fs');

// Límites departamentales DANE (copia de D:\Anura\geo\colombia_departamentos.geojson, CRS84).
// Sin servicios externos: la validación de una coordenada no puede depender de Nominatim.
// Los nombres del archivo vienen en mayúsculas, sin tildes y con "NARI�O" dañado: se
// nombran por código DANE.
const NOMBRES = {
  '05': 'Antioquia', '08': 'Atlántico', '11': 'Bogotá D. C.', '13': 'Bolívar', '15': 'Boyacá',
  '17': 'Caldas', '18': 'Caquetá', '19': 'Cauca', '20': 'Cesar', '23': 'Córdoba',
  '25': 'Cundinamarca', '27': 'Chocó', '41': 'Huila', '44': 'La Guajira', '47': 'Magdalena',
  '50': 'Meta', '52': 'Nariño', '54': 'Norte de Santander', '63': 'Quindío', '66': 'Risaralda',
  '68': 'Santander', '70': 'Sucre', '73': 'Tolima', '76': 'Valle del Cauca', '81': 'Arauca',
  '85': 'Casanare', '86': 'Putumayo', '88': 'San Andrés, Providencia y Santa Catalina',
  '91': 'Amazonas', '94': 'Guainía', '95': 'Guaviare', '97': 'Vaupés', '99': 'Vichada',
};

const geojson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/colombia_departamentos.geojson'), 'utf8'));
const departamentos = geojson.features.map((f) => {
  const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of poligonos) for (const [lon, lat] of p[0]) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  return { codigo: f.properties.DPTO, nombre: NOMBRES[f.properties.DPTO] || f.properties.NOMBRE_DPT, poligonos, caja: { minLon, minLat, maxLon, maxLat } };
});

function enAnillo(lon, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Primer anillo = borde exterior; los demás son huecos.
const enPoligono = (lon, lat, p) => enAnillo(lon, lat, p[0]) && !p.slice(1).some((h) => enAnillo(lon, lat, h));

// Distancia aproximada (equirectangular, km) del punto al borde más cercano; basta para
// decir "a 1,2 km de Chocó" cuando la costa simplificada del mapa deja el punto por fuera.
function distanciaBordeKm(lon, lat, d) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  let min = Infinity;
  for (const p of d.poligonos) for (const anillo of p) {
    for (let i = 1; i < anillo.length; i++) {
      const ax = (anillo[i - 1][0] - lon) * kx, ay = (anillo[i - 1][1] - lat) * ky;
      const bx = (anillo[i][0] - lon) * kx, by = (anillo[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return min;
}

// GET /api/geo/ubicacion?lat=6.25&lon=-75.56 → { en_colombia, departamento, codigo_dane, cercano? }
router.get('/', (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'lat y lon válidos requeridos' });
  }
  const hit = departamentos.find((d) => lon >= d.caja.minLon && lon <= d.caja.maxLon && lat >= d.caja.minLat
    && lat <= d.caja.maxLat && d.poligonos.some((p) => enPoligono(lon, lat, p)));
  if (hit) return res.json({ lat, lon, en_colombia: true, departamento: hit.nombre, codigo_dane: hit.codigo });

  let cercano = null;
  for (const d of departamentos) {
    const km = distanciaBordeKm(lon, lat, d);
    if (!cercano || km < cercano.distancia_km) cercano = { departamento: d.nombre, codigo_dane: d.codigo, distancia_km: km };
  }
  cercano.distancia_km = Number(cercano.distancia_km.toFixed(1));
  res.json({ lat, lon, en_colombia: false, departamento: null, codigo_dane: null, cercano });
});

module.exports = router;
// Regiones (Admin) reusa los mismos límites y el mismo point-in-polygon.
module.exports.departamentos = departamentos;
module.exports.enPoligono = enPoligono;
