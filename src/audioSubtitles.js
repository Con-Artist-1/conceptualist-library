// Client-side Audio Subtitles Engine:
// 1. Instant 0ms lookup from static /audio-subtitles.json (official Transcript PDFs + pre-generated Whisper tracks)
// 2. Shared Cloud Cache lookup & persistence via /api/views?subtitles=... (MongoDB Atlas audio_subtitles collection)
// 3. Automatic VAD + Whisper AI live transcription fallback (streams segments faster than real-time & caches to cloud)

const LOCAL_SUBTITLE_CACHE_PREFIX = 'cs_audio_sub_v1_';
let staticSubtitlesPromise = null;
let staticSubtitlesData = null;
let whisperPipelinePromise = null;

export async function loadStaticSubtitlesIndex() {
  if (staticSubtitlesData) return staticSubtitlesData;
  if (!staticSubtitlesPromise) {
    staticSubtitlesPromise = fetch('/audio-subtitles.json')
      .then((res) => (res.ok ? res.json() : { tracks: {} }))
      .then((json) => {
        staticSubtitlesData = json && typeof json.tracks === 'object' ? json : { tracks: {} };
        return staticSubtitlesData;
      })
      .catch(() => {
        staticSubtitlesData = { tracks: {} };
        return staticSubtitlesData;
      });
  }
  return staticSubtitlesPromise;
}

export function buildCandidateSubtitleKeys({
  sittingKey,
  audioPath,
  altPaths,
  trackFileName,
  trackIndex,
  spec,
  subject,
  session,
  unitHint
}) {
  const keys = [];
  const cleanSitting = String(sittingKey || '').trim();
  const cleanPath = String(audioPath || '').replace(/\\/g, '/').trim();
  const cleanTrackName = String(trackFileName || '').trim();
  const cleanAlts = Array.isArray(altPaths)
    ? altPaths.map((p) => String(p || '').replace(/\\/g, '/').trim()).filter(Boolean)
    : [];

  if (cleanSitting && Number.isInteger(trackIndex) && trackIndex >= 0) {
    keys.push(`${cleanSitting}#track-${trackIndex + 1}`);
  }
  if (cleanPath && cleanTrackName) {
    keys.push(`${cleanPath}#${cleanTrackName}`);
  }
  for (const alt of cleanAlts) {
    if (cleanTrackName) keys.push(`${alt}#${cleanTrackName}`);
  }
  if (cleanSitting) {
    keys.push(cleanSitting);
  }
  if (unitHint && subject && session) {
    const prefixMap = { French: 'WFR', German: 'WGN', Spanish: 'WSP' };
    const prefix = prefixMap[subject];
    const unitNum = unitHint === 'U2' ? '02' : unitHint === 'U4' ? '04' : '';
    if (prefix && unitNum) {
      const derivedSitting = `${spec || 'IAL'}|${subject}|${prefix}${unitNum}||${session}`;
      if (Number.isInteger(trackIndex) && trackIndex >= 0) {
        keys.push(`${derivedSitting}#track-${trackIndex + 1}`);
      }
      keys.push(derivedSitting);
    }
  }
  if (cleanPath) {
    keys.push(cleanPath);
  }
  for (const alt of cleanAlts) {
    keys.push(alt);
  }
  return Array.from(new Set(keys));
}

