import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const CDP_PORT = 9586;
const SERVER_PORT = 4194;
const DIST_DIR = 'e:\\The Library\\search-app\\dist';

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !reqPath.includes('.')) reqPath = '/index.html';
  const filePath = path.join(DIST_DIR, reqPath);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(DIST_DIR, 'index.html')));
  }
});

const tmpUserData = path.join(os.tmpdir(), 'brave-dbg-res-' + Date.now());
const wait = ms => new Promise(r => setTimeout(r, ms));
const fetchJson = url => new Promise((res, rej) => http.get(url, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));

async function run() {
  await new Promise(r => server.listen(SERVER_PORT, r));
  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpUserData}`,
    'about:blank'
  ]);

  try {
    await wait(2000);
    const targets = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
    ws.onmessage = d => {
      const m = JSON.parse(d.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id).resolve(m.result);
        pending.delete(m.id);
      }
    };
    await new Promise(r => ws.onopen = r);

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${SERVER_PORT}/` });
    await wait(3000);

    // Click Math -> P1 -> All
    await send('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('.subject-card')).find(c => c.textContent.includes('Mathematics'))?.click()` });
    await wait(800);
    await send('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('.wizard-option-btn')).find(b => b.textContent.includes('Pure Mathematics 1'))?.click()` });
    await wait(800);
    await send('Runtime.evaluate', { expression: `(Array.from(document.querySelectorAll('.wizard-option-btn')).find(b => b.textContent.includes('All Examination Years')) || document.querySelectorAll('.wizard-option-btn')[0])?.click()` });
    await wait(2000);

    const summary = await send('Runtime.evaluate', {
      expression: `document.querySelector('.result-summary')?.innerText`,
      returnByValue: true
    });
    console.log('Result Summary:', summary.result?.value);

    // Let's scroll into view of the first Split View button and inspect its attributes
    const btnInfo = await send('Runtime.evaluate', {
      expression: `(() => {
        const splitBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Split View'));
        return {
          count: splitBtns.length,
          firstBtn: splitBtns[0] ? {
            tag: splitBtns[0].tagName,
            cls: splitBtns[0].className,
            offsetParent: Boolean(splitBtns[0].offsetParent),
            rect: splitBtns[0].getBoundingClientRect()
          } : null
        };
      })()`,
      returnByValue: true
    });
    console.log('Button info:', JSON.stringify(btnInfo.result?.value, null, 2));

    // Now click the first split button by scrolling it into view
    await send('Runtime.evaluate', {
      expression: `(() => {
        const splitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Split View'));
        if (splitBtn) {
          splitBtn.scrollIntoView({ block: 'center' });
          splitBtn.click();
        }
      })()`
    });
    await wait(3000);

    const modalCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const backdrop = document.querySelector('.modal-backdrop');
        const container = document.querySelector('.modal-container');
        const closeMobile = document.querySelector('.modal-close-btn.mobile-only-close');
        const title = document.querySelector('.modal-title');
        return {
          backdropFound: Boolean(backdrop),
          containerFound: Boolean(container),
          titleText: title ? title.innerText : null,
          containerRect: container ? {
            left: Math.round(container.getBoundingClientRect().left),
            right: Math.round(container.getBoundingClientRect().right),
            width: Math.round(container.getBoundingClientRect().width)
          } : null,
          closeMobileRect: closeMobile ? {
            left: Math.round(closeMobile.getBoundingClientRect().left),
            right: Math.round(closeMobile.getBoundingClientRect().right),
            width: Math.round(closeMobile.getBoundingClientRect().width)
          } : null,
          docScrollW: document.documentElement.scrollWidth,
          winInnerW: window.innerWidth
        };
      })()`,
      returnByValue: true
    });
    console.log('Modal Check after scrollIntoView click:', JSON.stringify(modalCheck.result?.value, null, 2));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\325638cb-180a-4e28-83b9-d9bf3bf51922\\mobile_audit_fixed\\VERIFIED_modal_in_view.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved VERIFIED_modal_in_view.png');

    ws.close();
  } finally {
    server.close();
    brave.kill();
  }
}

run().catch(e => { console.error(e); process.exit(1); });

