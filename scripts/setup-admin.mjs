import { randomBytes, scrypt } from 'node:crypto';
import mysql from 'mysql2/promise';
import { mysqlConnectionOptions, assertInitialized } from '../src/lib/admin/mysql.mjs';
import { readEnvironment, writeEnvironmentChanges, hiddenPassword, passwordFromStdin, validStorageKey } from './lib/admin-env.mjs';

const help = `Create or reset the single administrator in MySQL.
  node scripts/setup-admin.mjs --email you@example.com
  node scripts/setup-admin.mjs --email you@example.com --password-stdin

Run MySQL setup first. Password input is hidden and must contain 16+ characters.
The password hash is saved to MySQL. Previous admin sessions are revoked while
staff sessions and the enquiry encryption key are preserved.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { process.stdout.write(help); return; }
  let email;
  let fromStdin = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--email' && args[index + 1]) email = args[++index].trim().toLowerCase();
    else if (args[index] === '--password-stdin') fromStdin = true;
    else throw new Error('Use --email you@example.com and optionally --password-stdin.');
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide a valid administrator email with --email.');
  const { text, environment } = await readEnvironment();
  if (!validStorageKey(environment.ADMIN_STORAGE_KEY)) throw new Error('Restore the existing ADMIN_STORAGE_KEY. Password setup never replaces the encryption key.');
  if (!environment.ADMIN_SESSION_SECRET || Buffer.byteLength(environment.ADMIN_SESSION_SECRET) < 32) throw new Error('Run database setup first to configure the session secret.');
  const poolOptions = mysqlConnectionOptions(environment);
  const connection = await mysql.createConnection(Object.fromEntries(Object.entries(poolOptions).filter(([key]) => !['waitForConnections', 'connectionLimit', 'maxIdle', 'idleTimeout', 'queueLimit'].includes(key))));
  try {
    await assertInitialized(connection);
    const password = fromStdin ? await passwordFromStdin() : await hiddenPassword('New admin password (at least 16 characters): ');
    if (password.length < 16 || password.length > 1024 || /[\r\n\u0000]/.test(password)) throw new Error('Use a password between 16 and 1,024 characters without line breaks.');
    if (!fromStdin && password !== await hiddenPassword('Confirm password: ')) throw new Error('Passwords did not match. No account was changed.');
    const salt = randomBytes(16);
    const hash = await new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 }, (error, value) => error ? reject(error) : resolve(value)));
    const passwordHash = `scrypt:32768:8:3:${salt.toString('hex')}:${hash.toString('hex')}`;
    await connection.beginTransaction();
    try {
      const [locks] = await connection.execute("SELECT lock_name FROM storage_locks WHERE lock_name='accounts' FOR UPDATE");
      if (locks.length !== 1) throw new Error('Run the staff database upgrade before configuring accounts.');
      const [collisions] = await connection.execute('SELECT id FROM staff_accounts WHERE email = ? FOR UPDATE', [email]);
      if (collisions.length) throw new Error('That email belongs to a staff account. Choose a distinct administrator email.');
      await connection.execute('SELECT singleton_id FROM admin_accounts WHERE singleton_id=1 FOR UPDATE');
      await connection.execute("SELECT lock_name FROM storage_locks WHERE lock_name='sessions' FOR UPDATE");
      await connection.execute('INSERT INTO admin_accounts (singleton_id,email,password_hash,updated_at) VALUES (1,?,?,?) ON DUPLICATE KEY UPDATE email=VALUES(email),password_hash=VALUES(password_hash),updated_at=VALUES(updated_at)', [email, passwordHash, Date.now()]);
      await connection.execute("DELETE FROM admin_sessions WHERE account_role='admin' AND account_id='admin'");
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    // Account credential versions invalidate admin cookies without disrupting staff.
    await writeEnvironmentChanges(text, { ADMIN_EMAIL: null, ADMIN_PASSWORD_HASH: null });
    process.stdout.write('Administrator saved in MySQL. Previous admin sessions revoked. Open /admin.\n');
  } finally { await connection.end(); }
}

main().catch((error) => {
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? ` (${error.code})` : '';
  process.stderr.write(`${code ? `Admin setup failed${code}. Check MySQL connection settings.` : error.message}\n`);
  process.exitCode = 1;
});
