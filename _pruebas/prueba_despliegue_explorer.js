// Prueba: el Explorador lee las especies públicas de dataset.especie_publica (phase22), no species.taxonomy.
// Base desechable anura_despliegue_ex; roles reales explorer_service / dataset_service / auth_service.
const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');
const NM = 'D:/server/Anura/_pruebas/node_modules';
const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');
const jwt = require(NM + '/jsonwebtoken');
const especies = require('D:/server/Anura/services/dataset-service/src/especies.js');
const contenido = require('D:/server/Anura/services/dataset-service/src/contenido.js');

const URL = (rol, pw = 'p') => `postgres://${rol}:${pw}@127.0.0.1:55432/anura_despliegue_ex`;
const admin = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_despliegue_ex' });
const dsPool = new Pool({ connectionString: URL('dataset_service') });
const authPool = new Pool({ connectionString: URL('auth_service') });
const exPool = new Pool({ connectionString: URL('explorer_service') });

const PORT = 39270;
const base = `http://127.0.0.1:${PORT}`;
const get = async (ruta, token) => {
  const r = await fetch(base + ruta, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const cuerpo = await r.json().catch(() => null);
  return { status: r.status, cuerpo };
};
let ok = 0;
const t = async (nombre, fn) => { await fn(); ok++; console.log('  ok', nombre); };

(async () => {
  await admin.query(`TRUNCATE observations.favorites, ai.predictions, observations.observations CASCADE`);
  await admin.query(`DELETE FROM dataset.species_content`);
  await admin.query(`DELETE FROM dataset.especie WHERE true`).catch(() => {});
  await admin.query(`DELETE FROM auth.users WHERE username IN ('observadora','fotografo')`);
  const { rows: [ua] } = await admin.query(`INSERT INTO auth.users (username, email) VALUES ('observadora','o@x') RETURNING id`);
  const { rows: [ub] } = await admin.query(`INSERT INTO auth.users (username, email) VALUES ('fotografo','f@x') RETURNING id`);

  // Especies creadas por el mismo código del Admin (especies.crear): taxon_id COL_ANURA_NNNN.
  const A = await especies.crear(dsPool, { nombre_cientifico: 'boana BOANS', familia: 'hylidae' }, null);
  const B = await especies.crear(dsPool, { nombre_cientifico: 'Dendropsophus columbianus', familia: 'Hylidae' }, null);
  const C = await especies.crear(dsPool, { nombre_cientifico: 'Pristimantis paisa', familia: 'Strabomantidae' }, null);
  const D = await especies.crear(dsPool, { nombre_cientifico: 'Rhinella marina', familia: 'Bufonidae' }, null);
  assert.match(A.taxon_id, /^COL_ANURA_\d{4}$/);
  const contenidoDe = (id, estado, publicada) => admin.query(
    `INSERT INTO dataset.species_content (especie_id, estado, campos, publicada, version, publicado_en)
     VALUES ($1,$2,'{}'::jsonb,$3::jsonb,$4, CASE WHEN $3::jsonb IS NULL THEN NULL ELSE now() END)`,
    [id, estado, publicada && JSON.stringify(publicada), publicada ? 1 : 0]);
  await contenidoDe(A.id, 'publicada', { campos: { nombre_comun: { valor: 'Rana mono', fuente: 'x' } }, galeria: [] });
  await contenidoDe(B.id, 'borrador', null);                    // sin publicar
  await contenidoDe(D.id, 'en_revision', null);                 // en revisión: tampoco es pública
  // C: ficha publicada pero sin taxon_id (regla del catálogo: no sale).
  await contenidoDe(C.id, 'publicada', { campos: { nombre_comun: { valor: 'Ranita paisa', fuente: 'x' } }, galeria: [] });
  await admin.query(`UPDATE dataset.especie SET taxon_id = NULL WHERE id = $1`, [C.id]);

  const obs = async (user, clase, extra = {}) => {
    const { rows: [o] } = await admin.query(
      `INSERT INTO observations.observations (user_id, image_key, thumbnail_key, notes, is_private, created_at)
       VALUES ($1, 'k.webp', $2, $3, $4, now() - ($5 || ' minutes')::interval) RETURNING id`,
      [user, `th_${clase || 'sin'}_${extra.n || 0}.webp`, extra.notes || null, !!extra.priv, String(extra.min ?? 1)]);
    if (clase) await admin.query(`INSERT INTO ai.predictions (observation_id, model_version, top_class, top_probability) VALUES ($1,'m',$2,0.9)`, [o.id, clase]);
    return o.id;
  };
  const o1 = await obs(ua.id, 'Boana boans', { n: 1, min: 3 });
  const o2 = await obs(ua.id, 'Boana_boans', { n: 2, min: 2 });          // formato viejo con guion bajo
  const o3 = await obs(ub.id, 'Dendropsophus columbianus', { n: 3, min: 1 }); // especie sin ficha publicada
  const o4 = await obs(ua.id, 'Boana boans', { n: 4, priv: true, min: 0 });   // privada
  const o5 = await obs(ub.id, null, { n: 5, min: 5 });                        // sin predicción

  // Catálogo del dataset-service (stub de /publico/catalogo para /stats).
  const catalogoActual = async () => contenido.catalogo(dsPool);
  const stub = http.createServer(async (req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await catalogoActual())); }).listen(39271, '127.0.0.1');

  const svc = spawn(process.execPath, ['src/index.js'], {
    cwd: 'D:/server/Anura/services/explorer-service',
    env: { ...process.env, NODE_PATH: NM, PORT: String(PORT), DATABASE_URL: URL('explorer_service'),
      DATASET_SERVICE_URL: 'http://127.0.0.1:39271', JWT_SECRET: 'anura_secret' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

    console.log('Permisos (roles reales)');
    await t('explorer_service lee la vista por columnas', async () => {
      const r = await exPool.query('SELECT taxon_id, nombre_cientifico, nombre_comun, clase, orden FROM dataset.especie_publica');
      assert.deepStrictEqual(r.rows.map((x) => x.nombre_cientifico), ['Boana boans']);
    });
    await t('explorer_service NO lee la ficha completa ni las tablas de dataset', async () => {
      await assert.rejects(exPool.query('SELECT publicada FROM dataset.especie_publica'), /permission denied/);
      await assert.rejects(exPool.query('SELECT * FROM dataset.especie_publica'), /permission denied/);
      await assert.rejects(exPool.query('SELECT * FROM dataset.especie'), /permission denied/);
      await assert.rejects(exPool.query('SELECT * FROM dataset.species_content'), /permission denied/);
    });
    await t('auth_service solo lee nombre común/científico (mapa del panel)', async () => {
      const r = await authPool.query(`SELECT o.id, COALESCE(o.common_name, ep.nombre_comun, p.top_class, 'Rana') AS common_name
        FROM observations.observations o LEFT JOIN ai.predictions p ON p.observation_id = o.id
        LEFT JOIN dataset.especie_publica ep ON lower(replace(p.top_class, '_', ' ')) = lower(ep.nombre_cientifico)`);
      const por = new Map(r.rows.map((x) => [x.id, x.common_name]));
      assert.strictEqual(por.get(o1), 'Rana mono'); assert.strictEqual(por.get(o2), 'Rana mono');
      assert.strictEqual(por.get(o3), 'Dendropsophus columbianus'); assert.strictEqual(por.get(o5), 'Rana');
      await assert.rejects(authPool.query('SELECT taxon_id FROM dataset.especie_publica'), /permission denied/);
    });
    await t('el catálogo del dataset-service (usa la vista) trae solo la pública', async () => {
      const c = await catalogoActual();
      assert.deepStrictEqual(c.especies.map((e) => e.taxon_id), [A.taxon_id]);
      assert.strictEqual(c.especies[0].nombre_comun, 'Rana mono');
    });

    console.log('Sugerencias');
    await t('encuentra por nombre científico, común, género, familia', async () => {
      for (const q of ['boana boans', 'Rana mono', 'boa', 'Hylidae', 'boans']) {
        const { status, cuerpo } = await get('/api/explorer/suggest?q=' + encodeURIComponent(q));
        assert.strictEqual(status, 200);
        const tx = cuerpo.filter((s) => s.type === 'taxon');
        assert.strictEqual(tx.length, 1, q + ' -> ' + JSON.stringify(cuerpo));
        assert.strictEqual(tx[0].id, A.taxon_id);
        assert.strictEqual(tx[0].scientific_name, 'Boana boans');
        assert.strictEqual(tx[0].common_name, 'Rana mono');
        assert.strictEqual(tx[0].family, 'Hylidae');
        assert.strictEqual(tx[0].slug, `${A.taxon_id}-Boana-boans`);
      }
    });
    await t('no sugiere especies sin ficha publicada, en revisión ni sin taxon_id', async () => {
      for (const q of ['Dendropsophus', 'columbianus', 'Rhinella', 'Pristimantis', 'Ranita paisa']) {
        const { cuerpo } = await get('/api/explorer/suggest?q=' + encodeURIComponent(q));
        assert.deepStrictEqual(cuerpo.filter((s) => s.type === 'taxon'), [], q);
      }
    });
    await t('sigue sugiriendo usuarios', async () => {
      const { cuerpo } = await get('/api/explorer/suggest?q=observ');
      assert.deepStrictEqual(cuerpo.filter((s) => s.type === 'user').map((u) => u.username), ['observadora']);
    });

    console.log('Búsqueda');
    await t('taxa: solo la pública, con conteo y miniatura no privada', async () => {
      const { cuerpo } = await get('/api/explorer/search?q=boana');
      assert.strictEqual(cuerpo.taxa.length, 1);
      const x = cuerpo.taxa[0];
      assert.strictEqual(x.id, A.taxon_id); assert.strictEqual(x.scientific_name, 'Boana boans');
      assert.strictEqual(x.class_name, 'Amphibia'); assert.strictEqual(x.order_name, 'Anura');
      assert.strictEqual(x.slug, `${A.taxon_id}-Boana-boans`);
      assert.strictEqual(x.obs_count, 3); // o1 + o2 (guion bajo) + la privada (recuento previo, sin cambio)
      assert.strictEqual(x.thumbnail_key, 'th_Boana_boans_2.webp'); // la más reciente NO privada (la privada es más nueva)
    });
    await t('búsqueda de especie sin ficha publicada: vacía', async () => {
      for (const q of ['dendro', 'Rhinella', 'paisa']) {
        const { cuerpo } = await get('/api/explorer/search?q=' + q);
        assert.deepStrictEqual(cuerpo.taxa, [], q);
      }
    });

    console.log('Feed');
    const feed = async (q = '') => (await get('/api/explorer/feed' + q)).cuerpo;
    await t('feed: datos de catálogo para la especie pública, incluso con guion bajo; sin la privada', async () => {
      const f = await feed();
      assert.deepStrictEqual(new Set(f.map((x) => x.id)), new Set([o1, o2, o3, o5]));
      for (const id of [o1, o2]) {
        const x = f.find((r) => r.id === id);
        assert.strictEqual(x.taxon_id, A.taxon_id); assert.strictEqual(x.common_name, 'Rana mono');
        assert.strictEqual(x.genus, 'Boana'); assert.strictEqual(x.species, 'boans');
        assert.strictEqual(x.family, 'Hylidae'); assert.strictEqual(x.order_name, 'Anura'); assert.strictEqual(x.class_name, 'Amphibia');
      }
    });
    await t('feed: observación de una especie sin ficha publicada se ve, sin datos de catálogo', async () => {
      const x = (await feed()).find((r) => r.id === o3);
      assert.strictEqual(x.ai_class, 'Dendropsophus columbianus');
      assert.strictEqual(x.taxon_id, null); assert.strictEqual(x.common_name, null); assert.strictEqual(x.family, null);
      const s = (await feed()).find((r) => r.id === o5);
      assert.strictEqual(s.ai_class, null); assert.strictEqual(s.taxon_id, null);
    });
    await t('feed con búsqueda ?q= por nombre común y epíteto', async () => {
      assert.deepStrictEqual(new Set((await feed('?q=mono')).map((x) => x.id)), new Set([o1, o2]));
      assert.deepStrictEqual(new Set((await feed('?q=boans')).map((x) => x.id)), new Set([o1, o2]));
      assert.deepStrictEqual((await feed('?q=Dendropsophus')).map((x) => x.id), [o3]);
    });

    console.log('Detalle de observación');
    await t('detalle con especie pública', async () => {
      for (const id of [o1, o2]) {
        const { status, cuerpo } = await get('/api/explorer/observation/' + id);
        assert.strictEqual(status, 200);
        assert.strictEqual(cuerpo.taxon_id, A.taxon_id); assert.strictEqual(cuerpo.common_name, 'Rana mono');
        assert.strictEqual(cuerpo.genus, 'Boana'); assert.strictEqual(cuerpo.family, 'Hylidae');
      }
    });
    await t('detalle con especie sin ficha publicada: sin catálogo', async () => {
      const { status, cuerpo } = await get('/api/explorer/observation/' + o3);
      assert.strictEqual(status, 200); assert.strictEqual(cuerpo.taxon_id, null); assert.strictEqual(cuerpo.ai_class, 'Dendropsophus columbianus');
    });
    await t('la privada sigue siendo privada', async () => {
      assert.strictEqual((await get('/api/explorer/observation/' + o4)).status, 403);
    });

    console.log('Especies, observadores, favoritos y stats');
    await t('/species: la pública con taxon_id y nombre común; la no publicada sin taxon_id', async () => {
      const { cuerpo } = await get('/api/explorer/species');
      const b = cuerpo.find((s) => s.scientific_name === 'Boana boans');
      assert.ok(b, JSON.stringify(cuerpo));
      assert.strictEqual(b.taxon_id, A.taxon_id); assert.strictEqual(b.common_name, 'Rana mono');
      const d = cuerpo.find((s) => s.scientific_name === 'Dendropsophus columbianus');
      assert.strictEqual(d.taxon_id, null); assert.strictEqual(d.common_name, null);
    });
    await t('/observers/by-species: solo con especies públicas', async () => {
      const a = (await get('/api/explorer/observers/by-species?q=boana')).cuerpo;
      assert.deepStrictEqual(a.map((u) => u.username), ['observadora']);
      assert.deepStrictEqual((await get('/api/explorer/observers/by-species?q=dendro')).cuerpo, []);
    });
    await t('favoritos (propios y de un perfil) traen la especie pública', async () => {
      await admin.query(`INSERT INTO observations.favorites (user_id, observation_id) VALUES ($1,$2),($1,$3)`, [ub.id, o1, o3]);
      const tk = jwt.sign({ id: ub.id, username: 'fotografo' }, 'anura_secret');
      const propios = (await get('/api/explorer/favorites/feed', tk)).cuerpo;
      const porUsuario = (await get('/api/explorer/favorites/feed/user/fotografo')).cuerpo;
      for (const lista of [propios, porUsuario]) {
        assert.strictEqual(lista.length, 2);
        assert.strictEqual(lista.find((x) => x.id === o1).taxon_id, A.taxon_id);
        assert.strictEqual(lista.find((x) => x.id === o1).common_name, 'Rana mono');
        assert.strictEqual(lista.find((x) => x.id === o3).taxon_id, null);
      }
    });
    await t('/stats cuenta solo especies públicas (dataset-service)', async () => {
      const { cuerpo } = await get('/api/explorer/stats');
      assert.strictEqual(cuerpo.species, 1); assert.strictEqual(cuerpo.genera, 1); assert.strictEqual(cuerpo.families, 1);
    });

    console.log('Publicar / despublicar desde Contenido');
    const catalogoFresco = () => new Promise((r) => setTimeout(r, 0));
    await t('al publicar la ficha de B aparece en sugerencias, búsqueda, feed y detalle (sin reiniciar)', async () => {
      await admin.query(`UPDATE dataset.species_content SET estado='publicada', version=1, publicado_en=now(),
        publicada='{"campos":{"nombre_comun":{"valor":"Ranita de Colombia","fuente":"x"}},"galeria":[]}'::jsonb WHERE especie_id=$1`, [B.id]);
      const sug = (await get('/api/explorer/suggest?q=dendro')).cuerpo.filter((s) => s.type === 'taxon');
      assert.strictEqual(sug.length, 1); assert.strictEqual(sug[0].id, B.taxon_id);
      assert.strictEqual((await get('/api/explorer/search?q=columbianus')).cuerpo.taxa[0].obs_count, 1);
      const x = (await feed()).find((r) => r.id === o3);
      assert.strictEqual(x.taxon_id, B.taxon_id); assert.strictEqual(x.common_name, 'Ranita de Colombia');
      assert.strictEqual((await get('/api/explorer/observation/' + o3)).cuerpo.taxon_id, B.taxon_id);
    });
    await t('al despublicar A desaparece de todo', async () => {
      await admin.query(`UPDATE dataset.species_content SET estado='borrador', publicada=NULL WHERE especie_id=$1`, [A.id]);
      assert.deepStrictEqual((await get('/api/explorer/suggest?q=boana')).cuerpo.filter((s) => s.type === 'taxon'), []);
      assert.deepStrictEqual((await get('/api/explorer/search?q=boana')).cuerpo.taxa, []);
      const x = (await feed()).find((r) => r.id === o1);
      assert.strictEqual(x.taxon_id, null); assert.strictEqual(x.common_name, null); assert.strictEqual(x.ai_class, 'Boana boans');
    });
    await catalogoFresco();
    console.log(`\nTodo bien: ${ok} comprobaciones.`);
  } finally {
    svc.kill(); stub.close();
    await Promise.all([admin.end(), dsPool.end(), authPool.end(), exPool.end()]);
  }
})().catch((e) => { console.error('FALLA:', e.message); process.exit(1); });
