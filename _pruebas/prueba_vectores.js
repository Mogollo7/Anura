// Pruebas del bloque 5 (Worker, DB vectorial, Centroides por morfo, Clústeres) contra la base
// desechable anura_vectores. Embeddings sintéticos de 512, solo aquí. Uso: node prueba_vectores.js
const http = require('http');
const assert = require('assert');

const GEO_PORT = 39142;
process.env.GEO_SERVICE_URL = `http://127.0.0.1:${GEO_PORT}`;
const SRC = 'D:/server/Anura/services/dataset-service/src';
const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');
const trabajos = require(`${SRC}/trabajos.js`);
const vectores = require(`${SRC}/vectores.js`);
const centroides = require(`${SRC}/centroides.js`);
const clusteres = require(`${SRC}/clusteres.js`);
const et = require(`${SRC}/etiquetas.js`);

const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_vectores' });
const USER = 'd81f2281-6086-435e-9de6-603f766fdf5e';
const ENCODER = '219e860e6fa9a80fb30a59fc8f61911421bbd53a4537dca831803d3ab446b2ad';
const SUPER = { isSuperAdmin: true, permissions: {} };
const DIM = 512;

// geo-service falso: latitud > 7,5 → Urabá (05045); si no, Valle de Aburrá (05001).
const geo = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => (cuerpo += c));
  req.on('end', () => {
    const { puntos } = JSON.parse(cuerpo || '{}');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ municipios: (puntos || []).map(([lat]) => (lat > 7.5 ? '05045' : '05001')) }));
  });
});

function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = azar(42);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const aleatorio = () => unit(Array.from({ length: DIM }, gauss));
const suma = (...vs) => vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0));
const escala = (v, k) => v.map((x) => x * k);
const b64 = (v) => Buffer.from(new Float32Array(v).buffer).toString('base64');

async function espera(promesa, status) {
  try { await promesa; } catch (e) { assert.strictEqual(e.status, status, `esperaba ${status}, llegó ${e.status}: ${e.message}`); return e.message; }
  throw new Error(`esperaba error ${status} y no falló`);
}

