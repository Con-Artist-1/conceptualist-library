import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const HTTP_PORT = 4174;
const CDP_PORT = 9224;

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(HTTP_PORT, async () => {
  console.log(`Test server at http://127.0.0.1:${HTTP_PORT}`);
  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\temp\\brave-modal-' + Date.now()
  ], { detached: true });

  await wait(2000);

  let version;
  for (let i = 0; i < 10; i++) {
    try {
      version = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
      break;
    } catch {
      await wait(500);
    }
  }

  const targets = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let id = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onopen = async () => {
    await send('Network.enable');
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });
  };

  ws.onmessage = data => {
    const msg = JSON.parse(data.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
      return;
    }
  };

  // Wait 3 seconds for index load
  await wait(3000);

  // Search "WMA11" to get past papers with QP and MS
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('#search-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'WMA11');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
    returnByValue: true
  });
  await wait(1000);

  // Check the table row action button text
  const buttonCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('.unified-preview-btn, .preview-btn')).map(b => ({
        text: b.innerText.trim(),
        className: b.className
      }));
      return btns.slice(0, 5);
    })()`,
    returnByValue: true
  });
  console.log('Table action buttons (first 5):', buttonCheck.result?.value);

  // Click the first "Split View" button to open modal
  console.log('Clicking the first Split View button...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.unified-preview-btn, .preview-btn');
      if (btn) { btn.click(); return 'Clicked ' + btn.innerText; }
      return 'Button not found';
    })()`,
    returnByValue: true
  });

  await wait(1000);

  // Inspect the opened modal: dimensions, split mode, iframes
  const modalCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const backdrop = document.querySelector('.modal-backdrop');
      const container = document.querySelector('.modal-container');
      const header = document.querySelector('.modal-header');
      const body = document.querySelector('.modal-body');
      const iframes = Array.from(document.querySelectorAll('.modal-iframe')).map(f => ({
        title: f.title,
        src: f.src
      }));
      const activeBtn = document.querySelector('.modal-sibling-btn.active')?.innerText || null;

      const rect = container?.getBoundingClientRect();

      return {
        hasModal: Boolean(backdrop),
        title: document.querySelector('.modal-title')?.innerText || null,
        activeButton: activeBtn,
        isSplitGrid: body?.classList.contains('split-grid'),
        iframeCount: iframes.length,
        iframes,
        containerWidth: rect?.width,
        containerHeight: rect?.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        backdropPadding: window.getComputedStyle(backdrop).padding
      };
    })()`,
    returnByValue: true
  });

  console.log('\n--- MODAL INSPECTION RESULT ---');
  console.log(JSON.stringify(modalCheck.result?.value, null, 2));

  // Check Changelog text
  console.log('\nNavigating to Changelog to check humanized text...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      // Close modal first
      document.querySelector('.modal-close-btn')?.click();
      // Click footer changelog link
      document.querySelector('.footer-update-micro')?.click();
    })()`,
    returnByValue: true
  });
  await wait(500);

  const changelogCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const entries = Array.from(document.querySelectorAll('.changelog-entry')).slice(0, 3).map(e => ({
        version: e.querySelector('.changelog-badge')?.innerText.trim(),
        title: e.querySelector('.changelog-entry-title')?.innerText.trim(),
        summary: e.querySelector('.changelog-entry-summary')?.innerText.trim(),
        firstBullet: e.querySelector('.changelog-bullets li')?.innerText.trim()
      }));
      return entries;
    })()`,
    returnByValue: true
  });
  console.log('\n--- CHANGELOG SAMPLES ---');
  console.log(JSON.stringify(changelogCheck.result?.value, null, 2));

  ws.close();
  brave.kill();
  server.close();
  process.exit(0);
});
