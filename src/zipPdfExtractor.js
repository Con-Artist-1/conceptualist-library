// Client-side zero-backend HTTP Range ZIP browser & PDF extractor
// Fetches only the ZIP Central Directory (~3–25 KB) to list chapters/exercises,
// then streams & inflates only the clicked PDF entry via HTTP 206 Byte-Range requests.

import { getFileExt, findEocdOffset, inflateRawBytes } from './zipUtils.js';

const TAIL_PROBE_BYTES = 65558; // Max EOCD comment (65535) + EOCD header (22) + margin
const LOCAL_EXTRA_BUFFER_BYTES = 512;
const MAX_CACHED_INDEXES = 16;
const MAX_CACHED_PDFS = 20;

const zipIndexCache = new Map();
const inFlightIndexes = new Map();
const zipPdfCache = new Map();
const inFlightPdfs = new Map();

function readUint64AsNumber(view, offset) {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 4294967296 + low;
}

function applyZip64ExtraFields(view, extraOffset, extraLen, fields) {
  let ptr = extraOffset;
  const end = extraOffset + extraLen;
  while (ptr + 4 <= end) {
    const headerId = view.getUint16(ptr, true);
    const dataSize = view.getUint16(ptr + 2, true);
    const dataPtr = ptr + 4;
    if (dataPtr + dataSize > end) break;
    if (headerId === 0x0001) {
      let cursor = dataPtr;
      if (fields.uncompressedSize === 0xffffffff && cursor + 8 <= dataPtr + dataSize) {
        fields.uncompressedSize = readUint64AsNumber(view, cursor);
        cursor += 8;
      }
      if (fields.compressedSize === 0xffffffff && cursor + 8 <= dataPtr + dataSize) {
        fields.compressedSize = readUint64AsNumber(view, cursor);
        cursor += 8;
      }
      if (fields.localHeaderOffset === 0xffffffff && cursor + 8 <= dataPtr + dataSize) {
        fields.localHeaderOffset = readUint64AsNumber(view, cursor);
      }
      break;
    }
    ptr = dataPtr + dataSize;
  }
}

function parseContentRangeHeader(headerValue) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(String(headerValue || '').trim());
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  const total = match[3] === '*' ? 0 : parseInt(match[3], 10);
  return { start, end, total };
}

function setLruCache(map, key, value, maxSize, onEvict = null) {
  if (map.has(key)) map.delete(key);
  while (map.size >= maxSize) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    const evicted = map.get(oldestKey);
    map.delete(oldestKey);
    if (onEvict && evicted) onEvict(evicted);
  }
  map.set(key, value);
}

function parseCentralDirectoryEntries(cdBytes, totalEntries) {
  const view = new DataView(cdBytes.buffer, cdBytes.byteOffset, cdBytes.byteLength);
  const decoder = new TextDecoder('utf-8');
  const entries = [];
  let ptr = 0;

  for (let i = 0; i < totalEntries && ptr + 46 <= cdBytes.byteLength; i++) {
    const sig = view.getUint32(ptr, true);
    if (sig !== 0x02014b50) break;

    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const uncompressedSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    if (ptr + 46 + nameLen > cdBytes.byteLength) break;
    const entryPath = decoder.decode(cdBytes.subarray(ptr + 46, ptr + 46 + nameLen));
    const extraOffset = ptr + 46 + nameLen;
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!entryPath || entryPath.endsWith('/') || entryPath.includes('__MACOSX')) continue;
    const baseName = (entryPath.split('/').pop() || '').trim();
    if (!baseName || baseName.startsWith('.')) continue;
    if (getFileExt(baseName) !== 'pdf') continue;

    const resolvedFields = {
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    };
    if (
      extraLen > 0 &&
      (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff)
    ) {
      applyZip64ExtraFields(view, extraOffset, extraLen, resolvedFields);
    }

    entries.push({
      entryPath,
      fileName: baseName,
      cdNameLen: nameLen,
      compressionMethod,
      compressedSize: resolvedFields.compressedSize,
      uncompressedSize: resolvedFields.uncompressedSize,
      localHeaderOffset: resolvedFields.localHeaderOffset
    });
  }

  return entries;
}

