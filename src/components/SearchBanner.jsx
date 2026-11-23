import React, { lazy, Suspense, useEffect, useRef } from 'react';
import { getBoardConfig } from '../data/boards.js';

const FilterDrawer = lazy(() => import('./FilterDrawer.jsx'));

const QUICK_PILLS_BY_BOARD = {
  edexcel: [
    { value: '', label: 'All' },
    { value: 'Edexcel IAL', label: 'IAL' },
    { value: 'Edexcel IGCSE', label: 'IGCSE' }
  ],
  cambridge: [
    { value: '', label: 'All' },
    { value: 'Cambridge AS & A Level', label: 'A-Level' },
    { value: 'Cambridge IGCSE', label: 'IGCSE' },
    { value: 'Cambridge O Level', label: 'O-Level' }
  ]
};

/**
 * Sticky search bar with board-aware placeholder, quick curriculum pills,
 * cross-board smart nudge, active filter drawer toggle, and lazy-loaded FilterDrawer.
 */
export function SearchBanner({
  searchInputRef,
  isMobile,
  activeBoard = 'edexcel',
  scopeAllBoards = false,
  suggestedOtherBoard = null,
  onSwitchBoardKeepingQuery,
  searchQuery,
  onSearchChange,
  onSearchFocus,
  onClearSearch,
  filterCurriculum,
  onSelectCurriculum,
  showFilters,
  onToggleFilters,
  activeDrawerFilterCount,
  hasActiveFilters,
  onClearFilters,
  filterDrawerProps
}) {
  const filterToggleBtnRef = useRef(null);
  const boardCfg = getBoardConfig(activeBoard);
  const quickPills = QUICK_PILLS_BY_BOARD[activeBoard] || QUICK_PILLS_BY_BOARD.edexcel;
  const suggestedCfg = suggestedOtherBoard ? getBoardConfig(suggestedOtherBoard) : null;

  useEffect(() => {
    if (!showFilters) return undefined;
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onToggleFilters();
        filterToggleBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showFilters, onToggleFilters]);

  const placeholderText = scopeAllBoards
    ? (isMobile ? 'Search Edexcel & Cambridge...' : 'Search across Edexcel & Cambridge (e.g. WMA11, 0625 42, 9709 s24)...')
    : (isMobile ? boardCfg.searchPlaceholderMobile : boardCfg.searchPlaceholderDesktop);

  return (
    <div className="search-banner">
      <div className="search-row">
        <div className="search-input-wrapper">
          <label htmlFor="search-input" className="sr-only">
            Search repository by course code, syllabus, subject, unit or year
          </label>
          <svg aria-hidden="true" className="search-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            id="search-input"
            type="text"
            className="search-input"
            placeholder={placeholderText}
            value={searchQuery}
            onFocus={onSearchFocus}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search by course code, syllabus, subject, unit or year"
          />
          {searchQuery ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={onClearSearch}
              aria-label="Clear search query"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : (
            <kbd className="search-shortcut-hint" title="Press / to search">/</kbd>
          )}
        </div>

        <div className="search-button-group">
          <div className="quick-curriculum-pills" role="group" aria-label="Filter by curriculum">
            {quickPills.map((opt) => (
              <button
                key={opt.label}
                type="button"
                aria-pressed={filterCurriculum === opt.value}
                className={`quick-curr-btn ${filterCurriculum === opt.value ? 'active' : ''}`}
                onClick={() => onSelectCurriculum(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            ref={filterToggleBtnRef}
            type="button"
            className={`filter-drawer-toggle ${showFilters ? 'active' : ''}`}
            onClick={onToggleFilters}
            aria-expanded={showFilters}
            aria-controls="catalog-filter-drawer"
            aria-label="Toggle Filters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span className="filter-toggle-label">Filters</span>
            {activeDrawerFilterCount > 0 && (
              <span className="filter-count-badge">{activeDrawerFilterCount}</span>
            )}
          </button>

          {hasActiveFilters && !showFilters && (
            <button
              type="button"
              className="search-reset-inline"
              onClick={onClearFilters}
              title="Clear all active filters and return to Library Home"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {suggestedCfg && onSwitchBoardKeepingQuery && (
        <div className="cross-board-nudge" role="status">
          <span>
            This looks like a <strong>{suggestedCfg.label}</strong> query — currently searching <strong>{boardCfg.shortLabel}</strong>.
          </span>
          <button
            type="button"
            className="cross-board-nudge-btn"
            onClick={() => onSwitchBoardKeepingQuery(suggestedOtherBoard)}
          >
            Switch to {suggestedCfg.shortLabel} →
          </button>
        </div>
      )}

      {showFilters && (
        <Suspense fallback={null}>
          <FilterDrawer {...filterDrawerProps} />
        </Suspense>
      )}
    </div>
  );
}
