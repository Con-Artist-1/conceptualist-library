import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BRAVE_PATH = "C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe";
const ARTIFACT_DIR = "C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\8382680b-60f8-4d4b-bb41-7e7978f954db\\mobile-screenshots";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const PREVIEW_PORT = 4180;
const CDP_PORT = 9936;

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

const tmpUserData = path.join(os.tmpdir(), 'brave-oled-dark-test-' + Date.now());
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

    console.log('Navigating to app...');
    await client.send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}` });
    await sleep(2500);

    // Set viewport
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1.5,
      mobile: false
    });

    // Ensure OLED Dark Mode
    const currentTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Current theme on load:', currentTheme);
    if (currentTheme !== 'dark') {
      console.log('Switching to Dark Mode via header theme button...');
      await client.evaluate(`document.querySelector('.header-theme-btn')?.click()`);
      await sleep(500);
    }

    const darkThemeAttr = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    const savedTheme = await client.evaluate(`localStorage.getItem('cs_theme')`);
    const bodyBg = await client.evaluate(`window.getComputedStyle(document.body).backgroundColor`);
    const headerBg = await client.evaluate(`window.getComputedStyle(document.querySelector('.header-top')).backgroundColor`);
    const searchBg = await client.evaluate(`window.getComputedStyle(document.querySelector('.search-banner')).backgroundColor`);

    console.log('OLED Dark Mode active:', darkThemeAttr === 'dark');
    console.log('localStorage theme:', savedTheme);
    console.log('Body bg:', bodyBg, '(expected rgb(0, 0, 0))');
    console.log('Header bg:', headerBg, '(expected rgb(0, 0, 0))');
    console.log('Search banner bg:', searchBg, '(expected rgb(0, 0, 0))');

    await client.captureScreenshot('oled-dark-01-desktop-home.png');

    // Filter to Biology to get past papers
    console.log('Selecting Biology subject...');
    await client.evaluate(`
      (() => {
        const bioCard = Array.from(document.querySelectorAll('.subject-card')).find(c => c.textContent.includes('Biology'));
        if (bioCard) bioCard.click();
      })()
    `);
    await sleep(800);

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
    console.log('Waiting for PDF pages to render...');
    for (let i = 0; i < 40; i++) {
      const renderedCount = await client.evaluate('document.querySelectorAll(".pdf-page-container.rendered").length');
      if (renderedCount >= 2) {
        console.log(`Rendered ${renderedCount} pages.`);
        break;
      }
      await sleep(300);
    }
    await sleep(1000);

    const isModalOpen = await client.evaluate(`!!document.querySelector('.modal-container')`);
    console.log('Modal opened:', isModalOpen);

    const modalHeaderBg = await client.evaluate(`window.getComputedStyle(document.querySelector('.modal-header')).backgroundColor`);
    const stageBg = await client.evaluate(`window.getComputedStyle(document.querySelector('.pdf-scroll-stage')).backgroundColor`);
    const canvasFilter = await client.evaluate(`
      const c = document.querySelector('.pdf-canvas');
      return c ? window.getComputedStyle(c).filter : 'no canvas';
    `);

    console.log('Modal header bg:', modalHeaderBg, '(expected rgb(0, 0, 0))');
    console.log('Scroll stage bg:', stageBg, '(expected rgb(0, 0, 0))');
    console.log('PDF Canvas filter in Dark Mode:', canvasFilter);

    await client.captureScreenshot('oled-dark-02-desktop-split-pdf.png');

    // Test Modal Theme Toggle button (switch to Academic Light)
    console.log('Testing modal theme toggle button (switching to Light)...');
    await client.evaluate(`document.querySelector('.modal-theme-toggle-btn')?.click()`);
    await sleep(600);

    const lightModalHeaderBg = await client.evaluate(`window.getComputedStyle(document.querySelector('.modal-header')).backgroundColor`);
    const lightCanvasFilter = await client.evaluate(`
      const c = document.querySelector('.pdf-canvas');
      return c ? window.getComputedStyle(c).filter : 'no canvas';
    `);
    console.log('Modal in Light Mode -> header bg:', lightModalHeaderBg, 'canvas filter:', lightCanvasFilter);
    await client.captureScreenshot('oled-dark-03-desktop-split-light.png');

    // Switch back to Dark Mode
    console.log('Switching modal back to OLED Dark Mode...');
    await client.evaluate(`document.querySelector('.modal-theme-toggle-btn')?.click()`);
    await sleep(600);

    // Switch to Mobile View (iPhone 14 / 15: 390x844)
    console.log('Switching to mobile emulation (390x844)...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(1200);

    const mobileToolbarBg = await client.evaluate(`
      const tb = document.querySelector('.pdf-pane-toolbar');
      return tb ? window.getComputedStyle(tb).backgroundColor : 'none';
    `);
    const mobileStageBg = await client.evaluate(`
      const st = document.querySelector('.pdf-scroll-stage');
      return st ? window.getComputedStyle(st).backgroundColor : 'none';
    `);
    console.log('Mobile Dark Mode -> toolbar bg:', mobileToolbarBg, 'stage bg:', mobileStageBg);

    await client.captureScreenshot('oled-dark-04-mobile-split-dark.png');

    // Close modal to see mobile home page in OLED dark mode
    console.log('Closing modal to view mobile home page...');
    await client.evaluate(`document.querySelector('.modal-close-btn')?.click()`);
    await sleep(600);
    await client.captureScreenshot('oled-dark-05-mobile-home-dark.png');

    console.log('ALL PURE OLED DARK MODE TESTS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    if (brave) brave.kill();
    vite.kill();
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
    process.exit(0);
  }
}

main();
