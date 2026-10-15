import 'server-only';

import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import {
  consumeStoredLoginAttempt,
  deleteAdminSession,
  getAdminAccount,
  getDashboardAccount,
  getDashboardAccountByEmail,
  hasAdminSession,
  isAdminStorageConfigured,
  storeAdminSession,
} from './store';
import { accountCredentialVersion } from './credential-version';
import type { DashboardAccount, ServerDashboardActor } from './types';

export const ADMIN_COOKIE_NAME = 'syscode_admin_session';
const sessionLifetimeSeconds = 8 * 60 * 60;
const scryptOptions = { N: 32768, r: 8, maxmem: 128 * 1024 * 1024 };
type AdminConfiguration = { email: string; passwordHash: string; secret: string };
// Strip the internal proof before handing the actor to Client Components.
export type AdminSession = ServerDashboardActor;
export type VerifiedAdminCredentials = ServerDashboardActor;

async function configuration(): Promise<AdminConfiguration | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || secret.length > 512 || !isAdminStorageConfigured()) return null;
  const account = await getAdminAccount();
  if (!account) return null;
  const { email, passwordHash } = account;
  if (
    !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !passwordHash || !/^scrypt:32768:8:[13]:[0-9a-f]{32}:[0-9a-f]{128}$/i.test(passwordHash)
  ) return null;
  return { email, passwordHash, secret };
}

export async function isAdminConfigured() {
  return (await configuration()) !== null;
}

function safeEqual(left: string, right: string) {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

const credentialWork = globalThis as typeof globalThis & { syscodeAdminVerifyingCredentials?: boolean };

export async function verifyAdminCredentials(email: string, password: string): Promise<VerifiedAdminCredentials | null> {
  const config = await configuration();
  if (!config) return null;
  const account = await getDashboardAccountByEmail(email.trim().toLowerCase());
  // Keep expensive password derivations bounded even when requests arrive together.
  if (credentialWork.syscodeAdminVerifyingCredentials) {
    throw new AdminRequestError('Sign-in is busy. Please try again shortly.', 429);
  }
  credentialWork.syscodeAdminVerifyingCredentials = true;
  try {
    // Unknown accounts still perform the same expensive password derivation.
    const [, , , parallelism, salt, expectedHash] = (account?.passwordHash ?? config.passwordHash).split(':');
    const key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, Buffer.from(salt, 'hex'), 64, { ...scryptOptions, p: Number(parallelism) }, (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      });
    });
    // Derive a key even for an incorrect email to keep credential failures uniform.
    const passwordMatches = timingSafeEqual(key, Buffer.from(expectedHash, 'hex'));
    return account && account.active && safeEqual(email.trim().toLowerCase(), account.email) && passwordMatches
      ? { id: account.id, role: account.role, name: account.name, email: account.email, credentialVersion: accountCredentialVersion(account) }
      : null;
  } finally {
    credentialWork.syscodeAdminVerifyingCredentials = false;
  }
}

function credentialVersion(config: Pick<AdminConfiguration, 'email' | 'passwordHash'>) {
  return createHash('sha256').update(`${config.email}\0${config.passwordHash}`).digest('base64url');
}

export async function hashStaffPassword(password: string) {
  if (password.length < 16 || password.length > 1024 || /[\r\n\0]/.test(password)) {
    throw new AdminRequestError('Choose a password between 16 and 1,024 characters, without line breaks.');
  }
  if (credentialWork.syscodeAdminVerifyingCredentials) throw new AdminRequestError('Password setup is busy. Please try again shortly.', 429);
  credentialWork.syscodeAdminVerifyingCredentials = true;
  try {
    const salt = randomBytes(16);
    const derived = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { ...scryptOptions, p: 3 }, (error, key) => error ? reject(error) : resolve(key));
    });
    return `scrypt:32768:8:3:${salt.toString('hex')}:${derived.toString('hex')}`;
  } finally {
    credentialWork.syscodeAdminVerifyingCredentials = false;
  }
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createAdminSession(verified: VerifiedAdminCredentials) {
  const config = await configuration();
  if (!config) throw new Error('Admin sign-in is not configured.');
  const account = await getDashboardAccount(verified.id, verified.role);
  // A password rotation during scrypt must not authenticate the new account.
  if (!account?.active || !safeEqual(verified.credentialVersion, accountCredentialVersion(account)) || !safeEqual(verified.email, account.email)) {
    throw new AdminRequestError('Your credentials changed. Please sign in again.', 401);
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    v: 2,
    id: account.id,
    role: account.role,
    sub: accountCredentialVersion(account),
    iat: now,
    exp: now + sessionLifetimeSeconds,
    nonce: randomBytes(32).toString('base64url'),
  })).toString('base64url');
  const signature = createHmac('sha256', config.secret).update(payload).digest('base64url');
  const token = `${payload}.${signature}`;
  await storeAdminSession(tokenHash(token), (now + sessionLifetimeSeconds) * 1000, account);
  return token;
}

