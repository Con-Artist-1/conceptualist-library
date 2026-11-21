import fs from 'fs';
import path from 'path';
import {
  PROJECT_ROOT,
  COLLECTION_VIEWS,
  COLLECTION_SUBTITLES,
  parsePositiveInt,
  hashIdentifier,
  isValidPaperKey,
  isValidSubtitleKey,
  isAllowedOrigin,
  getClientIp,
  checkSlidingRateLimit,
  getMongoDatabase,
  readJsonBody,
  sendJsonResponse
} from './_shared.js';

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
const LOCAL_SUBTITLES_FILE = path.join(LOCAL_STORE_DIR, 'audio_subtitles.json');
let memorySubtitlesStore = globalThis.__csMemorySubtitlesStore || null;

function loadLocalSubtitlesStore() {
  if (memorySubtitlesStore) return memorySubtitlesStore;
  try {
    if (fs.existsSync(LOCAL_SUBTITLES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_SUBTITLES_FILE, 'utf-8'));
      if (parsed && typeof parsed.tracks === 'object') {
        memorySubtitlesStore = parsed.tracks;
        globalThis.__csMemorySubtitlesStore = memorySubtitlesStore;
        return memorySubtitlesStore;
      }
    }
  } catch {
    // Ignore local filesystem read errors
  }
  memorySubtitlesStore = Object.create(null);
  globalThis.__csMemorySubtitlesStore = memorySubtitlesStore;
  return memorySubtitlesStore;
}

