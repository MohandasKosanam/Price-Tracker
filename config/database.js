const mysql = require('mysql2/promise');

let pool;
let connectionState = 'unavailable';

const COMPATIBILITY_COLUMNS = [
  { table: 'Users', column: 'is_active', definition: 'BOOLEAN NOT NULL DEFAULT TRUE' },
  { table: 'Stores', column: 'description', definition: 'VARCHAR(255) NULL' },
  { table: 'Stores', column: 'logo_key', definition: "VARCHAR(40) NOT NULL DEFAULT 'store'" },
  { table: 'Stores', column: 'is_demo', definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
  { table: 'Products', column: 'image_url', definition: 'VARCHAR(255) NULL' },
  { table: 'Products', column: 'unit', definition: 'VARCHAR(80) NULL' }
];

function hasDatabaseConfig(env = process.env) {
  return Boolean(env.DB_HOST && env.DB_USER && env.DB_NAME);
}

async function ensureColumn(databasePool, database, { table, column, definition }) {
  const [[found]] = await databasePool.query(
    'SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [database, table, column]
  );
  if (Number(found.total)) return;
  await databasePool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function ensureCompatibilityColumns(databasePool, database) {
  for (const column of COMPATIBILITY_COLUMNS) await ensureColumn(databasePool, database, column);
}

async function initializeDatabase(env = process.env) {
  if (!hasDatabaseConfig(env)) {
    pool = null;
    connectionState = 'unavailable';
    return null;
  }

  const nextPool = mysql.createPool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true
  });

  try {
    await nextPool.query('SELECT 1');
    await ensureCompatibilityColumns(nextPool, env.DB_NAME);
    pool = nextPool;
    connectionState = 'mysql';
    console.log('LocalPrice connected to MySQL.');
    return pool;
  } catch (error) {
    await nextPool.end().catch(() => {});
    pool = null;
    connectionState = 'unavailable';
    console.warn(`LocalPrice MySQL unavailable [${error.code || 'connection_error'}].`);
    return null;
  }
}

function getPool() { return pool; }
function isDatabaseReady() { return connectionState === 'mysql' && Boolean(pool); }

function getDatabaseStatus() {
  if (isDatabaseReady()) return { status: 'ok', database: 'mysql' };
  if (!hasDatabaseConfig()) {
    return { status: 'unavailable', database: 'mysql', code: 'configuration_missing', message: 'Configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME in the Git-ignored .env file.' };
  }
  return { status: 'unavailable', database: 'mysql', code: 'connection_unavailable', message: 'Local MySQL is unavailable. Check the MySQL service, credentials, schema setup, and port 3306.' };
}

async function closeDatabase() {
  const closingPool = pool;
  pool = null;
  connectionState = 'unavailable';
  if (closingPool) await closingPool.end();
}

module.exports = {
  initializeDatabase,
  getPool,
  isDatabaseReady,
  getDatabaseStatus,
  hasDatabaseConfig,
  ensureCompatibilityColumns,
  closeDatabase
};