async function sessionFromToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token || token.length > 1024) return null;
  const config = await configuration();
  if (!config) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]{43}$/.test(parts[1])) return null;
  const expected = createHmac('sha256', config.secret).update(parts[0]).digest('base64url');
  if (!safeEqual(parts[1], expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (typeof payload !== 'object' || payload === null) return null;
    const now = Math.floor(Date.now() / 1000);
    if (
      ![1, 2].includes(payload.v) || typeof payload.sub !== 'string' ||
      !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
      payload.iat > now + 30 || payload.exp <= now ||
      payload.exp - payload.iat !== sessionLifetimeSeconds ||
      typeof payload.nonce !== 'string' || !/^[\w-]{43}$/.test(payload.nonce)
    ) return null;
  } catch {
    return null;
  }
  let account: DashboardAccount | null;
  if (payload.v === 1) {
    // Existing administrator cookies retain their normal lifetime after upgrade.
    if (!safeEqual(payload.sub, credentialVersion(config))) return null;
    account = await getDashboardAccount('admin', 'admin');
    if (!account || !safeEqual(payload.sub, credentialVersion(account))) return null;
  } else {
    if ((payload.role !== 'admin' && payload.role !== 'staff') || typeof payload.id !== 'string' ||
      (payload.role === 'admin' ? payload.id !== 'admin' : !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id))) return null;
    account = await getDashboardAccount(payload.id, payload.role);
    if (!account || !safeEqual(payload.sub, accountCredentialVersion(account))) return null;
  }
  if (!account?.active) return null;
  // Storage errors fail closed and remain distinguishable from bad credentials.
  if (!(await hasAdminSession(tokenHash(token), Date.now(), account))) return null;
  return { id: account.id, role: account.role, email: account.email, name: account.name, credentialVersion: accountCredentialVersion(account) };
}

function requestToken(request: Request) {
  const cookie = request.headers.get('cookie');
  if (!cookie || cookie.length > 16384) return undefined;
  for (const item of cookie.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === ADMIN_COOKIE_NAME) return item.slice(separator + 1).trim();
  }
  return undefined;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  return sessionFromToken(token);
}

export async function requireAdmin(request: Request): Promise<AdminSession | Response> {
  try {
    const session = await sessionFromToken(requestToken(request));
    return session ?? noStoreJson({ error: 'Please sign in to continue.' }, 401);
  } catch {
    return noStoreJson({ error: 'Admin sign-in is temporarily unavailable. Please try again shortly.' }, 503);
  }
}

export async function requireAdministrator(request: Request): Promise<AdminSession | Response> {
  const actor = await requireAdmin(request);
  if (actor instanceof Response) return actor;
  return actor.role === 'admin' ? actor : noStoreJson({ error: 'Administrator access is required.' }, 403);
}

export async function revokeAdminSession(request: Request) {
  const token = requestToken(request);
  if (token && token.length <= 1024) await deleteAdminSession(tokenHash(token));
}

export function adminSessionCookie(token: string, clear = false) {
  return `${ADMIN_COOKIE_NAME}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : sessionLifetimeSeconds}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function hasSameOrigin(request: Request) {
  try {
    const target = new URL(request.url);
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
    if (!origin || !['http:', 'https:'].includes(target.protocol)) return false;
    const source = new URL(origin);
    return source.origin === origin && source.origin === target.origin &&
      (!host || host.toLowerCase() === target.host.toLowerCase());
  } catch {
    return false;
  }
}

export function noStoreJson(value: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'private, no-store, max-age=0');
  responseHeaders.set('Pragma', 'no-cache');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('X-Frame-Options', 'DENY');
  responseHeaders.set('Referrer-Policy', 'no-referrer');
  responseHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  responseHeaders.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  return Response.json(value, { status, headers: responseHeaders });
}

export class AdminRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export async function readAdminJson(request: Request, limit = 16384): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new AdminRequestError('Send a JSON request.', 415);
  }
  const lengthHeader = request.headers.get('content-length');
  const declaredSize = Number(lengthHeader || 0);
  if ((lengthHeader !== null && !/^\d+$/.test(lengthHeader)) || !Number.isSafeInteger(declaredSize) || declaredSize > limit) {
    throw new AdminRequestError('Request is too large.', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AdminRequestError('Send a JSON request.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new AdminRequestError('Request is too large.', 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof AdminRequestError) throw error;
    throw new AdminRequestError('Send valid JSON.');
  } finally {
    reader.releaseLock();
  }
}

const loginWindowMs = 15 * 60 * 1000;
const loginDenials = globalThis as typeof globalThis & { syscodeAdminLoginDenials?: Map<string, number> };

export async function consumeLoginAttempt(email: string) {
  const candidate = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  const now = Date.now();
  const denials = (loginDenials.syscodeAdminLoginDenials ??= new Map());
  for (const [key, resetAt] of denials) if (resetAt <= now) denials.delete(key);
  const cachedReset = Math.max(denials.get('global') ?? 0, denials.get(candidate) ?? 0);
  if (cachedReset > now) return Math.max(1, Math.ceil((cachedReset - now) / 1000));
  // Persisted transactionally in MySQL; restarts cannot reset this bound.
  // Do not trust spoofable forwarding/IP headers to grant extra guesses.
  return consumeStoredLoginAttempt(candidate, now, loginWindowMs, (key, resetAt) => {
    // Cache only authoritative denials, never permissions. Repeated blocked
    // requests cannot make us repeatedly acquire database transaction locks.
    // Reserve a slot for the global denial even if candidate slots are full.
    if (key === 'global' || (key === candidate && (denials.has(key) || denials.size < 30))) {
      denials.set(key, resetAt);
    }
  });
}
