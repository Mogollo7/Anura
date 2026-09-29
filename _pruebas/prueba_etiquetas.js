const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');
const et = require('D:/server/Anura/services/dataset-service/src/etiquetas.js');
const assert = require('assert');

const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura' });
const SUPER = { isSuperAdmin: true, permissions: {} };
const SOLO_ESTADIO = { isSuperAdmin: false, permissions: { validarEstadio: true } };

async function espera(promesa, status) {
  try { await promesa; } catch (e) { assert.strictEqual(e.status, status, `esperaba ${status}, llegó ${e.status}: ${e.message}`); return e.message; }
  throw new Error(`esperaba error ${status} y no falló`);
}

(async () => {
  const q = (s, p) => pool.query(s, p);
  await q(`INSERT INTO auth.users (id, username, email) VALUES ('d81f2281-6086-435e-9de6-603f766fdf5e', 'sebas', 'prueba@anura.test') ON CONFLICT DO NOTHING`);
  const u = { id: 'd81f2281-6086-435e-9de6-603f766fdf5e' };
  // phase12 ya siembra Antioquia y sus subregiones; solo se activa.
  await q(`UPDATE dataset.region SET estado = 'activa' WHERE codigo_dane = '05'`);
  const { rows: [sub] } = await q(`SELECT id FROM dataset.subregion WHERE region = '05' AND nombre = 'Valle de Aburrá'`);
  assert.ok(sub, 'phase12 no sembró Valle de Aburrá');
  const { rows: [e1] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia) VALUES ('Oophaga_histrionica','Oophaga histrionica','Oophaga','Dendrobatidae') RETURNING id`);
  const { rows: [e2] } = await q(`INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia) VALUES ('Boana_boans','Boana boans','Boana','Hylidae') RETURNING id`);
  const { rows: [o1] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id) VALUES ('manual', 'o1') RETURNING id`);
  const { rows: [o2] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id) VALUES ('manual', 'o2') RETURNING id`);
  await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado) VALUES (repeat('a',64), 'k1', $1, $2, 'a.jpg', 'catalogo')`, [e1.id, o1.id]);
  await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado) VALUES (repeat('b',64), 'k2', $1, $2, 'b.jpg', 'catalogo')`, [e2.id, o2.id]);

  // Declarar morfo y duplicado
  const m = await et.declararMorfo(pool, e1.id, { subregion_id: sub.id, nombre: ' Rojo ', nota: 'dorso rojo' }, u.id);
  assert.strictEqual(m.nombre, 'Rojo');
  await espera(et.declararMorfo(pool, e1.id, { subregion_id: sub.id, nombre: 'Rojo' }, u.id), 409);
  await espera(et.declararMorfo(pool, e1.id, { subregion_id: sub.id, nombre: '' }, u.id), 400);
  await espera(et.declararMorfo(pool, e1.id, { subregion_id: 9999, nombre: 'Azul' }, u.id), 404);

  // Etiquetar: estadio + sustrato + morfo con super usuario
  let fila = await et.etiquetar(pool, o1.id, { estadio: 'juvenil', sustrato: 'hojarasca', morfo_id: m.id }, SUPER, u.id);
  assert.deepStrictEqual([fila.estadio, fila.sustrato, fila.morfo_id], ['juvenil', 'hojarasca', m.id]);
  // Actualización parcial: solo estadio, conserva sustrato y morfo
  fila = await et.etiquetar(pool, o1.id, { estadio: 'adulto' }, SOLO_ESTADIO, u.id);
  assert.deepStrictEqual([fila.estadio, fila.sustrato, fila.morfo_id], ['adulto', 'hojarasca', m.id]);
  // Permiso por campo
  await espera(et.etiquetar(pool, o1.id, { sustrato: 'roca' }, SOLO_ESTADIO, u.id), 403);
  // Valores inválidos y observación inexistente
  await espera(et.etiquetar(pool, o1.id, { estadio: 'renacuajo' }, SUPER, u.id), 400);
  await espera(et.etiquetar(pool, 999999, { estadio: 'adulto' }, SUPER, u.id), 404);
  await espera(et.etiquetar(pool, o1.id, {}, SUPER, u.id), 400);
  // Morfo de otra especie
  await espera(et.etiquetar(pool, o2.id, { morfo_id: m.id }, SUPER, u.id), 400);
  // null borra
  fila = await et.etiquetar(pool, o1.id, { sustrato: null }, SUPER, u.id);
  assert.strictEqual(fila.sustrato, null);

  // Lectura por especie
  const r = await et.deEspecie(pool, e1.id);
  assert.strictEqual(r.morfos.length, 1);
  assert.strictEqual(r.morfos[0].individuos, 1);
  assert.strictEqual(r.morfos[0].subregion, 'Valle de Aburrá');
  assert.strictEqual(r.observaciones.length, 1);
  assert.strictEqual((await et.deEspecie(pool, e2.id)).observaciones.length, 0);
  await espera(et.deEspecie(pool, 999999), 404);

  // Quitar morfo: la etiqueta queda sin morfo, el estadio se conserva
  await et.quitarMorfo(pool, m.id, u.id);
  const { rows: [tras] } = await q('SELECT estadio, morfo_id FROM dataset.observacion_etiqueta WHERE observacion_id = $1', [o1.id]);
  assert.deepStrictEqual([tras.estadio, tras.morfo_id], ['adulto', null]);
  await espera(et.quitarMorfo(pool, m.id, u.id), 404);

  const { rows: [aud] } = await q(`SELECT COUNT(*)::int n, array_agg(DISTINCT action ORDER BY action) acciones FROM audit.log`);
  console.log('auditoría:', aud.n, 'filas', aud.acciones.join(', '));
  console.log('TODAS LAS PRUEBAS PASARON');
  await pool.end();
})().catch(async (e) => { console.error('FALLÓ:', e.message); await pool.end(); process.exit(1); });
