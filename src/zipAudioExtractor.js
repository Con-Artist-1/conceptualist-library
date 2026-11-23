// Client-side zero-backend ZIP audio extractor & session cache
// Supports STORE (method 0), DEFLATE (method 8 via browser DecompressionStream), and nested .zip packages.

import { getFileExt, findEocdOffset, inflateRawBytes } from './zipUtils.js';

const AUDIO_MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg'
};

const MAX_CACHED_ZIPS = 2;
const zipExtractionCache = new Map();
const inFlightExtractions = new Map();

function isPlayableAudioEntry(fileName) {
  if (!fileName) return false;
  const base = fileName.split('/').pop() || '';
  if (!base || base.startsWith('.') || base.startsWith('__MACOSX')) return false;
  const ext = getFileExt(base);
  return Boolean(AUDIO_MIME_BY_EXT[ext]);
}

function buildTrackLabels(rawEntryPath, index, total) {
  const baseName = (rawEntryPath.split('/').pop() || rawEntryPath).trim();
  const ext = getFileExt(baseName);
  const stem = ext ? baseName.slice(0, -(ext.length + 1)) : baseName;

  // Pattern 1: Tracked question recordings (e.g., WFR2_001.mp3, WSP4_003.mp3)
  const trackNumMatch = stem.match(/(?:^|[_-\s])0*([1-9]\d*)$/);
  if (trackNumMatch) {
    const num = Number(trackNumMatch[1]);
    return {
      shortLabel: `Track ${num}`,
      title: `Track ${num} — ${baseName}`,
      unitHint: /2[_-]/i.test(stem) ? 'U2' : /4[_-]/i.test(stem) ? 'U4' : '',
      isUnitTrack: false,
      isTrackedPart: true
    };
  }

  // Pattern 2: Combined Unit 2 / Unit 4 archives (e.g., Audio U2.mp3, 1906 WFR02 E2.wav)
  if (/\b(?:U2|WFR02|WGN02|WSP02|Unit\s*2)\b/i.test(rawEntryPath)) {
    return {
      shortLabel: 'Unit 2 Audio',
      title: `Unit 2 — ${baseName}`,
      unitHint: 'U2',
      isUnitTrack: true,
      isTrackedPart: false
    };
  }
  if (/\b(?:U4|WFR04|WGN04|WSP04|Unit\s*4)\b/i.test(rawEntryPath)) {
    return {
      shortLabel: 'Unit 4 Audio',
      title: `Unit 4 — ${baseName}`,
      unitHint: 'U4',
      isUnitTrack: true,
      isTrackedPart: false
    };
  }

  if (total > 1) {
    return {
      shortLabel: `Track ${index + 1}`,
      title: `Track ${index + 1} — ${baseName}`,
      unitHint: '',
      isUnitTrack: false,
      isTrackedPart: true
    };
  }

  return {
    shortLabel: 'Audio Track',
    title: baseName,
    unitHint: '',
    isUnitTrack: false,
    isTrackedPart: false
  };
}

async function parseZipBufferForAudioEntries(bytes, depth = 0, onStatus = null) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEocdOffset(bytes, view);
  if (eocdOffset === -1) {
    throw new Error('Invalid or incomplete ZIP archive header.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');

  const rawEntries = [];
  let ptr = cdOffset;

  for (let i = 0; i < totalEntries && ptr + 46 <= bytes.byteLength; i++) {
    const sig = view.getUint32(ptr, true);
    if (sig !== 0x02014b50) break;

    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const uncompressedSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const entryPath = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!entryPath || entryPath.endsWith('/') || entryPath.includes('__MACOSX')) continue;

    const ext = getFileExt(entryPath);
    if (AUDIO_MIME_BY_EXT[ext] || (ext === 'zip' && depth < 1)) {
      rawEntries.push({
        entryPath,
        ext,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset
      });
    }
  }

  const extractedAudio = [];

  for (let i = 0; i < rawEntries.length; i++) {
    const item = rawEntries[i];
    const lh = item.localHeaderOffset;
    if (lh + 30 > bytes.byteLength || view.getUint32(lh, true) !== 0x04034b50) {
      continue;
    }
    const localNameLen = view.getUint16(lh + 26, true);
    const localExtraLen = view.getUint16(lh + 28, true);
    const dataStart = lh + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + item.compressedSize;
    if (dataEnd > bytes.byteLength) continue;

    if (onStatus) {
      onStatus({
        phase: 'unpacking',
        currentTrack: i + 1,
        totalTracks: rawEntries.length,
        entryName: item.entryPath.split('/').pop() || item.entryPath
      });
    }

    const compressedSlice = bytes.subarray(dataStart, dataEnd);
    let fileBytes;
    if (item.compressionMethod === 0) {
      fileBytes = compressedSlice;
    } else if (item.compressionMethod === 8) {
      fileBytes = await inflateRawBytes(compressedSlice, item.uncompressedSize);
    } else {
      throw new Error(`Unsupported ZIP compression method (${item.compressionMethod}).`);
    }

    if (item.ext === 'zip' && depth < 1) {
      const nested = await parseZipBufferForAudioEntries(fileBytes, depth + 1, onStatus);
      extractedAudio.push(...nested);
    } else if (AUDIO_MIME_BY_EXT[item.ext]) {
      extractedAudio.push({
        entryPath: item.entryPath,
        fileName: (item.entryPath.split('/').pop() || item.entryPath).trim(),
        ext: item.ext,
        mimeType: AUDIO_MIME_BY_EXT[item.ext],
        size: fileBytes.byteLength,
        bytes: fileBytes
      });
    }
  }

  return extractedAudio;
}

