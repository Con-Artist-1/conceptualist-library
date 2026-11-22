import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { extractZipAudioTracks } from '../zipAudioExtractor.js';
import {
  buildCandidateSubtitleKeys,
  adaptSubtitleEntryForTrack,
  resolveExistingSubtitles,
  saveSubtitlesToCloud,
  generateLiveWhisperSubtitles,
  formatSubtitleTimestamp
} from '../audioSubtitles.js';
import { formatBytes, getHfUrl, getDownloadUrl, getPaperViewKey } from '../lib/libraryHelpers.js';

function CcIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
      <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
    </svg>
  );
}

/**
 * Lazy-loaded in-browser listening audio player, multi-track ZIP unpacker,
 * and 3-tier synchronized subtitles + full transcript drawer.
 * Supports both 'dock' (paired above QP / Split View) and 'card' (standalone audio view).
 */
export default function AudioPlayerDock({
  mode = 'dock',
  file,
  currentDoc,
  audSib,
  audZipSib,
  audSingleSib,
  singleTitle = '',
  singleUrl = '',
  downloadUrl = '',
  singleExt = 'mp3',
  isSingleAudioZip = false,
  isSingleAudio = false,
  onCloseDock
}) {
  const [zipTracks, setZipTracks] = useState([]);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState(null);
  const [zipProgress, setZipProgress] = useState(null);
  const [selectedTrackIdx, setSelectedTrackIdx] = useState(0);
  const [useFullSingleAudio, setUseFullSingleAudio] = useState(false);

  const activeZipDoc = mode === 'card'
    ? (isSingleAudioZip ? currentDoc : null)
    : (audZipSib || null);
  const activeZipUrl = activeZipDoc ? getHfUrl(activeZipDoc.path) : '';
  const effectiveUnitCode = file?.unitCode || currentDoc?.unitCode || '';

  useEffect(() => {
    if (!activeZipUrl) {
      setZipTracks([]);
      setZipLoading(false);
      setZipError(null);
      setZipProgress(null);
      return undefined;
    }

    let cancelled = false;
    setZipLoading(true);
    setZipError(null);
    setZipProgress({ phase: 'downloading', percent: 0 });

    extractZipAudioTracks(activeZipUrl, (status) => {
      if (!cancelled) setZipProgress(status);
    })
      .then((tracks) => {
        if (cancelled) return;
        setZipTracks(tracks);
        let initialIdx = 0;
        const hasU2 = tracks.some((t) => t.unitHint === 'U2');
        const hasU4 = tracks.some((t) => t.unitHint === 'U4');
        if (hasU2 && hasU4) {
          if (effectiveUnitCode.endsWith('2')) {
            const idx2 = tracks.findIndex((t) => t.unitHint === 'U2');
            if (idx2 !== -1) initialIdx = idx2;
          } else if (effectiveUnitCode.endsWith('4')) {
            const idx4 = tracks.findIndex((t) => t.unitHint === 'U4');
            if (idx4 !== -1) initialIdx = idx4;
          }
        }
        setSelectedTrackIdx(initialIdx);
        setUseFullSingleAudio(false);
        setZipLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setZipError(err?.message || 'Failed to unpack audio archive');
        setZipLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeZipUrl, effectiveUnitCode]);

  const safeTrackIdx = zipTracks.length > 0 ? Math.min(selectedTrackIdx, zipTracks.length - 1) : 0;
  const activeZipTrack = zipTracks[safeTrackIdx] || null;

  const audioPlayerRef = useRef(null);
  const audioCurrentTimeRef = useRef(0);
  const transcriptListRef = useRef(null);
  const prevTranscriptExpandedRef = useRef(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleEntry, setSubtitleEntry] = useState(null);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleProgress, setSubtitleProgress] = useState(null);
  const [subtitleError, setSubtitleError] = useState(null);
  const [subtitleUncached, setSubtitleUncached] = useState(false);
  const [whisperApprovedIdentity, setWhisperApprovedIdentity] = useState('');
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [whisperRetryCount, setWhisperRetryCount] = useState(0);

  const activeAudioContext = useMemo(() => {
    if (!file) return null;
    const sittingKey = getPaperViewKey(file);
    const subject = file.subject || currentDoc?.subject || 'French';
    const spec = file.spec || currentDoc?.spec || 'IAL';
    const session = file.session || currentDoc?.session || '';

    if (mode === 'card') {
      if (isSingleAudioZip) {
        if (!activeZipTrack?.blobUrl) return null;
        return {
          mode: 'card',
          audioUrl: activeZipTrack.blobUrl,
          audioPath: currentDoc.path || '',
          altPaths: currentDoc.altPaths || file.altPaths || [],
          sittingKey,
          trackIndex: zipTracks.length > 1 ? safeTrackIdx : 0,
          isMultiTrack: zipTracks.length > 1,
          trackFileName: activeZipTrack.fileName || '',
          unitHint: activeZipTrack.unitHint || '',
          subject,
          spec,
          session
        };
      }
      if (isSingleAudio && currentDoc?.path) {
        return {
          mode: 'card',
          audioUrl: getHfUrl(currentDoc.path),
          audioPath: currentDoc.path || '',
          altPaths: currentDoc.altPaths || file.altPaths || [],
          sittingKey,
          trackIndex: null,
          isMultiTrack: false,
          trackFileName: currentDoc.name || '',
          unitHint: '',
          subject,
          spec,
          session
        };
      }
      return null;
    }

    if (audSib) {
      if (!useFullSingleAudio && activeZipTrack?.blobUrl) {
        const zipTarget = audZipSib || audSib;
        return {
          mode: 'dock',
          audioUrl: activeZipTrack.blobUrl,
          audioPath: zipTarget.path || '',
          altPaths: zipTarget.altPaths || audSib.altPaths || file.altPaths || [],
          sittingKey,
          trackIndex: zipTracks.length > 1 ? safeTrackIdx : 0,
          isMultiTrack: zipTracks.length > 1,
          trackFileName: activeZipTrack.fileName || '',
          unitHint: activeZipTrack.unitHint || '',
          subject,
          spec,
          session
        };
      }
      const singleTarget = audSingleSib || (!audZipSib ? audSib : null);
      if (singleTarget?.path) {
        return {
          mode: 'dock',
          audioUrl: getHfUrl(singleTarget.path),
          audioPath: singleTarget.path || '',
          altPaths: singleTarget.altPaths || audSib.altPaths || file.altPaths || [],
          sittingKey,
          trackIndex: null,
          isMultiTrack: false,
          trackFileName: singleTarget.name || '',
          unitHint: '',
          subject,
          spec,
          session
        };
      }
    }

    return null;
  }, [
    mode,
    file,
    currentDoc,
    isSingleAudioZip,
    isSingleAudio,
    activeZipTrack,
    zipTracks.length,
    safeTrackIdx,
    audSib,
    audZipSib,
    audSingleSib,
    useFullSingleAudio
  ]);

  const activeAudioIdentity = activeAudioContext
    ? `${activeAudioContext.audioPath}::${activeAudioContext.trackFileName}::${activeAudioContext.trackIndex ?? 'full'}`
    : '';

  useEffect(() => {
    audioCurrentTimeRef.current = 0;
    setAudioCurrentTime(0);
    setSubtitleEntry(null);
    setSubtitleLoading(false);
    setSubtitleProgress(null);
    setSubtitleError(null);
    setSubtitleUncached(false);
  }, [activeAudioIdentity]);

  useEffect(() => {
    if (!activeAudioContext || !subtitlesEnabled) {
      setSubtitleLoading(false);
      setSubtitleProgress(null);
      setSubtitleUncached(false);
      return undefined;
    }

    let cancelled = false;
    const candidateKeys = buildCandidateSubtitleKeys(activeAudioContext);

    setSubtitleLoading(true);
    setSubtitleError(null);
    setSubtitleUncached(false);

    resolveExistingSubtitles(candidateKeys)
      .then(async (existing) => {
        if (cancelled) return;
        if (existing && Array.isArray(existing.segments) && existing.segments.length > 0) {
          const adapted = adaptSubtitleEntryForTrack(existing, {
            isMultiTrack: activeAudioContext.isMultiTrack,
            trackIndex: activeAudioContext.trackIndex || 0
          });
          setSubtitleEntry(adapted);
          setSubtitleLoading(false);
          setSubtitleProgress(null);
          setSubtitleUncached(false);
          return;
        }

        if (whisperApprovedIdentity !== activeAudioIdentity) {
          setSubtitleLoading(false);
          setSubtitleProgress(null);
          setSubtitleUncached(true);
          return;
        }

        // Tier 3 Fallback: Live VAD + Whisper AI transcription for un-indexed or newly added audio
        const generated = await generateLiveWhisperSubtitles({
          audioUrl: activeAudioContext.audioUrl,
          subject: activeAudioContext.subject,
          trackIndex: activeAudioContext.trackIndex || 0,
          getCurrentTime: () => audioCurrentTimeRef.current,
          shouldCancel: () => cancelled,
          onProgress: (st) => {
            if (cancelled) return;
            setSubtitleProgress(st);
            if (Array.isArray(st.segments) && st.segments.length > 0) {
              setSubtitleEntry({
                source: 'whisper-ai',
                tier: 'live',
                language: activeAudioContext.subject.toLowerCase(),
                segments: st.segments
              });
            }
          }
        });

        if (cancelled || !generated) return;
        setSubtitleEntry({ ...generated, tier: 'live' });
        setSubtitleLoading(false);
        setSubtitleProgress(null);
        setSubtitleUncached(false);
        if (candidateKeys.length > 0 && generated.segments?.length > 0) {
          saveSubtitlesToCloud(candidateKeys[0], candidateKeys.slice(1), generated);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setSubtitleError(err?.message || 'Unable to load subtitles');
        setSubtitleLoading(false);
        setSubtitleProgress(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAudioIdentity, activeAudioContext, subtitlesEnabled, whisperApprovedIdentity, whisperRetryCount]);

  const subtitleSegments = useMemo(() => subtitleEntry?.segments || [], [subtitleEntry]);

  const activeSubtitleIdx = useMemo(() => {
    if (!subtitleSegments.length) return -1;
    const t = audioCurrentTime;
    let active = 0;
    for (let i = 0; i < subtitleSegments.length; i++) {
      if (subtitleSegments[i].start - 0.18 <= t) {
        active = i;
      }
    }
    return active;
  }, [subtitleSegments, audioCurrentTime]);

  const activeSubtitleSeg = activeSubtitleIdx >= 0 ? subtitleSegments[activeSubtitleIdx] : null;
  const nextSubtitleSeg =
    activeSubtitleIdx >= 0 && activeSubtitleIdx + 1 < subtitleSegments.length
      ? subtitleSegments[activeSubtitleIdx + 1]
      : null;

  useEffect(() => {
    if (!subtitlesEnabled || !transcriptExpanded || !transcriptListRef.current) {
      prevTranscriptExpandedRef.current = false;
      return;
    }
    const justOpened = !prevTranscriptExpandedRef.current;
    prevTranscriptExpandedRef.current = true;
    if (activeSubtitleIdx < 0) return;

    const container = transcriptListRef.current;
    const activeBtn = container.querySelector(`[data-seg-idx="${activeSubtitleIdx}"]`);
    if (activeBtn) {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeBtn.getBoundingClientRect();
      const relTop = activeRect.top - containerRect.top + container.scrollTop;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      const desiredTop = relTop - container.clientHeight / 2 + activeRect.height / 2;
      const targetTop = Math.min(maxScroll, Math.max(0, desiredTop));
      container.scrollTo({
        top: targetTop,
        behavior: justOpened ? 'auto' : 'smooth'
      });
    }
  }, [activeSubtitleIdx, transcriptExpanded, subtitlesEnabled, subtitleSegments]);

  const handleAudioTimeUpdate = useCallback((e) => {
    const t = e.currentTarget?.currentTime || 0;
    audioCurrentTimeRef.current = t;
    setAudioCurrentTime(t);
  }, []);

  const handleSeekToSubtitle = useCallback((startSec) => {
    const targetSec = Math.max(0, Number(startSec) || 0);
    audioCurrentTimeRef.current = targetSec;
    setAudioCurrentTime(targetSec);
    const el = audioPlayerRef.current;
    if (el) {
      try {
        el.currentTime = targetSec;
        if (el.paused) {
          el.play().catch(() => {});
        }
      } catch {
        // Ignore seek errors before metadata is ready
      }
    }
  }, []);

  const handleAudioEnded = useCallback(() => {
    if (useFullSingleAudio || zipTracks.length <= 1) return;
    setSelectedTrackIdx((prev) => {
      if (prev >= zipTracks.length - 1) return prev;
      const curr = zipTracks[prev];
      const next = zipTracks[prev + 1];
      if (curr?.unitHint && next?.unitHint && curr.unitHint !== next.unitHint) {
        return prev;
      }
      return prev + 1;
    });
  }, [useFullSingleAudio, zipTracks]);

  const renderCcButton = (labelText) => (
    <button
      type="button"
      className={`modal-audio-cc-btn ${subtitlesEnabled ? 'active' : ''}`}
      onClick={() => setSubtitlesEnabled((prev) => !prev)}
      aria-pressed={subtitlesEnabled}
      title={subtitlesEnabled ? 'Hide synchronized subtitles (CC)' : 'Show synchronized subtitles (CC)'}
    >
      <CcIcon />
      <span>{labelText}</span>
    </button>
  );

  const renderSubtitleBar = (variant) => {
    if (!subtitlesEnabled || !activeAudioContext) return null;
    const isOfficial = subtitleEntry?.source === 'official-transcript-pdf';
    const sourceBadgeText = isOfficial
      ? 'Transcript PDF'
      : subtitleEntry?.tier === 'static' || subtitleEntry?.tier === 'cloud'
      ? 'Synchronized Subtitles'
      : subtitleUncached && subtitleSegments.length === 0
      ? 'On-Demand AI Subtitles'
      : 'Live AI Subtitles';

    return (
      <div
        className={`modal-subtitle-bar ${variant === 'card' ? 'card-variant' : 'dock-variant'}`}
        role="region"
        aria-label="Synchronized Audio Subtitles"
      >
        <div className="modal-subtitle-top-row">
          <div className="modal-subtitle-meta">
            <span className="modal-subtitle-cc-pill">CC</span>
            <span className="modal-subtitle-source">{sourceBadgeText}</span>
            {subtitleSegments.length > 0 && (
              <span className="modal-subtitle-count">
                {subtitleSegments.length} {subtitleSegments.length === 1 ? 'segment' : 'segments'}
              </span>
            )}
            {subtitleLoading && subtitleProgress && (
              <span className="modal-subtitle-progress-tag" role="status" aria-live="polite">
                {subtitleProgress.message || `Transcribing (${subtitleProgress.percent || 0}%)...`}
              </span>
            )}
          </div>

          <div className="modal-subtitle-controls">
            {subtitleSegments.length > 0 && (
              <button
                type="button"
                className={`modal-subtitle-drawer-btn ${transcriptExpanded ? 'active' : ''}`}
                onClick={() => setTranscriptExpanded((prev) => !prev)}
                aria-expanded={transcriptExpanded}
                title={transcriptExpanded ? 'Hide full interactive transcript' : 'View full interactive transcript & click any line to seek'}
              >
                <span>{transcriptExpanded ? 'Hide Transcript' : 'Full Transcript'}</span>
              </button>
            )}
            <button
              type="button"
              className="modal-subtitle-hide-btn"
              onClick={() => setSubtitlesEnabled(false)}
              title="Hide Subtitles (CC)"
            >
              Hide CC
            </button>
          </div>
        </div>

        {subtitleLoading && subtitleSegments.length === 0 ? (
          <div className="modal-subtitle-loading-row" role="status" aria-live="polite">
            <span className="pdf-skeleton-spinner" />
            <span>
              {subtitleProgress?.message || 'Loading synchronized subtitles for this audio track...'}
            </span>
          </div>
        ) : subtitleError && subtitleSegments.length === 0 ? (
          <div className="modal-subtitle-error-row" role="alert">
            <span>Subtitles unavailable ({subtitleError}).</span>
            <button
              type="button"
              className="modal-subtitle-retry-btn"
              onClick={() => {
                setWhisperApprovedIdentity(activeAudioIdentity);
                setWhisperRetryCount((c) => c + 1);
              }}
            >
              Retry AI Subtitles
            </button>
          </div>
        ) : subtitleUncached && subtitleSegments.length === 0 ? (
          <div className="modal-subtitle-uncached-row">
            <span className="modal-subtitle-uncached-text">
              Not pre-indexed yet. Generate synchronized AI captions in your browser &mdash; streams live and saves for everyone.
            </span>
            <button
              type="button"
              className="modal-subtitle-generate-btn"
              onClick={() => setWhisperApprovedIdentity(activeAudioIdentity)}
            >
              Generate AI Subtitles
            </button>
          </div>
        ) : activeSubtitleSeg ? (
          <div className="modal-subtitle-live-stage">
            <button
              type="button"
              className="modal-subtitle-active-line"
              onClick={() => handleSeekToSubtitle(activeSubtitleSeg.start)}
              title={`Click to replay from ${formatSubtitleTimestamp(activeSubtitleSeg.start)}`}
            >
              <span className="modal-subtitle-time-badge">
                {formatSubtitleTimestamp(activeSubtitleSeg.start)}
              </span>
              <span className="modal-subtitle-active-text">{activeSubtitleSeg.text}</span>
            </button>
            {nextSubtitleSeg && (
              <button
                type="button"
                className="modal-subtitle-next-line"
                onClick={() => handleSeekToSubtitle(nextSubtitleSeg.start)}
                title={`Click to skip to ${formatSubtitleTimestamp(nextSubtitleSeg.start)}`}
              >
                <span className="modal-subtitle-next-label">
                  Next ({formatSubtitleTimestamp(nextSubtitleSeg.start)}):
                </span>
                <span className="modal-subtitle-next-text">{nextSubtitleSeg.text}</span>
              </button>
            )}
          </div>
        ) : null}

        {transcriptExpanded && subtitleSegments.length > 0 && (
          <div
            ref={transcriptListRef}
            className="modal-subtitle-drawer"
            role="list"
            aria-label="Full timestamped transcript"
          >
            {subtitleSegments.map((seg, idx) => (
              <button
                key={`${seg.start}-${idx}`}
                type="button"
                role="listitem"
                data-seg-idx={idx}
                className={`modal-subtitle-seg-btn ${idx === activeSubtitleIdx ? 'active' : ''}`}
                onClick={() => handleSeekToSubtitle(seg.start)}
                title={`Jump audio to ${formatSubtitleTimestamp(seg.start)}`}
              >
                <span className="modal-subtitle-seg-time">
                  {formatSubtitleTimestamp(seg.start)}
                </span>
                <span className="modal-subtitle-seg-text">{seg.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (mode === 'dock') {
    if (!audSib) return null;
    return (
      <div className="modal-audio-dock" role="region" aria-label="Listening Audio Player">
        <div className="modal-audio-dock-info">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          <span
            className="modal-audio-dock-label"
            title={
              !useFullSingleAudio && activeZipTrack
                ? `${activeZipTrack.title} (${audZipSib?.name || audSib.name})`
                : audSib.name || audSib.path
            }
          >
            {!useFullSingleAudio && activeZipTrack
              ? activeZipTrack.title
              : audSib.name || 'Listening Audio Track'}
          </span>
        </div>

        {zipTracks.length > 0 && (zipTracks.length > 1 || audSingleSib) && (
          <div className="modal-audio-dock-tracks" role="group" aria-label="Select audio track">
            {zipTracks.map((track, idx) => (
              <button
                key={track.id}
                type="button"
                className={`modal-audio-track-pill ${!useFullSingleAudio && safeTrackIdx === idx ? 'active' : ''}`}
                onClick={() => {
                  setUseFullSingleAudio(false);
                  setSelectedTrackIdx(idx);
                }}
                title={`${track.title} (${formatBytes(track.size)})`}
              >
                {track.shortLabel}
              </button>
            ))}
            {audSingleSib && (
              <button
                type="button"
                className={`modal-audio-track-pill ${useFullSingleAudio ? 'active' : ''}`}
                onClick={() => setUseFullSingleAudio(true)}
                title={`Play full combined audio (${audSingleSib.name})`}
              >
                Full Audio
              </button>
            )}
          </div>
        )}

        {zipLoading && !useFullSingleAudio && !activeZipTrack ? (
          <div className="modal-audio-dock-status" role="status" aria-live="polite">
            <span className="pdf-skeleton-spinner" />
            <span className="modal-audio-dock-status-text">
              {zipProgress?.phase === 'unpacking'
                ? `Unpacking ${zipProgress.entryName || 'track'} (${zipProgress.currentTrack}/${zipProgress.totalTracks})...`
                : `Streaming & unpacking ZIP audio in browser${zipProgress?.percent ? ` (${zipProgress.percent}%)` : '...'}`}
            </span>
          </div>
        ) : zipError && !useFullSingleAudio && !audSingleSib ? (
          <div className="modal-audio-dock-status error" role="alert">
            <span className="modal-audio-dock-status-text">
              Unable to unpack archive in browser ({zipError}).
            </span>
          </div>
        ) : (
          <audio
            ref={audioPlayerRef}
            controls
            autoPlay
            preload="metadata"
            className="modal-audio-dock-player"
            src={
              !useFullSingleAudio && activeZipTrack?.blobUrl
                ? activeZipTrack.blobUrl
                : getHfUrl((audSingleSib || audSib).path)
            }
            onTimeUpdate={handleAudioTimeUpdate}
            onSeeked={handleAudioTimeUpdate}
            onLoadedMetadata={handleAudioTimeUpdate}
            onEnded={handleAudioEnded}
          >
            Your browser does not support the audio element.
          </audio>
        )}

        <div className="modal-audio-dock-actions">
          {renderCcButton('Subtitles')}
          {!useFullSingleAudio && activeZipTrack?.blobUrl && (
            <a
              href={activeZipTrack.blobUrl}
              download={activeZipTrack.fileName}
              className="modal-audio-dock-download track-dl"
              title={`Download unpacked track: ${activeZipTrack.fileName} (${formatBytes(activeZipTrack.size)})`}
            >
              <span>{activeZipTrack.shortLabel} ({activeZipTrack.ext.toUpperCase()})</span>
            </a>
          )}
          {audSingleSib && (
            <a
              href={getDownloadUrl(audSingleSib.path)}
              download
              rel="noopener noreferrer"
              className="modal-audio-dock-download"
              title={`Download full audio file (${audSingleSib.name})`}
            >
              Download {(audSingleSib.ext || 'MP3').toUpperCase()}
            </a>
          )}
          {audZipSib && (
            <a
              href={getDownloadUrl(audZipSib.path)}
              download
              rel="noopener noreferrer"
              className="modal-audio-dock-download"
              title={`Download full ZIP archive (${audZipSib.name})`}
            >
              Download ZIP
            </a>
          )}
          <button
            type="button"
            className="modal-audio-dock-close"
            onClick={onCloseDock}
            aria-label="Close docked audio player"
            title="Hide Audio Bar"
          >
            ×
          </button>
        </div>

        {renderSubtitleBar('dock')}
      </div>
    );
  }

  return (
    <div className="modal-resource-card">
      <div className={`modal-resource-box ${isSingleAudioZip ? 'audio-zip-box' : ''}`}>
        <h3>{singleTitle}</h3>
        <p>{currentDoc.name || currentDoc.path}</p>
        {isSingleAudio && (
          <>
            <div className="modal-zip-audio-header">
              <span className="modal-zip-audio-badge">In-Browser Audio Player</span>
              {renderCcButton('Subtitles (CC)')}
            </div>
            <audio
              ref={audioPlayerRef}
              controls
              autoPlay
              className="modal-audio-player"
              src={singleUrl}
              onTimeUpdate={handleAudioTimeUpdate}
              onSeeked={handleAudioTimeUpdate}
              onLoadedMetadata={handleAudioTimeUpdate}
            >
              Your browser does not support the audio element.
            </audio>
            {renderSubtitleBar('card')}
          </>
        )}
        {isSingleAudioZip && (
          <div className="modal-zip-audio-section">
            {zipLoading ? (
              <div className="modal-zip-audio-loading" role="status" aria-live="polite">
                <span className="pdf-skeleton-spinner" />
                <span>
                  {zipProgress?.phase === 'unpacking'
                    ? `Unpacking ${zipProgress.entryName || 'audio track'} (${zipProgress.currentTrack}/${zipProgress.totalTracks}) in browser...`
                    : `Streaming & unpacking ZIP audio in browser${zipProgress?.percent ? ` (${zipProgress.percent}%)` : '...'}`}
                </span>
              </div>
            ) : zipError ? (
              <div className="modal-zip-audio-error" role="alert">
                Unable to unpack audio in browser ({zipError}). You can still download the ZIP archive below.
              </div>
            ) : zipTracks.length > 0 ? (
              <>
                <div className="modal-zip-audio-header">
                  <span className="modal-zip-audio-badge">
                    In-Browser Player • {zipTracks.length} {zipTracks.length === 1 ? 'Track' : 'Tracks'} Ready
                  </span>
                  <div className="modal-zip-header-right">
                    {activeZipTrack && (
                      <span className="modal-zip-active-name">
                        Playing: {activeZipTrack.fileName} ({formatBytes(activeZipTrack.size)})
                      </span>
                    )}
                    {renderCcButton('Subtitles (CC)')}
                  </div>
                </div>
                {zipTracks.length > 1 && (
                  <div className="modal-zip-track-list" role="group" aria-label="Audio tracks in archive">
                    {zipTracks.map((track, idx) => (
                      <button
                        key={track.id}
                        type="button"
                        className={`modal-zip-track-btn ${safeTrackIdx === idx ? 'active' : ''}`}
                        onClick={() => setSelectedTrackIdx(idx)}
                      >
                        <span className="modal-zip-track-title">{track.title}</span>
                        <span className="modal-zip-track-meta">
                          {formatBytes(track.size)} • {track.ext.toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {activeZipTrack?.blobUrl && (
                  <>
                    <audio
                      ref={audioPlayerRef}
                      controls
                      autoPlay
                      preload="metadata"
                      className="modal-audio-player"
                      src={activeZipTrack.blobUrl}
                      onTimeUpdate={handleAudioTimeUpdate}
                      onSeeked={handleAudioTimeUpdate}
                      onLoadedMetadata={handleAudioTimeUpdate}
                      onEnded={handleAudioEnded}
                    >
                      Your browser does not support the audio element.
                    </audio>
                    {renderSubtitleBar('card')}
                    <a
                      href={activeZipTrack.blobUrl}
                      download={activeZipTrack.fileName}
                      className="modal-track-download-btn"
                    >
                      Download Current Track — {activeZipTrack.fileName} ({formatBytes(activeZipTrack.size)})
                    </a>
                  </>
                )}
              </>
            ) : null}
          </div>
        )}
        <a
          href={downloadUrl}
          rel="noopener noreferrer"
          download
          className="modal-download-btn"
        >
          Download {singleExt.toUpperCase()} Resource ({formatBytes(currentDoc.size)})
        </a>
      </div>
    </div>
  );
}
