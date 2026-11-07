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

const TOKEN = process.argv[2] || process.env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error('Missing VERCEL_TOKEN. Set it in search-app/.env or pass as CLI arg.');
  process.exit(1);
}
const PROJECT_ID = 'prj_aoqCf7hkChGqzoRb3WGb9cf2KAgp';
const TEAM_ID = 'team_34CBzFBsKwAwot7TK9eTAPj8';

const EXCLUDE = new Set(['node_modules', 'dist', '.vercel', '.git', '.env', '.env.local', 'pi-deploy', 'pi-deploy.zip', 'scripts']);

function collectAppFiles(dir, baseDir = APP_DIR) {
  let list = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (dir === baseDir && EXCLUDE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      list = list.concat(collectAppFiles(full, baseDir));
    } else {
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      const buf = fs.readFileSync(full);
      const sha = crypto.createHash('sha1').update(buf).digest('hex');
      list.push({ full, rel, buf, sha, size: buf.length });
    }
  }
  return list;
}

async function main() {
  console.log('=== Deploying search-app to Vercel Production ===');
  const files = collectAppFiles(APP_DIR);
  console.log(`Collected ${files.length} files to upload.`);

  // 1. Upload files to /v2/files
  for (const f of files) {
    const res = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'x-vercel-digest': f.sha
      },
      body: f.buf
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed uploading ${f.rel} (${res.status}): ${err}`);
    }
    console.log(`  Uploaded: ${f.rel} (${(f.size / 1024).toFixed(1)} KB)`);
  }

  // 2. Create production deployment
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'vercel.json'), 'utf8'));
  const body = {
    name: 'search-app',
    project: PROJECT_ID,
    target: 'production',
    files: files.map(f => ({
      file: f.rel,
      sha: f.sha,
      size: f.size
    })),
    projectSettings: {
      framework: 'vite'
    },
    rewrites: vercelConfig.rewrites,
    headers: vercelConfig.headers
  };

  const depRes = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM_ID}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!depRes.ok) {
    const err = await depRes.text();
    throw new Error(`Deployment creation failed (${depRes.status}): ${err}`);
  }

  const dep = await depRes.json();
  console.log(`\nDeployment created: ${dep.id} -> https://${dep.url}`);
  console.log('Waiting for Vercel production build to complete...');

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const checkRes = await fetch(`https://api.vercel.com/v13/deployments/${dep.id}?teamId=${TEAM_ID}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const statusObj = await checkRes.json();
    console.log(`  [${(i + 1) * 3}s] Status: ${statusObj.readyState}`);
    if (statusObj.readyState === 'READY') {
      console.log(`\n=== Production Deployment READY! ===`);
      console.log(`Live URLs:`);
      console.log(`  - https://www.conceptualist.uk`);
      console.log(`  - https://${statusObj.url}`);
      return;
    }
    if (statusObj.readyState === 'ERROR' || statusObj.readyState === 'CANCELED') {
      throw new Error(`Deployment ended with state: ${statusObj.readyState}`);
    }
  }
}

main().catch(err => {
  console.error('DEPLOY ERROR:', err);
  process.exit(1);
});