function saveLocalSubtitlesStore(tracksMap) {
  try {
    if (!fs.existsSync(LOCAL_STORE_DIR)) {
      fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(
      LOCAL_SUBTITLES_FILE,
      JSON.stringify({ tracks: tracksMap, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );
  } catch {
    // Ignore read-only filesystem errors
  }
}

function sanitizeSubtitlePayload(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.segments)) return null;
  const cleanSegments = [];
  for (const seg of raw.segments.slice(0, 250)) {
    if (!seg || typeof seg !== 'object') continue;
    const start = Number(seg.start);
    const end = Number(seg.end);
    const text = String(seg.text || '').trim().slice(0, 360);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !text) continue;
    const item = {
      start: Number(start.toFixed(1)),
      end: Number(end.toFixed(1)),
      text
    };
    if (seg.passage && typeof seg.passage === 'string') {
      item.passage = seg.passage.trim().slice(0, 80);
    }
    cleanSegments.push(item);
  }
  if (cleanSegments.length === 0) return null;
  return {
    duration: Number.isFinite(Number(raw.duration)) ? Number(Number(raw.duration).toFixed(1)) : 0,
    source: typeof raw.source === 'string' ? raw.source.slice(0, 40) : 'whisper-ai',
    language: typeof raw.language === 'string' ? raw.language.slice(0, 24) : 'french',
    updatedAt: new Date().toISOString(),
    segments: cleanSegments
  };
}
let memoryViewsStore = globalThis.__csMemoryViewsStore || null;
let inflightHydratePromise = globalThis.__csInflightViewsHydrate || null;
let lastHydratedAt = globalThis.__csLastViewsHydratedAt || 0;
let lastHydratedSource = globalThis.__csLastViewsHydratedSource || 'server-store';
const HYDRATION_TTL_MS = 15 * 1000;
let hasSyncedFallbackToMongo = false;

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
      if (!isValidSubtitleKey(subtitlesKeyParam)) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return sendJsonResponse(res, 400, { ok: false, error: 'Invalid subtitle trackKey' });
      }
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
      const localSubs = loadLocalSubtitlesStore();
      try {
        const db = await getMongoDatabase();
        const subCol = db.collection(COLLECTION_SUBTITLES);
        const doc = await subCol.findOne(
          { $or: [{ _id: subtitlesKeyParam }, { aliasKeys: subtitlesKeyParam }] },
          { projection: { _id: 1, subtitle: 1 } }
        );
        if (doc?.subtitle && Array.isArray(doc.subtitle.segments)) {
          localSubs[subtitlesKeyParam] = doc.subtitle;
          return sendJsonResponse(res, 200, { ok: true, source: 'mongodb', subtitle: doc.subtitle });
        }
      } catch {
        // Fallback to local subtitles store
      }
      const fallbackHit = localSubs[subtitlesKeyParam] || null;
      return sendJsonResponse(res, 200, {
        ok: true,
        source: 'server-store',
        subtitle: fallbackHit
      });
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
    return sendJsonResponse(res, 200, {
      ok: true,
      source: snapshot.source,
      views: filterViewsByQuery(snapshot.views, searchParam)
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
      body = await readJsonBody(req, 65536);
      paperKey = typeof body?.paperKey === 'string' ? body.paperKey.trim() : '';
      viewerId = typeof body?.viewerId === 'string' ? body.viewerId.trim().slice(0, 64) : '';
    } catch {
      return sendJsonResponse(res, 400, { ok: false, error: 'Malformed JSON body' });
    }

    if (body?.action === 'save_subtitles') {
      const trackKey = typeof body?.trackKey === 'string' ? body.trackKey.trim() : '';
      if (!isValidSubtitleKey(trackKey)) {
        return sendJsonResponse(res, 400, { ok: false, error: 'Invalid subtitle trackKey' });
      }
      const cleanSubtitle = sanitizeSubtitlePayload(body?.subtitle);
      if (!cleanSubtitle) {
        return sendJsonResponse(res, 400, { ok: false, error: 'Invalid subtitle segments' });
      }
      const rawAliasKeys = Array.isArray(body?.aliasKeys)
        ? body.aliasKeys.map((k) => String(k || '').trim()).filter((k) => k && k !== trackKey && isValidSubtitleKey(k)).slice(0, 4)
        : [];
      const adminKey = process.env.ADMIN_API_KEY || '';
      const isAdminOverwrite = Boolean(adminKey && req.headers['x-admin-key'] === adminKey);

      const localSubs = loadLocalSubtitlesStore();
      const hasExistingLocal = Boolean(
        localSubs[trackKey] &&
        Array.isArray(localSubs[trackKey].segments) &&
        localSubs[trackKey].segments.length > 0
      );

      try {
        const db = await getMongoDatabase();
        const subCol = db.collection(COLLECTION_SUBTITLES);

        // Guard against unauthenticated overwrite of existing subtitles or cross-track aliasKey hijacking
        const conflictKeys = [trackKey, ...rawAliasKeys];
        const existingDocs = await subCol
          .find(
            { $or: [{ _id: { $in: conflictKeys } }, { aliasKeys: { $in: conflictKeys } }] },
            { projection: { _id: 1, aliasKeys: 1, 'subtitle.segments': { $slice: 1 } } }
          )
          .toArray();

        const claimedByOther = new Set();
        let primaryExists = false;
        for (const doc of existingDocs) {
          const hasSegs = Array.isArray(doc?.subtitle?.segments) && doc.subtitle.segments.length > 0;
          if (doc._id === trackKey || (Array.isArray(doc.aliasKeys) && doc.aliasKeys.includes(trackKey))) {
            if (hasSegs) primaryExists = true;
          } else {
            claimedByOther.add(doc._id);
            if (Array.isArray(doc.aliasKeys)) {
              for (const ak of doc.aliasKeys) claimedByOther.add(ak);
            }
          }
        }

        if (primaryExists && !isAdminOverwrite) {
          return sendJsonResponse(res, 200, {
            ok: true,
            source: 'mongodb',
            trackKey,
            preservedExisting: true
          });
        }

        const safeAliasKeys = rawAliasKeys.filter((ak) => !claimedByOther.has(ak) && !localSubs[ak]);
        if (!hasExistingLocal || isAdminOverwrite) {
          localSubs[trackKey] = cleanSubtitle;
          for (const ak of safeAliasKeys) localSubs[ak] = cleanSubtitle;
          saveLocalSubtitlesStore(localSubs);
        }

        if (isAdminOverwrite) {
          await subCol.updateOne(
            { _id: trackKey },
            {
              $set: {
                subtitle: cleanSubtitle,
                aliasKeys: safeAliasKeys,
                updatedAt: cleanSubtitle.updatedAt
              },
              $setOnInsert: { createdAt: cleanSubtitle.updatedAt }
            },
            { upsert: true }
          );
        } else {
          await subCol.updateOne(
            { _id: trackKey },
            {
              $setOnInsert: {
                subtitle: cleanSubtitle,
                aliasKeys: safeAliasKeys,
                createdAt: cleanSubtitle.updatedAt,
                updatedAt: cleanSubtitle.updatedAt
              }
            },
            { upsert: true }
          );
        }
        return sendJsonResponse(res, 200, { ok: true, source: 'mongodb', trackKey });
      } catch {
        if (hasExistingLocal && !isAdminOverwrite) {
          return sendJsonResponse(res, 200, {
            ok: true,
            source: 'server-store',
            trackKey,
            preservedExisting: true
          });
        }
        const safeLocalAliases = rawAliasKeys.filter((ak) => !localSubs[ak]);
        localSubs[trackKey] = cleanSubtitle;
        for (const ak of safeLocalAliases) localSubs[ak] = cleanSubtitle;
        saveLocalSubtitlesStore(localSubs);
        return sendJsonResponse(res, 200, { ok: true, source: 'server-store', trackKey });
      }
    }

    if (!isValidPaperKey(paperKey)) {
      return sendJsonResponse(res, 400, { ok: false, error: 'Invalid paperKey' });
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
