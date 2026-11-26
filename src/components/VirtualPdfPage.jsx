import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { computePageTargetWidth } from '../lib/pdfLayoutMath.js';

/**
 * Single page canvas renderer component with two-pass progressive offscreen painting,
 * canvas memory clamping, 1-time transient error retry, and IntersectionObserver-driven GPU release.
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
  const loadedPageRef = useRef(null);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [rendered, setRendered] = useState(false);

  const isFluidSpread = typeof fluidWidthFraction === 'number';
  const shouldMountCanvas = isVisible || isNear;
  const effectiveAspectRatio = useMemo(() => {
    const base = aspectRatio || defaultAspectRatio || 1.414;
    return rotation % 180 === 90 && !aspectRatio ? 1 / base : base;
  }, [aspectRatio, defaultAspectRatio, rotation]);

  // Release GPU texture memory & PDF.js page resources BEFORE <canvas> detaches from DOM
  useLayoutEffect(() => {
    if (!shouldMountCanvas) return undefined;
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        try {
          canvas.width = 1;
          canvas.height = 1;
        } catch {
          // Ignore detached canvas errors
        }
      }
      const pageObj = loadedPageRef.current;
      loadedPageRef.current = null;
      if (pageObj && typeof pageObj.cleanup === 'function') {
        try {
          pageObj.cleanup();
        } catch {
          // Ignore page cleanup errors
        }
      }
      setRendered(false);
    };
  }, [shouldMountCanvas, pdfDoc, pageNum]);

  // Two-pass progressive offscreen rendering: instant draft canvas first, then idle HiDPI upgrade
  useEffect(() => {
    if (!shouldMountCanvas || !pdfDoc) return;

    let active = true;
    let offscreenCanvas = null;
    let idleHandle = null;
    let retryTimer = null;
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

    const isFatalTeardownErr = (err) => {
      const msg = String(err?.message || '');
      return (
        err?.name === 'RenderingCancelledException' ||
        msg.includes('destroyed') ||
        msg.includes('terminated') ||
        msg.includes('Aborted')
      );
    };

    const drawPass = (page, unscaledViewport, totalRotation, dprValue, notifyPainted) => {
      if (!active || !canvasRef.current) return Promise.resolve({ ok: false, cancelled: true });
      const targetWidth =
        typeof targetWidthOverride === 'number' && targetWidthOverride > 0
          ? targetWidthOverride
          : computePageTargetWidth(containerWidth, scale, isMobile);
      const computedScale = targetWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale: computedScale, rotation: totalRotation });

      const maxDim = isMobile ? 4096 : 6144;
      const maxArea = isMobile ? 12582912 : 25165824;
      const rawW = Math.max(1, viewport.width);
      const rawH = Math.max(1, viewport.height);
      let safeDpr = dprValue;
      if (rawW * safeDpr > maxDim) safeDpr = Math.min(safeDpr, maxDim / rawW);
      if (rawH * safeDpr > maxDim) safeDpr = Math.min(safeDpr, maxDim / rawH);
      if (rawW * rawH * safeDpr * safeDpr > maxArea) {
        safeDpr = Math.min(safeDpr, Math.sqrt(maxArea / (rawW * rawH)));
      }
      safeDpr = Math.max(0.5, safeDpr);

      const pixelW = Math.max(1, Math.floor(rawW * safeDpr));
      const pixelH = Math.max(1, Math.floor(rawH * safeDpr));

      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = pixelW;
      offscreenCanvas.height = pixelH;
      const offscreenCtx = offscreenCanvas.getContext('2d');
      if (!offscreenCtx) return Promise.resolve({ ok: false, cancelled: false });

      offscreenCtx.fillStyle = '#FFFFFF';
      offscreenCtx.fillRect(0, 0, pixelW, pixelH);

      const transform = Math.abs(safeDpr - 1) > 0.01 ? [safeDpr, 0, 0, safeDpr, 0, 0] : null;

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
        if (!active || !canvasRef.current) return { ok: false, cancelled: true };
        const targetCanvas = canvasRef.current;
        const targetCtx = targetCanvas.getContext('2d');
        if (!targetCtx) return { ok: false, cancelled: false };

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
        return { ok: true, cancelled: false };
      }).catch((err) => {
        if (offscreenCanvas) {
          offscreenCanvas.width = 0;
          offscreenCanvas.height = 0;
          offscreenCanvas = null;
        }
        if (isFatalTeardownErr(err)) {
          return { ok: false, cancelled: true };
        }
        console.warn(`[WebPDF] Render error on page ${pageNum}:`, err);
        return { ok: false, cancelled: false };
      });
    };

    const runPageRender = (attempt = 0) => {
      if (!active) return;
      pdfDoc.getPage(pageNum).then((page) => {
        if (!active || !canvasRef.current) {
          if (page && typeof page.cleanup === 'function') {
            try { page.cleanup(); } catch { /* noop */ }
          }
          return;
        }
        loadedPageRef.current = page;

        const totalRotation = ((page.rotate || 0) + rotation) % 360;
        const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRotation });
        if (unscaledViewport && unscaledViewport.width > 0) {
          const ratio = unscaledViewport.height / unscaledViewport.width;
          setAspectRatio((prev) => (prev && Math.abs(prev - ratio) < 0.002 ? prev : ratio));
        }

        // High-DPI scaling capped adaptively on zoomed mobile & large scanned textbooks to preserve GPU & CPU headroom
        const maxDpr = isMobile && typeof scale === 'number' && scale > 1.6 ? 1.75 : (isLargePdf ? 2.0 : 2.5);
        const fullDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        const useTwoPass = fullDpr > 1.15;
        const firstPassDpr = useTwoPass ? 1.0 : fullDpr;

        drawPass(page, unscaledViewport, totalRotation, firstPassDpr, true).then((res) => {
          if (!active) return;
          if (!res.ok) {
            if (!res.cancelled && attempt === 0) {
              retryTimer = setTimeout(() => runPageRender(1), 250);
            }
            return;
          }
          if (!useTwoPass || Math.abs(fullDpr - firstPassDpr) <= 0.05) return;
          const startHiRes = () => {
            idleHandle = null;
            if (!active || !canvasRef.current) return;
            drawPass(page, unscaledViewport, totalRotation, fullDpr, false);
          };
          if (typeof window.requestIdleCallback === 'function') {
            usedIdleCallback = true;
            idleHandle = window.requestIdleCallback(startHiRes, { timeout: isLargePdf ? 900 : 600 });
          } else {
            idleHandle = setTimeout(startHiRes, isLargePdf ? 320 : 140);
          }
        });
      }).catch((err) => {
        if (!active || isFatalTeardownErr(err)) return;
        if (attempt === 0) {
          retryTimer = setTimeout(() => runPageRender(1), 250);
        } else {
          console.warn(`[WebPDF] GetPage failed on page ${pageNum}:`, err);
        }
      });
    };

    runPageRender(0);

    return () => {
      active = false;
      cancelScheduledIdle();
      if (retryTimer !== null) clearTimeout(retryTimer);
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
