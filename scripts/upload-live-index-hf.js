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

const TOKEN = process.env.HF_TOKEN;
if (!TOKEN) {
  console.error('Missing HF_TOKEN. Set it in search-app/.env or environment variables.');
  process.exit(1);
}
const REPO_ID = 'Diavlon/mcmaster-docs-library';

async function main() {
  const targets = [
    { localPath: path.join(APP_DIR, 'public', 'index.json'), remotePath: 'live_index.json' }
  ];
  const cieIndexPath = path.join(APP_DIR, 'public', 'index-cambridge.json');
  if (fs.existsSync(cieIndexPath)) {
    targets.push({ localPath: cieIndexPath, remotePath: 'live_index_cambridge.json' });
  }

  const prepared = targets.map((t) => {
    const buf = fs.readFileSync(t.localPath);
    const oid = crypto.createHash('sha256').update(buf).digest('hex');
    const size = buf.length;
    console.log(`Prepared ${t.remotePath}: ${(size / 1024 / 1024).toFixed(2)} MB, SHA256: ${oid}`);
    return { ...t, buf, oid, size };
  });

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
      objects: prepared.map((p) => ({ oid: p.oid, size: p.size }))
    })
  });

  if (!batchRes.ok) {
    throw new Error(`LFS batch request failed: HTTP ${batchRes.status}`);
  }
  const batchData = await batchRes.json();
  const byOid = new Map(prepared.map((p) => [p.oid, p]));

  for (const obj of batchData.objects || []) {
    const entry = byOid.get(obj.oid);
    if (!entry) continue;
    if (obj.actions && obj.actions.upload) {
      const uploadUrl = obj.actions.upload.href;
      const headers = obj.actions.upload.header || {};
      console.log(`Uploading LFS binary for ${entry.remotePath}...`);
      const upRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...headers
        },
        body: entry.buf
      });
      if (!upRes.ok) {
        throw new Error(`Upload to storage failed for ${entry.remotePath}: HTTP ${upRes.status}`);
      }
      console.log(`LFS upload succeeded for ${entry.remotePath}.`);
    } else {
      console.log(`${entry.remotePath} already present in LFS store.`);
    }
  }

  // 2. Commit pointers to main branch
  console.log(`Committing ${prepared.map((p) => p.remotePath).join(', ')} to main branch...`);
  const commitUrl = `https://huggingface.co/api/datasets/${REPO_ID}/commit/main`;
  const ndjson = [
    JSON.stringify({
      key: 'header',
      value: {
        summary: `Update ${prepared.map((p) => p.remotePath).join(' & ')} with deduplicated multi-board catalog`
      }
    }),
    ...prepared.map((p) => JSON.stringify({
      key: 'lfsFile',
      value: {
        path: p.remotePath,
        algo: 'sha256',
        oid: p.oid,
        size: p.size
      }
    }))
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

main().catch((e) => { console.error('Fatal HF error:', e); process.exit(1); });
