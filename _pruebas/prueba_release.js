// Pruebas del bloque 4 (Validación técnica + Release + entrega pública) contra anura_release.
// Levanta: auth de prueba con 4 cuentas (39131), geo de prueba (39132), dataset-service (39130).
// MinIO de prueba: contenedor anura_test_minio_release en 127.0.0.1:39139.
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
const validacion = require(`${DS}/src/validacionTecnica.js`);

const DB = 'postgres://postgres:prueba@127.0.0.1:55432/anura_release';
const pool = new Pool({ connectionString: DB });
const q = (s, p) => pool.query(s, p);
const BASE = 'http://127.0.0.1:39130';
const ENCODER = '219e860e6fa9a80fb30a59fc8f61911421bbd53a4537dca831803d3ab446b2ad';

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
    }).listen(39131, '127.0.0.1', ok);
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
    }).listen(39132, '127.0.0.1', ok);
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
  const { rows: [ver] } = await q(`INSERT INTO dataset.version (nombre) VALUES ('prueba-release-v1') RETURNING id`);
  // [carpeta, nombre, genero, familia, taxon_id, observaciones, fotos por observación]
  const especies = [
    ['Boana_boans', 'Boana boans', 'Boana', 'Hylidae', 'COL_ANURA_9101', 4, 3],
    ['Rhinella_horribilis', 'Rhinella horribilis', 'Rhinella', 'Bufonidae', 'COL_ANURA_9102', 4, 3],
    ['Oophaga_sp', 'Oophaga sp', 'Oophaga', 'Dendrobatidae', 'COL_ANURA_9103', 2, 2], // no llega al piso
    ['Pristimantis_sin_taxon', 'Pristimantis nuevo', 'Pristimantis', 'Strabomantidae', null, 4, 3], // sin taxon_id
  ];
  let n = 0;
  for (const [i, [carpeta, nombre, genero, familia, taxon, nObs, porObs]] of especies.entries()) {
    const { rows: [e] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [carpeta, nombre, genero, familia, taxon]);
    for (let o = 0; o < nObs; o++) {
      const { rows: [obs] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud) VALUES ('inaturalist', $1, $2, $3) RETURNING id`,
        [`rel-${carpeta}-${o}`, 6.25 + o * 0.001, -75.56]);
      for (let f = 0; f < porObs; f++) {
        n += 1;
        const sha = crypto.createHash('sha256').update(`${carpeta}-${o}-${f}`).digest('hex');
        await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado, licencia, atribucion)
                 VALUES ($1, $2, $3, $4, $5, $6, 'cc-by', $7)`, [sha, `fotos/${sha}.jpg`, e.id, obs.id, `${n}.jpg`, taxon ? 'catalogo' : 'fuera_de_catalogo', `(c) Autor ${n}`]);
        const particion = nObs > 2 && o === nObs - 1 ? 'val' : 'train';
        await q(`INSERT INTO dataset.version_foto (version_id, sha256, particion) VALUES ($1, $2, $3)`, [ver.id, sha, particion]);
        await q(`INSERT INTO dataset.embedding (sha256, encoder_sha256, vector) VALUES ($1, $2, $3::vector)`, [sha, ENCODER, vector(i + 1, 0.3 + f * 0.01 + o * 0.02)]);
      }
    }
  }
}

