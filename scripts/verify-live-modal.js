import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const CDP_PORT = 9228;
const wait = ms => new Promise(r => setTimeout(r, ms));
const fetchJson = url => new Promise((resolve, reject) => {
  http.get(url, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => resolve(JSON.parse(d)));
  }).on('error', reject);
});

async function run() {
  console.log('Spawning Brave headless...');
  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\temp\\brave-live-verify-' + Date.now()
  ], { detached: true });

  await wait(2500);
  const targets = await fetchJson('http://127.0.0.1:' + CDP_PORT + '/json/list');
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);

  let id = 1;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = id++;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  ws.onopen = async () => {
    await send('Network.enable');
    await send('Page.enable');
    await send('Runtime.enable');
    console.log('Navigating to https://www.conceptualist.uk/ ...');
    await send('Page.navigate', { url: 'https://www.conceptualist.uk/' });
  };
  ws.onmessage = d => {
    const m = JSON.parse(d.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m.result);
      pending.delete(m.id);
    }
  };

  // Wait for page and index load
  console.log('Waiting for index load...');
  await wait(9000);

  // Search WMA11 to get papers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('#search-input');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'WMA11');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });
  await wait(1500);

  // Inspect the action button
  const buttonInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('.unified-preview-btn, .preview-btn');
      return {
        text: btn?.innerText,
        className: btn?.className,
        exists: Boolean(btn)
      };
    })()`,
    returnByValue: true
  });
  console.log('Live table button:', buttonInfo.result?.value);

  // Click the button to open modal
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.unified-preview-btn, .preview-btn')?.click()`
  });
  await wait(1500);

  // Inspect the modal
  const modalInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const container = document.querySelector('.modal-container');
      const rect = container?.getBoundingClientRect();
      const body = document.querySelector('.modal-body');
      const iframes = Array.from(document.querySelectorAll('.modal-iframe')).map(f => ({ title: f.title, src: f.src }));
      const activeBtn = document.querySelector('.modal-sibling-btn.active')?.innerText;
      const splitBtn = Array.from(document.querySelectorAll('.modal-sibling-btn')).find(b => b.innerText.includes('Split View'))?.innerText;
      return {
        hasModal: Boolean(container),
        title: document.querySelector('.modal-title')?.innerText,
        activeBtn,
        splitBtn,
        isSplit: body?.classList.contains('split-grid'),
        iframeCount: iframes.length,
        iframes,
        width: rect?.width,
        height: rect?.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight
      };
    })()`,
    returnByValue: true
  });
  console.log('Live modal inspection:', modalInfo.result?.value);

  // Take screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.data) {
    fs.writeFileSync('C:\\temp\\live_modal_screenshot.png', Buffer.from(shot.data, 'base64'));
    console.log('Screenshot saved to C:\\temp\\live_modal_screenshot.png');
  }

  // Also check changelog version
  await send('Runtime.evaluate', { expression: `document.querySelector('.modal-close')?.click()` });
  await wait(500);
  await send('Runtime.evaluate', { expression: `document.querySelector('button[title*=\"Changelog\"], .header-about-btn')?.click()` });
  await wait(500);

  const changelogInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const header = document.querySelector('.changelog-version-header, .about-version')?.innerText;
      const firstEntry = document.querySelector('.changelog-entry, .about-section')?.innerText;
      return { header, firstEntry: firstEntry?.slice(0, 300) };
    })()`,
    returnByValue: true
  });
  console.log('Changelog info:', changelogInfo.result?.value);

  ws.close();
  brave.kill();
  process.exit(0);
}

run().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});

