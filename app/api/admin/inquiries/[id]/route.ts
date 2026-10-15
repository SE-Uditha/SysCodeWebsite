import { z } from 'zod';
import { hasSameOrigin, noStoreJson, readAdminJson, requireAdmin } from '@/lib/admin/auth';
import { adminApiFailure } from '@/lib/admin/api';
import { inquiryRevision, submitInquiryChange } from '@/lib/admin/store';
import { inquiryStatuses } from '@/lib/admin/types';

const updateSchema = z.object({
  status: z.enum(inquiryStatuses).optional(),
  notes: z.string().max(10000, 'Notes must be 10,000 characters or fewer.').optional(),
  baseHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict().refine((value) => value.status !== undefined || value.notes !== undefined, 'No changes were supplied.');

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    const payload = updateSchema.safeParse(await readAdminJson(request, 45000));
    if (!payload.success) return noStoreJson({ error: payload.error.issues[0]?.message || 'Invalid changes.' }, 400);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return noStoreJson({ error: 'Enquiry not found.' }, 404);
    const { baseHash, ...changes } = payload.data;
    const result = await submitInquiryChange(session, id, changes, baseHash);
    if (result.status === 'pending') return noStoreJson(result, 202);
    return noStoreJson({ ...result, revision: inquiryRevision(result.inquiry) });
  } catch (error) {
    return adminApiFailure(error, 'Unable to save changes right now.');
  }
}
