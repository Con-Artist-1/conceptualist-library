import http from 'http';
import { spawn } from 'child_process';

const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe';
const CDP_PORT = 9232;
const wait = ms => new Promise(r => setTimeout(r, ms));
const fetchJson = url => new Promise((res, rej) => http.get(url, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));

async function run() {
  const brave = spawn(BRAVE_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--no-sandbox',
    '--disable-gpu',
    '--user-data-dir=C:\\temp\\brave-sidebar-' + Date.now()
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'https://www.conceptualist.uk/' });
  };
  ws.onmessage = d => {
    const m = JSON.parse(d.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m.result);
      pending.delete(m.id);
    }
  };

  await wait(9000);

  const clickResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const labels = Array.from(document.querySelectorAll('.tree-node-label'));
      const ial = labels.find(l => l.innerText.trim() === 'IAL');
      if (ial) {
        ial.click();
        return { clicked: true, text: ial.innerText };
      }
      return { clicked: false, labels: labels.map(l => l.innerText) };
    })()`,
    returnByValue: true
  });
  console.log('Sidebar click:', clickResult.result?.value);

  await wait(1500);

  const tableResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const rows = document.querySelectorAll('tbody tr, .file-row, .unified-row');
      const breadcrumb = document.querySelector('.breadcrumb, .category-path')?.innerText;
      const count = document.querySelector('.meta-count, .table-info')?.innerText;
      const noDocs = document.querySelector('.no-files, .empty-state')?.innerText;
      return { rowCount: rows.length, breadcrumb, count, noDocs };
    })()`,
    returnByValue: true
  });
  console.log('Table result after clicking IAL:', tableResult.result?.value);

  ws.close();
  brave.kill();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

