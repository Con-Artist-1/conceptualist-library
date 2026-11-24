import fs from 'fs';
import path from 'path';
import {
  PROJECT_ROOT,
  COLLECTION_SUBTITLES,
  isValidSubtitleKey,
  isKnownSubtitleTrackKey,
  constantTimeEqual,
  checkSlidingRateLimit,
  checkDistributedRateLimit,
  getMongoDatabase,
  sendJsonResponse
} from './_shared.js';

const LOCAL_STORE_DIR = path.join(PROJECT_ROOT, '.data');
const LOCAL_SUBTITLES_FILE = path.join(LOCAL_STORE_DIR, 'audio_subtitles.json');
const STATIC_MANIFEST_FILE = path.join(PROJECT_ROOT, 'public', 'subtitles', 'manifest.json');
let memorySubtitlesStore = globalThis.__csMemorySubtitlesStore || null;
let cachedStaticManifestKeys = globalThis.__csStaticSubManifestKeys || null;
let subtitleAliasIndexInitialized = globalThis.__csSubtitleAliasIndexInitialized || false;

function isPreIndexedStaticSubtitleKey(key) {
  if (!key) return false;
  if (!cachedStaticManifestKeys) {
    try {
      if (fs.existsSync(STATIC_MANIFEST_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(STATIC_MANIFEST_FILE, 'utf8'));
        if (parsed && parsed.keys && typeof parsed.keys === 'object') {
          cachedStaticManifestKeys = new Set(Object.keys(parsed.keys));
          globalThis.__csStaticSubManifestKeys = cachedStaticManifestKeys;
        }
      }
    } catch {
      // Ignore manifest read failures
    }
    if (!cachedStaticManifestKeys) {
      cachedStaticManifestKeys = new Set();
    }
  }
  return cachedStaticManifestKeys.has(key);
}

function ensureSubtitleCollectionIndexes(subCol) {
  if (!subCol || subtitleAliasIndexInitialized) return;
  subtitleAliasIndexInitialized = true;
  globalThis.__csSubtitleAliasIndexInitialized = true;
  void subCol.createIndex({ aliasKeys: 1 }, { background: true }).catch(() => {
    subtitleAliasIndexInitialized = false;
    globalThis.__csSubtitleAliasIndexInitialized = false;
  });
}

// Dedicated stricter rate limit for unauthenticated subtitle writes (SEC-02)
const SUBTITLE_WRITE_WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBTITLE_WRITES_PER_WINDOW = 6;
const subtitleWriteRateMap =
  globalThis.__csSubtitleWriteRateMap || (globalThis.__csSubtitleWriteRateMap = new Map());

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

function stripControlChars(input, replacement = '') {
  let out = '';
  const str = String(input || '');
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      out += replacement;
    } else {
      out += str[i];
    }
  }
  return out;
}

function sanitizeSubtitlePayload(raw, { isAdminOverwrite = false } = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.segments)) return null;
  const cleanSegments = [];
  let totalChars = 0;
  let maxEndSec = 0;
  for (const seg of raw.segments.slice(0, 1200)) {
    if (!seg || typeof seg !== 'object') continue;
    const start = Number(seg.start);
    const end = Number(seg.end);
    const text = stripControlChars(seg.text, ' ')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, 360);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || !text) continue;
    const roundedStart = Number(start.toFixed(1));
    const roundedEnd = Number(end.toFixed(1));
    const item = {
      start: roundedStart,
      end: roundedEnd,
      text
    };
    if (seg.passage && typeof seg.passage === 'string') {
      item.passage = stripControlChars(seg.passage, '').replace(/[<>]/g, '').trim().slice(0, 80);
    }
    totalChars += text.length;
    if (roundedEnd > maxEndSec) maxEndSec = roundedEnd;
    cleanSegments.push(item);
  }
  if (cleanSegments.length === 0) return null;

  const duration = Number.isFinite(Number(raw.duration)) ? Number(Number(raw.duration).toFixed(1)) : 0;
  // Block single-segment spam / permanent poisoning from unauthenticated clients
  if (!isAdminOverwrite) {
    if (cleanSegments.length < 3 || totalChars < 40 || Math.max(duration, maxEndSec) < 12) {
      return null;
    }
  }

  return {
    duration,
    source: isAdminOverwrite && typeof raw.source === 'string' ? raw.source.slice(0, 40) : 'whisper-ai',
    language: typeof raw.language === 'string' ? raw.language.slice(0, 24) : 'french',
    updatedAt: new Date().toISOString(),
    segments: cleanSegments
  };
}

