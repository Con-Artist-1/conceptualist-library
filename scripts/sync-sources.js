/**
 * Unified Multi-Source Past Paper Sync Utility for Conceptualist Systems Library
 *
 * Crawls Edexcel International (IAL & IGCSE) and Cambridge International (CIE-AL, CIE-IGCSE, CIE-OL)
 * paper sources, enforces strict international-only filtering (zero UK domestic GCE/GCSE leakage),
 * deduplicates against public/index.json / public/index-cambridge.json & .data/library_sha_cache.json,
 * downloads missing files cleanly (with Google Drive bypass + curl.exe large-file streaming),
 * packs >= 5 MB PDFs lacking /ObjStm via qpdf (when installed), and runs generate-index.js.
 *
 * Usage:
 *   sync-sources.js [--board=edexcel|cambridge] [--apply] [--sources=...] [--syllabuses=0625,9709,...]
 *                   [--since=2025] [--qpdf=<path-to-qpdf.exe>] [--skip-pack] [--skip-index] [--limit=N]
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
import {
  parseCambridgePath,
  detectCambridgeDocType
} from '../src/parsers/cambridgeParser.js';
import {
  resolveCambridgeSyllabus,
  formatCambridgeSubjectName
} from '../src/data/cambridgeCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const LIBRARY_ROOT = path.resolve(APP_DIR, '..');
const PAST_PAPERS = path.join(LIBRARY_ROOT, 'Past Papers');
const DATA_DIR = path.join(APP_DIR, '.data');
const SHA_CACHE_PATH = path.join(DATA_DIR, 'library_sha_cache.json');
const INDEX_PATH = path.join(APP_DIR, 'public', 'index.json');
const CAMBRIDGE_INDEX_PATH = path.join(APP_DIR, 'public', 'index-cambridge.json');

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
    board: 'edexcel',
    apply: false,
    verbose: false,
    sources: null,
    syllabuses: null,
    sinceYear: 0,
    qpdfPath: '',
    dumpJson: '',
    fromJson: '',
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
    else if (arg.startsWith('--board=')) opts.board = arg.slice(8).trim().toLowerCase() || 'edexcel';
    else if (arg.startsWith('--sources=')) opts.sources = arg.slice(10).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    else if (arg.startsWith('--syllabuses=') || arg.startsWith('--syllabus=')) {
      const rawArg = arg.slice(arg.indexOf('=') + 1);
      const codes = rawArg.split(',').map(s => s.trim()).filter(Boolean);
      const resolved = new Set();
      for (const c of codes) {
        const entry = resolveCambridgeSyllabus(c);
        resolved.add(entry ? entry.code : c);
      }
      if (resolved.size) opts.syllabuses = resolved;
    }
    else if (arg.startsWith('--since=')) opts.sinceYear = Number(arg.slice(8)) || 0;
    else if (arg.startsWith('--qpdf=')) opts.qpdfPath = arg.slice(7);
    else if (arg.startsWith('--dump-json=')) opts.dumpJson = arg.slice(12).trim();
    else if (arg.startsWith('--from-json=')) opts.fromJson = arg.slice(12).trim();
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice(8)) || Infinity;
  }
  if (!opts.sources) {
    opts.sources = opts.board === 'cambridge'
      ? ['beh', 'elevare', 'bsr', 'pmt', 'almr', 'cie', 'papa']
      : ['bsr', 'dp', 'igexams', 'ssc', 'pmt', 'pl', 'elevare', 'beh', 'almr'];
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
    .replace(/(\.[a-z0-9]{2,5})\1$/i, '$1')
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
      if (/^ER[2-9]\d*$/i.test(v)) {
        looseKeys.add(`${f.spec}|${f.subject}|ANY_ER||R|${sk}|ER`);
      }
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
  if (subj === 'Math' && /(?:^|[^a-z0-9])c[1-4](?:[^0-9a-z]|$)/i.test(low) && !/c12|c34|wma/i.test(low)) return false;
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
  if (spec === 'IGCSE' && cleaned.includes('further pure')) return 'Further Pure Mathematics';
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
          const skipRe = node.allowGt
            ? /textbook|solution[-_\s]*bank|syllabus|spec(?:ification|imen)?\b/i
            : /textbook|solution[-_\s]*bank|grade[-_\s]*(?:bound|thresh|charact)|syllabus|spec(?:ification)?\b/i;
          if (skipRe.test(ent.name)) continue;
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
  const cards = [];
  for (const m of html.matchAll(/<div class="subject-card"([^>]*)>/gi)) {
    const attrs = m[1];
    const level = attrs.match(/data-level="([^"]*)"/)?.[1] || '';
    if (level !== 'IAL' && level !== 'IGCSE') continue;
    const title = decodeHtml(attrs.match(/data-title="([^"]*)"/)?.[1] || '');
    const slice = html.slice(m.index, m.index + 1400);
    const driveUrl = slice.match(/openAuthModal\('(https:\/\/drive\.google\.com\/[^']+)'\)/)?.[1] || '';
    const subHref = slice.match(/href=["'](\/past-papers\/[^"']+)["']/)?.[1] || '';
    cards.push({ spec: level, title, driveUrl, subHref });
  }
  const roots = [];
  const seenDrive = new Set();
  for (let i = 0; i < cards.length; i += 8) {
    await Promise.all(cards.slice(i, i + 8).map(async (c) => {
      let dUrl = c.driveUrl;
      if (!dUrl && c.subHref) {
        try {
          const subHtml = await fetch(`https://britishstudentroom.com${c.subHref}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
          dUrl = subHtml.match(/openAuthModal\('(https:\/\/drive\.google\.com\/[^']+)'\)/)?.[1] || '';
        } catch { /* ignore */ }
      }
      if (dUrl && !seenDrive.has(dUrl)) {
        seenDrive.add(dUrl);
        roots.push({ source: 'BSR', spec: c.spec, title: c.title, driveUrl: dUrl });
      }
    }));
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

const PMT_EDEXCEL_HUBS = [
  'https://www.physicsandmathstutor.com/a-level-maths-papers/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-maths/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-physics/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-physics/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-chemistry/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-chemistry/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-biology/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-biology/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-economics/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-economics/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-computer-science/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-computer-science/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-geography/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-geography/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-psychology/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-english-language/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-english-language/',
  'https://www.physicsandmathstutor.com/past-papers/a-level-english-literature/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-english-literature/',
  'https://www.physicsandmathstutor.com/past-papers/gcse-history/'
];

