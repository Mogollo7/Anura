// Prueba: el paquete compilado lleva el modelo de rechazo VALIDADO (formato ANOS v1) contra anura_osrpaq.
// Levanta: auth de prueba (39211), geo de prueba (39212), dataset-service (39210).
// MinIO de prueba: contenedor anura_test_minio_osrpaq en 127.0.0.1:39219.
//   sh D:/server/Anura/_pruebas/bd_prueba.sh anura_osrpaq
//   docker run -d --rm --name anura_test_minio_osrpaq -e MINIO_ROOT_USER=prueba -e MINIO_ROOT_PASSWORD=prueba-prueba \
//     -p 127.0.0.1:39219:9000 minio/minio:latest server /data
//   node D:/server/Anura/_pruebas/prueba_osrpaquete.js
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
const M = require(`${DS}/src/mahalanobis.js`);
const osrModelo = require(`${DS}/src/osrModelo.js`);

const DB = 'postgres://postgres:prueba@127.0.0.1:55432/anura_osrpaq';
const pool = new Pool({ connectionString: DB });
const q = (s, p) => pool.query(s, p);
const BASE = 'http://127.0.0.1:39210';
const ENCODER = '219e860e6fa9a80fb30a59fc8f61911421bbd53a4537dca831803d3ab446b2ad';
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (id) => `Bearer ${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id })}.firma`;

const servidores = [];
function stubAuth() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/api/panel/me')) {
        return res.end(JSON.stringify({ account: { id: 'acc-admin', name: 'Admin técnico', isSuperAdmin: true, permissions: {}, userId: ADMIN } }));
      }
      res.statusCode = 403;
      res.end(JSON.stringify({ message: 'no es cuenta del panel' }));
    }).listen(39211, '127.0.0.1', ok);
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
    }).listen(39212, '127.0.0.1', ok);
    servidores.push(s);
  });
}

