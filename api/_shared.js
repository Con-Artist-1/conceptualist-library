import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');

export const DB_NAME_DEFAULT = 'conceptualist_library';
export const COLLECTION_VIEWS = 'paper_views';
export const COLLECTION_SESSIONS = 'site_sessions';
export const COLLECTION_SUBTITLES = 'audio_subtitles';
export const COLLECTION_RATE_LIMITS = 'rate_limits';

export const PAPER_KEY_MAX_LEN = 220;
export const PAPER_KEY_REGEX = /^[A-Za-z0-9|_\-. (),/+&'%[\]]+$/;
export const SUBTITLE_KEY_REGEX = /^[A-Za-z0-9|_\-. (),/+&#'%[\]]+$/;

const MONGO_RETRY_BACKOFF_MS = 15 * 1000;
let cachedMongoClientPromise = globalThis.__csMongoClientPromise || null;
let lastMongoFailAt = globalThis.__csLastMongoFailAt || 0;
let hasLoggedAtlasWarning = globalThis.__csHasLoggedAtlasWarning || false;
let rateLimitTtlInitialized = globalThis.__csRateLimitTtlInitialized || false;
let cachedCatalogAllowlist = globalThis.__csCatalogAllowlist || null;

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function buildDirSetMap(dirs, groupedFiles) {
  const map = new Map();
  if (!Array.isArray(dirs) || !Array.isArray(groupedFiles)) return map;
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const files = groupedFiles[i];
    if (typeof dir === 'string' && Array.isArray(files)) {
      map.set(dir, new Set(files));
    }
  }
  return map;
}

function hasPathInDirMap(dirMap, fullPath) {
  if (!dirMap || dirMap.size === 0 || !fullPath) return false;
  const slash = fullPath.lastIndexOf('/');
  const dir = slash >= 0 ? fullPath.slice(0, slash) : '';
  const base = slash >= 0 ? fullPath.slice(slash + 1) : fullPath;
  const fileSet = dirMap.get(dir);
  return Boolean(fileSet && fileSet.has(base));
}

/**
 * Lazy-loads catalog allowlist sets from api/_allowlist.json (compact v2 prefix-grouped allowlist),
 * legacy public/allowlist.json, or falls back to public/index.json + public/index-cambridge.json (v1 or v2)
 * so API endpoints can reject fabricated paperKeys or non-existent audio subtitle keys.
 */
export function getCatalogAllowlist() {
  if (cachedCatalogAllowlist) return cachedCatalogAllowlist;
  try {
    const allowlistCandidates = [
      path.join(__dirname, '_allowlist.json'),
      path.join(PROJECT_ROOT, 'public', 'allowlist.json')
    ];
    for (const allowlistPath of allowlistCandidates) {
      if (!fs.existsSync(allowlistPath)) continue;
      const raw = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
      if (raw && raw.v === 2 && Array.isArray(raw.s)) {
        const str = raw.s;
        const paperDirMap = buildDirSetMap(
          (raw.pfDirs || []).map((idx) => str[idx] || ''),
          raw.pfFiles || []
        );
        const audioDirMap = buildDirSetMap(
          (raw.afDirs || []).map((idx) => str[idx] || ''),
          raw.afFiles || []
        );
        const validPaperSittings = new Set();
        for (const t of raw.psRows || []) {
          validPaperSittings.add(`${str[t[0]] || ''}|${str[t[1]] || ''}|${str[t[2]] || ''}|${str[t[3]] || ''}|${str[t[4]] || ''}`);
        }
        const validAudioSittings = new Set();
        for (const t of raw.asRows || []) {
          validAudioSittings.add(`${str[t[0]] || ''}|${str[t[1]] || ''}|${str[t[2]] || ''}|${str[t[3]] || ''}|${str[t[4]] || ''}`);
        }
        cachedCatalogAllowlist = {
          v: 2,
          paperDirMap,
          audioDirMap,
          validPaperSittings,
          validAudioSittings,
          validPaperKeys: null,
          validAudioPaths: null
        };
        globalThis.__csCatalogAllowlist = cachedCatalogAllowlist;
        return cachedCatalogAllowlist;
      }
      if (raw && Array.isArray(raw.paperKeys)) {
        cachedCatalogAllowlist = {
          v: 1,
          paperDirMap: null,
          audioDirMap: null,
          validPaperKeys: new Set(raw.paperKeys),
          validPaperSittings: null,
          validAudioPaths: new Set(Array.isArray(raw.audioPaths) ? raw.audioPaths : []),
          validAudioSittings: new Set(Array.isArray(raw.audioSittings) ? raw.audioSittings : [])
        };
        globalThis.__csCatalogAllowlist = cachedCatalogAllowlist;
        return cachedCatalogAllowlist;
      }
    }

    const indexCandidates = [
      path.join(PROJECT_ROOT, 'public', 'index.json'),
      path.join(PROJECT_ROOT, 'public', 'index-cambridge.json')
    ].filter((p) => fs.existsSync(p));
    if (indexCandidates.length === 0) return null;

    const validPaperKeys = new Set();
    const validAudioPaths = new Set();
    const validAudioSittings = new Set();

    for (const indexPath of indexCandidates) {
      const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      if (!raw || !Array.isArray(raw.files)) continue;

      if (raw.v === 2 && Array.isArray(raw.s)) {
        const s = raw.s;
        for (const row of raw.files) {
          const dir = row[0] >= 0 ? s[row[0]] : '';
          const base = row[1] || '';
          const p = dir ? `${dir}/${base}` : base;
          const subj = row[3] >= 0 ? s[row[3]] : '';
          const dt = row[4] >= 0 ? s[row[4]] : '';
          const sess = row[5] >= 0 ? s[row[5]] : '';
          const unit = row[7] >= 0 ? s[row[7]] : '';
          const spec = row[9] >= 0 ? s[row[9]] : '';
          const variant = row[11] >= 0 ? s[row[11]] : '';
          const alts = row[14];

          if (p) validPaperKeys.add(p);
          if (spec && subj && sess) {
            const sittingKey = `${spec}|${subj}|${unit || ''}|${variant || ''}|${sess}`;
            validPaperKeys.add(sittingKey);
            if (dt === 'AUD') validAudioSittings.add(sittingKey);
          }
          if (dt === 'AUD') {
            if (p) validAudioPaths.add(p);
            if (Array.isArray(alts)) {
              for (const ap of alts) {
                if (typeof ap === 'string' && ap) validAudioPaths.add(ap);
              }
            }
          }
        }
        continue;
      }

      if (!Array.isArray(raw.keys)) continue;
      const idxPath = raw.keys.indexOf('path');
      const idxSpec = raw.keys.indexOf('spec');
      const idxSubj = raw.keys.indexOf('subject');
      const idxUnit = raw.keys.indexOf('unitCode');
      const idxVar = raw.keys.indexOf('variant');
      const idxSess = raw.keys.indexOf('session');
      const idxDt = raw.keys.indexOf('docType');
      const idxAlt = raw.keys.indexOf('altPaths');

      for (const row of raw.files) {
        const p = idxPath >= 0 ? row[idxPath] : '';
        const spec = idxSpec >= 0 ? row[idxSpec] : '';
        const subj = idxSubj >= 0 ? row[idxSubj] : '';
        const unit = idxUnit >= 0 ? row[idxUnit] : '';
        const variant = idxVar >= 0 ? row[idxVar] : '';
        const sess = idxSess >= 0 ? row[idxSess] : '';
        const dt = idxDt >= 0 ? row[idxDt] : '';
        const alts = idxAlt >= 0 ? row[idxAlt] : null;

        if (p) validPaperKeys.add(p);
        if (spec && subj && sess) {
          const sittingKey = `${spec}|${subj}|${unit || ''}|${variant || ''}|${sess}`;
          validPaperKeys.add(sittingKey);
          if (dt === 'AUD') validAudioSittings.add(sittingKey);
        }
        if (dt === 'AUD') {
          if (p) validAudioPaths.add(p);
          if (Array.isArray(alts)) {
            for (const ap of alts) {
              if (typeof ap === 'string' && ap) validAudioPaths.add(ap);
            }
          }
        }
      }
    }

    cachedCatalogAllowlist = {
      v: 1,
      paperDirMap: null,
      audioDirMap: null,
      validPaperKeys,
      validPaperSittings: null,
      validAudioPaths,
      validAudioSittings
    };
    globalThis.__csCatalogAllowlist = cachedCatalogAllowlist;
    return cachedCatalogAllowlist;
  } catch {
    return null;
  }
}

let cachedStaticSubKeys = globalThis.__csStaticSubAllowKeys || null;

function getStaticSubtitleKeySet() {
  if (cachedStaticSubKeys) return cachedStaticSubKeys;
  try {
    const mp = path.join(PROJECT_ROOT, 'public', 'subtitles', 'manifest.json');
    if (fs.existsSync(mp)) {
      const parsed = JSON.parse(fs.readFileSync(mp, 'utf8'));
      if (parsed && parsed.keys && typeof parsed.keys === 'object') {
        cachedStaticSubKeys = new Set(Object.keys(parsed.keys));
        globalThis.__csStaticSubAllowKeys = cachedStaticSubKeys;
        return cachedStaticSubKeys;
      }
    }
  } catch {
    // Ignore read errors
  }
  cachedStaticSubKeys = new Set();
  globalThis.__csStaticSubAllowKeys = cachedStaticSubKeys;
  return cachedStaticSubKeys;
}

export function isKnownSubtitleTrackKey(trackKey) {
  const allowlist = getCatalogAllowlist();
  if (!allowlist) return true;
  const key = String(trackKey || '').trim();
  const staticKeys = getStaticSubtitleKeySet();
  if (staticKeys.has(key)) return true;
  const checkBase = (candidate) => {
    if (staticKeys.has(candidate)) return true;
    if (allowlist.validAudioSittings.has(candidate)) return true;
    if (allowlist.v === 2) return hasPathInDirMap(allowlist.audioDirMap, candidate);
    return Boolean(allowlist.validAudioPaths && allowlist.validAudioPaths.has(candidate));
  };
  if (checkBase(key)) return true;
  const hashIdx = key.indexOf('#');
  if (hashIdx > 0) {
    return checkBase(key.slice(0, hashIdx));
  }
  return false;
}

export function isKnownPaperKey(paperKey) {
  const allowlist = getCatalogAllowlist();
  if (!allowlist) return true;
  const key = String(paperKey || '').trim();
  if (allowlist.v === 2) {
    if (key.includes('|')) return allowlist.validPaperSittings.has(key);
    return hasPathInDirMap(allowlist.paperDirMap, key);
  }
  return Boolean(allowlist.validPaperKeys && allowlist.validPaperKeys.has(key));
}

export function parsePositiveInt(raw) {
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

export function hashIdentifier(raw) {
  return crypto.createHash('sha256').update(String(raw || 'anon')).digest('hex').slice(0, 20);
}

export function isValidPaperKey(key) {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 3 || trimmed.length > PAPER_KEY_MAX_LEN) return false;
  if (trimmed.includes('$') || trimmed.includes('{') || trimmed.includes('}')) return false;
  return PAPER_KEY_REGEX.test(trimmed);
}

export function isValidSubtitleKey(key) {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 3 || trimmed.length > PAPER_KEY_MAX_LEN) return false;
  if (trimmed.includes('$') || trimmed.includes('{') || trimmed.includes('}')) return false;
  return SUBTITLE_KEY_REGEX.test(trimmed);
}

