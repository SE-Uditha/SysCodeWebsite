import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';

/** @param {Record<string, string | undefined>} [environment] */
export function isMysqlConfigured(environment = process.env) {
  return ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'].some((key) => environment[key] !== undefined);
}

/**
 * @param {Record<string, string | undefined>} [environment]
 * @param {{allowRoot?: boolean}} [options]
 * @returns {import('mysql2/promise').PoolOptions}
 */
export function mysqlConnectionOptions(environment = process.env, { allowRoot = false } = {}) {
  const host = environment.MYSQL_HOST?.trim() || '127.0.0.1';
  const port = Number(environment.MYSQL_PORT || 3306);
  const database = environment.MYSQL_DATABASE?.trim();
  const user = environment.MYSQL_USER?.trim();
  const password = environment.MYSQL_PASSWORD;
  const allowEmptyRootPassword = allowRoot && user?.toLowerCase() === 'root';
  if (!database || !/^[a-zA-Z0-9_]{1,64}$/.test(database) || !user || user.length > 32 || password === undefined || (!password && !allowEmptyRootPassword) || password.length > 4096 || !Number.isInteger(port) || port < 1 || port > 65535 || /[\s\u0000]/.test(host)) {
    throw new Error('MySQL connection settings are incomplete or invalid. Run database setup.');
  }
  if (!allowRoot && user.toLowerCase() === 'root') throw new Error('Use a dedicated MySQL application account, not root.');
  const local = host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'));
  const sslMode = environment.MYSQL_SSL_MODE || (local ? 'disabled' : 'required');
  if (!['disabled', 'required'].includes(sslMode) || (!local && sslMode !== 'required')) {
    throw new Error('Remote MySQL connections require verified TLS.');
  }
  if (!local && isIP(host)) throw new Error('Use the remote MySQL certificate DNS hostname for verified TLS.');
  const ssl = sslMode === 'required' ? {
    rejectUnauthorized: true,
    verifyIdentity: true,
    minVersion: /** @type {'TLSv1.2'} */ ('TLSv1.2'),
    ...(environment.MYSQL_SSL_CA_FILE ? { ca: readFileSync(/* turbopackIgnore: true */ environment.MYSQL_SSL_CA_FILE, 'utf8') } : {}),
  } : undefined;
  return { host, port, database, user, password, ssl, charset: 'utf8mb4', timezone: 'Z',
    multipleStatements: false, connectTimeout: 5000, waitForConnections: true,
    connectionLimit: 5, maxIdle: 2, idleTimeout: 30000, queueLimit: 32,
    enableKeepAlive: true, supportBigNumbers: true };
}

/** @type {import('mysql2/promise').Pool | undefined} */
let pool;
export function getPool() {
  return pool ??= mysql.createPool(mysqlConnectionOptions());
}

/** @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [connection] */
export async function assertInitialized(connection = getPool()) {
  const [rows] = await connection.execute("SELECT meta_key, meta_value FROM app_metadata WHERE meta_key IN ('schema_version', 'initialized')");
  const values = Object.fromEntries(/** @type {{meta_key:string,meta_value:string}[]} */ (rows).map((row) => [row.meta_key, row.meta_value]));
  if (values.schema_version !== '3' || values.initialized !== '1') throw new Error('MySQL database setup or migration is incomplete. Run the database schema upgrade.');
}

/**
 * @template T
 * @param {(connection: import('mysql2/promise').PoolConnection) => Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function transaction(operation) {
  const connection = await getPool().getConnection();
  try {
    await connection.query('SET SESSION innodb_lock_wait_timeout = 5');
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

/** Called explicitly by setup tools, never from a web request.
 * @param {import('mysql2/promise').Connection} connection
 */