async function api(method, ruta, body) {
  const res = await fetch(BASE + ruta, {
    method,
    headers: { Authorization: token(ADMIN), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* binario */ }
  return { status: res.status, body: json, texto };
}
const espera = (r, status, que) => assert.strictEqual(r.status, status, `${que}: esperaba ${status}, llegó ${r.status} ${r.texto.slice(0, 400)}`);

// Vectores sintéticos: una dirección por especie + ruido, normalizados (formato pgvector).
function vector(semilla, ruido) {
  let x = semilla * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280) - 0.5;
  const v = Array.from({ length: 512 }, (_, i) => (i % 7 === semilla % 7 ? 1 : 0) + rnd() * ruido);
  const n = Math.hypot(...v);
  return `[${v.map((a) => (a / n).toFixed(6)).join(',')}]`;
}

async function fixtures() {
  await q(`INSERT INTO auth.users (id, username, email) VALUES ($1, 'uosrpaq', 'uosrpaq@anura.test') ON CONFLICT DO NOTHING`, [ADMIN]);
  await q(`INSERT INTO dataset.encoder (sha256, nombre, archivo, dimension, preprocesado, normalizacion, contrato)
           VALUES ($1, 'bioclip_anura_v1', 'encoder_anura_fp16.onnx', 512, 'RGB 224x224 open_clip', 'L2', '{}') ON CONFLICT DO NOTHING`, [ENCODER]);
  const { rows: [ver] } = await q(`INSERT INTO dataset.version (nombre) VALUES ('prueba-osrpaq-v1') RETURNING id`);
  // [carpeta, nombre, genero, familia, taxon_id, observaciones, fotos por observación]
  const especies = [
    ['Boana_boans', 'Boana boans', 'Boana', 'Hylidae', 'COL_ANURA_9101', 4, 3],
    ['Rhinella_horribilis', 'Rhinella horribilis', 'Rhinella', 'Bufonidae', 'COL_ANURA_9102', 4, 3],
    ['Oophaga_sp', 'Oophaga sp', 'Oophaga', 'Dendrobatidae', 'COL_ANURA_9103', 2, 2], // no llega al piso: no entra al paquete
    ['Pristimantis_sin_taxon', 'Pristimantis nuevo', 'Pristimantis', 'Strabomantidae', null, 4, 3], // sin taxon_id: tampoco
  ];
  let n = 0;
  for (const [i, [carpeta, nombre, genero, familia, taxon, nObs, porObs]] of especies.entries()) {
    const { rows: [e] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [carpeta, nombre, genero, familia, taxon]);
    for (let o = 0; o < nObs; o++) {
      const { rows: [obs] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud) VALUES ('inaturalist', $1, $2, $3) RETURNING id`,
        [`osrpaq-${carpeta}-${o}`, 6.25 + o * 0.001, -75.56]);
      for (let f = 0; f < porObs; f++) {
        n += 1;
        const sha = crypto.createHash('sha256').update(`osrpaq-${carpeta}-${o}-${f}`).digest('hex');
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
  return spawn(process.execPath, ['src/index.js'], {
    cwd: DS,
    env: {
      ...process.env, PORT: '39210', DATABASE_URL: DB, AUTH_SERVICE_URL: 'http://127.0.0.1:39211', GEO_SERVICE_URL: 'http://127.0.0.1:39212',
      MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39219', MINIO_ROOT_USER: 'prueba', MINIO_ROOT_PASSWORD: 'prueba-prueba',
      MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39219', DATASET_BUCKET: 'anura-dataset',
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

const motivosDe = async (subId) => (await api('GET', `/api/dataset/validacion/${subId}`)).body.motivos.map((m) => m.codigo);

(async () => {
  let hijo = null;
  try {
    // Base limpia para lo de este bloque.
    await q('TRUNCATE packages.regional_packages CASCADE');
    await q('DELETE FROM dataset.osr_umbral'); await q('DELETE FROM dataset.osr_calibracion');
    await q("DELETE FROM audit.log WHERE target_type IN ('paquete', 'experimento', 'osr_calibracion', 'osr_umbral')");
    await q('DELETE FROM dataset.cluster'); await q('DELETE FROM dataset.morfo');
    await q('DELETE FROM dataset.experimento');
    await q('DELETE FROM dataset.embedding'); await q('DELETE FROM dataset.version_foto'); await q('DELETE FROM dataset.version');
    await q('DELETE FROM dataset.foto'); await q('DELETE FROM dataset.observacion'); await q('DELETE FROM dataset.especie');
    await fixtures();
    const { rows: [sub] } = await q(`SELECT id FROM dataset.subregion WHERE region = '05' AND clave = 'VALLE_DE_ABURRA'`);

    const minio = new Minio.Client({ endPoint: '127.0.0.1', port: 39219, useSSL: false, accessKey: 'prueba', secretKey: 'prueba-prueba', region: 'us-east-1' });
    if (!(await minio.bucketExists('anura-dataset'))) await minio.makeBucket('anura-dataset', 'us-east-1');

    await stubAuth();
    await stubGeo();
    hijo = levantarServicio();
    await esperarSalud();

    let r = await api('POST', '/api/dataset/centroides', {});
    espera(r, 201, 'calcular centroides');
    assert.deepStrictEqual(await motivosDe(sub.id), ['osr_sin_validar']);

    // 1) Un umbral "validado" a mano, sin calibración (como lo dejaba el contrato viejo): ya no basta.
    await q(`INSERT INTO dataset.osr_umbral (subregion_id, tau, validado_por, validado) VALUES ($1, 0.40, $2, NOW())`, [sub.id, ADMIN]);
    r = await api('GET', `/api/dataset/validacion/${sub.id}`);
    assert.strictEqual(r.body.lista, false);
    const sinModelo = r.body.motivos.find((m) => m.codigo === 'osr_sin_modelo');
    assert.ok(sinModelo && sinModelo.pantalla === '/osr' && /modelo de rechazo/.test(sinModelo.texto), JSON.stringify(r.body.motivos));
    r = await api('POST', '/api/dataset/releases', { subregion_id: sub.id });
    espera(r, 409, 'compilar sin modelo OSR');
    console.log('ok 1 · umbral sin calibración bloquea:', sinModelo.texto);

    // 2) Calibrar y validar de verdad. La calibración usa SOLO las especies que entran al paquete.
    r = await api('POST', '/api/dataset/osr/calibraciones', { subregion_id: sub.id });
    espera(r, 201, 'calibrar');
    const cal = r.body.calibracion;
    assert.strictEqual(cal.especies, 2, 'Oophaga (bajo el piso) y Pristimantis (sin taxon_id) no entran al modelo');
    const { rows: [calFila] } = await q('SELECT especie_ids, medias, precision FROM dataset.osr_calibracion WHERE id = $1', [cal.id]);
    const { rows: nombres } = await q('SELECT id, taxon_id FROM dataset.especie WHERE id = ANY($1::int[]) ORDER BY taxon_id', [calFila.especie_ids]);
    assert.deepStrictEqual(nombres.map((e) => e.taxon_id), ['COL_ANURA_9101', 'COL_ANURA_9102']);
    const tauValidado = cal.tau_propuesto * 1.05; // una persona ajusta el τ propuesto: lo que viaja es el suyo
    r = await api('POST', '/api/dataset/osr/validaciones', { calibracion_id: cal.id, tau: tauValidado, nota: 'prueba' });
    espera(r, 201, 'validar');
    r = await api('GET', `/api/dataset/validacion/${sub.id}`);
    assert.strictEqual(r.body.lista, true, JSON.stringify(r.body.motivos));
    assert.strictEqual(r.body.osr.calibracion_id, cal.id);
    console.log(`ok 2 · calibración ${cal.id} (${cal.especies} especies) validada con τ=${tauValidado.toFixed(4)} → lista para compilar`);

    // 3) Compilar y abrir el sqlite que sale del servidor (MinIO), como lo haría el teléfono.
    r = await api('POST', '/api/dataset/releases', { subregion_id: sub.id });
    espera(r, 201, 'compilar');
    const v1 = r.body;
    const bytesSqlite = await new Promise((ok, mal) => {
      minio.getObject('anura-dataset', 'paquetes/05.VALLE_DE_ABURRA/v1/package.sqlite').then((s) => {
        const trozos = [];
        s.on('data', (c) => trozos.push(c)); s.on('end', () => ok(Buffer.concat(trozos))); s.on('error', mal);
      }, mal);
    });
    assert.strictEqual(crypto.createHash('sha256').update(bytesSqlite).digest('hex'), v1.sha256);
    const tmp = path.join(os.tmpdir(), `prueba-osrpaq-${Date.now()}.sqlite`);
    fs.writeFileSync(tmp, bytesSqlite);
    const lite = new DatabaseSync(tmp, { readOnly: true });
    const fila = lite.prepare('SELECT id, format, dim, species, tau, sha256, data FROM open_set_model').all();
    assert.strictEqual(fila.length, 1);
    const m = fila[0];
    assert.strictEqual(m.id, 1);
    assert.strictEqual(m.format, 'ANOS v1');
    const blob = Buffer.from(m.data);
    assert.strictEqual(crypto.createHash('sha256').update(blob).digest('hex'), m.sha256, 'sha256 de la fila');
    const info = Object.fromEntries(lite.prepare('SELECT key, value FROM package_info').all().map((x) => [x.key, x.value]));
    assert.strictEqual(info.osr_model_sha256, m.sha256);
    assert.strictEqual(info.osr_model_format, 'ANOS v1');
    assert.strictEqual(info.osr_model_species, '2');
    assert.strictEqual(info.osr_tau, String(tauValidado));
    const { rows: [pq] } = await q('SELECT manifiesto FROM packages.regional_packages WHERE id = $1', [v1.id]);
    assert.strictEqual(pq.manifiesto.osr.modelo.sha256, m.sha256, 'el manifiesto lleva el sha256 del blob');
    assert.strictEqual(pq.manifiesto.osr.modelo.size_bytes, blob.length);
    assert.strictEqual(pq.manifiesto.osr.modelo.especies, 2);
    assert.strictEqual(pq.manifiesto.osr.calibracion_id, cal.id);
    console.log(`ok 3 · open_set_model: ${blob.length} bytes, sha256 ${m.sha256.slice(0, 12)}…, manifiesto y package_info coinciden`);

    // 4) Decodificar el ANOS byte a byte y comparar con la calibración y con mahalanobis.js.
    const anos = leerANOS(blob);
    assert.strictEqual(anos.dim, 512);
    assert.strictEqual(anos.k, 2);
    assert.strictEqual(anos.tau, tauValidado, 'τ del encabezado = el validado por la persona (float64 exacto)');
    assert.strictEqual(m.tau, tauValidado);
    const taxa = lite.prepare('SELECT taxon_id FROM taxa ORDER BY taxon_id').all().map((t) => t.taxon_id);
    assert.deepStrictEqual([...anos.ids].sort(), taxa, 'los ids del modelo son exactamente los taxon_id del paquete');
    assert.deepStrictEqual(anos.ids, nombres.length === 2 ? calFila.especie_ids.map((id) => nombres.find((e) => e.id === id).taxon_id) : null);
    // Las mismas medias y la misma precisión que guardó la calibración, sin conversión.
    const precisionBD = M.deBytes(calFila.precision);
    const mediasBD = M.deBytes(calFila.medias);
    assert.ok(anos.precision.every((x, i) => x === precisionBD[i]), 'precisión idéntica a la de osr_calibracion');
    anos.centroides.forEach((fila, c) => assert.ok(fila.every((x, d) => x === mediasBD[c * 512 + d]), `media ${c} idéntica`));
    const mediasBDfilas = anos.ids.map((_, c) => mediasBD.subarray(c * 512, (c + 1) * 512));
    // El decodificador del servidor da lo mismo que el escrito a mano.
    const dec = osrModelo.decodificar(blob);
    assert.deepStrictEqual(dec.ids, anos.ids);
    assert.strictEqual(dec.tau, anos.tau);

    // Mahalanobis de vectores conocidos (fotos de val y de train): ANOS ↔ mahalanobis.js ↔ puntajes que guardó el servidor.
    const { rows: fotos } = await q(`
      SELECT vf.particion, s.taxon_id, e.vector::text AS v FROM dataset.embedding e
      JOIN dataset.foto f ON f.sha256 = e.sha256 JOIN dataset.especie s ON s.id = f.especie_id
      JOIN dataset.version_foto vf ON vf.sha256 = e.sha256
      WHERE s.id = ANY($1::int[]) ORDER BY e.sha256`, [calFila.especie_ids]);
    const deAnos = (x) => M.minimaConPrecision(x, anos.centroides, anos.precision, 512);
    const deServidor = (x) => M.minimaConPrecision(x, mediasBDfilas, precisionBD, 512);
    const porPuntaje = [];
    for (const foto of fotos) {
      const x = JSON.parse(foto.v);
      const a = deAnos(x);
      const s = deServidor(x);
      assert.ok(Math.abs(a.distancia - s.distancia) < 1e-9, `Mahalanobis ANOS ${a.distancia} vs servidor ${s.distancia}`);
      assert.strictEqual(anos.ids[a.indice], anos.ids[s.indice]);
      if (foto.particion === 'val') porPuntaje.push(a.distancia);
      // Una foto de esta especie queda más cerca de su propia media que de la otra.
      assert.strictEqual(anos.ids[a.indice], foto.taxon_id, 'el centroide más cercano es el de su especie');
    }
    assert.ok(porPuntaje.length >= 2);
    // Otro camino de cálculo (Cholesky, el de la calibración): puntajes de calibración guardados a 3 decimales.
    const guardados = cal.resultado.puntajes.calibracion.slice().sort((p, q2) => p - q2);
    const propios = porPuntaje.slice().sort((p, q2) => p - q2);
    assert.strictEqual(propios.length, guardados.length);
    propios.forEach((p, i) => assert.ok(Math.abs(p - guardados[i]) < 6e-4, `val ${i}: ${p} vs ${guardados[i]}`));
    // Un vector arbitrario (no está en la base): la misma cuenta.
    const raro = Float64Array.from({ length: 512 }, (_, i) => Math.sin(i) * 0.05);
    assert.ok(Math.abs(deAnos(raro).distancia - deServidor(raro).distancia) < 1e-9);
    // Con τ del paquete: lo de val de sus especies se acepta según el umbral validado.
    const aceptadas = propios.filter((d) => d <= anos.tau).length;
    console.log(`ok 4 · ANOS decodificado: ${fotos.length} vectores, Mahalanobis igual al del servidor (<1e-9) y a los puntajes de la calibración (<6e-4); ${aceptadas}/${propios.length} de val aceptadas con τ`);
    lite.close();
    fs.rmSync(tmp);

    // 5) Casos que bloquean (y se restauran): sin calibración enlazada, tamaño malo, otras especies.
    const { rows: [vig] } = await q('SELECT id, calibracion_id FROM dataset.osr_umbral WHERE subregion_id = $1 AND validado IS NOT NULL ORDER BY id DESC LIMIT 1', [sub.id]);
    await q('UPDATE dataset.osr_umbral SET calibracion_id = NULL WHERE id = $1', [vig.id]);
    assert.deepStrictEqual(await motivosDe(sub.id), ['osr_sin_modelo']);
    await q('UPDATE dataset.osr_umbral SET calibracion_id = $2 WHERE id = $1', [vig.id, vig.calibracion_id]);
    assert.deepStrictEqual(await motivosDe(sub.id), []);

    await q('UPDATE dataset.osr_calibracion SET medias = substring(medias from 1 for 4096) WHERE id = $1', [vig.calibracion_id]);
    assert.deepStrictEqual(await motivosDe(sub.id), ['osr_modelo_invalido']);
    await q('UPDATE dataset.osr_calibracion SET medias = $2 WHERE id = $1', [vig.calibracion_id, calFila.medias]);

    const { rows: [oophaga] } = await q(`SELECT id FROM dataset.especie WHERE carpeta = 'Oophaga_sp'`);
    const { rows: [rhinella] } = await q(`SELECT id FROM dataset.especie WHERE carpeta = 'Rhinella_horribilis'`);
    const otras = calFila.especie_ids.map((id) => (id === rhinella.id ? oophaga.id : id));
    await q('UPDATE dataset.osr_calibracion SET especie_ids = $2 WHERE id = $1', [vig.calibracion_id, otras]);
    r = await api('GET', `/api/dataset/validacion/${sub.id}`);
    const otra = r.body.motivos.find((mo) => mo.codigo === 'osr_otras_especies');
    assert.ok(otra && otra.texto.includes('Rhinella horribilis') && /incluye una especie/.test(otra.texto), JSON.stringify(r.body.motivos));
    espera(await api('POST', '/api/dataset/releases', { subregion_id: sub.id }), 409, 'compilar con otras especies');
    await q('UPDATE dataset.osr_calibracion SET especie_ids = $2 WHERE id = $1', [vig.calibracion_id, calFila.especie_ids]);
    assert.deepStrictEqual(await motivosDe(sub.id), []);
    console.log('ok 5 · bloquea: sin calibración, tamaño inválido y especies distintas; se levanta al restaurar');

    // 6) Recalcular centroides deja obsoleto el modelo: hay que calibrar y validar otra vez.
    r = await api('POST', '/api/dataset/centroides', {});
    espera(r, 201, 'recalcular centroides');
    assert.deepStrictEqual(await motivosDe(sub.id), ['osr_otros_centroides']);
    r = await api('POST', '/api/dataset/osr/calibraciones', { subregion_id: sub.id });
    espera(r, 201, 'recalibrar');
    espera(await api('POST', '/api/dataset/osr/validaciones', { calibracion_id: r.body.calibracion.id, tau: r.body.calibracion.tau_propuesto }), 201, 'revalidar');
    assert.deepStrictEqual(await motivosDe(sub.id), []);
    r = await api('POST', '/api/dataset/releases', { subregion_id: sub.id });
    espera(r, 201, 'compilar v2');
    assert.strictEqual(r.body.version, 2);
    assert.notStrictEqual(r.body.manifiesto.osr.calibracion_id, cal.id, 'v2 usa la calibración nueva');
    assert.notStrictEqual(r.body.manifiesto.osr.modelo.sha256, m.sha256, 'v2 lleva el modelo nuevo');
    console.log('ok 6 · tras recalcular centroides: bloquea, recalibra, valida y compila v2 con modelo nuevo');

    console.log('TODAS LAS PRUEBAS PASARON');
  } finally {
    if (hijo) hijo.kill();
    servidores.forEach((s) => s.close());
    await pool.end();
  }
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
