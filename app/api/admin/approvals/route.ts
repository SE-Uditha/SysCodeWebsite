import { noStoreJson, requireAdmin } from '@/lib/admin/auth';
import { adminApiFailure } from '@/lib/admin/api';
import { countPendingChanges, listChangeRequests } from '@/lib/admin/store';

export async function GET(request: Request) {
  const actor = await requireAdmin(request);
  if (actor instanceof Response) return actor;
  try {
    const [requests, pendingCount] = await Promise.all([listChangeRequests(actor), countPendingChanges(actor)]);
    return noStoreJson({ requests, pendingCount });
  } catch (error) {
    return adminApiFailure(error, 'Unable to load change requests right now.');
  }
}
