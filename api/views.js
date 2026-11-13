import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { createClient as createRedisClient } from 'redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DB_NAME_DEFAULT = 'conceptualist_library';
const COLLECTION_NAME = 'paper_views';
const PAPER_KEY_MAX_LEN = 220;
const PAPER_KEY_REGEX = /^[A-Za-z0-9|_\-. (),/+&]+$/;

// Strict 30-second cooldown before the same user can add another view to the same paper
const PAPER_VIEW_COOLDOWN_MS = 30 * 1000;

// Redis cache lifespan (~1 hour)
const REDIS_CACHE_TTL_SECONDS = 3600;
const REDIS_CACHE_TTL_MS = REDIS_CACHE_TTL_SECONDS * 1000;
const DEGRADED_RETRY_TTL_MS = 30 * 1000;
const REDIS_VIEWS_HASH_KEY = 'cs:paper_views:v1';
const REDIS_CACHE_META_FIELD = '__meta:cachedAt';
const REDIS_COOLDOWN_PREFIX = 'cs:cooldown:v1';
const REDIS_RETRY_BACKOFF_MS = 5 * 1000;

// Global per-IP burst rate limiter against automated scraping/flooding
const RATE_WINDOW_MS = 60 * 1000;
const MAX_POSTS_PER_WINDOW = 45;
const ipRateMap = globalThis.__csIpRateMap || (globalThis.__csIpRateMap = new Map());

// Server-side 30-second per-user per-paper cooldown tracker
const paperCooldownMap = globalThis.__csPaperCooldownMap || (globalThis.__csPaperCooldownMap = new Map());

// Server-side persistent fallback store (used if MongoDB is temporarily unreachable and synced once reachable)
const LOCAL_STORE_DIR = path.join(PROJECT_ROOT, '.data');
const LOCAL_STORE_FILE = path.join(LOCAL_STORE_DIR, 'paper_views.json');
let memoryViewsStore = globalThis.__csMemoryViewsStore || null;
let cachedGetResult = globalThis.__csViewsGetCache || null;
let inflightHydratePromise = globalThis.__csInflightViewsHydrate || null;
let hasSyncedFallbackToMongo = false;
let lastMongoFailAt = 0;
let hasLoggedAtlasWarning = false;
const MONGO_RETRY_BACKOFF_MS = 15 * 1000;

let cachedRedisPromise = globalThis.__csRedisClientPromise || null;
let cachedRedisClient = globalThis.__csRedisClient || null;
let lastRedisFailAt = globalThis.__csLastRedisFailAt || 0;
let hasLoggedRedisWarning = globalThis.__csHasLoggedRedisWarning || false;

function parsePositiveViewInt(raw) {
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function loadLocalServerStore() {
  if (memoryViewsStore) return memoryViewsStore;
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf-8'));
      const rawMap =
        parsed && typeof parsed.views === 'object'
          ? parsed.views
          : parsed && typeof parsed.counts === 'object'
            ? parsed.counts
            : null;
      if (rawMap) {
        const cleanViews = Object.create(null);
        for (const [k, v] of Object.entries(rawMap)) {
          const val = parsePositiveViewInt(v);
          if (val > 0) cleanViews[k] = val;
        }
        memoryViewsStore = {
          views: cleanViews,
          dirtyKeys: new Set(Array.isArray(parsed.dirtyKeys) ? parsed.dirtyKeys : Object.keys(cleanViews))
        };
        globalThis.__csMemoryViewsStore = memoryViewsStore;
        return memoryViewsStore;
      }
    }
  } catch {
    // Ignore local filesystem read errors (e.g. read-only serverless container)
  }
  memoryViewsStore = { views: Object.create(null), dirtyKeys: new Set() };
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
          views: store.views,
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

