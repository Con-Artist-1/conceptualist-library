import React from 'react';
import '../styles/filter-drawer.css';
import { formatSubjectDisplay } from '../lib/libraryHelpers.js';

const CURRICULUM_PILLS = [
  { value: '', label: 'All' },
  { value: 'Edexcel IAL', label: 'Edexcel IAL' },
  { value: 'Edexcel IGCSE', label: 'Edexcel IGCSE' }
];

const DOC_TYPE_PILLS = [
  { value: null, label: 'All Types' },
  { value: 'QP', label: 'Question Papers' },
  { value: 'MS', label: 'Mark Schemes' },
  { value: 'ER', label: 'Examiner Reports' },
  { value: 'Book', label: 'Textbooks' },
  { value: 'Extra', label: 'Audio / Data / SAMs' }
];

/**
 * Lazy-loaded collapsible filter drawer with curriculum, document type, subject,
 * unit, year, session, sort, and Unified/Individual view mode controls.
 */
export default function FilterDrawer({
  filterCurriculum,
  onSelectCurriculum,
  filterDocType,
  onSelectDocType,
  filterSubject,
  availableSubjects,
  onChangeSubject,
  filterUnit,
  availableUnits,
  onChangeUnit,
  filterYear,
  availableYears,
  onChangeYear,
  filterSession,
  onChangeSession,
  sortBy,
  onChangeSort,
  viewMode,
  onChangeViewMode,
  hasActiveFilters,
  onResetAll,
  totalMatchedCount,
  onDoneMobile
}) {
  return (
    <div id="catalog-filter-drawer" className="filter-controls-container">
      <div className="filter-row">
        <div className="drawer-curriculum-group">
          <span className="filter-group-label">Curriculum:</span>
          <div className="filter-pills" role="group" aria-label="Filter by curriculum">
            {CURRICULUM_PILLS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                aria-pressed={filterCurriculum === opt.value}
                className={`filter-btn ${filterCurriculum === opt.value ? 'active' : ''}`}
                onClick={() => onSelectCurriculum(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <span className="filter-group-label">Type:</span>
        <div className="filter-pills" role="group" aria-label="Filter by document type">
          {DOC_TYPE_PILLS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={filterDocType === opt.value}
              className={`filter-btn ${filterDocType === opt.value ? 'active' : ''}`}
              onClick={() => onSelectDocType(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row filter-row-selects">
        <label htmlFor="subject-select" className="filter-group-label">Subject:</label>
        <select
          id="subject-select"
          aria-label="Filter documents by subject"
          className="filter-select"
          value={filterSubject}
          onChange={(e) => onChangeSubject(e.target.value)}
        >
          <option value="">All Subjects</option>
          {availableSubjects.map((s) => (
            <option key={s} value={s}>{formatSubjectDisplay(s)}</option>
          ))}
        </select>

        {availableUnits.length > 0 && (
          <>
            <label htmlFor="unit-select" className="filter-group-label">Unit:</label>
            <select
              id="unit-select"
              aria-label="Filter documents by unit or paper"
              className="filter-select"
              value={filterUnit}
              onChange={(e) => onChangeUnit(e.target.value)}
            >
              <option value="">All Units &amp; Papers</option>
              {availableUnits.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </>
        )}

        <label htmlFor="year-select" className="filter-group-label">Year:</label>
        <select
          id="year-select"
          aria-label="Filter documents by examination year"
          className="filter-select"
          value={filterYear}
          onChange={(e) => onChangeYear(e.target.value)}
        >
          <option value="">All Years</option>
          {availableYears.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>

        {filterDocType !== 'Book' && (
          <>
            <label htmlFor="session-select" className="filter-group-label">Session:</label>
            <select
              id="session-select"
              aria-label="Filter documents by examination session"
              className="filter-select"
              value={filterSession}
              onChange={(e) => onChangeSession(e.target.value)}
            >
              <option value="">All Sessions</option>
              <option value="January">January</option>
              <option value="June">June</option>
              <option value="October">October</option>
            </select>
          </>
        )}

        <label htmlFor="sort-select" className="filter-group-label">Sort:</label>
        <select
          id="sort-select"
          aria-label="Sort documents"
          className="filter-select"
          value={sortBy}
          onChange={(e) => onChangeSort(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="popular">Most Viewed</option>
          <option value="oldest">Oldest First</option>
          <option value="name_asc">Name (A–Z)</option>
          <option value="name_desc">Name (Z–A)</option>
          <option value="size_desc">File Size (Largest)</option>
        </select>

        <span className="filter-group-label">View:</span>
        <div className="view-mode-toggle" role="group" aria-label="Toggle Unified Sittings vs Individual Files">
          <button
            type="button"
            aria-pressed={viewMode === 'unified'}
            className={`view-mode-btn ${viewMode === 'unified' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('unified')}
            title="Combine QP, MS, and ER from the same sitting into one row"
          >
            Unified Sittings
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'separate'}
            className={`view-mode-btn ${viewMode === 'separate' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('separate')}
            title="Show every file as a separate row"
          >
            Individual Files
          </button>
        </div>

        {hasActiveFilters && (
          <button type="button" className="filter-reset-btn" onClick={onResetAll}>
            Reset All
          </button>
        )}

        <button
          type="button"
          className="filter-apply-btn mobile-only"
          onClick={onDoneMobile}
        >
          Done &amp; View Results ({totalMatchedCount.toLocaleString()})
        </button>
      </div>
    </div>
  );
}
