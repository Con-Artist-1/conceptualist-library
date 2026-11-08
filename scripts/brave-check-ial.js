import { spawn } from 'child_process';
import http from 'http';

const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const PORT = 9222;

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

async function main() {
  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--no-sandbox',
    '--disable-gpu',
    '--user-data-dir=C:\\temp\\brave-profile-' + Date.now()
  ], { detached: true });

  await wait(2000);

  let version;
  for (let i = 0; i < 10; i++) {
    try {
      version = await fetchJson(`http://127.0.0.1:${PORT}/json/version`);
      break;
    } catch {
      await wait(500);
    }
  }

  const targets = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
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
    await send('Console.enable');

    await send('Page.navigate', { url: 'https://www.conceptualist.uk/' });
  };

  ws.onmessage = data => {
    const msg = JSON.parse(data.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
      return;
    }
    if (msg.method === 'Console.messageAdded') {
      console.log('[CONSOLE]', msg.params.message.level, msg.params.message.text);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      console.log('[LOG]', msg.params.type, args);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[EXCEPTION]', msg.params.exceptionDetails);
    }
  };

  // Wait 10 seconds for index.json to finish downloading and parsing
  console.log('Waiting 10s for page to load and index to parse...');
  await wait(10000);

  // Check state of sidebar items
  const sidebarCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item')).map(el => ({
        text: el.innerText.trim(),
        classes: el.className
      }));
      return items;
    })()`,
    returnByValue: true
  });
  console.log('Sidebar tree items before clicking Past Papers:', sidebarCheck.result?.value);

  // Click on "Past Papers"
  console.log('Clicking on "Past Papers"...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item'));
      const pp = items.find(el => el.innerText.includes('Past Papers'));
      if (pp) {
        pp.click();
        return 'Clicked Past Papers';
      }
      return 'Past Papers not found';
    })()`,
    returnByValue: true
  });

  await wait(1000);

  // Check sidebar items again after expanding Past Papers
  const sidebarCheck2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item')).map(el => ({
        text: el.innerText.trim(),
        classes: el.className
      }));
      return items;
    })()`,
    returnByValue: true
  });
  console.log('Sidebar tree items after clicking Past Papers:', sidebarCheck2.result?.value);

  // Click on "IAL" under Past Papers
  console.log('Clicking on "IAL" under Past Papers...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item'));
      // Find the one that specifically matches "IAL" or "• IAL" but NOT "IAL Books"
      const ial = items.find(el => {
        const t = el.innerText.trim();
        return t === '• IAL' || t === '+ IAL' || t === '− IAL' || t === 'IAL';
      });
      if (ial) {
        ial.click();
        return 'Clicked IAL: ' + ial.innerText;
      }
      return 'IAL not found';
    })()`,
    returnByValue: true
  });

  await wait(2000);

  // Check what is displayed in DOM
  const tableCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        summary: document.querySelector('.result-summary')?.innerText || null,
        noResults: document.querySelector('.no-results-box')?.innerText || null,
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

  console.log('\n--- IAL CLICK RESULT ---');
  console.log(JSON.stringify(tableCheck.result?.value, null, 2));

  // Now test search functionality!
  console.log('\nTesting search for "WMA11"...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('#search-input');
      if (!input) return 'Search input not found';
      // Simulate input event
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'WMA11');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'Input set to WMA11';
    })()`,
    returnByValue: true
  });

  await wait(2000);

  const searchCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        summary: document.querySelector('.result-summary')?.innerText || null,
        noResults: document.querySelector('.no-results-box')?.innerText || null,
        rowsCount: document.querySelectorAll('.file-table tbody tr').length,
        firstThreeRows: Array.from(document.querySelectorAll('.file-table tbody tr')).slice(0, 3).map(tr => ({
          title: tr.querySelector('.file-title-row a')?.innerText,
          course: tr.querySelector('.details-primary')?.innerText
        }))
      };
    })()`,
    returnByValue: true
  });

  console.log('\n--- SEARCH "WMA11" RESULT ---');
  console.log(JSON.stringify(searchCheck.result?.value, null, 2));

  ws.close();
  brave.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

