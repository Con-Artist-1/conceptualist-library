// Zero-waste reader pre-warming, persistent PDF.js Worker pool, CDN redirect cache,
// and live byte-progress streaming for both full PDFs (< 5 MB) and large linearized PDFs.

import { getHfUrl } from './libraryHelpers.js';

export const LARGE_PDF_STREAM_THRESHOLD = 5 * 1024 * 1024; // All >= 5 MB PDFs across the archive are linearized
export const BOOK_PDF_STREAM_THRESHOLD = 4 * 1024 * 1024; // Stream >= 4 MB textbooks via byte ranges

export function shouldUseRangeStreaming(fileSize = 0, isBook = false) {
  const bytes = Number(fileSize) || 0;
  return bytes >= (isBook ? BOOK_PDF_STREAM_THRESHOLD : LARGE_PDF_STREAM_THRESHOLD);
}

const HUGE_BOOK_THRESHOLD = 25 * 1024 * 1024; // >= 25 MB textbooks use 512 KB chunks + 1 MB bootstrap
const PREWARM_TTL_MS = 15000;
const CDN_META_TTL_MS = 8 * 60 * 1000; // Signed HF CDN URLs stay valid for >15 min; cache 8 min
const MAX_PREWARM_SLOTS = 2;
const MAX_POOLED_WORKERS = 3;
const WORKER_TEARDOWN_TIMEOUT_MS = 1500;
const FETCH_TIMEOUT_MS = 15000;
const RETRY_BACKOFFS_MS = [200, 500];
const PDFJS_ASSET_VERSION = '4.10.38-cs2';

let readerChunksPreloaded = false;
let hfPreconnected = false;
let pdfjsModulePromise = null;
const workerPool = []; // Array<{ worker: PDFWorker, inUse: boolean, poisoned: boolean }>
const prewarmCache = new Map(); // url -> { kind, promise, ctrl, ts, loadedBytes, totalBytes, listeners }
const cdnMetaCache = new Map(); // url -> { resolvedCdnUrl, totalLength, ts }

export function isLiveUint8Array(u8) {
  return (
    u8 instanceof Uint8Array &&
    u8.byteLength > 0 &&
    Boolean(u8.buffer) &&
    u8.buffer.byteLength > 0
  );
}

export function cloneUint8Array(u8) {
  if (!isLiveUint8Array(u8)) return null;
  return u8.slice();
}

export function getStreamChunkSize(fileSize = 0) {
  return Number(fileSize) >= HUGE_BOOK_THRESHOLD ? 524288 : 262144;
}

export function getStreamBootstrapBytes(fileSize = 0) {
  return Number(fileSize) >= HUGE_BOOK_THRESHOLD ? 1048576 : 524288;
}

export function getCachedCdnMeta(url) {
  if (!url) return null;
  const hit = cdnMetaCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.ts > CDN_META_TTL_MS) {
    cdnMetaCache.delete(url);
    return null;
  }
  return hit;
}

export function setCachedCdnMeta(url, resolvedCdnUrl, totalLength) {
  if (!url || !resolvedCdnUrl || !(totalLength > 0)) return;
  if (cdnMetaCache.size > 64) {
    const oldestKey = cdnMetaCache.keys().next().value;
    if (oldestKey) cdnMetaCache.delete(oldestKey);
  }
  cdnMetaCache.set(url, { resolvedCdnUrl, totalLength, ts: Date.now() });
}

export function invalidateCachedCdnMeta(url) {
  if (url) cdnMetaCache.delete(url);
}

