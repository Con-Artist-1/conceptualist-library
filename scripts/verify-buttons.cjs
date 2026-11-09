const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const HTTP_PORT = 4174;
const CDP_PORT = 9224;

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
  res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
  fs.createReadStream(filePath).pipe(res);
});

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, r));
  console.log(`Test server running at http://127.0.0.1:${HTTP_PORT}`);

  const tempDir = `C:\\Users\\Diavlon\\AppData\\Local\\Temp\\brave_verify_${Date.now()}`;
  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tempDir}`,
    '--disable-gpu',
    '--no-first-run',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  function getWsUrl() {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          const list = JSON.parse(raw);
          const page = list.find(t => t.type === 'page');
          if (page) resolve(page.webSocketDebuggerUrl);
          else reject(new Error('No page found: ' + raw));
        });
      }).on('error', reject);
    });
  }

  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (pending.has(msg.id)) {
      const cb = pending.get(msg.id);
      pending.delete(msg.id);
      cb(msg.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}` });

  // Wait for initial hydration
  await new Promise(r => setTimeout(r, 3500));

  // Perform search for "mechanics 2021 may"
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const input = document.querySelector('.search-input');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, 'mechanics 2021 may');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `
  });

  await new Promise(r => setTimeout(r, 2000));

  const artifactDir = 'C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\325638cb-180a-4e28-83b9-d9bf3bf51922';

  // 1. MOBILE DARK MODE (Exact user view)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  // Ensure dark mode is active
  await send('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'dark');`
  });
  await new Promise(r => setTimeout(r, 500));

  const mobDarkShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'VERIFIED_mobile_dark_buttons.png'), Buffer.from(mobDarkShot.data, 'base64'));

  const mobDarkEval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const qp = document.querySelector('.unified-doc-btn.qp');
        const ms = document.querySelector('.unified-doc-btn.ms');
        const view = document.querySelector('.unified-preview-btn');
        const qpMobile = qp ? qp.querySelector('.btn-mobile-text') : null;
        const msMobile = ms ? ms.querySelector('.btn-mobile-text') : null;
        return {
          qp: qp ? {
            text: qp.innerText.trim(),
            bg: getComputedStyle(qp).backgroundColor,
            color: getComputedStyle(qp).color,
            fontSize: getComputedStyle(qp).fontSize,
            innerMobileFontSize: qpMobile ? getComputedStyle(qpMobile).fontSize : null,
            innerMobileColor: qpMobile ? getComputedStyle(qpMobile).color : null
          } : null,
          ms: ms ? {
            text: ms.innerText.trim(),
            bg: getComputedStyle(ms).backgroundColor,
            color: getComputedStyle(ms).color,
            fontSize: getComputedStyle(ms).fontSize,
            innerMobileFontSize: msMobile ? getComputedStyle(msMobile).fontSize : null,
            innerMobileColor: msMobile ? getComputedStyle(msMobile).color : null
          } : null,
          view: view ? {
            text: view.innerText.trim(),
            bg: getComputedStyle(view).backgroundColor,
            color: getComputedStyle(view).color,
            fontSize: getComputedStyle(view).fontSize
          } : null
        };
      })()
    `,
    returnByValue: true
  });

  console.log('Mobile Dark Mode Results:', JSON.stringify(mobDarkEval.result.value, null, 2));

  // 2. MOBILE LIGHT MODE
  await send('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'light');`
  });
  await new Promise(r => setTimeout(r, 500));

  const mobLightShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'VERIFIED_mobile_light_buttons.png'), Buffer.from(mobLightShot.data, 'base64'));

  const mobLightEval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const qp = document.querySelector('.unified-doc-btn.qp');
        const ms = document.querySelector('.unified-doc-btn.ms');
        const view = document.querySelector('.unified-preview-btn');
        return {
          qp: qp ? { text: qp.innerText.trim(), bg: getComputedStyle(qp).backgroundColor, color: getComputedStyle(qp).color } : null,
          ms: ms ? { text: ms.innerText.trim(), bg: getComputedStyle(ms).backgroundColor, color: getComputedStyle(ms).color } : null,
          view: view ? { text: view.innerText.trim(), bg: getComputedStyle(view).backgroundColor, color: getComputedStyle(view).color } : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Mobile Light Mode Results:', JSON.stringify(mobLightEval.result.value, null, 2));

  // 3. DESKTOP DARK MODE
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await send('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'dark');`
  });
  await new Promise(r => setTimeout(r, 500));

  const deskDarkShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'VERIFIED_desktop_dark_buttons.png'), Buffer.from(deskDarkShot.data, 'base64'));

  const deskDarkEval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const qp = document.querySelector('.unified-doc-btn.qp');
        const ms = document.querySelector('.unified-doc-btn.ms');
        const view = document.querySelector('.unified-preview-btn');
        return {
          qp: qp ? { text: qp.innerText.trim(), bg: getComputedStyle(qp).backgroundColor, color: getComputedStyle(qp).color, fontSize: getComputedStyle(qp).fontSize } : null,
          ms: ms ? { text: ms.innerText.trim(), bg: getComputedStyle(ms).backgroundColor, color: getComputedStyle(ms).color, fontSize: getComputedStyle(ms).fontSize } : null,
          view: view ? { text: view.innerText.trim(), bg: getComputedStyle(view).backgroundColor, color: getComputedStyle(view).color, fontSize: getComputedStyle(view).fontSize } : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Desktop Dark Mode Results:', JSON.stringify(deskDarkEval.result.value, null, 2));

  // 4. DESKTOP LIGHT MODE
  await send('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'light');`
  });
  await new Promise(r => setTimeout(r, 500));

  const deskLightShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'VERIFIED_desktop_light_buttons.png'), Buffer.from(deskLightShot.data, 'base64'));

  const deskLightEval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const qp = document.querySelector('.unified-doc-btn.qp');
        const ms = document.querySelector('.unified-doc-btn.ms');
        const view = document.querySelector('.unified-preview-btn');
        return {
          qp: qp ? { text: qp.innerText.trim(), bg: getComputedStyle(qp).backgroundColor, color: getComputedStyle(qp).color, fontSize: getComputedStyle(qp).fontSize } : null,
          ms: ms ? { text: ms.innerText.trim(), bg: getComputedStyle(ms).backgroundColor, color: getComputedStyle(ms).color, fontSize: getComputedStyle(ms).fontSize } : null,
          view: view ? { text: view.innerText.trim(), bg: getComputedStyle(view).backgroundColor, color: getComputedStyle(view).color, fontSize: getComputedStyle(view).fontSize } : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Desktop Light Mode Results:', JSON.stringify(deskLightEval.result.value, null, 2));

  brave.kill();
  server.close();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

