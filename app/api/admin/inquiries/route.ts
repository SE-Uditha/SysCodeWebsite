import { noStoreJson, requireAdmin } from '@/lib/admin/auth';
import { inquiryRevision, listInquiries } from '@/lib/admin/store';

export async function GET(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;
  try {
    const inquiries = await listInquiries();
    return noStoreJson({ inquiries, revisions: Object.fromEntries(inquiries.map((inquiry) => [inquiry.id, inquiryRevision(inquiry)])) });
  } catch {
    return noStoreJson({ error: 'Unable to load enquiries right now.' }, 503);
  }
}
