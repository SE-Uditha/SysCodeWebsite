import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Run against an already-started local production server. Uses its own headless
// browser profile and never connects to the user's browser or sends enquiries.
const base = process.env.RESPONSIVE_BASE_URL || 'http://localhost:3100';
const output = path.resolve('.next/responsive-qa');
const browser = process.env.RESPONSIVE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9333;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const chrome = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(output, path.basename(browser, '.exe') + '-profile')}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
let command;
const results = [];
const errors = [];

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`http://localhost:${port}/json/version`)).ok) { ready = true; break; } } catch {}
    await pause(100);
  }
  if (!ready) throw new Error('Headless browser did not start.');
  const target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const viewport = async (width, height = width < 640 ? 844 : 1080) => {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640, screenWidth: width, screenHeight: height });
    await command('Emulation.setTouchEmulationEnabled', { enabled: width < 1024 });
    await pause(80);
  };
  const screenshot = async (name, full = false) => {
    const params = { format: 'png', captureBeyondViewport: full };
    if (full) { const { cssContentSize: size } = await command('Page.getLayoutMetrics'); params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 }; }
    const { data } = await command('Page.captureScreenshot', params);
    await fs.writeFile(path.join(output, name), Buffer.from(data, 'base64'));
  };
  await command('Page.enable'); await command('Runtime.enable');
  const routes = process.env.RESPONSIVE_ROUTES?.split(',') || ['/', '/about', '/services', '/pricing', '/portfolio', '/contact', '/terms', '/privacy-policy'];
  const widths = [320, 360, 375, 390, 430, 640, 768, 1024, 1280, 1440, 1920, 2560, 3000, 3440, 3840, 5120, 7680];
  for (const route of routes) {
    await viewport(320); await command('Page.navigate', { url: base + route });
    const hydrated = await evaluate(`new Promise(async resolve => { for(let i=0;i<150;i++){ if(document.readyState==='complete' && document.querySelector('h1') && (!${JSON.stringify(route === '/' || route === '/contact')} || document.querySelector('form input'))){await document.fonts.ready;resolve(true);return;} await new Promise(r=>setTimeout(r,100));}resolve(false);})`);
    if (!hydrated) throw new Error(`Page did not hydrate: ${route}`);
    await pause(1200);
    for (const width of widths) {
      await viewport(width);
      const metric = await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const viewport=document.documentElement.clientWidth;
        const scrollWidth=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth);
        const offenders=scrollWidth>viewport+1?[...document.body.querySelectorAll('*')].filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&(rect.right>viewport+1||rect.left<-1);}).slice(0,12).map(element=>({tag:element.tagName,class:String(element.className),text:element.textContent.slice(0,55)})):[];
        resolve({viewport,scrollWidth,containerWidth:document.querySelector('.site-container').getBoundingClientRect().width,rootFont:parseFloat(getComputedStyle(document.documentElement).fontSize),headingSize:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),offenders});
      })))`);
      results.push({ route, width, ...metric });
      if (metric.scrollWidth > metric.viewport + 1) errors.push({ route, width, ...metric });
      if (route === '/' && [320, 768, 1440, 3840].includes(width)) { await evaluate('scrollTo(0,0)'); await pause(150); await screenshot(`home-${width}.png`); }
    }
    if (route === '/') {
      await viewport(320, 390); await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').click()`); await pause(350);
      const menu = await evaluate(`(()=>{const button=document.querySelector('button[aria-controls="mobile-navigation"]');const menu=document.getElementById(button.getAttribute('aria-controls'));const scroller=menu.querySelector('nav').parentElement;return {open:button.getAttribute('aria-expanded')==='true',height:scroller.getBoundingClientRect().height,viewport:innerHeight,overflow:getComputedStyle(scroller).overflowY};})()`);
      if (!menu.open || menu.height > menu.viewport - 70 || menu.overflow !== 'auto') errors.push({ interaction: 'short mobile menu', ...menu });
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await pause(80);
      if (await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded')!=='false'`)) errors.push({ interaction: 'Escape closes menu' });
      await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').click()`); await viewport(1280); await pause(100);
      if (await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded')!=='false'`)) errors.push({ interaction: 'desktop resize closes menu' });
      const brandSurfaces = await evaluate(`(()=>{const header=document.querySelector('header');const footer=document.querySelector('footer');const navStyle=getComputedStyle(header.querySelector('nav[aria-label="Main navigation"] a'));const footerStyle=getComputedStyle(footer.querySelector('p'));const quoteStyle=getComputedStyle(header.querySelector('nav[aria-label="Main navigation"] + div a'));return {header:getComputedStyle(header).backgroundColor,footer:getComputedStyle(footer).backgroundColor,navText:navStyle.color,navWeight:Number(navStyle.fontWeight),footerText:footerStyle.color,footerWeight:Number(footerStyle.fontWeight),quoteText:quoteStyle.color,quoteBackground:quoteStyle.backgroundColor,headingFamily:getComputedStyle(document.querySelector('main h1')).fontFamily,navFamily:navStyle.fontFamily,footerFamily:footerStyle.fontFamily};})()`);
      const usesHeadingFont = family => family.split(',')[0].trim() === brandSurfaces.headingFamily.split(',')[0].trim();
      if (brandSurfaces.header !== 'rgb(255, 102, 0)' || brandSurfaces.footer !== brandSurfaces.header || brandSurfaces.navText !== 'rgb(255, 255, 255)' || brandSurfaces.footerText !== 'rgb(255, 255, 255)' || brandSurfaces.quoteText === 'rgb(255, 255, 255)' || brandSurfaces.quoteText === 'rgb(0, 0, 0)' || brandSurfaces.quoteBackground !== 'rgb(255, 255, 255)' || brandSurfaces.navWeight < 700 || brandSurfaces.footerWeight < 600 || !usesHeadingFont(brandSurfaces.navFamily) || !usesHeadingFont(brandSurfaces.footerFamily)) errors.push({ interaction: 'brand header/footer typography', ...brandSurfaces });
      const navLink = await evaluate(`(()=>{const rect=document.querySelector('header nav[aria-label="Main navigation"] a').getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`);
      await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...navLink }); await pause(250);
      const hover = await evaluate(`(()=>{const style=getComputedStyle(document.querySelector('header nav[aria-label="Main navigation"] a'));return {background:style.backgroundColor,color:style.color};})()`);
      if (hover.background === brandSurfaces.header || hover.background === 'rgba(0, 0, 0, 0)' || hover.color !== 'rgb(255, 255, 255)') errors.push({ interaction: 'navigation hover typography', ...hover });
      await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 150 });
      await viewport(1440); await evaluate(`document.querySelector('footer').scrollIntoView({block:'start',behavior:'instant'})`); await pause(150); await screenshot('footer-1440.png');
      await viewport(320); await evaluate(`document.querySelector('footer').scrollIntoView({block:'start',behavior:'instant'})`); await pause(150); await screenshot('footer-320.png');
      await viewport(1440);
      await evaluate(`new Promise(async resolve=>{document.documentElement.style.scrollBehavior='auto';for(let top=0;top<document.body.scrollHeight;top+=700){scrollTo(0,top);await new Promise(r=>setTimeout(r,100));}scrollTo(0,0);await new Promise(r=>setTimeout(r,1000));resolve(true);})`);
      await screenshot('home-1440-full.png', true);
      await viewport(1440); await evaluate(`document.querySelector('button[aria-controls*="answer"]').closest('section').scrollIntoView({block:'start',behavior:'instant'})`); await pause(150); await screenshot('faq-1440.png');
      await viewport(320); await evaluate(`document.querySelector('button[aria-controls*="answer"]').scrollIntoView({block:'start',behavior:'instant'})`); await pause(150); await screenshot('faq-320.png');
      await evaluate(`document.querySelector('button[aria-controls*="answer"]').click()`); await pause(350);
      if (await evaluate(`document.querySelector('button[aria-controls*="answer"]').getAttribute('aria-expanded')!=='false'`)) errors.push({ interaction: 'FAQ toggle' });
    }
    if (route === '/contact') {
      // Empty submission triggers local validation and cannot send an enquiry.
      await viewport(320); await evaluate(`document.querySelector('form button[type="submit"]').click()`); await pause(400);
      const form = await evaluate(`(()=>{const fields=[...document.querySelectorAll('form input,form select,form textarea')];return {invalid:fields.filter(field=>field.getAttribute('aria-invalid')==='true').length,minFont:Math.min(...fields.map(field=>parseFloat(getComputedStyle(field).fontSize))),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};})()`);
      if (!form.invalid || form.minFont < 16 || form.overflow) errors.push({ interaction: 'mobile form validation', ...form });
      await evaluate(`document.querySelector('form').scrollIntoView({block:'start',behavior:'instant'})`); await pause(100); await screenshot('contact-320-validation.png');
    }
    if (route === '/portfolio') {
      // Select a category in the actual published collection. Administrators may
      // remove seed demos or publish any number of projects in each category.
      const published = await evaluate(`([...document.querySelectorAll('main [role="listitem"]')].map(item=>({name:item.querySelector('h3')?.textContent.trim(),category:item.querySelector('h3')?.previousElementSibling?.textContent.trim()})))`);
      if (!published.length || !published[0].category) throw new Error('Published portfolio has no categorized project to filter.');
      const category = published[0].category;
      const expected = published.filter(project => project.category === category).map(project => project.name).sort();
      await viewport(320);
      await evaluate(`(()=>{const button=[...document.querySelectorAll('button[aria-pressed]')].find(item=>item.textContent.trim()===${JSON.stringify(category)});if(!button)throw Error('Missing published category filter');button.click();})()`);
      await pause(500);
      const filter = await evaluate(`({active:[...document.querySelectorAll('button[aria-pressed="true"]')].map(button=>button.textContent.trim()),cards:[...document.querySelectorAll('main [role="listitem"]')].map(item=>({name:item.querySelector('h3')?.textContent.trim(),category:item.querySelector('h3')?.previousElementSibling?.textContent.trim(),hidden:item.getAttribute('aria-hidden'),inert:item.inert}))})`);
      if (filter.active.length !== 1 || filter.active[0] !== category || filter.cards.length !== expected.length || filter.cards.some(card => card.category !== category || card.hidden === 'true' || card.inert) || JSON.stringify(filter.cards.map(card => card.name).sort()) !== JSON.stringify(expected)) errors.push({ interaction: 'portfolio filter', category, expected, ...filter });
    }
    console.log(`${route}: ${widths.length} viewports checked.`);
  }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(`${results.length} viewport checks complete; ${errors.length} failures.`);
  if (errors.length) { console.log(JSON.stringify(errors, null, 2)); process.exitCode = 1; }
} catch (error) {
  console.error(error.stack); process.exitCode = 1;
} finally {
  if (command) await command('Browser.close').catch(() => {});
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  chrome.kill();
}
