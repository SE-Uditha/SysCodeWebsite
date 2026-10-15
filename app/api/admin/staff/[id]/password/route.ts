import { z } from 'zod';
import { hasSameOrigin, hashStaffPassword, noStoreJson, readAdminJson, requireAdministrator } from '@/lib/admin/auth';
import { adminApiFailure } from '@/lib/admin/api';
import { updateStaff } from '@/lib/admin/store';

const passwordSchema = z.object({
  password: z.string().min(16, 'Choose a password with at least 16 characters.').max(1024).refine((value) => !/[\r\n\0]/.test(value), 'Passwords cannot contain line breaks.'),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdministrator(request);
  if (actor instanceof Response) return actor;
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return noStoreJson({ error: 'Staff member not found.' }, 404);
    const payload = passwordSchema.safeParse(await readAdminJson(request, 8192));
    if (!payload.success) return noStoreJson({ error: payload.error.issues[0]?.message || 'Invalid password.' }, 400);
    await updateStaff(actor, id, { passwordHash: await hashStaffPassword(payload.data.password) });
    return noStoreJson({ success: true });
  } catch (error) {
    return adminApiFailure(error, 'Unable to reset this staff password right now.');
  }
}
