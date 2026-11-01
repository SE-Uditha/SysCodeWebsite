import mysql from 'mysql2/promise';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, open, lstat, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { mysqlConnectionOptions, setupSchema, assertInitialized } from '../src/lib/admin/mysql.mjs';
import { restrictPrivatePath } from '../src/lib/admin/file-permissions.mjs';
import { readEnvironment, writeEnvironmentChanges, hiddenPassword, passwordFromStdin, validStorageKey } from './lib/admin-env.mjs';
import { loadStoreBridge } from './lib/store-bridge.mjs';

const help = `Connect SysCode to MySQL Server 8+ or MariaDB 10.4+ and import existing JSON data.
  node scripts/setup-mysql.mjs [--host 127.0.0.1] [--port 3306] [--database syscode] [--admin-user root]
  node scripts/setup-mysql.mjs --initialize-empty
  node scripts/setup-mysql.mjs --check

Stop the website first. The MySQL administrator password is entered privately.
--password-stdin accepts a password from a secret pipeline (never a command argument).
--initialize-empty permits setup only when the configured target schema is empty.
Setup creates a limited website account and keeps the source JSON files intact.
Use scripts/provision-mysql-qa.mjs separately for a temporary test database.
`;

function options() {
  const values = { host: '127.0.0.1', port: '3306', database: 'syscode', adminUser: 'root' };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--help' || arg === '-h') return null;
    if (['--check', '--password-stdin', '--initialize-empty'].includes(arg)) values[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
    else if (['--host', '--port', '--database', '--admin-user'].includes(arg) && process.argv[i + 1]) values[arg === '--admin-user' ? 'adminUser' : arg.slice(2)] = process.argv[++i];
    else throw new Error('Unknown option. Use --help for database setup instructions.');
  }
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(values.database)) throw new Error('Use a database name containing only letters, digits, and underscores.');
  return values;
}

function connectionOptions(environment, allowRoot = false) {
  const options = mysqlConnectionOptions(environment, { allowRoot });
  return Object.fromEntries(Object.entries(options).filter(([key]) => !['waitForConnections', 'connectionLimit', 'maxIdle', 'idleTimeout', 'queueLimit'].includes(key)));
}

async function privateConfigFile(filename, value) {
  const parent = path.dirname(filename);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  restrictPrivatePath(parent, true);
  const file = await open(filename, 'wx', 0o600);
  try { restrictPrivatePath(filename); await file.writeFile(JSON.stringify(value), 'utf8'); await file.sync(); } finally { await file.close(); }
}

async function createApplicationDatabase(admin, database, user, password, host, initializeEmpty) {
  // Identifiers are validated or generated here; all data values use parameters.
  const [databases] = await admin.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
  if (databases.length) {
    if (!initializeEmpty) throw new Error('The target database already exists. Use --initialize-empty only for an empty schema.');
    const [objects] = await admin.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [database]);
    const expected = new Set(['admin_accounts', 'admin_sessions', 'app_metadata', 'change_requests', 'faqs', 'inquiries', 'login_attempts', 'packages', 'projects', 'staff_accounts', 'storage_locks']);
    if (objects.some(({ TABLE_NAME }) => !expected.has(TABLE_NAME))) throw new Error('The target database contains unrelated tables. Setup never replaces an existing database.');
    for (const { TABLE_NAME } of objects) {
      if (TABLE_NAME === 'app_metadata') {
        const [rows] = await admin.query(`SELECT meta_key,meta_value FROM \`${database}\`.app_metadata`);
        if (rows.length !== 2 || !rows.some((row) => row.meta_key === 'schema_version' && ['2', '3'].includes(row.meta_value)) || !rows.some((row) => row.meta_key === 'initialized' && row.meta_value === '0')) throw new Error('The target database has already been initialized or contains data. Setup stopped.');
      } else if (TABLE_NAME === 'storage_locks') {
        const [rows] = await admin.query(`SELECT lock_name FROM \`${database}\`.storage_locks`);
        const locks = new Set(['accounts', 'approvals', 'content', 'inquiries', 'sessions', 'login']);
        if (rows.length > locks.size || rows.some(({ lock_name }) => !locks.has(lock_name))) throw new Error('The target database has unexpected storage locks. Setup stopped.');
      } else {
        const [[{ count }]] = await admin.query(`SELECT COUNT(*) AS count FROM \`${database}\`.\`${TABLE_NAME}\``);
        if (Number(count) !== 0) throw new Error('The target database contains data. Setup never replaces existing data.');
      }
    }
  } else {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  const [accounts] = await admin.execute('SELECT User FROM mysql.user WHERE User = ? AND Host = ?', [user, host]);
  const appIdentity = `${mysql.escapeId(user)}@${mysql.escapeId(host, true)}`;
  if (!accounts.length) await admin.query(`CREATE USER ${appIdentity} IDENTIFIED BY ?`, [password]);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.* TO ${appIdentity}`);
  await admin.query(`USE \`${database}\``);
  await setupSchema(admin);
}

