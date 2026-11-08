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
  console.log('Launching Brave headless...');
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

  if (!version) {
    console.error('Could not connect to Brave CDP');
    brave.kill();
    return;
  }
  console.log('Connected to Brave CDP:', version.Browser);

  const targets = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  console.log('Page target:', pageTarget.webSocketDebuggerUrl);

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
    console.log('CDP WebSocket opened');
    await send('Network.enable');
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Console.enable');

    console.log('Navigating to https://www.conceptualist.uk/ ...');
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
      console.log('[BROWSER CONSOLE]', msg.params.message.level, msg.params.message.text);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      console.log('[BROWSER LOG]', msg.params.type, args);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails);
    } else if (msg.method === 'Network.requestWillBeSent') {
      const req = msg.params.request;
      if (req.url.includes('json') || req.url.includes('conceptualist') || req.url.includes('vercel')) {
        console.log('[REQ]', req.method, req.url);
      }
    } else if (msg.method === 'Network.responseReceived') {
      const res = msg.params.response;
      if (res.url.includes('json') || res.url.includes('conceptualist') || res.url.includes('vercel')) {
        console.log('[RES]', res.status, res.url, res.mimeType, 'encodedDataLength:', msg.params.response.encodedDataLength);
      }
    } else if (msg.method === 'Network.loadingFailed') {
      console.error('[NET FAIL]', msg.params.errorText, msg.params.requestId);
    }
  };

  // Let it load for 10 seconds and then inspect DOM
  await wait(10000);

  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        title: document.title,
        bodyText: document.body.innerText.slice(0, 1000),
        hasNoResults: !!document.querySelector('.no-results-box'),
        noResultsText: document.querySelector('.no-results-box')?.innerText || null,
        fileCount: document.querySelectorAll('.file-table tbody tr').length,
        treeNodes: document.querySelectorAll('.tree-node').length,
        breadcrumbs: document.querySelector('.breadcrumb-trail')?.innerText || null
      };
    })()`,
    returnByValue: true
  });

  console.log('\n--- DOM EVALUATION RESULT ---');
  console.log(JSON.stringify(evalRes.result?.value, null, 2));

  // Now simulate clicking on "Past Papers" / "IAL" in the sidebar tree
  console.log('\nSimulating click on IAL in category tree...');
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.tree-item'));
      const ial = items.find(el => el.innerText.includes('IAL'));
      if (ial) {
        ial.click();
        return 'Clicked IAL';
      }
      return 'IAL not found among ' + items.map(el => el.innerText.trim()).join(', ');
    })()`,
    returnByValue: true
  });
  console.log('Click result:', clickRes.result?.value);

  await wait(3000);

  const evalRes2 = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        hasNoResults: !!document.querySelector('.no-results-box'),
        noResultsText: document.querySelector('.no-results-box')?.innerText || null,
        fileCount: document.querySelectorAll('.file-table tbody tr').length,
        resultSummary: document.querySelector('.result-summary')?.innerText || null,
        firstFewTitles: Array.from(document.querySelectorAll('.file-title-row a')).slice(0, 5).map(a => a.innerText)
      };
    })()`,
    returnByValue: true
  });

  console.log('\n--- POST-CLICK DOM EVALUATION ---');
  console.log(JSON.stringify(evalRes2.result?.value, null, 2));

  ws.close();
  brave.kill();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
