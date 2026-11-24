// Thin main-thread RPC client for src/workers/catalog.worker.js.
// Falls back seamlessly to lazy main-thread catalogEngine.js only if Web Workers are unavailable.

let sharedClient = null;

function createWorkerClient() {
  let worker = null;
  let nextReqId = 1;
  const pending = new Map();

  const fallbackBoardStates = new Map();
  const fallbackFullLoaded = new Set();
  const fallbackGenAt = new Map();
  let fallbackShardState = null;
  let fallbackShardBoard = '';
  let fallbackMerged = null;
  let fallbackSorted = [];
  let fallbackMeta = { isPartialFallback: false, missingTerms: [], appliedCorrections: [], didYouMean: '' };
  let enginePromise = null;

  const getFallbackEngine = () => {
    if (!enginePromise) {
      enginePromise = import('./catalogEngine.js');
    }
    return enginePromise;
  };

  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('../workers/catalog.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (ev) => {
        const { id, ok, result, error } = ev.data || {};
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        if (ok) entry.resolve(result);
        else entry.reject(new Error(error || 'Catalog worker error'));
      };
      worker.onerror = () => {
        for (const entry of pending.values()) {
          entry.reject(new Error('Catalog worker crashed'));
        }
        pending.clear();
        try { worker.terminate(); } catch { /* ignore */ }
        worker = null;
      };
    } catch {
      worker = null;
    }
  }

  const callWorker = (type, payload, transferables = [], signal = null) => {
    if (!worker) return null;
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }
    const id = nextReqId++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!pending.has(id)) return;
        pending.delete(id);
        try {
          worker?.postMessage({ id: 0, type: 'ABORT', payload: { targetId: id } });
        } catch {
          // Ignore worker postMessage errors during abort
        }
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
      pending.set(id, {
        resolve: (val) => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve(val);
        },
        reject: (err) => {
          if (signal) signal.removeEventListener('abort', onAbort);
          reject(err);
        }
      });
      try {
        worker.postMessage({ id, type, payload }, transferables);
      } catch (err) {
        if (signal) signal.removeEventListener('abort', onAbort);
        pending.delete(id);
        reject(err);
      }
    });
  };

  const getFallbackStateForBoard = (eng, filterBoard = '') => {
    if (filterBoard === 'edexcel' || filterBoard === 'cambridge') {
      if (fallbackMerged) fallbackMerged = null;
      const full = fallbackBoardStates.get(filterBoard);
      if (full) return full;
      if (fallbackShardState && (!fallbackShardBoard || fallbackShardBoard === 'all' || fallbackShardBoard === filterBoard)) return fallbackShardState;
      return null;
    }
    if (fallbackBoardStates.size === 0) return fallbackShardState;
    if (fallbackBoardStates.size === 1 && (!fallbackShardState || fallbackShardBoard !== 'all')) {
      return fallbackBoardStates.values().next().value;
    }
    if (fallbackBoardStates.size >= 2) {
      if (!fallbackMerged) {
        fallbackMerged = eng.mergeHydratedStates(Array.from(fallbackBoardStates.values()));
      }
      return fallbackMerged;
    }
    return fallbackShardState || fallbackBoardStates.values().next().value;
  };

  const runFallback = async (type, payload, signal = null) => {
    const eng = await getFallbackEngine();
    const bKey = String(payload.board || 'edexcel').toLowerCase();

    if (type === 'LOAD_BUFFER') {
      if (!payload.buffer || payload.buffer.byteLength === 0) {
        throw new Error('Transferred buffer detached before fallback decode');
      }
      const text = new TextDecoder('utf-8').decode(new Uint8Array(payload.buffer));
      const json = JSON.parse(text);
      if (!payload.isFull && fallbackFullLoaded.has(bKey)) {
        return { skipped: true, isFull: true, board: bKey, generatedAt: fallbackGenAt.get(bKey) || '', counts: fallbackBoardStates.get(bKey)?.counts || null, meta: null };
      }
      const hydrated = eng.hydrateCatalogPayload(json);
      if (payload.isFull) {
        fallbackBoardStates.set(bKey, hydrated);
        fallbackFullLoaded.add(bKey);
        fallbackGenAt.set(bKey, json.meta?.generatedAt || '');
        fallbackMerged = null;
      } else {
        fallbackShardState = hydrated;
        fallbackShardBoard = bKey;
      }
      return { skipped: false, isFull: fallbackFullLoaded.has(bKey), board: bKey, generatedAt: json.meta?.generatedAt || '', counts: hydrated.counts, meta: json.meta?.isShard ? null : (json.meta || null) };
    }
    if (type === 'LOAD_SHARD') {
      if (fallbackFullLoaded.has(bKey)) {
        return { skipped: true, isFull: true, board: bKey, generatedAt: fallbackGenAt.get(bKey) || '', counts: fallbackBoardStates.get(bKey)?.counts || null, meta: null };
      }
      const res = await fetch(payload.shardUrl, signal ? { signal } : undefined);
      if (!res.ok) throw new Error(`Shard unavailable (${res.status})`);
      const json = await res.json();
      fallbackShardState = eng.hydrateCatalogPayload(json);
      fallbackShardBoard = bKey;
      return { skipped: false, isFull: false, board: bKey, generatedAt: json.meta?.generatedAt || '', counts: fallbackShardState?.counts || null, meta: null };
    }
    if (type === 'LOAD_FULL_INDEX') {
      if (!payload.forceReload && fallbackFullLoaded.has(bKey) && (!payload.expectedMeta || fallbackGenAt.get(bKey) === payload.expectedMeta.generatedAt)) {
        return { skipped: true, isFull: true, board: bKey, generatedAt: fallbackGenAt.get(bKey) || '', counts: fallbackBoardStates.get(bKey)?.counts || null, meta: null };
      }
      let json = null;
      for (const url of payload.urls || []) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        try {
          const res = await fetch(url, signal ? { signal } : undefined);
          if (res.ok) {
            json = await res.json();
            break;
          }
        } catch (err) {
          if (signal?.aborted) throw err;
        }
      }
      if (!json) throw new Error('Failed to fetch catalog index');
      const hydrated = eng.hydrateCatalogPayload(json);
      fallbackBoardStates.set(bKey, hydrated);
      fallbackFullLoaded.add(bKey);
      fallbackGenAt.set(bKey, json.meta?.generatedAt || '');
      fallbackMerged = null;
      return { skipped: false, isFull: true, board: bKey, generatedAt: json.meta?.generatedAt || '', counts: hydrated.counts, meta: json.meta || null };
    }
    if (type === 'QUERY') {
      const targetState = getFallbackStateForBoard(eng, payload.filterBoard);
      const { sortedFiles, meta } = eng.queryCatalogState(targetState, payload);
      fallbackSorted = sortedFiles;
      fallbackMeta = meta;
      return {
        visibleFiles: sortedFiles.slice(0, payload.visibleCount || 80).map(eng.serializeItemForUi),
        totalMatchedCount: sortedFiles.length,
        meta,
        fallbackUnits: payload.needFallbackUnits
          ? eng.getFallbackUnitsFromState(targetState, payload.filterSubject, payload.filterCurriculum)
          : null
      };
    }
    if (type === 'SLICE') {
      return {
        visibleFiles: fallbackSorted.slice(0, payload.visibleCount || 80).map(eng.serializeItemForUi),
        totalMatchedCount: fallbackSorted.length,
        meta: fallbackMeta
      };
    }
    if (type === 'RESOLVE_PAPER') {
      for (const st of fallbackBoardStates.values()) {
        const hit = eng.resolvePaperFromState(st, payload.paperParam);
        if (hit) return hit;
      }
      return fallbackShardState ? eng.resolvePaperFromState(fallbackShardState, payload.paperParam) : null;
    }
    if (type === 'RESOLVE_SAMPLE_AUDIO') {
      const target = fallbackBoardStates.get(payload.board || 'edexcel') || getFallbackStateForBoard(eng, 'all');
      return target?.sampleAudio ? eng.serializeItemForUi(target.sampleAudio) : null;
    }
    return null;
  };

  const dispatch = async (type, payload, transferables = [], signal = null) => {
    if (worker) {
      try {
        return await callWorker(type, payload, transferables, signal);
      } catch (err) {
        if (!worker && !signal?.aborted) {
          return runFallback(type, payload, signal);
        }
        throw err;
      }
    }
    return runFallback(type, payload, signal);
  };

  return {
    loadBuffer(buffer, { isFull = false, cacheUrl = '', board = 'edexcel' } = {}) {
      return dispatch('LOAD_BUFFER', { buffer, isFull, cacheUrl, board }, [buffer]);
    },
    loadShard({ shardUrl, cacheUrl, expectedMeta, board = 'edexcel', signal = null }) {
      return dispatch('LOAD_SHARD', { shardUrl, cacheUrl, expectedMeta, board }, [], signal);
    },
    loadFullIndex({ urls, cacheUrl, expectedMeta, forceReload = false, board = 'edexcel', signal = null }) {
      return dispatch('LOAD_FULL_INDEX', { urls, cacheUrl, expectedMeta, forceReload, board }, [], signal);
    },
    query(params) {
      return dispatch('QUERY', params);
    },
    slice(visibleCount) {
      return dispatch('SLICE', { visibleCount });
    },
    resolvePaper(paperParam) {
      return dispatch('RESOLVE_PAPER', { paperParam });
    },
    resolveSampleAudio(board = 'edexcel') {
      return dispatch('RESOLVE_SAMPLE_AUDIO', { board });
    }
  };
}

export function getCatalogClient() {
  if (!sharedClient) {
    sharedClient = createWorkerClient();
  }
  return sharedClient;
}