function migrationAccount(environment) {
  const email = environment.ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = environment.ADMIN_PASSWORD_HASH;
  if ((email || passwordHash) && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^scrypt:32768:8:[13]:[a-f0-9]{32}:[a-f0-9]{128}$/i.test(passwordHash || ''))) throw new Error('Existing administrator credentials are invalid. No data was imported.');
  return { email, passwordHash };
}

async function migrate(admin, bridge, environment, snapshot) {
  const { crypto } = bridge;
  const { content, state } = snapshot;
  const { email, passwordHash } = migrationAccount(environment);
  await admin.beginTransaction();
  try {
    for (const section of ['packages', 'projects', 'faqs']) {
      for (const [index, item] of content[section].entries()) await admin.execute(`INSERT INTO ${section} (id,sort_order,payload) VALUES (?,?,?)`, [section === 'faqs' ? index + 1 : item.id, index, JSON.stringify(item)]);
    }
    for (const inquiry of state.inquiries) await admin.execute('INSERT INTO inquiries (id,created_at,updated_at,payload) VALUES (?,?,?,?)', [inquiry.id, inquiry.createdAt, inquiry.updatedAt, crypto.encryptInquiry(inquiry.id, inquiry)]);
    for (const attempt of state.loginAttempts.filter((item) => item.resetAt > Date.now())) await admin.execute('INSERT INTO login_attempts (attempt_key,count,reset_at) VALUES (?,?,?)', [attempt.key, attempt.count, attempt.resetAt]);
    if (email && passwordHash) await admin.execute("INSERT INTO admin_accounts (singleton_id,username,email,phone,address,postal_code,password_hash,updated_at) VALUES (1,'administrator',?,'','','',?,?)", [email, passwordHash, Date.now()]);
    const fingerprint = createHash('sha256').update(JSON.stringify({ content, ids: state.inquiries.map((item) => item.id) })).digest('hex');
    await admin.execute("INSERT INTO app_metadata (meta_key,meta_value) VALUES ('json_import_fingerprint',?)", [fingerprint]);
    await admin.execute("UPDATE app_metadata SET meta_value='3' WHERE meta_key='schema_version'");
    await admin.execute("UPDATE app_metadata SET meta_value='1' WHERE meta_key='initialized'");
    await admin.commit();
  } catch (error) { await admin.rollback(); throw error; }
  return { packages: content.packages.length, projects: content.projects.length, questions: content.faqs.length, enquiries: state.inquiries.length, adminImported: Boolean(email && passwordHash) };
}

