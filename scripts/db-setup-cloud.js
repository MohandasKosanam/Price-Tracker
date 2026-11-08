require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

function statementsFrom(sql) {
  return sql.split(/;\s*/).map((statement) => statement.trim()).filter(Boolean);
}

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set DATABASE_URL_UNPOOLED or DATABASE_URL in the Git-ignored .env file.');

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    const schema = await fs.readFile(path.join(__dirname, '..', 'database', 'schema.postgres.sql'), 'utf8');
    const seed = await fs.readFile(path.join(__dirname, '..', 'database', 'seed.postgres.sql'), 'utf8');
    await client.query('BEGIN');
    for (const statement of statementsFrom(schema)) await client.query(statement);

    const { rows: [state] } = await client.query(`
      SELECT EXISTS (SELECT 1 FROM users)
        OR EXISTS (SELECT 1 FROM stores)
        OR EXISTS (SELECT 1 FROM categories)
        OR EXISTS (SELECT 1 FROM products)
        OR EXISTS (SELECT 1 FROM store_products)
        OR EXISTS (SELECT 1 FROM price_history) AS has_data
    `);
    if (state.has_data) {
      console.log('Cloud schema is ready. Existing application data was preserved; demo seeding was skipped.');
    } else {
      for (const statement of statementsFrom(seed)) await client.query(statement);
      console.log('Cloud schema is ready and demo data was seeded (6 users, 4 stores, 6 products, 8 listings).');
      console.log('Demo account password: demo123. Passwords are stored as bcrypt hashes.');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Cloud PostgreSQL setup failed [${error.code || 'setup_error'}]: ${error.message}`);
  process.exitCode = 1;
});
