// Pruebas del bloque 2 (altitud por observación + Ficha técnica) contra la base desechable anura_ficha,
// con un geo-service de mentira (altitud = lat * 1000, controlable).
const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');
const GEO_PORT = 39112;
process.env.GEO_SERVICE_URL = `http://127.0.0.1:${GEO_PORT}`;
const SRC = 'D:/server/Anura/services/dataset-service';
const { Pool } = require(`${SRC}/node_modules/pg`);
const altitud = require(`${SRC}/src/altitud.js`);
const ficha = require(`${SRC}/src/ficha.js`);

const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_ficha' });
const SUPER = { isSuperAdmin: true, permissions: {} };
const U = 'd81f2281-6086-435e-9de6-603f766fdf5e';
const q = (s, p) => pool.query(s, p);

// ── geo de mentira ──
let modo = 'ok'; // ok | nodata_9 | error500
const llamadas = [];
const geo = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/api/geo/altitude') {
    const lat = Number(u.searchParams.get('lat'));
    llamadas.push(lat);
    if (modo === 'error500') { res.statusCode = 502; return res.end(JSON.stringify({ error: 'Elevation API error' })); }
    if (Math.abs(lat - 9.99) < 1e-9) return res.end(JSON.stringify({ lat, altitude_m: null, source: 'opentopodata' }));
    return res.end(JSON.stringify({ lat, altitude_m: Math.round(lat * 1000), source: 'opentopodata:srtm30m' }));
  }
  if (u.pathname.endsWith('/ubicar')) {
    let b = '';
    req.on('data', (c) => (b += c));
    return req.on('end', () => res.end(JSON.stringify({ municipios: JSON.parse(b).puntos.map(() => '05001') })));
  }
  res.statusCode = 404; res.end('{}');
});

async function espera(promesa, status, contiene) {
  try { await promesa; } catch (e) {
    assert.strictEqual(e.status, status, `esperaba ${status}, llegó ${e.status}: ${e.message}`);
    if (contiene) assert.ok(e.message.includes(contiene), `mensaje sin "${contiene}": ${e.message}`);
    return e.message;
  }
  throw new Error(`esperaba error ${status} y no falló`);
}
const cerca = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);

let n = 0;
async function obs(especieId, alt, extra = {}) {
  // latitud = alt/1000 → la altitud del geo de mentira es exactamente `alt`.
  const lat = extra.lat ?? alt / 1000;
  const { rows: [o] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id, latitud, longitud, uso_geografico, latitud_limpia, longitud_limpia, limpieza_metodo)
    VALUES ('inaturalist', $1, $2, -75.5, $3, $4, $5, $6) RETURNING id`,
    [`t${++n}`, lat, extra.uso === undefined ? 'punto' : extra.uso, extra.uso === undefined || extra.uso === 'punto' ? lat : null,
      extra.uso === undefined || extra.uso === 'punto' ? -75.5 : null, 'precisa']);
  const sha = String(n).padStart(64, 'f');
  await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado) VALUES ($1, $2, $3, $4, 'a.jpg', 'catalogo')`,
    [sha, `k${n}`, especieId, o.id]);
  return { id: Number(o.id), sha };
}

