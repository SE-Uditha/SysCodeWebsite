import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { readEnvironment, hiddenPassword, passwordFromStdin } from './lib/admin-env.mjs';
import { mysqlConnectionOptions, setupSchema } from '../src/lib/admin/mysql.mjs';
import { restrictPrivatePath } from '../src/lib/admin/file-permissions.mjs';

// Separate, explicitly approved test provisioning. Never modifies the site DB.
const filename = path.resolve('.admin-test-data/mysql-qa/config.json');
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--cleanup', '--password-stdin'].includes(arg))) throw new Error('Use --cleanup or --password-stdin only.');
  const cleanup = args.includes('--cleanup');
  const { environment } = await readEnvironment();
  if (!['127.0.0.1', 'localhost', '::1'].includes(environment.MYSQL_HOST)) throw new Error('Temporary test provisioning is local only.');
  let configuration;
  if (cleanup) {
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16000) throw new Error('Invalid test configuration.');
    configuration = JSON.parse(await readFile(filename, 'utf8'));
    if (!/^syscode_qa_[a-z0-9_]+$/.test(configuration.MYSQL_DATABASE) || !/^syscode_qa_[a-z0-9_]+$/.test(configuration.MYSQL_USER) || configuration.MYSQL_DATABASE === environment.MYSQL_DATABASE || configuration.MYSQL_HOST !== environment.MYSQL_HOST || configuration.MYSQL_PORT !== environment.MYSQL_PORT) throw new Error('Refusing cleanup outside the isolated test database.');
  } else {
    try { await lstat(filename); throw new Error('Test configuration already exists. Clean it up before provisioning again.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const suffix = randomBytes(5).toString('hex');
    configuration = { MYSQL_HOST: environment.MYSQL_HOST, MYSQL_PORT: environment.MYSQL_PORT, MYSQL_DATABASE: `syscode_qa_${suffix}`, MYSQL_USER: `syscode_qa_${suffix}`, MYSQL_PASSWORD: randomBytes(48).toString('base64url'), MYSQL_SSL_MODE: 'disabled' };
  }
  const rootPassword = args.includes('--password-stdin') ? await passwordFromStdin() : await hiddenPassword('MySQL administrator password: ');
  const options = mysqlConnectionOptions({ ...environment, MYSQL_USER: 'root', MYSQL_PASSWORD: rootPassword }, { allowRoot: true });
  const connectionOptions = Object.fromEntries(Object.entries(options).filter(([key]) => !['database', 'waitForConnections', 'connectionLimit', 'maxIdle', 'idleTimeout', 'queueLimit'].includes(key)));
  const connection = await mysql.createConnection(connectionOptions);
  const host = environment.MYSQL_HOST;
  try {
    if (cleanup) {
      const [schemas] = await connection.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [configuration.MYSQL_DATABASE]);
      if (schemas.length) {
        await connection.query(`USE \`${configuration.MYSQL_DATABASE}\``);
        const [markers] = await connection.execute("SELECT meta_value FROM app_metadata WHERE meta_key='purpose'");
        if (markers[0]?.meta_value !== 'qa') throw new Error('Test database marker is missing. No cleanup performed.');
        await connection.query(`DROP DATABASE \`${configuration.MYSQL_DATABASE}\``);
      }
      await connection.query(`DROP USER IF EXISTS ${mysql.escapeId(configuration.MYSQL_USER)}@${mysql.escapeId(host, true)}`);
      await unlink(filename);
      process.stdout.write('Temporary MySQL test database, account, and private configuration removed.\n');
    } else {
      await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
      restrictPrivatePath(path.dirname(filename), true);
      const file = await open(filename, 'wx', 0o600);
      try { restrictPrivatePath(filename); await file.writeFile(JSON.stringify(configuration)); await file.sync(); } finally { await file.close(); }
      await connection.query(`CREATE DATABASE \`${configuration.MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      const qaIdentity = `${mysql.escapeId(configuration.MYSQL_USER)}@${mysql.escapeId(host, true)}`;
      await connection.query(`CREATE USER ${qaIdentity} IDENTIFIED BY ?`, [configuration.MYSQL_PASSWORD]);
      await connection.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON \`${configuration.MYSQL_DATABASE}\`.* TO ${qaIdentity}`);
      await connection.query(`USE \`${configuration.MYSQL_DATABASE}\``);
      await setupSchema(connection);
      await connection.execute("INSERT INTO app_metadata (meta_key,meta_value) VALUES ('purpose','qa')");
      process.stdout.write('Temporary MySQL test database and limited account ready. Credentials were not printed.\n');
    }
  } finally { await connection.end(); }
}

main().catch((error) => {
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : '';
  process.stderr.write(`${code ? `Test database operation failed (${code}).` : error.message}\n`);
  process.exitCode = 1;
});
