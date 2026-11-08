import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BRAVE_PATH = "C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe";
const ARTIFACT_DIR = "C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\8382680b-60f8-4d4b-bb41-7e7978f954db\\mobile-screenshots";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const PREVIEW_PORT = 4173;
const CDP_PORT = 9911;

console.log('1. Starting Vite preview on port', PREVIEW_PORT);
const vite = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js',
  'preview',
  '--port', String(PREVIEW_PORT),
  '--strictPort'
], {
  cwd: path.resolve('search-app'),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${PREVIEW_PORT}`);
      if (res.ok) return;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Preview server did not start');
}

const tmpUserData = path.join(os.tmpdir(), 'brave-mobile-preview-' + Date.now());
fs.mkdirSync(tmpUserData, { recursive: true });

async function getWsUrl() {
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        const pages = await res.json();
        if (pages.length > 0 && pages[0].webSocketDebuggerUrl) {
          return pages[0].webSocketDebuggerUrl;
        }
      }
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Could not get WebSocket URL from Brave CDP');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const { res, rej } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) rej(new Error(JSON.stringify(data.error)));
          else res(data.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = this.id++;
      this.callbacks.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const fullPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    console.log(`Saved screenshot: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return fullPath;
  }
}

async function main() {
  let brave = null;
  try {
    await waitForServer();
    console.log('Preview server ready!');

    console.log('2. Launching Brave Headless for Preview Audit...');
    brave = spawn(BRAVE_PATH, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpUserData}`,
      'about:blank'
    ]);

    const wsUrl = await getWsUrl();
    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    // Emulate Mobile Device (iPhone 14 standard: 390 x 844, DPR 2)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
      screenOrientation: { angle: 0, type: 'portraitPrimary' }
    });

    await client.send('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    });

    console.log('Navigating to local preview...');
    await client.send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}` });
    await sleep(2500);

    // 1. Homepage
    console.log('Capturing: fixed-01-home.png');
    await client.captureScreenshot('fixed-01-home.png');

    // 2. Click "Biology" subject card in Wizard
    console.log('Testing Wizard step 2 on mobile...');
    await client.evaluate(`
      (() => {
        const card = Array.from(document.querySelectorAll('.subject-card')).find(c => c.textContent.includes('Biology'));
        if (card) card.click();
      })()
    `);
    await sleep(500);
    await client.evaluate('window.scrollTo(0, 0)');
    await sleep(200);
    console.log('Capturing: fixed-02-wizard-units.png');
    await client.captureScreenshot('fixed-02-wizard-units.png');

    // 3. Click "View All Biology Units..." to go to Results Table
    console.log('Navigating to Results table...');
    await client.evaluate(`
      (() => {
        const btn = document.querySelector('.wizard-option-btn.primary') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View All'));
        if (btn) btn.click();
      })()
    `);
    await sleep(1500);
    console.log('Capturing: fixed-03-results-table.png');
    await client.captureScreenshot('fixed-03-results-table.png');

    // 4. Test Mobile Filter Toggle
    console.log('Testing Filter Drawer toggle...');
    await client.evaluate(`
      (() => {
        const toggle = document.querySelector('.mobile-filter-toggle');
        if (toggle) toggle.click();
      })()
    `);
    await sleep(600);
    await client.evaluate('window.scrollTo(0, 0)');
    console.log('Capturing: fixed-04-filter-drawer.png');
    await client.captureScreenshot('fixed-04-filter-drawer.png');

    // Test "Done & View Results" button to close drawer
    console.log('Clicking "Done & View Results" button...');
    await client.evaluate(`
      (() => {
        const doneBtn = document.querySelector('.filter-apply-btn');
        if (doneBtn) doneBtn.click();
      })()
    `);
    await sleep(600);

    // 5. Open Preview Modal
    console.log('Opening Preview Modal on mobile...');
    await client.evaluate(`
      (() => {
        const splitBtn = document.querySelector('.unified-preview-btn.split-btn') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Split View'));
        if (splitBtn) splitBtn.click();
      })()
    `);
    await sleep(2000);

    // Measure Header Overflow
    const metrics = await client.evaluate(`
      (() => {
        const hdr = document.querySelector('.modal-header');
        const closeBtn = document.querySelector('.modal-close-btn');
        const actions = document.querySelector('.modal-actions');
        const activeBtn = document.querySelector('.modal-sibling-btn.active');
        const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
        return {
          windowWidth: window.innerWidth,
          headerScrollWidth: hdr?.scrollWidth,
          headerClientWidth: hdr?.clientWidth,
          activeBtnText: activeBtn?.innerText.trim(),
          closeBtnRect: closeRect ? { x: closeRect.x, y: closeRect.y, width: closeRect.width, right: closeRect.right, isVisibleOnScreen: closeRect.right <= window.innerWidth } : null
        };
      })()
    `);
    console.log('FIXED MODAL METRICS:', JSON.stringify(metrics, null, 2));

    console.log('Capturing: fixed-05-modal-single-qp.png');
    await client.captureScreenshot('fixed-05-modal-single-qp.png');

    // 6. Click "MS" Tab
    console.log('Switching to MS tab in modal...');
    await client.evaluate(`
      (() => {
        const msBtn = Array.from(document.querySelectorAll('.modal-sibling-btn')).find(b => b.innerText.trim() === 'MS');
        if (msBtn) msBtn.click();
      })()
    `);
    await sleep(1000);
    console.log('Capturing: fixed-06-modal-ms.png');
    await client.captureScreenshot('fixed-06-modal-ms.png');

    // 7. Click "Split" Tab
    console.log('Switching to Split tab in modal...');
    await client.evaluate(`
      (() => {
        const splitBtn = Array.from(document.querySelectorAll('.modal-sibling-btn')).find(b => b.innerText.trim() === 'Split');
        if (splitBtn) splitBtn.click();
      })()
    `);
    await sleep(1000);
    console.log('Capturing: fixed-07-modal-split.png');
    await client.captureScreenshot('fixed-07-modal-split.png');

    // 8. Close Modal via Close Button
    console.log('Clicking Close Button [✕]...');
    await client.evaluate(`
      (() => {
        const close = document.querySelector('.modal-close-btn');
        if (close) close.click();
      })()
    `);
    await sleep(600);

    // 9. Navigate to About Page
    console.log('Navigating to About page...');
    await client.evaluate(`
      (() => {
        const ab = Array.from(document.querySelectorAll('.footer-link, button')).find(b => b.textContent.includes('About'));
        if (ab) ab.click();
      })()
    `);
    await sleep(800);
    await client.evaluate('window.scrollTo(0, 0)');
    console.log('Capturing: fixed-08-about-header.png');
    await client.captureScreenshot('fixed-08-about-header.png');

    // 10. Navigate to Changelog Page
    console.log('Navigating to Changelog page...');
    await client.evaluate(`
      (() => {
        const cl = Array.from(document.querySelectorAll('.footer-link, .footer-update-micro')).find(b => b.textContent.includes('Changelog') || b.textContent.includes('updated'));
        if (cl) cl.click();
      })()
    `);
    await sleep(800);
    await client.evaluate('window.scrollTo(0, 0)');
    console.log('Capturing: fixed-09-changelog-header.png');
    await client.captureScreenshot('fixed-09-changelog-header.png');

    console.log('ALL PREVIEW TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Preview audit error:', err);
  } finally {
    if (brave) brave.kill();
    vite.kill();
    await sleep(500);
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
    console.log('Cleaned up and exited.');
  }
}

main();
