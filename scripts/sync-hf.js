import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBRARY_ROOT = path.resolve(__dirname, '..', '..');
const APP_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(APP_DIR, '.data');
const SHA_CACHE_PATH = path.join(DATA_DIR, 'library_sha_cache.json');
const HF_STATUS_PATH = path.join(DATA_DIR, 'hf_sync_status.json');

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

const REPO_ID = 'Diavlon/mcmaster-docs-library';
const TOKEN = process.env.HF_TOKEN;
if (!TOKEN) {
  console.error('Missing HF_TOKEN. Set it in search-app/.env or environment variables.');
  process.exit(1);
}
const ALLOWED_ROOT_DIRS = ['Past Papers', 'IAL Books', 'IGCSE Books', 'Cambridge Books'];

async function fetchWithRetry(url, options = {}, attempts = 8) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && i < attempts) {
        const retryAfter = Number(res.headers.get('retry-after') || 0);
        const waitMs = Math.max(retryAfter * 1000, 35000);
        console.log(`  [HF 429] Rate limited; waiting ${Math.round(waitMs / 1000)}s before retry ${i + 1}/${attempts}...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i === attempts) throw err;
      await new Promise(r => setTimeout(r, i * 1500));
    }
  }
  throw lastErr;
}

function collectAllLocalFiles() {
  let results = [];
  for (const rootSub of ALLOWED_ROOT_DIRS) {
    const fullRootSub = path.join(LIBRARY_ROOT, rootSub);
    if (fs.existsSync(fullRootSub)) {
      results = results.concat(walkDir(fullRootSub));
    }
  }
  return results;
}

function walkDir(dirPath) {
  let results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (/toaz\.info/i.test(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else {
      const relPath = path.relative(LIBRARY_ROOT, fullPath).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);
      results.push({
        fullPath,
        relPath,
        size: stat.size
      });
    }
  }
  return results;
}

async function fetchAllRemoteFiles() {
  console.log('Fetching full remote file tree from Hugging Face...');
  const remoteMap = new Map();
  let nextUrl = `https://huggingface.co/api/datasets/${REPO_ID}/tree/main?recursive=true&limit=1000`;
  let page = 0;

  while (nextUrl) {
    page++;
    const res = await fetchWithRetry(nextUrl, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    if (!res.ok) {
      throw new Error(`Failed fetching remote tree page ${page} (${res.status}): ${await res.text()}`);
    }
    const items = await res.json();
    for (const item of items) {
      if (item.type === 'file') {
        remoteMap.set(item.path, {
          size: item.size,
          lfsOid: item.lfs ? item.lfs.oid : null,
          oid: item.oid
        });
      }
    }
    const linkHeader = res.headers.get('link');
    nextUrl = null;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        nextUrl = match[1];
      }
    }
    console.log(`  Page ${page}: fetched ${items.length} entries (total files tracked: ${remoteMap.size})`);
  }
  return remoteMap;
}

