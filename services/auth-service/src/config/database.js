const { Pool } = require('pg');
const config = require('../core/config'); // O usar process.env directamente

const pool = new Pool({
  connectionString: config.databaseUrl || process.env.DATABASE_URL,
});

// Comprobar la conexión
pool.connect()
  .then(client => {
    console.log('✅ Conectado a PostgreSQL');
    client.release();
  })
  .catch(err => console.error('❌ Error conectando a PostgreSQL', err.stack));

module.exports = pool;
