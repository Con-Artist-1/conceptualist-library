import http from 'http';
import { spawn } from 'child_process';

const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const CDP_PORT = 9225;
const wait = ms => new Promise(r => setTimeout(r, ms));
const fetchJson = url => new Promise((resolve, reject) => {
  http.get(url, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => resolve(JSON.parse(d)));
  }).on('error', reject);
});

async function run() {
  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\temp\\brave-live-modal-' + Date.now()
  ], { detached: true });

  await wait(2000);
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
    await send('Network.enable');
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: 'https://www.conceptualist.uk/' });
  };
  ws.onmessage = d => {
    const m = JSON.parse(d.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m.result);
      pending.delete(m.id);
    }
  };

  // Wait 8 seconds for live index load
  await wait(8000);

  // Search WMA11
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('#search-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'WMA11');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });
  await wait(1000);

  // Check buttons
  const btn = await send('Runtime.evaluate', {
    expression: `document.querySelector('.unified-preview-btn, .preview-btn')?.innerText`,
    returnByValue: true
  });
  console.log('Live button text:', btn.result?.value);

  // Click button
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.unified-preview-btn, .preview-btn')?.click()`
  });
  await wait(1000);

  const modal = await send('Runtime.evaluate', {
    expression: `(() => {
      const container = document.querySelector('.modal-container');
      const rect = container?.getBoundingClientRect();
      const body = document.querySelector('.modal-body');
      const iframes = Array.from(document.querySelectorAll('.modal-iframe')).map(f => f.title);
      return {
        hasModal: Boolean(container),
        title: document.querySelector('.modal-title')?.innerText,
        activeBtn: document.querySelector('.modal-sibling-btn.active')?.innerText,
        isSplit: body?.classList.contains('split-grid'),
        iframes,
        width: rect?.width,
        height: rect?.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight
      };
    })()`,
    returnByValue: true
  });
  console.log('Live modal inspection:', modal.result?.value);

  ws.close();
  brave.kill();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

