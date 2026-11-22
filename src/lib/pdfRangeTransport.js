// HTTP byte-range streaming transport for large PDFs (>= 5 MB) in WebPDF viewer.
import { consumePrewarmedRangeBootstrap } from './pdfPrewarm.js';

export const LARGE_PDF_STREAM_THRESHOLD = 5 * 1024 * 1024; // Inspect byte-range strategy for >= 5 MB PDFs
export const UNLINEARIZED_SINGLE_STREAM_MAX = 15 * 1024 * 1024; // Fetch non-linearized <= 15 MB PDFs progressively without 206 storms
export const STREAM_BOOTSTRAP_BYTES = 131072; // 128 KB header probe aligned to chunk boundary (avoids duplicate 0-128 KB fetch)
export const STREAM_CHUNK_SIZE = 131072; // 128 KB HTTP/2 range chunks for linearized PDFs
export const UNLINEARIZED_BOOK_CHUNK_SIZE = 262144; // 256 KB chunks for huge un-linearized textbooks
export const MAX_CONCURRENT_RANGE_FETCHES = 6;

function bufferSliceContainsAscii(u8, needle) {
  const limit = Math.min(u8.byteLength, 2048);
  let header = '';
  for (let i = 0; i < limit; i++) {
    header += String.fromCharCode(u8[i]);
  }
  return header.includes(needle);
}

/**
 * Resolve redirects once and stream byte ranges on demand for large PDFs (>= 5 MB).
 */
export async function createLargePdfRangeTransport(pdfjsLib, url, signal, onBytesProgress, onInitialRangeError) {
  let resolvedCdnUrl = url;
  let totalLength = 0;
  let initialData = null;

  const prewarmedPromise = consumePrewarmedRangeBootstrap(url);
  if (prewarmedPromise) {
    try {
      const pre = await prewarmedPromise;
      if (pre && pre.initialData && pre.totalLength > STREAM_CHUNK_SIZE * 2) {
        resolvedCdnUrl = pre.resolvedCdnUrl || url;
        totalLength = pre.totalLength;
        initialData = pre.initialData;
      }
    } catch {
      // Fall back to fresh bootstrap fetch below
    }
  }

  if (!initialData) {
    const bootRes = await fetch(url, {
      headers: { Range: `bytes=0-${STREAM_BOOTSTRAP_BYTES - 1}` },
      signal
    });
    if (!bootRes.ok && bootRes.status !== 206) {
      throw new Error(`HTTP ${bootRes.status}`);
    }
    if (bootRes.status !== 206) {
      try { await bootRes.body?.cancel?.(); } catch { /* ignore */ }
      return null;
    }

    const cr = bootRes.headers.get('content-range') || '';
    const crMatch = /\/(\d+)$/.exec(cr);
    totalLength = crMatch ? parseInt(crMatch[1], 10) : 0;
    if (!totalLength || totalLength <= STREAM_CHUNK_SIZE * 2) {
      try { await bootRes.body?.cancel?.(); } catch { /* ignore */ }
      return null;
    }

    resolvedCdnUrl = bootRes.url || url;
    initialData = new Uint8Array(await bootRes.arrayBuffer());
    if (initialData.byteLength === 0) {
      return null;
    }
  }

  const isLinearized = bufferSliceContainsAscii(initialData, '/Linearized');
  if (!isLinearized && totalLength <= UNLINEARIZED_SINGLE_STREAM_MAX) {
    // Non-linearized 5–15 MB papers load much faster in one progressive stream than 40+ tail-seeking 206 round-trips
    return null;
  }

  const chunkSize = isLinearized ? STREAM_CHUNK_SIZE : UNLINEARIZED_BOOK_CHUNK_SIZE;
  onBytesProgress?.(initialData.byteLength, totalLength);

  class DirectRangeTransport extends pdfjsLib.PDFDataRangeTransport {
    constructor() {
      super(totalLength, initialData);
      this.cdnUrl = resolvedCdnUrl;
      this.originalUrl = url;
      this.chunkSize = chunkSize;
      this.activeCtrls = new Set();
      this.pendingQueue = [];
      this.inFlightCount = 0;
      this.seenRanges = new Set();
      this.loadedBytes = initialData.byteLength;
      this.aborted = false;
      this.docReady = false;
      this.refreshPromise = null;
    }

    refreshCdnUrl(abortSignal) {
      if (!this.refreshPromise) {
        this.refreshPromise = fetch(this.originalUrl, {
          headers: { Range: 'bytes=0-0' },
          signal: abortSignal
        })
          .then(async (res) => {
            if (res.url) this.cdnUrl = res.url;
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
        const job = this.pendingQueue.shift();
        this.inFlightCount++;
        job().finally(() => {
          this.inFlightCount = Math.max(0, this.inFlightCount - 1);
          this.pumpQueue();
        });
      }
    }

    requestDataRange(begin, end) {
      if (this.aborted) return;
      if (end <= initialData.byteLength && begin >= 0) {
        this.onDataRange(begin, initialData.slice(begin, end));
        return;
      }

      this.pendingQueue.push(() => {
        if (this.aborted) return Promise.resolve();
        const ctrl = new AbortController();
        this.activeCtrls.add(ctrl);

        const fetchSlice = async (attempt = 0) => {
          try {
            const res = await fetch(this.cdnUrl, {
              headers: { Range: `bytes=${begin}-${end - 1}` },
              signal: ctrl.signal
            });
            if ((res.status === 401 || res.status === 403) && attempt === 0 && this.cdnUrl !== this.originalUrl) {
              await this.refreshCdnUrl(ctrl.signal);
              return fetchSlice(1);
            }
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
            const ab = await res.arrayBuffer();
            if (this.aborted) return;
            const chunk = new Uint8Array(ab);
            const rangeKey = `${begin}:${end}`;
            if (!this.seenRanges.has(rangeKey)) {
              this.seenRanges.add(rangeKey);
              this.loadedBytes = Math.min(this.length, this.loadedBytes + chunk.byteLength);
              onBytesProgress?.(this.loadedBytes, this.length);
            }
            this.onDataRange(begin, chunk);
          } catch (err) {
            if (this.aborted || err?.name === 'AbortError') return;
            if (attempt === 0 && this.cdnUrl !== this.originalUrl) {
              this.cdnUrl = this.originalUrl;
              return fetchSlice(1);
            }
            console.warn(`[WebPDF] Range request failed (${begin}-${end}):`, err);
            if (!this.docReady && !this.aborted) {
              onInitialRangeError?.(err);
            }
          } finally {
            this.activeCtrls.delete(ctrl);
          }
        };

        return fetchSlice(0);
      });

      this.pumpQueue();
    }

    abort() {
      this.aborted = true;
      this.pendingQueue.length = 0;
      for (const ctrl of this.activeCtrls) {
        try { ctrl.abort(); } catch { /* ignore */ }
      }
      this.activeCtrls.clear();
    }
  }

  return { transport: new DirectRangeTransport(), totalLength };
}
