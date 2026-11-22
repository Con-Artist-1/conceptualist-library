import React from 'react';
import { DOC_TYPE_INFO, formatSubjectDisplay } from '../lib/libraryHelpers.js';

/**
 * Interactive filter breadcrumb trail and result count summary shared between
 * Desktop context header and Mobile header breadcrumb bar.
 */
export const Breadcrumbs = React.memo(({
  classNameAdd = '',
  navigateToHome,
  filterCurriculum,
  onClearCurriculum,
  filterSubject,
  onClearSubject,
  filterUnit,
  onClearUnit,
  filterYear,
  onClearYear,
  filterSession,
  onClearSession,
  filterDocType,
  onClearDocType,
  breadcrumbParts,
  onSelectBreadcrumbPath,
  searchQuery,
  onClearSearch,
  filesLoading,
  loadError,
  catalogTotalCount,
  totalMatchedCount,
  visibleFilesCount,
  viewMode
}) => (
  <div className={`breadcrumb-container ${classNameAdd}`}>
    <div className="breadcrumb-trail">
      <a href="/" className="breadcrumb-link home" onClick={navigateToHome}>
        <span className="btn-desktop-text">← Library Home</span>
        <span className="btn-mobile-text" aria-hidden="true">← Home</span>
      </a>
      {filterCurriculum && (
        <>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link" onClick={onClearCurriculum} title="Click to remove curriculum filter">
            {filterCurriculum} ×
          </button>
        </>
      )}
      {filterSubject && (
        <>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link" onClick={onClearSubject} title="Click to remove subject filter">
            {formatSubjectDisplay(filterSubject)} ×
          </button>
        </>
      )}
      {filterUnit && (
        <>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link" onClick={onClearUnit} title="Click to remove unit filter">
            {filterUnit} ×
          </button>
        </>
      )}
      {filterYear && (
        <>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link" onClick={onClearYear} title="Click to remove year filter">
            {filterYear} ×
          </button>
        </>
      )}
      {filterSession && (
        <>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link" onClick={onClearSession} title="Click to remove session filter">
            {filterSession} ×
          </button>
        </>
      )}
      {filterDocType && (
        <>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link" onClick={onClearDocType} title="Click to remove document type filter">
            {DOC_TYPE_INFO[filterDocType]?.fullLabel || filterDocType} ×
          </button>
        </>
      )}
      {breadcrumbParts.map((part, i) => (
        <React.Fragment key={i}>
          <span className="breadcrumb-separator">/</span>
          <button
            type="button"
            className="breadcrumb-link"
            onClick={() => onSelectBreadcrumbPath(breadcrumbParts.slice(0, i + 1).join('/'))}
          >
            {part}
          </button>
        </React.Fragment>
      ))}
      {searchQuery && (
        <>
          <span className="breadcrumb-separator">/</span>
          <button type="button" className="breadcrumb-link" onClick={onClearSearch} title="Clear search query">
            Search: &ldquo;{searchQuery}&rdquo; ×
          </button>
        </>
      )}
    </div>

    <div className="result-summary">
      {filesLoading ? (
        <span>Loading full catalog...</span>
      ) : loadError && catalogTotalCount === 0 ? (
        <span style={{ color: '#8A2030', fontWeight: 600 }}>Reconnecting to archive...</span>
      ) : totalMatchedCount > visibleFilesCount ? (
        <>
          Showing <strong>{visibleFilesCount}</strong> of <strong>{totalMatchedCount.toLocaleString()}</strong>{' '}
          {filterDocType === 'Book'
            ? 'textbooks'
            : (viewMode === 'unified' ? 'exam sittings' : 'documents')}
        </>
      ) : (
        <>
          Displaying <strong>{totalMatchedCount.toLocaleString()}</strong> matching{' '}
          {filterDocType === 'Book'
            ? (totalMatchedCount === 1 ? 'textbook' : 'textbooks')
            : viewMode === 'unified'
              ? (totalMatchedCount === 1 ? 'exam sitting' : 'exam sittings')
              : (totalMatchedCount === 1 ? 'document' : 'documents')}
        </>
      )}
    </div>
  </div>
));
