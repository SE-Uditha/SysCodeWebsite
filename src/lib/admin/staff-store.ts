import 'server-only';

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { assertInitialized, transaction } from './mysql.mjs';
import { decryptChangeRequest, decryptReviewReason, encryptChangeRequest, encryptInquiry, encryptReviewReason } from './private-crypto.mjs';
import { accountCredentialVersion } from './credential-version';
import { acquireGate, decodeInquiry, readContent, readDashboardAccount, requirePrivateConfiguration } from './mysql-store';
import {
  adminContentUpdateSchema, contentSchemas, inquirySchema, inquiryUpdateSchema,
  passwordHashSchema, revisionSchema, staffCreateSchema, staffUpdateSchema, timestampSchema,
} from './schemas';
import type {
  AdminContent, AdminContentSection, AdminInquiry, ChangeRequest, ChangeRequestSummary, ContentChangePayload,
  ContentRevisions, DashboardActor, InquiryChangePayload, InquiryUpdate, StaffAccount, ServerDashboardActor,
} from './types';

/** A safe message and HTTP status for expected authorization/concurrency failures. */
export class WorkflowError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); this.name = 'WorkflowError'; }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    if (text === undefined) throw new Error('Unsupported revision value.');
    return text;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export const contentHash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
export function getContentRevisions(content: AdminContent): ContentRevisions {
  return { packages: contentHash(content.packages), projects: contentHash(content.projects), faqs: contentHash(content.faqs) };
}
export const inquiryRevision = (inquiry: AdminInquiry): string => contentHash({ status: inquiry.status, notes: inquiry.notes });

/** All mutations acquire accounts first, then approvals, then the source gate/row.
 * This makes staff disable/password changes atomic with concurrent submissions.
 */
async function authorize(connection: PoolConnection, actor: ServerDashboardActor, administrator = false): Promise<DashboardActor> {
  await acquireGate(connection, 'accounts');
  if (!actor || (actor.role !== 'admin' && actor.role !== 'staff')) throw new WorkflowError(401, 'unauthorized', 'Sign in again.');
  const account = await readDashboardAccount(connection, actor.id, actor.role, true);
  if (!account || !account.active || account.email !== actor.email || account.role !== actor.role) throw new WorkflowError(401, 'unauthorized', 'Your account is no longer available. Sign in again.');
  const currentVersion = accountCredentialVersion(account);
  if (typeof actor.credentialVersion !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actor.credentialVersion) || !timingSafeEqual(Buffer.from(actor.credentialVersion), Buffer.from(currentVersion))) throw new WorkflowError(401, 'credentials_changed', 'Your credentials changed. Sign in again.');
  if (administrator && account.role !== 'admin') throw new WorkflowError(403, 'forbidden', 'Only the administrator can perform this action.');
  return { id: account.id, role: account.role, name: account.name, email: account.email };
}

function staffDto(row: RowDataPacket): StaffAccount {
  return {
    id: z.string().uuid().parse(row.id), name: z.string().min(1).max(100).parse(row.name),
    email: z.string().email().max(254).parse(row.email), active: Boolean(row.active),
    createdAt: timestampSchema.parse(Number(row.created_at)), updatedAt: timestampSchema.parse(Number(row.updated_at)),
  };
}

export async function listStaff(actor: ServerDashboardActor): Promise<StaffAccount[]> {
  requirePrivateConfiguration();
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); await authorize(connection, actor, true);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id,name,email,active,created_at,updated_at FROM staff_accounts WHERE deleted_at IS NULL ORDER BY created_at,id LIMIT 101');
    if (rows.length > 100) throw new Error('Staff storage exceeds its account limit.');
    return rows.map(staffDto);
  });
}

async function ensureAvailableEmail(connection: PoolConnection, email: string, excludingId?: string) {
  const [admin] = await connection.execute<RowDataPacket[]>('SELECT email FROM admin_accounts WHERE singleton_id=1 FOR UPDATE');
  const [staff] = await connection.execute<RowDataPacket[]>('SELECT id FROM staff_accounts WHERE email = ? FOR UPDATE', [email]);
  if (admin.some((row) => row.email.toLowerCase() === email) || staff.some((row) => row.id !== excludingId)) throw new WorkflowError(409, 'email_in_use', 'This email already belongs to an account, including removed accounts.');
}

