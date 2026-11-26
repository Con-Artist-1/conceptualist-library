// High-speed HTTP byte-range streaming transport for PDFs (>= 2.5 MB) in WebPDF viewer:
// - Parallel Head (512 KB–1 MB) + EOF Tail chunk bootstrap eliminates Wave 1 & Page-1 head misses.
// - LIFO concurrency-4 range scheduler prevents Hugging Face XetHub queueing spikes & prioritizes active jumps.
// - Streaming 2-chunk read-ahead via ReadableStream.getReader() delivers the requested chunk immediately
//   while warming the adjacent chunk on the same HTTP/2 stream with zero extra RTT.
// - Bounded LRU chunk cache makes scrolling back to visited pages instant (0 ms, 0 network requests).

import {
  LARGE_PDF_STREAM_THRESHOLD,
  shouldUseRangeStreaming,
  getStreamChunkSize,
  setCachedCdnMeta,
  invalidateCachedCdnMeta,
  consumePrewarmedRangeBootstrap,
  fetchRangeBootstrapBundle
} from './pdfPrewarm.js';

export { LARGE_PDF_STREAM_THRESHOLD, shouldUseRangeStreaming, getStreamChunkSize };
export const STREAM_CHUNK_SIZE = 262144;

const UNLINEARIZED_SINGLE_STREAM_MAX = 15 * 1024 * 1024;
const MAX_CONCURRENT_RANGE_FETCHES = 4; // Avoids xet-bridge-us 6-stream TTFB throttling cliff
const MAX_SESSION_CACHED_CHUNKS = 128; // Bounded session-wide LRU (~32-64 MB) so reopens & back-jumps hit RAM in 0ms

// Session-level LRU cache keyed by `${originalUrl}::${chunkSize}::${chunkIdx}`
const sessionChunkCache = new Map();
const sessionInitialCache = new Map(); // url -> { resolvedCdnUrl, totalLength, chunkSize, initialData, ts }
const SESSION_INITIAL_TTL_MS = 8 * 60 * 1000;

function putSessionChunk(cachePrefix, chunkIdx, u8) {
  const key = `${cachePrefix}${chunkIdx}`;
  if (sessionChunkCache.has(key)) sessionChunkCache.delete(key);
  sessionChunkCache.set(key, u8);
  while (sessionChunkCache.size > MAX_SESSION_CACHED_CHUNKS) {
    const oldest = sessionChunkCache.keys().next().value;
    if (oldest === undefined) break;
    sessionChunkCache.delete(oldest);
  }
}

function getSessionChunk(cachePrefix, chunkIdx) {
  const key = `${cachePrefix}${chunkIdx}`;
  const hit = sessionChunkCache.get(key);
  if (!hit) return null;
  sessionChunkCache.delete(key);
  sessionChunkCache.set(key, hit);
  return hit;
}

function bufferSliceContainsAscii(u8, needle) {
  const limit = Math.min(u8.byteLength, 4096);
  let header = '';
  for (let i = 0; i < limit; i++) {
    header += String.fromCharCode(u8[i]);
  }
  return header.includes(needle);
}

/**
 * Resolve redirects once, pre-fetch Head + EOF Tail in parallel, and stream byte ranges on demand.
 * Accepts either pdfjsLib or a Promise resolving to pdfjsLib so network bootstrap runs in parallel with module load!
 */
