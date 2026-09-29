// Prueba de salidas de campo contra la base desechable anura_salidas.
// Uso: NODE_PATH=<salidas_nm/node_modules> node prueba_salidas.js
// Levanta observation (solo field-trips.routes) en :39160 y explorer (solo field-trips.js) en :39161,
// conectados con los roles reales observation_service / explorer_service.
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

process.env.JWT_SECRET = 'prueba-salidas';
const SECRET = process.env.JWT_SECRET;
const BASE = 'postgres://%s:p@127.0.0.1:55432/anura_salidas';
process.env.DATABASE_URL = BASE.replace('%s', 'observation_service');

const admin = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_salidas' });
const explorerPool = new Pool({ connectionString: BASE.replace('%s', 'explorer_service') });

const obsApp = express();
obsApp.use(express.json());
obsApp.use('/api/observations/field-trips', require('D:/server/Anura/services/observation-service/src/api/field-trips.routes'));
const expApp = express();
require('D:/server/Anura/services/explorer-service/src/field-trips').registrarSalidasDeCampo(expApp, explorerPool, SECRET);

const tok = (u, role = 'user') => jwt.sign({ id: u.id, username: u.username, role }, SECRET);
const call = (port, method, path, { token, body } = {}) =>
  new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: {
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
const OBS = (...a) => call(39160, ...a);
const EXP = (...a) => call(39161, ...a);

let pasadas = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pasadas += 1; console.log('  ok', msg); };
const igual = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); pasadas += 1; console.log('  ok', msg); };

