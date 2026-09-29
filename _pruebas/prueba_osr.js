// Pruebas del bloque 6 (OSR, Métricas, Simulador) contra la base desechable anura_osr.
// Levanta: auth de prueba (:39151, dos cuentas: super y solo lectura), geo de prueba (:39153) y
// dataset-service real (:39150). Siembra embeddings SINTÉTICOS de 512 dimensiones SOLO en anura_osr.
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const assert = require('assert');
const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');

const BD = 'postgres://postgres:prueba@127.0.0.1:55432/anura_osr';
const pool = new Pool({ connectionString: BD });
const USER_ID = 'd81f2281-6086-435e-9de6-603f766fdf5e';
const LECTOR_ID = '11111111-2222-4333-8444-555555555555';
const ENCODER = '219e860e6fa9a80fb30a59fc8f61911421bbd53a4537dca831803d3ab446b2ad';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (id, firma) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id })}.${firma}`;
const SUPER = jwt(USER_ID, 'super');
const LECTOR = jwt(LECTOR_ID, 'lector');

// ── Servicios de prueba ──────────────────────────────────────────────────────────────
const auth = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const lector = (req.headers.authorization || '').endsWith('.lector');
  const account = lector
    ? { id: 'acc-lector', name: 'Lectora', email: 'l@anura.test', isSuperAdmin: false, permissions: { verEspecies: true } }
    : { id: 'acc-prueba', name: 'Cuenta de prueba', email: 'prueba@anura.test', isSuperAdmin: true, permissions: {} };
  if (req.url.startsWith('/api/panel/me')) return res.end(JSON.stringify({ account }));
  res.statusCode = 404;
  res.end('{}');
});
// Geo: latitud < 7 → Medellín (Valle de Aburrá); si no, un municipio de Urabá.
const geo = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => (cuerpo += c));
  req.on('end', () => {
    const { puntos } = JSON.parse(cuerpo || '{"puntos":[]}');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ municipios: puntos.map(([lat]) => (lat < 7 ? '05001' : '05045')) }));
  });
});

let servicio;
async function arrancar() {
  await new Promise((r) => auth.listen(39151, '127.0.0.1', r));
  await new Promise((r) => geo.listen(39153, '127.0.0.1', r));
  servicio = spawn(process.execPath, ['src/index.js'], {
    cwd: 'D:/server/Anura/services/dataset-service',
    env: {
      ...process.env, PORT: '39150', DATABASE_URL: BD, AUTH_SERVICE_URL: 'http://127.0.0.1:39151',
      GEO_SERVICE_URL: 'http://127.0.0.1:39153', MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39159',
      MINIO_ROOT_USER: 'prueba', MINIO_ROOT_PASSWORD: 'prueba-prueba', MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39159',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:39150/health')).ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('dataset-service no arrancó');
}

async function api(metodo, ruta, cuerpo, token = SUPER) {
  const res = await fetch(`http://127.0.0.1:39150${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ── Embeddings sintéticos ─────────────────────────────────────────────────────────────