function readEnvCandidates() {
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

function resolveMongoConfig() {
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

function resolveRedisUrl() {
  const fileEnv = readEnvCandidates();
  const explicitUrl =
    process.env.REDIS_URL ||
    process.env.KV_URL ||
    fileEnv.REDIS_URL ||
    fileEnv.KV_URL ||
    '';
  if (explicitUrl === 'false' || explicitUrl === 'disabled') {
    return '';
  }
  if (explicitUrl) {
    return explicitUrl;
  }
  // Locally (non-Vercel), connect to the local Redis server on 127.0.0.1:6379
  if (!process.env.VERCEL) {
    return 'redis://127.0.0.1:6379';
  }
  return '';
}

async function getRedisClient() {
  const url = resolveRedisUrl();
  if (!url) return null;

  if (cachedRedisClient && cachedRedisClient.isReady) {
    return cachedRedisClient;
  }

  const now = Date.now();
  if (!cachedRedisPromise && now - lastRedisFailAt < REDIS_RETRY_BACKOFF_MS) {
    return null;
  }

  if (!cachedRedisPromise) {
    const client = createRedisClient({
      url,
      socket: {
        connectTimeout: 1500,
        reconnectStrategy: false
      }
    });
    client.on('error', () => {
      // Prevent unhandled error event crashes when Redis stops or drops
    });
    cachedRedisPromise = client
      .connect()
      .then(() => {
        cachedRedisClient = client;
        globalThis.__csRedisClient = client;
        hasLoggedRedisWarning = false;
        globalThis.__csHasLoggedRedisWarning = false;
        return client;
      })
      .catch((err) => {
        cachedRedisClient = null;
        cachedRedisPromise = null;
        globalThis.__csRedisClient = null;
        globalThis.__csRedisClientPromise = null;
        lastRedisFailAt = Date.now();
        globalThis.__csLastRedisFailAt = lastRedisFailAt;
        if (!hasLoggedRedisWarning) {
          hasLoggedRedisWarning = true;
          globalThis.__csHasLoggedRedisWarning = true;
          console.warn(
            '[api/views] Redis unavailable (using in-process 1h cache + MongoDB fallback):',
            err?.message || err
          );
        }
        try {
          client.destroy();
        } catch {
          // Ignore cleanup errors
        }
        return null;
      });
    globalThis.__csRedisClientPromise = cachedRedisPromise;
  }

  return cachedRedisPromise;
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
        const count = Number(store.views[k]) || 0;
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

function isAllowedOrigin(req, requireHeader = false) {
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

function buildRedisCooldownKeys(ipHash, vidHash, paperKey) {
  const keyHash = hashIdentifier(paperKey);
  const ipKey = `${REDIS_COOLDOWN_PREFIX}:ip:${ipHash}:${keyHash}`;
  const vidKey = vidHash ? `${REDIS_COOLDOWN_PREFIX}:vid:${vidHash}:${keyHash}` : '';
  return { ipKey, vidKey };
}

async function getRedisCooldownRemainingMs(redis, ipHash, vidHash, paperKey) {
  if (!redis) return 0;
  try {
    const { ipKey, vidKey } = buildRedisCooldownKeys(ipHash, vidHash, paperKey);
    const ipPttl = await redis.pTTL(ipKey);
    if (ipPttl > 0) return ipPttl;
    if (vidKey) {
      const vidPttl = await redis.pTTL(vidKey);
      if (vidPttl > 0) return vidPttl;
    }
  } catch {
    // Ignore transient Redis read errors
  }
  return 0;
}

async function setRedisCooldown(redis, ipHash, vidHash, paperKey, ttlMs = PAPER_VIEW_COOLDOWN_MS) {
  if (!redis || ttlMs <= 0) return;
  try {
    const { ipKey, vidKey } = buildRedisCooldownKeys(ipHash, vidHash, paperKey);
    const tx = redis.multi().set(ipKey, '1', { PX: Math.max(1, Math.floor(ttlMs)) });
    if (vidKey) {
      tx.set(vidKey, '1', { PX: Math.max(1, Math.floor(ttlMs)) });
    }
    await tx.exec();
  } catch {
    // Best-effort Redis cooldown write
  }
}

async function getRedisCacheTiming(redis, now = Date.now()) {
  if (!redis) {
    if (cachedGetResult && cachedGetResult.expiresAt > now) {
      const ttlRemainingMs = cachedGetResult.expiresAt - now;
      return {
        cachedAt: cachedGetResult.cachedAt,
        expiresAt: cachedGetResult.expiresAt,
        ttlRemainingMs,
        ttlSeconds: Math.ceil(ttlRemainingMs / 1000)
      };
    }
    return null;
  }
  try {
    const [pttl, metaCachedAt] = await Promise.all([
      redis.pTTL(REDIS_VIEWS_HASH_KEY),
      redis.hGet(REDIS_VIEWS_HASH_KEY, REDIS_CACHE_META_FIELD)
    ]);
    if (pttl > 0 && metaCachedAt !== null) {
      const ttlRemainingMs = Math.min(pttl, REDIS_CACHE_TTL_MS);
      const expiresAt = now + ttlRemainingMs;
      const cachedAt = Number(metaCachedAt) || (expiresAt - REDIS_CACHE_TTL_MS);
      return {
        cachedAt,
        expiresAt,
        ttlRemainingMs,
        ttlSeconds: Math.ceil(ttlRemainingMs / 1000)
      };
    }
  } catch {
    // Ignore Redis timing probe failures
  }
  return null;
}

async function updateRedisCachedPaperViews(redis, paperKey, newViews, now = Date.now()) {
  if (!redis || !paperKey) return null;
  try {
    // Atomically HSET only while key still has a positive TTL, preserving the ~1 hour lifespan
    const luaResult = await redis.eval(
      "local p = redis.call('PTTL', KEYS[1]); if p > 0 then redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]); return { p, redis.call('HGET', KEYS[1], ARGV[3]) }; end; return nil",
      {
        keys: [REDIS_VIEWS_HASH_KEY],
        arguments: [paperKey, String(newViews), REDIS_CACHE_META_FIELD]
      }
    );
    if (Array.isArray(luaResult) && Number(luaResult[0]) > 0) {
      const ttlRemainingMs = Math.min(Number(luaResult[0]), REDIS_CACHE_TTL_MS);
      const expiresAt = now + ttlRemainingMs;
      return {
        updated: true,
        cachedAt: Number(luaResult[1]) || (expiresAt - REDIS_CACHE_TTL_MS),
        expiresAt,
        ttlRemainingMs,
        ttlSeconds: Math.ceil(ttlRemainingMs / 1000)
      };
    }
  } catch {
    // Fallback if server restricts EVAL
    try {
      const pttl = await redis.pTTL(REDIS_VIEWS_HASH_KEY);
      if (pttl > 0) {
        await redis.hSet(REDIS_VIEWS_HASH_KEY, paperKey, String(newViews));
        const metaCachedAt = await redis.hGet(REDIS_VIEWS_HASH_KEY, REDIS_CACHE_META_FIELD);
        const ttlRemainingMs = Math.min(pttl, REDIS_CACHE_TTL_MS);
        const expiresAt = now + ttlRemainingMs;
        return {
          updated: true,
          cachedAt: Number(metaCachedAt) || (expiresAt - REDIS_CACHE_TTL_MS),
          expiresAt,
          ttlRemainingMs,
          ttlSeconds: Math.ceil(ttlRemainingMs / 1000)
        };
      }
    } catch {
      // Ignore Redis write error; MongoDB remains authoritative
    }
  }
  return null;
}

async function readSinglePaperViewsFromRedis(redis, paperKey) {
  if (!redis || !paperKey) return null;
  try {
    const pttl = await redis.pTTL(REDIS_VIEWS_HASH_KEY);
    if (pttl <= 0) return null;
    const [metaCachedAt, rawVal] = await redis.hmGet(REDIS_VIEWS_HASH_KEY, [REDIS_CACHE_META_FIELD, paperKey]);
    if (metaCachedAt === null) return null;
    const now = Date.now();
    const ttlRemainingMs = Math.min(pttl, REDIS_CACHE_TTL_MS);
    const expiresAt = now + ttlRemainingMs;
    return {
      views: parsePositiveViewInt(rawVal),
      cachedAt: Number(metaCachedAt) || (expiresAt - REDIS_CACHE_TTL_MS),
      expiresAt,
      ttlRemainingMs,
      ttlSeconds: Math.ceil(ttlRemainingMs / 1000)
    };
  } catch {
    return null;
  }
}

async function readAllViewsFromRedis(redis) {
  if (!redis) return null;
  try {
    const pttl = await redis.pTTL(REDIS_VIEWS_HASH_KEY);
    if (pttl <= 0) return null;
    const rawHash = await redis.hGetAll(REDIS_VIEWS_HASH_KEY);
    if (!rawHash || rawHash[REDIS_CACHE_META_FIELD] === undefined) return null;

    const views = Object.create(null);
    for (const [k, v] of Object.entries(rawHash)) {
      if (k === REDIS_CACHE_META_FIELD) continue;
      const parsed = parsePositiveViewInt(v);
      if (parsed > 0) views[k] = parsed;
    }

    const now = Date.now();
    const ttlRemainingMs = Math.min(pttl, REDIS_CACHE_TTL_MS);
    const expiresAt = now + ttlRemainingMs;
    const cachedAt = Number(rawHash[REDIS_CACHE_META_FIELD]) || (expiresAt - REDIS_CACHE_TTL_MS);

    cachedGetResult = { cachedAt, expiresAt, views };
    globalThis.__csViewsGetCache = cachedGetResult;

    return {
      views,
      cachedAt,
      expiresAt,
      ttlRemainingMs,
      ttlSeconds: Math.ceil(ttlRemainingMs / 1000)
    };
  } catch {
    return null;
  }
}

async function hydrateRedisFromDatabase(redis, store) {
  if (inflightHydratePromise) {
    return inflightHydratePromise;
  }

  inflightHydratePromise = (async () => {
    const now = Date.now();
    try {
      const col = await getViewsCollection();
      const docs = await col
        .find({}, { projection: { _id: 1, views: 1 }, limit: 10000 })
        .toArray();

      const views = Object.create(null);
      for (const [k, v] of Object.entries(store.views)) {
        const parsed = parsePositiveViewInt(v);
        if (parsed > 0) views[k] = parsed;
      }
      for (const doc of docs) {
        if (typeof doc._id === 'string' && typeof doc.views === 'number') {
          const merged = Math.max(parsePositiveViewInt(doc.views), views[doc._id] || 0);
          if (merged > 0) {
            views[doc._id] = merged;
            store.views[doc._id] = merged;
          }
        }
      }

      const cachedAt = Date.now();
      const expiresAt = cachedAt + REDIS_CACHE_TTL_MS;
      cachedGetResult = { cachedAt, expiresAt, views };
      globalThis.__csViewsGetCache = cachedGetResult;

      let cachedInRedis = false;
      if (redis) {
        try {
          const hashPayload = { [REDIS_CACHE_META_FIELD]: String(cachedAt) };
          for (const [k, v] of Object.entries(views)) {
            if (v > 0) hashPayload[k] = String(v);
          }
          await redis
            .multi()
            .del(REDIS_VIEWS_HASH_KEY)
            .hSet(REDIS_VIEWS_HASH_KEY, hashPayload)
            .expire(REDIS_VIEWS_HASH_KEY, REDIS_CACHE_TTL_SECONDS)
            .exec();
          cachedInRedis = true;
        } catch {
          cachedInRedis = false;
        }
      }

      return {
        source: 'mongodb',
        cachedInRedis,
        views,
        cachedAt,
        expiresAt,
        ttlRemainingMs: REDIS_CACHE_TTL_MS,
        ttlSeconds: REDIS_CACHE_TTL_SECONDS
      };
    } catch {
      const fallbackExpiresAt = now + DEGRADED_RETRY_TTL_MS;
      return {
        source: 'server-store',
        cachedInRedis: false,
        views: { ...store.views },
        cachedAt: now,
        expiresAt: fallbackExpiresAt,
        ttlRemainingMs: DEGRADED_RETRY_TTL_MS,
        ttlSeconds: Math.ceil(DEGRADED_RETRY_TTL_MS / 1000)
      };
    } finally {
      inflightHydratePromise = null;
      globalThis.__csInflightViewsHydrate = null;
    }
  })();

  globalThis.__csInflightViewsHydrate = inflightHydratePromise;
  return inflightHydratePromise;
}

function filterViewsByQuery(viewsObj, queryText) {
  const q = String(queryText || '').trim().toLowerCase();
  if (!q) return viewsObj;
  const filtered = Object.create(null);
  for (const [k, v] of Object.entries(viewsObj)) {
    if (k.toLowerCase().includes(q)) {
      filtered[k] = v;
    }
  }
  return filtered;
}

function sendJsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(payload));
}

function pickTimingFields(timing) {
  if (!timing) return {};
  return {
    cachedAt: timing.cachedAt,
    expiresAt: timing.expiresAt,
    ttlRemainingMs: timing.ttlRemainingMs,
    ttlSeconds: timing.ttlSeconds
  };
}

async function respondWithCooldownViews(res, { redis, store, paperKey, views, remainingMs, now }) {
  store.views[paperKey] = views;
  const redisPatch = await updateRedisCachedPaperViews(redis, paperKey, views, now);
  const timing = redisPatch || (await getRedisCacheTiming(redis, now));
  return sendJsonResponse(res, 200, {
    ok: true,
    source: redisPatch?.updated ? 'redis+mongodb' : 'mongodb',
    paperKey,
    views,
    incremented: false,
    cooldownRemainingMs: remainingMs,
    ...pickTimingFields(timing)
  });
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const isPost = req.method === 'POST';
  const requirePostOrigin = isPost && Boolean(process.env.VERCEL);
  if (!isAllowedOrigin(req, requirePostOrigin)) {
    return sendJsonResponse(res, 403, { error: 'Forbidden origin' });
  }

  if (req.method === 'GET') {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const paperKeyParam =
      typeof req.query?.paperKey === 'string'
        ? req.query.paperKey.trim()
        : (urlObj.searchParams.get('paperKey') || '').trim();
    const searchParam =
      typeof req.query?.q === 'string'
        ? req.query.q.trim()
        : typeof req.query?.search === 'string'
          ? req.query.search.trim()
          : (urlObj.searchParams.get('q') || urlObj.searchParams.get('search') || '').trim();

    if (paperKeyParam && !isValidPaperKey(paperKeyParam)) {
      return sendJsonResponse(res, 400, { ok: false, error: 'Invalid paperKey' });
    }

    const store = loadLocalServerStore();
    const redis = await getRedisClient();

    // 1. Check Redis cache first (1-hour lifespan)
    if (redis) {
      if (paperKeyParam) {
        const redisSingle = await readSinglePaperViewsFromRedis(redis, paperKeyParam);
        if (redisSingle) {
          return sendJsonResponse(res, 200, {
            ok: true,
            source: 'redis',
            cachedInRedis: true,
            paperKey: paperKeyParam,
            views: redisSingle.views,
            cachedAt: redisSingle.cachedAt,
            expiresAt: redisSingle.expiresAt,
            ttlRemainingMs: redisSingle.ttlRemainingMs,
            ttlSeconds: redisSingle.ttlSeconds
          });
        }
      } else {
        const redisHit = await readAllViewsFromRedis(redis);
        if (redisHit) {
          for (const [k, v] of Object.entries(redisHit.views)) {
            store.views[k] = Math.max(v, store.views[k] || 0);
          }
          return sendJsonResponse(res, 200, {
            ok: true,
            source: 'redis',
            cachedInRedis: true,
            views: filterViewsByQuery(redisHit.views, searchParam),
            cachedAt: redisHit.cachedAt,
            expiresAt: redisHit.expiresAt,
            ttlRemainingMs: redisHit.ttlRemainingMs,
            ttlSeconds: redisHit.ttlSeconds
          });
        }
      }
    } else {
      // Redis unavailable: serve in-process 1-hour fallback cache while fresh
      const now = Date.now();
      if (cachedGetResult && cachedGetResult.expiresAt > now) {
        const ttlRemainingMs = cachedGetResult.expiresAt - now;
        const timing = {
          cachedAt: cachedGetResult.cachedAt,
          expiresAt: cachedGetResult.expiresAt,
          ttlRemainingMs,
          ttlSeconds: Math.ceil(ttlRemainingMs / 1000)
        };
        if (paperKeyParam) {
          return sendJsonResponse(res, 200, {
            ok: true,
            source: 'memory-cache',
            cachedInRedis: false,
            paperKey: paperKeyParam,
            views: parsePositiveViewInt(cachedGetResult.views[paperKeyParam]),
            ...timing
          });
        }
        return sendJsonResponse(res, 200, {
          ok: true,
          source: 'memory-cache',
          cachedInRedis: false,
          views: filterViewsByQuery(cachedGetResult.views, searchParam),
          ...timing
        });
      }
    }

    // 2. Cache miss/expired -> hydrate from MongoDB Atlas and repopulate Redis with 1-hour TTL
    const snapshot = await hydrateRedisFromDatabase(redis, store);
    if (paperKeyParam) {
      return sendJsonResponse(res, 200, {
        ok: true,
        source: snapshot.source,
        cachedInRedis: snapshot.cachedInRedis,
        paperKey: paperKeyParam,
        views: parsePositiveViewInt(snapshot.views[paperKeyParam]),
        cachedAt: snapshot.cachedAt,
        expiresAt: snapshot.expiresAt,
        ttlRemainingMs: snapshot.ttlRemainingMs,
        ttlSeconds: snapshot.ttlSeconds
      });
    }

    return sendJsonResponse(res, 200, {
      ok: true,
      source: snapshot.source,
      cachedInRedis: snapshot.cachedInRedis,
      views: filterViewsByQuery(snapshot.views, searchParam),
      cachedAt: snapshot.cachedAt,
      expiresAt: snapshot.expiresAt,
      ttlRemainingMs: snapshot.ttlRemainingMs,
      ttlSeconds: snapshot.ttlSeconds
    });
  }

  if (req.method === 'POST') {
    const clientIp =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    if (!checkRateLimit(clientIp)) {
      return sendJsonResponse(res, 429, { ok: false, error: 'Too many requests' });
    }

    let paperKey = '';
    let viewerId = '';
    try {
      let body = req.body;
      if (!body || typeof body === 'string') {
        const raw = typeof body === 'string'
          ? body
          : await new Promise((resolve, reject) => {
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
      return sendJsonResponse(res, 400, { ok: false, error: 'Malformed JSON body' });
    }

    if (!isValidPaperKey(paperKey)) {
      return sendJsonResponse(res, 400, { ok: false, error: 'Invalid paperKey' });
    }

    const now = Date.now();
    const ipHash = hashIdentifier(clientIp);
    const vidHash = viewerId ? hashIdentifier(viewerId) : '';
    const store = loadLocalServerStore();
    const redis = await getRedisClient();

    // 1. Check in-memory + Redis 30-second cooldown for this user + paper
    const memRemainingMs = getCooldownRemainingMs(ipHash, vidHash, paperKey, now);
    const redisRemainingMs = memRemainingMs > 0 ? memRemainingMs : await getRedisCooldownRemainingMs(redis, ipHash, vidHash, paperKey);
    const activeCooldownMs = Math.max(memRemainingMs, redisRemainingMs);

    if (activeCooldownMs > 0) {
      let currentViews = Number(store.views[paperKey]) || 0;
      let responseSource = 'server-store';
      const redisSingle = await readSinglePaperViewsFromRedis(redis, paperKey);
      if (redisSingle) {
        currentViews = Math.max(currentViews, redisSingle.views);
        store.views[paperKey] = currentViews;
        responseSource = 'redis';
      } else {
        try {
          const col = await getViewsCollection();
          const existing = await col.findOne({ _id: paperKey }, { projection: { _id: 1, views: 1 } });
          if (typeof existing?.views === 'number') {
            currentViews = Math.max(currentViews, existing.views);
            store.views[paperKey] = currentViews;
            responseSource = 'mongodb';
          }
        } catch {
          // Keep server store count
        }
      }
      const timing = redisSingle || (await getRedisCacheTiming(redis, now));
      return sendJsonResponse(res, 200, {
        ok: true,
        source: responseSource,
        paperKey,
        views: currentViews,
        incremented: false,
        cooldownRemainingMs: activeCooldownMs,
        ...pickTimingFields(timing)
      });
    }

    // 2. Check MongoDB distributed 30s cooldown, increment atomically, and update Redis immediately
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
        const remainingMs = PAPER_VIEW_COOLDOWN_MS - (now - lastDbTs);
        recordCooldownTimestamp(ipHash, vidHash, paperKey, lastDbTs);
        await setRedisCooldown(redis, ipHash, vidHash, paperKey, remainingMs);
        const currentViews = typeof existing?.views === 'number' ? existing.views : (Number(store.views[paperKey]) || 0);
        return respondWithCooldownViews(res, { redis, store, paperKey, views: currentViews, remainingMs, now });
      }

      const cutoff = now - PAPER_VIEW_COOLDOWN_MS;
      const setPayload = {
        updatedAt: new Date(now).toISOString(),
        [`cooldowns.${ipHash}`]: now
      };
      if (vidHash) setPayload[`cooldowns.${vidHash}`] = now;

      const unsetPayload = {};
      for (const [k, ts] of Object.entries(dbCooldowns)) {
        if (k !== ipHash && k !== vidHash && (typeof ts !== 'number' || now - ts >= PAPER_VIEW_COOLDOWN_MS)) {
          unsetPayload[`cooldowns.${k}`] = '';
        }
      }

      const updateOps = {
        $inc: { views: 1 },
        $set: setPayload,
        $setOnInsert: { createdAt: setPayload.updatedAt }
      };
      if (Object.keys(unsetPayload).length > 0) {
        updateOps.$unset = unsetPayload;
      }

      let updateResult = null;
      if (existing) {
        const atomicAndGuards = [
          {
            $or: [
              { [`cooldowns.${ipHash}`]: { $exists: false } },
              { [`cooldowns.${ipHash}`]: { $lt: cutoff } }
            ]
          }
        ];
        if (vidHash) {
          atomicAndGuards.push({
            $or: [
              { [`cooldowns.${vidHash}`]: { $exists: false } },
              { [`cooldowns.${vidHash}`]: { $lt: cutoff } }
            ]
          });
        }
        updateResult = await col.findOneAndUpdate(
          { _id: paperKey, $and: atomicAndGuards },
          updateOps,
          { upsert: false, returnDocument: 'after', projection: { _id: 1, views: 1 } }
        );
        const matched = updateResult?.value !== undefined ? updateResult.value : updateResult;
        if (!matched) {
          recordCooldownTimestamp(ipHash, vidHash, paperKey, now);
          await setRedisCooldown(redis, ipHash, vidHash, paperKey, PAPER_VIEW_COOLDOWN_MS);
          const fresh = await col.findOne({ _id: paperKey }, { projection: { _id: 1, views: 1 } });
          const views = typeof fresh?.views === 'number' ? fresh.views : (Number(existing.views) || 1);
          return respondWithCooldownViews(res, { redis, store, paperKey, views, remainingMs: PAPER_VIEW_COOLDOWN_MS, now });
        }
      } else {
        try {
          updateResult = await col.findOneAndUpdate(
            { _id: paperKey },
            updateOps,
            { upsert: true, returnDocument: 'after', projection: { _id: 1, views: 1 } }
          );
        } catch (err) {
          if (err?.code === 11000) {
            recordCooldownTimestamp(ipHash, vidHash, paperKey, now);
            await setRedisCooldown(redis, ipHash, vidHash, paperKey, PAPER_VIEW_COOLDOWN_MS);
            const fresh = await col.findOne({ _id: paperKey }, { projection: { _id: 1, views: 1 } });
            const views = typeof fresh?.views === 'number' ? fresh.views : 1;
            return respondWithCooldownViews(res, { redis, store, paperKey, views, remainingMs: PAPER_VIEW_COOLDOWN_MS, now });
          }
          throw err;
        }
      }

      const updatedDoc = updateResult?.value !== undefined ? updateResult.value : updateResult;
      const newViews = typeof updatedDoc?.views === 'number' ? updatedDoc.views : 1;

      recordCooldownTimestamp(ipHash, vidHash, paperKey, now);
      await setRedisCooldown(redis, ipHash, vidHash, paperKey, PAPER_VIEW_COOLDOWN_MS);

      store.views[paperKey] = newViews;
      saveLocalServerStore(store);

      if (cachedGetResult && cachedGetResult.expiresAt > now) {
        cachedGetResult.views[paperKey] = newViews;
      }

      const redisPatch = await updateRedisCachedPaperViews(redis, paperKey, newViews, now);
      const timing = redisPatch || (await getRedisCacheTiming(redis, now));

      return sendJsonResponse(res, 200, {
        ok: true,
        source: redisPatch?.updated ? 'redis+mongodb' : 'mongodb',
        cachedInRedis: Boolean(redisPatch?.updated),
        paperKey,
        views: newViews,
        incremented: true,
        cooldownRemainingMs: PAPER_VIEW_COOLDOWN_MS,
        ...pickTimingFields(timing)
      });
    } catch {
      // MongoDB temporarily unreachable -> record in persistent store & Redis while queuing Mongo sync
      recordCooldownTimestamp(ipHash, vidHash, paperKey, now);
      await setRedisCooldown(redis, ipHash, vidHash, paperKey, PAPER_VIEW_COOLDOWN_MS);

      const nextViews = (Number(store.views[paperKey]) || 0) + 1;
      store.views[paperKey] = nextViews;
      store.dirtyKeys.add(paperKey);
      saveLocalServerStore(store);

      if (cachedGetResult && cachedGetResult.expiresAt > now) {
        cachedGetResult.views[paperKey] = nextViews;
      }

      const redisPatch = await updateRedisCachedPaperViews(redis, paperKey, nextViews, now);
      const timing = redisPatch || (await getRedisCacheTiming(redis, now));

      return sendJsonResponse(res, 200, {
        ok: true,
        source: redisPatch?.updated ? 'redis+server-store' : 'server-store',
        cachedInRedis: Boolean(redisPatch?.updated),
        paperKey,
        views: nextViews,
        incremented: true,
        cooldownRemainingMs: PAPER_VIEW_COOLDOWN_MS,
        ...pickTimingFields(timing)
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
}
