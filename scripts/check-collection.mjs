import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Node 22+, against an already running production server. This isolated browser
// never submits the contact form or opens external links.
const base = (process.env.COLLECTION_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const output = path.resolve('.next/collection-qa');
const browser = process.env.COLLECTION_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9336;
const started = Date.now();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
const runtimeErrors = [];
const specimens = [];
let socket;
let command;
let failure;
let scriptsDisabled = false;

const identity = item => Math.abs(item.scale - 1) < 0.002 && Math.abs(item.dx) < 0.2 && Math.abs(item.dy) < 0.2 && Math.abs(item.rotation) < 0.02;
const spread = values => Math.max(...values) - Math.min(...values);
const sameLayout = (before, after) => before.slots.length === after.slots.length && Math.abs(before.height - after.height) < 1.1 && before.slots.every((slot, index) => ['left', 'top', 'width', 'height'].every(key => Math.abs(slot[key] - after.slots[index][key]) < 1.1));

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
    if (message.method === 'Fetch.requestPaused') command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ message: 'Local QA guard; no enquiry sent.' })).toString('base64') }).catch(error => { runtimeErrors.push({ type: 'interception', text: error.message }); });
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
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 3000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until && Date.now() - started < 40000) {
      if (await evaluate(expression)) return;
      await pause(40);
    }
    throw new Error(`Timed out waiting for ${label}.`);
  };
  const check = (name, pass, detail) => {
    checks.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  };
  const frames = () => scriptsDisabled ? pause(50) : evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const viewport = async (width = 1440, height = 900) => {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640, screenWidth: width, screenHeight: height });
    await command('Emulation.setTouchEmulationEnabled', { enabled: width < 640 });
    await frames();
  };
  const preference = value => command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const load = async route => {
    const url = new URL(base + route);
    // Hash-only navigation can reuse a document whose app scripts were disabled.
    await command('Page.navigate', { url: 'about:blank' });
    await command('Page.navigate', { url: url.href });
    await waitFor(`location.pathname===${JSON.stringify(url.pathname)}&&location.hash===${JSON.stringify(url.hash)}&&document.readyState==='complete'&&Boolean(document.querySelector('[data-scroll-collection]'))`, `load ${route}`, 5000);
    // DevTools evaluation installs measurement helpers even while the page's own
    // scripts are disabled for the server-rendering check.
    await evaluate(helperSource);
    await waitFor("document.fonts.status==='loaded'", 'loaded fonts', 5000);
    await frames();
  };
  const snapshot = selector => evaluate(`window.__collectionSnapshot(${JSON.stringify(selector)})`);
  const all = () => evaluate("[...document.querySelectorAll('[data-scroll-collection]')].map(window.__collectionSnapshot)");
  const scroll = async top => {
    await evaluate(`scrollTo({top:${Math.max(0, top)},behavior:'instant'})`);
    await frames();
  };
  const screenshot = async name => {
    const { data } = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const click = async selector => {
    await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing control: '+${JSON.stringify(selector)});element.scrollIntoView({block:'center',behavior:'instant'});})()`);
    await frames();
    const point = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const overflow = async label => {
    const state = await evaluate('({width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth})');
    check(`No horizontal overflow ${label}`, state.html <= state.width + 1 && state.body <= state.width + 1, state);
  };
  const navigation = async label => {
    await frames();
    const state = await evaluate(`(()=>{const nav=document.querySelector('nav[aria-label="Main navigation"]');const current=[...nav.querySelectorAll('a[aria-current="location"]')].map(link=>link.getAttribute('href'));const sections=[...nav.querySelectorAll('a')].flatMap(link=>{const id=link.hash.slice(1),element=document.getElementById(id);return element?[{id,element}]:[];});const header=(document.querySelector('header').firstElementChild.getBoundingClientRect().height)+1;const line=header+Math.min(innerHeight*.18,180);let expected=sections[0].id;if(scrollY>0&&scrollY+innerHeight>=document.documentElement.scrollHeight-3)expected=sections.at(-1).id;else for(const section of sections)if(section.element.getBoundingClientRect().top<=line)expected=section.id;return {current,expected,hash:location.hash,path:location.pathname};})()`);
    check(`Scroll navigation remains correct ${label}`, state.path === '/' && state.hash === '#home' && state.current.length === 1 && state.current[0] === `/#${state.expected}`, state);
  };

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/contact*', requestStage: 'Request' }] });
  const helperSource = `
    window.__collectionDocumentId=globalThis.crypto?.randomUUID?.()||String(Math.random());
    window.__collectionSnapshot=(reference)=>{
      const group=typeof reference==='string'?document.querySelector(reference):reference;
      if(!group)throw Error('Missing collection: '+reference);
      const g=group.getBoundingClientRect();
      const slots=[...group.querySelectorAll('[data-collection-slot]')].filter(slot=>slot.closest('[data-scroll-collection]')===group);
      return {section:group.closest('section[id]')?.id||group.tagName,height:g.height,absoluteTop:g.top+scrollY,slots:slots.map((slot,index)=>{
        const s=slot.getBoundingClientRect(),body=slot.querySelector('[data-collection-body]');
        if(!body)throw Error('Missing collection body '+index);
        const b=body.getBoundingClientRect(),style=getComputedStyle(body),matrix=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);
        let opacity=1,hidden=false;for(let node=body.querySelector('h1,h2,h3,p,button')||body;node&&node.tagName!=='MAIN';node=node.parentElement){const computed=getComputedStyle(node);opacity*=Number(computed.opacity);hidden ||= computed.display==='none'||computed.visibility==='hidden';}
        return {index,left:s.left-g.left,top:s.top-g.top,width:s.width,height:s.height,absoluteTop:s.top+scrollY,absoluteBottom:s.bottom+scrollY,viewportTop:s.top,scale:Math.hypot(matrix.a,matrix.b),dx:matrix.m41,dy:matrix.m42,rotation:Math.atan2(matrix.b,matrix.a)*180/Math.PI,centerX:b.left+b.width/2,centerY:b.top+b.height/2,body:{left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height,border:parseFloat(style.borderTopWidth),outline:parseFloat(style.outlineWidth),shadow:style.boxShadow,background:style.backgroundColor,z:style.zIndex},opacity,hidden};
      })};
    };
  `;
  await command('Page.addScriptToEvaluateOnNewDocument', { source: helperSource });
  await viewport();
  await preference('no-preference');
  await command('Emulation.setScriptExecutionDisabled', { value: true });
  scriptsDisabled = true;
  await load('/#home');
  await pause(1000);
  const ssr = await all();
  check('Collection slots render readable static content without JavaScript', ssr.length >= 8 && ssr.every(group => group.slots.length > 0 && group.slots.every(item => identity(item) && item.opacity >= .99 && !item.hidden)), ssr);
  // Packages, demos, and FAQs are administrator-managed. Hydration must preserve
  // the published server content rather than a historical seed-fixture count.
  const publishedCounts = Object.fromEntries(ssr.filter(group => ['pricing', 'portfolio', 'faq'].includes(group.section)).map(group => [group.section, group.slots.length]));
  await command('Emulation.setScriptExecutionDisabled', { value: false });
  scriptsDisabled = false;
  await load('/#home');
  const counts = await evaluate(`(()=>{const counts={};for(const id of ['home','services','about','pricing','portfolio','faq']){const group=document.querySelector('#'+id+' [data-scroll-collection]');counts[id]=group?[...group.querySelectorAll('[data-collection-slot]')].filter(slot=>slot.closest('[data-scroll-collection]')===group).length:0;}counts.process=document.querySelector('ol[data-scroll-collection]')?.querySelectorAll('[data-collection-slot]').length||0;counts.forms=document.querySelectorAll('[data-scroll-collection] form').length;return counts;})()`);
  check('Expected card groups preserve semantic form and process placement', counts.home === 2 && counts.services === 7 && counts.about === 2 && counts.pricing === publishedCounts.pricing && counts.portfolio === publishedCounts.portfolio && counts.faq === publishedCounts.faq && counts.process === 5 && counts.forms === 0, { ...counts, publishedCounts });

  const services = '#services [data-scroll-collection]';
  for (const width of [1440, 320, 3840]) {
    await viewport(width, width === 320 ? 844 : 900);
    await scroll(0);
    const before = await snapshot(services);
    const header = await evaluate("document.querySelector('header').firstElementChild.getBoundingClientRect().height+1");
    const deckHeight = await evaluate(`Math.min(130,(innerHeight-${header})*.22)`);
    const firstBottom = Math.min(...before.slots.map(slot => slot.absoluteBottom));
    const lastBottom = Math.max(...before.slots.map(slot => slot.absoluteBottom));
    await scroll(Math.min(...before.slots.map(slot => slot.absoluteTop)) - header - 24);
    await pause(750); // Allow the independent nested section entrances to settle.
    // Sample before the former near-header trigger to verify the earlier start.
    await scroll(firstBottom - header - deckHeight - 24 - 30);
    await pause(120);
    const mid = await snapshot(services);
    specimens.push({ width, stage: 'mid', before, after: mid });
    check(`Service cards begin gathering earlier at ${width}px`, mid.slots.some(slot => slot.scale < .98 && slot.scale > .05), mid.slots.map(slot => ({ index: slot.index, scale: slot.scale })));
    check(`Service layout slots stay fixed during partial collection at ${width}px`, sameLayout(before, mid), { before: before.slots, after: mid.slots });
    const unread = mid.slots.filter(slot => slot.viewportTop >= (width === 320 ? 844 : 900) / 2);
    if (width === 320) check('Unread mobile service cards retain their original transforms', unread.length > 0 && unread.every(identity), unread);
    await overflow(`during partial services at ${width}px`);
    await navigation(`during partial services at ${width}px`);
    if (width === 1440) await screenshot('collection-service-mid');

    await scroll(lastBottom - header - deckHeight - 24 + 205);
    await pause(120);
    const collected = await snapshot(services);
    specimens.push({ width, stage: 'collected', before, after: collected });
    check(`Departed service cards form compact bounds at ${width}px`, collected.slots.every(slot => slot.scale < .99 && slot.body.width <= 181 && slot.body.height <= deckHeight + 1), collected.slots.map(slot => ({ index: slot.index, scale: slot.scale, bounds: slot.body })));
    check(`Service layout slots stay fixed after collection at ${width}px`, sameLayout(before, collected), { heightBefore: before.height, heightAfter: collected.height });
    if (width !== 320) {
      const beforeSpread = spread(before.slots.map(slot => slot.centerX));
      const afterSpread = spread(collected.slots.map(slot => slot.centerX));
      check(`Collected service centers converge at ${width}px`, afterSpread < 80 && afterSpread < beforeSpread * .25, { beforeSpread, afterSpread });
    }
    const intersectionWidth = Math.min(...collected.slots.map(slot => slot.body.right)) - Math.max(...collected.slots.map(slot => slot.body.left));
    const intersectionHeight = Math.min(...collected.slots.map(slot => slot.body.bottom)) - Math.max(...collected.slots.map(slot => slot.body.top));
    check(`Collected services retain visible layered card frames at ${width}px`, collected.slots.every(slot => slot.body.border > 0 || slot.body.outline > 0 || slot.body.shadow !== 'none') && intersectionWidth > 20 && intersectionHeight > 5 && (new Set(collected.slots.map(slot => slot.body.z)).size > 1 || spread(collected.slots.map(slot => slot.rotation)) > .1 || spread(collected.slots.map(slot => slot.centerY)) > 1), { intersectionWidth, intersectionHeight, frames: collected.slots.map(slot => slot.body) });
    await overflow(`after full services at ${width}px`);
    await navigation(`after full services at ${width}px`);
    if (width === 1440) await screenshot('collection-service-collected');

    const collectedScroll = await evaluate('scrollY');
    await scroll(collectedScroll + 96);
    const leaving = await snapshot(services);
    const averageY = group => group.slots.reduce((sum, slot) => sum + slot.centerY, 0) / group.slots.length;
    check(`Gathered service deck moves upward together at ${width}px`,
      averageY(leaving) < averageY(collected) - 20 &&
      leaving.slots.every(slot => slot.scale < .99) &&
      sameLayout(before, leaving),
      { beforeY: averageY(collected), afterY: averageY(leaving) });
    if (width === 1440) await screenshot('collection-service-scroll-out');

    await scroll(firstBottom - header - deckHeight - 24 - 180);
    await waitFor(`window.__collectionSnapshot(${JSON.stringify(services)}).slots.every(slot=>Math.abs(slot.scale-1)<.002&&Math.abs(slot.dx)<.2&&Math.abs(slot.dy)<.2)`, `reverse service collection ${width}px`);
    const restored = await snapshot(services);
    check(`Scrolling back restores service transforms at ${width}px`, restored.slots.every(identity) && sameLayout(before, restored), restored);

    if (width === 1440) {
      await scroll(lastBottom - header - deckHeight - 24 + 205);
      await frames();
      await evaluate(`(()=>{const group=document.querySelector(${JSON.stringify(services)}),probe=document.createElement('button');probe.id='collection-qa-focus-probe';probe.textContent='QA focus start';probe.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';group.before(probe);probe.focus({preventScroll:true});})()`);
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await waitFor(`(()=>{const group=document.querySelector(${JSON.stringify(services)}),active=document.activeElement,box=active.getBoundingClientRect(),header=document.querySelector('header').firstElementChild.getBoundingClientRect().bottom;return active.closest('[data-scroll-collection]')===group&&box.top>=header-2&&box.bottom<=innerHeight+2&&window.__collectionSnapshot(group).slots.every(slot=>Math.abs(slot.scale-1)<.002&&Math.abs(slot.dx)<.2&&Math.abs(slot.dy)<.2);})()`, 'keyboard collection recovery');
      const focused = await evaluate(`({text:document.activeElement.textContent.trim(),href:document.activeElement.getAttribute('href'),top:document.activeElement.getBoundingClientRect().top,bottom:document.activeElement.getBoundingClientRect().bottom})`);
      check('Keyboard focus restores the group and reveals the focused card', true, focused);
      await evaluate("document.getElementById('collection-qa-focus-probe').remove();document.activeElement.blur()");
    }
  }

  await viewport(320, 844);
  await scroll(0);
  const pricing = '#pricing [data-scroll-collection]';
  const pricingBefore = await snapshot(pricing);
  const mobileHeader = await evaluate("document.querySelector('header').firstElementChild.getBoundingClientRect().height+1");
  const mobileDeckHeight = await evaluate(`Math.min(130,(innerHeight-${mobileHeader})*.22)`);
  await scroll(pricingBefore.slots[0].absoluteTop - mobileHeader - 24);
  await pause(700);
  await scroll(pricingBefore.slots[0].absoluteBottom - mobileHeader - mobileDeckHeight - 24 - 30);
  await pause(120);
  const pricingMid = await snapshot(pricing);
  check('Mobile pricing collects only departed cards', pricingMid.slots[0].scale < .98 && pricingMid.slots.filter(slot => slot.viewportTop >= 422).length > 0 && pricingMid.slots.filter(slot => slot.viewportTop >= 422).every(identity) && sameLayout(pricingBefore, pricingMid), pricingMid);
  await screenshot('collection-mobile-pricing');
  await overflow('during mobile pricing collection');
  await preference('reduce');
  await waitFor(`[...document.querySelectorAll('[data-scroll-collection]')].map(window.__collectionSnapshot).every(group=>group.slots.every(slot=>Math.abs(slot.scale-1)<.002&&Math.abs(slot.dx)<.2&&Math.abs(slot.dy)<.2&&slot.opacity>.99))`, 'live reduced collection recovery');
  const reducedLive = await all();
  check('Live reduced motion restores every collection and readable content', reducedLive.every(group => group.slots.every(slot => identity(slot) && slot.opacity >= .99 && !slot.hidden)), reducedLive);
  await load('/#pricing');
  const reducedInitial = await all();
  check('Initial reduced motion keeps all collection cards static', reducedInitial.every(group => group.slots.every(slot => identity(slot) && slot.opacity >= .99 && !slot.hidden)), reducedInitial);

  await viewport();
  await click('#services a[aria-label="See more details about our services"]');
  await waitFor("location.pathname==='/services'&&Boolean(document.querySelector('main h1'))", 'service details link');
  check('Details links still open the dedicated service page', true, await evaluate('({path:location.pathname,hash:location.hash})'));
  await click('nav[aria-label="Main navigation"] a[href="/#services"]');
  await waitFor("location.pathname==='/'&&location.hash==='#services'&&Boolean(document.getElementById('services'))", 'return to landing services');
  await click('header a[href="/#contact"]:not(nav a)');
  await waitFor(`location.pathname==='/'&&location.hash==='#contact'&&document.querySelector('nav[aria-label="Main navigation"] a[aria-current="location"]')?.getAttribute('href')==='/#contact'&&Boolean(document.querySelector('#contact form'))`, 'direct quote anchor');
  const quote = await evaluate(`(()=>{const section=document.getElementById('contact');return {path:location.pathname,hash:location.hash,insideCollection:Boolean(section.querySelector('form').closest('[data-scroll-collection]')),top:section.getBoundingClientRect().top,header:document.querySelector('header').firstElementChild.getBoundingClientRect().bottom};})()`);
  check('Quote navigation stays on landing with an unobscured untransformed form', quote.path === '/' && quote.hash === '#contact' && !quote.insideCollection && quote.top >= quote.header - 3, quote);
  await frames();
  check('No collection runtime exceptions or error consoles', runtimeErrors.length === 0, runtimeErrors);
} catch (error) {
  failure = error.stack || error.message;
  console.error(failure);
  if (command) {
    try { const { data } = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, 'failure.png'), Buffer.from(data, 'base64')); } catch {}
  }
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ base, elapsedMs: Date.now() - started, checks, specimens, runtimeErrors, failure: failure || null }, null, 2));
  if (command) await command('Browser.close').catch(() => {});
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  edge.kill();
  const failures = checks.filter(check => !check.pass).length;
  console.log(`${checks.length} collection checks; ${failures} failures. Report: ${path.join(output, 'report.json')}`);
  if (failure || failures) process.exitCode = 1;
}
