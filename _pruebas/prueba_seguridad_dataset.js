// Prueba de seguridad de dataset-service (despliegue-seguridad). Base desechable anura_despliegue.
// Uso: node prueba_seguridad_dataset.js [ruta-a-dataset-service]   (por defecto, el código actual)
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn } = require('child_process');
const DS = path.resolve(process.argv[2] || 'D:/server/Anura/services/dataset-service');
const NM = 'D:/server/Anura/services/dataset-service/node_modules';
const { Pool } = require(NM + '/pg');
const DB = 'postgres://dataset_service:p@127.0.0.1:55432/anura_despliegue';
const PUERTO = 39280, PUERTO_AUTH = 39281;
let ok = 0;
const t = async (nombre, fn) => { try { await fn(); ok++; console.log('  ok  ', nombre); } catch (e) { console.log('  FALLA', nombre, '->', e.message.split('\n')[0]); process.exitCode = 1; } };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: 'd81f2281-6086-435e-9de6-603f766fdf5e' })}.firma`;
const get = async (ruta, headers = {}) => { const r = await fetch(`http://127.0.0.1:${PUERTO}${ruta}`, { headers }); return { status: r.status, cuerpo: await r.json().catch(() => null), headers: r.headers }; };

(async () => {
  // auth-service de mentira: super usuaria
  const auth = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ account: { id: 'x', name: 'Prueba', isSuperAdmin: true, permissions: {} } }));
  }).listen(PUERTO_AUTH, '127.0.0.1');
  const pool = new Pool({ connectionString: DB });
  await pool.query("DELETE FROM dataset.especie WHERE carpeta = 'Seg_test'");
  const { rows: [e] } = await pool.query("INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia) VALUES ('Seg_test','Seguridad testus','Seguridad','Hylidae') RETURNING id");

  const srv = spawn(process.execPath, ['src/index.js'], { cwd: DS, env: { ...process.env, PORT: String(PUERTO), DATABASE_URL: DB,
    AUTH_SERVICE_URL: `http://127.0.0.1:${PUERTO_AUTH}`, MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39999', MINIO_ROOT_USER: 'x', MINIO_ROOT_PASSWORD: 'xxxxxxxx',
    NODE_PATH: NM, WORKER_TOKEN: 'token-de-prueba-largo' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = ''; srv.stdout.on('data', (d) => { salida += d; }); srv.stderr.on('data', (d) => { salida += d; });
  for (let i = 0; i < 50; i++) { try { if ((await get('/health')).status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }

  console.log('Autenticación');
  await t('las rutas del panel sin token dan 401', async () => {
    for (const r of ['/api/dataset/resumen', `/api/dataset/especies/${e.id}/fotos`, '/api/dataset/osr', '/api/dataset/releases', '/api/dataset/regiones', '/api/dataset/vectores']) {
      assert.strictEqual((await get(r)).status, 401, r);
    }
  });
  await t('/api/worker/* sin token del worker o con otro token da 401', async () => {
    for (const h of [{}, { 'x-worker-token': 'otro' }, { Authorization: `Bearer ${JWT}` }]) {
      assert.strictEqual((await get('/api/worker/fotos/' + 'a'.repeat(64), h)).status, 401);
    }
  });
  await t('/api/worker/* con el token correcto pasa la autenticación', async () => {
    const r = await get('/api/worker/trabajos/1/lote', { 'x-worker-token': 'token-de-prueba-largo', 'x-worker-name': 'prueba' });
    assert.notStrictEqual(r.status, 401);
  });
  await t('paquete no publicado: ni archivo ni manifiesto se descargan', async () => {
    for (const parte of ['archivo', 'manifiesto']) {
      const r = await get(`/api/dataset/publico/paquetes/05.NO_EXISTE/${parte}`);
      assert.strictEqual(r.status, 404);
    }
  });
  await t('solo el paquete PUBLICADO se descarga: borrador, aprobado y retirado dan 404 (aunque manden su ETag)', async () => {
    const admin = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_despliegue' });
    await admin.query("DELETE FROM packages.regional_packages WHERE region_id LIKE 'SEG.%'");
    const estados = { 'SEG.BORRADOR': 'borrador', 'SEG.APROBADO': 'aprobado', 'SEG.RETIRADO': 'retirado', 'SEG.PUBLICADO': 'publicado' };
    for (const [id, estado] of Object.entries(estados)) {
      await admin.query(`INSERT INTO packages.regional_packages (region_id, version, storage_key, sha256, size_bytes, subregion_id, estado, is_published, published_at, manifiesto_key)
        VALUES ($1, 1, 'paquetes/x/package.sqlite', $2, 10, 1, $3, $4, CASE WHEN $4 THEN now() END, 'paquetes/x/paquete.json')`, [id, id.toLowerCase().padEnd(64, '0'), estado, estado === 'publicado']);
    }
    try {
      for (const id of ['SEG.BORRADOR', 'SEG.APROBADO', 'SEG.RETIRADO']) {
        for (const parte of ['archivo', 'manifiesto']) {
          const r = await get(`/api/dataset/publico/paquetes/${id}/${parte}`, { 'if-none-match': `"${id.toLowerCase().padEnd(64, '0')}"` });
          assert.strictEqual(r.status, 404, `${id}/${parte} dio ${r.status}`);
        }
      }
      const arbol = await get('/api/dataset/publico/paquetes');
      const ids = JSON.stringify(arbol.cuerpo);
      assert.ok(ids.includes('SEG.PUBLICADO') || ids.includes('archivo_url'), 'el publicado debe salir en el árbol');
      assert.ok(!ids.includes('SEG.BORRADOR') && !ids.includes('SEG.APROBADO') && !ids.includes('SEG.RETIRADO'), 'el árbol lista un paquete no publicado');
      const pub = await get('/api/dataset/publico/paquetes/SEG.PUBLICADO/manifiesto', { 'if-none-match': `"${'seg.publicado'.padEnd(64, '0')}-json"` });
      assert.strictEqual(pub.status, 304, 'el publicado debe responder 304 con su ETag');
      assert.strictEqual(pub.headers.get('cache-control'), 'no-cache');
      assert.ok(!(pub.headers.get('etag') || '').includes('storage'), 'el ETag no debe exponer rutas internas');
    } finally {
      await admin.query("DELETE FROM packages.regional_packages WHERE region_id LIKE 'SEG.%'");
      await admin.end();
    }
  });
  await t('el catálogo público no filtra la ficha de una especie sin publicar', async () => {
    const r = await get('/api/dataset/publico/catalogo');
    assert.strictEqual(r.status, 200);
    assert.ok(!JSON.stringify(r.cuerpo).includes('Seguridad testus'));
    assert.strictEqual(r.headers.get('cache-control'), 'no-cache');
  });

  console.log('Inyección');
  await t('filtro=constructor / __proto__ / toString no llega al SQL (200, no 500)', async () => {
    for (const f of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const r = await get(`/api/dataset/especies/${e.id}/fotos?filtro=${f}`, { Authorization: `Bearer ${JWT}` });
      assert.strictEqual(r.status, 200, `filtro=${f} dio ${r.status}: ${JSON.stringify(r.cuerpo)}`);
    }
  });
  await t('filtro válido sigue funcionando', async () => {
    const r = await get(`/api/dataset/especies/${e.id}/fotos?filtro=excluidas`, { Authorization: `Bearer ${JWT}` });
    assert.strictEqual(r.status, 200);
  });
  await t('código DANE con "../" se rechaza antes de llamar a geo-service (400)', async () => {
    for (const ruta of ['%2E%2E%2Fx', '05%2F..%2F..%2Faltitude', 'abc']) {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/api/dataset/regiones/${ruta}/subregiones/1/municipios`, {
        method: 'POST', headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ municipios: ['05001'] }) });
      const c = await r.json();
      assert.strictEqual(r.status, 400, `${ruta}: ${r.status} ${JSON.stringify(c)}`);
    }
  });

  srv.kill(); auth.close();
  await pool.query("DELETE FROM dataset.especie WHERE carpeta = 'Seg_test'"); await pool.end();
  if (process.exitCode) console.log('\n--- salida del servicio ---\n' + salida.slice(-1500));
  console.log(process.exitCode ? `\nHAY FALLAS (${ok} bien)` : `\nTODO BIEN: ${ok} comprobaciones`);
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e); process.exit(1); });
