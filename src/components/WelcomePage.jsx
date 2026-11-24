import React, { useMemo } from 'react';
import '../styles/welcome.css';
import {
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  IAL_SUBJECTS_DEFAULT,
  IGCSE_SUBJECTS_DEFAULT
} from '../lib/routeCore.js';
import { getCurriculumMeta, isCambridgeCurriculum } from '../data/boards.js';
import {
  extractSyllabusCodeFromSubject,
  resolveCambridgeSyllabus
} from '../data/cambridgeCatalog.js';
import { compareUnitLabels, isLegacyUnitLabel } from '../lib/unitSort.js';
import {
  shouldHandleClientNavigation,
  formatSubjectDisplay,
  getDisplayTitle,
  getUnifiedSittingTitle
} from '../lib/libraryHelpers.js';
import { preloadReaderChunksOnce, prewarmPaperOnPointerDown } from '../lib/pdfPrewarm.js';

function stripSyllabusCodeFromTitle(subj) {
  return String(subj || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

const WelcomePage = ({
  data,
  activeBoard = 'edexcel',
  recentHistory = [],
  selectedSubject = null,
  selectedUnit = null,
  onWizardSubjectChange,
  onWizardUnitChange,
  onOpenPaper,
  onClearHistory,
  getOnSitePaperUrl,
  onSubjectSelect,
  onViewAll,
  onBrowseTextbooks,
  onBrowseAudio,
  onBrowseThresholds,
  onQuickCurriculum,
  onTrySampleAudio,
  onSelectFinalFilter
}) => {
  const isCie = activeBoard === 'cambridge';
  const hasHistory = Array.isArray(recentHistory) && recentHistory.length > 0;
  const bookCount = data.meta?.boards?.edexcel?.totalBooks ?? data.meta?.totalBooks ?? 73;
  const audioCount = data.meta?.boards?.edexcel?.audioCount ?? data.meta?.audioCount ?? 272;

  const ialSubjects = data.meta?.ialSubjects || IAL_SUBJECTS_DEFAULT;
  const igcseSubjects = data.meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT;
  const ialSubjectCoverage = data.meta?.ialSubjectCoverage || data.meta?.subjectCoverage || {};
  const igcseSubjectCoverage = data.meta?.igcseSubjectCoverage || data.meta?.subjectCoverage || {};

  const cieAlSubjects = data.meta?.cieAlSubjects || [];
  const cieIgcseSubjects = data.meta?.cieIgcseSubjects || [];
  const cieOlSubjects = data.meta?.cieOlSubjects || [];
  const cieAlCoverage = data.meta?.cieAlSubjectCoverage || {};
  const cieIgcseCoverage = data.meta?.cieIgcseSubjectCoverage || {};
  const cieOlCoverage = data.meta?.cieOlSubjectCoverage || {};

  const wizardMeta = data.meta?.wizard || null;
  const edexcelMeta = data.meta?.boards?.edexcel || null;
  const cambridgeMeta = data.meta?.boards?.cambridge || null;

  const edexcelUniqueCount = edexcelMeta?.uniqueFiles ?? data.meta?.uniqueFiles ?? 16051;
  const cambridgeUniqueCount = cambridgeMeta?.uniqueFiles ?? 0;
  const cambridgeSubjectTotal = cieAlSubjects.length + cieIgcseSubjects.length + cieOlSubjects.length;

  // Instant 0ms units from precomputed meta.wizard
  const availableUnitsMap = useMemo(() => {
    if (!selectedSubject) return {};
    const { name, curriculum } = selectedSubject;
    if (wizardMeta && wizardMeta[curriculum] && wizardMeta[curriculum][name]) {
      return wizardMeta[curriculum][name].units || {};
    }
    return {};
  }, [wizardMeta, selectedSubject]);

  const availableUnits = useMemo(() => (
    Object.keys(availableUnitsMap).sort((a, b) => compareUnitLabels(a, b, selectedSubject?.name || ''))
  ), [availableUnitsMap, selectedSubject]);

  // Group available units cleanly per board & subject
  const groupedUnits = useMemo(() => {
    if (!availableUnits.length) return {};
    const subjName = selectedSubject?.name || '';
    const currName = selectedSubject?.curriculum || '';
    const isIalMath = subjName === 'Math' && currName !== 'Edexcel IGCSE';
    const isCieSubject = isCambridgeCurriculum(currName);
    const cieCode = isCieSubject ? extractSyllabusCodeFromSubject(subjName) : '';

    if (isIalMath) {
      const mathGroupOrder = [
        'Pure Mathematics',
        'Mechanics',
        'Statistics',
        'Decision Mathematics',
        'Further Pure Mathematics',
        'Legacy Core Mathematics'
      ];
      const buckets = {};
      availableUnits.forEach((unit) => {
        let groupName = 'Course Units';
        if (unit.includes('Further Pure')) groupName = 'Further Pure Mathematics';
        else if (unit.includes('Pure')) groupName = 'Pure Mathematics';
        else if (unit.includes('Mechanics')) groupName = 'Mechanics';
        else if (unit.includes('Statistics')) groupName = 'Statistics';
        else if (unit.includes('Decision')) groupName = 'Decision Mathematics';
        else if (unit.includes('Core')) groupName = 'Legacy Core Mathematics';
        if (!buckets[groupName]) buckets[groupName] = [];
        buckets[groupName].push(unit);
      });
      const ordered = {};
      mathGroupOrder.forEach((g) => {
        if (buckets[g]?.length) ordered[g] = buckets[g];
      });
      Object.keys(buckets).forEach((g) => {
        if (!ordered[g] && buckets[g]?.length) ordered[g] = buckets[g];
      });
      return ordered;
    }

    if (cieCode === '9709') {
      const order = ['Pure Mathematics', 'Mechanics', 'Probability & Statistics', 'Legacy Specification (Pre-2020)'];
      const buckets = {};
      availableUnits.forEach((unit) => {
        let g = 'Examination Papers';
        if (isLegacyUnitLabel(unit)) g = 'Legacy Specification (Pre-2020)';
        else if (unit.includes('Pure')) g = 'Pure Mathematics';
        else if (unit.includes('Mechanics')) g = 'Mechanics';
        else if (unit.includes('Statistics')) g = 'Probability & Statistics';
        if (!buckets[g]) buckets[g] = [];
        buckets[g].push(unit);
      });
      const ordered = {};
      order.forEach((g) => { if (buckets[g]?.length) ordered[g] = buckets[g]; });
      Object.keys(buckets).forEach((g) => { if (!ordered[g] && buckets[g]?.length) ordered[g] = buckets[g]; });
      return ordered;
    }

    if (isCieSubject && currName === 'Cambridge IGCSE' && availableUnits.some((u) => u.includes('(Extended)')) && availableUnits.some((u) => u.includes('(Core)'))) {
      const order = ['Extended Tier', 'Core Tier', 'Practical & Alternative to Practical', 'Legacy Specification'];
      const buckets = {};
      availableUnits.forEach((unit) => {
        let g = 'Practical & Alternative to Practical';
        if (isLegacyUnitLabel(unit)) g = 'Legacy Specification';
        else if (unit.includes('(Extended)')) g = 'Extended Tier';
        else if (unit.includes('(Core)')) g = 'Core Tier';
        if (!buckets[g]) buckets[g] = [];
        buckets[g].push(unit);
      });
      const ordered = {};
      order.forEach((g) => { if (buckets[g]?.length) ordered[g] = buckets[g]; });
      return ordered;
    }

    const currentUnits = [];
    const legacyUnits = [];
    availableUnits.forEach((unit) => {
      if (isLegacyUnitLabel(unit)) legacyUnits.push(unit);
      else currentUnits.push(unit);
    });

    if (currentUnits.length > 0 && legacyUnits.length > 0) {
      return {
        'Current Specification': currentUnits,
        [isCieSubject ? 'Legacy Specification' : 'Legacy Specification (Pre-2018)']: legacyUnits
      };
    }

    const singleLabel = availableUnits.every((u) => u.includes('Paper'))
      ? 'Examination Papers'
      : 'Course Units';
    return { [singleLabel]: availableUnits };
  }, [availableUnits, selectedSubject]);

  const availableYears = useMemo(() => {
    if (!selectedSubject) return [];
    const { name, curriculum } = selectedSubject;
    if (selectedUnit && availableUnitsMap[selectedUnit]) {
      return availableUnitsMap[selectedUnit].years || [];
    }
    if (wizardMeta && wizardMeta[curriculum] && wizardMeta[curriculum][name]) {
      return wizardMeta[curriculum][name].allYears || [];
    }
    return [];
  }, [wizardMeta, availableUnitsMap, selectedSubject, selectedUnit]);

  const handleSubjectClick = (subjectName, curriculum) => {
    onWizardSubjectChange({ name: subjectName, curriculum });
    onWizardUnitChange(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const handleUnitClick = (unitName) => {
    onWizardUnitChange(unitName);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const handleYearClick = (yearVal) => {
    onSelectFinalFilter({
      subject: selectedSubject.name,
      curriculum: selectedSubject.curriculum,
      unit: selectedUnit,
      year: yearVal
    });
  };

  const renderCambridgeSubjectGrid = (subjects, curriculum, coverageMap, cardModCls) => {
    if (!subjects || subjects.length === 0) return null;
    const currSlug = getCurriculumSlug(curriculum);
    return (
      <div className="subject-grid" style={{ marginBottom: '32px' }}>
        {subjects.map((subject) => {
          const subjWizard = wizardMeta?.[curriculum]?.[subject];
          const docCount = subjWizard?.totalFiles || 0;
          const sylCode = extractSyllabusCodeFromSubject(subject);
          const entry = sylCode ? resolveCambridgeSyllabus(sylCode) : null;
          const cleanName = stripSyllabusCodeFromTitle(subject);
          const subjHref = `/${currSlug}/${getSubjectSlug(subject)}`;
          return (
            <a
              key={`${curriculum}-${subject}`}
              href={subjHref}
              className={`subject-card ${cardModCls}`}
              onClick={(e) => {
                if (!shouldHandleClientNavigation(e)) return;
                e.preventDefault();
                handleSubjectClick(subject, curriculum);
              }}
            >
              <div className="subject-card-top">
                <div className="subject-card-title-group">
                  {sylCode && <span className={`syllabus-code-pill ${cardModCls}`}>{sylCode}</span>}
                  <div className="subject-card-title">{cleanName}</div>
                </div>
                {docCount > 0 && <span className={`subject-card-count ${cardModCls}`}>{docCount} docs</span>}
              </div>
              <div className="subject-card-subtitle">
                {coverageMap[subject] || `${curriculum} Collection`}
                {entry?.alt91 ? ` • 9–1: ${entry.alt91}` : ''}
              </div>
            </a>
          );
        })}
      </div>
    );
  };

  return (
    <div className="welcome-container">
      <div className={`welcome-hero ${selectedSubject ? 'mobile-hidden' : ''}`}>
        <div className="welcome-hero-top">
          <div>
            {isCie ? (
              <>
                <h1>Cambridge International Past Exam Papers</h1>
                <p>
                  Independent Cambridge International (CAIE) study archive covering AS &amp; A Level, IGCSE (A*–G &amp; 9–1), and O Level — filter by variant, inspect Grade Thresholds, and read paired papers in Split View.
                </p>
              </>
            ) : (
              <>
                <h1>Edexcel IAL &amp; IGCSE Past Exam Papers &amp; Textbooks</h1>
                <p>
                  Independent Edexcel IAL &amp; IGCSE study archive — read paired papers in Split View, browse worked solution textbooks, or stream listening exams with live subtitles in-browser.
                </p>
              </>
            )}
          </div>
          <div className="hero-stats-row">
            {isCie ? (
              <>
                <div className="hero-stat-pill">
                  <strong>{cambridgeUniqueCount.toLocaleString()}</strong>
                  <span>Unique Papers</span>
                </div>
                <div className="hero-stat-pill">
                  <strong>{cambridgeSubjectTotal}</strong>
                  <span>Syllabuses</span>
                </div>
              </>
            ) : (
              <>
                <div className="hero-stat-pill">
                  <strong>{edexcelUniqueCount.toLocaleString()}</strong>
                  <span>Unique Papers</span>
                </div>
                <div className="hero-stat-pill">
                  <strong>{ialSubjects.length + igcseSubjects.length}</strong>
                  <span>Subjects</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {!selectedSubject && !isCie && (
        <section className="home-pillars-grid" aria-label="Core archive collections">
          <div className="pillar-card">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <h2>Past Exam Papers</h2>
              </div>
              <span className="pillar-badge">
                {(edexcelMeta?.coverage || data.meta?.coverage || '2003–2026').replace(/[A-Za-z]+\s+/g, '').replace(/\s+/g, '') || '2003–2026'}
              </span>
            </div>
            <p className="pillar-desc">
              Paired Question Papers, Mark Schemes &amp; Examiner Reports with instant side-by-side Split View.
            </p>
            <div className="pillar-actions">
              <a
                href="/papers"
                className="pillar-btn"
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onViewAll();
                }}
              >
                Browse All Papers →
              </a>
            </div>
          </div>

          <div className="pillar-card pillar-books">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                <h2>Textbooks &amp; Solutions</h2>
              </div>
              <span className="pillar-badge pillar-badge-books">{bookCount} Resources</span>
            </div>
            <p className="pillar-desc">
              Complete Edexcel IAL &amp; IGCSE student books, revision guides, and step-by-step Solution Banks.
            </p>
            <div className="pillar-actions">
              <a
                href="/textbooks"
                className="pillar-btn"
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onBrowseTextbooks();
                }}
              >
                Browse Textbooks →
              </a>
            </div>
          </div>

          <div className="pillar-card pillar-audio">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
                <h2>Listening Audio &amp; Subtitles</h2>
              </div>
              <span className="pillar-badge pillar-badge-audio">Live CC · In-Browser</span>
            </div>
            <p className="pillar-desc">
              Play {audioCount} ESL, Chinese, Swahili, French, German &amp; Spanish MP3s and ZIP archives above Question Papers with clickable synced transcripts.
            </p>
            <div className="pillar-actions">
              <a
                href="/#paper=IAL%7CFrench%7CWFR02%7C%7CJune%202021&view=AUD"
                rel="nofollow"
                className="pillar-btn primary"
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onTrySampleAudio();
                }}
              >
                Try Sample Track + CC
              </a>
              <a
                href="/audio"
                className="pillar-btn"
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onBrowseAudio();
                }}
              >
                All Audio →
              </a>
            </div>
          </div>
        </section>
      )}

      {!selectedSubject && isCie && (
        <section className="home-pillars-grid" aria-label="Cambridge archive collections">
          <div className="pillar-card">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <h2>All Cambridge Papers</h2>
              </div>
              <span className="pillar-badge">v1 · v2 · v3</span>
            </div>
            <p className="pillar-desc">
              Search directly by syllabus code, component, or series shorthand (e.g. <strong>0625 42</strong>, <strong>9709 s24</strong>, or <strong>4024 22</strong>).
            </p>
            <div className="pillar-actions">
              <a
                href="/cambridge/papers"
                className="pillar-btn"
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onViewAll();
                }}
              >
                Browse All Cambridge →
              </a>
            </div>
          </div>

          <div className="pillar-card pillar-books">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <h2>Grade Thresholds &amp; Inserts</h2>
              </div>
              <span className="pillar-badge pillar-badge-books">GT + IN Split</span>
            </div>
            <p className="pillar-desc">
              Session-wide Grade Thresholds (GT) and Examiner Reports attach to every paper sitting, alongside QP + Insert Split View.
            </p>
            <div className="pillar-actions">
              <button
                type="button"
                className="pillar-btn"
                onClick={() => onBrowseThresholds && onBrowseThresholds()}
              >
                Browse Thresholds (GT) →
              </button>
            </div>
          </div>

          <div className="pillar-card pillar-audio">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <h2>International Levels</h2>
              </div>
              <span className="pillar-badge pillar-badge-audio">3 Qualifications</span>
            </div>
            <p className="pillar-desc">
              Jump straight to Cambridge International AS &amp; A Level, IGCSE (A*–G &amp; 9–1 unified), or O Level collections.
            </p>
            <div className="pillar-actions">
              <a
                href="/cambridge/a-level"
                className="pillar-btn"
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onQuickCurriculum?.('Cambridge AS & A Level');
                }}
              >
                A-Level
              </a>
              <a
                href="/cambridge/igcse"
                className="pillar-btn"
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onQuickCurriculum?.('Cambridge IGCSE');
                }}
              >
                IGCSE
              </a>
              <a
                href="/cambridge/o-level"
                className="pillar-btn"
                onClick={(e) => {
                  if (!shouldHandleClientNavigation(e)) return;
                  e.preventDefault();
                  onQuickCurriculum?.('Cambridge O Level');
                }}
              >
                O-Level
              </a>
            </div>
          </div>
        </section>
      )}

      {/* RECENTLY VIEWED PAST PAPERS HISTORY SECTION */}
      {hasHistory && !selectedSubject && (
        <section className="history-section" aria-label="Recently Viewed Past Papers">
          <div className="history-header-row">
            <div className="history-title-group">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <h2 className="history-section-title">Recently Viewed Past Papers</h2>
              <span className="history-count-pill">{recentHistory.length} recent</span>
            </div>
            <button
              type="button"
              className="history-clear-btn"
              onClick={onClearHistory}
              title="Clear recently viewed papers history"
            >
              Clear History
            </button>
          </div>

          <div className="history-grid">
            {recentHistory.map((item) => {
              const title = item.isUnifiedSitting ? getUnifiedSittingTitle(item) : getDisplayTitle(item);
              const docs = item.docs || item.siblings || {};
              const hasQP = Boolean(docs.QP || item.docType === 'QP');
              const hasMS = Boolean(docs.MS || item.docType === 'MS');
              const hasER = Boolean(docs.ER || item.docType === 'ER');
              const hasGT = Boolean(docs.GT || item.docType === 'GT');
              const hasAUD = Boolean(docs.AUD || item.docType === 'AUD');
              const hasSC = Boolean(docs.SC || item.docType === 'SC');
              const canSplit = Boolean(docs.QP?.ext === 'pdf' && (docs.MS?.ext === 'pdf' || docs.SC?.ext === 'pdf'));
              const primaryMode = hasQP ? 'QP' : (item.lastView || item.docType || 'QP');
              const qpHref = getOnSitePaperUrl ? getOnSitePaperUrl(item, primaryMode) : '#';
              const currMeta = getCurriculumMeta(item.curriculum);

              return (
                <div key={item.id || item.path} className="history-card">
                  <a
                    href={qpHref}
                    rel="nofollow"
                    className="history-card-main-link"
                    onClick={(e) => {
                      if (!shouldHandleClientNavigation(e)) return;
                      e.preventDefault();
                      onOpenPaper(item, primaryMode);
                    }}
                    title={`Resume Question Paper: ${title}`}
                  >
                    <div className="history-card-top">
                      <div className="history-card-badges">
                        <span className={`curr-mini-badge ${currMeta.badgeCls}`}>
                          {currMeta.crossBoardLabel}
                        </span>
                        {item.session && (
                          <span className="history-session-tag">{item.session}</span>
                        )}
                      </div>
                    </div>
                    <div className="history-card-title">{title}</div>
                  </a>

                  <div className="history-card-actions" role="group" aria-label={`Quick links for ${title}`}>
                    {hasQP && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'QP') : '#'}
                        rel="nofollow"
                        className="history-doc-btn qp"
                        onPointerEnter={preloadReaderChunksOnce}
                        onFocus={preloadReaderChunksOnce}
                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(item, 'QP'); }}
                        onClick={(e) => {
                          if (!shouldHandleClientNavigation(e)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'QP');
                        }}
                        title="Open Question Paper"
                      >
                        QP
                      </a>
                    )}
                    {hasMS && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'MS') : '#'}
                        rel="nofollow"
                        className="history-doc-btn ms"
                        onPointerEnter={preloadReaderChunksOnce}
                        onFocus={preloadReaderChunksOnce}
                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(item, 'MS'); }}
                        onClick={(e) => {
                          if (!shouldHandleClientNavigation(e)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'MS');
                        }}
                        title="Open Mark Scheme"
                      >
                        MS
                      </a>
                    )}
                    {hasER && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'ER') : '#'}
                        rel="nofollow"
                        className="history-doc-btn er"
                        onPointerEnter={preloadReaderChunksOnce}
                        onFocus={preloadReaderChunksOnce}
                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(item, 'ER'); }}
                        onClick={(e) => {
                          if (!shouldHandleClientNavigation(e)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'ER');
                        }}
                        title="Open Examiner Report"
                      >
                        ER
                      </a>
                    )}
                    {hasGT && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'GT') : '#'}
                        rel="nofollow"
                        className="history-doc-btn gt"
                        onPointerEnter={preloadReaderChunksOnce}
                        onFocus={preloadReaderChunksOnce}
                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(item, 'GT'); }}
                        onClick={(e) => {
                          if (!shouldHandleClientNavigation(e)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'GT');
                        }}
                        title="Open Grade Thresholds"
                      >
                        GT
                      </a>
                    )}
                    {hasAUD && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'AUD') : '#'}
                        rel="nofollow"
                        className="history-doc-btn aud"
                        onPointerEnter={preloadReaderChunksOnce}
                        onFocus={preloadReaderChunksOnce}
                        onClick={(e) => {
                          if (!shouldHandleClientNavigation(e)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'AUD');
                        }}
                        title="Open Listening Audio"
                      >
                        AUD
                      </a>
                    )}
                    {hasSC && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'SC') : '#'}
                        rel="nofollow"
                        className="history-doc-btn extra"
                        onPointerEnter={preloadReaderChunksOnce}
                        onFocus={preloadReaderChunksOnce}
                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(item, 'SC'); }}
                        onClick={(e) => {
                          if (!shouldHandleClientNavigation(e)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'SC');
                        }}
                        title="Open Source / Insert"
                      >
                        SC
                      </a>
                    )}
                    {canSplit && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'split') : '#'}
                        rel="nofollow"
                        className="history-doc-btn split"
                        onPointerEnter={preloadReaderChunksOnce}
                        onFocus={preloadReaderChunksOnce}
                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(item, 'split'); }}
                        onClick={(e) => {
                          if (!shouldHandleClientNavigation(e)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'split');
                        }}
                        aria-label={`Split View — ${title}`}
                        title="Open side by side in Split View"
                      >
                        <span className="btn-desktop-text">Split View</span>
                        <span className="btn-mobile-text" aria-hidden="true">Split</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* STEP 2 / STEP 3 INTERACTIVE DRILLDOWN WIZARD */}
      {selectedSubject ? (
        <div className="interactive-wizard-card">
          <div className="wizard-breadcrumb">
            <button
              type="button"
              className="wizard-back-btn"
              onClick={() => {
                if (selectedUnit) onWizardUnitChange(null);
                else onWizardSubjectChange(null);
              }}
            >
              ← {selectedUnit ? (isCambridgeCurriculum(selectedSubject.curriculum) ? 'Back to Papers' : 'Back to Units') : 'Back to All Subjects'}
            </button>
            <div className="wizard-trail-text">
              <strong>{selectedSubject.curriculum}</strong> / <span>{formatSubjectDisplay(selectedSubject.name)}</span>
              {selectedUnit && <> / <span className="highlight">{selectedUnit}</span></>}
            </div>
          </div>

          {!selectedUnit ? (
            <div className="wizard-step">
              <h2>Select {formatSubjectDisplay(selectedSubject.name)} {isCambridgeCurriculum(selectedSubject.curriculum) ? 'Paper or Component' : 'Unit or Paper'}:</h2>
              <div style={{ marginBottom: '24px' }}>
                <a
                  href={`/${getCurriculumSlug(selectedSubject.curriculum)}/${getSubjectSlug(selectedSubject.name)}`}
                  className="wizard-option-btn primary"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    onSubjectSelect(selectedSubject.name, selectedSubject.curriculum);
                  }}
                  style={{ width: '100%', marginBottom: '20px' }}
                >
                  <span>
                    {isCambridgeCurriculum(selectedSubject.curriculum)
                      ? `View All ${formatSubjectDisplay(selectedSubject.name)} Papers, Thresholds & Reports →`
                      : `View All ${formatSubjectDisplay(selectedSubject.name)} Units, Papers & Textbooks →`}
                  </span>
                </a>
                {Object.entries(groupedUnits).map(([groupName, units]) => (
                  <div key={groupName} style={{ marginBottom: '20px' }}>
                    {Object.keys(groupedUnits).length > 1 && (
                      <h3 className="wizard-group-heading">{groupName}</h3>
                    )}
                    <div className="wizard-button-grid">
                      {units.map((unitName) => {
                        const unitCount = availableUnitsMap[unitName]?.count;
                        const unitHref = `/${getCurriculumSlug(selectedSubject.curriculum)}/${getSubjectSlug(selectedSubject.name)}/${getUnitSlug(unitName, { isCambridge: isCambridgeCurriculum(selectedSubject.curriculum) })}`;
                        return (
                          <a
                            key={unitName}
                            href={unitHref}
                            className="wizard-option-btn"
                            onClick={(e) => {
                              if (!shouldHandleClientNavigation(e)) return;
                              e.preventDefault();
                              handleUnitClick(unitName);
                            }}
                          >
                            <span>{unitName}</span>
                            {unitCount ? <span className="wizard-unit-count">{unitCount}</span> : null}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="wizard-step">
              <h2>Select Examination Year for {selectedUnit}:</h2>
              <div style={{ marginBottom: '20px' }}>
                <a
                  href={`/${getCurriculumSlug(selectedSubject.curriculum)}/${getSubjectSlug(selectedSubject.name)}/${getUnitSlug(selectedUnit, { isCambridge: isCambridgeCurriculum(selectedSubject.curriculum) })}`}
                  className="wizard-option-btn primary"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    handleYearClick('');
                  }}
                  style={{ width: '100%' }}
                >
                  <span>All Examination Years for {selectedUnit} →</span>
                </a>
              </div>
              <div className="wizard-button-grid-years">
                {availableYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    className="wizard-option-btn year"
                    onClick={() => handleYearClick(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : isCie ? (
        /* CAMBRIDGE STEP 1: AS & A LEVEL, IGCSE, AND O LEVEL SUBJECT GRIDS */
        <>
          {cieAlSubjects.length > 0 && (
            <>
              <div className="section-header-row">
                <h2 className="section-title">Cambridge International AS &amp; A Level</h2>
                <span className="section-count-badge">{cieAlSubjects.length} {cieAlSubjects.length === 1 ? 'Syllabus' : 'Syllabuses'}</span>
              </div>
              {renderCambridgeSubjectGrid(cieAlSubjects, 'Cambridge AS & A Level', cieAlCoverage, 'cie-al')}
            </>
          )}

          {cieIgcseSubjects.length > 0 && (
            <>
              <div className="section-header-row">
                <h2 className="section-title igcse">Cambridge IGCSE (A*–G &amp; 9–1)</h2>
                <span className="section-count-badge igcse">{cieIgcseSubjects.length} {cieIgcseSubjects.length === 1 ? 'Syllabus' : 'Syllabuses'}</span>
              </div>
              {renderCambridgeSubjectGrid(cieIgcseSubjects, 'Cambridge IGCSE', cieIgcseCoverage, 'igcse')}
            </>
          )}

          {cieOlSubjects.length > 0 && (
            <>
              <div className="section-header-row">
                <h2 className="section-title cie-ol">Cambridge O Level</h2>
                <span className="section-count-badge cie-ol">{cieOlSubjects.length} {cieOlSubjects.length === 1 ? 'Syllabus' : 'Syllabuses'}</span>
              </div>
              {renderCambridgeSubjectGrid(cieOlSubjects, 'Cambridge O Level', cieOlCoverage, 'cie-ol')}
            </>
          )}

          {cambridgeSubjectTotal === 0 && (
            <div className="no-results-box" style={{ marginBottom: '28px' }}>
              <h3>Cambridge International Catalog Initializing</h3>
              <p>Cambridge AS &amp; A Level, IGCSE, and O Level papers are being indexed into the archive.</p>
            </div>
          )}
        </>
      ) : (
        /* EDEXCEL STEP 1: ALL SUBJECT CARDS (100% PRESERVED) */
        <>
          <div className="section-header-row">
            <h2 className="section-title">Edexcel International A-Level (IAL)</h2>
            <span className="section-count-badge">{ialSubjects.length} Subjects</span>
          </div>
          <div className="subject-grid" style={{ marginBottom: '32px' }}>
            {ialSubjects.map((subject) => {
              const subjWizard = wizardMeta?.['Edexcel IAL']?.[subject];
              const unitCount = subjWizard ? Object.keys(subjWizard.units || {}).length : 0;
              const docCount = subjWizard?.totalFiles || 0;
              const subjHref = `/ial/${getSubjectSlug(subject)}`;
              return (
                <a
                  key={`ial-${subject}`}
                  href={subjHref}
                  className="subject-card"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    handleSubjectClick(subject, 'Edexcel IAL');
                  }}
                >
                  <div className="subject-card-top">
                    <div className="subject-card-title">{formatSubjectDisplay(subject)}</div>
                    {docCount > 0 && <span className="subject-card-count">{docCount} docs</span>}
                  </div>
                  <div className="subject-card-subtitle">
                    {ialSubjectCoverage[subject] || 'Edexcel IAL Collection'}
                    {unitCount > 0 ? ` • ${unitCount} ${unitCount === 1 ? 'Unit' : 'Units'}` : ''}
                  </div>
                </a>
              );
            })}
          </div>

          <div className="section-header-row">
            <h2 className="section-title igcse">Edexcel International GCSE (IGCSE)</h2>
            <span className="section-count-badge igcse">{igcseSubjects.length} Subjects</span>
          </div>
          <div className="subject-grid" style={{ marginBottom: '32px' }}>
            {igcseSubjects.map((subject) => {
              const subjWizard = wizardMeta?.['Edexcel IGCSE']?.[subject];
              const docCount = subjWizard?.totalFiles || 0;
              const subjHref = `/igcse/${getSubjectSlug(subject)}`;
              return (
                <a
                  key={`igcse-${subject}`}
                  href={subjHref}
                  className="subject-card igcse"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    handleSubjectClick(subject, 'Edexcel IGCSE');
                  }}
                >
                  <div className="subject-card-top">
                    <div className="subject-card-title">{subject}</div>
                    {docCount > 0 && <span className="subject-card-count igcse">{docCount} docs</span>}
                  </div>
                  <div className="subject-card-subtitle">
                    {igcseSubjectCoverage[subject] || 'International GCSE Collection'}
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default WelcomePage;
