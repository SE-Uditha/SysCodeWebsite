import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { hasSameOrigin, noStoreJson, readAdminJson, requireAdmin } from '@/lib/admin/auth';
import { adminApiFailure } from '@/lib/admin/api';
import { adminContentUpdateSchema, getAdminContent, getContentRevisions, submitContentChange } from '@/lib/admin/store';

const submissionSchema = z.object({
  section: z.enum(['packages', 'projects', 'faqs']),
  items: z.unknown(),
  baseHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict();

export async function GET(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;
  try {
    const content = await getAdminContent();
    return noStoreJson({ content, revisions: getContentRevisions(content) });
  } catch {
    return noStoreJson({ error: 'Unable to load website content right now.' }, 503);
  }
}

export async function PATCH(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;
  if (!hasSameOrigin(request)) return noStoreJson({ error: 'Request origin is not allowed.' }, 403);
  try {
    const submission = submissionSchema.safeParse(await readAdminJson(request, 1024 * 1024));
    if (!submission.success) return noStoreJson({ error: submission.error.issues[0]?.message || 'Invalid content submission.' }, 400);
    const payload = adminContentUpdateSchema.safeParse({ section: submission.data.section, items: submission.data.items });
    if (!payload.success) return noStoreJson({ error: payload.error.issues[0]?.message || 'Invalid content.' }, 400);
    const result = await submitContentChange(session, payload.data.section, payload.data.items, submission.data.baseHash);
    if (result.status === 'pending') return noStoreJson(result, 202);
    revalidateTag('site-content', { expire: 0 });
    revalidatePath('/', 'layout');
    return noStoreJson({ ...result, revisions: getContentRevisions(result.content) });
  } catch (error) {
    return adminApiFailure(error, 'Unable to save website content right now.');
  }
}
