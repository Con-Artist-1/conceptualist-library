import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import './styles/modal.css';
import { preloadPdfJsModule, consumePrewarmedPdfBytes } from './lib/pdfPrewarm.js';
import {
  LARGE_PDF_STREAM_THRESHOLD,
  STREAM_CHUNK_SIZE,
  createLargePdfRangeTransport
} from './lib/pdfRangeTransport.js';
import {
  SPREAD_MIN_PCT,
  SPREAD_MAX_PCT,
  getSpreadStartPage,
  computeSpreadLayout
} from './lib/pdfLayoutMath.js';
import { VirtualPdfPage } from './components/VirtualPdfPage.jsx';

// Track active panes across Split View for keyboard shortcuts
const mountedPaneIds = new Set();
let activePaneId = null;
let nextPaneSeq = 1;

export const PdfViewerPane = ({
  url = '',
  pdfData = null,
  downloadHref = '',
  downloadName = '',
  title,
  docType = 'QP',
  fileSize = 0,
  isMobile = false,
  initialPage = 1,
  onDownload = true,
  autoFocus = false,
  allowTwoPage = false,
  defaultTwoPage = false
}) => {
  const downloadUrl = downloadHref || (url ? (url.includes('?') ? `${url}&download=true` : `${url}?download=true`) : '');
  const paneIdRef = useRef(null);
  if (paneIdRef.current === null) {
    paneIdRef.current = nextPaneSeq++;
  }
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [defaultAspectRatio, setDefaultAspectRatio] = useState(1.414);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [inputPage, setInputPage] = useState(String(initialPage));
  const [scale, setScale] = useState('fit-width'); // 'fit-width' | 'fit-page' | number
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [streamStats, setStreamStats] = useState(null);
  const [firstPagePainted, setFirstPagePainted] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(() => (
    typeof window !== 'undefined' ? (isMobile ? Math.min(window.innerWidth, 390) : 640) : 640
  ));
  const [containerHeight, setContainerHeight] = useState(() => (
    typeof window !== 'undefined' ? Math.max(360, window.innerHeight - 100) : 680
  ));
  const [visiblePages, setVisiblePages] = useState(new Set([1, 2]));
  const [twoPageMode, setTwoPageMode] = useState(() => Boolean(allowTwoPage && defaultTwoPage));
  const [coverSpreadOffset, setCoverSpreadOffset] = useState(false);
  const [spreadSplitRatio, setSpreadSplitRatio] = useState(50);
  const [isDraggingSpread, setIsDraggingSpread] = useState(false);

  const isTwoPageActive = Boolean(allowTwoPage && twoPageMode && numPages > 1);

  useEffect(() => {
    const id = paneIdRef.current;
    mountedPaneIds.add(id);
    if (autoFocus || activePaneId === null) {
      activePaneId = id;
    }
    let rafId = null;
    if (autoFocus) {
      rafId = requestAnimationFrame(() => {
        const el = containerRef.current;
        if (el && !el.contains(document.activeElement)) {
          el.focus({ preventScroll: true });
        }
      });
    }
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      mountedPaneIds.delete(id);
      if (activePaneId === id) {
        activePaneId = mountedPaneIds.size > 0 ? Array.from(mountedPaneIds)[mountedPaneIds.size - 1] : null;
      }
    };
  }, [autoFocus]);

  const containerRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const spreadLayoutRef = useRef(null);
  const dragBadgeRef = useRef(null);
  const activeDragCleanupRef = useRef(null);
  const observerRef = useRef(null);

  const currentPageRef = useRef(currentPage);
  const initialPageRef = useRef(initialPage);
  const pendingInitialJumpRef = useRef(null);
  const pendingLayoutJumpRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const pendingZoomAnchorRef = useRef(null);
  const pageInputRef = useRef(null);
  const userToggledTwoPageRef = useRef(false);
  const allowTwoPageRef = useRef(allowTwoPage);
  const defaultTwoPageRef = useRef(defaultTwoPage);
  const twoPageModeRef = useRef(Boolean(allowTwoPage && twoPageMode));
  const isTwoPageActiveRef = useRef(isTwoPageActive);
  const coverSpreadOffsetRef = useRef(coverSpreadOffset);
  const spreadRatioRef = useRef(spreadSplitRatio);

  useEffect(() => {
    initialPageRef.current = initialPage;
  }, [initialPage]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    allowTwoPageRef.current = allowTwoPage;
    defaultTwoPageRef.current = defaultTwoPage;
  }, [allowTwoPage, defaultTwoPage]);

  useEffect(() => {
    twoPageModeRef.current = Boolean(allowTwoPage && twoPageMode);
    isTwoPageActiveRef.current = isTwoPageActive;
  }, [allowTwoPage, twoPageMode, isTwoPageActive]);

  useEffect(() => {
    coverSpreadOffsetRef.current = coverSpreadOffset;
  }, [coverSpreadOffset]);

  useEffect(() => {
    spreadRatioRef.current = spreadSplitRatio;
  }, [spreadSplitRatio]);

  // Reset two-page & split state cleanly when switching documents
  useEffect(() => {
    userToggledTwoPageRef.current = false;
    setTwoPageMode(Boolean(allowTwoPageRef.current && defaultTwoPageRef.current));
    setCoverSpreadOffset(false);
    coverSpreadOffsetRef.current = false;
    setSpreadSplitRatio(50);
    spreadRatioRef.current = 50;
  }, [url, pdfData]);

  // Sync if allowTwoPage or defaultTwoPage changes before user manually toggles
  useEffect(() => {
    if (!allowTwoPage) {
      setTwoPageMode(false);
    } else if (!userToggledTwoPageRef.current) {
      setTwoPageMode(Boolean(defaultTwoPage));
    }
  }, [allowTwoPage, defaultTwoPage]);

  // Cleanup any active drag listeners on unmount
  useEffect(() => () => {
    if (activeDragCleanupRef.current) {
      activeDragCleanupRef.current();
      activeDragCleanupRef.current = null;
    }
  }, []);

  // Synchronously measure initial scroll stage dimensions before first paint to avoid resize jump
  useLayoutEffect(() => {
    const el = scrollAreaRef.current || containerRef.current;
    if (el && el.clientWidth > 80) {
      const nextW = el.clientWidth;
      const nextH = el.clientHeight;
      setContainerWidth((prev) => (Math.abs(prev - nextW) >= 1 ? nextW : prev));
      if (nextH > 120) {
        setContainerHeight((prev) => (Math.abs(prev - nextH) >= 1 ? nextH : prev));
      }
    }
  }, []);

  // ResizeObserver on inner scroll stage (excludes vertical scrollbar width) with 80ms debounce during drag resize
  useEffect(() => {
    const target = scrollAreaRef.current || containerRef.current;
    if (!target) return;
    let timerId = null;
    let hasMeasured = false;

    const applyDimensions = () => {
      const el = scrollAreaRef.current || containerRef.current;
      if (el && el.clientWidth > 0) {
        const nextW = el.clientWidth;
        const nextH = el.clientHeight;
        setContainerWidth((prev) => (Math.abs(prev - nextW) >= 1 ? nextW : prev));
        if (nextH > 120) {
          setContainerHeight((prev) => (Math.abs(prev - nextH) >= 1 ? nextH : prev));
        }
        hasMeasured = true;
      }
    };

    applyDimensions();
    const observer = new ResizeObserver(() => {
      if (!hasMeasured) {
        applyDimensions();
        return;
      }
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(applyDimensions, 80);
    });
    observer.observe(target);
    return () => {
      if (timerId) clearTimeout(timerId);
      observer.disconnect();
    };
  }, []);

  // Record anchor coordinates so zoom & split resize preserve focal reading position
  const recordZoomAnchor = useCallback((customAnchorX, customAnchorY) => {
    const el = scrollAreaRef.current;
    if (!el) return;

    const anchorX = typeof customAnchorX === 'number' ? customAnchorX : el.clientWidth / 2;
    const anchorY = typeof customAnchorY === 'number' ? customAnchorY : el.clientHeight / 2;

    const contentX = el.scrollLeft + anchorX;
    const contentY = el.scrollTop + anchorY;

    pendingZoomAnchorRef.current = {
      anchorX,
      anchorY,
      contentXFraction: contentX / Math.max(el.scrollWidth, 1),
      contentYFraction: contentY / Math.max(el.scrollHeight, 1)
    };
  }, []);

  // Synchronously adjust scroll position during layout phase before paint
  useLayoutEffect(() => {
    if (!pendingZoomAnchorRef.current || !scrollAreaRef.current) return;
    const { anchorX, anchorY, contentXFraction, contentYFraction } = pendingZoomAnchorRef.current;
    pendingZoomAnchorRef.current = null;

    const el = scrollAreaRef.current;
    const newScrollWidth = el.scrollWidth;
    const newScrollHeight = el.scrollHeight;

    const newContentX = contentXFraction * newScrollWidth;
    const newContentY = contentYFraction * newScrollHeight;

    const targetLeft = Math.max(0, Math.round(newContentX - anchorX));
    const targetTop = Math.max(0, Math.round(newContentY - anchorY));

    el.scrollLeft = targetLeft;
    el.scrollTop = targetTop;
  }, [scale, containerWidth, spreadSplitRatio]);

  const spreadLayout = useMemo(() => {
    if (!isTwoPageActive) return null;
    return computeSpreadLayout(
      containerWidth,
      containerHeight,
      scale,
      spreadSplitRatio,
      defaultAspectRatio,
      isMobile
    );
  }, [isTwoPageActive, containerWidth, containerHeight, scale, spreadSplitRatio, defaultAspectRatio, isMobile]);

  const getCurrentBaseScale = useCallback((prevScale) => {
    if (typeof prevScale === 'number') return prevScale;
    if (prevScale === 'fit-page') {
      if (isTwoPageActive) {
        const layout = computeSpreadLayout(
          containerWidth,
          containerHeight,
          'fit-page',
          spreadSplitRatio,
          defaultAspectRatio,
          isMobile
        );
        return Math.max(0.4, Math.min(1.0, Number(layout.leftWidthFraction.toFixed(2))));
      }
      const safeW = Math.max(containerWidth - (isMobile ? 16 : 36), 200);
      return Math.max(0.4, Math.min(1.0, Number((Math.min(safeW, 640) / safeW).toFixed(2))));
    }
    return 1.0;
  }, [containerWidth, containerHeight, isMobile, isTwoPageActive, spreadSplitRatio, defaultAspectRatio]);

  // High-performance two-page split divider drag (updates CSS directly at 60fps, commits sharp canvas redraw on release)
  const handleSpreadDragStart = useCallback((e) => {
    if (!e.touches && e.cancelable) e.preventDefault();
    e.stopPropagation();
    setIsDraggingSpread(true);

    if (dragBadgeRef.current) {
      const r = Math.round(spreadRatioRef.current);
      dragBadgeRef.current.textContent = `${r}% / ${100 - r}%`;
    }

    const onMove = (moveEvent) => {
      if (!spreadLayoutRef.current) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const rect = spreadLayoutRef.current.getBoundingClientRect();
      if (!rect.width) return;
      const clientX =
        moveEvent.touches && moveEvent.touches.length > 0
          ? moveEvent.touches[0].clientX
          : moveEvent.clientX;
      const pct = Math.max(
        SPREAD_MIN_PCT,
        Math.min(SPREAD_MAX_PCT, ((clientX - rect.left) / rect.width) * 100)
      );
      spreadRatioRef.current = pct;
      spreadLayoutRef.current.style.setProperty('--spread-split-pct', `${pct}%`);
      if (dragBadgeRef.current) {
        const rounded = Math.round(pct);
        dragBadgeRef.current.textContent = `${rounded}% / ${100 - rounded}%`;
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      activeDragCleanupRef.current = null;
    };

    const onEnd = () => {
      cleanup();
      recordZoomAnchor();
      setIsDraggingSpread(false);
      setSpreadSplitRatio(Number(spreadRatioRef.current.toFixed(2)));
    };

    activeDragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  }, [recordZoomAnchor]);

  const handleResetSpreadSplit = useCallback(() => {
    recordZoomAnchor();
    spreadRatioRef.current = 50;
    if (spreadLayoutRef.current) {
      spreadLayoutRef.current.style.setProperty('--spread-split-pct', '50%');
    }
    setSpreadSplitRatio(50);
  }, [recordZoomAnchor]);

  const handleSpreadResizerKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Home' || e.key === 'End') {
        handleResetSpreadSplit();
        return;
      }
      const delta = e.key === 'ArrowLeft' ? -5 : 5;
      recordZoomAnchor();
      setSpreadSplitRatio((prev) => {
        const next = Math.max(SPREAD_MIN_PCT, Math.min(SPREAD_MAX_PCT, Math.round(prev + delta)));
        spreadRatioRef.current = next;
        if (spreadLayoutRef.current) {
          spreadLayoutRef.current.style.setProperty('--spread-split-pct', `${next}%`);
        }
        return next;
      });
    }
  }, [handleResetSpreadSplit, recordZoomAnchor]);

  // Ctrl + MouseWheel / Trackpad pinch zoom centered on mouse hover position
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const mouseX = Math.max(0, Math.min(el.clientWidth, e.clientX - rect.left));
        const mouseY = Math.max(0, Math.min(el.clientHeight, e.clientY - rect.top));

        recordZoomAnchor(mouseX, mouseY);

        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        setScale((prev) => {
          const currentNumeric = getCurrentBaseScale(prev);
          return Math.max(0.4, Math.min(3.5, Number((currentNumeric + delta).toFixed(2))));
        });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [recordZoomAnchor, getCurrentBaseScale]);

  // Fetch and parse document with PDF.js (byte-range streaming for >= 5 MB PDFs; in-memory data or single-pass for smaller papers)
  const loadDocument = useCallback(() => {
    if (!url && !pdfData) return;
    let active = true;
    let loadingTask = null;
    let loadedDoc = null;
    let activeTransport = null;
    const bootCtrl = new AbortController();
    const shouldStreamLargePdf = !pdfData && Number(fileSize) >= LARGE_PDF_STREAM_THRESHOLD;

    setLoading(true);
    setDownloadProgress(null);
    setStreamStats(shouldStreamLargePdf ? { loadedBytes: 0, totalBytes: Number(fileSize) } : null);
    setFirstPagePainted(false);
    setRotation(0);
    setLoadError(null);
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0;
      scrollAreaRef.current.scrollLeft = 0;
    }
    setPdfDoc((prev) => {
      if (prev) {
        try { prev.destroy(); } catch { /* ignore teardown error */ }
      }
      return null;
    });

    preloadPdfJsModule().then(async (pdfjsLib) => {
      if (!active) return;

      if (shouldStreamLargePdf) {
        try {
          const streamSetup = await createLargePdfRangeTransport(
            pdfjsLib,
            url,
            bootCtrl.signal,
            (loadedBytes, totalBytes) => {
              if (!active) return;
              setStreamStats({ loadedBytes, totalBytes });
            },
            (rangeErr) => {
              if (!active) return;
              console.error('[WebPDF] Streaming failure for URL', url, rangeErr);
              try { activeTransport?.abort(); } catch { /* ignore abort error */ }
              try { loadingTask?.destroy(); } catch { /* ignore teardown error */ }
              setLoadError(rangeErr?.message || 'Failed to stream PDF preview');
              setLoading(false);
            }
          );
          if (!active) {
            try { streamSetup?.transport?.abort(); } catch { /* ignore abort error */ }
            return;
          }
          if (streamSetup?.transport) {
            activeTransport = streamSetup.transport;
          } else {
            setStreamStats(null);
          }
        } catch (bootErr) {
          if (!active || bootErr?.name === 'AbortError') return;
          console.warn('[WebPDF] Range bootstrap fell back to standard load:', bootErr);
          setStreamStats(null);
        }
      }

      if (!active) return;

      let prewarmedBytes = null;
      if (!activeTransport && !pdfData && url) {
        const preBytesPromise = consumePrewarmedPdfBytes(url);
        if (preBytesPromise) {
          try {
            prewarmedBytes = await preBytesPromise;
          } catch {
            prewarmedBytes = null;
          }
          if (!active) return;
        }
      }

      const pdfVerbosity = pdfjsLib.VerbosityLevel?.ERRORS ?? 0;
      const inMemoryData = pdfData ? pdfData.slice() : prewarmedBytes;
      const localCmapUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/pdfjs/cmaps/` : '/pdfjs/cmaps/';
      loadingTask = pdfjsLib.getDocument(
        activeTransport
          ? {
            range: activeTransport,
            length: activeTransport.length,
            rangeChunkSize: activeTransport.chunkSize || STREAM_CHUNK_SIZE,
            disableAutoFetch: true,
            disableStream: true,
            cMapUrl: localCmapUrl,
            cMapPacked: true,
            enableXfa: false,
            verbosity: pdfVerbosity
          }
          : inMemoryData
            ? {
              data: inMemoryData,
              cMapUrl: localCmapUrl,
              cMapPacked: true,
              enableXfa: false,
              verbosity: pdfVerbosity
            }
            : {
              url,
              cMapUrl: localCmapUrl,
              cMapPacked: true,
              enableXfa: false,
              disableAutoFetch: false,
              rangeChunkSize: 262144,
              verbosity: pdfVerbosity
            }
      );

      if (!activeTransport && !inMemoryData) {
        loadingTask.onProgress = (progressData) => {
          if (!active || !progressData) return;
          if (typeof progressData.total === 'number' && progressData.total > 0) {
            const pct = Math.min(99, Math.max(0, Math.round((progressData.loaded / progressData.total) * 100)));
            setDownloadProgress(pct);
          }
        };
      }

      loadingTask.promise.then(async (doc) => {
        if (!active) {
          try { doc.destroy(); } catch { /* ignore teardown error */ }
          return;
        }
        if (activeTransport) {
          activeTransport.docReady = true;
        }
        loadedDoc = doc;

        // Fetch page 1 dimensions BEFORE mounting pages so all placeholders have exact heights in 1 render
        let measuredRatio = null;
        try {
          const p1 = await doc.getPage(1);
          if (!active) {
            try { doc.destroy(); } catch { /* ignore teardown error */ }
            return;
          }
          const vp = p1.getViewport({ scale: 1 });
          if (vp && vp.width > 0) {
            measuredRatio = vp.height / vp.width;
          }
        } catch {
          // Fallback to default ratio if page 1 probe fails
        }

        if (!active) return;
        const requestedStart = Number(initialPageRef.current) || 1;
        const rawStartPage = Math.max(1, Math.min(requestedStart, doc.numPages || 1));
        const willBeTwoPage = Boolean(twoPageModeRef.current && doc.numPages > 1);
        const startPage = willBeTwoPage ? getSpreadStartPage(rawStartPage, coverSpreadOffsetRef.current) : rawStartPage;
        const initialWindow = new Set([startPage]);
        if (willBeTwoPage && startPage + 1 <= doc.numPages) {
          initialWindow.add(startPage + 1);
        }

        pendingInitialJumpRef.current = startPage > 1 ? startPage : null;
        if (measuredRatio) {
          setDefaultAspectRatio(measuredRatio);
        }
        if (scrollAreaRef.current && startPage <= 1) {
          scrollAreaRef.current.scrollTop = 0;
          scrollAreaRef.current.scrollLeft = 0;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(startPage);
        setInputPage(String(startPage));
        setVisiblePages(initialWindow);
        setDownloadProgress(100);
        setLoading(false);
      }).catch((err) => {
        if (!active) return;
        console.error('[WebPDF] Load error for URL', url, err);
        setLoadError(err?.message || 'Failed to stream PDF preview');
        setLoading(false);
      });
    }).catch((err) => {
      if (!active) return;
      console.warn('[WebPDF] Failed to initialize PDF.js engine:', err);
      setLoadError('Failed to load WebPDF engine');
      setLoading(false);
    });

    return () => {
      active = false;
      try { bootCtrl.abort(); } catch { /* ignore abort error */ }
      if (activeTransport) {
        try { activeTransport.abort(); } catch { /* ignore abort error */ }
      }
      if (loadingTask) {
        try { loadingTask.destroy(); } catch { /* ignore teardown error */ }
      }
      if (loadedDoc) {
        try { loadedDoc.destroy(); } catch { /* ignore teardown error */ }
      }
    };
  }, [url, pdfData, fileSize]);

  useEffect(() => {
    const cleanup = loadDocument();
    return () => {
      if (cleanup) cleanup();
    };
  }, [loadDocument]);

  // Setup IntersectionObserver for smooth progressive page rendering with bounded canvas memory
  useEffect(() => {
    if (!scrollAreaRef.current || !pdfDoc || numPages === 0) return;

    if (observerRef.current) observerRef.current.disconnect();

    const root = scrollAreaRef.current;
    observerRef.current = new IntersectionObserver((entries) => {
      setVisiblePages((prev) => {
        const next = new Set(prev);
        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute('data-page-number'), 10);
          if (entry.isIntersecting) {
            next.add(pageNum);
            // Preload neighbors for instant smooth scrolling
            if (isTwoPageActive) {
              for (let d = -2; d <= 3; d++) {
                const candidate = pageNum + d;
                if (candidate >= 1 && candidate <= numPages) next.add(candidate);
              }
            } else {
              if (pageNum + 1 <= numPages) next.add(pageNum + 1);
              if (pageNum - 1 >= 1) next.add(pageNum - 1);
            }
          } else {
            next.delete(pageNum);
          }
        });
        return next;
      });
    }, {
      root,
      rootMargin: '600px 0px 600px 0px',
      threshold: [0.01, 0.4]
    });

    const pageEls = root.querySelectorAll('.pdf-page-container');
    pageEls.forEach((el) => observerRef.current.observe(el));

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [pdfDoc, numPages, isTwoPageActive]);

  // Precise focal-line scroll listener for current page indicator
  useEffect(() => {
    const scrollEl = scrollAreaRef.current;
    if (!scrollEl || numPages === 0) return;

    let rafId = null;
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const scrollTop = scrollEl.scrollTop;
        const clientHeight = scrollEl.clientHeight;
        const scrollHeight = scrollEl.scrollHeight;

        // Edge case: top of document
        if (scrollTop <= 15) {
          if (currentPageRef.current !== 1) {
            currentPageRef.current = 1;
            setCurrentPage(1);
            if (document.activeElement !== pageInputRef.current) {
              setInputPage('1');
            }
          }
          return;
        }

        // Edge case: bottom of document
        if (scrollTop + clientHeight >= scrollHeight - 20) {
          const bottomPage = isTwoPageActive ? getSpreadStartPage(numPages, coverSpreadOffsetRef.current) : numPages;
          if (currentPageRef.current !== bottomPage) {
            currentPageRef.current = bottomPage;
            setCurrentPage(bottomPage);
            if (document.activeElement !== pageInputRef.current) {
              setInputPage(String(bottomPage));
            }
          }
          return;
        }

        const scrollRect = scrollEl.getBoundingClientRect();
        const focalClientY = scrollRect.top + clientHeight * 0.35;
        const selector = isTwoPageActive ? '.pdf-spread-row' : '.pdf-page-container';
        const els = scrollEl.querySelectorAll(selector);
        for (let i = 0; i < els.length; i++) {
          const el = els[i];
          const rect = el.getBoundingClientRect();
          if (rect.top <= focalClientY && rect.bottom >= focalClientY) {
            const pageNum = parseInt(
              el.getAttribute(isTwoPageActive ? 'data-spread-start' : 'data-page-number'),
              10
            );
            if (pageNum && pageNum !== currentPageRef.current) {
              currentPageRef.current = pageNum;
              setCurrentPage(pageNum);
              if (document.activeElement !== pageInputRef.current) {
                setInputPage(String(pageNum));
              }
            }
            break;
          }
        }
      });
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [numPages, isTwoPageActive]);

  // Reliable Jump to Page (smooth nearby stepping; instant jump across distant pages so streaming skips intermediate pages)
  const scrollToPage = useCallback((pageNum, smooth = true) => {
    const prevPage = currentPageRef.current;
    const rawClamped = Math.max(1, Math.min(pageNum, numPages || 1));
    const clamped = isTwoPageActiveRef.current ? getSpreadStartPage(rawClamped, coverSpreadOffsetRef.current) : rawClamped;
    const isFarJump = Math.abs(clamped - prevPage) > (isTwoPageActiveRef.current ? 6 : 4);
    currentPageRef.current = clamped;
    setCurrentPage(clamped);
    setInputPage(String(clamped));
    if (isFarJump) {
      setVisiblePages(() => {
        const next = new Set([clamped]);
        if (clamped + 1 <= (numPages || clamped)) next.add(clamped + 1);
        if (isTwoPageActiveRef.current && clamped + 2 <= (numPages || clamped)) next.add(clamped + 2);
        if (clamped - 1 >= 1) next.add(clamped - 1);
        return next;
      });
    }

    const scrollEl = scrollAreaRef.current;
    if (!scrollEl) return;
    const targetEl = isTwoPageActiveRef.current
      ? scrollEl.querySelector(`[data-spread-start="${clamped}"]`) || scrollEl.querySelector(`[data-page-number="${rawClamped}"]`)
      : scrollEl.querySelector(`[data-page-number="${clamped}"]`);
    if (targetEl) {
      isProgrammaticScrollRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      const scrollRect = scrollEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const targetTop = Math.max(0, Math.round(targetRect.top - scrollRect.top + scrollEl.scrollTop - 18));
      scrollEl.scrollTo({
        top: targetTop,
        behavior: smooth && !isFarJump ? 'smooth' : 'auto'
      });

      scrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, isFarJump ? 150 : 600);
    }
  }, [numPages]);

  const handleStepPage = useCallback((direction) => {
    if (!isTwoPageActiveRef.current) {
      scrollToPage(currentPageRef.current + direction);
      return;
    }
    const useCover = coverSpreadOffsetRef.current;
    const base = getSpreadStartPage(currentPageRef.current, useCover);
    if (useCover) {
      if (base === 1 && direction > 0) {
        scrollToPage(2);
        return;
      }
      if (base === 2 && direction < 0) {
        scrollToPage(1);
        return;
      }
    }
    scrollToPage(base + direction * 2);
  }, [scrollToPage]);

  const handleToggleTwoPage = useCallback(() => {
    if (!allowTwoPage || numPages <= 1) return;
    const anchorPage = currentPageRef.current || 1;
    userToggledTwoPageRef.current = true;
    setTwoPageMode((prev) => {
      const next = !prev;
      const target = next ? getSpreadStartPage(anchorPage, coverSpreadOffsetRef.current) : anchorPage;
      pendingLayoutJumpRef.current = target;
      setVisiblePages(() => {
        const seed = new Set([target]);
        if (target + 1 <= numPages) seed.add(target + 1);
        if (next && target + 2 <= numPages) seed.add(target + 2);
        if (target - 1 >= 1) seed.add(target - 1);
        return seed;
      });
      return next;
    });
  }, [allowTwoPage, numPages]);

  const handleToggleCoverOffset = useCallback(() => {
    if (!isTwoPageActive || numPages <= 2) return;
    const anchorPage = currentPageRef.current || 1;
    setCoverSpreadOffset((prev) => {
      const next = !prev;
      coverSpreadOffsetRef.current = next;
      const target = getSpreadStartPage(anchorPage, next);
      pendingLayoutJumpRef.current = target;
      setVisiblePages(() => {
        const seed = new Set([target]);
        if (target + 1 <= numPages) seed.add(target + 1);
        if (target + 2 <= numPages) seed.add(target + 2);
        if (target - 1 >= 1) seed.add(target - 1);
        return seed;
      });
      return next;
    });
  }, [isTwoPageActive, numPages]);

  // Preserve reading position cleanly when toggling between 1-Page, 2-Page, and Cover Offset layouts
  useEffect(() => {
    const target = pendingLayoutJumpRef.current;
    if (!loading && numPages > 0 && target) {
      pendingLayoutJumpRef.current = null;
      const raf = requestAnimationFrame(() => scrollToPage(target, false));
      return () => cancelAnimationFrame(raf);
    }
  }, [isTwoPageActive, coverSpreadOffset, loading, numPages, scrollToPage]);

  const handleInputPageCommit = () => {
    const parsed = parseInt(inputPage, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= numPages) {
      scrollToPage(parsed);
    } else {
      setInputPage(String(currentPageRef.current));
    }
  };

  // Scroll to requested initialPage once document pages are mounted
  useEffect(() => {
    const target = pendingInitialJumpRef.current;
    if (!loading && numPages > 0 && target && target > 1) {
      pendingInitialJumpRef.current = null;
      const raf = requestAnimationFrame(() => scrollToPage(target, false));
      return () => cancelAnimationFrame(raf);
    }
  }, [loading, numPages, scrollToPage]);

  // Safety reveal if a page takes unusually long after metadata resolves
  useEffect(() => {
    if (loading || firstPagePainted || loadError) return;
    const t = setTimeout(() => setFirstPagePainted(true), 2200);
    return () => clearTimeout(t);
  }, [loading, firstPagePainted, loadError]);

  const handlePageRendered = useCallback(() => {
    setFirstPagePainted(true);
  }, []);

  const handleRotateClockwise = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Zoom handlers (zoom centered to the middle of the screen)
  const handleZoomIn = useCallback(() => {
    recordZoomAnchor();
    setScale((prev) => {
      const current = getCurrentBaseScale(prev);
      if (prev === 'fit-width') return 1.25;
      return Math.min(Number((current + 0.2).toFixed(2)), 3.5);
    });
  }, [recordZoomAnchor, getCurrentBaseScale]);

  const handleZoomOut = useCallback(() => {
    recordZoomAnchor();
    setScale((prev) => {
      const current = getCurrentBaseScale(prev);
      if (prev === 'fit-width') return 0.85;
      return Math.max(Number((current - 0.2).toFixed(2)), 0.4);
    });
  }, [recordZoomAnchor, getCurrentBaseScale]);

  const handleFitWidth = () => {
    recordZoomAnchor();
    setScale('fit-width');
  };

  const handleFitPage = () => {
    recordZoomAnchor();
    setScale('fit-page');
  };

  // Zoom display label
  const zoomDisplay = useMemo(() => {
    if (scale === 'fit-width') return 'Fit';
    if (scale === 'fit-page') return 'Page';
    return `${Math.round(scale * 100)}%`;
  }, [scale]);

  // Keyboard navigation shortcuts scoped to the focused/active pane (safe in Split View & Resizer focus)
  useEffect(() => {
    const paneId = paneIdRef.current;
    const handleKeyDown = (e) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (mountedPaneIds.size > 1 && activePaneId !== paneId) return;
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl?.isContentEditable) return;
      if (activeEl?.getAttribute?.('role') === 'separator') return;
      if (activeEl?.getAttribute?.('role') === 'tab' || activeEl?.closest?.('.modal-header')) return;
      if ((tag === 'BUTTON' || tag === 'A') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) return;

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handleStepPage(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        handleStepPage(1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        scrollToPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        scrollToPage(numPages || 1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, scrollToPage, handleStepPage, handleZoomIn, handleZoomOut]);

  // Page Array & Spread Rows
  const pagesList = useMemo(() => {
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }, [numPages]);

  const spreadRows = useMemo(() => {
    if (!isTwoPageActive || numPages <= 0) return [];
    const rows = [];
    if (coverSpreadOffset) {
      rows.push([1, null]);
      for (let p = 2; p <= numPages; p += 2) {
        rows.push([p, p + 1 <= numPages ? p + 1 : null]);
      }
    } else {
      for (let p = 1; p <= numPages; p += 2) {
        rows.push([p, p + 1 <= numPages ? p + 1 : null]);
      }
    }
    return rows;
  }, [isTwoPageActive, numPages, coverSpreadOffset]);

  const currentSpreadStart = isTwoPageActive ? getSpreadStartPage(currentPage, coverSpreadOffset) : currentPage;
  const currentSpreadPartner =
    isTwoPageActive && !(coverSpreadOffset && currentSpreadStart === 1) && currentSpreadStart + 1 <= numPages
      ? currentSpreadStart + 1
      : null;
  const isAtFirstPage = currentSpreadStart <= 1;
  const isAtLastPage = isTwoPageActive
    ? (coverSpreadOffset && currentSpreadStart === 1 ? numPages <= 1 : currentSpreadStart + 1 >= numPages)
    : currentPage >= numPages;
  const isLargePdfDoc = !pdfData && Number(fileSize) >= LARGE_PDF_STREAM_THRESHOLD;

  const markPaneActive = () => {
    activePaneId = paneIdRef.current;
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="region"
      aria-label={`PDF Viewer: ${title || docType}`}
      className={`custom-pdf-pane ${isMobile ? 'mobile-mode' : ''} ${isTwoPageActive ? 'two-page-mode' : ''} ${isDraggingSpread ? 'is-resizing-spread' : ''}`}
      onMouseEnter={markPaneActive}
      onPointerDown={markPaneActive}
      onFocus={markPaneActive}
    >
      {/* Pane Toolbar */}
      <div className="pdf-pane-toolbar">
        <div className="pdf-pane-badge-group">
          <span className={`pdf-doc-badge ${docType.toLowerCase()}`}>
            {docType}
          </span>
          <span className="pdf-pane-title" title={title}>{title}</span>
        </div>

        {/* Page Nav */}
        <div className="pdf-pane-nav">
          <button
            type="button"
            className="pdf-tool-btn"
            disabled={isAtFirstPage || loading}
            onClick={() => handleStepPage(-1)}
            title={isTwoPageActive ? 'Previous Spread (2 Pages)' : 'Previous Page'}
            aria-label={isTwoPageActive ? 'Previous Spread' : 'Previous Page'}
          >
            ‹
          </button>
          <span className="pdf-page-indicator">
            <input
              ref={pageInputRef}
              type="text"
              className="pdf-page-input"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={handleInputPageCommit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleInputPageCommit();
                  e.currentTarget.blur();
                }
              }}
              aria-label="Current Page"
            />
            <span className="pdf-page-total">
              {currentSpreadPartner ? `–${currentSpreadPartner} ` : ''}/ {numPages || '–'}
            </span>
          </span>
          <button
            type="button"
            className="pdf-tool-btn"
            disabled={isAtLastPage || loading}
            onClick={() => handleStepPage(1)}
            title={isTwoPageActive ? 'Next Spread (2 Pages)' : 'Next Page'}
            aria-label={isTwoPageActive ? 'Next Spread' : 'Next Page'}
          >
            ›
          </button>
        </div>

        {/* Zoom & Action Tools */}
        <div className="pdf-pane-tools">
          {allowTwoPage && (
            <>
              <button
                type="button"
                className={`pdf-tool-btn pdf-two-page-btn ${isTwoPageActive ? 'active' : ''}`}
                disabled={loading || numPages <= 1}
                onClick={handleToggleTwoPage}
                aria-pressed={isTwoPageActive}
                title={
                  numPages <= 1 && !loading
                    ? 'Two-page view requires at least 2 pages'
                    : isTwoPageActive
                      ? 'Switch to Single Page View (currently 2-Page Side-by-Side)'
                      : 'Switch to 2-Page Side-by-Side View (with resizable divider)'
                }
                aria-label={isTwoPageActive ? 'Switch to Single Page View' : 'Switch to Two-Page View'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="4" width="8.5" height="16" rx="1.5" />
                  <rect x="13.5" y="4" width="8.5" height="16" rx="1.5" />
                </svg>
                <span className="pdf-two-page-label">2-Page</span>
              </button>
              {isTwoPageActive && numPages > 2 && (
                <button
                  type="button"
                  className={`pdf-tool-btn pdf-cover-offset-btn ${coverSpreadOffset ? 'active' : ''}`}
                  onClick={handleToggleCoverOffset}
                  aria-pressed={coverSpreadOffset}
                  title={
                    coverSpreadOffset
                      ? 'Cover page solo active (Page 1 solo, then 2–3, 4–5). Click for standard 1–2, 3–4 pairing.'
                      : 'Offset Page 1 as solo Cover (pairs 2–3, 4–5 for book spreads)'
                  }
                  aria-label="Toggle solo cover page pairing"
                >
                  <span>Cover</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            className="pdf-tool-btn"
            onClick={handleZoomOut}
            title="Zoom Out (or Ctrl + Scroll)"
            aria-label="Zoom Out"
          >
            −
          </button>
          <button
            type="button"
            className={`pdf-tool-btn text-btn ${scale === 'fit-width' ? 'active' : ''}`}
            onClick={scale === 'fit-width' ? handleFitPage : handleFitWidth}
            title={scale === 'fit-width' ? 'Fit to Page' : 'Fit to Width'}
          >
            {zoomDisplay}
          </button>
          <button
            type="button"
            className="pdf-tool-btn"
            onClick={handleZoomIn}
            title="Zoom In (or Ctrl + Scroll)"
            aria-label="Zoom In"
          >
            +
          </button>

          <button
            type="button"
            className={`pdf-tool-btn ${rotation !== 0 ? 'active' : ''}`}
            onClick={handleRotateClockwise}
            title={`Rotate Page 90° (${rotation}°)`}
            aria-label="Rotate Page 90 Degrees"
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>

          {onDownload && downloadUrl && (
            <a
              href={downloadUrl}
              download={downloadName || true}
              rel="noopener noreferrer"
              className="pdf-tool-btn open-tab-btn"
              title={downloadName ? `Download ${downloadName}` : 'Download PDF'}
              aria-label={downloadName ? `Download ${downloadName}` : 'Download PDF'}
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Main PDF Scrollable Stage */}
      <div
        ref={scrollAreaRef}
        className={`pdf-scroll-stage ${scale === 'fit-width' || scale === 'fit-page' || (typeof scale === 'number' && scale <= 1) ? 'fit-mode' : ''} ${isTwoPageActive ? 'two-page-stage' : ''}`}
      >
        {(loading || !firstPagePainted) && !loadError && (
          <div className="pdf-loading-overlay">
            <div className="pdf-loading-card">
              <div className="pdf-loading-bar-track">
                {streamStats ? (
                  <div className="pdf-loading-bar-fill" />
                ) : typeof downloadProgress === 'number' ? (
                  <div
                    className="pdf-loading-bar-fill determinate"
                    style={{ width: `${Math.max(8, downloadProgress)}%` }}
                  />
                ) : (
                  <div className="pdf-loading-bar-fill" />
                )}
              </div>
              <div className="pdf-loading-title">
                {streamStats
                  ? (loading ? 'Streaming Pages...' : 'Rendering Document')
                  : typeof downloadProgress === 'number' && downloadProgress < 100
                    ? `Downloading Document (${downloadProgress}%)`
                    : 'Rendering Document'}
              </div>
              <div className="pdf-loading-subtext">
                {streamStats && streamStats.loadedBytes > 0
                  ? `Streaming ${(streamStats.loadedBytes / 1048576).toFixed(1)} MB...`
                  : (title || 'Preparing vector pages...')}
              </div>
            </div>
          </div>
        )}

        {loadError && (
          <div className="pdf-error-overlay">
            <div className="pdf-error-title">Unable to preview document directly</div>
            <div className="pdf-error-desc">{loadError}</div>
            <div className="pdf-error-actions">
              <button
                type="button"
                className="modal-action-link"
                onClick={loadDocument}
              >
                Retry
              </button>
              {(downloadUrl || url) && (
                <a
                  href={downloadUrl || url}
                  download={downloadName || true}
                  rel="noopener noreferrer"
                  className="modal-action-link"
                >
                  Download
                </a>
              )}
            </div>
          </div>
        )}

        {!loading && !loadError && isTwoPageActive && spreadLayout ? (
          <div
            ref={spreadLayoutRef}
            className={`pdf-spread-layout ${isDraggingSpread ? 'is-dragging' : ''}`}
            style={{
              '--spread-split-pct': `${spreadSplitRatio}%`,
              width: spreadLayout.isZoomedIn ? `${spreadLayout.stageWidth}px` : '100%'
            }}
          >
            <div className="pdf-spread-rows">
              {spreadRows.map(([leftPage, rightPage]) => (
                <div
                  key={`spread-${leftPage}`}
                  className="pdf-spread-row"
                  data-spread-start={leftPage}
                >
                  <div className="pdf-spread-cell left">
                    <VirtualPdfPage
                      key={leftPage}
                      pdfDoc={pdfDoc}
                      pageNum={leftPage}
                      scale={scale}
                      rotation={rotation}
                      containerWidth={containerWidth}
                      targetWidthOverride={spreadLayout.leftTargetWidth}
                      fluidWidthFraction={spreadLayout.leftWidthFraction}
                      isVisible={
                        visiblePages.has(leftPage) &&
                        (firstPagePainted || leftPage === currentSpreadStart)
                      }
                      isNear={firstPagePainted && Math.abs(leftPage - currentSpreadStart) <= 3}
                      isMobile={isMobile}
                      isLargePdf={isLargePdfDoc}
                      defaultAspectRatio={defaultAspectRatio}
                      onPageRendered={handlePageRendered}
                    />
                  </div>
                  <div className="pdf-spread-gutter" aria-hidden="true" />
                  <div className="pdf-spread-cell right">
                    {rightPage ? (
                      <VirtualPdfPage
                        key={rightPage}
                        pdfDoc={pdfDoc}
                        pageNum={rightPage}
                        scale={scale}
                        rotation={rotation}
                        containerWidth={containerWidth}
                        targetWidthOverride={spreadLayout.rightTargetWidth}
                        fluidWidthFraction={spreadLayout.rightWidthFraction}
                        isVisible={
                          visiblePages.has(rightPage) &&
                          (firstPagePainted || getSpreadStartPage(rightPage, coverSpreadOffset) === currentSpreadStart)
                        }
                        isNear={firstPagePainted && Math.abs(rightPage - currentSpreadStart) <= 4}
                        isMobile={isMobile}
                        isLargePdf={isLargePdfDoc}
                        defaultAspectRatio={defaultAspectRatio}
                        onPageRendered={handlePageRendered}
                      />
                    ) : (
                      <div className="pdf-spread-empty-slot" aria-hidden="true" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Full-height Resizable Center Divider between Left & Right Pages */}
            <div
              className={`pdf-spread-resizer ${isDraggingSpread ? 'dragging' : ''}`}
              onMouseDown={handleSpreadDragStart}
              onTouchStart={handleSpreadDragStart}
              onDoubleClick={handleResetSpreadSplit}
              onKeyDown={handleSpreadResizerKeyDown}
              tabIndex={0}
              role="separator"
              aria-label="Resize left and right pages"
              aria-orientation="vertical"
              aria-valuenow={Math.round(spreadSplitRatio)}
              aria-valuemin={SPREAD_MIN_PCT}
              aria-valuemax={SPREAD_MAX_PCT}
              title="Drag or use Left/Right Arrow keys to resize left & right pages (Double-click or Home to reset 50/50)"
            >
              <div className="pdf-spread-resizer-sticky">
                <div className="resizer-handle-grip" />
                <span ref={dragBadgeRef} className="pdf-spread-ratio-pill" aria-hidden="true">
                  {Math.round(spreadSplitRatio)}% / {Math.round(100 - spreadSplitRatio)}%
                </span>
              </div>
            </div>
          </div>
        ) : !loading && !loadError ? (
          <div className="pdf-pages-list">
            {pagesList.map((pageNum) => (
              <VirtualPdfPage
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                scale={scale}
                rotation={rotation}
                containerWidth={containerWidth}
                isVisible={visiblePages.has(pageNum) && (firstPagePainted || pageNum === currentPage)}
                isNear={firstPagePainted && Math.abs(pageNum - currentPage) <= 2}
                isMobile={isMobile}
                isLargePdf={isLargePdfDoc}
                defaultAspectRatio={defaultAspectRatio}
                onPageRendered={handlePageRendered}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default React.memo(PdfViewerPane);
