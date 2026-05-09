/**
 * shared/database/pg.js
 * Shared PostgreSQL pool – importar desde cualquier servicio Node
 * Usage: const { query } = require('../../shared/database/pg');
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[pg] Unexpected error on idle client', err);
});

/**
 * @param {string} text  - SQL query
 * @param {any[]}  params - query parameters
 */
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
