import React, { useMemo } from 'react';
import {
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  IAL_SUBJECTS_DEFAULT,
  IGCSE_SUBJECTS_DEFAULT
} from '../lib/routeCore.js';
import { compareUnitLabels, isLegacyIalUnitLabel } from '../unitParser.js';
import {
  shouldHandleClientNavigation,
  formatSubjectDisplay,
  getDisplayTitle,
  getUnifiedSittingTitle
} from '../lib/libraryHelpers.js';
import { preloadReaderChunksOnce, prewarmPaperOnPointerDown } from '../lib/pdfPrewarm.js';

const WelcomePage = ({
  data,
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
  onTrySampleAudio,
  onSelectFinalFilter
}) => {
  const hasHistory = Array.isArray(recentHistory) && recentHistory.length > 0;
  const bookCount = data.meta?.totalBooks || 73;
  const audioCount = data.meta?.audioCount || 272;

  const ialSubjects = data.meta?.ialSubjects || data.meta?.subjects || IAL_SUBJECTS_DEFAULT;
  const igcseSubjects = data.meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT;
  const ialSubjectCoverage = data.meta?.ialSubjectCoverage || data.meta?.subjectCoverage || {};
  const igcseSubjectCoverage = data.meta?.igcseSubjectCoverage || data.meta?.subjectCoverage || {};
  const wizardMeta = data.meta?.wizard || null;

  // Instant 0ms units from precomputed meta.wizard (with fallback to flatFiles)
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

  // Group available units cleanly: Math branches apply strictly to Math; subjects with legacy specs split Current vs Legacy in 1..N order
  const groupedUnits = useMemo(() => {
    if (!availableUnits.length) return {};
    const subjName = selectedSubject?.name || '';
    const isIalMath = subjName === 'Math' && selectedSubject?.curriculum !== 'Edexcel IGCSE';

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
      availableUnits.forEach(unit => {
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
      mathGroupOrder.forEach(g => {
        if (buckets[g]?.length) ordered[g] = buckets[g];
      });
      Object.keys(buckets).forEach(g => {
        if (!ordered[g] && buckets[g]?.length) ordered[g] = buckets[g];
      });
      return ordered;
    }

    const currentUnits = [];
    const legacyUnits = [];
    availableUnits.forEach(unit => {
      if (isLegacyIalUnitLabel(unit)) legacyUnits.push(unit);
      else currentUnits.push(unit);
    });

    if (currentUnits.length > 0 && legacyUnits.length > 0) {
      return {
        'Current Specification': currentUnits,
        'Legacy Specification (Pre-2018)': legacyUnits
      };
    }

    const singleLabel = availableUnits.every(u => u.includes('Paper'))
      ? 'Examination Papers'
      : 'Course Units';
    return { [singleLabel]: availableUnits };
  }, [availableUnits, selectedSubject]);

  // Extract available years for currently selected subject + curriculum + unit
  const availableYears = useMemo(() => {
    if (!selectedSubject) return [];
    const { name, curriculum } = selectedSubject;
    if (selectedUnit && availableUnitsMap[selectedUnit]) {
      return availableUnitsMap[selectedUnit].years || [];
    }
    if (wizardMeta && wizardMeta[curriculum] && wizardMeta[curriculum][name]) {
      return wizardMeta[curriculum][name].allYears || [];
    }
    let files = data.flatFiles.filter(
      f => f.subject === name && (!curriculum || f.curriculum === curriculum)
    );
    if (selectedUnit) {
      files = files.filter(f => (f.cleanUnitLabel || getCleanUnitLabel(f)) === selectedUnit);
    }
    return Array.from(new Set(files.map(f => f.year).filter(Boolean))).sort((a, b) => b - a);
  }, [wizardMeta, availableUnitsMap, data.flatFiles, selectedSubject, selectedUnit]);

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

  return (
    <div className="welcome-container">
      <div className={`welcome-hero ${selectedSubject ? 'mobile-hidden' : ''}`}>
        <div className="welcome-hero-top">
          <div>
            <h1>Edexcel IAL &amp; IGCSE Past Exam Papers &amp; Textbooks</h1>
            <p>
              Independent Edexcel IAL &amp; IGCSE study archive — read paired papers in Split View, browse worked solution textbooks, or stream listening exams with live subtitles in-browser.
            </p>
          </div>
          <div className="hero-stats-row">
            <div className="hero-stat-pill">
              <strong>{(data.meta?.uniqueFiles || data.meta?.totalFiles || 16021).toLocaleString()}</strong>
              <span>{data.meta?.uniqueFiles ? 'Unique Papers' : 'Total Files'}</span>
            </div>
            <div className="hero-stat-pill">
              <strong>{ialSubjects.length + igcseSubjects.length}</strong>
              <span>Subjects</span>
            </div>
          </div>
        </div>
      </div>

      {!selectedSubject && (
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
                {(data.meta?.coverage || '2003–2026').replace(/[A-Za-z]+\s+/g, '').replace(/\s+/g, '') || '2003–2026'}
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
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
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
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
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
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
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

      {/* RECENTLY VIEWED PAST PAPERS HISTORY SECTION (Shown once user has opened a paper) */}
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
              const hasAUD = Boolean(docs.AUD || item.docType === 'AUD');
              const hasSC = Boolean(docs.SC || item.docType === 'SC');
              const canSplit = Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf');
              const primaryMode = hasQP ? 'QP' : (item.lastView || item.docType || 'QP');
              const qpHref = getOnSitePaperUrl ? getOnSitePaperUrl(item, primaryMode) : '#';

              return (
                <div
                  key={item.id || item.path}
                  className="history-card"
                >
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
                        <span className={`curr-mini-badge ${item.curriculum === 'Edexcel IGCSE' ? 'igcse' : 'ial'}`}>
                          {item.curriculum === 'Edexcel IGCSE' ? 'IGCSE' : 'IAL'}
                        </span>
                        {item.session && (
                          <span className="history-session-tag">{item.session}</span>
                        )}
                      </div>
                    </div>
                    <div className="history-card-title">{title}</div>
                  </a>

                  <div className="history-card-actions" aria-label={`Quick links for ${title}`}>
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
                        title="Open Source / Transcript"
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
                        title="Open Question Paper and Mark Scheme side by side in Split View"
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
              ← {selectedUnit ? 'Back to Units' : 'Back to All Subjects'}
            </button>
            <div className="wizard-trail-text">
              <strong>{selectedSubject.curriculum}</strong> / <span>{formatSubjectDisplay(selectedSubject.name)}</span>
              {selectedUnit && <> / <span className="highlight">{selectedUnit}</span></>}
            </div>
          </div>

          {!selectedUnit ? (
            /* STEP 2: SELECT UNIT / MODULE */
            <div className="wizard-step">
              <h2>Select {formatSubjectDisplay(selectedSubject.name)} Unit or Paper:</h2>
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
                  <span>View All {formatSubjectDisplay(selectedSubject.name)} Units, Papers &amp; Textbooks →</span>
                </a>
                {Object.entries(groupedUnits).map(([groupName, units]) => (
                  <div key={groupName} style={{ marginBottom: '20px' }}>
                    {Object.keys(groupedUnits).length > 1 && (
                      <h3 className="wizard-group-heading">
                        {groupName}
                      </h3>
                    )}
                    <div className="wizard-button-grid">
                      {units.map(unitName => {
                        const unitCount = availableUnitsMap[unitName]?.count;
                        const unitHref = `/${getCurriculumSlug(selectedSubject.curriculum)}/${getSubjectSlug(selectedSubject.name)}/${getUnitSlug(unitName)}`;
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
            /* STEP 3: SELECT EXAMINATION YEAR */
            <div className="wizard-step">
              <h2>Select Examination Year for {selectedUnit}:</h2>
              <div style={{ marginBottom: '20px' }}>
                <a
                  href={`/${getCurriculumSlug(selectedSubject.curriculum)}/${getSubjectSlug(selectedSubject.name)}/${getUnitSlug(selectedUnit)}`}
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
                {availableYears.map(year => (
                  <button
                    key={year}
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
      ) : (
        /* STEP 1: ALL SUBJECT CARDS */
        <>
          <div className="section-header-row">
            <div className="section-title">Edexcel International A-Level (IAL)</div>
            <span className="section-count-badge">{ialSubjects.length} Subjects</span>
          </div>
          <div className="subject-grid" style={{ marginBottom: '32px' }}>
            {ialSubjects.map(subject => {
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
            <div className="section-title igcse">Edexcel International GCSE (IGCSE)</div>
            <span className="section-count-badge igcse">{igcseSubjects.length} Subjects</span>
          </div>
          <div className="subject-grid" style={{ marginBottom: '32px' }}>
            {igcseSubjects.map(subject => {
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