export function adaptSubtitleEntryForTrack(entry, { isMultiTrack = false, trackIndex = 0 } = {}) {
  if (!entry || !Array.isArray(entry.segments) || entry.segments.length === 0) return entry;
  // If this entry is already for a specific track, return as-is
  if (
    entry.source === 'whisper-ai' ||
    typeof entry.trackIndex === 'number' ||
    String(entry.resolvedKey || '').includes('#')
  ) {
    return entry;
  }
  if (!isMultiTrack) return entry;

  // Group official full-exam transcript segments by Passage number (Passage 1, Passage 2, etc.)
  const groups = [];
  let currentGroup = [];
  for (const seg of entry.segments) {
    const isNewPassage = /^Passage\s+\d+\b/i.test(String(seg.text || '').trim());
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
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function writeLocalSubtitleCache(key, entry) {
  if (!key || !entry || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_SUBTITLE_CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore quota errors
  }
}

export async function resolveExistingSubtitles(candidateKeys) {
  if (!Array.isArray(candidateKeys) || candidateKeys.length === 0) return null;

  // 1. Check static /audio-subtitles.json first (0ms after initial load)
  const staticDb = await loadStaticSubtitlesIndex();
  for (const key of candidateKeys) {
    const hit = staticDb?.tracks?.[key];
    if (hit && Array.isArray(hit.segments) && hit.segments.length > 0) {
      return { ...hit, resolvedKey: key, tier: 'static' };
    }
  }

  // 2. Check localStorage cache
  for (const key of candidateKeys) {
    const localHit = readLocalSubtitleCache(key);
    if (localHit) {
      return { ...localHit, resolvedKey: key, tier: 'local' };
    }
  }

  // 3. Check shared MongoDB Atlas cache via /api/views?subtitles=<primaryKey>
  const primaryKey = candidateKeys[0];
  try {
    const res = await fetch(`/api/views?subtitles=${encodeURIComponent(primaryKey)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.subtitle && Array.isArray(data.subtitle.segments) && data.subtitle.segments.length > 0) {
        writeLocalSubtitleCache(primaryKey, data.subtitle);
        if (staticSubtitlesData?.tracks) {
          staticSubtitlesData.tracks[primaryKey] = data.subtitle;
        }
        return { ...data.subtitle, resolvedKey: primaryKey, tier: 'cloud' };
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
  writeLocalSubtitleCache(primaryKey, subtitleEntry);
  if (staticSubtitlesData?.tracks) {
    staticSubtitlesData.tracks[primaryKey] = subtitleEntry;
    for (const k of aliasKeys || []) {
      staticSubtitlesData.tracks[k] = subtitleEntry;
    }
  }
  try {
    await fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_subtitles',
        trackKey: primaryKey,
        aliasKeys: Array.isArray(aliasKeys) ? aliasKeys.slice(0, 4) : [],
        subtitle: subtitleEntry
      })
    });
  } catch {
    // Non-fatal if offline
  }
}

// Fast RMS Voice Activity Detector (strips 10-15s exam pauses so Whisper never loops or hallucinates)
export function detectSpeechSegments(samples, sampleRate = 16000) {
  const frameSamples = Math.floor(sampleRate * 0.05); // 50ms frames
  const totalFrames = Math.floor(samples.length / frameSamples);
  const rms = new Float32Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    let sum = 0;
    const offset = f * frameSamples;
    for (let i = 0; i < frameSamples; i++) {
      const v = samples[offset + i];
      sum += v * v;
    }
    rms[f] = Math.sqrt(sum / frameSamples);
  }

  const threshold = 0.012;
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
        if ((endFrame - segStart) * 0.05 >= 0.8) {
          rawSegments.push([segStart * 0.05, endFrame * 0.05]);
        }
        inSpeech = false;
        silenceCount = 0;
      }
    }
  }
  if (inSpeech && (totalFrames - segStart) * 0.05 >= 0.8) {
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

export function inferWhisperLanguage(subject) {
  const s = String(subject || '').toLowerCase();
  if (s.includes('chinese')) return 'chinese';
  if (s.includes('swahili')) return 'swahili';
  if (s.includes('german')) return 'german';
  if (s.includes('spanish')) return 'spanish';
  if (s.includes('english') || s.includes('esl')) return 'english';
  return 'french';
}

export async function generateLiveWhisperSubtitles({
  audioUrl,
  subject = 'French',
  trackIndex = 0,
  getCurrentTime,
  onProgress,
  shouldCancel
}) {
  const lang = inferWhisperLanguage(subject);
  if (onProgress) {
    onProgress({ phase: 'decoding', percent: 5, segments: [], message: 'Decoding audio stream for speech detection...' });
  }

  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`);
  const arrayBuf = await res.arrayBuffer();
  if (shouldCancel?.()) return null;

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

  const float32 = decoded.getChannelData(0);
  const speechIntervals = detectSpeechSegments(float32, 16000);
  if (speechIntervals.length === 0) {
    return {
      duration: Number(decoded.duration.toFixed(1)),
      source: 'whisper-ai',
      language: lang,
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

    // Pick the first untranscribed segment at or after nowSec, or else the earliest untranscribed segment
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
    const isEnglishIntro = trackIndex === 0 && startSec < 20.5;

    const out = await transcriber(slice, {
      language: isEnglishIntro ? 'english' : lang,
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
