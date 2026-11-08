import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const CDP_PORT = 9235;
const HTTP_PORT = 4178;

const wait = ms => new Promise(r => setTimeout(r, ms));
const fetchJson = url => new Promise((res, rej) => http.get(url, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));

// Simple static server for dist
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  let filePath = path.join('e:\\The Library\\search-app\\dist', reqPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join('e:\\The Library\\search-app\\dist\\index.html');
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
});

server.listen(HTTP_PORT, async () => {
  console.log(`Local static server running on http://127.0.0.1:${HTTP_PORT}`);

  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--no-sandbox',
    '--disable-gpu',
    '--user-data-dir=C:\\temp\\brave-switch-test-' + Date.now()
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });
  };
  ws.onmessage = d => {
    const m = JSON.parse(d.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m.result);
      pending.delete(m.id);
    }
  };

  // Wait for index to load in local app
  await wait(4000);

  // Search WMA11
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('#search-input');
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(input, 'WMA11');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });
  await wait(1000);

  // Open modal via Split View button
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.unified-preview-btn.split-btn')?.click()`
  });
  await wait(1000);

  const getState = async (stepName) => {
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const body = document.querySelector('.modal-body');
        const activeBtn = document.querySelector('.modal-sibling-btn.active')?.innerText;
        const iframes = Array.from(document.querySelectorAll('.modal-iframe')).map(f => ({
          title: f.title,
          src: f.src?.split('/').pop()
        }));
        const isSplitGrid = body?.classList.contains('split-grid');
        const modalTitle = document.querySelector('.modal-title')?.innerText;
        return { activeBtn, isSplitGrid, iframeCount: iframes.length, iframes, modalTitle };
      })()`,
      returnByValue: true
    });
    console.log(`[${stepName}]`, JSON.stringify(res.result?.value, null, 2));
    return res.result?.value;
  };

  // Step 1: Initial state (should be Split View)
  const initial = await getState('Step 1: Initial Boot');

  // Step 2: Click "Question Paper [QP]"
  await send('Runtime.evaluate', {
    expression: `Array.from(document.querySelectorAll('.modal-sibling-btn')).find(b => b.innerText.includes('Question Paper'))?.click()`
  });
  await wait(500);
  const afterQP = await getState('Step 2: Clicked QP');

  // Step 3: Click "Mark Scheme [MS]"
  await send('Runtime.evaluate', {
    expression: `Array.from(document.querySelectorAll('.modal-sibling-btn')).find(b => b.innerText.includes('Mark Scheme'))?.click()`
  });
  await wait(500);
  const afterMS = await getState('Step 3: Clicked MS');

  // Step 4: Click "Split View (QP + MS)"
  await send('Runtime.evaluate', {
    expression: `Array.from(document.querySelectorAll('.modal-sibling-btn')).find(b => b.innerText.includes('Split View'))?.click()`
  });
  await wait(500);
  const afterSplitAgain = await getState('Step 4: Clicked Split View again');

  // Validation
  let success = true;
  if (initial.activeBtn !== 'Split View (QP + MS)' || !initial.isSplitGrid || initial.iframeCount !== 2) {
    console.error('FAIL: Initial state is not Split View');
    success = false;
  }
  if (!afterQP.activeBtn.includes('Question Paper') || afterQP.isSplitGrid || afterQP.iframeCount !== 1) {
    console.error('FAIL: After clicking QP, did not switch to single QP view');
    success = false;
  }
  if (!afterMS.activeBtn.includes('Mark Scheme') || afterMS.isSplitGrid || afterMS.iframeCount !== 1) {
    console.error('FAIL: After clicking MS, did not switch to single MS view');
    success = false;
  }
  if (afterSplitAgain.activeBtn !== 'Split View (QP + MS)' || !afterSplitAgain.isSplitGrid || afterSplitAgain.iframeCount !== 2) {
    console.error('FAIL: After clicking Split View again, did not return to split view');
    success = false;
  }

  if (success) {
    console.log('\n>>> ALL 4 TRANSITIONS PASSED FLAWLESSLY! <<<');
  }

  ws.close();
  brave.kill();
  server.close();
  process.exit(success ? 0 : 1);
});

