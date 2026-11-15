import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';

// Shared singleton promise to lazy-load PDF.js only when the viewer is first opened
let pdfjsPromise = null;
const mountedPaneIds = new Set();
let activePaneId = null;
let nextPaneSeq = 1;

function loadPdfJs() {
  if (!pdfjsPromise) {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    pdfjsPromise = import(/* @vite-ignore */ `${base}/pdfjs/pdf.min.mjs`)
      .then((mod) => {
        // Point worker to absolute URL on the current host
        mod.GlobalWorkerOptions.workerSrc = `${base}/pdfjs/pdf.worker.min.mjs`;
        return mod;
      })
      .catch((err) => {
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

function computePageTargetWidth(containerWidth, scale, isMobile) {
  const safeWidth = Math.max(containerWidth - (isMobile ? 16 : 36), 200);
  if (scale === 'fit-width') return safeWidth;
  if (scale === 'fit-page') return Math.min(safeWidth, 640);
  if (typeof scale === 'number') return Math.max(safeWidth * scale, 200);
  return safeWidth;
}

// Single Page Canvas Renderer Component with IntersectionObserver virtualization
const VirtualPdfPage = React.memo(({
  pdfDoc,
  pageNum,
  scale,
  rotation = 0,
  containerWidth,
  isVisible,
  isNear,
  isMobile,
  defaultAspectRatio,
  onPageRendered
}) => {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [rendered, setRendered] = useState(false);

  const shouldMountCanvas = isVisible || isNear;
  const effectiveAspectRatio = useMemo(() => {
    const base = aspectRatio || defaultAspectRatio || 1.414;
    return rotation % 180 === 90 && !aspectRatio ? 1 / base : base;
  }, [aspectRatio, defaultAspectRatio, rotation]);

  // Release GPU texture memory when page scrolls far out of active viewport buffer
  useEffect(() => {
    if (!shouldMountCanvas && canvasRef.current) {
      try {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      } catch {
        // Ignore detached canvas errors
      }
      setRendered(false);
    }
  }, [shouldMountCanvas]);

  // Render page to an offscreen buffer first to prevent zoom/resize blank flicker
  useEffect(() => {
    if (!shouldMountCanvas || !pdfDoc) return;

    let active = true;
    let offscreenCanvas = null;

    pdfDoc.getPage(pageNum).then((page) => {
      if (!active || !canvasRef.current) return;

      const totalRotation = ((page.rotate || 0) + rotation) % 360;
      const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRotation });
      if (unscaledViewport && unscaledViewport.width > 0) {
        const ratio = unscaledViewport.height / unscaledViewport.width;
        setAspectRatio((prev) => (prev && Math.abs(prev - ratio) < 0.002 ? prev : ratio));
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const targetWidth = computePageTargetWidth(containerWidth, scale, isMobile);
      const computedScale = targetWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale: computedScale, rotation: totalRotation });

      // High-DPI scaling capped adaptively on zoomed mobile to preserve GPU memory
      const maxDpr = isMobile && typeof scale === 'number' && scale > 1.6 ? 1.75 : 2.5;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const pixelW = Math.max(1, Math.floor(viewport.width * dpr));
      const pixelH = Math.max(1, Math.floor(viewport.height * dpr));

      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = pixelW;
      offscreenCanvas.height = pixelH;
      const offscreenCtx = offscreenCanvas.getContext('2d');
      if (!offscreenCtx) return;

      offscreenCtx.fillStyle = '#FFFFFF';
      offscreenCtx.fillRect(0, 0, pixelW, pixelH);

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* noop */ }
      }

      const renderTask = page.render({
        canvasContext: offscreenCtx,
        viewport,
        transform,
        intent: 'display'
      });
      renderTaskRef.current = renderTask;

      renderTask.promise.then(() => {
        if (!active || !canvasRef.current) return;
        const targetCanvas = canvasRef.current;
        const targetCtx = targetCanvas.getContext('2d');
        if (!targetCtx) return;

        targetCanvas.width = pixelW;
        targetCanvas.height = pixelH;
        targetCanvas.style.width = `${Math.floor(viewport.width)}px`;
        targetCanvas.style.height = `${Math.floor(viewport.height)}px`;
        targetCtx.drawImage(offscreenCanvas, 0, 0);

        offscreenCanvas.width = 0;
        offscreenCanvas.height = 0;
        offscreenCanvas = null;

        setRendered(true);
        if (onPageRendered) onPageRendered(pageNum);
      }).catch((err) => {
        if (offscreenCanvas) {
          offscreenCanvas.width = 0;
          offscreenCanvas.height = 0;
          offscreenCanvas = null;
        }
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`[WebPDF] Render error on page ${pageNum}:`, err);
        }
      });
    }).catch((err) => {
      console.warn(`[WebPDF] GetPage failed on page ${pageNum}:`, err);
    });

    return () => {
      active = false;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* noop */ }
      }
      if (offscreenCanvas) {
        offscreenCanvas.width = 0;
        offscreenCanvas.height = 0;
        offscreenCanvas = null;
      }
    };
  }, [pdfDoc, pageNum, scale, rotation, containerWidth, shouldMountCanvas, onPageRendered, isMobile]);

  const targetWidth = computePageTargetWidth(containerWidth, scale, isMobile);
  const exactWidth = Math.max(1, Math.floor(targetWidth));
  const exactHeight = Math.max(1, Math.floor(targetWidth * effectiveAspectRatio));

  return (
    <div
      className={`pdf-page-container ${rendered ? 'rendered' : 'loading-placeholder'}`}
      data-page-number={pageNum}
      style={{
        width: `${exactWidth}px`,
        height: `${exactHeight}px`,
        minHeight: `${exactHeight}px`,
        margin: '0 auto 16px auto',
        position: 'relative'
      }}
    >
      <div className="pdf-page-number-indicator">Page {pageNum}</div>
      {shouldMountCanvas && (
        <canvas
          ref={canvasRef}
          className="pdf-canvas"
          style={{
            width: `${exactWidth}px`,
            height: `${exactHeight}px`,
            opacity: rendered ? 1 : 0
          }}
        />
      )}
      {!rendered && (
        <div className="pdf-skeleton-page">
          <div className="pdf-skeleton-shimmer" />
        </div>
      )}
    </div>
  );
});

