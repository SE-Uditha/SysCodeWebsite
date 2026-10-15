import 'server-only';

import { createHash } from 'node:crypto';
import type { DashboardAccount } from './types';

// A server-only account snapshot proof lets the DAL reject a request whose
// credentials were rotated while it waited for the account transaction lock.
export function accountCredentialVersion(account: Pick<DashboardAccount, 'id' | 'role' | 'email' | 'passwordHash'>) {
  return createHash('sha256').update(`${account.id}\0${account.role}\0${account.email}\0${account.passwordHash}`).digest('base64url');
}
