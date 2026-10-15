import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Node 22+, with an existing production server. Uses an isolated headless Edge
// profile. The sole form submission is intercepted before reaching the local
// server, and external contact links are never followed.
const base = (process.env.LANDING_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const output = path.resolve('.next/landing-qa');
const browser = process.env.LANDING_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9335;
const sections = ['home', 'about', 'services', 'pricing', 'portfolio', 'faq', 'contact'];
const details = ['about', 'services', 'pricing', 'portfolio'];
const started = Date.now();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
const runtimeErrors = [];
const interceptedContactRequests = [];
let socket;
let command;
let evaluate;
let failure;

await fs.mkdir(output, { recursive: true });
const edge = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(output, 'edge-profile')}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
edge.on('error', error => { failure = error.message; });

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`http://localhost:${port}/json/version`)).ok) { ready = true; break; } } catch {}
    if (failure) throw new Error(failure);
    await pause(100);
  }
  if (!ready) throw new Error('Isolated headless browser did not start.');
  const target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push({ type: 'exception', ...message.params.exceptionDetails });
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') runtimeErrors.push({ type: 'console', text: message.params.args.map(arg => arg.description ?? arg.value ?? arg.type).join(' ') });
    if (message.method === 'Fetch.requestPaused') {
      // Fulfill in the browser; neither the server nor any email service receives
      // this synthetic request. The interception also guards accidental posts.
      let payload = null;
      try { payload = JSON.parse(message.params.request.postData); } catch {}
      interceptedContactRequests.push({ url: message.params.request.url, method: message.params.request.method, payload });
      command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ message: 'Local QA response; no enquiry sent.' })).toString('base64') }).catch(error => { runtimeErrors.push({ type: 'interception', text: error.message }); });
    }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 5000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 2500) => {
    const until = Date.now() + timeout;
    while (Date.now() < until && Date.now() - started < 29000) {
      if (await evaluate(expression)) return;
      await pause(35);
    }
    throw new Error(`Timed out waiting for ${label}.`);
  };
  const check = (name, pass, detail) => {
    checks.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  };
  const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const viewport = async (width = 1440, height = 900) => {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640, screenWidth: width, screenHeight: height });
    await command('Emulation.setTouchEmulationEnabled', { enabled: width < 640 });
  };
  const preference = value => command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const primaryNavigation = `(()=>{const nav=document.querySelector('nav[aria-label="Main navigation"]');return {hrefs:[...nav.querySelectorAll('a')].map(link=>link.getAttribute('href')),current:[...nav.querySelectorAll('a[aria-current]')].map(link=>link.getAttribute('href')),locationCurrent:nav.querySelectorAll('a[aria-current="location"]').length,pageCurrent:nav.querySelectorAll('a[aria-current="page"]').length};})()`;
  const activeIs = (id, current = 'location') => `(()=>{const links=[...document.querySelectorAll('nav[aria-label="Main navigation"] a[aria-current="${current}"]')];return links.length===1&&links[0].getAttribute('href')===${JSON.stringify(`/#${id}`)};})()`;
  const targetGeometry = id => `(()=>{const section=document.getElementById(${JSON.stringify(id)});const header=document.querySelector('header');return {targetTop:section.getBoundingClientRect().top,headerBottom:header.getBoundingClientRect().bottom,hash:location.hash,path:location.pathname};})()`;
  const waitAtTarget = async id => {
    await waitFor(`location.pathname==='/'&&location.hash===${JSON.stringify(`#${id}`)}&&${activeIs(id)}`, `active #${id}`);
    await waitFor(`(()=>{const geometry=${targetGeometry(id)};return geometry.targetTop>=geometry.headerBottom-3&&geometry.targetTop<=geometry.headerBottom+100;})()`, `unobscured #${id}`);
  };
  const load = async route => {
    const url = new URL(base + route);
    await command('Page.navigate', { url: url.href });
    await waitFor(`location.pathname===${JSON.stringify(url.pathname)}&&location.hash===${JSON.stringify(url.hash)}&&document.readyState==='complete'&&Boolean(document.querySelector('main h1'))`, `load ${route}`, 3500);
    await frames();
  };
  const click = async selector => {
    await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing control: '+${JSON.stringify(selector)});element.scrollIntoView({block:'center',behavior:'instant'});})()`);
    await frames();
    await waitFor(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});const rect=element.getBoundingClientRect();const header=document.querySelector('header').firstElementChild.getBoundingClientRect().bottom;if(!element.closest('header')&&(rect.top<header||rect.bottom>innerHeight)){element.scrollIntoView({block:'center',behavior:'instant'});return false;}const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);let opacity=1;for(let node=element;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);return opacity>.99&&Boolean(hit&&(hit===element||element.contains(hit)));})()`, `actionable ${selector}`);
    await frames();
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const manualScroll = async id => {
    const hash = await evaluate('location.hash');
    await evaluate(`(()=>{const element=document.getElementById(${JSON.stringify(id)});if(!element)throw Error('Missing section: '+${JSON.stringify(id)});const header=document.querySelector('header').getBoundingClientRect().height;scrollTo({top:${id === 'home' ? '0' : 'element.getBoundingClientRect().top+scrollY-header-12'},behavior:'instant'});})()`);
    await waitFor(activeIs(id), `scroll spy #${id}`);
    await frames();
    const state = await evaluate(primaryNavigation);
    check(`Scroll identifies #${id} (${await evaluate('innerWidth')}, ${await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced':'normal'")})`, state.current.length === 1 && state.locationCurrent === 1 && state.current[0] === `/#${id}` && await evaluate('location.hash') === hash, state);
  };

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/contact*', requestStage: 'Request' }] });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__landingDocumentId=crypto.randomUUID();' });
  await viewport();
  await preference('no-preference');
  await load('/#pricing');
  await waitAtTarget('pricing');
  const initial = await evaluate(primaryNavigation);
  const ids = await evaluate(`${JSON.stringify(sections)}.map(id=>({id,count:document.querySelectorAll('[id="'+id+'"]').length}))`);
  check('Seven navigation targets match unique landing sections', initial.hrefs.length === sections.length && sections.every(id => initial.hrefs.includes(`/#${id}`)) && ids.every(section => section.count === 1), { initial, ids });
  check('Initial pricing hash is active and below the sticky header', initial.current.length === 1 && initial.current[0] === '/#pricing', await evaluate(targetGeometry('pricing')));

  const documentId = await evaluate('window.__landingDocumentId');
  await click('header a[href="/#contact"]:not(nav a)');
  await waitAtTarget('contact');
  const quote = await evaluate(`(()=>{const form=document.querySelector('#contact form');return {path:location.pathname,hash:location.hash,documentId:window.__landingDocumentId,body:getComputedStyle(document.body).backgroundColor,header:getComputedStyle(document.querySelector('header')).backgroundColor,form:form&&getComputedStyle(form).backgroundColor};})()`);
  check('Free quote stays on the orange-and-white landing page', quote.path === '/' && quote.hash === '#contact' && quote.documentId === documentId && quote.body === 'rgb(255, 255, 255)' && quote.header === 'rgb(255, 102, 0)' && quote.form === 'rgb(255, 255, 255)', quote);

  for (const motionPreference of ['no-preference', 'reduce']) {
    await preference(motionPreference);
    for (const width of [1440, 320]) {
      await viewport(width, width < 640 ? 844 : 900);
      for (const id of sections) await manualScroll(id);
    }
  }

  await viewport();
  await preference('reduce');
  await click('nav[aria-label="Main navigation"] a[href="/#services"]');
  await waitAtTarget('services');
  await click('nav[aria-label="Main navigation"] a[href="/#faq"]');
  await waitAtTarget('faq');
  const history = await command('Page.getNavigationHistory');
  await command('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id });
  await waitAtTarget('services');
  check('Browser back restores the services hash and active section', true, await evaluate(targetGeometry('services')));
  await evaluate("location.hash='faq'");
  await waitAtTarget('faq');
  await evaluate("location.hash='services'");
  await waitAtTarget('services');
  await manualScroll('home');
  await click('nav[aria-label="Main navigation"] a[href="/#services"]');
  await waitAtTarget('services');
  check('Direct hashes and repeated hash clicks restore the target', true, await evaluate(targetGeometry('services')));

  await viewport(320, 844);
  await preference('no-preference');
  await click('button[aria-controls="mobile-navigation"]');
  await waitFor(`document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded')==='true'&&document.getElementById('mobile-navigation').getBoundingClientRect().height>250`, 'open mobile menu');
  const mobileLinks = await evaluate(`(()=>{const panel=document.getElementById('mobile-navigation');return {current:[...panel.querySelectorAll('a[aria-current="location"]')].map(link=>link.getAttribute('href')),targets:[...panel.querySelectorAll('nav a')].map(link=>link.getAttribute('href')),inert:panel.inert};})()`);
  check('Mobile menu mirrors the current landing section', mobileLinks.current.length === 1 && mobileLinks.current[0] === '/#services' && sections.every(id => mobileLinks.targets.includes(`/#${id}`)) && !mobileLinks.inert, mobileLinks);
  await click('#mobile-navigation a[href="/#about"]');
  await waitFor(`document.getElementById('mobile-navigation').inert&&document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded')==='false'&&document.getElementById('mobile-navigation').getBoundingClientRect().height<1`, 'closed mobile menu');
  await waitAtTarget('about');
  check('Mobile anchor closes the menu and clears the sticky header', true, await evaluate(targetGeometry('about')));

  await viewport();
  await preference('reduce');
  const detailLinks = await evaluate(`(()=>{return ${JSON.stringify(details)}.map(id=>({id,links:[...document.querySelectorAll('main a[href="/'+id+'"]')].map(link=>link.textContent.trim())}));})()`);
  check('Dedicated pages have explicit See more details links', detailLinks.every(item => item.links.some(text => /^see more details/i.test(text))), detailLinks);
  for (const id of details) {
    const selector = await evaluate(`(()=>{const link=[...document.querySelectorAll('main a[href="/${id}"]')].find(element=>/^see more details/i.test(element.textContent.trim()));if(!link)throw Error('Missing details link: ${id}');link.setAttribute('data-landing-qa-detail',${JSON.stringify(id)});return 'a[data-landing-qa-detail="${id}"]';})()`);
    await click(selector);
    await waitFor(`location.pathname===${JSON.stringify(`/${id}`)}&&Boolean(document.querySelector('main h1'))&&${activeIs(id, 'page')}`, `dedicated ${id}`);
    const state = await evaluate(primaryNavigation);
    check(`Dedicated ${id} page navigation returns to landing anchors`, state.hrefs.length === sections.length && sections.every(section => state.hrefs.includes(`/#${section}`)) && state.current.length === 1 && state.pageCurrent === 1 && state.current[0] === `/#${id}`, state);
    await click(`nav[aria-label="Main navigation"] a[href="/#${id}"]`);
    await waitAtTarget(id);
  }
  const serviceHref = await evaluate(`document.querySelector('#services article a[href^="/services#"]')?.getAttribute('href')`);
  check('Service cards link directly to their dedicated service', Boolean(serviceHref), serviceHref);
  if (serviceHref) {
    await click(`#services article a[href=${JSON.stringify(serviceHref)}]`);
    const serviceId = serviceHref.split('#')[1];
    await waitFor(`location.pathname==='/services'&&location.hash===${JSON.stringify(`#${serviceId}`)}&&Boolean(document.getElementById(${JSON.stringify(serviceId)}))`, 'service detail anchor');
    await waitFor(`(()=>{const geometry=${targetGeometry(serviceId)};return geometry.targetTop>=geometry.headerBottom-3&&geometry.targetTop<=geometry.headerBottom+100;})()`, 'unobscured service detail');
    check('Service anchor remains below the sticky header', true, await evaluate(targetGeometry(serviceId)));
    await click('nav[aria-label="Main navigation"] a[href="/#services"]');
    await waitAtTarget('services');
  }

  await waitFor("Boolean(document.querySelector('#contact input[name=fullName]'))", 'landing form');
  await evaluate("document.querySelector('#contact input[name=fullName]').focus()");
  await command('Input.insertText', { text: 'Landing QA Name' });
  const formDocumentId = await evaluate('window.__landingDocumentId');
  for (const [id, tier, price] of [['basic', 'Basic', '10,000'], ['business', 'Business', '25,000'], ['premium', 'Premium', '45,000']]) {
    const href = await evaluate(`document.querySelector('#pricing a[href*="package=${id}"]')?.getAttribute('href')`);
    check(`${tier} package link targets landing contact`, Boolean(href) && new URL(href, base).pathname === '/' && new URL(href, base).hash === '#contact', href);
    if (!href) continue;
    await click(`#pricing a[href=${JSON.stringify(href)}]`);
    await waitAtTarget('contact');
    await waitFor(`(()=>{const value=document.querySelector('#contact select[name=preferredPackage]')?.value;return value?.startsWith(${JSON.stringify(tier)})&&value.includes(${JSON.stringify(price)});})()`, `${tier} package selection`);
    const selected = await evaluate(`({query:new URLSearchParams(location.search).get('package'),value:document.querySelector('#contact select[name=preferredPackage]').value,name:document.querySelector('#contact input[name=fullName]').value,documentId:window.__landingDocumentId})`);
    check(`${tier} package maps to a real form option without losing typed name`, selected.query === id && selected.value.startsWith(tier) && selected.value.includes(price) && selected.name === 'Landing QA Name' && selected.documentId === formDocumentId, selected);
  }

  for (const [name, value] of [['email', 'landing-qa@example.invalid'], ['phoneNumber', '+94770000000'], ['projectDescription', 'This is a local browser QA request for a business website. No enquiry should leave the browser.']]) {
    await evaluate(`document.querySelector('#contact [name=${name}]').focus()`);
    await command('Input.insertText', { text: value });
  }
  await evaluate(`(()=>{for(const name of ['serviceRequired','estimatedBudget']){const select=document.querySelector('#contact select[name='+name+']');select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  await click('#contact form button[type="submit"]');
  await waitFor(`document.querySelector('#contact form [role="status"]')?.textContent.includes('Local QA response; no enquiry sent.')&&document.querySelector('#contact form button[type="submit"]')?.disabled===false`, 'mocked inline enquiry success');
  const success = await evaluate(`({path:location.pathname,hash:location.hash,documentId:window.__landingDocumentId,name:document.querySelector('#contact input[name=fullName]').value,notification:document.querySelector('#contact form [role="status"]').textContent.trim(),form:getComputedStyle(document.querySelector('#contact form')).backgroundColor})`);
  check('Mocked enquiry success stays inline on landing contact', success.path === '/' && success.hash === '#contact' && success.documentId === formDocumentId && success.name === 'Landing QA Name' && success.notification.includes('Request sent') && success.form === 'rgb(255, 255, 255)', success);

  for (const width of [320, 1024, 3840]) {
    await viewport(width, width === 320 ? 844 : 900);
    await frames();
    const overflow = await evaluate(`({width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth})`);
    check(`Landing has no body overflow at ${width}px`, overflow.html <= width + 1 && overflow.body <= width + 1, overflow);
  }
  check('Synthetic enquiry was fulfilled locally without contacting the server', interceptedContactRequests.length === 1 && interceptedContactRequests[0].method === 'POST' && interceptedContactRequests[0].payload?.fullName === 'Landing QA Name', interceptedContactRequests);
  check('No runtime exceptions or error consoles', runtimeErrors.length === 0, runtimeErrors);
} catch (error) {
  failure = error.stack || error.message;
  console.error(failure);
  if (command) {
    try {
      const diagnostics = await evaluate(`({path:location.pathname,hash:location.hash,scrollY,reduce:matchMedia('(prefers-reduced-motion: reduce)').matches,navigation:[...document.querySelectorAll('nav[aria-label="Main navigation"] a')].map(link=>({href:link.getAttribute('href'),current:link.getAttribute('aria-current')}))})`);
      console.error(JSON.stringify(diagnostics));
    } catch {}
    try { const { data } = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, 'failure.png'), Buffer.from(data, 'base64')); } catch {}
  }
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ base, elapsedMs: Date.now() - started, checks, runtimeErrors, interceptedContactRequests, failure: failure || null }, null, 2));
  if (command) await command('Browser.close').catch(() => {});
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  edge.kill();
  const failures = checks.filter(check => !check.pass).length;
  console.log(`${checks.length} landing checks; ${failures} failures. Report: ${path.join(output, 'report.json')}`);
  if (failure || failures) process.exitCode = 1;
}
