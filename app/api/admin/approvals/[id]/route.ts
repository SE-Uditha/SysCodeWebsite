import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { hasSameOrigin, noStoreJson, readAdminJson, requireAdmin, requireAdministrator } from '@/lib/admin/auth';
import { adminApiFailure } from '@/lib/admin/api';
import { getChangeRequest, getContentRevisions, inquiryRevision, reviewChangeRequest } from '@/lib/admin/store';

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(2000).optional(),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin(request);
  if (actor instanceof Response) return actor;
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return noStoreJson({ error: 'Change request not found.' }, 404);
    const change = await getChangeRequest(actor, id);
    if (!change) return noStoreJson({ error: 'Change request not found.' }, 404);
    return noStoreJson({ request: change });
  } catch (error) {
    return adminApiFailure(error, 'Unable to load this change request right now.');
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireAdministrator(request);
  if (actor instanceof Response) return actor;
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return noStoreJson({ error: 'Change request not found.' }, 404);
    const payload = decisionSchema.safeParse(await readAdminJson(request, 12288));
    if (!payload.success) return noStoreJson({ error: payload.error.issues[0]?.message || 'Invalid decision.' }, 400);
    const result = await reviewChangeRequest(actor, id, payload.data.decision === 'approve' ? 'approved' : 'rejected', payload.data.reason);
    // A queued or rejected request never invalidates the published website.
    if (result.content) {
      revalidateTag('site-content', { expire: 0 });
      revalidatePath('/', 'layout');
    }
    return noStoreJson({
      ...result,
      ...(result.content ? { revisions: getContentRevisions(result.content) } : {}),
      ...(result.inquiry ? { revision: inquiryRevision(result.inquiry) } : {}),
    });
  } catch (error) {
    return adminApiFailure(error, 'Unable to review this change request right now.');
  }
}
