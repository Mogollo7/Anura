// Siembra sintética para el recorrido de la UI (base anura_recorrido, SOLO prueba):
// 4 especies, 12 fotos por especie subidas por la API real (multipart, con MinIO de prueba), una versión del dataset con
// particiones train/val/test (hoy solo el importador de Python las crea) y nada más: el resto se hace desde la UI.
const path = require('path');
const DS = 'D:/server/Anura/services/dataset-service/node_modules';
const sharp = require(path.join(DS, 'sharp'));
const { Pool } = require(path.join(DS, 'pg'));
const BASE = 'http://127.0.0.1:39230';
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ id: 'd81f2281-6086-435e-9de6-603f766fdf5e' })}.firma`;
const H = { Authorization: `Bearer ${TOKEN}` };
const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_recorrido' });

let s = 1234;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const especies = [
  { n: 'Pristimantis alfa', f: 'Strabomantidae', color: [70, 120, 60], lat: 6.25, lon: -75.57, alt2: [6.15, -75.38] },
  { n: 'Pristimantis beta', f: 'Strabomantidae', color: [80, 110, 70], lat: 6.27, lon: -75.6, alt2: [6.15, -75.38] },
  { n: 'Boana gamma', f: 'Hylidae', color: [170, 190, 70], lat: 6.3, lon: -75.55, alt2: [6.15, -75.38] },
  { n: 'Oophaga delta', f: 'Dendrobatidae', color: [200, 60, 50], lat: 7.88, lon: -76.63, alt2: [7.9, -76.6] },
];

async function imagen(color) {
  const w = 240, h = 180, px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) px[i * 3 + c] = Math.max(0, Math.min(255, color[c] + (rnd() - 0.5) * 90));
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

(async () => {
  const shas = [];
  for (const e of especies) {
    const r = await fetch(`${BASE}/api/dataset/especies`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre_cientifico: e.n, familia: e.f }) });
    const cuerpo = await r.json();
    if (!r.ok) throw new Error(`crear ${e.n}: ${r.status} ${JSON.stringify(cuerpo)}`);
    e.id = cuerpo.id ?? cuerpo.especie?.id;
    console.log('especie', e.n, e.id, cuerpo.taxon_id ?? '');
    for (let i = 0; i < 12; i++) {
      const [lat, lon] = i % 4 === 3 ? e.alt2 : [e.lat, e.lon];
      const fd = new FormData();
      fd.append('foto', new Blob([await imagen(e.color)], { type: 'image/jpeg' }), `${e.n.replace(' ', '_')}_${i}.jpg`);
      fd.append('latitud', String(lat + (rnd() - 0.5) * 0.02));
      fd.append('longitud', String(lon + (rnd() - 0.5) * 0.02));
      fd.append('coordenada_fuente', 'manual');
      fd.append('licencia', 'cc-by');
      fd.append('atribucion', 'Foto sintética de prueba');
      fd.append('observada_en', `2026-0${1 + (i % 8)}-1${i % 9}`);
      const rr = await fetch(`${BASE}/api/dataset/especies/${e.id}/fotos`, { method: 'POST', headers: H, body: fd });
      const cc = await rr.json();
      if (!rr.ok) throw new Error(`foto ${e.n} ${i}: ${rr.status} ${JSON.stringify(cc)}`);
      shas.push({ sha: cc.sha256, especie: e.id, obs: cc.observacion_id, i });
    }
  }
  // Versión del dataset con particiones por individuo (8 train, 2 val, 2 test por especie).
  const { rows: [v] } = await pool.query(`INSERT INTO dataset.version (nombre) VALUES ('recorrido-v1') ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`);
  for (const f of shas) {
    const part = f.i < 8 ? 'train' : f.i < 10 ? 'val' : 'test';
    await pool.query('INSERT INTO dataset.version_foto (version_id, sha256, particion) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [v.id, f.sha, part]);
  }
  console.log('fotos', shas.length, 'versión', v.id);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
