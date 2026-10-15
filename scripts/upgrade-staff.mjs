import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { readEnvironment, hiddenPassword, passwordFromStdin } from './lib/admin-env.mjs';
import { mysqlConnectionOptions, upgradeSchema, assertInitialized } from '../src/lib/admin/mysql.mjs';

// Additive schema upgrade. Existing credentials, content, and enquiries stay intact.
async function checkpoint(connection) {
  const snapshot = {};
  for (const table of ['admin_accounts', 'packages', 'projects', 'faqs', 'inquiries']) {
    const [rows] = await connection.query(`SELECT * FROM ${table} ORDER BY ${table === 'admin_accounts' ? 'singleton_id' : 'id'}`);
    snapshot[table] = { count: rows.length, digest: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  return snapshot;
}

async function main() {
  if (process.argv.slice(2).some((arg) => !['--password-stdin', '--check'].includes(arg))) throw new Error('Use --password-stdin or --check only.');
  const { environment } = await readEnvironment();
  if (process.argv.includes('--check')) {
    const options = mysqlConnectionOptions(environment);
    const connection = await mysql.createConnection(Object.fromEntries(Object.entries(options).filter(([key]) => !['waitForConnections', 'connectionLimit', 'maxIdle', 'idleTimeout', 'queueLimit'].includes(key))));
    try {
      await assertInitialized(connection);
      const [[staff]] = await connection.query('SELECT COUNT(*) AS count FROM staff_accounts');
      const [[requests]] = await connection.query('SELECT COUNT(*) AS count FROM change_requests');
      process.stdout.write(`Staff schema ready. Staff accounts: ${staff.count}; change requests: ${requests.count}.\n`);
    } finally { await connection.end(); }
    return;
  }
  const rootPassword = process.argv.includes('--password-stdin') ? await passwordFromStdin() : await hiddenPassword('MySQL administrator password: ');
  const options = mysqlConnectionOptions({ ...environment, MYSQL_USER: 'root', MYSQL_PASSWORD: rootPassword }, { allowRoot: true });
  const connection = await mysql.createConnection(Object.fromEntries(Object.entries(options).filter(([key]) => !['waitForConnections', 'connectionLimit', 'maxIdle', 'idleTimeout', 'queueLimit'].includes(key))));
  try {
    const before = await checkpoint(connection);
    await upgradeSchema(connection);
    await assertInitialized(connection);
    const after = await checkpoint(connection);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Existing data changed during schema upgrade. Inspect concurrent changes before proceeding.');
    process.stdout.write('Staff accounts and approval schema enabled. Existing admin login, content, and enquiries verified unchanged.\n');
  } finally { await connection.end(); }
}

main().catch((error) => {
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : '';
  process.stderr.write(`${code ? `Staff database upgrade failed (${code}). Existing records were not overwritten.` : error.message}\n`);
  process.exitCode = 1;
});