async function main() {
  const s1 = obsApp.listen(39160, '127.0.0.1');
  const s2 = expApp.listen(39161, '127.0.0.1');
  try {
    await admin.query('DELETE FROM observations.observations; DELETE FROM observations.field_trips; DELETE FROM auth.users;');
    const user = async (n) => (await admin.query(
      `INSERT INTO auth.users (username, email) VALUES ($1, $2) RETURNING id, username`, [n, `${n}@anura.test`])).rows[0];
    const ana = await user('ana');
    const beto = await user('beto');
    const obs = async (u, { priv = false, lat = 6.2, lon = -75.5, place = null, min = 0, clase = null } = {}) => {
      const r = await admin.query(
        `INSERT INTO observations.observations (user_id, image_key, thumbnail_key, lat, lon, place_guess, is_private, status, recorded_at)
         VALUES ($1,'uploads/x.webp','thumbnails/thumb_x.webp',$2,$3,$4,$5,'synced', NOW() + ($6 || ' minutes')::interval) RETURNING id`,
        [u.id, lat, lon, place, priv, String(min)]);
      if (clase) await admin.query(`INSERT INTO ai.predictions (observation_id, model_version, top_class, top_probability) VALUES ($1,'m',$2,0.9)`, [r.rows[0].id, clase]);
      return r.rows[0].id;
    };
    // Especie publicada (ficha publicada + taxon_id) y otra sin publicar: solo la primera trae datos de catálogo.
    await admin.query(`DELETE FROM dataset.species_content WHERE especie_id IN (SELECT id FROM dataset.especie WHERE carpeta IN ('rhinella_marina','hyla_sinficha'))`);
    await admin.query(`DELETE FROM dataset.especie WHERE carpeta IN ('rhinella_marina','hyla_sinficha')`);
    const esp = async (carpeta, nombre, genero, taxon) => (await admin.query(
      `INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id) VALUES ($1,$2,$3,'Bufonidae',$4) RETURNING id`, [carpeta, nombre, genero, taxon])).rows[0].id;
    const idPub = await esp('rhinella_marina', 'Rhinella marina', 'Rhinella', 'COL_ANURA_9001');
    await admin.query(`INSERT INTO dataset.species_content (especie_id, estado, campos, publicada, version, publicado_en)
                       VALUES ($1,'publicada','{}', '{"campos":{"nombre_comun":{"valor":"Sapo de caña"}}}', 1, NOW())`, [idPub]);
    const idBorr = await esp('hyla_sinficha', 'Hyla sinficha', 'Hyla', 'COL_ANURA_9002');
    await admin.query(`INSERT INTO dataset.species_content (especie_id, estado, campos) VALUES ($1,'borrador','{}')`, [idBorr]);

    console.log('sin sesión / validación');
    igual((await OBS('POST', '/api/observations/field-trips', { body: { clientId: 'a' } })).status, 401, 'crear sin token -> 401');
    const t = tok(ana);
    igual((await OBS('POST', '/api/observations/field-trips', { token: t, body: { clientId: 'a' } })).status, 400, 'sin startedAt -> 400');
    igual((await OBS('POST', '/api/observations/field-trips', { token: t, body: { clientId: 'a', startedAt: 'no-fecha' } })).status, 400, 'fecha inválida -> 400');
    igual((await OBS('POST', '/api/observations/field-trips', { token: t, body: { clientId: 'a', startedAt: 2000, endedAt: 1000 } })).status, 400, 'fin antes de inicio -> 400');
    igual((await OBS('POST', '/api/observations/field-trips', { token: t, body: { clientId: 'a', startedAt: 1000, latitude: 200 } })).status, 400, 'latitud fuera de rango -> 400');

    console.log('crear y vincular');
    const o1 = await obs(ana, { place: 'Jardín, Antioquia', min: 1, clase: 'Rhinella marina' });
    const o2 = await obs(ana, { priv: true, min: 2 });
    const o3 = await obs(ana, { min: 3, clase: 'Rhinella_marina' });
    const ajena = await obs(beto, { min: 1 });
    const inicio = Date.now() - 3600_000;
    const cuerpo = { clientId: 'session-abc', startedAt: inicio, endedAt: inicio + 1800_000, observationIds: [o1, o2, o3, ajena, '11111111-1111-1111-1111-111111111111'] };
    let r = await OBS('POST', '/api/observations/field-trips', { token: t, body: cuerpo });
    igual(r.status, 201, 'crea salida -> 201');
    igual(r.body.observaciones_vinculadas, 3, 'vincula solo las 3 observaciones propias (ignora ajena e inexistente)');
    const tripId = r.body.id;
    r = await OBS('POST', '/api/observations/field-trips', { token: t, body: { ...cuerpo, placeLabel: '  Finca La Sirena ' } });
    igual(r.status, 200, 'reintento con el mismo clientId -> 200 (idempotente)');
    igual(r.body.id, tripId, 'misma salida, sin duplicar');
    igual(r.body.place_label, 'Finca La Sirena', 'actualiza el lugar (recortado)');
    igual((await admin.query('SELECT COUNT(*)::int n FROM observations.field_trips')).rows[0].n, 1, 'una sola fila');
    igual((await admin.query('SELECT COUNT(*)::int n FROM observations.observations WHERE field_trip_id = $1', [tripId])).rows[0].n, 3, '3 observaciones apuntan a la salida');
    igual((await admin.query('SELECT field_trip_id FROM observations.observations WHERE id = $1', [ajena])).rows[0].field_trip_id, null, 'la ajena no se vinculó');
    // mismo clientId de otra persona = otra salida
    r = await OBS('POST', '/api/observations/field-trips', { token: tok(beto), body: { clientId: 'session-abc', startedAt: inicio } });
    igual(r.status, 201, 'mismo clientId de otra persona crea su propia salida');
    const tripBeto = r.body.id;

    console.log('permisos de modificación');
    igual((await OBS('PATCH', `/api/observations/field-trips/${tripId}`, { token: tok(beto), body: { placeLabel: 'hackeo' } })).status, 403, 'otra persona no modifica -> 403');
    igual((await OBS('PATCH', `/api/observations/field-trips/${tripId}`, { token: tok(beto, 'admin'), body: { placeLabel: 'hackeo' } })).status, 403, 'ni un admin modifica -> 403');
    igual((await OBS('PATCH', `/api/observations/field-trips/${tripId}`, { body: { placeLabel: 'x' } })).status, 401, 'sin token -> 401');
    igual((await OBS('PATCH', `/api/observations/field-trips/no-es-uuid`, { token: t, body: { placeLabel: 'x' } })).status, 400, 'id inválido -> 400');
    igual((await OBS('PATCH', `/api/observations/field-trips/22222222-2222-2222-2222-222222222222`, { token: t, body: { placeLabel: 'x' } })).status, 404, 'inexistente -> 404');
    igual((await OBS('PATCH', `/api/observations/field-trips/${tripId}`, { token: t, body: {} })).status, 400, 'sin campos -> 400');
    r = await OBS('PATCH', `/api/observations/field-trips/${tripId}`, { token: t, body: { placeLabel: 'Quebrada La Miel' } });
    igual([r.status, r.body.place_label], [200, 'Quebrada La Miel'], 'la autora modifica el lugar');
    const o4 = await obs(ana, { min: 4, clase: 'Hyla sinficha' });
    r = await OBS('PATCH', `/api/observations/field-trips/${tripId}`, { token: t, body: { observationIds: [o4] } });
    igual(r.body.observaciones_vinculadas, 1, 'la autora suma una observación');
    igual((await OBS('DELETE', `/api/observations/field-trips/${tripBeto}`, { token: t })).status, 403, 'otra persona no elimina -> 403');

    console.log('lectura pública (explorer)');
    r = await EXP('GET', '/api/explorer/field-trips');
    igual(r.status, 200, 'lista pública sin sesión');
    igual(r.body.length, 1, 'solo la salida de ana (la de beto no tiene observaciones)');
    const s = r.body[0];
    igual([s.id, s.username, s.observation_count, s.species_count, s.is_mine], [tripId, 'ana', 3, 2, false], 'la persona ajena ve 3 observaciones públicas (sin la privada) y 2 especies (Rhinella marina y Rhinella_marina cuentan como una)');
    igual(s.place_label, 'Quebrada La Miel', 'lugar de la salida');
    r = await EXP('GET', `/api/explorer/field-trips/${tripId}`);
    igual(r.body.observations.length, 3, 'detalle ajeno: sin la observación privada');
    ok(!r.body.observations.some((o) => o.id === o2), 'la privada no aparece');
    const [d1, d3, d4] = r.body.observations;
    igual([d1.common_name, d1.taxon_id, d1.genus, d1.species, d1.family, d1.class_name], ['Sapo de caña', 'COL_ANURA_9001', 'Rhinella', 'marina', 'Bufonidae', 'Amphibia'], 'especie publicada: trae sus datos de catálogo');
    igual([d3.common_name, d3.taxon_id], ['Sapo de caña', 'COL_ANURA_9001'], 'top_class con guion bajo cruza con la especie publicada');
    igual([d4.taxon_id, d4.common_name, d4.ai_class], [null, null, 'Hyla sinficha'], 'especie sin ficha publicada: sin datos de catálogo, se muestra igual');
    igual(r.body.observations.map((o) => o.id), [o1, o3, o4], 'orden cronológico');
    r = await EXP('GET', `/api/explorer/field-trips/${tripId}`, { token: t });
    igual(r.body.observations.length, 4, 'la autora ve también la privada');
    igual(r.body.is_mine, true, 'is_mine para la autora');
    r = await EXP('GET', '/api/explorer/field-trips', { token: tok(beto) });
    igual(r.body.map((x) => x.username).sort(), ['ana', 'beto'], 'beto ve la de ana y la suya vacía');
    r = await EXP('GET', '/api/explorer/field-trips?username=ANA');
    igual(r.body.length, 1, 'filtro por usuario (sin distinguir mayúsculas)');
    igual((await EXP('GET', `/api/explorer/field-trips/${tripBeto}`)).status, 404, 'salida vacía de beto: 404 para el público');
    igual((await EXP('GET', `/api/explorer/field-trips/${tripBeto}`, { token: tok(beto) })).status, 200, 'la autora ve su salida vacía');
    igual((await EXP('GET', '/api/explorer/field-trips/no-es-uuid')).status, 404, 'id inválido -> 404');
    // todas privadas => oculta al público
    await admin.query('UPDATE observations.observations SET is_private = TRUE WHERE field_trip_id = $1', [tripId]);
    igual((await EXP('GET', '/api/explorer/field-trips')).body.length, 0, 'todas privadas: la salida desaparece del público');
    igual((await EXP('GET', `/api/explorer/field-trips/${tripId}`)).status, 404, 'y su detalle da 404');
    await admin.query('UPDATE observations.observations SET is_private = FALSE WHERE id = ANY($1)', [[o1, o3, o4]]);

    console.log('permisos de base de datos');
    const obsPool = new Pool({ connectionString: process.env.DATABASE_URL });
    await assert.rejects(explorerPool.query(`UPDATE observations.field_trips SET place_label = 'x'`), /permission denied/);
    pasadas += 1; console.log('  ok explorer_service no puede escribir salidas');
    await obsPool.end();

    console.log('eliminar');
    igual((await OBS('DELETE', `/api/observations/field-trips/${tripId}`, { token: t })).status, 200, 'la autora elimina');
    igual((await admin.query('SELECT COUNT(*)::int n FROM observations.observations WHERE id = ANY($1)', [[o1, o2, o3, o4]])).rows[0].n, 4, 'las observaciones se conservan');
    igual((await admin.query('SELECT COUNT(*)::int n FROM observations.observations WHERE field_trip_id IS NOT NULL')).rows[0].n, 0, 'sin vínculo');
    igual((await OBS('DELETE', `/api/observations/field-trips/${tripBeto}`, { token: tok(ana, 'admin') })).status, 200, 'un admin puede eliminar');
    console.log(`\nTODO BIEN: ${pasadas} comprobaciones`);
  } finally {
    s1.close(); s2.close();
    await admin.end(); await explorerPool.end();
  }
}
main().catch((e) => { console.error('FALLA:', e); process.exitCode = 1; });
