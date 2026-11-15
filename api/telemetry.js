import {
  COLLECTION_VIEWS,
  COLLECTION_SESSIONS,
  hashIdentifier,
  isValidPaperKey,
  isAllowedOrigin,
  getClientIp,
  checkSlidingRateLimit,
  getMongoDatabase,
  readJsonBody,
  sendJsonResponse
} from './_shared.js';

const ALLOWED_MODES = new Set(['split', 'qp', 'ms', 'er', 'other']);
const ALLOWED_DEVICES = new Set(['desktop', 'mobile']);
const SESSION_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

const MAX_BEACON_DELTA_MS = 2 * 60 * 60 * 1000; // Clamp single beacon chunk to 2 hours
const MIN_DURATION_MS = 1000; // Ignore sub-1-second glitches
const MAX_PAPER_ENTRIES_PER_BEACON = 20;
const SESSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // Auto-expire session docs after 90 days

const RATE_WINDOW_MS = 60 * 1000;
const MAX_TELEMETRY_PER_WINDOW = 60;
const telemetryRateMap = globalThis.__csTelemetryRateMap || (globalThis.__csTelemetryRateMap = new Map());
let ttlIndexInitialized = globalThis.__csSessionTtlInitialized || false;

function clampDeltaMs(raw) {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(Math.floor(num), MAX_BEACON_DELTA_MS);
}

function sanitizeBeaconEntries(rawEntries) {
  const merged = new Map();
  if (!Array.isArray(rawEntries)) return [];

  for (const item of rawEntries.slice(0, MAX_PAPER_ENTRIES_PER_BEACON)) {
    if (!item || typeof item !== 'object') continue;
    const paperKey = typeof item.paperKey === 'string' ? item.paperKey.trim() : '';
    const mode = typeof item.mode === 'string' ? item.mode.trim().toLowerCase() : '';
    if (!isValidPaperKey(paperKey) || !ALLOWED_MODES.has(mode)) continue;

    const deltaMs = clampDeltaMs(item.deltaMs);
    const sessions = item.sessions ? 1 : 0;
    const opens = item.opens ? 1 : 0;

    if (deltaMs < MIN_DURATION_MS && opens === 0) continue;

    const mapKey = `${paperKey}\0${mode}`;
    const existing = merged.get(mapKey);
    if (existing) {
      existing.deltaMs = Math.min(MAX_BEACON_DELTA_MS, existing.deltaMs + deltaMs);
      existing.sessions = Math.min(1, existing.sessions + sessions);
      existing.opens = Math.min(1, existing.opens + opens);
    } else {
      merged.set(mapKey, { paperKey, mode, deltaMs, sessions, opens });
    }
  }

  return Array.from(merged.values());
}

