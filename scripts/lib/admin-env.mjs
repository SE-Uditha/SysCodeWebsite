import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { emitKeypressEvents } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { restrictPrivatePath } from '../../src/lib/admin/file-permissions.mjs';

export const envPath = fileURLToPath(new URL('../../.env.local', import.meta.url));

export function configuredValue(text, key) {
  const matches = [...text.matchAll(new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=([^\\r\\n]*)`, 'gm'))];
  if (matches.length > 1) throw new Error(`Remove duplicate ${key} entries before setup.`);
  const raw = matches[0]?.[1].trim();
  if (!raw) return undefined;
  if (raw.startsWith('"')) {
    try { return JSON.parse(raw); } catch { throw new Error(`Check ${key} in .env.local.`); }
  }
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'")) throw new Error(`Check ${key} in .env.local.`);
    return raw.slice(1, -1);
  }
  return raw.split('#')[0].trim();
}

export async function readEnvironment() {
  let text = '';
  try {
    const stat = await lstat(envPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('.env.local must be a regular file, not a link.');
    text = await readFile(envPath, 'utf8');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const environment = { ...process.env };
  for (const key of ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_SSL_MODE', 'MYSQL_SSL_CA_FILE', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'ADMIN_SESSION_SECRET', 'ADMIN_STORAGE_KEY', 'ADMIN_DATA_DIRECTORY']) {
    const value = configuredValue(text, key);
    if (value !== undefined && environment[key] !== undefined && environment[key] !== value) {
      throw new Error(`${key} differs between .env.local and the environment. Resolve this before setup.`);
    }
    if (value !== undefined) environment[key] = value;
  }
  return { text, environment };
}

export async function writeEnvironmentChanges(previous, changes) {
  if ((await readEnvironment()).text !== previous) throw new Error('.env.local changed during setup. No settings were overwritten.');
  const eol = previous.includes('\r\n') ? '\r\n' : '\n';
  let text = previous;
  for (const [key, value] of Object.entries(changes)) {
    configuredValue(text, key);
    const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[^\\r\\n]*(?:\\r?\\n|$)`, 'gm');
    if (value === null) { text = text.replace(pattern, ''); continue; }
    const entry = `${key}=${JSON.stringify(String(value))}${eol}`;
    if (pattern.test(text)) text = text.replace(pattern, () => entry);
    else text += `${text && !text.endsWith('\n') ? eol : ''}${entry}`;
  }
  const temporaryPath = `${envPath}.mysql-tmp-${randomBytes(8).toString('hex')}`;
  let temporary;
  try {
    temporary = await open(temporaryPath, 'wx', 0o600);
    restrictPrivatePath(temporaryPath);
    await temporary.writeFile(text, 'utf8');
    await temporary.sync();
    await temporary.close();
    temporary = undefined;
    await rename(temporaryPath, envPath);
  } finally {
    await temporary?.close();
    await unlink(temporaryPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export function validStorageKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) && Buffer.from(value, 'base64url').length === 32 && Buffer.from(value, 'base64url').toString('base64url') === value;
}

export async function passwordFromStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 8192) throw new Error('Password input is too long.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

export async function hiddenPassword(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Use an interactive terminal or --password-stdin.');
  process.stderr.write(prompt);
  emitKeypressEvents(process.stdin);
  const previousRawMode = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise((resolve, reject) => {
      let value = '';
      const finish = (error) => {
        process.stdin.removeListener('keypress', onKey);
        process.stdin.removeListener('end', onEnd);
        process.stderr.write('\n');
        if (error) reject(error); else resolve(value);
      };
      const onEnd = () => finish(new Error('Password input ended.'));
      const onKey = (text, key = {}) => {
        if (key.ctrl && ['c', 'd'].includes(key.name)) finish(new Error('Setup cancelled.'));
        else if (['return', 'enter'].includes(key.name)) finish();
        else if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
        else if (!key.ctrl && !key.meta && text && !/[\u0000-\u001f\u007f]/.test(text) && value.length + text.length <= 4096) value += text;
      };
      process.stdin.on('keypress', onKey);
      process.stdin.once('end', onEnd);
    });
  } finally { process.stdin.setRawMode(Boolean(previousRawMode)); process.stdin.pause(); }
}
