import React from 'react';
import '../styles/filter-drawer.css';
import { formatSubjectDisplay } from '../lib/libraryHelpers.js';
import { extractSyllabusCodeFromSubject, resolveCambridgeSyllabus } from '../data/cambridgeCatalog.js';

function formatSubjectOptionLabel(subject, filterCurriculum) {
  const base = formatSubjectDisplay(subject);
  if (filterCurriculum) return base;
  const code = extractSyllabusCodeFromSubject(subject);
  if (!code) return base;
  const entry = resolveCambridgeSyllabus(code);
  if (!entry) return base;
  const lvlShort = entry.spec === 'CIE-AL' ? 'A-Level' : entry.spec === 'CIE-OL' ? 'O Level' : 'IGCSE';
  return base.replace(`(${code})`, `(${code} · ${lvlShort})`);
}

const BOARD_PILLS = [
  { value: 'edexcel', label: 'Edexcel' },
  { value: 'cambridge', label: 'Cambridge' },
  { value: 'all', label: 'All Boards' }
];

const CURRICULUM_PILLS_BY_SCOPE = {
  edexcel: [
    { value: '', label: 'All' },
    { value: 'Edexcel IAL', label: 'Edexcel IAL' },
    { value: 'Edexcel IGCSE', label: 'Edexcel IGCSE' }
  ],
  cambridge: [
    { value: '', label: 'All' },
    { value: 'Cambridge AS & A Level', label: 'AS & A Level' },
    { value: 'Cambridge IGCSE', label: 'IGCSE' },
    { value: 'Cambridge O Level', label: 'O Level' }
  ],
  all: [
    { value: '', label: 'All' },
    { value: 'Edexcel IAL', label: 'Edexcel IAL' },
    { value: 'Edexcel IGCSE', label: 'Edexcel IGCSE' },
    { value: 'Cambridge AS & A Level', label: 'CAIE A-Level' },
    { value: 'Cambridge IGCSE', label: 'CAIE IGCSE' },
    { value: 'Cambridge O Level', label: 'CAIE O Level' }
  ]
};

const VARIANT_PILLS = [
  { value: '', label: 'All' },
  { value: '1', label: 'v1' },
  { value: '2', label: 'v2' },
  { value: '3', label: 'v3' }
];

/**
 * Lazy-loaded collapsible filter drawer with board scope, curriculum, document type,
 * subject, unit/paper, year, session, Cambridge variant, sort, and Unified/Individual view mode controls.
 */
export default function FilterDrawer({
  activeBoard = 'edexcel',
  scopeAllBoards = false,
  onSelectBoardScope,
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
  filterVariant = '',
  onChangeVariant,
  sortBy,
  onChangeSort,
  viewMode,
  onChangeViewMode,
  hasActiveFilters,
  onResetAll,
  totalMatchedCount,
  onDoneMobile
}) {
  const boardScope = scopeAllBoards ? 'all' : activeBoard;
  const isCieMode = boardScope === 'cambridge' || boardScope === 'all';
  const curriculumPills = CURRICULUM_PILLS_BY_SCOPE[boardScope] || CURRICULUM_PILLS_BY_SCOPE.edexcel;

  const docTypePills = isCieMode
    ? [
        { value: null, label: 'All Types' },
        { value: 'QP', label: 'Question Papers' },
        { value: 'MS', label: 'Mark Schemes' },
        { value: 'GT', label: 'Thresholds (GT)' },
        { value: 'ER', label: 'Examiner Reports' },
        { value: 'SC', label: 'Inserts / CI' },
        ...(boardScope === 'all' ? [{ value: 'Book', label: 'Textbooks' }] : []),
        { value: 'Extra', label: 'Audio / Data / SAMs' }
      ]
    : [
        { value: null, label: 'All Types' },
        { value: 'QP', label: 'Question Papers' },
        { value: 'MS', label: 'Mark Schemes' },
        { value: 'ER', label: 'Examiner Reports' },
        { value: 'Book', label: 'Textbooks' },
        { value: 'Extra', label: 'Audio / Data / SAMs' }
      ];

  const sessionOptions =
    boardScope === 'cambridge'
      ? ['Feb/March', 'May/June', 'Oct/Nov']
      : boardScope === 'all'
        ? ['January', 'Feb/March', 'June', 'May/June', 'October', 'Oct/Nov']
        : ['January', 'June', 'October'];

  return (
    <div id="catalog-filter-drawer" className="filter-controls-container">
      <div className="filter-row">
        {onSelectBoardScope && (
          <>
            <span className="filter-group-label">Board:</span>
            <div className="filter-pills" role="group" aria-label="Filter by examination board">
              {BOARD_PILLS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={boardScope === opt.value}
                  className={`filter-btn ${boardScope === opt.value ? 'active' : ''}`}
                  onClick={() => onSelectBoardScope(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className={boardScope === 'all' ? 'drawer-curriculum-group drawer-curriculum-always' : 'drawer-curriculum-group'}>
          <span className="filter-group-label">{boardScope === 'cambridge' ? 'Level:' : 'Curriculum:'}</span>
          <div className="filter-pills" role="group" aria-label="Filter by curriculum">
            {curriculumPills.map((opt) => (
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
          {docTypePills.map((opt) => (
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
            <option key={s} value={s}>{formatSubjectOptionLabel(s, filterCurriculum)}</option>
          ))}
        </select>

        {availableUnits.length > 0 && (
          <>
            <label htmlFor="unit-select" className="filter-group-label">
              {boardScope === 'cambridge' ? 'Paper:' : 'Unit:'}
            </label>
            <select
              id="unit-select"
              aria-label="Filter documents by unit or paper"
              className="filter-select"
              value={filterUnit}
              onChange={(e) => onChangeUnit(e.target.value)}
            >
              <option value="">{boardScope === 'cambridge' ? 'All Papers' : 'All Units & Papers'}</option>
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
              {sessionOptions.map((sess) => (
                <option key={sess} value={sess}>{sess}</option>
              ))}
            </select>
          </>
        )}

        {isCieMode && filterDocType !== 'Book' && onChangeVariant && (
          <>
            <span className="filter-group-label">Variant:</span>
            <div className="filter-pills" role="group" aria-label="Filter Cambridge timezone variant">
              {VARIANT_PILLS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={filterVariant === opt.value}
                  className={`filter-btn ${filterVariant === opt.value ? 'active' : ''}`}
                  onClick={() => onChangeVariant(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
