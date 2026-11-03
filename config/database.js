const mysql = require('mysql2/promise');

let pool;
let connectionState = 'demo';

function hasDatabaseConfig() {
  return Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
}

async function initializeDatabase() {
  if (!hasDatabaseConfig()) return null;

  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true
    });
    await pool.query('SELECT 1');
    try {
      await pool.query('ALTER TABLE Products ADD COLUMN image_url VARCHAR(255) NULL AFTER image_key');
    } catch (error) {
      if (!/duplicate column|column .* already exists/i.test(error.message)) throw error;
    }
    connectionState = 'mysql';
    console.log('LocalPrice connected to MySQL.');
    return pool;
  } catch (error) {
    connectionState = 'demo';
    pool = null;
    console.warn(`MySQL unavailable; using demo data. ${error.message}`);
    return null;
  }
}

function getPool() { return pool; }
function isDatabaseReady() { return connectionState === 'mysql' && Boolean(pool); }

module.exports = { initializeDatabase, getPool, isDatabaseReady };
