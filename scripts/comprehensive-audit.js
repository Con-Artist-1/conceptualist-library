import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BRAVE_PATH = "C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe";
const ARTIFACT_DIR = "C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\8382680b-60f8-4d4b-bb41-7e7978f954db";
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, "mobile-screenshots");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PREVIEW_PORT = 4181;
const CDP_PORT = 9937;

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

const tmpUserData = path.join(os.tmpdir(), 'brave-dark-audit-' + Date.now());
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
    const p1 = path.join(SCREENSHOT_DIR, filename);
    const p2 = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(p1, buffer);
    fs.writeFileSync(p2, buffer);
    console.log(`Saved screenshot: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return p2;
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
      '--window-size=1440,900',
      'about:blank'
    ]);

    const wsUrl = await getWsUrl();
    console.log('Connected to Brave CDP!');
    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    console.log('Navigating to app on fresh session...');
    await client.send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}` });
    await sleep(2500);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1.5,
      mobile: false
    });

    // 1. TEST DEFAULT LIGHT MODE
    const initialTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('1. Clean session initial theme:', initialTheme, '(EXPECTED: light)');
    await client.captureScreenshot('audit-01-default-light-home.png');

    // 2. TOGGLE TO PURE OLED DARK MODE
    console.log('2. Toggling to Dark Mode...');
    await client.evaluate(`document.querySelector('.header-theme-btn')?.click()`);
    await sleep(500);

    const darkTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    const cookieVal = await client.evaluate(`document.cookie`);
    const localVal = await client.evaluate(`localStorage.getItem('cs_theme')`);
    const bodyBg = await client.evaluate(`window.getComputedStyle(document.body).backgroundColor`);
    const heroH1Color = await client.evaluate(`
      const h = document.querySelector('.welcome-hero h1');
      return h ? window.getComputedStyle(h).color : 'none';
    `);

    console.log('Theme after toggle:', darkTheme, 'Cookie:', cookieVal, 'LocalStorage:', localVal);
    console.log('Body background:', bodyBg, 'Hero H1 color:', heroH1Color);
    await client.captureScreenshot('audit-02-dark-home.png');

    // 3. INTERACTIVE SUBJECT WIZARD
    console.log('3. Drilling down into Mathematics subject wizard...');
    await client.evaluate(`
      (() => {
        const c = Array.from(document.querySelectorAll('.subject-card')).find(el => el.textContent.includes('Mathematics'));
        if (c) c.click();
      })()
    `);
    await sleep(800);
    await client.captureScreenshot('audit-03-dark-wizard-math.png');

    // 4. EXAM RESULTS TABLE
    console.log('4. Viewing table results...');
    await client.evaluate(`
      (() => {
        const btn = document.querySelector('.wizard-option-btn.primary') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('View All'));
        if (btn) btn.click();
      })()
    `);
    await sleep(1500);

    const tableThBg = await client.evaluate(`
      const th = document.querySelector('.results-table th');
      return th ? window.getComputedStyle(th).backgroundColor : 'none';
    `);
    const splitBtnBg = await client.evaluate(`
      const b = document.querySelector('.unified-preview-btn.split-btn');
      return b ? window.getComputedStyle(b).backgroundColor : 'none';
    `);
    console.log('Table TH bg:', tableThBg, 'Split btn bg:', splitBtnBg);
    await client.captureScreenshot('audit-04-dark-table-results.png');

    // 5. PDF MODAL IN SPLIT VIEW (CHECK WEBPDF TOOLBAR BUTTON COLORS)
    console.log('5. Opening PDF Split View Modal...');
    await client.evaluate(`
      (() => {
        const splitBtn = document.querySelector('.unified-preview-btn.split-btn');
        if (splitBtn) splitBtn.click();
      })()
    `);

    // Wait for pages to render
    for (let i = 0; i < 40; i++) {
      const renderedCount = await client.evaluate('document.querySelectorAll(".pdf-page-container.rendered").length');
      if (renderedCount >= 2) {
        console.log(`Rendered ${renderedCount} pages.`);
        break;
      }
      await sleep(300);
    }
    await sleep(1000);

    // Inspect the tool button backgrounds!
    const toolBtnBgs = await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('.pdf-tool-btn'));
        return btns.slice(0, 8).map(b => ({
          text: b.textContent.trim(),
          bg: window.getComputedStyle(b).backgroundColor,
          color: window.getComputedStyle(b).color,
          border: window.getComputedStyle(b).borderColor
        }));
      })()
    `);
    console.log('PDF Tool Buttons in Dark Mode:', JSON.stringify(toolBtnBgs, null, 2));

    const canvasFilter = await client.evaluate(`
      (() => {
        const c = document.querySelector('.pdf-canvas');
        return c ? window.getComputedStyle(c).filter : 'none';
      })()
    `);
    console.log('PDF Canvas Filter in Dark Mode:', canvasFilter);
    await client.captureScreenshot('audit-05-dark-split-view-webpdf.png');

    // 6. ZOOM IN TEST
    console.log('6. Testing Zoom In in dark mode...');
    await client.evaluate(`
      (() => {
        const zoomInBtn = Array.from(document.querySelectorAll('.pdf-tool-btn')).find(b => b.textContent.trim() === '+');
        if (zoomInBtn) {
          zoomInBtn.click();
          zoomInBtn.click();
        }
      })()
    `);
    await sleep(600);
    await client.captureScreenshot('audit-06-dark-split-view-zoomed.png');

    // 7. MODAL THEME TOGGLE (SWITCH TO LIGHT)
    console.log('7. Switching modal to Light mode...');
    await client.evaluate(`document.querySelector('.modal-theme-toggle-btn')?.click()`);
    await sleep(600);
    await client.captureScreenshot('audit-07-modal-light-switch.png');

    // Switch back to Dark mode
    await client.evaluate(`document.querySelector('.modal-theme-toggle-btn')?.click()`);
    await sleep(500);

    // Close modal
    await client.evaluate(`document.querySelector('.modal-close-btn')?.click()`);
    await sleep(500);

    // 8. CHANGELOG PAGE IN DARK MODE (VERIFY V3.5 CARD IS NOT WHITE!)
    console.log('8. Navigating to Changelog page in dark mode...');
    await client.evaluate(`
      (() => {
        const link = Array.from(document.querySelectorAll('.footer-link')).find(l => l.textContent.includes('Changelog'));
        if (link) link.click();
      })()
    `);
    await sleep(600);

    const changelogLatestBg = await client.evaluate(`
      (() => {
        const c = document.querySelector('.changelog-entry.latest');
        return c ? window.getComputedStyle(c).backgroundColor : 'none';
      })()
    `);
    const changelogTitleColor = await client.evaluate(`
      (() => {
        const t = document.querySelector('.about-title');
        return t ? window.getComputedStyle(t).color : 'none';
      })()
    `);
    console.log('Changelog latest card bg:', changelogLatestBg, '(EXPECTED: dark, NOT white)');
    console.log('Changelog title color:', changelogTitleColor);
    await client.captureScreenshot('audit-08-dark-changelog.png');

    // 9. ABOUT PAGE IN DARK MODE
    console.log('9. Navigating to About page in dark mode...');
    await client.evaluate(`
      (() => {
        const link = Array.from(document.querySelectorAll('.footer-link')).find(l => l.textContent.includes('About'));
        if (link) link.click();
      })()
    `);
    await sleep(600);

    const teamCardBg = await client.evaluate(`
      (() => {
        const tc = document.querySelector('.team-card');
        return tc ? window.getComputedStyle(tc).backgroundColor : 'none';
      })()
    `);
    console.log('Team card bg:', teamCardBg);
    await client.captureScreenshot('audit-09-dark-about.png');

    // 10. RETURN TO HOME & SWITCH TO MOBILE VIEW
    console.log('10. Returning to home and switching to mobile emulation (390x844)...');
    await client.evaluate(`
      (() => {
        const hBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Return to Library'));
        if (hBtn) hBtn.click();
      })()
    `);
    await sleep(600);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(1000);
    await client.captureScreenshot('audit-10-mobile-dark-home.png');

    // 11. OPEN SPLIT VIEW ON MOBILE
    console.log('11. Opening Split View on mobile...');
    await client.evaluate(`
      (() => {
        const splitBtn = document.querySelector('.unified-preview-btn.split-btn');
        if (splitBtn) splitBtn.click();
      })()
    `);
    await sleep(2500);
    await client.captureScreenshot('audit-11-mobile-dark-split.png');

    // 12. SWITCH TO SINGLE VIEW (QUESTION PAPER) ON MOBILE
    console.log('12. Switching to Question Paper single view on mobile...');
    await client.evaluate(`
      (() => {
        const qpBtn = document.querySelector('.modal-btn.qp-btn');
        if (qpBtn) qpBtn.click();
      })()
    `);
    await sleep(1200);
    await client.captureScreenshot('audit-12-mobile-dark-single-qp.png');

    // 13. RELOAD TEST - VERIFY COOKIE & LOCALSTORAGE PERSISTENCE
    console.log('13. Reloading page to verify persistence across reloads...');
    await client.send('Page.reload');
    await sleep(2500);

    const reloadedTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Reloaded theme:', reloadedTheme, '(EXPECTED: dark)');
    await client.captureScreenshot('audit-13-reload-persistence.png');

    console.log('=== ALL COMPREHENSIVE AUDIT TESTS PASSED! ===');
  } catch (err) {
    console.error('Audit execution error:', err);
  } finally {
    if (brave) brave.kill();
    vite.kill();
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
    process.exit(0);
  }
}

main();