async function verifyImport(connection, bridge, snapshot, environment) {
  await assertInitialized(connection);
  const content = {};
  for (const section of ['packages', 'projects', 'faqs']) {
    const [rows] = await connection.query(`SELECT payload FROM ${section} ORDER BY sort_order`);
    content[section] = rows.map((row) => typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload);
  }
  if (!isDeepStrictEqual(bridge.schemas.validateContent(content), snapshot.content)) throw new Error('Published content verification failed. MySQL was not activated.');
  const [rows] = await connection.query('SELECT id,payload FROM inquiries');
  const expected = new Map(snapshot.state.inquiries.map((inquiry) => [inquiry.id, inquiry]));
  if (rows.length !== expected.size || rows.some((row) => !isDeepStrictEqual(bridge.schemas.inquirySchema.parse(bridge.crypto.decryptInquiry(row.id, row.payload)), expected.get(row.id)))) throw new Error('Enquiry verification failed. MySQL was not activated.');
  const [accounts] = await connection.query('SELECT email,password_hash FROM admin_accounts');
  const account = migrationAccount(environment);
  if (account.email ? accounts.length !== 1 || accounts[0].email !== account.email || accounts[0].password_hash !== account.passwordHash : accounts.length !== 0) throw new Error('Administrator verification failed. MySQL was not activated.');
}

