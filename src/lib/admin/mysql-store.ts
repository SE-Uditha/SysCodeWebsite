import 'server-only';

import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { contactFormSchema, type ContactFormValues } from '@/lib/validations';
import { assertInitialized, getPool, isMysqlConfigured, transaction } from './mysql.mjs';
import { decryptInquiry, encryptInquiry, isStorageKeyConfigured } from './private-crypto.mjs';
import {
  adminContentUpdateSchema, defaultContent, inquirySchema, timestampSchema,
  tokenHashSchema, validateContent,
} from './schemas';
import {
  inquiryEmailStatuses, inquiryStatuses,
  type AdminContent, type AdminContentSection, type AdminInquiry,
  type AdminProfile, type InquiryEmailStatus, type InquiryUpdate, type DashboardAccount, type DashboardActor, type DashboardRole,
} from './types';

const credentialSchema = z.object({
  email: z.string().max(254).email().refine((value) => value === value.trim().toLowerCase()),
  passwordHash: z.string().regex(/^scrypt:32768:8:[13]:[0-9a-f]{32}:[0-9a-f]{128}$/i),
}).strict();
const accountSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().max(254).email().refine((value) => value === value.trim().toLowerCase()),
  phone: z.string().max(40),
  address: z.string().max(500),
  postalCode: z.string().max(20),
  passwordHash: z.string().regex(/^scrypt:32768:8:[13]:[0-9a-f]{32}:[0-9a-f]{128}$/i),
}).strict();
type AdminAccount = z.infer<typeof accountSchema>;
type InquiryRow = RowDataPacket & { id: string; created_at: string; updated_at: string; payload: string };

export function isAdminStorageConfigured() {
  return isMysqlConfigured() && isStorageKeyConfigured();
}

export function requirePrivateConfiguration() {
  if (!isAdminStorageConfigured()) throw new Error('MySQL admin storage and ADMIN_STORAGE_KEY must be configured.');
}

export async function acquireGate(connection: PoolConnection, name: 'accounts' | 'approvals' | 'content' | 'inquiries' | 'sessions' | 'login') {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT lock_name FROM storage_locks WHERE lock_name = ? FOR UPDATE', [name],
  );
  if (rows.length !== 1) throw new Error('Admin database is missing a required transaction lock. Run MySQL setup.');
}

export async function readAccount(connection: PoolConnection, forUpdate = false): Promise<AdminAccount | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT username,email,phone,address,postal_code,password_hash FROM admin_accounts WHERE singleton_id = 1${forUpdate ? ' FOR UPDATE' : ''}`,
  );
  if (rows.length === 0) return null;
  return accountSchema.parse({ username: rows[0].username, email: rows[0].email, phone: rows[0].phone, address: rows[0].address, postalCode: rows[0].postal_code, passwordHash: rows[0].password_hash });
}

export async function readDashboardAccount(connection: PoolConnection, id: string, role: DashboardRole, forUpdate = false): Promise<DashboardAccount | null> {
  if (role === 'admin') {
    if (id !== 'admin') return null;
    const account = await readAccount(connection, forUpdate);
    return account ? { ...account, id: 'admin', role: 'admin', name: account.username, active: true } : null;
  }
  if (role !== 'staff' || !z.string().uuid().safeParse(id).success) return null;
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id,name,email,password_hash,active FROM staff_accounts WHERE id = ? AND deleted_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`, [id],
  );
  if (!rows.length) return null;
  const credentials = credentialSchema.parse({ email: rows[0].email, passwordHash: rows[0].password_hash });
  return { ...credentials, id: rows[0].id, role: 'staff', name: z.string().min(1).max(100).parse(rows[0].name), active: Boolean(rows[0].active) };
}

export async function getDashboardAccount(id: string, role: DashboardRole): Promise<DashboardAccount | null> {
  if (!isMysqlConfigured()) return null;
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    return readDashboardAccount(connection, id, role);
  });
}
export const getDashboardAccountByIdentity = getDashboardAccount;

