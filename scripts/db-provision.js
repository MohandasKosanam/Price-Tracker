const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

function promptHidden(question) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    return Promise.reject(new Error('Run npm run db:provision in an interactive PowerShell terminal.'));
  }
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    let answer = '';
    output.write(question);
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      output.write('\n');
      if (error) reject(error); else resolve(answer);
    };
    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') { answer = answer.slice(0, -1); return; }
      if (!key.ctrl && !key.meta && character) answer += character;
    };
    input.on('keypress', onKeypress);
  });
}

function isEnvIgnored() {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '.env'], { cwd: root, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function writeEnv(values) {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = current ? current.split(/\r?\n/).filter((line) => !/^\s*(?:export\s+)?SUPABASE_[A-Z0-9_]+\s*=/.test(line)) : [];
  const keys = new Set();
  const escaped = (value) => JSON.stringify(String(value));
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/);
    if (!match || !(match[1] in values)) continue;
    lines[index] = `${match[1]}=${escaped(values[match[1]])}`;
    keys.add(match[1]);
  }
  for (const [key, value] of Object.entries(values)) if (!keys.has(key)) lines.push(`${key}=${escaped(value)}`);
  fs.writeFileSync(envPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, { encoding: 'utf8', flag: 'w' });
}

async function main() {
  if (!isEnvIgnored()) throw new Error('.env is not ignored by Git. Refusing to write database credentials.');
  const existing = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
  const host = process.env.DB_HOST || existing.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || existing.DB_PORT || 3306);
  const user = process.env.DB_USER || existing.DB_USER || 'root';
  const database = process.env.DB_NAME || existing.DB_NAME || 'localprice';
  const password = await promptHidden(`MySQL password for ${user}@${host}:${port} (input hidden; press Enter if blank): `);
  let connection;
  try {
    connection = await mysql.createConnection({ host, port, user, password, connectTimeout: 7000 });
    const [[identity]] = await connection.query('SELECT VERSION() AS version, CURRENT_USER() AS account');
    const sessionSecret = existing.SESSION_SECRET && !/replace-with|change-me|placeholder/i.test(existing.SESSION_SECRET)
      ? existing.SESSION_SECRET
      : require('node:crypto').randomBytes(32).toString('hex');
    writeEnv({
      PORT: existing.PORT || '3000',
      NODE_ENV: existing.NODE_ENV || 'development',
      SESSION_SECRET: sessionSecret,
      SESSION_TTL_HOURS: existing.SESSION_TTL_HOURS || '8',
      DB_HOST: host,
      DB_PORT: String(port),
      DB_USER: user,
      DB_PASSWORD: password,
      DB_NAME: database
    });
    console.log(`MySQL credentials verified (${identity.version}; ${identity.account}). Local settings saved to Git-ignored .env.`);
    console.log(`Database ${database} will be created by npm run db:setup if it does not exist.`);
  } catch (error) {
    console.error(`MySQL configuration stopped: verification failed (${error.code || 'connection_error'}). No files were changed and credentials were not logged.`);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`MySQL configuration stopped: ${error.message}`);
  process.exitCode = 1;
});