export async function setupSchema(connection) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS app_metadata (meta_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, meta_value VARCHAR(255) NOT NULL) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS storage_locks (lock_name VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS admin_accounts (singleton_id TINYINT UNSIGNED PRIMARY KEY, username VARCHAR(32) NOT NULL DEFAULT 'administrator', email VARCHAR(254) NOT NULL, phone VARCHAR(40) NOT NULL DEFAULT '', address VARCHAR(500) NOT NULL DEFAULT '', postal_code VARCHAR(20) NOT NULL DEFAULT '', password_hash VARCHAR(255) CHARACTER SET ascii NOT NULL, updated_at BIGINT UNSIGNED NOT NULL, UNIQUE KEY admin_username (username), CONSTRAINT one_admin CHECK (singleton_id = 1)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ...['packages', 'projects'].map((table) => `CREATE TABLE IF NOT EXISTS ${table} (id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, sort_order INT UNSIGNED NOT NULL, payload JSON NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`),
    `CREATE TABLE IF NOT EXISTS faqs (id INT UNSIGNED PRIMARY KEY, sort_order INT UNSIGNED NOT NULL, payload JSON NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS inquiries (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, created_at VARCHAR(24) CHARACTER SET ascii NOT NULL, updated_at VARCHAR(24) CHARACTER SET ascii NOT NULL, payload MEDIUMTEXT CHARACTER SET ascii NOT NULL, INDEX inquiries_created (created_at, id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS staff_accounts (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL, password_hash VARCHAR(255) CHARACTER SET ascii NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at BIGINT UNSIGNED NOT NULL, updated_at BIGINT UNSIGNED NOT NULL, deleted_at BIGINT UNSIGNED NULL, UNIQUE KEY staff_email (email)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, expires_at BIGINT UNSIGNED NOT NULL, created_at BIGINT UNSIGNED NOT NULL, account_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'admin', account_role ENUM('admin','staff') NOT NULL DEFAULT 'admin', INDEX session_expiry (expires_at), INDEX sessions_account (account_role, account_id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS change_requests (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, actor_staff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL, actor_email VARCHAR(254) NOT NULL, kind ENUM('content','inquiry') NOT NULL, target VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, base_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, payload MEDIUMTEXT CHARACTER SET ascii NOT NULL, status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending', created_at BIGINT UNSIGNED NOT NULL, reviewed_at BIGINT UNSIGNED NULL, reviewed_by VARCHAR(254) NULL, review_reason TEXT CHARACTER SET ascii NOT NULL, INDEX requests_status (status,created_at,id), INDEX requests_author (actor_staff_id,status,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS login_attempts (attempt_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, count INT UNSIGNED NOT NULL, reset_at BIGINT UNSIGNED NOT NULL, INDEX attempt_expiry (reset_at)) ENGINE=InnoDB`,
    "INSERT IGNORE INTO storage_locks (lock_name) VALUES ('accounts'), ('approvals'), ('content'), ('inquiries'), ('sessions'), ('login')",
    "INSERT IGNORE INTO app_metadata (meta_key,meta_value) VALUES ('schema_version','3'),('initialized','0')",
  ];
  for (const statement of statements) await connection.query(statement);
  const [adminColumns] = await connection.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_accounts'");
  const adminNames = new Set(/** @type {{COLUMN_NAME:string}[]} */ (adminColumns).map((column) => column.COLUMN_NAME));
  if (!adminNames.has('username')) await connection.query("ALTER TABLE admin_accounts ADD COLUMN username VARCHAR(32) NOT NULL DEFAULT 'administrator'");
  if (!adminNames.has('phone')) await connection.query("ALTER TABLE admin_accounts ADD COLUMN phone VARCHAR(40) NOT NULL DEFAULT ''");
  if (!adminNames.has('address')) await connection.query("ALTER TABLE admin_accounts ADD COLUMN address VARCHAR(500) NOT NULL DEFAULT ''");
  if (!adminNames.has('postal_code')) await connection.query("ALTER TABLE admin_accounts ADD COLUMN postal_code VARCHAR(20) NOT NULL DEFAULT ''");
  const [adminIndexes] = await connection.execute("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_accounts' AND INDEX_NAME = 'admin_username'");
  if (!adminIndexes.length) await connection.query('ALTER TABLE admin_accounts ADD UNIQUE INDEX admin_username (username)');
}

/** Additive, idempotent schema upgrade. The caller supplies a DDL-capable connection.
 * Never called from the website's limited application account.
 * @param {import('mysql2/promise').Connection} connection
 */
export async function upgradeSchema(connection) {
  const [metadata] = await connection.execute("SELECT meta_key,meta_value FROM app_metadata WHERE meta_key IN ('schema_version','initialized')");
  const values = Object.fromEntries(/** @type {{meta_key:string,meta_value:string}[]} */ (metadata).map((row) => [row.meta_key,row.meta_value]));
  if (!['1','2','3'].includes(values.schema_version) || values.initialized !== '1') throw new Error('Only an initialized SysCode version 1, 2, or 3 database can be upgraded.');
  await setupSchema(connection);
  const [columns] = await connection.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_sessions'");
  const names = new Set(/** @type {{COLUMN_NAME:string}[]} */ (columns).map((column) => column.COLUMN_NAME));
  if (!names.has('account_id')) await connection.query("ALTER TABLE admin_sessions ADD COLUMN account_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'admin'");
  if (!names.has('account_role')) await connection.query("ALTER TABLE admin_sessions ADD COLUMN account_role ENUM('admin','staff') NOT NULL DEFAULT 'admin'");
  const [indexes] = await connection.execute("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_sessions' AND INDEX_NAME = 'sessions_account'");
  if (!/** @type {unknown[]} */ (indexes).length) await connection.query('ALTER TABLE admin_sessions ADD INDEX sessions_account (account_role,account_id)');
  const [reviewColumns] = await connection.execute("SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'change_requests' AND COLUMN_NAME = 'review_reason'");
  if (/** @type {{DATA_TYPE:string}[]} */ (reviewColumns)[0]?.DATA_TYPE !== 'text') await connection.query('ALTER TABLE change_requests MODIFY COLUMN review_reason TEXT CHARACTER SET ascii NOT NULL');
  await connection.execute("UPDATE app_metadata SET meta_value='3' WHERE meta_key='schema_version'");
}
