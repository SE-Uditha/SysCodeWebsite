import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { getAdminContent } from '@/lib/admin/store';
import type { AdminContent } from '@/lib/admin/types';

// Public content has its own cache; authentication and enquiries never enter it.
export async function getSiteContent(): Promise<AdminContent> {
  'use cache';
  cacheTag('site-content');
  cacheLife('days');

  return await getAdminContent();
}
