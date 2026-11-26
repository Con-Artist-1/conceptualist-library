// High-speed HTTP byte-range streaming transport for large PDFs in WebPDF viewer:
// - Parallel Head (512 KB–1 MB) + 2-chunk EOF Tail bootstrap eliminates Wave 1 & Catalog/Pages head misses.
// - Priority-partitioned LIFO concurrency-6 range scheduler puts viewport jumps ahead of speculative read-ahead.
// - 100% transfer-safe buffer ownership: every chunk stored in or served from sessionChunkCache is an isolated
//   Uint8Array copy so PDF.js postMessage ArrayBuffer transfers NEVER detach cached session memory.
// - Strict byte-length validation + 12s timeout + 3-attempt exponential retries prevent partial-206 deadlocks.

import {
  LARGE_PDF_STREAM_THRESHOLD,
  shouldUseRangeStreaming,
  getStreamChunkSize,
  setCachedCdnMeta,
  invalidateCachedCdnMeta,
  consumePrewarmedRangeBootstrap,
  fetchRangeBootstrapBundle,
  isLiveUint8Array,
  cloneUint8Array
} from './pdfPrewarm.js';

export { LARGE_PDF_STREAM_THRESHOLD, shouldUseRangeStreaming, getStreamChunkSize };
export const STREAM_CHUNK_SIZE = 262144;

const UNLINEARIZED_SINGLE_STREAM_MAX = 15 * 1024 * 1024;
const MAX_CONCURRENT_RANGE_FETCHES = 6;
const MAX_SESSION_CACHED_CHUNKS = 160;
const CHUNK_FETCH_TIMEOUT_MS = 12000;
const CHUNK_RETRY_BACKOFFS_MS = [180, 450, 950];

// Session-level LRU cache keyed by `${originalUrl}::${chunkSize}::${chunkIdx}`
const sessionChunkCache = new Map();
const sessionInitialCache = new Map(); // url -> { resolvedCdnUrl, totalLength, chunkSize, initialData, ts }
const SESSION_INITIAL_TTL_MS = 8 * 60 * 1000;

function putSessionChunk(cachePrefix, chunkIdx, u8) {
  if (!isLiveUint8Array(u8)) return;
  const owned =
    u8.byteOffset !== 0 || u8.byteLength !== u8.buffer.byteLength ? u8.slice() : u8;
  const key = `${cachePrefix}${chunkIdx}`;
  if (sessionChunkCache.has(key)) sessionChunkCache.delete(key);
  sessionChunkCache.set(key, owned);
  while (sessionChunkCache.size > MAX_SESSION_CACHED_CHUNKS) {
    const oldest = sessionChunkCache.keys().next().value;
    if (oldest === undefined) break;
    sessionChunkCache.delete(oldest);
  }
}

function getSessionChunk(cachePrefix, chunkIdx) {
  const key = `${cachePrefix}${chunkIdx}`;
  const hit = sessionChunkCache.get(key);
  if (!isLiveUint8Array(hit)) {
    if (hit !== undefined) sessionChunkCache.delete(key);
    return null;
  }
  sessionChunkCache.delete(key);
  sessionChunkCache.set(key, hit);
  return hit;
}

export function invalidateSessionPdfCache(url) {
  if (!url) return;
  sessionInitialCache.delete(url);
  invalidateCachedCdnMeta(url);
  const prefix = `${url}::`;
  for (const key of sessionChunkCache.keys()) {
    if (key.startsWith(prefix)) {
      sessionChunkCache.delete(key);
    }
  }
}

