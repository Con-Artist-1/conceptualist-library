import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import '../styles/modal.css';
import { setActivePaperTelemetry } from '../telemetry.js';
import { extractZipAudioTracks } from '../zipAudioExtractor.js';
import { listZipPdfEntries, extractZipPdfEntry } from '../zipPdfExtractor.js';
import {
  buildCandidateSubtitleKeys,
  adaptSubtitleEntryForTrack,
  resolveExistingSubtitles,
  saveSubtitlesToCloud,
  generateLiveWhisperSubtitles,
  formatSubtitleTimestamp
} from '../audioSubtitles.js';
import {
  normalizePaperTelemetryMode,
  useIsMobile,
  getScDocumentLabel,
  formatBytes,
  getHfUrl,
  getDownloadUrl,
  getDisplayTitle,
  getUnifiedSittingTitle,
  getPaperViewKey
} from '../lib/libraryHelpers.js';
import { PaperViewsCounter } from './PaperViewsCounter.jsx';
import { PdfPaneSkeleton } from './Skeletons.jsx';

const PdfViewerPane = lazy(() => import('../PdfViewerPane.jsx'));

const PreviewModal = ({ file, initialView = '', viewsCount = 0, showViews = false, onClose, onViewModeChange, theme, onToggleTheme }) => {
  const siblings = useMemo(() => ({
    ...(file?.siblings || {}),
    ...(file?.docs || {})
  }), [file]);

  const canSplit = Boolean(siblings.QP?.ext === 'pdf' && siblings.MS?.ext === 'pdf');
  const isMobile = useIsMobile();

  const audSib = siblings.AUD;
  const audExt = audSib
    ? (audSib.ext || (audSib.path ? audSib.path.split('.').pop() : '') || '').toLowerCase()
    : '';
  const audZipSib = siblings.AUD_ZIP || (audExt === 'zip' ? audSib : null);
  const audSingleSib = siblings.AUD_SINGLE || (audExt && audExt !== 'zip' ? audSib : null);
  const isPlayableAudioSib =
    audExt === 'mp3' || audExt === 'wav' || audExt === 'm4a' || audExt === 'ogg' || audExt === 'zip';
  const hasPdfFallback = Boolean(siblings.QP?.ext === 'pdf' || siblings.MS?.ext === 'pdf');
  const canDockAudio = isPlayableAudioSib && hasPdfFallback;

  const [audioDockOpen, setAudioDockOpen] = useState(() => Boolean(initialView === 'AUD' && canDockAudio));
  const [swapSplit, setSwapSplit] = useState(false);

  // On mobile portrait, default to single QP view for maximum readable document height; on desktop, default to split view
  const [activeView, setActiveView] = useState(() => {
    if (initialView === 'AUD' && canDockAudio) {
      return !isMobile && canSplit ? 'split' : (siblings.QP ? 'QP' : siblings.MS ? 'MS' : 'QP');
    }
    if (initialView === 'split' && canSplit) return 'split';
    if (initialView && (siblings[initialView] || file?.docType === initialView)) return initialView;
    return isMobile ? (file?.docType || (siblings.QP ? 'QP' : 'split')) : (canSplit ? 'split' : (file?.docType || 'QP'));
  });

  useEffect(() => {
    if (canDockAudio && activeView === 'AUD') {
      setAudioDockOpen(true);
      const fallbackView = !isMobile && canSplit ? 'split' : (siblings.QP ? 'QP' : 'MS');
      setActiveView(fallbackView);
    }
  }, [canDockAudio, activeView, isMobile, canSplit, siblings.QP]);

  const handleSelectView = useCallback((nextView) => {
    if (nextView === 'AUD' && canDockAudio) {
      setAudioDockOpen((prev) => !prev);
      return;
    }
    setActiveView(nextView);
    if (onViewModeChange) onViewModeChange(nextView);
  }, [canDockAudio, onViewModeChange]);

  const telemetryPaperKey = file && !file.isPendingSkeleton ? getPaperViewKey(file) : '';
  const telemetryMode = useMemo(() => {
    if (!telemetryPaperKey) return '';
    return normalizePaperTelemetryMode(activeView, canSplit, file?.docType);
  }, [telemetryPaperKey, activeView, canSplit, file?.docType]);

  useEffect(() => {
    if (!telemetryPaperKey || !telemetryMode) {
      setActivePaperTelemetry(null, null);
      return undefined;
    }
    setActivePaperTelemetry(telemetryPaperKey, telemetryMode);
    return () => {
      setActivePaperTelemetry(null, null);
    };
  }, [telemetryPaperKey, telemetryMode]);

  const [headerVisible, setHeaderVisible] = useState(true);
  const [desktopSplitRatio, setDesktopSplitRatio] = useState(50); // percentage for desktop split
  const [mobileSplitRatio, setMobileSplitRatio] = useState(50);   // percentage for mobile vertical split
  const [isDragging, setIsDragging] = useState(false);

  const modalBodyRef = useRef(null);
  const desktopRatioRef = useRef(desktopSplitRatio);
  const mobileRatioRef = useRef(mobileSplitRatio);

  useEffect(() => {
    desktopRatioRef.current = desktopSplitRatio;
  }, [desktopSplitRatio]);

  useEffect(() => {
    mobileRatioRef.current = mobileSplitRatio;
  }, [mobileSplitRatio]);

  // Lock background body scroll while modal is active to prevent scroll bleed-through
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (!headerVisible) {
          setHeaderVisible(true);
        } else {
          onClose();
        }
      } else if (e.key === 'h' || e.key === 'H') {
        // Only toggle if not typing in an input
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          setHeaderVisible((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, headerVisible]);

  // High-performance desktop horizontal drag (updates CSS directly to eliminate stutter)
  const handleDesktopDragStart = useCallback((e) => {
    if (!e.touches && e.cancelable) e.preventDefault();
    setIsDragging(true);

    const onMove = (moveEvent) => {
      if (!modalBodyRef.current) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const rect = modalBodyRef.current.getBoundingClientRect();
      const clientX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const pct = Math.max(15, Math.min(85, ((clientX - rect.left) / rect.width) * 100));
      desktopRatioRef.current = pct;
      modalBodyRef.current.style.setProperty('--desktop-split-pct', `${pct}%`);
    };

    const onEnd = () => {
      setIsDragging(false);
      setDesktopSplitRatio(desktopRatioRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, []);

  // High-performance mobile vertical drag for phones
  const handleMobileDragStart = useCallback((e) => {
    if (!e.touches && e.cancelable) e.preventDefault();
    setIsDragging(true);

    const onMove = (moveEvent) => {
      if (!modalBodyRef.current) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const rect = modalBodyRef.current.getBoundingClientRect();
      const clientY = moveEvent.touches && moveEvent.touches.length > 0 ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const pct = Math.max(18, Math.min(82, ((clientY - rect.top) / rect.height) * 100));
      mobileRatioRef.current = pct;
      modalBodyRef.current.style.setProperty('--mobile-split-pct', `${pct}%`);
    };

    const onEnd = () => {
      setIsDragging(false);
      setMobileSplitRatio(mobileRatioRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, []);

  // Double click or tap resets both desktop and mobile split to 50/50
  const handleResetSplit = useCallback(() => {
    setDesktopSplitRatio(50);
    setMobileSplitRatio(50);
    desktopRatioRef.current = 50;
    mobileRatioRef.current = 50;
    if (modalBodyRef.current) {
      modalBodyRef.current.style.setProperty('--desktop-split-pct', '50%');
      modalBodyRef.current.style.setProperty('--mobile-split-pct', '50%');
    }
  }, []);

  const handleDesktopResizerKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (e.key === 'Home' || e.key === 'End') {
        handleResetSplit();
        return;
      }
      const delta = e.key === 'ArrowLeft' ? -5 : 5;
      setDesktopSplitRatio((prev) => {
        const next = Math.max(15, Math.min(85, Math.round(prev + delta)));
        desktopRatioRef.current = next;
        if (modalBodyRef.current) modalBodyRef.current.style.setProperty('--desktop-split-pct', `${next}%`);
        return next;
      });
    }
  }, [handleResetSplit]);

  const handleMobileResizerKeyDown = useCallback((e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (e.key === 'Home' || e.key === 'End') {
        handleResetSplit();
        return;
      }
      const delta = e.key === 'ArrowUp' ? -5 : 5;
      setMobileSplitRatio((prev) => {
        const next = Math.max(18, Math.min(82, Math.round(prev + delta)));
        mobileRatioRef.current = next;
        if (modalBodyRef.current) modalBodyRef.current.style.setProperty('--mobile-split-pct', `${next}%`);
        return next;
      });
    }
  }, [handleResetSplit]);

  // Resolve current active single document when not in split mode
  const currentDoc = useMemo(() => {
    if (!file) return {};
    if (activeView === 'QP' && siblings.QP) return siblings.QP;
    if (activeView === 'MS' && siblings.MS) return siblings.MS;
    if (activeView === 'ER' && siblings.ER) return siblings.ER;
    return siblings[activeView] || file.primaryFile || file;
  }, [activeView, siblings, file]);

  const isSplit = activeView === 'split' && canSplit;
  const singleExt = (currentDoc.ext || (currentDoc.path ? currentDoc.path.split('.').pop() : 'pdf') || 'pdf').toLowerCase();
  const isSinglePdf = singleExt === 'pdf';
  const isTextbookDoc = Boolean(
    currentDoc.category === 'Books' ||
    currentDoc.category === 'IAL Books' ||
    currentDoc.category === 'IGCSE Books' ||
    currentDoc.docType === 'Book' ||
    file?.category === 'Books' ||
    file?.category === 'IAL Books' ||
    file?.category === 'IGCSE Books' ||
    file?.docType === 'Book' ||
    /^(?:IAL|IGCSE)\s+Books\//i.test(currentDoc.path || file?.path || '')
  );
  const isSingleAudio = singleExt === 'mp3' || singleExt === 'wav' || singleExt === 'm4a' || singleExt === 'ogg';
  const isSingleAudioZip =
    singleExt === 'zip' &&
    (currentDoc.docType === 'AUD' ||
      /audio|recording|wfr0[24]|wgn0[24]|wsp0[24]/i.test(currentDoc.name || currentDoc.path || ''));
  const isSingleSolutionZip =
    !isSplit &&
    !isSinglePdf &&
    !isSingleAudioZip &&
    singleExt === 'zip' &&
    (currentDoc.docType === 'SOL' || /solution/i.test(currentDoc.name || currentDoc.path || ''));

  const [solDirectory, setSolDirectory] = useState(null);
  const [solDirLoading, setSolDirLoading] = useState(false);
  const [solDirError, setSolDirError] = useState(null);
  const [solDirRetry, setSolDirRetry] = useState(0);
  const [selectedSolPath, setSelectedSolPath] = useState('');
  const [solNavExpanded, setSolNavExpanded] = useState(true);
  const [activeSolPdf, setActiveSolPdf] = useState(null);
  const [solPdfLoading, setSolPdfLoading] = useState(false);
  const [solPdfError, setSolPdfError] = useState(null);
  const [solPdfRetry, setSolPdfRetry] = useState(0);

  const solZipUrl = isSingleSolutionZip && currentDoc.path ? getHfUrl(currentDoc.path) : '';

  useEffect(() => {
    if (!solZipUrl) {
      setSolDirectory(null);
      setSolDirLoading(false);
      setSolDirError(null);
      setSelectedSolPath('');
      setActiveSolPdf(null);
      setSolPdfLoading(false);
      setSolPdfError(null);
      return undefined;
    }

    let cancelled = false;
    setSolDirLoading(true);
    setSolDirError(null);
    setSolDirectory(null);
    setSelectedSolPath('');
    setActiveSolPdf(null);
    setSolNavExpanded(true);

    listZipPdfEntries(solZipUrl, currentDoc.size || 0)
      .then((dirData) => {
        if (cancelled) return;
        setSolDirectory(dirData);
        setSelectedSolPath(dirData.entries[0]?.entryPath || '');
        setSolDirLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSolDirError(err?.message || 'Unable to read Solution Bank chapters');
        setSolDirLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [solZipUrl, currentDoc.size, solDirRetry]);

  const selectedSolEntry = useMemo(() => {
    if (!solDirectory?.entries?.length) return null;
    return (
      solDirectory.entries.find((e) => e.entryPath === selectedSolPath) ||
      solDirectory.entries[0]
    );
  }, [solDirectory, selectedSolPath]);

  const activeSolGroup = useMemo(() => {
    if (!solDirectory?.groups?.length || !selectedSolEntry) return null;
    return (
      solDirectory.groups.find((g) => g.key === selectedSolEntry.groupKey) ||
      solDirectory.groups[0]
    );
  }, [solDirectory, selectedSolEntry]);

  useEffect(() => {
    if (!solZipUrl || !selectedSolEntry) {
      setActiveSolPdf(null);
      setSolPdfLoading(false);
      setSolPdfError(null);
      return undefined;
    }

    let cancelled = false;
    setSolPdfLoading(true);
    setSolPdfError(null);
    setActiveSolPdf(null);

    extractZipPdfEntry(solZipUrl, selectedSolEntry, currentDoc.size || 0)
      .then((pdfResult) => {
        if (cancelled) return;
        setActiveSolPdf(pdfResult);
        setSolPdfLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSolPdfError(err?.message || 'Unable to unpack selected PDF');
        setSolPdfLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [solZipUrl, selectedSolEntry, currentDoc.size, solPdfRetry]);

  const [zipTracks, setZipTracks] = useState([]);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState(null);
  const [zipProgress, setZipProgress] = useState(null);
  const [selectedTrackIdx, setSelectedTrackIdx] = useState(0);
  const [useFullSingleAudio, setUseFullSingleAudio] = useState(false);

  const activeZipDoc = useMemo(() => {
    if (!file) return null;
    if (!isSplit && !isSinglePdf && isSingleAudioZip) return currentDoc;
    if (audioDockOpen && canDockAudio && audZipSib) return audZipSib;
    return null;
  }, [file, isSplit, isSinglePdf, isSingleAudioZip, currentDoc, audioDockOpen, canDockAudio, audZipSib]);

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
  const [copiedLink, setCopiedLink] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const handleCopyShareLink = useCallback(() => {
    if (typeof window === 'undefined') return;
    const shareUrl = window.location.href;
    const triggerCopied = () => {
      setCopiedLink(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedLink(false), 1800);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(shareUrl).then(triggerCopied).catch(() => {
        triggerCopied();
      });
    } else {
      triggerCopied();
    }
  }, []);

  const activeAudioContext = useMemo(() => {
    if (!file) return null;
    const sittingKey = getPaperViewKey(file);
    const subject = file.subject || currentDoc?.subject || 'French';
    const spec = file.spec || currentDoc?.spec || 'IAL';
    const session = file.session || currentDoc?.session || '';

    if (!isSplit && !isSinglePdf) {
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
      if (isSingleAudio && currentDoc.path) {
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
    }

    if (audioDockOpen && canDockAudio && audSib) {
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
    file,
    currentDoc,
    isSplit,
    isSinglePdf,
    isSingleAudioZip,
    isSingleAudio,
    activeZipTrack,
    zipTracks.length,
    safeTrackIdx,
    audioDockOpen,
    canDockAudio,
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

  if (!file) return null;

  const singleUrl = getHfUrl(currentDoc.path);
  const singleTitle = getDisplayTitle(currentDoc);

  const modalTitle = isSplit
    ? getUnifiedSittingTitle(file)
    : singleTitle;

  const modalSubtitle = isSplit
    ? ''
    : `${currentDoc.path} ${currentDoc.size ? `(${formatBytes(currentDoc.size)})` : ''}`;

  const downloadUrl = isSplit ? getDownloadUrl(siblings.QP?.path) : getDownloadUrl(currentDoc.path);

  const renderSplitPdfPane = (docTypeKey, shouldFocus) => {
    const targetSib = docTypeKey === 'QP' ? siblings.QP : siblings.MS;
    const labelText = docTypeKey === 'QP' ? 'Question Paper' : 'Mark Scheme';
    return (
      <Suspense fallback={<PdfPaneSkeleton title={`Loading ${labelText}...`} subtitle="Initializing WebPDF Reader" />}>
        <PdfViewerPane
          key={docTypeKey}
          url={getHfUrl(targetSib.path)}
          title={targetSib.name || labelText}
          docType={docTypeKey}
          fileSize={targetSib.size || 0}
          isMobile={isMobile}
          initialPage={1}
          onDownload={true}
          autoFocus={shouldFocus}
        />
      </Suspense>
    );
  };

  const renderSubtitleBar = (variant = 'dock') => {
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
            {subtitleSegments.map((seg, idx) => {
              const isCurrentSeg = idx === activeSubtitleIdx;
              return (
                <button
                  key={`${seg.start}-${idx}`}
                  type="button"
                  role="listitem"
                  data-seg-idx={idx}
                  className={`modal-subtitle-seg-btn ${isCurrentSeg ? 'active' : ''}`}
                  onClick={() => handleSeekToSubtitle(seg.start)}
                  title={`Jump audio to ${formatSubtitleTimestamp(seg.start)}`}
                >
                  <span className="modal-subtitle-seg-time">
                    {formatSubtitleTimestamp(seg.start)}
                  </span>
                  <span className="modal-subtitle-seg-text">{seg.text}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={modalTitle}>
      <div className={`modal-container ${isSplit ? 'modal-split-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Docked top unhide bar when header is collapsed (zero overlap with pane titles) */}
        {!headerVisible && (
          <div
            className="modal-docked-unhide-bar"
            onClick={() => setHeaderVisible(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHeaderVisible(true); } }}
            title="Click to restore header (or press H)"
          >
            <span className="unhide-bar-content">▼ Show Header Controls (Press H)</span>
          </div>
        )}

        {/* Unified Ivy League Academic Light Header */}
        {headerVisible && (
          <div className="modal-header">
            {/* Left side: Auto-fitting title & structured badges */}
            <div className="modal-title-group">
              <div className="modal-title-row">
                <span className="modal-title" title={modalTitle}>{modalTitle}</span>
                {file.curriculum && (
                  <span className="modal-header-badge curriculum">{file.curriculum}</span>
                )}
                {isSplit && (
                  <span className="modal-header-badge split-indicator">QP + MS</span>
                )}
                {showViews && (
                  <PaperViewsCounter count={viewsCount} variant="modal" />
                )}
                <button
                  type="button"
                  className="modal-close-btn mobile-only-close"
                  onClick={onClose}
                  aria-label="Close preview"
                  title="Close Preview (Esc)"
                >
                  ✕
                </button>
              </div>
              {!isSplit && (
                <div className="modal-subtitle" title={modalSubtitle}>
                  <span className="modal-doc-name">{currentDoc.name || currentDoc.path}</span>
                  {currentDoc.size ? <span className="modal-doc-size">({formatBytes(currentDoc.size)})</span> : null}
                </div>
              )}
            </div>

            {/* Right side: Consolidated buttons with strict pixel uniformity */}
            <div className="modal-header-controls-bar">
              {/* Document View Switchers */}
              <div className="modal-view-tabs" role="tablist" aria-label="Document views">
                {['QP', 'MS', 'ER', 'SC', 'AUD', 'DF', 'SOL', 'SAM'].map((type) => {
                  const sib = siblings[type];
                  if (!sib) return null;
                  const isDockedAudioTab = type === 'AUD' && canDockAudio;
                  if (isDockedAudioTab) return null;
                  const isCurrent = !isSplit && (activeView === type || currentDoc.path === sib.path);
                  const labelMap = {
                    QP: ['Question Paper', 'QP'],
                    MS: ['Mark Scheme', 'MS'],
                    ER: ['Examiner Report', 'ER'],
                    SC: getScDocumentLabel(sib),
                    AUD: ['Listening Audio', 'Audio'],
                    DF: ['Data / Formulae', 'Data'],
                    SOL: ['Worked Solution', 'SOL'],
                    SAM: ['Sample Paper', 'SAM']
                  };
                  const [fullLabel, shortLabel] = labelMap[type] || [type, type];
                  return (
                    <button
                      key={type}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      className={`modal-btn modal-view-btn ${type.toLowerCase()} ${isCurrent ? 'active' : ''}`}
                      onClick={() => handleSelectView(type)}
                      title={`View ${fullLabel}`}
                    >
                      <span className="btn-desktop-text">{fullLabel}</span>
                      <span className="btn-mobile-text" aria-hidden="true">{shortLabel}</span>
                    </button>
                  );
                })}

                {canSplit && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isSplit}
                    className={`modal-btn modal-view-btn split ${isSplit ? 'active' : ''}`}
                    onClick={() => handleSelectView('split')}
                    title="View Question Paper and Mark Scheme side-by-side"
                  >
                    <span className="btn-desktop-text">Split View</span>
                    <span className="btn-mobile-text" aria-hidden="true">Split</span>
                  </button>
                )}
              </div>

              {((siblings.AUD && canDockAudio) || isSplit) && (
                <div className="modal-view-extras">
                  {siblings.AUD && canDockAudio && (
                    <button
                      type="button"
                      aria-pressed={audioDockOpen}
                      className={`modal-btn modal-view-btn aud ${audioDockOpen ? 'active' : ''}`}
                      onClick={() => handleSelectView('AUD')}
                      title={audioDockOpen ? 'Hide docked audio player' : 'Play listening audio above paper'}
                    >
                      <span className="btn-desktop-text">Listening Audio</span>
                      <span className="btn-mobile-text" aria-hidden="true">Audio</span>
                    </button>
                  )}

                  {isSplit && (
                    <button
                      type="button"
                      className={`modal-btn modal-swap-split-btn ${swapSplit ? 'active' : ''}`}
                      onClick={() => setSwapSplit((prev) => !prev)}
                      aria-pressed={swapSplit}
                      title={swapSplit ? 'Restore Question Paper left / Mark Scheme right' : 'Swap Question Paper and Mark Scheme pane positions'}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                      <span className="btn-desktop-text">Swap Panes</span>
                      <span className="btn-mobile-text" aria-hidden="true">Swap</span>
                    </button>
                  )}
                </div>
              )}

              <div className="modal-control-separator" />

              {/* Theme Toggle Button (Light / Dark / OLED) */}
              {onToggleTheme && (
                <button
                  type="button"
                  className="modal-btn modal-theme-toggle-btn"
                  onClick={onToggleTheme}
                  title={
                    theme === 'light'
                      ? 'Current: Academic Light - Click for Dark Mode'
                      : theme === 'dark'
                      ? 'Current: Academic Dark - Click for Pure OLED Mode'
                      : 'Current: Pure OLED - Click for Light Mode'
                  }
                >
                  {theme === 'light' ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                      <span className="btn-desktop-text">Light</span>
                    </>
                  ) : theme === 'dark' ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                      <span className="btn-desktop-text">Dark</span>
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 3v18A9 9 0 0 0 12 3z" fill="currentColor"/></svg>
                      <span className="btn-desktop-text">OLED</span>
                    </>
                  )}
                </button>
              )}

              {/* Hide Header Button */}
              <button
                type="button"
                className="modal-btn modal-hide-header-btn"
                onClick={() => setHeaderVisible(false)}
                title="Hide header for distraction-free reading (Press H to restore)"
              >
                <span className="btn-desktop-text">Hide Header</span>
                <span className="btn-mobile-text" aria-hidden="true">Hide</span>
              </button>

              {/* Share / Copy Study Link Button */}
              <button
                type="button"
                className={`modal-btn modal-share-btn ${copiedLink ? 'copied' : ''}`}
                onClick={handleCopyShareLink}
                title="Copy direct study link to this paper view"
                aria-label={copiedLink ? 'Study link copied to clipboard' : 'Copy direct study link'}
              >
                {copiedLink ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
                <span className="btn-desktop-text">{copiedLink ? 'Copied!' : 'Share'}</span>
                {copiedLink && <span className="btn-mobile-text" aria-hidden="true">Copied</span>}
              </button>

              {/* Download PDF or full archive directly */}
              <a
                href={downloadUrl}
                download
                rel="noopener noreferrer"
                className="modal-btn modal-link-btn"
                title={isSingleSolutionZip ? 'Download full Solution Bank archive (.zip)' : 'Download document'}
                aria-label={isSingleSolutionZip ? 'Download full Solution Bank archive (.zip)' : 'Download document'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className="btn-desktop-text">Download</span>
              </a>

              {/* Close Button */}
              <button
                type="button"
                className="modal-close-btn desktop-only-close"
                onClick={onClose}
                aria-label="Close preview"
                title="Close Preview (Esc)"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Persistent Docked Audio Player above Question Paper / Split Stage */}
        {audioDockOpen && canDockAudio && audSib && (
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
              <button
                type="button"
                className={`modal-audio-cc-btn ${subtitlesEnabled ? 'active' : ''}`}
                onClick={() => setSubtitlesEnabled((prev) => !prev)}
                aria-pressed={subtitlesEnabled}
                title={subtitlesEnabled ? 'Hide synchronized subtitles (CC)' : 'Show synchronized subtitles (CC)'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                  <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                </svg>
                <span>Subtitles</span>
              </button>
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
                onClick={() => setAudioDockOpen(false)}
                aria-label="Close docked audio player"
                title="Hide Audio Bar"
              >
                ×
              </button>
            </div>

            {renderSubtitleBar('dock')}
          </div>
        )}

        {/* Modal Stage (Hardware-accelerated CSS split sizing) */}
        <div
          ref={modalBodyRef}
          className={`modal-body ${file.isPendingSkeleton ? 'single-container' : isSplit ? 'split-container' : 'single-container'} ${isDragging ? 'is-resizing' : ''} ${!headerVisible ? 'header-hidden' : ''}`}
          style={{
            '--desktop-split-pct': `${desktopSplitRatio}%`,
            '--mobile-split-pct': `${mobileSplitRatio}%`
          }}
        >
          {file.isPendingSkeleton ? (
            <PdfPaneSkeleton
              title={`Loading ${modalTitle}...`}
              subtitle="Fetching examination paper directly into on-site reader"
            />
          ) : isSplit ? (
            <>
              {/* First Split Pane (QP by default, MS when swapped) */}
              <div className="modal-split-pane qp-pane">
                {swapSplit ? renderSplitPdfPane('MS', true) : renderSplitPdfPane('QP', true)}
              </div>

              {/* Desktop Horizontal Split Resizer */}
              {!isMobile && (
                <div
                  className={`modal-split-resizer ${isDragging ? 'dragging' : ''}`}
                  onMouseDown={handleDesktopDragStart}
                  onTouchStart={handleDesktopDragStart}
                  onDoubleClick={handleResetSplit}
                  onKeyDown={handleDesktopResizerKeyDown}
                  tabIndex={0}
                  title="Drag or use Left/Right Arrow keys to resize panes (Double-click or Home to reset 50/50)"
                  role="separator"
                  aria-label="Resize split panes"
                  aria-orientation="vertical"
                  aria-valuenow={Math.round(desktopSplitRatio)}
                  aria-valuemin={15}
                  aria-valuemax={85}
                >
                  <div className="resizer-handle-grip" />
                </div>
              )}

              {/* Mobile Vertical Split Resizer (for Phones) */}
              {isMobile && (
                <div
                  className={`modal-mobile-split-resizer ${isDragging ? 'dragging' : ''}`}
                  onTouchStart={handleMobileDragStart}
                  onMouseDown={handleMobileDragStart}
                  onDoubleClick={handleResetSplit}
                  onKeyDown={handleMobileResizerKeyDown}
                  tabIndex={0}
                  title="Drag or use Up/Down Arrow keys to resize split (Double-tap or Home to reset 50/50)"
                  role="separator"
                  aria-label="Resize top and bottom panes"
                  aria-orientation="horizontal"
                  aria-valuenow={Math.round(mobileSplitRatio)}
                  aria-valuemin={18}
                  aria-valuemax={82}
                >
                  <div className="mobile-resizer-grip" />
                </div>
              )}

              {/* Second Split Pane (MS by default, QP when swapped) */}
              <div className="modal-split-pane ms-pane">
                {swapSplit ? renderSplitPdfPane('QP', false) : renderSplitPdfPane('MS', false)}
              </div>
            </>
          ) : (
            <div className="modal-single-pane">
              {isSingleSolutionZip ? (
                <>
                  {solDirectory?.groups?.length > 0 && (
                    <div className="modal-sol-dock" role="navigation" aria-label="Worked Solutions Chapter Selector">
                      <div className="modal-sol-top-row">
                        <div className="modal-sol-status-group">
                          <span className="modal-sol-badge">Solution Bank</span>
                          {selectedSolEntry && (
                            <span className="modal-sol-active-label" title={`${selectedSolEntry.fullLabel} — ${selectedSolEntry.fileName}`}>
                              {selectedSolEntry.fullLabel}
                            </span>
                          )}
                        </div>
                        <div className="modal-sol-nav-actions">
                          <button
                            type="button"
                            className="modal-sol-step-btn"
                            disabled={!selectedSolEntry || selectedSolEntry.flatIndex <= 0}
                            onClick={() => {
                              if (!selectedSolEntry || selectedSolEntry.flatIndex <= 0) return;
                              const prevEntry = solDirectory.entries[selectedSolEntry.flatIndex - 1];
                              if (prevEntry) setSelectedSolPath(prevEntry.entryPath);
                            }}
                            title="Previous exercise"
                            aria-label="Previous exercise"
                          >
                            ‹
                          </button>
                          <span className="modal-sol-counter">
                            {selectedSolEntry ? `${selectedSolEntry.flatIndex + 1}/${solDirectory.entries.length}` : ''}
                          </span>
                          <button
                            type="button"
                            className="modal-sol-step-btn"
                            disabled={!selectedSolEntry || selectedSolEntry.flatIndex >= solDirectory.entries.length - 1}
                            onClick={() => {
                              if (!selectedSolEntry) return;
                              const nextEntry = solDirectory.entries[selectedSolEntry.flatIndex + 1];
                              if (nextEntry) setSelectedSolPath(nextEntry.entryPath);
                            }}
                            title="Next exercise"
                            aria-label="Next exercise"
                          >
                            ›
                          </button>
                          <button
                            type="button"
                            className={`modal-sol-toggle-btn ${solNavExpanded ? 'active' : ''}`}
                            onClick={() => setSolNavExpanded((prev) => !prev)}
                            aria-expanded={solNavExpanded}
                            title={solNavExpanded ? 'Collapse chapter and exercise picker' : 'Show chapters and exercises'}
                          >
                            {solNavExpanded ? 'Hide Chapters' : 'Chapters'}
                          </button>
                        </div>
                      </div>

                      {solNavExpanded && (
                        <>
                          <div className="modal-sol-pill-row" role="tablist" aria-label="Chapters">
                            {solDirectory.groups.map((grp) => {
                              const isActiveGroup = activeSolGroup?.key === grp.key;
                              return (
                                <button
                                  key={grp.key}
                                  type="button"
                                  role="tab"
                                  aria-selected={isActiveGroup}
                                  className={`modal-sol-pill chapter ${isActiveGroup ? 'active' : ''}`}
                                  onClick={() => {
                                    if (grp.items[0]) setSelectedSolPath(grp.items[0].entryPath);
                                  }}
                                  title={`${grp.label} (${grp.items.length} PDFs)`}
                                >
                                  {grp.shortLabel}
                                </button>
                              );
                            })}
                          </div>

                          {activeSolGroup?.items?.length > 0 && (
                            <div className="modal-sol-pill-row exercises" role="group" aria-label={`${activeSolGroup.label} exercises`}>
                              {activeSolGroup.items.map((item) => {
                                const isActiveItem = selectedSolEntry?.entryPath === item.entryPath;
                                return (
                                  <button
                                    key={item.entryPath}
                                    type="button"
                                    aria-pressed={isActiveItem}
                                    className={`modal-sol-pill exercise ${isActiveItem ? 'active' : ''}`}
                                    onClick={() => setSelectedSolPath(item.entryPath)}
                                    title={`${item.fullLabel} (${formatBytes(item.uncompressedSize)})`}
                                  >
                                    {item.shortLabel}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {solDirLoading ? (
                    <PdfPaneSkeleton
                      title={`Opening ${singleTitle}...`}
                      subtitle="Reading chapters and exercises from Solution Bank"
                    />
                  ) : solDirError ? (
                    <div className="modal-resource-card">
                      <div className="modal-resource-box">
                        <h3>{singleTitle}</h3>
                        <p>{currentDoc.name || currentDoc.path}</p>
                        <div className="modal-zip-audio-error" role="alert">
                          Unable to read chapters in browser ({solDirError}). You can retry or download the full ZIP archive below.
                        </div>
                        <div className="modal-sol-error-actions">
                          <button
                            type="button"
                            className="modal-action-link"
                            onClick={() => setSolDirRetry((n) => n + 1)}
                          >
                            Retry
                          </button>
                          <a
                            href={downloadUrl}
                            rel="noopener noreferrer"
                            download
                            className="modal-download-btn"
                          >
                            Download ZIP Resource ({formatBytes(currentDoc.size)})
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : solPdfLoading ? (
                    <PdfPaneSkeleton
                      title={`Loading ${selectedSolEntry?.fullLabel || 'Solution'}...`}
                      subtitle={selectedSolEntry ? `Unpacking ${selectedSolEntry.fileName} (${formatBytes(selectedSolEntry.uncompressedSize)})` : 'Streaming from Solution Bank'}
                    />
                  ) : solPdfError ? (
                    <div className="modal-resource-card">
                      <div className="modal-resource-box">
                        <h3>{selectedSolEntry?.fullLabel || singleTitle}</h3>
                        <p>{selectedSolEntry?.fileName || currentDoc.name}</p>
                        <div className="modal-zip-audio-error" role="alert">
                          Unable to unpack this solution PDF ({solPdfError}).
                        </div>
                        <div className="modal-sol-error-actions">
                          <button
                            type="button"
                            className="modal-action-link"
                            onClick={() => setSolPdfRetry((n) => n + 1)}
                          >
                            Retry
                          </button>
                          <a
                            href={downloadUrl}
                            rel="noopener noreferrer"
                            download
                            className="modal-download-btn"
                          >
                            Download Full ZIP ({formatBytes(currentDoc.size)})
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : activeSolPdf ? (
                    <Suspense fallback={<PdfPaneSkeleton title={`Loading ${selectedSolEntry?.fullLabel || singleTitle}...`} subtitle="Initializing WebPDF Reader" />}>
                      <PdfViewerPane
                        key={`${currentDoc.path}::${selectedSolEntry?.entryPath || ''}`}
                        pdfData={activeSolPdf.bytes}
                        downloadHref={activeSolPdf.blobUrl}
                        downloadName={activeSolPdf.fileName}
                        title={`${singleTitle} — ${selectedSolEntry?.fullLabel || activeSolPdf.fileName}`}
                        docType="SOL"
                        fileSize={activeSolPdf.bytes.byteLength}
                        isMobile={isMobile}
                        initialPage={1}
                        onDownload={true}
                        autoFocus={true}
                        allowTwoPage={true}
                        defaultTwoPage={false}
                      />
                    </Suspense>
                  ) : null}
                </>
              ) : !isSinglePdf ? (
                <div className="modal-resource-card">
                  <div className={`modal-resource-box ${isSingleAudioZip ? 'audio-zip-box' : ''}`}>
                    <h3>{singleTitle}</h3>
                    <p>{currentDoc.name || currentDoc.path}</p>
                    {isSingleAudio && (
                      <>
                        <div className="modal-zip-audio-header">
                          <span className="modal-zip-audio-badge">In-Browser Audio Player</span>
                          <button
                            type="button"
                            className={`modal-audio-cc-btn ${subtitlesEnabled ? 'active' : ''}`}
                            onClick={() => setSubtitlesEnabled((prev) => !prev)}
                            aria-pressed={subtitlesEnabled}
                            title={subtitlesEnabled ? 'Hide synchronized subtitles (CC)' : 'Show synchronized subtitles (CC)'}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                              <rect x="2" y="4" width="20" height="16" rx="2" />
                              <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                              <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                            </svg>
                            <span>Subtitles (CC)</span>
                          </button>
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
                                <button
                                  type="button"
                                  className={`modal-audio-cc-btn ${subtitlesEnabled ? 'active' : ''}`}
                                  onClick={() => setSubtitlesEnabled((prev) => !prev)}
                                  aria-pressed={subtitlesEnabled}
                                  title={subtitlesEnabled ? 'Hide synchronized subtitles (CC)' : 'Show synchronized subtitles (CC)'}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                                    <rect x="2" y="4" width="20" height="16" rx="2" />
                                    <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                                    <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                                  </svg>
                                  <span>Subtitles (CC)</span>
                                </button>
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
              ) : (
                <Suspense fallback={<PdfPaneSkeleton title={`Loading ${singleTitle}...`} subtitle="Initializing WebPDF Reader" />}>
                  <PdfViewerPane
                    key={currentDoc.path}
                    url={singleUrl}
                    title={singleTitle}
                    docType={currentDoc.docType || (isTextbookDoc ? 'Book' : 'DOC')}
                    fileSize={currentDoc.size || 0}
                    isMobile={isMobile}
                    initialPage={1}
                    onDownload={true}
                    autoFocus={true}
                    allowTwoPage={true}
                    defaultTwoPage={!isMobile && isTextbookDoc}
                  />
                </Suspense>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
