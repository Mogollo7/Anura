// Pruebas del paquete anterior (legado): adaptar el paquete que traía el APK al formato actual, importarlo al
// servidor como versión publicada de origen «legado» y poder volver a él (restaurar) contra anura_legado.
// Levanta: auth de prueba con 4 cuentas (39241), geo de prueba (39242), dataset-service (39240).
// MinIO de prueba: contenedor anura_test_minio_legado en 127.0.0.1:39249.
//   sh D:/server/Anura/_pruebas/bd_prueba.sh anura_legado
//   docker run -d --rm --name anura_test_minio_legado -e MINIO_ROOT_USER=prueba -e MINIO_ROOT_PASSWORD=prueba-prueba \
//     -p 127.0.0.1:39249:9000 minio/minio:latest server /data
//   node D:/server/Anura/_pruebas/prueba_legado.js
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { spawn } = require('child_process');
const DS = 'D:/server/Anura/services/dataset-service';
const { Pool } = require(`${DS}/node_modules/pg`);
const Minio = require(`${DS}/node_modules/minio`);
const { DatabaseSync } = require('node:sqlite');
const sqliteVec = require(`${DS}/node_modules/sqlite-vec`);
const clave = require(`${DS}/src/clave.js`);

const DB = 'postgres://postgres:prueba@127.0.0.1:55432/anura_legado';
const pool = new Pool({ connectionString: DB });
const q = (s, p) => pool.query(s, p);
const BASE = 'http://127.0.0.1:39240';
const BUCKET = 'anura-dataset';
const ENCODER = '219e860e6fa9a80fb30a59fc8f61911421bbd53a4537dca831803d3ab446b2ad';
const LEGADO = 'D:/server/Anura/_respaldos/paquete-legado-antioquia-1.1.0';
const SHA_ORIGINAL = '83b328771c261f950cefcd61138c9e37904d015ce924dc21113f713b2c3a8647';
const SHA_BIN = 'a1ac5d0637a41ca12014ca61b3e4c74f4f6c440ce0e8b11abd168ea3dbb97d77';
const TAU_ORIGINAL = 39.35406371422803;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const TODAS = ['verEspecies', 'ejecutarEntrenamiento', 'generarPaquete', 'aprobarCientifico', 'publicarPaquete'];
const permisos = (lista) => Object.fromEntries(TODAS.map((a) => [a, lista.includes(a)]));
const CUENTAS = {
  'aaaaaaaa-0000-4000-8000-000000000001': { id: 'acc-admin', name: 'Admin técnico', isSuperAdmin: true, permissions: {} },
  'aaaaaaaa-0000-4000-8000-000000000002': { id: 'acc-herp', name: 'Herpetóloga', isSuperAdmin: false, permissions: permisos(['verEspecies', 'aprobarCientifico']) },
  'aaaaaaaa-0000-4000-8000-000000000003': { id: 'acc-tec', name: 'Técnico', isSuperAdmin: false, permissions: permisos(['verEspecies', 'publicarPaquete']) },
  'aaaaaaaa-0000-4000-8000-000000000004': { id: 'acc-lector', name: 'Lector', isSuperAdmin: false, permissions: permisos(['verEspecies']) },
};
const [ADMIN, HERP, TEC, LECTOR] = Object.keys(CUENTAS);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (id) => `Bearer ${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id })}.firma`;

const servidores = [];
function stubAuth() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      const auth = req.headers.authorization || '';
      const id = (() => { try { return JSON.parse(Buffer.from(auth.split(' ')[1].split('.')[1], 'base64url')).id; } catch { return null; } })();
      if (req.url.startsWith('/api/panel/me') && CUENTAS[id]) return res.end(JSON.stringify({ account: { ...CUENTAS[id], userId: id } }));
      res.statusCode = 403;
      res.end(JSON.stringify({ message: 'no es cuenta del panel' }));
    }).listen(39241, '127.0.0.1', ok);
    servidores.push(s);
  });
}
// geo-service de prueba: todo punto cae en Medellín (05001 → Valle de Aburrá en el seed de phase12).
function stubGeo() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let cuerpo = '';
      req.on('data', (c) => (cuerpo += c));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        const { puntos = [] } = JSON.parse(cuerpo || '{}');
        res.end(JSON.stringify({ municipios: puntos.map(() => '05001') }));
      });
    }).listen(39242, '127.0.0.1', ok);
    servidores.push(s);
  });
}

