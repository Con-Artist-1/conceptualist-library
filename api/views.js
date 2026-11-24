import fs from 'fs';
import path from 'path';
import {
  PROJECT_ROOT,
  COLLECTION_VIEWS,
  parsePositiveInt,
  hashIdentifier,
  isValidPaperKey,
  isKnownPaperKey,
  isAllowedOrigin,
  getClientIp,
  checkSlidingRateLimit,
  checkDistributedRateLimit,
  getMongoDatabase,
  readJsonBody,
  sendJsonResponse
} from './_shared.js';
import { handleGetSubtitles, handleSaveSubtitles } from './_subtitles.js';

const COLLECTION_NAME = COLLECTION_VIEWS;

// Strict 30-second cooldown before the same user can add another view to the same paper
const PAPER_VIEW_COOLDOWN_MS = 30 * 1000;

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
let inflightHydratePromise = globalThis.__csInflightViewsHydrate || null;
let lastHydratedAt = globalThis.__csLastViewsHydratedAt || 0;
let lastHydratedSource = globalThis.__csLastViewsHydratedSource || 'server-store';
const HYDRATION_TTL_MS = 15 * 1000;
const DEFAULT_PUBLIC_VIEWS_LIMIT = 5000;
let hasSyncedFallbackToMongo = false;
let viewsSortIndexInitialized = globalThis.__csViewsSortIndexInitialized || false;

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
          const val = parsePositiveInt(v);
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

