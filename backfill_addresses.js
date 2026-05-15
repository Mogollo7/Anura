const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function backfill() {
  console.log('Starting backfill of place_guess...');
  try {
    const res = await pool.query('SELECT id, lat, lon FROM observations.observations WHERE place_guess IS NULL AND lat IS NOT NULL AND lon IS NOT NULL');
    const rows = res.rows;
    console.log(`Found ${rows.length} observations to backfill.`);

    for (const row of rows) {
      try {
        console.log(`Processing ${row.id}...`);
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${row.lat}&lon=${row.lon}&format=json`;
        const { data } = await axios.get(url, {
          headers: { 'User-Agent': 'Anura-Backfill/1.0' }
        });
        
        if (data.display_name) {
          await pool.query('UPDATE observations.observations SET place_guess = $1 WHERE id = $2', [data.display_name, row.id]);
          console.log(`Updated ${row.id} with: ${data.display_name}`);
        }
        
        // Wait 1.1s to respect Nominatim rate limits (1 req/s)
        await new Promise(resolve => setTimeout(resolve, 1100));
      } catch (e) {
        console.error(`Error backfilling ${row.id}:`, e.message);
      }
    }
    console.log('Backfill complete!');
  } catch (err) {
    console.error('Backfill failed:', err);
  } finally {
    await pool.end();
  }
}

backfill();
