import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Run against an existing production server with Node 22+. This isolated browser
// checks navigation and local interactions without opening external links or forms.
const base = process.env.MOTION_BASE_URL || 'http://localhost:3100';
const output = path.resolve('.next/motion-qa');
const browser = process.env.MOTION_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9334;
const started = Date.now();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
const runtimeErrors = [];
const navigation = [];
let socket;
let command;
let failure;

await fs.mkdir(output, { recursive: true });
const chrome = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(output, 'edge-profile')}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
chrome.on('error', error => { failure = error.message; });

try {
  let ready = false;
  for (let attempt = 0; attempt < 70; attempt++) {
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
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 6000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 5000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until && Date.now() - started < 50000) {
      if (await evaluate(expression)) return;
      await pause(40);
    }
    throw new Error(`Timed out waiting for ${label}.`);
  };
  const check = (name, pass, detail) => {
    checks.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  };
  const viewport = async (width = 1440, height = 900) => {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640, screenWidth: width, screenHeight: height });
    await command('Emulation.setTouchEmulationEnabled', { enabled: width < 640 });
  };
  const preference = value => command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const load = async route => {
    await command('Page.navigate', { url: base + route });
    await waitFor(`location.pathname===${JSON.stringify(route)} && document.readyState==='complete' && Boolean(document.querySelector('main h1'))`, route);
    await pause(200);
  };
  const click = async selector => {
    await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing control: '+${JSON.stringify(selector)});element.scrollIntoView({block:'center',behavior:'instant'});})()`);
    await frames();
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const headingVisibility = `(()=>{const headings=[...document.querySelectorAll('main h2')];return headings.map(heading=>{let opacity=1,hidden=false;for(let node=heading;node&&node.tagName!=='MAIN';node=node.parentElement){const style=getComputedStyle(node);opacity*=Number(style.opacity);hidden ||= style.visibility==='hidden'||style.display==='none';}return {text:heading.textContent.trim(),opacity,hidden};});})()`;
  const preparedSections = `(()=>{const elements=[...document.querySelectorAll('main div')].filter(element=>Number(getComputedStyle(element).opacity)<.01 && element.getBoundingClientRect().top>innerHeight+32 && element.querySelector('h2,h3,article'));window.__preparedSections=elements;return elements.map(element=>({text:element.textContent.trim().slice(0,80),top:element.getBoundingClientRect().top,opacity:getComputedStyle(element).opacity}));})()`;
  const menuState = `(()=>{const button=document.querySelector('button[aria-controls="mobile-navigation"]');const panel=document.getElementById('mobile-navigation');const inner=panel.firstElementChild;return {expanded:button.getAttribute('aria-expanded'),hidden:panel.getAttribute('aria-hidden'),inert:panel.inert,links:panel.querySelectorAll('a').length,height:inner?.getBoundingClientRect().height||0,opacity:inner?Number(getComputedStyle(inner).opacity):1,focused:document.activeElement===button};})()`;

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{
    const qa=window.__motionQA={documentId:crypto.randomUUID(),calls:[],animations:[],transitionErrors:[]};
    qa.sample=()=>{for(const animation of document.getAnimations()){const name=animation.animationName;if(name&&!qa.animations.some(item=>item.name===name&&item.path===location.pathname))qa.animations.push({name,path:location.pathname,duration:animation.effect?.getTiming().duration,pseudo:animation.effect?.pseudoElement||null});}};
    document.addEventListener('animationstart',event=>{qa.animations.push({name:event.animationName,path:location.pathname,pseudo:event.pseudoElement});},true);
    if(typeof document.startViewTransition==='function'){
      const original=document.startViewTransition.bind(document);
      document.startViewTransition=(...args)=>{qa.calls.push({path:location.pathname,time:performance.now()});const transition=original(...args);transition.ready.then(()=>{qa.sample();requestAnimationFrame(qa.sample);},error=>{qa.transitionErrors.push({name:error.name,message:error.message});});return transition;};
    }
  })();` });
  await viewport();
  await preference('no-preference');

  // Disabling page JavaScript before navigation verifies the server HTML itself.
  await command('Emulation.setScriptExecutionDisabled', { value: true });
  await load('/');
  const ssr = await evaluate(headingVisibility);
  check('Server section content visible without JavaScript', ssr.length >= 8 && ssr.every(item => !item.hidden && item.opacity >= .99), ssr);
  await command('Emulation.setScriptExecutionDisabled', { value: false });

  await load('/');
  await waitFor(`document.querySelector('form input') && [...document.querySelectorAll('main div')].some(element=>Number(getComputedStyle(element).opacity)<.01&&element.getBoundingClientRect().top>innerHeight+32)`, 'enhanced offscreen section');
  const prepared = await evaluate(preparedSections);
  check('Normal motion prepares content safely below viewport', prepared.length > 0 && prepared.every(item => item.top > 932), prepared);
  const candidate = await evaluate(`(()=>{window.__revealCandidate=window.__preparedSections.find(element=>element.querySelector('h2'));return Boolean(window.__revealCandidate);})()`);
  if (!candidate) throw new Error('No offscreen heading available for reveal check.');
  await evaluate(`window.__revealCandidate.scrollIntoView({block:'center',behavior:'instant'})`);
  await waitFor(`(()=>{const style=getComputedStyle(window.__revealCandidate);const matrix=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);return Number(style.opacity)>.999&&Math.abs(matrix.m42)<.1;})()`, 'scrolled section reveal', 2200);
  const revealed = await evaluate(`(()=>{const style=getComputedStyle(window.__revealCandidate);const matrix=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);return {opacity:Number(style.opacity),offset:matrix.m42};})()`);
  check('Scrolled section finishes visible and in place', revealed.opacity >= .99 && Math.abs(revealed.offset) < .1, revealed);

  const navigateViaLink = async route => {
    await evaluate('scrollTo({top:0,behavior:"instant"})');
    const before = await evaluate(`({id:window.__motionQA.documentId,calls:window.__motionQA.calls.length,animations:window.__motionQA.animations.length})`);
    await click(`main a[href="${route}"]`);
    await waitFor(`location.pathname===${JSON.stringify(route)}&&document.querySelector('header nav[aria-label="Main navigation"] a[aria-current="page"]')?.getAttribute('href')===${JSON.stringify('/#' + route.slice(1))}&&Boolean(document.querySelector('main h1'))`, `details navigation to ${route}`);
    await pause(550);
    const after = await evaluate(`({id:window.__motionQA.documentId,calls:window.__motionQA.calls.slice(${before.calls}),animations:window.__motionQA.animations.slice(${before.animations}),active:[...document.querySelectorAll('header nav[aria-label="Main navigation"] a[aria-current="page"]')].map(link=>link.getAttribute('href')),transitionErrors:window.__motionQA.transitionErrors})`);
    navigation.push({ route, before, after });
    check(`Next Link ${route} uses native page transition`, after.id === before.id && after.calls.length > 0 && after.animations.some(item => item.name === 'page-arrive') && after.transitionErrors.length === 0, after);
    check(`Active navigation identifies ${route}`, after.active.length === 1 && after.active[0] === '/#' + route.slice(1), after.active);
  };
  await navigateViaLink('/about');
  const backBefore = await evaluate(`({id:window.__motionQA.documentId,calls:window.__motionQA.calls.length,animations:window.__motionQA.animations.length})`);
  const history = await command('Page.getNavigationHistory');
  await command('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id });
  await waitFor(`location.pathname==='/'&&document.querySelector('header nav[aria-label="Main navigation"] a[aria-current="location"]')?.getAttribute('href')==='/#about'`, 'back navigation');
  await pause(550);
  const back = await evaluate(`({id:window.__motionQA.documentId,calls:window.__motionQA.calls.slice(${backBefore.calls}),animations:window.__motionQA.animations.slice(${backBefore.animations}),active:document.querySelector('header nav[aria-label="Main navigation"] a[aria-current="location"]')?.getAttribute('href')})`);
  check('Back restores landing topic and active navigation', back.id === backBefore.id && back.active === '/#about', back);
  const backVisible = await evaluate(`(()=>{let opacity=1;for(let node=document.querySelector('#about h2');node&&node.tagName!=='MAIN';node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);return {opacity,runningPageAnimations:document.getAnimations().filter(animation=>['page-arrive','page-leave'].includes(animation.animationName)&&animation.playState==='running').length};})()`);
  check('Back navigation leaves content visible after transition or fallback', backVisible.opacity >= .99 && backVisible.runningPageAnimations === 0, { ...back, ...backVisible });

  await navigateViaLink('/portfolio');
  await waitFor(`document.querySelectorAll('main [role="listitem"]').length>0`, 'portfolio results');
  const published = await evaluate(`({projects:[...document.querySelectorAll('main [role="listitem"]')].map(item=>({name:item.querySelector('h3')?.textContent.trim(),category:item.querySelector('h3')?.previousElementSibling?.textContent.trim()})),categories:[...document.querySelectorAll('button[aria-pressed]')].map(button=>button.textContent.trim()).filter(category=>category!=='All')})`);
  // Prefer a populated subset, then an empty category when only one category is
  // published. Both paths exercise actual exiting cards and their focus guards.
  const candidates = published.categories.map(category => ({ category, projects: published.projects.filter(project => project.category === category) }));
  const selected = candidates.find(item => item.projects.length > 0 && item.projects.length < published.projects.length) || candidates.find(item => item.projects.length < published.projects.length);
  if (!selected) throw new Error('No portfolio category can exercise exiting project cards.');
  const initialCount = published.projects.length;
  const exit = await evaluate(`new Promise(resolve=>{const filter=[...document.querySelectorAll('button[aria-pressed]')].find(button=>button.textContent.trim()===${JSON.stringify(selected.category)});filter.click();requestAnimationFrame(()=>{const exits=[...document.querySelectorAll('main [role="listitem"][aria-hidden="true"]')];resolve(exits.map(element=>{const link=element.querySelector('a');link?.focus();return {inert:element.inert,pointerEvents:getComputedStyle(element).pointerEvents,focusBlocked:document.activeElement!==link};}));});})`);
  check('Exiting portfolio results cannot receive focus or pointer input', initialCount > 0 && exit.length === initialCount - selected.projects.length && exit.length > 0 && exit.every(item => item.inert && item.pointerEvents === 'none' && item.focusBlocked), exit);
  await pause(450);
  const filtered = await evaluate(`({pressed:[...document.querySelectorAll('button[aria-pressed="true"]')].map(button=>button.textContent.trim()),items:[...document.querySelectorAll('main [role="listitem"]')].map(item=>({name:item.querySelector('h3')?.textContent.trim(),category:item.querySelector('h3')?.previousElementSibling?.textContent.trim(),hidden:item.getAttribute('aria-hidden'),inert:item.inert,opacity:Number(getComputedStyle(item).opacity)})),status:document.querySelector('main [role="status"]')?.textContent.trim(),empty:[...document.querySelectorAll('main [role="status"]')].some(item=>item.textContent.includes('No projects in this category yet.'))})`);
  const expectedNames = selected.projects.map(project => project.name).sort();
  const expectedStatus = `Showing ${selected.projects.length} ${selected.projects.length === 1 ? 'project' : 'projects'} in ${selected.category}.`;
  check('Portfolio filter settles on the announced category', filtered.pressed.length === 1 && filtered.pressed[0] === selected.category && filtered.items.length === selected.projects.length && filtered.items.every(item => item.category === selected.category && item.hidden !== 'true' && !item.inert && item.opacity >= .99) && JSON.stringify(filtered.items.map(item => item.name).sort()) === JSON.stringify(expectedNames) && filtered.status === expectedStatus && (selected.projects.length > 0 || filtered.empty), { ...filtered, expectedNames, expectedStatus });

  await viewport(390, 844);
  await click('button[aria-controls="mobile-navigation"]');
  await pause(320);
  const opened = await evaluate(menuState);
  check('Mobile menu exposes expanded accessible navigation', opened.expanded === 'true' && opened.hidden === 'false' && !opened.inert && opened.links >= 6 && opened.height > 200 && opened.opacity >= .99, opened);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await frames();
  const closed = await evaluate(menuState);
  check('Escape immediately hides menu from interaction and returns focus', closed.expanded === 'false' && closed.hidden === 'true' && closed.inert && closed.focused, closed);

  // Change preference after below-fold reveal preparation, then verify recovery.
  await viewport();
  await load('/');
  await waitFor(`document.querySelector('form input') && [...document.querySelectorAll('main div')].some(element=>Number(getComputedStyle(element).opacity)<.01&&element.getBoundingClientRect().top>innerHeight+32)`, 'sections before live preference change');
  const livePrepared = await evaluate(preparedSections);
  await preference('reduce');
  await waitFor(`window.__preparedSections.every(element=>Number(getComputedStyle(element).opacity)>.99)`, 'visible sections after live reduced motion', 2000);
  const live = await evaluate(`window.__preparedSections.map(element=>{const style=getComputedStyle(element);const matrix=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);return {opacity:Number(style.opacity),offset:matrix.m42};})`);
  check('Live reduced-motion preference restores prepared content', livePrepared.length > 0 && live.every(item => item.opacity >= .99 && Math.abs(item.offset) < .1), live);

  // A fresh document must also honor reduction before hydration and interaction.
  await load('/');
  const reducedInitial = await evaluate(headingVisibility);
  check('Initial reduced-motion load keeps all sections visible', reducedInitial.length >= 8 && reducedInitial.every(item => !item.hidden && item.opacity >= .99), reducedInitial);
  const css = await evaluate(`(()=>{const elements=[...document.querySelectorAll('.hero-reveal,.hero-image-reveal,.motion-button,.interactive-card')];return {matches:matchMedia('(prefers-reduced-motion: reduce)').matches,styles:elements.map(element=>{const style=getComputedStyle(element);return {animation:style.animationName,animationDuration:style.animationDuration,transitionDuration:style.transitionDuration};}),animations:document.getAnimations().filter(animation=>animation.playState==='running').map(animation=>({name:animation.animationName,duration:animation.effect?.getTiming().duration}))};})()`);
  const negligible = value => value.split(',').every(part => parseFloat(part) <= .0001);
  check('Reduced-motion CSS suppresses visible movement', css.matches && css.styles.length > 0 && css.styles.every(style => (style.animation === 'none' || negligible(style.animationDuration)) && negligible(style.transitionDuration)) && css.animations.every(item => Number(item.duration) <= .1), css);

  const faq = await evaluate(`new Promise(resolve=>{const buttons=[...document.querySelectorAll('button[aria-controls*="answer"]')];const button=buttons.find(item=>item.getAttribute('aria-expanded')==='false');button.click();requestAnimationFrame(()=>{const answer=document.getElementById(button.getAttribute('aria-controls'));const style=answer&&getComputedStyle(answer);resolve({expanded:button.getAttribute('aria-expanded'),region:answer?.getAttribute('role'),labelled:answer?.getAttribute('aria-labelledby')===button.id,height:answer?.getBoundingClientRect().height||0,scrollHeight:answer?.scrollHeight||0,opacity:style?Number(style.opacity):0,openCount:buttons.filter(item=>item.getAttribute('aria-expanded')==='true').length});});})`);
  check('Reduced-motion FAQ expands completely by the next frame', faq.expanded === 'true' && faq.region === 'region' && faq.labelled && faq.height > 0 && faq.height >= faq.scrollHeight - 1 && faq.opacity >= .99 && faq.openCount === 1, faq);
  await viewport(390, 844);
  const reducedMenu = await evaluate(`new Promise(resolve=>{document.querySelector('button[aria-controls="mobile-navigation"]').click();requestAnimationFrame(()=>{const panel=document.getElementById('mobile-navigation');const inner=panel.firstElementChild;resolve({expanded:document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded'),inert:panel.inert,height:inner?.getBoundingClientRect().height||0,scrollHeight:inner?.scrollHeight||0,opacity:inner?Number(getComputedStyle(inner).opacity):0});});})`);
  check('Reduced-motion menu expands completely by the next frame', reducedMenu.expanded === 'true' && !reducedMenu.inert && reducedMenu.height > 200 && reducedMenu.height >= reducedMenu.scrollHeight - 1 && reducedMenu.opacity >= .99, reducedMenu);
  await frames();
  check('No runtime exceptions or error consoles', runtimeErrors.length === 0, runtimeErrors);
} catch (error) {
  failure = error.stack || error.message;
  console.error(failure);
  if (command) {
    try { const { data } = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, 'failure.png'), Buffer.from(data, 'base64')); } catch {}
  }
} finally {
  const report = { base, elapsedMs: Date.now() - started, checks, navigation, runtimeErrors, failure: failure || null };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (command) await command('Browser.close').catch(() => {});
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  chrome.kill();
  const failures = checks.filter(check => !check.pass).length;
  console.log(`${checks.length} motion checks; ${failures} failures. Report: ${path.join(output, 'report.json')}`);
  if (failure || failures) process.exitCode = 1;
}