export async function handleGetSubtitles(req, res, urlObj, subtitlesKeyParam) {
  if (!isValidSubtitleKey(subtitlesKeyParam)) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return sendJsonResponse(res, 400, { ok: false, error: 'Invalid subtitle trackKey' });
  }
  const rawAltsParam =
    typeof req.query?.alts === 'string'
      ? req.query.alts
      : urlObj.searchParams.get('alts') || '';
  const validAlts = rawAltsParam
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && k !== subtitlesKeyParam && isValidSubtitleKey(k))
    .slice(0, 4);
  const lookupKeys = [subtitlesKeyParam, ...validAlts];

  // BUG-14 fix: default to no-store; only set public long CDN cache when non-null subtitles are found
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const localSubs = loadLocalSubtitlesStore();
  try {
    const db = await getMongoDatabase();
    const subCol = db.collection(COLLECTION_SUBTITLES);
    ensureSubtitleCollectionIndexes(subCol);
    const docs = await subCol
      .find(
        { $or: [{ _id: { $in: lookupKeys } }, { aliasKeys: { $in: lookupKeys } }] },
        { projection: { _id: 1, aliasKeys: 1, subtitle: 1 } }
      )
      .limit(6)
      .toArray();
    let bestDoc = null;
    let matchedKey = subtitlesKeyParam;
    for (const k of lookupKeys) {
      const found = docs.find(
        (d) => d._id === k || (Array.isArray(d.aliasKeys) && d.aliasKeys.includes(k))
      );
      if (found?.subtitle && Array.isArray(found.subtitle.segments)) {
        bestDoc = found;
        matchedKey = k;
        break;
      }
    }
    if (bestDoc) {
      localSubs[matchedKey] = bestDoc.subtitle;
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
      return sendJsonResponse(res, 200, {
        ok: true,
        source: 'mongodb',
        matchedKey,
        subtitle: bestDoc.subtitle
      });
    }
  } catch {
    // Fallback to local subtitles store (keep Cache-Control: no-store on transient DB failure)
  }

  for (const k of lookupKeys) {
    if (localSubs[k]) {
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
      return sendJsonResponse(res, 200, {
        ok: true,
        source: 'server-store',
        matchedKey: k,
        subtitle: localSubs[k]
      });
    }
  }

  return sendJsonResponse(res, 200, {
    ok: true,
    source: 'server-store',
    subtitle: null
  });
}

export async function handleSaveSubtitles(req, res, body, clientIp) {
  const trackKey = typeof body?.trackKey === 'string' ? body.trackKey.trim() : '';
  if (!isValidSubtitleKey(trackKey)) {
    return sendJsonResponse(res, 400, { ok: false, error: 'Invalid subtitle trackKey' });
  }

  const adminKey = process.env.ADMIN_API_KEY || '';
  const headerAdminKey = typeof req.headers['x-admin-key'] === 'string' ? req.headers['x-admin-key'] : '';
  const isAdminOverwrite = Boolean(adminKey && constantTimeEqual(headerAdminKey, adminKey));

  // SEC-02: reject arbitrary unindexed trackKeys, protect pre-indexed static tracks, and enforce per-IP write throttle
  if (!isAdminOverwrite) {
    if (!isKnownSubtitleTrackKey(trackKey)) {
      return sendJsonResponse(res, 400, { ok: false, error: 'Unknown archive audio trackKey' });
    }
    if (isPreIndexedStaticSubtitleKey(trackKey)) {
      return sendJsonResponse(res, 200, {
        ok: true,
        source: 'static',
        trackKey,
        preservedExisting: true
      });
    }
    if (!checkSlidingRateLimit(subtitleWriteRateMap, clientIp, SUBTITLE_WRITE_WINDOW_MS, MAX_SUBTITLE_WRITES_PER_WINDOW)) {
      return sendJsonResponse(res, 429, { ok: false, error: 'Subtitle write rate limit exceeded' });
    }
  }

  const cleanSubtitle = sanitizeSubtitlePayload(body?.subtitle, { isAdminOverwrite });
  if (!cleanSubtitle) {
    return sendJsonResponse(res, 400, { ok: false, error: 'Invalid subtitle segments' });
  }

  const rawAliasKeys = Array.isArray(body?.aliasKeys)
    ? body.aliasKeys
        .map((k) => String(k || '').trim())
        .filter((k) => (
          k &&
          k !== trackKey &&
          isValidSubtitleKey(k) &&
          (isAdminOverwrite || (isKnownSubtitleTrackKey(k) && !isPreIndexedStaticSubtitleKey(k)))
        ))
        .slice(0, 4)
    : [];

  const localSubs = loadLocalSubtitlesStore();
  const hasExistingLocal = Boolean(
    localSubs[trackKey] &&
    Array.isArray(localSubs[trackKey].segments) &&
    localSubs[trackKey].segments.length > 0
  );

  try {
    const db = await getMongoDatabase();
    if (!isAdminOverwrite) {
      const distAllowed = await checkDistributedRateLimit(
        db,
        'sub_write',
        clientIp,
        SUBTITLE_WRITE_WINDOW_MS,
        MAX_SUBTITLE_WRITES_PER_WINDOW
      );
      if (!distAllowed) {
        return sendJsonResponse(res, 429, { ok: false, error: 'Subtitle write rate limit exceeded' });
      }
    }

    const subCol = db.collection(COLLECTION_SUBTITLES);
    ensureSubtitleCollectionIndexes(subCol);
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