(async () => {
  await new Promise((r) => geo.listen(GEO_PORT, '127.0.0.1', r));
  await q(`INSERT INTO auth.users (id, username, email) VALUES ($1, 'sebas', 'prueba@anura.test') ON CONFLICT DO NOTHING`, [U]);
  const { rows: [ea] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia) VALUES ('Oophaga_histrionica','Oophaga histrionica','Oophaga','Dendrobatidae') RETURNING id`);
  const { rows: [eb] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia) VALUES ('Boana_boans','Boana boans','Boana','Hylidae') RETURNING id`);
  const A = ea.id;

  // ── Funciones puras ──
  const s11 = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
  cerca(ficha.percentil(s11, 0.05), 1050);
  cerca(ficha.percentil(s11, 0.95), 1950);
  cerca(ficha.percentil([5], 0.5), 5);
  assert.strictEqual(ficha.percentil([], 0.5), null);
  const r11 = ficha.resumenAltitud(s11);
  cerca(r11.media, 1500); cerca(r11.desviacion, 100 * Math.sqrt(10), 1e-6);
  assert.strictEqual(r11.poco_confiable, false);
  assert.strictEqual(ficha.resumenAltitud([1, 2]).poco_confiable, true);
  assert.strictEqual(ficha.resumenAltitud([]), null);
  // pesos por perfil
  const P = { hojarasca: 0.25, vegetacion: 0.25, quebrada: 0.25, roca: 0.25 };
  assert.strictEqual(ficha.proponerPesos(100, { ...P, quebrada: 0.4, hojarasca: 0.1 }).perfil, 'especialista_quebrada');
  assert.strictEqual(ficha.proponerPesos(100, { ...P, hojarasca: 0.6, quebrada: 0.05 }).perfil, 'endemica_montana');
  assert.strictEqual(ficha.proponerPesos(700, { ...P, hojarasca: 0.6, quebrada: 0.05 }).perfil, 'generalista');
  assert.strictEqual(ficha.proponerPesos(300, P).perfil, 'par_criptico');
  // priors: 7/3/2/0 de 12
  const pr = ficha.priorsDeSustrato([...Array(7).fill('hojarasca'), ...Array(3).fill('vegetacion'), 'quebrada', 'quebrada']);
  assert.deepStrictEqual(pr.priors, { hojarasca: 0.58, vegetacion: 0.25, quebrada: 0.17, roca: 0.01 });
  assert.strictEqual(ficha.priorsDeSustrato([]).priors, null);

  await q("UPDATE dataset.region SET estado = 'borrador' WHERE codigo_dane = '05'"); // el caché de cifras por municipio (5 min) no se calienta antes de activar
  // ── Ficha vacía: estados honestos, sin inventar ──
  let f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.altitud.resumen, null);
  assert.strictEqual(f.altitud.efectivo, null);
  assert.strictEqual(f.pesos.calculado, null);
  assert.ok(f.pesos.motivo.includes('Faltan altitudes'));
  assert.strictEqual(f.sustrato.priors, null);
  assert.strictEqual(f.dataset.estado, 'DRAFT');
  assert.deepStrictEqual(f.subregiones, []); // ningún departamento activo
  await espera(ficha.deEspecie(pool, 99999), 404);

  // ── Altitud: relleno por lotes con cursor ──
  const grupo = [];
  for (const a of s11) grupo.push(await obs(A, a));
  const atip = await obs(A, 4000);
  grupo.push(atip);
  assert.strictEqual((await altitud.contarFaltantes(pool, A)), 12);
  // al crear una foto de otra especie no cuenta para A
  const b1 = await obs(eb.id, 500);
  assert.strictEqual((await altitud.contarFaltantes(pool, A)), 12);

  // geo caído: error 502 claro y NADA inventado
  geo.close(); geo.closeAllConnections?.();
  const msg = await espera(altitud.calcularFaltantes(pool, { especie_id: A }, U), 502, 'geo-service no responde');
  assert.ok(msg.includes('Revisa'));
  let { rows: [z] } = await q('SELECT COUNT(*)::int n FROM dataset.observacion WHERE altitud_m IS NOT NULL');
  assert.strictEqual(z.n, 0);
  await new Promise((r) => geo.listen(GEO_PORT, '127.0.0.1', r));

  // geo con error HTTP
  modo = 'error500';
  await espera(altitud.calcularFaltantes(pool, { especie_id: A }, U), 502, 'respondió 502');
  modo = 'ok';

  // Lotes de 5: 12 observaciones → 3 llamadas, la última sin siguiente_id
  let cursor = 0; let llamadasLote = 0; let total = 0; let r;
  do {
    r = await altitud.calcularFaltantes(pool, { especie_id: A, limite: 5, desde_id: cursor }, U);
    total += r.procesadas; llamadasLote += 1; cursor = r.siguiente_id ?? 0;
  } while (r.siguiente_id !== null && llamadasLote < 10);
  assert.strictEqual(total, 12); assert.strictEqual(llamadasLote, 3);
  assert.strictEqual(r.faltan, 0);
  assert.strictEqual((await altitud.contarFaltantes(pool, null)), 1); // solo queda la de la otra especie
  const { rows: [chk] } = await q('SELECT altitud_m, altitud_fuente, altitud_lat FROM dataset.observacion WHERE id = $1', [grupo[3].id]);
  assert.strictEqual(chk.altitud_m, 1300); assert.strictEqual(chk.altitud_fuente, 'opentopodata:srtm30m'); cerca(chk.altitud_lat, 1.3);
  const ll = llamadas.length;
  r = await altitud.calcularFaltantes(pool, { especie_id: A }, U);
  assert.strictEqual(r.procesadas, 0); assert.strictEqual(llamadas.length, ll); // nada que hacer: no llama a geo

  // sin dato: se cuenta, sigue faltando y no bloquea a las demás (cursor)
  const sd = await obs(A, 0, { lat: 9.99 });
  const otra = await obs(A, 777);
  r = await altitud.calcularFaltantes(pool, { especie_id: A, limite: 1, desde_id: 0 }, U);
  assert.strictEqual(r.sin_dato, 1); assert.strictEqual(r.con_altitud, 0); assert.strictEqual(r.siguiente_id, sd.id);
  r = await altitud.calcularFaltantes(pool, { especie_id: A, limite: 1, desde_id: r.siguiente_id }, U);
  assert.strictEqual(r.con_altitud, 1); assert.strictEqual(r.faltan, 1); // la sin dato sigue faltando
  ({ rows: [z] } = await q('SELECT altitud_m FROM dataset.observacion WHERE id = $1', [sd.id]));
  assert.strictEqual(z.altitud_m, null);
  await espera(altitud.calcularFaltantes(pool, { especie_id: 99999 }, U), 404);

  // ── Ficha con datos: 11 limpias + 1 atípica (4000) + 1 con 777 + 1 sin dato ──
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.observaciones.validas, 14);
  assert.strictEqual(f.observaciones.con_altitud, 13);
  assert.strictEqual(f.observaciones.falta_altitud, 1);
  assert.strictEqual(f.altitud.resumen.n, 13);
  const alts = [...s11, 4000, 777].sort((a, b) => a - b);
  cerca(f.altitud.resumen.p05, Math.round(ficha.percentil(alts, 0.05) * 10) / 10);
  cerca(f.altitud.resumen.p95, Math.round(ficha.percentil(alts, 0.95) * 10) / 10);
  assert.strictEqual(f.altitud.resumen.min, 777); assert.strictEqual(f.altitud.resumen.max, 4000);
  assert.strictEqual(f.altitud.efectivo.origen, 'calculado');
  assert.deepStrictEqual(f.altitud.atipicas.map((x) => x.altitud_m), [4000]);
  assert.ok(f.altitud.atipicas[0].z_robusto > 3.5);
  // percentiles con los 11 exactos: invalidar las otras dos
  await q('UPDATE dataset.observacion SET invalidada_en = NOW(), invalidada_motivo = $2 WHERE id = ANY($1)', [[atip.id, otra.id], 'GPS malo']);
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.altitud.resumen.n, 11);
  cerca(f.altitud.resumen.p05, 1050); cerca(f.altitud.resumen.p95, 1950); cerca(f.altitud.resumen.media, 1500);
  assert.deepStrictEqual(f.altitud.calculado, { min: 1050, max: 1950 });
  assert.strictEqual(f.altitud.atipicas.length, 0);
  assert.strictEqual(f.observaciones.validas, 12); // 11 + la sin dato
  // foto excluida: su observación sale
  await q(`INSERT INTO dataset.exclusion (sha256, motivo, por, origen) VALUES ($1, 'borrosa', $2, 'curacion')`, [grupo[0].sha, U]);
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.altitud.resumen.n, 10);
  await q('UPDATE dataset.exclusion SET revertida = NOW() WHERE sha256 = $1', [grupo[0].sha]);
  assert.strictEqual((await ficha.deEspecie(pool, A)).altitud.resumen.n, 11);
  // 'celda', 'excluida' y sin limpiar no aportan metros; se cuentan aparte
  await obs(A, 1234, { uso: 'celda' }); await obs(A, 1235, { uso: 'excluida' }); await obs(A, 1236, { uso: null });
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.altitud.resumen.n, 11);
  assert.deepStrictEqual([f.observaciones.solo_celda, f.observaciones.excluidas_geografia, f.observaciones.sin_limpiar], [1, 1, 1]);
  r = await altitud.calcularFaltantes(pool, { especie_id: A }, U); // la 'sin limpiar' (uso NULL) sí se calcula; celda/excluida no
  assert.strictEqual(r.con_altitud, 1); assert.strictEqual(r.sin_dato, 1);
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.altitud.resumen.n, 11); // aún no cuenta: falta la limpieza

  // la limpieza cambia una coordenada: su altitud deja de valer y vuelve a faltar
  await q('UPDATE dataset.observacion SET latitud_limpia = $2 WHERE id = $1', [grupo[5].id, 1.9]);
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.altitud.resumen.n, 10);
  r = await altitud.calcularFaltantes(pool, { especie_id: A }, U);
  assert.strictEqual(r.con_altitud, 1);
  ({ rows: [z] } = await q('SELECT altitud_m FROM dataset.observacion WHERE id = $1', [grupo[5].id]));
  assert.strictEqual(z.altitud_m, 1900);
  await q('UPDATE dataset.observacion SET latitud_limpia = $2 WHERE id = $1', [grupo[5].id, 1.5]);
  await altitud.calcularFaltantes(pool, { especie_id: A }, U);
  assert.strictEqual((await ficha.deEspecie(pool, A)).altitud.resumen.n, 11);

  // ── Sustrato y pesos calculados (vía observacion_etiqueta) ──
  const sustratos = ['hojarasca', 'hojarasca', 'hojarasca', 'hojarasca', 'hojarasca', 'hojarasca', 'hojarasca', 'vegetacion', 'vegetacion', 'vegetacion', 'quebrada'];
  for (let i = 0; i < 4; i++) await q(`INSERT INTO dataset.observacion_etiqueta (observacion_id, sustrato) VALUES ($1, $2)`, [grupo[i].id, sustratos[i]]);
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.pesos.calculado, null); assert.ok(f.pesos.motivo.includes('Faltan sustratos'));
  for (let i = 4; i < 11; i++) await q(`INSERT INTO dataset.observacion_etiqueta (observacion_id, sustrato) VALUES ($1, $2)`, [grupo[i].id, sustratos[i]]);
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.sustrato.n, 11);
  assert.deepStrictEqual(f.sustrato.priors, { hojarasca: 0.64, vegetacion: 0.27, quebrada: 0.09, roca: 0.01 });
  assert.strictEqual(f.pesos.calculado.perfil, 'par_criptico'); // σ=316 m, prior máx 0,64
  assert.deepStrictEqual([f.pesos.calculado.wv, f.pesos.calculado.wg, f.pesos.calculado.wm], [0.35, 0.35, 0.3]);
  assert.strictEqual(f.pesos.efectivo.origen, 'calculado');

  // ── Decisiones de una persona ──
  const SOLO_VER = { isSuperAdmin: false, permissions: { verEspecies: true } };
  const SOLO_PESOS = { isSuperAdmin: false, permissions: { definirPesos: true } };
  await espera(ficha.ajustar(pool, A, { pesos: { wv: 0.5, wg: 0.3, wm: 0.2 } }, SOLO_VER, U), 403, 'definirPesos');
  await espera(ficha.ajustar(pool, A, { altitud: { min: 1, max: 2 } }, SOLO_PESOS, U), 403, 'definirMicrohabitat');
  await espera(ficha.ajustar(pool, A, { lrc: { metodo: 'manual', min: 1, max: 2 } }, SOLO_PESOS, U), 403, 'definirLRC');
  // varios bloques: si uno no tiene permiso no se escribe ninguno
  await espera(ficha.ajustar(pool, A, { pesos: { wv: 0.5, wg: 0.3, wm: 0.2 }, lrc: { metodo: 'manual', min: 1, max: 2 } }, SOLO_PESOS, U), 403);
  assert.strictEqual((await q('SELECT COUNT(*)::int n FROM dataset.ficha_ajuste')).rows[0].n, 0);
  await espera(ficha.ajustar(pool, A, {}, SUPER, U), 400);
  await espera(ficha.ajustar(pool, 99999, { lrc: { metodo: 'pendiente' } }, SUPER, U), 404);
  // pesos que no suman 1
  await espera(ficha.ajustar(pool, A, { pesos: { wv: 0.5, wg: 0.5, wm: 0.5 } }, SUPER, U), 400, 'hoy suma 1,50');
  await espera(ficha.ajustar(pool, A, { pesos: { wv: 1.2, wg: 0, wm: 0 } }, SUPER, U), 400);
  // pesos válidos (suma 0,999 → se normaliza a 1)
  f = await ficha.ajustar(pool, A, { pesos: { wv: 0.5, wg: 0.3, wm: 0.199 } }, SOLO_PESOS, U);
  assert.deepStrictEqual(f.pesos.manual, { wv: 0.501, wg: 0.3, wm: 0.199 }); // 0,999 → normalizado a suma 1
  cerca(f.pesos.manual.wv + f.pesos.manual.wg + f.pesos.manual.wm, 1, 1e-9);
  assert.strictEqual(f.pesos.efectivo.origen, 'manual');
  assert.strictEqual(f.pesos.calculado.wv, 0.35); // lo calculado no se pisa
  // altitud manual
  await espera(ficha.ajustar(pool, A, { altitud: { min: 2000, max: 1000 } }, SUPER, U), 400, 'menor que el máximo');
  await espera(ficha.ajustar(pool, A, { altitud: { min: 'a', max: 5 } }, SUPER, U), 400);
  f = await ficha.ajustar(pool, A, { altitud: { min: 900, max: 2100 } }, SUPER, U);
  assert.deepStrictEqual(f.altitud.efectivo, { min: 900, max: 2100, origen: 'manual' });
  assert.deepStrictEqual(f.altitud.calculado, { min: 1050, max: 1950 });
  f = await ficha.ajustar(pool, A, { altitud: null }, SUPER, U);
  assert.strictEqual(f.altitud.efectivo.origen, 'calculado'); assert.strictEqual(f.altitud.manual, null);
  // pesos: volver al calculado sin tocar lo demás
  f = await ficha.ajustar(pool, A, { pesos: null }, SUPER, U);
  assert.strictEqual(f.pesos.manual, null); assert.strictEqual(f.pesos.efectivo.origen, 'calculado');
  // LRC
  await espera(ficha.ajustar(pool, A, { lrc: { metodo: 'manual', min: 50, max: 30 } }, SUPER, U), 400);
  await espera(ficha.ajustar(pool, A, { lrc: { metodo: 'manual', min: '', max: 30 } }, SUPER, U), 400);
  await espera(ficha.ajustar(pool, A, { lrc: { metodo: 'raro' } }, SUPER, U), 400);
  f = await ficha.ajustar(pool, A, { lrc: { metodo: 'manual', min: '22,5', max: 31 } }, SUPER, U);
  assert.deepStrictEqual(f.lrc, { metodo: 'manual', min: 22.5, max: 31 });
  f = await ficha.ajustar(pool, A, { lrc: { metodo: 'pendiente' } }, SUPER, U);
  assert.deepStrictEqual(f.lrc, { metodo: 'pendiente', min: null, max: null });

  // ── Subregiones con registros (geo de mentira ubica todo en 05001 = Valle de Aburrá) ──
  await q(`UPDATE dataset.region SET estado = 'activa' WHERE codigo_dane = '05'`);
  f = await ficha.deEspecie(pool, A);
  assert.strictEqual(f.subregiones_motivo, null);
  assert.deepStrictEqual(f.subregiones.map((s) => s.nombre), ['Valle de Aburrá']);
  assert.deepStrictEqual((await ficha.deEspecie(pool, eb.id)).subregiones.map((s) => s.nombre), ['Valle de Aburrá']);

  // ── Estado de la especie ──
  for (let i = 0; i < 0; i++);
  assert.strictEqual(f.dataset.fotos_activas, 17); assert.strictEqual(f.dataset.estado, 'DATASET_READY'); // ≥10 fotos y ≥3 individuos, sin vectores

  // ── Rutas HTTP: permisos y forma ──
  const authPort = 39111; const dsPort = 39110;
  const cuentas = {
    super: { isSuperAdmin: true, permissions: {} },
    ver: { isSuperAdmin: false, permissions: { verEspecies: true } },
    micro: { isSuperAdmin: false, permissions: { verEspecies: true, definirMicrohabitat: true } },
  };
  const auth = http.createServer((req, res) => {
    const tok = (req.headers.authorization || '').split(' ')[1]?.split('.')[2];
    res.setHeader('Content-Type', 'application/json');
    if (!cuentas[tok]) { res.statusCode = 401; return res.end('{}'); }
    res.end(JSON.stringify({ account: { id: tok, ...cuentas[tok] } }));
  }).listen(authPort, '127.0.0.1');
  const hijo = spawn(process.execPath, ['src/index.js'], {
    cwd: SRC, stdio: 'ignore',
    env: { ...process.env, PORT: String(dsPort), DATABASE_URL: 'postgres://postgres:prueba@127.0.0.1:55432/anura_ficha',
      AUTH_SERVICE_URL: `http://127.0.0.1:${authPort}`, MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39009',
      MINIO_ROOT_USER: 'p', MINIO_ROOT_PASSWORD: 'ppppppppp', MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39009' },
  });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (tok) => `${b64({ alg: 'HS256' })}.${b64({ id: U })}.${tok}`;
  const http_ = async (metodo, ruta, tok, cuerpo) => {
    const res = await fetch(`http://127.0.0.1:${dsPort}${ruta}`, { method: metodo,
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${jwt(tok)}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${dsPort}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
    assert.strictEqual((await http_('GET', `/api/dataset/especies/${A}/ficha`, null)).status, 401);
    const g = await http_('GET', `/api/dataset/especies/${A}/ficha`, 'ver');
    assert.strictEqual(g.status, 200); assert.strictEqual(g.body.altitud.resumen.n, 11);
    assert.strictEqual((await http_('GET', '/api/dataset/especies/99999/ficha', 'ver')).status, 404);
    // calcular altitudes: solo con definirMicrohabitat
    assert.strictEqual((await http_('POST', '/api/dataset/altitudes/calcular', 'ver', { especie_id: A })).status, 403);
    const c = await http_('POST', '/api/dataset/altitudes/calcular', 'micro', { especie_id: A });
    assert.strictEqual(c.status, 200); assert.strictEqual(typeof c.body.faltan, 'number');
    // PUT ficha: pesos sin permiso 403, con super 200
    assert.strictEqual((await http_('PUT', `/api/dataset/especies/${A}/ficha`, 'micro', { pesos: { wv: 0.5, wg: 0.3, wm: 0.2 } })).status, 403);
    assert.strictEqual((await http_('PUT', `/api/dataset/especies/${A}/ficha`, 'micro', { altitud: { min: 1000, max: 2000 } })).status, 200);
    const mal = await http_('PUT', `/api/dataset/especies/${A}/ficha`, 'super', { pesos: { wv: 1, wg: 1, wm: 1 } });
    assert.strictEqual(mal.status, 400); assert.ok(mal.body.message.includes('suma'));
    await http_('PUT', `/api/dataset/especies/${A}/ficha`, 'super', { altitud: null });
    // geo caído por HTTP: 502 con mensaje
    await q('UPDATE dataset.observacion SET altitud_calculada = NULL WHERE id = $1', [grupo[1].id]);
    geo.close(); geo.closeAllConnections?.();
    const caido = await http_('POST', '/api/dataset/altitudes/calcular', 'super', { especie_id: A });
    assert.strictEqual(caido.status, 502); assert.ok(caido.body.message.includes('geo-service no responde'));
    await new Promise((r) => geo.listen(GEO_PORT, '127.0.0.1', r));
  } finally {
    hijo.kill(); auth.close();
  }

  // ── Auditoría ──
  const { rows: aud } = await q(`SELECT action, COUNT(*)::int n FROM audit.log GROUP BY action ORDER BY action`);
  const acciones = Object.fromEntries(aud.map((a) => [a.action, a.n]));
  console.log('auditoría:', JSON.stringify(acciones));
  for (const a of ['dataset.altitud.calculada', 'dataset.ficha.altitud', 'dataset.ficha.pesos', 'dataset.ficha.lrc']) assert.ok(acciones[a] >= 1, `sin auditoría de ${a}`);
  const { rows: [uno] } = await q(`SELECT actor_id, target_type, target_id, metadata FROM audit.log WHERE action = 'dataset.ficha.pesos' AND metadata->'pesos' <> 'null'::jsonb LIMIT 1`);
  assert.strictEqual(uno.actor_id, U); assert.strictEqual(uno.target_type, 'especie'); assert.strictEqual(uno.target_id, String(A));
  assert.deepStrictEqual(uno.metadata, { pesos: { wv: 0.501, wg: 0.3, wm: 0.199 } });
  // los rechazados (400/403) no dejaron auditoría de pesos extra
  assert.strictEqual(acciones['dataset.ficha.pesos'], 2); // guardar + volver al calculado

  console.log('TODAS LAS PRUEBAS PASARON');
})().then(() => { pool.end(); geo.close(); geo.closeAllConnections?.(); process.exit(0); })
  .catch((e) => { console.error('FALLÓ:', e.stack || e.message); pool.end(); process.exit(1); });