async function ensureLfsObjectsUploaded(files, onUploaded) {
  const byOid = new Map();
  for (const f of files) {
    if (!byOid.has(f.oid)) {
      byOid.set(f.oid, f);
    }
  }
  const uniqueFiles = Array.from(byOid.values());
  const BATCH_SIZE = 100;

  let uploadedCount = 0;
  let alreadyPresentCount = 0;

  for (let i = 0; i < uniqueFiles.length; i += BATCH_SIZE) {
    const chunk = uniqueFiles.slice(i, i + BATCH_SIZE);
    let data = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const res = await fetchWithRetry(`https://huggingface.co/datasets/${REPO_ID}.git/info/lfs/objects/batch`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Accept': 'application/vnd.git-lfs+json',
            'Content-Type': 'application/vnd.git-lfs+json'
          },
          body: JSON.stringify({
            operation: 'upload',
            transfers: ['basic'],
            objects: chunk.map(f => ({ oid: f.oid, size: f.size })),
            hash_algo: 'sha256'
          })
        });
        if (res.ok) {
          data = await res.json();
          break;
        }
        const text = await res.text();
        if (attempt === 6) throw new Error(`LFS batch request failed (${res.status}): ${text}`);
      } catch (err) {
        if (attempt === 6) throw err;
      }
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
    const presentInChunk = chunk.length - ((data.objects || []).filter(obj => obj.actions && obj.actions.upload).length);
    alreadyPresentCount += presentInChunk;
    if (onUploaded && presentInChunk > 0) onUploaded(presentInChunk, 0);
    const toUpload = (data.objects || []).filter(obj => obj.actions && obj.actions.upload);

    const CONCURRENCY = 10;
    for (let j = 0; j < toUpload.length; j += CONCURRENCY) {
      const sub = toUpload.slice(j, j + CONCURRENCY);
      await Promise.all(sub.map(async (obj) => {
        const fileMeta = byOid.get(obj.oid);
        const fileBuf = fs.readFileSync(fileMeta.fullPath);
        const uploadAction = obj.actions.upload;

        for (let attempt = 1; attempt <= 6; attempt++) {
          try {
            const putRes = await fetchWithRetry(uploadAction.href, {
              method: 'PUT',
              headers: uploadAction.header || {},
              body: fileBuf
            });
            if (putRes.ok) break;
            const errText = await putRes.text();
            if (attempt === 6) {
              throw new Error(`LFS PUT failed for ${fileMeta.relPath} (${putRes.status}): ${errText}`);
            }
          } catch (err) {
            if (attempt === 6) throw err;
          }
          await new Promise(r => setTimeout(r, attempt * 1500));
        }

        if (obj.actions.verify) {
          for (let attempt = 1; attempt <= 6; attempt++) {
            try {
              const verifyRes = await fetchWithRetry(obj.actions.verify.href, {
                method: 'POST',
                headers: {
                  'Accept': 'application/vnd.git-lfs+json',
                  'Content-Type': 'application/vnd.git-lfs+json',
                  ...(obj.actions.verify.header || {})
                },
                body: JSON.stringify({ oid: obj.oid, size: obj.size })
              });
              if (verifyRes.ok) break;
              const errText = await verifyRes.text();
              if (attempt === 6) {
                throw new Error(`LFS verify failed for ${fileMeta.relPath} (${verifyRes.status}): ${errText}`);
              }
            } catch (err) {
              if (attempt === 6) throw err;
            }
            await new Promise(r => setTimeout(r, attempt * 1500));
          }
        }
        uploadedCount++;
        if (onUploaded) onUploaded(1, fileMeta.size);
      }));
    }
    console.log(`  LFS check [${Math.min(i + BATCH_SIZE, uniqueFiles.length)}/${uniqueFiles.length}]: ${alreadyPresentCount} already on HF, ${uploadedCount} newly uploaded`);
  }
}

async function sendCommit(summary, operations) {
  const lines = [
    JSON.stringify({ key: 'header', value: { summary, description: '' } }),
    ...operations.map(op => JSON.stringify(op))
  ];
  const ndjson = lines.join('\n') + '\n';

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetchWithRetry(`https://huggingface.co/api/datasets/${REPO_ID}/commit/main`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/x-ndjson'
      },
      body: ndjson
    });

    if (res.ok) {
      const result = await res.json();
      console.log(`Committed: "${summary}" -> ${result.commitUrl || result.commitOid || 'OK'}`);
      return result;
    }
    const errText = await res.text();
    if (attempt === 5) {
      throw new Error(`Commit "${summary}" failed (${res.status}): ${errText}`);
    }
    console.log(`  Commit attempt ${attempt} returned ${res.status}, retrying in ${attempt * 2}s...`);
    await new Promise(r => setTimeout(r, attempt * 2000));
  }
}

