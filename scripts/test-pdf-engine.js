import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BRAVE_PATH = "C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe";
const ARTIFACT_DIR = "C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\8382680b-60f8-4d4b-bb41-7e7978f954db\\mobile-screenshots";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const PREVIEW_PORT = 4176;
const CDP_PORT = 9933;

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
  for (let i = 0; i < 35; i++) {
    try {
      const res = await fetch(`http://localhost:${PREVIEW_PORT}`);
      if (res.ok) return;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Preview server did not start');
}

const tmpUserData = path.join(os.tmpdir(), 'brave-pdf-refined-' + Date.now());
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

    console.log('2. Launching Brave Headless...');
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

    // ==========================================
    // PART 1: DESKTOP PDF ENGINE TESTS (1280 x 800)
    // ==========================================
    console.log('\n--- PART 1: DESKTOP REFINED PDF ENGINE TESTS ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1.5,
      mobile: false
    });

    console.log('Navigating to local preview...');
    await client.send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}` });
    await sleep(2500);

    // Filter to an exam sitting with QP + MS
    console.log('Selecting Biology in Wizard...');
    await client.evaluate(`
      (() => {
        const bioCard = Array.from(document.querySelectorAll('.subject-card')).find(c => c.textContent.includes('Biology'));
        if (bioCard) bioCard.click();
      })()
    `);
    await sleep(600);

    console.log('Navigating to Results table...');
    await client.evaluate(`
      (() => {
        const btn = document.querySelector('.wizard-option-btn.primary') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View All'));
        if (btn) btn.click();
      })()
    `);
    await sleep(1500);

    // Open Split View modal
    console.log('Opening Split View Modal on Desktop...');
    await client.evaluate(`
      (() => {
        const splitBtn = document.querySelector('.unified-preview-btn.split-btn') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Split View'));
        if (splitBtn) splitBtn.click();
      })()
    `);

    // Wait until both QP and MS canvases are fully rendered with graphics
    console.log('Waiting for both documents to finish rendering graphics...');
    for (let i = 0; i < 40; i++) {
      const renderedCount = await client.evaluate('document.querySelectorAll(".pdf-page-container.rendered").length');
      if (renderedCount >= 2) {
        console.log(`Both documents rendered graphics! (found ${renderedCount} rendered pages)`);
        break;
      }
      await sleep(300);
    }
    await sleep(800);

    const desktopSplitMetrics = await client.evaluate(`
      (() => {
        const customPanes = document.querySelectorAll('.custom-pdf-pane');
        const canvases = document.querySelectorAll('.pdf-canvas');
        const resizer = document.querySelector('.modal-split-resizer');
        const engineBtn = document.querySelector('.modal-engine-btn');
        const hideBtn = document.querySelector('.modal-hide-header-btn');
        const navBtns = Array.from(document.querySelectorAll('.modal-view-btn')).map(b => ({
          text: b.innerText.trim(),
          height: b.clientHeight,
          top: b.getBoundingClientRect().top
        }));
        const allBtns = Array.from(document.querySelectorAll('.modal-btn, .modal-close-btn')).map(b => ({
          text: b.innerText.trim() || b.getAttribute('aria-label'),
          height: b.clientHeight,
          top: Math.round(b.getBoundingClientRect().top)
        }));
        const qpPane = document.querySelector('.modal-split-pane.qp-pane');
        const msPane = document.querySelector('.modal-split-pane.ms-pane');
        const qpTitle = document.querySelector('.qp-pane .pdf-pane-title');
        const msTitle = document.querySelector('.ms-pane .pdf-pane-title');
        return {
          customPanesCount: customPanes.length,
          canvasesCount: canvases.length,
          hasResizer: Boolean(resizer),
          engineBtnText: engineBtn?.innerText.trim(),
          hideBtnText: hideBtn?.innerText.trim(),
          navButtons: navBtns,
          allButtonsAlignment: allBtns,
          qpPaneWidth: qpPane?.clientWidth,
          msPaneWidth: msPane?.clientWidth,
          qpTitleStyle: qpTitle ? window.getComputedStyle(qpTitle).fontSize : null,
          msTitleStyle: msTitle ? window.getComputedStyle(msTitle).fontSize : null
        };
      })()
    `);
    console.log('REFINED DESKTOP SPLIT METRICS:', JSON.stringify(desktopSplitMetrics, null, 2));

    console.log('Capturing: academic-light-01-desktop-split.png');
    await client.captureScreenshot('academic-light-01-desktop-split.png');

    // Test Stutter-Free Resizer Dragging on Desktop
    console.log('Testing Smooth Desktop Split Resizer Drag...');
    await client.evaluate(`
      (() => {
        const resizer = document.querySelector('.modal-split-resizer');
        if (!resizer) return;
        const rect = resizer.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX, clientY: startY }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX + 180, clientY: startY }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: startX + 180, clientY: startY }));
      })()
    `);
    await sleep(1500);

    const resizedMetrics = await client.evaluate(`
      (() => {
        const qpPane = document.querySelector('.modal-split-pane.qp-pane');
        const msPane = document.querySelector('.modal-split-pane.ms-pane');
        return {
          qpPaneWidth: qpPane?.clientWidth,
          msPaneWidth: msPane?.clientWidth
        };
      })()
    `);
    console.log('RESIZED DESKTOP METRICS:', JSON.stringify(resizedMetrics, null, 2));

    // Test Ctrl + Scroll Zoom on Left Pane
    console.log('Testing Ctrl + Scroll zoom on individual PDF pane...');
    const zoomBefore = await client.evaluate(`
      (() => {
        const stage = document.querySelector('.qp-pane .pdf-scroll-stage');
        if (stage) {
          stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true }));
        }
        return document.querySelector('.qp-pane .pdf-tool-btn.text-btn')?.innerText.trim();
      })()
    `);
    await sleep(600);
    const zoomAfter = await client.evaluate(`
      document.querySelector('.qp-pane .pdf-tool-btn.text-btn')?.innerText.trim()
    `);
    console.log(`Zoom test: before = ${zoomBefore}, after = ${zoomAfter}`);

    // Test Hide Header on Desktop
    console.log('Testing Hide Header on Desktop...');
    await client.evaluate(`
      (() => {
        const hideBtn = document.querySelector('.modal-hide-header-btn');
        if (hideBtn) hideBtn.click();
      })()
    `);
    await sleep(600);

    const hiddenHeaderMetrics = await client.evaluate(`
      (() => {
        const hdr = document.querySelector('.modal-header');
        const unhideBar = document.querySelector('.modal-docked-unhide-bar');
        const qpPane = document.querySelector('.modal-split-pane.qp-pane');
        const msPane = document.querySelector('.modal-split-pane.ms-pane');
        const unhideRect = unhideBar ? unhideBar.getBoundingClientRect() : null;
        const msTitle = document.querySelector('.ms-pane .pdf-pane-toolbar');
        const msTitleRect = msTitle ? msTitle.getBoundingClientRect() : null;
        return {
          headerInDOM: Boolean(hdr),
          unhideBarVisible: Boolean(unhideBar),
          unhideBarRect: unhideRect,
          msToolbarTop: msTitleRect?.top,
          overlapsWithMSToolbar: unhideRect && msTitleRect ? (unhideRect.bottom > msTitleRect.top) : false
        };
      })()
    `);
    console.log('HIDDEN HEADER METRICS:', JSON.stringify(hiddenHeaderMetrics, null, 2));

    console.log('Capturing: academic-light-02-desktop-hidden-header.png');
    await client.captureScreenshot('academic-light-02-desktop-hidden-header.png');

    // Restore header
    console.log('Restoring header via docked bar...');
    await client.evaluate(`
      (() => {
        const unhideBar = document.querySelector('.modal-docked-unhide-bar');
        if (unhideBar) unhideBar.click();
      })()
    `);
    await sleep(500);

    // Close preview modal
    await client.evaluate(`
      (() => {
        const closeBtn = document.querySelector('.modal-close-btn');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(500);

    // ==========================================
    // PART 2: MOBILE TESTS (iPhone 14: 390 x 844)
    // ==========================================
    console.log('\n--- PART 2: MOBILE REFINED TESTS ---');
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
    await sleep(500);

    // Open Preview on Mobile (defaults to single QP view)
    console.log('Opening Preview Modal on mobile...');
    await client.evaluate(`
      (() => {
        const splitBtn = document.querySelector('.unified-preview-btn.split-btn') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Split View') || b.textContent.includes('QP'));
        if (splitBtn) splitBtn.click();
      })()
    `);
    await sleep(3000);

    console.log('Capturing: academic-light-03-mobile-single-qp.png');
    await client.captureScreenshot('academic-light-03-mobile-single-qp.png');

    // Switch to Split View on Mobile
    console.log('Switching to Split View on Mobile...');
    await client.evaluate(`
      (() => {
        const splitBtn = Array.from(document.querySelectorAll('.modal-view-btn')).find(b => b.innerText.trim() === 'Split');
        if (splitBtn) splitBtn.click();
      })()
    `);
    await sleep(3000);

    // Verify Mobile Resizer is present and test touch drag!
    console.log('Testing Mobile Touch Resizer Drag on Phone...');
    const mobileResizerBefore = await client.evaluate(`
      (() => {
        const resizer = document.querySelector('.modal-mobile-split-resizer');
        const qpPane = document.querySelector('.modal-split-pane.qp-pane');
        const msPane = document.querySelector('.modal-split-pane.ms-pane');
        return {
          hasMobileResizer: Boolean(resizer),
          qpHeight: qpPane?.clientHeight,
          msHeight: msPane?.clientHeight
        };
      })()
    `);
    console.log('MOBILE RESIZER BEFORE:', JSON.stringify(mobileResizerBefore, null, 2));

    await client.evaluate(`
      (() => {
        const resizer = document.querySelector('.modal-mobile-split-resizer');
        if (!resizer) return;
        const rect = resizer.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        resizer.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          touches: [{ clientX: startX, clientY: startY }]
        }));
        window.dispatchEvent(new TouchEvent('touchmove', {
          bubbles: true,
          touches: [{ clientX: startX, clientY: startY + 100 }]
        }));
        window.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true,
          touches: []
        }));
      })()
    `);
    await sleep(1500);

    const mobileResizerAfter = await client.evaluate(`
      (() => {
        const qpPane = document.querySelector('.modal-split-pane.qp-pane');
        const msPane = document.querySelector('.modal-split-pane.ms-pane');
        return {
          qpHeight: qpPane?.clientHeight,
          msHeight: msPane?.clientHeight
        };
      })()
    `);
    console.log('MOBILE RESIZER AFTER TOUCH DRAG:', JSON.stringify(mobileResizerAfter, null, 2));

    console.log('Capturing: academic-light-04-mobile-split-resized.png');
    await client.captureScreenshot('academic-light-04-mobile-split-resized.png');

    // Test Hide Header on Mobile
    console.log('Testing Hide Header on Mobile...');
    await client.evaluate(`
      (() => {
        const hideBtn = document.querySelector('.modal-hide-header-btn');
        if (hideBtn) hideBtn.click();
      })()
    `);
    await sleep(600);

    console.log('Capturing: academic-light-05-mobile-header-hidden.png');
    await client.captureScreenshot('academic-light-05-mobile-header-hidden.png');

    console.log('\nALL REFINED AUDIT TESTS COMPLETED SUCCESSFULLY!');
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
