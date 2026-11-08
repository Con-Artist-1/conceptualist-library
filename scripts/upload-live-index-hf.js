import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(APP_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

const TOKEN = process.argv[2] || process.env.HF_TOKEN;
const REPO_ID = 'Diavlon/mcmaster-docs-library';
const INDEX_FILE = path.join(APP_DIR, 'public', 'index.json');

async function main() {
  console.log('Uploading updated live_index.json to Hugging Face...');
  const buf = fs.readFileSync(INDEX_FILE);
  const oid = crypto.createHash('sha256').update(buf).digest('hex');
  const size = buf.length;

  console.log(`File size: ${(size / 1024 / 1024).toFixed(2)} MB, SHA256: ${oid}`);

  // 1. Request LFS upload via batch API
  const batchRes = await fetch(`https://huggingface.co/datasets/${REPO_ID}.git/info/lfs/objects/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.git-lfs+json',
      'Content-Type': 'application/vnd.git-lfs+json'
    },
    body: JSON.stringify({
      operation: 'upload',
      transfers: ['basic'],
      objects: [{ oid, size }]
    })
  });

  const batchData = await batchRes.json();
  const obj = batchData.objects[0];

  if (obj.actions && obj.actions.upload) {
    const uploadUrl = obj.actions.upload.href;
    const headers = obj.actions.upload.header || {};
    console.log('Uploading LFS binary to storage endpoint...');
    const upRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...headers
      },
      body: buf
    });
    if (!upRes.ok) {
      throw new Error(`Upload to storage failed: HTTP ${upRes.status}`);
    }
    console.log('LFS upload succeeded.');
  } else {
    console.log('Object already present in LFS store.');
  }

  // 2. Commit pointer to main branch
  console.log('Committing live_index.json to main branch...');
  const commitUrl = `https://huggingface.co/api/datasets/${REPO_ID}/commit/main`;
  const ndjson = [
    JSON.stringify({
      key: 'header',
      value: {
        summary: 'Update live_index.json with complete subject tree and resilient edge caching (v3.1)'
      }
    }),
    JSON.stringify({
      key: 'lfsFile',
      value: {
        path: 'live_index.json',
        algo: 'sha256',
        oid,
        size
      }
    })
  ].join('\n') + '\n';

  const comRes = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/x-ndjson'
    },
    body: ndjson
  });

  if (!comRes.ok) {
    const txt = await comRes.text();
    throw new Error(`Commit failed: HTTP ${comRes.status} — ${txt}`);
  }

  const comData = await comRes.json();
  console.log(`Commit successful! Commit OID: ${comData.commit?.oid || 'done'}`);
}

main().catch(e => { console.error('Fatal HF error:', e); process.exit(1); });

