const TELEMETRY_ENDPOINT = '/api/telemetry';
const SESSION_STORAGE_KEY = 'cs_telemetry_session_v1';
const IDLE_CAP_MS = 10 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 5000;
const MODAL_CLOSE_COALESCE_MS = 50;
const MIN_SITE_FLUSH_MS = 250;

const ALLOWED_MODES = new Set(['split', 'qp', 'ms', 'er', 'gt', 'other']);

const state = {
  initialized: false,
  getViewerId: null,
  sessionId: '',
  device: 'desktop',
  isPageVisible: true,
  siteActiveStartAt: null,
  lastActivityAt: 0,
  siteDeltaMs: 0,
  // Tracks active paper being read: { paperKey, mode, startedAt }
  activePaper: null,
  // Modal-scoped deduplication so tab hides do not inflate sessions
  modalPaperKey: '',
  seenModesInModal: new Set(),
  pendingCloseTimer: null,
  // Queued open if setActivePaperTelemetry runs before App useEffect calls initTelemetryTracker
  pendingPaper: null,
  // Buffered per-(paperKey, mode) increments waiting to be sent
  paperBuffer: new Map(),
  cleanupListeners: null
};

const createTelemetrySessionId = () => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
        return existing;
      }
    }
  } catch {
    // Ignore storage access failures in private/restricted contexts
  }

  let generated = '';
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      generated = `s_${crypto.randomUUID().replace(/-/g, '')}`;
    }
  } catch {
    // Fallback below
  }
  if (!generated) {
    generated = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    }
  } catch {
    // Ignore storage write failures
  }
  return generated;
};

const getOrCreatePaperEntry = (paperKey, mode) => {
  const mapKey = `${paperKey}\u0000${mode}`;
  let entry = state.paperBuffer.get(mapKey);
  if (!entry) {
    entry = { paperKey, mode, deltaMs: 0, sessions: 0, opens: 0 };
    state.paperBuffer.set(mapKey, entry);
  }
  return entry;
};

const settleActiveTimeUntil = (now) => {
  const effectiveEnd = Math.min(now, state.lastActivityAt + IDLE_CAP_MS);

  if (state.siteActiveStartAt !== null) {
    const siteElapsed = Math.max(0, effectiveEnd - state.siteActiveStartAt);
    state.siteDeltaMs += siteElapsed;
    state.siteActiveStartAt = state.isPageVisible ? now : null;
  }

  if (state.activePaper && state.activePaper.startedAt !== null) {
    const paperElapsed = Math.max(0, effectiveEnd - state.activePaper.startedAt);
    if (paperElapsed > 0) {
      const entry = getOrCreatePaperEntry(state.activePaper.paperKey, state.activePaper.mode);
      entry.deltaMs += paperElapsed;
    }
    state.activePaper.startedAt = state.isPageVisible ? now : null;
  }
};

const pauseTimers = (now = Date.now()) => {
  settleActiveTimeUntil(now);
  state.siteActiveStartAt = null;
  if (state.activePaper) {
    state.activePaper.startedAt = null;
  }
};

const resumeTimers = (now = Date.now()) => {
  state.lastActivityAt = now;
  if (state.siteActiveStartAt === null) {
    state.siteActiveStartAt = now;
  }
  if (state.activePaper && state.activePaper.startedAt === null) {
    state.activePaper.startedAt = now;
  }
};

const clearPendingCloseTimer = () => {
  if (state.pendingCloseTimer !== null) {
    clearTimeout(state.pendingCloseTimer);
    state.pendingCloseTimer = null;
  }
};

const sendTelemetryPayload = (payload) => {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(
        TELEMETRY_ENDPOINT,
        new Blob([body], { type: 'application/json' })
      );
      if (sent) return;
    }
  } catch {
    // Fall through to keepalive fetch
  }

  try {
    if (typeof fetch === 'function') {
      void fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch(() => {});
    }
  } catch {
    // Ignore transport failures silently
  }
};

const flushTelemetry = () => {
  if (!state.initialized || typeof window === 'undefined') return;

  const now = Date.now();
  settleActiveTimeUntil(now);

  const siteDeltaMs = Math.round(state.siteDeltaMs);
  const paperEntries = [];
  for (const entry of state.paperBuffer.values()) {
    const deltaMs = Math.round(entry.deltaMs);
    if (deltaMs > 0 || entry.sessions > 0 || entry.opens > 0) {
      paperEntries.push({
        paperKey: entry.paperKey,
        mode: entry.mode,
        deltaMs,
        sessions: entry.sessions,
        opens: entry.opens
      });
    }
  }

  if (siteDeltaMs < MIN_SITE_FLUSH_MS && paperEntries.length === 0) {
    return;
  }

  // Drain buffers before dispatching so simultaneous hide events cannot double-send
  state.siteDeltaMs = 0;
  state.paperBuffer.clear();

  const getDeviceType = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop';
      }
      if (typeof window !== 'undefined') {
        return window.innerWidth <= 768 ? 'mobile' : 'desktop';
      }
    } catch {
      // Fallback to last recorded device state
    }
    return state.device || 'desktop';
  };

  const viewerId = typeof state.getViewerId === 'function' ? state.getViewerId() : '';
  sendTelemetryPayload({
    sessionId: state.sessionId,
    viewerId: viewerId || '',
    device: getDeviceType(),
    siteDeltaMs: Math.max(0, siteDeltaMs),
    paperEntries
  });
};

