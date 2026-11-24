import {
  getLegacyEquivalentsForState,
  inferCurriculumForSubject,
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  DEFAULT_UNIT_LABELS,
  IAL_SUBJECTS_DEFAULT,
  IGCSE_SUBJECTS_DEFAULT
} from './routeCore.js';
import { isCambridgeCurriculum } from '../data/boards.js';
import { compareUnitLabels } from './unitSort.js';
import {
  SUBJECTS_WITH_BOOKS,
  hasAudioForCourse,
  hasDataFilesForCourse,
  formatSubjectDisplay
} from './libraryHelpers.js';

/**
 * Computes hydrated ArchiveContextStrip metadata and lateral internal navigation links
 * for the active curriculum, subject, unit, or resource hub view across Edexcel and Cambridge.
 */
export function buildArchiveContextInfo({
  currentTab,
  isNotFound,
  showWelcome,
  activeBoard = 'edexcel',
  filterCurriculum,
  filterSubject,
  filterUnit,
  filterDocType,
  meta,
  actions
}) {
  if (currentTab !== 'library' || isNotFound || showWelcome) return null;

  const {
    clearFilters,
    setIsNotFound,
    setActiveBoard,
    setScopeAllBoards,
    setFilterCurriculum,
    setFilterSubject,
    setFilterUnit,
    setFilterYear,
    setFilterDocType,
    setForceShowTable
  } = actions;

  const effCurr = filterCurriculum || inferCurriculumForSubject(filterSubject, '');
  const isCie = isCambridgeCurriculum(effCurr) || (!effCurr && activeBoard === 'cambridge');
  const legacyInfo = getLegacyEquivalentsForState({
    filterCurriculum: effCurr,
    filterSubject,
    filterUnit
  });
  const currSlug = effCurr ? getCurriculumSlug(effCurr) : '';
  const subjSlug = filterSubject ? getSubjectSlug(filterSubject) : '';
  const subjDisplay = filterSubject ? formatSubjectDisplay(filterSubject) : '';

  const links = [];
  const seenHrefs = new Set();
  const pushLink = (item) => {
    if (!item?.href || seenHrefs.has(item.href)) return;
    seenHrefs.add(item.href);
    links.push(item);
  };

  if (filterSubject && currSlug && subjSlug) {
    if (filterUnit) {
      pushLink({
        href: `/${currSlug}/${subjSlug}`,
        label: `All ${subjDisplay} ${isCie ? 'Papers' : 'Units & Papers'}`,
        onClick: () => { setIsNotFound(false); setFilterUnit(''); setForceShowTable(true); }
      });
    }
    const hasBooks = Boolean(SUBJECTS_WITH_BOOKS[effCurr]?.has(filterSubject));
    if (hasBooks && filterDocType !== 'Book') {
      const isMath = effCurr === 'Edexcel IAL' && filterSubject === 'Math';
      pushLink({
        href: `/textbooks/${currSlug}/${subjSlug}`,
        label: `${subjDisplay} Textbooks${isMath ? ' & Solution Banks' : ''}`,
        onClick: () => {
          setIsNotFound(false);
          setFilterCurriculum(effCurr);
          setFilterDocType('Book');
          setFilterUnit('');
          setFilterYear('');
          setForceShowTable(true);
        }
      });
    } else if (filterDocType === 'Book') {
      pushLink({
        href: `/${currSlug}/${subjSlug}`,
        label: `${subjDisplay} Past Papers & Mark Schemes`,
        onClick: () => {
          setIsNotFound(false);
          setFilterDocType(null);
          setForceShowTable(true);
        }
      });
    }
    if (hasDataFilesForCourse(effCurr, filterSubject) && filterDocType !== 'DF') {
      pushLink({
        href: '/data-files',
        label: 'IT & CS Data Files (.zip)',
        onClick: () => {
          clearFilters({ pushUrl: false });
          setScopeAllBoards?.(true);
          setFilterDocType('DF');
          setForceShowTable(true);
        }
      });
    }
    if (filterDocType !== 'AUD' && hasAudioForCourse(effCurr, filterSubject)) {
      pushLink({
        href: '/audio',
        label: 'Listening Audio (MP3)',
        onClick: () => {
          clearFilters({ pushUrl: false });
          setScopeAllBoards?.(true);
          setFilterDocType('AUD');
          setForceShowTable(true);
        }
      });
    }

    if (filterDocType !== 'Book') {
      const unitsObj = meta?.wizard?.[effCurr]?.[filterSubject]?.units;
      const unitList = (unitsObj
        ? Object.keys(unitsObj)
        : (DEFAULT_UNIT_LABELS[effCurr]?.[filterSubject] || [])
      ).slice().sort((a, b) => compareUnitLabels(a, b, filterSubject));
      for (const uLabel of unitList) {
        if (uLabel === filterUnit) continue;
        const uSlug = getUnitSlug(uLabel, { isCambridge: isCie });
        if (!uSlug) continue;
        pushLink({
          href: `/${currSlug}/${subjSlug}/${uSlug}`,
          label: uLabel,
          onClick: () => {
            setIsNotFound(false);
            setFilterCurriculum(effCurr);
            setFilterSubject(filterSubject);
            setFilterUnit(uLabel);
            setFilterDocType(null);
            setForceShowTable(true);
          }
        });
      }
    }
  } else if (filterDocType === 'Book') {
    if (filterCurriculum !== 'Edexcel IAL') {
      pushLink({
        href: '/textbooks/ial',
        label: 'Edexcel IAL Textbooks & Solution Banks',
        onClick: () => { setIsNotFound(false); setFilterCurriculum('Edexcel IAL'); setFilterDocType('Book'); setForceShowTable(true); }
      });
    }
    if (filterCurriculum !== 'Edexcel IGCSE') {
      pushLink({
        href: '/textbooks/igcse',
        label: 'Edexcel IGCSE (9-1) Textbooks',
        onClick: () => { setIsNotFound(false); setFilterCurriculum('Edexcel IGCSE'); setFilterDocType('Book'); setForceShowTable(true); }
      });
    }
    const bookCurrs = filterCurriculum ? [filterCurriculum] : ['Edexcel IAL', 'Edexcel IGCSE'];
    for (const bCurr of bookCurrs) {
      const bCurrSlug = getCurriculumSlug(bCurr);
      const bSubjects = Array.from(SUBJECTS_WITH_BOOKS[bCurr] || []).sort();
      for (const bSubj of bSubjects) {
        pushLink({
          href: `/textbooks/${bCurrSlug}/${getSubjectSlug(bSubj)}`,
          label: `${bCurr === 'Edexcel IGCSE' ? 'IGCSE' : 'IAL'} ${formatSubjectDisplay(bSubj)} Books`,
          onClick: () => {
            setIsNotFound(false);
            setFilterCurriculum(bCurr);
            setFilterSubject(bSubj);
            setFilterUnit('');
            setFilterYear('');
            setFilterDocType('Book');
            setForceShowTable(true);
          }
        });
      }
    }
  } else if (filterDocType === 'DF') {
    const dfHubs = [
      { href: '/ial/information-technology', label: 'IAL Information Technology', board: 'edexcel', curr: 'Edexcel IAL', subj: 'Information Technology' },
      { href: '/igcse/computer-science', label: 'IGCSE Computer Science', board: 'edexcel', curr: 'Edexcel IGCSE', subj: 'Computer Science' },
      { href: '/igcse/information-technology', label: 'IGCSE Information Technology', board: 'edexcel', curr: 'Edexcel IGCSE', subj: 'Information Technology' },
      { href: '/cambridge/igcse/ict-0417', label: 'Cambridge IGCSE ICT (0417)', board: 'cambridge', curr: 'Cambridge IGCSE', subj: 'ICT (0417)' },
      { href: '/cambridge/a-level/information-technology-9626', label: 'Cambridge A-Level IT (9626)', board: 'cambridge', curr: 'Cambridge AS & A Level', subj: 'Information Technology (9626)' },
      { href: '/cambridge/a-level/computer-science-9618', label: 'Cambridge A-Level CS (9618)', board: 'cambridge', curr: 'Cambridge AS & A Level', subj: 'Computer Science (9618)' }
    ];
    for (const hub of dfHubs) {
      pushLink({
        href: hub.href,
        label: hub.label,
        onClick: () => {
          clearFilters({ pushUrl: false, targetBoard: hub.board });
          setActiveBoard?.(hub.board);
          setFilterCurriculum(hub.curr);
          setFilterSubject(hub.subj);
          setForceShowTable(true);
        }
      });
    }
  } else if (filterDocType === 'AUD') {
    const audioHubs = [
      { href: '/ial/french', label: 'IAL French Papers', board: 'edexcel', curr: 'Edexcel IAL', subj: 'French' },
      { href: '/ial/german', label: 'IAL German Papers', board: 'edexcel', curr: 'Edexcel IAL', subj: 'German' },
      { href: '/ial/spanish', label: 'IAL Spanish Papers', board: 'edexcel', curr: 'Edexcel IAL', subj: 'Spanish' },
      { href: '/igcse/english-as-a-second-language', label: 'Edexcel IGCSE ESL', board: 'edexcel', curr: 'Edexcel IGCSE', subj: 'English as a Second Language' },
      { href: '/igcse/french', label: 'Edexcel IGCSE French', board: 'edexcel', curr: 'Edexcel IGCSE', subj: 'French' },
      { href: '/igcse/german', label: 'Edexcel IGCSE German', board: 'edexcel', curr: 'Edexcel IGCSE', subj: 'German' },
      { href: '/igcse/spanish', label: 'Edexcel IGCSE Spanish', board: 'edexcel', curr: 'Edexcel IGCSE', subj: 'Spanish' },
      { href: '/igcse/chinese', label: 'Edexcel IGCSE Chinese', board: 'edexcel', curr: 'Edexcel IGCSE', subj: 'Chinese' },
      { href: '/cambridge/igcse/english-as-a-second-language-0510', label: 'Cambridge IGCSE ESL (0510)', board: 'cambridge', curr: 'Cambridge IGCSE', subj: 'English as a Second Language (0510)' },
      { href: '/cambridge/igcse/french-0520', label: 'Cambridge IGCSE French (0520)', board: 'cambridge', curr: 'Cambridge IGCSE', subj: 'French (0520)' },
      { href: '/cambridge/igcse/german-0525', label: 'Cambridge IGCSE German (0525)', board: 'cambridge', curr: 'Cambridge IGCSE', subj: 'German (0525)' },
      { href: '/cambridge/igcse/spanish-0530', label: 'Cambridge IGCSE Spanish (0530)', board: 'cambridge', curr: 'Cambridge IGCSE', subj: 'Spanish (0530)' },
      { href: '/cambridge/igcse/mandarin-chinese-0547', label: 'Cambridge Mandarin (0547)', board: 'cambridge', curr: 'Cambridge IGCSE', subj: 'Mandarin Chinese (0547)' }
    ];
    for (const hub of audioHubs) {
      pushLink({
        href: hub.href,
        label: hub.label,
        onClick: () => {
          clearFilters({ pushUrl: false, targetBoard: hub.board });
          setActiveBoard?.(hub.board);
          setFilterCurriculum(hub.curr);
          setFilterSubject(hub.subj);
          setForceShowTable(true);
        }
      });
    }
  } else if (filterCurriculum) {
    if (!isCie) {
      pushLink({
        href: filterCurriculum === 'Edexcel IAL' ? '/textbooks/ial' : '/textbooks/igcse',
        label: `${filterCurriculum} Textbooks`,
        onClick: () => { setIsNotFound(false); setFilterDocType('Book'); setForceShowTable(true); }
      });
    }
    pushLink({
      href: '/data-files',
      label: 'IT & CS Data Files',
      onClick: () => { clearFilters({ pushUrl: false }); setScopeAllBoards?.(true); setFilterDocType('DF'); setForceShowTable(true); }
    });
    pushLink({
      href: '/audio',
      label: 'Listening Audio Archive',
      onClick: () => { clearFilters({ pushUrl: false }); setScopeAllBoards?.(true); setFilterDocType('AUD'); setForceShowTable(true); }
    });
    const subjPool =
      filterCurriculum === 'Edexcel IGCSE' ? (meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT)
      : filterCurriculum === 'Edexcel IAL' ? (meta?.ialSubjects || IAL_SUBJECTS_DEFAULT)
      : filterCurriculum === 'Cambridge AS & A Level' ? (meta?.cieAlSubjects || [])
      : filterCurriculum === 'Cambridge O Level' ? (meta?.cieOlSubjects || [])
      : (meta?.cieIgcseSubjects || []);
    for (const sName of subjPool) {
      pushLink({
        href: `/${currSlug}/${getSubjectSlug(sName)}`,
        label: formatSubjectDisplay(sName),
        onClick: () => {
          setIsNotFound(false);
          setFilterCurriculum(filterCurriculum);
          setFilterSubject(sName);
          setFilterUnit('');
          setFilterDocType(null);
          setForceShowTable(true);
        }
      });
    }
  }

  let note = isCie
    ? 'Every Cambridge sitting pairs Question Papers (QP), Mark Schemes (MS), Inserts (IN), Grade Thresholds (GT), and Examiner Reports (ER) for instant Split View.'
    : 'Every sitting pairs Question Papers (QP), Mark Schemes (MS), and Examiner Reports (ER) for instant on-site Split View inspection.';
  if (filterDocType === 'Book') {
    note = `Archived student textbooks${filterCurriculum === 'Edexcel IAL' || filterSubject === 'Math' ? ' and worked Solution Banks' : ''} with range-streamed WebPDF viewing.`;
  } else if (filterDocType === 'DF') {
    note = 'Practical examination source archives (.zip) for IT and Computer Science coding, spreadsheet, database, and web tasks.';
  } else if (filterDocType === 'AUD') {
    note = 'Listening examination audio tracks (MP3/ZIP) with synchronized transcripts and in-app playback alongside question papers.';
  }

  if (!legacyInfo && links.length === 0 && !filterCurriculum && !filterSubject) return null;

  const heading = filterUnit
    ? `${effCurr} ${subjDisplay} — ${filterUnit}`
    : filterSubject
      ? `${effCurr} ${subjDisplay} Specification & Resources`
      : filterDocType === 'Book'
        ? 'Student Textbooks & Worked Solution Banks'
        : filterDocType === 'DF'
          ? 'Practical Examination Source Files (.zip)'
          : filterDocType === 'AUD'
            ? 'Listening Audio Tracks (.mp3)'
            : `${filterCurriculum || (isCie ? 'Cambridge International Archive' : 'Edexcel Archive')} Resource Guide`;

  return { heading, legacyInfo, note, links };
}
