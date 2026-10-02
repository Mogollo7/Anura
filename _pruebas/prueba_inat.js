// Descarga de fotos de iNaturalist (inatDescarga.js) contra la base desechable anura_inat,
// con un iNaturalist de mentira y un MinIO de mentira en memoria.
const http = require('http');
const assert = require('assert');
const PORT = 39140;
process.env.INAT_API_URL = `http://127.0.0.1:${PORT}/v1`;
process.env.INAT_ESPERA_MS = '0';
process.env.GEO_SERVICE_URL = 'http://127.0.0.1:1'; // caído a propósito: la descarga debe seguir
const SRC = 'D:/server/Anura/services/dataset-service';
const { Pool } = require(`${SRC}/node_modules/pg`);
const sharp = require(`${SRC}/node_modules/sharp`);
const inat = require(`${SRC}/src/inatDescarga.js`);

const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_inat' });
const q = (s, p) => pool.query(s, p);
const U = 'd81f2281-6086-435e-9de6-603f766fdf5e';

const objetos = new Map();
const minio = {
  putObject: async (_b, k, buf) => { objetos.set(k, buf); },
  removeObject: async (_b, k) => { objetos.delete(k); },
};

// Observaciones: 1,2 con fotos CC; 3 renacuajo; 4 foto sin licencia; 5 foto cuya imagen falla (404 en todas las tallas)
const obs = [
  { id: 1, location: '6.25,-75.5', positional_accuracy: 30, observed_on: '2024-01-02', photos: [{ id: 11, url: `http://127.0.0.1:${PORT}/img/11/square.jpg`, license_code: 'cc-by', attribution: 'ana' }] },
  { id: 2, location: '6.3,-75.6', obscured: true, photos: [{ id: 21, url: `http://127.0.0.1:${PORT}/img/21/square.jpg`, license_code: 'cc0', attribution: 'beto' }, { id: 22, url: `http://127.0.0.1:${PORT}/img/22/square.jpg`, license_code: 'cc-by-nc', attribution: 'beto' }] },
  { id: 3, annotations: [{ controlled_attribute: { label: 'Life Stage' }, controlled_value: { label: 'Tadpole' } }], photos: [{ id: 31, url: `http://127.0.0.1:${PORT}/img/31/square.jpg`, license_code: 'cc-by' }] },
  { id: 4, photos: [{ id: 41, url: `http://127.0.0.1:${PORT}/img/41/square.jpg`, license_code: null, attribution: 'cami' }] },
  { id: 5, photos: [{ id: 51, url: `http://127.0.0.1:${PORT}/img/51/square.jpg`, license_code: 'cc-by', attribution: 'dani' }] },
];
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/v1/taxa') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ results: [{ id: 777, name: u.searchParams.get('q') }] }));
  }
  if (u.pathname === '/v1/observations') {
    assert.strictEqual(u.searchParams.get('place_id'), '7196');
    const pp = Number(u.searchParams.get('per_page')); const page = Number(u.searchParams.get('page') || 1);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ total_results: obs.length, results: pp === 1 ? obs.slice(0, 1) : obs.slice((page - 1) * pp, page * pp) }));
  }
  const m = u.pathname.match(/^\/img\/(\d+)\/(\w+)\.jpg$/);
  if (m) {
    if (m[1] === '51') { res.statusCode = 404; return res.end(); }
    if (m[2] !== 'original') { res.statusCode = 404; return res.end(); } // fuerza el uso de original
    const buf = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: Number(m[1]) * 3 % 255, g: 80, b: 20 } } }).jpeg().toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    return res.end(buf);
  }
  res.statusCode = 404; res.end();
});