export async function getDashboardAccountByLogin(identifier: string): Promise<DashboardAccount | null> {
  if (!isMysqlConfigured() || !z.string().min(1).max(254).safeParse(identifier).success) return null;
  const normalized = identifier.trim().toLowerCase();
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    const admin = await readDashboardAccount(connection, 'admin', 'admin');
    if (admin && (admin.email === normalized || admin.name.toLowerCase() === normalized)) return admin;
    const [staff] = await connection.execute<RowDataPacket[]>('SELECT id FROM staff_accounts WHERE email = ? AND active = 1 AND deleted_at IS NULL LIMIT 1', [normalized]);
    return staff.length ? readDashboardAccount(connection, staff[0].id, 'staff') : null;
  });
}

export async function getAdminAccount(): Promise<AdminAccount | null> {
  if (!isMysqlConfigured()) return null;
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    return readAccount(connection);
  });
}

export async function getAdminProfile(): Promise<AdminProfile | null> {
  const account = await getAdminAccount();
  if (!account) return null;
  const { username, email, phone, address, postalCode } = account;
  return { username, email, phone, address, postalCode };
}

export async function updateAdminProfile(
  actor: import('./types').ServerDashboardActor,
  profile: Pick<AdminProfile, 'phone' | 'address' | 'postalCode'>,
): Promise<AdminProfile> {
  requirePrivateConfiguration();
  const input = z.object({
    phone: z.string().trim().max(40).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Use a phone number without control characters.'),
    address: z.string().trim().max(500).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'Use an address without control characters.'),
    postalCode: z.string().trim().max(20).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Use a postal code without control characters.'),
  }).strict().parse(profile);
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    await acquireGate(connection, 'accounts');
    const account = await readAccount(connection, true);
    if (!account || actor.id !== 'admin' || actor.role !== 'admin' || account.email !== actor.email) throw new Error('Only the administrator can update the administrator profile.');
    await connection.execute('UPDATE admin_accounts SET phone=?,address=?,postal_code=?,updated_at=? WHERE singleton_id=1', [input.phone,input.address,input.postalCode,Date.now()]);
    return { username: account.username, email: account.email, ...input };
  });
}

export function decodeInquiry(row: InquiryRow): AdminInquiry {
  const inquiry = inquirySchema.parse(decryptInquiry(row.id, row.payload));
  if (inquiry.id !== row.id || inquiry.createdAt !== row.created_at || inquiry.updatedAt !== row.updated_at) {
    throw new Error('Inquiry identity or timestamps do not match the authenticated payload.');
  }
  return inquiry;
}

export async function listInquiries(limit = 1000): Promise<AdminInquiry[]> {
  requirePrivateConfiguration();
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(2000, Math.floor(limit))) : 1000;
  await assertInitialized();
  const [rows] = await getPool().execute<InquiryRow[]>(
    'SELECT id, created_at, updated_at, payload FROM inquiries ORDER BY created_at DESC, id DESC LIMIT ?', [boundedLimit],
  );
  return rows.map(decodeInquiry);
}

export async function createInquiry(
  values: ContactFormValues,
  emailStatus: InquiryEmailStatus = 'pending',
): Promise<AdminInquiry> {
  requirePrivateConfiguration();
  const data = contactFormSchema.parse(values);
  const limits: [keyof ContactFormValues, number][] = [
    ['fullName', 200], ['email', 254], ['phoneNumber', 40], ['businessName', 200],
    ['serviceRequired', 200], ['preferredPackage', 200], ['estimatedBudget', 100],
    ['projectDescription', 10000],
  ];
  if (limits.some(([field, max]) => (data[field]?.length ?? 0) > max)) {
    throw new Error('An inquiry field exceeds its maximum length.');
  }
  if (!inquiryEmailStatuses.includes(emailStatus)) throw new Error('Invalid email status.');
  const now = new Date().toISOString();
  const inquiry = inquirySchema.parse({
    ...data, businessName: data.businessName || '', id: randomUUID(),
    status: 'new', notes: '', emailStatus, createdAt: now, updatedAt: now,
  });
  const encrypted = encryptInquiry(inquiry.id, inquiry);
  await transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    await acquireGate(connection, 'inquiries');
    // A locking read sees the latest committed rows after waiting for the gate,
    // even when the transaction already has a repeatable-read metadata snapshot.
    const [existing] = await connection.execute<RowDataPacket[]>('SELECT id FROM inquiries LIMIT 10000 FOR UPDATE');
    if (existing.length >= 10000) throw new Error('Admin inquiries have reached the storage limit.');
    await connection.execute(
      'INSERT INTO inquiries (id, created_at, updated_at, payload) VALUES (?, ?, ?, ?)',
      [inquiry.id, inquiry.createdAt, inquiry.updatedAt, encrypted],
    );
  });
  return inquiry;
}