function injectHfPreconnectOnce() {
  if (hfPreconnected || typeof document === 'undefined' || !document.head) return;
  hfPreconnected = true;
  for (const href of ['https://huggingface.co', 'https://us.aws.cdn.hf.co']) {
    if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}

export function isConstrainedNetwork() {
  try {
    const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
    if (!conn) return false;
    if (conn.saveData) return true;
    const eff = String(conn.effectiveType || '').toLowerCase();
    if (eff === 'slow-2g' || eff === '2g') return true;
  } catch {
    // Ignore Navigator.connection errors
  }
  return false;
}

function createPoolSlot(mod, inUse = false) {
  const worker = new mod.PDFWorker({ name: `cs-webpdf-${workerPool.length}` });
  const slot = { worker, inUse, poisoned: false };
  if (worker._webWorker && typeof worker._webWorker.addEventListener === 'function') {
    worker._webWorker.addEventListener('error', () => {
      slot.poisoned = true;
    });
  }
  workerPool.push(slot);
  return slot;
}

function removePoolSlot(slot) {
  if (!slot) return;
  const idx = workerPool.indexOf(slot);
  if (idx !== -1) workerPool.splice(idx, 1);
  if (slot.worker && !slot.worker.destroyed) {
    try { slot.worker.destroy(); } catch { /* ignore worker destroy error */ }
  }
}

function ensurePrimaryWorkerBooted(mod) {
  if (!mod?.PDFWorker || workerPool.length > 0) return;
  try {
    createPoolSlot(mod, false);
  } catch {
    // Fallback to PDF.js internal worker creation if blocked
  }
}

export function acquirePdfWorker(mod) {
  if (!mod?.PDFWorker) return null;
  ensurePrimaryWorkerBooted(mod);
  for (let i = workerPool.length - 1; i >= 0; i--) {
    const slot = workerPool[i];
    if (slot.poisoned || slot.worker?.destroyed) {
      if (!slot.inUse) removePoolSlot(slot);
    }
  }
  const freeSlot = workerPool.find((slot) => !slot.inUse && !slot.poisoned && !slot.worker?.destroyed);
  if (freeSlot) {
    freeSlot.inUse = true;
    return freeSlot.worker;
  }
  if (workerPool.length < MAX_POOLED_WORKERS) {
    try {
      const slot = createPoolSlot(mod, true);
      return slot.worker;
    } catch {
      return null;
    }
  }
  return null;
}

export function releasePdfWorker(worker, teardownPromise = null, { discard = false } = {}) {
  if (!worker) return;
  const slot = workerPool.find((s) => s.worker === worker);
  if (!slot) {
    if (discard && !worker.destroyed) {
      try { worker.destroy(); } catch { /* ignore */ }
    }
    return;
  }
  if (discard || slot.poisoned || worker.destroyed) {
    removePoolSlot(slot);
    return;
  }
  if (!teardownPromise) {
    slot.inUse = false;
    return;
  }

  let timerId = null;
  const timeoutGuard = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error('PDFWorker teardown timeout')), WORKER_TEARDOWN_TIMEOUT_MS);
  });

  Promise.race([Promise.resolve(teardownPromise), timeoutGuard])
    .then(() => {
      if (timerId !== null) clearTimeout(timerId);
      if (slot.poisoned || slot.worker?.destroyed) {
        removePoolSlot(slot);
      } else {
        slot.inUse = false;
      }
    })
    .catch(() => {
      if (timerId !== null) clearTimeout(timerId);
      removePoolSlot(slot);
    });
}

export function preloadPdfJsModule() {
  if (typeof window !== 'undefined') {
    injectHfPreconnectOnce();
  }
  if (!pdfjsModulePromise && typeof window !== 'undefined') {
    const base = window.location.origin;
    const ver = encodeURIComponent(PDFJS_ASSET_VERSION);
    pdfjsModulePromise = import(/* @vite-ignore */ `${base}/pdfjs/pdf.min.mjs?v=${ver}`)
      .then((mod) => {
        mod.GlobalWorkerOptions.workerSrc = `${base}/pdfjs/pdf.worker.min.mjs?v=${ver}`;
        ensurePrimaryWorkerBooted(mod);
        return mod;
      })
      .catch((err) => {
        pdfjsModulePromise = null;
        throw err;
      });
  }
  return pdfjsModulePromise;
}

// Runs AT MOST ONCE per browser session on first hover/focus over any paper button (Vercel static assets only)
export function preloadReaderChunksOnce() {
  if (readerChunksPreloaded || typeof window === 'undefined') return;
  if (isConstrainedNetwork()) return;
  readerChunksPreloaded = true;
  injectHfPreconnectOnce();
  void import('../components/PreviewModal.jsx').catch(() => {
    readerChunksPreloaded = false;
  });
  void import('../PdfViewerPane.jsx').catch(() => {});
  void preloadPdfJsModule()?.catch(() => {});
}

function prunePrewarmCache(now = Date.now()) {
  for (const [key, entry] of prewarmCache.entries()) {
    if (now - entry.ts > PREWARM_TTL_MS) {
      try { entry.ctrl.abort(); } catch { /* ignore */ }
      prewarmCache.delete(key);
    }
  }
}

