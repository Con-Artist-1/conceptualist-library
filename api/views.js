import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DB_NAME_DEFAULT = 'conceptualist_library';
const COLLECTION_NAME = 'paper_views';
const PAPER_KEY_MAX_LEN = 220;
const PAPER_KEY_REGEX = /^[A-Za-z0-9|_\-. (),/+&]+$/;

// Strict 30-second cooldown before the same user can add another view to the same paper
const PAPER_VIEW_COOLDOWN_MS = 30 * 1000; // 30 seconds

// Global per-IP burst rate limiter against automated scraping/flooding
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_POSTS_PER_WINDOW = 45;
const ipRateMap = globalThis.__csIpRateMap || (globalThis.__csIpRateMap = new Map());

// Server-side 30-second per-user per-paper cooldown tracker
const paperCooldownMap = globalThis.__csPaperCooldownMap || (globalThis.__csPaperCooldownMap = new Map());

// Server-side persistent fallback store (used if MongoDB Atlas IP whitelist blocks connection, and synced to MongoDB once reachable)
const LOCAL_STORE_DIR = path.join(PROJECT_ROOT, '.data');
const LOCAL_STORE_FILE = path.join(LOCAL_STORE_DIR, 'paper_views.json');
let memoryViewsStore = globalThis.__csMemoryViewsStore || null;
let hasSyncedFallbackToMongo = false;
let lastMongoFailAt = 0;
let hasLoggedAtlasWarning = false;
const MONGO_RETRY_BACKOFF_MS = 15 * 1000;

function loadLocalServerStore() {
  if (memoryViewsStore) return memoryViewsStore;
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf-8'));
      if (parsed && typeof parsed.counts === 'object') {
        memoryViewsStore = {
          counts: { ...parsed.counts },
          dirtyKeys: new Set(Array.isArray(parsed.dirtyKeys) ? parsed.dirtyKeys : Object.keys(parsed.counts))
        };
        globalThis.__csMemoryViewsStore = memoryViewsStore;
        return memoryViewsStore;
      }
    }
  } catch {
    // Ignore local filesystem read errors (e.g. read-only serverless container)
  }
  memoryViewsStore = { counts: Object.create(null), dirtyKeys: new Set() };
  globalThis.__csMemoryViewsStore = memoryViewsStore;
  return memoryViewsStore;
}

