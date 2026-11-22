import React, { lazy, Suspense } from 'react';

const FilterDrawer = lazy(() => import('./FilterDrawer.jsx'));

const QUICK_CURRICULUM_PILLS = [
  { value: '', label: 'All' },
  { value: 'Edexcel IAL', label: 'IAL' },
  { value: 'Edexcel IGCSE', label: 'IGCSE' }
];

/**
 * Sticky search bar with course-code/fuzzy search input, quick curriculum pills,
 * active filter drawer toggle, and lazy-loaded FilterDrawer.
 */
export function SearchBanner({
  searchInputRef,
  isMobile,
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
  return (
    <div className="search-banner">
      <div className="search-row">
        <div className="search-input-wrapper">
          <label htmlFor="search-input" className="sr-only">
            Search repository by course code, subject, unit or year
          </label>
          <svg className="search-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            id="search-input"
            type="text"
            className="search-input"
            placeholder={isMobile ? 'Search unit, code, or year...' : 'Search by course code, subject, unit or year (e.g. WMA11, Biology, 4MA1)...'}
            value={searchQuery}
            onFocus={onSearchFocus}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search by course code, subject, unit or year"
          />
          {searchQuery ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={onClearSearch}
              aria-label="Clear search query"
            >
              ✕
            </button>
          ) : (
            <kbd className="search-shortcut-hint" title="Press / to search">/</kbd>
          )}
        </div>

        <div className="search-button-group">
          <div className="quick-curriculum-pills" role="group" aria-label="Filter by curriculum">
            {QUICK_CURRICULUM_PILLS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={`quick-curr-btn ${filterCurriculum === opt.value ? 'active' : ''}`}
                onClick={() => onSelectCurriculum(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
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

      {showFilters && (
        <Suspense fallback={null}>
          <FilterDrawer {...filterDrawerProps} />
        </Suspense>
      )}
    </div>
  );
}
