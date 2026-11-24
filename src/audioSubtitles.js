// Client-side Audio Subtitles Engine:
// 1. Instant lookup from sharded static /subtitles/manifest.json + lazy per-subject /subtitles/<shard>.json
//    (with automatic fallback to legacy /audio-subtitles.json if present)
// 2. Shared Cloud Cache lookup & persistence via /api/views?subtitles=... (MongoDB Atlas audio_subtitles collection)
// 3. Opt-in browser adaptive RMS VAD + Whisper AI live transcription fallback (streams live & caches to cloud)

import { BUILD_TIMESTAMP } from './lib/appMeta.js';

const LOCAL_SUBTITLE_CACHE_PREFIX = 'cs_audio_sub_v2_';
const SUBTITLE_CACHE_VERSION = encodeURIComponent(BUILD_TIMESTAMP || 'v2');

let staticManifestPromise = null;
let staticManifestData = null;
let legacySubtitlesPromise = null;
let legacySubtitlesData = null;
const loadedShardsCache = new Map();
const inflightShardPromises = new Map();
const runtimeSubtitleOverlay = new Map();
let whisperPipelinePromise = null;

function hydrateSubtitleRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Compact tuple format from /subtitles/<shard>.json:
  // { d: duration, src: source, lang: language, pdf?: transcriptPdf, s: [[start, end, text, passage?], ...] }
  if (Array.isArray(raw.s)) {
    const segments = [];
    for (let i = 0; i < raw.s.length; i++) {
      const tuple = raw.s[i];
      if (!Array.isArray(tuple) || tuple.length < 3) continue;
      const start = Number(tuple[0]);
      const end = Number(tuple[1]);
      const text = String(tuple[2] || '').trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;
      const seg = { start, end: Math.max(start, end), text };
      if (tuple[3]) seg.passage = String(tuple[3]);
      segments.push(seg);
    }
    if (segments.length === 0) return null;
    const out = {
      duration: Number.isFinite(Number(raw.d)) ? Number(raw.d) : 0,
      source: raw.src || 'whisper-ai',
      language: raw.lang || 'english',
      perTrack: true,
      segments
    };
    if (raw.pdf) out.transcriptPdf = raw.pdf;
    return out;
  }

  // Standard object format (legacy audio-subtitles.json / MongoDB / localStorage)
  if (Array.isArray(raw.segments) && raw.segments.length > 0) {
    return raw;
  }
  return null;
}

