import 'server-only';

import { AdminRequestError, noStoreJson } from './auth';
import { WorkflowError } from './store';

export function adminApiFailure(error: unknown, message: string) {
  if (error instanceof AdminRequestError) {
    return noStoreJson({ error: error.message }, error.status, error.status === 429 ? { 'Retry-After': '1' } : {});
  }
  if (error instanceof WorkflowError) return noStoreJson({ error: error.message, code: error.code }, error.status);
  return noStoreJson({ error: message }, 503);
}
