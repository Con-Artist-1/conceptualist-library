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
import { compareUnitLabels } from './unitSort.js';
import {
  SUBJECTS_WITH_BOOKS,
  IAL_AUDIO_SUBJECTS,
  IGCSE_AUDIO_SUBJECTS,
  hasDataFilesForCourse,
  formatSubjectDisplay
} from './libraryHelpers.js';

/**
 * Computes hydrated ArchiveContextStrip metadata and lateral internal navigation links
 * for the active curriculum, subject, unit, or resource hub view.
 */
export function buildArchiveContextInfo({
  currentTab,
  isNotFound,
  showWelcome,
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
    setFilterCurriculum,
    setFilterSubject,
    setFilterUnit,
    setFilterYear,
    setFilterDocType,
    setForceShowTable
  } = actions;

  const effCurr = filterCurriculum || inferCurriculumForSubject(filterSubject, '');
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
        label: `All ${subjDisplay} Units & Papers`,
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
          setFilterDocType('DF');
          setForceShowTable(true);
        }
      });
    }
    if (
      filterDocType !== 'AUD' &&
      ((effCurr === 'Edexcel IAL' && IAL_AUDIO_SUBJECTS.has(filterSubject)) ||
        (effCurr === 'Edexcel IGCSE' && IGCSE_AUDIO_SUBJECTS.has(filterSubject)))
    ) {
      pushLink({
        href: '/audio',
        label: `${effCurr === 'Edexcel IGCSE' ? 'IGCSE' : 'IAL'} Listening Audio (MP3)`,
        onClick: () => {
          clearFilters({ pushUrl: false });
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
        const uSlug = getUnitSlug(uLabel);
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
    pushLink({
      href: '/ial/information-technology',
      label: 'IAL Information Technology',
      onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('Information Technology'); setForceShowTable(true); }
    });
    pushLink({
      href: '/igcse/computer-science',
      label: 'IGCSE Computer Science',
      onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IGCSE'); setFilterSubject('Computer Science'); setForceShowTable(true); }
    });
    pushLink({
      href: '/igcse/information-technology',
      label: 'IGCSE Information Technology',
      onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IGCSE'); setFilterSubject('Information Technology'); setForceShowTable(true); }
    });
  } else if (filterDocType === 'AUD') {
    const audioHubs = [
      { href: '/ial/french', label: 'IAL French Papers', curr: 'Edexcel IAL', subj: 'French' },
      { href: '/ial/german', label: 'IAL German Papers', curr: 'Edexcel IAL', subj: 'German' },
      { href: '/ial/spanish', label: 'IAL Spanish Papers', curr: 'Edexcel IAL', subj: 'Spanish' },
      { href: '/igcse/english-as-a-second-language', label: 'IGCSE ESL Papers', curr: 'Edexcel IGCSE', subj: 'English as a Second Language' },
      { href: '/igcse/french', label: 'IGCSE French Papers', curr: 'Edexcel IGCSE', subj: 'French' },
      { href: '/igcse/german', label: 'IGCSE German Papers', curr: 'Edexcel IGCSE', subj: 'German' },
      { href: '/igcse/spanish', label: 'IGCSE Spanish Papers', curr: 'Edexcel IGCSE', subj: 'Spanish' },
      { href: '/igcse/chinese', label: 'IGCSE Chinese Papers', curr: 'Edexcel IGCSE', subj: 'Chinese' },
      { href: '/igcse/swahili', label: 'IGCSE Swahili Papers', curr: 'Edexcel IGCSE', subj: 'Swahili' }
    ];
    for (const hub of audioHubs) {
      pushLink({
        href: hub.href,
        label: hub.label,
        onClick: () => {
          clearFilters({ pushUrl: false });
          setFilterCurriculum(hub.curr);
          setFilterSubject(hub.subj);
          setForceShowTable(true);
        }
      });
    }
  } else if (filterCurriculum) {
    pushLink({
      href: filterCurriculum === 'Edexcel IAL' ? '/textbooks/ial' : '/textbooks/igcse',
      label: `${filterCurriculum} Textbooks`,
      onClick: () => { setIsNotFound(false); setFilterDocType('Book'); setForceShowTable(true); }
    });
    pushLink({
      href: '/data-files',
      label: 'IT & CS Data Files',
      onClick: () => { clearFilters({ pushUrl: false }); setFilterDocType('DF'); setForceShowTable(true); }
    });
    pushLink({
      href: '/audio',
      label: 'Listening Audio Archive',
      onClick: () => { clearFilters({ pushUrl: false }); setFilterDocType('AUD'); setForceShowTable(true); }
    });
    const subjPool = filterCurriculum === 'Edexcel IGCSE'
      ? (meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT)
      : (meta?.ialSubjects || IAL_SUBJECTS_DEFAULT);
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

  let note = 'Every sitting pairs Question Papers (QP), Mark Schemes (MS), and Examiner Reports (ER) for instant on-site Split View inspection.';
  if (filterDocType === 'Book') {
    note = `Archived Edexcel student books${filterCurriculum === 'Edexcel IAL' || filterSubject === 'Math' ? ' and worked Solution Banks' : ''} with range-streamed WebPDF viewing.`;
  } else if (filterDocType === 'DF') {
    note = 'Practical examination source archives (.zip) for IT and Computer Science coding, spreadsheet, database, and web tasks.';
  } else if (filterDocType === 'AUD') {
    note = 'Edexcel IAL & IGCSE listening examination audio tracks (MP3/ZIP) with synchronized transcripts and in-app playback alongside question papers.';
  }

  if (!legacyInfo && links.length === 0 && !filterCurriculum && !filterSubject) return null;

  const heading = filterUnit
    ? `${effCurr} ${subjDisplay} — ${filterUnit}`
    : filterSubject
      ? `${effCurr} ${subjDisplay} Specification & Resources`
      : filterDocType === 'Book'
        ? 'Edexcel Student Textbooks & Worked Solution Banks'
        : filterDocType === 'DF'
          ? 'Practical Examination Source Files (.zip)'
          : filterDocType === 'AUD'
            ? 'IAL & IGCSE Listening Audio Tracks (.mp3)'
            : `${filterCurriculum || 'Edexcel Archive'} Resource Guide`;

  return { heading, legacyInfo, note, links };
}
