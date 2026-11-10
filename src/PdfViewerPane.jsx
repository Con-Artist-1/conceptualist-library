import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';

// Shared singleton promise to lazy-load PDF.js only when the viewer is first opened
let pdfjsPromise = null;
const dynamicImportModule = new Function('url', 'return import(url)');
function loadPdfJs() {
  if (!pdfjsPromise) {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    pdfjsPromise = dynamicImportModule(`${base}/pdfjs/pdf.min.mjs`)
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

// Single Page Canvas Renderer Component with IntersectionObserver virtualization
const VirtualPdfPage = React.memo(({ pdfDoc, pageNum, scale, containerWidth, isVisible, isNear, isMobile, onPageRendered }) => {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [aspectRatio, setAspectRatio] = useState(1.414); // Standard A4 ratio initial estimate
  const [rendered, setRendered] = useState(false);

  const shouldMountCanvas = isVisible || isNear;

  // Pre-fetch viewport dimensions to lock aspect ratio early (prevent layout jumps)
  useEffect(() => {
    let active = true;
    if (!pdfDoc) return;
    pdfDoc.getPage(pageNum).then((page) => {
      if (!active) return;
      const vp = page.getViewport({ scale: 1 });
      if (vp && vp.width > 0) {
        setAspectRatio(vp.height / vp.width);
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum]);

  // Release GPU texture memory when page scrolls far out of active viewport buffer
  useEffect(() => {
    if (!shouldMountCanvas && canvasRef.current) {
      try {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      } catch {}
      setRendered(false);
    }
  }, [shouldMountCanvas]);

  // Render page when it becomes visible or near
  useEffect(() => {
    if (!shouldMountCanvas || !pdfDoc) return;

    let active = true;
    let renderTask = null;

    pdfDoc.getPage(pageNum).then((page) => {
      if (!active || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const safeWidth = Math.max(containerWidth - (isMobile ? 12 : 28), 220);

      // Calculate width based on scale or fit mode
      let targetWidth;
      if (scale === 'fit-width') {
        targetWidth = safeWidth;
      } else if (scale === 'fit-page') {
        targetWidth = Math.min(safeWidth, 640);
      } else if (typeof scale === 'number') {
        targetWidth = Math.max(safeWidth * scale, 240);
      } else {
        targetWidth = safeWidth;
      }

      const unscaledViewport = page.getViewport({ scale: 1 });
      const computedScale = targetWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale: computedScale });

      // High-DPI scaling for Retina, 4K, and modern mobile screens
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Cap at 2.5x to preserve GPU memory
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      // Fill pure white paper background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

      // Cancel any ongoing rendering task for this canvas before starting a new one
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }

      renderTask = page.render({
        canvasContext: ctx,
        viewport,
        transform,
        intent: 'display'
      });
      renderTaskRef.current = renderTask;

      renderTask.promise.then(() => {
        if (active) {
          setRendered(true);
          if (onPageRendered) onPageRendered(pageNum);
        }
      }).catch((err) => {
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
        try { renderTaskRef.current.cancel(); } catch {}
      }
    };
  }, [pdfDoc, pageNum, scale, containerWidth, shouldMountCanvas, onPageRendered, isMobile]);

  const safeWidth = Math.max(containerWidth - 28, 260);
  let targetWidth;
  if (scale === 'fit-width') {
    targetWidth = safeWidth;
  } else if (scale === 'fit-page') {
    targetWidth = Math.min(safeWidth, 640);
  } else if (typeof scale === 'number') {
    targetWidth = Math.max(safeWidth * scale, 240);
  } else {
    targetWidth = safeWidth;
  }

  const estimatedHeight = targetWidth * aspectRatio;

  return (
    <div
      className={`pdf-page-container ${rendered ? 'rendered' : 'loading-placeholder'}`}
      data-page-number={pageNum}
      style={{
        width: `${Math.floor(targetWidth)}px`,
        minHeight: `${Math.floor(estimatedHeight)}px`,
        margin: '0 auto 16px auto',
        position: 'relative',
        backgroundColor: '#FFFFFF'
      }}
    >
      <div className="pdf-page-number-indicator">Page {pageNum}</div>
      {shouldMountCanvas ? (
        <canvas ref={canvasRef} className="pdf-canvas" />
      ) : (
        <div className="pdf-skeleton-page" style={{ height: `${Math.floor(estimatedHeight)}px` }}>
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
  onOpenTab
}) => {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [inputPage, setInputPage] = useState(String(initialPage));
  const [scale, setScale] = useState('fit-width'); // 'fit-width' | 'fit-page' | number
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(() => (
    typeof window !== 'undefined' ? (isMobile ? Math.min(window.innerWidth, 390) : 640) : 640
  ));
  const [visiblePages, setVisiblePages] = useState(new Set([1, 2]));

  const containerRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const observerRef = useRef(null);

  const currentPageRef = useRef(currentPage);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const pendingZoomAnchorRef = useRef(null);
  const pageInputRef = useRef(null);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // ResizeObserver to adapt canvas automatically to pane width
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current && containerRef.current.clientWidth > 0) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
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
    setLoadError(null);
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

      loadingTask.promise.then((doc) => {
        if (!active) {
          try { doc.destroy(); } catch {}
          return;
        }
        loadedDoc = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
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

  // Keyboard navigation shortcuts when viewer is mounted
  useEffect(() => {
    const handleKeyDown = (e) => {
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

  return (
    <div ref={containerRef} className={`custom-pdf-pane ${isMobile ? 'mobile-mode' : ''}`}>
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

          {onOpenTab && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="pdf-tool-btn open-tab-btn"
              title="Open raw PDF file in new browser tab"
              aria-label="Open in new tab"
            >
              ↗
            </a>
          )}
        </div>
      </div>

      {/* Main PDF Scrollable Stage */}
      <div ref={scrollAreaRef} className="pdf-scroll-stage">
        {loading && (
          <div className="pdf-loading-overlay">
            <div className="pdf-loading-card">
              <div className="pdf-loading-bar-track">
                <div className="pdf-loading-bar-fill" />
              </div>
              <div className="pdf-loading-title">Rendering Document</div>
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
                href={url}
                target="_blank"
                rel="noreferrer"
                className="modal-action-link"
              >
                Open Tab ↗
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
                containerWidth={containerWidth}
                isVisible={visiblePages.has(pageNum)}
                isNear={Math.abs(pageNum - currentPage) <= 2}
                isMobile={isMobile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewerPane;
