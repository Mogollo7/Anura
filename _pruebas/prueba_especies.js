// Prueba de Admin → Especies (crear/editar) contra la base desechable anura_especies, con el rol
// real dataset_service. Levanta un auth de mentira y dataset-service en :39120.
const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');
const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');

const BD_ADMIN = 'postgres://postgres:prueba@127.0.0.1:55432/anura_especies';
const BD_SERVICIO = 'postgres://dataset_service:p@127.0.0.1:55432/anura_especies';
const SUPER_ID = 'd81f2281-6086-435e-9de6-603f766fdf5e';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (id) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id })}.firma`;
const T = { super: token(SUPER_ID), tax: token(SUPER_ID), ver: token(SUPER_ID), fuera: token(SUPER_ID) };
// Una firma distinta por cuenta para que el auth de mentira las distinga.
T.super += 'S'; T.tax += 'T'; T.ver += 'V'; T.fuera += 'F';
const CUENTAS = {
  S: { id: 'a', name: 'Super', email: 's@x', isSuperAdmin: true, permissions: {} },
  T: { id: 'b', name: 'Taxonomía', email: 't@x', isSuperAdmin: false, permissions: { editarTaxonomia: true, verEspecies: true } },
  V: { id: 'c', name: 'Solo ver', email: 'v@x', isSuperAdmin: false, permissions: { verEspecies: true } },
};

const auth = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const k = (req.headers.authorization || '').slice(-1);
  const cuenta = CUENTAS[k];
  if (!cuenta) { res.statusCode = 403; return res.end('{}'); }
  res.end(JSON.stringify({ account: cuenta }));
}).listen(39121, '127.0.0.1');

const svc = spawn(process.execPath, ['src/index.js'], {
  cwd: 'D:/server/Anura/services/dataset-service',
  env: { ...process.env, PORT: '39120', DATABASE_URL: BD_SERVICIO, AUTH_SERVICE_URL: 'http://127.0.0.1:39121',
    MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39129', MINIO_ROOT_USER: 'x', MINIO_ROOT_PASSWORD: 'xxxxxxxx' },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const base = 'http://127.0.0.1:39120';
async function llamar(metodo, ruta, cuerpo, tk = T.super) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
}
const esperar = (r, status, msg) => assert.strictEqual(r.status, status, `${msg || ''} esperaba ${status}, llegó ${r.status}: ${JSON.stringify(r.body)}`);

let pasos = 0;
const ok = (t) => { pasos += 1; console.log(`  ok ${pasos}. ${t}`); };

(async () => {
  const admin = new Pool({ connectionString: BD_ADMIN });
  const q = (s, p) => admin.query(s, p);
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(base + '/health')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  await q(`INSERT INTO auth.users (id, username, email) VALUES ($1, 'sebas', 'prueba@anura.test') ON CONFLICT DO NOTHING`, [SUPER_ID]);
  // Base limpia para que la prueba sea repetible.
  await q(`TRUNCATE dataset.destacado, dataset.species_content, dataset.foto, dataset.observacion, dataset.especie RESTART IDENTITY CASCADE`);
  await q(`DELETE FROM audit.log WHERE action LIKE 'dataset.especie.%'`);
  await q(`SELECT setval('dataset.taxon_id_seq', 1, false)`);

  // ── permisos ──
  esperar(await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Boana boans', familia: 'Hylidae' }, null), 401);
  esperar(await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Boana boans', familia: 'Hylidae' }, T.ver), 403, 'solo verEspecies');
  esperar(await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Boana boans', familia: 'Hylidae' }, T.fuera), 403, 'fuera del panel');
  esperar(await llamar('PUT', '/api/dataset/especies/1', { familia: 'Hylidae' }, T.ver), 403);
  ok('sin sesión 401; sin editarTaxonomia 403 (crear y editar)');

  // ── validaciones 400 ──
  const malas = [
    [{ nombre_cientifico: '', familia: 'Hylidae' }, /Escribe el nombre/],
    [{ nombre_cientifico: 'Boana', familia: 'Hylidae' }, /dos palabras/],
    [{ nombre_cientifico: 'Boana boans faber', familia: 'Hylidae' }, /dos palabras/],
    [{ nombre_cientifico: 'Boana boans (Linnaeus, 1758)', familia: 'Hylidae' }, /dos palabras/],
    [{ nombre_cientifico: 'Boana b0ans', familia: 'Hylidae' }, /epíteto/],
    [{ nombre_cientifico: 'Bóana boans', familia: 'Hylidae' }, /género/],
    [{ nombre_cientifico: 'Boana sp', familia: 'Hylidae' }, /sin identificar/],
    [{ nombre_cientifico: 'Boana boans', familia: '' }, /Escribe la familia/],
    [{ nombre_cientifico: 'Boana boans' }, /Escribe la familia/],
    [{ nombre_cientifico: 'Boana boans', familia: 'Hyla' }, /idae/],
    [{ nombre_cientifico: 'Boana boans', familia: 'Hylidae', genero: 'Rhinella' }, /no coincide/],
    [{ nombre_cientifico: 42, familia: 'Hylidae' }, /dos palabras|género/],
  ];
  for (const [cuerpo, re] of malas) {
    const r = await llamar('POST', '/api/dataset/especies', cuerpo);
    esperar(r, 400, JSON.stringify(cuerpo));
    assert.match(r.body.message, re, `mensaje de ${JSON.stringify(cuerpo)}: ${r.body.message}`);
  }
  assert.strictEqual((await q('SELECT COUNT(*)::int n FROM dataset.especie')).rows[0].n, 0, 'las validaciones no deben crear filas');
  ok(`${malas.length} validaciones 400 con mensaje que dice qué corregir; no se crea nada`);

  // ── crear ──
  let r = await llamar('POST', '/api/dataset/especies', { nombre_cientifico: '  boana   BOANS ', familia: 'hylidae', genero: 'BOANA' });
  esperar(r, 201);
  const boans = r.body;
  assert.deepStrictEqual(
    [boans.nombre_cientifico, boans.genero, boans.familia, boans.carpeta, boans.taxon_id],
    ['Boana boans', 'Boana', 'Hylidae', 'Boana_boans', 'COL_ANURA_0001']);
  r = await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Boana faber', familia: 'Hylidae' }, T.tax);
  esperar(r, 201);
  const faber = r.body;
  assert.strictEqual(faber.taxon_id, 'COL_ANURA_0002');
  ok('crear normaliza (mayúsculas/espacios), deriva género, carpeta y taxon_id COL_ANURA_0001/0002; sirve con solo editarTaxonomia');

  // ── duplicado ──
  r = await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'boana BOANS', familia: 'Hylidae' });
  esperar(r, 409);
  assert.strictEqual(r.body.codigo, 'especie_existente');
  assert.strictEqual(r.body.detalle.especie_id, boans.id);
  assert.match(r.body.message, /Ya existe Boana boans \(COL_ANURA_0001\)/);
  ok('duplicado (sin distinguir mayúsculas) 409 con el id de la existente');

  // ── coherencia género-familia ──
  r = await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Boana pardalis', familia: 'Leptodactylidae' });
  esperar(r, 409);
  assert.strictEqual(r.body.codigo, 'familia_del_genero');
  assert.match(r.body.message, /Boana ya está en Hylidae/);
  assert.deepStrictEqual(r.body.detalle.especies, ['Boana boans', 'Boana faber']);
  ok('género en otra familia: 409 familia_del_genero con las especies afectadas');

  // ── carrera: cinco altas simultáneas del mismo nombre ──
  const carrera = await Promise.all(Array.from({ length: 5 }, () => llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Rhinella horribilis', familia: 'Bufonidae' })));
  assert.strictEqual(carrera.filter((x) => x.status === 201).length, 1, JSON.stringify(carrera.map((x) => x.status)));
  assert.strictEqual(carrera.filter((x) => x.status === 409).length, 4);
  const horribilis = carrera.find((x) => x.status === 201).body;
  assert.strictEqual(horribilis.taxon_id, 'COL_ANURA_0003', 'la secuencia no debe saltar por los intentos perdidos de alta duplicada');
  ok('5 altas simultáneas del mismo nombre: una gana, 4 dan 409; taxon_id sin huecos');

  // ── la secuencia nunca reutiliza un id ──
  await q('DELETE FROM dataset.especie WHERE id = $1', [horribilis.id]);
  r = await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Rhinella marina', familia: 'Bufonidae' });
  esperar(r, 201);
  assert.strictEqual(r.body.taxon_id, 'COL_ANURA_0004');
  const marina = r.body;
  ok('un taxon_id borrado no se vuelve a dar (COL_ANURA_0004)');

  // ── carpeta ocupada por una especie renombrada ──
  r = await llamar('PUT', `/api/dataset/especies/${marina.id}`, { nombre_cientifico: 'Rhinella horrida' });
  esperar(r, 200);
  assert.strictEqual(r.body.carpeta, 'Rhinella_marina', 'la carpeta no cambia al renombrar');
  assert.strictEqual(r.body.taxon_id, 'COL_ANURA_0004');
  r = await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Rhinella marina', familia: 'Bufonidae' });
  esperar(r, 201);
  assert.strictEqual(r.body.carpeta, 'Rhinella_marina_2');
  ok('renombrar conserva id, carpeta y taxon_id; un alta con el nombre viejo recibe otra carpeta');

  // ── aparece en el resumen aunque no tenga fotos ──
  r = await llamar('GET', '/api/dataset/resumen');
  esperar(r, 200);
  const enResumen = r.body.especies.find((e) => e.id === boans.id);
  assert.ok(enResumen && enResumen.fotos === 0 && enResumen.taxon_id === 'COL_ANURA_0001');
  ok('la especie nueva sale en /resumen con 0 fotos');

  // ── catálogo público: solo con ficha publicada ──
  let cat = (await llamar('GET', '/api/dataset/publico/catalogo', undefined, null)).body;
  assert.strictEqual(cat.especies.length, 0, 'sin ficha publicada no sale en público');
  const v0 = cat.version;
  await q(`INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud) VALUES ('manual', 'x1', 6.2, -75.5)`);
  const { rows: [obs] } = await q(`SELECT id FROM dataset.observacion WHERE fuente_id = 'x1'`);
  const sha = 'c'.repeat(64);
  await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, licencia, atribucion, estado)
           VALUES ($1, 'k-c', $2, $3, 'c.jpg', 'cc-by', 'Alguien', 'catalogo')`, [sha, boans.id, obs.id]);
  esperar(await llamar('PUT', `/api/dataset/contenido/${boans.id}`, {
    campos: { nombre_comun: { valor: 'Rana platanera', fuente: 'Manual' }, uicn: { categoria: 'LC', fuente: 'UICN' }, toxicidad: { nivel: 'inofensiva', fuente: 'Manual' } },
    foto_principal_sha256: sha,
  }), 200);
  esperar(await llamar('POST', `/api/dataset/contenido/${boans.id}/revision`, {}), 200);
  esperar(await llamar('POST', `/api/dataset/contenido/${boans.id}/publicar`, {}), 200);
  cat = (await llamar('GET', '/api/dataset/publico/catalogo', undefined, null)).body;
  assert.strictEqual(cat.especies.length, 1);
  const pub = cat.especies[0];
  assert.deepStrictEqual([pub.taxon_id, pub.nombre_cientifico, pub.genero, pub.familia], ['COL_ANURA_0001', 'Boana boans', 'Boana', 'Hylidae']);
  const man = (await llamar('GET', '/api/dataset/publico/manifiesto', undefined, null)).body;
  assert.strictEqual(man.version, cat.version);
  assert.notStrictEqual(man.version, v0);
  ok('con la ficha publicada la especie llega al catálogo público y al manifiesto (mismo dato, misma versión)');

  // ── editar: el cambio de taxonomía llega al público y cambia la versión ──
  esperar(await llamar('PUT', `/api/dataset/especies/${boans.id}`, {}), 400);
  esperar(await llamar('PUT', `/api/dataset/especies/${boans.id}`, { nombre_cientifico: 'Boana boans', familia: 'Hylidae' }), 400);
  esperar(await llamar('PUT', '/api/dataset/especies/99999', { familia: 'Hylidae' }), 404);
  esperar(await llamar('PUT', '/api/dataset/especies/abc', { familia: 'Hylidae' }), 404);
  r = await llamar('PUT', `/api/dataset/especies/${boans.id}`, { nombre_cientifico: 'Boana faber', familia: 'Hylidae' });
  esperar(r, 409); assert.strictEqual(r.body.codigo, 'especie_existente');
  r = await llamar('PUT', `/api/dataset/especies/${boans.id}`, { nombre_cientifico: 'Boana', familia: 'Hylidae' });
  esperar(r, 400);
  r = await llamar('PUT', `/api/dataset/especies/${boans.id}`, { nombre_cientifico: 'Boana pardalis' }, T.tax);
  esperar(r, 200);
  assert.deepStrictEqual([r.body.nombre_cientifico, r.body.carpeta, r.body.taxon_id, r.body.congeneres_corregidos], ['Boana pardalis', 'Boana_boans', 'COL_ANURA_0001', 0]);
  const cat2 = (await llamar('GET', '/api/dataset/publico/catalogo', undefined, null)).body;
  assert.strictEqual(cat2.especies[0].nombre_cientifico, 'Boana pardalis');
  assert.notStrictEqual(cat2.version, cat.version);
  ok('editar: sin cambios 400, 404, nombre repetido 409; renombrar actualiza el catálogo público y su versión');

  // ── familia de todo el género ──
  r = await llamar('PUT', `/api/dataset/especies/${faber.id}`, { familia: 'Leptodactylidae' });
  esperar(r, 409); assert.strictEqual(r.body.codigo, 'familia_del_genero');
  assert.strictEqual((await q('SELECT familia FROM dataset.especie WHERE id = $1', [faber.id])).rows[0].familia, 'Hylidae', 'el 409 no cambia nada');
  r = await llamar('PUT', `/api/dataset/especies/${faber.id}`, { familia: 'Leptodactylidae', aplicar_a_congeneres: true });
  esperar(r, 200);
  assert.strictEqual(r.body.congeneres_corregidos, 1);
  const fam = (await q(`SELECT familia FROM dataset.especie WHERE genero = 'Boana'`)).rows.map((x) => x.familia);
  assert.deepStrictEqual(fam, ['Leptodactylidae', 'Leptodactylidae']);
  ok('cambiar la familia de un género: 409 y sin efecto; con confirmación se corrige el género completo');

  // ── auditoría ──
  const { rows: aud } = await q(`SELECT action, actor_id, target_type, target_id, metadata FROM audit.log WHERE action LIKE 'dataset.especie.%' ORDER BY created_at`);
  const acciones = aud.map((a) => a.action);
  assert.strictEqual(acciones.filter((a) => a === 'dataset.especie.creada').length, 5, acciones.join(','));
  assert.ok(acciones.includes('dataset.especie.editada'));
  const ed = aud.filter((a) => a.action === 'dataset.especie.editada').pop();
  assert.strictEqual(ed.actor_id, SUPER_ID);
  assert.strictEqual(ed.target_type, 'especie');
  assert.strictEqual(ed.metadata.antes.familia, 'Hylidae');
  assert.strictEqual(ed.metadata.despues.familia, 'Leptodactylidae');
  assert.strictEqual(ed.metadata.congeneres_corregidos.length, 1);
  const cr = aud.find((a) => a.action === 'dataset.especie.creada');
  assert.deepStrictEqual([cr.metadata.taxon_id, cr.metadata.carpeta], ['COL_ANURA_0001', 'Boana_boans']);
  ok('audit.log: 5 altas y las ediciones, con antes/después y congéneres corregidos');

  // ── una alta que falla no deja rastro ──
  const n0 = (await q(`SELECT COUNT(*)::int n FROM audit.log WHERE action = 'dataset.especie.creada'`)).rows[0].n;
  await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Boana boans', familia: 'Hylidae' });
  await llamar('POST', '/api/dataset/especies', { nombre_cientifico: 'Boana zzzz', familia: 'Bufonidae' });
  assert.strictEqual((await q(`SELECT COUNT(*)::int n FROM audit.log WHERE action = 'dataset.especie.creada'`)).rows[0].n, n0);
  ok('las altas rechazadas no escriben auditoría ni gastan taxon_id visible');

  console.log(`\nTodo bien: ${pasos} bloques`);
  await admin.end();
})().then(() => { svc.kill(); auth.close(); process.exit(0); }).catch((e) => {
  console.error('\nFALLÓ:', e.message);
  svc.kill(); auth.close(); process.exit(1);
});
