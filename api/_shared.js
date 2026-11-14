import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');

export const DB_NAME_DEFAULT = 'conceptualist_library';
export const COLLECTION_VIEWS = 'paper_views';
export const COLLECTION_SESSIONS = 'site_sessions';

export const PAPER_KEY_MAX_LEN = 220;
export const PAPER_KEY_REGEX = /^[A-Za-z0-9|_\-. (),/+&]+$/;

const MONGO_RETRY_BACKOFF_MS = 15 * 1000;
let cachedMongoClientPromise = globalThis.__csMongoClientPromise || null;
let lastMongoFailAt = globalThis.__csLastMongoFailAt || 0;
let hasLoggedAtlasWarning = globalThis.__csHasLoggedAtlasWarning || false;

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

export function isAllowedOrigin(req, requireHeader = false) {
  const origin = req.headers['origin'] || '';
  const referer = req.headers['referer'] || '';
  if (!origin && !referer) return !requireHeader;
  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    'conceptualist.uk',
    'www.conceptualist.uk',
    '.vercel.app'
  ];
  const target = origin || referer;
  try {
    const url = new URL(target);
    return allowedHosts.some((h) =>
      h.startsWith('.') ? url.hostname.endsWith(h) : url.hostname === h
    );
  } catch {
    return false;
  }
}

export function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
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
    const clusterHost = hostMatch ? hostMatch[1] : 'cluster0.4sqcgaf';
    uri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${clusterHost}.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
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
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000
    });
    cachedMongoClientPromise = client.connect().catch((err) => {
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
    return body;
  }
  const raw =
    typeof body === 'string'
      ? body
      : Buffer.isBuffer(body)
        ? body.toString('utf8')
        : await new Promise((resolve, reject) => {
            let data = '';
            req.on('data', (chunk) => {
              data += chunk;
              if (Buffer.byteLength(data, 'utf8') > maxBytes) {
                reject(new Error('Payload too large'));
              }
            });
            req.on('end', () => resolve(data));
            req.on('error', reject);
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