export async function createStaff(actor: ServerDashboardActor, values: { name: string; email: string; passwordHash: string }): Promise<StaffAccount> {
  requirePrivateConfiguration(); const input = staffCreateSchema.parse(values);
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); await authorize(connection, actor, true);
    const [existing] = await connection.execute<RowDataPacket[]>('SELECT id FROM staff_accounts WHERE deleted_at IS NULL LIMIT 100 FOR UPDATE');
    if (existing.length >= 100) throw new WorkflowError(409, 'staff_limit', 'The staff account limit has been reached.');
    await ensureAvailableEmail(connection, input.email);
    const now = Date.now(), id = randomUUID();
    await connection.execute('INSERT INTO staff_accounts (id,name,email,password_hash,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)', [id,input.name,input.email,input.passwordHash,now,now]);
    return { id, name: input.name, email: input.email, active: true, createdAt: now, updatedAt: now };
  });
}

export async function updateStaff(actor: ServerDashboardActor, id: string, values: { name?: string; email?: string; active?: boolean; passwordHash?: string }): Promise<StaffAccount> {
  requirePrivateConfiguration(); z.string().uuid().parse(id); const input = staffUpdateSchema.parse(values);
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); await authorize(connection, actor, true);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id,name,email,active,created_at,updated_at FROM staff_accounts WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows.length) throw new WorkflowError(404, 'not_found', 'Staff account not found.');
    const current = staffDto(rows[0]);
    if (input.email !== undefined) await ensureAvailableEmail(connection, input.email, id);
    const next = { ...current, name: input.name ?? current.name, email: input.email ?? current.email, active: input.active ?? current.active, updatedAt: Date.now() };
    await connection.execute('UPDATE staff_accounts SET name=?,email=?,active=?,updated_at=? WHERE id=?', [next.name,next.email,next.active,next.updatedAt,id]);
    if (input.passwordHash !== undefined) await connection.execute('UPDATE staff_accounts SET password_hash=? WHERE id=?', [input.passwordHash,id]);
    // Any account edit invalidates only this staff member's current sessions.
    await acquireGate(connection, 'sessions');
    await connection.execute("DELETE FROM admin_sessions WHERE account_id=? AND account_role='staff'", [id]);
    return next;
  });
}

export async function resetStaffPassword(actor: ServerDashboardActor, id: string, passwordHash: string): Promise<StaffAccount> {
  return updateStaff(actor, id, { passwordHash: passwordHashSchema.parse(passwordHash) });
}

export async function deleteStaff(actor: ServerDashboardActor, id: string): Promise<void> {
  requirePrivateConfiguration(); z.string().uuid().parse(id);
  await transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); await authorize(connection, actor, true);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id FROM staff_accounts WHERE id=? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!rows.length) throw new WorkflowError(404, 'not_found', 'Staff account not found.');
    const now = Date.now();
    // Retain the identity for audit history; removed accounts cannot authenticate.
    await connection.execute('UPDATE staff_accounts SET active=0,deleted_at=?,updated_at=? WHERE id=?', [now,now,id]);
    await acquireGate(connection, 'sessions');
    await connection.execute("DELETE FROM admin_sessions WHERE account_id=? AND account_role='staff'", [id]);
  });
}

type InquiryRow = RowDataPacket & { id: string; created_at: string; updated_at: string; payload: string };
async function readInquiry(connection: PoolConnection, id: string): Promise<AdminInquiry> {
  const [rows] = await connection.execute<InquiryRow[]>('SELECT id,created_at,updated_at,payload FROM inquiries WHERE id=? FOR UPDATE', [id]);
  if (!rows.length) throw new WorkflowError(404, 'not_found', 'Enquiry not found.');
  return decodeInquiry(rows[0]);
}

async function writeContent(connection: PoolConnection, section: AdminContentSection, items: unknown): Promise<AdminContent> {
  const changes = adminContentUpdateSchema.parse({ section, items });
  const current = await readContent(connection, true);
  const next = { ...current, [changes.section]: changes.items } as AdminContent;
  if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 1024 * 1024) throw new WorkflowError(413, 'content_limit', 'Published content exceeds its size limit.');
  await connection.execute(`DELETE FROM ${changes.section}`);
  for (const [index,item] of changes.items.entries()) {
    await connection.execute(`INSERT INTO ${changes.section} (id,sort_order,payload) VALUES (?,?,?)`, ['id' in item ? item.id : index+1,index,JSON.stringify(item)]);
  }
  return next;
}
async function writeInquiry(connection: PoolConnection, current: AdminInquiry, changes: InquiryUpdate): Promise<AdminInquiry> {
  const input = inquiryUpdateSchema.parse(changes);
  const next = inquirySchema.parse({ ...current, ...input, updatedAt: new Date().toISOString() });
  await connection.execute('UPDATE inquiries SET updated_at=?,payload=? WHERE id=?', [next.updatedAt,encryptInquiry(next.id,next),next.id]);
  return next;
}

