import React from 'react';
import {
  getBoardConfig,
  getCurriculumMeta,
  isBookCategory,
  isCambridgeSpec
} from '../data/boards.js';
import {
  shouldHandleClientNavigation,
  DOC_TYPE_INFO,
  getScDocumentLabel,
  getDocTypeBadge,
  formatBytes,
  formatSubjectDisplay,
  getShortUnitDisplay,
  getDisplayTitle,
  getUnifiedSittingTitle,
  isQuestionPaperEligibleForViews,
  getPaperTotalViews
} from '../lib/libraryHelpers.js';
import { preloadReaderChunksOnce, prewarmPaperOnPointerDown } from '../lib/pdfPrewarm.js';
import { PaperViewsCounter } from './PaperViewsCounter.jsx';
import { TableSkeletonLoader } from './Skeletons.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';

const CORE_UNIFIED_BTNS = [
  { key: 'QP', cls: 'qp', desktop: 'Question Paper', mobile: 'QP', desc: 'Open Question Paper' },
  { key: 'MS', cls: 'ms', desktop: 'Mark Scheme', mobile: 'MS', desc: 'Open Mark Scheme' },
  { key: 'ER', cls: 'er', desktop: 'Examiner Report', mobile: 'ER', desc: 'Open Examiner Report' },
  { key: 'GT', cls: 'gt', desktop: 'Thresholds', mobile: 'GT', desc: 'Open Grade Thresholds' }
];

const EXTRA_DOC_TYPES = ['AUD', 'SC', 'DF', 'SOL', 'SAM'];

