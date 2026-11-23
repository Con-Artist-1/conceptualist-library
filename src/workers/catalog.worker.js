// Dedicated ES Module Web Worker for Conceptualist Systems Library.
// Handles partitioned board index fetching/caching (Edexcel & Cambridge), hydration,
// smart fuzzy search, sorting, and pagination slicing completely off the main UI thread.

import {
  hydrateCatalogPayload,
  mergeHydratedStates,
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

const boardStates = new Map();
const boardFullLoaded = new Set();
const boardGenAt = new Map();
let shardState = null;
let shardBoard = '';
let mergedCache = null;

let lastSortedFiles = [];
let lastQueryMeta = {
  isPartialFallback: false,
  missingTerms: [],
  appliedCorrections: [],
  didYouMean: ''
};

const decoder = new TextDecoder('utf-8');
const activeAbortControllers = new Map();

function getStateForBoard(filterBoard = '') {
  if (filterBoard === 'edexcel' || filterBoard === 'cambridge') {
    const full = boardStates.get(filterBoard);
    if (full) return full;
    if (shardState && (!shardBoard || shardBoard === filterBoard)) return shardState;
    return null;
  }
  if (boardStates.size === 0) return shardState;
  if (boardStates.size === 1) return boardStates.values().next().value;
  if (!mergedCache) {
    mergedCache = mergeHydratedStates(Array.from(boardStates.values()));
  }
  return mergedCache;
}

function applyJson(json, { isFull, board = 'edexcel' }) {
  const bKey = String(board || json.meta?.board || 'edexcel').toLowerCase();
  if (!isFull && boardFullLoaded.has(bKey)) {
    const existing = boardStates.get(bKey);
    return {
      skipped: true,
      isFull: true,
      board: bKey,
      generatedAt: boardGenAt.get(bKey) || '',
      counts: existing?.counts || null,
      meta: existing?.meta || null
    };
  }
  const hydrated = hydrateCatalogPayload(json);
  if (isFull) {
    boardStates.set(bKey, hydrated);
    boardFullLoaded.add(bKey);
    boardGenAt.set(bKey, json.meta?.generatedAt || '');
    mergedCache = null;
    if (shardBoard === bKey) {
      shardState = null;
      shardBoard = '';
    }
  } else {
    shardState = hydrated;
    shardBoard = bKey;
  }
  lastSortedFiles = [];
  return {
    skipped: false,
    isFull: boardFullLoaded.has(bKey),
    board: bKey,
    generatedAt: json.meta?.generatedAt || '',
    counts: hydrated.counts,
    meta: json.meta?.isShard ? null : (json.meta || null)
  };
}

function isCacheFresh(cached, expectedMeta, boardKey) {
  if (!cached) return false;
  if (!expectedMeta) return true;
  if (cached.meta?.generatedAt !== expectedMeta.generatedAt) return false;
  const expectedBoardCount = expectedMeta.boards?.[boardKey]?.uniqueFiles;
  if (expectedBoardCount != null && cached.meta?.partitionUniqueFiles != null) {
    return cached.meta.partitionUniqueFiles === expectedBoardCount;
  }
  return cached.meta?.uniqueFiles === expectedMeta.uniqueFiles;
}

self.onmessage = async (event) => {
  const { id, type, payload = {} } = event.data || {};
  if (type === 'ABORT') {
    const ctrl = activeAbortControllers.get(payload.targetId);
    if (ctrl) {
      ctrl.abort();
      activeAbortControllers.delete(payload.targetId);
    }
    return;
  }
  try {
    if (type === 'LOAD_BUFFER') {
      const { buffer, isFull = false, cacheUrl = '', board = 'edexcel' } = payload;
      const text = decoder.decode(new Uint8Array(buffer));
      const json = JSON.parse(text);
      if (isFull && cacheUrl) {
        void writeCachedIndex(
          cacheUrl,
          new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
        );
      }
      const result = applyJson(json, { isFull, board });
      self.postMessage({ id, ok: true, result });
      return;
    }

    if (type === 'LOAD_SHARD') {
      const { shardUrl, cacheUrl, expectedMeta, board = 'edexcel' } = payload;
      const bKey = String(board || 'edexcel').toLowerCase();
      const controller = new AbortController();
      activeAbortControllers.set(id, controller);
      try {
        if (boardFullLoaded.has(bKey)) {
          self.postMessage({
            id,
            ok: true,
            result: {
              skipped: true,
              isFull: true,
              board: bKey,
              generatedAt: boardGenAt.get(bKey) || '',
              counts: boardStates.get(bKey)?.counts || null,
              meta: null
            }
          });
          return;
        }
        // Check Cache API for valid full board index first
        if (cacheUrl) {
          const cached = await readCachedIndex(cacheUrl);
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (isCacheFresh(cached, expectedMeta, bKey)) {
            const result = applyJson(cached, { isFull: true, board: bKey });
            self.postMessage({ id, ok: true, result: { ...result, fromFullCache: true } });
            return;
          }
        }

        const res = await fetch(shardUrl, { signal: controller.signal });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) {
          throw new Error(`Shard unavailable (${res.status})`);
        }
        const shardJson = await res.json();
        if (!Array.isArray(shardJson?.files)) {
          throw new Error('Malformed shard payload');
        }
        const result = applyJson(shardJson, { isFull: false, board: bKey });
        self.postMessage({ id, ok: true, result });
        return;
      } finally {
        activeAbortControllers.delete(id);
      }
    }

    if (type === 'LOAD_FULL_INDEX') {
      const { urls, cacheUrl, expectedMeta, forceReload = false, board = 'edexcel' } = payload;
      const bKey = String(board || 'edexcel').toLowerCase();
      if (
        !forceReload &&
        boardFullLoaded.has(bKey) &&
        (!expectedMeta || boardGenAt.get(bKey) === expectedMeta.generatedAt)
      ) {
        self.postMessage({
          id,
          ok: true,
          result: {
            skipped: true,
            isFull: true,
            board: bKey,
            generatedAt: boardGenAt.get(bKey) || '',
            counts: boardStates.get(bKey)?.counts || null,
            meta: null
          }
        });
        return;
      }

      const controller = new AbortController();
      activeAbortControllers.set(id, controller);
      try {
        if (!forceReload && cacheUrl) {
          const cached = await readCachedIndex(cacheUrl);
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (isCacheFresh(cached, expectedMeta, bKey)) {
            const result = applyJson(cached, { isFull: true, board: bKey });
            self.postMessage({ id, ok: true, result: { ...result, fromCache: true } });
            return;
          }
        }

        const res = await resilientFetch(urls, { signal: controller.signal }, 50000);
        const clone = res.clone();
        const json = await res.json();
        if (cacheUrl) void writeCachedIndex(cacheUrl, clone);
        const result = applyJson(json, { isFull: true, board: bKey });
        self.postMessage({ id, ok: true, result });
        return;
      } finally {
        activeAbortControllers.delete(id);
      }
    }

    if (type === 'QUERY') {
      const { visibleCount = 80, filterBoard = '' } = payload;
      const targetState = getStateForBoard(filterBoard);
      const { sortedFiles, meta } = queryCatalogState(targetState, payload);
      lastSortedFiles = sortedFiles;
      lastQueryMeta = meta;
      const slice = sortedFiles.slice(0, visibleCount).map(serializeItemForUi);
      const fallbackUnits = payload.needFallbackUnits
        ? getFallbackUnitsFromState(targetState, payload.filterSubject, payload.filterCurriculum)
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
      let paper = null;
      for (const st of boardStates.values()) {
        paper = resolvePaperFromState(st, payload.paperParam);
        if (paper) break;
      }
      if (!paper && shardState) {
        paper = resolvePaperFromState(shardState, payload.paperParam);
      }
      self.postMessage({ id, ok: true, result: paper });
      return;
    }

    if (type === 'RESOLVE_SAMPLE_AUDIO') {
      const prefBoard = payload.board || 'edexcel';
      const preferredState = boardStates.get(prefBoard) || getStateForBoard('all');
      const sample = preferredState?.sampleAudio
        ? serializeItemForUi(preferredState.sampleAudio)
        : (boardStates.get('edexcel')?.sampleAudio ? serializeItemForUi(boardStates.get('edexcel').sampleAudio) : null);
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