export function isAllowedOrigin(req, requireHeader = false) {
  const origin = req.headers['origin'] || '';
  const referer = req.headers['referer'] || '';
  if (!origin && !referer) return !requireHeader;
  const exactHosts = new Set([
    'localhost',
    '127.0.0.1',
    'conceptualist.uk',
    'www.conceptualist.uk'
  ]);
  for (const envHost of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
  ]) {
    if (envHost) exactHosts.add(String(envHost).trim().toLowerCase());
  }
  const target = origin || referer;
  try {
    const url = new URL(target);
    const host = url.hostname.toLowerCase();
    if (exactHosts.has(host)) return true;
    // Allow only project/team-scoped Vercel preview deployments
    if (/^conceptualist-library-[a-z0-9-]+-con-artist-1s-projects\.vercel\.app$/i.test(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function getClientIp(req) {
  const vercelFwd = req.headers['x-vercel-forwarded-for'];
  if (typeof vercelFwd === 'string' && vercelFwd.trim()) {
    const parts = vercelFwd.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

export async function checkDistributedRateLimit(db, bucket, key, windowMs = 60000, maxRequests = 45) {
  if (!db) return true;
  try {
    const col = db.collection(COLLECTION_RATE_LIMITS);
    if (!rateLimitTtlInitialized) {
      rateLimitTtlInitialized = true;
      globalThis.__csRateLimitTtlInitialized = true;
      void col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true }).catch(() => {
        rateLimitTtlInitialized = false;
        globalThis.__csRateLimitTtlInitialized = false;
      });
    }
    const windowBucket = Math.floor(Date.now() / windowMs);
    const id = `${bucket}:${hashIdentifier(key)}:${windowBucket}`;
    const expiresAt = new Date((windowBucket + 2) * windowMs);
    const res = await col.findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: 'after', projection: { count: 1 } }
    );
    const doc = res?.value !== undefined ? res.value : res;
    return !doc || Number(doc.count) <= maxRequests;
  } catch {
    return true;
  }
}

export function checkSlidingRateLimit(rateMap, key, windowMs = 60000, maxRequests = 45) {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    rateMap.set(key, { windowStart: now, count: 1 });
    if (rateMap.size > 2000) {
      for (const [k, v] of rateMap.entries()) {
        if (now - v.windowStart > windowMs) rateMap.delete(k);
      }
    }
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

export function readEnvCandidates() {
  const candidates = [
    path.join(PROJECT_ROOT, '.env.local'),
    path.resolve(process.cwd(), '.env.local'),
    path.join(PROJECT_ROOT, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.join(PROJECT_ROOT, 'atlas_cred.env'),
    path.resolve(process.cwd(), 'atlas_cred.env')
  ];
  const merged = {};
  for (const candidate of candidates) {
    const parsed = parseEnvFile(candidate);
    for (const [k, v] of Object.entries(parsed)) {
      if (v && !merged[k]) merged[k] = v;
    }
  }
  return merged;
}

export function resolveMongoConfig() {
  let uri = process.env.MONGODB_URI || '';
  let username = process.env.MONGODB_USERNAME || '';
  let password = process.env.MONGODB_PASSWORD || '';
  let dbName = process.env.MONGODB_DB || '';

  if (!uri || !uri.includes('.mongodb.net')) {
    const fileEnv = readEnvCandidates();
    if (fileEnv.MONGODB_URI) uri = fileEnv.MONGODB_URI;
    if (fileEnv.MONGODB_USERNAME) username = fileEnv.MONGODB_USERNAME;
    if (fileEnv.MONGODB_PASSWORD) password = fileEnv.MONGODB_PASSWORD;
    if (fileEnv.MONGODB_DB) dbName = fileEnv.MONGODB_DB;
  }

  // Repair truncated URI if atlas_cred.env had a cut-off line
  if (uri && uri.endsWith('.m') && username && password) {
    const hostMatch = uri.match(/@([a-zA-Z0-9.-]+)\.m$/);
    if (hostMatch && hostMatch[1]) {
      uri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostMatch[1]}.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
    }
  }

  return {
    uri,
    dbName: dbName || DB_NAME_DEFAULT
  };
}

export async function getMongoDatabase() {
  const { uri, dbName } = resolveMongoConfig();
  if (!uri) {
    throw new Error('MongoDB connection credentials are not configured on the server.');
  }

  const now = Date.now();
  if (!cachedMongoClientPromise && now - lastMongoFailAt < MONGO_RETRY_BACKOFF_MS) {
    throw new Error('MongoDB connection in retry backoff window.');
  }

  if (!cachedMongoClientPromise) {
    cachedMongoClientPromise = (async () => {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(uri, {
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 6000,
        connectTimeoutMS: 6000
      });
      return client.connect();
    })().catch((err) => {
      cachedMongoClientPromise = null;
      globalThis.__csMongoClientPromise = null;
      lastMongoFailAt = Date.now();
      globalThis.__csLastMongoFailAt = lastMongoFailAt;
      if (!hasLoggedAtlasWarning) {
        hasLoggedAtlasWarning = true;
        globalThis.__csHasLoggedAtlasWarning = true;
        console.warn(
          '[mongodb] Atlas connection failed:',
          err?.message || err,
          '\n-> Ensure your IP / 0.0.0.0/0 is whitelisted in MongoDB Atlas (Security -> Network Access).'
        );
      }
      throw err;
    });
    globalThis.__csMongoClientPromise = cachedMongoClientPromise;
  }

  const client = await cachedMongoClientPromise;
  return client.db(dbName);
}

export async function readJsonBody(req, maxBytes = 8192) {
  let body = req.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    const serializedLen = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (serializedLen > maxBytes) {
      throw new Error('Payload too large');
    }
    return body;
  }
  const raw =
    typeof body === 'string'
      ? (() => {
          if (Buffer.byteLength(body, 'utf8') > maxBytes) {
            throw new Error('Payload too large');
          }
          return body;
        })()
      : Buffer.isBuffer(body)
        ? (() => {
            if (body.byteLength > maxBytes) {
              throw new Error('Payload too large');
            }
            return body.toString('utf8');
          })()
        : await new Promise((resolve, reject) => {
            let data = '';
            let byteLen = 0;
            let settled = false;
            req.on('data', (chunk) => {
              if (settled) return;
              const chunkBytes = Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(String(chunk), 'utf8');
              byteLen += chunkBytes;
              if (byteLen > maxBytes) {
                settled = true;
                try {
                  if (typeof req.destroy === 'function') req.destroy();
                } catch {
                  // Ignore destroy error
                }
                reject(new Error('Payload too large'));
                return;
              }
              data += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
            });
            req.on('end', () => {
              if (!settled) {
                settled = true;
                resolve(data);
              }
            });
            req.on('error', (err) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            });
          });
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

export function sendJsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(payload));
}