const PaperRow = React.memo(({
  file,
  viewMode,
  filterDocType,
  scopeAllBoards = false,
  viewsMap,
  getOnSitePaperUrl,
  onOpenReader
}) => {
  const isUnified = Boolean(viewMode === 'unified' && file.isUnifiedSitting);
  const isCie = file.board === 'cambridge' || isCambridgeSpec(file.spec);
  const activeDoc = isUnified
    ? ((filterDocType && file.docs?.[filterDocType]) || file.primaryFile || file)
    : file;
  const badge = getDocTypeBadge(activeDoc.docType, activeDoc.category);
  const displayTitle = isUnified ? getUnifiedSittingTitle(file) : getDisplayTitle(file);
  const titleCls = isUnified ? 'title-unified' : (badge ? `title-${badge.cls}` : 'title-default');
  const shortUnit = getShortUnitDisplay(file);
  const isPdf = activeDoc.ext === 'pdf';
  const siblings = file.siblings || null;
  const docs = file.docs || {};
  const [scSplitFullLabel] = docs.SC ? getScDocumentLabel(docs.SC) : ['Insert', 'Insert'];
  const isConfidentialInstruction = Boolean(
    docs.SC && /(?:^|[/_-])ci(?:[._-]|$)|confidential/i.test(docs.SC.name || docs.SC.path || '')
  );
  const canSplitMs = Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf');
  const canSplitSc = Boolean(docs.QP?.ext === 'pdf' && docs.SC?.ext === 'pdf');
  const canSplit = canSplitMs || canSplitSc;
  const autoSplitOnTitleClick = canSplitMs || (canSplitSc && !isConfidentialInstruction);
  const defaultViewMode =
    filterDocType === 'AUD' && (docs.AUD || activeDoc.docType === 'AUD')
      ? 'AUD'
      : filterDocType === 'GT' && (docs.GT || activeDoc.docType === 'GT')
      ? 'GT'
      : autoSplitOnTitleClick
      ? 'split'
      : (docs.QP ? 'QP' : (activeDoc.docType || 'QP'));
  const eligibleForViews = isQuestionPaperEligibleForViews(file);
  const paperViews = eligibleForViews ? getPaperTotalViews(file, viewsMap) : 0;

  const currMeta = getCurriculumMeta(file.curriculum);
  const currBadgeText = scopeAllBoards ? currMeta.crossBoardLabel : currMeta.shortLabel;

  // Format crisp monospace component chip for Cambridge ("0625 / 42") vs Edexcel ("WMA11")
  let codeChipText = file.unitCode || '';
  if (isCie && file.unitCode) {
    const pMatch = String(file.unitCode).match(/^(\d{4})-P(\d)$/i);
    if (pMatch) {
      const comp = /^\d$/.test(String(file.variant || '')) ? `${pMatch[2]}${file.variant}` : `P${pMatch[2]}`;
      codeChipText = `${pMatch[1]} / ${comp}`;
    }
  } else if (isCie && file.syllabusCode && !codeChipText) {
    codeChipText = file.syllabusCode;
  }

  const isEdexcelRegional = !isCie && Boolean(
    file.variant === 'R' || file.variant === 'A' || (file.variant && String(file.variant).includes('R'))
  );
  const isCieVariant = isCie && /^\d$/.test(String(file.variant || ''));

  const bookMeta = file.bookMeta || null;
  const sublineText = bookMeta
    ? [bookMeta.authors, bookMeta.publisher, bookMeta.year].filter(Boolean).join(' · ')
    : file.path;

  return (
    <tr className={isUnified ? 'unified-sitting-row' : ''}>
      <td className="file-title-cell">
        <div className="file-title-top-flex">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="file-title-row">
              <a
                href={getOnSitePaperUrl(file, defaultViewMode)}
                rel="nofollow"
                onPointerEnter={preloadReaderChunksOnce}
                onFocus={preloadReaderChunksOnce}
                onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, defaultViewMode); }}
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onOpenReader(file, defaultViewMode);
                }}
                className={titleCls}
                title={isUnified ? `View ${DOC_TYPE_INFO[activeDoc.docType]?.fullLabel || 'Document'} (${displayTitle}) on-site` : `View ${displayTitle} on-site`}
              >
                {displayTitle}
              </a>
            </div>
            <div className="file-meta-subrow">
              {isUnified ? (
                <span className="unified-meta-subline" title={file.folderPath}>
                  {file.fileCount} {file.fileCount === 1 ? 'file' : 'files'} · {file.docTypes.join(' · ')}
                  {file.totalSize ? ` · ${formatBytes(file.totalSize)}` : ''}
                </span>
              ) : (
                <>
                  <span className="file-path-subtext file-location" title={sublineText}>
                    {sublineText}
                  </span>
                  {file.size ? (
                    <span className="file-size-tag">
                      {formatBytes(file.size)} · {(file.ext || 'PDF').toUpperCase()}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>
          {eligibleForViews && <PaperViewsCounter count={paperViews} variant="table" />}
        </div>
      </td>

      <td>
        {!isUnified && (
          <div className="details-primary">
            {formatSubjectDisplay(file.subject)}
            {!isBookCategory(file.category) && shortUnit
              ? ` — ${shortUnit}`
              : ''}
          </div>
        )}
        <div className="details-secondary">
          <span className={`curr-mini-badge ${currMeta.badgeCls}`}>
            {currBadgeText}
          </span>
          {codeChipText && (isUnified || isCie) && (
            <span className="unit-code-chip">{codeChipText}</span>
          )}
          {file.session ? (
            <span className="session-pill-tag">{file.session}</span>
          ) : file.year ? (
            <span>Year {file.year}</span>
          ) : (
            <span>Reference Resource</span>
          )}
          {isEdexcelRegional && (
            <span className="curr-mini-badge regional" title="Regional examination series">
              {file.variant === 'A' ? 'Alt A' : 'Regional'}
            </span>
          )}
          {isCieVariant && (
            <span className="curr-mini-badge cie-variant" title={`Cambridge Timezone Variant ${file.variant}`}>
              Var {file.variant}
            </span>
          )}
        </div>
      </td>

      <td>
        {isUnified ? (
          <div className="unified-actions-cell">
            {CORE_UNIFIED_BTNS.map(({ key, cls, desktop, mobile, desc }) => {
              const doc = docs[key];
              if (!doc) return null;
              return (
                <a
                  key={key}
                  href={getOnSitePaperUrl(file, key)}
                  rel="nofollow"
                  onPointerEnter={preloadReaderChunksOnce}
                  onFocus={preloadReaderChunksOnce}
                  onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, key); }}
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    onOpenReader(file, key);
                  }}
                  className={`unified-doc-btn ${cls}`}
                  aria-label={`${desc} — ${displayTitle}`}
                  title={`${desc} — ${doc.name} (${formatBytes(doc.size)})`}
                >
                  <span className="btn-desktop-text">{desktop}</span>
                  <span className="btn-mobile-text" aria-hidden="true">{mobile}</span>
                </a>
              );
            })}

            {EXTRA_DOC_TYPES.map((extraType) => {
              const extraDoc = docs[extraType];
              if (!extraDoc) return null;
              const [scFullLabel, scShortLabel] = extraType === 'SC' ? getScDocumentLabel(extraDoc) : [null, null];
              const labelMap = {
                AUD: 'Audio',
                SC: scFullLabel || 'Source',
                DF: 'Data Files',
                SOL: 'Solutions',
                SAM: 'Specimen'
              };
              return (
                <a
                  key={extraType}
                  href={getOnSitePaperUrl(file, extraType)}
                  rel="nofollow"
                  onPointerEnter={preloadReaderChunksOnce}
                  onFocus={preloadReaderChunksOnce}
                  onPointerDown={(e) => { if (e.button === 0 && extraType !== 'AUD') prewarmPaperOnPointerDown(file, extraType); }}
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    onOpenReader(file, extraType);
                  }}
                  className={`unified-doc-btn ${extraType === 'AUD' ? 'aud' : 'extra'}`}
                  aria-label={`Open ${labelMap[extraType] || extraType} — ${displayTitle}`}
                  title={`Open ${extraType === 'SC' ? scFullLabel : (DOC_TYPE_INFO[extraType]?.fullLabel || extraType)} on-site — ${extraDoc.name}`}
                >
                  <span className="btn-desktop-text">{labelMap[extraType] || extraType}</span>
                  <span className="btn-mobile-text" aria-hidden="true">{extraType === 'SC' ? scShortLabel : extraType}</span>
                </a>
              );
            })}

            {isPdf && canSplit && (
              <a
                href={getOnSitePaperUrl(file, 'split')}
                rel="nofollow"
                onPointerEnter={preloadReaderChunksOnce}
                onFocus={preloadReaderChunksOnce}
                onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, 'split'); }}
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onOpenReader(file, 'split');
                }}
                className="unified-preview-btn split-btn"
                aria-label={`Split View — ${displayTitle}`}
                title={canSplitMs ? 'Open Question Paper and Mark Scheme side by side in Split View' : `Open Question Paper and ${scSplitFullLabel} side by side in Split View`}
              >
                <span className="btn-desktop-text">Split View</span>
                <span className="btn-mobile-text" aria-hidden="true">Split</span>
              </a>
            )}
          </div>
        ) : (
          <div className="row-actions-cell">
            {viewMode === 'unified' ? (
              <a
                href={getOnSitePaperUrl(file, file.docType || 'Book')}
                rel="nofollow"
                onPointerEnter={preloadReaderChunksOnce}
                onFocus={preloadReaderChunksOnce}
                onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, file.docType || 'Book'); }}
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onOpenReader(file, file.docType || 'Book');
                }}
                className={`unified-doc-btn ${badge?.cls === 'book' || badge?.cls === 'sol' ? 'book' : (badge?.cls || 'extra')}`}
                aria-label={`${badge?.cls === 'book' ? 'Open Textbook' : badge?.cls === 'sol' ? 'Worked Solutions' : `Open ${badge?.fullLabel || 'Resource'}`} — ${displayTitle}`}
              >
                <span className="btn-desktop-text">
                  {badge?.cls === 'book'
                    ? 'Open Textbook'
                    : badge?.cls === 'sol'
                      ? 'Worked Solutions'
                      : `Open ${badge?.fullLabel || 'Resource'}`}
                </span>
                <span className="btn-mobile-text" aria-hidden="true">{badge?.label || 'DOC'}</span>
              </a>
            ) : (
              <>
                {badge ? (
                  <span className={`doc-badge ${badge.cls}`} title={badge.fullLabel}>
                    {badge.label}
                  </span>
                ) : (
                  <span className="doc-badge default">Doc</span>
                )}

                {siblings && ['QP', 'MS', 'ER', 'GT'].map((sibType) => {
                  if (sibType === file.docType) return null;
                  const sib = siblings[sibType];
                  if (!sib) return null;
                  return (
                    <a
                      key={sibType}
                      href={getOnSitePaperUrl(sib, sibType)}
                      rel="nofollow"
                      onPointerEnter={preloadReaderChunksOnce}
                      onFocus={preloadReaderChunksOnce}
                      onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(sib, sibType); }}
                      onClick={(e) => {
                        if (!shouldHandleClientNavigation(e)) return;
                        e.preventDefault();
                        onOpenReader(sib, sibType);
                      }}
                      className={`sibling-pill ${sibType.toLowerCase()}`}
                      title={`Open matching ${DOC_TYPE_INFO[sibType]?.fullLabel} (${file.session})`}
                    >
                      {sibType} ↗
                    </a>
                  );
                })}
              </>
            )}

            {(isPdf || activeDoc.docType === 'AUD' || (activeDoc.docType === 'SOL' && activeDoc.ext === 'zip')) && viewMode !== 'unified' && (
              <a
                href={getOnSitePaperUrl(activeDoc, activeDoc.docType || 'QP')}
                rel="nofollow"
                onPointerEnter={preloadReaderChunksOnce}
                onFocus={preloadReaderChunksOnce}
                onPointerDown={(e) => { if (e.button === 0 && activeDoc.docType !== 'AUD') prewarmPaperOnPointerDown(activeDoc, activeDoc.docType || 'QP'); }}
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onOpenReader(activeDoc, activeDoc.docType || 'QP');
                }}
                className="preview-btn"
                title={
                  activeDoc.docType === 'AUD'
                    ? 'Play Listening Audio On-Site'
                    : siblings?.QP?.ext === 'pdf' && siblings?.MS?.ext === 'pdf'
                    ? 'Open Question Paper and Mark Scheme in PDF Reader'
                    : 'Quick In-App PDF Preview'
                }
              >
                {activeDoc.docType === 'AUD' ? 'Listen' : 'View'}
              </a>
            )}
          </div>
        )}
      </td>
    </tr>
  );
});

