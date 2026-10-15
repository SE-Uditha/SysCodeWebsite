import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { restrictPrivatePath } from '../src/lib/admin/file-permissions.mjs';
import { compileStoreWorker, fixtureEnvironment, readQaConfiguration, resetQaFixtures, successful } from './lib/mysql-qa.mjs';

// Requires a disposable local schema and limited QA account. Credentials are
// supplied through an ignored private file, never command arguments or output.
const output = path.resolve('.next/mysql-storage-tests');
const checks = [];
let configuration;
let worker;
let failure;
async function check(name, operation) {
  try {
    await operation();
    checks.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, pass: false });
    throw new Error(name, { cause: error });
  }
}
try {
  configuration = await readQaConfiguration();
  const { connection } = configuration;
  const environment = fixtureEnvironment(configuration.environment);
  environment.SYSCODE_QA_ADMIN_PASSWORD = randomBytes(24).toString('base64url');
  const accountSalt = randomBytes(16);
  const accountHash = scryptSync(environment.SYSCODE_QA_ADMIN_PASSWORD, accountSalt, 64, { N: 32768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 });
  const account = { email: 'mysql-storage-qa@example.invalid', passwordHash: `scrypt:32768:8:3:${accountSalt.toString('hex')}:${accountHash.toString('hex')}` };
  worker = await compileStoreWorker(output);
  const run = (action, args, overrides = {}) => worker.run(action, { ...environment, ...overrides }, args);
  await resetQaFixtures(connection, worker, environment, account);
  let inquiry;

  await check('QA uses a dedicated local schema and account without global privileges', async () => {
    const [[identity]] = await connection.query('SELECT DATABASE() AS schema_name, CURRENT_USER() AS account_name');
    assert.match(identity.schema_name, /^syscode_qa_/);
    assert.match(identity.account_name, /^syscode_qa_/);
  });
  await check('Missing or malformed encryption keys cannot create enquiries', async () => {
    for (const candidate of ['', 'bad', randomBytes(31).toString('base64url'), `${environment.ADMIN_STORAGE_KEY}=`]) assert.equal((await run('create', {}, { ADMIN_STORAGE_KEY: candidate })).ok, false);
    const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM inquiries');
    assert.equal(count.total, 0);
  });
  await check('Enquiries and private notes persist across fresh Node processes', async () => {
    inquiry = successful(await run('create'));
    const updated = successful(await run('update', { id: inquiry.id }));
    assert.equal(updated.status, 'in_progress');
    const saved = successful(await run('list')).find(item => item.id === inquiry.id);
    assert.equal(saved.notes, 'Synthetic confidential note, never public content.');
    assert.equal(saved.fullName, inquiry.fullName);
    assert.equal(successful(await run('email-status', { id: inquiry.id, status: 'sent' })), 1);
    assert.equal(successful(await run('list'))[0].emailStatus, 'sent');
  });
  await check('MySQL enquiry payloads use authenticated encryption without plaintext personal data', async () => {
    const [[row]] = await connection.execute('SELECT payload FROM inquiries WHERE id = ?', [inquiry.id]);
    const envelope = JSON.parse(row.payload);
    assert.equal(envelope.algorithm, 'aes-256-gcm');
    assert.equal(Buffer.from(envelope.iv, 'base64url').length, 12);
    assert.equal(Buffer.from(envelope.tag, 'base64url').length, 16);
    for (const value of [inquiry.fullName, inquiry.email, inquiry.projectDescription, 'Synthetic confidential note']) assert.equal(row.payload.includes(value), false);
    assert.ok(envelope.ciphertext);
  });
  await check('Wrong or missing keys fail closed without modifying encrypted records', async () => {
    const [[before]] = await connection.execute('SELECT payload FROM inquiries WHERE id = ?', [inquiry.id]);
    for (const key of ['', randomBytes(32).toString('base64url')]) assert.equal((await run('list', {}, { ADMIN_STORAGE_KEY: key })).ok, false);
    const [[after]] = await connection.execute('SELECT payload FROM inquiries WHERE id = ?', [inquiry.id]);
    assert.equal(after.payload, before.payload);
  });
  await check('Tampered ciphertext is rejected without resetting or overwriting records', async () => {
    const [[row]] = await connection.execute('SELECT payload FROM inquiries WHERE id = ?', [inquiry.id]);
    const envelope = JSON.parse(row.payload);
    envelope.ciphertext = (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1);
    const tampered = JSON.stringify(envelope);
    try {
      await connection.execute('UPDATE inquiries SET payload = ? WHERE id = ?', [tampered, inquiry.id]);
      assert.equal((await run('list')).ok, false);
      assert.equal((await run('update', { id: inquiry.id })).ok, false);
      const [[saved]] = await connection.execute('SELECT payload FROM inquiries WHERE id = ?', [inquiry.id]);
      assert.equal(saved.payload, tampered);
    } finally { await connection.execute('UPDATE inquiries SET payload = ? WHERE id = ?', [row.payload, inquiry.id]); }
  });
  await check('Encrypted payloads cannot be moved between enquiry IDs', async () => {
    const second = successful(await run('create', { payload: { fullName: 'Second Encrypted Enquiry' } }));
    const [rows] = await connection.execute('SELECT id,payload FROM inquiries WHERE id IN (?,?)', [inquiry.id, second.id]);
    const first = rows.find(row => row.id === inquiry.id);
    const other = rows.find(row => row.id === second.id);
    try {
      await connection.execute('UPDATE inquiries SET payload = ? WHERE id = ?', [first.payload, second.id]);
      assert.equal((await run('list')).ok, false);
    } finally { await connection.execute('UPDATE inquiries SET payload = ? WHERE id = ?', [other.payload, second.id]); }
  });
  await check('SQL-looking user text is stored as data and cannot alter tables', async () => {
    const text = "Robert'); DROP TABLE inquiries; --";
    const created = successful(await run('create', { payload: { fullName: text, projectDescription: `Synthetic message containing SQL-like text: ${text}` } }));
    const saved = successful(await run('list')).find(item => item.id === created.id);
    assert.equal(saved.fullName, text);
    const [[table]] = await connection.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'inquiries'");
    assert.equal(table.total, 1);
  });
  await check('Validation rejects oversized and unknown enquiry mutations', async () => {
    const before = successful(await run('list')).find(item => item.id === inquiry.id);
    assert.equal((await run('create', { payload: { fullName: 'x'.repeat(201) } })).ok, false);
    assert.equal((await run('update', { id: inquiry.id, changes: { status: 'not-a-status' } })).ok, false);
    assert.equal((await run('update', { id: inquiry.id, changes: { notes: 'x'.repeat(10001) } })).ok, false);
    assert.deepEqual(successful(await run('list')).find(item => item.id === inquiry.id), before);
    assert.equal(successful(await run('update', { id: 'not-found' })), null);
  });
  await check('Published content is stored in normalized tables and persists across processes', async () => {
    const content = successful(await run('content'));
    assert.equal(content.packages.length, 3);
    content.faqs[0] = { question: 'Can MySQL publish this synthetic question?', answer: 'Yes, this published answer survives a fresh server process.' };
    successful(await run('content-write', { section: 'faqs', items: content.faqs }));
    assert.deepEqual(successful(await run('content')).faqs, content.faqs);
    for (const table of ['packages', 'projects', 'faqs']) {
      const [[count]] = await connection.query(`SELECT COUNT(*) AS total FROM ${table}`);
      assert.equal(count.total, content[table].length);
    }
    assert.equal(JSON.stringify(content).includes(inquiry.email), false);
  });
  await check('Rejected content edits leave every previously published record intact', async () => {
    const before = successful(await run('content'));
    const invalid = structuredClone(before.projects);
    invalid[0].demoUrl = 'javascript:alert(1)';
    assert.equal((await run('content-write', { section: 'projects', items: invalid })).ok, false);
    assert.deepEqual(successful(await run('content')), before);
  });
  await check('Stored session hashes persist, expire, and remain revoked across processes', async () => {
    const hash = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60000;
    assert.equal(successful(await run('session-create', { hash, expiresAt })), true);
    assert.equal(successful(await run('session-check', { hash })), true);
    assert.equal(successful(await run('session-check', { hash, now: expiresAt + 1 })), false);
    const [[row]] = await connection.execute('SELECT token_hash FROM admin_sessions WHERE token_hash = ?', [hash]);
    assert.equal(row.token_hash, hash);
    assert.equal(successful(await run('session-delete', { hash })), false);
    assert.equal(successful(await run('session-check', { hash })), false);
  });
  await check('Session retention remains bounded under concurrent processes', async () => {
    await Promise.all(Array.from({ length: 4 }, () => run('session-many', { count: 8 }).then(successful)));
    const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM admin_sessions');
    assert.equal(count.total, 16);
  });
  await check('A session cannot be persisted with credentials changed before the transaction', async () => {
    const hash = randomBytes(32).toString('hex');
    assert.equal((await run('session-stale-account', { hash })).ok, false);
    const [[count]] = await connection.execute('SELECT COUNT(*) AS total FROM admin_sessions WHERE token_hash = ?', [hash]);
    assert.equal(count.total, 0);
  });
  await check('Password rotation between real verification and session creation invalidates that verification', async () => {
    const verified = successful(await run('auth-verify', { email: account.email }));
    assert.equal(verified.email, account.email);
    const [[before]] = await connection.query('SELECT COUNT(*) AS total FROM admin_sessions');
    try {
      const changed = account.passwordHash.slice(0, -1) + (account.passwordHash.endsWith('a') ? 'b' : 'a');
      await connection.execute('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE singleton_id = 1', [changed, Date.now()]);
      assert.equal((await run('auth-session', { verified })).ok, false);
      const [[after]] = await connection.query('SELECT COUNT(*) AS total FROM admin_sessions');
      assert.equal(after.total, before.total);
    } finally { await connection.execute('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE singleton_id = 1', [account.passwordHash, Date.now()]); }
  });
  await check('Concurrent login attempts share the durable per-account throttle', async () => {
    await connection.query('DELETE FROM login_attempts');
    const hash = randomBytes(32).toString('hex');
    const now = Date.now();
    const results = (await Promise.all(Array.from({ length: 4 }, () => run('throttle-many', { count: 5, hash, now }).then(successful)))).flat();
    assert.equal(results.filter(value => value === 0).length, 6);
    assert.equal(results.filter(value => value > 0).length, 14);
    assert.ok(successful(await run('throttle', { hash, now })) > 0);
    assert.equal(successful(await run('throttle', { hash, now: now + 15 * 60 * 1000 + 1 })), 0);
  });
  await check('Distinct login candidates cannot bypass the shared global throttle', async () => {
    await connection.query('DELETE FROM login_attempts');
    const now = Date.now();
    const results = (await Promise.all(Array.from({ length: 4 }, () => run('throttle-distinct', { count: 10, now }).then(successful)))).flat();
    assert.equal(results.filter(value => value === 0).length, 30);
    assert.equal(results.filter(value => value > 0).length, 10);
    const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM login_attempts');
    assert.equal(count.total, 31);
  });
  await check('Concurrent processes preserve every successful enquiry without lost writes', async () => {
    const before = successful(await run('list')).map(item => item.id);
    const pending = Array.from({ length: 4 }, (_, index) => run('many', { count: 12, prefix: `MySQL concurrent writer ${index}` }).then(successful));
    const observer = run('observe').then(successful);
    const ids = (await Promise.all(pending)).flat();
    assert.equal(new Set(ids).size, 48);
    const after = successful(await run('list', { limit: 2000 }));
    assert.equal(after.length, before.length + 48);
    for (const id of [...before, ...ids]) assert.ok(after.some(item => item.id === id));
    assert.equal((await observer).snapshots, 100);
  });
  await check('Concurrent changes to different content sections preserve both edits', async () => {
    const content = successful(await run('content'));
    content.packages[0].description = 'Synthetic simultaneous package update.';
    content.faqs[0].answer = 'Synthetic simultaneous FAQ update.';
    await Promise.all(['packages', 'faqs'].map(section => run('content-write', { section, items: content[section] }).then(successful)));
    const saved = successful(await run('content'));
    assert.equal(saved.packages[0].description, content.packages[0].description);
    assert.equal(saved.faqs[0].answer, content.faqs[0].answer);
  });
  await check('Incomplete database setup fails closed without resetting records', async () => {
    const [[before]] = await connection.query('SELECT COUNT(*) AS total FROM inquiries');
    try {
      await connection.query("UPDATE app_metadata SET meta_value = '0' WHERE meta_key = 'initialized'");
      assert.equal((await run('list')).ok, false);
      assert.equal((await run('create')).ok, false);
      const [[after]] = await connection.query('SELECT COUNT(*) AS total FROM inquiries');
      assert.equal(after.total, before.total);
    } finally { await connection.query("UPDATE app_metadata SET meta_value = '1' WHERE meta_key = 'initialized'"); }
  });
  await check('The password setup CLI writes only a hash to MySQL and preserves encryption settings', async () => {
    const fixture = path.join(output, 'password-setup-fixture');
    for (const relative of ['scripts/setup-admin.mjs', 'scripts/lib/admin-env.mjs', 'src/lib/admin/mysql.mjs', 'src/lib/admin/file-permissions.mjs']) {
      const target = path.join(fixture, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(relative, target);
    }
    const settings = { ...configuration.environment, ADMIN_STORAGE_KEY: environment.ADMIN_STORAGE_KEY, ADMIN_SESSION_SECRET: environment.ADMIN_SESSION_SECRET, SMTP_HOST: 'preserved-mail.example.invalid', ADMIN_EMAIL: 'obsolete@example.invalid', ADMIN_PASSWORD_HASH: account.passwordHash };
    const filename = path.join(fixture, '.env.local');
    const file = await fs.open(filename, 'wx', 0o600);
    try {
      restrictPrivatePath(filename);
      await file.writeFile(Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n');
    } finally { await file.close(); }
    const newPassword = randomBytes(24).toString('base64url');
    const resetEmail = 'reset-cli-qa@example.invalid';
    const priorSession = randomBytes(32).toString('hex');
    await connection.execute('INSERT INTO admin_sessions (token_hash,expires_at,created_at) VALUES (?,?,?)', [priorSession, Date.now() + 60000, Date.now()]);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(fixture, 'scripts/setup-admin.mjs'), '--email', resetEmail, '--password-stdin'], { cwd: fixture, env: { ...process.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (value) => { stdout += value; });
      child.stderr.on('data', (value) => { stderr += value; });
      child.once('error', reject);
      child.once('exit', (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(newPassword + '\n');
    });
    assert.equal(result.status, 0, 'The isolated setup CLI must finish successfully.');
    assert.equal((result.stdout + result.stderr).includes(newPassword), false);
    const [[saved]] = await connection.query('SELECT email,password_hash FROM admin_accounts WHERE singleton_id=1');
    assert.equal(saved.email, resetEmail);
    const [, , , parallelism, salt, hash] = saved.password_hash.split(':');
    assert.equal(parallelism, '3');
    assert.equal(scryptSync(newPassword, Buffer.from(salt, 'hex'), 64, { N: 32768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 }).toString('hex'), hash);
    const updatedEnvironment = await fs.readFile(filename, 'utf8');
    assert.equal(updatedEnvironment.includes(newPassword), false);
    assert.equal(updatedEnvironment.includes('ADMIN_PASSWORD_HASH='), false);
    assert.equal(updatedEnvironment.includes('ADMIN_EMAIL='), false);
    assert.equal(updatedEnvironment.includes(environment.ADMIN_STORAGE_KEY), true);
    assert.equal(updatedEnvironment.includes('preserved-mail.example.invalid'), true);
    const [[sessions]] = await connection.query('SELECT COUNT(*) AS total FROM admin_sessions');
    assert.equal(sessions.total, 0);
  });
  await check('An unavailable MySQL server cannot silently fall back to local JSON', async () => {
    const ignored = path.join(output, 'forbidden-fallback');
    assert.equal((await run('create', {}, { MYSQL_PORT: '1', ADMIN_DATA_DIRECTORY: ignored })).ok, false);
    await assert.rejects(fs.access(ignored));
  });
} catch (error) {
  failure = error.stack || String(error);
  if (error.cause) failure += `\nCaused by: ${error.cause.stack || error.cause}`;
  console.error(failure);
} finally {
  worker?.stop();
  if (configuration) {
    try { await resetQaFixtures(configuration.connection); } catch (error) { failure ||= error.stack || String(error); }
    await configuration.connection.end();
  }
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, failure: failure || null }, null, 2));
  console.log(`${checks.length} MySQL storage checks; ${checks.filter(item => !item.pass).length} failures.`);
  if (failure) process.exitCode = 1;
}