let semilla = 12345;
const azar = () => {
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
  return semilla / 0x7fffffff;
};
const gauss = () => Math.sqrt(-2 * Math.log(azar() + 1e-12)) * Math.cos(2 * Math.PI * azar());
const unitario = (v) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / n);
};
const DIM = 512;
const prototipo = () => unitario(Array.from({ length: DIM }, gauss));
const foto = (p, ruido) => unitario(p.map((x) => x + ruido * gauss() / Math.sqrt(DIM)));
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function sembrar() {
  const q = (s, p) => pool.query(s, p);
  await q(`TRUNCATE dataset.osr_umbral, dataset.osr_calibracion, dataset.evaluacion_especie, dataset.evaluacion,
           dataset.experimento, dataset.embedding, dataset.version_foto, dataset.version, dataset.foto,
           dataset.observacion, dataset.especie RESTART IDENTITY CASCADE`);
  await q(`DELETE FROM audit.log`);
  await q(`INSERT INTO auth.users (id, username, email) VALUES ($1, 'sebas', 'prueba@anura.test'), ($2, 'lectora', 'l@anura.test')
           ON CONFLICT DO NOTHING`, [USER_ID, LECTOR_ID]);
  await q(`UPDATE dataset.region SET estado = 'activa' WHERE codigo_dane = '05'`);
  await q(`INSERT INTO dataset.encoder (sha256, nombre, archivo, dimension, preprocesado, normalizacion, contrato)
           VALUES ($1, 'bioclip_anura_v1', 'encoder_anura_fp16.onnx', 512, 'clip', 'l2', '{}') ON CONFLICT DO NOTHING`, [ENCODER]);
  const { rows: [ver] } = await q(`INSERT INTO dataset.version (nombre) VALUES ('prueba_osr') RETURNING id`);

  // 6 especies en Valle de Aburrá (lat 6,2), 2 solo en Urabá (lat 8) y 1 sin centroide (fuera del manifiesto).
  const especies = [
    ...['alfa', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].map((n) => ({ n, lat: 6.2 })),
    { n: 'eta', lat: 8 }, { n: 'theta', lat: 8 },
    { n: 'iota', lat: 8, sinManifiesto: true },
  ];
  const fotos = {};
  for (const [i, e] of especies.entries()) {
    // Con taxon_id del catálogo: sin él la especie no entra al paquete y la calibración de una subregión no la cuenta.
    const { rows: [es] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id)
      VALUES ($1, $2, $3, 'Prueboidae', $4) RETURNING id`, [`Rana_${e.n}`, `Rana ${e.n}`, i < 3 ? 'Rana' : 'Otra', `COL_ANURA_${9200 + i}`]);
    e.id = es.id;
    e.p = prototipo();
    fotos[e.n] = { train: [], val: [], test: [], fuera: [] };
    for (let o = 0; o < 20; o++) {
      const { rows: [ob] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud)
        VALUES ('manual', $1, $2, -75.5) RETURNING id`, [`${e.n}-${o}`, e.lat + o * 0.001]);
      const particion = e.sinManifiesto ? null : o < 12 ? 'train' : o < 16 ? 'val' : 'test';
      for (let k = 0; k < 3; k++) {
        const sha = hash(`${e.n}-${o}-${k}`);
        await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado)
          VALUES ($1, $2, $3, $4, $5, $6)`, [sha, `fotos/${sha}.jpg`, es.id, ob.id, `${e.n}-${o}-${k}.jpg`, e.sinManifiesto ? 'fuera_de_catalogo' : 'catalogo']);
        await q(`INSERT INTO dataset.embedding (sha256, encoder_sha256, vector) VALUES ($1, $2, $3)`,
          [sha, ENCODER, JSON.stringify(foto(e.p, 0.9))]);
        if (particion) await q(`INSERT INTO dataset.version_foto (version_id, sha256, particion) VALUES ($1, $2, $3)`, [ver.id, sha, particion]);
        fotos[e.n][particion || 'fuera'].push(sha);
      }
    }
  }
  return { especies, fotos };
}

async function espera(p, status) {
  const r = await p;
  assert.strictEqual(r.status, status, `esperaba ${status}, llegó ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body;
}

