import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import ts from 'typescript';

// Tests never load .env.local or accept the application's production database.
// Provision a disposable local syscode_qa_* schema and equally named limited user.
export async function readQaConfiguration() {
  const filename = process.env.MYSQL_QA_CONFIG_FILE;
  if (!filename) throw new Error('Set MYSQL_QA_CONFIG_FILE to an isolated MySQL QA configuration.');
  const root = path.resolve('.admin-test-data');
  const resolved = path.resolve(filename);
  if (!resolved.startsWith(root + path.sep)) throw new Error('MySQL QA configuration must be inside .admin-test-data.');
  const info = await fs.lstat(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 16000) throw new Error('Invalid MySQL QA configuration file.');
  const input = JSON.parse(await fs.readFile(resolved, 'utf8'));
  const environment = Object.fromEntries(['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_SSL_MODE'].map(key => [key, String(input[key] ?? '')]));
  if (!['127.0.0.1', 'localhost', '::1'].includes(environment.MYSQL_HOST)) throw new Error('MySQL QA must use a local server.');
  if (!/^syscode_qa_[a-z0-9_]+$/.test(environment.MYSQL_DATABASE) || !/^syscode_qa_[a-z0-9_]+$/.test(environment.MYSQL_USER)) throw new Error('MySQL QA requires a dedicated syscode_qa_* schema and limited user.');
  const port = Number(environment.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !environment.MYSQL_PASSWORD) throw new Error('Invalid isolated MySQL QA connection.');
  environment.MYSQL_PORT = String(port);
  environment.MYSQL_SSL_MODE = environment.MYSQL_SSL_MODE || 'disabled';
  if (environment.MYSQL_SSL_MODE !== 'disabled') throw new Error('Local MySQL QA requires the isolated local connection configuration.');
  const connection = await mysql.createConnection({ host: environment.MYSQL_HOST, port, user: environment.MYSQL_USER, password: environment.MYSQL_PASSWORD, database: environment.MYSQL_DATABASE, charset: 'utf8mb4', multipleStatements: false, connectTimeout: 10000, supportBigNumbers: true });
  try {
    const [[identity]] = await connection.query('SELECT DATABASE() AS database_name, CURRENT_USER() AS account_name');
    assert.equal(identity.database_name, environment.MYSQL_DATABASE, 'QA connection selected the wrong schema.');
    assert.equal(identity.account_name.split('@')[0], environment.MYSQL_USER, 'QA connection selected the wrong account.');
    const [grants] = await connection.query('SHOW GRANTS');
    const grantText = grants.flatMap(Object.values).join('\n');
    assert.equal(/GRANT (?!USAGE)[^\n]* ON \*\.\*/i.test(grantText), false, 'QA user must not have global database privileges.');
  } catch (error) {
    await connection.end();
    throw error;
  }
  return { environment, connection };
}