const immutableSchema = z.object({
  id: z.string().uuid(), actorStaffId: z.string().uuid(), actorName: z.string().min(1).max(100),
  actorEmail: z.string().email().max(254), kind: z.enum(['content','inquiry']), target: z.string().min(1).max(80),
  baseHash: revisionSchema, createdAt: timestampSchema, payload: z.unknown(),
}).strict();
function parseRequestPayload(kind: 'content' | 'inquiry', target: string, baseHash: string, value: unknown): ContentChangePayload | InquiryChangePayload {
  if (kind === 'content') {
    const raw = z.object({ section: z.enum(['packages','projects','faqs']), before: z.unknown(), after: z.unknown() }).strict().parse(value);
    const changes = adminContentUpdateSchema.parse({ section: raw.section, items: raw.after });
    const before = contentSchemas[raw.section].parse(raw.before);
    const after = contentSchemas[raw.section].parse(raw.after);
    if (target !== raw.section || contentHash(before) !== baseHash || contentHash(after) !== contentHash(changes.items)) throw new Error('Change request content snapshot is inconsistent.');
    return { section: changes.section, before, after } as ContentChangePayload;
  }
  const raw = z.object({ id: z.string().uuid(), changes: inquiryUpdateSchema, before: inquirySchema, after: inquirySchema }).strict().parse(value);
  if (target !== raw.id || raw.before.id !== target || raw.after.id !== target || inquiryRevision(raw.before) !== baseHash || contentHash({ ...raw.before, ...raw.changes, updatedAt: raw.after.updatedAt }) !== contentHash(raw.after)) throw new Error('Change request enquiry snapshot is inconsistent.');
  return raw;
}

function decodeSummary(row: RowDataPacket): ChangeRequestSummary {
  const status = z.enum(['pending','approved','rejected']).parse(row.status);
  const reviewedAt = row.reviewed_at === null ? null : timestampSchema.parse(Number(row.reviewed_at));
  const reviewedBy = row.reviewed_by === null ? null : z.string().email().max(254).parse(row.reviewed_by);
  if (status === 'pending' ? reviewedAt !== null || reviewedBy !== null : reviewedAt === null || reviewedBy === null) throw new Error('Change request review metadata is invalid.');
  return {
    id: z.string().uuid().parse(row.id), actorStaffId: z.string().uuid().parse(row.actor_staff_id),
    actorName: z.string().min(1).max(100).parse(row.actor_name), actorEmail: z.string().email().max(254).parse(row.actor_email),
    kind: z.enum(['content','inquiry']).parse(row.kind), target: z.string().min(1).max(80).parse(row.target),
    baseHash: revisionSchema.parse(row.base_hash), createdAt: timestampSchema.parse(Number(row.created_at)),
    status,reviewedAt,reviewedBy,reviewReason: z.string().max(2000).parse(row.review_reason === '' ? '' : decryptReviewReason(row.id,row.review_reason)),
  };
}

function decodeRequest(row: RowDataPacket): ChangeRequest {
  const immutable = immutableSchema.parse(decryptChangeRequest(row.id, row.payload));
  for (const [key,column] of [['id','id'],['actorStaffId','actor_staff_id'],['actorName','actor_name'],['actorEmail','actor_email'],['kind','kind'],['target','target'],['baseHash','base_hash']] as const) {
    if (immutable[key] !== row[column]) throw new Error('Change request identity does not match its authenticated payload.');
  }
  if (immutable.createdAt !== Number(row.created_at)) throw new Error('Change request creation time does not match its authenticated payload.');
  return {
    ...decodeSummary(row),
    payload: parseRequestPayload(immutable.kind,immutable.target,immutable.baseHash,immutable.payload),
  };
}