function parseSolutionEntryMeta(entryPath, fallbackGroupName) {
  const parts = String(entryPath || '').split('/').filter(Boolean);
  const fileName = (parts[parts.length - 1] || entryPath).trim();
  const stem = fileName.replace(/\.pdf$/i, '').trim();

  let folderChapter = null;
  for (let i = 0; i < parts.length - 1; i++) {
    const chMatch = parts[i].match(/\bchapter[\s_-]*(\d+)\b/i);
    if (chMatch) {
      folderChapter = parseInt(chMatch[1], 10);
      break;
    }
  }

  // 1. Chapter Review (check before Exercise so `ex7CR` isn't treated as Exercise 7c)
  const crMatch =
    stem.match(/(?:^|[_-\s])(?:chap(?:ter)?[\s_-]*rev(?:iew)?|CR)[\s_-]*(\d+)(?:$|[_-\s])/i) ||
    stem.match(/(?:^|[_-\s])ex(\d+)CR(?:$|[_-\s])/i) ||
    stem.match(/_(\d+)_CR(?:$|[_-\s])/i);
  if (crMatch) {
    const chNum = folderChapter || parseInt(crMatch[1], 10);
    return {
      groupKey: `ch-${chNum}`,
      groupLabel: `Chapter ${chNum}`,
      groupShortLabel: `Ch ${chNum}`,
      groupSortKey: chNum,
      shortLabel: 'Ch. Review',
      fullLabel: `Chapter ${chNum} Review`,
      sortKind: 1,
      sortNum: chNum,
      sortSub: ''
    };
  }

  // 2. Review Exercise (RE1, RE2, Review Exercise 1)
  const reMatch =
    stem.match(/review[\s_-]*exercise[\s_-]*(\d+)/i) ||
    stem.match(/(?:^|[_-\s])RE[\s_-]*(\d+)(?:$|[_-\s])/i);
  if (reMatch) {
    const num = parseInt(reMatch[1], 10);
    return {
      groupKey: 'review-practice',
      groupLabel: 'Review & Practice',
      groupShortLabel: 'Review',
      groupSortKey: 900,
      shortLabel: `Review Ex ${num}`,
      fullLabel: `Review Exercise ${num}`,
      sortKind: 2,
      sortNum: num,
      sortSub: ''
    };
  }

  // 3. Practice Exam Paper (PEP, exam_practice, Practice Exam Paper)
  if (/(?:exam[\s_-]*practice|practice[\s_-]*exam|(?:^|[_-\s])PEP(?:$|[_-\s]))/i.test(stem)) {
    return {
      groupKey: 'review-practice',
      groupLabel: 'Review & Practice',
      groupShortLabel: 'Review',
      groupSortKey: 900,
      shortLabel: 'Practice Paper',
      fullLabel: 'Practice Exam Paper',
      sortKind: 3,
      sortNum: 99,
      sortSub: ''
    };
  }

  // 4. Individual Exercise (ex1a, Exercise 1A)
  const exMatch = stem.match(/(?:^|[_-\s])ex(?:ercise)?[\s_-]*(\d+)([a-z]+)(?:$|[_-\s])/i);
  if (exMatch) {
    const chNum = folderChapter || parseInt(exMatch[1], 10);
    const exNum = parseInt(exMatch[1], 10);
    const letter = exMatch[2].toUpperCase();
    return {
      groupKey: `ch-${chNum}`,
      groupLabel: `Chapter ${chNum}`,
      groupShortLabel: `Ch ${chNum}`,
      groupSortKey: chNum,
      shortLabel: `Ex ${exNum}${letter}`,
      fullLabel: `Exercise ${exNum}${letter}`,
      sortKind: 0,
      sortNum: exNum,
      sortSub: letter
    };
  }

  // 5. Fallback for any other chapter or generic PDF naming
  if (folderChapter !== null) {
    const cleanStem = stem.replace(/[_-]+/g, ' ').trim();
    return {
      groupKey: `ch-${folderChapter}`,
      groupLabel: `Chapter ${folderChapter}`,
      groupShortLabel: `Ch ${folderChapter}`,
      groupSortKey: folderChapter,
      shortLabel: cleanStem.length > 22 ? `${cleanStem.slice(0, 20)}…` : cleanStem,
      fullLabel: cleanStem,
      sortKind: 4,
      sortNum: folderChapter,
      sortSub: cleanStem
    };
  }

  const groupTitle = fallbackGroupName || 'Contents';
  const cleanStem = stem.replace(/[_-]+/g, ' ').trim();
  return {
    groupKey: `folder-${groupTitle.toLowerCase()}`,
    groupLabel: groupTitle,
    groupShortLabel: groupTitle.length > 14 ? `${groupTitle.slice(0, 12)}…` : groupTitle,
    groupSortKey: 950,
    shortLabel: cleanStem.length > 22 ? `${cleanStem.slice(0, 20)}…` : cleanStem,
    fullLabel: cleanStem,
    sortKind: 4,
    sortNum: 0,
    sortSub: cleanStem
  };
}

