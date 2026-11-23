/**
 * Unified Multi-Source Past Paper Sync Utility for Conceptualist Systems Library
 *
 * Crawls Edexcel IAL & IGCSE paper sources, enforces strict IAL vs UK GCE filtering,
 * deduplicates against public/index.json & incremental .data/library_sha_cache.json,
 * downloads missing files cleanly (with Google Drive bypass + curl.exe large-file streaming),
 * packs >= 5 MB PDFs lacking /ObjStm via qpdf (when installed), and runs generate-index.js.
 *
 * Usage:
 *   sync-sources.js [--apply] [--sources=bsr,dp,igexams,ssc,pmt,pl] [--since=2025]
 *                   [--qpdf=<path-to-qpdf.exe>] [--skip-pack] [--skip-index] [--limit=N]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  detectDocType,
  detectSubject,
  extractSessionDate,
  extractUnitInfo,
  extractVariant
} from '../src/unitParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const LIBRARY_ROOT = path.resolve(APP_DIR, '..');
const PAST_PAPERS = path.join(LIBRARY_ROOT, 'Past Papers');
const DATA_DIR = path.join(APP_DIR, '.data');
const SHA_CACHE_PATH = path.join(DATA_DIR, 'library_sha_cache.json');
const INDEX_PATH = path.join(APP_DIR, 'public', 'index.json');

function loadEnv() {
  const envPath = path.join(APP_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DP_PASSWORD = process.env.DP_PASSWORD || '';
const PL_API_BASE = 'https://lldrclumayqoegzfxdcb.supabase.co/rest/v1/papers';
const PL_ANON_KEY = process.env.PL_ANON_KEY || '';

const MONTH_FOLDER = { Jan: 'January', Jun: 'May-June', OctNov: 'Oct-Nov' };
const SUBDIR_FOR_DT = { QP: 'Question-paper', MS: 'Mark-scheme', ER: 'Examiner-report', AUD: 'Audio', DF: 'Data-files', SC: 'Other' };
const IAL_LAUNCH_YEAR = {
  Accounting: 2012, Biology: 2014, Chemistry: 2014, Physics: 2014, Math: 2014,
  Economics: 2014, Business: 2014, Law: 2014, Psychology: 2016, History: 2016,
  'English Language': 2016, 'English Literature': 2016, Geography: 2017, Arabic: 2017,
  Greek: 2017, French: 2017, German: 2017, Spanish: 2017, 'Information Technology': 2019
};

function parseArgs(argv) {
  const opts = {
    apply: false,
    verbose: false,
    sources: ['bsr', 'dp', 'igexams', 'ssc', 'pmt', 'pl'],
    sinceYear: 0,
    qpdfPath: '',
    skipPack: false,
    skipIndex: false,
    limit: Infinity
  };
  for (const arg of argv) {
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '--skip-pack') opts.skipPack = true;
    else if (arg === '--skip-index') opts.skipIndex = true;
    else if (arg.startsWith('--sources=')) opts.sources = arg.slice(10).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    else if (arg.startsWith('--since=')) opts.sinceYear = Number(arg.slice(8)) || 0;
    else if (arg.startsWith('--qpdf=')) opts.qpdfPath = arg.slice(7);
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice(8)) || Infinity;
  }
  return opts;
}

function decodeHtml(str = '') {
  return String(str)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function normalizeHttpUrl(rawUrl, baseUrl = '') {
  const s = decodeHtml(rawUrl).trim();
  if (!s) return '';
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (baseUrl) {
    try { return new URL(s, baseUrl).href; } catch { return ''; }
  }
  return '';
}

function sanitizeFileName(name) {
  return decodeHtml(name)
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/_\d{12,15}(?=\.[^.]+$)/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\(\d+\)(?=\.[^.]+$)/, '')
    .replace(/\s*-\s*Copy(?=\.[^.]+$)/i, '')
    .trim();
}

function walkDir(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  for (const ent of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const fp = path.join(dirPath, ent.name);
    if (ent.isDirectory()) walkDir(fp, out);
    else out.push(fp);
  }
  return out;
}

// Incremental SHA-256 index cached by (size, mtimeMs) in .data/library_sha_cache.json
function loadShaRegistry() {
  let prev = {};
  if (fs.existsSync(SHA_CACHE_PATH)) {
    try { prev = JSON.parse(fs.readFileSync(SHA_CACHE_PATH, 'utf8')).files || {}; } catch (err) { console.warn('[SHA] Cache read skipped:', err?.message || err); }
  }
  const files = walkDir(PAST_PAPERS);
  const nextCache = {};
  const shaToPaths = new Map();
  let hashed = 0;

  for (const fp of files) {
    const rel = path.relative(PAST_PAPERS, fp).replace(/\\/g, '/');
    const st = fs.statSync(fp);
    const cached = prev[rel];
    let sha = cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs ? cached.sha : '';
    if (!sha) {
      sha = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
      hashed++;
    }
    nextCache[rel] = { size: st.size, mtimeMs: st.mtimeMs, sha };
    if (!shaToPaths.has(sha)) shaToPaths.set(sha, []);
    shaToPaths.get(sha).push(fp);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SHA_CACHE_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), files: nextCache }));
  console.log(`[SHA] Ready across ${files.length} files (${hashed} newly hashed, ${shaToPaths.size} unique hashes).`);
  return { shaToPaths, nextCache };
}

function normSessKey(label) {
  if (!label) return 'NO_SESS';
  const s = label.toLowerCase();
  const y = s.match(/\b(20\d{2})\b/)?.[1] || '';
  if (!y) return 'NO_SESS';
  if (s.includes('jan') || s.includes('feb')) return `${y}-Jan`;
  if (s.includes('may') || s.includes('jun')) return `${y}-Jun`;
  if (s.includes('oct') || s.includes('nov')) return `${y}-OctNov`;
  return `${y}-Unk`;
}

function normVarKey(spec, subject, v) {
  const u = (v || '').toUpperCase().trim();
  if (spec === 'IAL' && subject === 'History') {
    if (u === '' || u === 'OPT1') return 'OPTA';
    if (u === 'OPT2') return 'OPTB';
    if (u === 'OPT3') return 'OPTC';
    if (u === 'OPT4') return 'OPTD';
  }
  return u;
}

function buildLibraryDedupState() {
  const exactKeys = new Set();
  const looseKeys = new Set();
  const usedPaths = new Set();
  const histVariants = new Map();

  if (!fs.existsSync(INDEX_PATH)) return { exactKeys, looseKeys, usedPaths, histVariants };
  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const keys = idx.keys || [];
  const rows = (idx.files || []).map(r => Object.fromEntries(keys.map((k, i) => [k, r[i]])));

  for (const f of rows) {
    if (f.path) usedPaths.add(f.path.replace(/\\/g, '/').toLowerCase());
    if (f.category !== 'Past Papers') continue;
    const sk = normSessKey(f.session);
    const u = (f.unitCode || '').toUpperCase();
    const v = normVarKey(f.spec, f.subject, f.variant);
    const dt = (f.docType || '').toUpperCase();
    exactKeys.add(`${f.spec}|${f.subject}|${u}|${v}|${sk}|${dt}`);
    const uAlt = u.replace(/^6(?:BI|CH|PH)(\d{2})$/, 'W$1').replace(/^W([A-Z]{2})0(\d)$/, 'W$11$2');
    looseKeys.add(`${f.spec}|${f.subject}|${u}|${v}|${sk}|${dt}`);
    looseKeys.add(`${f.spec}|${f.subject}|${uAlt}|${v}|${sk}|${dt}`);
    if (f.spec === 'IAL' && f.subject === 'History' && u && dt) {
      const hk = `${u}|${sk}|${dt}`;
      if (!histVariants.has(hk)) histVariants.set(hk, new Set());
      histVariants.get(hk).add(v || 'BASE');
    }
    if (f.spec === 'IGCSE' && dt === 'ER' && !u && !v.includes('MOD')) {
      const rv = v.endsWith('R') ? 'R' : '';
      const fh = v.startsWith('F') ? 'F' : (v.startsWith('H') ? 'H' : '');
      looseKeys.add(`${f.spec}|${f.subject}|ANY_ER|${fh}|${rv}|${sk}|ER`);
      looseKeys.add(`${f.spec}|${f.subject}|ANY_ER||${rv}|${sk}|ER`);
    }
  }
  return { exactKeys, looseKeys, usedPaths, histVariants };
}

function isAlreadyCovered(state, spec, subject, unitCode, variant, sessKey, docType) {
  const u = (unitCode || '').toUpperCase();
  const v = normVarKey(spec, subject, variant);
  const dt = (docType || '').toUpperCase();
  const sessions = spec === 'IGCSE' && (sessKey === '2020-Jun' || sessKey === '2020-OctNov')
    ? ['2020-Jun', '2020-OctNov']
    : [sessKey];

  for (const sk of sessions) {
    if (state.exactKeys.has(`${spec}|${subject}|${u}|${v}|${sk}|${dt}`)) return true;
    if (state.looseKeys.has(`${spec}|${subject}|${u}|${v}|${sk}|${dt}`)) return true;
    const u1 = u.replace(/^W([A-Z]{2})0(\d)$/, 'W$11$2');
    const u0 = u.replace(/^W([A-Z]{2})1(\d)$/, 'W$10$2');
    if (state.looseKeys.has(`${spec}|${subject}|${u1}|${v}|${sk}|${dt}`)) return true;
    if (state.looseKeys.has(`${spec}|${subject}|${u0}|${v}|${sk}|${dt}`)) return true;
    if (spec === 'IGCSE' && dt === 'ER' && !v.includes('MOD') && v !== 'MODIFIED') {
      const rv = v.endsWith('R') ? 'R' : '';
      const fh = v.startsWith('F') ? 'F' : (v.startsWith('H') ? 'H' : '');
      if (state.looseKeys.has(`${spec}|${subject}|ANY_ER|${fh}|${rv}|${sk}|ER`)) return true;
      if (state.looseKeys.has(`${spec}|${subject}|ANY_ER||${rv}|${sk}|ER`)) return true;
    }
    if (spec === 'IAL' && subject === 'History' && (state.histVariants.get(`${u}|${sk}|${dt}`)?.size || 0) >= 4) return true;
  }
  return false;
}

function parseSessionKey(txt) {
  if (!txt) return null;
  const s = txt.toLowerCase().replace(/[_/\\]+/g, ' ');
  if (/specimen|sample|\bsams?\b/.test(s)) return 'Specimen';
  const m1 = s.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|mau|may|june?|summer|oct(?:ober)?|nov(?:ember|emeber)?)(?:[- ]*(?:r|a|mau|may|june?|oct(?:ober)?|nov(?:ember)?))*[-. ]*(20[0-2]\d)\b/);
  if (m1) {
    const full = m1[0];
    const y = m1[2];
    if (/jan|feb/.test(full)) return `${y}-Jan`;
    if (/oct|nov/.test(full) && !/may|mau|jun/.test(full)) return `${y}-OctNov`;
    if (/may|mau|jun|summer/.test(full)) return `${y}-Jun`;
  }
  const m2 = s.match(/\b(20[0-2]\d)[-. ]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|mau|may|june?|summer|oct(?:ober)?|nov(?:ember|emeber)?)/);
  if (m2) {
    const full = m2[0];
    const y = m2[1];
    if (/jan|feb/.test(full)) return `${y}-Jan`;
    if (/oct|nov/.test(full) && !/may|mau|jun/.test(full)) return `${y}-OctNov`;
    if (/may|mau|jun|summer/.test(full)) return `${y}-Jun`;
  }
  const ymd = s.match(/\b(200[4-9]|201\d|202[0-9])(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (ymd) {
    const y = Number(ymd[1]);
    const mm = Number(ymd[2]);
    const isRes = /(?:rms|msc|eams|pef|perf)/.test(s) && !/(?:que)/.test(s);
    if (isRes) {
      if (mm === 1) return `${y - 1}-OctNov`;
      if (mm <= 3) return `${y}-Jan`;
      if (mm >= 7 && mm <= 9) return `${y}-Jun`;
      return `${y}-OctNov`;
    }
    if (mm <= 3) return `${y}-Jan`;
    if (mm <= 7) return `${y}-Jun`;
    return `${y}-OctNov`;
  }
  const ms = s.match(/\b(jan|jun|may|mau|oct|nov)[- .]*(0[4-9]|1\d|2[0-9])\b/);
  if (ms) {
    const y = '20' + ms[2];
    if (ms[1] === 'jan') return `${y}-Jan`;
    if (ms[1] === 'oct' || ms[1] === 'nov') return `${y}-OctNov`;
    return `${y}-Jun`;
  }
  return null;
}

function isStrictTrueIal(subj, fullPath, sessKey) {
  if (!IAL_LAUNCH_YEAR[subj]) return false;
  const low = fullPath.toLowerCase();
  if (/(?:^|[^a-z0-9])(?:aqa|ocr|cie|cambridge|wjec|eduqas|i?gcse|int[-_\s]?gcse|ig[-_.]?edx)(?:[^a-z0-9]|$)/.test(low)) return false;
  if (/(?:^|[^a-z0-9])(?:4w?[a-z]{2}\d|6(?:bi|ch|ph|ec|bs|ac|ps|ge|hi|en|et|fr|gn|sp)\d{2}|600[12]|8[a-z]{2}\d|9[a-z]{2}\d)(?:[^a-z0-9]|$)/.test(low)) return false;
  if (/(?:^|[^a-z0-9])(?:paper\s*)?(?:[12][bcp]r?|[1-4][hf]r?)(?:[^a-z0-9]|$)/.test(low)) return false;
  if (/(?:^|[^0-9])66[6-9]\d[a-z]?(?:[^a-z0-9]|$)/.test(low)) return false;
  if (subj === 'Math' && /\bc[1-4](?:jan|jun|may)/i.test(low) && !/c12|c34|wma/i.test(low)) return false;
  if ((subj === 'English Language' || subj === 'English Literature') && /\bwps0?\d\b/i.test(low)) return false;
  if (/\bgce\b|(?<!international[-_\s])a[-_\s]?level/i.test(low) && !/international[-_\s]a[-_\s]?level/i.test(low)) return false;
  const yr = Number((sessKey || '').slice(0, 4) || 0);
  if (!yr || sessKey === 'Specimen') return false;
  const minYear = IAL_LAUNCH_YEAR[subj];
  return yr >= minYear;
}

function mapSubject(spec, cardOrTitle, folderPath, name) {
  const cleaned = decodeHtml(cardOrTitle)
    .toLowerCase()
    .replace(/\((?:4[a-z0-9/]+|esl)\)/gi, '')
    .replace(/specification\s+/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normName = String(name || '').replace(/[_-]+/g, ' ');
  if (spec === 'IGCSE' && cleaned.includes('human biology')) return 'Human Biology';
  if (spec === 'IAL') {
    if (cleaned.includes('business')) return 'Business';
    if (cleaned.includes('math')) return 'Math';
    if (cleaned.includes('information tech') || cleaned === 'it' || cleaned === 'ict') return 'Information Technology';
    if (cleaned.includes('english lang')) return 'English Language';
    if (cleaned.includes('english lit')) return 'English Literature';
    return detectSubject(`Past Papers/IAL/${cleaned}/${normName}`) || cleaned.replace(/\b\w/g, c => c.toUpperCase());
  }
  const detected = detectSubject(`Past Papers/IGCSE/${cleaned}/${folderPath.replace(/[_-]+/g, ' ')}/${normName}`);
  if (detected === 'Math') {
    return /\b(?:4mb|math(?:ematics)?\s*b)\b/i.test(`${cleaned} ${normName}`) ? 'Mathematics B' : 'Mathematics A';
  }
  return detected || cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

async function listEmbeddedDriveFolder(folderId) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(25000)
      });
      if (r.status === 429 || r.status >= 500) {
        await new Promise(res => setTimeout(res, 1000 * attempt));
        continue;
      }
      if (!r.ok) return [];
      const h = await r.text();
      const entries = [];
      for (const m of h.matchAll(/<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?class="flip-entry-title">([^<]+)<\/div>/g)) {
        const name = decodeHtml(m[3]);
        entries.push({ id: m[1], href: m[2], name, isFolder: m[2].includes('/folders/') });
      }
      return entries;
    } catch {
      await new Promise(res => setTimeout(res, 800 * attempt));
    }
  }
  return [];
}

async function crawlDriveTree(roots, sinceYear) {
  const queue = [];
  const files = [];
  const visited = new Set();

  for (const root of roots) {
    const fm = root.driveUrl.match(/\/folders\/([A-Za-z0-9_-]+)/);
    const dm = root.driveUrl.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    if (dm) files.push({ ...root, folderPath: '', id: dm[1], name: root.title, url: `https://drive.google.com/uc?export=download&id=${dm[1]}` });
    else if (fm) queue.push({ ...root, folderPath: '', folderId: fm[1], depth: 0 });
  }

  while (queue.length > 0) {
    const batch = queue.splice(0, 14);
    await Promise.all(batch.map(async (node) => {
      if (visited.has(node.folderId)) return;
      visited.add(node.folderId);
      const entries = await listEmbeddedDriveFolder(node.folderId);
      for (const ent of entries) {
        if (ent.isFolder) {
          const folderYr = Number(ent.name.match(/\b(20\d{2})\b/)?.[1] || 0);
          if (sinceYear && folderYr && folderYr < sinceYear) continue;
          if (node.spec === 'IAL' && /\b200\d\b|old\s*spec\s*\(6|gce\s*2008/i.test(ent.name)) continue;
          if (node.depth < 4) {
            queue.push({
              ...node,
              folderPath: node.folderPath ? `${node.folderPath}/${ent.name}` : ent.name,
              folderId: ent.id,
              depth: node.depth + 1
            });
          }
        } else {
          files.push({
            source: node.source,
            spec: node.spec,
            title: node.title,
            folderPath: node.folderPath,
            id: ent.id,
            name: ent.name,
            url: `https://drive.google.com/uc?export=download&id=${ent.id}`
          });
        }
      }
    }));
  }
  return files;
}

async function crawlBsr(sinceYear) {
  console.log('[BSR] Fetching https://britishstudentroom.com/edexcel/ ...');
  const html = await fetch('https://britishstudentroom.com/edexcel/', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
  const roots = [];
  for (const m of html.matchAll(/<div class="subject-card"([^>]*)>/gi)) {
    const attrs = m[1];
    const level = attrs.match(/data-level="([^"]*)"/)?.[1] || '';
    if (level !== 'IAL' && level !== 'IGCSE') continue;
    const title = decodeHtml(attrs.match(/data-title="([^"]*)"/)?.[1] || '');
    const slice = html.slice(m.index, m.index + 1200);
    const driveUrl = slice.match(/openAuthModal\('([^']+)'\)/)?.[1] || '';
    if (driveUrl) roots.push({ source: 'BSR', spec: level, title, driveUrl });
  }
  console.log(`[BSR] Found ${roots.length} IAL/IGCSE Drive roots; crawling folders...`);
  return crawlDriveTree(roots, sinceYear);
}

async function crawlDynamicPapers() {
  if (!DP_PASSWORD) {
    console.warn('[DP] Skipping dynamicpapers.com (set DP_PASSWORD in search-app/.env to enable).');
    return [];
  }
  console.log('[DP] Authenticating dynamicpapers.com...');
  const loginRes = await fetch('https://dynamicpapers.com/wp-login.php?action=postpass', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `post_password=${encodeURIComponent(DP_PASSWORD)}&Submit=Enter`,
    redirect: 'manual',
    signal: AbortSignal.timeout(30000)
  });
  const cookies = (loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')].filter(Boolean))
    .map(c => c.split(';')[0]).join('; ');

  const hubs = [
    { spec: 'IGCSE', url: 'https://dynamicpapers.com/edexcel-recent-papers/igcse-o-level/' },
    { spec: 'IAL', url: 'https://dynamicpapers.com/edexcel-recent-papers/international-a-level/' }
  ];
  const subPages = new Map();
  let dpErrors = 0;
  for (const h of hubs) {
    try {
      const body = await fetch(h.url, { headers: { 'User-Agent': UA, Cookie: cookies }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
      for (const m of body.matchAll(/href=["']([^"']*dynamicpapers\.com\/edexcel[^"']*\/)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const u = normalizeHttpUrl(m[1], h.url);
        const txt = decodeHtml(m[2].replace(/<[^>]+>/g, ' '));
        if (!u || /igcse-o-level\/$|international-a-level\/$/i.test(u)) continue;
        if (h.spec === 'IGCSE' && !u.includes('/igcse')) continue;
        if (h.spec === 'IAL' && !u.includes('/international-a-level')) continue;
        subPages.set(u, { spec: h.spec, title: txt || u.split('/').filter(Boolean).pop() });
      }
    } catch { dpErrors++; }
  }

  const out = [];
  const entries = [...subPages.entries()];
  for (let i = 0; i < entries.length; i += 6) {
    await Promise.all(entries.slice(i, i + 6).map(async ([url, info]) => {
      try {
        const html = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookies }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
        for (const m of html.matchAll(/href=["']([^"']+\.(?:pdf|mp3|wav|zip)[^"']*)["']/gi)) {
          const fileUrl = normalizeHttpUrl(m[1], url);
          if (!fileUrl) continue;
          const name = decodeURIComponent(fileUrl.split('?')[0].split('/').pop() || '');
          out.push({ source: 'DP', spec: info.spec, title: info.title, folderPath: '', name, url: fileUrl, cookie: cookies });
        }
      } catch { dpErrors++; }
    }));
  }
  console.log(`[DP] Collected ${out.length} links across ${entries.length} pages${dpErrors ? ` (${dpErrors} page errors)` : ''}.`);
  return out;
}

async function crawlIgExams(sinceYear) {
  console.log('[IGExams] Scanning IGCSE & IAL hubs...');
  const hubs = [
    { spec: 'IGCSE', url: 'https://igexams.com/past-paper/edexcel-o-level-igcse-past-papers/' },
    { spec: 'IAL', url: 'https://igexams.com/past-paper/edexcel-as-ial-past-papers/' }
  ];
  const pages = new Map();
  let igErrors = 0;
  for (const h of hubs) {
    try {
      const html = await fetch(h.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
      for (const m of html.matchAll(/href=["'](https?:\/\/igexams\.com\/past_papers\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        pages.set(m[1], { spec: h.spec, title: decodeHtml(m[2].replace(/<[^>]+>/g, ' ')) });
      }
    } catch { igErrors++; }
  }
  const driveRoots = [];
  const direct = [];
  for (const [url, info] of pages) {
    try {
      const html = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
      for (const m of html.matchAll(/href=["'](https?:\/\/drive\.google\.com\/drive\/folders\/[^"'?]+)["']/gi)) {
        driveRoots.push({ source: 'IGExams', spec: info.spec, title: info.title, driveUrl: m[1] });
      }
      for (const m of html.matchAll(/href=["']([^"']+\.(?:pdf|mp3|wav|zip))["']/gi)) {
        const u = normalizeHttpUrl(m[1], url);
        if (u) direct.push({ source: 'IGExams', spec: info.spec, title: info.title, folderPath: '', name: decodeURIComponent(u.split('/').pop()), url: u });
      }
    } catch { igErrors++; }
  }
  const driveFiles = await crawlDriveTree(driveRoots, sinceYear);
  console.log(`[IGExams] Collected ${direct.length} direct + ${driveFiles.length} Drive files${igErrors ? ` (${igErrors} page errors)` : ''}.`);
  return [...direct, ...driveFiles];
}

async function crawlSsc(sinceYear) {
  console.log('[SSC] Scanning Smart Study Campus...');
  const hubs = [
    { spec: 'IGCSE', url: 'https://smartstudycampus.com/pages/igcse-edexcel-subject' },
    { spec: 'IAL', url: 'https://smartstudycampus.com/pages/as-edexcel-subject' }
  ];
  const subPages = new Map();
  let sscErrors = 0;
  for (const h of hubs) {
    try {
      const html = await fetch(h.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
      for (const m of html.matchAll(/href=["']([^"']*\/pages\/[^"']*edexcel[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const u = normalizeHttpUrl(m[1], h.url);
        if (u && !u.endsWith('-subject')) subPages.set(u, { spec: h.spec, title: decodeHtml(m[2].replace(/<[^>]+>/g, ' ')) });
      }
    } catch { sscErrors++; }
  }
  const driveRoots = [];
  const direct = [];
  for (const [url, info] of subPages) {
    try {
      const html = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
      for (const m of html.matchAll(/href=["'](https?:\/\/drive\.google\.com\/drive\/folders\/[^"'?]+)["']/gi)) {
        driveRoots.push({ source: 'SSC', spec: info.spec, title: info.title, driveUrl: m[1] });
      }
      for (const m of html.matchAll(/href=["']([^"']+\.(?:pdf|mp3|zip))["']/gi)) {
        const u = normalizeHttpUrl(m[1], url);
        if (u) direct.push({ source: 'SSC', spec: info.spec, title: info.title, folderPath: '', name: decodeURIComponent(u.split('?')[0].split('/').pop()), url: u });
      }
    } catch { sscErrors++; }
  }
  const driveFiles = await crawlDriveTree(driveRoots, sinceYear);
  console.log(`[SSC] Collected ${direct.length} direct + ${driveFiles.length} Drive files${sscErrors ? ` (${sscErrors} page errors)` : ''}.`);
  return [...direct, ...driveFiles];
}

async function crawlPmt() {
  console.log('[PMT] Scanning Physics & Maths Tutor Edexcel IAL/IGCSE indexes...');
  const rootHtml = await fetch('https://www.physicsandmathstutor.com/past-papers/', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
  const sections = [...new Set([...rootHtml.matchAll(/href=["'](https:\/\/www\.physicsandmathstutor\.com\/(?:past-papers\/[^"']+|a-level-maths-papers\/))["']/gi)].map(m => m[1]))]
    .filter(u => !/revision|solutionbank|tutor|courses/i.test(u));

  const subUrls = new Set();
  let pmtErrors = 0;
  for (const sUrl of sections) {
    try {
      const html = await fetch(sUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
      for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
        const u = normalizeHttpUrl(m[1], sUrl);
        if (!u || !u.includes('physicsandmathstutor.com')) continue;
        const low = u.toLowerCase();
        if ((low.includes('edexcel') && (low.includes('ial') || low.includes('igcse') || low.includes('international')))
          || (sUrl.includes('a-level-maths-papers') && /\/(?:c1|c2|c3|c4|c12|c34|p1|p2|p3|p4|m1|m2|m3|s1|s2|s3|fp1|fp2|fp3|d1)(?:-papers|\/|$)/i.test(low))) {
          subUrls.add(u);
        }
      }
    } catch { pmtErrors++; }
  }

  const out = [];
  const list = [...subUrls];
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async (u) => {
      try {
        const html = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
        const spec = /igcse/i.test(u) ? 'IGCSE' : 'IAL';
        const title = u.includes('maths-papers') ? 'Math' : (u.split('/').filter(Boolean).pop() || '');
        for (const m of html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)) {
          const pdfUrl = normalizeHttpUrl(m[1], u);
          if (pdfUrl) out.push({ source: 'PMT', spec, title, folderPath: '', name: decodeURIComponent(pdfUrl.split('?')[0].split('/').pop()), url: pdfUrl });
        }
      } catch { pmtErrors++; }
    }));
  }
  console.log(`[PMT] Collected ${out.length} PDF links across ${list.length} pages${pmtErrors ? ` (${pmtErrors} page errors)` : ''}.`);
  return out;
}

async function crawlPaperlords() {
  if (!PL_ANON_KEY) {
    console.warn('[Paperlords] Skipping paperlords.org (set PL_ANON_KEY in search-app/.env to enable).');
    return [];
  }
  console.log('[Paperlords] Querying IGCSE & IAL REST endpoints...');
  const out = [];
  for (const cat of ['IGCSE', 'IAL']) {
    let offset = 0;
    while (true) {
      try {
        const url = `${PL_API_BASE}?select=*&category=eq.${cat}&deleted_at=is.null&order=id.asc&limit=1000&offset=${offset}`;
        const batch = await fetch(url, {
          headers: {
            apikey: PL_ANON_KEY,
            Authorization: `Bearer ${PL_ANON_KEY}`,
            Origin: 'https://www.paperlords.org',
            Referer: 'https://www.paperlords.org/',
            'User-Agent': UA
          },
          signal: AbortSignal.timeout(30000)
        }).then(r => (r.ok ? r.json() : []));
        for (const row of batch) {
          const fileUrl = normalizeHttpUrl(row.link || row.url || row.file_url || row.pdf_url || '');
          if (!fileUrl) continue;
          const folderMeta = `${row.session || ''} ${row.unit || ''} ${row.variant || ''} ${row.type || ''}`.trim();
          out.push({
            source: 'Paperlords',
            spec: cat,
            title: row.subject || '',
            folderPath: folderMeta,
            name: decodeURIComponent(fileUrl.split('?')[0].split('/').pop()),
            url: fileUrl
          });
        }
        if (batch.length < 1000) break;
        offset += 1000;
      } catch { break; }
    }
  }
  console.log(`[Paperlords] Collected ${out.length} paper rows.`);
  return out;
}

function planItems(rawItems, state, sinceYear) {
  const planned = [];
  const seenByKey = new Map();

  for (const item of rawItems) {
    const name = sanitizeFileName(item.name || '');
    const extMatch = name.match(/\.(pdf|zip|rar|mp3|wav|docx?)$/i);
    if (!extMatch) continue;
    const ext = extMatch[1].toLowerCase();
    const folderPath = decodeHtml(item.folderPath || '');
    const fullPath = folderPath ? `${folderPath}/${name}` : name;

    if (/grade[-_\s]?bound|grade[-_\s]?charact|syllabus|spec(?:ification)?\b|formula|timetabl|coursework|teacher[-_\s]*guide|revision|\bnotes?\b|toaz\.info|4IT1_02_DATA_FILES_2311\/|(?:^|[^a-z0-9])(?:aqa|ocr|cie|cambridge|wjec|eduqas)(?:[^a-z0-9]|$)/i.test(fullPath)) {
      continue;
    }
    if (item.spec === 'IGCSE' && /(?:^|[^a-z0-9])1[a-z]{2}\d(?:[^a-z0-9]|$)/i.test(fullPath)) {
      continue;
    }

    const subj = mapSubject(item.spec, item.title || name, folderPath, name);
    const sessKey = parseSessionKey(fullPath);
    if (!sessKey || sessKey === 'Specimen') continue;
    const yr = Number(sessKey.slice(0, 4));
    if (sinceYear && yr < sinceYear) continue;
    if (item.spec === 'IAL' && !isStrictTrueIal(subj, fullPath, sessKey)) continue;

    let dt = detectDocType(name, folderPath);
    if (!dt && (/^(?:4\d{4}|W4\d{4}|53\d{3})/.test(name) || /IAL_Geography WGE\d{2}/i.test(name))) dt = 'QP';
    if (!dt || dt === 'SAM') continue;

    const [yrStr, moCode] = sessKey.split('-');
    const moFolder = MONTH_FOLDER[moCode] || moCode;
    const subFolder = SUBDIR_FOR_DT[dt] || 'Other';
    const probePath = `Past Papers/${item.spec}/${subj}/${yrStr}/${moFolder}/${subFolder}/${fullPath.replace(/\//g, '_')}_${name}`;
    let u = extractUnitInfo(probePath, subj, item.spec).unitCode;
    if (item.spec === 'IAL' && subj === 'Law' && /yla1[-_\s]*02/i.test(fullPath)) u = 'YLA2';
    const v = extractVariant({ path: probePath, name, subject: subj, spec: item.spec });

    if (isAlreadyCovered(state, item.spec, subj, u, v, sessKey, dt)) continue;
    const dedupKey = `${item.spec}|${subj}|${(u || '').toUpperCase()}|${normVarKey(item.spec, subj, v)}|${sessKey}|${dt}`;
    if (seenByKey.has(dedupKey)) {
      const prev = seenByKey.get(dedupKey);
      if (prev.url !== item.url && !prev.fallbacks.some(f => f.url === item.url)) {
        prev.fallbacks.push({ url: item.url, cookie: item.cookie, id: item.id, source: item.source });
      }
      continue;
    }

    const base = name.slice(0, -(ext.length + 1));
    const parsedOwn = {
      unit: extractUnitInfo(`Past Papers/${item.spec}/${subj}/${yrStr}/${moFolder}/${subFolder}/${name}`, subj, item.spec).unitCode,
      var: extractVariant({ path: `Past Papers/${item.spec}/${subj}/${yrStr}/${moFolder}/${subFolder}/${name}`, name, subject: subj, spec: item.spec }),
      sess: extractSessionDate(`${yrStr}/${moFolder}/${name}`)
    };
    const tags = [];
    if (u && parsedOwn.unit !== u) tags.push(u);
    if (v && parsedOwn.var !== v) tags.push(v);
    if (!parsedOwn.sess) tags.push(`${yrStr}-${moCode}`);
    const finalName = `${tags.length ? `${base}_${tags.join('_')}` : base}.${ext}`;
    let relDest = `Past Papers/${item.spec}/${subj}/${yrStr}/${moFolder}/${subFolder}/${finalName}`;
    if (state.usedPaths.has(relDest.toLowerCase())) {
      relDest = `Past Papers/${item.spec}/${subj}/${yrStr}/${moFolder}/${subFolder}/${base}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    }

    const entry = {
      ...item,
      subj,
      yrStr,
      moCode,
      dt,
      relDest,
      absDest: path.join(LIBRARY_ROOT, relDest.replace(/\//g, '\\')),
      fallbacks: []
    };
    seenByKey.set(dedupKey, entry);
    state.usedPaths.add(relDest.toLowerCase());
    planned.push(entry);
  }
  return planned;
}

function validateMagic(buf, ext) {
  if (!buf || buf.length < 512) return 'TOO_SMALL';
  const head = buf.slice(0, 64).toString('latin1');
  if (/^\s*<(?:!doctype|html|\?xml|head|body)/i.test(head)) return 'HTML_RESPONSE';
  if (ext === 'pdf') {
    if (!buf.slice(0, 16).toString('latin1').includes('%PDF-')) return 'BAD_PDF';
    const tail = buf.slice(Math.max(0, buf.length - 8192)).toString('latin1');
    const eofIdx = tail.lastIndexOf('%%EOF');
    if (eofIdx === -1) return 'TRUNCATED_PDF';
    const afterEof = tail.slice(eofIdx + 5).trim();
    if (afterEof.length > 32 && /<(?:!doctype|html|head|body|script|title|meta)/i.test(afterEof)) {
      return 'TRAILING_HTML';
    }
    return null;
  }
  if (ext === 'zip' || ext === 'docx') return (buf[0] === 0x50 && buf[1] === 0x4b) ? null : 'BAD_ZIP';
  if (ext === 'rar') return head.startsWith('Rar!') ? null : 'BAD_RAR';
  if (ext === 'mp3') return (buf.length >= 4096 && (head.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) ? null : 'BAD_MP3';
  if (ext === 'wav') return (head.startsWith('RIFF') && buf.slice(8, 12).toString('latin1') === 'WAVE') ? null : 'BAD_WAV';
  return null;
}

async function downloadBuffer(item) {
  const hdrs = { 'User-Agent': UA };
  if (item.cookie) hdrs.Cookie = item.cookie;
  const res = await fetch(item.url, { headers: hdrs, signal: AbortSignal.timeout(45000) });
  if (!res.ok) return { err: `HTTP_${res.status}` };
  let buf = Buffer.from(await res.arrayBuffer());
  if (item.url.includes('drive.google.com') && buf.length < 250000) {
    const txt = buf.toString('utf8');
    if (/download-form|uc-download-link|confirm=/i.test(txt)) {
      const action = txt.match(/action="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&') || 'https://drive.usercontent.google.com/download';
      const id = txt.match(/name="id"\s+value="([^"]+)"/i)?.[1] || item.id || '';
      const conf = txt.match(/name="confirm"\s+value="([^"]+)"/i)?.[1] || 't';
      const uuid = txt.match(/name="uuid"\s+value="([^"]+)"/i)?.[1] || '';
      const u2 = `${action}?id=${encodeURIComponent(id)}&export=download&confirm=${encodeURIComponent(conf)}${uuid ? `&uuid=${encodeURIComponent(uuid)}` : ''}`;
      const r2 = await fetch(u2, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(180000) });
      if (!r2.ok) return { err: `HTTP2_${r2.status}` };
      buf = Buffer.from(await r2.arrayBuffer());
    }
  }
  return { buf };
}

function downloadViaCurl(item, tmpPath) {
  execFileSync('curl.exe', ['-sL', '-A', UA, '--max-time', '600', '-o', tmpPath, item.url], { stdio: 'pipe' });
  let buf = fs.readFileSync(tmpPath);
  if (item.url.includes('drive.google.com') && buf.length < 250000) {
    const txt = buf.toString('utf8');
    if (/download-form|uc-download-link|confirm=/i.test(txt)) {
      const action = txt.match(/action="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&') || 'https://drive.usercontent.google.com/download';
      const id = txt.match(/name="id"\s+value="([^"]+)"/i)?.[1] || item.id || '';
      const conf = txt.match(/name="confirm"\s+value="([^"]+)"/i)?.[1] || 't';
      const uuid = txt.match(/name="uuid"\s+value="([^"]+)"/i)?.[1] || '';
      const u2 = `${action}?id=${encodeURIComponent(id)}&export=download&confirm=${encodeURIComponent(conf)}${uuid ? `&uuid=${encodeURIComponent(uuid)}` : ''}`;
      execFileSync('curl.exe', ['-sL', '-A', UA, '--max-time', '600', '-o', tmpPath, u2], { stdio: 'pipe' });
      buf = fs.readFileSync(tmpPath);
    }
  }
  return buf;
}

function findQpdfExecutable(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;
  try {
    const whichOut = execFileSync('where.exe', ['qpdf'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0];
    if (whichOut && fs.existsSync(whichOut)) return whichOut;
  } catch { /* qpdf not installed on PATH */ }
  return '';
}

