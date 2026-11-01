import { spawn } from 'node:child_process';
import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileStoreWorker, fixtureEnvironment, readQaConfiguration, resetQaFixtures } from './lib/mysql-qa.mjs';

// Production build required. All credentials, enquiries, content changes, and
// MySQL rows stay in an explicitly isolated QA schema. SMTP is disabled.
const output = path.resolve('.next/admin-qa');
const base = 'http://localhost:3110';
const browserPort = 9337;
const email = 'admin-qa@example.invalid';
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 });
const passwordHash = `scrypt:32768:8:3:${salt.toString('hex')}:${hash.toString('hex')}`;
let environment;
let qa;
let fixtureWorker;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
const runtimeErrors = [];
let server;
let edge;
let socket;
let cookie = '';
let failure;
let inspectBrowser;

function check(name, pass) {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) throw new Error(name);
}
async function eventually(operation, label, timeout = 6000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await operation()) return; } catch {}
    await pause(50);
  }
  throw new Error(`Timed out: ${label}`);
}
async function start(config = environment) {
  let error = '';
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3110'], { env: config, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', chunk => { error += chunk.toString(); });
  await eventually(async () => {
    if (server.exitCode !== null) throw new Error(`Server exited: ${error}`);
    return (await fetch(`${base}/api/admin/inquiries`)).status === 401;
  }, 'isolated server', 12000);
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise(resolve => server.once('exit', resolve));
  server.kill();
  await Promise.race([stopped, pause(3000)]);
}
async function api(route, options = {}) {
  const { method = 'GET', body, origin = base, authenticated = true, token = cookie } = options;
  const headers = { ...(origin ? { Origin: origin } : {}), ...(authenticated && token ? { Cookie: token } : {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { response, data };
}

await fs.mkdir(output, { recursive: true });
try {
  qa = await readQaConfiguration();
  environment = {
    ...process.env, ...fixtureEnvironment(qa.environment), NODE_ENV: 'production',
    ADMIN_EMAIL: 'legacy-env-admin@example.invalid', ADMIN_PASSWORD_HASH: passwordHash,
  };
  fixtureWorker = await compileStoreWorker(path.join(output, 'store-fixture'));
  await resetQaFixtures(qa.connection, fixtureWorker, environment, { email, passwordHash });
  await start({ ...environment, ADMIN_EMAIL: '', ADMIN_PASSWORD_HASH: '', ADMIN_SESSION_SECRET: '' });
  check('Unconfigured admin login fails closed', (await api('/api/admin/login', { method: 'POST', body: { email, password } })).response.status === 503);
  await stopServer();
  await start({ ...environment, MYSQL_PORT: '1' });
  check('Unavailable MySQL fails login closed with a temporary error', (await api('/api/admin/login', { method: 'POST', body: { email, password } })).response.status === 503);
  const unavailableLogin = await (await fetch(`${base}/admin/login`)).text();
  check('Login fields remain visible when MySQL is unavailable', unavailableLogin.includes('id="admin-email"') && unavailableLogin.includes('id="admin-password"'));
  await stopServer();
  await start();
  for (const route of ['/api/admin/inquiries', '/api/admin/content']) check(`Private API requires login: ${route}`, (await api(route, { authenticated: false })).response.status === 401);
  const unauthorized = await fetch(`${base}/admin`);
  const unauthorizedHtml = await unauthorized.text();
  check('Dashboard redirects to private login without enquiry data', (unauthorizedHtml.includes('data-admin-login') || (unauthorizedHtml.includes('NEXT_REDIRECT') && unauthorizedHtml.includes('/admin/login'))) && !unauthorizedHtml.includes('data-admin-dashboard'));
  const credentials = { email, password };
  check('Cross-origin login is rejected', (await api('/api/admin/login', { method: 'POST', origin: 'https://example.invalid', body: credentials })).response.status === 403);
  check('Login without an origin is rejected', (await api('/api/admin/login', { method: 'POST', origin: null, body: credentials })).response.status === 403);
  check('Incorrect password is rejected', (await api('/api/admin/login', { method: 'POST', body: { email, password: 'incorrect' } })).response.status === 401);
  check('Legacy environment credentials cannot override the MySQL admin account', (await api('/api/admin/login', { method: 'POST', body: { email: environment.ADMIN_EMAIL, password } })).response.status === 401);
  const signedIn = await api('/api/admin/login', { method: 'POST', body: credentials });
  const setCookie = signedIn.response.headers.get('set-cookie') || '';
  cookie = setCookie.split(';')[0];
  check('Correct login sets a private secure session cookie', signedIn.response.status === 200 && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Secure/i.test(setCookie) && /Path=\//i.test(setCookie));
  const usernameLogin = await api('/api/admin/login', { method: 'POST', body: { identifier: 'administrator', password } });
  check('Administrator can sign in with the username', usernameLogin.response.status === 200);
  if (usernameLogin.response.ok) cookie = (usernameLogin.response.headers.get('set-cookie') || '').split(';')[0];
  const profile = await api('/api/admin/profile');
  check('Administrator profile is private and database-backed', profile.response.status === 200 && profile.data?.profile?.username === 'administrator' && profile.response.headers.get('cache-control')?.includes('no-store'));
  check('Cross-origin profile updates are rejected', (await api('/api/admin/profile', { method: 'PATCH', origin: 'https://example.invalid', body: { phone: '+94770000000', address: 'QA private address', postalCode: '50080' } })).response.status === 403);
  const profileUpdate = await api('/api/admin/profile', { method: 'PATCH', body: { phone: '+94770000000', address: 'QA private address', postalCode: '50080' } });
  const profileReload = await api('/api/admin/profile');
  check('Administrator can update private contact details', profileUpdate.response.status === 200 && profileReload.data?.profile?.phone === '+94770000000' && profileReload.data?.profile?.address === 'QA private address' && profileReload.data?.profile?.postalCode === '50080');
  check('Tampered session is rejected', (await api('/api/admin/inquiries', { token: `${cookie}x` })).response.status === 401);
  const validToken = cookie.slice(cookie.indexOf('=') + 1);
  const expiredPayload = JSON.parse(Buffer.from(validToken.split('.')[0], 'base64url').toString('utf8'));
  expiredPayload.exp = Math.floor(Date.now() / 1000) - 60;
  expiredPayload.iat = expiredPayload.exp - 8 * 60 * 60;
  const encodedExpiredPayload = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
  const expiredSignature = createHmac('sha256', environment.ADMIN_SESSION_SECRET).update(encodedExpiredPayload).digest('base64url');
  check('A correctly signed expired session is rejected', (await api('/api/admin/inquiries', { token: `${cookie.split('=')[0]}=${encodedExpiredPayload}.${expiredSignature}` })).response.status === 401);
  check('Admin responses disable shared caching', (await api('/api/admin/inquiries')).response.headers.get('cache-control')?.includes('no-store'));
  const privateHeaders = (await api('/api/admin/inquiries')).response.headers;
  check('Private responses prevent framing, MIME sniffing, and referrer disclosure', privateHeaders.get('x-frame-options') === 'DENY' && privateHeaders.get('content-security-policy')?.includes("frame-ancestors 'none'") && privateHeaders.get('x-content-type-options') === 'nosniff' && privateHeaders.get('referrer-policy') === 'no-referrer');
  const inquiryPayload = { fullName: 'Admin QA Enquiry', email: 'enquiry-qa@example.invalid', phoneNumber: '+94770000001', businessName: 'Isolated QA', serviceRequired: 'Business Website', preferredPackage: 'Basic – Rs. 10,000+', estimatedBudget: 'Rs. 10,000 – Rs. 25,000', projectDescription: 'This synthetic enquiry verifies the private dashboard and must never be emailed.' };
  const received = await api('/api/contact', { method: 'POST', body: inquiryPayload });
  check('Contact form saves an enquiry without SMTP', received.response.status === 200);
  const inbox = await api('/api/admin/inquiries');
  const inquiry = inbox.data?.inquiries?.find(item => item.email === inquiryPayload.email);
  check('Saved enquiry appears with its original details and new status', inquiry?.fullName === inquiryPayload.fullName && inquiry.status === 'new' && inquiry.emailStatus === 'not_configured');
  check('Cross-origin enquiry mutation is rejected', (await api(`/api/admin/inquiries/${inquiry.id}`, { method: 'PATCH', origin: 'https://example.invalid', body: { status: 'won' } })).response.status === 403);
  check('Enquiry mutation without an origin is rejected', (await api(`/api/admin/inquiries/${inquiry.id}`, { method: 'PATCH', origin: null, body: { status: 'won' } })).response.status === 403);
  check('Unknown enquiry status is rejected', (await api(`/api/admin/inquiries/${inquiry.id}`, { method: 'PATCH', body: { status: 'invalid' } })).response.status === 400);
  const updated = await api(`/api/admin/inquiries/${inquiry.id}`, { method: 'PATCH', body: { status: 'in_progress', notes: 'Call tomorrow; encrypted MySQL persistence check.' } });
  check('Status and private notes save together', updated.response.status === 200 && updated.data.inquiry.status === 'in_progress' && updated.data.inquiry.notes.includes('encrypted MySQL'));
  check('Missing enquiry returns 404', (await api('/api/admin/inquiries/not-found', { method: 'PATCH', body: { notes: 'Nothing' } })).response.status === 404);

  const content = (await api('/api/admin/content')).data.content;
  check('Content starts with the current website packages, demos, and FAQs', content.packages.length === 3 && content.projects.length >= 6 && content.faqs.length >= 7);
  const unsafeProjects = structuredClone(content.projects);
  unsafeProjects[0].demoUrl = 'javascript:alert(1)';
  check('Unsafe demo links are rejected', (await api('/api/admin/content', { method: 'PATCH', body: { section: 'projects', items: unsafeProjects } })).response.status === 400);
  for (const [label, previewImageUrl] of [
    ['script', 'javascript:alert(1)'],
    ['inline data', 'data:image/svg+xml,<svg></svg>'],
    ['protocol relative', '//example.invalid/preview.png'],
    ['credentials', 'https://username:password@example.invalid/preview.png'],
    ['control characters', 'https://example.invalid/pre\nview.png'],
    ['backslashes', 'https://example.invalid\\preview.png'],
  ]) {
    const unsafePreviewProjects = structuredClone(content.projects);
    unsafePreviewProjects[0].previewImageUrl = previewImageUrl;
    check(`Unsafe preview image URLs are rejected: ${label}`, (await api('/api/admin/content', { method: 'PATCH', body: { section: 'projects', items: unsafePreviewProjects } })).response.status === 400);
  }
  const clearedPreviewProjects = structuredClone(content.projects);
  clearedPreviewProjects[0].previewImageUrl = '/images/developer-workspace-background.png';
  const localPreviewSaved = await api('/api/admin/content', { method: 'PATCH', body: { section: 'projects', items: clearedPreviewProjects } });
  check('Local screenshot paths can be saved', localPreviewSaved.response.status === 200 && localPreviewSaved.data.content.projects[0].previewImageUrl === clearedPreviewProjects[0].previewImageUrl);
  clearedPreviewProjects[0].previewImageUrl = '';
  const previewCleared = await api('/api/admin/content', { method: 'PATCH', body: { section: 'projects', items: clearedPreviewProjects } });
  const clearedContent = (await api('/api/admin/content')).data.content;
  check('Screenshot URLs can be cleared without removing the project', previewCleared.response.status === 200 && clearedContent.projects[0].previewImageUrl === '' && clearedContent.projects[0].id === content.projects[0].id);
  check('Cross-origin content publishing is rejected', (await api('/api/admin/content', { method: 'PATCH', origin: 'https://example.invalid', body: { section: 'faqs', items: content.faqs } })).response.status === 403);
  check('Content publishing without an origin is rejected', (await api('/api/admin/content', { method: 'PATCH', origin: null, body: { section: 'faqs', items: content.faqs } })).response.status === 403);
  const packages = structuredClone(content.packages);
  packages[0].name = 'QA Launch Website';
  packages[0].startPrice = 12500;
  packages[0].description = 'The updated package description from the admin dashboard.';
  const projects = structuredClone(content.projects);
  projects[0].name = 'QA Live Demo';
  projects[0].demoUrl = 'https://example.invalid/demo';
  projects[0].previewImageUrl = 'https://example.invalid/preview.png';
  projects[1].demoUrl = 'https://example.invalid/demo';
  projects[2].demoUrl = 'https://example.invalid/demo';
  projects[2].previewImageUrl = 'https://example.invalid/missing.png';
  projects[3].demoUrl = 'https://example.invalid/blocked';
  const faqs = structuredClone(content.faqs);
  faqs[0] = { question: 'Does the dashboard publish questions?', answer: 'Yes, this answer was saved through the private content editor.' };
  for (const [section, items] of [['packages', packages], ['projects', projects], ['faqs', faqs]]) {
    check(`Admin saves ${section}`, (await api('/api/admin/content', { method: 'PATCH', body: { section, items } })).response.status === 200);
  }
  const home = await (await fetch(base)).text();
  const pricing = await (await fetch(`${base}/pricing`)).text();
  const portfolio = await (await fetch(`${base}/portfolio`)).text();
  check('Published package changes reach the landing and pricing pages', home.includes('QA Launch Website') && pricing.includes('QA Launch Website') && pricing.includes('12,500'));
  check('Published demos and safe demo links reach the portfolio', home.includes('QA Live Demo') && portfolio.includes('https://example.invalid/demo'));
  const savedProjects = (await api('/api/admin/content')).data.content.projects;
  check('Screenshot URLs publish and persist with the project details', savedProjects[0].previewImageUrl === projects[0].previewImageUrl && home.includes(projects[0].previewImageUrl) && portfolio.includes(projects[0].previewImageUrl));
  check('Published FAQs reach the landing page', home.includes('Does the dashboard publish questions?'));
  check('Public pages contain no private enquiry notes or email', !home.includes(inquiryPayload.email) && !home.includes('encrypted MySQL persistence check'));
  const [[storedInquiry]] = await qa.connection.execute('SELECT payload FROM inquiries WHERE id = ?', [inquiry.id]);
  check('MySQL stores encrypted enquiry payloads without plaintext personal data', JSON.parse(storedInquiry.payload).algorithm === 'aes-256-gcm' && !storedInquiry.payload.includes(inquiryPayload.email) && !storedInquiry.payload.includes('Call tomorrow'));
  for (const route of ['/.data/private-state.json', '/private-state.json', '/.env.local', '/.admin-test-data/mysql-qa/config.json']) check(`Private files are not served: ${route}`, (await fetch(`${base}${route}`)).status === 404);
  await stopServer();
  await start();
  const persisted = (await api('/api/admin/inquiries')).data.inquiries;
  const persistedContent = (await api('/api/admin/content')).data.content;
  check('Enquiries, notes, and sessions survive a server restart', persisted.some(item => item.id === inquiry.id && item.status === 'in_progress' && item.notes.includes('encrypted MySQL')));
  check('Published content survives a server restart', persistedContent.packages[0].name === packages[0].name && persistedContent.faqs[0].question === faqs[0].question && persistedContent.projects[0].previewImageUrl === projects[0].previewImageUrl);
  await stopServer();
  const rotatedSalt = randomBytes(16);
  const rotatedHash = scryptSync(randomBytes(24), rotatedSalt, 64, { N: 32768, r: 8, p: 3, maxmem: 128 * 1024 * 1024 });
  await qa.connection.execute('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE singleton_id = 1', [`scrypt:32768:8:3:${rotatedSalt.toString('hex')}:${rotatedHash.toString('hex')}`, Date.now()]);
  await start();
  check('Changing the admin password invalidates existing signed sessions', (await api('/api/admin/inquiries')).response.status === 401);
  await stopServer();
  await qa.connection.execute('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE singleton_id = 1', [passwordHash, Date.now()]);
  await start();

  // Drive the actual login and responsive dashboard with real browser inputs.
  const browser = process.env.ADMIN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  edge = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', `--remote-debugging-port=${browserPort}`, `--user-data-dir=${path.join(output, 'edge-profile')}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  await eventually(async () => (await fetch(`http://localhost:${browserPort}/json/version`)).ok, 'headless browser');
  const target = await (await fetch(`http://localhost:${browserPort}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const previewRequests = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Fetch.requestPaused') {
      const { request, requestId } = message.params;
      previewRequests.push({ url: request.url, referrer: request.headers.Referer || request.headers.referer });
      const pathname = new URL(request.url).pathname;
      const image = pathname === '/preview.png';
      const missing = pathname === '/missing.png';
      const blocked = pathname === '/blocked';
      const body = image
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="white"/><rect width="1280" height="90" fill="#ff6600"/><text x="70" y="60" font-size="32" fill="white">PREVIEW STUDIO</text><text x="70" y="230" font-size="70">A website worth seeing.</text><rect x="70" y="300" width="1140" height="420" rx="20" fill="#fff0e5"/></svg>'
        : `<!doctype html><html><head><style>body{margin:0;background:white;font:32px Arial}header{padding:28px 60px;background:#ff6600;color:white}main{padding:60px}h1{font-size:76px;max-width:900px}.panel{height:300px;background:#fff0e5;border-radius:24px}</style></head><body><header>LIVE DEMO STUDIO</header><main><h1>Actual website preview.</h1><div class="panel"></div></main><script>let parentBlocked=false;try{void parent.document.body}catch{parentBlocked=true}parent.postMessage({projectPreviewQA:true,parentBlocked},'*')</script></body></html>`;
      command('Fetch.fulfillRequest', {
        requestId,
        responseCode: missing ? 404 : 200,
        responseHeaders: [{ name: 'Content-Type', value: image ? 'image/svg+xml' : 'text/html' }, ...(blocked ? [{ name: 'X-Frame-Options', value: 'DENY' }] : [])],
        body: Buffer.from(missing ? 'Missing test image' : body).toString('base64'),
      }).catch(error => runtimeErrors.push(error.message));
    }
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') runtimeErrors.push(message.params.args.map(arg => arg.description || arg.value).join(' '));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method)); }, 6000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  inspectBrowser = evaluate;
  const viewport = (width, height = 900) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
  const visible = selector => `(()=>{const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>{const box=item.getBoundingClientRect();return box.width>0&&box.height>0;});if(!element)throw Error('Missing visible control');return element;})()`;
  const click = async selector => {
    await eventually(() => evaluate(`Boolean(${visible(selector)})`), `visible ${selector}`);
    await evaluate(`${visible(selector)}.scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);
    await pause(50);
    const point = await evaluate(`(()=>{const box=${visible(selector)}.getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2};})()`);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const type = async (selector, value) => {
    await eventually(() => evaluate(`Boolean(${visible(selector)})`), `visible ${selector}`);
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.focus();input.select();})()`);
    await command('Input.insertText', { text: value });
  };
  await command('Runtime.enable');
  await command('Page.enable');
  // Browser-only fixtures: no third-party site receives these test requests.
  await command('Fetch.enable', { patterns: [{ urlPattern: 'https://example.invalid/*', requestStage: 'Request' }] });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: "window.__projectPreviewMessages=[];addEventListener('message',event=>{if(event.data?.projectPreviewQA)window.__projectPreviewMessages.push({blocked:event.data.parentBlocked,origin:event.origin})})" });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await viewport(1440);
  await command('Page.navigate', { url: `${base}/admin/login` });
  await eventually(() => evaluate("Boolean(document.getElementById('admin-email'))"), 'login inputs');
  await type('#admin-email', email);
  await type('#admin-password', password);
  await click('form button[type="submit"]');
  await eventually(() => evaluate("location.pathname==='/admin'&&Boolean(document.querySelector('[data-admin-dashboard]'))"), 'authenticated dashboard', 12000);
  check('Browser login opens the protected dashboard', true);
  for (const width of [320, 768, 1440, 3840, 7680]) {
    await viewport(width, width === 320 ? 844 : 900);
    await pause(60);
    for (const view of ['overview', 'inquiries', 'packages', 'projects', 'faqs', 'profile']) {
      await click(`[data-admin-view="${view}"]`);
      await pause(80);
      check(`Admin ${view} has no horizontal overflow at ${width}px`, await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1'));
    }
    if ([320, 1440, 3840].includes(width)) {
      await click('[data-admin-view="overview"]');
      const { data } = await command('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(output, `dashboard-${width}.png`), Buffer.from(data, 'base64'));
    }
  }
  await viewport(1440);
  await click('[data-admin-view="projects"]');
  check('Project editor includes a screenshot URL field', await evaluate("[...document.querySelectorAll('[data-admin-editor=projects] label')].some(label=>label.textContent.includes('Preview screenshot URL'))"));
  await evaluate("[...document.querySelectorAll('[data-admin-editor=projects] button')].find(button=>button.textContent==='Check project preview').click()");
  await eventually(() => evaluate("document.querySelector('[data-admin-editor=projects] [data-project-preview=image] img')?.naturalWidth>0"), 'admin screenshot preview');
  check('Admin can check the saved screenshot before publishing', true);
  await click('[data-admin-view="packages"]');
  check('Editor displays current saved package names and prices', await evaluate("document.querySelector('[data-admin-editor=packages]')?.textContent.includes('package')&&[...document.querySelectorAll('input')].some(input=>input.value==='QA Launch Website')"));
  await click('[data-admin-view="inquiries"]');
  await click('button[aria-label="View enquiry from Admin QA Enquiry"]');
  await eventually(() => evaluate("Boolean(document.querySelector('dialog[open] #inquiry-notes'))"), 'enquiry dialog');
  await type('#inquiry-notes', 'Browser saved private notes.');
  await evaluate("(()=>{const select=document.getElementById('inquiry-status');select.value='won';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await click('dialog form button[type="submit"]');
  await eventually(async () => (await api('/api/admin/inquiries')).data.inquiries.some(item => item.id === inquiry.id && item.status === 'won' && item.notes === 'Browser saved private notes.'), 'browser enquiry save');
  check('Browser enquiry dialog saves status and private notes', true);
  await viewport(320, 844);
  check('Enquiry dialog fits the mobile viewport', await evaluate("(()=>{const box=document.querySelector('dialog[open]').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth+1;})()"));
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await eventually(() => evaluate("!document.querySelector('dialog[open]')"), 'keyboard dialog close');
  check('Escape closes the enquiry dialog', true);
  await viewport(1440);
  await click('[data-admin-view="faqs"]');
  await type('[data-admin-editor="faqs"] input', 'Can I edit questions in the dashboard?');
  await click('[data-admin-editor="faqs"] button[type="submit"]');
  await eventually(async () => (await api('/api/admin/content')).data.content.faqs[0].question === 'Can I edit questions in the dashboard?', 'browser FAQ save');
  check('Browser FAQ editor publishes the changed question', (await (await fetch(base)).text()).includes('Can I edit questions in the dashboard?'));
  await click('[data-admin-view="packages"]');
  await type('[data-admin-editor="packages"] input[type="number"]', '15000');
  await click('[data-admin-editor="packages"] button[type="submit"]');
  await eventually(async () => (await api('/api/admin/content')).data.content.packages[0].startPrice === 15000, 'browser price save');
  await eventually(() => evaluate("document.querySelector('[data-admin-editor=packages] [role=status]')?.textContent.includes('Changes saved')&&document.querySelector('[data-admin-editor=packages] button[type=submit]')?.disabled===true"), 'package save confirmation');
  await click('header a[href="/"]');
  await eventually(() => evaluate("location.pathname==='/'&&Boolean(document.getElementById('pricing'))&&[...document.querySelectorAll('#contact select[name=preferredPackage] option')].some(option=>option.value.includes('15,000'))"), 'fresh website navigation');
  check('View website displays newly saved pricing in the same browser', true);
  await click('a[href="/?package=basic#contact"]');
  await eventually(() => evaluate("document.querySelector('#contact select[name=preferredPackage]')?.value.includes('QA Launch')&&document.querySelector('#contact select[name=preferredPackage]')?.value.includes('15,000')"), 'renamed package selection');
  check('Stable package links prefill the renamed package at its new price', true);
  await evaluate("document.getElementById('portfolio').scrollIntoView({block:'start',behavior:'instant'})");
  await eventually(() => evaluate("document.querySelector('#portfolio [data-project-preview=image] img')?.naturalWidth>0&&Boolean(document.querySelector('#portfolio [data-project-preview=website] iframe'))"), 'landing page website previews');
  check('Saved links and screenshots show previews on the homepage too', true);
  await command('Page.navigate', { url: `${base}/portfolio` });
  await eventually(() => evaluate("Boolean(document.querySelector('[data-project-preview=image] img'))"), 'portfolio previews');
  await evaluate("document.querySelector('[data-project-preview=image]').scrollIntoView({block:'center',behavior:'instant'})");
  await eventually(() => evaluate("document.querySelector('[data-project-preview=image] img')?.naturalWidth>0"), 'public screenshot image');
  check('Saved screenshots replace the concept placeholder and take priority over embedding', await evaluate("document.querySelector('[data-project-preview=image] img').getAttribute('src')==='https://example.invalid/preview.png'&&!document.querySelector('[data-project-preview=image] iframe')"));
  const demoFrame = `iframe[title="Website preview of ${projects[1].name}"]`;
  await evaluate(`document.querySelectorAll('[data-project-preview=website]')[0].scrollIntoView({block:'center',behavior:'instant'})`);
  await eventually(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(demoFrame)}))&&window.__projectPreviewMessages.length>0`), 'real embedded website');
  check('A demo URL renders an actual website frame automatically', true);
  check('Embedded scripts cannot read the parent document', await evaluate("window.__projectPreviewMessages.every(message=>message.blocked&&message.origin==='null')"));
  check('Preview frames deny sensitive features and keyboard interaction', await evaluate(`(()=>{const frame=document.querySelector(${JSON.stringify(demoFrame)});return frame.getAttribute('sandbox')==='allow-scripts'&&frame.referrerPolicy==='no-referrer'&&frame.tabIndex===-1&&frame.inert&&frame.getAttribute('allow').includes("camera 'none'");})()`));
  for (const width of [320, 768, 1440, 3840, 7680]) {
    await viewport(width);
    await evaluate(`document.querySelectorAll('[data-project-preview=website]')[0].scrollIntoView({block:'center',behavior:'instant'})`);
    await eventually(() => evaluate(`(()=>{const frame=document.querySelector(${JSON.stringify(demoFrame)});if(!frame)return false;const box=frame.getBoundingClientRect();const parent=frame.parentElement.getBoundingClientRect();return Math.abs(box.width-parent.width)<1&&Math.abs(box.height-parent.height)<1})()`), `scaled preview at ${width}px`);
    check(`Website previews fit without page overflow at ${width}px`, await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1'));
    if ([320, 1440].includes(width)) {
      const { data } = await command('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(output, `project-preview-${width}.png`), Buffer.from(data, 'base64'));
    }
  }
  await viewport(1440);
  await evaluate(`[...document.querySelectorAll('article')].find(item=>item.querySelector('h3')?.textContent===${JSON.stringify(projects[2].name)}).scrollIntoView({block:'center',behavior:'instant'})`);
  await eventually(() => evaluate(`Boolean(document.querySelector('iframe[title="Website preview of ${projects[2].name}"]'))`), 'broken image fallback');
  check('An unavailable screenshot falls back to the live website preview', true);
  check('Blocked websites retain an accessible direct demo link', await evaluate(`(()=>{const preview=[...document.querySelectorAll('[data-project-preview]')].find(item=>item.querySelector('a')?.getAttribute('href')==='https://example.invalid/blocked');return Boolean(preview?.querySelector('a[target=_blank][rel="noopener noreferrer"]'));})()`));
  await evaluate("document.querySelector('footer').scrollIntoView({block:'end',behavior:'instant'})");
  await eventually(() => evaluate(`!document.querySelector(${JSON.stringify(demoFrame)})`), 'offscreen iframe cleanup');
  check('Offscreen website frames unload to avoid background work', await evaluate("[...document.querySelectorAll('[data-project-preview] iframe')].every(frame=>{const box=frame.parentElement.getBoundingClientRect();return box.bottom>=-301&&box.top<=innerHeight+301})"));
  check('Preview requests send no page referrer', previewRequests.length > 0 && previewRequests.every(request => !request.referrer));
  check('Admin browser has no runtime exceptions or console errors', runtimeErrors.length === 0);
  check('Cross-origin logout is rejected without revoking the session', (await api('/api/admin/logout', { method: 'POST', origin: 'https://example.invalid' })).response.status === 403 && (await api('/api/admin/inquiries')).response.status === 200);
  const logout = await api('/api/admin/logout', { method: 'POST' });
  check('Logout clears the cookie and revokes its stored session', logout.response.status === 200 && /Max-Age=0/i.test(logout.response.headers.get('set-cookie') || '') && (await api('/api/admin/inquiries')).response.status === 401);
  await stopServer();
  await start();
  check('Logged-out sessions remain revoked after a server restart', (await api('/api/admin/inquiries')).response.status === 401);
  let throttled;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await api('/api/admin/login', { method: 'POST', body: { email: 'throttled@example.invalid', password: 'incorrect' }, authenticated: false });
    if (result.response.status === 429) { throttled = result.response; break; }
    if (result.response.status !== 401) throw new Error(`Unexpected login-throttle response: ${result.response.status}`);
  }
  check('Repeated incorrect logins are rate limited with a retry delay', throttled?.status === 429 && Number(throttled.headers.get('retry-after')) > 0);
  await stopServer();
  await start();
  check('Login throttling survives a server restart', (await api('/api/admin/login', { method: 'POST', body: { email: 'throttled@example.invalid', password: 'incorrect' }, authenticated: false })).response.status === 429);
  await command('Browser.close');
} catch (error) {
  failure = error.stack || String(error);
  console.error(failure);
  if (inspectBrowser) {
    try { console.error(JSON.stringify(await inspectBrowser("({path:location.pathname,search:location.search,hash:location.hash,alert:document.querySelector('[role=alert]')?.textContent,submit:document.querySelector('button[type=submit]')?.textContent,selection:document.querySelector('#contact select[name=preferredPackage]')?.value,options:[...document.querySelectorAll('#contact select[name=preferredPackage] option')].map(option=>option.value)})"))); } catch {}
  }
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  edge?.kill();
  await stopServer();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, runtimeErrors, failure: failure || null }, null, 2));
  fixtureWorker?.stop();
  if (qa) {
    await resetQaFixtures(qa.connection);
    await qa.connection.end();
  }
  console.log(`${checks.length} admin checks; ${checks.filter(item => !item.pass).length} failures.`);
  if (failure) process.exitCode = 1;
}