(async () => {
  const { especies, fotos } = await sembrar();
  await arrancar();
  const id = (n) => especies.find((e) => e.n === n).id;

  // Antes de centroides: OSR y Métricas dicen qué falta.
  let r = await espera(api('POST', '/api/dataset/osr/calibraciones', { subregion_id: 1 }), 409);
  assert.match(r.message, /centroides/i);
  const est0 = await espera(api('GET', '/api/dataset/osr?subregion_id=1'), 200);
  assert.strictEqual(est0.calibracion, null);

  await espera(api('POST', '/api/dataset/centroides', {}), 201);

  // ── OSR ─────────────────────────────────────────────────────────────────────────
  await espera(api('POST', '/api/dataset/osr/calibraciones', { subregion_id: 1 }, LECTOR), 403);
  await espera(api('POST', '/api/dataset/osr/calibraciones', { subregion_id: 1, kar_objetivo: 2 }), 400);
  let t0 = Date.now();
  const est = await espera(api('POST', '/api/dataset/osr/calibraciones', { subregion_id: 1, kar_objetivo: 0.95 }), 201);
  const c = est.calibracion;
  const res = c.resultado;
  console.log(`calibración en ${Date.now() - t0} ms: especies ${c.especies}, train ${c.n_train}, val ${c.n_calibracion}, medidas ${c.n_conocidas} (${c.particion_medida}), desconocidas ${c.n_desconocidas}`);
  console.log(`τ ${res.tau} · KAR ${res.kar} · FAR ${res.far} · AUROC ${res.auroc} · shrinkage ${c.shrinkage.toFixed(4)} · coseno ${JSON.stringify(res.coseno)}`);
  assert.strictEqual(c.especies, 6);
  assert.strictEqual(c.n_train, 8 * 12 * 3, 'covarianza con el train de las 8 especies con centroide');
  assert.strictEqual(c.n_calibracion, 6 * 4 * 3);
  assert.strictEqual(c.particion_medida, 'test');
  assert.strictEqual(c.n_conocidas, 6 * 4 * 3);
  assert.strictEqual(c.n_desconocidas, 2 * 8 * 3 + 20 * 3, 'val+test de eta/theta y todas las de iota');
  assert.ok(res.auroc > 0.99, `AUROC alto con especies separables: ${res.auroc}`);
  assert.ok(res.kar >= 0.85, `KAR medido cerca del objetivo: ${res.kar}`);
  assert.ok(res.far <= 0.05, `FAR bajo: ${res.far}`);
  // τ sensato: por encima de casi todas las conocidas de calibración y por debajo de casi todas las desconocidas.
  const cal = [...res.puntajes.calibracion].sort((a, b) => a - b);
  assert.ok(res.tau >= cal[Math.floor(cal.length * 0.9)] && res.tau <= cal[cal.length - 1] + 1e-3, 'τ en el p95 de calibración');
  assert.ok(Math.min(...res.puntajes.desconocidas) > Math.max(...res.puntajes.calibracion) * 0.9, 'desconocidas lejos');
  assert.strictEqual(res.puntos.length, 6);
  assert.ok(res.puntos.every((p, i, a) => i === 0 || p.tau >= a[i - 1].tau), 'τ crece con el KAR objetivo');
  assert.deepStrictEqual(res.desconocidas.map((d) => d.nombre_cientifico).sort(), ['Rana eta', 'Rana iota', 'Rana theta']);
  assert.ok(res.coseno && res.coseno.especies_con_tau === 6, 'comparación con el coseno de Centroides');
  assert.ok(est.propuesta && est.propuesta.validado === null && Math.abs(est.propuesta.tau - c.tau_propuesto) < 1e-9);
  assert.strictEqual(est.vigente, null);
  const { rows: [blob] } = await pool.query('SELECT length(medias) m, length(precision) p, especie_ids FROM dataset.osr_calibracion WHERE id = $1', [c.id]);
  assert.strictEqual(blob.m, 6 * 512 * 8);
  assert.strictEqual(blob.p, 512 * 512 * 8);

  // Validar: 403 sin permiso; con permiso queda una fila validada y auditada; τ ajustado a mano también.
  await espera(api('POST', '/api/dataset/osr/validaciones', { calibracion_id: c.id, tau: c.tau_propuesto }, LECTOR), 403);
  await espera(api('POST', '/api/dataset/osr/validaciones', { calibracion_id: c.id, tau: -1 }), 400);
  const tauManual = res.puntos.find((p) => p.kar_objetivo === 0.99).tau;
  let v = await espera(api('POST', '/api/dataset/osr/validaciones', { calibracion_id: c.id, tau: tauManual, nota: 'más holgado' }), 201);
  assert.ok(Math.abs(v.vigente.tau - tauManual) < 1e-9);
  assert.strictEqual(v.vigente.validado_por, USER_ID);
  assert.strictEqual(v.vigente.validado_nombre, 'Cuenta de prueba');
  v = await espera(api('POST', '/api/dataset/osr/validaciones', { calibracion_id: c.id, tau: c.tau_propuesto }), 201);
  assert.ok(Math.abs(v.vigente.tau - c.tau_propuesto) < 1e-9, 'vigente = la validación más reciente');
  assert.strictEqual(v.historial.length, 2);
  assert.strictEqual(v.propuesta, null, 'validada, la propuesta deja de estar pendiente');
  const { rows: aud } = await pool.query(`SELECT action, metadata FROM audit.log WHERE action LIKE 'dataset.osr.%' ORDER BY created_at`);
  assert.deepStrictEqual(aud.map((a) => a.action), ['dataset.osr.calibrado', 'dataset.osr.validado', 'dataset.osr.validado']);
  assert.strictEqual(aud[1].metadata.manual, true);
  assert.strictEqual(aud[2].metadata.manual, false);
  // El lector ve el estado.
  const vista = await espera(api('GET', '/api/dataset/osr?subregion_id=1', null, LECTOR), 200);
  assert.strictEqual(vista.paquetes.find((p) => p.id === 1).especies, 6);
  assert.ok(Math.abs(vista.paquetes.find((p) => p.id === 1).tau_vigente - c.tau_propuesto) < 1e-9);

  // Recalibrar deja la calibración anterior fuera de juego.
  await espera(api('POST', '/api/dataset/osr/calibraciones', { subregion_id: 1, kar_objetivo: 0.9 }), 201);
  await espera(api('POST', '/api/dataset/osr/validaciones', { calibracion_id: c.id, tau: 1 }), 409);

  // "Todas las especies": las únicas desconocidas son las de iota (sin centroide).
  const todas = (await espera(api('POST', '/api/dataset/osr/calibraciones', { subregion_id: null }), 201)).calibracion;
  assert.strictEqual(todas.especies, 8);
  assert.strictEqual(todas.n_desconocidas, 60);
  console.log(`todas las especies: AUROC ${todas.resultado.auroc} · KAR ${todas.resultado.kar} · FAR ${todas.resultado.far}`);
  // Subregión sin especies.
  await espera(api('POST', '/api/dataset/osr/calibraciones', { subregion_id: 3 }), 409);

  // ── Métricas ────────────────────────────────────────────────────────────────────
  await espera(api('POST', '/api/dataset/evaluaciones', { subregion_id: 1 }, LECTOR), 403);
  const ev = await espera(api('POST', '/api/dataset/evaluaciones', { subregion_id: 1 }), 201);
  console.log(`evaluación Valle: top-1 ${ev.evaluacion.top1} · top-3 ${ev.evaluacion.top3} · n ${ev.evaluacion.n}`);
  assert.strictEqual(ev.evaluacion.n, 6 * 4 * 3);
  assert.strictEqual(ev.evaluacion.top1, 1, 'especies separables: top-1 esperado 100 %');
  assert.strictEqual(ev.evaluacion.top3, 1);
  assert.strictEqual(ev.filas.length, 6);
  for (const f of ev.filas) {
    assert.strictEqual(f.soporte, 12);
    assert.deepStrictEqual(f.predichas, { [f.especie_id]: 12 }, 'matriz diagonal');
  }
  assert.ok(ev.vigente);
  assert.ok(ev.osr && Math.abs(ev.osr.tau - c.tau_propuesto) < 1e-9, 'Métricas muestra el OSR validado del paquete');
  const lista = await espera(api('GET', '/api/dataset/evaluaciones', null, LECTOR), 200);
  assert.strictEqual(lista.paquetes.find((p) => p.id === 1).evaluacion_id, ev.evaluacion.id);
  assert.strictEqual(lista.paquetes.find((p) => p.id === null).evaluacion_id, null);
  const { rows: [audEv] } = await pool.query(`SELECT COUNT(*)::int n FROM audit.log WHERE action = 'dataset.evaluacion.calculada'`);
  assert.strictEqual(audEv.n, 1);

  // Con ruido alto, una evaluación distinta tiene confusiones (el cálculo no está fijo en 100 %).
  await pool.query(`UPDATE dataset.embedding SET vector = $2 WHERE sha256 = $1`, [fotos.alfa.test[0], JSON.stringify(foto(especies[1].p, 0.2))]);
  const ev2 = await espera(api('POST', '/api/dataset/evaluaciones', { subregion_id: 1 }), 201);
  const alfa = ev2.filas.find((f) => f.especie_id === id('alfa'));
  assert.strictEqual(alfa.top1, 11);
  assert.strictEqual(alfa.predichas[id('beta')], 1, 'la foto de alfa con cara de beta cae en beta');

  // ── Simulador ───────────────────────────────────────────────────────────────────
  const op = await espera(api('GET', '/api/dataset/simulador?subregion_id=1', null, LECTOR), 200);
  assert.strictEqual(op.especies.length, 9);
  assert.strictEqual(op.especies.filter((e) => e.en_paquete).length, 6);
  assert.ok(op.umbrales.validado && op.umbrales.propuesta, 'validado y propuesta disponibles');
  const fs = await espera(api('GET', `/api/dataset/simulador/fotos?especie_id=${id('gamma')}`, null, LECTOR), 200);
  assert.strictEqual(fs.fotos[0].particion, 'test', 'primero las que el paquete no vio');
  assert.ok(fs.fotos[0].url.includes('X-Amz-Signature'));

  // Con el τ del KAR 95 % casi todas las fotos de prueba de gamma pasan; la que se rechace es el 5 % esperado.
  const corridas = [];
  for (const sha of fotos.gamma.test) {
    corridas.push(await espera(api('POST', '/api/dataset/simulador/identificar', { subregion_id: 1, sha256: sha, umbral: 'validado' }, LECTOR), 200));
  }
  const aceptadas = corridas.filter((x) => x.codigo === 'MATCH_SPECIES').length;
  console.log(`simulador: ${aceptadas} de ${corridas.length} fotos de prueba de gamma aceptadas`);
  assert.ok(aceptadas >= 10, `casi todas aceptadas: ${aceptadas}`);
  assert.ok(corridas.every((x) => x.knn.candidatas[0].especie_id === id('gamma')), 'el k-NN siempre nombra gamma');
  const s1 = corridas.find((x) => x.codigo === 'MATCH_SPECIES');
  assert.strictEqual(s1.codigo, 'MATCH_SPECIES');
  assert.strictEqual(s1.knn.candidatas[0].especie_id, id('gamma'));
  assert.strictEqual(s1.knn.vecinos.length, 5);
  assert.strictEqual(s1.centroides[0].especie_id, id('gamma'));
  assert.strictEqual(s1.acierto, true);
  assert.ok(s1.rechazo.distancia <= s1.rechazo.tau);
  assert.ok(s1.altitud && s1.altitud.especie_id === id('gamma') && s1.altitud.rango === null, 'capa 3 informativa sin rango en la ficha');
  const s2 = await espera(api('POST', '/api/dataset/simulador/identificar', { subregion_id: 1, sha256: fotos.iota.fuera[0], umbral: 'validado' }), 200);
  assert.strictEqual(s2.codigo, 'OSR_GLOBAL');
  assert.strictEqual(s2.acierto, true);
  const s3 = await espera(api('POST', '/api/dataset/simulador/identificar', { subregion_id: 1, sha256: fotos.eta.test[0], umbral: 'propuesta' }), 200);
  assert.strictEqual(s3.codigo, 'OSR_GLOBAL', 'eta no está en el paquete de Valle');
  assert.strictEqual(s3.rechazo.validado, null, 'la propuesta no está validada');
  // Mismo número que la calibración: la distancia del simulador (precisión guardada) = la del cálculo blanqueado.
  const { rows: [cal2] } = await pool.query(`SELECT resultado FROM dataset.osr_calibracion WHERE id = $1`, [s1.rechazo.calibracion_id]);
  assert.ok(cal2.resultado.puntajes.conocidas.some((d) => Math.abs(d - s1.rechazo.distancia) < 2e-3), 'precisión guardada = cálculo de la calibración');
  await espera(api('POST', '/api/dataset/simulador/identificar', { subregion_id: 1, sha256: 'x' }), 400);
  const { rows: [audSim] } = await pool.query(`SELECT COUNT(*)::int n FROM audit.log WHERE action LIKE 'dataset.simulador%'`);
  assert.strictEqual(audSim.n, 0, 'el simulador no escribe');

  console.log('TODAS LAS PRUEBAS PASARON');
})()
  .catch((e) => {
    console.error('FALLÓ:', e.stack || e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    servicio?.kill();
    auth.close();
    geo.close();
    await pool.end();
  });