async function loadStaticSubtitlesManifest() {
  if (staticManifestData) return staticManifestData;
  if (!staticManifestPromise) {
    staticManifestPromise = fetch(`/subtitles/manifest.json?v=${SUBTITLE_CACHE_VERSION}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (json && typeof json.keys === 'object') {
          staticManifestData = json;
          return staticManifestData;
        }
        staticManifestPromise = null;
        return { keys: {}, shards: [] };
      })
      .catch(() => {
        staticManifestPromise = null;
        return { keys: {}, shards: [] };
      });
  }
  return staticManifestPromise;
}

async function loadSubtitleShard(shardName) {
  if (!shardName) return null;
  if (loadedShardsCache.has(shardName)) return loadedShardsCache.get(shardName);
  if (inflightShardPromises.has(shardName)) return inflightShardPromises.get(shardName);

  const task = fetch(`/subtitles/${encodeURIComponent(shardName)}.json?v=${SUBTITLE_CACHE_VERSION}`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      if (json && typeof json.tracks === 'object') {
        loadedShardsCache.set(shardName, json.tracks);
        return json.tracks;
      }
      return {};
    })
    .catch(() => ({}))
    .finally(() => {
      inflightShardPromises.delete(shardName);
    });

  inflightShardPromises.set(shardName, task);
  return task;
}

async function loadStaticSubtitlesIndex() {
  if (legacySubtitlesData) return legacySubtitlesData;
  if (!legacySubtitlesPromise) {
    legacySubtitlesPromise = fetch(`/audio-subtitles.json?v=${SUBTITLE_CACHE_VERSION}`)
      .then((res) => (res.ok ? res.json() : { tracks: {} }))
      .then((json) => {
        legacySubtitlesData = json && typeof json.tracks === 'object' ? json : { tracks: {} };
        return legacySubtitlesData;
      })
      .catch(() => {
        legacySubtitlesData = { tracks: {} };
        return legacySubtitlesData;
      });
  }
  return legacySubtitlesPromise;
}

export function buildCandidateSubtitleKeys({
  sittingKey,
  audioPath,
  altPaths,
  entryPath,
  trackFileName,
  trackIndex,
  isMultiTrack = false,
  isUnitTrack = false,
  isCombinedUnitArchive = false,
  spec,
  subject,
  session,
  unitHint
}) {
  const keys = [];
  const cleanSitting = String(sittingKey || '').trim();
  const cleanPath = String(audioPath || '').replace(/\\/g, '/').trim();
  const cleanEntryPath = String(entryPath || '').replace(/\\/g, '/').trim();
  const cleanTrackName = String(trackFileName || '').trim();
  const cleanAlts = Array.isArray(altPaths)
    ? altPaths.map((p) => String(p || '').replace(/\\/g, '/').trim()).filter(Boolean)
    : [];
  const isZipAudio = /\.zip$/i.test(cleanPath);
  const isCombinedUnit = Boolean(isUnitTrack || isCombinedUnitArchive);

  // 1. Most specific: exact archive path + track filename / entryPath
  if (cleanPath && cleanTrackName && (isZipAudio || cleanPath.split('/').pop() !== cleanTrackName)) {
    keys.push(`${cleanPath}#${cleanTrackName}`);
  }
  if (cleanPath && cleanEntryPath && cleanEntryPath !== cleanTrackName && isZipAudio) {
    keys.push(`${cleanPath}#${cleanEntryPath}`);
  }
  for (const alt of cleanAlts) {
    if (cleanTrackName && (/\.zip$/i.test(alt) || alt.split('/').pop() !== cleanTrackName)) {
      keys.push(`${alt}#${cleanTrackName}`);
    }
    if (cleanEntryPath && cleanEntryPath !== cleanTrackName && /\.zip$/i.test(alt)) {
      keys.push(`${alt}#${cleanEntryPath}`);
    }
  }

  // 2. Single-file audio path (direct MP3 / WAV) before sitting fallback
  if (cleanPath && !isZipAudio) {
    keys.push(cleanPath);
    if (cleanTrackName) keys.push(`${cleanPath}#${cleanTrackName}`);
  }
  for (const alt of cleanAlts) {
    if (!/\.zip$/i.test(alt)) {
      keys.push(alt);
    }
  }

  // 3. Unit-aware sitting keys: if a track's unitHint explicitly points to a different unit
  //    (e.g. clicking "Unit 4 Audio" inside a WFR02 modal), prioritize that derived unit and
  //    NEVER fall back to the wrong unit's sittingKey.
  let derivedSitting = '';
  if (unitHint && subject && session) {
    const prefixMap = { French: 'WFR', German: 'WGN', Spanish: 'WSP' };
    const prefix = prefixMap[subject];
    const unitNum = unitHint === 'U2' ? '02' : unitHint === 'U4' ? '04' : '';
    if (prefix && unitNum) {
      derivedSitting = `${spec || 'IAL'}|${subject}|${prefix}${unitNum}||${session}`;
    }
  }
  const hasUnitMismatch = Boolean(derivedSitting && cleanSitting && derivedSitting !== cleanSitting);
  const primarySitting = derivedSitting || cleanSitting;

  if (isMultiTrack && !isCombinedUnit && Number.isInteger(trackIndex) && trackIndex >= 0) {
    if (primarySitting) keys.push(`${primarySitting}#track-${trackIndex + 1}`);
    if (!hasUnitMismatch && cleanSitting && cleanSitting !== primarySitting) {
      keys.push(`${cleanSitting}#track-${trackIndex + 1}`);
    }
  } else {
    if (primarySitting) keys.push(primarySitting);
    if (!hasUnitMismatch && cleanSitting && cleanSitting !== primarySitting) {
      keys.push(cleanSitting);
    }
  }

  // 4. Bare sitting fallback for tracked ZIPs only if no track-specific entry exists
  if (isMultiTrack && !isCombinedUnit && primarySitting) {
    keys.push(primarySitting);
  }

  // 5. Bare ZIP path fallback only when archive contains a single track
  if (cleanPath && isZipAudio && !isMultiTrack) {
    keys.push(cleanPath);
  }

  return Array.from(new Set(keys.filter(Boolean)));
}

export function adaptSubtitleEntryForTrack(
  entry,
  { isMultiTrack = false, trackIndex = 0, isUnitTrack = false, isCombinedUnitArchive = false } = {}
) {
  if (!entry || !Array.isArray(entry.segments) || entry.segments.length === 0) return entry;

  // Never slice full-unit tracks (Audio U2U4.zip) or tracks already keyed/aligned per individual audio file
  if (
    isUnitTrack ||
    isCombinedUnitArchive ||
    entry.perTrack === true ||
    entry.source === 'whisper-ai' ||
    entry.source === 'transcript-aligned' ||
    typeof entry.trackIndex === 'number' ||
    String(entry.resolvedKey || '').includes('#')
  ) {
    return entry;
  }
  if (!isMultiTrack) return entry;

  // Legacy fallback: group un-indexed multi-passage transcripts by Passage number
  const groups = [];
  let currentGroup = [];
  for (const seg of entry.segments) {
    const isNewPassage = /^(?:\([MF]\d\)\s*)?Passage\s+\d+\b/i.test(String(seg.text || '').trim());
    if (isNewPassage && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [seg];
    } else {
      currentGroup.push(seg);
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  if (groups.length <= 1) return entry;
  const targetGroup = groups[Math.min(trackIndex, groups.length - 1)];
  if (!targetGroup || targetGroup.length === 0) return entry;

  const baseStart = targetGroup[0].start || 0;
  const targetOffset = trackIndex === 0 ? 21.5 : 1.0;
  const rebasedSegments = targetGroup.map((seg) => {
    const dur = Math.max(1.5, (seg.end || seg.start + 3) - (seg.start || 0));
    const newStart = Math.max(0, Number((seg.start - baseStart + targetOffset).toFixed(1)));
    return {
      ...seg,
      start: newStart,
      end: Number((newStart + dur).toFixed(1))
    };
  });

  return {
    ...entry,
    segments: rebasedSegments
  };
}

function readLocalSubtitleCache(key) {
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_SUBTITLE_CACHE_PREFIX + key);
    if (!raw) return null;
    return hydrateSubtitleRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocalSubtitleCache(key, entry) {
  if (!key || !entry || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_SUBTITLE_CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore quota errors
  }
}

export async function resolveExistingSubtitles(candidateKeys, { signal } = {}) {
  if (!Array.isArray(candidateKeys) || candidateKeys.length === 0) return null;
  if (signal?.aborted) return null;

  // 0. Check in-memory session overlay (tracks just transcribed or fetched this session)
  for (const key of candidateKeys) {
    const memHit = runtimeSubtitleOverlay.get(key);
    if (memHit && Array.isArray(memHit.segments) && memHit.segments.length > 0) {
      return { ...memHit, resolvedKey: key, tier: memHit.tier || 'static' };
    }
  }

  // 1a. Check sharded static /subtitles/manifest.json + lazy subject shard
  const manifest = await loadStaticSubtitlesManifest();
  if (signal?.aborted) return null;
  const hasShardedManifest = Boolean(manifest?.keys && Object.keys(manifest.keys).length > 0);
  if (hasShardedManifest) {
    for (const key of candidateKeys) {
      const ref = manifest.keys[key];
      if (!ref || typeof ref !== 'string') continue;
      const slashIdx = ref.indexOf('/');
      if (slashIdx <= 0) continue;
      const shardName = ref.slice(0, slashIdx);
      const trackId = ref.slice(slashIdx + 1);
      const shardTracks = await loadSubtitleShard(shardName);
      if (signal?.aborted) return null;
      const hydrated = hydrateSubtitleRecord(shardTracks?.[trackId]);
      if (hydrated) {
        return { ...hydrated, resolvedKey: key, tier: 'static' };
      }
    }
  } else {
    // 1b. Legacy fallback to /audio-subtitles.json only when sharded manifest is unavailable
    const legacyDb = await loadStaticSubtitlesIndex();
    if (signal?.aborted) return null;
    for (const key of candidateKeys) {
      const hydrated = hydrateSubtitleRecord(legacyDb?.tracks?.[key]);
      if (hydrated) {
        return { ...hydrated, resolvedKey: key, tier: 'static' };
      }
    }
  }

  // 2. Check localStorage cache (v2)
  for (const key of candidateKeys) {
    const localHit = readLocalSubtitleCache(key);
    if (localHit) {
      return { ...localHit, resolvedKey: key, tier: 'local' };
    }
  }

  // 3. Check shared MongoDB Atlas cache via /api/views?subtitles=<primaryKey>&alts=...
  const primaryKey = candidateKeys[0];
  const altQueryKeys = candidateKeys.slice(1, 4);
  try {
    const qs = new URLSearchParams({ subtitles: primaryKey });
    if (altQueryKeys.length > 0) {
      qs.set('alts', altQueryKeys.join(','));
    }
    const res = await fetch(`/api/views?${qs.toString()}`, { signal });
    if (signal?.aborted) return null;
    if (res.ok) {
      const data = await res.json();
      const hydrated = hydrateSubtitleRecord(data?.subtitle);
      if (hydrated) {
        const matchedKey = data?.matchedKey || primaryKey;
        writeLocalSubtitleCache(matchedKey, hydrated);
        runtimeSubtitleOverlay.set(matchedKey, { ...hydrated, tier: 'cloud' });
        return { ...hydrated, resolvedKey: matchedKey, tier: 'cloud' };
      }
    }
  } catch {
    // Ignore network errors
  }

  return null;
}

export async function saveSubtitlesToCloud(primaryKey, aliasKeys, subtitleEntry) {
  if (!primaryKey || !subtitleEntry || !Array.isArray(subtitleEntry.segments) || subtitleEntry.segments.length === 0) {
    return;
  }
  const cleanAliases = Array.isArray(aliasKeys) ? aliasKeys.filter((k) => k && k !== primaryKey).slice(0, 4) : [];
  writeLocalSubtitleCache(primaryKey, subtitleEntry);
  runtimeSubtitleOverlay.set(primaryKey, { ...subtitleEntry, tier: 'cloud' });
  for (const k of cleanAliases) {
    runtimeSubtitleOverlay.set(k, { ...subtitleEntry, tier: 'cloud' });
  }
  try {
    await fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_subtitles',
        trackKey: primaryKey,
        aliasKeys: cleanAliases,
        subtitle: subtitleEntry
      })
    });
  } catch {
    // Non-fatal if offline
  }
}

