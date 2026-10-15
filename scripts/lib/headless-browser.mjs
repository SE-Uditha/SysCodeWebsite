import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function openTestBrowser(output, port = 9338) {
  await fs.mkdir(output, { recursive: true });
  const executable = process.env.ADMIN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(output, 'edge-profile')}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let startupError;
  child.on('error', (error) => { startupError = error; });
  for (let count = 0; ; count++) {
    try { if ((await fetch(`http://localhost:${port}/json/version`)).ok) break; } catch {}
    if (count > 100 || startupError) { child.kill(); throw new Error('Isolated test browser did not start.'); }
    await pause(100);
  }
  const target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map((arg) => arg.description || arg.value || '').join(' '));
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 12000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) { if (await evaluate(expression)) return; await pause(60); }
    throw new Error(`Timed out waiting for ${label}.`);
  };
  const click = async (selector) => {
    const visible = `([...document.querySelectorAll(${JSON.stringify(selector)})].find(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&!element.disabled}))`;
    await waitFor(`Boolean(${visible})`, selector);
    await evaluate(`${visible}.scrollIntoView({block:'center',behavior:'instant'})`);
    await pause(70);
    const point = await evaluate(`(()=>{const b=${visible}.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const type = async (selector, value) => {
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, selector);
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select()})()`);
    await command('Input.insertText', { text: value });
  };
  await command('Runtime.enable'); await command('Page.enable');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  return { command, evaluate, waitFor, click, type, errors,
    viewport: (width, height = 900) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 }),
    async screenshot(filename) { const { data } = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, filename), Buffer.from(data, 'base64')); },
    async close() { try { await command('Browser.close'); } catch {} if (socket.readyState === WebSocket.OPEN) socket.close(); child.kill(); },
  };
}
