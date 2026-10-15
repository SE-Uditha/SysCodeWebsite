import { spawn } from 'node:child_process';
import { randomBytes, scryptSync, createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileStoreWorker, fixtureEnvironment, readQaConfiguration, resetQaFixtures } from './lib/mysql-qa.mjs';
import { openTestBrowser } from './lib/headless-browser.mjs';

// Uses only an explicitly isolated syscode_qa_* database and synthetic accounts.
const output = path.resolve('.next/staff-qa');
const base = 'http://localhost:3120';
const checks = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let qa; let server; let worker; let browser; let failure;
const adminEmail = 'staff-admin-qa@example.invalid';
const adminPassword = randomBytes(24).toString('base64url');
const staffPassword = randomBytes(24).toString('base64url');
const staffEmail = 'staff-author-qa@example.invalid';
const otherEmail = 'staff-other-qa@example.invalid';
const runId = randomBytes(4).toString('hex');

function check(name, pass) {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) throw new Error(name);
}
async function api(route, { method = 'GET', body, cookie = '', origin = base } = {}) {
  const headers = { ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data; try { data = await response.json(); } catch { data = null; }
  return { response, data, status: response.status, cookie: (response.headers.get('set-cookie') || '').split(';')[0] };
}
async function login(email, password) { return api('/api/admin/login', { method: 'POST', body: { email, password } }); }
async function eventually(operation, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await operation()) return; await pause(80); }
  throw new Error(`Timed out waiting for ${label}.`);
}