function buildGroupedSolutionEntries(rawEntries) {
  const groupMap = new Map();

  for (const raw of rawEntries) {
    const parts = raw.entryPath.split('/').filter(Boolean);
    const fallbackGroup = parts.length > 2 ? parts[parts.length - 2] : 'Contents';
    const meta = parseSolutionEntryMeta(raw.entryPath, fallbackGroup);
    const item = { ...raw, ...meta };
    if (!groupMap.has(meta.groupKey)) {
      groupMap.set(meta.groupKey, {
        key: meta.groupKey,
        label: meta.groupLabel,
        shortLabel: meta.groupShortLabel,
        sortKey: meta.groupSortKey,
        items: []
      });
    }
    groupMap.get(meta.groupKey).items.push(item);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
  });

  const flatEntries = [];
  for (const grp of groups) {
    grp.items.sort((a, b) => {
      if (a.sortKind !== b.sortKind) return a.sortKind - b.sortKind;
      if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
      if (a.sortSub !== b.sortSub) {
        return a.sortSub.localeCompare(b.sortSub, undefined, { numeric: true, sensitivity: 'base' });
      }
      return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Disambiguate rare duplicate labels within the same chapter (e.g. P1 Ch. 8 having two CR PDFs)
    const labelCounts = new Map();
    for (const item of grp.items) {
      labelCounts.set(item.shortLabel, (labelCounts.get(item.shortLabel) || 0) + 1);
    }
    const seenCounts = new Map();
    for (const item of grp.items) {
      if (labelCounts.get(item.shortLabel) > 1) {
        const nextIdx = (seenCounts.get(item.shortLabel) || 0) + 1;
        seenCounts.set(item.shortLabel, nextIdx);
        item.shortLabel = `${item.shortLabel} (${nextIdx})`;
        item.fullLabel = `${item.fullLabel} (${item.fileName})`;
      }
      item.flatIndex = flatEntries.length;
      flatEntries.push(item);
    }
  }

  return { groups, entries: flatEntries };
}

async function refreshArchiveCdnUrl(archiveState) {
  if (!archiveState.refreshPromise) {
    archiveState.refreshPromise = fetch(archiveState.originalUrl, {
      headers: { Range: 'bytes=0-0' }
    })
      .then(async (res) => {
        if (res.url) archiveState.cdnUrl = res.url;
        try {
          await res.body?.cancel?.();
        } catch {
          // Ignore body cancel errors
        }
      })
      .finally(() => {
        archiveState.refreshPromise = null;
      });
  }
  return archiveState.refreshPromise;
}

async function fetchArchiveRange(archiveState, begin, endInclusive) {
  const runFetch = async (attempt = 0) => {
    try {
      const res = await fetch(archiveState.cdnUrl, {
        headers: { Range: `bytes=${begin}-${endInclusive}` }
      });
      if ((res.status === 401 || res.status === 403) && attempt === 0 && archiveState.cdnUrl !== archiveState.originalUrl) {
        await refreshArchiveCdnUrl(archiveState);
        return runFetch(1);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (res.url) archiveState.cdnUrl = res.url;
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, bytes, contentRange: res.headers.get('content-range') || '' };
    } catch (err) {
      if (attempt === 0 && archiveState.cdnUrl !== archiveState.originalUrl) {
        archiveState.cdnUrl = archiveState.originalUrl;
        return runFetch(1);
      }
      throw err;
    }
  };
  return runFetch(0);
}

async function loadZipDirectory(url, knownSize = 0) {
  const state = {
    originalUrl: url,
    cdnUrl: url,
    totalLength: Number(knownSize) > 0 ? Number(knownSize) : 0,
    fullBytes: null,
    refreshPromise: null
  };

  let tailBytes = null;
  let tailStart = 0;

  if (state.totalLength > 0) {
    const start = Math.max(0, state.totalLength - TAIL_PROBE_BYTES);
    const probe = await fetchArchiveRange(state, start, state.totalLength - 1);
    if (probe.status !== 206) {
      state.fullBytes = probe.bytes;
      state.totalLength = probe.bytes.byteLength;
    } else {
      const cr = parseContentRangeHeader(probe.contentRange);
      if (cr && cr.total > 0 && cr.total !== state.totalLength) {
        state.totalLength = cr.total;
        const realStart = Math.max(0, state.totalLength - TAIL_PROBE_BYTES);
        const realTail = await fetchArchiveRange(state, realStart, state.totalLength - 1);
        if (realTail.status !== 206) {
          state.fullBytes = realTail.bytes;
          state.totalLength = realTail.bytes.byteLength;
        } else {
          tailStart = realStart;
          tailBytes = realTail.bytes;
        }
      } else {
        tailStart = cr ? cr.start : start;
        tailBytes = probe.bytes;
      }
    }
  } else {
    const head = await fetchArchiveRange(state, 0, 0);
    if (head.status !== 206) {
      state.fullBytes = head.bytes;
      state.totalLength = head.bytes.byteLength;
    } else {
      const cr = parseContentRangeHeader(head.contentRange);
      if (!cr || !cr.total) {
        throw new Error('Archive server did not report total size for byte-range reading.');
      }
      state.totalLength = cr.total;
      tailStart = Math.max(0, state.totalLength - TAIL_PROBE_BYTES);
      const tailRes = await fetchArchiveRange(state, tailStart, state.totalLength - 1);
      if (tailRes.status !== 206) {
        state.fullBytes = tailRes.bytes;
        state.totalLength = tailRes.bytes.byteLength;
      } else {
        tailBytes = tailRes.bytes;
      }
    }
  }

  let cdBytes = null;
  let totalEntries = 0;

  if (state.fullBytes) {
    const fullView = new DataView(state.fullBytes.buffer, state.fullBytes.byteOffset, state.fullBytes.byteLength);
    const eocdOffset = findEocdOffset(state.fullBytes, fullView);
    if (eocdOffset === -1) throw new Error('Invalid or incomplete ZIP archive directory.');
    totalEntries = fullView.getUint16(eocdOffset + 10, true);
    const cdSize = fullView.getUint32(eocdOffset + 12, true);
    const cdOffset = fullView.getUint32(eocdOffset + 16, true);
    cdBytes = state.fullBytes.subarray(cdOffset, cdOffset + cdSize);
  } else {
    const tailView = new DataView(tailBytes.buffer, tailBytes.byteOffset, tailBytes.byteLength);
    const eocdRel = findEocdOffset(tailBytes, tailView);
    if (eocdRel === -1) throw new Error('Invalid or incomplete ZIP archive directory.');
    totalEntries = tailView.getUint16(eocdRel + 10, true);
    const cdSize = tailView.getUint32(eocdRel + 12, true);
    const cdOffset = tailView.getUint32(eocdRel + 16, true);

    if (cdOffset >= tailStart && cdOffset + cdSize <= tailStart + tailBytes.byteLength) {
      const relStart = cdOffset - tailStart;
      cdBytes = tailBytes.subarray(relStart, relStart + cdSize);
    } else {
      const cdRes = await fetchArchiveRange(state, cdOffset, cdOffset + cdSize - 1);
      cdBytes = cdRes.bytes;
    }
  }

  const rawEntries = parseCentralDirectoryEntries(cdBytes, totalEntries);
  if (rawEntries.length === 0) {
    throw new Error('No readable PDF documents found inside this archive.');
  }

  const { groups, entries } = buildGroupedSolutionEntries(rawEntries);
  return {
    ...state,
    groups,
    entries
  };
}

export async function listZipPdfEntries(url, knownSize = 0) {
  if (!url) throw new Error('Missing archive URL.');

  const cached = zipIndexCache.get(url);
  if (cached) {
    setLruCache(zipIndexCache, url, cached, MAX_CACHED_INDEXES);
    return cached;
  }

  if (inFlightIndexes.has(url)) {
    return inFlightIndexes.get(url);
  }

  const task = loadZipDirectory(url, knownSize)
    .then((result) => {
      setLruCache(zipIndexCache, url, result, MAX_CACHED_INDEXES);
      return result;
    })
    .finally(() => {
      inFlightIndexes.delete(url);
    });

  inFlightIndexes.set(url, task);
  return task;
}

export async function extractZipPdfEntry(url, entry, knownSize = 0) {
  if (!url || !entry) throw new Error('Missing archive entry.');
  const cacheKey = `${url}::${entry.entryPath}`;

  const cached = zipPdfCache.get(cacheKey);
  if (cached) {
    setLruCache(zipPdfCache, cacheKey, cached, MAX_CACHED_PDFS, (evicted) => {
      if (evicted?.blobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(evicted.blobUrl);
        } catch {
          // Ignore revoke errors
        }
      }
    });
    return cached;
  }

  if (inFlightPdfs.has(cacheKey)) {
    return inFlightPdfs.get(cacheKey);
  }

  const task = (async () => {
    try {
      const indexInfo = await listZipPdfEntries(url, knownSize);
      let sliceBytes = null;

      if (indexInfo.fullBytes) {
        sliceBytes = indexInfo.fullBytes.subarray(entry.localHeaderOffset);
      } else {
        const estimatedEnd = Math.min(
          indexInfo.totalLength - 1,
          entry.localHeaderOffset + 30 + (entry.cdNameLen || 256) + LOCAL_EXTRA_BUFFER_BYTES + entry.compressedSize - 1
        );
        const firstSlice = await fetchArchiveRange(indexInfo, entry.localHeaderOffset, estimatedEnd);
        if (firstSlice.status !== 206 && firstSlice.bytes.byteLength >= indexInfo.totalLength) {
          indexInfo.fullBytes = firstSlice.bytes;
          sliceBytes = indexInfo.fullBytes.subarray(entry.localHeaderOffset);
        } else {
          sliceBytes = firstSlice.bytes;
        }
      }

      if (!sliceBytes || sliceBytes.byteLength < 30) {
        throw new Error('Failed to read ZIP file entry header.');
      }
      const view = new DataView(sliceBytes.buffer, sliceBytes.byteOffset, sliceBytes.byteLength);
      if (view.getUint32(0, true) !== 0x04034b50) {
        throw new Error('Corrupt ZIP local header signature.');
      }

      const localNameLen = view.getUint16(26, true);
      const localExtraLen = view.getUint16(28, true);
      const dataStart = 30 + localNameLen + localExtraLen;
      const dataEnd = dataStart + entry.compressedSize;

      if (dataEnd > sliceBytes.byteLength) {
        // Rare: local extra field exceeded buffer; fetch missing tail bytes once
        const missingBegin = entry.localHeaderOffset + sliceBytes.byteLength;
        const missingEnd = entry.localHeaderOffset + dataEnd - 1;
        const tailRes = await fetchArchiveRange(indexInfo, missingBegin, missingEnd);
        const combined = new Uint8Array(sliceBytes.byteLength + tailRes.bytes.byteLength);
        combined.set(sliceBytes, 0);
        combined.set(tailRes.bytes, sliceBytes.byteLength);
        sliceBytes = combined;
      }

      const compressedSlice = sliceBytes.subarray(dataStart, dataEnd);
      let pdfBytes;
      if (entry.compressionMethod === 0) {
        pdfBytes = new Uint8Array(compressedSlice);
      } else if (entry.compressionMethod === 8) {
        pdfBytes = await inflateRawBytes(compressedSlice, entry.uncompressedSize);
      } else {
        throw new Error(`Unsupported ZIP compression method (${entry.compressionMethod}).`);
      }

      const blobUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }))
          : '';

      const result = {
        bytes: pdfBytes,
        blobUrl,
        fileName: entry.fileName
      };

      setLruCache(zipPdfCache, cacheKey, result, MAX_CACHED_PDFS, (evicted) => {
        if (evicted?.blobUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try {
            URL.revokeObjectURL(evicted.blobUrl);
          } catch {
            // Ignore revoke errors
          }
        }
      });

      return result;
    } finally {
      inFlightPdfs.delete(cacheKey);
    }
  })();

  inFlightPdfs.set(cacheKey, task);
  return task;
}
