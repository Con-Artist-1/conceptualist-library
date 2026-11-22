// Dedicated ES Module Web Worker for Conceptualist Systems Library.
// Handles 4.1 MB index.json fetching/caching, JSON parsing, 16,021-record hydration,
// smart fuzzy search, sorting, and pagination slicing completely off the main UI thread.

import {
  hydrateCatalogPayload,
  queryCatalogState,
  resolvePaperFromState,
  serializeItemForUi,
  getFallbackUnitsFromState
} from '../lib/catalogEngine.js';
import {
  resilientFetch,
  readCachedIndex,
  writeCachedIndex
} from '../lib/networkUtils.js';

let catalogState = null;
let isFullLoaded = false;
let loadedGenAt = '';
let lastSortedFiles = [];
let lastQueryMeta = {
  isPartialFallback: false,
  missingTerms: [],
  appliedCorrections: [],
  didYouMean: ''
};

const decoder = new TextDecoder('utf-8');

function applyJson(json, { isFull }) {
  if (!isFull && isFullLoaded) {
    return {
      skipped: true,
      isFull: true,
      generatedAt: loadedGenAt,
      counts: catalogState?.counts || null,
      meta: catalogState?.meta || null
    };
  }
  catalogState = hydrateCatalogPayload(json);
  if (isFull) {
    isFullLoaded = true;
    loadedGenAt = json.meta?.generatedAt || '';
  }
  lastSortedFiles = [];
  return {
    skipped: false,
    isFull: isFullLoaded,
    generatedAt: json.meta?.generatedAt || '',
    counts: catalogState.counts,
    meta: json.meta?.isShard ? null : (json.meta || null)
  };
}

self.onmessage = async (event) => {
  const { id, type, payload = {} } = event.data || {};
  try {
    if (type === 'LOAD_BUFFER') {
      const { buffer, isFull = false, cacheUrl = '' } = payload;
      const text = decoder.decode(new Uint8Array(buffer));
      const json = JSON.parse(text);
      if (isFull && cacheUrl) {
        void writeCachedIndex(
          cacheUrl,
          new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
        );
      }
      const result = applyJson(json, { isFull });
      self.postMessage({ id, ok: true, result });
      return;
    }

    if (type === 'LOAD_SHARD') {
      const { shardUrl, cacheUrl, expectedMeta } = payload;
      // Check Cache API for valid full index first
      if (cacheUrl) {
        const cached = await readCachedIndex(cacheUrl);
        const isValid = cached && (
          !expectedMeta ||
          (cached.meta?.generatedAt === expectedMeta.generatedAt &&
            cached.meta?.uniqueFiles === expectedMeta.uniqueFiles)
        );
        if (isValid) {
          const result = applyJson(cached, { isFull: true });
          self.postMessage({ id, ok: true, result: { ...result, fromFullCache: true } });
          return;
        }
      }

      const res = await fetch(shardUrl);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        throw new Error(`Shard unavailable (${res.status})`);
      }
      const shardJson = await res.json();
      if (!Array.isArray(shardJson?.files)) {
        throw new Error('Malformed shard payload');
      }
      const result = applyJson(shardJson, { isFull: false });
      self.postMessage({ id, ok: true, result });
      return;
    }

    if (type === 'LOAD_FULL_INDEX') {
      const { urls, cacheUrl, expectedMeta, forceReload = false } = payload;
      if (
        !forceReload &&
        isFullLoaded &&
        (!expectedMeta || loadedGenAt === expectedMeta.generatedAt)
      ) {
        self.postMessage({
          id,
          ok: true,
          result: {
            skipped: true,
            isFull: true,
            generatedAt: loadedGenAt,
            counts: catalogState?.counts || null,
            meta: null
          }
        });
        return;
      }

      if (!forceReload && cacheUrl) {
        const cached = await readCachedIndex(cacheUrl);
        const isValid = cached && (
          !expectedMeta ||
          (cached.meta?.generatedAt === expectedMeta.generatedAt &&
            cached.meta?.uniqueFiles === expectedMeta.uniqueFiles)
        );
        if (isValid) {
          const result = applyJson(cached, { isFull: true });
          self.postMessage({ id, ok: true, result: { ...result, fromCache: true } });
          return;
        }
      }

      const res = await resilientFetch(urls, {}, 50000);
      const clone = res.clone();
      const json = await res.json();
      if (cacheUrl) void writeCachedIndex(cacheUrl, clone);
      const result = applyJson(json, { isFull: true });
      self.postMessage({ id, ok: true, result });
      return;
    }

    if (type === 'QUERY') {
      const { visibleCount = 80 } = payload;
      const { sortedFiles, meta } = queryCatalogState(catalogState, payload);
      lastSortedFiles = sortedFiles;
      lastQueryMeta = meta;
      const slice = sortedFiles.slice(0, visibleCount).map(serializeItemForUi);
      const fallbackUnits = payload.needFallbackUnits
        ? getFallbackUnitsFromState(catalogState, payload.filterSubject, payload.filterCurriculum)
        : null;
      self.postMessage({
        id,
        ok: true,
        result: {
          visibleFiles: slice,
          totalMatchedCount: sortedFiles.length,
          meta,
          fallbackUnits
        }
      });
      return;
    }

    if (type === 'SLICE') {
      const { visibleCount = 80 } = payload;
      const slice = lastSortedFiles.slice(0, visibleCount).map(serializeItemForUi);
      self.postMessage({
        id,
        ok: true,
        result: {
          visibleFiles: slice,
          totalMatchedCount: lastSortedFiles.length,
          meta: lastQueryMeta
        }
      });
      return;
    }

    if (type === 'RESOLVE_PAPER') {
      const paper = resolvePaperFromState(catalogState, payload.paperParam);
      self.postMessage({ id, ok: true, result: paper });
      return;
    }

    if (type === 'RESOLVE_SAMPLE_AUDIO') {
      const sample = catalogState?.sampleAudio ? serializeItemForUi(catalogState.sampleAudio) : null;
      self.postMessage({ id, ok: true, result: sample });
      return;
    }

    throw new Error(`Unknown worker action: ${type}`);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err?.message || String(err)
    });
  }
};