async function queueRequest(connection: PoolConnection, actor: DashboardActor, kind: 'content' | 'inquiry', target: string, baseHash: string, payload: ContentChangePayload | InquiryChangePayload): Promise<ChangeRequest> {
  const [pending] = await connection.execute<RowDataPacket[]>("SELECT id,actor_staff_id FROM change_requests WHERE status='pending' LIMIT 1001 FOR UPDATE");
  if (pending.length >= 1000 || pending.filter((row) => row.actor_staff_id === actor.id).length >= 100) throw new WorkflowError(409, 'pending_limit', 'Pending changes have reached their limit. Ask the administrator to review them first.');
  const immutable = { id: randomUUID(), actorStaffId: actor.id, actorName: actor.name, actorEmail: actor.email, kind,target,baseHash,createdAt: Date.now(),payload };
  const request: ChangeRequest = { ...immutable, status: 'pending', reviewedAt: null, reviewedBy: null, reviewReason: '' };
  await connection.execute('INSERT INTO change_requests (id,actor_staff_id,actor_name,actor_email,kind,target,base_hash,payload,status,created_at,review_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [immutable.id,actor.id,actor.name,actor.email,kind,target,baseHash,encryptChangeRequest(immutable.id,immutable),'pending',immutable.createdAt,'']);
  return request;
}

function assertRevision(actor: DashboardActor, submitted: string | undefined, current: string) {
  if (submitted === undefined && actor.role === 'admin') return;
  if (!submitted || !revisionSchema.safeParse(submitted).success) throw new WorkflowError(400, 'revision_required', 'Reload the latest content before submitting your changes.');
  if (submitted !== current) throw new WorkflowError(409, 'stale_change', 'This content has changed. Reload the latest version and submit your changes again.');
}

export async function submitContentChange(actor: ServerDashboardActor, section: AdminContentSection, items: unknown, baseHash?: string): Promise<{ status: 'applied'; content: AdminContent } | { status: 'pending'; request: ChangeRequest }> {
  requirePrivateConfiguration(); const changes = adminContentUpdateSchema.parse({ section,items });
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); const currentActor = await authorize(connection,actor);
    await acquireGate(connection,'approvals'); await acquireGate(connection,'content');
    const content = await readContent(connection,true), revision = contentHash(content[changes.section]);
    assertRevision(currentActor,baseHash,revision);
    if (currentActor.role === 'admin') return { status: 'applied', content: await writeContent(connection,changes.section,changes.items) };
    if (contentHash(changes.items) === revision) throw new WorkflowError(400,'no_changes','There are no changes to submit.');
    const payload = { section: changes.section, before: content[changes.section], after: changes.items } as ContentChangePayload;
    // Bound the entire prospective public document before accepting a draft.
    if (Buffer.byteLength(JSON.stringify({ ...content,[changes.section]:changes.items }),'utf8') > 1024*1024) throw new WorkflowError(413,'content_limit','Published content exceeds its size limit.');
    return { status: 'pending', request: await queueRequest(connection,currentActor,'content',changes.section,revision,payload) };
  });
}

export async function submitInquiryChange(actor: ServerDashboardActor, id: string, values: InquiryUpdate, baseHash?: string): Promise<{ status: 'applied'; inquiry: AdminInquiry } | { status: 'pending'; request: ChangeRequest }> {
  requirePrivateConfiguration(); z.string().uuid().parse(id); const changes = inquiryUpdateSchema.parse(values);
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); const currentActor = await authorize(connection,actor);
    await acquireGate(connection,'approvals'); await acquireGate(connection,'inquiries');
    const current = await readInquiry(connection,id), revision = inquiryRevision(current);
    assertRevision(currentActor,baseHash,revision);
    if (currentActor.role === 'admin') return { status: 'applied', inquiry: await writeInquiry(connection,current,changes) };
    const after = inquirySchema.parse({ ...current,...changes,updatedAt:new Date().toISOString() });
    if (inquiryRevision(after) === revision) throw new WorkflowError(400,'no_changes','There are no changes to submit.');
    return { status: 'pending', request: await queueRequest(connection,currentActor,'inquiry',id,revision,{ id,changes,before:current,after }) };
  });
}