export async function createLargePdfRangeTransport(
  pdfjsLibOrPromise,
  url,
  fileSize,
  signal,
  onBytesProgress,
  onInitialRangeError
) {
  const bootTask = (async () => {
    const cachedBoot = sessionInitialCache.get(url);
    if (cachedBoot && Date.now() - cachedBoot.ts <= SESSION_INITIAL_TTL_MS) {
      return { ...cachedBoot, tailChunksPromise: null };
    }
    const prewarmedPromise = consumePrewarmedRangeBootstrap(url);
    if (prewarmedPromise) {
      const pre = await prewarmedPromise;
      if (pre && pre.initialData && pre.totalLength > pre.chunkSize * 2) {
        return pre;
      }
    }
    return fetchRangeBootstrapBundle(url, fileSize, signal);
  })();

  const [pdfjsLib, bootBundle] = await Promise.all([
    Promise.resolve(pdfjsLibOrPromise),
    bootTask
  ]);

  if (!bootBundle || !bootBundle.initialData) {
    return null;
  }

  const {
    resolvedCdnUrl,
    totalLength,
    chunkSize: baseChunkSize,
    initialData,
    tailChunksPromise
  } = bootBundle;

  const isLinearized = bufferSliceContainsAscii(initialData, '/Linearized');
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
    initialData,
    ts: Date.now()
  });

  let loadedBytes = initialData.byteLength;
  const countedChunks = new Set();
  onBytesProgress?.(loadedBytes, totalLength);

  class DirectRangeTransport extends pdfjsLib.PDFDataRangeTransport {
    constructor() {
      super(totalLength, initialData);
      this.cdnUrl = resolvedCdnUrl;
      this.originalUrl = url;
      this.chunkSize = chunkSize;
      this.activeCtrls = new Set();
      this.pendingQueue = []; // LIFO stack so newest visible page/jump always executes next
      this.inFlightCount = 0;
      this.inflightChunks = new Map(); // chunkIdx -> Promise<Uint8Array>
      this.aborted = false;
      this.docReady = false;
      this.refreshPromise = null;

      // Seed sessionChunkCache with initialData slices
      for (let off = 0; off + chunkSize <= initialData.byteLength; off += chunkSize) {
        const idx = off / chunkSize;
        countedChunks.add(idx);
        putSessionChunk(cachePrefix, idx, initialData.subarray(off, off + chunkSize));
      }

      // Wire parallel EOF tail chunk into cache/inflight map so Wave 1 resolves in 0 extra RTTs!
      if (tailChunksPromise && chunkSize === baseChunkSize) {
        const lastIdx = Math.floor((totalLength - 1) / chunkSize);
        if (lastIdx * chunkSize >= initialData.byteLength && !getSessionChunk(cachePrefix, lastIdx)) {
          const perChunkPromise = tailChunksPromise.then((slices) => {
            this.inflightChunks.delete(lastIdx);
            const hit = Array.isArray(slices) ? slices.find((s) => s.chunkIndex === lastIdx) : null;
            if (hit?.data && !this.aborted) {
              this.putCachedChunk(lastIdx, hit.data);
              return hit.data;
            }
            return null;
          });
          this.inflightChunks.set(lastIdx, perChunkPromise);
        }
      }
    }

    hasCachedChunk(chunkIdx) {
      return sessionChunkCache.has(`${cachePrefix}${chunkIdx}`);
    }

    putCachedChunk(chunkIdx, u8) {
      if (!countedChunks.has(chunkIdx)) {
        countedChunks.add(chunkIdx);
        loadedBytes = Math.min(totalLength, loadedBytes + u8.byteLength);
        onBytesProgress?.(loadedBytes, totalLength);
      }
      putSessionChunk(cachePrefix, chunkIdx, u8);
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
      while (!this.aborted && this.inFlightCount < MAX_CONCURRENT_RANGE_FETCHES && this.pendingQueue.length > 0) {
        // LIFO pop prioritizes the user's current viewport / page jump ahead of older offscreen requests
        const job = this.pendingQueue.pop();
        this.inFlightCount++;
        job().finally(() => {
          this.inFlightCount = Math.max(0, this.inFlightCount - 1);
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
        // Coalesce up to 2 contiguous missing chunks (or +1 forward read-ahead chunk) streamed via ReadableStream.getReader()
        // so chunk 1 resolves IMMEDIATELY while chunk 2 warms on the same HTTP/2 stream with zero extra RTT!
        let batchEnd = c;
        if (c + 1 <= endChunk && !this.hasCachedChunk(c + 1) && !this.inflightChunks.has(c + 1)) {
          batchEnd = c + 1;
        } else if (
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
          // Attach noop catch so speculative read-ahead chunk never triggers unhandledRejection on abort
          p.catch(() => {});
          this.inflightChunks.set(k, p);
          resolvers.set(k, { resolveFn, rejectFn });
        }

        this.pendingQueue.push(() => this.fetchChunkBatch(batchFirst, batchLast, resolvers));
        c = batchLast + 1;
      }
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
      const ctrl = new AbortController();
      this.activeCtrls.add(ctrl);

      const attemptFetch = async (attempt = 0) => {
        try {
          const res = await fetch(this.cdnUrl, {
            headers: { Range: `bytes=${byteBegin}-${byteEnd - 1}` },
            signal: ctrl.signal
          });
          if ((res.status === 401 || res.status === 403) && attempt === 0 && this.cdnUrl !== this.originalUrl) {
            await this.refreshCdnUrl(ctrl.signal);
            return attemptFetch(1);
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          if (res.status === 200) {
            const fullBuf = new Uint8Array(await res.arrayBuffer());
            if (this.aborted) return;
            for (let k = batchFirst; k <= batchLast; k++) {
              const s = k * chunkSize;
              const e = Math.min(totalLength, (k + 1) * chunkSize);
              if (s >= fullBuf.byteLength) throw new Error('HTTP 200 payload shorter than requested offset');
              const slice = fullBuf.slice(s, Math.min(e, fullBuf.byteLength));
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
            throw new Error(`Unexpected HTTP ${res.status} on range request`);
          }

          if (res.body && typeof res.body.getReader === 'function' && batchLast > batchFirst) {
            const reader = res.body.getReader();
            const buffer = new Uint8Array(expectedTotal);
            let filled = 0;
            let nextChunk = batchFirst;

            const flushReadyChunks = (streamFinished) => {
              while (nextChunk <= batchLast) {
                const relStart = (nextChunk - batchFirst) * chunkSize;
                const relEnd = Math.min(expectedTotal, relStart + chunkSize);
                if (filled >= relEnd || (streamFinished && filled > relStart)) {
                  const slice = buffer.slice(relStart, Math.min(filled, relEnd));
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
                  flushReadyChunks(false);
                }
              }
            }
            if (!this.aborted) {
              flushReadyChunks(true);
            }
          } else {
            const ab = await res.arrayBuffer();
            if (this.aborted) return;
            const raw = new Uint8Array(ab);
            for (let k = batchFirst; k <= batchLast; k++) {
              const relStart = (k - batchFirst) * chunkSize;
              const relEnd = Math.min(raw.byteLength, relStart + chunkSize);
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
        } catch (err) {
          if (this.aborted || err?.name === 'AbortError') {
            for (const [k, rv] of resolvers.entries()) {
              this.inflightChunks.delete(k);
              rv.rejectFn(err);
            }
            return;
          }
          if (attempt === 0 && this.cdnUrl !== this.originalUrl) {
            this.cdnUrl = this.originalUrl;
            return attemptFetch(1);
          }
          for (const [k, rv] of resolvers.entries()) {
            this.inflightChunks.delete(k);
            rv.rejectFn(err);
          }
          console.warn(`[WebPDF] Range request failed (${byteBegin}-${byteEnd}):`, err);
          if (!this.docReady && !this.aborted) {
            onInitialRangeError?.(err);
          }
        } finally {
          this.activeCtrls.delete(ctrl);
        }
      };

      await attemptFetch(0);
    }

    requestDataRange(begin, end) {
      if (this.aborted) return;

      // Always defer synchronous cache hits by one microtask so PDF.js finishes registering its RangeReader first!
      if (end <= initialData.byteLength && begin >= 0) {
        const slice = initialData.slice(begin, end);
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
        queueMicrotask(() => {
          if (!this.aborted && slice) this.onDataRange(begin, slice);
        });
        return;
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
            if (!chunkBuf) {
              // Tail prefetch may have returned null if status != 206; schedule normal fetch
              this.ensureChunksScheduled(c, c);
              const retryP = this.inflightChunks.get(c);
              chunkBuf = retryP ? await retryP : this.getCachedChunk(c);
            }
            if (!chunkBuf || this.aborted) return;
            parts.push(chunkBuf);
          }
          if (this.aborted) return;
          const alignedBegin = startChunk * chunkSize;
          let combined;
          if (parts.length === 1) {
            combined = parts[0];
          } else {
            const sumLen = parts.reduce((acc, p) => acc + p.byteLength, 0);
            combined = new Uint8Array(sumLen);
            let offset = 0;
            for (const p of parts) {
              combined.set(p, offset);
              offset += p.byteLength;
            }
          }
          const subStart = Math.max(0, begin - alignedBegin);
          const subEnd = Math.min(combined.byteLength, subStart + (safeEnd - begin));
          this.onDataRange(begin, combined.subarray(subStart, subEnd));
        } catch {
          // Handled in fetchChunkBatch error handler
        }
      });
    }

    assembleRangeFromChunks(begin, safeEnd, startChunk, endChunk) {
      const alignedBegin = startChunk * chunkSize;
      if (startChunk === endChunk) {
        const buf = this.getCachedChunk(startChunk);
        if (!buf) return null;
        const s = Math.max(0, begin - alignedBegin);
        const e = Math.min(buf.byteLength, s + (safeEnd - begin));
        return buf.slice(s, e);
      }
      const parts = [];
      let sumLen = 0;
      for (let c = startChunk; c <= endChunk; c++) {
        const buf = this.getCachedChunk(c);
        if (!buf) return null;
        parts.push(buf);
        sumLen += buf.byteLength;
      }
      const combined = new Uint8Array(sumLen);
      let offset = 0;
      for (const p of parts) {
        combined.set(p, offset);
        offset += p.byteLength;
      }
      const s = Math.max(0, begin - alignedBegin);
      const e = Math.min(combined.byteLength, s + (safeEnd - begin));
      return combined.subarray(s, e);
    }

    abort() {
      this.aborted = true;
      this.pendingQueue.length = 0;
      for (const ctrl of this.activeCtrls) {
        try { ctrl.abort(); } catch { /* ignore */ }
      }
      this.activeCtrls.clear();
      this.inflightChunks.clear();
    }
  }

  return { transport: new DirectRangeTransport(), totalLength };
}