const onUserActivity = () => {
  if (!state.isPageVisible) return;
  const now = Date.now();
  const sinceLast = now - state.lastActivityAt;
  if (sinceLast < ACTIVITY_THROTTLE_MS) return;

  if (sinceLast > IDLE_CAP_MS) {
    // Close out the prior capped reading segment before starting a new active window
    settleActiveTimeUntil(now);
  }
  state.lastActivityAt = now;
};

const commitPaperClose = () => {
  clearPendingCloseTimer();
  const now = Date.now();
  settleActiveTimeUntil(now);
  state.activePaper = null;
  state.modalPaperKey = '';
  state.seenModesInModal.clear();
  flushTelemetry();
};

const updateTelemetryDevice = (isMobile) => {
  state.device = isMobile ? 'mobile' : 'desktop';
};

export const setActivePaperTelemetry = (paperKey, viewMode) => {
  const normalizedKey = typeof paperKey === 'string' ? paperKey.trim() : '';
  const normalizedMode = typeof viewMode === 'string' ? viewMode.trim().toLowerCase() : '';

  if (!state.initialized) {
    if (normalizedKey && ALLOWED_MODES.has(normalizedMode)) {
      state.pendingPaper = { paperKey: normalizedKey, mode: normalizedMode };
    } else {
      state.pendingPaper = null;
    }
    return;
  }

  clearPendingCloseTimer();

  if (!normalizedKey || !ALLOWED_MODES.has(normalizedMode)) {
    if (!state.activePaper) return;
    // Coalesce quick React StrictMode unmount/remount cycles cleanly
    state.pendingCloseTimer = setTimeout(commitPaperClose, MODAL_CLOSE_COALESCE_MS);
    return;
  }

  const now = Date.now();
  settleActiveTimeUntil(now);
  state.lastActivityAt = now;

  if (
    state.activePaper &&
    state.activePaper.paperKey === normalizedKey &&
    state.activePaper.mode === normalizedMode
  ) {
    if (state.isPageVisible && state.activePaper.startedAt === null) {
      state.activePaper.startedAt = now;
    }
    return;
  }

  if (state.modalPaperKey !== normalizedKey) {
    state.modalPaperKey = normalizedKey;
    state.seenModesInModal.clear();
  }

  const entry = getOrCreatePaperEntry(normalizedKey, normalizedMode);
  entry.opens += 1;
  if (!state.seenModesInModal.has(normalizedMode)) {
    state.seenModesInModal.add(normalizedMode);
    entry.sessions += 1;
  }

  state.activePaper = {
    paperKey: normalizedKey,
    mode: normalizedMode,
    startedAt: state.isPageVisible ? now : null
  };
};

export const initTelemetryTracker = ({ getViewerId, isMobile } = {}) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  if (typeof getViewerId === 'function') {
    state.getViewerId = getViewerId;
  }
  if (typeof isMobile === 'boolean') {
    updateTelemetryDevice(isMobile);
  } else {
    updateTelemetryDevice(window.innerWidth <= 768);
  }

  if (state.initialized) {
    return state.cleanupListeners || (() => {});
  }

  state.initialized = true;
  state.sessionId = createTelemetrySessionId();
  state.isPageVisible = document.visibilityState !== 'hidden';
  const now = Date.now();
  state.lastActivityAt = now;
  state.siteActiveStartAt = state.isPageVisible ? now : null;

  if (state.pendingPaper) {
    const queued = state.pendingPaper;
    state.pendingPaper = null;
    setActivePaperTelemetry(queued.paperKey, queued.mode);
  }

  const handleVisibilityChange = () => {
    const visible = document.visibilityState !== 'hidden';
    if (!visible) {
      state.isPageVisible = false;
      pauseTimers(Date.now());
      flushTelemetry();
      return;
    }
    state.isPageVisible = true;
    resumeTimers(Date.now());
  };

  const handlePageHide = () => {
    clearPendingCloseTimer();
    state.isPageVisible = false;
    pauseTimers(Date.now());
    flushTelemetry();
  };

  const handlePageShow = () => {
    if (document.visibilityState !== 'hidden') {
      state.isPageVisible = true;
      resumeTimers(Date.now());
    }
  };

  const passiveCapture = { passive: true, capture: true };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('pointerdown', onUserActivity, passiveCapture);
  window.addEventListener('keydown', onUserActivity, passiveCapture);
  window.addEventListener('wheel', onUserActivity, passiveCapture);
  window.addEventListener('touchstart', onUserActivity, passiveCapture);
  window.addEventListener('scroll', onUserActivity, passiveCapture);

  const teardown = () => {
    clearPendingCloseTimer();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('pointerdown', onUserActivity, passiveCapture);
    window.removeEventListener('keydown', onUserActivity, passiveCapture);
    window.removeEventListener('wheel', onUserActivity, passiveCapture);
    window.removeEventListener('touchstart', onUserActivity, passiveCapture);
    window.removeEventListener('scroll', onUserActivity, passiveCapture);
    state.initialized = false;
    state.cleanupListeners = null;
  };

  state.cleanupListeners = teardown;
  return teardown;
};
