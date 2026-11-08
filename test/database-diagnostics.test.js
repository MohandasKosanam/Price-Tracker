const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDatabaseStatus, hasDatabaseConfig } = require('../config/database');

test('database configuration requires local MySQL settings without exposing credentials', () => {
  assert.equal(hasDatabaseConfig({}), false);
  assert.equal(hasDatabaseConfig({ DB_HOST: '127.0.0.1', DB_USER: 'root', DB_NAME: 'localprice' }), true);
  const status = getDatabaseStatus();
  assert.equal(status.database, 'mysql');
  assert.notEqual(status.status, 'ok');
  assert.equal(status.DB_PASSWORD, undefined);
  assert.equal(status.SESSION_SECRET, undefined);
  assert.doesNotMatch(JSON.stringify(status), /demo123|root@|\$2b\$/i);
});