/**
 * Examination catalog view: archive title/breadcrumbs header, smart search feedback banner,
 * memoized unified/individual results table, pagination bar, and empty/reconnect fallback states.
 */
export function PaperTable({
  isMobile,
  scopeAllBoards = false,
  suggestedOtherBoard = null,
  onSwitchBoardKeepingQuery,
  searchQuery,
  onSetSearchQuery,
  seoMeta,
  filesLoading,
  visibleFiles,
  totalMatchedCount,
  viewMode,
  searchMeta,
  filterDocType,
  viewsMap,
  loadError,
  catalogTotalCount,
  hasActiveFilters,
  onRetryLoadIndex,
  onClearFilters,
  onLoadMore,
  onShowAll,
  getOnSitePaperUrl,
  onOpenReader,
  breadcrumbProps
}) {
  const isSearchActive = Boolean(searchQuery && searchQuery.trim());
  const suggestedCfg = suggestedOtherBoard ? getBoardConfig(suggestedOtherBoard) : null;

  return (
    <>
      {isSearchActive ? (
        <>
          <h1 className="sr-only">{seoMeta.h1}</h1>
          {!(filesLoading && visibleFiles.length === 0) && totalMatchedCount > 0 && (!isMobile || searchMeta.didYouMean) && (
            <div className="search-results-bar">
              {!isMobile && (
                <span className="search-results-count">
                  {totalMatchedCount > visibleFiles.length ? (
                    <>Showing <strong>{visibleFiles.length}</strong> of <strong>{totalMatchedCount.toLocaleString()}</strong> {viewMode === 'unified' ? 'matching exam sittings' : 'matching documents'}</>
                  ) : (
                    <><strong>{totalMatchedCount.toLocaleString()}</strong> {totalMatchedCount === 1 ? (viewMode === 'unified' ? 'matching exam sitting' : 'matching document') : (viewMode === 'unified' ? 'matching exam sittings' : 'matching documents')}</>
                  )}
                </span>
              )}
              {searchMeta.didYouMean && (
                <span className="search-did-you-mean">
                  Did you mean{' '}
                  <button
                    type="button"
                    className="search-did-you-mean-btn"
                    onClick={() => onSetSearchQuery(searchMeta.didYouMean)}
                  >
                    {searchMeta.didYouMean}
                  </button>
                  ?
                </span>
              )}
            </div>
          )}
          {!(filesLoading && visibleFiles.length === 0) && searchMeta.isPartialFallback && totalMatchedCount > 0 && (
            <div className="search-fallback-banner" role="status">
              <span>
                No exact match for all terms — showing closest partial matches
                {searchMeta.missingTerms?.length > 0 && (
                  <> (missing: <strong>{searchMeta.missingTerms.join(', ')}</strong>)</>
                )}
              </span>
            </div>
          )}
        </>
      ) : !isMobile ? (
        <div className="archive-context-header">
          <Breadcrumbs {...breadcrumbProps} classNameAdd="desktop-breadcrumb" />
          <div className="archive-title-block">
            <h1 className="archive-page-h1">{seoMeta.h1}</h1>
            {seoMeta.subtitle && (
              <p className="archive-page-subtitle">{seoMeta.subtitle}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="archive-title-header">
          <h1 className="archive-page-h1">{seoMeta.h1}</h1>
          {seoMeta.subtitle && (
            <p className="archive-page-subtitle">{seoMeta.subtitle}</p>
          )}
        </div>
      )}

      {filesLoading && visibleFiles.length === 0 ? (
        <TableSkeletonLoader rows={8} viewMode={viewMode} />
      ) : visibleFiles.length > 0 ? (
        <div className="file-list">
          <table className="file-table">
            <thead>
              <tr>
                <th scope="col" className="col-sitting" style={{ width: viewMode === 'unified' ? '40%' : '50%' }}>
                  {filterDocType === 'Book'
                    ? 'Textbook / Solution Resource'
                    : viewMode === 'unified' ? 'Exam Sitting / Resource' : 'Document'}
                </th>
                <th scope="col" className="col-series" style={{ width: viewMode === 'unified' ? '19%' : '26%' }}>
                  {filterDocType === 'Book' ? 'Course & Category' : viewMode === 'unified' ? 'Series' : 'Course & Session'}
                </th>
                <th scope="col" className="col-actions" style={{ width: viewMode === 'unified' ? '41%' : '24%' }}>
                  {filterDocType === 'Book'
                    ? 'Open Textbook / Resource'
                    : viewMode === 'unified' ? 'Open Paper / Mark Scheme / Report' : 'Type & Quick Links'}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleFiles.map((file) => (
                <PaperRow
                  key={file.id || file.path}
                  file={file}
                  viewMode={viewMode}
                  filterDocType={filterDocType}
                  scopeAllBoards={scopeAllBoards}
                  viewsMap={viewsMap}
                  getOnSitePaperUrl={getOnSitePaperUrl}
                  onOpenReader={onOpenReader}
                />
              ))}
            </tbody>
          </table>

          {totalMatchedCount > visibleFiles.length && (
            <div className="pagination-bar">
              <span className="pagination-info">
                Showing <strong>{visibleFiles.length}</strong> of <strong>{totalMatchedCount.toLocaleString()}</strong> {viewMode === 'unified' ? 'matching exam sittings' : 'matching documents'}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="search-button pagination-btn"
                  onClick={onLoadMore}
                >
                  Load 100 More ↓
                </button>
                {totalMatchedCount - visibleFiles.length <= 600 && (
                  <button
                    type="button"
                    className="filter-btn"
                    onClick={onShowAll}
                  >
                    Show All ({totalMatchedCount.toLocaleString()})
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="no-results-box">
          {loadError && catalogTotalCount === 0 ? (
            <>
              <h3>Connecting to repository archive...</h3>
              <p>
                The network connection took longer than expected ({loadError}). Reconnecting automatically in the background...
              </p>
              <button
                type="button"
                className="search-button"
                style={{ marginTop: '14px' }}
                onClick={onRetryLoadIndex}
              >
                Retry Connection Now
              </button>
            </>
          ) : (
            <>
              <h3>No matching documents found</h3>
              <p>Try refining your search terms or resetting an active filter above.</p>
              {suggestedCfg && onSwitchBoardKeepingQuery && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    type="button"
                    className="search-button"
                    onClick={() => onSwitchBoardKeepingQuery(suggestedOtherBoard)}
                  >
                    Search &ldquo;{searchQuery.trim()}&rdquo; in {suggestedCfg.label} →
                  </button>
                </div>
              )}
              {searchMeta.didYouMean && (
                <p className="search-did-you-mean search-did-you-mean-empty">
                  Did you mean{' '}
                  <button
                    type="button"
                    className="search-did-you-mean-btn"
                    onClick={() => onSetSearchQuery(searchMeta.didYouMean)}
                  >
                    {searchMeta.didYouMean}
                  </button>
                  ?
                </p>
              )}
              {hasActiveFilters && (
                <button
                  type="button"
                  className="search-button"
                  style={{ marginTop: '14px' }}
                  onClick={onClearFilters}
                >
                  Reset All Filters
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
