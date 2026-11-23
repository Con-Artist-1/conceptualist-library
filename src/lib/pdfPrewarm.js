// Zero-waste reader pre-warming:
// 1. Preloads lazy reader UI + PDF.js chunks ONCE on first paper button hover/focus (0 Hugging Face traffic).
// 2. Starts exact clicked PDF fetch ONLY on pointerdown (button pressed, ~80-120ms before click fires)
//    so 0% of Hugging Face requests are wasted on mouse sweeps, with strict 2-slot LRU & Save-Data guards.

import { getHfUrl } from './libraryHelpers.js';

const LARGE_PDF_STREAM_THRESHOLD = 5 * 1024 * 1024;
const STREAM_BOOTSTRAP_BYTES = 131072;
const PREWARM_TTL_MS = 12000;
const MAX_PREWARM_SLOTS = 2;
const PDFJS_ASSET_VERSION = '4.10.38';

let readerChunksPreloaded = false;
let hfPreconnected = false;
let pdfjsModulePromise = null;
const prewarmCache = new Map(); // url -> { kind: 'range' | 'full', promise, ctrl, ts }

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

function isConstrainedNetwork() {
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

export function preloadPdfJsModule() {
  if (!pdfjsModulePromise && typeof window !== 'undefined') {
    const base = window.location.origin;
    const ver = encodeURIComponent(PDFJS_ASSET_VERSION);
    pdfjsModulePromise = import(/* @vite-ignore */ `${base}/pdfjs/pdf.min.mjs?v=${ver}`)
      .then((mod) => {
        mod.GlobalWorkerOptions.workerSrc = `${base}/pdfjs/pdf.worker.min.mjs?v=${ver}`;
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

function startSinglePdfPrewarm(url, fileSize) {
  if (!url || isConstrainedNetwork() || typeof fetch !== 'function') return;
  const now = Date.now();
  prunePrewarmCache(now);

  const existing = prewarmCache.get(url);
  if (existing && now - existing.ts <= PREWARM_TTL_MS) return;

  const ctrl = new AbortController();
  const isLarge = Number(fileSize) >= LARGE_PDF_STREAM_THRESHOLD;

  if (isLarge) {
    const promise = fetch(url, {
      headers: { Range: `bytes=0-${STREAM_BOOTSTRAP_BYTES - 1}` },
      signal: ctrl.signal
    })
      .then(async (res) => {
        if (!res.ok && res.status !== 206) return null;
        if (res.status !== 206) {
          try { await res.body?.cancel?.(); } catch { /* ignore */ }
          return null;
        }
        const cr = res.headers.get('content-range') || '';
        const crMatch = /\/(\d+)$/.exec(cr);
        const totalLength = crMatch ? parseInt(crMatch[1], 10) : 0;
        if (!totalLength || totalLength <= STREAM_BOOTSTRAP_BYTES * 2) {
          try { await res.body?.cancel?.(); } catch { /* ignore */ }
          return null;
        }
        const resolvedCdnUrl = res.url || url;
        const initialData = new Uint8Array(await res.arrayBuffer());
        if (initialData.byteLength === 0) return null;
        return { resolvedCdnUrl, totalLength, initialData };
      })
      .catch(() => null);

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

// Called strictly on onPointerDown (mouse button 0 pressed) for the exact paper about to open
export function prewarmPaperOnPointerDown(file, preferredView = '') {
  if (!file || typeof window === 'undefined') return;
  preloadReaderChunksOnce();
  if (isConstrainedNetwork()) return;

  const siblings = { ...(file.siblings || {}), ...(file.docs || {}) };
  const targets = [];

  if (preferredView === 'split' && siblings.QP?.ext === 'pdf' && siblings.MS?.ext === 'pdf') {
    targets.push(siblings.QP, siblings.MS);
  } else {
    const doc = (preferredView && siblings[preferredView]) || file.primaryFile || file;
    const ext = (doc?.ext || (doc?.path ? doc.path.split('.').pop() : '') || '').toLowerCase();
    if (doc?.path && ext === 'pdf') {
      targets.push(doc);
    }
  }

  if (targets.length === 0) return;

  const targetUrls = targets.map((d) => getHfUrl(d.path)).filter(Boolean);
  // Abort any unrelated stale pre-warm so only the exact clicked paper is fetched
  for (const [key, entry] of prewarmCache.entries()) {
    if (!targetUrls.includes(key)) {
      try { entry.ctrl.abort(); } catch { /* ignore */ }
      prewarmCache.delete(key);
    }
  }
  evictExcessSlots(targetUrls);

  targets.forEach((doc) => {
    const url = getHfUrl(doc.path);
    if (url) startSinglePdfPrewarm(url, doc.size || 0);
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
