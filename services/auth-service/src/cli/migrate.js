const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  try {
    console.log('Running migrations...');
    await pool.query(`
      ALTER TABLE auth.user_preferences 
      ADD COLUMN IF NOT EXISTS preferences_completed BOOLEAN DEFAULT FALSE;
    `);
    console.log('Column preferences_completed added or already exists.');
    
    await pool.query(`
      ALTER TABLE observations.observations 
      ADD COLUMN IF NOT EXISTS thumbnail_blob BYTEA;
    `);
    console.log('Column thumbnail_blob checked.');
    
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