// Adaptive RMS Voice Activity Detector (strips exam pauses cleanly across quiet & loud recordings)
function detectSpeechSegments(samples, sampleRate = 16000) {
  const frameSamples = Math.floor(sampleRate * 0.05); // 50ms frames
  const totalFrames = Math.floor(samples.length / frameSamples);
  if (totalFrames === 0) return [];

  const rms = new Float32Array(totalFrames);
  const sampleStride = Math.max(1, Math.floor(totalFrames / 600));
  const noiseSamples = [];

  for (let f = 0; f < totalFrames; f++) {
    let sum = 0;
    const offset = f * frameSamples;
    for (let i = 0; i < frameSamples; i++) {
      const v = samples[offset + i];
      sum += v * v;
    }
    const val = Math.sqrt(sum / frameSamples);
    rms[f] = val;
    if (f % sampleStride === 0) noiseSamples.push(val);
  }

  noiseSamples.sort((a, b) => a - b);
  const p15 = noiseSamples[Math.floor(noiseSamples.length * 0.15)] || 0;
  const p90 = noiseSamples[Math.floor(noiseSamples.length * 0.9)] || 0.05;
  const threshold = Math.max(0.008, Math.min(0.028, Math.max(p15 * 2.8, p90 * 0.14)));

  const minSilenceFrames = 12; // 0.6s silence splits a segment
  const maxSegmentSec = 14;
  const rawSegments = [];
  let inSpeech = false;
  let segStart = 0;
  let silenceCount = 0;

  for (let f = 0; f < totalFrames; f++) {
    if (rms[f] >= threshold) {
      if (!inSpeech) {
        inSpeech = true;
        segStart = Math.max(0, f - 2);
      }
      silenceCount = 0;
      const curDur = (f - segStart) * 0.05;
      if (curDur >= maxSegmentSec && rms[f] < threshold * 2.2) {
        rawSegments.push([segStart * 0.05, (f + 1) * 0.05]);
        inSpeech = false;
        silenceCount = 0;
      }
    } else if (inSpeech) {
      silenceCount++;
      if (silenceCount >= minSilenceFrames) {
        const endFrame = f - silenceCount + 3;
        if ((endFrame - segStart) * 0.05 >= 0.7) {
          rawSegments.push([segStart * 0.05, endFrame * 0.05]);
        }
        inSpeech = false;
        silenceCount = 0;
      }
    }
  }
  if (inSpeech && (totalFrames - segStart) * 0.05 >= 0.7) {
    rawSegments.push([segStart * 0.05, totalFrames * 0.05]);
  }
  return rawSegments;
}

