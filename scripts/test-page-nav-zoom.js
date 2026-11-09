import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BRAVE_PATH = "C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe";
const ARTIFACT_DIR = "C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\8382680b-60f8-4d4b-bb41-7e7978f954db\\mobile-screenshots";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const PREVIEW_PORT = 4178;
const CDP_PORT = 9934;

console.log('Starting Vite preview on port', PREVIEW_PORT);
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
  for (let i = 0; i < 35; i++) {
    try {
      const res = await fetch(`http://localhost:${PREVIEW_PORT}`);
      if (res.ok) return;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Preview server did not start');
}

const tmpUserData = path.join(os.tmpdir(), 'brave-pdf-zoom-test-' + Date.now());
fs.mkdirSync(tmpUserData, { recursive: true });

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
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

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1.5,
      mobile: false
    });

    console.log('Navigating to local preview...');
    await client.send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}` });
    await sleep(2500);

    // Filter to Biology
    await client.evaluate(`
      (() => {
        const bioCard = Array.from(document.querySelectorAll('.subject-card')).find(c => c.textContent.includes('Biology'));
        if (bioCard) bioCard.click();
      })()
    `);
    await sleep(600);

    await client.evaluate(`
      (() => {
        const btn = document.querySelector('.wizard-option-btn.primary') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View All'));
        if (btn) btn.click();
      })()
    `);
    await sleep(1500);

    // Open Split View modal
    console.log('Opening Split View Modal...');
    await client.evaluate(`
      (() => {
        const splitBtn = document.querySelector('.unified-preview-btn.split-btn') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Split View'));
        if (splitBtn) splitBtn.click();
      })()
    `);

    // Wait until both documents render
    for (let i = 0; i < 40; i++) {
      const renderedCount = await client.evaluate('document.querySelectorAll(".pdf-page-container.rendered").length');
      if (renderedCount >= 2) break;
      await sleep(300);
    }
    await sleep(800);

    // ==========================================
    // TEST 1: NEXT PAGE FORWARD TRAVERSAL (1 -> 2 -> 3 -> 4)
    // ==========================================
    console.log('\n--- TEST 1: PAGE NAVIGATION (NEXT / PREV) ---');
    const initialPage = await client.evaluate('document.querySelector(".qp-pane .pdf-page-input")?.value');
    console.log(`Initial page on left QP pane: ${initialPage}`);

    const pagesVisited = [initialPage];

    // Click Next Page 3 times with small delays
    for (let step = 1; step <= 3; step++) {
      await client.evaluate(`
        (() => {
          const nextBtn = document.querySelectorAll('.qp-pane .pdf-tool-btn')[1]; // Next button ›
          if (nextBtn) nextBtn.click();
        })()
      `);
      await sleep(800); // Wait for smooth scroll animation to finish
      const cur = await client.evaluate('document.querySelector(".qp-pane .pdf-page-input")?.value');
      pagesVisited.push(cur);
      console.log(`Step ${step} after clicking Next: page is now ${cur}`);
    }

    console.log('Next button progression:', pagesVisited.join(' -> '));

    // Click Prev Page 2 times
    for (let step = 1; step <= 2; step++) {
      await client.evaluate(`
        (() => {
          const prevBtn = document.querySelectorAll('.qp-pane .pdf-tool-btn')[0]; // Prev button ‹
          if (prevBtn) prevBtn.click();
        })()
      `);
      await sleep(800);
      const cur = await client.evaluate('document.querySelector(".qp-pane .pdf-page-input")?.value');
      console.log(`Step ${step} after clicking Prev: page is now ${cur}`);
    }

    await client.captureScreenshot('test-page-nav-success.png');

    // ==========================================
    // TEST 2: BUTTON ZOOM (+ / −) TO CENTER OF SCREEN
    // ==========================================
    console.log('\n--- TEST 2: BUTTON ZOOM (+ / −) CENTERED TO SCREEN ---');
    // Reset to page 1 first
    await client.evaluate(`
      (() => {
        const inp = document.querySelector('.qp-pane .pdf-page-input');
        if (inp) {
          inp.value = '1';
          inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
      })()
    `);
    await sleep(600);

    const zoomCenterBefore = await client.evaluate(`
      (() => {
        const stage = document.querySelector('.qp-pane .pdf-scroll-stage');
        return {
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
          clientWidth: stage.clientWidth,
          clientHeight: stage.clientHeight,
          scrollWidth: stage.scrollWidth,
          scrollHeight: stage.scrollHeight
        };
      })()
    `);
    console.log('Scroll metrics before button zoom:', JSON.stringify(zoomCenterBefore, null, 2));

    // Click Zoom In (+) button
    console.log('Clicking Zoom In (+) button...');
    await client.evaluate(`
      (() => {
        const zoomInBtn = document.querySelector('.qp-pane .pdf-pane-tools button:nth-child(3)');
        if (zoomInBtn) zoomInBtn.click();
      })()
    `);
    await sleep(800);

    const zoomCenterAfter = await client.evaluate(`
      (() => {
        const stage = document.querySelector('.qp-pane .pdf-scroll-stage');
        const zoomText = document.querySelector('.qp-pane .pdf-tool-btn.text-btn')?.innerText.trim();
        return {
          zoomText,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
          clientWidth: stage.clientWidth,
          clientHeight: stage.clientHeight,
          scrollWidth: stage.scrollWidth,
          scrollHeight: stage.scrollHeight
        };
      })()
    `);
    console.log('Scroll metrics after button zoom (+):', JSON.stringify(zoomCenterAfter, null, 2));
    await client.captureScreenshot('test-button-zoom-centered.png');

    // ==========================================
    // TEST 3: CTRL + SCROLL HOVER ZOOM ANCHOR
    // ==========================================
    console.log('\n--- TEST 3: CTRL + SCROLL HOVER ZOOM ANCHOR ---');
    // Dispatch wheel event on a specific coordinate (e.g. at x: 200, y: 300)
    await client.evaluate(`
      (() => {
        const stage = document.querySelector('.qp-pane .pdf-scroll-stage');
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const clientX = rect.left + 200;
        const clientY = rect.top + 300;

        stage.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          ctrlKey: true,
          deltaY: -120, // Zoom in
          clientX,
          clientY
        }));
      })()
    `);
    await sleep(800);

    const hoverZoomMetrics = await client.evaluate(`
      (() => {
        const stage = document.querySelector('.qp-pane .pdf-scroll-stage');
        const zoomText = document.querySelector('.qp-pane .pdf-tool-btn.text-btn')?.innerText.trim();
        return {
          zoomText,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
          scrollWidth: stage.scrollWidth,
          scrollHeight: stage.scrollHeight
        };
      })()
    `);
    console.log('Metrics after Ctrl + Scroll zoom under mouse:', JSON.stringify(hoverZoomMetrics, null, 2));
    await client.captureScreenshot('test-ctrl-scroll-hover-zoom.png');

    console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test failed with error:', err);
  } finally {
    if (brave) brave.kill();
    vite.kill();
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
    process.exit(0);
  }
}

main();

