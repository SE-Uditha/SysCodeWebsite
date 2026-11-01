import { z } from 'zod';
import {
  AdminRequestError,
  adminSessionCookie,
  consumeLoginAttempt,
  createAdminSession,
  hasSameOrigin,
  isAdminConfigured,
  noStoreJson,
  readAdminJson,
  revokeAdminSession,
  verifyAdminCredentials,
} from '@/lib/admin/auth';
import { getDashboardAccountByLogin } from '@/lib/admin/store';

const credentialsSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  password: z.string().min(1).max(1024),
}).strict().refine((value) => Boolean(value.identifier) !== Boolean(value.email), 'Enter your email or username.');

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    if (!(await isAdminConfigured())) return noStoreJson({ error: 'Admin sign-in has not been configured yet.' }, 503);
    const payload = credentialsSchema.safeParse(await readAdminJson(request, 4096));
    const identifier = payload.success ? payload.data.identifier || payload.data.email || '' : '';
    const account = payload.success ? await getDashboardAccountByLogin(identifier.toLowerCase()) : null;
    const retryAfter = await consumeLoginAttempt(account?.email || identifier);
    if (retryAfter) {
      return noStoreJson({ error: 'Too many sign-in attempts. Please try again later.' }, 429, {
        'Retry-After': String(retryAfter),
      });
    }
    const verified = payload.success ? await verifyAdminCredentials(identifier, payload.data.password) : null;
    if (!verified) {
      return noStoreJson({ error: 'Username, email, or password is incorrect.' }, 401);
    }
    await revokeAdminSession(request);
    const token = await createAdminSession(verified);
    return noStoreJson({ success: true }, 200, { 'Set-Cookie': adminSessionCookie(token) });
  } catch (error) {
    if (error instanceof AdminRequestError) {
      return noStoreJson({ error: error.message }, error.status, error.status === 429 ? { 'Retry-After': '1' } : {});
    }
    console.error('Admin sign-in failed.');
    return noStoreJson({ error: 'Admin sign-in is temporarily unavailable. Please try again shortly.' }, 503);
  }
}
