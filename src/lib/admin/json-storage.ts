import 'server-only';

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { restrictPrivatePath } from './file-permissions.mjs';

const contentFile = 'site-content.json';
const privateFile = 'private-state.json';
const lockFile = 'admin-storage.lock';
const recoveryFile = 'admin-storage-recovery.lock';
const maxFileBytes = 32 * 1024 * 1024;
const maxPrivateBytes = 24 * 1024 * 1024;
const waitArray = new Int32Array(new SharedArrayBuffer(4));
type Validate<T> = (value: unknown) => T;
type LockOwner = { version: 1; pid: number; nonce: string; createdAt: number };

function errorCode(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code;
}

function comparable(path: string) {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function inside(parent: string, child: string) {
  const rel = relative(comparable(parent), comparable(child));
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function assertDirectoryPath(directory: string) {
  const project = resolve(/* turbopackIgnore: true */ process.cwd());
  const parts = directory.split(/[\\/]+/).map((part) => part.toLowerCase());
  if (
    inside(directory, project) ||
    parts.some((part) => ['public', '.git', 'node_modules'].includes(part))
  ) throw new Error('ADMIN_DATA_DIRECTORY must be a private data directory.');
  if (inside(project, directory)) {
    const first = relative(project, directory).split(sep)[0].toLowerCase();
    if (['src', 'app', 'scripts', 'docs', 'out', 'build', '.next'].includes(first)) {
      throw new Error('ADMIN_DATA_DIRECTORY cannot be inside application source or build directories.');
    }
  }
  // Inspect each existing ancestor, including junctions on Windows. realpath alone
  // would conceal a symbolic link before checking where the files are written.
  let cursor = directory;
  const ancestors: string[] = [];
  while (true) {
    ancestors.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  for (const ancestor of ancestors.reverse()) {
    try {
      const stat = lstatSync(/* turbopackIgnore: true */ ancestor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('Admin data paths must contain only real directories, without symbolic links.');
      }
      if (comparable(realpathSync.native(/* turbopackIgnore: true */ ancestor)) !== comparable(ancestor)) {
        throw new Error('Admin data paths must not resolve through symbolic links.');
      }
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
  }
}

function dataDirectory(create = false) {
  const directory = resolve(/* turbopackIgnore: true */ process.env.ADMIN_DATA_DIRECTORY || join(process.cwd(), '.data'));
  assertDirectoryPath(directory);
  if (create) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    assertDirectoryPath(directory);
  }
  try { restrictPrivatePath(directory, true); } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  for (const name of ['syscode-admin.sqlite', 'syscode-admin.sqlite-wal', 'syscode-admin.sqlite-shm', 'syscode-admin.sqlite-journal']) {
    try {
      lstatSync(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ directory, name));
      throw new Error('Legacy SQLite data exists. Migrate it explicitly before using JSON storage.');
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
  }
  return directory;
}

function masterKey() {
  const value = process.env.ADMIN_STORAGE_KEY;
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error('ADMIN_STORAGE_KEY must be a canonical base64url-encoded 32-byte key. Run admin setup.');
  }
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== value) {
    throw new Error('ADMIN_STORAGE_KEY must be a canonical base64url-encoded 32-byte key.');
  }
  return key;
}

export function isStorageKeyConfigured() {
  try { masterKey(); return true; } catch { return false; }
}

function regularFile(path: string) {
  try {
    const stat = lstatSync(/* turbopackIgnore: true */ path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error(`Admin storage requires a regular, unlinked file: ${basename(path)}.`);
    }
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
      throw new Error('Admin storage files must belong to the application user.');
    }
    return stat;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

function readText(path: string, maximum = maxFileBytes) {
  if (!regularFile(path)) return null;
  const ephemeralLock = [lockFile, recoveryFile].includes(basename(path));
  const unsafeFile = () => new Error(`Admin storage file is unsafe or exceeds its size limit (${basename(path)}).`);
  // Locks and new temporary files inherit the already-protected directory ACL.
  // Existing committed data is restricted explicitly in case it was restored.
  // Permission repair can take time on Windows: compare identities only after it.
  if ([contentFile, privateFile].includes(basename(path))) restrictPrivatePath(path);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const before = regularFile(path);
    if (!before) {
      if (ephemeralLock) return null;
      throw new Error(`Admin storage file disappeared while reading (${basename(path)}).`);
    }
    let fd: number;
    try {
      fd = openSync(/* turbopackIgnore: true */ path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    } catch (error) {
      // Lock owners may finish between lstat and open. Published data is always
      // atomically replaced, but the same bounded retry safely handles removal.
      if (errorCode(error) === 'ENOENT' && ephemeralLock) continue;
      throw error;
    }
    try {
      const stat = fstatSync(fd);
      if (
        !stat.isFile() || stat.nlink > 1 || stat.size > maximum ||
        (typeof process.getuid === 'function' && stat.uid !== process.getuid())
      ) throw unsafeFile();
      // Windows lstat reports dev=0 while fstat reports the volume serial number.
      // A concurrent atomic replacement may legitimately change the inode here.
      if ((process.platform !== 'win32' && stat.dev !== before.dev) || stat.ino !== before.ino) continue;
      if (stat.nlink !== 1) {
        const current = regularFile(path);
        if (stat.nlink === 0 && current && current.ino !== stat.ino) continue;
        if (stat.nlink === 0 && !current && ephemeralLock) continue;
        throw unsafeFile();
      }
      fchmodSync(fd, 0o600);
      return readFileSync(fd, 'utf8');
    } finally { closeSync(fd); }
  }
  throw new Error('Admin storage changed repeatedly while reading. Retry later.');
}

function syncDirectory(directory: string) {
  if (process.platform === 'win32') return;
  const fd = openSync(directory, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function atomicWrite(directory: string, name: string, text: string) {
  if (Buffer.byteLength(text, 'utf8') > maxFileBytes) throw new Error('Admin storage has reached its file size limit.');
  const target = join(directory, name);
  regularFile(target);
  const temp = join(directory, `.${name}.${process.pid}.${randomBytes(16).toString('hex')}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    fchmodSync(fd, 0o600);
    writeFileSync(fd, text, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    // Same-directory rename publishes the complete file. Never unlink/overwrite
    // the destination as a fallback if the platform refuses an atomic rename.
    regularFile(target);
    renameSync(temp, target);
    syncDirectory(directory);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temp); } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
  }
}

function readOwner(path: string): LockOwner | null {
  const text = readText(path, 1024);
  if (text === null) return null;
  const owner = JSON.parse(text) as Partial<LockOwner>;
  if (
    owner.version !== 1 || !Number.isSafeInteger(owner.pid) || (owner.pid ?? 0) < 1 ||
    typeof owner.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(owner.nonce) ||
    !Number.isSafeInteger(owner.createdAt) || (owner.createdAt ?? 0) < 0 ||
    Object.keys(owner).sort().join(',') !== 'createdAt,nonce,pid,version'
  ) throw new Error('Admin storage lock is invalid; inspect it before recovery.');
  return owner as LockOwner;
}

function createOwner(path: string): LockOwner | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return null;
    throw error;
  }
  const owner: LockOwner = { version: 1, pid: process.pid, nonce: randomBytes(32).toString('base64url'), createdAt: Date.now() };
  try {
    fchmodSync(fd, 0o600);
    writeFileSync(fd, JSON.stringify(owner), 'utf8');
    fsyncSync(fd);
  } finally { closeSync(fd); }
  return owner;
}

function releaseOwner(path: string, owner: LockOwner) {
  const current = readOwner(path);
  if (!current || current.nonce !== owner.nonce || current.pid !== owner.pid) {
    throw new Error('Admin storage lock ownership changed unexpectedly.');
  }
  unlinkSync(path);
}

function ownerIsAlive(owner: LockOwner) {
  try { process.kill(owner.pid, 0); return true; } catch (error) {
    if (errorCode(error) === 'ESRCH') return false;
    // Permission errors and PID reuse must never permit stealing a live lock.
    if (errorCode(error) === 'EPERM') return true;
    throw error;
  }
}

function completeOwner(path: string) {
  try { return readOwner(path); } catch (error) {
    // O_EXCL makes an empty file visible just before its owner record is
    // flushed. Treat incomplete/malformed ownership as busy, never as stale.
    if (error instanceof SyntaxError || (error instanceof Error && error.message.startsWith('Admin storage lock is invalid'))) return null;
    throw error;
  }
}

function withLock<T>(operation: (directory: string) => T): T {
  masterKey(); // Every write requires private storage configuration, including published content.
  const directory = dataDirectory(true);
  const lock = join(directory, lockFile);
  const recovery = join(directory, recoveryFile);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    // Recovery is a second exclusive gate. Acquirers recheck it AFTER creating
    // their lock, preventing another recovery process from deleting a new lock.
    if (!regularFile(recovery)) {
      const owner = createOwner(lock);
      if (owner) {
        if (!regularFile(recovery)) {
          try { return operation(directory); } finally { releaseOwner(lock, owner); }
        }
        releaseOwner(lock, owner);
      } else {
        const stale = completeOwner(lock);
        if (stale && !ownerIsAlive(stale)) {
          const gate = createOwner(recovery);
          if (gate) {
            try {
              const current = completeOwner(lock);
              if (current && !ownerIsAlive(current)) unlinkSync(lock);
            } finally { releaseOwner(recovery, gate); }
          }
        }
      }
    }
    Atomics.wait(waitArray, 0, 0, 25);
  }
  // An incomplete lock or an orphaned recovery gate fails closed. There is no
  // unsafe age-based lock stealing; an operator can inspect/remove it offline.
  throw new Error('Admin storage is busy or requires lock recovery. Retry later.');
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { throw new Error('Admin JSON storage is corrupt. Restore a trusted backup.'); }
}

function privateSubkey() {
  return Buffer.from(hkdfSync('sha256', masterKey(), Buffer.from('syscode-admin-json-v1'), Buffer.from(privateFile), 32));
}

const additionalData = Buffer.from(`syscode-admin:${privateFile}:v1`);

function decrypt(text: string): unknown {
  const envelope = parseJson(text) as Record<string, unknown> | null;
  if (
    !envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
    Object.keys(envelope).sort().join(',') !== 'algorithm,ciphertext,iv,tag,version' ||
    envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm' ||
    typeof envelope.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) ||
    typeof envelope.tag !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(envelope.tag) ||
    typeof envelope.ciphertext !== 'string' || !/^[A-Za-z0-9_-]+$/.test(envelope.ciphertext)
  ) throw new Error('Encrypted admin storage has an invalid envelope.');
  const iv = Buffer.from(envelope.iv, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64url');
  if (
    iv.toString('base64url') !== envelope.iv || tag.toString('base64url') !== envelope.tag ||
    ciphertext.toString('base64url') !== envelope.ciphertext || ciphertext.length > maxPrivateBytes
  ) throw new Error('Encrypted admin storage has invalid encoded data.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', privateSubkey(), iv);
    decipher.setAAD(additionalData);
    decipher.setAuthTag(tag);
    return parseJson(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('Admin storage authentication failed. Check ADMIN_STORAGE_KEY or restore a trusted backup.');
  }
}

function encrypt(value: unknown) {
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (plaintext.length > maxPrivateBytes) throw new Error('Private admin storage has reached its size limit.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', privateSubkey(), iv);
  cipher.setAAD(additionalData);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') });
}

function readContent<T>(directory: string, validate: Validate<T>, defaults: () => T): T {
  const text = readText(join(directory, contentFile), 1024 * 1024);
  if (text === null) return defaults();
  const value = parseJson(text) as { version?: unknown; content?: unknown } | null;
  if (!value || typeof value !== 'object' || value.version !== 1 || Object.keys(value).sort().join(',') !== 'content,version') {
    throw new Error('Published admin content has an invalid format.');
  }
  return validate(value.content);
}

function readPrivate<T>(directory: string, validate: Validate<T>, defaults: () => T): T {
  masterKey();
  const text = readText(join(directory, privateFile));
  return text === null ? defaults() : validate(decrypt(text));
}

export function readPublishedContent<T>(validate: Validate<T>, defaults: () => T): T {
  // No directory/file creation and no encryption key needed for public rendering.
  return readContent(dataDirectory(), validate, defaults);
}

export function updatePublishedContent<T>(validate: Validate<T>, defaults: () => T, update: (current: T) => T): T {
  return withLock((directory) => {
    const next = validate(update(readContent(directory, validate, defaults)));
    const text = JSON.stringify({ version: 1, content: next });
    if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('Published admin content exceeds its size limit.');
    atomicWrite(directory, contentFile, text);
    return next;
  });
}

export function readPrivateState<T>(validate: Validate<T>, defaults: () => T): T {
  return readPrivate(dataDirectory(), validate, defaults);
}

export function updatePrivateState<T>(validate: Validate<T>, defaults: () => T, update: (current: T) => T): T {
  return withLock((directory) => {
    const current = readPrivate(directory, validate, defaults);
    const proposed = update(current);
    if (Object.is(proposed, current)) return current;
    const next = validate(proposed);
    atomicWrite(directory, privateFile, encrypt(next));
    return next;
  });
}