const espera = async (id) => { for (let i = 0; i < 200; i++) { const e = inat.estado(id); if (e && e.estado !== 'en_curso') return e; await new Promise((r) => setTimeout(r, 25)); } throw new Error('no terminó'); };

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  await q(`DELETE FROM dataset.foto; DELETE FROM dataset.observacion`).catch(() => {});
  await q(`DELETE FROM dataset.especie WHERE carpeta = 'Prueba_inat'`);
  const { rows: [esp] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia) VALUES ('Prueba_inat','Prueba inat','Prueba','Pruebidae') RETURNING id`);
  await q(`INSERT INTO auth.users (id, username, email) VALUES ($1,'pi','pi@x.co') ON CONFLICT DO NOTHING`, [U]).catch(() => {});
  const ctx = { pool, minio, bucket: 'b' };

  // 1) Estado vacío honesto: conteos reales en cero, candidatas = 5 observaciones
  let r = await inat.resumen(pool, esp.id);
  assert.strictEqual(r.local.almacenadas, 0);
  assert.strictEqual(r.remoto.observaciones_candidatas, 5);
  assert.strictEqual(r.pendientes_observaciones, 5);
  assert.strictEqual(r.descarga, null);

  // 2) Validaciones
  await assert.rejects(() => inat.iniciar(ctx, esp.id, { max: 0 }, U), /al menos 1/);
  await assert.rejects(() => inat.iniciar(ctx, esp.id, { max: 9999 }, U), /500/);
  await assert.rejects(() => inat.iniciar(ctx, esp.id, { max: 5, calidad: 'x' }, U), /calidad/);
  await assert.rejects(() => inat.iniciar(ctx, 999999, { max: 5 }, U), /no existe/);

  // 3) Descarga completa: guarda 1, 21, 22 y 41 (sin licencia); omite renacuajo; falla 51; geo caído no la rompe
  const p0 = await inat.iniciar(ctx, esp.id, { max: 10 }, U);
  assert.strictEqual(p0.estado, 'en_curso');
  await assert.rejects(() => inat.iniciar(ctx, esp.id, { max: 10 }, U), /ya se está descargando/);
  const fin = await espera(esp.id);
  assert.strictEqual(fin.estado, 'terminada');
  assert.strictEqual(fin.guardadas, 4, JSON.stringify(fin));
  assert.strictEqual(fin.renacuajos_omitidos, 1);
  assert.strictEqual(fin.fallidas, 1);
  assert.strictEqual(fin.errores.length, 1);
  assert.strictEqual(objetos.size, 4);
  const { rows: fotos } = await q(`SELECT f.*, o.fuente, o.fuente_id, o.coordenada_oculta, o.latitud FROM dataset.foto f JOIN dataset.observacion o ON o.id=f.observacion_id WHERE f.especie_id=$1 ORDER BY f.fuente_foto_id`, [esp.id]);
  assert.deepStrictEqual(fotos.map((f) => f.fuente_foto_id), ['11', '21', '22', '41']);
  assert.ok(fotos.every((f) => f.fuente === 'inaturalist' && f.estado === 'fuera_de_catalogo' && f.object_key.startsWith('fotos/')));
  assert.strictEqual(fotos[3].licencia, 'all-rights-reserved');
  assert.strictEqual(fotos[1].coordenada_oculta, true);
  assert.strictEqual(fotos[0].latitud, 6.25);
  assert.ok(fotos.every((f) => objetos.has(f.object_key)));

  // 4) Resumen tras la descarga: conteos reales
  r = await inat.resumen(pool, esp.id);
  assert.strictEqual(r.local.almacenadas, 4);
  assert.strictEqual(r.local.con_licencia_cc, 3);
  assert.strictEqual(r.local.sin_licencia_cc, 1);
  assert.strictEqual(r.local.observaciones_inat, 3);

  // 5) Repetir no duplica; la foto fallida se reintenta
  await inat.iniciar(ctx, esp.id, { max: 10 }, U);
  const otra = await espera(esp.id);
  assert.strictEqual(otra.guardadas, 0);
  assert.strictEqual(otra.ya_estaban, 4);
  assert.strictEqual(otra.fallidas, 1);

  // 6) solo_cc omite la foto sin licencia (borrándola antes para volver a verla)
  await q(`DELETE FROM dataset.foto WHERE fuente_foto_id = '41'`);
  await inat.iniciar(ctx, esp.id, { max: 10, solo_cc: true }, U);
  const cc = await espera(esp.id);
  assert.strictEqual(cc.guardadas, 0);
  assert.strictEqual(cc.sin_licencia_omitidas, 1);

  // 7) max respetado
  await q(`DELETE FROM dataset.foto WHERE especie_id=$1`, [esp.id]); objetos.clear();
  await inat.iniciar(ctx, esp.id, { max: 2 }, U);
  const tope = await espera(esp.id);
  assert.strictEqual(tope.guardadas, 2);

  // 8) Cancelar sin descarga activa
  assert.throws(() => inat.cancelar(esp.id), /No hay una descarga/);

  // auditoría
  const { rows: [a] } = await q(`SELECT COUNT(*)::int AS n FROM audit.log WHERE action = 'dataset.foto.descarga_inaturalist'`).catch(() => ({ rows: [{ n: -1 }] }));
  console.log('auditorías registradas:', a.n);
  console.log('prueba_inat: todo pasó');
  server.close(); await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