export const PdfViewerPane = ({
  url,
  title,
  docType = 'QP',
  isMobile = false,
  initialPage = 1,
  onDownload = true,
  autoFocus = false
}) => {
  const downloadUrl = url ? (url.includes('?') ? `${url}&download=true` : `${url}?download=true`) : '';
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
  const [firstPagePainted, setFirstPagePainted] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(() => (
    typeof window !== 'undefined' ? (isMobile ? Math.min(window.innerWidth, 390) : 640) : 640
  ));
  const [visiblePages, setVisiblePages] = useState(new Set([1, 2]));

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
  const observerRef = useRef(null);

  const currentPageRef = useRef(currentPage);
  const initialPageRef = useRef(initialPage);
  const pendingInitialJumpRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const pendingZoomAnchorRef = useRef(null);
  const pageInputRef = useRef(null);

  useEffect(() => {
    initialPageRef.current = initialPage;
  }, [initialPage]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Synchronously measure initial scroll stage width before first paint to avoid resize jump
  useLayoutEffect(() => {
    const el = scrollAreaRef.current || containerRef.current;
    if (el && el.clientWidth > 80) {
      const nextW = el.clientWidth;
      setContainerWidth((prev) => (Math.abs(prev - nextW) >= 1 ? nextW : prev));
    }
  }, []);

  // ResizeObserver on inner scroll stage (excludes vertical scrollbar width) with 80ms debounce during drag resize
  useEffect(() => {
    const target = scrollAreaRef.current || containerRef.current;
    if (!target) return;
    let timerId = null;
    let hasMeasured = false;

    const applyWidth = () => {
      const el = scrollAreaRef.current || containerRef.current;
      if (el && el.clientWidth > 0) {
        const nextW = el.clientWidth;
        setContainerWidth((prev) => (Math.abs(prev - nextW) >= 1 ? nextW : prev));
        hasMeasured = true;
      }
    };

    applyWidth();
    const observer = new ResizeObserver(() => {
      if (!hasMeasured) {
        applyWidth();
        return;
      }
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(applyWidth, 80);
    });
    observer.observe(target);
    return () => {
      if (timerId) clearTimeout(timerId);
      observer.disconnect();
    };
  }, []);

  // Record anchor coordinates so zoom scales directly into focal point (mouse or screen center)
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
  }, [scale, containerWidth]);

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
          let currentNumeric = 1.0;
          if (prev !== 'fit-width' && prev !== 'fit-page' && typeof prev === 'number') {
            currentNumeric = prev;
          }
          return Math.max(0.4, Math.min(3.5, Number((currentNumeric + delta).toFixed(2))));
        });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [recordZoomAnchor]);

  // Fetch and parse document with PDF.js (with strict worker and document destruction on unmount)
  const loadDocument = useCallback(() => {
    if (!url) return;
    let active = true;
    let loadingTask = null;
    let loadedDoc = null;

    setLoading(true);
    setDownloadProgress(null);
    setFirstPagePainted(false);
    setRotation(0);
    setLoadError(null);
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0;
      scrollAreaRef.current.scrollLeft = 0;
    }
    setPdfDoc((prev) => {
      if (prev) {
        try { prev.destroy(); } catch {}
      }
      return null;
    });

    loadPdfJs().then((pdfjsLib) => {
      if (!active) return;
      loadingTask = pdfjsLib.getDocument({
        url,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
        cMapPacked: true,
        enableXfa: false,
        disableAutoFetch: false,
        rangeChunkSize: 262144
      });

      loadingTask.onProgress = (progressData) => {
        if (!active || !progressData) return;
        if (typeof progressData.total === 'number' && progressData.total > 0) {
          const pct = Math.min(99, Math.max(0, Math.round((progressData.loaded / progressData.total) * 100)));
          setDownloadProgress(pct);
        }
      };

      loadingTask.promise.then(async (doc) => {
        if (!active) {
          try { doc.destroy(); } catch {}
          return;
        }
        loadedDoc = doc;

        // Fetch page 1 dimensions BEFORE mounting pages so all placeholders have exact heights in 1 render
        let measuredRatio = null;
        try {
          const p1 = await doc.getPage(1);
          if (!active) {
            try { doc.destroy(); } catch {}
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
        const startPage = Math.max(1, Math.min(requestedStart, doc.numPages || 1));
        const initialWindow = new Set([startPage]);
        if (startPage + 1 <= doc.numPages) initialWindow.add(startPage + 1);
        if (startPage - 1 >= 1) initialWindow.add(startPage - 1);

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
      if (loadingTask) {
        try { loadingTask.destroy(); } catch {}
      }
      if (loadedDoc) {
        try { loadedDoc.destroy(); } catch {}
      }
    };
  }, [url]);

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
            if (pageNum + 1 <= numPages) next.add(pageNum + 1);
            if (pageNum - 1 >= 1) next.add(pageNum - 1);
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
  }, [pdfDoc, numPages]);

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
          if (currentPageRef.current !== numPages) {
            currentPageRef.current = numPages;
            setCurrentPage(numPages);
            if (document.activeElement !== pageInputRef.current) {
              setInputPage(String(numPages));
            }
          }
          return;
        }

        const focalY = scrollTop + clientHeight * 0.35;
        const pageEls = scrollEl.querySelectorAll('.pdf-page-container');
        for (let i = 0; i < pageEls.length; i++) {
          const el = pageEls[i];
          const top = el.offsetTop;
          const bottom = top + el.offsetHeight;
          if (top <= focalY && bottom >= focalY) {
            const pageNum = parseInt(el.getAttribute('data-page-number'), 10);
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
  }, [numPages]);

  // Reliable Jump to Page (smooth programmatic scrolling with locking)
  const scrollToPage = useCallback((pageNum, smooth = true) => {
    const clamped = Math.max(1, Math.min(pageNum, numPages || 1));
    currentPageRef.current = clamped;
    setCurrentPage(clamped);
    setInputPage(String(clamped));

    if (!scrollAreaRef.current) return;
    const targetEl = scrollAreaRef.current.querySelector(`[data-page-number="${clamped}"]`);
    if (targetEl) {
      isProgrammaticScrollRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      const targetTop = Math.max(0, targetEl.offsetTop - 12);
      scrollAreaRef.current.scrollTo({
        top: targetTop,
        behavior: smooth ? 'smooth' : 'auto'
      });

      scrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 600);
    }
  }, [numPages]);

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
      if (prev === 'fit-width' || prev === 'fit-page') return 1.25;
      return Math.min(Number((prev + 0.2).toFixed(2)), 3.5);
    });
  }, [recordZoomAnchor]);

  const handleZoomOut = useCallback(() => {
    recordZoomAnchor();
    setScale((prev) => {
      if (prev === 'fit-width' || prev === 'fit-page') return 0.85;
      return Math.max(Number((prev - 0.2).toFixed(2)), 0.4);
    });
  }, [recordZoomAnchor]);

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

  // Keyboard navigation shortcuts scoped to the focused/active pane (safe in Split View)
  useEffect(() => {
    const paneId = paneIdRef.current;
    const handleKeyDown = (e) => {
      if (mountedPaneIds.size > 1 && activePaneId !== paneId) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        scrollToPage(currentPageRef.current - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        scrollToPage(currentPageRef.current + 1);
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
  }, [numPages, scrollToPage, handleZoomIn, handleZoomOut]);

  // Page Array
  const pagesList = useMemo(() => {
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }, [numPages]);

  const markPaneActive = () => {
    activePaneId = paneIdRef.current;
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={`custom-pdf-pane ${isMobile ? 'mobile-mode' : ''}`}
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
            disabled={currentPage <= 1 || loading}
            onClick={() => scrollToPage(currentPageRef.current - 1)}
            title="Previous Page"
            aria-label="Previous Page"
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
            <span className="pdf-page-total">/ {numPages || '–'}</span>
          </span>
          <button
            type="button"
            className="pdf-tool-btn"
            disabled={currentPage >= numPages || loading}
            onClick={() => scrollToPage(currentPageRef.current + 1)}
            title="Next Page"
            aria-label="Next Page"
          >
            ›
          </button>
        </div>

        {/* Zoom & Action Tools */}
        <div className="pdf-pane-tools">
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>

          {onDownload && downloadUrl && (
            <a
              href={downloadUrl}
              download
              rel="noopener noreferrer"
              className="pdf-tool-btn open-tab-btn"
              title="Download PDF"
              aria-label="Download PDF"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
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
        className={`pdf-scroll-stage ${scale === 'fit-width' || scale === 'fit-page' ? 'fit-mode' : ''}`}
      >
        {(loading || !firstPagePainted) && !loadError && (
          <div className="pdf-loading-overlay">
            <div className="pdf-loading-card">
              <div className="pdf-loading-bar-track">
                {typeof downloadProgress === 'number' ? (
                  <div
                    className="pdf-loading-bar-fill determinate"
                    style={{ width: `${Math.max(8, downloadProgress)}%` }}
                  />
                ) : (
                  <div className="pdf-loading-bar-fill" />
                )}
              </div>
              <div className="pdf-loading-title">
                {typeof downloadProgress === 'number' && downloadProgress < 100
                  ? `Downloading Document (${downloadProgress}%)`
                  : 'Rendering Document'}
              </div>
              <div className="pdf-loading-subtext">{title || 'Preparing vector pages...'}</div>
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
              <a
                href={downloadUrl || url}
                download
                rel="noopener noreferrer"
                className="modal-action-link"
              >
                Download
              </a>
            </div>
          </div>
        )}

        {!loading && !loadError && (
          <div className="pdf-pages-list">
            {pagesList.map((pageNum) => (
              <VirtualPdfPage
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                scale={scale}
                rotation={rotation}
                containerWidth={containerWidth}
                isVisible={visiblePages.has(pageNum)}
                isNear={Math.abs(pageNum - currentPage) <= 2}
                isMobile={isMobile}
                defaultAspectRatio={defaultAspectRatio}
                onPageRendered={handlePageRendered}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(PdfViewerPane);
