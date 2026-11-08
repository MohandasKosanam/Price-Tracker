require('dotenv').config();

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const projectRoot = path.resolve(__dirname, '..');
const databaseConfigured = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

function startServer(port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', SESSION_SECRET: 'localprice-test-session-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, get output() { return output; } };
}

async function availablePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function stopServer(server) {
  if (!server || server.child.exitCode !== null) return;
  server.child.kill();
  await Promise.race([once(server.child, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (server.child.exitCode === null) server.child.kill('SIGKILL');
}

async function waitForServer(origin, server) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`Express exited before becoming ready. ${server.output}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      const body = await response.json();
      if (response.ok) return body;
      if (body.code !== 'connection_unavailable') throw new Error(`Database health check failed: ${JSON.stringify(body)}`);
    } catch (error) {
      if (error.message.startsWith('Database health')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`LocalPrice did not become ready. ${server.output}`);
}

async function api(origin, route, { cookie, method = 'GET', body } = {}) {
  const response = await fetch(`${origin}${route}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json().catch(() => ({}));
  const setCookie = response.headers.get('set-cookie') || '';
  const sessionCookie = setCookie.match(/connect\.sid=[^;]+/)?.[0] || cookie || null;
  return { status: response.status, payload, cookie: sessionCookie };
}

async function login(origin, email, password) {
  const result = await api(origin, '/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(result.status, 200, `Login failed for ${email}: ${JSON.stringify(result.payload)}`);
  assert.ok(result.cookie, 'Expected the login route to set a session cookie.');
  return result.cookie;
}

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 2,
    decimalNumbers: true
  });
}

