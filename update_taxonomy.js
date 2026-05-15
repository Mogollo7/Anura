const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://anura_user:anura_db_pass_2024@localhost:5432/anura'
});

const names = {
  "Dendrobates truncatus": "Rana Venenosa de Rayas Amarillas",
  "Dendropsophus bogerti": "Ranita de Pantano",
  "Dendropsophus microcephalus": "Rana de Árbol Amarilla",
  "Hyloscirtus palmeri": "Rana de Torrente de Palmer",
  "Leucostethus fraterdanieli": "Rana Cohete Silbadora",
  "Pristimantis acanthinus": "Cutín Común de Occidente",
  "Pristimantis paisa": "Cutín Paisa",
  "Pristimantis penelopus": "Rana de Ingles Negras y Amarillas",
  "Rhinella alata": "Sapo del Obispo",
  "Rhinella horribilis": "Sapo Gigante"
};

async function syncTaxonomy() {
  for (const [sciName, commonName] of Object.entries(names)) {
    const parts = sciName.split(' ');
    const genus = parts[0];
    const species = parts[1];

    try {
      await pool.query(`
        INSERT INTO species.taxonomy (class_name, genus, species, common_name)
        VALUES ('Amphibia', $1, $2, $3)
        ON CONFLICT (genus, species) 
        DO UPDATE SET common_name = EXCLUDED.common_name;
      `, [genus, species, commonName]);
      console.log(`Updated ${sciName} -> ${commonName}`);
    } catch (e) {
      console.error(`Error updating ${sciName}:`, e.message);
    }
  }
  await pool.end();
}

syncTaxonomy();