async function crawlPmt() {
  console.log('[PMT] Scanning Physics & Maths Tutor Edexcel IAL/IGCSE indexes...');
  const sections = PMT_EDEXCEL_HUBS;

  const subUrls = new Set();
  let pmtErrors = 0;
  for (const sUrl of sections) {
    try {
      const html = await fetch(sUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
      for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
        const u = normalizeHttpUrl(m[1], sUrl);
        if (!u || !u.includes('physicsandmathstutor.com')) continue;
        const low = u.toLowerCase();
        if (
          (low.includes('edexcel') && (low.includes('ial') || low.includes('igcse') || low.includes('international') || /\/edexcel-unit-[1-6]\/?$/.test(low))) ||
          (sUrl.includes('a-level-maths-papers') && /\/(?:c1|c2|c3|c4|c12|c34|p1|p2|p3|p4|m1|m2|m3|s1|s2|s3|fp1|fp2|fp3|d1)-(?:edexcel(?:-ial)?|papers)\/?$/i.test(low))
        ) {
          subUrls.add(u);
        }
      }
    } catch { pmtErrors++; }
  }

  const out = [];
  const list = [...subUrls];
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(list.slice(i, i + 4).map(async (u) => {
      try {
        let html = '';
        for (let attempt = 1; attempt <= 3; attempt++) {
          const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
          if (r.ok) {
            html = await r.text();
            break;
          }
          await new Promise(res => setTimeout(res, 1200 * attempt));
        }
        if (!html) { pmtErrors++; return; }
        const isGcseHub = /\/gcse-|igcse/i.test(u);
        const spec = isGcseHub ? 'IGCSE' : 'IAL';
        const urlParts = u.split('/').filter(Boolean);
        const hubSlug = urlParts[urlParts.length - 2] || '';
        const leafSlug = urlParts[urlParts.length - 1] || '';
        const baseTitle = u.includes('maths-papers') ? 'Math' : hubSlug.replace(/^(?:a-level|gcse)-/i, '').replace(/-past-papers$/i, '');
        for (const m of html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)) {
          const pdfUrl = normalizeHttpUrl(m[1], u);
          if (!pdfUrl) continue;
          const decodedUrl = decodeURIComponent(pdfUrl);
          if (spec === 'IAL' && !/edexcel-ial|international|\(ial\)/i.test(decodedUrl)) continue;
          if (spec === 'IGCSE' && !/edexcel-igcse|international|\(igcse\)|\/igcse\//i.test(decodedUrl) && !/edexcel-igcse/i.test(u)) continue;
          let title = baseTitle;
          if (spec === 'IGCSE') {
            if (/math/i.test(title)) {
              if (/edexcel-igcse-further|spec-4pm/i.test(decodedUrl)) title = 'Further Pure Mathematics';
              else if (/edexcel-igcse-b|spec-4mb/i.test(decodedUrl)) title = 'Mathematics B';
              else title = 'Mathematics A';
            } else if (/english[-_\s]*language/i.test(title)) {
              title = /edexcel-igcse-b|spec-4eb/i.test(decodedUrl) ? 'English Language B' : 'English Language A';
            }
          }
          const rawName = decodedUrl.split('?')[0].split('/').pop() || '';
          let unitHint = leafSlug.replace(/^edexcel-/i, '').replace(/-edexcel.*$/i, '').replace(/-/g, ' ');
          if (spec === 'IAL' && title === 'Math') {
            const mm = decodedUrl.match(/\/Edexcel-IAL\/(?:[^/]+\/)?(P[1-4]|C12|C34|M[1-3]|S[1-3]|FP[1-3]|D1)\//i);
            if (!mm) continue;
            unitHint = mm[1].toUpperCase();
          } else if (spec === 'IAL' && title !== 'Math') {
            const um = decodedUrl.match(/(?:Unit|New-Spec-Paper|Paper)[-_ ]*([1-6])\b/i) || unitHint.match(/(?:unit|paper)\s*([1-6])\b/i);
            if (um) unitHint = `Unit ${um[1]}`;
          } else if (spec === 'IGCSE') {
            const pm = decodedUrl.match(/\/Paper[-_ ]*([1-4][FH]?)\//i);
            if (pm) {
              const pCode = pm[1].toUpperCase();
              const isReg = /\(R\)|\bR\b/i.test(rawName);
              unitHint = `Paper ${pCode}${isReg && /[FH]$/.test(pCode) ? 'R' : ''}`;
            }
          }
          const hasExplicitUnitInName = /\b(?:Paper|Unit)[-_ ]*[1-6][A-Z]?\b/i.test(rawName);
          out.push({
            source: 'PMT',
            spec,
            title,
            folderPath: unitHint,
            name: hasExplicitUnitInName ? `${title} - ${rawName}` : `${title} - ${unitHint} - ${rawName}`,
            url: pdfUrl
          });
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

// Safely parses a JS object literal (double-quoted strings + unquoted identifier keys) into JSON without eval/vm.
function parseJsObjectLiteral(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let inStr = false;
  let esc = false;
  while (i < n) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      i++;
      continue;
    }
    // Quote unquoted object keys after '{' or ','
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === ':') {
        out += `"${word}"`;
        i = j;
        continue;
      }
      out += word;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return JSON.parse(out);
}

function extractAssignedObjectLiteral(code, marker) {
  const idx = code.indexOf(marker);
  if (idx === -1) return null;
  const start = code.indexOf('{', idx + marker.length);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return parseJsObjectLiteral(code.slice(start, i + 1));
    }
  }
  return null;
}

function normalizeElevarePaperTag(spec, paperLabel = '') {
  let tag = String(paperLabel || '').trim();
  if (!tag) return '';
  // Normalize parenthesized variants like "Unit 1 (R)" -> "U1R", "Paper 1 (HR)" -> "Paper 1HR", "D1 (A)" -> "D1A"
  tag = tag
    .replace(/\bUnit\s+([1-6])\s*\(([A-Za-z]+)\)/gi, 'U$1$2')
    .replace(/\bUnit\s+([1-6])\b/gi, spec === 'IGCSE' ? 'Unit $1 Modular' : 'U$1')
    .replace(/\bPaper\s+([1-4])\s*\(([A-Za-z]+)\)/gi, 'Paper $1$2')
    .replace(/\b(P[1-4]|C12|C34|C[1-4]|M[1-3]|S[1-3]|FP[1-3]|D1)\s*\(([A-Za-z]+)\)/gi, '$1$2')
    .replace(/\s+/g, '_');
  return tag;
}

async function crawlElevare(sinceYear) {
  console.log('[Elevare] Fetching https://elevareisonline.com/papers ...');
  const baseUrl = 'https://elevareisonline.com/';
  let pastPapersUrl = `${baseUrl}past-papers.js`;
  let workspaceUrl = `${baseUrl}papers-workspace.js`;
  try {
    const html = await fetch(`${baseUrl}papers`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
    const ppMatch = html.match(/src=["']([^"']*past-papers\.js[^"']*)["']/i);
    if (ppMatch) pastPapersUrl = normalizeHttpUrl(ppMatch[1], `${baseUrl}papers`) || pastPapersUrl;
    const wsMatch = html.match(/src=["']([^"']*papers-workspace\.js[^"']*)["']/i);
    if (wsMatch) workspaceUrl = normalizeHttpUrl(wsMatch[1], `${baseUrl}papers`) || workspaceUrl;
  } catch (err) {
    console.warn('[Elevare] /papers discovery failed, using default asset paths:', err?.message || err);
  }

  // 1. Discover Edexcel IAL & IGCSE Google Drive roots from past-papers.js (strictly excluding Cambridge)
  const driveRoots = [];
  try {
    const ppCode = await fetch(pastPapersUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
    const ppObj = extractAssignedObjectLiteral(ppCode, 'var s=');
    const edexcel = ppObj?.Edexcel || {};
    for (const spec of ['IAL', 'IGCSE']) {
      for (const [title, driveUrl] of Object.entries(edexcel[spec] || {})) {
        if (typeof driveUrl === 'string' && driveUrl.includes('drive.google.com')) {
          driveRoots.push({ source: 'Elevare', spec, title, driveUrl });
        }
      }
    }
  } catch (err) {
    console.warn('[Elevare] past-papers.js parse skipped:', err?.message || err);
  }

  console.log(`[Elevare] Found ${driveRoots.length} Edexcel IAL/IGCSE Drive roots; crawling folders...`);
  const driveFiles = await crawlDriveTree(driveRoots, sinceYear);
  // Prefer canonical Edexcel_* filenames before short duplicates within the same Drive folder
  driveFiles.sort((a, b) => {
    const aEd = /^Edexcel_/i.test(a.name) ? 0 : 1;
    const bEd = /^Edexcel_/i.test(b.name) ? 0 : 1;
    return aEd - bEd || a.name.localeCompare(b.name);
  });

  const seenDriveIds = new Set(driveFiles.map(f => f.id).filter(Boolean));

  // 2. Supplement from curated edexcel_ial.js & edexcel_igcse.js catalogs for any Drive IDs missed by folder walk
  const catalogTargets = [
    { spec: 'IAL', file: 'edexcel_ial.js', marker: 'window.EDEXCEL_IAL_PAPERS=' },
    { spec: 'IGCSE', file: 'edexcel_igcse.js', marker: 'window.EDEXCEL_IGCSE_PAPERS=' }
  ];
  try {
    const wsCode = await fetch(workspaceUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => r.text());
    const catMatch = wsCode.match(/catalogFiles\s*=\s*\{[\s\S]{0,300}Edexcel\s*:\s*\{([^}]+)\}/);
    if (catMatch) {
      const ialF = catMatch[1].match(/IAL\s*:\s*["']([^"']+)["']/)?.[1];
      const igF = catMatch[1].match(/IGCSE\s*:\s*["']([^"']+)["']/)?.[1];
      if (ialF) catalogTargets[0].file = ialF;
      if (igF) catalogTargets[1].file = igF;
    }
  } catch { /* fallback to default catalog filenames */ }

  const curatedExtras = [];
  for (const target of catalogTargets) {
    try {
      const code = await fetch(`${baseUrl}${target.file}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) }).then(r => r.text());
      const catalog = extractAssignedObjectLiteral(code, target.marker);
      if (!catalog) continue;
      for (const subjEntry of Object.values(catalog)) {
        if (subjEntry?.board && !/^edexcel$/i.test(subjEntry.board)) continue;
        const spec = /^igcse$/i.test(subjEntry?.level || '') ? 'IGCSE' : target.spec;
        const title = subjEntry?.subject || '';
        for (const sess of (subjEntry?.sessions || [])) {
          const yr = Number(sess?.year || 0);
          if (sinceYear && yr && yr < sinceYear) continue;
          const sessLabel = sess?.session_title || `${sess?.year || ''} ${sess?.season || ''}`.trim();
          for (const p of (sess?.papers || [])) {
            const pLabel = String(p?.paper || '').trim();
            if (/grade\s*thresh|grade\s*bound|syllabus|spec/i.test(pLabel)) continue;
            const paperTag = normalizeElevarePaperTag(spec, pLabel);
            const cleanSubj = title.replace(/\s+/g, '_');
            const cleanSess = sessLabel.replace(/\s*\/\s*/g, '-').replace(/\s+/g, '_');
            const emit = (id, dtTag, explicitName = '') => {
              if (!id || seenDriveIds.has(id)) return;
              seenDriveIds.add(id);
              const fileName = explicitName || `Edexcel_${spec}_${cleanSubj}_${cleanSess}_${paperTag}_${dtTag}.pdf`;
              curatedExtras.push({
                source: 'Elevare',
                spec,
                title,
                folderPath: sessLabel,
                id,
                name: fileName,
                url: `https://drive.google.com/uc?export=download&id=${id}`
              });
            };
            emit(p?.qp, 'QP');
            emit(p?.ms, 'MS');
            emit(p?.er, 'ER');
            if (p?.zip) {
              const zName = p.zip_name || `Edexcel_${spec}_${cleanSubj}_${cleanSess}_${paperTag}_DATA.zip`;
              emit(p.zip, 'DF', zName);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[Elevare] ${target.file} parse skipped:`, err?.message || err);
    }
  }

  console.log(`[Elevare] Collected ${driveFiles.length} Drive files + ${curatedExtras.length} curated-only files.`);
  return [...driveFiles, ...curatedExtras];
}

async function crawlBehEdexcel(sinceYear) {
  console.log('[BEH-Edexcel] Scanning BestExamHelp Edexcel International IGCSE & IAL indexes...');
  const base = 'https://bestexamhelp.com/exam';
  const levels = [
    { spec: 'IGCSE', slug: 'edexcel-international-gcse' },
    { spec: 'IAL', slug: 'edexcel-international-a-level' }
  ];
  const subjects = [];
  for (const lvl of levels) {
    try {
      const html = await fetch(`${base}/${lvl.slug}/index.php`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
      const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
      for (const m of cleanHtml.matchAll(/href=["']([a-z0-9-]+)\/index\.php["'][^>]*>([^<]+)<\/a>/gi)) {
        subjects.push({ spec: lvl.spec, levelSlug: lvl.slug, subSlug: m[1], title: decodeHtml(m[2]) });
      }
    } catch { /* ignore */ }
  }
  const sessionPages = [];
  for (const sub of subjects) {
    try {
      const html = await fetch(`${base}/${sub.levelSlug}/${sub.subSlug}/index.php`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
      for (const m of html.matchAll(/href=["']((20\d{2})\/(january|march|summer|winter)\.php)["']/gi)) {
        const yr = Number(m[2]);
        if (sinceYear && yr < sinceYear) continue;
        sessionPages.push({
          ...sub,
          year: yr,
          season: m[3].toLowerCase(),
          sessionUrl: `${base}/${sub.levelSlug}/${sub.subSlug}/${m[1]}`,
          yearBaseUrl: `${base}/${sub.levelSlug}/${sub.subSlug}/${yr}`
        });
      }
    } catch { /* ignore */ }
  }
  const out = [];
  for (let i = 0; i < sessionPages.length; i += 6) {
    await Promise.all(sessionPages.slice(i, i + 6).map(async (sp) => {
      try {
        const html = await fetch(sp.sessionUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
        const monFolder = sp.season === 'summer' ? 'June' : (sp.season === 'winter' ? 'January' : 'January');
        for (const m of html.matchAll(/href=["']([a-z0-9]{4,6})-(m|s|w)(\d{2})-(qp|ms|er)(?:-([a-z0-9]+))?\.php["']/gi)) {
          const pdfName = `${m[1].toLowerCase()}_${m[2].toLowerCase()}${m[3]}_${m[4].toLowerCase()}${m[5] ? `_${m[5].toLowerCase()}` : ''}.pdf`;
          out.push({
            source: 'BEH-Edexcel',
            spec: sp.spec,
            title: sp.title,
            folderPath: `${sp.year} ${monFolder}`,
            name: pdfName,
            url: `${sp.yearBaseUrl}/${pdfName}`
          });
        }
      } catch { /* ignore */ }
    }));
  }
  console.log(`[BEH-Edexcel] Collected ${out.length} files across ${subjects.length} active subjects.`);
  return out;
}

async function crawlAlmrEdexcel(sinceYear) {
  console.log('[ALMR-Edexcel] Scanning ALevelMathsRevision Edexcel IAL Mathematics papers...');
  const url = 'https://alevelmathsrevision.com/edexcel-ial-past-papers/';
  let html = '';
  try {
    html = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => (r.ok ? r.text() : ''));
  } catch {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(/\/pdf\/ial-exampapers\/edexcel\/((jan|jun|oct|nov)-(20\d{2})(r)?(-unused)?)\/([a-z0-9]+)\/\?type=(q|ms)\b/gi)) {
    const seriesRaw = m[1].toLowerCase();
    const monRaw = m[2].toLowerCase();
    const yr = Number(m[3]);
    const isR = Boolean(m[4]);
    const isUnused = Boolean(m[5]);
    const paperRaw = m[6].toLowerCase();
    const typeRaw = m[7].toLowerCase();
    if (isUnused) continue;
    if (sinceYear && yr < sinceYear) continue;
    const key = `${seriesRaw}|${paperRaw}|${typeRaw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const monCap = monRaw === 'jan' ? 'Jan' : (monRaw === 'jun' ? 'Jun' : 'Oct');
    const dt = typeRaw === 'ms' ? 'MS' : 'QP';
    const fileUrl = `https://alevelmathsrevision.com/downloads/past-papers/edexcel-ial/${paperRaw}-${seriesRaw}${typeRaw === 'ms' ? '-ms' : ''}.pdf`;
    const fileName = `Math_${paperRaw.toUpperCase()}_${yr}-${monCap}${isR ? '_R' : ''}_${dt}.pdf`;
    out.push({
      source: 'ALMR-Edexcel',
      spec: 'IAL',
      title: 'Math',
      folderPath: `${yr} ${monCap}`,
      name: fileName,
      url: fileUrl
    });
  }
  console.log(`[ALMR-Edexcel] Collected ${out.length} direct Edexcel IAL Math PDFs.`);
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

    if (/grade[-_\s]?bound|grade[-_\s]?thresh|grade[-_\s]?charact|syllabus|spec(?:ification)?\b|formula|timetabl|coursework|teacher[-_\s]*guide|revision|\bnotes?\b|toaz\.info|4IT1_02_DATA_FILES_2311\/|(?:^|[^a-z0-9])(?:aqa|ocr|cie|cambridge|wjec|eduqas)(?:[^a-z0-9]|$)/i.test(fullPath)) {
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
    if (!dt && (ext === 'zip' || ext === 'rar') && /(?:^|[^a-z0-9])data(?:[^a-z0-9]|$)/i.test(fullPath)) dt = 'DF';
    if (!dt && (/^(?:4\d{4}|W4\d{4}|53\d{3})/.test(name) || /IAL_Geography WGE\d{2}/i.test(name))) dt = 'QP';
    if (!dt || dt === 'SAM') continue;

    const [yrStr, moCode] = sessKey.split('-');
    const moFolder = MONTH_FOLDER[moCode] || moCode;
    const subFolder = SUBDIR_FOR_DT[dt] || 'Other';
    const probePath = `Past Papers/${item.spec}/${subj}/${yrStr}/${moFolder}/${subFolder}/${fullPath.replace(/\//g, '_')}_${name}`;
    let u = extractUnitInfo(probePath, subj, item.spec).unitCode;
    if (item.spec === 'IAL' && subj === 'Law' && /yla1[-_\s]*02/i.test(fullPath)) u = 'YLA2';
    if (item.spec === 'IAL' && !u) {
      const glued = name.match(/(W[A-Z]{2}\d{2})/i);
      if (glued) u = glued[1].toUpperCase();
    }
    if (item.spec === 'IGCSE' && !u) {
      const mFallback = name.match(/(?:^|[^A-Z0-9])(?:(?:Mark[-_\s]*Scheme|Question[-_\s]*Paper)[-_\s]+0?([1-4])[A-Z]*|([1-4])(?:[FBCPH]R?|R[FH])|Paper[-_\s]*([1-4])R[FH]|4[A-Z]{2}[01I][-_\s]*0?([1-4])[A-Z]*)(?:[^A-Z0-9]|$)/i);
      if (mFallback) u = `P${mFallback[1] || mFallback[2] || mFallback[3] || mFallback[4]}`;
    }
    let v = extractVariant({ path: probePath, name, subject: subj, spec: item.spec });
    if (item.spec === 'IGCSE' && !v) {
      if (/(?:^|[^A-Z0-9])(?:Paper[-_\s]*)?[12]RF(?:[^A-Z0-9]|$)/i.test(name)) v = 'F-R';
      else if (/(?:^|[^A-Z0-9])(?:Paper[-_\s]*)?[1-4]RH(?:[^A-Z0-9]|$)/i.test(name)) v = 'H-R';
      else if (/(?:^|[^A-Z0-9])(?:Mark[-_\s]*Scheme|Question[-_\s]*Paper)[-_\s]+[1-4][BCP]?R(?:[^A-Z0-9]|$)/i.test(name)) v = 'R';
    }

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
      u,
      v,
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

// ─── Cambridge International (CAIE) Multi-Source Crawlers & Planner ──────────

const CIE_LEVEL_FOLDER = {
  'CIE-AL': 'A-Level',
  'CIE-IGCSE': 'IGCSE',
  'CIE-OL': 'O-Level'
};

const CIE_SERIES_FOLDER = {
  m: 'Feb-March',
  s: 'May-June',
  w: 'Oct-Nov'
};

const PAPA_CAMBRIDGE_SLUGS = {
  '9709': 'as-and-a-level-mathematics-9709',
  '9702': 'as-and-a-level-physics-9702',
  '9701': 'as-and-a-level-chemistry-9701',
  '9700': 'as-and-a-level-biology-9700',
  '9618': 'as-and-a-level-computer-science-for-first-examination-in-2021-9618',
  '9708': 'as-and-a-level-economics-9708',
  '0625': 'igcse-physics-0625',
  '0620': 'igcse-chemistry-0620',
  '0610': 'igcse-biology-0610',
  '0580': 'igcse-mathematics-0580',
  '0500': 'igcse-english-first-language-0500',
  '0510': 'igcse-english-as-a-second-language-speaking-endorsement-0510',
  '0478': 'igcse-computer-science-0478',
  '0417': 'igcse-information-and-communication-technology-0417',
  '4024': 'o-level-mathematics-d-4024',
  '5054': 'o-level-physics-5054',
  '5070': 'o-level-chemistry-5070',
  '5090': 'o-level-biology-5090',
  '1123': 'o-level-english-language-1123',
  '2058': 'o-level-islamiyat-2058',
  '2059': 'o-level-pakistan-studies-2059',
  '7094': 'o-level-bangladesh-studies-7094',
  '2210': 'o-level-computer-science-2210',
  '2281': 'o-level-economics-2281',
  '7707': 'o-level-accounting-7707'
};

function extractResolvedCambridgeCodes(text = '') {
  const found = [];
  const seen = new Set();
  for (const m of String(text || '').matchAll(/\b(\d{4})\b/g)) {
    const entry = resolveCambridgeSyllabus(m[1]);
    if (entry && !seen.has(entry.code)) {
      seen.add(entry.code);
      found.push(entry);
    }
  }
  return found;
}

function matchesSyllabusFilter(textOrCode, syllabusFilter) {
  if (!syllabusFilter || syllabusFilter.size === 0) return true;
  const direct = resolveCambridgeSyllabus(String(textOrCode || '').trim());
  if (direct && syllabusFilter.has(direct.code)) return true;
  const found = extractResolvedCambridgeCodes(textOrCode);
  return found.some(e => syllabusFilter.has(e.code));
}

function buildCambridgeDedupState() {
  const exactKeys = new Set();
  const usedPaths = new Set();
  if (!fs.existsSync(CAMBRIDGE_INDEX_PATH)) return { exactKeys, usedPaths };
  const idx = JSON.parse(fs.readFileSync(CAMBRIDGE_INDEX_PATH, 'utf8'));
  const keys = idx.keys || [];
  const rows = (idx.files || []).map(r => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
  for (const f of rows) {
    if (f.path) usedPaths.add(f.path.replace(/\\/g, '/').toLowerCase());
    if (f.category !== 'Past Papers') continue;
    const parsed = parseCambridgePath(f.path || '', f.name || '');
    const sylCode = parsed.syllabusCode || f.syllabusCode || '';
    const yr = parsed.year || f.year || '';
    const ser = parsed.seriesChar || '';
    const dt = (f.docType || detectCambridgeDocType(f.name || '', f.path || '') || '').toUpperCase();
    const rawDoc = parsed.rawDocCode || dt.toLowerCase();
    const comp = parsed.componentCode || '';
    if (sylCode && yr && ser && dt) {
      exactKeys.add(`${f.spec}|${sylCode}|${yr}-${ser}|${dt}|${rawDoc}|${comp}`);
    }
  }
  return { exactKeys, usedPaths };
}

async function crawlBehCambridge(sinceYear, syllabusFilter) {
  console.log('[BEH-CIE] Scanning BestExamHelp Cambridge A-Level, IGCSE & O-Level indexes...');
  const base = 'https://bestexamhelp.com/exam';
  const levels = [
    { spec: 'CIE-AL', slug: 'cambridge-international-a-level' },
    { spec: 'CIE-IGCSE', slug: 'cambridge-igcse' },
    { spec: 'CIE-IGCSE', slug: 'cambridge-igcse-9-1' },
    { spec: 'CIE-OL', slug: 'cambridge-o-level' }
  ];

  const subjects = new Map();
  let errors = 0;
  for (const lvl of levels) {
    try {
      const html = await fetch(`${base}/${lvl.slug}/index.php`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(25000)
      }).then(r => (r.ok ? r.text() : ''));
      for (const m of html.matchAll(/href=["']([^"'/?#]*-(\d{4}))\/[^"']*["']/gi)) {
        const subSlug = m[1];
        const rawCode = m[2];
        const entry = resolveCambridgeSyllabus(rawCode);
        if (!entry) continue;
        if (syllabusFilter && syllabusFilter.size && !syllabusFilter.has(entry.code)) continue;
        const key = `${lvl.slug}/${subSlug}`;
        if (!subjects.has(key)) {
          subjects.set(key, { spec: entry.spec, levelSlug: lvl.slug, subSlug, code: entry.code, title: `${entry.name} (${entry.code})` });
        }
      }
    } catch { errors++; }
  }

  const sessionPages = [];
  const subjList = [...subjects.values()];
  for (let i = 0; i < subjList.length; i += 6) {
    await Promise.all(subjList.slice(i, i + 6).map(async (sub) => {
      try {
        const url = `${base}/${sub.levelSlug}/${sub.subSlug}/index.php`;
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
        if (!res.ok) return;
        const html = await res.text();
        const seenSess = new Set();
        for (const m of html.matchAll(/href=["']((20\d{2})\/(march|summer|winter)\.php)["']/gi)) {
          const yr = Number(m[2]);
          if (sinceYear && yr < sinceYear) continue;
          const rel = m[1];
          if (seenSess.has(rel)) continue;
          seenSess.add(rel);
          sessionPages.push({
            ...sub,
            year: yr,
            sessionUrl: `${base}/${sub.levelSlug}/${sub.subSlug}/${rel}`,
            yearBaseUrl: `${base}/${sub.levelSlug}/${sub.subSlug}/${yr}`
          });
        }
      } catch { errors++; }
    }));
  }

  const out = [];
  for (let i = 0; i < sessionPages.length; i += 8) {
    await Promise.all(sessionPages.slice(i, i + 8).map(async (sp) => {
      try {
        const res = await fetch(sp.sessionUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
        if (!res.ok) return;
        const html = await res.text();
        const seenFiles = new Set();
        // Wrapper pages like 0625-s24-qp-42.php -> direct 0625_s24_qp_42.pdf
        for (const m of html.matchAll(/href=["'](\d{4})-(m|s|w)(\d{2})-([a-z]{2,4})(?:-(\d{1,2}))?\.php["']/gi)) {
          const pdfName = `${m[1]}_${m[2].toLowerCase()}${m[3]}_${m[4].toLowerCase()}${m[5] ? `_${m[5]}` : ''}.pdf`;
          if (seenFiles.has(pdfName)) continue;
          seenFiles.add(pdfName);
          out.push({
            source: 'BEH-CIE',
            spec: sp.spec,
            title: sp.title,
            folderPath: `${sp.year}`,
            name: pdfName,
            url: `${sp.yearBaseUrl}/${pdfName}`,
            fallbackUrl: `https://pastpapers.papacambridge.com/directories/CAIE/CAIE-pastpapers/upload/${pdfName}`
          });
        }
        // Direct PDF / ZIP / MP3 links if present on the session page
        for (const m of html.matchAll(/href=["']([^"']+\.(?:pdf|zip|mp3))["']/gi)) {
          const fileUrl = normalizeHttpUrl(m[1], sp.sessionUrl);
          if (!fileUrl) continue;
          const fileName = decodeURIComponent(fileUrl.split('?')[0].split('/').pop() || '');
          if (!fileName || seenFiles.has(fileName.toLowerCase())) continue;
          seenFiles.add(fileName.toLowerCase());
          out.push({
            source: 'BEH-CIE',
            spec: sp.spec,
            title: sp.title,
            folderPath: `${sp.year}`,
            name: fileName,
            url: fileUrl
          });
        }
      } catch { errors++; }
    }));
  }

  console.log(`[BEH-CIE] Collected ${out.length} files across ${subjList.length} subjects (${sessionPages.length} sessions${errors ? `, ${errors} errors` : ''}).`);
  return out;
}

async function crawlElevareCambridge(sinceYear, syllabusFilter) {
  console.log('[Elevare-CIE] Fetching Cambridge Drive roots & curated catalogs...');
  const baseUrl = 'https://elevareisonline.com/';
  let pastPapersUrl = `${baseUrl}past-papers.js`;
  let workspaceUrl = `${baseUrl}papers-workspace.js`;
  try {
    const html = await fetch(`${baseUrl}papers`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => r.text());
    const ppMatch = html.match(/src=["']([^"']*past-papers\.js[^"']*)["']/i);
    if (ppMatch) pastPapersUrl = normalizeHttpUrl(ppMatch[1], `${baseUrl}papers`) || pastPapersUrl;
    const wsMatch = html.match(/src=["']([^"']*papers-workspace\.js[^"']*)["']/i);
    if (wsMatch) workspaceUrl = normalizeHttpUrl(wsMatch[1], `${baseUrl}papers`) || workspaceUrl;
  } catch { /* fallback defaults */ }

  const driveRoots = [];
  try {
    const ppCode = await fetch(pastPapersUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => r.text());
    const ppObj = extractAssignedObjectLiteral(ppCode, 'var s=');
    const cambridge = ppObj?.Cambridge || {};
    for (const [lvlKey, spec] of [['IAL', 'CIE-AL'], ['IGCSE', 'CIE-IGCSE']]) {
      for (const [title, driveUrl] of Object.entries(cambridge[lvlKey] || {})) {
        if (typeof driveUrl !== 'string' || !driveUrl.includes('drive.google.com')) continue;
        if (!matchesSyllabusFilter(title, syllabusFilter)) continue;
        driveRoots.push({ source: 'Elevare-CIE', spec, title, driveUrl, allowGt: true });
      }
    }
  } catch (err) {
    console.warn('[Elevare-CIE] past-papers.js parse skipped:', err?.message || err);
  }

  console.log(`[Elevare-CIE] Found ${driveRoots.length} matching Cambridge Drive roots; crawling folders...`);
  const driveFiles = await crawlDriveTree(driveRoots, sinceYear);
  const seenDriveIds = new Set(driveFiles.map(f => f.id).filter(Boolean));

  const catalogTargets = [
    { spec: 'CIE-AL', file: 'cambridge_ial.js', marker: 'window.CAMBRIDGE_IAL_PAPERS=' },
    { spec: 'CIE-IGCSE', file: 'cambridge_igcse.js', marker: 'window.CAMBRIDGE_IGCSE_PAPERS=' }
  ];
  try {
    const wsCode = await fetch(workspaceUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => r.text());
    const catMatch = wsCode.match(/Cambridge\s*:\s*\{([^}]+)\}/);
    if (catMatch) {
      const ialF = catMatch[1].match(/IAL\s*:\s*["']([^"']+)["']/)?.[1];
      const igF = catMatch[1].match(/IGCSE\s*:\s*["']([^"']+)["']/)?.[1];
      if (ialF) catalogTargets[0].file = ialF;
      if (igF) catalogTargets[1].file = igF;
    }
  } catch { /* fallback defaults */ }

  const curatedExtras = [];
  for (const target of catalogTargets) {
    try {
      const code = await fetch(`${baseUrl}${target.file}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) }).then(r => r.text());
      const catalog = extractAssignedObjectLiteral(code, target.marker);
      if (!catalog) continue;
      for (const subjEntry of Object.values(catalog)) {
        const title = subjEntry?.subject || '';
        if (!matchesSyllabusFilter(title, syllabusFilter)) continue;
        const resolvedList = extractResolvedCambridgeCodes(title);
        const primarySyl = resolvedList[0];
        if (!primarySyl) continue;
        for (const sess of (subjEntry?.sessions || [])) {
          const yr = Number(sess?.year || 0);
          if (!yr || (sinceYear && yr < sinceYear)) continue;
          const seasonRaw = `${sess?.season || ''} ${sess?.session_title || ''}`.toLowerCase();
          if (/specimen|sample/i.test(seasonRaw)) continue;
          let ser = '';
          if (/feb|mar/.test(seasonRaw)) ser = 'm';
          else if (/may|jun|summer/.test(seasonRaw)) ser = 's';
          else if (/oct|nov|winter/.test(seasonRaw)) ser = 'w';
          if (!ser) continue;
          const yy = String(yr).slice(-2);

          for (const p of (sess?.papers || [])) {
            const pLabel = String(p?.paper || '').trim();
            if (/syllabus|spec(?:ification|imen)?/i.test(pLabel)) continue;
            const compMatch = pLabel.match(/\b(?:Paper|Component)\s*(\d{1,2})\b/i);
            const comp = compMatch ? compMatch[1] : '';
            const emit = (id, docCode, ext = 'pdf') => {
              if (!id || seenDriveIds.has(id)) return;
              seenDriveIds.add(id);
              const suffix = (docCode === 'er' || docCode === 'gt') ? '' : (comp ? `_${comp}` : '');
              if (docCode !== 'er' && docCode !== 'gt' && !suffix) return;
              const fileName = `${primarySyl.code}_${ser}${yy}_${docCode}${suffix}.${ext}`;
              curatedExtras.push({
                source: 'Elevare-CIE',
                spec: primarySyl.spec,
                title,
                folderPath: `${yr}/${CIE_SERIES_FOLDER[ser]}`,
                id,
                name: fileName,
                url: `https://drive.google.com/uc?export=download&id=${id}`
              });
            };
            if (/grade\s*thresh/i.test(pLabel)) {
              emit(p?.qp || p?.ms || p?.gt, 'gt');
              continue;
            }
            emit(p?.qp, 'qp');
            emit(p?.ms, 'ms');
            emit(p?.er, 'er');
            if (p?.gt) emit(p.gt, 'gt');
            if (p?.in) emit(p.in, 'in');
            if (p?.zip) emit(p.zip, 'sf', 'zip');
          }
        }
      }
    } catch (err) {
      console.warn(`[Elevare-CIE] ${target.file} parse skipped:`, err?.message || err);
    }
  }

  console.log(`[Elevare-CIE] Collected ${driveFiles.length} Drive files + ${curatedExtras.length} curated-only files.`);
  return [...driveFiles, ...curatedExtras];
}

async function crawlBsrCambridge(sinceYear, syllabusFilter) {
  console.log('[BSR-CIE] Fetching https://britishstudentroom.com/cambridge/ ...');
  const html = await fetch('https://britishstudentroom.com/cambridge/', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30000)
  }).then(r => r.text());
  const cards = [];
  for (const m of html.matchAll(/<div class="subject-card"([^>]*)>/gi)) {
    const attrs = m[1];
    const level = attrs.match(/data-level="([^"]*)"/)?.[1] || '';
    if (level !== 'IAL' && level !== 'IGCSE') continue; // Strictly skip UK GCSE
    const title = decodeHtml(attrs.match(/data-title="([^"]*)"/)?.[1] || '');
    const codeAttr = attrs.match(/data-code="([^"]*)"/)?.[1] || '';
    const resolvedList = extractResolvedCambridgeCodes(`${title} ${codeAttr}`);
    if (!resolvedList.length) continue;
    if (syllabusFilter && syllabusFilter.size && !resolvedList.some(e => syllabusFilter.has(e.code))) continue;
    const slice = html.slice(m.index, m.index + 1400);
    const driveUrl = slice.match(/openAuthModal\('(https:\/\/drive\.google\.com\/[^']+)'\)/)?.[1] || '';
    const subHref = slice.match(/href=["'](\/past-papers\/[^"']+)["']/)?.[1] || '';
    cards.push({
      spec: level === 'IAL' ? 'CIE-AL' : 'CIE-IGCSE',
      title,
      driveUrl,
      subHref
    });
  }
  const roots = [];
  const seenDrive = new Set();
  for (let i = 0; i < cards.length; i += 8) {
    await Promise.all(cards.slice(i, i + 8).map(async (c) => {
      let dUrl = c.driveUrl;
      if (!dUrl && c.subHref) {
        try {
          const subHtml = await fetch(`https://britishstudentroom.com${c.subHref}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
          dUrl = subHtml.match(/openAuthModal\('(https:\/\/drive\.google\.com\/[^']+)'\)/)?.[1] || '';
        } catch { /* ignore */ }
      }
      if (dUrl && !seenDrive.has(dUrl)) {
        seenDrive.add(dUrl);
        roots.push({
          source: 'BSR-CIE',
          spec: c.spec,
          title: c.title,
          driveUrl: dUrl,
          allowGt: true
        });
      }
    }));
  }
  console.log(`[BSR-CIE] Found ${roots.length} matching Cambridge Drive roots; crawling folders...`);
  return crawlDriveTree(roots, sinceYear);
}

async function crawlPapaCambridge(sinceYear, syllabusFilter) {
  console.log('[Papa-CIE] Discovering PapaCambridge CAIE syllabus slugs...');
  const slugMap = { ...PAPA_CAMBRIDGE_SLUGS };
  const hubUrls = [
    'https://pastpapers.papacambridge.com/papers/caie/as-and-a-level',
    'https://pastpapers.papacambridge.com/papers/caie/igcse',
    'https://pastpapers.papacambridge.com/papers/caie/o-level'
  ];
  await Promise.all(hubUrls.map(async (u) => {
    try {
      const html = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
      for (const m of html.matchAll(/papers\/caie\/([a-z0-9-]+-(\d{4}))["'/]/gi)) {
        const slug = m[1];
        const code = m[2];
        const entry = resolveCambridgeSyllabus(code);
        if (entry && !slugMap[entry.code]) {
          slugMap[entry.code] = slug;
        }
      }
    } catch { /* fallback to static PAPA_CAMBRIDGE_SLUGS */ }
  }));

  const targetCodes = syllabusFilter && syllabusFilter.size
    ? [...syllabusFilter].filter(c => slugMap[c])
    : Object.keys(slugMap);
  if (!targetCodes.length) return [];

  const minYr = sinceYear || 2000;
  const jobs = [];
  const seenJobUrls = new Set();
  for (let i = 0; i < targetCodes.length; i += 6) {
    await Promise.all(targetCodes.slice(i, i + 6).map(async (code) => {
      const entry = resolveCambridgeSyllabus(code);
      if (!entry) return;
      const slug = slugMap[code];
      const landingUrl = `https://pastpapers.papacambridge.com/papers/caie/${slug}`;
      try {
        const html = await fetch(landingUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
        const escSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`papers/caie/(${escSlug}-(20\\d{2})-[a-z0-9-]+)["'/]`, 'gi');
        for (const m of html.matchAll(re)) {
          const sessSlug = m[1];
          const yr = Number(m[2]);
          if (yr < minYr) continue;
          const fullUrl = `https://pastpapers.papacambridge.com/papers/caie/${sessSlug}`;
          if (seenJobUrls.has(fullUrl)) continue;
          seenJobUrls.add(fullUrl);
          jobs.push({
            code: entry.code,
            spec: entry.spec,
            title: `${entry.name} (${entry.code})`,
            year: yr,
            url: fullUrl
          });
        }
      } catch { /* ignore landing error */ }
    }));
  }

  console.log(`[Papa-CIE] Checking ${jobs.length} session pages across ${targetCodes.length} syllabuses...`);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < jobs.length; i += 8) {
    await Promise.all(jobs.slice(i, i + 8).map(async (job) => {
      try {
        const res = await fetch(job.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
        if (!res.ok) return;
        const html = await res.text();
        const re = new RegExp(`\\b(${job.code}_[msw]\\d{2}_[a-z]{2,4}(?:_\\d{1,2})?\\.(?:pdf|zip|mp3))\\b`, 'gi');
        for (const m of html.matchAll(re)) {
          const fname = m[1].toLowerCase();
          if (seen.has(fname)) continue;
          seen.add(fname);
          out.push({
            source: 'Papa-CIE',
            spec: job.spec,
            title: job.title,
            folderPath: `${job.year}`,
            name: fname,
            url: `https://pastpapers.papacambridge.com/directories/CAIE/CAIE-pastpapers/upload/${fname}`
          });
        }
      } catch { /* ignore unavailable session */ }
    }));
  }
  console.log(`[Papa-CIE] Collected ${out.length} direct CAIE files.`);
  return out;
}

const PMT_CAMBRIDGE_TARGETS = [
  // Cambridge AS & A Level (CIE-AL)
  { code: '9709', paper: 1, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-paper-1/' },
  { code: '9709', paper: 2, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-paper-2/' },
  { code: '9709', paper: 3, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-paper-3/' },
  { code: '9709', paper: 4, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-paper-4/' },
  { code: '9709', paper: 5, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-paper-5/' },
  { code: '9709', paper: 6, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-paper-6/' },
  { code: '9709', paper: 7, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-paper-7/' },
  { code: '9231', paper: 1, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-fp1/' },
  { code: '9231', paper: 2, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-fp2/' },
  { code: '9231', paper: 3, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-fm/' },
  { code: '9231', paper: 4, url: 'https://www.physicsandmathstutor.com/a-level-maths-papers/cie-fps/' },
  { code: '9702', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-physics/cie-paper-1/' },
  { code: '9702', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-physics/cie-paper-2/' },
  { code: '9702', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-physics/cie-paper-3/' },
  { code: '9702', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-physics/cie-paper-4/' },
  { code: '9702', paper: 5, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-physics/cie-paper-5/' },
  { code: '9701', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-chemistry/cie-paper-1/' },
  { code: '9701', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-chemistry/cie-paper-2/' },
  { code: '9701', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-chemistry/cie-paper-3/' },
  { code: '9701', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-chemistry/cie-paper-4/' },
  { code: '9701', paper: 5, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-chemistry/cie-paper-5/' },
  { code: '9700', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-biology/cie-paper-1/' },
  { code: '9700', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-biology/cie-paper-2/' },
  { code: '9700', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-biology/cie-paper-3/' },
  { code: '9700', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-biology/cie-paper-4/' },
  { code: '9700', paper: 5, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-biology/cie-paper-5/' },
  { code: '9708', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-economics/cie-paper-1/' },
  { code: '9708', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-economics/cie-paper-2/' },
  { code: '9708', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-economics/cie-paper-3/' },
  { code: '9708', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-economics/cie-paper-4/' },
  { code: '9618', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-computer-science/caie-paper-1/' },
  { code: '9618', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-computer-science/caie-paper-2/' },
  { code: '9618', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-computer-science/caie-paper-3/' },
  { code: '9618', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-computer-science/caie-paper-4/' },
  { code: '9696', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-geography/cie-paper-1/' },
  { code: '9696', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-geography/cie-paper-2/' },
  { code: '9696', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-geography/cie-paper-3/' },
  { code: '9696', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-geography/cie-paper-4/' },
  { code: '9990', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-psychology/cie-paper-1/' },
  { code: '9990', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-psychology/cie-paper-2/' },
  { code: '9990', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-psychology/cie-paper-3/' },
  { code: '9990', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/a-level-psychology/cie-paper-4/' },
  // Cambridge IGCSE (CIE-IGCSE)
  { code: '0580', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-maths/cie-igcse-paper-1/' },
  { code: '0580', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-maths/cie-igcse-paper-2/' },
  { code: '0580', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-maths/cie-igcse-paper-3/' },
  { code: '0580', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-maths/cie-igcse-paper-4/' },
  { code: '0606', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-maths/cie-igcse-further-paper-1/' },
  { code: '0606', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-maths/cie-igcse-further-paper-2/' },
  { code: '0625', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-physics/cie-igcse-paper-1/' },
  { code: '0625', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-physics/cie-igcse-paper-2/' },
  { code: '0625', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-physics/cie-igcse-paper-3/' },
  { code: '0625', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-physics/cie-igcse-paper-4/' },
  { code: '0625', paper: 5, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-physics/cie-igcse-paper-5/' },
  { code: '0625', paper: 6, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-physics/cie-igcse-paper-6/' },
  { code: '0620', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-chemistry/cie-igcse-paper-1/' },
  { code: '0620', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-chemistry/cie-igcse-paper-2/' },
  { code: '0620', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-chemistry/cie-igcse-paper-3/' },
  { code: '0620', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-chemistry/cie-igcse-paper-4/' },
  { code: '0620', paper: 5, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-chemistry/cie-igcse-paper-5/' },
  { code: '0620', paper: 6, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-chemistry/cie-igcse-paper-6/' },
  { code: '0610', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-biology/cie-igcse-paper-1/' },
  { code: '0610', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-biology/cie-igcse-paper-2/' },
  { code: '0610', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-biology/cie-igcse-paper-3/' },
  { code: '0610', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-biology/cie-igcse-paper-4/' },
  { code: '0610', paper: 5, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-biology/cie-igcse-paper-5/' },
  { code: '0610', paper: 6, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-biology/cie-igcse-paper-6/' },
  { code: '0455', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-economics/cie-igcse-paper-1/' },
  { code: '0455', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-economics/cie-igcse-paper-2/' },
  { code: '0478', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-computer-science/caie-paper-1/' },
  { code: '0478', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-computer-science/caie-paper-2/' },
  { code: '0460', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-geography/cie-igcse-paper-1/' },
  { code: '0460', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-geography/cie-igcse-paper-2/' },
  { code: '0460', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-geography/cie-igcse-paper-4/' },
  { code: '0500', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-english-language/cie-igcse-paper-1/' },
  { code: '0500', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-english-language/cie-igcse-paper-2/' },
  { code: '0500', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-english-language/cie-igcse-paper-3/' },
  { code: '0475', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-english-literature/cie-igcse-paper-1/' },
  { code: '0475', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-english-literature/cie-igcse-paper-2/' },
  { code: '0475', paper: 3, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-english-literature/cie-igcse-paper-3/' },
  { code: '0475', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-english-literature/cie-igcse-paper-4/' },
  { code: '0470', paper: 1, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-history/cie-igcse-paper-1/' },
  { code: '0470', paper: 2, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-history/cie-igcse-paper-2/' },
  { code: '0470', paper: 4, url: 'https://www.physicsandmathstutor.com/past-papers/gcse-history/cie-igcse-paper-4/' }
];

async function crawlPmtCambridge(sinceYear, syllabusFilter) {
  const targets = PMT_CAMBRIDGE_TARGETS.filter(t => !syllabusFilter || !syllabusFilter.size || syllabusFilter.has(t.code));
  if (!targets.length) return [];
  console.log(`[PMT-CIE] Scanning ${targets.length} Physics & Maths Tutor Cambridge subpages...`);
  const out = [];
  for (let i = 0; i < targets.length; i += 6) {
    await Promise.all(targets.slice(i, i + 6).map(async (target) => {
      try {
        const entry = resolveCambridgeSyllabus(target.code);
        if (!entry) return;
        const html = await fetch(target.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
        for (const m of html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)) {
          const pdfUrl = normalizeHttpUrl(m[1], target.url);
          if (!pdfUrl) continue;
          const rawBase = decodeURIComponent(pdfUrl.split('?')[0].split('/').pop() || '');
          const pm = rawBase.match(/\b(Feb(?:ruary)?|Mar(?:ch)?|May|Jun(?:e)?|Summer|Oct(?:ober)?|Nov(?:ember)?|Winter)\s+(20\d{2})(?:\s*\(v(\d)\))?\s*(QP|MS|IN|CI|ER|GT)\.pdf$/i);
          if (!pm) continue;
          const moTxt = pm[1].toLowerCase();
          const yr = Number(pm[2]);
          if (sinceYear && yr < sinceYear) continue;
          const vDigit = pm[3] || '';
          const docCode = pm[4].toLowerCase();
          const ser = /feb|mar/.test(moTxt) ? 'm' : (/oct|nov|win/.test(moTxt) ? 'w' : 's');
          const yy = String(yr).slice(-2);
          const comp = (docCode === 'er' || docCode === 'gt')
            ? ''
            : (vDigit ? `${target.paper}${vDigit}` : `0${target.paper}`);
          const fileName = `${entry.code}_${ser}${yy}_${docCode}${comp ? `_${comp}` : ''}.pdf`;
          out.push({
            source: 'PMT-CIE',
            spec: entry.spec,
            title: `${entry.name} (${entry.code})`,
            folderPath: `${yr}`,
            name: fileName,
            url: pdfUrl
          });
        }
      } catch { /* ignore page error */ }
    }));
  }
  console.log(`[PMT-CIE] Collected ${out.length} Cambridge PDF links.`);
  return out;
}

async function crawlAlmrCambridge(sinceYear, syllabusFilter) {
  if (syllabusFilter && syllabusFilter.size && !syllabusFilter.has('9709')) return [];
  console.log('[ALMR-CIE] Scanning ALevelMathsRevision Cambridge A-Level Mathematics (9709) papers...');
  const url = 'https://alevelmathsrevision.com/cambridge-ial-exam-papers/';
  let html = '';
  try {
    html = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).then(r => (r.ok ? r.text() : ''));
  } catch {
    return [];
  }
  const entry = resolveCambridgeSyllabus('9709');
  if (!entry) return [];
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(/\/pdf\/cie-ial-exampapers\/(p1|p2|p3|m1|m2|s1|s2)\/(mar|jun|nov)\/(20\d{2})\/\?version=(\d)[^"']*resource=(qp|ms)\b/gi)) {
    const unit = m[1].toLowerCase();
    const mon = m[2].toLowerCase();
    const yr = Number(m[3]);
    const ver = m[4];
    const res = m[5].toLowerCase();
    if (sinceYear && yr < sinceYear) continue;
    const ser = mon === 'mar' ? 'm' : (mon === 'jun' ? 's' : 'w');
    let pNum = 1;
    if (unit === 'p1') pNum = 1;
    else if (unit === 'p2') pNum = 2;
    else if (unit === 'p3') pNum = 3;
    else if (unit === 'm1') pNum = 4;
    else if (unit === 'm2') pNum = 5;
    else if (unit === 's1') pNum = yr < 2020 ? 6 : 5;
    else if (unit === 's2') pNum = yr < 2020 ? 7 : 6;
    const isPreVariantEra = yr < 2009 || (yr === 2009 && ser === 's');
    const comp = isPreVariantEra ? `0${pNum}` : `${pNum}${ver}`;
    const yy = String(yr).slice(-2);
    const fileName = `9709_${ser}${yy}_${res}_${comp}.pdf`;
    if (seen.has(fileName)) continue;
    seen.add(fileName);
    const fileUrl = `https://alevelmathsrevision.com/downloads/past-papers/cambridge-ial/${mon}-${yr}-${unit}-v${ver}${res === 'ms' ? '-ms' : ''}.pdf`;
    out.push({
      source: 'ALMR-CIE',
      spec: 'CIE-AL',
      title: `${entry.name} (${entry.code})`,
      folderPath: `${yr}`,
      name: fileName,
      url: fileUrl
    });
  }
  console.log(`[ALMR-CIE] Collected ${out.length} direct 9709 Mathematics PDFs.`);
  return out;
}

async function crawlCieOfficial(sinceYear, syllabusFilter) {
  console.log('[CIE-Official] Scanning cambridgeinternational.org public past paper pages...');
  const hubUrls = [
    'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-level/subjects/',
    'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/cambridge-igcse/subjects/',
    'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/cambridge-o-level/subjects/'
  ];
  const syllabusPages = new Map();
  await Promise.all(hubUrls.map(async (u) => {
    try {
      const html = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
      for (const m of html.matchAll(/href=["']\/programmes-and-qualifications\/(?:view\/)?(cambridge-[^"'/?#]+-(\d{4}))\/?["']/gi)) {
        const slug = m[1];
        const rawCode = m[2];
        const entry = resolveCambridgeSyllabus(rawCode);
        if (!entry) continue;
        if (syllabusFilter && syllabusFilter.size && !syllabusFilter.has(entry.code)) continue;
        if (!syllabusPages.has(entry.code)) {
          syllabusPages.set(entry.code, {
            entry,
            url: `https://www.cambridgeinternational.org/programmes-and-qualifications/${slug}/past-papers/`
          });
        }
      }
    } catch { /* ignore hub error */ }
  }));

  const targets = [...syllabusPages.values()];
  const out = [];
  for (let i = 0; i < targets.length; i += 6) {
    await Promise.all(targets.slice(i, i + 6).map(async ({ entry, url }) => {
      try {
        const html = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) }).then(r => (r.ok ? r.text() : ''));
        for (const m of html.matchAll(/href=["'](\/Images\/\d+-([^"']+)\.(pdf|zip|mp3))["']/gi)) {
          const relUrl = m[1];
          const slug = m[2].toLowerCase();
          const ext = m[3].toLowerCase();
          if (/specimen|syllabus/i.test(slug)) continue;
          const sm = slug.match(/\b(march|february|may|june|october|november)-(20\d{2})-(question-paper|mark-scheme|examiner-report|grade-threshold[a-z-]*|insert|confidential-instructions)(?:-paper-(\d{1,2}))?\b/);
          if (!sm) continue;
          const mo = sm[1];
          const yr = Number(sm[2]);
          if (sinceYear && yr < sinceYear) continue;
          const docRaw = sm[3];
          const comp = sm[4] || '';
          const ser = /mar|feb/.test(mo) ? 'm' : (/oct|nov/.test(mo) ? 'w' : 's');
          let docCode = 'qp';
          if (docRaw === 'mark-scheme') docCode = 'ms';
          else if (docRaw === 'examiner-report') docCode = 'er';
          else if (docRaw.startsWith('grade-threshold')) docCode = 'gt';
          else if (docRaw === 'insert') docCode = 'in';
          else if (docRaw === 'confidential-instructions') docCode = 'ci';
          if ((docCode === 'qp' || docCode === 'ms') && !comp) continue;
          const yy = String(yr).slice(-2);
          const fileName = `${entry.code}_${ser}${yy}_${docCode}${comp ? `_${comp}` : ''}.${ext}`;
          out.push({
            source: 'CIE-Official',
            spec: entry.spec,
            title: `${entry.name} (${entry.code})`,
            folderPath: `${yr}`,
            name: fileName,
            url: `https://www.cambridgeinternational.org${relUrl}`
          });
        }
      } catch { /* ignore page error */ }
    }));
  }
  console.log(`[CIE-Official] Collected ${out.length} official past paper files across ${targets.length} syllabuses.`);
  return out;
}

function planCambridgeItems(rawItems, state, sinceYear, syllabusFilter) {
  const planned = [];
  const seenByKey = new Map();

  for (const item of rawItems) {
    const rawName = sanitizeFileName(item.name || '');
    const extMatch = rawName.match(/\.(pdf|zip|rar|mp3|wav)$/i);
    if (!extMatch) continue;
    const ext = extMatch[1].toLowerCase();
    const folderPath = decodeHtml(item.folderPath || '');
    const fullPath = folderPath ? `${folderPath}/${rawName}` : rawName;

    // Strictly block non-paper materials, UK domestic GCSE, and other boards
    if (/syllabus|spec(?:ification|imen)?\b|\bsample\b|revision|\bnotes?\b|toaz\.info|textbook|solution[-_\s]*bank|timetabl|coursework|teacher[-_\s]*guide|(?:^|[^a-z0-9])(?:edexcel|pearson|aqa|ocr|wjec|eduqas)(?:[^a-z0-9]|$)|(?<!i)\bgcse\b/i.test(fullPath)) {
      continue;
    }

    const parsed = parseCambridgePath(fullPath, rawName);
    const sylEntry = parsed.syllabusEntry;
    if (!sylEntry) continue; // Strictly international CAIE syllabuses in CAMBRIDGE_SYLLABUSES only!
    if (syllabusFilter && syllabusFilter.size && !syllabusFilter.has(sylEntry.code)) continue;

    // Require canonical series (m/s/w) and valid exam year
    const ser = parsed.seriesChar;
    const yr = parsed.year;
    if (!ser || !CIE_SERIES_FOLDER[ser] || !yr || yr < 2002 || yr > 2027) continue;
    if (sinceYear && yr < sinceYear) continue;

    const dt = detectCambridgeDocType(rawName, fullPath);
    if (!dt || dt === 'SAM') continue;
    const rawDoc = parsed.rawDocCode || dt.toLowerCase();
    // Skip unparseable non-standard doc types or specimen/syllabus codes
    if (rawDoc === 'sp' || rawDoc === 'sm' || rawDoc === 'su' || rawDoc === 'sy') continue;

    const comp = parsed.componentCode || '';
    // Individual paper docs (QP, MS, SC) should carry a component unless transcript/pre-release
    if ((dt === 'QP' || dt === 'MS') && !comp) continue;

    const spec = sylEntry.spec;
    const dedupKey = `${spec}|${sylEntry.code}|${yr}-${ser}|${dt}|${rawDoc}|${comp}`;
    if (state.exactKeys.has(dedupKey)) continue;

    const fallbackList = [];
    if (item.fallbackUrl && item.fallbackUrl !== item.url) {
      fallbackList.push({ url: item.fallbackUrl, source: `${item.source}-fallback` });
    }

    if (seenByKey.has(dedupKey)) {
      const prev = seenByKey.get(dedupKey);
      if (prev.url !== item.url && !prev.fallbacks.some(f => f.url === item.url)) {
        prev.fallbacks.push({ url: item.url, cookie: item.cookie, id: item.id, source: item.source });
      }
      for (const fb of fallbackList) {
        if (prev.url !== fb.url && !prev.fallbacks.some(f => f.url === fb.url)) {
          prev.fallbacks.push(fb);
        }
      }
      continue;
    }

    const levelFolder = CIE_LEVEL_FOLDER[spec] || 'IGCSE';
    const subjFolder = formatCambridgeSubjectName(sylEntry);
    const sessFolder = CIE_SERIES_FOLDER[ser];
    const yy = String(yr).slice(-2);
    // Preserve canonical Cambridge filename (preferring primary syllabus code for 9-1 equivalents, preserving legacy codes)
    const fileCode = (parsed.rawSyllabusCode && sylEntry.legacyCodes?.includes(parsed.rawSyllabusCode))
      ? parsed.rawSyllabusCode
      : sylEntry.code;
    const finalName = `${fileCode}_${ser}${yy}_${rawDoc}${comp ? `_${comp}` : ''}.${ext}`;
    const relDest = `Past Papers/Cambridge/${levelFolder}/${subjFolder}/${yr}/${sessFolder}/${finalName}`;
    if (state.usedPaths.has(relDest.toLowerCase())) continue;

    const entry = {
      ...item,
      spec,
      subj: subjFolder,
      u: comp ? `${sylEntry.code}-P${parsed.paperNum}` : '',
      v: parsed.variant || '',
      yrStr: String(yr),
      moCode: ser,
      dt,
      relDest,
      absDest: path.join(LIBRARY_ROOT, relDest.replace(/\//g, '\\')),
      fallbacks: fallbackList
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

const HOST_LIMITS = {
  'bestexamhelp.com': 6,
  'pastpapers.papacambridge.com': 6,
  'pmt.physicsandmathstutor.com': 3,
  'www.physicsandmathstutor.com': 3,
  'drive.google.com': 3,
  'drive.usercontent.google.com': 3
};
const hostActive = new Map();
const hostWaiters = new Map();

async function withHostSlot(rawUrl, fn) {
  let host = 'default';
  try { host = new URL(rawUrl).hostname.toLowerCase(); } catch { /* fallback */ }
  const cap = HOST_LIMITS[host] || 4;
  const active = hostActive.get(host) || 0;
  if (active >= cap) {
    await new Promise(resolve => {
      if (!hostWaiters.has(host)) hostWaiters.set(host, []);
      hostWaiters.get(host).push(resolve);
    });
  }
  hostActive.set(host, (hostActive.get(host) || 0) + 1);
  try {
    return await fn();
  } finally {
    const nextActive = (hostActive.get(host) || 1) - 1;
    hostActive.set(host, nextActive);
    const q = hostWaiters.get(host);
    if (q && q.length > 0 && nextActive < cap) {
      const wake = q.shift();
      wake();
    }
  }
}

async function downloadBuffer(item) {
  return withHostSlot(item.url, async () => {
    const hdrs = { 'User-Agent': UA };
    if (item.cookie) hdrs.Cookie = item.cookie;
    let res = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch(item.url, { headers: hdrs, signal: AbortSignal.timeout(45000) });
      if (res.status !== 429 && res.status !== 503) break;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
    if (!res || !res.ok) return { err: `HTTP_${res ? res.status : 'ERR'}` };
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
  });
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
  const isCambridge = opts.board === 'cambridge';
  let planned = [];

  if (opts.fromJson) {
    const rawJson = JSON.parse(fs.readFileSync(opts.fromJson, 'utf8'));
    const list = Array.isArray(rawJson) ? rawJson : (rawJson.items || []);
    planned = list.slice(0, opts.limit);
    console.log(`[FromJSON] Loaded ${planned.length} pre-planned items from ${opts.fromJson}`);
  } else {
    const crawlers = isCambridge
      ? {
          beh: (yr) => crawlBehCambridge(yr, opts.syllabuses),
          elevare: (yr) => crawlElevareCambridge(yr, opts.syllabuses),
          bsr: (yr) => crawlBsrCambridge(yr, opts.syllabuses),
          pmt: (yr) => crawlPmtCambridge(yr, opts.syllabuses),
          almr: (yr) => crawlAlmrCambridge(yr, opts.syllabuses),
          cie: (yr) => crawlCieOfficial(yr, opts.syllabuses),
          papa: (yr) => crawlPapaCambridge(yr, opts.syllabuses)
        }
      : {
          bsr: crawlBsr,
          dp: crawlDynamicPapers,
          igexams: crawlIgExams,
          ssc: crawlSsc,
          pmt: crawlPmt,
          pl: crawlPaperlords,
          elevare: crawlElevare,
          beh: crawlBehEdexcel,
          almr: crawlAlmrEdexcel
        };

    const raw = [];
    for (const s of opts.sources) {
      if (!crawlers[s]) { console.warn(`Unknown source ignored for board=${opts.board}: ${s}`); continue; }
      raw.push(...(await crawlers[s](opts.sinceYear)));
    }

    const state = isCambridge ? buildCambridgeDedupState() : buildLibraryDedupState();
    planned = (isCambridge
      ? planCambridgeItems(raw, state, opts.sinceYear, opts.syllabuses)
      : planItems(raw, state, opts.sinceYear)
    ).slice(0, opts.limit);
  }
  if (opts.dumpJson) {
    fs.writeFileSync(opts.dumpJson, JSON.stringify(planned, null, 2));
    console.log(`Dumped ${planned.length} planned items to ${opts.dumpJson}`);
  }
  const bySubj = {};
  for (const p of planned) {
    const k = `${p.source} | ${p.spec} | ${p.subj}`;
    bySubj[k] = (bySubj[k] || 0) + 1;
  }

  console.log(`\n=== SYNC PLAN [${opts.fromJson ? 'UNIFIED-MANIFEST' : opts.board.toUpperCase()}] (${planned.length} new candidates) ===`);
  if (!opts.fromJson) {
    for (const [k, v] of Object.entries(bySubj).sort()) console.log(`  ${k}: ${v}`);
  }
  if (opts.verbose && planned.length) {
    const cap = Math.min(planned.length, 300);
    console.log(`\nPlanned items (showing ${cap} of ${planned.length}):`);
    for (const p of planned.slice(0, cap)) console.log(`  [${p.u || '-'}|${p.v || '-'}|${p.dt}] ${p.relDest}  (folder="${p.folderPath}")  <--  ${p.url}`);
  }

  if (!opts.apply) {
    console.log('\nDry-run mode complete. Re-run with --apply to download, optimize PDFs, and re-index.');
    return;
  }

  const { shaToPaths, nextCache } = loadShaRegistry();
  const qpdfExe = opts.skipPack ? '' : findQpdfExecutable(opts.qpdfPath);
  const statusPath = path.join(DATA_DIR, 'download_status.json');
  const retryCurl = [];
  const failReasons = {};
  const failedItems = [];
  const recentSaved = [];
  let saved = 0, alreadyOnDisk = 0, skippedDup = 0, copiedShared = 0, failed = 0, processed = 0, bytesDownloaded = 0;
  const startedAtMs = Date.now();

  const qualStats = {};
  for (const p of planned) {
    if (!qualStats[p.spec]) qualStats[p.spec] = { total: 0, done: 0, saved: 0, skipped: 0, failed: 0 };
    qualStats[p.spec].total++;
  }

  const writeStatusSnapshot = (phase = 'downloading') => {
    const elapsedSec = Math.max(1, (Date.now() - startedAtMs) / 1000);
    const filesPerMin = Number(((processed / elapsedSec) * 60).toFixed(1));
    const remaining = Math.max(0, planned.length - processed);
    const etaMinutes = filesPerMin > 0 ? Number((remaining / filesPerMin).toFixed(1)) : null;
    const snap = {
      phase,
      startedAt: new Date(startedAtMs).toISOString(),
      updatedAt: new Date().toISOString(),
      elapsedSec: Math.round(elapsedSec),
      totalPlanned: planned.length,
      processed,
      remaining,
      percent: planned.length > 0 ? Number(((processed / planned.length) * 100).toFixed(2)) : 100,
      saved,
      alreadyOnDisk,
      copiedSharedDA: copiedShared,
      skippedDup,
      queuedCurlRetry: retryCurl.length,
      failed,
      bytesDownloaded,
      mbDownloaded: Number((bytesDownloaded / (1024 * 1024)).toFixed(2)),
      filesPerMin,
      etaMinutes,
      byQualification: qualStats,
      failReasons,
      recentSaved: recentSaved.slice(-8),
      recentFailed: failedItems.slice(-10)
    };
    try {
      fs.writeFileSync(statusPath, JSON.stringify(snap, null, 2));
    } catch { /* ignore transient status write error */ }
  };

  const flushShaCache = () => {
    try {
      fs.writeFileSync(SHA_CACHE_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), files: nextCache }));
    } catch { /* ignore */ }
  };

  let lastStatusMs = 0;
  const maybeProgress = (phase = 'downloading') => {
    const now = Date.now();
    if (now - lastStatusMs >= 5000 || processed === planned.length) {
      lastStatusMs = now;
      writeStatusSnapshot(phase);
    }
    if (processed > 0 && (processed % 250 === 0 || processed === planned.length)) {
      const elapsedMin = ((now - startedAtMs) / 60000).toFixed(1);
      const rate = ((processed / Math.max(1, (now - startedAtMs) / 1000)) * 60).toFixed(0);
      const mb = (bytesDownloaded / (1024 * 1024)).toFixed(1);
      console.log(`[Progress] ${processed}/${planned.length} (${((processed / planned.length) * 100).toFixed(1)}%) | saved=${saved} disk=${alreadyOnDisk} dup=${skippedDup} retry=${retryCurl.length} fail=${failed} | ${mb} MB | ${rate}/min | ${elapsedMin}m`);
    }
    if (saved > 0 && saved % 2500 === 0) {
      flushShaCache();
    }
  };

  const commitBuffer = (item, buf, workerTmpPack) => {
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
        return { ok: true, kind: 'copied' };
      }
      skippedDup++;
      return { ok: true, kind: 'dup' };
    }
    fs.mkdirSync(path.dirname(item.absDest), { recursive: true });
    fs.writeFileSync(item.absDest, buf);
    bytesDownloaded += buf.length;
    if (qpdfExe && workerTmpPack) {
      packLargePdf(qpdfExe, item.absDest, workerTmpPack);
      if (fs.existsSync(workerTmpPack)) {
        try { fs.unlinkSync(workerTmpPack); } catch { /* ignore */ }
      }
    }
    const st = fs.statSync(item.absDest);
    const relFromPapers = path.relative(PAST_PAPERS, item.absDest).replace(/\\/g, '/');
    nextCache[relFromPapers] = { size: st.size, mtimeMs: st.mtimeMs, sha };
    shaToPaths.set(sha, [item.absDest]);
    saved++;
    recentSaved.push(item.relDest);
    if (recentSaved.length > 20) recentSaved.shift();
    return { ok: true, kind: 'saved' };
  };

  writeStatusSnapshot('downloading');
  let cursor = 0;
  const WORKER_COUNT = 16;
  await Promise.all(Array.from({ length: WORKER_COUNT }, async (_, workerIdx) => {
    const workerTmpPack = path.join(DATA_DIR, `sync_qpdf_${process.pid}_${workerIdx}.pdf`);
    try {
      while (cursor < planned.length) {
        const item = planned[cursor++];
        const qs = qualStats[item.spec];
        // Resumability check: skip if valid file already exists at absDest
        if (fs.existsSync(item.absDest)) {
          try {
            const existingBuf = fs.readFileSync(item.absDest);
            const ext = item.relDest.split('.').pop().toLowerCase();
            if (validateMagic(existingBuf, ext) === null) {
              const sha = crypto.createHash('sha256').update(existingBuf).digest('hex');
              if (!shaToPaths.has(sha)) shaToPaths.set(sha, [item.absDest]);
              alreadyOnDisk++;
              processed++;
              if (qs) { qs.done++; qs.skipped++; }
              maybeProgress('downloading');
              continue;
            }
          } catch { /* re-download if unreadable */ }
        }

        const sourcesToTry = [item, ...(item.fallbacks || []).map(fb => ({ ...item, ...fb }))];
        let done = false;
        let resultKind = '';
        let lastReason = 'FETCH_ERR';
        for (const candidate of sourcesToTry) {
          try {
            const res = await downloadBuffer(candidate);
            if (res.buf) {
              const c = commitBuffer(item, res.buf, workerTmpPack);
              if (c.ok) { done = true; resultKind = c.kind; break; }
              lastReason = c.reason;
            } else {
              lastReason = res.err || 'EMPTY';
            }
          } catch {
            lastReason = 'FETCH_TIMEOUT';
          }
        }
        processed++;
        if (done) {
          if (qs) {
            qs.done++;
            if (resultKind === 'saved' || resultKind === 'copied') qs.saved++;
            else qs.skipped++;
          }
        } else {
          if (lastReason === 'HTTP_404') {
            failed++;
            if (qs) { qs.done++; qs.failed++; }
            failReasons[lastReason] = (failReasons[lastReason] || 0) + 1;
            failedItems.push({ relDest: item.relDest, reason: lastReason, url: item.url });
            if (failedItems.length > 50) failedItems.shift();
          } else {
            retryCurl.push({ item, lastReason });
          }
        }
        maybeProgress('downloading');
      }
    } finally {
      if (fs.existsSync(workerTmpPack)) {
        try { fs.unlinkSync(workerTmpPack); } catch { /* ignore */ }
      }
    }
  }));

  if (retryCurl.length > 0) {
    console.log(`[CurlRetry] Retrying ${retryCurl.length} items via curl.exe...`);
    writeStatusSnapshot('retrying_curl');
    let rCursor = 0;
    await Promise.all(Array.from({ length: 4 }, async (_, wIdx) => {
      const workerTmpCurl = path.join(DATA_DIR, `sync_curl_${process.pid}_${wIdx}.tmp`);
      const workerTmpPack = path.join(DATA_DIR, `sync_qpdf_curl_${process.pid}_${wIdx}.pdf`);
      try {
        while (rCursor < retryCurl.length) {
          const { item, lastReason } = retryCurl[rCursor++];
          const qs = qualStats[item.spec];
          let reason = lastReason;
          let done = false;
          const sourcesToTry = [item, ...(item.fallbacks || []).map(fb => ({ ...item, ...fb }))];
          for (const candidate of sourcesToTry) {
            try {
              const buf = downloadViaCurl(candidate, workerTmpCurl);
              const c = commitBuffer(item, buf, workerTmpPack);
              if (c.ok) { done = true; break; }
              reason = c.reason;
            } catch {
              reason = 'CURL_ERR';
            }
          }
          if (done) {
            if (qs) { qs.done++; qs.saved++; }
          } else {
            failed++;
            if (qs) { qs.done++; qs.failed++; }
            failReasons[reason] = (failReasons[reason] || 0) + 1;
            failedItems.push({ relDest: item.relDest, reason, url: item.url });
            if (failedItems.length > 50) failedItems.shift();
          }
          writeStatusSnapshot('retrying_curl');
        }
      } finally {
        for (const f of [workerTmpCurl, workerTmpPack]) {
          if (fs.existsSync(f)) {
            try { fs.unlinkSync(f); } catch { /* ignore */ }
          }
        }
      }
    }));
  }

  flushShaCache();
  const reasonStr = Object.keys(failReasons).length ? ` | reasons=${JSON.stringify(failReasons)}` : '';
  console.log(`\n=== SYNC RESULT === saved=${saved}, alreadyOnDisk=${alreadyOnDisk}, copiedSharedDA=${copiedShared}, skippedDup=${skippedDup}, failed=${failed}${reasonStr}`);
  if (!opts.skipIndex && (saved > 0 || copiedShared > 0)) {
    writeStatusSnapshot('indexing');
    console.log('Running generate-index.js...');
    execFileSync(process.execPath, [path.join(__dirname, 'generate-index.js')], { stdio: 'inherit' });
  }
  writeStatusSnapshot('done');
}

run().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