async function mutateInquiry(id: string, update: (current: AdminInquiry) => AdminInquiry): Promise<AdminInquiry | null> {
  requirePrivateConfiguration();
  if (!z.string().uuid().safeParse(id).success) return null;
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    const [rows] = await connection.execute<InquiryRow[]>(
      'SELECT id, created_at, updated_at, payload FROM inquiries WHERE id = ? FOR UPDATE', [id],
    );
    if (!rows.length) return null;
    const next = inquirySchema.parse(update(decodeInquiry(rows[0])));
    await connection.execute('UPDATE inquiries SET updated_at = ?, payload = ? WHERE id = ?', [
      next.updatedAt, encryptInquiry(next.id, next), id,
    ]);
    return next;
  });
}

export async function updateInquiry(id: string, changes: InquiryUpdate): Promise<AdminInquiry | null> {
  if (changes.status !== undefined && !inquiryStatuses.includes(changes.status)) throw new Error('Invalid inquiry status.');
  if (changes.notes !== undefined && (typeof changes.notes !== 'string' || changes.notes.length > 10000)) {
    throw new Error('Notes must be 10,000 characters or fewer.');
  }
  return mutateInquiry(id, (current) => ({
    ...current, status: changes.status ?? current.status, notes: changes.notes ?? current.notes,
    updatedAt: new Date().toISOString(),
  }));
}

export async function updateInquiryEmailStatus(id: string, emailStatus: InquiryEmailStatus): Promise<number> {
  if (!inquiryEmailStatuses.includes(emailStatus)) throw new Error('Invalid email status.');
  return (await mutateInquiry(id, (current) => ({ ...current, emailStatus, updatedAt: new Date().toISOString() }))) ? 1 : 0;
}

export async function storeAdminSession(tokenHash: string, expiresAt: number, expectedAccount?: AdminAccount | DashboardAccount): Promise<void> {
  requirePrivateConfiguration();
  tokenHashSchema.parse(tokenHash);
  timestampSchema.parse(expiresAt);
  const now = Date.now();
  if (expiresAt <= now) throw new Error('Admin session must expire in the future.');
  await transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    // Accounts gate first for every identity-sensitive mutation, then session gate.
    await acquireGate(connection, 'accounts');
    const identity = expectedAccount && 'id' in expectedAccount ? expectedAccount : { id: 'admin', role: 'admin' as const };
    const currentAccount = await readDashboardAccount(connection, identity.id, identity.role, true);
    if (!currentAccount || (expectedAccount && (
      currentAccount.email !== expectedAccount.email || currentAccount.passwordHash !== expectedAccount.passwordHash
    )) || !currentAccount.active) throw new Error('Dashboard credentials changed. Sign in again.');
    await acquireGate(connection, 'sessions');
    await connection.execute('DELETE FROM admin_sessions WHERE expires_at <= ? OR token_hash = ?', [now, tokenHash]);
    const [existing] = await connection.execute<RowDataPacket[]>(
      'SELECT token_hash FROM admin_sessions WHERE account_id = ? AND account_role = ? ORDER BY created_at DESC, token_hash DESC FOR UPDATE', [currentAccount.id, currentAccount.role],
    );
    for (const row of existing.slice(15)) {
      await connection.execute('DELETE FROM admin_sessions WHERE token_hash = ?', [row.token_hash]);
    }
    await connection.execute('INSERT INTO admin_sessions (token_hash, expires_at, created_at, account_id, account_role) VALUES (?, ?, ?, ?, ?)', [tokenHash, expiresAt, now, currentAccount.id, currentAccount.role]);
  });
}