async function getWhisperTranscriber(onStatus) {
  if (!whisperPipelinePromise) {
    whisperPipelinePromise = (async () => {
      if (onStatus) onStatus({ phase: 'loading-model', message: 'Loading Whisper AI subtitle engine...' });
      const { pipeline, env } = await import(
        /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0'
      );
      env.allowLocalModels = false;
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        dtype: 'q8',
        device: 'wasm'
      });
    })().catch((err) => {
      whisperPipelinePromise = null;
      throw err;
    });
  }
  return whisperPipelinePromise;
}

function inferWhisperLanguage(subject) {
  const s = String(subject || '').toLowerCase();
  if (s.includes('chinese') || s.includes('mandarin')) return 'chinese';
  if (s.includes('arabic')) return 'arabic';
  if (s.includes('urdu')) return 'urdu';
  if (s.includes('malay')) return 'malay';
  if (s.includes('tamil')) return 'tamil';
  if (s.includes('sinhala')) return 'sinhala';
  if (s.includes('bengali') || s.includes('bangla')) return 'bengali';
  if (s.includes('hindi')) return 'hindi';
  if (s.includes('gujarati')) return 'gujarati';
  if (s.includes('turkish')) return 'turkish';
  if (s.includes('greek')) return 'greek';
  if (s.includes('swahili')) return 'swahili';
  if (s.includes('german')) return 'german';
  if (s.includes('spanish')) return 'spanish';
  if (s.includes('french')) return 'french';
  return 'english';
}

