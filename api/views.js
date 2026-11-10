import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

const DB_NAME_DEFAULT = 'conceptualist_library';
const COLLECTION_NAME = 'paper_views';
const PAPER_KEY_MAX_LEN = 220;
const PAPER_KEY_REGEX = /^[A-Za-z0-9|_\-. (),/+&]+$/;

// Per-IP sliding window rate limiter to prevent view-count spam or scraping
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_POSTS_PER_WINDOW = 45;
const ipRateMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipRateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    ipRateMap.set(ip, { windowStart: now, count: 1 });
    // Prune stale entries occasionally so memory stays bounded
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
      path.resolve(process.cwd(), 'atlas_cred.env'),
      path.resolve(process.cwd(), '.env.local'),
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

  if (!cachedClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    cachedClientPromise = client.connect().catch((err) => {
      cachedClientPromise = null;
      globalThis.__csMongoClientPromise = null;
      throw err;
    });
    globalThis.__csMongoClientPromise = cachedClientPromise;
  }

  const client = await cachedClientPromise;
  return client.db(dbName).collection(COLLECTION_NAME);
}

function isValidPaperKey(key) {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 3 || trimmed.length > PAPER_KEY_MAX_LEN) return false;
  // Block any NoSQL operator characters ($ or { or })
  if (trimmed.includes('$') || trimmed.includes('{') || trimmed.includes('}')) return false;
  return PAPER_KEY_REGEX.test(trimmed);
}

function isAllowedOrigin(req) {
  const origin = req.headers['origin'] || '';
  const referer = req.headers['referer'] || '';
  if (!origin && !referer) return true; // Same-origin GET or server-side fetch
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
  // Strict security headers on API responses
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!isAllowedOrigin(req)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Forbidden origin' }));
  }

  if (req.method === 'GET') {
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
      for (const doc of docs) {
        if (typeof doc._id === 'string' && typeof doc.views === 'number') {
          counts[doc._id] = doc.views;
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, counts }));
    } catch {
      // Never leak internal database details or credentials in error responses
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, counts: {} }));
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

      const paperKey = typeof body?.paperKey === 'string' ? body.paperKey.trim() : '';
      if (!isValidPaperKey(paperKey)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ ok: false, error: 'Invalid paperKey' }));
      }

      const col = await getViewsCollection();
      const nowIso = new Date().toISOString();
      const updateResult = await col.findOneAndUpdate(
        { _id: paperKey },
        {
          $inc: { views: 1 },
          $set: { updatedAt: nowIso },
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

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, paperKey, views: newViews }));
    } catch {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false }));
    }
  }

  res.statusCode = 405;
  res.setHeader('Allow', 'GET, POST');
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
}

