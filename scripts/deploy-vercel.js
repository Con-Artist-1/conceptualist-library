import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');

function stripSurroundingQuotes(v) {
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

function loadEnv() {
  const envPath = path.join(APP_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = stripSurroundingQuotes(trimmed.slice(eq + 1).trim());
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

const args = process.argv.slice(2);
const INDEXNOW_ONLY = args.includes('--indexnow-only');
const SKIP_INDEXNOW = args.includes('--skip-indexnow');
const TOKEN = process.env.VERCEL_TOKEN;
if (!INDEXNOW_ONLY && !TOKEN) {
  console.error('Missing VERCEL_TOKEN. Set it in search-app/.env or environment variables.');
  process.exit(1);
}
const PROJECT_ID = 'prj_aoqCf7hkChGqzoRb3WGb9cf2KAgp';
const TEAM_ID = 'team_34CBzFBsKwAwot7TK9eTAPj8';
const SITE_HOST = 'www.conceptualist.uk';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

const EXCLUDE = new Set([
  'node_modules',
  'dist',
  '.vercel',
  '.git',
  '.data',
  'logs',
  'seo',
  'pi-deploy',
  'pi-deploy.zip',
  '.DS_Store',
  'Thumbs.db'
]);

function isExcludedName(name) {
  if (EXCLUDE.has(name)) return true;
  if (name.startsWith('AI_INSTRUCTIONS_')) return true;
  if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) return true;
  return false;
}

function collectAppFiles(dir, baseDir = APP_DIR) {
  let list = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (isExcludedName(entry.name) && !(dir === baseDir && entry.name === 'scripts')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === baseDir && entry.name === 'scripts') {
        const prerender = path.join(full, 'prerender-seo.js');
        if (fs.existsSync(prerender)) {
          const rel = 'scripts/prerender-seo.js';
          const buf = fs.readFileSync(prerender);
          const sha = crypto.createHash('sha1').update(buf).digest('hex');
          list.push({ full: prerender, rel, buf, sha, size: buf.length });
        }
        continue;
      }
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

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractSitemapUrls() {
  const sitemapPath = path.join(APP_DIR, 'public', 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    throw new Error(`Sitemap not found at ${sitemapPath}`);
  }
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const urls = [];
  const seen = new Set();
  const re = /<loc>([^<]+)<\/loc>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const url = decodeXmlEntities(match[1].trim());
    if (url.startsWith(`https://${SITE_HOST}`) && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

async function verifyIndexNowKeyFile(key) {
  const localKeyPath = path.join(APP_DIR, 'public', `${key}.txt`);
  if (!fs.existsSync(localKeyPath)) {
    throw new Error(`IndexNow key file missing at ${localKeyPath}`);
  }
  const localContent = fs.readFileSync(localKeyPath, 'utf8').trim();
  if (localContent !== key) {
    throw new Error(`Local IndexNow key file mismatch in ${localKeyPath}`);
  }

  const keyLocation = `https://${SITE_HOST}/${key}.txt`;
  const maxAttempts = 4;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(keyLocation, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const body = (await res.text()).trim();
      if (res.status === 200 && body === key) {
        console.log(`[IndexNow] Verified live key file (${res.status} OK): ${keyLocation}`);
        return keyLocation;
      }
      lastError = new Error(`Unexpected response from ${keyLocation}: HTTP ${res.status} (body length=${body.length})`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxAttempts) {
      console.log(`[IndexNow] Waiting for edge propagation (attempt ${attempt}/${maxAttempts})...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw lastError;
}

async function submitIndexNow() {
  const key = (process.env.INDEXNOW_KEY || '').trim();
  if (!key) {
    if (INDEXNOW_ONLY) {
      throw new Error('Missing INDEXNOW_KEY. Set it in search-app/.env or environment.');
    }
    console.log('[IndexNow] Skipping submission: INDEXNOW_KEY is not set.');
    return;
  }
  if (!/^[a-z0-9-]{8,128}$/i.test(key)) {
    throw new Error('Invalid INDEXNOW_KEY format (expected 8-128 [a-z0-9-] characters).');
  }

  console.log('\n=== IndexNow Verification & Submission ===');
  const keyLocation = await verifyIndexNowKeyFile(key);
  const urls = extractSitemapUrls();
  if (urls.length === 0) {
    throw new Error('No canonical URLs found in public/sitemap.xml');
  }

  const chunkSize = 10000;
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: SITE_HOST,
        key,
        keyLocation,
        urlList: chunk,
      }),
    });
    const text = (await res.text()).trim();
    if (res.status !== 200 && res.status !== 202) {
      throw new Error(`IndexNow submission failed (HTTP ${res.status}): ${text || res.statusText}`);
    }
    console.log(
      `[IndexNow] Submitted ${chunk.length} canonical URLs to ${INDEXNOW_ENDPOINT} -> HTTP ${res.status} ${res.statusText}${text ? ` (${text})` : ''}`
    );
  }
}

async function main() {
  if (INDEXNOW_ONLY) {
    await submitIndexNow();
    return;
  }

  console.log('=== Deploying search-app to Vercel Production ===');
  const files = collectAppFiles(APP_DIR);
  console.log(`Collected ${files.length} files to upload.`);

  // 1. Upload files to /v2/files with bounded concurrency & retry
  const UPLOAD_CONCURRENCY = 6;
  let uploadCursor = 0;
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, async () => {
    while (uploadCursor < files.length) {
      const f = files[uploadCursor++];
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM_ID}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${TOKEN}`,
              'Content-Type': 'application/octet-stream',
              'x-vercel-digest': f.sha
            },
            body: f.buf
          });
          if (res.ok) {
            lastErr = null;
            console.log(`  Uploaded: ${f.rel} (${(f.size / 1024).toFixed(1)} KB)`);
            break;
          }
          const errText = await res.text();
          lastErr = new Error(`Failed uploading ${f.rel} (${res.status}): ${errText}`);
          if (res.status < 500 && res.status !== 429) break;
        } catch (err) {
          lastErr = err;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
      }
      if (lastErr) throw lastErr;
    }
  }));

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
    trailingSlash: vercelConfig.trailingSlash,
    redirects: vercelConfig.redirects,
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

  const MAX_POLLS = 100;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const checkRes = await fetch(`https://api.vercel.com/v13/deployments/${dep.id}?teamId=${TEAM_ID}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    if (!checkRes.ok) {
      console.warn(`  [${(i + 1) * 3}s] Warning: poll HTTP ${checkRes.status}`);
      continue;
    }
    const statusObj = await checkRes.json();
    console.log(`  [${(i + 1) * 3}s] Status: ${statusObj.readyState}`);
    if (statusObj.readyState === 'READY') {
      console.log(`\n=== Production Deployment READY! ===`);
      console.log(`Live URLs:`);
      console.log(`  - https://www.conceptualist.uk`);
      console.log(`  - https://${statusObj.url}`);
      if (!SKIP_INDEXNOW) {
        await submitIndexNow();
      } else {
        console.log('[IndexNow] Skipped (--skip-indexnow).');
      }
      return;
    }
    if (statusObj.readyState === 'ERROR' || statusObj.readyState === 'CANCELED') {
      throw new Error(`Deployment ended with state: ${statusObj.readyState}`);
    }
  }
  throw new Error(`Timed out after ${MAX_POLLS * 3}s waiting for Vercel deployment ${dep.id} to reach READY state.`);
}

main().catch(err => {
  console.error('DEPLOY ERROR:', err);
  process.exit(1);
});

