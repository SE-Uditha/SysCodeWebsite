# MySQL setup and operation

The website uses **MySQL Server 8 or newer, or MariaDB 10.4 or newer**, through the `mysql2` driver. phpMyAdmin and MySQL Workbench are separate clients for inspecting and administering the database; the website connects directly to the running database service.

## Local setup and migration

Stop the website, then run these commands from the project root:

```powershell
node scripts/setup-mysql.mjs
node scripts/setup-mysql.mjs --check
```

The default connection is `127.0.0.1:3306`, database `syscode`, with the database administrator `root` used only for provisioning. Enter its password at the hidden terminal prompt. For another local server, use `--host`, `--port`, `--database`, and `--admin-user`. Never put a password in command arguments. `--password-stdin` is available for a private secret pipeline.

If `.env.local` already points to the intended database and that schema exists but is empty, add `--initialize-empty`. Setup verifies the configured host, port, and database match, refuses any non-empty schema, and provisions a separate restricted website account.

Setup validates existing JSON before creating the new database. It creates a generated website account, grants only schema-level `SELECT`, `INSERT`, `UPDATE`, and `DELETE`, creates the tables, and imports:

- Published packages, project demos, and questions, retaining edits and ordering.
- Enquiries, status, private notes, and email delivery status.
- The existing administrator email and password hash, if configured.
- Sign-in limits that have not expired.

Enquiries are re-encrypted for their individual database rows using the **same `ADMIN_STORAGE_KEY`**. Existing sessions are invalidated. Source JSON files are preserved; they are migration backups, not a runtime fallback. `.env.local` is changed only after import and the limited application account have been verified. Legacy `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` entries are removed because those records now live in MySQL.

Setup refuses to overwrite an existing target database or an already configured website connection. If provisioning fails, inspect the safe error and database state before retrying; do not drop a database containing data. Use a fresh database name for a new migration attempt when needed.

After setup, restart the website and open **http://localhost:3000/admin/login**. Your imported website login stays the same. For a first administrator or a password reset, use:

```powershell
node scripts/setup-admin.mjs --username admin --email you@example.com --phone "+94 700 000 000" --address "Your private address" --postal-code 00000
```

Enter and confirm a password of at least 8 characters. The terminal hides the input. The administrator can sign in with the username or email address. Resetting the login updates the administrator account and revokes previous admin sessions while preserving staff sessions, the session secret, and the data encryption key. The MySQL administrator password and the website login password are separate credentials. Staff accounts are created and managed through **Staff** in the dashboard; see [staff accounts and approvals](staff-approvals.md).

For an existing database, run `node scripts/upgrade-staff.mjs` once with the local MySQL administrator password before starting the updated website. This additive migration adds the private administrator profile fields and advances the schema version without replacing existing account or site data.

## Connection settings

The application reads these server-side settings from `.env.local` during local development, or from protected environment variables in production:

| Setting | Purpose |
| --- | --- |
| `MYSQL_HOST` | MySQL/MariaDB hostname; local setup uses `127.0.0.1`. |
| `MYSQL_PORT` | TCP port, normally `3306`. |
| `MYSQL_DATABASE` | Schema, normally `syscode`. |
| `MYSQL_USER` | Generated limited application account, beginning `syscode_app_`. |
| `MYSQL_PASSWORD` | Random application database password generated during setup. |
| `MYSQL_SSL_MODE` | `disabled` is allowed only for loopback; remote hosts require `required`. |
| `MYSQL_SSL_CA_FILE` | Optional path to the trusted CA certificate for remote MySQL TLS. |
| `ADMIN_SESSION_SECRET` | Secret used to sign the expiring admin session cookie. |
| `ADMIN_STORAGE_KEY` | Independent 32-byte base64url key for enquiry encryption. |

The website rejects `root` as its runtime database account. Keep secrets out of source control, screenshots, logs, and browser code. `.env.local` and QA files have restricted file permissions. Restart the Node process after changing connection settings or keys. Do not generate a replacement storage key for existing encrypted enquiries.

## MySQL Workbench

Create a connection using **Standard TCP/IP**:

1. Hostname: `127.0.0.1`; port: `3306`.
2. Username: your MySQL administrator account for database management, or the generated `MYSQL_USER` for limited inspection.
3. Enter that account's password privately in Workbench. The generated website account's password is the local `MYSQL_PASSWORD`; do not share the environment file.
4. Set the default schema to `syscode`, test the connection, then open it.

Tables appear under **Schemas → syscode → Tables**. `admin_accounts` contains the administrator username, email, private phone/address/postal code, and scrypt password hash; `staff_accounts` contains administrator-managed staff identities and password hashes. `packages`, `projects`, and `faqs` contain published content. `inquiries` stores encrypted payloads, so messages cannot be read directly in the grid; use the authenticated dashboard. `change_requests` stores approval history, with proposed values and review notes encrypted. `admin_sessions` contains account-bound token hashes, and `login_attempts` contains throttle state. `storage_locks` and `app_metadata` support transaction and migration checks.

Edit website content through the dashboard so validation and public cache invalidation run. Direct SQL edits can bypass both. Use Workbench's management account for schema changes; keep the website on its limited account. See the official [Workbench connection tutorial](https://dev.mysql.com/doc/workbench/en/wb-getting-started-tutorial-create-connection.html).

## Hosting and backups

Use a persistent MySQL service and HTTPS for the website. Remote connections require verified TLS; provide the server's trusted CA when it is not publicly trusted. The automatic provisioning command supports local servers. For a remote deployment, have the database administrator provision the schema and a restricted application account, deploy the schema, import a verified backup, and set the connection variables and existing encryption key. Restrict MySQL network access to the application host. See [MySQL encrypted connections](https://dev.mysql.com/doc/refman/8.4/en/using-encrypted-connections.html).

Back up MySQL regularly with a database backup account and keep a separate protected backup of `ADMIN_STORAGE_KEY`, session secret, and connection configuration. For example, with the MySQL client tools on `PATH`, this command prompts privately for the database administrator password and writes directly to an existing private backup directory:

```powershell
mysqldump --host=127.0.0.1 --port=3306 --user=root --password --single-transaction --no-tablespaces --set-gtid-purged=OFF --result-file="D:\PrivateBackups\syscode.sql" syscode
```

Use an access-restricted backup location outside the repository; encrypt and retain backups according to your operational needs. A dump contains authentication records and published content even though enquiry payloads remain encrypted. Never commit SQL dumps or upload them publicly. `--single-transaction` gives a consistent InnoDB snapshot; avoid concurrent schema changes during the dump. See [MySQL backup documentation](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html).

Test restoration into a separate private schema with the matching storage key before relying on a backup. After a production restore, reset the administrator login to revoke restored sessions while retaining that key. The legacy JSON files do not include enquiries added after migration.

## Isolated regression checks

Run `node scripts/provision-mysql-qa.mjs` separately to create a temporary local `syscode_qa_*` database and limited account. It prompts privately for the MySQL administrator password and stores the test connection in ignored, protected `.admin-test-data/mysql-qa/config.json`. It does not change the website connection or print passwords. Both QA database names and account names must have that prefix; the scripts reject the production connection and global privileges.

```powershell
npm.cmd run build
node scripts/provision-mysql-qa.mjs
$env:MYSQL_QA_CONFIG_FILE = "$PWD/.admin-test-data/mysql-qa/config.json"
node scripts/test-mysql-storage.mjs
node scripts/check-admin.mjs
node scripts/check-staff.mjs
node scripts/provision-mysql-qa.mjs --cleanup
npm.cmd run build
```

The scripts reset fixture tables in the QA schema. Run them sequentially. Cleanup requires the same MySQL administrator and verifies the test-only schema marker before dropping the temporary schema/account and removing the test configuration. Rebuild after the browser suite to restore published page caches from the website database. The storage suite uses fresh Node processes to exercise persistence, encrypted row identity, tampering, concurrent writes, revocation, and login throttling. The admin suite uses port `3110`, disables SMTP, and tests browser workflows and responsive layouts with synthetic data. Never point the scripts at the website database.

Implementation references: [mysql2 prepared statements](https://sidorares.github.io/node-mysql2/docs/documentation/prepared-statements) and [MySQL InnoDB locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).