async function getViewsCollection() {
  const db = await getMongoDatabase();
  const col = db.collection(COLLECTION_NAME);

  if (!viewsSortIndexInitialized) {
    viewsSortIndexInitialized = true;
    globalThis.__csViewsSortIndexInitialized = true;
    void col.createIndex({ views: -1 }, { background: true }).catch(() => {
      viewsSortIndexInitialized = false;
      globalThis.__csViewsSortIndexInitialized = false;
    });
  }

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

async function hydrateViewsFromDatabase(store) {
  const now = Date.now();
  if (lastHydratedAt > 0 && now - lastHydratedAt < HYDRATION_TTL_MS) {
    return { source: lastHydratedSource, views: store.views };
  }

  if (inflightHydratePromise) {
    return inflightHydratePromise;
  }

  inflightHydratePromise = (async () => {
    try {
      const col = await getViewsCollection();
      const docs = await col
        .find({}, { projection: { _id: 1, views: 1 } })
        .sort({ views: -1 })
        .limit(25000)
        .toArray();

      const views = Object.create(null);
      for (const [k, v] of Object.entries(store.views)) {
        const parsed = parsePositiveInt(v);
        if (parsed > 0) views[k] = parsed;
      }
      for (const doc of docs) {
        if (typeof doc._id === 'string' && typeof doc.views === 'number') {
          const merged = Math.max(parsePositiveInt(doc.views), views[doc._id] || 0);
          if (merged > 0) {
            views[doc._id] = merged;
            store.views[doc._id] = merged;
          }
        }
      }

      lastHydratedAt = Date.now();
      lastHydratedSource = 'mongodb';
      globalThis.__csLastViewsHydratedAt = lastHydratedAt;
      globalThis.__csLastViewsHydratedSource = lastHydratedSource;

      return { source: 'mongodb', views };
    } catch {
      lastHydratedAt = Date.now();
      lastHydratedSource = 'server-store';
      globalThis.__csLastViewsHydratedAt = lastHydratedAt;
      globalThis.__csLastViewsHydratedSource = lastHydratedSource;
      return { source: 'server-store', views: { ...store.views } };
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

function sendCooldownResponse(res, { store, source, paperKey, views, remainingMs }) {
  store.views[paperKey] = views;
  return sendJsonResponse(res, 200, {
    ok: true,
    source,
    paperKey,
    views,
    incremented: false,
    cooldownRemainingMs: remainingMs
  });
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Cache-Control',
    req.method === 'GET' ? 'public, max-age=5, s-maxage=15, stale-while-revalidate=30' : 'no-store, max-age=0'
  );

  const isPost = req.method === 'POST';
  const requirePostOrigin = isPost && Boolean(process.env.VERCEL);
  if (!isAllowedOrigin(req, requirePostOrigin)) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return sendJsonResponse(res, 403, { error: 'Forbidden origin' });
  }

  if (req.method === 'GET') {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const subtitlesKeyParam =
      typeof req.query?.subtitles === 'string'
        ? req.query.subtitles.trim()
        : (urlObj.searchParams.get('subtitles') || '').trim();

    if (subtitlesKeyParam) {
      return handleGetSubtitles(req, res, urlObj, subtitlesKeyParam);
    }

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
    const rawLimit =
      typeof req.query?.limit === 'string' ? req.query.limit : urlObj.searchParams.get('limit');
    const requestedLimit = rawLimit
      ? Math.min(25000, Math.max(1, parsePositiveInt(rawLimit)))
      : (searchParam ? 0 : DEFAULT_PUBLIC_VIEWS_LIMIT);

    if (paperKeyParam && !isValidPaperKey(paperKeyParam)) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return sendJsonResponse(res, 400, { ok: false, error: 'Invalid paperKey' });
    }

    const store = loadLocalServerStore();

    if (paperKeyParam) {
      try {
        const col = await getViewsCollection();
        const existing = await col.findOne({ _id: paperKeyParam }, { projection: { _id: 1, views: 1 } });
        const views = Math.max(parsePositiveInt(existing?.views), Number(store.views[paperKeyParam]) || 0);
        if (views > 0) store.views[paperKeyParam] = views;
        return sendJsonResponse(res, 200, {
          ok: true,
          source: 'mongodb',
          paperKey: paperKeyParam,
          views
        });
      } catch {
        return sendJsonResponse(res, 200, {
          ok: true,
          source: 'server-store',
          paperKey: paperKeyParam,
          views: parsePositiveInt(store.views[paperKeyParam])
        });
      }
    }

    const snapshot = await hydrateViewsFromDatabase(store);
    const filteredViews = filterViewsByQuery(snapshot.views, searchParam);
    let responseViews = filteredViews;
    const totalCount = Object.keys(filteredViews).length;
    if (requestedLimit > 0 && totalCount > requestedLimit) {
      const sliced = Object.create(null);
      const sortedEntries = Object.entries(filteredViews)
        .sort((a, b) => b[1] - a[1])
        .slice(0, requestedLimit);
      for (const [k, v] of sortedEntries) sliced[k] = v;
      responseViews = sliced;
    }
    res.setHeader('X-Views-Count', String(Object.keys(responseViews).length));
    return sendJsonResponse(res, 200, {
      ok: true,
      source: snapshot.source,
      views: responseViews
    });
  }

  if (req.method === 'POST') {
    const clientIp = getClientIp(req);

    if (!checkSlidingRateLimit(ipRateMap, clientIp, RATE_WINDOW_MS, MAX_POSTS_PER_WINDOW)) {
      return sendJsonResponse(res, 429, { ok: false, error: 'Too many requests' });
    }

    let paperKey = '';
    let viewerId = '';
    let body = null;
    try {
      body = await readJsonBody(req, 327680);
      paperKey = typeof body?.paperKey === 'string' ? body.paperKey.trim() : '';
      viewerId = typeof body?.viewerId === 'string' ? body.viewerId.trim().slice(0, 64) : '';
    } catch {
      return sendJsonResponse(res, 400, { ok: false, error: 'Malformed JSON body' });
    }

    if (body?.action === 'save_subtitles') {
      return handleSaveSubtitles(req, res, body, clientIp);
    }

    if (!isValidPaperKey(paperKey) || !isKnownPaperKey(paperKey)) {
      return sendJsonResponse(res, 400, { ok: false, error: 'Invalid paperKey' });
    }

    try {
      const db = await getMongoDatabase();
      const distAllowed = await checkDistributedRateLimit(
        db,
        'views_post',
        clientIp,
        RATE_WINDOW_MS,
        MAX_POSTS_PER_WINDOW
      );
      if (!distAllowed) {
        return sendJsonResponse(res, 429, { ok: false, error: 'Too many requests' });
      }
    } catch {
      // Allow local fallback store if Mongo is temporarily unreachable
    }

    const now = Date.now();
    const ipHash = hashIdentifier(clientIp);
    const vidHash = viewerId ? hashIdentifier(viewerId) : '';
    const store = loadLocalServerStore();

    // 1. Check in-memory 30-second cooldown for this user + paper
    const memRemainingMs = getCooldownRemainingMs(ipHash, vidHash, paperKey, now);
    if (memRemainingMs > 0) {
      let currentViews = Number(store.views[paperKey]) || 0;
      let responseSource = 'server-store';
      try {
        const col = await getViewsCollection();
        const existing = await col.findOne({ _id: paperKey }, { projection: { _id: 1, views: 1 } });
        if (typeof existing?.views === 'number') {
          currentViews = Math.max(currentViews, existing.views);
          responseSource = 'mongodb';
        }
      } catch {
        // Keep server store count
      }
      return sendCooldownResponse(res, {
        store,
        source: responseSource,
        paperKey,
        views: currentViews,
        remainingMs: memRemainingMs
      });
    }

    // 2. Check MongoDB distributed 30s cooldown and increment atomically
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
        const currentViews = typeof existing?.views === 'number' ? existing.views : (Number(store.views[paperKey]) || 0);
        return sendCooldownResponse(res, {
          store,
          source: 'mongodb',
          paperKey,
          views: currentViews,
          remainingMs
        });
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
          const fresh = await col.findOne({ _id: paperKey }, { projection: { _id: 1, views: 1 } });
          const views = typeof fresh?.views === 'number' ? fresh.views : (Number(existing.views) || 1);
          return sendCooldownResponse(res, {
            store,
            source: 'mongodb',
            paperKey,
            views,
            remainingMs: PAPER_VIEW_COOLDOWN_MS
          });
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
            const fresh = await col.findOne({ _id: paperKey }, { projection: { _id: 1, views: 1 } });
            const views = typeof fresh?.views === 'number' ? fresh.views : 1;
            return sendCooldownResponse(res, {
              store,
              source: 'mongodb',
              paperKey,
              views,
              remainingMs: PAPER_VIEW_COOLDOWN_MS
            });
          }
          throw err;
        }
      }

      const updatedDoc = updateResult?.value !== undefined ? updateResult.value : updateResult;
      const newViews = typeof updatedDoc?.views === 'number' ? updatedDoc.views : 1;

      recordCooldownTimestamp(ipHash, vidHash, paperKey, now);
      store.views[paperKey] = newViews;
      saveLocalServerStore(store);

      return sendJsonResponse(res, 200, {
        ok: true,
        source: 'mongodb',
        paperKey,
        views: newViews,
        incremented: true,
        cooldownRemainingMs: PAPER_VIEW_COOLDOWN_MS
      });
    } catch {
      // MongoDB temporarily unreachable -> record in local persistent server store while queuing Mongo sync
      recordCooldownTimestamp(ipHash, vidHash, paperKey, now);

      const nextViews = (Number(store.views[paperKey]) || 0) + 1;
      store.views[paperKey] = nextViews;
      store.dirtyKeys.add(paperKey);
      saveLocalServerStore(store);

      return sendJsonResponse(res, 200, {
        ok: true,
        source: 'server-store',
        paperKey,
        views: nextViews,
        incremented: true,
        cooldownRemainingMs: PAPER_VIEW_COOLDOWN_MS
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
}
