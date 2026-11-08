import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const HTTP_PORT = 4173;
const CDP_PORT = 9223;

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
  console.log(`Local test server listening at http://127.0.0.1:${HTTP_PORT}`);

  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--user-data-dir=C:\\temp\\brave-test-' + Date.now()
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

  // Wait 4 seconds for full hydration
  await wait(4000);

  // Check initial sidebar tree items (should have full subjects from DEFAULT_TREE)
  const treeCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item')).map(el => el.innerText.trim());
      return items;
    })()`,
    returnByValue: true
  });
  console.log('Top tree items:', treeCheck.result?.value);

  // Expand Past Papers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item'));
      const pp = items.find(el => el.innerText.includes('Past Papers'));
      if (pp) pp.click();
    })()`,
    returnByValue: true
  });
  await wait(500);

  // Expand IAL under Past Papers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item'));
      const ial = items.find(el => el.innerText === '+IAL' || el.innerText === '−IAL' || el.innerText === '• IAL' || el.innerText === 'IAL');
      if (ial) ial.click();
    })()`,
    returnByValue: true
  });
  await wait(500);

  const ialSubjectsCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item')).map(el => el.innerText.trim());
      return items.filter(t => !t.includes('Books') && !t.includes('The Library'));
    })()`,
    returnByValue: true
  });
  console.log('Past Papers & IAL expanded tree items count:', ialSubjectsCheck.result?.value?.length);
  console.log('Sample expanded items:', ialSubjectsCheck.result?.value?.slice(0, 10));

  // Check document table for IAL
  const docCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        summary: document.querySelector('.result-summary')?.innerText || null,
        rowsCount: document.querySelectorAll('.file-table tbody tr').length,
        breadcrumbs: document.querySelector('.breadcrumb-trail')?.innerText || null,
        firstThreeRows: Array.from(document.querySelectorAll('.file-table tbody tr')).slice(0, 3).map(tr => ({
          title: tr.querySelector('.file-title-row a')?.innerText,
          course: tr.querySelector('.details-primary')?.innerText
        }))
      };
    })()`,
    returnByValue: true
  });
  console.log('\n--- IAL DOCUMENT TABLE CHECK ---');
  console.log(JSON.stringify(docCheck.result?.value, null, 2));

  // Test search
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('#search-input');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'Chemistry Unit 1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
    returnByValue: true
  });
  await wait(1000);

  const searchCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        summary: document.querySelector('.result-summary')?.innerText || null,
        rowsCount: document.querySelectorAll('.file-table tbody tr').length,
        firstThreeRows: Array.from(document.querySelectorAll('.file-table tbody tr')).slice(0, 3).map(tr => ({
          title: tr.querySelector('.file-title-row a')?.innerText,
          course: tr.querySelector('.details-primary')?.innerText
        }))
      };
    })()`,
    returnByValue: true
  });
  console.log('\n--- SEARCH "Chemistry Unit 1" CHECK ---');
  console.log(JSON.stringify(searchCheck.result?.value, null, 2));

  ws.close();
  brave.kill();
  server.close();
  process.exit(0);
});
