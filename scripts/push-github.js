import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const LIBRARY_ROOT = path.resolve(APP_DIR, '..');

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

const TOKEN = process.env.GITHUB_TOKEN || process.argv[3];
const REPO = process.env.GITHUB_REPO || 'Con-Artist-1/conceptualist-library';
const COMMIT_MSG = process.argv[2] || 'Update Conceptualist Systems library web app and index';

if (!TOKEN) {
  console.error('Missing GITHUB_TOKEN. Add GITHUB_TOKEN=ghp_... to e:\\The Library\\search-app\\.env');
  process.exit(1);
}

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-ssr',
  '.vercel',
  '.git',
  'pi-deploy',
  '.vscode',
  '.idea',
  'logs'
]);

const EXCLUDE_FILES = new Set([
  '.env',
  '.env.local',
  '.DS_Store',
  'pi-deploy.zip'
]);

function computeGitBlobSha(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}

function collectRepoFiles(dir, baseDir = APP_DIR) {
  let list = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      list = list.concat(collectRepoFiles(path.join(dir, entry.name), baseDir));
    } else {
      if (EXCLUDE_FILES.has(entry.name)) continue;
      if (entry.name.endsWith('.log') || entry.name.endsWith('.local')) continue;
      if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      const buf = fs.readFileSync(full);
      const gitSha = computeGitBlobSha(buf);
      list.push({ full, rel, buf, gitSha, size: buf.length });
    }
  }
  return list;
}

async function ghRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Conceptualist-Systems-Deployer',
      ...(options.headers || {})
    }
  });
  return res;
}

async function ensureRepoExists(repoFullName) {
  const [owner, repoName] = repoFullName.split('/');
  const checkRes = await ghRequest(`/repos/${owner}/${repoName}`);
  if (checkRes.ok) {
    return await checkRes.json();
  }
  if (checkRes.status === 404) {
    console.log(`Repository ${repoFullName} not found. Creating it on GitHub...`);
    const createRes = await ghRequest('/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: repoName,
        description: 'Conceptualist Systems — Pearson Edexcel IAL & IGCSE Past Papers & Textbooks Library (conceptualist.uk)',
        homepage: 'https://www.conceptualist.uk',
        private: false,
        auto_init: true
      })
    });
    if (!createRes.ok) {
      throw new Error(`Failed to create repository ${repoFullName} (${createRes.status}): ${await createRes.text()}`);
    }
    const created = await createRes.json();
    // Wait briefly for GitHub's initial commit to settle
    await new Promise(r => setTimeout(r, 2000));
    return created;
  }
  throw new Error(`Failed checking repository ${repoFullName} (${checkRes.status}): ${await checkRes.text()}`);
}

async function main() {
  console.log(`=== Pushing to GitHub (${REPO}) ===`);

  const files = collectRepoFiles(APP_DIR);
  const candidateNames = ['AI_INSTRUCTIONS_LIBRARY.md', 'AI_INSTRUCTIONS_README.md'];
  for (const name of candidateNames) {
    const aiReadmePath = path.join(LIBRARY_ROOT, name);
    if (fs.existsSync(aiReadmePath)) {
      const buf = fs.readFileSync(aiReadmePath);
      files.push({
        full: aiReadmePath,
        rel: name,
        buf,
        gitSha: computeGitBlobSha(buf),
        size: buf.length
      });
      break;
    }
  }

  console.log(`Collected ${files.length} clean repository files (${(files.reduce((s, f) => s + f.size, 0) / 1024).toFixed(1)} KB total).`);

  const repoInfo = await ensureRepoExists(REPO);
  const branch = repoInfo.default_branch || 'main';

  // Fetch current branch commit & existing tree SHAs
  let parentCommitSha = null;
  const existingShas = new Map();

  const refRes = await ghRequest(`/repos/${REPO}/git/ref/heads/${branch}`);
  if (refRes.ok) {
    const refData = await refRes.json();
    parentCommitSha = refData.object.sha;
    const treeRes = await ghRequest(`/repos/${REPO}/git/trees/${parentCommitSha}?recursive=1`);
    if (treeRes.ok) {
      const treeData = await treeRes.json();
      for (const item of treeData.tree || []) {
        if (item.type === 'blob') existingShas.set(item.path, item.sha);
      }
    }
  }

  // Upload changed blobs
  const treeEntries = [];
  let uploadedCount = 0;
  let unchangedCount = 0;

  for (const f of files) {
    if (existingShas.get(f.rel) === f.gitSha) {
      unchangedCount++;
      treeEntries.push({
        path: f.rel,
        mode: '100644',
        type: 'blob',
        sha: f.gitSha
      });
      continue;
    }

    const blobRes = await ghRequest(`/repos/${REPO}/git/blobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: f.buf.toString('base64'),
        encoding: 'base64'
      })
    });
    if (!blobRes.ok) {
      throw new Error(`Failed uploading blob ${f.rel} (${blobRes.status}): ${await blobRes.text()}`);
    }
    const blobData = await blobRes.json();
    uploadedCount++;
    console.log(`  Uploaded: ${f.rel} (${(f.size / 1024).toFixed(1)} KB)`);
    treeEntries.push({
      path: f.rel,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha
    });
  }

  if (uploadedCount === 0 && parentCommitSha && existingShas.size === files.length) {
    console.log(`\nAll ${files.length} files are already up-to-date on https://github.com/${REPO}!`);
    return;
  }

  console.log(`\nCreating Git tree (${uploadedCount} updated, ${unchangedCount} unchanged)...`);
  const createTreeRes = await ghRequest(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree: treeEntries })
  });
  if (!createTreeRes.ok) {
    throw new Error(`Failed creating tree (${createTreeRes.status}): ${await createTreeRes.text()}`);
  }
  const newTree = await createTreeRes.json();

  const commitBody = {
    message: COMMIT_MSG,
    tree: newTree.sha,
    ...(parentCommitSha ? { parents: [parentCommitSha] } : {})
  };
  const createCommitRes = await ghRequest(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(commitBody)
  });
  if (!createCommitRes.ok) {
    throw new Error(`Failed creating commit (${createCommitRes.status}): ${await createCommitRes.text()}`);
  }
  const newCommit = await createCommitRes.json();

  const updateRefRes = await ghRequest(`/repos/${REPO}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: newCommit.sha, force: true })
  });
  if (!updateRefRes.ok) {
    throw new Error(`Failed updating branch ref (${updateRefRes.status}): ${await updateRefRes.text()}`);
  }

  console.log(`\n=== Successfully pushed to GitHub! ===`);
  console.log(`Repository: https://github.com/${REPO}`);
  console.log(`Commit:     ${newCommit.sha.slice(0, 7)} ("${COMMIT_MSG}")`);
}

main().catch(err => {
  console.error('GITHUB PUSH ERROR:', err);
  process.exit(1);
});