function evictExcessSlots(keepUrls = []) {
  const keepSet = new Set(keepUrls);
  for (const [key, entry] of prewarmCache.entries()) {
    if (!keepSet.has(key) && prewarmCache.size >= MAX_PREWARM_SLOTS) {
      try { entry.ctrl.abort(); } catch { /* ignore */ }
      prewarmCache.delete(key);
    }
  }
}

function sleepWithAbort(ms, signal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchWithTimeout(targetUrl, options, outerSignal, timeoutMs = FETCH_TIMEOUT_MS) {
  if (outerSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const localCtrl = new AbortController();
  let timedOut = false;
  const onOuterAbort = () => localCtrl.abort(outerSignal.reason);
  if (outerSignal) outerSignal.addEventListener('abort', onOuterAbort, { once: true });
  const timerId = setTimeout(() => {
    timedOut = true;
    localCtrl.abort(new Error(`Network timeout after ${Math.round(timeoutMs / 1000)}s`));
  }, timeoutMs);

  try {
    return await fetch(targetUrl, { ...options, signal: localCtrl.signal });
  } catch (err) {
    if (timedOut) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timerId);
    if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort);
  }
}

function bufferContainsPdfHeader(u8) {
  const limit = Math.min(u8.byteLength, 1024);
  let head = '';
  for (let i = 0; i < limit; i++) {
    head += String.fromCharCode(u8[i]);
  }
  return head.includes('%PDF-');
}

async function readResponseWithProgress(res, fallbackTotalBytes, onProgress) {
  const contentLen = parseInt(res.headers.get('content-length') || '0', 10);
  const expectedTotal = contentLen > 0 ? contentLen : (Number(fallbackTotalBytes) || 0);

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let loadedBytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        onProgress?.(loadedBytes, Math.max(expectedTotal, loadedBytes));
      }
    }
    const merged = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }

  const raw = new Uint8Array(await res.arrayBuffer());
  onProgress?.(raw.byteLength, Math.max(expectedTotal, raw.byteLength));
  return raw;
}

// Streams full PDF bytes (< 5 MB papers / < 4 MB books) with timeouts, retries, magic validation, and live byte progress
export async function fetchPdfBytesWithProgress(url, fileSize = 0, signal, onProgress) {
  let targetUrl = getCachedCdnMeta(url)?.resolvedCdnUrl || url;
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      let res = await fetchWithTimeout(targetUrl, {}, signal, FETCH_TIMEOUT_MS);
      if ((res.status === 401 || res.status === 403) && targetUrl !== url) {
        try { await res.body?.cancel?.(); } catch { /* ignore */ }
        invalidateCachedCdnMeta(url);
        targetUrl = url;
        res = await fetchWithTimeout(url, {}, signal, FETCH_TIMEOUT_MS);
      }
      if (!res.ok) {
        try { await res.body?.cancel?.(); } catch { /* ignore */ }
        throw new Error(`HTTP ${res.status}`);
      }
      const bytes = await readResponseWithProgress(res, fileSize, onProgress);
      if (bytes.byteLength === 0) {
        throw new Error('Empty PDF response');
      }
      if (!bufferContainsPdfHeader(bytes)) {
        throw new Error('Server returned non-PDF content');
      }
      if (res.url) {
        setCachedCdnMeta(url, res.url, bytes.byteLength);
      }
      return bytes;
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      lastError = err;
      if (targetUrl !== url) {
        invalidateCachedCdnMeta(url);
        targetUrl = url;
      }
      if (attempt < RETRY_BACKOFFS_MS.length) {
        await sleepWithAbort(RETRY_BACKOFFS_MS[attempt], signal);
      }
    }
  }

  throw lastError || new Error('Failed to download PDF');
}

