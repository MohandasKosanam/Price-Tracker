require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const tables = ['Users', 'Stores', 'Categories', 'Products', 'Store_Products', 'Price_History'];

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled when NODE_ENV=production.');
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) throw new Error('Configure MySQL in .env before seeding.');
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 2
  });
  let connection;
  try {
    connection = await pool.getConnection();
    const counts = {};
    for (const table of tables) {
      const [[row]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      counts[table] = Number(row.total);
    }
    const populated = Object.entries(counts).filter(([, count]) => count > 0);
    if (populated.length) throw new Error(`Refusing to seed non-empty tables (${populated.map(([name, count]) => `${name}: ${count}`).join(', ')}). No data was changed.`);
    const sql = (await fs.readFile(path.join(__dirname, '..', 'database', 'seed.sql'), 'utf8')).replace(/^\s*USE\s+localprice\s*;?/i, '');
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
    await connection.beginTransaction();
    try {
      for (const statement of statements) await connection.query(statement);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    const [[countsAfter]] = await connection.query('SELECT (SELECT COUNT(*) FROM Users) AS users, (SELECT COUNT(*) FROM Stores) AS stores, (SELECT COUNT(*) FROM Products) AS products, (SELECT COUNT(*) FROM Store_Products) AS listings');
    console.log(`Original MySQL demo data seeded: ${countsAfter.users} users, ${countsAfter.stores} stores, ${countsAfter.products} products, ${countsAfter.listings} listings.`);
    console.log('Seeded demo accounts use bcrypt hashes; demo password: demo123.');
  } finally {
    connection?.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`MySQL demo seeding failed [${error.code || 'seed_error'}]: ${error.message}`);
  process.exitCode = 1;
});
