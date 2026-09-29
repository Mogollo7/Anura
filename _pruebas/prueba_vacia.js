const SRC = 'D:/server/Anura/services/dataset-service/src';
const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');
const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_vectores_vacia' });
(async () => {
  const r = {
    trabajos: await require(`${SRC}/trabajos.js`).estado(pool),
    vectores: await require(`${SRC}/vectores.js`).resumen(pool, null),
    proyeccion: await require(`${SRC}/vectores.js`).proyeccion(pool, null),
    metadatos: await require(`${SRC}/vectores.js`).metadatos(pool, null, {}),
    morfos: await require(`${SRC}/centroides.js`).morfos(pool),
    clusteres: await require(`${SRC}/clusteres.js`).panorama(pool, {}),
  };
  console.log(JSON.stringify(r));
  try { await require(`${SRC}/vectores.js`).latencia(pool, null); } catch (e) { console.log('latencia:', e.status, e.message); }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