function saveLocalServerStore(store) {
  try {
    if (!fs.existsSync(LOCAL_STORE_DIR)) {
      fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(
      LOCAL_STORE_FILE,
      JSON.stringify(
        {
          counts: store.counts,
          dirtyKeys: Array.from(store.dirtyKeys),
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch {
    // Ignore read-only filesystem errors on serverless platforms
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipRateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    ipRateMap.set(ip, { windowStart: now, count: 1 });
    if (ipRateMap.size > 2000) {
      for (const [k, v] of ipRateMap.entries()) {
        if (now - v.windowStart > RATE_WINDOW_MS) ipRateMap.delete(k);
      }
    }
    return true;
  }
  if (entry.count >= MAX_POSTS_PER_WINDOW) {
    return false;
  }
  entry.count += 1;
  return true;
}

function hashIdentifier(raw) {
  return crypto.createHash('sha256').update(String(raw || 'anon')).digest('hex').slice(0, 20);
}

function getCooldownRemainingMs(ipHash, vidHash, paperKey, now = Date.now()) {
  // Prune expired entries occasionally
  if (paperCooldownMap.size > 5000) {
    for (const [k, ts] of paperCooldownMap.entries()) {
      if (now - ts >= PAPER_VIEW_COOLDOWN_MS) paperCooldownMap.delete(k);
    }
  }
  const ipKey = `ip:${ipHash}|${paperKey}`;
  const lastIpTs = paperCooldownMap.get(ipKey) || 0;
  if (now - lastIpTs < PAPER_VIEW_COOLDOWN_MS) {
    return PAPER_VIEW_COOLDOWN_MS - (now - lastIpTs);
  }
  if (vidHash) {
    const vidKey = `vid:${vidHash}|${paperKey}`;
    const lastVidTs = paperCooldownMap.get(vidKey) || 0;
    if (now - lastVidTs < PAPER_VIEW_COOLDOWN_MS) {
      return PAPER_VIEW_COOLDOWN_MS - (now - lastVidTs);
    }
  }
  return 0;
}

function recordCooldownTimestamp(ipHash, vidHash, paperKey, now = Date.now()) {
  paperCooldownMap.set(`ip:${ipHash}|${paperKey}`, now);
  if (vidHash) {
    paperCooldownMap.set(`vid:${vidHash}|${paperKey}`, now);
  }
}

function parseEnvFile(filePath) {
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

function resolveMongoConfig() {
  let uri = process.env.MONGODB_URI || '';
  let username = process.env.MONGODB_USERNAME || '';
  let password = process.env.MONGODB_PASSWORD || '';
  let dbName = process.env.MONGODB_DB || '';

  if (!uri || !uri.includes('.mongodb.net')) {
    const envCandidates = [
      path.join(PROJECT_ROOT, 'atlas_cred.env'),
      path.resolve(process.cwd(), 'atlas_cred.env'),
      path.join(PROJECT_ROOT, '.env.local'),
      path.resolve(process.cwd(), '.env.local'),
      path.join(PROJECT_ROOT, '.env'),
      path.resolve(process.cwd(), '.env')
    ];
    for (const candidate of envCandidates) {
      const parsed = parseEnvFile(candidate);
      if (parsed.MONGODB_URI) uri = parsed.MONGODB_URI;
      if (parsed.MONGODB_USERNAME) username = parsed.MONGODB_USERNAME;
      if (parsed.MONGODB_PASSWORD) password = parsed.MONGODB_PASSWORD;
      if (parsed.MONGODB_DB) dbName = parsed.MONGODB_DB;
      if (uri) break;
    }
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

let cachedClientPromise = globalThis.__csMongoClientPromise || null;

async function getViewsCollection() {
  const { uri, dbName } = resolveMongoConfig();
  if (!uri) {
    throw new Error('MongoDB connection credentials are not configured on the server.');
  }

  const now = Date.now();
  if (!cachedClientPromise && now - lastMongoFailAt < MONGO_RETRY_BACKOFF_MS) {
    throw new Error('MongoDB connection in retry backoff window.');
  }

  if (!cachedClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000
    });
    cachedClientPromise = client.connect().catch((err) => {
      cachedClientPromise = null;
      globalThis.__csMongoClientPromise = null;
      lastMongoFailAt = Date.now();
      if (!hasLoggedAtlasWarning) {
        hasLoggedAtlasWarning = true;
        console.warn(
          '[api/views] MongoDB Atlas connection failed:',
          err?.message || err,
          '\n-> Ensure your current IP / 0.0.0.0/0 is whitelisted in MongoDB Atlas (Security -> Network Access). Using persistent server store until Atlas is reachable.'
        );
      }
      throw err;
    });
    globalThis.__csMongoClientPromise = cachedClientPromise;
  }

  const client = await cachedClientPromise;
  const col = client.db(dbName).collection(COLLECTION_NAME);

  // Sync any locally buffered server views into MongoDB Atlas once connected
  if (!hasSyncedFallbackToMongo) {
    hasSyncedFallbackToMongo = true;
    const store = loadLocalServerStore();
    if (store.dirtyKeys.size > 0) {
      const nowIso = new Date().toISOString();
      const ops = [];
      for (const k of store.dirtyKeys) {
        const count = Number(store.counts[k]) || 0;
        if (count > 0 && isValidPaperKey(k)) {
          ops.push({
            updateOne: {
              filter: { _id: k },
              update: {
                $max: { views: count },
                $set: { updatedAt: nowIso },
                $setOnInsert: { createdAt: nowIso }
              },
              upsert: true
            }
          });
        }
      }
      if (ops.length > 0) {
        col.bulkWrite(ops, { ordered: false })
          .then(() => {
            store.dirtyKeys.clear();
            saveLocalServerStore(store);
          })
          .catch(() => {
            hasSyncedFallbackToMongo = false;
          });
      }
    }
  }

  return col;
}

function isValidPaperKey(key) {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 3 || trimmed.length > PAPER_KEY_MAX_LEN) return false;
  if (trimmed.includes('$') || trimmed.includes('{') || trimmed.includes('}')) return false;
  return PAPER_KEY_REGEX.test(trimmed);
}

function isAllowedOrigin(req) {
  const origin = req.headers['origin'] || '';
  const referer = req.headers['referer'] || '';
  if (!origin && !referer) return true;
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

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!isAllowedOrigin(req)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Forbidden origin' }));
  }

  if (req.method === 'GET') {
    const store = loadLocalServerStore();
    try {
      const col = await getViewsCollection();
      const cursor = col.find(
        {},
        {
          projection: { _id: 1, views: 1 },
          limit: 10000
        }
      );
      const docs = await cursor.toArray();
      const counts = Object.create(null);
      for (const [k, v] of Object.entries(store.counts)) {
        if (typeof v === 'number' && v > 0) counts[k] = v;
      }
      for (const doc of docs) {
        if (typeof doc._id === 'string' && typeof doc.views === 'number') {
          counts[doc._id] = Math.max(doc.views, counts[doc._id] || 0);
          store.counts[doc._id] = counts[doc._id];
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, source: 'mongodb', counts }));
    } catch {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, source: 'server-store', counts: store.counts }));
    }
  }

  if (req.method === 'POST') {
    const clientIp =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    if (!checkRateLimit(clientIp)) {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, error: 'Too many requests' }));
    }

    let paperKey = '';
    let viewerId = '';
    try {
      let body = req.body;
      if (!body || typeof body === 'string') {
        const raw = typeof body === 'string' ? body : await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', (chunk) => {
            data += chunk;
            if (data.length > 4096) {
              reject(new Error('Payload too large'));
            }
          });
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        body = raw ? JSON.parse(raw) : {};
      }

      paperKey = typeof body?.paperKey === 'string' ? body.paperKey.trim() : '';
      viewerId = typeof body?.viewerId === 'string' ? body.viewerId.trim().slice(0, 64) : '';
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, error: 'Malformed JSON body' }));
    }

    if (!isValidPaperKey(paperKey)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, error: 'Invalid paperKey' }));
    }

    const now = Date.now();
    const ipHash = hashIdentifier(clientIp);
    const vidHash = viewerId ? hashIdentifier(viewerId) : '';
    const store = loadLocalServerStore();

    // 1. Check in-memory 30-second cooldown for this user + paper
    const memRemainingMs = getCooldownRemainingMs(ipHash, vidHash, paperKey, now);
    if (memRemainingMs > 0) {
      let currentViews = Number(store.counts[paperKey]) || 0;
      try {
        const col = await getViewsCollection();
        const existing = await col.findOne({ _id: paperKey }, { projection: { _id: 1, views: 1 } });
        if (typeof existing?.views === 'number') {
          currentViews = Math.max(currentViews, existing.views);
          store.counts[paperKey] = currentViews;
        }
      } catch {
        // Fallback to server store count
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({
          ok: true,
          paperKey,
          views: currentViews,
          incremented: false,
          cooldownRemainingMs: memRemainingMs
        })
      );
    }

    // 2. Check MongoDB (including distributed 30s cooldown across serverless instances) and atomically increment
    try {
      const col = await getViewsCollection();
      const existing = await col.findOne(
        { _id: paperKey },
        { projection: { _id: 1, views: 1, cooldowns: 1 } }
      );

      const dbCooldowns = existing?.cooldowns && typeof existing.cooldowns === 'object' ? existing.cooldowns : {};
      const lastDbIpTs = Number(dbCooldowns[ipHash]) || 0;
      const lastDbVidTs = vidHash ? Number(dbCooldowns[vidHash]) || 0 : 0;
      const lastDbTs = Math.max(lastDbIpTs, lastDbVidTs);

      if (lastDbTs > 0 && now - lastDbTs < PAPER_VIEW_COOLDOWN_MS) {
        recordCooldownTimestamp(ipHash, vidHash, paperKey, lastDbTs);
        const currentViews = typeof existing?.views === 'number' ? existing.views : (Number(store.counts[paperKey]) || 0);
        store.counts[paperKey] = currentViews;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(
          JSON.stringify({
            ok: true,
            paperKey,
            views: currentViews,
            incremented: false,
            cooldownRemainingMs: PAPER_VIEW_COOLDOWN_MS - (now - lastDbTs)
          })
        );
      }

      // Prune expired cooldown entries (>30s old) so the document stays compact
      const activeCooldowns = {};
      for (const [k, ts] of Object.entries(dbCooldowns)) {
        if (typeof ts === 'number' && now - ts < PAPER_VIEW_COOLDOWN_MS) {
          activeCooldowns[k] = ts;
        }
      }
      activeCooldowns[ipHash] = now;
      if (vidHash) activeCooldowns[vidHash] = now;

      recordCooldownTimestamp(ipHash, vidHash, paperKey, now);

      const nowIso = new Date(now).toISOString();
      const updateResult = await col.findOneAndUpdate(
        { _id: paperKey },
        {
          $inc: { views: 1 },
          $set: {
            updatedAt: nowIso,
            cooldowns: activeCooldowns
          },
          $setOnInsert: { createdAt: nowIso }
        },
        {
          upsert: true,
          returnDocument: 'after',
          projection: { _id: 1, views: 1 }
        }
      );

      const updatedDoc = updateResult?.value !== undefined ? updateResult.value : updateResult;
      const newViews = typeof updatedDoc?.views === 'number' ? updatedDoc.views : 1;
      store.counts[paperKey] = newViews;
      saveLocalServerStore(store);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({
          ok: true,
          source: 'mongodb',
          paperKey,
          views: newViews,
          incremented: true,
          cooldownRemainingMs: PAPER_VIEW_COOLDOWN_MS
        })
      );
    } catch {
      // MongoDB temporarily unreachable (e.g. IP not yet whitelisted in Atlas): record in server store and queue for sync
      recordCooldownTimestamp(ipHash, vidHash, paperKey, now);
      const nextViews = (Number(store.counts[paperKey]) || 0) + 1;
      store.counts[paperKey] = nextViews;
      store.dirtyKeys.add(paperKey);
      saveLocalServerStore(store);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({
          ok: true,
          source: 'server-store',
          paperKey,
          views: nextViews,
          incremented: true,
          cooldownRemainingMs: PAPER_VIEW_COOLDOWN_MS
        })
      );
    }
  }

  res.statusCode = 405;
  res.setHeader('Allow', 'GET, POST');
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
}
