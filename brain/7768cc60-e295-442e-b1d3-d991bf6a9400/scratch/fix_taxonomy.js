const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    console.log('Inserting taxonomy for Pristimantis achatinus...');
    await pool.query(`
      INSERT INTO species.taxonomy (class_name, order_name, family, genus, species, common_name)
      VALUES ('Amphibia', 'Anura', 'Craugastoridae', 'Pristimantis', 'achatinus', 'Pristimantis achatinus')
      ON CONFLICT (genus, species) DO UPDATE
      SET class_name = EXCLUDED.class_name,
          order_name = EXCLUDED.order_name,
          family = EXCLUDED.family,
          common_name = EXCLUDED.common_name;

      UPDATE species.taxonomy
      SET family = 'Craugastoridae'
      WHERE genus = 'Pristimantis';
    `);
    console.log('Success!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