function bufferSliceContainsAscii(u8, needle) {
  const limit = Math.min(u8.byteLength, 4096);
  let header = '';
  for (let i = 0; i < limit; i++) {
    header += String.fromCharCode(u8[i]);
  }
  return header.includes(needle);
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

/**
 * Resolve redirects once, pre-fetch Head + 2-chunk EOF Tail in parallel, and stream byte ranges on demand.
 * Accepts either pdfjsLib or a Promise resolving to pdfjsLib so network bootstrap runs in parallel with module load!
 */
export async function createLargePdfRangeTransport(
  pdfjsLibOrPromise,
  url,
  fileSize,
  signal,
  onStreamState,
  onRangeError
) {
  const emitBootProgress = (loaded, total) => {
    const safeTotal = Number(fileSize) || total || 0;
    onStreamState?.({
      loadedBytes: loaded,
      totalBytes: safeTotal,
      bootstrapRatio: total > 0 ? Math.min(1, loaded / total) : 0,
      docChunksResolved: 0,
      activeRequests: 1,
      burstDone: 0,
      burstTotal: 0
    });
  };

  const bootTask = (async () => {
    const cachedBoot = sessionInitialCache.get(url);
    if (
      cachedBoot &&
      Date.now() - cachedBoot.ts <= SESSION_INITIAL_TTL_MS &&
      isLiveUint8Array(cachedBoot.initialData)
    ) {
      return {
        ...cachedBoot,
        initialData: cloneUint8Array(cachedBoot.initialData),
        tailChunksPromise: null
      };
    }
    sessionInitialCache.delete(url);
    const prewarmedPromise = consumePrewarmedRangeBootstrap(url, emitBootProgress);
    if (prewarmedPromise) {
      const pre = await prewarmedPromise;
      if (pre && isLiveUint8Array(pre.initialData) && pre.totalLength > pre.chunkSize * 2) {
        return pre;
      }
    }
    return fetchRangeBootstrapBundle(url, fileSize, signal, emitBootProgress);
  })();

  const [pdfjsLib, bootBundle] = await Promise.all([
    Promise.resolve(pdfjsLibOrPromise),
    bootTask
  ]);

  if (!bootBundle || !isLiveUint8Array(bootBundle.initialData)) {
    return null;
  }

  const {
    resolvedCdnUrl,
    totalLength,
    chunkSize: baseChunkSize,
    initialData: rawInitialData,
    tailChunksPromise
  } = bootBundle;

  const bootBytes = cloneUint8Array(rawInitialData);
  if (!bootBytes) return null;

  const isLinearized = bufferSliceContainsAscii(bootBytes, '/Linearized');
  if (!isLinearized && totalLength <= UNLINEARIZED_SINGLE_STREAM_MAX) {
    return null;
  }

  const chunkSize = isLinearized ? baseChunkSize : Math.max(baseChunkSize, 524288);
  const cachePrefix = `${url}::${chunkSize}::`;
  if (sessionInitialCache.size > 12 && !sessionInitialCache.has(url)) {
    const oldest = sessionInitialCache.keys().next().value;
    if (oldest) sessionInitialCache.delete(oldest);
  }
  sessionInitialCache.set(url, {
    resolvedCdnUrl,
    totalLength,
    chunkSize: baseChunkSize,
    initialData: bootBytes.slice(),
    ts: Date.now()
  });

  let loadedBytes = bootBytes.byteLength;
  const countedChunks = new Set();

  class DirectRangeTransport extends pdfjsLib.PDFDataRangeTransport {
    constructor() {
      // Pass an isolated slice to PDF.js so transferring its ArrayBuffer to the worker never detaches bootBytes
      super(totalLength, bootBytes.slice());
      this.cdnUrl = resolvedCdnUrl;
      this.originalUrl = url;
      this.chunkSize = chunkSize;
      this.activeCtrls = new Set();
      this.requiredQueue = []; // LIFO stack for active viewport / requested ranges
      this.speculativeQueue = []; // LIFO stack for background read-ahead
      this.inFlightCount = 0;
      this.inflightChunks = new Map(); // chunkIdx -> Promise<Uint8Array | null>
      this.aborted = false;
      this.docReady = false;
      this.docChunksResolved = 0;
      this.burstDone = 0;
      this.burstTotal = 0;
      this.refreshPromise = null;

      // Seed sessionChunkCache with isolated chunk copies of bootBytes
      for (let off = 0; off + chunkSize <= bootBytes.byteLength; off += chunkSize) {
        const idx = off / chunkSize;
        countedChunks.add(idx);
        putSessionChunk(cachePrefix, idx, bootBytes.slice(off, off + chunkSize));
      }

      this.emitState(1);

      // Wire parallel 2-chunk EOF tail into cache/inflight map so Wave 1 resolves in 0 extra RTTs
      if (tailChunksPromise && chunkSize === baseChunkSize) {
        const lastIdx = Math.floor((totalLength - 1) / chunkSize);
        const firstTailIdx = Math.max(Math.ceil(bootBytes.byteLength / chunkSize), lastIdx - 1);
        const tailShared = tailChunksPromise.then((slices) => {
          if (!Array.isArray(slices) || this.aborted) return null;
          for (const s of slices) {
            if (isLiveUint8Array(s.data)) {
              this.putCachedChunk(s.chunkIndex, s.data.slice());
            }
          }
          return slices;
        });
        tailShared.catch(() => {});

        for (let idx = firstTailIdx; idx <= lastIdx; idx++) {
          if (idx * chunkSize >= bootBytes.byteLength && !this.hasCachedChunk(idx)) {
            const perChunkPromise = tailShared.then((slices) => {
              this.inflightChunks.delete(idx);
              const hit = Array.isArray(slices) ? slices.find((s) => s.chunkIndex === idx) : null;
              return hit && isLiveUint8Array(hit.data) ? hit.data : null;
            });
            perChunkPromise.catch(() => {});
            this.inflightChunks.set(idx, perChunkPromise);
          }
        }
      }
    }

    emitState(bootstrapRatio = 1) {
      if (this.aborted) return;
      onStreamState?.({
        loadedBytes,
        totalBytes: totalLength,
        bootstrapRatio,
        docChunksResolved: this.docChunksResolved,
        activeRequests: this.inFlightCount + this.requiredQueue.length + this.speculativeQueue.length,
        burstDone: this.burstDone,
        burstTotal: this.burstTotal
      });
    }

    setDocReady() {
      this.docReady = true;
      this.burstDone = 0;
      this.burstTotal = 0;
      this.emitState(1);
    }

    hasCachedChunk(chunkIdx) {
      return getSessionChunk(cachePrefix, chunkIdx) !== null;
    }

    putCachedChunk(chunkIdx, u8) {
      if (!isLiveUint8Array(u8)) return;
      if (!countedChunks.has(chunkIdx)) {
        countedChunks.add(chunkIdx);
        loadedBytes = Math.min(totalLength, loadedBytes + u8.byteLength);
      }
      putSessionChunk(cachePrefix, chunkIdx, u8);
      if (!this.docReady) {
        this.docChunksResolved += 1;
      } else if (this.burstTotal > 0) {
        this.burstDone = Math.min(this.burstTotal, this.burstDone + 1);
      }
      this.emitState(1);
    }

    getCachedChunk(chunkIdx) {
      return getSessionChunk(cachePrefix, chunkIdx);
    }

    refreshCdnUrl(abortSignal) {
      if (!this.refreshPromise) {
        invalidateCachedCdnMeta(this.originalUrl);
        this.refreshPromise = fetch(this.originalUrl, {
          headers: { Range: 'bytes=0-0' },
          signal: abortSignal
        })
          .then(async (res) => {
            if (res.url) {
              this.cdnUrl = res.url;
              setCachedCdnMeta(this.originalUrl, res.url, totalLength);
            }
            try { await res.body?.cancel?.(); } catch { /* ignore */ }
          })
          .finally(() => {
            this.refreshPromise = null;
          });
      }
      return this.refreshPromise;
    }

    pumpQueue() {
      while (
        !this.aborted &&
        this.inFlightCount < MAX_CONCURRENT_RANGE_FETCHES &&
        (this.requiredQueue.length > 0 || this.speculativeQueue.length > 0)
      ) {
        const job =
          this.requiredQueue.length > 0
            ? this.requiredQueue.pop()
            : this.speculativeQueue.pop();
        this.inFlightCount++;
        job().finally(() => {
          this.inFlightCount = Math.max(0, this.inFlightCount - 1);
          if (this.inFlightCount === 0 && this.requiredQueue.length === 0 && this.speculativeQueue.length === 0) {
            this.burstDone = 0;
            this.burstTotal = 0;
          }
          this.emitState(1);
          this.pumpQueue();
        });
      }
    }

    ensureChunksScheduled(startChunk, endChunk) {
      let c = startChunk;
      while (c <= endChunk) {
        if (this.hasCachedChunk(c) || this.inflightChunks.has(c)) {
          c++;
          continue;
        }
        // Coalesce up to 2 contiguous chunks; only attach speculative +1 read-ahead after initial docReady
        let batchEnd = c;
        if (c + 1 <= endChunk && !this.hasCachedChunk(c + 1) && !this.inflightChunks.has(c + 1)) {
          batchEnd = c + 1;
        } else if (
          this.docReady &&
          c === endChunk &&
          (c + 1) * chunkSize < totalLength &&
          !this.hasCachedChunk(c + 1) &&
          !this.inflightChunks.has(c + 1)
        ) {
          batchEnd = c + 1;
        }

        const batchFirst = c;
        const batchLast = batchEnd;
        const resolvers = new Map();
        for (let k = batchFirst; k <= batchLast; k++) {
          let resolveFn;
          let rejectFn;
          const p = new Promise((res, rej) => {
            resolveFn = res;
            rejectFn = rej;
          });
          p.catch(() => {});
          this.inflightChunks.set(k, p);
          resolvers.set(k, { resolveFn, rejectFn });
        }

        if (this.docReady) {
          this.burstTotal += batchLast - batchFirst + 1;
        }
        this.requiredQueue.push(() => this.fetchChunkBatch(batchFirst, batchLast, resolvers));
        c = batchLast + 1;
      }
      this.emitState(1);
      this.pumpQueue();
    }

    async fetchChunkBatch(batchFirst, batchLast, resolvers) {
      if (this.aborted) {
        for (const [k, rv] of resolvers.entries()) {
          this.inflightChunks.delete(k);
          rv.rejectFn(new DOMException('Aborted', 'AbortError'));
        }
        return;
      }

      const byteBegin = batchFirst * chunkSize;
      const byteEnd = Math.min(totalLength, (batchLast + 1) * chunkSize);
      const expectedTotal = byteEnd - byteBegin;
      let lastError = null;

      for (let attempt = 0; attempt <= CHUNK_RETRY_BACKOFFS_MS.length; attempt++) {
        if (this.aborted) {
          for (const [k, rv] of resolvers.entries()) {
            this.inflightChunks.delete(k);
            rv.rejectFn(new DOMException('Aborted', 'AbortError'));
          }
          return;
        }

        const attemptCtrl = new AbortController();
        this.activeCtrls.add(attemptCtrl);
        let timedOut = false;
        const timeoutId = setTimeout(() => {
          timedOut = true;
          attemptCtrl.abort(new Error(`Range chunk timeout (${byteBegin}-${byteEnd - 1})`));
        }, CHUNK_FETCH_TIMEOUT_MS);

        try {
          let res = await fetch(this.cdnUrl, {
            headers: { Range: `bytes=${byteBegin}-${byteEnd - 1}` },
            signal: attemptCtrl.signal
          });
          if ((res.status === 401 || res.status === 403) && this.cdnUrl !== this.originalUrl) {
            try { await res.body?.cancel?.(); } catch { /* ignore */ }
            await this.refreshCdnUrl(attemptCtrl.signal);
            res = await fetch(this.cdnUrl, {
              headers: { Range: `bytes=${byteBegin}-${byteEnd - 1}` },
              signal: attemptCtrl.signal
            });
          }
          if (!res.ok) {
            try { await res.body?.cancel?.(); } catch { /* ignore */ }
            throw new Error(`HTTP ${res.status}`);
          }

          if (res.status === 200) {
            const fullBuf = new Uint8Array(await res.arrayBuffer());
            if (this.aborted) return;
            for (let k = batchFirst; k <= batchLast; k++) {
              const s = k * chunkSize;
              const e = Math.min(totalLength, (k + 1) * chunkSize);
              if (s >= fullBuf.byteLength || fullBuf.byteLength < e) {
                throw new Error('HTTP 200 payload shorter than requested offset');
              }
              const slice = fullBuf.slice(s, e);
              this.putCachedChunk(k, slice);
              const rv = resolvers.get(k);
              if (rv) {
                resolvers.delete(k);
                this.inflightChunks.delete(k);
                rv.resolveFn(slice);
              }
            }
            return;
          }

          if (res.status !== 206) {
            try { await res.body?.cancel?.(); } catch { /* ignore */ }
            throw new Error(`Unexpected HTTP ${res.status} on range request`);
          }

          if (res.url) {
            this.cdnUrl = res.url;
            setCachedCdnMeta(this.originalUrl, res.url, totalLength);
          }

          if (res.body && typeof res.body.getReader === 'function' && batchLast > batchFirst) {
            const reader = res.body.getReader();
            const buffer = new Uint8Array(expectedTotal);
            let filled = 0;
            let nextChunk = batchFirst;

            const flushReadyChunks = () => {
              while (nextChunk <= batchLast) {
                const relStart = (nextChunk - batchFirst) * chunkSize;
                const relEnd = Math.min(expectedTotal, relStart + chunkSize);
                if (filled >= relEnd) {
                  const slice = buffer.slice(relStart, relEnd);
                  this.putCachedChunk(nextChunk, slice);
                  const rv = resolvers.get(nextChunk);
                  if (rv) {
                    resolvers.delete(nextChunk);
                    this.inflightChunks.delete(nextChunk);
                    rv.resolveFn(slice);
                  }
                  nextChunk++;
                } else {
                  break;
                }
              }
            };

            while (!this.aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value && value.byteLength > 0) {
                const copyLen = Math.min(value.byteLength, expectedTotal - filled);
                if (copyLen > 0) {
                  buffer.set(value.subarray(0, copyLen), filled);
                  filled += copyLen;
                  flushReadyChunks();
                }
              }
            }
            if (this.aborted) return;
            flushReadyChunks();
            if (filled < expectedTotal || nextChunk <= batchLast) {
              throw new Error(`Truncated HTTP 206 range response (${filled}/${expectedTotal} bytes)`);
            }
          } else {
            const ab = await res.arrayBuffer();
            if (this.aborted) return;
            const raw = new Uint8Array(ab);
            if (raw.byteLength < expectedTotal) {
              throw new Error(`Truncated HTTP 206 range response (${raw.byteLength}/${expectedTotal} bytes)`);
            }
            for (let k = batchFirst; k <= batchLast; k++) {
              const relStart = (k - batchFirst) * chunkSize;
              const relEnd = Math.min(expectedTotal, relStart + chunkSize);
              const slice = raw.slice(relStart, relEnd);
              this.putCachedChunk(k, slice);
              const rv = resolvers.get(k);
              if (rv) {
                resolvers.delete(k);
                this.inflightChunks.delete(k);
                rv.resolveFn(slice);
              }
            }
          }
          return;
        } catch (err) {
          if (this.aborted) {
            for (const [k, rv] of resolvers.entries()) {
              this.inflightChunks.delete(k);
              rv.rejectFn(new DOMException('Aborted', 'AbortError'));
            }
            return;
          }
          if (err?.name === 'AbortError' && !timedOut) {
            for (const [k, rv] of resolvers.entries()) {
              this.inflightChunks.delete(k);
              rv.rejectFn(err);
            }
            return;
          }
          lastError = timedOut ? new Error(`Range request timed out (${byteBegin}-${byteEnd - 1})`) : err;
          if (this.cdnUrl !== this.originalUrl) {
            invalidateCachedCdnMeta(this.originalUrl);
            this.cdnUrl = this.originalUrl;
          }
          if (attempt < CHUNK_RETRY_BACKOFFS_MS.length) {
            try {
              await sleepWithAbort(CHUNK_RETRY_BACKOFFS_MS[attempt], signal);
            } catch {
              for (const [k, rv] of resolvers.entries()) {
                this.inflightChunks.delete(k);
                rv.rejectFn(new DOMException('Aborted', 'AbortError'));
              }
              return;
            }
          }
        } finally {
          clearTimeout(timeoutId);
          this.activeCtrls.delete(attemptCtrl);
        }
      }

      for (const [k, rv] of resolvers.entries()) {
        this.inflightChunks.delete(k);
        rv.rejectFn(lastError || new Error('Range request failed'));
      }
      console.warn(`[WebPDF] Range request failed (${byteBegin}-${byteEnd}):`, lastError);
      if (!this.aborted) {
        onRangeError?.(lastError || new Error('Range request failed'), this.docReady);
      }
    }

    requestDataRange(begin, end) {
      if (this.aborted) return;

      // Always defer synchronous cache hits by one microtask so PDF.js finishes registering its RangeReader first!
      if (end <= bootBytes.byteLength && begin >= 0) {
        const slice = bootBytes.slice(begin, end);
        queueMicrotask(() => {
          if (!this.aborted) this.onDataRange(begin, slice);
        });
        return;
      }

      const safeEnd = Math.min(totalLength, end);
      if (safeEnd <= begin) return;

      const startChunk = Math.floor(begin / chunkSize);
      const endChunk = Math.floor((safeEnd - 1) / chunkSize);

      // Fast-path: check if every needed chunk is already in session LRU RAM cache
      let allCached = true;
      for (let c = startChunk; c <= endChunk; c++) {
        if (!this.hasCachedChunk(c)) {
          allCached = false;
          break;
        }
      }

      if (allCached) {
        const slice = this.assembleRangeFromChunks(begin, safeEnd, startChunk, endChunk);
        if (slice) {
          queueMicrotask(() => {
            if (!this.aborted) this.onDataRange(begin, slice);
          });
          return;
        }
      }

      this.ensureChunksScheduled(startChunk, endChunk);

      Promise.resolve().then(async () => {
        try {
          const parts = [];
          for (let c = startChunk; c <= endChunk; c++) {
            let chunkBuf = this.getCachedChunk(c);
            if (!chunkBuf) {
              const p = this.inflightChunks.get(c);
              if (p) chunkBuf = await p;
            }
            if (!isLiveUint8Array(chunkBuf)) {
              // Tail prefetch or stale entry missed; schedule clean chunk fetch
              this.ensureChunksScheduled(c, c);
              const retryP = this.inflightChunks.get(c);
              chunkBuf = retryP ? await retryP : this.getCachedChunk(c);
            }
            if (!isLiveUint8Array(chunkBuf) || this.aborted) return;
            parts.push(chunkBuf);
          }
          if (this.aborted) return;

          const slice = this.assembleRangeFromParts(begin, safeEnd, startChunk, parts);
          if (!this.aborted && slice) {
            this.onDataRange(begin, slice);
          }
        } catch {
          // Handled in fetchChunkBatch error handler
        }
      });
    }

    assembleRangeFromParts(begin, safeEnd, startChunk, parts) {
      const targetLen = safeEnd - begin;
      if (targetLen <= 0 || parts.length === 0) return null;
      const alignedBegin = startChunk * chunkSize;
      if (parts.length === 1) {
        const buf = parts[0];
        if (!isLiveUint8Array(buf)) return null;
        const s = Math.max(0, begin - alignedBegin);
        const e = Math.min(buf.byteLength, s + targetLen);
        // Always return an owned slice so PDF.js transferring buffer to worker never detaches cached chunk!
        return buf.slice(s, e);
      }

      const out = new Uint8Array(targetLen);
      let writePos = 0;
      for (let idx = 0; idx < parts.length; idx++) {
        const buf = parts[idx];
        if (!isLiveUint8Array(buf)) return null;
        const chunkGlobalStart = (startChunk + idx) * chunkSize;
        const s = Math.max(0, begin - chunkGlobalStart);
        const e = Math.min(buf.byteLength, safeEnd - chunkGlobalStart);
        if (e > s) {
          out.set(buf.subarray(s, e), writePos);
          writePos += e - s;
        }
      }
      return writePos === targetLen ? out : out.slice(0, writePos);
    }

    assembleRangeFromChunks(begin, safeEnd, startChunk, endChunk) {
      const parts = [];
      for (let c = startChunk; c <= endChunk; c++) {
        const buf = this.getCachedChunk(c);
        if (!isLiveUint8Array(buf)) return null;
        parts.push(buf);
      }
      return this.assembleRangeFromParts(begin, safeEnd, startChunk, parts);
    }

    abort() {
      this.aborted = true;
      this.requiredQueue.length = 0;
      this.speculativeQueue.length = 0;
      for (const ctrl of this.activeCtrls) {
        try { ctrl.abort(); } catch { /* ignore */ }
      }
      this.activeCtrls.clear();
      this.inflightChunks.clear();
    }
  }

  return { transport: new DirectRangeTransport(), totalLength };
}
