import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BRAVE_PATH = "C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe";
const ARTIFACT_DIR = "C:\\Users\\Diavlon\\.gemini\\antigravity\\brain\\8382680b-60f8-4d4b-bb41-7e7978f954db\\mobile-screenshots";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const PORT = 9555;
const tmpUserData = path.join(os.tmpdir(), 'brave-mobile-audit-v2-' + Date.now());
fs.mkdirSync(tmpUserData, { recursive: true });

console.log('Launching Brave Headless on port', PORT);
const brave = spawn(BRAVE_PATH, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${tmpUserData}`,
  'about:blank'
]);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
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
    const res = await client.send('Runtime.evaluate', {
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

let client;

async function main() {
  try {
    const wsUrl = await getWsUrl();
    client = new CDPClient(wsUrl);
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

    console.log('Navigating to https://www.conceptualist.uk ...');
    await client.send('Page.navigate', { url: 'https://www.conceptualist.uk' });
    await sleep(3500);

    // 01. Homepage Top
    await client.captureScreenshot('01-mobile-home-top.png');

    // 02. Homepage Scrolled
    await client.evaluate('window.scrollTo(0, 480)');
    await sleep(400);
    await client.captureScreenshot('02-mobile-home-scrolled.png');

    // 03. Click "Biology" Subject card to trigger Wizard Step 2
    console.log('Clicking Biology subject card...');
    await client.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.subject-card'));
        const bio = cards.find(c => c.textContent.includes('Biology'));
        if (bio) bio.click();
      })()
    `);
    await sleep(800);
    await client.evaluate('window.scrollTo(0, 0)');
    await sleep(300);
    await client.captureScreenshot('03-wizard-step2-units.png');

    // 04. Click "Biology Unit 1 (WBI11)" button to trigger Wizard Step 3
    console.log('Clicking Biology Unit 1 button...');
    await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('.wizard-option-btn'));
        const u1 = btns.find(b => b.textContent.includes('Biology Unit 1'));
        if (u1) u1.click();
      })()
    `);
    await sleep(800);
    await client.evaluate('window.scrollTo(0, 0)');
    await sleep(300);
    await client.captureScreenshot('04-wizard-step3-years.png');

    // 05. Click "2026" or "All Examination Years" button to go to search results table
    console.log('Entering Search Results view...');
    await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('.wizard-option-btn'));
        const allYears = btns.find(b => b.textContent.includes('All Examination Years')) || btns[0];
        if (allYears) allYears.click();
      })()
    `);
    await sleep(1500);
    await client.evaluate('window.scrollTo(0, 0)');
    await sleep(400);
    await client.captureScreenshot('05-mobile-results-table.png');

    // 06. Scroll down results table
    await client.evaluate('window.scrollTo(0, 320)');
    await sleep(400);
    await client.captureScreenshot('06-mobile-results-scrolled.png');

    // 07. Open Filter Drawer
    console.log('Toggling filter drawer...');
    await client.evaluate(`
      (() => {
        window.scrollTo(0, 0);
        const toggle = document.querySelector('.mobile-filter-toggle');
        if (toggle) toggle.click();
      })()
    `);
    await sleep(800);
    await client.captureScreenshot('07-mobile-filter-drawer.png');

    // Scroll down inside filter drawer
    await client.evaluate('window.scrollTo(0, 250)');
    await sleep(400);
    await client.captureScreenshot('07b-mobile-filter-drawer-bottom.png');

    // Close filter drawer by clicking toggle again
    await client.evaluate(`
      (() => {
        window.scrollTo(0, 0);
        const toggle = document.querySelector('.mobile-filter-toggle');
        if (toggle) toggle.click();
      })()
    `);
    await sleep(500);

    // 08. Type Search Query
    console.log('Simulating Search Query typing...');
    await client.evaluate(`
      (() => {
        const input = document.querySelector('.search-input');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'Chemistry Jan 2025');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(800);
    await client.evaluate('window.scrollTo(0, 0)');
    await sleep(300);
    await client.captureScreenshot('08-mobile-search-active.png');

    // 09. Open Split View Modal
    console.log('Opening Split View Modal on mobile...');
    await client.evaluate(`
      (() => {
        const splitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Split View'));
        if (splitBtn) splitBtn.click();
      })()
    `);
    await sleep(2500); // Wait for modal & iframes
    await client.captureScreenshot('09-mobile-modal-split.png');

    // 10. Switch in modal to Mark Scheme [MS]
    console.log('Switching modal to MS...');
    await client.evaluate(`
      (() => {
        const msBtn = Array.from(document.querySelectorAll('.modal-sibling-btn')).find(b => b.textContent.includes('MS') || b.textContent.includes('Mark Scheme'));
        if (msBtn) msBtn.click();
      })()
    `);
    await sleep(1200);
    await client.captureScreenshot('10-mobile-modal-ms.png');

    // 11. Switch in modal to Question Paper [QP]
    console.log('Switching modal to QP...');
    await client.evaluate(`
      (() => {
        const qpBtn = Array.from(document.querySelectorAll('.modal-sibling-btn')).find(b => b.textContent.includes('QP') || b.textContent.includes('Question Paper'));
        if (qpBtn) qpBtn.click();
      })()
    `);
    await sleep(1200);
    await client.captureScreenshot('11-mobile-modal-qp.png');

    // Close modal
    await client.evaluate(`
      (() => {
        const closeBtn = document.querySelector('.modal-close-btn');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(600);

    // 12. Changelog Page
    console.log('Navigating to Changelog...');
    await client.evaluate(`
      (() => {
        const cl = Array.from(document.querySelectorAll('.footer-link, .footer-update-micro')).find(el => el.textContent.includes('Changelog') || el.textContent.includes('updated'));
        if (cl) cl.click();
      })()
    `);
    await sleep(1000);
    await client.evaluate('window.scrollTo(0, 0)');
    await sleep(300);
    await client.captureScreenshot('12-mobile-changelog.png');

    // Scroll changelog
    await client.evaluate('window.scrollTo(0, 350)');
    await sleep(400);
    await client.captureScreenshot('12b-mobile-changelog-scrolled.png');

    // 13. About Page
    console.log('Navigating to About...');
    await client.evaluate(`
      (() => {
        const ab = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.trim() === 'About');
        if (ab) ab.click();
      })()
    `);
    await sleep(1000);
    await client.evaluate('window.scrollTo(0, 0)');
    await sleep(300);
    await client.captureScreenshot('13-mobile-about.png');

    console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    brave.kill();
    await sleep(500);
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
    console.log('Done.');
  }
}

main();