// Resolves CDN redirect once, streams Head bootstrap bytes AND fires parallel 2-chunk EOF tail fetch immediately!
export async function fetchRangeBootstrapBundle(url, fileSize = 0, signal, onProgress) {
  const chunkSize = getStreamChunkSize(fileSize);
  const bootstrapBytes = getStreamBootstrapBytes(fileSize);
  let bootTargetUrl = getCachedCdnMeta(url)?.resolvedCdnUrl || url;
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      let bootRes = await fetchWithTimeout(
        bootTargetUrl,
        { headers: { Range: `bytes=0-${bootstrapBytes - 1}` } },
        signal,
        FETCH_TIMEOUT_MS
      );

      if ((bootRes.status === 401 || bootRes.status === 403) && bootTargetUrl !== url) {
        try { await bootRes.body?.cancel?.(); } catch { /* ignore */ }
        invalidateCachedCdnMeta(url);
        bootTargetUrl = url;
        bootRes = await fetchWithTimeout(
          url,
          { headers: { Range: `bytes=0-${bootstrapBytes - 1}` } },
          signal,
          FETCH_TIMEOUT_MS
        );
      }

      if (!bootRes.ok && bootRes.status !== 206) {
        try { await bootRes.body?.cancel?.(); } catch { /* ignore */ }
        throw new Error(`HTTP ${bootRes.status}`);
      }
      if (bootRes.status !== 206) {
        try { await bootRes.body?.cancel?.(); } catch { /* ignore */ }
        return null;
      }

      const cr = bootRes.headers.get('content-range') || '';
      const crMatch = /\/(\d+)$/.exec(cr);
      const totalLength = crMatch ? parseInt(crMatch[1], 10) : 0;
      if (!totalLength || totalLength <= chunkSize * 2) {
        try { await bootRes.body?.cancel?.(); } catch { /* ignore */ }
        return null;
      }

      const resolvedCdnUrl = bootRes.url || bootTargetUrl;
      setCachedCdnMeta(url, resolvedCdnUrl, totalLength);

      const headExpected = Math.min(bootstrapBytes, totalLength);
      const lastChunkIdx = Math.floor((totalLength - 1) / chunkSize);
      const firstTailIdx = Math.max(Math.ceil(bootstrapBytes / chunkSize), lastChunkIdx - 1);
      const tailBegin = firstTailIdx * chunkSize;
      const tailExpected = tailBegin < totalLength ? totalLength - tailBegin : 0;
      const expectedBootstrapTotal = headExpected + tailExpected;

      let headLoaded = 0;
      let tailLoaded = 0;
      const emitBootProgress = () => {
        onProgress?.(headLoaded + tailLoaded, expectedBootstrapTotal);
      };

      // Immediately kick off parallel 2-chunk EOF tail fetch on the resolved CDN URL BEFORE awaiting bootRes body!
      let tailChunksPromise = null;
      if (tailBegin >= bootstrapBytes && tailBegin < totalLength) {
        tailChunksPromise = fetchWithTimeout(
          resolvedCdnUrl,
          { headers: { Range: `bytes=${tailBegin}-${totalLength - 1}` } },
          signal,
          FETCH_TIMEOUT_MS
        )
          .then(async (r) => {
            if (r.status !== 206) {
              try { await r.body?.cancel?.(); } catch { /* ignore */ }
              return null;
            }
            const raw = await readResponseWithProgress(r, tailExpected, (loaded) => {
              tailLoaded = loaded;
              emitBootProgress();
            });
            if (raw.byteLength < tailExpected) {
              return null;
            }
            const slices = [];
            for (let idx = firstTailIdx; idx <= lastChunkIdx; idx++) {
              const relStart = (idx - firstTailIdx) * chunkSize;
              const relEnd = Math.min(raw.byteLength, relStart + chunkSize);
              if (relEnd > relStart) {
                slices.push({ chunkIndex: idx, data: raw.slice(relStart, relEnd) });
              }
            }
            return slices.length > 0 ? slices : null;
          })
          .catch(() => null);
      }

      const initialData = await readResponseWithProgress(bootRes, headExpected, (loaded) => {
        headLoaded = loaded;
        emitBootProgress();
      });

      if (initialData.byteLength < headExpected) {
        throw new Error('Truncated PDF head bootstrap response');
      }
      if (!bufferContainsPdfHeader(initialData)) {
        throw new Error('Invalid PDF header in bootstrap response');
      }

      return {
        resolvedCdnUrl,
        totalLength,
        chunkSize,
        initialData,
        tailChunksPromise
      };
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      lastError = err;
      if (bootTargetUrl !== url) {
        invalidateCachedCdnMeta(url);
        bootTargetUrl = url;
      }
      if (attempt < RETRY_BACKOFFS_MS.length) {
        await sleepWithAbort(RETRY_BACKOFFS_MS[attempt], signal);
      }
    }
  }

  throw lastError || new Error('Failed to bootstrap PDF range transport');
}