function levantarServicio() {
  const hijo = spawn(process.execPath, ['src/index.js'], {
    cwd: DS,
    env: {
      ...process.env, PORT: '39130', DATABASE_URL: DB, AUTH_SERVICE_URL: 'http://127.0.0.1:39131', GEO_SERVICE_URL: 'http://127.0.0.1:39132',
      MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39139', MINIO_ROOT_USER: 'prueba', MINIO_ROOT_PASSWORD: 'prueba-prueba',
      MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39139', DATASET_BUCKET: 'anura-dataset',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return hijo;
}

async function esperarSalud() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('dataset-service no arrancó');
}

(async () => {
  let hijo = null;
  try {
    // Reglas: el servidor no diverge del Admin.
    const reglas = fs.readFileSync('D:/server/Anura/admin/src/lib/dataset/reglas.ts', 'utf8');
    assert.strictEqual(Number(/MIN_FOTOS_ENTRENABLE = (\d+)/.exec(reglas)[1]), validacion.MIN_FOTOS_ENTRENABLE, 'MIN_FOTOS_ENTRENABLE diverge');
    assert.strictEqual(Number(/MIN_INDIVIDUOS = (\d+)/.exec(reglas)[1]), validacion.MIN_INDIVIDUOS, 'MIN_INDIVIDUOS diverge');

    // Base limpia para lo de este bloque.
    await q('TRUNCATE packages.regional_packages CASCADE');
    await q("DELETE FROM dataset.osr_umbral");
    await q("DELETE FROM audit.log WHERE target_type IN ('paquete', 'experimento')");
    await q('DELETE FROM dataset.cluster'); await q('DELETE FROM dataset.morfo');
    await q('DELETE FROM dataset.experimento');
    await q("DELETE FROM dataset.embedding"); await q('DELETE FROM dataset.version_foto'); await q('DELETE FROM dataset.version');
    await q('DELETE FROM dataset.foto'); await q('DELETE FROM dataset.observacion'); await q('DELETE FROM dataset.especie');
    await fixtures();
    const { rows: [sub] } = await q(`SELECT id FROM dataset.subregion WHERE region = '05' AND clave = 'VALLE_DE_ABURRA'`);
    const { rows: [otra] } = await q(`SELECT id FROM dataset.subregion WHERE region = '05' AND clave = 'URABA'`);
    // Morfos (bloque 1/5): «verde» de Boana con 3 individuos de train (tiene centroide) y «rojo» de
    // Rhinella con 1 (usa el de la especie). Clúster aceptado Boana + Rhinella y uno descartado.
    await q(`INSERT INTO dataset.morfo (especie_id, subregion_id, nombre) SELECT id, $1, 'verde' FROM dataset.especie WHERE carpeta = 'Boana_boans'`, [sub.id]);
    await q(`INSERT INTO dataset.morfo (especie_id, subregion_id, nombre) SELECT id, $1, 'rojo' FROM dataset.especie WHERE carpeta = 'Rhinella_horribilis'`, [sub.id]);
    await q(`INSERT INTO dataset.observacion_etiqueta (observacion_id, morfo_id)
             SELECT o.id, m.id FROM dataset.observacion o JOIN dataset.morfo m ON m.nombre = 'verde'
             WHERE o.fuente_id IN ('rel-Boana_boans-0', 'rel-Boana_boans-1', 'rel-Boana_boans-2')`);
    await q(`INSERT INTO dataset.observacion_etiqueta (observacion_id, morfo_id)
             SELECT o.id, m.id FROM dataset.observacion o JOIN dataset.morfo m ON m.nombre = 'rojo' WHERE o.fuente_id = 'rel-Rhinella_horribilis-0'`);
    const { rows: ids } = await q(`SELECT id, carpeta FROM dataset.especie`);
    const idDe = Object.fromEntries(ids.map((e) => [e.carpeta, e.id]));
    await q(`INSERT INTO dataset.cluster (miembros, nombre, origen, estado) VALUES ($1, 'Boana-Rhinella', 'manual', 'aceptado')`,
      [[idDe.Boana_boans, idDe.Rhinella_horribilis].sort((a, b) => a - b)]);
    await q(`INSERT INTO dataset.cluster (miembros, nombre, origen, estado, motivo) VALUES ($1, 'Descartado', 'manual', 'descartado', 'no se confunden')`,
      [[idDe.Boana_boans, idDe.Oophaga_sp].sort((a, b) => a - b)]);

    const minio = new Minio.Client({ endPoint: '127.0.0.1', port: 39139, useSSL: false, accessKey: 'prueba', secretKey: 'prueba-prueba', region: 'us-east-1' });
    if (!(await minio.bucketExists('anura-dataset'))) await minio.makeBucket('anura-dataset', 'us-east-1');

    await stubAuth();
    await stubGeo();
    hijo = levantarServicio();
    await esperarSalud();

    // 1) Sin tabla osr_umbral (el agente osr aún no migró): motivo y sin romper.
    await q('ALTER TABLE dataset.osr_umbral RENAME TO osr_umbral_oculta');
    let r = await api('GET', `/api/dataset/validacion/${sub.id}`, LECTOR);
    await q('ALTER TABLE dataset.osr_umbral_oculta RENAME TO osr_umbral');
    espera(r, 200, 'validación sin tabla OSR');
    assert.strictEqual(r.body.lista, false);
    assert.ok(r.body.motivos.some((m) => m.codigo === 'osr_sin_validar' && m.texto === 'Falta validar el umbral OSR' && m.pantalla === '/osr'));
    assert.ok(r.body.motivos.some((m) => m.codigo === 'sin_centroides'), 'sin centroides todavía');
    console.log('ok 1 · sin tabla OSR y sin centroides:', r.body.motivos.map((m) => m.codigo).join(', '));

    // 2) Sin sesión / subregión inexistente.
    espera(await api('GET', `/api/dataset/validacion/${sub.id}`), 401, 'sin sesión');
    espera(await api('GET', '/api/dataset/validacion/999999', LECTOR), 404, 'subregión inexistente');

    // 3) Centroides reales (M3) con el geo de prueba → queda solo el OSR.
    r = await api('POST', '/api/dataset/centroides', ADMIN, {});
    espera(r, 201, 'calcular centroides');
    r = await api('GET', `/api/dataset/validacion/${sub.id}`, LECTOR);
    assert.deepStrictEqual(r.body.motivos.map((m) => m.codigo), ['osr_sin_validar']);
    const incluidas = r.body.especies.filter((e) => e.incluida).map((e) => e.nombre_cientifico).sort();
    assert.deepStrictEqual(incluidas, ['Boana boans', 'Rhinella horribilis']);
    assert.ok(r.body.avisos.some((a) => a.codigo === 'no_entrenables' && a.texto.includes('Oophaga sp')));
    assert.ok(r.body.avisos.some((a) => a.codigo === 'sin_taxon_id' && a.texto.includes('Pristimantis nuevo')));
    assert.ok(r.body.avisos.some((a) => a.codigo === 'morfo_sin_centroide' && a.texto.includes('rojo')));
    assert.deepStrictEqual(r.body.morfos.map((mo) => `${mo.nombre}:${mo.calculado}`).sort(), ['rojo:false', 'verde:true']);
    assert.deepStrictEqual(r.body.clusteres.map((c) => c.nombre), ['Boana-Rhinella']);
    console.log('ok 2 · con centroides solo falta el OSR; avisos:', r.body.avisos.map((a) => a.codigo).join(', '));

    // Resumen de todas las subregiones: Urabá no tiene especies.
    r = await api('GET', '/api/dataset/validacion', LECTOR);
    espera(r, 200, 'resumen');
    const uraba = r.body.subregiones.find((s) => s.id === otra.id);
    assert.ok(uraba.motivos.some((m) => m.codigo === 'sin_especies'));

    // 4) Compilar bloqueado si no está lista (409 con motivos) y sin permiso (403).
    r = await api('POST', '/api/dataset/releases', ADMIN, { subregion_id: sub.id });
    espera(r, 409, 'compilar sin OSR');
    assert.ok(r.body.motivos.some((m) => m.codigo === 'osr_sin_validar'));
    espera(await api('POST', '/api/dataset/releases', HERP, { subregion_id: sub.id }), 403, 'compilar sin permiso');
    console.log('ok 3 · compilar bloqueado:', r.body.message);

    // 5) Una persona valida el umbral OSR (lo que escribe el bloque osr) → lista.
    await q(`INSERT INTO dataset.osr_umbral (subregion_id, tau, validado_por, validado) VALUES ($1, 0.42, NULL, NULL)`, [sub.id]);
    r = await api('GET', `/api/dataset/validacion/${sub.id}`, LECTOR);
    assert.strictEqual(r.body.lista, false, 'una propuesta sin validar no cuenta');
    // Un umbral "validado" sin su calibración (medias y precisión) ya no basta: el paquete lleva el modelo.
    await q(`INSERT INTO dataset.osr_umbral (subregion_id, tau, validado_por, validado) VALUES ($1, 0.40, $2, NOW())`, [sub.id, HERP]);
    r = await api('GET', `/api/dataset/validacion/${sub.id}`, LECTOR);
    assert.ok(r.body.motivos.some((m) => m.codigo === 'osr_sin_modelo'), 'umbral sin calibración bloquea');
    // Lo que hace el Admin: calibrar en OSR y validar (aquí con τ = 0.40).
    r = await api('POST', '/api/dataset/osr/calibraciones', ADMIN, { subregion_id: sub.id });
    espera(r, 201, 'calibrar OSR');
    const calibracionId = r.body.calibracion.id;
    espera(await api('POST', '/api/dataset/osr/validaciones', ADMIN, { calibracion_id: calibracionId, tau: 0.4 }), 201, 'validar OSR');
    r = await api('GET', `/api/dataset/validacion/${sub.id}`, LECTOR);
    assert.strictEqual(r.body.lista, true, JSON.stringify(r.body.motivos));
    console.log('ok 4 · umbral validado → lista para compilar');

    // 6) Compilar: borrador v1 en MinIO.
    r = await api('POST', '/api/dataset/releases', ADMIN, { subregion_id: sub.id });
    espera(r, 201, 'compilar');
    const v1 = r.body;
    assert.strictEqual(v1.estado, 'borrador');
    assert.strictEqual(v1.version, 1);
    assert.strictEqual(v1.paquete_id, '05.VALLE_DE_ABURRA');
    assert.strictEqual(v1.especies, 2);
    assert.strictEqual(v1.tau, 0.4);
    console.log(`ok 5 · compilado ${v1.paquete_id} v${v1.version}: ${v1.size_bytes} bytes`);

    // 7) Publicar sin aprobaciones → 409. Aprobaciones: permisos y cuentas distintas.
    espera(await api('POST', `/api/dataset/releases/${v1.id}/publicar`, TEC), 409, 'publicar sin aprobaciones');
    espera(await api('POST', `/api/dataset/releases/${v1.id}/aprobaciones`, TEC, { tipo: 'cientifica' }), 403, 'técnico no aprueba lo científico');
    espera(await api('POST', `/api/dataset/releases/${v1.id}/aprobaciones`, HERP, { tipo: 'tecnica' }), 403, 'herpetóloga no aprueba lo técnico');
    espera(await api('POST', `/api/dataset/releases/${v1.id}/aprobaciones`, LECTOR, { tipo: 'cientifica' }), 403, 'lector no aprueba');
    espera(await api('POST', `/api/dataset/releases/${v1.id}/aprobaciones`, ADMIN, { tipo: 'otra' }), 400, 'tipo inválido');
    // Quien compila da una aprobación…
    r = await api('POST', `/api/dataset/releases/${v1.id}/aprobaciones`, ADMIN, { tipo: 'cientifica' });
    espera(r, 201, 'aprobación científica del que compila');
    assert.strictEqual(r.body.estado, 'borrador');
    // …pero no cuenta dos veces.
    r = await api('POST', `/api/dataset/releases/${v1.id}/aprobaciones`, ADMIN, { tipo: 'tecnica' });
    espera(r, 409, 'misma cuenta dos veces');
    console.log('ok 6 · misma cuenta dos veces →', r.status, r.body.message);
    espera(await api('POST', `/api/dataset/releases/${v1.id}/publicar`, TEC), 409, 'publicar con una sola aprobación');
    r = await api('POST', `/api/dataset/releases/${v1.id}/aprobaciones`, TEC, { tipo: 'tecnica' });
    espera(r, 201, 'aprobación técnica');
    assert.strictEqual(r.body.estado, 'aprobado');
    assert.deepStrictEqual(r.body.aprobaciones.map((a) => a.cuenta).sort(), ['acc-admin', 'acc-tec']);
    espera(await api('POST', `/api/dataset/releases/${v1.id}/aprobaciones`, HERP, { tipo: 'cientifica' }), 409, 'ya aprobado');
    // La base también lo impide aunque alguien salte el servidor.
    await assert.rejects(q(`INSERT INTO packages.aprobacion (paquete_id, tipo, cuenta) VALUES ($1, 'tecnica', 'acc-admin')`, [v1.id]), /duplicate key/);

    // 8) Publicar: sin permiso 403; con permiso 200.
    espera(await api('POST', `/api/dataset/releases/${v1.id}/publicar`, HERP), 403, 'publicar sin permiso');
    r = await api('POST', `/api/dataset/releases/${v1.id}/publicar`, TEC);
    espera(r, 200, 'publicar');
    assert.strictEqual(r.body.estado, 'publicado');
    espera(await api('POST', `/api/dataset/releases/${v1.id}/publicar`, TEC), 409, 'publicar dos veces');
    console.log('ok 7 · publicado v1');

    // 9) Visible en el endpoint público, sin sesión; el archivo es el sqlite que la app sabe leer.
    r = await api('GET', '/api/dataset/publico/paquetes');
    espera(r, 200, 'árbol público');
    assert.strictEqual(r.res.headers.get('access-control-allow-origin'), '*');
    const dep = r.body.paises[0].hijos.find((d) => d.id === '05');
    const nodo = dep.hijos.find((h) => h.id === '05.VALLE_DE_ABURRA');
    assert.ok(nodo, 'la subregión publicada aparece en el árbol');
    assert.strictEqual(nodo.version, '1');
    assert.strictEqual(nodo.formato, 'sqlite');
    assert.strictEqual(nodo.sha256, v1.sha256);
    const bajada = await fetch(BASE + nodo.archivo_url);
    assert.strictEqual(bajada.status, 200);
    const bytes = Buffer.from(await bajada.arrayBuffer());
    assert.strictEqual(bytes.length, nodo.size_archivo);
    assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), nodo.sha256);
    const tmp = path.join(os.tmpdir(), `prueba-release-${Date.now()}.sqlite`);
    fs.writeFileSync(tmp, bytes);
    const lite = new DatabaseSync(tmp, { readOnly: true, allowExtension: true });
    sqliteVec.load(lite);
    assert.strictEqual(lite.prepare('SELECT COUNT(*) n FROM taxa').get().n, 2);
    const nRefs = lite.prepare('SELECT COUNT(*) n FROM vec_references').get().n;
    assert.strictEqual(nRefs, 18, 'train de Boana + Rhinella: 3 observaciones × 3 fotos cada una');
    assert.strictEqual(lite.prepare('SELECT COUNT(*) n FROM reference_images').get().n, nRefs);
    const { rows: [unVector] } = await q(`SELECT e.vector::real[] AS v FROM dataset.embedding e JOIN dataset.foto f ON f.sha256 = e.sha256
      JOIN dataset.especie s ON s.id = f.especie_id WHERE s.taxon_id = 'COL_ANURA_9101' LIMIT 1`);
    const buf = Buffer.alloc(2048); unVector.v.forEach((x, i) => buf.writeFloatLE(x, i * 4));
    const vecinos = lite.prepare('SELECT taxon_id, distance FROM vec_references WHERE embedding MATCH ? AND k = 5 ORDER BY distance').all(buf);
    assert.strictEqual(vecinos[0].taxon_id, 'COL_ANURA_9101');
    assert.ok(vecinos[0].distance < 1e-5, 'el vecino más cercano es la misma foto');
    for (const t of ['grid_cells', 'zone_prior', 'zone_prior_meta', 'weather_prior']) {
      assert.strictEqual(lite.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, `${t} vacía`);
    }
    assert.strictEqual(lite.prepare("SELECT value FROM package_info WHERE key = 'encoder_onnx_sha256'").get().value, ENCODER);
    assert.strictEqual(lite.prepare("SELECT value FROM package_info WHERE key = 'osr_tau'").get().value, '0.4');
    const modeloOsr = lite.prepare('SELECT format, dim, species, tau, sha256, length(data) AS n FROM open_set_model').get();
    assert.deepStrictEqual([modeloOsr.format, modeloOsr.dim, modeloOsr.species, modeloOsr.tau], ['ANOS v1', 512, 2, 0.4]);
    assert.strictEqual(modeloOsr.n, 24 + 512 * 512 * 8 + 2 * 512 * 8 + 2 * (4 + 14), 'ANOS: cabecera + precisión + 2 medias + 2 ids');
    assert.ok(lite.prepare('SELECT COUNT(*) n FROM occurrence_points').get().n >= 8);
    assert.strictEqual(lite.prepare("SELECT COUNT(*) n FROM centroids WHERE level = 'especie'").get().n, 2);
    assert.strictEqual(lite.prepare('SELECT COUNT(*) n FROM taxon_context').get().n, 2);
    assert.deepStrictEqual(lite.prepare('SELECT taxon_id, name FROM morph_centroids').all().map((m) => `${m.taxon_id}:${m.name}`), ['COL_ANURA_9101:verde']);
    assert.deepStrictEqual(JSON.parse(lite.prepare('SELECT members FROM clusters').get().members).sort(), ['COL_ANURA_9101', 'COL_ANURA_9102']);
    lite.close();
    fs.rmSync(tmp);
    r = await api('GET', nodo.manifiesto_url);
    espera(r, 200, 'manifiesto público');
    assert.strictEqual(r.body.archivo.sha256, nodo.sha256);
    assert.strictEqual(r.body.especies.length, 2);
    espera(await api('GET', '/api/dataset/publico/paquetes/05.URABA/archivo'), 404, 'no publicado');
    console.log(`ok 8 · endpoint público: ${nRefs} vectores, sha256 coincide, k-NN responde`);

    // 10) Borrador desactualizado: cambia el umbral después de compilar → no se aprueba.
    r = await api('POST', '/api/dataset/releases', ADMIN, { subregion_id: sub.id });
    espera(r, 201, 'compilar v2');
    const v2 = r.body;
    assert.strictEqual(v2.version, 2);
    espera(await api('POST', '/api/dataset/osr/validaciones', ADMIN, { calibracion_id: calibracionId, tau: 0.38 }), 201, 'validar OSR con otro τ');
    r = await api('GET', `/api/dataset/releases?subregion_id=${sub.id}`, LECTOR);
    assert.strictEqual(r.body.paquetes.find((p) => p.id === v2.id).desactualizado, true);
    r = await api('POST', `/api/dataset/releases/${v2.id}/aprobaciones`, HERP, { tipo: 'cientifica' });
    espera(r, 409, 'aprobar desactualizado');
    console.log('ok 9 · borrador desactualizado:', r.body.message);

    // 11) v3 fresco: dos aprobaciones y publicar → v1 queda retirado.
    r = await api('POST', '/api/dataset/releases', ADMIN, { subregion_id: sub.id });
    const v3 = r.body;
    espera(await api('POST', `/api/dataset/releases/${v3.id}/aprobaciones`, HERP, { tipo: 'cientifica' }), 201, 'v3 científica');
    espera(await api('POST', `/api/dataset/releases/${v3.id}/aprobaciones`, ADMIN, { tipo: 'tecnica' }), 201, 'v3 técnica (quien compiló)');
    r = await api('POST', `/api/dataset/releases/${v3.id}/publicar`, TEC);
    espera(r, 200, 'publicar v3');
    assert.strictEqual(r.body.reemplazado.version, 1);
    const { rows: estados } = await q('SELECT version, estado FROM packages.regional_packages ORDER BY version');
    assert.deepStrictEqual(estados.map((e) => `${e.version}:${e.estado}`), ['1:retirado', '2:borrador', '3:publicado']);
    r = await api('GET', '/api/dataset/publico/paquetes');
    assert.strictEqual(r.body.paises[0].hijos[0].hijos[0].version, '3');
    console.log('ok 10 · v3 publicada, v1 retirada');

    // 12) Auditoría de cada paso.
    const { rows: aud } = await q(`SELECT action, COUNT(*)::int n, array_agg(DISTINCT actor_id::text) actores
      FROM audit.log WHERE target_type = 'paquete' GROUP BY action ORDER BY action`);
    const por = Object.fromEntries(aud.map((a) => [a.action, a.n]));
    assert.deepStrictEqual(por, {
      'dataset.paquete.aprobado': 4, 'dataset.paquete.compilado': 3, 'dataset.paquete.publicado': 2, 'dataset.paquete.retirado': 1,
    });
    console.log('ok 11 · auditoría:', aud.map((a) => `${a.action}×${a.n}`).join(', '));

    // 13) El CLI llama al mismo compilador.
    const cli = spawn(process.execPath, ['scripts/publicar-paquetes.mjs', 'validar', String(otra.id)], {
      cwd: DS, env: { ...process.env, DATABASE_URL: DB }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    cli.stdout.on('data', (c) => (salida += c));
    const codigo = await new Promise((ok) => cli.on('close', ok));
    assert.strictEqual(codigo, 1);
    assert.ok(salida.includes('Urabá: no está lista'), salida);
    console.log('ok 12 · CLI validar:', salida.split('\n')[0]);

    console.log('TODAS LAS PRUEBAS PASARON');
  } finally {
    if (hijo) hijo.kill();
    servidores.forEach((s) => s.close());
    await pool.end();
  }
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
