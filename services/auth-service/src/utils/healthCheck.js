const pool = require('../config/database');

async function checkDatabaseConnection() {
  try {
    const result = await pool.query('SELECT NOW() as timestamp');
    console.log('✅ PostgreSQL Connection: SUCCESS');
    console.log('   Current timestamp:', result.rows[0].timestamp);
    return { status: 'connected', timestamp: result.rows[0].timestamp };
  } catch (err) {
    console.error('❌ PostgreSQL Connection: FAILED');
    console.error('   Error:', err.message);
    return { status: 'disconnected', error: err.message };
  }
}

async function checkDatabaseTables() {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('✅ Database Tables Found:', result.rows.length);
    result.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.table_name}`);
    });
    return { status: 'success', tables: result.rows };
  } catch (err) {
    console.error('❌ Error checking tables:', err.message);
    return { status: 'error', error: err.message };
  }
}

async function runHealthCheck() {
  console.log('\n🔍 Database Health Check\n');
  console.log('Environment Variables:');
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '✗ Not set'}`);
  console.log(`   REDIS_URL: ${process.env.REDIS_URL ? '✓ Set' : '✗ Not set'}`);
  console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✓ Set' : '✗ Not set'}`);
  console.log('');

  const connResult = await checkDatabaseConnection();
  console.log('');
  
  if (connResult.status === 'connected') {
    await checkDatabaseTables();
  }
  
  console.log('\n');
}

module.exports = { checkDatabaseConnection, checkDatabaseTables, runHealthCheck };