async function api(method, ruta, userId, body) {
  const res = await fetch(BASE + ruta, {
    method,
    headers: { ...(userId ? { Authorization: token(userId) } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* binario */ }
  return { status: res.status, body: json, texto, res };
}
const espera = (r, status, que) => assert.strictEqual(r.status, status, `${que}: esperaba ${status}, llegó ${r.status} ${r.texto.slice(0, 300)}`);

// Vectores sintéticos: una dirección por especie + ruido, normalizados (formato pgvector).
function vector(semilla, ruido) {
  let x = semilla * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280) - 0.5;
  const v = Array.from({ length: 512 }, (_, i) => (i % 7 === semilla % 7 ? 1 : 0) + rnd() * ruido);
  const n = Math.hypot(...v);
  return `[${v.map((a) => (a / n).toFixed(6)).join(',')}]`;
}

async function fixtures() {
  for (const id of Object.keys(CUENTAS)) {
    await q(`INSERT INTO auth.users (id, username, email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, `u${id.slice(-1)}`, `u${id.slice(-1)}@anura.test`]);
  }
  await q(`INSERT INTO dataset.encoder (sha256, nombre, archivo, dimension, preprocesado, normalizacion, contrato)
           VALUES ($1, 'bioclip_anura_v1', 'encoder_anura_fp16.onnx', 512, 'RGB 224x224 open_clip', 'L2', '{}') ON CONFLICT DO NOTHING`, [ENCODER]);
  const { rows: [ver] } = await q(`INSERT INTO dataset.version (nombre) VALUES ('prueba-legado-v1') RETURNING id`);
  // [carpeta, nombre, genero, familia, taxon_id, observaciones, fotos por observación]
  const especies = [
    ['Boana_boans_9101', 'Boana boansis', 'Boana', 'Hylidae', 'COL_ANURA_9101', 4, 3],
    ['Rhinella_horribilis_9102', 'Rhinella horribilisis', 'Rhinella', 'Bufonidae', 'COL_ANURA_9102', 4, 3],
  ];
  let n = 0;
  for (const [i, [carpeta, nombre, genero, familia, taxon, nObs, porObs]] of especies.entries()) {
    const { rows: [e] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [carpeta, nombre, genero, familia, taxon]);
    for (let o = 0; o < nObs; o++) {
      const { rows: [obs] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud) VALUES ('inaturalist', $1, $2, $3) RETURNING id`,
        [`leg-${carpeta}-${o}`, 6.25 + o * 0.001, -75.56]);
      for (let f = 0; f < porObs; f++) {
        n += 1;
        const h = crypto.createHash('sha256').update(`leg-${carpeta}-${o}-${f}`).digest('hex');
        await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado, licencia, atribucion)
                 VALUES ($1, $2, $3, $4, $5, 'catalogo', 'cc-by', $6)`, [h, `fotos/${h}.jpg`, e.id, obs.id, `${n}.jpg`, `(c) Autor ${n}`]);
        const particion = nObs > 2 && o === nObs - 1 ? 'val' : 'train';
        await q(`INSERT INTO dataset.version_foto (version_id, sha256, particion) VALUES ($1, $2, $3)`, [ver.id, h, particion]);
        await q(`INSERT INTO dataset.embedding (sha256, encoder_sha256, vector) VALUES ($1, $2, $3::vector)`, [h, ENCODER, vector(i + 1, 0.3 + f * 0.01 + o * 0.02)]);
      }
    }
  }
}

/** Las 30 especies del paquete anterior en dataset.especie (como en producción: con su taxon_id, sin fotos en la prueba). */
async function especiesDelLegado() {
  const orig = new DatabaseSync(`${LEGADO}/package.sqlite`, { readOnly: true });
  const taxa = orig.prepare("SELECT taxon_id, scientific_name, genus, family FROM taxa WHERE visual_status = 'VISUAL_ENABLED' ORDER BY taxon_id").all();
  orig.close();
  for (const t of taxa) {
    await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id) VALUES ($1,$2,$3,$4,$5)`,
      [t.scientific_name.replace(/ /g, '_'), t.scientific_name, t.genus, t.family, t.taxon_id]);
  }
  return taxa;
}

function levantarServicio() {
  return spawn(process.execPath, ['src/index.js'], {
    cwd: DS,
    env: {
      ...process.env, PORT: '39240', DATABASE_URL: DB, AUTH_SERVICE_URL: 'http://127.0.0.1:39241', GEO_SERVICE_URL: 'http://127.0.0.1:39242',
      MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39249', MINIO_ROOT_USER: 'prueba', MINIO_ROOT_PASSWORD: 'prueba-prueba',
      MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39249', DATASET_BUCKET: BUCKET,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

async function esperarSalud() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('dataset-service no arrancó');
}

function correrCli(argumentos) {
  const cli = spawn(process.execPath, ['scripts/importar-paquete-legado.mjs', ...argumentos], {
    cwd: DS,
    env: {
      ...process.env, DATABASE_URL: DB, MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39249', MINIO_ROOT_USER: 'prueba',
      MINIO_ROOT_PASSWORD: 'prueba-prueba', DATASET_BUCKET: BUCKET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  cli.stdout.on('data', (c) => (salida += c));
  cli.stderr.on('data', (c) => (salida += c));
  return new Promise((ok) => cli.on('close', (codigo) => ok({ codigo, salida })));
}

/** Decodificador ANOS escrito aparte, leyendo bytes a mano como OpenSetModel.kt (no usa osrModelo.js). */
function leerANOS(buf) {
  assert.strictEqual(buf.toString('ascii', 0, 4), 'ANOS', 'magic');
  assert.strictEqual(buf.readInt32LE(4), 1, 'versión');
  const dim = buf.readInt32LE(8);
  const k = buf.readInt32LE(12);
  const tau = buf.readDoubleLE(16);
  let pos = 24;
  const precision = new Float64Array(dim * dim);
  for (let i = 0; i < precision.length; i++, pos += 8) precision[i] = buf.readDoubleLE(pos);
  const centroides = [];
  for (let c = 0; c < k; c++) {
    const fila = new Float64Array(dim);
    for (let d = 0; d < dim; d++, pos += 8) fila[d] = buf.readDoubleLE(pos);
    centroides.push(fila);
  }
  const ids = [];
  for (let c = 0; c < k; c++) {
    const n = buf.readInt32LE(pos); pos += 4;
    ids.push(buf.toString('utf8', pos, pos + n)); pos += n;
  }
  assert.strictEqual(pos, buf.length, 'sin bytes de más');
  return { dim, k, tau, precision, centroides, ids };
}

/** Mahalanobis mínima como OpenSetModel.score: √min_k (x−μ_k)ᵀ P (x−μ_k), en doble precisión. */
function score(x, modelo) {
  const { dim, precision, centroides } = modelo;
  const diff = new Float64Array(dim);
  let mejor = Infinity;
  let cual = -1;
  centroides.forEach((mu, k) => {
    for (let d = 0; d < dim; d++) diff[d] = x[d] - mu[d];
    let d2 = 0;
    for (let i = 0; i < dim; i++) {
      let acc = 0;
      const fila = i * dim;
      for (let j = 0; j < dim; j++) acc += precision[fila + j] * diff[j];
      d2 += diff[i] * acc;
    }
    if (d2 < mejor) { mejor = d2; cual = k; }
  });
  return { distancia: Math.sqrt(Math.max(0, mejor)), cual };
}
const aFloats = (bytes) => { const b = Buffer.from(bytes); return Float64Array.from({ length: b.length / 4 }, (_, i) => b.readFloatLE(i * 4)); };

const abrirVec = (ruta) => { const db = new DatabaseSync(ruta, { readOnly: true, allowExtension: true }); sqliteVec.load(db); return db; };

const publicados = async (regionId) => (await q(`SELECT count(*)::int n FROM packages.regional_packages WHERE region_id = $1 AND estado = 'publicado'`, [regionId])).rows[0].n;
const estadosDe = async (regionId) => (await q('SELECT version, estado, origen, is_published FROM packages.regional_packages WHERE region_id = $1 ORDER BY version', [regionId])).rows;

(async () => {
  let hijo = null;
  try {
    // Base limpia para lo de este bloque.
    await q('TRUNCATE packages.regional_packages CASCADE');
    await q('DELETE FROM dataset.osr_umbral'); await q('DELETE FROM dataset.osr_calibracion');
    await q("DELETE FROM audit.log WHERE target_type IN ('paquete', 'experimento', 'osr_calibracion', 'osr_umbral')");
    await q('DELETE FROM dataset.cluster'); await q('DELETE FROM dataset.morfo');
    await q('DELETE FROM dataset.observacion_etiqueta'); await q('DELETE FROM dataset.species_content');
    await q('DELETE FROM dataset.experimento');
    await q('DELETE FROM dataset.embedding'); await q('DELETE FROM dataset.version_foto'); await q('DELETE FROM dataset.version');
    await q('DELETE FROM dataset.foto'); await q('DELETE FROM dataset.observacion'); await q('DELETE FROM dataset.especie');
    await fixtures();
    const taxaLegado = await especiesDelLegado();
    assert.strictEqual(taxaLegado.length, 30);
    const { rows: subs } = await q(`SELECT id, clave, nombre FROM dataset.subregion WHERE region = '05' ORDER BY numero`);
    assert.strictEqual(subs.length, 9);
    const valle = subs.find((s) => s.clave === 'VALLE_DE_ABURRA');
    const oriente = subs.find((s) => s.clave === 'ORIENTE');
    const REGION_VALLE = '05.VALLE_DE_ABURRA';

    // Datos de Ficha/morfos de dos especies del legado solo en el Valle: la clave del Valle tiene con qué preguntar
    // (poco), la de Oriente no tiene nada.
    const idDe = Object.fromEntries((await q("SELECT id, taxon_id FROM dataset.especie WHERE taxon_id LIKE 'COL_ANURA_00%'")).rows.map((e) => [e.taxon_id, e.id]));
    await q(`INSERT INTO dataset.morfo (especie_id, subregion_id, nombre) VALUES ($1, $3, 'verde'), ($2, $3, 'rojo')`, [idDe.COL_ANURA_0020, idDe.COL_ANURA_0023, valle.id]);

    const minio = new Minio.Client({ endPoint: '127.0.0.1', port: 39249, useSSL: false, accessKey: 'prueba', secretKey: 'prueba-prueba', region: 'us-east-1' });
    if (!(await minio.bucketExists(BUCKET))) await minio.makeBucket(BUCKET, 'us-east-1');
    const objetoExiste = async (key) => { try { await minio.statObject(BUCKET, key); return true; } catch { return false; } };

    // ── 1) Adaptador (CLI «adaptar»): sqlite nuevo, original intacto, resultado determinista ──────────────────────────
    const salidaSqlite = path.join(os.tmpdir(), `legado-adaptado-${Date.now()}.sqlite`);
    let r = await correrCli(['adaptar', LEGADO, salidaSqlite, '--departamento', '05']);
    assert.strictEqual(r.codigo, 0, r.salida);
    assert.ok(/30 especies \(de 291 taxones del original\)/.test(r.salida) && /4034 vectores/.test(r.salida), r.salida);
    const adaptado = fs.readFileSync(salidaSqlite);
    assert.strictEqual(sha(fs.readFileSync(`${LEGADO}/package.sqlite`)), SHA_ORIGINAL, 'el paquete original no se toca');
    assert.strictEqual(sha(fs.readFileSync(`${LEGADO}/openset_v1.1.0_clean.bin`)), SHA_BIN, 'el modelo original no se toca');
    const r2 = await correrCli(['adaptar', LEGADO, `${salidaSqlite}.2`, '--departamento', '05']);
    assert.strictEqual(r2.codigo, 0);
    assert.strictEqual(sha(fs.readFileSync(`${salidaSqlite}.2`)), sha(adaptado), 'adaptar es determinista');
    fs.rmSync(`${salidaSqlite}.2`);
    console.log(`ok 1 · adaptado ${adaptado.length} bytes (sha ${sha(adaptado).slice(0, 12)}…), original intacto, determinista`);

    // ── 2) Errores del adaptador: no adivina ─────────────────────────────────────────────────────────────────────────
    r = await correrCli(['adaptar', '/no/existe', path.join(os.tmpdir(), 'x.sqlite')]);
    assert.strictEqual(r.codigo, 1);
    assert.ok(/No existe la carpeta/.test(r.salida), r.salida);
    const rota = fs.mkdtempSync(path.join(os.tmpdir(), 'legado-roto-'));
    for (const f of fs.readdirSync(LEGADO)) fs.copyFileSync(path.join(LEGADO, f), path.join(rota, f));
    fs.writeFileSync(path.join(rota, 'allowed_by_package.json'), JSON.stringify({ ANTIOQUIA: ['ANU_COL_BOAN_BOA_001', 'ANU_COL_ZZZZ_ZZZ_001'] }));
    r = await correrCli(['adaptar', rota, path.join(rota, 'salida.sqlite')]);
    assert.strictEqual(r.codigo, 1);
    assert.ok(/corresponde a 0 taxones|no están en allowed_by_package/.test(r.salida), r.salida);
    const bin = Buffer.from(fs.readFileSync(path.join(LEGADO, 'openset_v1.1.0_clean.bin')));
    bin[100] ^= 0xff;
    fs.copyFileSync(path.join(LEGADO, 'allowed_by_package.json'), path.join(rota, 'allowed_by_package.json'));
    fs.writeFileSync(path.join(rota, 'openset_v1.1.0_clean.bin'), bin);
    r = await correrCli(['adaptar', rota, path.join(rota, 'salida.sqlite')]);
    assert.strictEqual(r.codigo, 1);
    assert.ok(/sha256 de su descripción/.test(r.salida), r.salida);
    fs.rmSync(rota, { recursive: true });
    console.log('ok 2 · sin carpeta, con una permitida que no existe y con el modelo alterado el adaptador se niega');

    // ── 3) Importar al servidor (CLI): una versión por subregión, un solo objeto en MinIO ──────────────────────────────
    r = await correrCli(['importar', LEGADO, ADMIN]);
    assert.strictEqual(r.codigo, 0, r.salida);
    assert.strictEqual((r.salida.match(/registrada: /g) || []).length, 9, r.salida);
    let { rows: filas } = await q(`SELECT * FROM packages.regional_packages WHERE origen = 'legado' ORDER BY subregion_id`);
    assert.strictEqual(filas.length, 9);
    assert.ok(filas.every((f) => f.estado === 'publicado' && f.is_published && f.version === 1 && f.especies === 30 && f.published_at));
    assert.strictEqual(new Set(filas.map((f) => f.sha256)).size, 1, 'el mismo archivo para las 9 subregiones');
    assert.strictEqual(new Set(filas.map((f) => f.storage_key)).size, 1, 'un solo objeto en MinIO');
    assert.deepStrictEqual(filas.map((f) => f.region_id).sort(), subs.map((s) => `05.${s.clave}`).sort());
    assert.ok(filas.every((f) => f.compilado_por === ADMIN && f.publicado_por === ADMIN && f.manifiesto.origen.tipo === 'legado'));
    assert.ok(filas.every((f) => f.manifiesto.origen.sha256_original === SHA_ORIGINAL && f.manifiesto.especies.length === 30));
    const claveLegado = filas[0].storage_key;
    const shaLegado = filas[0].sha256;
    const sizeLegado = Number(filas[0].size_bytes);
    assert.strictEqual(shaLegado, sha(adaptado), 'lo importado es lo mismo que el adaptador genera');
    assert.ok(await objetoExiste(claveLegado));
    const objetos = [];
    await new Promise((ok, mal) => { const s = minio.listObjectsV2(BUCKET, 'paquetes/', true); s.on('data', (o) => objetos.push(o.name)); s.on('end', ok); s.on('error', mal); });
    assert.strictEqual(objetos.filter((o) => o.endsWith('package.sqlite')).length, 1, 'el sqlite se guarda una sola vez');
    assert.strictEqual(objetos.filter((o) => o.endsWith('paquete.json')).length, 9, 'un manifiesto por subregión');
    const { rows: aud } = await q(`SELECT metadata, actor_id::text FROM audit.log WHERE action = 'dataset.paquete.importado_legado'`);
    assert.strictEqual(aud.length, 9);
    assert.ok(aud.every((a) => a.actor_id === ADMIN && a.metadata.sha256 === shaLegado && a.metadata.sha256_original === SHA_ORIGINAL && a.metadata.estado === 'publicado'));
    // Repetirlo no duplica nada.
    r = await correrCli(['importar', LEGADO, ADMIN]);
    assert.strictEqual(r.codigo, 0, r.salida);
    assert.strictEqual((r.salida.match(/ya estaba: /g) || []).length, 9, r.salida);
    assert.strictEqual((await q(`SELECT count(*)::int n FROM packages.regional_packages WHERE origen = 'legado'`)).rows[0].n, 9);
    assert.strictEqual((await q(`SELECT count(*)::int n FROM audit.log WHERE action = 'dataset.paquete.importado_legado'`)).rows[0].n, 9);
    // Un departamento que no existe, o un usuario que no hay: se niega sin dejar nada.
    r = await correrCli(['importar', LEGADO, ADMIN, '--departamento', '99']);
    assert.strictEqual(r.codigo, 1);
    assert.ok(/no existe en Regiones/.test(r.salida), r.salida);
    console.log(`ok 3 · importado: 9 subregiones publicadas v1, un objeto de ${sizeLegado} bytes en MinIO, 9 auditorías, repetir no duplica`);

    await q(`UPDATE dataset.region SET estado = 'activa' WHERE codigo_dane = '05'`);
    await stubAuth();
    await stubGeo();
    hijo = levantarServicio();
    await esperarSalud();

    // ── 4) Lo que la app ve: árbol público, descarga con sha256 correcto ────────────────────────────────────────────────
    r = await api('GET', '/api/dataset/publico/paquetes');
    espera(r, 200, 'árbol público');
    const dep = r.body.paises[0].hijos.find((d) => d.id === '05');
    assert.strictEqual(dep.hijos.length, 9, 'las 9 subregiones de Antioquia aparecen en Paquetes');
    assert.ok(dep.hijos.every((h) => h.version === '1' && h.sha256 === shaLegado && h.especies === 30 && h.formato === 'sqlite' && h.size_archivo === sizeLegado));
    for (const h of [dep.hijos.find((x) => x.id === REGION_VALLE), dep.hijos.find((x) => x.id === '05.ORIENTE')]) {
      const bajada = await fetch(BASE + h.archivo_url);
      assert.strictEqual(bajada.status, 200);
      const bytes = Buffer.from(await bajada.arrayBuffer());
      assert.strictEqual(bytes.length, h.size_archivo);
      assert.strictEqual(sha(bytes), h.sha256, 'sha256 de la descarga = el publicado (lo que verifica PackageInstaller)');
      assert.ok(bytes.equals(adaptado));
      const man = await api('GET', h.manifiesto_url);
      espera(man, 200, 'manifiesto');
      assert.strictEqual(man.body.origen.tipo, 'legado');
      assert.strictEqual(man.body.archivo.sha256, h.sha256);
      assert.strictEqual(man.body.subregion.clave, h.id.slice(3));
    }
    console.log('ok 4 · /publico/paquetes lista las 9 subregiones; la descarga tiene el sha256 publicado y es el archivo adaptado');

    // ── 5) El sqlite DESCARGADO, comprobado como lo hace la app ────────────────────────────────────────────────────────
    const bajado = Buffer.from(await (await fetch(BASE + dep.hijos.find((x) => x.id === REGION_VALLE).archivo_url)).arrayBuffer());
    const tmp = path.join(os.tmpdir(), `prueba-legado-${Date.now()}.sqlite`);
    fs.writeFileSync(tmp, bajado);
    const lite = abrirVec(tmp);
    const orig = abrirVec(`${LEGADO}/package.sqlite`);
    const taxa = lite.prepare('SELECT taxon_id, scientific_name FROM taxa').all();
    const idsTaxa = new Set(taxa.map((t) => t.taxon_id));
    assert.strictEqual(taxa.length, 30);
    assert.deepStrictEqual([...idsTaxa].sort(), taxaLegado.map((t) => t.taxon_id).sort(), 'taxa = las 30 visuales, mismos ids que dataset.especie');
    // PackageOpenSets.decode
    const fila = lite.prepare('SELECT id, format, dim, species, tau, sha256, data FROM open_set_model').all();
    assert.strictEqual(fila.length, 1);
    assert.strictEqual(fila[0].format, 'ANOS v1');
    const blob = Buffer.from(fila[0].data);
    assert.strictEqual(sha(blob), fila[0].sha256, 'sha256 de la fila');
    const anos = leerANOS(blob);
    assert.strictEqual(anos.k, 30);
    assert.strictEqual(anos.dim, 512);
    assert.strictEqual(new Set(anos.ids).size, 30);
    assert.deepStrictEqual([...anos.ids].sort(), [...idsTaxa].sort(), 'los ids del modelo coinciden EXACTAMENTE con taxa');
    assert.strictEqual(anos.tau, TAU_ORIGINAL, 'τ del modelo 1.1.0');
    assert.strictEqual(fila[0].tau, TAU_ORIGINAL);
    const info = Object.fromEntries(lite.prepare('SELECT key, value FROM package_info').all().map((x) => [x.key, x.value]));
    assert.strictEqual(info.origen, 'legado');
    assert.strictEqual(info.origen_sha256, SHA_ORIGINAL);
    assert.strictEqual(info.origen_openset_sha256, SHA_BIN);
    assert.strictEqual(info.osr_model_sha256, fila[0].sha256);
    assert.strictEqual(info.encoder_onnx_sha256, ENCODER);
    assert.strictEqual(info.visual_taxa, '30');
    assert.strictEqual(info.origen_taxa_catalogo, '291');
    assert.ok(/sin datos/.test(info.morph_centroids) && /sin datos/.test(info.clusters) && /sin datos/.test(info.taxon_context));
    for (const t of ['morph_centroids', 'clusters']) assert.strictEqual(lite.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, `${t} vacía y declarada`);
    // El modelo del original, filtrado con OTRA ruta (ids ANU_COL por nombre científico): mismas medias y misma precisión.
    const modeloOrig = leerANOS(fs.readFileSync(`${LEGADO}/openset_v1.1.0_clean.bin`));
    assert.strictEqual(modeloOrig.k, 41);
    assert.ok(modeloOrig.precision.every((x, i) => x === anos.precision[i]), 'precisión compartida idéntica al original');
    const permitidas = JSON.parse(fs.readFileSync(`${LEGADO}/allowed_by_package.json`, 'utf8')).ANTIOQUIA;
    assert.strictEqual(permitidas.length, 30);
    const anuDe = (t) => { const [g, ...e] = t.scientific_name.split(' '); return `ANU_COL_${g.slice(0, 4).toUpperCase()}_${e.join('_').slice(0, 3).toUpperCase()}_001`; };
    const filtradoOrig = { dim: 512, precision: modeloOrig.precision, centroides: [] };
    const idsFiltradoOrig = [];
    for (const t of taxa) {
      const anu = anuDe(t);
      assert.ok(permitidas.includes(anu), `${anu} está permitida`);
      const i = modeloOrig.ids.indexOf(anu);
      assert.ok(i >= 0);
      filtradoOrig.centroides.push(modeloOrig.centroides[i]);
      idsFiltradoOrig.push(t.taxon_id);
      const j = anos.ids.indexOf(t.taxon_id);
      assert.ok(modeloOrig.centroides[i].every((x, d) => x === anos.centroides[j][d]), `media de ${t.taxon_id} idéntica`);
    }
    // k-NN (PackageVectorIndex.nearest, k=5) y Mahalanobis (OpenSetModel.score) con un vector por especie.
    let propios = 0;
    let aceptadas = 0;
    let dMax = 0;
    for (const t of taxa) {
      const v = lite.prepare('SELECT embedding FROM vec_references WHERE taxon_id = ? ORDER BY rowid LIMIT 1').get(t.taxon_id);
      const vo = orig.prepare('SELECT embedding FROM vec_references WHERE taxon_id = ? ORDER BY rowid LIMIT 1').get(t.taxon_id);
      assert.ok(Buffer.from(v.embedding).equals(Buffer.from(vo.embedding)), 'mismo vector de referencia que el original');
      const knn = (db) => db.prepare('SELECT taxon_id, distance FROM vec_references WHERE embedding MATCH ? AND k = 5 ORDER BY distance').all(Buffer.from(v.embedding));
      const vecinos = knn(lite);
      const vecinosOrig = knn(orig);
      assert.deepStrictEqual(vecinos.map((x) => [x.taxon_id, x.distance]), vecinosOrig.map((x) => [x.taxon_id, x.distance]), 'k-NN igual al del paquete original');
      assert.strictEqual(vecinos[0].taxon_id, t.taxon_id, `el k-NN de un vector de ${t.scientific_name} devuelve su especie`);
      assert.ok(vecinos[0].distance < 1e-4);
      const x = aFloats(v.embedding);
      const a = score(x, anos);
      const b = score(x, filtradoOrig);
      dMax = Math.max(dMax, Math.abs(a.distancia - b.distancia));
      assert.ok(Math.abs(a.distancia - b.distancia) < 1e-9, `Mahalanobis ${t.taxon_id}: ${a.distancia} contra ${b.distancia}`);
      assert.strictEqual(anos.ids[a.cual], idsFiltradoOrig[b.cual]);
      if (a.distancia <= anos.tau) aceptadas += 1;
      propios += 1;
    }
    assert.strictEqual(propios, 30);
    assert.ok(aceptadas >= 25, `la mayoría de los vectores de referencia se aceptan con el τ del modelo (${aceptadas}/30)`);
    // Lo que NearbySpecies / SpeciesOccurrences / KnnVote leen: idéntico al original, sin especies que el paquete no ofrece.
    const cuenta = (db, t, w = '') => db.prepare(`SELECT COUNT(*) n FROM ${t} ${w}`).get().n;
    assert.strictEqual(cuenta(lite, 'vec_references'), 4034);
    assert.strictEqual(cuenta(lite, 'reference_images'), 4034);
    assert.strictEqual(cuenta(lite, 'occurrence_points'), cuenta(orig, 'occurrence_points'));
    assert.strictEqual(cuenta(lite, 'grid_cells'), cuenta(orig, 'grid_cells'));
    assert.strictEqual(cuenta(lite, 'zones'), 4);
    assert.strictEqual(cuenta(lite, 'weather_prior'), cuenta(orig, 'weather_prior'));
    assert.strictEqual(cuenta(lite, 'zone_prior'), 495 - 405, 'zone_prior sin las 261 especies que el paquete ya no ofrece');
    assert.deepStrictEqual(lite.prepare('SELECT * FROM weather_prior_meta ORDER BY key').all(), orig.prepare('SELECT * FROM weather_prior_meta ORDER BY key').all());
    assert.deepStrictEqual(lite.prepare('SELECT * FROM zone_prior_meta ORDER BY zone_id').all(), orig.prepare('SELECT * FROM zone_prior_meta ORDER BY zone_id').all());
    const cerca = (db) => { // Medellín 6.25, -75.56 con la regla de la app (0.25°, redondeo half-even)
      const rint = (v) => { const f = Math.floor(v); const d = v - f; return d < 0.5 ? f : d > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1); };
      const z = db.prepare('SELECT zone_id FROM grid_cells WHERE row = ? AND col = ?').get(rint(6.25 / 0.25), rint(-75.56 / 0.25));
      return z ? db.prepare('SELECT taxon_id FROM zone_prior WHERE zone_id = ? ORDER BY p DESC, taxon_id').all(z.zone_id).map((x) => x.taxon_id) : null;
    };
    const cercaNueva = cerca(lite).slice(0, 5);
    assert.ok(cercaNueva.length === 5, 'hay zona para Medellín');
    assert.ok(cercaNueva.every((id) => idsTaxa.has(id)), 'NearbySpecies solo devuelve especies del paquete');
    const cercaOrig = cerca(orig).filter((id) => idsTaxa.has(id)).slice(0, 5);
    assert.deepStrictEqual(cercaNueva, cercaOrig, 'mismo orden de especies cercanas que el original (restringido a las del paquete)');
    // Mismas cifras de reference_images (licencia y atribución conservadas).
    assert.deepStrictEqual(lite.prepare('SELECT * FROM reference_images ORDER BY ref_id LIMIT 50').all(), orig.prepare('SELECT * FROM reference_images ORDER BY ref_id LIMIT 50').all());
    assert.strictEqual(cuenta(lite, 'centroids', "WHERE level = 'especie' AND origin = 'referencias_del_paquete'"), 30);
    assert.strictEqual(cuenta(lite, 'taxon_context'), 30);
    assert.ok(cuenta(lite, 'taxon_context', 'WHERE altitude_min IS NOT NULL OR w_visual IS NOT NULL OR lrc_min IS NOT NULL') === 0, 'contexto de la Ficha: sin datos, nada inventado');
    lite.close(); orig.close();
    fs.rmSync(tmp);
    console.log(`ok 5 · sqlite descargado: ANOS 30 especies con ids = taxa, τ ${anos.tau}, k-NN 30/30 propio e idéntico al original, Mahalanobis dif. máx. ${dMax}, ${aceptadas}/30 aceptadas`);

    // ── 6) Clave «Paso a paso»: 30 especies, dice cuánto separa ─────────────────────────────────────────────────────────
    r = await api('GET', `/api/dataset/publico/clave?subregion=${REGION_VALLE}`);
    espera(r, 200, 'clave del Valle');
    assert.strictEqual(r.body.especies.length, 30);
    assert.deepStrictEqual(r.body.especies.map((e) => e.taxon_id).sort(), taxaLegado.map((t) => t.taxon_id).sort());
    assert.strictEqual(r.body.paquete.origen, 'legado');
    assert.strictEqual(r.body.paquete.version, 1);
    assert.strictEqual(r.body.paquete.sha256, shaLegado);
    assert.deepStrictEqual(r.body.caracteres.map((c) => c.id), ['morfo'], 'con dos morfos declarados es lo único que pregunta');
    assert.strictEqual(r.body.cobertura.caracteres[0].especies_con_dato, 2);
    assert.ok(/Solo 2 de 30 especies/.test(r.body.aviso), r.body.aviso);
    const resuelta = clave.resolver(r.body, []);
    assert.strictEqual(resuelta.estado, 'pregunta');
    r = await api('GET', `/api/dataset/publico/clave?subregion=${REGION_VALLE}&version=1`);
    espera(r, 200, 'clave con versión');
    r = await api('GET', `/api/dataset/publico/clave?subregion=05.ORIENTE`);
    espera(r, 200, 'clave de Oriente');
    assert.strictEqual(r.body.especies.length, 30);
    assert.deepStrictEqual(r.body.caracteres, [], 'sin datos no inventa preguntas');
    assert.ok(/ninguna pregunta separa/.test(r.body.aviso), r.body.aviso);
    const sin = clave.resolver(r.body, []);
    assert.strictEqual(sin.estado, 'varias');
    assert.strictEqual(sin.indistinguibles, true);
    console.log('ok 6 · clave pública: 30 especies del manifiesto; Valle pregunta solo por morfo y avisa (2 de 30), Oriente no pregunta nada y lo dice');

    // ── 7) El legado no depende del estado de la base: ni desactualizado ni bloqueado ──────────────────────────────────
    r = await api('GET', `/api/dataset/releases?subregion_id=${valle.id}`, LECTOR);
    espera(r, 200, 'historial');
    assert.strictEqual(r.body.paquetes.length, 1);
    const pl = r.body.paquetes[0];
    assert.deepStrictEqual([pl.estado, pl.origen, pl.desactualizado, pl.aprobaciones.length], ['publicado', 'legado', false, 0]);
    // Cambia todo lo que alimenta a los paquetes compilados: el legado sigue igual.
    r = await api('POST', '/api/dataset/centroides', ADMIN, {});
    espera(r, 201, 'calcular centroides');
    r = await api('GET', `/api/dataset/releases?subregion_id=${valle.id}`, LECTOR);
    assert.strictEqual(r.body.paquetes[0].desactualizado, false);
    espera(await api('POST', `/api/dataset/releases/${pl.id}/aprobaciones`, HERP, { tipo: 'cientifica' }), 409, 'un publicado no admite aprobaciones');
    console.log('ok 7 · el paquete anterior figura publicado, sin aprobaciones y nunca desactualizado');

    // ── 8) Compilar y publicar uno nuevo retira el legado sin borrarlo ─────────────────────────────────────────────────
    r = await api('POST', '/api/dataset/osr/calibraciones', ADMIN, { subregion_id: valle.id });
    espera(r, 201, 'calibrar OSR');
    const calibracionId = r.body.calibracion.id;
    espera(await api('POST', '/api/dataset/osr/validaciones', ADMIN, { calibracion_id: calibracionId, tau: 0.4 }), 201, 'validar OSR');
    r = await api('POST', '/api/dataset/releases', ADMIN, { subregion_id: valle.id });
    espera(r, 201, 'compilar v2');
    const v2 = r.body;
    assert.strictEqual(v2.version, 2, 'la versión nueva sigue a la del legado');
    assert.strictEqual(v2.origen, 'compilado');
    espera(await api('POST', `/api/dataset/releases/${v2.id}/aprobaciones`, HERP, { tipo: 'cientifica' }), 201, 'v2 científica');
    espera(await api('POST', `/api/dataset/releases/${v2.id}/aprobaciones`, ADMIN, { tipo: 'tecnica' }), 201, 'v2 técnica');
    r = await api('POST', `/api/dataset/releases/${v2.id}/publicar`, TEC);
    espera(r, 200, 'publicar v2');
    assert.strictEqual(r.body.reemplazado.version, 1);
    assert.deepStrictEqual((await estadosDe(REGION_VALLE)).map((e) => `${e.version}:${e.estado}:${e.origen}`), ['1:retirado:legado', '2:publicado:compilado']);
    assert.ok(await objetoExiste(claveLegado), 'el archivo del paquete anterior sigue en MinIO');
    assert.strictEqual((await estadosDe('05.ORIENTE'))[0].estado, 'publicado', 'las otras subregiones siguen con el paquete anterior');
    r = await api('GET', '/api/dataset/publico/paquetes');
    const nodoValle = r.body.paises[0].hijos.find((d) => d.id === '05').hijos.find((h) => h.id === REGION_VALLE);
    assert.strictEqual(nodoValle.version, '2');
    assert.strictEqual(nodoValle.sha256, v2.sha256);
    espera(await api('POST', `/api/dataset/releases/${(await q(`SELECT id FROM packages.regional_packages WHERE region_id = $1 AND version = 1`, [REGION_VALLE])).rows[0].id}/publicar`, TEC), 409, 'publicar un retirado');
    console.log('ok 8 · v2 publicada: el legado del Valle quedó retirado, su archivo sigue en MinIO y las otras 8 subregiones no cambian');

    // ── 9) Restaurar ────────────────────────────────────────────────────────────────────────────────────────────────────
    const idLegado = (await q(`SELECT id FROM packages.regional_packages WHERE region_id = $1 AND version = 1`, [REGION_VALLE])).rows[0].id;
    espera(await api('POST', `/api/dataset/releases/${idLegado}/restaurar`), 401, 'restaurar sin sesión');
    espera(await api('POST', `/api/dataset/releases/${idLegado}/restaurar`, LECTOR), 403, 'restaurar sin permiso (lector)');
    espera(await api('POST', `/api/dataset/releases/${idLegado}/restaurar`, HERP), 403, 'restaurar sin permiso (herpetóloga)');
    espera(await api('POST', '/api/dataset/releases/999999/restaurar', TEC), 404, 'restaurar lo que no existe');
    espera(await api('POST', `/api/dataset/releases/${v2.id}/restaurar`, TEC), 409, 'restaurar el publicado');
    assert.strictEqual((await estadosDe(REGION_VALLE)).map((e) => e.estado).join(), 'retirado,publicado', 'nada cambió con los rechazos');
    // Un borrador tampoco se restaura.
    r = await api('POST', '/api/dataset/releases', ADMIN, { subregion_id: valle.id });
    espera(r, 201, 'compilar v3');
    const v3 = r.body;
    r = await api('POST', `/api/dataset/releases/${v3.id}/restaurar`, TEC);
    espera(r, 409, 'restaurar un borrador');
    assert.ok(/solo se restauran las versiones retiradas/.test(r.body.message), r.body.message);
    // El archivo tiene que seguir guardado.
    const { rows: [huerfano] } = await q(`INSERT INTO packages.regional_packages (region_id, version, storage_key, sha256, size_bytes, subregion_id, estado, origen)
      VALUES ($1, 99, 'paquetes/no/existe.sqlite', $2, 10, $3, 'retirado', 'compilado') RETURNING id`, [REGION_VALLE, 'f'.repeat(64), valle.id]);
    r = await api('POST', `/api/dataset/releases/${huerfano.id}/restaurar`, TEC);
    espera(r, 409, 'restaurar sin archivo');
    assert.ok(/ya no está guardado/.test(r.body.message), r.body.message);
    await q('DELETE FROM packages.regional_packages WHERE id = $1', [huerfano.id]);

    // Restaurar el legado: vuelve a publicado y v2 pasa a retirado.
    r = await api('POST', `/api/dataset/releases/${idLegado}/restaurar`, TEC);
    espera(r, 200, 'restaurar el paquete anterior');
    assert.deepStrictEqual([r.body.estado, r.body.origen, r.body.reemplazado.version], ['publicado', 'legado', 2]);
    assert.strictEqual(r.body.publicado_nombre, 'Técnico');
    assert.deepStrictEqual((await estadosDe(REGION_VALLE)).map((e) => `${e.version}:${e.estado}:${e.is_published}`), ['1:publicado:true', '2:retirado:false', '3:borrador:false']);
    assert.strictEqual(await publicados(REGION_VALLE), 1);
    r = await api('GET', '/api/dataset/publico/paquetes');
    const restaurado = r.body.paises[0].hijos.find((d) => d.id === '05').hijos.find((h) => h.id === REGION_VALLE);
    assert.strictEqual(restaurado.version, '1');
    assert.strictEqual(restaurado.sha256, shaLegado);
    const otraVez = Buffer.from(await (await fetch(BASE + restaurado.archivo_url)).arrayBuffer());
    assert.strictEqual(sha(otraVez), shaLegado, 'la app baja otra vez el paquete anterior, con su sha256');
    r = await api('GET', `/api/dataset/publico/clave?subregion=${REGION_VALLE}`);
    assert.strictEqual(r.body.paquete.origen, 'legado');
    assert.strictEqual(r.body.especies.length, 30);
    // Restaurar dos veces la misma: la segunda es 409.
    espera(await api('POST', `/api/dataset/releases/${idLegado}/restaurar`, TEC), 409, 'restaurar lo ya publicado');
    console.log('ok 9 · restaurar: 403/404/409 donde toca; el legado vuelve a publicado, v2 a retirado, el archivo baja con su sha256');

    // Volver a la v2: el retroceso del retroceso, aunque la validación de hoy ya no coincida con la de v2.
    espera(await api('POST', '/api/dataset/osr/validaciones', ADMIN, { calibracion_id: calibracionId, tau: 0.38 }), 201, 'cambia el umbral OSR');
    r = await api('POST', `/api/dataset/releases/${v2.id}/restaurar`, TEC);
    espera(r, 200, 'restaurar v2 aunque quedó desactualizada');
    assert.strictEqual(r.body.reemplazado.version, 1);
    assert.strictEqual((await estadosDe(REGION_VALLE)).find((e) => e.estado === 'publicado').version, 2);
    r = await api('GET', `/api/dataset/releases?subregion_id=${valle.id}`, LECTOR);
    assert.strictEqual(r.body.paquetes.find((p) => p.id === v2.id).desactualizado, false, 'un publicado no está «desactualizado»');
    const v3d = r.body.paquetes.find((p) => p.id === v3.id);
    assert.strictEqual(v3d.desactualizado, true, 'el borrador sí (cambió el umbral)');
    console.log('ok 10 · restaurar no exige aprobaciones nuevas ni compara con la validación de hoy');

    // ── 10) Nunca dos publicados, ni siquiera con peticiones al mismo tiempo ───────────────────────────────────────────
    // Estado: 1 retirado (legado), 2 publicado, 3 borrador → se publica v3 con sus dos aprobaciones para tener 2 retirados.
    // v3 quedó desactualizada por el cambio de umbral: se compila v4 y se publica.
    r = await api('POST', '/api/dataset/releases', ADMIN, { subregion_id: valle.id });
    const v4 = r.body;
    espera(await api('POST', `/api/dataset/releases/${v4.id}/aprobaciones`, HERP, { tipo: 'cientifica' }), 201, 'v4 científica');
    espera(await api('POST', `/api/dataset/releases/${v4.id}/aprobaciones`, ADMIN, { tipo: 'tecnica' }), 201, 'v4 técnica');
    espera(await api('POST', `/api/dataset/releases/${v4.id}/publicar`, TEC), 200, 'publicar v4');
    assert.deepStrictEqual((await estadosDe(REGION_VALLE)).map((e) => `${e.version}:${e.estado}`), ['1:retirado', '2:retirado', '3:borrador', '4:publicado']);
    // Dos restauraciones distintas a la vez: se serializan, las dos «ganan» en su turno y al final queda UNA publicada.
    const [ra, rb] = await Promise.all([
      api('POST', `/api/dataset/releases/${idLegado}/restaurar`, TEC),
      api('POST', `/api/dataset/releases/${v2.id}/restaurar`, ADMIN),
    ]);
    assert.deepStrictEqual([ra.status, rb.status], [200, 200], `${ra.texto} ${rb.texto}`);
    assert.strictEqual(await publicados(REGION_VALLE), 1);
    // La misma dos veces a la vez: una gana y la otra es 409.
    const dosVeces = await Promise.all([
      api('POST', `/api/dataset/releases/${v4.id}/restaurar`, TEC),
      api('POST', `/api/dataset/releases/${v4.id}/restaurar`, TEC),
    ]);
    assert.deepStrictEqual(dosVeces.map((x) => x.status).sort(), [200, 409], dosVeces.map((x) => x.texto).join(' | '));
    assert.strictEqual(await publicados(REGION_VALLE), 1);
    // Publicar y restaurar a la vez.
    r = await api('POST', '/api/dataset/releases', ADMIN, { subregion_id: valle.id });
    const v5 = r.body;
    espera(await api('POST', `/api/dataset/releases/${v5.id}/aprobaciones`, HERP, { tipo: 'cientifica' }), 201, 'v5 científica');
    espera(await api('POST', `/api/dataset/releases/${v5.id}/aprobaciones`, ADMIN, { tipo: 'tecnica' }), 201, 'v5 técnica');
    const mezcla = await Promise.all([
      api('POST', `/api/dataset/releases/${v5.id}/publicar`, TEC),
      api('POST', `/api/dataset/releases/${idLegado}/restaurar`, TEC),
    ]);
    assert.ok(mezcla.every((x) => x.status === 200), mezcla.map((x) => x.texto).join(' | '));
    assert.strictEqual(await publicados(REGION_VALLE), 1);
    // La base lo garantiza aunque alguien salte el servidor.
    const otro = (await q(`SELECT id FROM packages.regional_packages WHERE region_id = $1 AND estado = 'retirado' LIMIT 1`, [REGION_VALLE])).rows[0];
    await assert.rejects(q(`UPDATE packages.regional_packages SET estado = 'publicado', is_published = TRUE WHERE id = $1`, [otro.id]), /regional_packages_publicado_idx|duplicate key/);
    // Ninguna subregión tiene dos publicados ni un is_published que contradiga el estado.
    const { rows: mal } = await q(`SELECT region_id FROM packages.regional_packages GROUP BY region_id HAVING count(*) FILTER (WHERE estado = 'publicado') > 1`);
    assert.strictEqual(mal.length, 0);
    const { rows: incoherentes } = await q(`SELECT id FROM packages.regional_packages WHERE is_published <> (estado = 'publicado')`);
    assert.strictEqual(incoherentes.length, 0, 'is_published siempre coincide con el estado');
    assert.ok(await objetoExiste(claveLegado), 'el archivo del paquete anterior no se borró nunca');
    console.log('ok 11 · con restauraciones y publicaciones simultáneas siempre queda un solo publicado; la base lo impide por su cuenta');

    // ── 11) Auditoría ───────────────────────────────────────────────────────────────────────────────────────────────────
    const { rows: acc } = await q(`SELECT action, COUNT(*)::int n FROM audit.log WHERE target_type = 'paquete' GROUP BY action ORDER BY action`);
    const por = Object.fromEntries(acc.map((a) => [a.action, a.n]));
    assert.strictEqual(por['dataset.paquete.importado_legado'], 9);
    assert.strictEqual(por['dataset.paquete.restaurado'], 6, JSON.stringify(por));
    const { rows: [ult] } = await q(`SELECT metadata, actor_id::text FROM audit.log WHERE action = 'dataset.paquete.restaurado' ORDER BY created_at LIMIT 1`);
    assert.strictEqual(ult.actor_id, TEC);
    assert.deepStrictEqual([ult.metadata.paquete, ult.metadata.origen, ult.metadata.de_version, ult.metadata.a_version], [REGION_VALLE, 'legado', 2, 1]);
    const { rows: [ret] } = await q(`SELECT metadata FROM audit.log WHERE action = 'dataset.paquete.retirado' AND metadata->>'motivo' = 'restauracion' ORDER BY created_at LIMIT 1`);
    assert.strictEqual(ret.metadata.version, 2);
    assert.strictEqual(ret.metadata.restaurada, 1);
    console.log('ok 12 · auditoría:', acc.map((a) => `${a.action}×${a.n}`).join(', '));

    console.log('TODAS LAS PRUEBAS PASARON');
  } finally {
    if (hijo) hijo.kill();
    servidores.forEach((s) => s.close());
    await pool.end();
  }
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
