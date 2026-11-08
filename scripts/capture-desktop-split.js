import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const CDP_PORT = 9230;
const wait = ms => new Promise(r => setTimeout(r, ms));
const fetchJson = url => new Promise((res, rej) => http.get(url, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));

async function run() {
  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\temp\\brave-1080p-' + Date.now()
  ], { detached: true });

  await wait(2500);
  const targets = await fetchJson('http://127.0.0.1:' + CDP_PORT + '/json/list');
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);

  let id = 1;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = id++;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  ws.onopen = async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'https://www.conceptualist.uk/' });
  };
  ws.onmessage = d => {
    const m = JSON.parse(d.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m.result);
      pending.delete(m.id);
    }
  };

  await wait(8000);

  // Search WMA11
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('#search-input');
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(input, 'WMA11');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });
  await wait(1500);

  // Click Split View button
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.unified-preview-btn.split-btn')?.click()`
  });
  await wait(2000);

  const rects = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.modal-container');
      const r = c?.getBoundingClientRect();
      const b = document.querySelector('.modal-body')?.getBoundingClientRect();
      const panes = Array.from(document.querySelectorAll('.split-pane')).map(p => p.getBoundingClientRect());
      return { container: r, body: b, panes };
    })()`,
    returnByValue: true
  });
  console.log('Layout dimensions:', JSON.stringify(rects.result?.value, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\533c8089-1661-4676-bf20-f05b2e6048d2\\live_desktop_split_view.png', Buffer.from(shot.data, 'base64'));
  console.log('Desktop 1080p screenshot saved!');

  ws.close();
  brave.kill();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