async function main() {
  const args = options();
  if (!args) { process.stdout.write(help); return; }
  const { text, environment } = await readEnvironment();
  if (args.check) {
    const connection = await mysql.createConnection(connectionOptions(environment));
    try {
      await assertInitialized(connection);
      for (const table of ['admin_accounts', 'packages', 'projects', 'faqs', 'inquiries']) {
        const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM ${table}`);
        process.stdout.write(`${table}: ${rows[0].count}\n`);
      }
      process.stdout.write('MySQL connection and schema are ready.\n');
    } finally { await connection.end(); }
    return;
  }
  if (environment.MYSQL_DATABASE && !args.initializeEmpty) throw new Error('MySQL is already configured. Use --check, or --initialize-empty for an empty target schema.');
  if (args.initializeEmpty && environment.MYSQL_DATABASE && (
    environment.MYSQL_DATABASE !== args.database ||
    (environment.MYSQL_HOST || '127.0.0.1') !== args.host ||
    String(environment.MYSQL_PORT || '3306') !== args.port
  )) throw new Error('--initialize-empty must target the same host, port, and database already configured in .env.local.');
  const directory = path.resolve(environment.ADMIN_DATA_DIRECTORY || '.data');
  const privateFile = path.join(directory, 'private-state.json');
  let hasPrivateData = false;
  try { await lstat(privateFile); hasPrivateData = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!validStorageKey(environment.ADMIN_STORAGE_KEY) && (hasPrivateData || environment.ADMIN_STORAGE_KEY)) throw new Error('Restore the existing valid ADMIN_STORAGE_KEY before migrating encrypted data.');
  environment.ADMIN_STORAGE_KEY ||= randomBytes(32).toString('base64url');
  environment.ADMIN_SESSION_SECRET ||= randomBytes(48).toString('base64url');
  if (Buffer.byteLength(environment.ADMIN_SESSION_SECRET) < 32 || environment.ADMIN_SESSION_SECRET.length > 512) throw new Error('ADMIN_SESSION_SECRET is invalid. Correct it before migration.');
  migrationAccount(environment);
  Object.assign(process.env, Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined)));
  // Validate all legacy data before creating anything in MySQL.
  const bridge = await loadStoreBridge();
  const snapshot = {
    content: bridge.legacy.readPublishedContent(bridge.schemas.validateContent, bridge.schemas.defaultContent),
    state: bridge.legacy.readPrivateState((value) => bridge.schemas.privateStateSchema.parse(value), bridge.schemas.defaultPrivateState),
  };
  const rootPassword = args.passwordStdin ? await passwordFromStdin() : await hiddenPassword('MySQL administrator password: ');
  const adminEnv = { ...environment, MYSQL_HOST: args.host, MYSQL_PORT: args.port, MYSQL_DATABASE: args.database, MYSQL_USER: args.adminUser, MYSQL_PASSWORD: rootPassword };
  const optionsForAdmin = connectionOptions(adminEnv, true);
  delete optionsForAdmin.database;
  const admin = await mysql.createConnection(optionsForAdmin);
  try {
    const [version] = await admin.query('SELECT VERSION() AS version');
    const versionString = String(version[0].version);
    const versionParts = versionString.match(/(\d+)\.(\d+)\.(\d+)/);
    const versionNumbers = versionParts?.slice(1).map(Number);
    const mariaDb = /mariadb/i.test(versionString);
    const supportedVersion = versionNumbers && (mariaDb
      ? versionNumbers[0] > 10 || (versionNumbers[0] === 10 && versionNumbers[1] >= 4)
      : versionNumbers[0] >= 8);
    if (!supportedVersion) throw new Error('This setup requires MySQL Server 8+ or MariaDB 10.4+.');
    const local = ['127.0.0.1', 'localhost', '::1'].includes(args.host);
    if (!local) throw new Error('Automatic account provisioning is local only. Provision a limited remote account with verified TLS manually.');
    const recoveryFile = path.join(directory, `mysql-setup-recovery-${args.database}.json`);
    let recovery;
    try {
      const stat = await lstat(recoveryFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16000) throw new Error('Invalid database setup recovery file.');
      recovery = JSON.parse(await readFile(recoveryFile, 'utf8'));
      if (recovery.MYSQL_HOST !== args.host || String(recovery.MYSQL_PORT) !== args.port || recovery.MYSQL_DATABASE !== args.database ||
        !/^syscode_app_[a-f0-9]{8}$/.test(recovery.MYSQL_USER) || typeof recovery.MYSQL_PASSWORD !== 'string' || recovery.MYSQL_PASSWORD.length < 32 ||
        recovery.ADMIN_STORAGE_KEY !== environment.ADMIN_STORAGE_KEY || recovery.ADMIN_SESSION_SECRET !== environment.ADMIN_SESSION_SECRET) {
        throw new Error('Database setup recovery settings do not match this target. Inspect the recovery file before continuing.');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const appUser = recovery?.MYSQL_USER || `syscode_app_${randomBytes(4).toString('hex')}`;
    const appPassword = recovery?.MYSQL_PASSWORD || randomBytes(48).toString('base64url');
    const appEnv = { MYSQL_HOST: args.host, MYSQL_PORT: args.port, MYSQL_DATABASE: args.database, MYSQL_USER: appUser, MYSQL_PASSWORD: appPassword, MYSQL_SSL_MODE: 'disabled' };
    if (!recovery) await privateConfigFile(recoveryFile, { ...appEnv, ADMIN_STORAGE_KEY: environment.ADMIN_STORAGE_KEY, ADMIN_SESSION_SECRET: environment.ADMIN_SESSION_SECRET });
    await createApplicationDatabase(admin, args.database, appUser, appPassword, args.host === 'localhost' ? 'localhost' : args.host, args.initializeEmpty);
    const result = await migrate(admin, bridge, environment, snapshot);
    const app = await mysql.createConnection(connectionOptions({ ...environment, ...appEnv }));
    try { await verifyImport(app, bridge, snapshot, environment); } finally { await app.end(); }
    // Activate MySQL only after import + limited-account connection both succeed.
    await writeEnvironmentChanges(text, { ...appEnv, ADMIN_STORAGE_KEY: environment.ADMIN_STORAGE_KEY, ADMIN_SESSION_SECRET: environment.ADMIN_SESSION_SECRET, ADMIN_EMAIL: null, ADMIN_PASSWORD_HASH: null });
    await unlink(recoveryFile);
    process.stdout.write(`MySQL migration complete: ${JSON.stringify(result)}\nSource JSON files were preserved. Existing sessions were revoked. Restart the website.\n`);
  } finally { await admin.end(); }
}

main().catch((error) => {
  // MySQL errors may include SQL or connection details. Print only safe codes.
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? ` (${error.code})` : '';
  process.stderr.write(`${code ? `MySQL setup failed${code}. Check server access; existing data was not overwritten.` : error.message}\n`);
  process.exitCode = 1;
});