async function fetchZipWithProgress(url, onProgress, signal = null) {
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio archive (${response.status})`);
  }

  const contentLength = Number(response.headers.get('content-length')) || 0;
  if (!response.body || typeof response.body.getReader !== 'function') {
    const ab = await response.arrayBuffer();
    return new Uint8Array(ab);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    if (signal?.aborted) {
      try { await reader.cancel(); } catch { /* ignore cancel error */ }
      throw new DOMException('Aborted', 'AbortError');
    }
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    if (onProgress) {
      onProgress({
        phase: 'downloading',
        loadedBytes: loaded,
        totalBytes: contentLength,
        percent: contentLength > 0 ? Math.min(99, Math.round((loaded / contentLength) * 100)) : null
      });
    }
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    merged.set(chunks[i], offset);
    offset += chunks[i].byteLength;
  }
  return merged;
}

function evictOldestCacheEntriesIfNeeded() {
  while (zipExtractionCache.size >= MAX_CACHED_ZIPS) {
    const oldestKey = zipExtractionCache.keys().next().value;
    if (!oldestKey) break;
    const oldEntry = zipExtractionCache.get(oldestKey);
    zipExtractionCache.delete(oldestKey);
    if (oldEntry && Array.isArray(oldEntry.tracks)) {
      oldEntry.tracks.forEach((t) => {
        if (t.blobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try {
            URL.revokeObjectURL(t.blobUrl);
          } catch {
            // Ignore revoke errors
          }
        }
      });
    }
  }
}

export async function extractZipAudioTracks(url, onProgress = null, { signal } = {}) {
  if (!url) throw new Error('Missing audio archive URL.');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const cached = zipExtractionCache.get(url);
  if (cached) {
    // Refresh LRU order
    zipExtractionCache.delete(url);
    zipExtractionCache.set(url, cached);
    return cached.tracks;
  }

  let entry = inFlightExtractions.get(url);
  if (!entry) {
    const progressListeners = new Set();
    const controller = new AbortController();
    const notify = (status) => {
      progressListeners.forEach((fn) => {
        try {
          fn(status);
        } catch {
          // Ignore listener errors
        }
      });
    };

    const task = (async () => {
      try {
        const zipBytes = await fetchZipWithProgress(url, notify, controller.signal);
        const rawTracks = await parseZipBufferForAudioEntries(zipBytes, 0, notify);

        if (rawTracks.length === 0) {
          throw new Error('No playable audio tracks (.mp3 / .wav) found inside this archive.');
        }

        rawTracks.sort((a, b) =>
          a.entryPath.localeCompare(b.entryPath, undefined, { numeric: true, sensitivity: 'base' })
        );

        const trackDrafts = rawTracks.map((item, idx) => ({
          item,
          idx,
          labels: buildTrackLabels(item.entryPath, idx, rawTracks.length)
        }));
        const isCombinedUnitArchive =
          trackDrafts.some((d) => d.labels.isUnitTrack) ||
          (trackDrafts.some((d) => d.labels.unitHint === 'U2') &&
            trackDrafts.some((d) => d.labels.unitHint === 'U4') &&
            !trackDrafts.every((d) => d.labels.isTrackedPart));

        const tracks = trackDrafts.map(({ item, idx, labels }) => {
          const blob = new Blob([item.bytes], { type: item.mimeType });
          const blobUrl =
            typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
              ? URL.createObjectURL(blob)
              : '';
          return {
            id: `${idx}-${item.fileName}`,
            index: idx,
            fileName: item.fileName,
            entryPath: item.entryPath,
            ext: item.ext,
            mimeType: item.mimeType,
            size: item.size,
            shortLabel: labels.shortLabel,
            title: labels.title,
            unitHint: labels.unitHint,
            isUnitTrack: labels.isUnitTrack,
            isTrackedPart: labels.isTrackedPart,
            isCombinedUnitArchive,
            blobUrl
          };
        });

        evictOldestCacheEntriesIfNeeded();
        zipExtractionCache.set(url, { tracks, createdAt: Date.now() });
        return tracks;
      } finally {
        if (inFlightExtractions.get(url) === entry) {
          inFlightExtractions.delete(url);
        }
      }
    })();

    entry = { task, progressListeners, controller, refCount: 0 };
    inFlightExtractions.set(url, entry);
  }

  entry.refCount += 1;
  if (onProgress) entry.progressListeners.add(onProgress);

  const detach = () => {
    if (onProgress) entry.progressListeners.delete(onProgress);
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0 && inFlightExtractions.get(url) === entry) {
      inFlightExtractions.delete(url);
      entry.controller.abort();
    }
  };

  if (!signal) {
    return entry.task.finally(() => {
      if (onProgress) entry.progressListeners.delete(onProgress);
      entry.refCount = Math.max(0, entry.refCount - 1);
    });
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      detach();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    entry.task.then(
      (tracks) => {
        signal.removeEventListener('abort', onAbort);
        if (onProgress) entry.progressListeners.delete(onProgress);
        entry.refCount = Math.max(0, entry.refCount - 1);
        resolve(tracks);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        if (onProgress) entry.progressListeners.delete(onProgress);
        entry.refCount = Math.max(0, entry.refCount - 1);
        reject(err);
      }
    );
  });
}

export { isPlayableAudioEntry };
