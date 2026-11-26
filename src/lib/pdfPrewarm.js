// Zero-waste reader pre-warming, persistent PDF.js Worker pool, and CDN redirect cache:
// 1. Preloads lazy reader UI + PDF.js + warm PDFWorker ONCE on first paper hover/focus (0 Hugging Face traffic).
// 2. Starts exact clicked PDF fetch ONLY on pointerdown (~80-120ms before click fires)
//    with parallel Head + EOF Tail range bootstrap for large linearized PDFs.

import { getHfUrl } from './libraryHelpers.js';

export const LARGE_PDF_STREAM_THRESHOLD = 5 * 1024 * 1024; // All >= 5 MB PDFs across the archive are linearized
export const BOOK_PDF_STREAM_THRESHOLD = 2 * 1024 * 1024; // All textbook PDFs are linearized; stream >= 2 MB books

export function shouldUseRangeStreaming(fileSize = 0, isBook = false) {
  const bytes = Number(fileSize) || 0;
  return bytes >= (isBook ? BOOK_PDF_STREAM_THRESHOLD : LARGE_PDF_STREAM_THRESHOLD);
}
const HUGE_BOOK_THRESHOLD = 25 * 1024 * 1024; // >= 25 MB textbooks use 512 KB chunks + 1 MB bootstrap
const PREWARM_TTL_MS = 15000;
const CDN_META_TTL_MS = 8 * 60 * 1000; // Signed HF CDN URLs stay valid for >15 min; cache 8 min
const MAX_PREWARM_SLOTS = 2;
const MAX_POOLED_WORKERS = 2;
const PDFJS_ASSET_VERSION = '4.10.38';

let readerChunksPreloaded = false;
let hfPreconnected = false;
let pdfjsModulePromise = null;
const workerPool = []; // Array<{ worker: PDFWorker, inUse: boolean }>
const prewarmCache = new Map(); // url -> { kind: 'range' | 'full', promise, ctrl, ts }
const cdnMetaCache = new Map(); // url -> { resolvedCdnUrl, totalLength, ts }

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

function ensurePrimaryWorkerBooted(mod) {
  if (!mod?.PDFWorker || workerPool.length > 0) return;
  try {
    const worker = new mod.PDFWorker({ name: 'cs-webpdf-0' });
    workerPool.push({ worker, inUse: false });
  } catch {
    // Fallback to PDF.js internal worker creation if blocked
  }
}

export function acquirePdfWorker(mod) {
  if (!mod?.PDFWorker) return null;
  ensurePrimaryWorkerBooted(mod);
  const freeSlot = workerPool.find((slot) => !slot.inUse && !slot.worker?.destroyed);
  if (freeSlot) {
    freeSlot.inUse = true;
    return freeSlot.worker;
  }
  if (workerPool.length < MAX_POOLED_WORKERS) {
    try {
      const worker = new mod.PDFWorker({ name: `cs-webpdf-${workerPool.length}` });
      workerPool.push({ worker, inUse: true });
      return worker;
    } catch {
      return null;
    }
  }
  return null;
}

export function releasePdfWorker(worker) {
  if (!worker) return;
  const slot = workerPool.find((s) => s.worker === worker);
  if (slot) {
    slot.inUse = false;
  }
}

export function preloadPdfJsModule() {
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

// Shared helper used by both pointerdown prewarm and PdfViewerPane cold opens:
// Resolves CDN redirect once, streams head bootstrap bytes AND fires parallel EOF chunk fetch immediately!
export async function fetchRangeBootstrapBundle(url, fileSize = 0, signal) {
  const chunkSize = getStreamChunkSize(fileSize);
  const bootstrapBytes = getStreamBootstrapBytes(fileSize);
  const cachedMeta = getCachedCdnMeta(url);
  const bootTargetUrl = cachedMeta?.resolvedCdnUrl || url;

  let bootRes = await fetch(bootTargetUrl, {
    headers: { Range: `bytes=0-${bootstrapBytes - 1}` },
    signal
  });

  if ((bootRes.status === 401 || bootRes.status === 403) && bootTargetUrl !== url) {
    invalidateCachedCdnMeta(url);
    bootRes = await fetch(url, {
      headers: { Range: `bytes=0-${bootstrapBytes - 1}` },
      signal
    });
  }

  if (!bootRes.ok && bootRes.status !== 206) {
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

  // Immediately kick off parallel 1-chunk EOF tail fetch on the already-resolved CDN URL BEFORE awaiting bootRes body!
  // PDF.js Wave 1 ALWAYS requests this exact final aligned chunk for startxref / main XRef (0 wasted bytes).
  const lastChunkIdx = Math.floor((totalLength - 1) / chunkSize);
  const tailBegin = lastChunkIdx * chunkSize;
  let tailChunksPromise = null;
  if (tailBegin >= bootstrapBytes && tailBegin < totalLength) {
    tailChunksPromise = fetch(resolvedCdnUrl, {
      headers: { Range: `bytes=${tailBegin}-${totalLength - 1}` },
      signal
    })
      .then(async (r) => {
        if (r.status !== 206) {
          try { await r.body?.cancel?.(); } catch { /* ignore */ }
          return null;
        }
        const raw = new Uint8Array(await r.arrayBuffer());
        return raw.byteLength > 0 ? [{ chunkIndex: lastChunkIdx, data: raw }] : null;
      })
      .catch(() => null);
  }

  const initialData = new Uint8Array(await bootRes.arrayBuffer());
  if (initialData.byteLength === 0) return null;

  return {
    resolvedCdnUrl,
    totalLength,
    chunkSize,
    initialData,
    tailChunksPromise
  };
}

function startSinglePdfPrewarm(url, fileSize, isBook = false) {
  if (!url || isConstrainedNetwork() || typeof fetch !== 'function') return;
  const now = Date.now();
  prunePrewarmCache(now);

  const existing = prewarmCache.get(url);
  if (existing && now - existing.ts <= PREWARM_TTL_MS) return;

  const ctrl = new AbortController();
  const isLarge = shouldUseRangeStreaming(fileSize, isBook);

  if (isLarge) {
    const promise = fetchRangeBootstrapBundle(url, fileSize, ctrl.signal).catch(() => null);
    prewarmCache.set(url, { kind: 'range', promise, ctrl, ts: now });
  } else {
    const promise = fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return buf.byteLength > 0 ? new Uint8Array(buf) : null;
      })
      .catch(() => null);

    prewarmCache.set(url, { kind: 'full', promise, ctrl, ts: now });
  }
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

export function consumePrewarmedRangeBootstrap(url) {
  if (!url) return null;
  prunePrewarmCache();
  const entry = prewarmCache.get(url);
  if (!entry || entry.kind !== 'range') return null;
  prewarmCache.delete(url);
  return entry.promise;
}

export function consumePrewarmedPdfBytes(url) {
  if (!url) return null;
  prunePrewarmCache();
  const entry = prewarmCache.get(url);
  if (!entry || entry.kind !== 'full') return null;
  prewarmCache.delete(url);
  return entry.promise;
}
