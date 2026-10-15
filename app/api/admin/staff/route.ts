import { z } from 'zod';
import { hasSameOrigin, hashStaffPassword, noStoreJson, readAdminJson, requireAdministrator } from '@/lib/admin/auth';
import { adminApiFailure } from '@/lib/admin/api';
import { createStaff, listStaff } from '@/lib/admin/store';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Enter the staff member’s name.').max(100).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Use a name without control characters.'),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(16, 'Choose a password with at least 16 characters.').max(1024).refine((value) => !/[\r\n\0]/.test(value), 'Passwords cannot contain line breaks.'),
}).strict();

export async function GET(request: Request) {
  const actor = await requireAdministrator(request);
  if (actor instanceof Response) return actor;
  try {
    return noStoreJson({ staff: await listStaff(actor) });
  } catch (error) {
    return adminApiFailure(error, 'Unable to load staff accounts right now.');
  }
}

export async function POST(request: Request) {
  const actor = await requireAdministrator(request);
  if (actor instanceof Response) return actor;
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    const payload = createSchema.safeParse(await readAdminJson(request, 8192));
    if (!payload.success) return noStoreJson({ error: payload.error.issues[0]?.message || 'Invalid staff account.' }, 400);
    const { password, ...values } = payload.data;
    const member = await createStaff(actor, { ...values, passwordHash: await hashStaffPassword(password) });
    return noStoreJson({ member }, 201);
  } catch (error) {
    return adminApiFailure(error, 'Unable to create this staff account right now.');
  }
}