async function ensureSessionTtlIndex(sessionsCol) {
  if (ttlIndexInitialized) return;
  ttlIndexInitialized = true;
  globalThis.__csSessionTtlInitialized = true;
  try {
    await sessionsCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true });
  } catch {
    ttlIndexInitialized = false;
    globalThis.__csSessionTtlInitialized = false;
  }
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
  }

  const requireOrigin = Boolean(process.env.VERCEL);
  if (!isAllowedOrigin(req, requireOrigin)) {
    return sendJsonResponse(res, 403, { error: 'Forbidden origin' });
  }

  const clientIp = getClientIp(req);
  if (!checkSlidingRateLimit(telemetryRateMap, clientIp, RATE_WINDOW_MS, MAX_TELEMETRY_PER_WINDOW)) {
    return sendJsonResponse(res, 429, { ok: false, error: 'Too many requests' });
  }

  let body;
  try {
    body = await readJsonBody(req, 16384);
  } catch {
    return sendJsonResponse(res, 400, { ok: false, error: 'Malformed JSON body' });
  }

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!SESSION_ID_REGEX.test(sessionId)) {
    return sendJsonResponse(res, 400, { ok: false, error: 'Invalid sessionId' });
  }

  const viewerId = typeof body?.viewerId === 'string' ? body.viewerId.trim().slice(0, 64) : '';
  const device = typeof body?.device === 'string' && ALLOWED_DEVICES.has(body.device) ? body.device : 'desktop';
  const rawSiteDeltaMs = clampDeltaMs(body?.siteDeltaMs);
  const paperEntries = sanitizeBeaconEntries(body?.paperEntries);

  const totalPaperDeltaMs = paperEntries.reduce((acc, e) => acc + e.deltaMs, 0);
  const effectiveSiteDeltaMs = Math.min(MAX_BEACON_DELTA_MS, Math.max(rawSiteDeltaMs, totalPaperDeltaMs));

  if (effectiveSiteDeltaMs < MIN_DURATION_MS && paperEntries.length === 0) {
    return sendJsonResponse(res, 200, { ok: true, recorded: false });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  try {
    const db = await getMongoDatabase();

    // 1. Update per-paper study duration & mode breakdown (Split View vs Dedicated QP/MS/ER)
    if (paperEntries.length > 0) {
      const viewsCol = db.collection(COLLECTION_VIEWS);
      const ops = paperEntries.map((entry) => {
        const incDoc = {};
        if (entry.deltaMs >= MIN_DURATION_MS) {
          incDoc[`studyTime.${entry.mode}TimeMs`] = entry.deltaMs;
          incDoc['studyTime.totalTimeMs'] = entry.deltaMs;
        }
        if (entry.sessions > 0) {
          incDoc[`studyTime.${entry.mode}Sessions`] = entry.sessions;
          incDoc['studyTime.totalSessions'] = entry.sessions;
        }
        if (entry.opens > 0) {
          incDoc[`studyTime.${entry.mode}Opens`] = entry.opens;
        }
        return {
          updateOne: {
            filter: { _id: entry.paperKey },
            update: {
              $inc: incDoc,
              $set: { updatedAt: nowIso },
              $setOnInsert: { views: 0, createdAt: nowIso }
            },
            upsert: true
          }
        };
      });
      await viewsCol.bulkWrite(ops, { ordered: false });
    }

    // 2. Update user session stay duration & per-mode breakdown
    const sessionsCol = db.collection(COLLECTION_SESSIONS);
    void ensureSessionTtlIndex(sessionsCol);

    const modeTimes = { split: 0, qp: 0, ms: 0, er: 0, other: 0 };
    const modeOpens = { split: 0, qp: 0, ms: 0, er: 0, other: 0 };
    const uniquePapers = new Set();

    for (const entry of paperEntries) {
      if (entry.deltaMs >= MIN_DURATION_MS) {
        modeTimes[entry.mode] += entry.deltaMs;
      }
      if (entry.opens > 0) {
        modeOpens[entry.mode] += entry.opens;
      }
      uniquePapers.add(entry.paperKey);
    }

    const browseDeltaMs = Math.max(0, effectiveSiteDeltaMs - totalPaperDeltaMs);
    const sessionInc = {
      activeTimeMs: effectiveSiteDeltaMs
    };
    if (browseDeltaMs > 0) sessionInc.browseTimeMs = browseDeltaMs;
    for (const m of ALLOWED_MODES) {
      if (modeTimes[m] > 0) sessionInc[`${m}TimeMs`] = modeTimes[m];
      if (modeOpens[m] > 0) sessionInc[`${m}Opens`] = modeOpens[m];
    }

    const updateDoc = {
      $inc: sessionInc,
      $set: {
        device,
        lastSeenAt: nowIso,
        expiresAt: new Date(now + SESSION_RETENTION_MS)
      },
      $setOnInsert: {
        visitorId: viewerId ? hashIdentifier(viewerId) : hashIdentifier(clientIp),
        startedAt: nowIso
      }
    };

    if (uniquePapers.size > 0) {
      updateDoc.$addToSet = {
        papersViewed: { $each: Array.from(uniquePapers) }
      };
    }

    await sessionsCol.updateOne({ _id: sessionId }, updateDoc, { upsert: true });

    return sendJsonResponse(res, 200, {
      ok: true,
      recorded: true,
      papersUpdated: paperEntries.length
    });
  } catch {
    // Graceful non-blocking failure so client lifecycle is never impacted
    return sendJsonResponse(res, 202, { ok: true, recorded: false });
  }
}

