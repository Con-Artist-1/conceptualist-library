import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import '../styles/modal.css';
import { setActivePaperTelemetry } from '../telemetry.js';
import { isBookCategory } from '../data/boards.js';
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
import { ThemeToggleButton } from './ThemeToggleButton.jsx';
import { ResourceCard } from './ResourceCard.jsx';
import { stopAllSiteAudio } from '../lib/audioLifecycle.js';

const PdfViewerPane = lazy(() => import('../PdfViewerPane.jsx'));
const AudioPlayerDock = lazy(() => import('./AudioPlayerDock.jsx'));
const SolutionBankView = lazy(() => import('./SolutionBankView.jsx'));

const PreviewModal = ({
  file,
  initialView = '',
  viewsCount = 0,
  showViews = false,
  onClose,
  onViewModeChange,
  theme,
  onToggleTheme,
  openerRef = null
}) => {
  const siblings = useMemo(() => ({
    ...(file?.siblings || {}),
    ...(file?.docs || {})
  }), [file]);

  const canSplitMs = Boolean(siblings.QP?.ext === 'pdf' && siblings.MS?.ext === 'pdf');
  const canSplitSc = Boolean(siblings.QP?.ext === 'pdf' && siblings.SC?.ext === 'pdf');
  const canSplit = canSplitMs || canSplitSc;
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

  const shouldStartAudioDock = Boolean(
    canDockAudio && (initialView === 'AUD' || (!initialView && file?.docType === 'AUD'))
  );
  const [audioDockOpen, setAudioDockOpen] = useState(() => shouldStartAudioDock);
  const [swapSplit, setSwapSplit] = useState(false);
  const [splitRightDocType, setSplitRightDocType] = useState(() => (canSplitMs ? 'MS' : 'SC'));
  const effectiveSplitRight = (splitRightDocType === 'SC' && canSplitSc) || !canSplitMs ? 'SC' : 'MS';

  // On mobile portrait, default to single QP view for maximum readable document height; on desktop, default to split view
  const [activeView, setActiveView] = useState(() => {
    if (shouldStartAudioDock) {
      return !isMobile && canSplit ? 'split' : (siblings.QP ? 'QP' : siblings.MS ? 'MS' : 'QP');
    }
    if (initialView === 'split' && canSplit) return 'split';
    if (initialView && (siblings[initialView] || file?.docType === initialView)) return initialView;
    const fallback = isMobile
      ? (file?.docType || (siblings.QP ? 'QP' : 'split'))
      : (canSplit ? 'split' : (file?.docType || 'QP'));
    if (canDockAudio && fallback === 'AUD') {
      return !isMobile && canSplit ? 'split' : (siblings.QP ? 'QP' : 'MS');
    }
    return fallback;
  });

  useEffect(() => {
    if (canDockAudio && activeView === 'AUD') {
      setAudioDockOpen(true);
      const fallbackView = !isMobile && canSplit ? 'split' : (siblings.QP ? 'QP' : 'MS');
      setActiveView(fallbackView);
    }
  }, [canDockAudio, activeView, isMobile, canSplit, siblings.QP]);

  useLayoutEffect(() => () => {
    stopAllSiteAudio();
  }, []);

  const handleCloseModal = useCallback(() => {
    stopAllSiteAudio();
    onClose();
  }, [onClose]);

  const handleSelectView = useCallback((nextView) => {
    if (nextView === 'AUD' && canDockAudio) {
      setAudioDockOpen((prev) => {
        if (prev) stopAllSiteAudio();
        return !prev;
      });
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
  const [desktopSplitRatio, setDesktopSplitRatio] = useState(50);
  const [mobileSplitRatio, setMobileSplitRatio] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const modalContainerRef = useRef(null);
  const modalTitleRef = useRef(null);
  const modalBodyRef = useRef(null);
  const desktopRatioRef = useRef(desktopSplitRatio);
  const mobileRatioRef = useRef(mobileSplitRatio);

  useEffect(() => {
    desktopRatioRef.current = desktopSplitRatio;
  }, [desktopSplitRatio]);

  useEffect(() => {
    mobileRatioRef.current = mobileSplitRatio;
  }, [mobileSplitRatio]);

  // Lock background body scroll, mark background siblings inert, focus modal heading, and restore opener focus on close (A11Y-01)
  useLayoutEffect(() => {
    const capturedActive = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
    const opener = (openerRef?.current instanceof HTMLElement && openerRef.current.isConnected)
      ? openerRef.current
      : capturedActive;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const inertSiblings = [];
    const appRoot = document.querySelector('.app-container');
    if (appRoot) {
      for (const child of Array.from(appRoot.children)) {
        if (!child.classList.contains('modal-backdrop') && !child.inert) {
          child.inert = true;
          child.setAttribute('aria-hidden', 'true');
          inertSiblings.push(child);
        }
      }
    }

    const focusModal = () => {
      if (modalTitleRef.current && typeof modalTitleRef.current.focus === 'function') {
        modalTitleRef.current.focus({ preventScroll: true });
      } else {
        modalContainerRef.current?.focus({ preventScroll: true });
      }
    };
    focusModal();
    const focusTimer = requestAnimationFrame(focusModal);

    return () => {
      cancelAnimationFrame(focusTimer);
      document.body.style.overflow = originalOverflow;
      for (const el of inertSiblings) {
        el.inert = false;
        el.removeAttribute('aria-hidden');
      }
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        const restoreFocus = () => {
          if (!opener.isConnected) return;
          try {
            // Force style recalc so Chromium clears ancestor inertness before focusing
            void opener.offsetWidth;
            opener.focus({ preventScroll: true });
          } catch {
            // Ignore focus restore errors
          }
        };
        restoreFocus();
        requestAnimationFrame(() => {
          if (opener.isConnected && document.activeElement === document.body) {
            restoreFocus();
          }
        });
      }
    };
  }, [openerRef]);

  useEffect(() => {
    const FOCUSABLE_SEL =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), audio[controls], [tabindex]:not([tabindex="-1"])';

    const handleKey = (e) => {
      if (e.key === 'Tab' && modalContainerRef.current) {
        const focusables = Array.from(modalContainerRef.current.querySelectorAll(FOCUSABLE_SEL)).filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !modalContainerRef.current.contains(active) || active === modalTitleRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !modalContainerRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (!headerVisible) {
          setHeaderVisible(true);
        } else {
          handleCloseModal();
        }
      } else if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = e.target?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !e.target?.isContentEditable) {
          setHeaderVisible((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleCloseModal, headerVisible]);

  // Shared split drag handler parameterized for desktop (horizontal) and mobile (vertical)
  const startSplitDrag = useCallback((axis, e) => {
    if (!e.touches && e.cancelable) e.preventDefault();
    setIsDragging(true);

    const onMove = (moveEvent) => {
      if (!modalBodyRef.current) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const rect = modalBodyRef.current.getBoundingClientRect();
      if (axis === 'x') {
        const clientX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const pct = Math.max(15, Math.min(85, ((clientX - rect.left) / rect.width) * 100));
        desktopRatioRef.current = pct;
        modalBodyRef.current.style.setProperty('--desktop-split-pct', `${pct}%`);
      } else {
        const clientY = moveEvent.touches && moveEvent.touches.length > 0 ? moveEvent.touches[0].clientY : moveEvent.clientY;
        const pct = Math.max(18, Math.min(82, ((clientY - rect.top) / rect.height) * 100));
        mobileRatioRef.current = pct;
        modalBodyRef.current.style.setProperty('--mobile-split-pct', `${pct}%`);
      }
    };

    const onEnd = () => {
      setIsDragging(false);
      if (axis === 'x') setDesktopSplitRatio(desktopRatioRef.current);
      else setMobileSplitRatio(mobileRatioRef.current);
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

  const handleDesktopDragStart = useCallback((e) => startSplitDrag('x', e), [startSplitDrag]);
  const handleMobileDragStart = useCallback((e) => startSplitDrag('y', e), [startSplitDrag]);

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

  const handleResizerKeyDown = useCallback((axis, e) => {
    const decKey = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const incKey = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== decKey && e.key !== incKey && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    if (e.key === 'Home' || e.key === 'End') {
      handleResetSplit();
      return;
    }
    const delta = e.key === decKey ? -5 : 5;
    if (axis === 'x') {
      setDesktopSplitRatio((prev) => {
        const next = Math.max(15, Math.min(85, Math.round(prev + delta)));
        desktopRatioRef.current = next;
        if (modalBodyRef.current) modalBodyRef.current.style.setProperty('--desktop-split-pct', `${next}%`);
        return next;
      });
    } else {
      setMobileSplitRatio((prev) => {
        const next = Math.max(18, Math.min(82, Math.round(prev + delta)));
        mobileRatioRef.current = next;
        if (modalBodyRef.current) modalBodyRef.current.style.setProperty('--mobile-split-pct', `${next}%`);
        return next;
      });
    }
  }, [handleResetSplit]);

  const handleDesktopResizerKeyDown = useCallback((e) => handleResizerKeyDown('x', e), [handleResizerKeyDown]);
  const handleMobileResizerKeyDown = useCallback((e) => handleResizerKeyDown('y', e), [handleResizerKeyDown]);

  const currentDoc = useMemo(() => {
    if (!file) return {};
    if (activeView === 'QP' && siblings.QP) return siblings.QP;
    if (activeView === 'MS' && siblings.MS) return siblings.MS;
    if (activeView === 'ER' && siblings.ER) return siblings.ER;
    if (activeView === 'GT' && siblings.GT) return siblings.GT;
    return siblings[activeView] || file.primaryFile || file;
  }, [activeView, siblings, file]);

  const isSplit = activeView === 'split' && canSplit;
  const singleExt = (currentDoc.ext || (currentDoc.path ? currentDoc.path.split('.').pop() : 'pdf') || 'pdf').toLowerCase();
  const isSinglePdf = singleExt === 'pdf';
  const isTextbookDoc = Boolean(
    isBookCategory(currentDoc.category) ||
    currentDoc.docType === 'Book' ||
    isBookCategory(file?.category) ||
    file?.docType === 'Book' ||
    /^(?:IAL|IGCSE|Cambridge)\s+Books\//i.test(currentDoc.path || file?.path || '')
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
      navigator.clipboard.writeText(shareUrl).then(triggerCopied).catch(triggerCopied);
    } else {
      triggerCopied();
    }
  }, []);

  if (!file) return null;

  const singleUrl = getHfUrl(currentDoc.path);
  const singleTitle = getDisplayTitle(currentDoc);
  const modalTitle = isSplit ? getUnifiedSittingTitle(file) : singleTitle;
  const modalSubtitle = isSplit
    ? ''
    : `${currentDoc.path} ${currentDoc.size ? `(${formatBytes(currentDoc.size)})` : ''}`;
  const downloadUrl = isSplit ? getDownloadUrl(siblings.QP?.path) : getDownloadUrl(currentDoc.path);

  const [scSplitFullLabel, scSplitShortLabel] = siblings.SC ? getScDocumentLabel(siblings.SC) : ['Insert', 'Insert'];

  const renderSplitPdfPane = (docTypeKey) => {
    const targetSib = docTypeKey === 'QP' ? siblings.QP : (docTypeKey === 'SC' ? siblings.SC : siblings.MS);
    const labelText = docTypeKey === 'QP' ? 'Question Paper' : (docTypeKey === 'SC' ? scSplitFullLabel : 'Mark Scheme');
    return (
      <Suspense fallback={<PdfPaneSkeleton title={`Loading ${labelText}...`} subtitle="Initializing WebPDF Reader" />}>
        <PdfViewerPane
          key={`${docTypeKey}-${targetSib?.path || ''}`}
          url={getHfUrl(targetSib.path)}
          title={targetSib.name || labelText}
          docType={docTypeKey}
          fileSize={targetSib.size || 0}
          isMobile={isMobile}
          initialPage={1}
          onDownload={true}
          autoFocus={false}
        />
      </Suspense>
    );
  };

  return (
    <div className="modal-backdrop" onClick={handleCloseModal}>
      <div
        ref={modalContainerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
        tabIndex={-1}
        className={`modal-container ${isSplit ? 'modal-split-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!headerVisible && (
          <button
            type="button"
            className="modal-docked-unhide-bar"
            onClick={() => setHeaderVisible(true)}
            title="Click to restore header (or press H)"
          >
            <span className="unhide-bar-content">▼ Show Header Controls (Press H)</span>
          </button>
        )}

        {headerVisible && (
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-title-row">
                <h2 id="preview-modal-title" ref={modalTitleRef} tabIndex={-1} className="modal-title" title={modalTitle}>
                  {modalTitle}
                </h2>
                {file.curriculum && (
                  <span className="modal-header-badge curriculum">{file.curriculum}</span>
                )}
                {isSplit && (
                  <span className="modal-header-badge split-indicator">
                    {effectiveSplitRight === 'SC' ? `QP + ${scSplitShortLabel}` : 'QP + MS'}
                  </span>
                )}
                {showViews && <PaperViewsCounter count={viewsCount} variant="modal" />}
                <button
                  type="button"
                  className="modal-close-btn mobile-only-close"
                  onClick={handleCloseModal}
                  aria-label="Close preview"
                  title="Close Preview (Esc)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {!isSplit && (
                <div className="modal-subtitle" title={modalSubtitle}>
                  <span className="modal-doc-name">{currentDoc.name || currentDoc.path}</span>
                  {currentDoc.size ? <span className="modal-doc-size">({formatBytes(currentDoc.size)})</span> : null}
                </div>
              )}
            </div>

            <div className="modal-header-controls-bar">
              <div
                className="modal-view-tabs"
                role="tablist"
                aria-label="Document views"
                onKeyDown={(e) => {
                  const tabs = Array.from(e.currentTarget.querySelectorAll('[role="tab"]'));
                  if (tabs.length < 2) return;
                  const curIdx = tabs.indexOf(document.activeElement);
                  if (curIdx === -1) return;
                  let nextIdx = -1;
                  if (e.key === 'ArrowRight') nextIdx = (curIdx + 1) % tabs.length;
                  else if (e.key === 'ArrowLeft') nextIdx = (curIdx - 1 + tabs.length) % tabs.length;
                  else if (e.key === 'Home') nextIdx = 0;
                  else if (e.key === 'End') nextIdx = tabs.length - 1;
                  if (nextIdx >= 0) {
                    e.preventDefault();
                    tabs[nextIdx].focus();
                    tabs[nextIdx].click();
                  }
                }}
              >
                {['QP', 'MS', 'ER', 'GT', 'SC', 'AUD', 'DF', 'SOL', 'SAM'].map((type) => {
                  const sib = siblings[type];
                  if (!sib || (type === 'AUD' && canDockAudio)) return null;
                  const isCurrent = !isSplit && (activeView === type || currentDoc.path === sib.path);
                  const labelMap = {
                    QP: ['Question Paper', 'QP'],
                    MS: ['Mark Scheme', 'MS'],
                    ER: ['Examiner Report', 'ER'],
                    GT: ['Thresholds', 'GT'],
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
                      aria-controls="preview-modal-tabpanel"
                      tabIndex={isCurrent ? 0 : -1}
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
                    aria-controls="preview-modal-tabpanel"
                    tabIndex={isSplit ? 0 : -1}
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

                  {isSplit && canSplitMs && canSplitSc && (
                    <button
                      type="button"
                      className={`modal-btn modal-swap-split-btn ${effectiveSplitRight === 'SC' ? 'active' : ''}`}
                      onClick={() => setSplitRightDocType((prev) => (prev === 'SC' ? 'MS' : 'SC'))}
                      aria-pressed={effectiveSplitRight === 'SC'}
                      title={effectiveSplitRight === 'SC' ? 'Switch second split pane to Mark Scheme' : `Switch second split pane to ${scSplitFullLabel}`}
                    >
                      <span className="btn-desktop-text">
                        {effectiveSplitRight === 'SC' ? 'Pane: Insert' : `With ${scSplitShortLabel}`}
                      </span>
                      <span className="btn-mobile-text" aria-hidden="true">
                        {effectiveSplitRight === 'SC' ? 'MS' : scSplitShortLabel}
                      </span>
                    </button>
                  )}

                  {isSplit && (
                    <button
                      type="button"
                      className={`modal-btn modal-swap-split-btn ${swapSplit ? 'active' : ''}`}
                      onClick={() => setSwapSplit((prev) => !prev)}
                      aria-pressed={swapSplit}
                      title={swapSplit ? 'Restore Question Paper left' : 'Swap left and right split pane positions'}
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

              {onToggleTheme && (
                <ThemeToggleButton
                  theme={theme}
                  onToggle={onToggleTheme}
                  className="modal-btn modal-theme-toggle-btn"
                  iconSize={13}
                  hideLabelOnMobile={true}
                  ariaLabel="Toggle Theme"
                />
              )}

              <button
                type="button"
                className="modal-btn modal-hide-header-btn"
                onClick={() => setHeaderVisible(false)}
                title="Hide header for distraction-free reading (Press H to restore)"
              >
                <span className="btn-desktop-text">Hide Header</span>
                <span className="btn-mobile-text" aria-hidden="true">Hide</span>
              </button>

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

              <a
                href={downloadUrl}
                download
                rel="noopener noreferrer"
                className="modal-btn modal-link-btn"
                title={isSingleSolutionZip ? 'Download full Solution Bank archive (.zip)' : 'Download document'}
                aria-label={isSingleSolutionZip ? 'Download full Solution Bank archive (.zip)' : 'Download document'}
              >
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className="btn-desktop-text">Download</span>
              </a>

              <button
                type="button"
                className="modal-close-btn desktop-only-close"
                onClick={handleCloseModal}
                aria-label="Close preview"
                title="Close Preview (Esc)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {audioDockOpen && canDockAudio && audSib && (
          <Suspense fallback={null}>
            <AudioPlayerDock
              mode="dock"
              file={file}
              currentDoc={currentDoc}
              audSib={audSib}
              audZipSib={audZipSib}
              audSingleSib={audSingleSib}
              onCloseDock={() => {
                stopAllSiteAudio();
                setAudioDockOpen(false);
              }}
            />
          </Suspense>
        )}

        <div
          id="preview-modal-tabpanel"
          role="tabpanel"
          aria-labelledby="preview-modal-title"
          ref={modalBodyRef}
          className={`modal-body ${file.isPendingSkeleton || file.isNotFound ? 'single-container' : isSplit ? 'split-container' : 'single-container'} ${isDragging ? 'is-resizing' : ''} ${!headerVisible ? 'header-hidden' : ''}`}
          style={{
            '--desktop-split-pct': `${desktopSplitRatio}%`,
            '--mobile-split-pct': `${mobileSplitRatio}%`
          }}
        >
          {file.isNotFound ? (
            <div className="modal-resource-card">
              <div className="modal-resource-box">
                <h3>Document Not Found in Archive</h3>
                <p>The requested study link could not be matched to a file in the current catalog ({file.path || file.name}).</p>
                <div className="modal-sol-error-actions">
                  <button type="button" className="modal-download-btn" onClick={handleCloseModal}>
                    Return to Archive
                  </button>
                </div>
              </div>
            </div>
          ) : file.isPendingSkeleton ? (
            <PdfPaneSkeleton
              title={`Loading ${modalTitle}...`}
              subtitle="Fetching examination paper directly into on-site reader"
            />
          ) : isSplit ? (
            <>
              <div className="modal-split-pane qp-pane">
                {swapSplit ? renderSplitPdfPane(effectiveSplitRight) : renderSplitPdfPane('QP')}
              </div>

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

              <div className="modal-split-pane ms-pane">
                {swapSplit ? renderSplitPdfPane('QP') : renderSplitPdfPane(effectiveSplitRight)}
              </div>
            </>
          ) : (
            <div className="modal-single-pane">
              {isSingleSolutionZip ? (
                <Suspense fallback={<PdfPaneSkeleton title={`Opening ${singleTitle}...`} subtitle="Loading Solution Bank Reader" />}>
                  <SolutionBankView
                    currentDoc={currentDoc}
                    solZipUrl={currentDoc.path ? getHfUrl(currentDoc.path) : ''}
                    singleTitle={singleTitle}
                    downloadUrl={downloadUrl}
                    isMobile={isMobile}
                  />
                </Suspense>
              ) : !isSinglePdf && (isSingleAudio || isSingleAudioZip) && !(audioDockOpen && canDockAudio) ? (
                <Suspense fallback={<PdfPaneSkeleton title={`Opening ${singleTitle}...`} subtitle="Loading Listening Audio Player" />}>
                  <AudioPlayerDock
                    mode="card"
                    file={file}
                    currentDoc={currentDoc}
                    singleTitle={singleTitle}
                    singleUrl={singleUrl}
                    downloadUrl={downloadUrl}
                    singleExt={singleExt}
                    isSingleAudio={isSingleAudio}
                    isSingleAudioZip={isSingleAudioZip}
                  />
                </Suspense>
              ) : !isSinglePdf ? (
                <ResourceCard
                  singleTitle={singleTitle}
                  currentDoc={currentDoc}
                  singleExt={singleExt}
                  downloadUrl={downloadUrl}
                />
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
                    autoFocus={false}
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
