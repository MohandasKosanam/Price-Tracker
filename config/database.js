const mysql = require('mysql2/promise');
const { Pool, types } = require('pg');

types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);

let pool;
let nativePgPool;
let connectionState = 'unavailable';
let databaseKind = 'mysql';

const COMPATIBILITY_COLUMNS = [
  { table: 'Users', column: 'is_active', definition: 'BOOLEAN NOT NULL DEFAULT TRUE' },
  { table: 'Stores', column: 'description', definition: 'VARCHAR(255) NULL' },
  { table: 'Stores', column: 'logo_key', definition: "VARCHAR(40) NOT NULL DEFAULT 'store'" },
  { table: 'Stores', column: 'is_demo', definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
  { table: 'Products', column: 'image_url', definition: 'VARCHAR(255) NULL' },
  { table: 'Products', column: 'unit', definition: 'VARCHAR(80) NULL' }
];

function hasDatabaseConfig(env = process.env) {
  return Boolean(env.DATABASE_URL || (env.DB_HOST && env.DB_USER && env.DB_NAME));
}

function usesPostgres(env = process.env) {
  return Boolean(env.DATABASE_URL);
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

function translatePostgresSql(sql) {
  let parameterIndex = 0;
  let translated = sql
    .replace(/\bLIKE\b/gi, 'ILIKE')
    .replace(/ORDER BY FIELD\(s\.approval_status,\s*'pending',\s*'approved',\s*'rejected'\),\s*s\.created_at DESC/i,
      "ORDER BY CASE s.approval_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END, s.created_at DESC")
    .replace(/DELETE\s+sp\s+FROM\s+Store_Products\s+sp\s+JOIN\s+Stores\s+s\s+ON\s+s\.store_id\s*=\s*sp\.store_id\s+WHERE/i,
      'DELETE FROM Store_Products sp USING Stores s WHERE s.store_id = sp.store_id AND')
    .replace(/ON DUPLICATE KEY UPDATE\s+price\s*=\s*VALUES\(price\),\s*is_available\s*=\s*VALUES\(is_available\),\s*updated_at\s*=\s*CURRENT_TIMESTAMP/i,
      'ON CONFLICT (store_id, product_id) DO UPDATE SET price = EXCLUDED.price, is_available = EXCLUDED.is_available, updated_at = CURRENT_TIMESTAMP');

  translated = translated.replace(/\?/g, () => `$${++parameterIndex}`);

  const insertMatch = translated.match(/^\s*INSERT\s+INTO\s+(users|stores|categories|products|store_products)\b/i);
  const generatedIdColumns = { users: 'user_id', stores: 'store_id', categories: 'category_id', products: 'product_id', store_products: 'listing_id' };
  if (insertMatch && !/\bRETURNING\b/i.test(translated)) {
    translated = `${translated.trimEnd()} RETURNING ${generatedIdColumns[insertMatch[1].toLowerCase()]}`;
  }
  return translated;
}

function mapPostgresError(error) {
  const mysqlLikeCodes = {
    '23505': 'ER_DUP_ENTRY',
    '23503': 'ER_NO_REFERENCED_ROW_2',
    '23502': 'ER_BAD_NULL_ERROR',
    '42P01': 'ER_NO_SUCH_TABLE',
    '42703': 'ER_BAD_FIELD_ERROR',
    '28P01': 'ER_ACCESS_DENIED_ERROR',
    '3D000': 'ER_BAD_DB_ERROR'
  };
  if (mysqlLikeCodes[error.code]) {
    error.originalCode = error.code;
    error.code = mysqlLikeCodes[error.code];
  }
  return error;
}

function makePostgresExecutor(queryable) {
  return {
    async query(sql, values = []) {
      try {
        const statement = translatePostgresSql(sql);
        const result = await queryable.query(statement, values);
        if (['INSERT', 'UPDATE', 'DELETE'].includes(result.command)) {
          const returned = result.rows?.[0] || {};
          const insertId = returned.user_id ?? returned.store_id ?? returned.category_id ?? returned.product_id ?? returned.listing_id ?? 0;
          return [{ affectedRows: result.rowCount || 0, insertId }, result.rows || []];
        }
        return [result.rows || [], result.fields || []];
      } catch (error) {
        throw mapPostgresError(error);
      }
    }
  };
}

function createPostgresPool(env) {
  const rawPool = new Pool({
    connectionString: env.DATABASE_URL,
    max: Number(env.DB_CONNECTION_LIMIT || 4),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  });
  nativePgPool = rawPool;
  pool = {
    ...makePostgresExecutor(rawPool),
    async getConnection() {
      const client = await rawPool.connect();
      const executor = makePostgresExecutor(client);
      return {
        ...executor,
        beginTransaction: () => client.query('BEGIN'),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release()
      };
    },
    async end() { await rawPool.end(); }
  };
  return pool;
}

async function initializeDatabase(env = process.env) {
  nativePgPool = null;
  if (!hasDatabaseConfig(env)) {
    pool = null;
    connectionState = 'unavailable';
    databaseKind = 'mysql';
    return null;
  }

  if (usesPostgres(env)) {
    databaseKind = 'postgres';
    const nextPool = createPostgresPool(env);
    try {
      await nextPool.query('SELECT 1');
      connectionState = 'postgres';
      console.log('LocalPrice connected to PostgreSQL.');
      return pool;
    } catch (error) {
      await nextPool.end().catch(() => {});
      pool = null;
      nativePgPool = null;
      connectionState = 'unavailable';
      console.warn(`LocalPrice PostgreSQL unavailable [${error.originalCode || error.code || 'connection_error'}].`);
      return null;
    }
  }

  databaseKind = 'mysql';
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
function getNativePgPool() { return nativePgPool; }
function isDatabaseReady() { return connectionState === databaseKind && Boolean(pool); }

function getDatabaseStatus() {
  if (isDatabaseReady()) return { status: 'ok', database: databaseKind };
  if (!hasDatabaseConfig()) {
    return { status: 'unavailable', database: 'mysql', code: 'configuration_missing', message: 'Configure DATABASE_URL for hosted PostgreSQL or DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME in the Git-ignored .env file.' };
  }
  if (usesPostgres()) {
    return { status: 'unavailable', database: 'postgres', code: 'connection_unavailable', message: 'Hosted PostgreSQL is unavailable. Check the Vercel database integration and DATABASE_URL.' };
  }
  return { status: 'unavailable', database: 'mysql', code: 'connection_unavailable', message: 'Local MySQL is unavailable. Check the MySQL service, credentials, schema setup, and port 3306.' };
}

async function closeDatabase() {
  const closingPool = pool;
  pool = null;
  nativePgPool = null;
  connectionState = 'unavailable';
  if (closingPool) await closingPool.end();
}

module.exports = {
  initializeDatabase,
  getPool,
  getNativePgPool,
  isDatabaseReady,
  getDatabaseStatus,
  hasDatabaseConfig,
  usesPostgres,
  ensureCompatibilityColumns,
  closeDatabase,
  translatePostgresSql
};
