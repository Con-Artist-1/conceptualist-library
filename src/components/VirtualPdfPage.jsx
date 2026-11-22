import React, { useState, useEffect, useRef, useMemo } from 'react';
import { computePageTargetWidth } from '../lib/pdfLayoutMath.js';

/**
 * Single page canvas renderer component with two-pass progressive offscreen painting
 * and IntersectionObserver-driven canvas GPU release when scrolled far out of view.
 */
export const VirtualPdfPage = React.memo(({
  pdfDoc,
  pageNum,
  scale,
  rotation = 0,
  containerWidth,
  targetWidthOverride = null,
  fluidWidthFraction = null,
  isVisible,
  isNear,
  isMobile,
  isLargePdf = false,
  defaultAspectRatio,
  onPageRendered
}) => {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [rendered, setRendered] = useState(false);

  const isFluidSpread = typeof fluidWidthFraction === 'number';
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

  // Two-pass progressive offscreen rendering: instant draft canvas first, then idle HiDPI upgrade
  useEffect(() => {
    if (!shouldMountCanvas || !pdfDoc) return;

    let active = true;
    let offscreenCanvas = null;
    let idleHandle = null;
    let usedIdleCallback = false;

    const cancelScheduledIdle = () => {
      if (idleHandle === null) return;
      if (usedIdleCallback && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      } else {
        clearTimeout(idleHandle);
      }
      idleHandle = null;
    };

    const drawPass = (page, unscaledViewport, totalRotation, dprValue, notifyPainted) => {
      if (!active || !canvasRef.current) return Promise.resolve(false);
      const targetWidth =
        typeof targetWidthOverride === 'number' && targetWidthOverride > 0
          ? targetWidthOverride
          : computePageTargetWidth(containerWidth, scale, isMobile);
      const computedScale = targetWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale: computedScale, rotation: totalRotation });

      const pixelW = Math.max(1, Math.floor(viewport.width * dprValue));
      const pixelH = Math.max(1, Math.floor(viewport.height * dprValue));

      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = pixelW;
      offscreenCanvas.height = pixelH;
      const offscreenCtx = offscreenCanvas.getContext('2d');
      if (!offscreenCtx) return Promise.resolve(false);

      offscreenCtx.fillStyle = '#FFFFFF';
      offscreenCtx.fillRect(0, 0, pixelW, pixelH);

      const transform = dprValue !== 1 ? [dprValue, 0, 0, dprValue, 0, 0] : null;

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

      return renderTask.promise.then(() => {
        if (!active || !canvasRef.current) return false;
        const targetCanvas = canvasRef.current;
        const targetCtx = targetCanvas.getContext('2d');
        if (!targetCtx) return false;

        targetCanvas.width = pixelW;
        targetCanvas.height = pixelH;
        if (isFluidSpread) {
          targetCanvas.style.width = '100%';
          targetCanvas.style.height = '100%';
        } else {
          targetCanvas.style.width = `${Math.floor(viewport.width)}px`;
          targetCanvas.style.height = `${Math.floor(viewport.height)}px`;
        }
        targetCtx.drawImage(offscreenCanvas, 0, 0);

        offscreenCanvas.width = 0;
        offscreenCanvas.height = 0;
        offscreenCanvas = null;

        if (notifyPainted) {
          setRendered(true);
          if (onPageRendered) onPageRendered(pageNum);
        }
        return true;
      }).catch((err) => {
        if (offscreenCanvas) {
          offscreenCanvas.width = 0;
          offscreenCanvas.height = 0;
          offscreenCanvas = null;
        }
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`[WebPDF] Render error on page ${pageNum}:`, err);
        }
        return false;
      });
    };

    pdfDoc.getPage(pageNum).then((page) => {
      if (!active || !canvasRef.current) return;

      const totalRotation = ((page.rotate || 0) + rotation) % 360;
      const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRotation });
      if (unscaledViewport && unscaledViewport.width > 0) {
        const ratio = unscaledViewport.height / unscaledViewport.width;
        setAspectRatio((prev) => (prev && Math.abs(prev - ratio) < 0.002 ? prev : ratio));
      }

      // High-DPI scaling capped adaptively on zoomed mobile to preserve GPU memory
      const maxDpr = isMobile && typeof scale === 'number' && scale > 1.6 ? 1.75 : 2.5;
      const fullDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const useTwoPass = isLargePdf || fullDpr > 1.05;
      const fastDpr = fullDpr > 1.05 ? 1 : 0.72;
      const firstPassDpr = useTwoPass ? fastDpr : fullDpr;

      drawPass(page, unscaledViewport, totalRotation, firstPassDpr, true).then((painted) => {
        if (!painted || !active || !useTwoPass || Math.abs(fullDpr - firstPassDpr) <= 0.05) return;
        const startHiRes = () => {
          idleHandle = null;
          if (!active || !canvasRef.current) return;
          drawPass(page, unscaledViewport, totalRotation, fullDpr, false);
        };
        if (typeof window.requestIdleCallback === 'function') {
          usedIdleCallback = true;
          idleHandle = window.requestIdleCallback(startHiRes, { timeout: 600 });
        } else {
          idleHandle = setTimeout(startHiRes, 140);
        }
      });
    }).catch((err) => {
      console.warn(`[WebPDF] GetPage failed on page ${pageNum}:`, err);
    });

    return () => {
      active = false;
      cancelScheduledIdle();
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* noop */ }
      }
      if (offscreenCanvas) {
        offscreenCanvas.width = 0;
        offscreenCanvas.height = 0;
        offscreenCanvas = null;
      }
    };
  }, [pdfDoc, pageNum, scale, rotation, containerWidth, targetWidthOverride, isFluidSpread, shouldMountCanvas, onPageRendered, isMobile, isLargePdf]);

  const targetWidth =
    typeof targetWidthOverride === 'number' && targetWidthOverride > 0
      ? targetWidthOverride
      : computePageTargetWidth(containerWidth, scale, isMobile);
  const exactWidth = Math.max(1, Math.floor(targetWidth));
  const exactHeight = Math.max(1, Math.floor(targetWidth * effectiveAspectRatio));

  const containerStyle = isFluidSpread
    ? {
        width: `${(Math.max(0.15, Math.min(1, fluidWidthFraction)) * 100).toFixed(3)}%`,
        aspectRatio: `${(1 / effectiveAspectRatio).toFixed(5)}`,
        position: 'relative'
      }
    : {
        width: `${exactWidth}px`,
        height: `${exactHeight}px`,
        minHeight: `${exactHeight}px`,
        margin: '0 auto 16px auto',
        position: 'relative'
      };

  const canvasStyle = isFluidSpread
    ? {
        width: '100%',
        height: '100%',
        opacity: rendered ? 1 : 0
      }
    : {
        width: `${exactWidth}px`,
        height: `${exactHeight}px`,
        opacity: rendered ? 1 : 0
      };

  return (
    <div
      className={`pdf-page-container ${isFluidSpread ? 'spread-page-container' : ''} ${rendered ? 'rendered' : 'loading-placeholder'}`}
      data-page-number={pageNum}
      style={containerStyle}
    >
      <div className="pdf-page-number-indicator">Page {pageNum}</div>
      {shouldMountCanvas && (
        <canvas
          ref={canvasRef}
          className="pdf-canvas"
          style={canvasStyle}
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
