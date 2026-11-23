import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { listZipPdfEntries, extractZipPdfEntry } from '../zipPdfExtractor.js';
import { formatBytes } from '../lib/libraryHelpers.js';
import { PdfPaneSkeleton } from './Skeletons.jsx';

const PdfViewerPane = lazy(() => import('../PdfViewerPane.jsx'));

/**
 * Lazy-loaded Worked Solution Bank ZIP browser: fetches only the ZIP Central Directory
 * via HTTP 206 Range requests, renders chapter/exercise navigation pills, and unpacks
 * clicked exercise PDFs into WebPDF on demand.
 */
export default function SolutionBankView({
  currentDoc,
  solZipUrl,
  singleTitle,
  downloadUrl,
  isMobile
}) {
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
    const ctrl = new AbortController();
    setSolDirLoading(true);
    setSolDirError(null);
    setSolDirectory(null);
    setSelectedSolPath('');
    setActiveSolPdf(null);
    setSolNavExpanded(true);

    listZipPdfEntries(solZipUrl, currentDoc.size || 0, { signal: ctrl.signal })
      .then((dirData) => {
        if (cancelled) return;
        setSolDirectory(dirData);
        setSelectedSolPath(dirData.entries[0]?.entryPath || '');
        setSolDirLoading(false);
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        setSolDirError(err?.message || 'Unable to read Solution Bank chapters');
        setSolDirLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
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
    const ctrl = new AbortController();
    setSolPdfLoading(true);
    setSolPdfError(null);
    setActiveSolPdf(null);

    extractZipPdfEntry(solZipUrl, selectedSolEntry, currentDoc.size || 0, { signal: ctrl.signal })
      .then((pdfResult) => {
        if (cancelled) return;
        setActiveSolPdf(pdfResult);
        setSolPdfLoading(false);
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        setSolPdfError(err?.message || 'Unable to unpack selected PDF');
        setSolPdfLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [solZipUrl, selectedSolEntry, currentDoc.size, solPdfRetry]);

  return (
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
              <div
                className="modal-sol-pill-row"
                role="tablist"
                aria-label="Chapters"
                onKeyDown={(e) => {
                  const groups = solDirectory.groups || [];
                  if (groups.length < 2) return;
                  const curIdx = groups.findIndex((g) => g.key === activeSolGroup?.key);
                  let nextIdx = -1;
                  if (e.key === 'ArrowRight') nextIdx = (curIdx + 1) % groups.length;
                  else if (e.key === 'ArrowLeft') nextIdx = (curIdx - 1 + groups.length) % groups.length;
                  else if (e.key === 'Home') nextIdx = 0;
                  else if (e.key === 'End') nextIdx = groups.length - 1;
                  if (nextIdx >= 0) {
                    e.preventDefault();
                    const targetGrp = groups[nextIdx];
                    if (targetGrp?.items?.[0]) setSelectedSolPath(targetGrp.items[0].entryPath);
                    const tabs = e.currentTarget.querySelectorAll('[role="tab"]');
                    tabs[nextIdx]?.focus();
                  }
                }}
              >
                {solDirectory.groups.map((grp, grpIdx) => {
                  const isActiveGroup = activeSolGroup?.key === grp.key;
                  const tabId = `sol-chapter-tab-${grpIdx}`;
                  return (
                    <button
                      key={grp.key}
                      id={tabId}
                      type="button"
                      role="tab"
                      aria-selected={isActiveGroup}
                      aria-controls="sol-chapter-panel"
                      tabIndex={isActiveGroup ? 0 : -1}
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
                <div
                  id="sol-chapter-panel"
                  className="modal-sol-pill-row exercises"
                  role="tabpanel"
                  aria-label={`${activeSolGroup.label} exercises`}
                >
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
  );
}
