// Prueba de privacidad de explorer-service (despliegue-seguridad). Base desechable anura_despliegue_ex, rol explorer_service.
// Uso: node prueba_seguridad_explorer.js [ruta-a-explorer-service]   (por defecto, el código actual)
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const NM = 'D:/server/Anura/_pruebas/node_modules';
const SVC = path.resolve(process.argv[2] || 'D:/server/Anura/services/explorer-service');
const { Pool } = require(NM + '/pg');
const jwt = require(NM + '/jsonwebtoken');
const SECRET = 'prueba-seg-explorer';
const PORT = 39272;
const admin = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_despliegue_ex' });
const base = `http://127.0.0.1:${PORT}`;
const tok = (id) => jwt.sign({ id, role: 'user' }, SECRET);
const call = async (metodo, ruta, token) => {
  const r = await fetch(base + ruta, { method: metodo, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, cuerpo: await r.json().catch(() => null) };
};
let ok = 0;
const t = async (n, fn) => { try { await fn(); ok++; console.log('  ok  ', n); } catch (e) { console.log('  FALLA', n, '->', e.message.split('\n')[0]); process.exitCode = 1; } };

(async () => {
  await admin.query('TRUNCATE observations.favorites, ai.predictions, observations.observations CASCADE');
  await admin.query("DELETE FROM auth.users WHERE username IN ('seg_ana','seg_beto')");
  const { rows: [ana] } = await admin.query("INSERT INTO auth.users (username, email) VALUES ('seg_ana','a@seg.test') RETURNING id");
  const { rows: [beto] } = await admin.query("INSERT INTO auth.users (username, email) VALUES ('seg_beto','b@seg.test') RETURNING id");
  const nueva = async (user, priv, lat) => (await admin.query(
    "INSERT INTO observations.observations (user_id, image_key, thumbnail_key, lat, lon, is_private) VALUES ($1,'k.webp','t.webp',$2,-75.5,$3) RETURNING id",
    [user, lat, priv])).rows[0].id;
  const publica = await nueva(ana.id, false, 6.1);
  const privada = await nueva(ana.id, true, 6.2222);
  await admin.query('INSERT INTO observations.favorites (user_id, observation_id) VALUES ($1,$2),($1,$3)', [ana.id, publica, privada]); // Ana marcó sus dos

  const svc = spawn(process.execPath, ['src/index.js'], { cwd: SVC, env: { ...process.env, NODE_PATH: NM, PORT: String(PORT),
    DATABASE_URL: 'postgres://explorer_service:p@127.0.0.1:55432/anura_despliegue_ex', DATASET_SERVICE_URL: 'http://127.0.0.1:1', JWT_SECRET: SECRET }, stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
    console.log('Favoritos y privacidad');
    await t('el perfil público de Ana (sin sesión) no lista su observación privada favorita', async () => {
      const r = await call('GET', '/api/explorer/favorites/feed/user/seg_ana');
      assert.strictEqual(r.status, 200);
      const ids = r.cuerpo.map((o) => o.id);
      assert.ok(ids.includes(publica), 'debe salir la pública');
      assert.ok(!ids.includes(privada), 'salió la privada (con coordenadas)');
    });
    await t('Ana ve sus dos favoritas en su propio feed', async () => {
      const r = await call('GET', '/api/explorer/favorites/feed', tok(ana.id));
      assert.deepStrictEqual(r.cuerpo.map((o) => o.id).sort(), [publica, privada].sort());
    });
    await t('Beto no puede marcar como favorita una privada de Ana', async () => {
      const r = await call('POST', `/api/explorer/favorites/${privada}`, tok(beto.id));
      assert.strictEqual(r.status, 404, `dio ${r.status}`);
      const feed = await call('GET', '/api/explorer/favorites/feed', tok(beto.id));
      assert.ok(!feed.cuerpo.map((o) => o.id).includes(privada), 'la privada de Ana apareció en el feed de Beto');
    });
    await t('Beto sí puede marcar la pública, y quitarla', async () => {
      assert.strictEqual((await call('POST', `/api/explorer/favorites/${publica}`, tok(beto.id))).cuerpo.liked, true);
      assert.strictEqual((await call('POST', `/api/explorer/favorites/${publica}`, tok(beto.id))).cuerpo.liked, false);
    });
    await t('un favorito que luego se volvió privado no aparece en el feed de quien no es la dueña', async () => {
      await admin.query('INSERT INTO observations.favorites (user_id, observation_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [beto.id, privada]);
      const feed = await call('GET', '/api/explorer/favorites/feed', tok(beto.id));
      assert.ok(!feed.cuerpo.map((o) => o.id).includes(privada));
    });
    await t('el feed general y el detalle tampoco muestran la privada a otra persona', async () => {
      const f = await call('GET', '/api/explorer/feed');
      assert.ok(!f.cuerpo.map((o) => o.id).includes(privada));
      const d = await call('GET', `/api/explorer/observation/${privada}`, tok(beto.id));
      assert.ok(d.status === 403 || d.status === 404, `detalle dio ${d.status}`);
    });
    console.log('Miniaturas (endpoint público)');
    await t('nombres con "/", ".." o %2F doble se rechazan con 400', async () => {
      for (const ruta of ['x%252F..%252F..%252Fetc%252Fpasswd', 'x%2F..%2F..%2Fetc%2Fpasswd', '..%2Fx', '.hidden']) {
        const r = await call('GET', `/api/explorer/thumbnail/medium/${ruta}`);
        assert.ok(r.status === 400 || r.status === 404, `${ruta} dio ${r.status}`);
      }
      assert.strictEqual((await call('GET', '/api/explorer/thumbnail/medium/x%252F..%252F..%252Fetc%252Fpasswd')).status, 400);
    });
  } finally { svc.kill(); }
  await admin.query('TRUNCATE observations.favorites, ai.predictions, observations.observations CASCADE');
  await admin.query("DELETE FROM auth.users WHERE username IN ('seg_ana','seg_beto')");
  await admin.end();
  console.log(process.exitCode ? `\nHAY FALLAS (${ok} bien)` : `\nTODO BIEN: ${ok} comprobaciones`);
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e); process.exit(1); });