export async function listChangeRequests(actor: ServerDashboardActor): Promise<ChangeRequestSummary[]> {
  requirePrivateConfiguration();
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); const current = await authorize(connection,actor);
    // Payloads can be megabytes; list only bounded metadata and decrypt details on demand.
    const columns = 'id,actor_staff_id,actor_name,actor_email,kind,target,base_hash,status,created_at,reviewed_at,reviewed_by,review_reason';
    const [rows] = await connection.execute<RowDataPacket[]>(current.role === 'admin'
      ? `SELECT ${columns} FROM change_requests ORDER BY (status='pending') DESC,created_at DESC,id DESC LIMIT 100`
      : `SELECT ${columns} FROM change_requests WHERE actor_staff_id=? ORDER BY (status='pending') DESC,created_at DESC,id DESC LIMIT 100`, current.role === 'admin' ? [] : [current.id]);
    return rows.map(decodeSummary);
  });
}

export async function countPendingChanges(actor: ServerDashboardActor): Promise<number> {
  requirePrivateConfiguration();
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); const current = await authorize(connection,actor);
    const [rows] = await connection.execute<RowDataPacket[]>(current.role === 'admin'
      ? "SELECT COUNT(*) AS pending_count FROM change_requests WHERE status='pending'"
      : "SELECT COUNT(*) AS pending_count FROM change_requests WHERE status='pending' AND actor_staff_id=?",current.role === 'admin' ? [] : [current.id]);
    return z.number().int().min(0).max(1000).parse(Number(rows[0].pending_count));
  });
}

export async function getChangeRequest(actor: ServerDashboardActor, id: string): Promise<ChangeRequest | null> {
  requirePrivateConfiguration(); z.string().uuid().parse(id);
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); const current = await authorize(connection,actor);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM change_requests WHERE id=?', [id]);
    if (!rows.length || (current.role === 'staff' && rows[0].actor_staff_id !== current.id)) return null;
    return decodeRequest(rows[0]);
  });
}

export async function reviewChangeRequest(actor: ServerDashboardActor, id: string, decision: 'approved' | 'rejected', reason = ''): Promise<{ request: ChangeRequest; content?: AdminContent; inquiry?: AdminInquiry }> {
  requirePrivateConfiguration(); z.string().uuid().parse(id); z.enum(['approved','rejected']).parse(decision); z.string().max(2000).parse(reason);
  return transaction(async (connection: PoolConnection) => {
    await assertInitialized(connection); const reviewer = await authorize(connection,actor,true);
    await acquireGate(connection,'approvals');
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM change_requests WHERE id=? FOR UPDATE', [id]);
    if (!rows.length) throw new WorkflowError(404,'not_found','Change request not found.');
    const request = decodeRequest(rows[0]);
    if (request.status !== 'pending') throw new WorkflowError(409,'already_reviewed','This change has already been reviewed.');
    let content: AdminContent | undefined, inquiry: AdminInquiry | undefined;
    if (decision === 'approved') {
      const author = await readDashboardAccount(connection,request.actorStaffId,'staff',true);
      if (!author || !author.active) throw new WorkflowError(409,'author_disabled','This staff account is disabled or removed. Reject this request or re-enable the account before approving it.');
      if (request.kind === 'content') {
        await acquireGate(connection,'content');
        const payload = request.payload as ContentChangePayload;
        const current = await readContent(connection,true);
        if (contentHash(current[payload.section]) !== request.baseHash) throw new WorkflowError(409,'stale_change','Published content has changed since this request. Reject it and ask staff to submit a new change.');
        content = await writeContent(connection,payload.section,payload.after);
      } else {
        await acquireGate(connection,'inquiries');
        const payload = request.payload as InquiryChangePayload;
        const current = await readInquiry(connection,payload.id);
        if (inquiryRevision(current) !== request.baseHash) throw new WorkflowError(409,'stale_change','This enquiry has changed since this request. Reject it and ask staff to submit a new change.');
        inquiry = await writeInquiry(connection,current,payload.changes);
      }
    }
    const reviewedAt = Date.now();
    await connection.execute("UPDATE change_requests SET status=?,reviewed_at=?,reviewed_by=?,review_reason=? WHERE id=? AND status='pending'", [decision,reviewedAt,reviewer.email,encryptReviewReason(id,reason.trim()),id]);
    return { request:{ ...request,status:decision,reviewedAt,reviewedBy:reviewer.email,reviewReason:reason.trim() },...(content ? {content} : {}),...(inquiry ? {inquiry} : {}) };
  });
}
