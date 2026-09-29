const express = require('express');
const path = require('path');
const fs = require('fs');
const { departamentos, enPoligono } = require('../ubicacion/ubicacion.routes');

const router = express.Router();

/**
 * Límites para Admin → Regiones: departamentos DANE (vista de Colombia) y municipios de un
 * departamento (para dividirlo en subregiones). Sin red externa, igual que /ubicacion.
 *
 * Límites municipales: un archivo data/municipios_<DPTO>.geojson por departamento. Hoy solo
 * existe el de Antioquia (05), generado por D:/Anura/tools/admin/build_antioquia_subregiones.py
 * desde el MGN del DANE. Un departamento sin archivo se puede agregar, pero no dividir todavía.
 */
const DATA = path.join(__dirname, '../../data');

const municipiosCache = new Map();
function municipiosDe(codigo) {
  if (!/^\d{2}$/.test(codigo)) return null;
  if (municipiosCache.has(codigo)) return municipiosCache.get(codigo);
  const archivo = path.join(DATA, `municipios_${codigo}.geojson`);
  let valor = null;
  if (fs.existsSync(archivo)) {
    const geo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    valor = {
      geojson: geo,
      // Para point-in-polygon: polígonos y caja de cada municipio.
      indice: geo.features.map((f) => {
        const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const p of poligonos) for (const [lon, lat] of p[0]) {
          minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
        }
        return { codigo: f.properties.codigo, poligonos, caja: { minLon, minLat, maxLon, maxLat } };
      }),
    };
  }
  municipiosCache.set(codigo, valor);
  return valor;
}

/**
 * Contorno liviano para el mapa de Colombia: coordenadas a 2 decimales (≈1 km) sin puntos
 * repetidos. El archivo completo pesa 1,4 MB; para ver 33 departamentos basta con esto.
 */
function simplificar(poligonos) {
  return poligonos
    .map((p) => p
      .map((anillo) => {
        const out = [];
        for (const [lon, lat] of anillo) {
          const q = [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100];
          const u = out[out.length - 1];
          if (!u || u[0] !== q[0] || u[1] !== q[1]) out.push(q);
        }
        return out;
      })
      .filter((anillo) => anillo.length >= 4))
    .filter((p) => p.length);
}
const contornos = departamentos.map((d) => ({ codigo: d.codigo, poligonos: simplificar(d.poligonos) }));

// GET /api/geo/regiones/departamentos?geometria=1 → [{ codigo, nombre, limites_municipales, poligonos? }]
router.get('/departamentos', (req, res) => {
  const conGeometria = req.query.geometria === '1';
  res.json({
    departamentos: departamentos
      .map((d) => ({
        codigo: d.codigo,
        nombre: d.nombre,
        limites_municipales: !!municipiosDe(d.codigo),
        ...(conGeometria ? { poligonos: contornos.find((c) => c.codigo === d.codigo).poligonos } : {}),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  });
});

// GET /api/geo/regiones/departamentos/05/municipios → GeoJSON { codigo, nombre } por municipio
router.get('/departamentos/:codigo/municipios', (req, res) => {
  const m = municipiosDe(req.params.codigo);
  if (!m) return res.status(404).json({ error: 'Todavía no hay límites municipales cargados para este departamento' });
  res.json(m.geojson);
});

// POST /api/geo/regiones/departamentos/05/ubicar { puntos: [[lat, lon], …] } → { municipios: [codigo|null, …] }
router.post('/departamentos/:codigo/ubicar', express.json({ limit: '2mb' }), (req, res) => {
  const m = municipiosDe(req.params.codigo);
  if (!m) return res.status(404).json({ error: 'Todavía no hay límites municipales cargados para este departamento' });
  const puntos = Array.isArray(req.body?.puntos) ? req.body.puntos : null;
  if (!puntos || puntos.length > 50000) return res.status(400).json({ error: 'puntos: lista de [lat, lon] (máximo 50.000)' });
  const municipios = puntos.map((p) => {
    const [lat, lon] = Array.isArray(p) ? p.map(Number) : [NaN, NaN];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const hit = m.indice.find((x) => lon >= x.caja.minLon && lon <= x.caja.maxLon && lat >= x.caja.minLat
      && lat <= x.caja.maxLat && x.poligonos.some((p2) => enPoligono(lon, lat, p2)));
    return hit ? hit.codigo : null;
  });
  res.json({ municipios });
});

module.exports = router;
