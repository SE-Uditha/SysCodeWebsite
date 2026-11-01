import { z } from 'zod';
import { adminApiFailure } from '@/lib/admin/api';
import { hasSameOrigin, noStoreJson, readAdminJson, requireAdmin } from '@/lib/admin/auth';
import { getAdminProfile, updateAdminProfile } from '@/lib/admin/store';

const profileSchema = z.object({
  phone: z.string().trim().max(40),
  address: z.string().trim().max(500),
  postalCode: z.string().trim().max(20),
}).strict();

export async function GET(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;
  if (session.role !== 'admin') return noStoreJson({ error: 'Only the administrator can view this profile.' }, 403);
  try {
    const profile = await getAdminProfile();
    return profile ? noStoreJson({ profile }) : noStoreJson({ error: 'Administrator profile is unavailable.' }, 404);
  } catch (error) {
    return adminApiFailure(error, 'Unable to load the administrator profile right now.');
  }
}

export async function PATCH(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;
  if (session.role !== 'admin') return noStoreJson({ error: 'Only the administrator can update this profile.' }, 403);
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    const payload = profileSchema.safeParse(await readAdminJson(request, 2048));
    if (!payload.success) return noStoreJson({ error: payload.error.issues[0]?.message || 'Invalid profile details.' }, 400);
    const profile = await updateAdminProfile(session, payload.data);
    return noStoreJson({ profile });
  } catch (error) {
    return adminApiFailure(error, 'Unable to save the administrator profile right now.');
  }
}