try {
  await fs.mkdir(output, { recursive: true });
  qa = await readQaConfiguration();
  const environment = { ...process.env, ...fixtureEnvironment(qa.environment), NODE_ENV: 'production' };
  const salt = randomBytes(16);
  const hash = scryptSync(adminPassword, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `scrypt:32768:8:3:${salt.toString('hex')}:${hash.toString('hex')}`;
  worker = await compileStoreWorker(path.join(output, 'store-fixture'));
  await resetQaFixtures(qa.connection, worker, environment, { email: adminEmail, passwordHash });
  let serverError = '';
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3120'], { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (chunk) => { serverError += chunk.toString(); });
  await eventually(async () => { if (server.exitCode !== null) throw new Error(`QA server exited: ${serverError}`); try { return (await fetch(base + '/api/admin/content')).status === 401; } catch { return false; } }, 'isolated server');
  const adminLogin = await login(adminEmail, adminPassword);
  check('Existing administrator login remains available', adminLogin.status === 200);
  const admin = adminLogin.cookie;
  // A prior run may have populated the shared production page cache. Republish
  // the isolated fixture baseline before checking that new proposals stay private.
  const fixtureContent = (await api('/api/admin/content', { cookie: admin })).data.content;
  if ((await api('/api/admin/content', { method: 'PATCH', cookie: admin, body: { section: 'faqs', items: fixtureContent.faqs } })).status !== 200) throw new Error('Unable to initialize the isolated public cache.');
  const legacyNow = Math.floor(Date.now() / 1000);
  const legacyPayload = Buffer.from(JSON.stringify({ v: 1, sub: createHash('sha256').update(`${adminEmail}\0${passwordHash}`).digest('base64url'), iat: legacyNow, exp: legacyNow + 28800, nonce: randomBytes(32).toString('base64url') })).toString('base64url');
  const legacyToken = `${legacyPayload}.${createHmac('sha256', environment.ADMIN_SESSION_SECRET).update(legacyPayload).digest('base64url')}`;
  await qa.connection.execute('INSERT INTO admin_sessions (token_hash,expires_at,created_at) VALUES (?,?,?)', [createHash('sha256').update(legacyToken).digest('hex'), (legacyNow + 28800) * 1000, Date.now()]);
  check('Administrator sessions issued before the staff upgrade remain valid', (await api('/api/admin/content', { cookie: `syscode_admin_session=${legacyToken}` })).status === 200);
  const administratorPage = await (await fetch(`${base}/admin`, { headers: { Cookie: admin } })).text();
  check('Server-only credential proofs and password hashes stay out of dashboard HTML', !administratorPage.includes('credentialVersion') && !administratorPage.includes('scrypt:') && !administratorPage.includes(environment.ADMIN_STORAGE_KEY));
  for (const route of ['/api/admin/staff', '/api/admin/approvals']) check(`Unauthenticated requests cannot read ${route}`, (await api(route)).status === 401);
  for (const route of ['/api/admin/register', '/api/register', '/admin/register']) check(`No public staff registration exists at ${route}`, (await api(route, { method: 'POST', body: { email: staffEmail, password: staffPassword } })).status === 404);
  check('Staff account creation enforces same-origin requests', (await api('/api/admin/staff', { method: 'POST', cookie: admin, origin: 'https://example.invalid', body: { name: 'QA Staff', email: staffEmail, password: staffPassword } })).status === 403);
  check('Weak staff passwords are rejected', (await api('/api/admin/staff', { method: 'POST', cookie: admin, body: { name: 'QA Staff', email: staffEmail, password: 'short' } })).status === 400);
  check('Client-supplied admin roles cannot be used when creating staff', (await api('/api/admin/staff', { method: 'POST', cookie: admin, body: { name: 'QA Staff', email: staffEmail, password: staffPassword, role: 'admin' } })).status === 400);
  check('The administrator email cannot be reused for a staff account', (await api('/api/admin/staff', { method: 'POST', cookie: admin, body: { name: 'Collision', email: adminEmail, password: staffPassword } })).status === 409);
  const created = await api('/api/admin/staff', { method: 'POST', cookie: admin, body: { name: 'QA Staff Author', email: staffEmail, password: staffPassword } });
  check('Administrator can create a staff account without registration', created.status === 201 && Boolean(created.data.member?.id));
  const staffId = created.data.member.id;
  check('Staff API responses contain no password or password hash', !JSON.stringify(created.data).includes(staffPassword) && !JSON.stringify(created.data).includes('scrypt:'));
  const otherCreated = await api('/api/admin/staff', { method: 'POST', cookie: admin, body: { name: 'QA Other Staff', email: otherEmail, password: staffPassword } });
  check('Multiple staff accounts are supported', otherCreated.status === 201);
  const otherId = otherCreated.data.member.id;
  const [[storedStaff]] = await qa.connection.execute('SELECT password_hash FROM staff_accounts WHERE id=?', [staffId]);
  check('Staff passwords are salted scrypt hashes in MySQL', /^scrypt:32768:8:3:/.test(storedStaff.password_hash) && !storedStaff.password_hash.includes(staffPassword));
  const staffLogin = await login(staffEmail, staffPassword);
  check('A created staff member can sign in using the shared login', staffLogin.status === 200);
  let staff = staffLogin.cookie;
  const otherLogin = await login(otherEmail, staffPassword);
  const other = otherLogin.cookie;
  for (const route of ['/api/admin/staff', `/api/admin/staff/${staffId}`]) check(`Staff cannot access account management: ${route}`, (await api(route, { cookie: staff, method: route.endsWith(staffId) ? 'PATCH' : 'GET', body: route.endsWith(staffId) ? { active: true } : undefined })).status === 403);
  check('Staff cannot create another account', (await api('/api/admin/staff', { cookie: staff, method: 'POST', body: { name: 'Unauthorized', email: 'unauthorized@example.invalid', password: staffPassword } })).status === 403);
  check('Staff cannot reset passwords through the management API', (await api(`/api/admin/staff/${otherId}/password`, { cookie: staff, method: 'POST', body: { password: staffPassword } })).status === 403);
  const contentResponse = await api('/api/admin/content', { cookie: staff });
  check('Staff can read the same published packages, projects, and questions', contentResponse.status === 200 && contentResponse.data.content.packages.length === 3);
  const originalContent = contentResponse.data.content;
  const faqs = structuredClone(originalContent.faqs);
  faqs[0] = { question: `Staff proposal awaiting approval? ${runId}`, answer: 'This synthetic answer must stay private until approved.' };
  check('Staff submissions must include a published baseline revision', (await api('/api/admin/content', { method: 'PATCH', cookie: staff, body: { section: 'faqs', items: faqs } })).status === 400);
  const submit = await api('/api/admin/content', { method: 'PATCH', cookie: staff, body: { section: 'faqs', items: faqs, baseHash: contentResponse.data.revisions.faqs } });
  check('Staff content changes are queued instead of published', submit.status === 202 && Boolean(submit.data.request?.id));
  const requestId = submit.data.request.id;
  const stillPublished = (await api('/api/admin/content', { cookie: admin })).data.content;
  check('Pending staff changes leave published MySQL content unchanged', JSON.stringify(stillPublished.faqs) === JSON.stringify(originalContent.faqs));
  const pendingHome = await (await fetch(base)).text();
  check('Pending staff changes never appear in the public website response', !pendingHome.includes(faqs[0].question));
  const [[storedRequest]] = await qa.connection.execute('SELECT payload FROM change_requests WHERE id=?', [requestId]);
  check('Proposed changes and review snapshots are encrypted in MySQL', !storedRequest.payload.includes(faqs[0].question) && !storedRequest.payload.includes(faqs[0].answer));
  check('Staff can inspect their own proposed change', (await api(`/api/admin/approvals/${requestId}`, { cookie: staff })).status === 200);
  check('Another staff member cannot inspect that proposed change', (await api(`/api/admin/approvals/${requestId}`, { cookie: other })).status === 404);
  const otherRequests = await api('/api/admin/approvals', { cookie: other });
  check('Staff submission lists contain only their own requests', !JSON.stringify(otherRequests.data).includes(requestId));
  check('Staff cannot approve their own changes', (await api(`/api/admin/approvals/${requestId}`, { method: 'POST', cookie: staff, body: { decision: 'approve' } })).status === 403);
  const approved = await api(`/api/admin/approvals/${requestId}`, { method: 'POST', cookie: admin, body: { decision: 'approve' } });
  check('Only administrator approval publishes a staff content change', approved.status === 200);
  check('Approved content becomes visible on the public website', (await (await fetch(base)).text()).includes(faqs[0].question));
  check('The same approved request cannot publish twice', (await api(`/api/admin/approvals/${requestId}`, { method: 'POST', cookie: admin, body: { decision: 'approve' } })).status === 409);
  const latest = await api('/api/admin/content', { cookie: staff });
  const rejectedFaqs = structuredClone(latest.data.content.faqs);
  rejectedFaqs[0].answer = 'Rejected synthetic staff answer.';
  const rejectedSubmit = await api('/api/admin/content', { method: 'PATCH', cookie: staff, body: { section: 'faqs', items: rejectedFaqs, baseHash: latest.data.revisions.faqs } });
  const rejectId = rejectedSubmit.data.request.id;
  check('Administrator can reject a proposal with feedback', (await api(`/api/admin/approvals/${rejectId}`, { method: 'POST', cookie: admin, body: { decision: 'reject', reason: 'Please revise this answer.' } })).status === 200);
  check('Rejected content does not replace the approved website content', (await api('/api/admin/content', { cookie: admin })).data.content.faqs[0].answer === faqs[0].answer);
  const rejectedDetail = await api(`/api/admin/approvals/${rejectId}`, { cookie: staff });
  check('Staff can read the rejection reason', JSON.stringify(rejectedDetail.data).includes('Please revise this answer.'));
  const [[reviewRow]] = await qa.connection.execute('SELECT review_reason FROM change_requests WHERE id=?', [rejectId]);
  check('Private review feedback is encrypted in MySQL too', !reviewRow.review_reason.includes('Please revise this answer.'));
  const staleSubmit = await api('/api/admin/content', { method: 'PATCH', cookie: staff, body: { section: 'faqs', items: rejectedFaqs, baseHash: latest.data.revisions.faqs } });
  const adminFaqs = structuredClone(latest.data.content.faqs);
  adminFaqs[0].answer = 'New administrator answer published after the staff draft.';
  check('Administrator edits can still publish immediately', (await api('/api/admin/content', { method: 'PATCH', cookie: admin, body: { section: 'faqs', items: adminFaqs } })).status === 200);
  check('A stale staff request cannot overwrite newer administrator content', (await api(`/api/admin/approvals/${staleSubmit.data.request.id}`, { method: 'POST', cookie: admin, body: { decision: 'approve' } })).status === 409);
  check('A stale request can still be rejected', (await api(`/api/admin/approvals/${staleSubmit.data.request.id}`, { method: 'POST', cookie: admin, body: { decision: 'reject', reason: 'The published answer has changed.' } })).status === 200);
  const tamperBaseline = await api('/api/admin/content', { cookie: staff });
  const tamperFaqs = structuredClone(tamperBaseline.data.content.faqs);
  tamperFaqs[0].answer = 'The encrypted proposal must be authenticated before publication.';
  const tamperSubmit = await api('/api/admin/content', { method: 'PATCH', cookie: staff, body: { section: 'faqs', items: tamperFaqs, baseHash: tamperBaseline.data.revisions.faqs } });
  const tamperId = tamperSubmit.data.request.id;
  const [[untampered]] = await qa.connection.execute('SELECT payload FROM change_requests WHERE id=?', [tamperId]);
  const envelope = JSON.parse(untampered.payload);
  envelope.ciphertext = (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1);
  await qa.connection.execute('UPDATE change_requests SET payload=? WHERE id=?', [JSON.stringify(envelope), tamperId]);
  try {
    check('A tampered proposal cannot be approved', (await api(`/api/admin/approvals/${tamperId}`, { method: 'POST', cookie: admin, body: { decision: 'approve' } })).status === 503);
    check('Failed authentication leaves published content untouched', (await api('/api/admin/content', { cookie: admin })).data.content.faqs[0].answer === adminFaqs[0].answer);
    const [[pendingRow]] = await qa.connection.execute('SELECT status FROM change_requests WHERE id=?', [tamperId]);
    check('A failed approval leaves the request pending', pendingRow.status === 'pending');
  } finally { await qa.connection.execute('UPDATE change_requests SET payload=? WHERE id=?', [untampered.payload, tamperId]); }
  await api(`/api/admin/approvals/${tamperId}`, { method: 'POST', cookie: admin, body: { decision: 'reject', reason: 'Synthetic tamper test is complete.' } });
  const inquiryPayload = { fullName: 'Staff Workflow QA Enquiry', email: 'staff-enquiry@example.invalid', phoneNumber: '+94770000001', businessName: 'Isolated Staff QA', serviceRequired: 'Business Website', preferredPackage: 'Basic', estimatedBudget: 'Rs. 10,000', projectDescription: 'Synthetic request to verify approval of private notes.' };
  check('The public form continues accepting enquiries', (await api('/api/contact', { method: 'POST', body: inquiryPayload })).status === 200);
  const inbox = await api('/api/admin/inquiries', { cookie: staff });
  const inquiry = inbox.data.inquiries.find((item) => item.email === inquiryPayload.email);
  check('Staff can read the shared enquiry inbox', Boolean(inquiry));
  const proposedNotes = 'Private staff note requiring administrator approval.';
  const notesSubmit = await api(`/api/admin/inquiries/${inquiry.id}`, { method: 'PATCH', cookie: staff, body: { status: 'won', notes: proposedNotes, baseHash: inbox.data.revisions[inquiry.id] } });
  check('Staff enquiry status and note changes also require approval', notesSubmit.status === 202);
  const pendingInquiry = (await api('/api/admin/inquiries', { cookie: admin })).data.inquiries.find((item) => item.id === inquiry.id);
  check('The shared inbox keeps its approved status and notes while a request is pending', pendingInquiry.status === 'new' && pendingInquiry.notes === '');
  const [[storedNotes]] = await qa.connection.execute('SELECT payload FROM change_requests WHERE id=?', [notesSubmit.data.request.id]);
  check('Pending private notes are never stored as plaintext', !storedNotes.payload.includes(proposedNotes));
  check('Administrator can approve staff enquiry changes', (await api(`/api/admin/approvals/${notesSubmit.data.request.id}`, { method: 'POST', cookie: admin, body: { decision: 'approve' } })).status === 200);
  const approvedInquiry = (await api('/api/admin/inquiries', { cookie: admin })).data.inquiries.find((item) => item.id === inquiry.id);
  check('Approved enquiry notes and status become the shared record', approvedInquiry.status === 'won' && approvedInquiry.notes === proposedNotes);
  const rawToken = staff.slice(staff.indexOf('=') + 1);
  const [encoded, signature] = rawToken.split('.');
  const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  claims.role = 'admin';
  const forgedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const cookieName = staff.slice(0, staff.indexOf('='));
  check('Changing a staff cookie role cannot grant administrator access', (await api('/api/admin/staff', { cookie: `${cookieName}=${forgedPayload}.${signature}` })).status === 401);
  claims.id = 'admin';
  claims.sub = createHash('sha256').update(`admin\0admin\0${adminEmail}\0${passwordHash}`).digest('base64url');
  const signedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signedForgedToken = `${signedPayload}.${createHmac('sha256', environment.ADMIN_SESSION_SECRET).update(signedPayload).digest('base64url')}`;
  await qa.connection.execute('INSERT INTO admin_sessions (token_hash,expires_at,created_at,account_id,account_role) VALUES (?,?,?,?,?)', [createHash('sha256').update(signedForgedToken).digest('hex'), Date.now() + 60000, Date.now(), staffId, 'staff']);
  check('Database account identity prevents a signed role mismatch from escalating access', (await api('/api/admin/staff', { cookie: `${cookieName}=${signedForgedToken}` })).status === 401);
  check('Administrator can disable staff immediately', (await api(`/api/admin/staff/${staffId}`, { method: 'PATCH', cookie: admin, body: { active: false } })).status === 200);
  check('Disabling staff revokes their existing sessions', (await api('/api/admin/content', { cookie: staff })).status === 401);
  check('Disabled staff cannot sign in', (await login(staffEmail, staffPassword)).status === 401);
  check('Administrator can re-enable a staff member', (await api(`/api/admin/staff/${staffId}`, { method: 'PATCH', cookie: admin, body: { active: true } })).status === 200);
  check('Re-enabling does not restore revoked sessions', (await api('/api/admin/content', { cookie: staff })).status === 401);
  staff = (await login(staffEmail, staffPassword)).cookie;
  const nextPassword = randomBytes(24).toString('base64url');
  check('Administrator can reset a staff password', (await api(`/api/admin/staff/${staffId}/password`, { method: 'POST', cookie: admin, body: { password: nextPassword } })).status === 200);
  const staleActor = { id: staffId, role: 'staff', name: 'QA Staff Author', email: staffEmail, credentialVersion: createHash('sha256').update(`${staffId}\0staff\0${staffEmail}\0${storedStaff.password_hash}`).digest('base64url') };
  const staleResult = await worker.run('staff-content', environment, { actor: staleActor, section: 'faqs', items: tamperFaqs, baseHash: tamperBaseline.data.revisions.faqs });
  check('An in-flight mutation authenticated before password reset cannot commit afterward', !staleResult.ok && staleResult.status === 401);
  check('Staff password reset revokes previous sessions', (await api('/api/admin/content', { cookie: staff })).status === 401);
  check('The previous staff password stops working after reset', (await login(staffEmail, staffPassword)).status === 401);
  staff = (await login(staffEmail, nextPassword)).cookie;
  check('The replacement staff password works', Boolean(staff));
  check('Account changes cannot collide with the administrator email', (await api(`/api/admin/staff/${staffId}`, { method: 'PATCH', cookie: admin, body: { email: adminEmail } })).status === 409);
  check('Administrator can remove a staff account', (await api(`/api/admin/staff/${otherId}`, { method: 'DELETE', cookie: admin })).status === 200);
  check('Removed staff lose their sessions', (await api('/api/admin/content', { cookie: other })).status === 401);
  check('Removed staff cannot sign in again', (await login(otherEmail, staffPassword)).status === 401);

  // Exercise the actual role-specific forms after React has attached handlers.
  browser = await openTestBrowser(output);
  await browser.viewport(1440);
  const browserLogin = async (email, password) => {
    await browser.command('Page.navigate', { url: `${base}/admin/login` });
    await browser.waitFor("document.readyState==='complete'&&(()=>{const form=document.querySelector('[data-admin-login] form');return Boolean(form&&Object.keys(form).some(key=>key.startsWith('__reactProps$')&&typeof form[key]?.onSubmit==='function'))})()", 'interactive login form');
    await browser.type('#admin-email', email); await browser.type('#admin-password', password);
    await browser.click('form button[type=submit]');
    await browser.waitFor("location.pathname==='/admin'&&Boolean(document.querySelector('[data-admin-dashboard]'))", 'dashboard');
  };
  await browserLogin(adminEmail, adminPassword);
  for (const width of [320, 768, 1440, 3840, 7680]) {
    await browser.viewport(width);
    for (const view of ['staff', 'approvals']) {
      await browser.click(`[data-admin-view=${view}]`);
      await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(view === 'staff' ? '[data-staff-management]' : '[data-change-requests]')}))`, `active ${view} panel`);
      await pause(120);
      check(`Administrator ${view} panel fits at ${width}px`, await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1'));
    }
    if ([320, 1440].includes(width)) await browser.screenshot(`approvals-${width}.png`);
  }
  await browser.viewport(320, 844);
  await browser.click('[data-admin-view=staff]');
  await browser.evaluate("[...document.querySelectorAll('[data-staff-management] button')].find(button=>button.textContent.includes('Add staff')).click()");
  await browser.waitFor("Boolean(document.querySelector('form[data-staff-form=create]'))", 'create staff dialog');
  check('Staff creation dialog fits on a mobile screen', await browser.evaluate("(()=>{const box=document.querySelector('dialog[open]').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth+1})()"));
  const uiStaffEmail = 'staff-created-in-browser@example.invalid';
  await browser.type('[data-staff-form=create] input[name=name]', 'Browser Created Staff');
  await browser.type('[data-staff-form=create] input[name=email]', uiStaffEmail);
  await browser.type('[data-staff-form=create] input[name=password]', randomBytes(24).toString('base64url'));
  check('Staff passwords are masked in the creation form', await browser.evaluate("document.querySelector('[data-staff-form=create] input[name=password]').type==='password'"));
  await browser.click('[data-staff-form=create] button[type=submit]');
  await browser.waitFor("!document.querySelector('dialog[open]')&&document.querySelector('[data-staff-management]').textContent.includes('staff-created-in-browser@example.invalid')", 'created staff card');
  check('Administrator can create staff through the actual browser form', (await api('/api/admin/staff', { cookie: admin })).data.staff.some((member) => member.email === uiStaffEmail));
  await browser.viewport(1440);
  await browser.command('Network.clearBrowserCookies');
  await browserLogin(staffEmail, nextPassword);
  check('Staff navigation hides account management', await browser.evaluate("!document.querySelector('[data-admin-view=staff]')"));
  check('Staff can open their own submissions', await browser.evaluate("Boolean(document.querySelector('[data-admin-view=approvals]'))"));
  await browser.click('[data-admin-view=faqs]');
  const browserQuestion = `Does a browser staff edit wait for approval? ${runId}`;
  await browser.type('[data-admin-editor=faqs] input', browserQuestion);
  await browser.click('[data-admin-editor=faqs] button[type=submit]');
  await browser.waitFor("document.querySelector('[data-admin-editor=faqs] [role=status]')?.textContent.toLowerCase().includes('approv')", 'pending submit message');
  check('Browser staff edits show an approval notice', true);
  check('A browser staff submission stays off the live website', !(await (await fetch(base)).text()).includes(browserQuestion));
  await browser.click('[data-admin-view=approvals]');
  await browser.waitFor("Boolean(document.querySelector('[data-change-requests]'))", 'staff submissions');
  check('Staff submissions view has no approve or reject controls', await browser.evaluate("![...document.querySelectorAll('[data-change-requests] button')].some(button=>/^(Approve|Reject)/i.test(button.textContent.trim()))"));
  await browser.screenshot('staff-submissions-1440.png');
  const browserRequestList = (await api('/api/admin/approvals', { cookie: staff })).data.requests;
  const browserRequest = browserRequestList.find((request) => request.status === 'pending' && request.target === 'faqs');
  await browser.command('Network.clearBrowserCookies');
  await browserLogin(adminEmail, adminPassword);
  await browser.click('[data-admin-view=approvals]');
  await browser.click(`[data-request-id="${browserRequest.id}"] button`);
  await browser.waitFor(`document.querySelector('[data-review-dialog]')?.textContent.includes(${JSON.stringify(browserQuestion)})`, 'before and proposed review');
  check('Administrator review displays the staff proposal before publishing', await browser.evaluate("document.querySelector('[data-review-dialog]').textContent.includes('Before')&&document.querySelector('[data-review-dialog]').textContent.includes('Proposed')"));
  for (const width of [320, 1440]) {
    await browser.viewport(width, width === 320 ? 844 : 900);
    check(`Approval details fit at ${width}px`, await browser.evaluate("(()=>{const box=document.querySelector('[data-review-dialog]').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth+1})()"));
    await browser.screenshot(`review-dialog-${width}.png`);
  }
  await browser.click('[data-review-dialog] form button[type=submit]');
  await eventually(async () => (await api(`/api/admin/approvals/${browserRequest.id}`, { cookie: admin })).data.request.status === 'approved', 'browser approval');
  check('Administrator can approve the staff change through the review dialog', (await (await fetch(base)).text()).includes(browserQuestion));
  check('Staff browser workflows have no runtime exceptions', browser.errors.length === 0);
  await browser.close(); browser = null;
} catch (error) {
  failure = error.stack || String(error); console.error(failure);
  if (browser) { try { await browser.screenshot('failure.png'); console.error(JSON.stringify(await browser.evaluate("({path:location.pathname,alert:document.querySelector('[role=alert]')?.textContent,status:document.querySelector('[role=status]')?.textContent})"))); } catch {} }
} finally {
  await browser?.close(); worker?.stop();
  if (server && server.exitCode === null) { const stopped = new Promise((resolve) => server.once('exit', resolve)); server.kill(); await Promise.race([stopped, pause(3000)]); }
  if (qa) { try { await resetQaFixtures(qa.connection); } catch (error) { failure ||= error.message; } await qa.connection.end(); }
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, failure: failure || null }, null, 2));
  console.log(`${checks.length} staff checks; ${checks.filter((item) => !item.pass).length} failures.`);
  if (failure) process.exitCode = 1;
}