test('MySQL registration, roles, approval, product comparison, and persistence survive server restart', {
  skip: databaseConfigured ? false : 'Configure local MySQL in .env to run the integration workflow.'
}, async () => {
  const pool = createPool();
  const token = crypto.randomUUID();
  const customerEmail = `lp-e2e-customer-${token}@localprice.test`;
  const ownerEmail = `lp-e2e-owner-${token}@localprice.test`;
  const password = `LocalPrice-${token}-pw`;
  const productName = `LocalPrice E2E ${token}`;
  const brand = `LP Test ${token}`;
  const locality = `LP-Test-${token.slice(0, 8)}`;
  let testProductId = null;
  let server = null;
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;

  try {
    server = startServer(port);
    const health = await waitForServer(origin, server);
    assert.equal(health.database, 'mysql');

    const registration = await api(origin, '/api/auth/register', {
      method: 'POST', body: { fullName: 'LocalPrice E2E Customer', email: customerEmail, password }
    });
    assert.equal(registration.status, 201, JSON.stringify(registration.payload));
    const [[customerRow]] = await pool.query('SELECT password_hash FROM Users WHERE email = ?', [customerEmail]);
    assert.notEqual(customerRow.password_hash, password, 'The account password must be stored as a hash.');
    assert.equal(await bcrypt.compare(password, customerRow.password_hash), true);
    const customerCookie = await login(origin, customerEmail, password);

    const ownerRegistration = await api(origin, '/api/auth/register', {
      method: 'POST', body: {
        fullName: 'LocalPrice E2E Owner', email: ownerEmail, password, phone: '5550101',
        role: 'shop_owner', storeName: `LP Store ${token.slice(0, 8)}`, locality: 'Before Approval', address: 'Local test address'
      }
    });
    assert.equal(ownerRegistration.status, 201, JSON.stringify(ownerRegistration.payload));
    const ownerCookie = await login(origin, ownerEmail, password);
    const [[testStore]] = await pool.query('SELECT store_id, approval_status FROM Stores WHERE owner_id = ?', [ownerRegistration.payload.user.user_id]);
    assert.equal(testStore.approval_status, 'pending');

    const adminCookie = await login(origin, 'admin@localprice.test', 'demo123');
    const forbidden = await api(origin, `/api/admin/stores/${testStore.store_id}/status`, {
      cookie: customerCookie, method: 'PATCH', body: { status: 'approved' }
    });
    assert.equal(forbidden.status, 403, 'Customer role must not approve stores.');
    const approval = await api(origin, `/api/admin/stores/${testStore.store_id}/status`, {
      cookie: adminCookie, method: 'PATCH', body: { status: 'approved' }
    });
    assert.equal(approval.status, 200, JSON.stringify(approval.payload));

    const categories = await api(origin, '/api/categories');
    assert.equal(categories.status, 200);
    assert.ok(categories.payload.categories.length, 'Demo categories are required to exercise product management.');
    const product = await api(origin, '/api/owner/products', {
      cookie: ownerCookie, method: 'POST', body: {
        name: productName, brand, description: 'Temporary database persistence workflow test product.',
        categoryId: categories.payload.categories[0].category_id, price: 12.34
      }
    });
    assert.equal(product.status, 201, JSON.stringify(product.payload));
    testProductId = product.payload.productId;

    const ownerOverview = await api(origin, '/api/owner/overview', { cookie: ownerCookie });
    const testListing = ownerOverview.payload.listings.find((item) => Number(item.product_id) === Number(testProductId));
    assert.ok(testListing, 'Shop owner should see the new product listing.');
    const priceChange = await api(origin, `/api/owner/listings/${testListing.listing_id}`, {
      cookie: ownerCookie, method: 'PATCH', body: { price: 9.76, isAvailable: true }
    });
    assert.equal(priceChange.status, 200, JSON.stringify(priceChange.payload));

    const storeChange = await api(origin, '/api/owner/store', {
      cookie: ownerCookie, method: 'PATCH', body: {
        storeName: `LP Store Updated ${token.slice(0, 8)}`, locality, address: 'Updated local test address', phone: '5550199'
      }
    });
    assert.equal(storeChange.status, 200, JSON.stringify(storeChange.payload));

    const comparison = await api(origin, `/api/products?query=${encodeURIComponent(productName)}&locality=${encodeURIComponent(locality)}`);
    assert.equal(comparison.status, 200, JSON.stringify(comparison.payload));
    assert.equal(comparison.payload.results.length, 1);
    assert.equal(Number(comparison.payload.results[0].price), 9.76);
    assert.equal(comparison.payload.results[0].locality, locality);

    await stopServer(server);
    server = startServer(port);
    const restartedHealth = await waitForServer(origin, server);
    assert.equal(restartedHealth.database, 'mysql');
    const customerAfterRestart = await login(origin, customerEmail, password);
    const ownerAfterRestart = await login(origin, ownerEmail, password);
    const adminAfterRestart = await login(origin, 'admin@localprice.test', 'demo123');
    const comparisonAfterRestart = await api(origin, `/api/products?query=${encodeURIComponent(productName)}&locality=${encodeURIComponent(locality)}`);
    assert.equal(comparisonAfterRestart.status, 200);
    assert.equal(comparisonAfterRestart.payload.results.length, 1);
    assert.equal(Number(comparisonAfterRestart.payload.results[0].price), 9.76);
    const ownerAfter = await api(origin, '/api/owner/overview', { cookie: ownerAfterRestart });
    assert.equal(ownerAfter.payload.store.locality, locality);
    assert.equal(ownerAfter.payload.listings.some((item) => Number(item.product_id) === Number(testProductId)), true);
    const adminAfter = await api(origin, '/api/admin/overview', { cookie: adminAfterRestart });
    assert.equal(adminAfter.payload.stores.some((store) => Number(store.store_id) === Number(testStore.store_id) && store.approval_status === 'approved'), true);
    const customerAfter = await api(origin, '/api/auth/me', { cookie: customerAfterRestart });
    assert.equal(customerAfter.payload.user.email, customerEmail);
    const [[persisted]] = await pool.query('SELECT sp.price, s.locality, s.approval_status FROM Store_Products sp JOIN Stores s ON s.store_id = sp.store_id WHERE sp.product_id = ?', [testProductId]);
    assert.equal(Number(persisted.price), 9.76);
    assert.equal(persisted.locality, locality);
    assert.equal(persisted.approval_status, 'approved');
  } finally {
    await stopServer(server);
    if (testProductId) await pool.query('DELETE FROM Products WHERE product_id = ?', [testProductId]).catch(() => {});
    await pool.query('DELETE FROM Users WHERE email IN (?, ?)', [customerEmail, ownerEmail]).catch(() => {});
    await pool.end();
  }
});