function startSinglePdfPrewarm(url, fileSize, isBook = false) {
  if (!url || isConstrainedNetwork() || typeof fetch !== 'function') return;
  const now = Date.now();
  prunePrewarmCache(now);

  const existing = prewarmCache.get(url);
  if (existing && now - existing.ts <= PREWARM_TTL_MS) return;

  const ctrl = new AbortController();
  const isLarge = shouldUseRangeStreaming(fileSize, isBook);
  const entry = {
    kind: isLarge ? 'range' : 'full',
    promise: null,
    ctrl,
    ts: now,
    loadedBytes: 0,
    totalBytes: Number(fileSize) || 0,
    listeners: new Set()
  };

  const notifyProgress = (loaded, total) => {
    entry.loadedBytes = loaded;
    if (total > 0) entry.totalBytes = total;
    for (const cb of entry.listeners) {
      try { cb(entry.loadedBytes, entry.totalBytes); } catch { /* ignore */ }
    }
  };

  if (isLarge) {
    entry.promise = fetchRangeBootstrapBundle(url, fileSize, ctrl.signal, notifyProgress).catch(() => null);
  } else {
    entry.promise = fetchPdfBytesWithProgress(url, fileSize, ctrl.signal, notifyProgress).catch(() => null);
  }
  prewarmCache.set(url, entry);
}

// Called strictly on onPointerDown (mouse button 0 / touch pressed) for the exact paper about to open
export function prewarmPaperOnPointerDown(file, preferredView = '') {
  if (!file || typeof window === 'undefined') return;
  preloadReaderChunksOnce();
  if (isConstrainedNetwork()) return;

  const siblings = { ...(file.siblings || {}), ...(file.docs || {}) };
  const targets = [];

  if (preferredView === 'split' && siblings.QP?.ext === 'pdf' && (siblings.MS?.ext === 'pdf' || siblings.SC?.ext === 'pdf')) {
    targets.push(siblings.QP, siblings.MS?.ext === 'pdf' ? siblings.MS : siblings.SC);
  } else {
    const doc = (preferredView && siblings[preferredView]) || file.primaryFile || file;
    const ext = (doc?.ext || (doc?.path ? doc.path.split('.').pop() : '') || '').toLowerCase();
    if (doc?.path && ext === 'pdf') {
      targets.push(doc);
    }
  }

  if (targets.length === 0) return;

  const targetUrls = targets.map((d) => getHfUrl(d.path)).filter(Boolean);
  for (const [key, entry] of prewarmCache.entries()) {
    if (!targetUrls.includes(key)) {
      try { entry.ctrl.abort(); } catch { /* ignore */ }
      prewarmCache.delete(key);
    }
  }
  evictExcessSlots(targetUrls);

  targets.forEach((doc) => {
    const url = getHfUrl(doc.path);
    const isBook = doc.docType === 'Book' || String(doc.category || '').includes('Books');
    if (url) startSinglePdfPrewarm(url, doc.size || 0, isBook);
  });
}

export function consumePrewarmedRangeBootstrap(url, onProgress = null) {
  if (!url) return null;
  prunePrewarmCache();
  const entry = prewarmCache.get(url);
  if (!entry || entry.kind !== 'range') return null;
  prewarmCache.delete(url);
  if (typeof onProgress === 'function') {
    if (entry.loadedBytes > 0) {
      try { onProgress(entry.loadedBytes, entry.totalBytes); } catch { /* ignore */ }
    }
    entry.listeners.add(onProgress);
  }
  return entry.promise.then((bundle) => {
    if (typeof onProgress === 'function') entry.listeners.delete(onProgress);
    if (!bundle || !isLiveUint8Array(bundle.initialData)) return null;
    return {
      ...bundle,
      initialData: cloneUint8Array(bundle.initialData)
    };
  });
}

export function consumePrewarmedPdfBytes(url, onProgress = null) {
  if (!url) return null;
  prunePrewarmCache();
  const entry = prewarmCache.get(url);
  if (!entry || entry.kind !== 'full') return null;
  prewarmCache.delete(url);
  if (typeof onProgress === 'function') {
    if (entry.loadedBytes > 0) {
      try { onProgress(entry.loadedBytes, entry.totalBytes); } catch { /* ignore */ }
    }
    entry.listeners.add(onProgress);
  }
  return entry.promise.then((bytes) => {
    if (typeof onProgress === 'function') entry.listeners.delete(onProgress);
    return cloneUint8Array(bytes);
  });
}