export async function hasAdminSession(tokenHash: string, now: number, actor?: DashboardActor): Promise<boolean> {
  if (!tokenHashSchema.safeParse(tokenHash).success || !timestampSchema.safeParse(now).success) return false;
  requirePrivateConfiguration();
  await assertInitialized();
  const [rows] = await getPool().execute<RowDataPacket[]>(
    'SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ? AND account_id = ? AND account_role = ?', [tokenHash, now, actor?.id ?? 'admin', actor?.role ?? 'admin'],
  );
  return rows.length === 1;
}

export async function deleteAdminSession(tokenHash: string): Promise<void> {
  requirePrivateConfiguration();
  tokenHashSchema.parse(tokenHash);
  await assertInitialized();
  await getPool().execute('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]);
}

export async function consumeStoredLoginAttempt(
  candidateHash: string, now: number, windowMs: number,
  onBlocked?: (key: string, resetAt: number) => void,
): Promise<number> {
  requirePrivateConfiguration();
  tokenHashSchema.parse(candidateHash);
  timestampSchema.parse(now);
  if (!Number.isSafeInteger(windowMs) || windowMs < 1000 || windowMs > 60 * 60 * 1000) {
    throw new Error('Invalid sign-in throttle window.');
  }
  timestampSchema.parse(now + windowMs);
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    await acquireGate(connection, 'login');
    await connection.execute('DELETE FROM login_attempts WHERE reset_at <= ?', [now]);
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT attempt_key, count, reset_at FROM login_attempts WHERE attempt_key IN (?, ?) FOR UPDATE', ['global', candidateHash],
    );
    let retryAfter = 0;
    const limits = [{ key: 'global', max: 30 }, { key: candidateHash, max: 6 }];
    for (const limit of limits) {
      const row = rows.find((item) => item.attempt_key === limit.key);
      if (row && Number(row.count) >= limit.max) {
        const resetAt = timestampSchema.parse(Number(row.reset_at));
        onBlocked?.(limit.key, resetAt);
        retryAfter = Math.max(retryAfter, Math.max(1, Math.ceil((resetAt - now) / 1000)));
      }
    }
    if (retryAfter) return retryAfter;
    for (const limit of limits) {
      const current = rows.find((item) => item.attempt_key === limit.key);
      if (current) await connection.execute('UPDATE login_attempts SET count = count + 1 WHERE attempt_key = ?', [limit.key]);
      else await connection.execute('INSERT INTO login_attempts (attempt_key, count, reset_at) VALUES (?, 1, ?)', [limit.key, now + windowMs]);
    }
    return 0;
  });
}

function parsePayload(value: unknown): unknown {
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { throw new Error('Published database content is invalid JSON.'); }
  }
  return value;
}

export async function readContent(connection: PoolConnection, forUpdate = false): Promise<AdminContent> {
  const content: Record<string, unknown[]> = {};
  // Identifiers below are fixed application constants; all supplied values use placeholders.
  for (const table of ['packages', 'projects', 'faqs'] as const) {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT payload FROM ${table} ORDER BY sort_order ASC, id ASC LIMIT 51${forUpdate ? ' FOR UPDATE' : ''}`);
    if (rows.length > 50) throw new Error('Published database content exceeds its record limit.');
    content[table] = rows.map((row) => parsePayload(row.payload));
  }
  if (Buffer.byteLength(JSON.stringify(content), 'utf8') > 1024 * 1024) throw new Error('Published admin content exceeds its size limit.');
  return validateContent(content);
}

export async function getAdminContent(): Promise<AdminContent> {
  if (!isMysqlConfigured()) return defaultContent();
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    return readContent(connection);
  });
}

export async function updateAdminContent(section: AdminContentSection, items: unknown): Promise<AdminContent> {
  requirePrivateConfiguration();
  const changes = adminContentUpdateSchema.parse({ section, items });
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection);
    await acquireGate(connection, 'content');
    const next = validateContent({ ...await readContent(connection, true), [changes.section]: changes.items });
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 1024 * 1024) throw new Error('Published admin content exceeds its size limit.');
    const table = changes.section;
    await connection.execute(`DELETE FROM ${table}`);
    for (const [index, item] of changes.items.entries()) {
      const id = 'id' in item ? item.id : index + 1;
      await connection.execute(`INSERT INTO ${table} (id, sort_order, payload) VALUES (?, ?, ?)`, [id, index, JSON.stringify(item)]);
    }
    return next;
  });
}