async function main() {
  console.log('=== Starting Full 100% Library Verification & Sync with Hugging Face ===\n');

  const localFiles = collectAllLocalFiles();
  console.log(`Total local library files: ${localFiles.length}`);

  const remoteMap = await fetchAllRemoteFiles();
  console.log(`Total remote files on Hugging Face: ${remoteMap.size}\n`);

  // Load local SHA-256 cache from Past Papers to avoid re-reading 45+ GB from disk
  let shaCacheFiles = {};
  if (fs.existsSync(SHA_CACHE_PATH)) {
    try {
      shaCacheFiles = JSON.parse(fs.readFileSync(SHA_CACHE_PATH, 'utf8')).files || {};
    } catch { /* ignore cache read error */ }
  }
  const pastPapersDir = path.join(LIBRARY_ROOT, 'Past Papers');

  // Find all local files that are missing on remote or differ in size
  const missingOrChanged = [];
  const byFolderCounts = {};

  for (const lf of localFiles) {
    const rf = remoteMap.get(lf.relPath);
    if (!rf || rf.size !== lf.size || !rf.lfsOid) {
      let oid = '';
      if (lf.relPath.startsWith('Past Papers/')) {
        const relFromPP = path.relative(pastPapersDir, lf.fullPath).replace(/\\/g, '/');
        const st = fs.statSync(lf.fullPath);
        const cached = shaCacheFiles[relFromPP];
        if (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs && cached.sha) {
          oid = cached.sha;
        }
      }
      if (!oid) {
        const buf = fs.readFileSync(lf.fullPath);
        oid = crypto.createHash('sha256').update(buf).digest('hex');
      }
      missingOrChanged.push({
        ...lf,
        oid
      });
      const topFolder = lf.relPath.split('/').slice(0, 3).join('/');
      byFolderCounts[topFolder] = (byFolderCounts[topFolder] || 0) + 1;
    }
  }

  console.log(`Found ${missingOrChanged.length} local files missing or out-of-sync on Hugging Face:`);
  for (const [folder, count] of Object.entries(byFolderCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${folder}: ${count} missing files`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const startedAtMs = Date.now();
  let committedFiles = 0;
  let lfsProcessedInCurrentBatch = 0;
  let bytesUploaded = 0;
  let lastStatusWrite = 0;

  const writeHfStatus = (phase, currentBatch, totalChunks) => {
    const elapsedSec = Math.max(1, (Date.now() - startedAtMs) / 1000);
    const doneTotal = Math.min(missingOrChanged.length, committedFiles + lfsProcessedInCurrentBatch);
    const filesPerMin = Number(((doneTotal / elapsedSec) * 60).toFixed(1));
    const remaining = Math.max(0, missingOrChanged.length - doneTotal);
    const etaMinutes = filesPerMin > 0 ? Number((remaining / filesPerMin).toFixed(1)) : null;
    try {
      fs.writeFileSync(HF_STATUS_PATH, JSON.stringify({
        phase,
        startedAt: new Date(startedAtMs).toISOString(),
        updatedAt: new Date().toISOString(),
        elapsedSec: Math.round(elapsedSec),
        totalLocalFiles: localFiles.length,
        totalMissingInitial: missingOrChanged.length,
        committedFiles,
        doneTotal,
        remaining,
        percent: missingOrChanged.length > 0 ? Number(((doneTotal / missingOrChanged.length) * 100).toFixed(2)) : 100,
        currentBatch,
        totalBatches: totalChunks,
        mbUploaded: Number((bytesUploaded / (1024 * 1024)).toFixed(2)),
        filesPerMin,
        etaMinutes
      }, null, 2));
    } catch { /* ignore */ }
  };

  if (missingOrChanged.length === 0) {
    writeHfStatus('done', 0, 0);
    console.log(`\nAll ${localFiles.length.toLocaleString()} files are already 100% in sync on Hugging Face!`);
    return;
  }

  // Upload & commit in chunks of 1,000 files (~54 commits for 54k files, well under HF's 128 commits/hr limit)
  const COMMIT_CHUNK_SIZE = 1000;
  const totalChunks = Math.ceil(missingOrChanged.length / COMMIT_CHUNK_SIZE);
  writeHfStatus('uploading', 1, totalChunks);

  for (let c = 0; c < totalChunks; c++) {
    const chunk = missingOrChanged.slice(c * COMMIT_CHUNK_SIZE, (c + 1) * COMMIT_CHUNK_SIZE);
    lfsProcessedInCurrentBatch = 0;
    console.log(`\n--- Processing Batch ${c + 1}/${totalChunks} (${chunk.length} files) ---`);
    await ensureLfsObjectsUploaded(chunk, (countDelta, bytesDelta) => {
      lfsProcessedInCurrentBatch += countDelta;
      bytesUploaded += bytesDelta;
      const now = Date.now();
      if (now - lastStatusWrite >= 5000) {
        lastStatusWrite = now;
        writeHfStatus('uploading', c + 1, totalChunks);
      }
    });
    await sendCommit(
      `Sync missing library files batch ${c + 1}/${totalChunks} (${chunk.length} files)`,
      chunk.map(f => ({
        key: 'lfsFile',
        value: { path: f.relPath, algo: 'sha256', oid: f.oid, size: f.size }
      }))
    );
    committedFiles += chunk.length;
    lfsProcessedInCurrentBatch = 0;
    writeHfStatus('uploading', c + 1, totalChunks);
  }

  writeHfStatus('done', totalChunks, totalChunks);

  console.log('\n=== Full 100% Hugging Face Sync Completed! ===');
}

main().catch(err => {
  console.error('SYNC ERROR:', err);
  process.exit(1);
});
