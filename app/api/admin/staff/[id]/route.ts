import { z } from 'zod';
import { hasSameOrigin, hashStaffPassword, noStoreJson, readAdminJson, requireAdministrator } from '@/lib/admin/auth';
import { adminApiFailure } from '@/lib/admin/api';
import { deleteStaff, updateStaff } from '@/lib/admin/store';

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Use a name without control characters.').optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  active: z.boolean().optional(),
  password: z.string().min(16, 'Choose a password with at least 16 characters.').max(1024).refine((value) => !/[\r\n\0]/.test(value), 'Passwords cannot contain line breaks.').optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No changes were supplied.');

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdministrator(request);
  if (actor instanceof Response) return actor;
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return noStoreJson({ error: 'Staff member not found.' }, 404);
    const payload = updateSchema.safeParse(await readAdminJson(request, 8192));
    if (!payload.success) return noStoreJson({ error: payload.error.issues[0]?.message || 'Invalid staff account changes.' }, 400);
    const { password, ...changes } = payload.data;
    const member = await updateStaff(actor, id, { ...changes, ...(password !== undefined ? { passwordHash: await hashStaffPassword(password) } : {}) });
    return noStoreJson({ member });
  } catch (error) {
    return adminApiFailure(error, 'Unable to update this staff account right now.');
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdministrator(request);
  if (actor instanceof Response) return actor;
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return noStoreJson({ error: 'Staff member not found.' }, 404);
    await deleteStaff(actor, id);
    return noStoreJson({ success: true });
  } catch (error) {
    return adminApiFailure(error, 'Unable to remove this staff account right now.');
  }
}
