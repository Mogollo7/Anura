const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://anura_user:change_me@localhost:5432/anura'
});

async function backfillAltitude() {
  console.log('Starting altitude backfill...');
  try {
    const res = await pool.query('SELECT id, lat, lon FROM observations.observations WHERE altitude_m IS NULL AND lat IS NOT NULL AND lon IS NOT NULL');
    console.log(`Found ${res.rows.length} observations without altitude.`);

    for (const row of res.rows) {
      try {
        console.log(`Fetching altitude for obs ${row.id} at ${row.lat}, ${row.lon}...`);
        const url = `https://api.opentopodata.org/v1/srtm30m?locations=${row.lat},${row.lon}`;
        const { data } = await axios.get(url);
        const alt = data?.results?.[0]?.elevation;
        
        if (alt !== undefined) {
          await pool.query('UPDATE observations.observations SET altitude_m = $1 WHERE id = $2', [alt, row.id]);
          console.log(`Updated obs ${row.id} with altitude ${alt}m`);
        }
        // Sleep to respect API limits if many
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Error updating obs ${row.id}:`, err.message);
      }
    }
    console.log('Backfill complete.');
  } catch (err) {
    console.error('Backfill failed:', err.message);
  } finally {
    await pool.end();
  }
}

backfillAltitude();
