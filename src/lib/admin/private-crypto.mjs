import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const maximumPlaintextBytes = 128 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function masterKey() {
  const value = process.env.ADMIN_STORAGE_KEY;
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error('ADMIN_STORAGE_KEY must be a canonical base64url-encoded 32-byte key.');
  }
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== value) {
    throw new Error('ADMIN_STORAGE_KEY must be a canonical base64url-encoded 32-byte key.');
  }
  return key;
}

export function isStorageKeyConfigured() {
  try { masterKey(); return true; } catch { return false; }
}

function inquiryKey() {
  return Buffer.from(hkdfSync('sha256', masterKey(), Buffer.from('syscode-admin-mysql-v1'), Buffer.from('inquiries.payload'), 32));
}

/** @param {string} id */
function additionalData(id) {
  if (!uuidPattern.test(id)) throw new Error('Invalid inquiry encryption identity.');
  return Buffer.from(`syscode-admin:mysql:inquiries:${id}:v1`);
}

/** @param {string} id @param {unknown} value */
export function encryptInquiry(id, value) {
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (plaintext.length > maximumPlaintextBytes) throw new Error('Inquiry exceeds its storage size limit.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', inquiryKey(), iv);
  cipher.setAAD(additionalData(id));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url'),
  });
}

/** @param {string} id @param {string} text @returns {unknown} */
export function decryptInquiry(id, text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > maximumPlaintextBytes * 2) {
    throw new Error('Encrypted inquiry exceeds its storage size limit.');
  }
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('Encrypted inquiry has an invalid envelope.'); }
  if (
    !envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
    Object.keys(envelope).sort().join(',') !== 'algorithm,ciphertext,iv,tag,version' ||
    envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm' ||
    typeof envelope.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) ||
    typeof envelope.tag !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(envelope.tag) ||
    typeof envelope.ciphertext !== 'string' || !/^[A-Za-z0-9_-]+$/.test(envelope.ciphertext)
  ) throw new Error('Encrypted inquiry has an invalid envelope.');
  const iv = Buffer.from(envelope.iv, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64url');
  if (
    iv.toString('base64url') !== envelope.iv || tag.toString('base64url') !== envelope.tag ||
    ciphertext.toString('base64url') !== envelope.ciphertext || ciphertext.length > maximumPlaintextBytes
  ) throw new Error('Encrypted inquiry has invalid encoded data.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', inquiryKey(), iv);
    decipher.setAAD(additionalData(id));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('Inquiry authentication failed. Check ADMIN_STORAGE_KEY or restore a trusted backup.');
  }
}

// A validated before/after public document is at most 1 MiB each, plus metadata.
const maximumRequestBytes = 2 * 1024 * 1024 + 16 * 1024;
/** @param {string} purpose */
function requestKey(purpose) {
  return Buffer.from(hkdfSync('sha256', masterKey(), Buffer.from('syscode-admin-mysql-v2'), Buffer.from(purpose), 32));
}
/** @param {string} id @param {string} purpose */
function requestAad(id, purpose) {
  if (!uuidPattern.test(id)) throw new Error('Invalid change request encryption identity.');
  return Buffer.from(`syscode-admin:mysql:${purpose}:${id}:v2`);
}
/** @param {string} id @param {unknown} value @param {string} purpose @param {number} maximumBytes */
function encryptWorkflowValue(id, value, purpose, maximumBytes) {
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (plaintext.length > maximumBytes) throw new Error('Change request exceeds its storage size limit.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', requestKey(purpose), iv);
  cipher.setAAD(requestAad(id, purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({ version: 2, algorithm: 'aes-256-gcm', iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') });
}
/** @param {string} id @param {string} text @param {string} purpose @param {number} maximumBytes @returns {unknown} */
function decryptWorkflowValue(id, text, purpose, maximumBytes) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > maximumBytes * 2) throw new Error('Encrypted change request exceeds its storage size limit.');
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('Encrypted change request has an invalid envelope.'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
    Object.keys(envelope).sort().join(',') !== 'algorithm,ciphertext,iv,tag,version' ||
    envelope.version !== 2 || envelope.algorithm !== 'aes-256-gcm' ||
    typeof envelope.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) ||
    typeof envelope.tag !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(envelope.tag) ||
    typeof envelope.ciphertext !== 'string' || !/^[A-Za-z0-9_-]+$/.test(envelope.ciphertext)) throw new Error('Encrypted change request has an invalid envelope.');
  const iv = Buffer.from(envelope.iv, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64url');
  if (iv.toString('base64url') !== envelope.iv || tag.toString('base64url') !== envelope.tag || ciphertext.toString('base64url') !== envelope.ciphertext || ciphertext.length > maximumBytes) throw new Error('Encrypted change request has invalid encoded data.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', requestKey(purpose), iv);
    decipher.setAAD(requestAad(id, purpose)); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
  } catch { throw new Error('Change request authentication failed. Check ADMIN_STORAGE_KEY or restore a trusted backup.'); }
}

/** @param {string} id @param {unknown} value */
export const encryptChangeRequest = (id, value) => encryptWorkflowValue(id, value, 'change_requests.payload', maximumRequestBytes);
/** @param {string} id @param {string} text @returns {unknown} */
export const decryptChangeRequest = (id, text) => decryptWorkflowValue(id, text, 'change_requests.payload', maximumRequestBytes);
/** @param {string} id @param {string} value */
export const encryptReviewReason = (id, value) => encryptWorkflowValue(id, value, 'change_requests.review_reason', 16 * 1024);
/** @param {string} id @param {string} text @returns {unknown} */
export const decryptReviewReason = (id, text) => decryptWorkflowValue(id, text, 'change_requests.review_reason', 16 * 1024);
