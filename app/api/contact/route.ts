import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { contactFormSchema } from '@/lib/validations';
import { hasEmailConfig, sendInquiryEmail } from '@/lib/email';
import { createInquiry, updateInquiryEmailStatus } from '@/lib/admin/store';
import { AdminRequestError, noStoreJson, readAdminJson } from '@/lib/admin/auth';

const rateLimitWindowMs = 60 * 1000;
type ContactRateState = { globalAttempts: number[]; byClient: Map<string, number[]> };
const contactRateState = globalThis as typeof globalThis & { syscodeContactRateState?: ContactRateState };

function consumeContactAttempt(request: Request) {
  const now = Date.now();
  const state: ContactRateState = (contactRateState.syscodeContactRateState ??= { globalAttempts: [], byClient: new Map<string, number[]>() });
  state.globalAttempts = state.globalAttempts.filter((time) => now - time < rateLimitWindowMs);
  for (const [key, attempts] of state.byClient) {
    if (attempts.every((time) => now - time >= rateLimitWindowMs)) state.byClient.delete(key);
  }
  const retrySeconds = (oldest: number) => Math.max(1, Math.ceil((oldest + rateLimitWindowMs - now) / 1000));
  // This bound is independent of all forwarding headers. Changing an advertised
  // address cannot increase the server's total allowance or grow an unbounded map.
  if (state.globalAttempts.length >= 30) return retrySeconds(state.globalAttempts[0]);
  const advertised = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';
  const address = isIP(advertised) ? advertised : 'unknown';
  const clientKey = createHash('sha256').update(address).digest('hex');
  const recent = (state.byClient.get(clientKey) ?? []).filter((time) => now - time < rateLimitWindowMs);
  // A proxy-provided address is an advisory, stricter limit; it never bypasses
  // the global allowance. The deployment's proxy should replace client headers.
  if (recent.length >= 3) return retrySeconds(recent[0]);
  if (state.byClient.size >= 128 && !state.byClient.has(clientKey)) {
    return 60;
  }
  state.globalAttempts.push(now);
  recent.push(now);
  state.byClient.set(clientKey, recent);
  return 0;
}

export async function POST(request: Request) {
  try {
    const retryAfter = consumeContactAttempt(request);
    if (retryAfter) {
      return noStoreJson(
        { error: 'Too many requests. Please wait a moment before submitting again.' },
        429,
        { 'Retry-After': String(retryAfter) },
      );
    }

    const payload = await readAdminJson(request, 32768);
    const parsed = contactFormSchema.safeParse(payload);

    if (!parsed.success) {
      return noStoreJson(
        { error: parsed.error.issues[0]?.message || 'Validation failed.' },
        400,
      );
    }

    const inquiry = await createInquiry(parsed.data, hasEmailConfig() ? 'pending' : 'not_configured');
    if (hasEmailConfig()) {
      let emailStatus: 'sent' | 'failed';
      try {
        await sendInquiryEmail(parsed.data);
        emailStatus = 'sent';
      } catch {
        // The request is already safely in the admin inbox even if SMTP fails.
        emailStatus = 'failed';
      }
      try {
        await updateInquiryEmailStatus(inquiry.id, emailStatus);
      } catch {
        // A notification status failure must not invite duplicate submissions.
        console.error('Unable to record enquiry notification status.');
      }
    }

    return noStoreJson({ message: 'Your quote request has been received successfully.' });
  } catch (error) {
    if (error instanceof AdminRequestError) return noStoreJson({ error: error.message }, error.status);
    return noStoreJson(
      {
        error: 'Unable to save your request right now. Please try again shortly.',
      },
      500,
    );
  }
}
