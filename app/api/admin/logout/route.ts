import { adminSessionCookie, hasSameOrigin, noStoreJson, requireAdmin, revokeAdminSession } from '@/lib/admin/auth';

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;
  try {
    await revokeAdminSession(request);
    return noStoreJson({ success: true }, 200, { 'Set-Cookie': adminSessionCookie('', true) });
  } catch {
    return noStoreJson({ error: 'Unable to sign out right now. Please try again.' }, 500);
  }
}