export async function generateLiveWhisperSubtitles({
  audioUrl,
  subject = 'French',
  spec = 'IAL',
  trackIndex = 0,
  getCurrentTime,
  onProgress,
  shouldCancel,
  signal
}) {
  const lang = inferWhisperLanguage(subject);
  if (onProgress) {
    onProgress({ phase: 'decoding', percent: 5, segments: [], message: 'Decoding audio stream for speech detection...' });
  }

  const res = await fetch(audioUrl, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`);
  const arrayBuf = await res.arrayBuffer();
  if (signal?.aborted || shouldCancel?.()) return null;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx({ sampleRate: 16000 });
  let decoded;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuf);
  } finally {
    try {
      await audioCtx.close();
    } catch {
      // Ignore close error
    }
  }
  if (shouldCancel?.()) return null;

  let float32 = decoded.getChannelData(0);
  if (decoded.sampleRate && decoded.sampleRate !== 16000) {
    const targetLen = Math.max(1, Math.ceil(decoded.duration * 16000));
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (typeof OfflineCtx === 'function') {
      try {
        const offline = new OfflineCtx(1, targetLen, 16000);
        const src = offline.createBufferSource();
        src.buffer = decoded;
        src.connect(offline.destination);
        src.start(0);
        const rendered = await offline.startRendering();
        float32 = rendered.getChannelData(0);
      } catch {
        const ratio = decoded.sampleRate / 16000;
        const resampled = new Float32Array(targetLen);
        for (let i = 0; i < targetLen; i++) {
          const srcIdx = i * ratio;
          const lo = Math.floor(srcIdx);
          const hi = Math.min(float32.length - 1, lo + 1);
          const frac = srcIdx - lo;
          resampled[i] = float32[lo] * (1 - frac) + float32[hi] * frac;
        }
        float32 = resampled;
      }
    } else {
      const ratio = decoded.sampleRate / 16000;
      const resampled = new Float32Array(targetLen);
      for (let i = 0; i < targetLen; i++) {
        const srcIdx = i * ratio;
        const lo = Math.floor(srcIdx);
        const hi = Math.min(float32.length - 1, lo + 1);
        const frac = srcIdx - lo;
        resampled[i] = float32[lo] * (1 - frac) + float32[hi] * frac;
      }
      float32 = resampled;
    }
  }
  if (shouldCancel?.()) return null;

  const speechIntervals = detectSpeechSegments(float32, 16000);
  if (speechIntervals.length === 0) {
    return {
      duration: Number(decoded.duration.toFixed(1)),
      source: 'whisper-ai',
      language: lang,
      perTrack: true,
      segments: []
    };
  }

  const transcriber = await getWhisperTranscriber((st) => {
    if (onProgress) onProgress({ ...st, percent: 12, segments: [] });
  });
  if (shouldCancel?.()) return null;

  const completedByIdx = new Map();
  const total = speechIntervals.length;

  // Transcribe starting from the segment closest to the user's current playback time so live captions appear immediately
  while (completedByIdx.size < total) {
    if (shouldCancel?.()) return null;
    const nowSec = typeof getCurrentTime === 'function' ? Number(getCurrentTime()) || 0 : 0;

    let nextIdx = -1;
    for (let i = 0; i < total; i++) {
      if (!completedByIdx.has(i) && speechIntervals[i][1] >= nowSec - 1) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx === -1) {
      for (let i = 0; i < total; i++) {
        if (!completedByIdx.has(i)) {
          nextIdx = i;
          break;
        }
      }
    }
    if (nextIdx === -1) break;

    const [startSec, endSec] = speechIntervals[nextIdx];
    const slice = float32.subarray(Math.floor(startSec * 16000), Math.ceil(endSec * 16000));
    const isIalEnglishIntro =
      spec === 'IAL' &&
      lang !== 'english' &&
      (trackIndex === 0 || trackIndex === null) &&
      startSec < 20.5;

    const out = await transcriber(slice, {
      language: isIalEnglishIntro ? 'english' : lang,
      task: 'transcribe',
      no_repeat_ngram_size: 3
    });
    if (shouldCancel?.()) return null;

    const text = String(out?.text || '').trim();
    completedByIdx.set(
      nextIdx,
      text
        ? {
            start: Number(startSec.toFixed(1)),
            end: Number(endSec.toFixed(1)),
            text
          }
        : null
    );

    const orderedSegments = Array.from(completedByIdx.entries())
      .filter(([, seg]) => Boolean(seg))
      .sort((a, b) => a[0] - b[0])
      .map(([, seg]) => seg);

    const pct = Math.min(99, Math.round((completedByIdx.size / total) * 100));
    if (onProgress) {
      onProgress({
        phase: 'transcribing',
        percent: pct,
        completedCount: completedByIdx.size,
        totalCount: total,
        segments: orderedSegments,
        message: `Generating AI subtitles (${completedByIdx.size}/${total} segments)...`
      });
    }
  }

  const finalSegments = Array.from(completedByIdx.entries())
    .filter(([, seg]) => Boolean(seg))
    .sort((a, b) => a[0] - b[0])
    .map(([, seg]) => seg);

  return {
    duration: Number(decoded.duration.toFixed(1)),
    source: 'whisper-ai',
    language: lang,
    perTrack: true,
    generatedAt: new Date().toISOString(),
    segments: finalSegments
  };
}

export function formatSubtitleTimestamp(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}
