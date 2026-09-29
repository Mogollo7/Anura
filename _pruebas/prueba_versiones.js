// Prueba de la versión del dataset (versiones.js) contra la base desechable anura_versiones. node prueba_versiones.js
const assert = require('assert');
const SRC = 'D:/server/Anura/services/dataset-service/src';
const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');
const v = require(`${SRC}/versiones.js`);
const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_versiones' });
const USER = 'd81f2281-6086-435e-9de6-603f766fdf5e';
const q = (s, p) => pool.query(s, p);
const sha = (i) => require('crypto').createHash('sha256').update(`f${i}`).digest('hex');

async function espera(promesa, status) {
  try { await promesa; } catch (e) { assert.strictEqual(e.status, status, `esperaba ${status}, llegó ${e.status}: ${e.message}`); return e.message; }
  throw new Error(`esperaba error ${status} y no falló`);
}

(async () => {
  // ── 1. Regla de reparto: la misma del importador de Python (round bancario, mínimo 1 en val y test desde 3) ──
  // n=5: train=round(3.5)=4 → min(4, 3) = 3; val = max(1, min(round(.75) = 1, 5-3-1 = 1)) = 1; test = 1.
  const casos = { 1: [1, 0, 0], 2: [1, 0, 1], 3: [1, 1, 1], 4: [2, 1, 1], 5: [3, 1, 1], 10: [7, 2, 1], 12: [8, 2, 2], 20: [14, 3, 3], 100: [70, 15, 15] };
  for (const [n, esp] of Object.entries(casos)) {
    const r = v.repartir(Number(n));
    assert.deepStrictEqual([r.train, r.val, r.test], esp, `n=${n}: ${JSON.stringify(r)}`);
  }
  console.log('reparto por individuo: OK');

  // ── 2. asignar: individuos enteros, determinista, y cada especie con ≥3 individuos tiene val y test ──
  const fotos = [];
  let k = 0;
  for (const esp of [1, 2]) {
    for (let ind = 0; ind < 10; ind++) {
      for (let f = 0; f < 1 + (ind % 3); f++) fotos.push({ sha256: sha(k++), especie_id: esp, individuo: String(1000 * esp + ind) });
    }
  }
  const a1 = v.asignar(fotos);
  const a2 = v.asignar([...fotos].reverse());
  const mapa = (a) => new Map(a.map((x) => [x.sha256, x.particion]));
  assert.deepStrictEqual([...mapa(a1)].sort(), [...mapa(a2)].sort(), 'el orden de entrada no cambia el reparto');
  const partDe = mapa(a1);
  const porInd = new Map();
  for (const f of fotos) {
    const s = porInd.get(f.individuo) ?? new Set();
    s.add(partDe.get(f.sha256));
    porInd.set(f.individuo, s);
  }
  for (const [ind, s] of porInd) assert.strictEqual(s.size, 1, `individuo ${ind} repartido en ${[...s]}`);
  for (const esp of [1, 2]) {
    const inds = new Map();
    for (const f of fotos.filter((x) => x.especie_id === esp)) inds.set(f.individuo, partDe.get(f.sha256));
    const c = { train: 0, val: 0, test: 0 };
    for (const p of inds.values()) c[p]++;
    assert.deepStrictEqual(c, { train: 7, val: 2, test: 1 }, `especie ${esp}: ${JSON.stringify(c)}`);
  }
  assert.notDeepStrictEqual([...mapa(v.asignar(fotos, undefined, 'otra'))].sort(), [...mapa(a1)].sort(), 'otra semilla, otro reparto');
  console.log('asignar (individuos juntos, determinista, mínimos): OK');

  // ── 3. Contra la base ──
  await q('TRUNCATE dataset.version, dataset.version_foto, dataset.exclusion, dataset.foto, dataset.observacion, dataset.especie, audit.log RESTART IDENTITY CASCADE');
  await q(`INSERT INTO auth.users (id, username, email) VALUES ($1, 'sebas', 'prueba@anura.test') ON CONFLICT DO NOTHING`, [USER]);
  await espera(v.crear(pool, {}, USER), 409); // sin fotos
  let l = await v.listar(pool);
  assert.deepStrictEqual([l.versiones.length, l.vigente, l.cambios.elegibles], [0, null, 0]);

  const esp = [];
  for (const [carpeta, nombre, taxon] of [['A', 'Pristimantis alfa', 'COL_ANURA_0001'], ['B', 'Boana beta', 'COL_ANURA_0002'], ['C', 'Fuera catalogo', null]]) {
    const { rows: [e] } = await q('INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [carpeta, nombre, nombre.split(' ')[0], 'Hylidae', taxon]);
    esp.push(e.id);
  }
  const obsDe = {};
  let n = 0;
  for (const e of esp) {
    obsDe[e] = [];
    for (let ind = 0; ind < 10; ind++) {
      const { rows: [o] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud) VALUES ('manual', $1, 6.2, -75.5) RETURNING id`, [`${e}-${ind}`]);
      obsDe[e].push(o.id);
      for (let f = 0; f < 2; f++) {
        await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado) VALUES ($1,$2,$3,$4,$5,'catalogo')`,
          [sha(1000 + n), `k/${n}`, e, o.id, `f${n}.jpg`]);
        n++;
      }
    }
  }
  // Una observación invalidada y una foto excluida en la especie A: no entran a la versión.
  await q(`UPDATE dataset.observacion SET invalidada_motivo = 'no es la especie' WHERE id = $1`, [obsDe[esp[0]][0]]);
  const { rows: [fx] } = await q('SELECT sha256 FROM dataset.foto WHERE observacion_id = $1 LIMIT 1', [obsDe[esp[0]][1]]);
  await q(`INSERT INTO dataset.exclusion (sha256, motivo, por, origen) VALUES ($1, 'borrosa', $2, 'curacion')`, [fx.sha256, USER]);

  l = await v.listar(pool);
  // A: 10 obs × 2 fotos − 2 (invalidada) − 1 (excluida) = 17; B: 20; C (sin taxon_id) fuera.
  assert.strictEqual(l.cambios.elegibles, 37, `elegibles ${l.cambios.elegibles}`);
  assert.strictEqual(l.cambios.nuevas, 37);

  const r = await v.crear(pool, { nombre: 'prueba-1' }, USER);
  assert.strictEqual(r.nombre, 'prueba-1');
  assert.strictEqual(r.fotos.train + r.fotos.val + r.fotos.test, 37);
  assert.strictEqual(r.especies, 2);
  assert.strictEqual(r.individuos, 9 + 10, 'la observación invalidada no cuenta; la excluida sigue siendo individuo por su otra foto');
  const { rows: [tot] } = await q('SELECT COUNT(*)::int AS n FROM dataset.version_foto WHERE version_id = $1', [r.id]);
  assert.strictEqual(tot.n, 37);
  const { rows: fueraDeCatalogo } = await q('SELECT 1 FROM dataset.version_foto vf JOIN dataset.foto f ON f.sha256 = vf.sha256 WHERE f.especie_id = $1', [esp[2]]);
  assert.strictEqual(fueraDeCatalogo.length, 0, 'las especies sin taxon_id no entran');
  const { rows: excl } = await q('SELECT 1 FROM dataset.version_foto WHERE sha256 = $1', [fx.sha256]);
  assert.strictEqual(excl.length, 0, 'la foto excluida no entra');
  // Un individuo nunca queda partido entre particiones.
  const { rows: partidos } = await q(`
    SELECT f.observacion_id FROM dataset.version_foto vf JOIN dataset.foto f ON f.sha256 = vf.sha256
    GROUP BY f.observacion_id HAVING COUNT(DISTINCT vf.particion) > 1`);
  assert.strictEqual(partidos.length, 0);
  const { rows: [aud] } = await q(`SELECT metadata FROM audit.log WHERE action = 'dataset.version.creada'`);
  assert.strictEqual(aud.metadata.nombre, 'prueba-1');

  l = await v.listar(pool);
  assert.strictEqual(l.vigente, r.id);
  assert.deepStrictEqual([l.cambios.nuevas, l.cambios.salientes], [0, 0]);
  assert.strictEqual(l.versiones[0].train + l.versiones[0].val + l.versiones[0].test, 37);

  // Cambios desde la vigente: una foto nueva y una exclusión nueva.
  await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado) VALUES ($1,'k/x',$2,$3,'x.jpg','catalogo')`, [sha(9999), esp[1], obsDe[esp[1]][0]]);
  const { rows: [fy] } = await q('SELECT sha256 FROM dataset.foto WHERE observacion_id = $1 AND sha256 <> $2 LIMIT 1', [obsDe[esp[1]][1], sha(9999)]);
  await q(`INSERT INTO dataset.exclusion (sha256, motivo, por, origen) VALUES ($1, 'borrosa', $2, 'curacion')`, [fy.sha256, USER]);
  l = await v.listar(pool);
  assert.deepStrictEqual([l.cambios.nuevas, l.cambios.salientes], [1, 1]);

  // Nombre repetido → 409; nombre automático si no se da; proporciones inválidas → 400.
  await espera(v.crear(pool, { nombre: 'prueba-1' }, USER), 409);
  await espera(v.crear(pool, { proporciones: [0.5, 0.5, 0.5] }, USER), 400);
  await espera(v.crear(pool, { proporciones: [0.6, 0.4] }, USER), 400);
  const r2 = await v.crear(pool, {}, USER);
  assert.ok(/^v2-\d{8}$/.test(r2.nombre), r2.nombre);
  assert.ok(r2.id > r.id);
  l = await v.listar(pool);
  assert.strictEqual(l.vigente, r2.id);
  assert.strictEqual(l.versiones.length, 2);
  assert.deepStrictEqual([l.cambios.nuevas, l.cambios.salientes], [0, 0]);
  // Las versiones anteriores no se tocan.
  const { rows: [v1] } = await q('SELECT COUNT(*)::int AS n FROM dataset.version_foto WHERE version_id = $1', [r.id]);
  assert.strictEqual(v1.n, 37);
  console.log('crear / listar contra la base: OK');
  await pool.end();
  console.log('TODO OK');
})().catch((e) => { console.error(e); process.exit(1); });
