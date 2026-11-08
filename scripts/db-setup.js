require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { ensureCompatibilityColumns } = require('../config/database');

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_USER) throw new Error('Configure DB_HOST, DB_PORT, DB_USER and DB_PASSWORD in .env first.');
  const database = process.env.DB_NAME || 'localprice';
  if (database !== 'localprice') throw new Error('The LocalPrice submission database must be named localprice.');
  const sql = await fs.readFile(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    connectTimeout: 7000
  });
  try { await connection.query(sql); } finally { await connection.end(); }

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database,
    waitForConnections: true,
    connectionLimit: 2,
    decimalNumbers: true
  });
  try {
    await ensureCompatibilityColumns(pool, database);
    const [[version]] = await pool.query('SELECT VERSION() AS version');
    console.log(`MySQL schema ready: ${database} (${version.version}). No existing rows were deleted.`);
    console.log('Tables: Users, Stores, Categories, Products, Store_Products, Price_History.');
  } finally { await pool.end(); }
}

main().catch((error) => {
  const reason = error.code === 'ER_ACCESS_DENIED_ERROR' ? 'Check the MySQL account and password in .env.'
    : error.code === 'ECONNREFUSED' ? 'Check that MySQL is running on the configured host and port.' : error.message;
  console.error(`MySQL schema setup failed [${error.code || 'setup_error'}]: ${reason}`);
  process.exitCode = 1;
});
