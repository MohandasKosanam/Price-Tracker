require('dotenv').config();

const mysql = require('mysql2/promise');
const requiredTables = ['Users', 'Stores', 'Categories', 'Products', 'Store_Products', 'Price_History'];

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    throw new Error('Configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME in .env.');
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    connectTimeout: 7000
  });
  try {
    const [[info]] = await connection.query('SELECT DATABASE() AS database_name, VERSION() AS version');
    const [tables] = await connection.query('SHOW TABLES');
    const names = new Set(tables.map((row) => String(Object.values(row)[0]).toLowerCase()));
    const missing = requiredTables.filter((name) => !names.has(name.toLowerCase()));
    if (missing.length) throw new Error(`Database ${info.database_name} is missing tables: ${missing.join(', ')}. Run npm run db:setup.`);
    const [[foreignKeys]] = await connection.query(
      'SELECT COUNT(*) AS total FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?',
      [info.database_name]
    );
    console.log(`MySQL connection: ready (${info.version})`);
    console.log(`Database: ${info.database_name} at ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
    console.log(`Required tables: ${requiredTables.join(', ')}`);
    console.log(`Foreign-key constraints: ${foreignKeys.total}`);
  } finally { await connection.end(); }
}

main().catch((error) => {
  console.error(`MySQL check failed [${error.code || 'check_error'}]: ${error.message}`);
  process.exitCode = 1;
});