(async () => {
  await new Promise((r) => geo.listen(GEO_PORT, '127.0.0.1', r));
  const q = (s, p) => pool.query(s, p);

  // ── Base limpia (solo esta base de prueba) ──
  await q(`TRUNCATE dataset.cluster, dataset.centroide_morfo, dataset.experimento, dataset.embedding, dataset.trabajo,
           dataset.trabajo_error, dataset.worker, dataset.encoder, dataset.version, dataset.version_foto,
           dataset.observacion_etiqueta, dataset.morfo, dataset.exclusion, dataset.foto, dataset.observacion,
           dataset.especie, audit.log RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO auth.users (id, username, email) VALUES ($1, 'sebas', 'prueba@anura.test') ON CONFLICT DO NOTHING`, [USER]);
  await q(`UPDATE dataset.region SET estado = 'activa' WHERE codigo_dane = '05'`);

  // ── Fixtures: 4 especies, 8 individuos × 3 fotos. A y B casi idénticas (mismo género). ──
  const defs = [
    ['Pristimantis_a', 'Pristimantis alfa', 'Pristimantis', 'Strabomantidae'],
    ['Pristimantis_b', 'Pristimantis beta', 'Pristimantis', 'Strabomantidae'],
    ['Boana_c', 'Boana gamma', 'Boana', 'Hylidae'],
    ['Oophaga_d', 'Oophaga delta', 'Oophaga', 'Dendrobatidae'],
  ];
  const esp = [];
  for (const [carpeta, n, g, f] of defs) {
    const { rows: [e] } = await q('INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia) VALUES ($1,$2,$3,$4) RETURNING id', [carpeta, n, g, f]);
    esp.push(e.id);
  }
  const [A, B, C, D] = esp;
  const dA = aleatorio();
  const dir = { [A]: dA, [B]: unit(suma(dA, escala(aleatorio(), 0.3))), [C]: aleatorio(), [D]: aleatorio() };
  const ejeAB = unit(suma(dir[B], escala(dir[A], -1)));
  const { rows: [ver] } = await q(`INSERT INTO dataset.version (nombre) VALUES ('prueba-v1') RETURNING id`);
  const vectorDe = new Map();
  const obsDe = {};
  for (const e of esp) {
    obsDe[e] = [];
    for (let i = 0; i < 8; i++) {
      const lat = e === D ? 7.9 : 6.2;
      const { rows: [o] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud) VALUES ('manual', $1, $2, -75.5) RETURNING id`, [`${e}-${i}`, lat]);
      obsDe[e].push(o.id);
      const particion = i < 5 ? 'train' : i < 7 ? 'val' : 'test';
      for (let k = 0; k < 3; k++) {
        const sha = require('crypto').createHash('sha256').update(`${e}-${i}-${k}`).digest('hex');
        await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado, licencia)
                 VALUES ($1, $2, $3, $4, $5, 'catalogo', 'cc-by')`, [sha, `k/${sha}`, e, o.id, `${e}_${i}_${k}.jpg`]);
        await q('INSERT INTO dataset.version_foto (version_id, sha256, particion) VALUES ($1,$2,$3)', [ver.id, sha, particion]);
        // Ruido: uno pequeño en cualquier dirección + uno a lo largo del eje A↔B (para que se confundan a veces).
        const empuje = e === A || e === B ? escala(ejeAB, 0.2 * gauss()) : escala(aleatorio(), 0);
        vectorDe.set(sha, unit(suma(dir[e], escala(aleatorio(), 0.35), empuje)));
      }
    }
  }


  // ── 1. Worker: protocolo real (encoder, tomar, lote, vectores, errores, fin) ──
  await espera(trabajos.crear(pool, {}, USER), 400); // sin encoder registrado
  await trabajos.registrarEncoder(pool, 'pc-prueba', {
    contrato: { encoder_sha256: ENCODER, encoder_id: 'bioclip_anura_v1', onnx_export: 'encoder_anura_fp16.onnx', embedding_dimension: 512,
      preprocessing_version: 'open_clip', normalization_version: 'L2' },
    info: { proveedor: 'CPUExecutionProvider', onnxruntime: '1.20', ms_por_foto: 12 },
  });
  let est = await trabajos.estado(pool);
  assert.strictEqual(est.workers.length, 1);
  assert.strictEqual(est.encoders[0].vectores, 0);
  assert.strictEqual(est.workers[0].trabajo_en_curso, null);

  const t1 = await trabajos.crear(pool, { encoder_sha256: ENCODER, especie_id: A }, USER);
  assert.strictEqual(t1.total, 24, 'un trabajo acotado a la especie A son sus 24 fotos');
  await espera(trabajos.crear(pool, { encoder_sha256: ENCODER }, USER), 409); // uno a la vez por encoder
  await espera(trabajos.crear(pool, { encoder_sha256: ENCODER, especie_id: 99999 }, USER), 404);
  const tomado = await trabajos.tomar(pool, 'pc-prueba');
  assert.strictEqual(Number(tomado.id), t1.id);
  est = await trabajos.estado(pool);
  assert.strictEqual(Number(est.workers[0].trabajo_en_curso), t1.id);
  assert.strictEqual(est.trabajos[0].especie, 'Pristimantis alfa');
  let lote = await trabajos.lote(pool, t1.id, 'pc-prueba', 256);
  assert.strictEqual(lote.fotos.length, 24);
  const { rows: deA } = await q('SELECT sha256 FROM dataset.foto WHERE especie_id = $1', [A]);
  assert.ok(lote.fotos.every((s) => deA.some((r) => r.sha256 === s)), 'el lote solo trae fotos de A');
  await espera(trabajos.guardarVectores(pool, t1.id, 'pc-prueba', { vectores: [{ sha256: lote.fotos[0], v: b64(escala(vectorDe.get(lote.fotos[0]), 2)) }] }), 400);
  const [rota, ...buenas] = lote.fotos;
  let r = await trabajos.guardarVectores(pool, t1.id, 'pc-prueba', {
    vectores: buenas.map((s) => ({ sha256: s, v: b64(vectorDe.get(s)) })),
    errores: [{ sha256: rota, error: 'UnidentifiedImageError: no se puede abrir' }],
    mensaje: 'CPU · 12 ms por foto',
  });
  assert.strictEqual(r.hechos, 23);
  assert.strictEqual(r.fallidos, 1);
  lote = await trabajos.lote(pool, t1.id, 'pc-prueba', 256);
  assert.strictEqual(lote.fotos.length, 0, 'la foto que falló no se reintenta en el mismo trabajo');
  await trabajos.terminar(pool, t1.id, 'pc-prueba', { estado: 'hecho', mensaje: 'Todas las fotos tienen vector' });
  const errs = await trabajos.errores(pool, t1.id);
  assert.strictEqual(errs.total, 1);
  assert.strictEqual(errs.errores[0].especie, 'Pristimantis alfa');
  await espera(trabajos.errores(pool, 99999), 404);
  await espera(trabajos.cancelar(pool, t1.id, USER), 400);

  // Un trabajo de todo el catálogo retoma lo que falta (incluida la foto que falló antes).
  const t2 = await trabajos.crear(pool, { encoder_sha256: ENCODER }, USER);
  assert.strictEqual(t2.total, 96 - 23);
  await trabajos.tomar(pool, 'pc-prueba');
  for (;;) {
    lote = await trabajos.lote(pool, t2.id, 'pc-prueba', 32);
    if (!lote.fotos.length) break;
    await trabajos.guardarVectores(pool, t2.id, 'pc-prueba', { vectores: lote.fotos.map((s) => ({ sha256: s, v: b64(vectorDe.get(s)) })) });
  }
  await trabajos.terminar(pool, t2.id, 'pc-prueba', { estado: 'hecho' });
  await espera(trabajos.crear(pool, { encoder_sha256: ENCODER }, USER), 409); // ya no falta ninguna
  // Cancelar uno pendiente
  await q('DELETE FROM dataset.embedding WHERE sha256 = $1', [rota]);
  const t3 = await trabajos.crear(pool, {}, USER);
  await trabajos.cancelar(pool, t3.id, USER);
  assert.strictEqual((await trabajos.tomar(pool, 'pc-prueba')), null, 'un cancelado no se toma');
  await q('INSERT INTO dataset.embedding (sha256, encoder_sha256, vector) VALUES ($1, $2, $3::vector)', [rota, ENCODER, `[${vectorDe.get(rota).join(',')}]`]);
  est = await trabajos.estado(pool);
  assert.strictEqual(est.encoders[0].vectores, 96);
  assert.strictEqual(est.historial, 3);
  assert.deepStrictEqual(est.trabajos.map((t) => t.estado), ['cancelado', 'hecho', 'hecho']);
  console.log('✓ worker');

  // ── 2. DB vectorial ──
  const res = await vectores.resumen(pool, null);
  assert.strictEqual(res.encoder.sha256, ENCODER);
  assert.strictEqual(res.especies.length, 4);
  for (const e of res.especies) {
    assert.deepStrictEqual([e.fotos, e.vectores, e.individuos, e.train, e.val, e.test, e.excluidas], [24, 24, 8, 15, 6, 3, 0]);
  }
  assert.ok(res.indice.busqueda.startsWith('exacta'));
  assert.ok(res.indice.bytes_total > 0);
  await espera(vectores.resumen(pool, 'f'.repeat(64)), 404);

  const p1 = await vectores.proyeccion(pool, null, 60);
  const p2 = await vectores.proyeccion(pool, null, 60);
  assert.strictEqual(p1.muestra, 96);
  assert.deepStrictEqual(p1.puntos, p2.puntos, 'la proyección es determinista');
  assert.ok(p1.varianza[0] >= p1.varianza[1] && p1.varianza[1] > 0 && p1.varianza[0] + p1.varianza[1] <= 1);
  const acotada = await vectores.proyeccion(pool, null, 5);
  assert.strictEqual(acotada.muestra, 20, 'tope por especie');
  // Centroide 2D de cada especie en la proyección: A y B cerca, D lejos de A.
  const c2 = (e) => { const ps = p1.puntos.filter((p) => p.especie_id === e); return [ps.reduce((s, p) => s + p.x, 0) / ps.length, ps.reduce((s, p) => s + p.y, 0) / ps.length]; };
  const dist = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
  assert.ok(dist(c2(A), c2(B)) < dist(c2(A), c2(D)), 'A y B quedan más cerca que A y D');

  // PCA contra un caso con respuesta conocida: puntos sobre una recta en 3D (+ ruido pequeño).
  const eje = unit([3, 4, 12]);
  const filas = Array.from({ length: 50 }, (_, i) => suma(escala(eje, i - 25), [0.01 * gauss(), 0.01 * gauss(), 0.01 * gauss()]));
  const m = vectores.pca2(filas);
  const cosEje = Math.abs(m.ejes[0].reduce((s, x, i) => s + x * eje[i], 0));
  assert.ok(cosEje > 0.9999, `el primer eje debe ser la recta (coseno ${cosEje})`);
  assert.ok(m.varianza[0] > 0.999);
  assert.ok(Math.abs(m.ejes[0].reduce((s, x, i) => s + x * m.ejes[1][i], 0)) < 1e-9, 'ejes ortogonales');

  const md = await vectores.metadatos(pool, null, { especie_id: String(C), limit: '10' });
  assert.strictEqual(md.total, 24);
  assert.strictEqual(md.filas.length, 10);
  assert.ok(Math.abs(md.filas[0].norma - 1) < 1e-5);
  assert.strictEqual(md.filas[0].inicio.length, 6);
  assert.strictEqual(md.filas[0].fuente, 'manual');
  const lat = await vectores.latencia(pool, null);
  assert.strictEqual(lat.consultas, 15);
  assert.ok(lat.p50_ms > 0 && lat.p95_ms >= lat.p50_ms);
  console.log('✓ db vectorial', { varianza: p1.varianza.map((x) => x.toFixed(3)), latencia_p50_ms: lat.p50_ms.toFixed(2) });

  // ── 3. Centroides por morfo ──
  const { rows: [valle] } = await q(`SELECT id FROM dataset.subregion WHERE nombre = 'Valle de Aburrá'`);
  const rojo = await et.declararMorfo(pool, C, { subregion_id: valle.id, nombre: 'Rojo' }, USER);
  const azul = await et.declararMorfo(pool, C, { subregion_id: valle.id, nombre: 'Azul' }, USER);
  for (const o of obsDe[C].slice(0, 4)) await et.etiquetar(pool, o, { morfo_id: rojo.id }, SUPER, USER); // 4 de train
  await et.etiquetar(pool, obsDe[C][4], { morfo_id: azul.id }, SUPER, USER); // 1 de train
  await et.etiquetar(pool, obsDe[C][6], { morfo_id: azul.id }, SUPER, USER); // 1 de val: no cuenta
  let mor = await centroides.morfos(pool);
  assert.strictEqual(mor.experimento, null);
  assert.strictEqual(mor.morfos.find((x) => x.id === azul.id).faltan, 2);

  const loteC = await centroides.calcular(pool, USER);
  assert.strictEqual(loteC.especies.length, 4);
  assert.ok(loteC.regionales.length > 0);
  mor = await centroides.morfos(pool);
  const mr = mor.morfos.find((x) => x.id === rojo.id);
  const ma = mor.morfos.find((x) => x.id === azul.id);
  assert.deepStrictEqual([mr.calculado, mr.n_observaciones, mr.n_vectores, mr.faltan, mr.desactualizado], [true, 4, 12, 0, false]);
  assert.ok(mr.coseno_especie > 0.8 && mr.dispersion > 0);
  assert.deepStrictEqual([ma.calculado, ma.etiquetados, ma.con_vector, ma.faltan], [false, 2, 1, 2]);
  await et.etiquetar(pool, obsDe[C][3], { morfo_id: azul.id }, SUPER, USER); // pasa uno de Rojo a Azul
  mor = await centroides.morfos(pool);
  assert.strictEqual(mor.morfos.find((x) => x.id === azul.id).faltan, 1);
  assert.strictEqual(mor.morfos.find((x) => x.id === rojo.id).desactualizado, true);
  const { rows: [aud] } = await q(`SELECT metadata FROM audit.log WHERE action = 'dataset.centroides.calculados'`);
  assert.strictEqual(aud.metadata.morfos, 1);
  console.log('✓ centroides por morfo');

  // ── 4. Clústeres ──
  let pan = await clusteres.panorama(pool, {});
  assert.strictEqual(pan.especies.length, 4);
  assert.strictEqual(pan.fotos_val, 24);
  const suma_celdas = pan.celdas.reduce((s, c) => s + c.n, 0);
  assert.strictEqual(suma_celdas, 24);
  const parAB = pan.pares.find((p) => p.a === Math.min(A, B) && p.b === Math.max(A, B));
  assert.ok(parAB && parAB.senal && parAB.coseno > 0.9, 'A y B se señalan');
  assert.ok(parAB.a_como_b + parAB.b_como_a > 0 && pan.acierto < 1, 'A y B se confunden en validación');
  assert.ok(!pan.pares.some((p) => [p.a, p.b].includes(D) && p.senal), 'D no se confunde con nadie');
  assert.ok(pan.sugerencias.some((s) => [s.a, s.b].sort().join() === [A, B].sort().join()), 'm3 sugirió el par A-B');
  const valleP = await clusteres.panorama(pool, { subregion_id: String(valle.id) });
  assert.deepStrictEqual(valleP.especies.map((e) => e.id).sort(), [A, B, C].sort(), 'en Valle de Aburrá no está D');
  await espera(clusteres.panorama(pool, { subregion_id: '99999' }), 404);

  await espera(clusteres.decidir(pool, { miembros: [A], estado: 'aceptado' }, USER), 400);
  await espera(clusteres.decidir(pool, { miembros: [A, C], estado: 'descartado' }, USER), 400); // sin motivo
  await espera(clusteres.decidir(pool, { miembros: [A, 99999], estado: 'aceptado' }, USER), 404);
  const k1 = await clusteres.decidir(pool, { miembros: [B, A], estado: 'aceptado', origen: 'sugerido' }, USER);
  assert.deepStrictEqual(k1.miembros, [A, B].sort((x, y) => x - y));
  assert.strictEqual(k1.nombre, 'Pristimantis (2 especies)');
  assert.ok(k1.medicion.acc_antes != null && k1.medicion.acc_despues != null, 'ArcFace medido con vectores reales');
  assert.strictEqual(k1.medicion.n_val, 12);
  const k1b = await clusteres.decidir(pool, { miembros: [A, B], estado: 'aceptado', origen: 'sugerido', nombre: 'Complejo alfa-beta' }, USER);
  assert.strictEqual(k1b.id, k1.id, 'misma fila para los mismos miembros');
  assert.deepStrictEqual(k1b.medicion, k1.medicion, 'la medición es determinista');
  await clusteres.decidir(pool, { miembros: [A, C], estado: 'descartado', motivo: 'Géneros distintos, no se parecen', origen: 'matriz' }, USER);
  pan = await clusteres.panorama(pool, {});
  assert.strictEqual(pan.pares.find((p) => p.a === Math.min(A, B) && p.b === Math.max(A, B)).decision.estado, 'aceptado');
  assert.strictEqual(pan.clusteres.length, 2);
  assert.strictEqual(pan.clusteres.find((c) => c.id === k1.id).nombre, 'Complejo alfa-beta');
  await clusteres.retirar(pool, k1.id, USER);
  await espera(clusteres.retirar(pool, k1.id, USER), 404);
  const { rows: acciones } = await q(`SELECT action, COUNT(*)::int n FROM audit.log WHERE target_type = 'cluster' GROUP BY action ORDER BY action`);
  assert.deepStrictEqual(acciones.map((a) => `${a.action}:${a.n}`), ['dataset.cluster.aceptado:2', 'dataset.cluster.descartado:1', 'dataset.cluster.retirado:1']);
  console.log('✓ clústeres', { acierto: pan.acierto, arcface: k1.medicion });

  // Deja un clúster aceptado para mirar la pantalla.
  await clusteres.decidir(pool, { miembros: [A, B], estado: 'aceptado', origen: 'sugerido' }, USER);
  console.log('TODAS LAS PRUEBAS PASARON');
  await pool.end();
  geo.close();
})().catch(async (e) => { console.error('FALLÓ:', e); await pool.end(); geo.close(); process.exit(1); });