function packLargePdf(qpdfExe, absPath, tmpPack) {
  if (!qpdfExe || !absPath.toLowerCase().endsWith('.pdf')) return;
  const st = fs.statSync(absPath);
  if (st.size < 5 * 1024 * 1024) return;
  const buf = fs.readFileSync(absPath);
  const isLinearized = buf.slice(0, 2048).includes('/Linearized');
  const hasObjStm = buf.includes('/ObjStm');
  if (isLinearized && hasObjStm) return;
  try {
    const pOld = execFileSync(qpdfExe, ['--show-npages', '--warning-exit-0', absPath], { encoding: 'utf8' }).trim();
    execFileSync(qpdfExe, ['--warning-exit-0', '--linearize', '--object-streams=generate', '--stream-data=compress', '--recompress-flate', absPath, tmpPack], { stdio: 'pipe' });
    const pNew = execFileSync(qpdfExe, ['--show-npages', tmpPack], { encoding: 'utf8' }).trim();
    const outBuf = fs.readFileSync(tmpPack);
    if (pOld === pNew && outBuf.slice(0, 2048).includes('/Linearized')) {
      fs.writeFileSync(absPath, outBuf);
    }
  } catch (err) {
    console.warn(`[qpdf] Skipped optimization for ${path.basename(absPath)}:`, err?.message || err);
  }
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  const crawlers = { bsr: crawlBsr, dp: crawlDynamicPapers, igexams: crawlIgExams, ssc: crawlSsc, pmt: crawlPmt, pl: crawlPaperlords };
  const raw = [];
  for (const s of opts.sources) {
    if (!crawlers[s]) { console.warn(`Unknown source ignored: ${s}`); continue; }
    raw.push(...(await crawlers[s](opts.sinceYear)));
  }

  const state = buildLibraryDedupState();
  const planned = planItems(raw, state, opts.sinceYear).slice(0, opts.limit);
  const bySubj = {};
  for (const p of planned) {
    const k = `${p.source} | ${p.spec} | ${p.subj}`;
    bySubj[k] = (bySubj[k] || 0) + 1;
  }

  console.log(`\n=== SYNC PLAN (${planned.length} new candidates across ${opts.sources.join(',')}) ===`);
  for (const [k, v] of Object.entries(bySubj).sort()) console.log(`  ${k}: ${v}`);
  if (opts.verbose && planned.length) {
    console.log('\nSample planned items:');
    for (const p of planned.slice(0, 25)) console.log(`  ${p.relDest}  <--  ${p.url}`);
  }

  if (!opts.apply) {
    console.log('\nDry-run mode complete. Re-run with --apply to download, optimize PDFs, and re-index.');
    return;
  }

  const { shaToPaths } = loadShaRegistry();
  const qpdfExe = opts.skipPack ? '' : findQpdfExecutable(opts.qpdfPath);
  const tmpFile = path.join(DATA_DIR, `sync_curl_${process.pid}.tmp`);
  const tmpPack = path.join(DATA_DIR, `sync_qpdf_${process.pid}.pdf`);
  const retryCurl = [];
  const failReasons = {};
  let saved = 0, skippedDup = 0, copiedShared = 0, failed = 0;

  const commitBuffer = (item, buf) => {
    const ext = item.relDest.split('.').pop().toLowerCase();
    const merr = validateMagic(buf, ext);
    if (merr) return { ok: false, reason: merr };
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const existingList = shaToPaths.get(sha);
    if (existingList?.length) {
      const sameSubj = existingList.some(fp => fp.toLowerCase().includes(`${path.sep}${item.subj.toLowerCase()}${path.sep}`));
      if (item.subj === 'Sciences (Double Award)' && !sameSubj) {
        fs.mkdirSync(path.dirname(item.absDest), { recursive: true });
        fs.copyFileSync(existingList[0], item.absDest);
        existingList.push(item.absDest);
        copiedShared++;
        return { ok: true };
      }
      skippedDup++;
      return { ok: true };
    }
    fs.mkdirSync(path.dirname(item.absDest), { recursive: true });
    fs.writeFileSync(item.absDest, buf);
    shaToPaths.set(sha, [item.absDest]);
    if (qpdfExe) packLargePdf(qpdfExe, item.absDest, tmpPack);
    saved++;
    return { ok: true };
  };

  let cursor = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (cursor < planned.length) {
      const item = planned[cursor++];
      const sourcesToTry = [item, ...(item.fallbacks || []).map(fb => ({ ...item, ...fb }))];
      let done = false;
      let lastReason = 'FETCH_ERR';
      for (const candidate of sourcesToTry) {
        try {
          const res = await downloadBuffer(candidate);
          if (res.buf) {
            const c = commitBuffer(item, res.buf);
            if (c.ok) { done = true; break; }
            lastReason = c.reason;
          } else {
            lastReason = res.err || 'EMPTY';
          }
        } catch {
          lastReason = 'FETCH_TIMEOUT';
        }
      }
      if (!done) retryCurl.push({ item, lastReason });
    }
  }));

  for (const { item, lastReason } of retryCurl) {
    let reason = lastReason;
    let done = false;
    const sourcesToTry = [item, ...(item.fallbacks || []).map(fb => ({ ...item, ...fb }))];
    for (const candidate of sourcesToTry) {
      try {
        const buf = downloadViaCurl(candidate, tmpFile);
        const c = commitBuffer(item, buf);
        if (c.ok) { done = true; break; }
        reason = c.reason;
      } catch {
        reason = 'CURL_ERR';
      }
    }
    if (!done) {
      failed++;
      failReasons[reason] = (failReasons[reason] || 0) + 1;
    }
  }
  for (const f of [tmpFile, tmpPack]) if (fs.existsSync(f)) fs.unlinkSync(f);

  const reasonStr = Object.keys(failReasons).length ? ` | reasons=${JSON.stringify(failReasons)}` : '';
  console.log(`\n=== SYNC RESULT === saved=${saved}, copiedSharedDA=${copiedShared}, skippedDup=${skippedDup}, failed=${failed}${reasonStr}`);
  if (!opts.skipIndex && (saved > 0 || copiedShared > 0)) {
    console.log('Running generate-index.js...');
    execFileSync(process.execPath, [path.join(__dirname, 'generate-index.js')], { stdio: 'inherit' });
  }
}

run().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
