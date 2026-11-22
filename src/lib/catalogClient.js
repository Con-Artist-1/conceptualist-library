// Thin main-thread RPC client for src/workers/catalog.worker.js.
// Falls back seamlessly to lazy main-thread catalogEngine.js only if Web Workers are unavailable.

let sharedClient = null;

function createWorkerClient() {
  let worker = null;
  let nextReqId = 1;
  const pending = new Map();
  let fallbackState = null;
  let fallbackSorted = [];
  let fallbackMeta = { isPartialFallback: false, missingTerms: [], appliedCorrections: [], didYouMean: '' };
  let fallbackIsFull = false;
  let fallbackGenAt = '';
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
        // Reject pending worker calls and fall back gracefully
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

  const callWorker = (type, payload, transferables = []) => {
    if (!worker) return null;
    const id = nextReqId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, type, payload }, transferables);
      } catch (err) {
        pending.delete(id);
        reject(err);
      }
    });
  };

  const runFallback = async (type, payload) => {
    const eng = await getFallbackEngine();
    if (type === 'LOAD_BUFFER') {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(payload.buffer));
      const json = JSON.parse(text);
      if (!payload.isFull && fallbackIsFull) {
        return { skipped: true, isFull: true, generatedAt: fallbackGenAt, counts: fallbackState?.counts || null, meta: null };
      }
      fallbackState = eng.hydrateCatalogPayload(json);
      if (payload.isFull) {
        fallbackIsFull = true;
        fallbackGenAt = json.meta?.generatedAt || '';
      }
      return { skipped: false, isFull: fallbackIsFull, generatedAt: json.meta?.generatedAt || '', counts: fallbackState.counts, meta: json.meta?.isShard ? null : (json.meta || null) };
    }
    if (type === 'LOAD_SHARD') {
      const res = await fetch(payload.shardUrl);
      if (!res.ok) throw new Error(`Shard unavailable (${res.status})`);
      const json = await res.json();
      if (!fallbackIsFull) {
        fallbackState = eng.hydrateCatalogPayload(json);
      }
      return { skipped: fallbackIsFull, isFull: fallbackIsFull, generatedAt: json.meta?.generatedAt || '', counts: fallbackState?.counts || null, meta: null };
    }
    if (type === 'LOAD_FULL_INDEX') {
      let json = null;
      for (const url of payload.urls || []) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            json = await res.json();
            break;
          }
        } catch { /* try next */ }
      }
      if (!json) throw new Error('Failed to fetch catalog index');
      fallbackState = eng.hydrateCatalogPayload(json);
      fallbackIsFull = true;
      fallbackGenAt = json.meta?.generatedAt || '';
      return { skipped: false, isFull: true, generatedAt: fallbackGenAt, counts: fallbackState.counts, meta: json.meta || null };
    }
    if (type === 'QUERY') {
      const { sortedFiles, meta } = eng.queryCatalogState(fallbackState, payload);
      fallbackSorted = sortedFiles;
      fallbackMeta = meta;
      return {
        visibleFiles: sortedFiles.slice(0, payload.visibleCount || 80).map(eng.serializeItemForUi),
        totalMatchedCount: sortedFiles.length,
        meta,
        fallbackUnits: payload.needFallbackUnits
          ? eng.getFallbackUnitsFromState(fallbackState, payload.filterSubject, payload.filterCurriculum)
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
      return eng.resolvePaperFromState(fallbackState, payload.paperParam);
    }
    if (type === 'RESOLVE_SAMPLE_AUDIO') {
      return fallbackState?.sampleAudio ? eng.serializeItemForUi(fallbackState.sampleAudio) : null;
    }
    return null;
  };

  const dispatch = async (type, payload, transferables = []) => {
    if (worker) {
      try {
        return await callWorker(type, payload, transferables);
      } catch (err) {
        if (!worker) {
          return runFallback(type, payload);
        }
        throw err;
      }
    }
    return runFallback(type, payload);
  };

  return {
    loadBuffer(buffer, { isFull = false, cacheUrl = '' } = {}) {
      return dispatch('LOAD_BUFFER', { buffer, isFull, cacheUrl }, [buffer]);
    },
    loadShard({ shardUrl, cacheUrl, expectedMeta }) {
      return dispatch('LOAD_SHARD', { shardUrl, cacheUrl, expectedMeta });
    },
    loadFullIndex({ urls, cacheUrl, expectedMeta, forceReload = false }) {
      return dispatch('LOAD_FULL_INDEX', { urls, cacheUrl, expectedMeta, forceReload });
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
    resolveSampleAudio() {
      return dispatch('RESOLVE_SAMPLE_AUDIO', {});
    }
  };
}

export function getCatalogClient() {
  if (!sharedClient) {
    sharedClient = createWorkerClient();
  }
  return sharedClient;
}