export async function compileStoreWorker(output) {
  const workspace = process.cwd();
  const code = path.join(output, 'code');
  const workers = new Set();
  await fs.mkdir(output, { recursive: true });
  async function compile(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const sourceFile = path.join(directory, item.name);
      if (item.isDirectory()) { await compile(sourceFile); continue; }
      if (!/\.(ts|mjs)$/.test(sourceFile) || sourceFile.endsWith('.d.ts')) continue;
      const destination = path.join(code, path.relative(path.join(workspace, 'src'), sourceFile).replace(/\.(ts|mjs)$/, '.cjs'));
      let result = ts.transpileModule(await fs.readFile(sourceFile, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        fileName: sourceFile.replace(/\.mjs$/, '.ts'),
      }).outputText;
      result = result.replace(/require\(["']server-only["']\);?/g, 'undefined;');
      result = result.replace(/require\(["'](@\/[^"']+|\.[^"']+)["']\)/g, (match, specifier) => {
        const resolved = specifier.startsWith('@/') ? path.join(code, specifier.slice(2)) : path.resolve(path.dirname(destination), specifier);
        return `require(${JSON.stringify(/\.(mjs|ts)$/.test(resolved) ? resolved.replace(/\.(mjs|ts)$/, '.cjs') : `${resolved}.cjs`)})`;
      });
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, result);
    }
  }
  await compile(path.join(workspace, 'src/lib/admin'));
  await compile(path.join(workspace, 'src/data'));
  for (const name of ['validations', 'project-media']) {
    const result = ts.transpileModule(await fs.readFile(`src/lib/${name}.ts`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    await fs.writeFile(path.join(code, `lib/${name}.cjs`), result);
  }
  const worker = path.join(output, 'worker.cjs');
  await fs.writeFile(worker, `
const store = require(${JSON.stringify(path.join(code, 'lib/admin/store.cjs'))});
const schemas = require(${JSON.stringify(path.join(code, 'lib/admin/schemas.cjs'))});
const { randomBytes } = require('node:crypto');
const task = JSON.parse(process.argv[2]);
const base = {
  fullName: 'Synthetic MySQL Private Enquiry', email: 'mysql-private@example.invalid',
  phoneNumber: '+94770000001', businessName: 'Isolated Security Fixture',
  serviceRequired: 'Business Website', preferredPackage: 'Basic', estimatedBudget: 'Rs. 10,000',
  projectDescription: 'A synthetic private message to verify encrypted MySQL persistence.'
};
async function main() {
  switch (task.action) {
    case 'create': return store.createInquiry({ ...base, ...(task.payload || {}) }, 'not_configured');
    case 'many': {
      const ids = [];
      for (let index = 0; index < task.count; index += 1) ids.push((await store.createInquiry({ ...base, fullName: task.prefix + ' ' + index }, 'not_configured')).id);
      return ids;
    }
    case 'observe': {
      let largest = 0;
      for (let index = 0; index < 100; index += 1) largest = Math.max(largest, (await store.listInquiries(2000)).length);
      return { snapshots: 100, largest };
    }
    case 'list': return store.listInquiries(task.limit);
    case 'update': return store.updateInquiry(task.id, task.changes || { status: 'in_progress', notes: 'Synthetic confidential note, never public content.' });
    case 'email-status': return store.updateInquiryEmailStatus(task.id, task.status);
    case 'session-create': await store.storeAdminSession(task.hash, task.expiresAt); return store.hasAdminSession(task.hash, Date.now());
    case 'session-check': return store.hasAdminSession(task.hash, task.now || Date.now());
    case 'session-delete': await store.deleteAdminSession(task.hash); return store.hasAdminSession(task.hash, Date.now());
    case 'session-many': for (let index = 0; index < task.count; index += 1) await store.storeAdminSession(randomBytes(32).toString('hex'), Date.now()+60000); return true;
    case 'session-stale-account': {
      const account = await store.getAdminAccount();
      account.passwordHash = account.passwordHash.slice(0, -1) + (account.passwordHash.endsWith('a') ? 'b' : 'a');
      await store.storeAdminSession(task.hash, Date.now()+60000, account);
      return true;
    }
    case 'auth-verify': return require(${JSON.stringify(path.join(code, 'lib/admin/auth.cjs'))}).verifyAdminCredentials(task.email, process.env.SYSCODE_QA_ADMIN_PASSWORD);
    case 'auth-session': return require(${JSON.stringify(path.join(code, 'lib/admin/auth.cjs'))}).createAdminSession(task.verified);
    case 'content': return store.getAdminContent();
    case 'content-default': return schemas.defaultContent();
    case 'content-write': return store.updateAdminContent(task.section, task.items);
    case 'staff-content': return store.submitContentChange(task.actor, task.section, task.items, task.baseHash);
    case 'seed': {
      const initial = schemas.defaultContent();
      for (const section of ['packages', 'projects', 'faqs']) await store.updateAdminContent(section, initial[section]);
      return true;
    }
    case 'throttle': return store.consumeStoredLoginAttempt(task.hash, task.now, 15 * 60 * 1000);
    case 'throttle-many': {
      const results=[];
      for(let index=0;index<task.count;index+=1) results.push(await store.consumeStoredLoginAttempt(task.hash,task.now,15*60*1000));
      return results;
    }
    case 'throttle-distinct': {
      const results=[];
      for(let index=0;index<task.count;index+=1) results.push(await store.consumeStoredLoginAttempt(randomBytes(32).toString('hex'),task.now,15*60*1000));
      return results;
    }
    default: throw new Error('Unknown MySQL fixture operation.');
  }
}
main().then(value=>process.stdout.write(JSON.stringify({ok:true,value}),()=>process.exit(0)),error=>process.stdout.write(JSON.stringify({ok:false,error:error.message,status:error.status??null}),()=>process.exit(0)));
`);
  return {
    async run(action, environment, args = {}) {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [worker, JSON.stringify({ action, ...args })], { env: { ...process.env, ...environment }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        workers.add(child);
        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => { child.kill(); reject(new Error('MySQL store worker timed out.')); }, 45000);
        child.stdout.on('data', value => { stdout += value; });
        child.stderr.on('data', value => { stderr += value; });
        child.once('error', error => { clearTimeout(timeout); workers.delete(child); reject(error); });
        child.once('exit', status => {
          workers.delete(child);
          clearTimeout(timeout);
          if (status !== 0) { reject(new Error(`MySQL store worker exited ${status}: ${stderr}`)); return; }
          try { resolve(JSON.parse(stdout)); } catch { reject(new Error('MySQL store worker returned invalid output.')); }
        });
      });
    },
    stop() { for (const child of workers) child.kill(); },
  };
}

export function fixtureEnvironment(configuration) {
  return {
    ...configuration,
    ADMIN_STORAGE_KEY: randomBytes(32).toString('base64url'),
    ADMIN_SESSION_SECRET: randomBytes(48).toString('base64url'),
    SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
  };
}

export function successful(result) {
  assert.equal(result.ok, true, result.error || 'MySQL store operation failed.');
  return result.value;
}

export async function resetQaFixtures(connection, worker, environment, account) {
  const content = worker ? successful(await worker.run('content-default', environment)) : null;
  await connection.beginTransaction();
  try {
    for (const table of ['change_requests', 'staff_accounts', 'admin_sessions', 'login_attempts', 'inquiries', 'packages', 'projects', 'faqs', 'admin_accounts']) await connection.query(`DELETE FROM ${table}`);
    await connection.query("UPDATE app_metadata SET meta_value = '3' WHERE meta_key = 'schema_version'");
    await connection.query("UPDATE app_metadata SET meta_value = '1' WHERE meta_key = 'initialized'");
    if (account) await connection.execute('INSERT INTO admin_accounts (singleton_id,email,password_hash,updated_at) VALUES (1,?,?,?)', [account.email, account.passwordHash, Date.now()]);
    if (content) for (const table of ['packages', 'projects', 'faqs']) for (const [index, item] of content[table].entries()) {
      await connection.execute(`INSERT INTO ${table} (id,sort_order,payload) VALUES (?,?,?)`, ['id' in item ? item.id : index + 1, index, JSON.stringify(item)]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
