// Lightweight core SEO routing, slug resolution & metadata across International Exam Boards
// (Pearson Edexcel IAL/IGCSE and Cambridge International AS & A Level, IGCSE, O Level).
import {
  ARCHIVE_FALLBACK_COUNTS,
  isThinUnitRoute,
  SUBJECTS_WITH_BOOKS_MAP,
  LEGACY_IAL_UNIT_CODES,
  IGCSE_MODULAR_CODES,
  LEGACY_UNIT_EQUIVALENTS,
  SUBJECT_LEGACY_SPEC_CODES,
  SITE_URL,
  IGCSE_SPEC_CODES,
  IAL_MATH_UNIT_CODES,
  IAL_SUBJECTS_DEFAULT,
  IGCSE_SUBJECTS_DEFAULT,
  DEFAULT_UNIT_LABELS,
  MATH_CODE_PRIORITY
} from '../data/curriculumCatalog.js';
import {
  getBoardForCurriculum,
  isCambridgeCurriculum
} from '../data/boards.js';
import {
  CAMBRIDGE_SYLLABUSES,
  resolveCambridgeSyllabus,
  formatCambridgeSubjectName,
  extractSyllabusCodeFromSubject,
  getCambridgeLegacyNote
} from '../data/cambridgeCatalog.js';

export * from '../data/curriculumCatalog.js';

function subjectHasBooks(curriculum, subject) {
  if (!subject) return false;
  const curr = curriculum || inferCurriculumForSubject(subject, 'Edexcel IAL');
  return Boolean(SUBJECTS_WITH_BOOKS_MAP[curr]?.has(subject));
}

export function getLegacyEquivalentsForState({ filterCurriculum = '', filterSubject = '', filterUnit = '' } = {}) {
  if (isCambridgeCurriculum(filterCurriculum) || extractSyllabusCodeFromSubject(filterSubject)) {
    const code = extractSyllabusCodeFromSubject(filterSubject);
    if (code) {
      const note = getCambridgeLegacyNote(code);
      if (note) return note;
    }
    return '';
  }
  if (filterUnit) {
    const unitCode = getUnitCodeFromLabel(filterUnit);
    if (unitCode && LEGACY_UNIT_EQUIVALENTS[unitCode]) {
      return `${unitCode} legacy/equivalent codes: ${LEGACY_UNIT_EQUIVALENTS[unitCode]}`;
    }
    const modularCode = filterCurriculum === 'Edexcel IGCSE' ? IGCSE_MODULAR_CODES[filterSubject] : '';
    if (modularCode) {
      return `Includes Linear (${IGCSE_SPEC_CODES[filterSubject]?.split(' / ')[0] || ''}), Regional (R), and Modular (${modularCode}) series`;
    }
  }
  if (filterSubject) {
    const curr = filterCurriculum || 'Edexcel IAL';
    return SUBJECT_LEGACY_SPEC_CODES[curr]?.[filterSubject] || '';
  }
  return '';
}

function slugify(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getCurriculumSlug(curriculum) {
  if (!curriculum) return '';
  if (curriculum === 'Cambridge AS & A Level' || curriculum === 'CIE-AL') return 'cambridge/a-level';
  if (curriculum === 'Cambridge IGCSE' || curriculum === 'CIE-IGCSE') return 'cambridge/igcse';
  if (curriculum === 'Cambridge O Level' || curriculum === 'CIE-OL') return 'cambridge/o-level';
  if (curriculum === 'Edexcel IGCSE' || curriculum.toUpperCase() === 'IGCSE') return 'igcse';
  if (curriculum === 'Edexcel IAL' || curriculum.toUpperCase() === 'IAL') return 'ial';
  return slugify(curriculum);
}

export function getSubjectSlug(subject) {
  if (!subject) return '';
  if (subject === 'Math' || subject === 'Mathematics' || subject === 'Maths') return 'mathematics';
  return slugify(subject);
}

export function getUnitSlug(unitLabel, { isCambridge = false } = {}) {
  if (!unitLabel) return '';
  const base = slugify(unitLabel);
  if (!isCambridge) {
    const mathCode = IAL_MATH_UNIT_CODES[unitLabel];
    if (mathCode && !base.endsWith(mathCode.toLowerCase())) {
      return `${base}-${mathCode.toLowerCase()}`;
    }
  }
  return base;
}

export function formatSubjectName(subj) {
  if (!subj) return '';
  if (subj === 'Math') return 'Mathematics';
  return subj;
}

const NON_CODE_PARENS = new Set(['AS', 'A2', 'CORE', 'EXTENDED', 'MCQ', 'ATP', 'SL', 'HL']);

export function getUnitCodeFromLabel(unitLabel, { isCambridge = false } = {}) {
  if (!unitLabel) return '';
  if (!isCambridge && IAL_MATH_UNIT_CODES[unitLabel]) return IAL_MATH_UNIT_CODES[unitLabel];
  for (const m of String(unitLabel).matchAll(/\(([A-Z0-9]{2,6})\)/gi)) {
    const cand = m[1].toUpperCase();
    if (NON_CODE_PARENS.has(cand)) continue;
    if (/\d/.test(cand)) return cand;
  }
  if (isCambridge) {
    const paperPrefix = String(unitLabel).match(/\bPaper\s+([1-7])\b/i);
    if (paperPrefix) return `P${paperPrefix[1]}`;
  }
  return '';
}

function resolveCambridgeSubjectFromSlug(slug, curriculum, meta) {
  if (!slug) return '';
  const clean = slug.toLowerCase().trim();

  // Direct 4-digit syllabus code match (including 9-1 & legacy codes, e.g. "0625", "0972", "physics-0625")
  const codeMatch = clean.match(/(?:^|-)(\d{4})$/) || clean.match(/^(\d{4})$/);
  if (codeMatch) {
    const resolved = resolveCambridgeSyllabus(codeMatch[1]);
    if (resolved && (!curriculum || resolved.curriculum === curriculum)) {
      return formatCambridgeSubjectName(resolved);
    }
  }

  const metaPool = curriculum === 'Cambridge AS & A Level'
    ? (meta?.cieAlSubjects || [])
    : curriculum === 'Cambridge O Level'
      ? (meta?.cieOlSubjects || [])
      : curriculum === 'Cambridge IGCSE'
        ? (meta?.cieIgcseSubjects || [])
        : [...(meta?.cieAlSubjects || []), ...(meta?.cieIgcseSubjects || []), ...(meta?.cieOlSubjects || [])];

  for (const subj of metaPool) {
    if (getSubjectSlug(subj) === clean || slugify(subj) === clean) {
      return subj;
    }
  }

  // Fallback against full authoritative Cambridge syllabus catalog
  for (const entry of Object.values(CAMBRIDGE_SYLLABUSES)) {
    if (curriculum && entry.curriculum !== curriculum) continue;
    const formatted = formatCambridgeSubjectName(entry);
    if (getSubjectSlug(formatted) === clean || slugify(entry.name) === clean) {
      return formatted;
    }
  }

  return '';
}

function resolveSubjectFromSlug(slug, curriculum, meta) {
  if (!slug) return '';
  if (isCambridgeCurriculum(curriculum)) {
    return resolveCambridgeSubjectFromSlug(slug, curriculum, meta);
  }
  const clean = slug.toLowerCase().trim();
  if (clean === 'bengali') return 'Bangla';
  if (clean === 'mathematics' || clean === 'math' || clean === 'maths') {
    if (curriculum === 'Edexcel IGCSE') return 'Mathematics A';
    return 'Math';
  }
  if (clean === 'it' || clean === 'ict') return 'Information Technology';
  if (clean === 'cs' || clean === 'compsci') return 'Computer Science';

  const pool = curriculum === 'Edexcel IGCSE'
    ? (meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT)
    : curriculum === 'Edexcel IAL'
      ? (meta?.ialSubjects || IAL_SUBJECTS_DEFAULT)
      : [...new Set([...(meta?.ialSubjects || IAL_SUBJECTS_DEFAULT), ...(meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT)])];

  for (const subj of pool) {
    if (getSubjectSlug(subj) === clean || slugify(subj) === clean) {
      return subj;
    }
  }
  const allPool = [...new Set([...IAL_SUBJECTS_DEFAULT, ...IGCSE_SUBJECTS_DEFAULT, ...(meta?.subjects || [])])];
  for (const subj of allPool) {
    if (getSubjectSlug(subj) === clean || slugify(subj) === clean) {
      return subj;
    }
  }
  return '';
}

function getDefaultCambridgeUnitLabels(subject) {
  const code = extractSyllabusCodeFromSubject(subject);
  const entry = code ? resolveCambridgeSyllabus(code) : null;
  if (!entry) return [];
  const labels = new Set();
  if (entry.papers) Object.values(entry.papers).forEach((l) => labels.add(l));
  if (entry.legacyPre2020Papers) Object.values(entry.legacyPre2020Papers).forEach((l) => labels.add(l));
  if (entry.legacyPre2016Papers) Object.values(entry.legacyPre2016Papers).forEach((l) => labels.add(l));
  if (entry.legacyPre2024Papers) Object.values(entry.legacyPre2024Papers).forEach((l) => labels.add(l));
  return Array.from(labels);
}

function resolveUnitFromSlug(unitSlug, curriculum, subject, meta) {
  if (!unitSlug || !subject) return '';
  const clean = unitSlug.toLowerCase().trim();
  const curr = curriculum || 'Edexcel IAL';
  const isCie = isCambridgeCurriculum(curr);
  const unitsObj = meta?.wizard?.[curr]?.[subject]?.units;
  const unitLabels = unitsObj
    ? Object.keys(unitsObj)
    : isCie
      ? getDefaultCambridgeUnitLabels(subject)
      : (DEFAULT_UNIT_LABELS[curr]?.[subject] || []);

  // 1. Exact slug match (also tolerate legacy -wma11/-wma12/-wma13 suffix on Cambridge 9709)
  const strippedLegacyMathSuffix = isCie ? clean.replace(/-wma1[1-4]$/, '') : clean;
  for (const label of unitLabels) {
    const canonicalSlug = getUnitSlug(label, { isCambridge: isCie });
    if (canonicalSlug === clean || canonicalSlug === strippedLegacyMathSuffix || slugify(label) === clean) {
      return label;
    }
  }

  // 2. Match by unit/paper code or shorthand (e.g. "wma11", "p1", "p4", "unit-1", "paper-4")
  for (const label of unitLabels) {
    const code = getUnitCodeFromLabel(label, { isCambridge: isCie }).toLowerCase();
    const parenMatch = label.match(/\(([a-z0-9]+)\)/i);
    const parenCode = parenMatch ? parenMatch[1].toLowerCase() : '';
    if (code && (clean === code || clean.endsWith(`-${code}`) || clean.startsWith(`${code}-`))) {
      return label;
    }
    if (parenCode && (clean === parenCode || clean.endsWith(`-${parenCode}`))) {
      return label;
    }
    const unitNumMatch = clean.match(/^u(?:nit)?[-_]?([1-6])$/);
    if (unitNumMatch && label.toLowerCase().includes(`unit ${unitNumMatch[1]}`)) {
      return label;
    }
    const paperNumMatch = clean.match(/^p(?:aper)?[-_]?([1-7])$/);
    if (paperNumMatch && (label.toLowerCase().includes(`paper ${paperNumMatch[1]}`) || label.toLowerCase().includes(`(p${paperNumMatch[1]})`))) {
      return label;
    }
  }

  return '';
}

export function inferCurriculumForSubject(subject, fallbackCurriculum = '') {
  if (fallbackCurriculum) return fallbackCurriculum;
  if (!subject) return '';
  const cieCode = extractSyllabusCodeFromSubject(subject);
  if (cieCode) {
    const resolved = resolveCambridgeSyllabus(cieCode);
    if (resolved?.curriculum) return resolved.curriculum;
    return 'Cambridge IGCSE';
  }
  const igcseOnly = [
    'Art and Design', 'Bangla', 'Bangladesh Studies', 'Chinese', 'Commerce', 'Computer Science',
    'English as a Second Language', 'English Language A', 'English Language B', 'Further Pure Mathematics',
    'Global Citizenship', 'Greek (First Language)', 'Gujarati', 'Hindi', 'Human Biology',
    'Islamic Studies', 'Islamiyat', 'Mathematics A', 'Mathematics B', 'Modern Greek',
    'Pakistan Studies', 'Religious Studies', 'Sciences (Double Award)', 'Sciences (Single Award)',
    'Sinhala', 'Swahili', 'Tamil', 'Turkish', 'Urdu'
  ];
  return igcseOnly.includes(subject) ? 'Edexcel IGCSE' : 'Edexcel IAL';
}

export function getIalMathBranchShardName(unitLabelOrSlug = '') {
  const s = String(unitLabelOrSlug || '').toLowerCase();
  if (/mechanics|wme0|667[7-9]/.test(s)) return 'ial-mathematics-mechanics.json';
  if (/statistics|wst0|6683|6684|6691/.test(s)) return 'ial-mathematics-statistics.json';
  if (/further|decision|wfm0|wdm|666[7-9]|6689/.test(s)) return 'ial-mathematics-further.json';
  return 'ial-mathematics-pure.json';
}

export function getShardPathForRoute({
  currentTab = 'library',
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterDocType = null,
  notFound = false
} = {}) {
  if (currentTab !== 'library' || notFound) return '';
  if (filterDocType === 'Book' && !filterSubject) return '/shards/textbooks.json';
  if (filterDocType === 'DF' && !filterSubject) return '/shards/data-files.json';
  if (filterDocType === 'AUD' && !filterSubject) return '/shards/audio.json';
  if (filterSubject) {
    const curr = inferCurriculumForSubject(filterSubject, filterCurriculum);
    const currSlug = getCurriculumSlug(curr);
    const subjSlug = getSubjectSlug(filterSubject);
    if (currSlug === 'ial' && subjSlug === 'mathematics' && filterUnit) {
      return `/shards/${getIalMathBranchShardName(getUnitSlug(filterUnit))}`;
    }
    if (currSlug && subjSlug) {
      return `/shards/${currSlug.replace(/\//g, '-')}-${subjSlug}.json`;
    }
  }
  return '';
}

export function buildRoutePath({
  currentTab = 'library',
  activeBoard = 'edexcel',
  scopeAllBoards = false,
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterYear = '',
  filterVariant = '',
  filterDocType = null,
  searchQuery = '',
  previewFile = null,
  pendingPaperParam = '',
  previewMode = '',
  forceShowTable = false,
  useHashForPaper = true
}) {
  if (currentTab === 'about') return '/about';
  if (currentTab === 'changelog') return '/changelog';

  const effCurr = filterCurriculum || (filterSubject ? inferCurriculumForSubject(filterSubject, '') : '');
  const effBoard = effCurr ? getBoardForCurriculum(effCurr) : (activeBoard || 'edexcel');

  let pathname = effBoard === 'cambridge' ? '/cambridge' : '/';
  if (filterDocType === 'DF' && !filterCurriculum && !filterSubject && !filterUnit) {
    pathname = '/data-files';
  } else if (filterDocType === 'AUD' && !filterCurriculum && !filterSubject && !filterUnit) {
    pathname = '/audio';
  } else if (filterDocType === 'Book' && !filterUnit) {
    if (!filterCurriculum && !filterSubject) {
      if (scopeAllBoards) {
        pathname = '/textbooks';
      } else if (effBoard === 'cambridge') {
        pathname = '/textbooks/cambridge';
      } else {
        pathname = '/textbooks/edexcel';
      }
    } else {
      const curr = inferCurriculumForSubject(filterSubject, filterCurriculum);
      const currSlug = getCurriculumSlug(curr);
      if (filterSubject && currSlug) {
        pathname = `/textbooks/${currSlug}/${getSubjectSlug(filterSubject)}`;
      } else if (currSlug) {
        pathname = `/textbooks/${currSlug}`;
      } else {
        pathname = (!scopeAllBoards && effBoard === 'cambridge') ? '/textbooks/cambridge' : '/textbooks';
      }
    }
  } else if (filterCurriculum || filterSubject) {
    const curr = inferCurriculumForSubject(filterSubject, filterCurriculum);
    const currSlug = getCurriculumSlug(curr);
    const isCie = isCambridgeCurriculum(curr);
    if (filterSubject) {
      const subjSlug = getSubjectSlug(filterSubject);
      if (filterUnit) {
        pathname = `/${currSlug}/${subjSlug}/${getUnitSlug(filterUnit, { isCambridge: isCie })}`;
      } else {
        pathname = `/${currSlug}/${subjSlug}`;
      }
    } else if (currSlug) {
      pathname = `/${currSlug}`;
    }
  } else if (forceShowTable) {
    pathname = effBoard === 'cambridge' ? '/cambridge/papers' : '/papers';
  }

  const params = new URLSearchParams();
  if (filterYear) params.set('year', String(filterYear));
  if (filterVariant) params.set('variant', String(filterVariant));
  const isCanonicalDocTypeRoute =
    (pathname.startsWith('/textbooks') && filterDocType === 'Book') ||
    (pathname === '/data-files' && filterDocType === 'DF') ||
    (pathname === '/audio' && filterDocType === 'AUD');
  if (filterDocType && !isCanonicalDocTypeRoute) {
    params.set('type', filterDocType);
  }
  if (searchQuery && searchQuery.trim()) {
    params.set('q', searchQuery.trim());
  }
  const paperKey = previewFile ? (previewFile.id || previewFile.path || '') : (pendingPaperParam || '');
  let hashStr = '';
  if (paperKey) {
    if (useHashForPaper) {
      const hashParams = new URLSearchParams();
      hashParams.set('paper', paperKey);
      if (previewMode) hashParams.set('view', previewMode);
      hashStr = `#${hashParams.toString()}`;
    } else {
      params.set('paper', paperKey);
      if (previewMode) params.set('view', previewMode);
    }
  }

  const qs = params.toString();
  return `${qs ? `${pathname}?${qs}` : pathname}${hashStr}`;
}

export function getUniqueOrderedUnitCodes(unitNames) {
  const unique = [...new Set(unitNames.map(getUnitCodeFromLabel).filter(Boolean))];
  return unique.sort((a, b) => {
    const legA = LEGACY_IAL_UNIT_CODES.has(a);
    const legB = LEGACY_IAL_UNIT_CODES.has(b);
    if (legA !== legB) return legA ? 1 : -1;
    const ia = MATH_CODE_PRIORITY.indexOf(a);
    const ib = MATH_CODE_PRIORITY.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

function formatCodeRangeForTitle(codes, isMath = false) {
  if (!codes || codes.length === 0) return '';
  const currentOnly = codes.filter((c) => !LEGACY_IAL_UNIT_CODES.has(c));
  const active = currentOnly.length > 0 ? currentOnly : codes;
  if (isMath && active.includes('WMA11') && active.includes('WMA14')) {
    return 'WMA11–WMA14';
  }
  if (active.length >= 2) {
    const first = active[0];
    const last = active[active.length - 1];
    const m1 = /^([A-Z]+)(\d+)$/.exec(first);
    const m2 = /^([A-Z]+)(\d+)$/.exec(last);
    if (m1 && m2 && m1[1] === m2[1] && parseInt(m2[2], 10) - parseInt(m1[2], 10) === active.length - 1) {
      return `${first}–${last}`;
    }
  }
  return active.slice(0, 3).join(', ');
}

function cleanUnitForContext(subjDisplay, filterUnit) {
  let clean = String(filterUnit || '').trim();
  const sLower = subjDisplay.toLowerCase();
  if (clean.toLowerCase().startsWith(`${sLower} `)) {
    clean = clean.slice(subjDisplay.length).trim();
  } else if (sLower === 'information technology' && clean.toUpperCase().startsWith('IT ')) {
    clean = clean.slice(3).trim();
  }
  return clean;
}

function compactUnitTitleLabel(label) {
  const legacyPreMatch = /^Legacy\s+.+?\b(Paper\s+\d+|Unit\s+\d+)\s*\((Pre-\d{4}|Old\s+[A-Z0-9]+)\)$/i.exec(label);
  if (legacyPreMatch) return `${legacyPreMatch[2]} ${legacyPreMatch[1]}`;
  const m = /^(?:Legacy\s+)?(Unit\s+\d+|Paper\s+\d+):\s+.+?(\s*\([A-Z0-9]+\))?$/i.exec(label);
  if (m) return `${label.toLowerCase().startsWith('legacy ') ? 'Legacy ' : ''}${m[1]}${m[2] || ''}`;
  return String(label || '')
    .replace(/\bProbability\s*(?:&|and)\s*Statistics\b/gi, 'Prob & Stats')
    .replace(/\b(Decision|Pure|Core|Further Pure|Further)\s+Mathematics\b/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getCurriculumUniqueCount(meta, curr) {
  const subjectsMap = meta?.wizard?.[curr];
  if (subjectsMap && Object.keys(subjectsMap).length > 0) {
    return Object.values(subjectsMap).reduce((sum, entry) => sum + (entry?.totalFiles || 0), 0);
  }
  if (curr === 'Edexcel IGCSE') return 7377;
  if (curr === 'Edexcel IAL') return 8604;
  return 0;
}

export function getArchiveCounts(meta) {
  const uniqueFiles = meta?.uniqueFiles || meta?.totalFiles || ARCHIVE_FALLBACK_COUNTS.uniqueFiles;
  const totalFiles = meta?.totalFiles || ARCHIVE_FALLBACK_COUNTS.totalFiles;
  const totalBooks = meta?.totalBooks || ARCHIVE_FALLBACK_COUNTS.totalBooks;
  const ialBooks = meta?.ialBooks || ARCHIVE_FALLBACK_COUNTS.ialBooks;
  const igcseBooks = meta?.igcseBooks || ARCHIVE_FALLBACK_COUNTS.igcseBooks;
  const edexcelBooks = meta?.boards?.edexcel?.totalBooks ?? (ialBooks + igcseBooks);
  const cambridgeBooks = meta?.cambridgeBooks ?? meta?.boards?.cambridge?.totalBooks ?? ARCHIVE_FALLBACK_COUNTS.cambridgeBooks;
  const cieAlBooks = meta?.cieAlBooks ?? meta?.boards?.cambridge?.alBooks ?? ARCHIVE_FALLBACK_COUNTS.cieAlBooks;
  const cieIgcseBooks = meta?.cieIgcseBooks ?? meta?.boards?.cambridge?.igcseBooks ?? ARCHIVE_FALLBACK_COUNTS.cieIgcseBooks;
  const cieOlBooks = meta?.cieOlBooks ?? meta?.boards?.cambridge?.olBooks ?? ARCHIVE_FALLBACK_COUNTS.cieOlBooks;
  const dfCount = meta?.dfCount || ARCHIVE_FALLBACK_COUNTS.dfCount;
  const edexcelDfCount = meta?.boards?.edexcel?.dfCount ?? ARCHIVE_FALLBACK_COUNTS.edexcelDfCount;
  const cambridgeDfCount = meta?.boards?.cambridge?.dfCount ?? ARCHIVE_FALLBACK_COUNTS.cambridgeDfCount;
  const audioCount = meta?.audioCount || ARCHIVE_FALLBACK_COUNTS.audioCount;
  const edexcelAudioCount = meta?.boards?.edexcel?.audioCount ?? ARCHIVE_FALLBACK_COUNTS.edexcelAudioCount;
  const cambridgeAudioCount = meta?.boards?.cambridge?.audioCount ?? ARCHIVE_FALLBACK_COUNTS.cambridgeAudioCount;
  const edexcelUnique = meta?.boards?.edexcel?.uniqueFiles ?? ARCHIVE_FALLBACK_COUNTS.edexcelUnique;
  const edexcelTotal = meta?.boards?.edexcel?.totalFiles ?? ARCHIVE_FALLBACK_COUNTS.edexcelTotal;
  const cambridgeUnique = meta?.boards?.cambridge?.uniqueFiles ?? ARCHIVE_FALLBACK_COUNTS.cambridgeUnique;
  const cambridgeTotal = meta?.boards?.cambridge?.totalFiles ?? ARCHIVE_FALLBACK_COUNTS.cambridgeTotal;
  return {
    uniqueFiles,
    totalFiles,
    totalBooks,
    ialBooks,
    igcseBooks,
    edexcelBooks,
    cambridgeBooks,
    cieAlBooks,
    cieIgcseBooks,
    cieOlBooks,
    dfCount,
    edexcelDfCount,
    cambridgeDfCount,
    audioCount,
    edexcelAudioCount,
    cambridgeAudioCount,
    edexcelUnique,
    edexcelTotal,
    cambridgeUnique,
    cambridgeTotal
  };
}

function pickTitleVariant(candidates, maxLen = 56) {
  for (const c of candidates) {
    if (c && c.length <= maxLen) return c;
  }
  const fallback = candidates[candidates.length - 1] || '';
  if (fallback.length <= maxLen) return fallback;
  const cut = fallback.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\-–]+$/, '').trim();
}

function fitDescription(str, maxLen = 160) {
  if (str.length <= maxLen) return str;
  const trimmed = str.slice(0, maxLen - 1);
  const lastSpace = trimmed.lastIndexOf(' ');
  return `${(lastSpace > 100 ? trimmed.slice(0, lastSpace) : trimmed).replace(/[.,;:\s-]+$/, '')}.`;
}

export function buildRouteFaqEntries({
  currentTab = 'library',
  activeBoard = 'edexcel',
  scopeAllBoards = false,
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterDocType = null,
  searchQuery = '',
  notFound = false,
  meta = null
} = {}) {
  if (
    currentTab === 'about' ||
    currentTab === 'changelog' ||
    notFound ||
    (searchQuery && String(searchQuery).trim()) ||
    Boolean(filterUnit)
  ) {
    return [];
  }

  const {
    uniqueFiles,
    totalFiles,
    totalBooks,
    ialBooks,
    igcseBooks,
    edexcelBooks,
    cambridgeBooks,
    cieAlBooks,
    cieIgcseBooks,
    cieOlBooks,
    dfCount,
    audioCount,
    edexcelAudioCount,
    cambridgeAudioCount,
    edexcelUnique,
    cambridgeUnique
  } = getArchiveCounts(meta);

  const subjDisplay = formatSubjectName(filterSubject);
  const curr = filterCurriculum || (filterSubject ? inferCurriculumForSubject(filterSubject, 'Edexcel IAL') : '');
  const isCie = isCambridgeCurriculum(curr) || (!curr && !scopeAllBoards && activeBoard === 'cambridge');
  const faqs = [];

  if (filterDocType === 'Book') {
    if (filterSubject) {
      const isIalMath = curr === 'Edexcel IAL' && filterSubject === 'Math';
      const hasAnswerBooks = curr === 'Edexcel IAL' && ['Accounting', 'Biology', 'Business', 'Chemistry', 'Economics', 'Physics'].includes(filterSubject);
      faqs.push({
        q: `How can I read ${curr} ${subjDisplay} ${isCie ? 'coursebooks' : 'textbooks'}${isIalMath ? ' and Solution Banks' : ''} online?`,
        a: `Open any ${curr} ${subjDisplay} ${isCie ? 'Coursebook, Workbook, or Practical Guide' : `Student Book${isIalMath ? ' or Worked Solution Bank ZIP' : ''}`} directly in our 2-Page WebPDF spread reader with Dark and Pure OLED modes, or download the linearized PDF directly.`
      });
      if (isIalMath) {
        faqs.push({
          q: 'Which Edexcel IAL Mathematics units have Worked Solution Banks included?',
          a: 'All 14 Pearson Edexcel IAL Mathematics units are covered chapter-by-chapter: Pure Mathematics 1–4 (WMA11–WMA14), Mechanics 1–3 (WME01–WME03), Statistics 1–3 (WST01–WST03), Decision Mathematics 1 (WDM11), and Further Pure 1–3 (WFM01–WFM03).'
        });
      } else {
        faqs.push({
          q: `Are ${hasAnswerBooks ? 'Student Book 1 & 2 answer PDFs' : 'worked answers and past papers'} linked with ${curr} ${subjDisplay} books?`,
          a: `Yes. ${hasAnswerBooks ? `Both Student Book 1 and Student Book 2 PDFs plus official answer booklets for ${curr} ${subjDisplay} are indexed here, ` : `Every ${curr} ${subjDisplay} resource on this page is cover-verified and linearized for fast loading, `}and you can jump straight to the matching past papers and mark schemes below.`
        });
      }
      return faqs;
    }
    if (filterCurriculum) {
      const currLabel = filterCurriculum;
      const countMap = {
        'Edexcel IAL': ialBooks,
        'Edexcel IGCSE': igcseBooks,
        'Cambridge AS & A Level': cieAlBooks,
        'Cambridge IGCSE': cieIgcseBooks,
        'Cambridge O Level': cieOlBooks
      };
      const bCount = countMap[currLabel] || (isCie ? cambridgeBooks : edexcelBooks);
      faqs.push({
        q: `How many ${currLabel} ${isCie ? 'coursebooks and workbooks' : 'textbooks'} are indexed?`,
        a: `This collection holds ${bCount} verified ${currLabel} ${isCie ? 'coursebooks, workbooks, practical books, and revision guides' : currLabel === 'Edexcel IAL' ? 'student books, answer PDFs, lab books, and IAL Maths Worked Solution Banks' : 'student textbooks across Sciences, Mathematics, Business, Commerce, and IT'}.`
      });
      faqs.push({
        q: `Can I view ${currLabel} books side-by-side in 2-Page spread mode?`,
        a: `Yes. Every ${currLabel} PDF is linearized for instant range-streaming and opens in a resizable 2-Page spread layout with optional solo Cover pairing.`
      });
      return faqs;
    }
    if (isCie) {
      faqs.push({
        q: 'Which Cambridge International coursebooks and workbooks are in the archive?',
        a: `The archive indexes ${cambridgeBooks} verified Cambridge International resources across AS & A Level (${cieAlBooks}), IGCSE (${cieIgcseBooks}), and O Level (${cieOlBooks}), covering 32 syllabuses.`
      });
      faqs.push({
        q: 'Are Cambridge textbooks viewable without downloading the full file first?',
        a: 'Yes. All 81 Cambridge books are qpdf-linearized so Page 1 streams in 1–2 HTTP byte-range chunks inside the 2-Page WebPDF reader.'
      });
      return faqs;
    }
    if (scopeAllBoards) {
      faqs.push({
        q: 'How many international exam textbooks and Solution Banks are in the archive?',
        a: `The library indexes ${totalBooks} verified resources across both boards: ${edexcelBooks} Pearson Edexcel (IAL & IGCSE) student books and Worked Solution Banks plus ${cambridgeBooks} Cambridge International (AS & A Level, IGCSE & O Level) coursebooks and workbooks.`
      });
      faqs.push({
        q: 'How do the Edexcel IAL Mathematics Worked Solution Bank ZIPs work?',
        a: 'All 14 IAL Maths Solution Banks (P1–P4, M1–M3, S1–S3, D1, FP1–FP3) stream their chapter and exercise index on demand via HTTP 206 Range requests without downloading the entire archive.'
      });
      return faqs;
    }
    faqs.push({
      q: 'How many Edexcel textbooks and Solution Banks are in the archive?',
      a: `The Edexcel textbook collection indexes ${edexcelBooks} verified resources (${ialBooks} Edexcel IAL student books, lab books, answer PDFs, and Worked Solution Banks plus ${igcseBooks} Edexcel IGCSE 9–1 student books).`
    });
    faqs.push({
      q: 'Are Edexcel Student Book 1 and Book 2 answer PDFs included?',
      a: 'Yes. Answer booklets for Edexcel IAL Accounting, Biology, Business, Chemistry, Economics, and Physics sit alongside the Student Books, while IAL Mathematics includes full worked Solution Banks.'
    });
    return faqs;
  }

  if (filterDocType === 'AUD') {
    faqs.push({
      q: 'Which language listening exams include audio and synced transcripts?',
      a: `All ${audioCount} archived MP3 and ZIP listening tracks (${edexcelAudioCount} Edexcel + ${cambridgeAudioCount} Cambridge) stream directly in-browser above the Question Paper with live closed captions (CC).`
    });
    faqs.push({
      q: 'How do synchronized closed captions (CC) work for listening papers?',
      a: 'All 273 Edexcel IAL and IGCSE listening packs load instant pre-indexed static transcripts, while Cambridge listening tracks support on-demand in-browser Whisper AI caption generation.'
    });
    return faqs;
  }

  if (filterDocType === 'DF') {
    faqs.push({
      q: 'Which practical exams require source data files (.zip)?',
      a: `The archive hosts ${dfCount} practical examination source data archives covering Edexcel IAL IT (WIT12, WIT14), Edexcel IGCSE ICT/CS (4IT1, 4CP0), Cambridge IGCSE ICT (0417), and Cambridge A-Level IT/CS (9626, 9618).`
    });
    faqs.push({
      q: 'Can I pair the Question Paper and Mark Scheme while downloading Data Files?',
      a: 'Yes. Each practical sitting links its Question Paper, Mark Scheme, Examiner Report, and .zip source files in one row so you can inspect the paper in Split View while extracting the data pack.'
    });
    return faqs;
  }

  if (filterSubject) {
    const subjWizard = meta?.wizard?.[curr]?.[filterSubject];
    const docCount = subjWizard?.totalFiles || 100;
    const unitNames = Object.keys(subjWizard?.units || {});
    const unitSample = unitNames.slice(0, 5).join(', ');
    const allYears = subjWizard?.allYears || [];
    const yrSpan = allYears.length > 0 ? `${allYears[allYears.length - 1]}–${allYears[0]}` : (isCie ? '2002–2026' : '2011–2026');
    const hasBooks = subjectHasBooks(curr, filterSubject);

    if (isCie) {
      const code = extractSyllabusCodeFromSubject(filterSubject);
      const entry = code ? resolveCambridgeSyllabus(code) : null;
      const legacyNote = getLegacyEquivalentsForState({ filterCurriculum: curr, filterSubject });
      faqs.push({
        q: `How many ${curr} ${subjDisplay} past papers and components are indexed?`,
        a: `This ${curr} ${subjDisplay} hub indexes ${docCount.toLocaleString()} unique files spanning ${yrSpan} across ${unitNames.length || 'all'} components (${unitSample || 'QP, MS, IN, GT & ER'}), complete with v1/v2/v3 variant filters and Grade Thresholds.${legacyNote ? ` (${legacyNote})` : ''}`
      });
      if (entry?.alt91) {
        faqs.push({
          q: `Are Cambridge IGCSE ${entry.code} and ${entry.alt91} (9–1) past papers identical?`,
          a: `Yes. Cambridge IGCSE ${entry.code} (A*–G) and ${entry.alt91} (9–1) share identical question papers, inserts, and mark schemes; only the grading scale differs, so every ${entry.alt91} sitting is unified here.`
        });
      } else {
        faqs.push({
          q: `How do I compare ${curr} ${subjDisplay} Question Papers with Mark Schemes${hasBooks ? ' or Textbooks' : ' and Inserts'}?`,
          a: `Click Split View on any ${subjDisplay} sitting to read the Question Paper side-by-side with its Mark Scheme or Insert, inspect session Grade Thresholds (GT)${hasBooks ? `, or open the ${subjDisplay} coursebooks in 2-Page spread mode` : ''}.`
        });
      }
      return faqs;
    }

    const unitCodes = getUniqueOrderedUnitCodes(unitNames).filter((c) => !LEGACY_IAL_UNIT_CODES.has(c));
    const igcseCode = curr === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const legacySpec = SUBJECT_LEGACY_SPEC_CODES[curr]?.[filterSubject] || '';

    if (curr === 'Edexcel IGCSE') {
      faqs.push({
        q: `What papers and series are included for Edexcel IGCSE ${subjDisplay}${igcseCode ? ` (${igcseCode})` : ''}?`,
        a: `This Edexcel IGCSE ${subjDisplay} archive indexes ${docCount.toLocaleString()} unique files from ${yrSpan} covering ${unitNames.length || 'all'} papers (${unitSample || 'Paper 1 & Paper 2'}), including Linear, Regional (1R/2R), and ${legacySpec || 'legacy specification'} sittings.`
      });
      faqs.push({
        q: `How can I study Edexcel IGCSE ${subjDisplay} papers with Mark Schemes?`,
        a: `Every sitting pairs the Question Paper (QP), Mark Scheme (MS), and Examiner Report (ER) on one row—click Split View to view the paper and mark scheme side-by-side${hasBooks ? `, or switch to ${subjDisplay} Student Textbooks` : ''}.`
      });
    } else {
      faqs.push({
        q: `Which units and codes are covered in Edexcel IAL ${subjDisplay}?`,
        a: `Edexcel IAL ${subjDisplay} includes ${docCount.toLocaleString()} unique files spanning ${yrSpan} across ${unitNames.length || 'all'} units (${unitCodes.length ? unitCodes.slice(0, 6).join(', ') : unitSample})${legacySpec ? `, plus ${legacySpec}` : ''}.`
      });
      faqs.push({
        q: `Does Edexcel IAL ${subjDisplay} support side-by-side Mark Schemes${hasBooks ? ' and Textbooks' : ''}?`,
        a: `Yes. Every January, June, and October sitting supports instant Split View between the Question Paper and Mark Scheme${hasBooks ? `, and ${subjDisplay} Student Books${filterSubject === 'Math' ? ' + Worked Solution Banks' : ' & Answers'} are linked directly below` : ' alongside Examiner Reports'}.`
      });
    }
    return faqs;
  }

  if (filterCurriculum === 'Cambridge AS & A Level') {
    const alCount = getCurriculumUniqueCount(meta, 'Cambridge AS & A Level');
    const alSubjCount = meta?.cieAlSubjects?.length || 31;
    return [
      {
        q: 'Which Cambridge AS & A Level syllabuses are covered in this archive?',
        a: `All ${alSubjCount} international Cambridge AS & A Level syllabuses (${alCount.toLocaleString()} unique files, 2002–2026) are indexed, including Mathematics (9709), Physics (9702), Chemistry (9701), Biology (9700), Computer Science (9618), and Economics (9708).`
      },
      {
        q: 'Can I filter Cambridge A-Level papers by timezone variant and Grade Thresholds?',
        a: 'Yes. Every sitting displays v1, v2, and v3 timezone variant pills alongside Feb/March, May/June, and Oct/Nov sessions, with one-click Grade Thresholds (GT) and Split View.'
      }
    ];
  }

  if (filterCurriculum === 'Cambridge IGCSE') {
    const igCount = getCurriculumUniqueCount(meta, 'Cambridge IGCSE');
    const igSubjCount = meta?.cieIgcseSubjects?.length || 45;
    return [
      {
        q: 'Does the Cambridge IGCSE archive cover both A*–G and 9–1 syllabuses?',
        a: `Yes. All ${igSubjCount} international Cambridge IGCSE syllabuses (${igCount.toLocaleString()} unique files) unify 9–1 codes (such as 0972 Physics and 0980 Maths) with their identical A*–G papers (0625, 0580).`
      },
      {
        q: 'Are Core, Extended, Practical, and ATP papers separated cleanly?',
        a: 'Yes. Each syllabus groups Core, Extended, Practical, Alternative to Practical (ATP), and Listening components cleanly with side-by-side QP + Mark Scheme/Insert Split View.'
      }
    ];
  }

  if (filterCurriculum === 'Cambridge O Level') {
    const olCount = getCurriculumUniqueCount(meta, 'Cambridge O Level');
    const olSubjCount = meta?.cieOlSubjects?.length || 31;
    return [
      {
        q: 'Which Cambridge O Level subjects are available?',
        a: `All ${olSubjCount} Cambridge O Level syllabuses (${olCount.toLocaleString()} unique files) are indexed, including Mathematics D (4024), Physics (5054), Chemistry (5070), Biology (5090), English Language (1123), Islamiyat (2058), and Pakistan Studies (2059).`
      },
      {
        q: 'Do Cambridge O Level sittings include Inserts and Grade Thresholds?',
        a: 'Yes. Paired Question Papers, Mark Schemes, Inserts (for 1123 English), Examiner Reports, and Grade Thresholds (GT) open directly in Split View.'
      }
    ];
  }

  if (filterCurriculum === 'Edexcel IAL') {
    const ialCount = getCurriculumUniqueCount(meta, 'Edexcel IAL');
    const ialSubjCount = meta?.ialSubjects?.length || 19;
    return [
      {
        q: 'Which Pearson Edexcel IAL subjects and series are archived?',
        a: `All ${ialSubjCount} International A-Level subjects (${ialCount.toLocaleString()} unique files, 2003–2026) are indexed, covering current W-codes (WMA11–WMA14, WPH11–WPH16, WCH11–WCH16, WBI11–WBI16) and legacy specs (WMA01–02, C1–C4, WPH01–06).`
      },
      {
        q: 'Are Edexcel IAL textbooks and Maths Worked Solution Banks included?',
        a: `Yes. ${ialBooks} Edexcel IAL textbooks, answer PDFs, lab books, and all 14 Mathematics Worked Solution Banks open in 2-Page book spread mode.`
      }
    ];
  }

  if (filterCurriculum === 'Edexcel IGCSE') {
    const igcseCount = getCurriculumUniqueCount(meta, 'Edexcel IGCSE');
    const igcseSubjCount = meta?.igcseSubjects?.length || 43;
    return [
      {
        q: 'Does Edexcel IGCSE include Regional (R) and Modular (4W*) papers?',
        a: `Yes. All ${igcseSubjCount} Edexcel IGCSE (9–1) subjects (${igcseCount.toLocaleString()} unique files) index Standard, Regional (1R/2R), Foundation/Higher, and Modular (4WM1, 4WBI1, 4WCH1, 4WPH1) papers.`
      },
      {
        q: 'Can I listen to Edexcel IGCSE language audio with subtitles?',
        a: 'Yes. Listening audio packs for ESL (4ES1), French, German, Spanish, Chinese, and Swahili play directly above the Question Paper with pre-indexed synced closed captions.'
      }
    ];
  }

  if (isCie) {
    return [
      {
        q: 'Which Cambridge International qualifications are included on Conceptualist Systems?',
        a: `Conceptualist Systems indexes ${cambridgeUnique.toLocaleString()} unique Cambridge International AS & A Level, IGCSE (A*–G & 9–1), and O Level past papers, mark schemes, inserts, grade thresholds, and ${cambridgeBooks} coursebooks across 107 syllabuses.`
      },
      {
        q: 'How does Cambridge search handle syllabus codes and timezone variants?',
        a: 'Search directly by 4-digit code, paper + variant (such as "0625 42"), or session shorthand ("9709 s24") with isolated board filtering and side-by-side Split View.'
      }
    ];
  }

  return [
    {
      q: 'What is included in the Conceptualist Systems international exam archive?',
      a: `Conceptualist Systems is an independent study archive (not affiliated with Pearson/Edexcel or Cambridge CAIE) indexing ${uniqueFiles.toLocaleString()} unique resources (${totalFiles.toLocaleString()} total files): ${edexcelUnique.toLocaleString()} Edexcel IAL & IGCSE and ${cambridgeUnique.toLocaleString()} Cambridge International past papers, ${totalBooks} textbooks & Solution Banks, ${audioCount} listening audio tracks, and ${dfCount} data files.`
    },
    {
      q: 'How do Split View, 2-Page Book Spread, and Listening Subtitles work?',
      a: 'Open any sitting in Split View to read the Question Paper beside its Mark Scheme or Insert, open any textbook in resizable 2-Page spread mode, or stream listening MP3s with live synchronized captions directly in your browser.'
    }
  ];
}

export function parseRouteFromLocation(pathname = '/', search = '', meta = null, hash = '') {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search || '');
  const cleanHash = String(hash || '').replace(/^#/, '');
  const hashParams = cleanHash.includes('=') ? new URLSearchParams(cleanHash) : null;

  const result = {
    currentTab: 'library',
    activeBoard: '',
    filterCurriculum: '',
    filterSubject: '',
    filterUnit: '',
    filterYear: params.get('year') || '',
    filterVariant: params.get('variant') || '',
    filterDocType: params.get('type') || null,
    searchQuery: params.get('q') || '',
    paperParam: (hashParams && hashParams.get('paper')) || params.get('paper') || '',
    viewParam: (hashParams && hashParams.get('view')) || params.get('view') || '',
    forceShowTable: false,
    notFound: false
  };

  if (cleanPath === '/about') {
    result.currentTab = 'about';
    return result;
  }
  if (cleanPath === '/changelog') {
    result.currentTab = 'changelog';
    return result;
  }
  if (cleanPath === '/papers') {
    result.activeBoard = 'edexcel';
    result.forceShowTable = true;
    return result;
  }
  if (cleanPath === '/data-files') {
    result.scopeAllBoards = true;
    result.filterDocType = 'DF';
    result.forceShowTable = true;
    return result;
  }
  if (cleanPath === '/audio') {
    result.scopeAllBoards = true;
    result.filterDocType = 'AUD';
    result.forceShowTable = true;
    return result;
  }

  const segments = cleanPath.split('/').filter(Boolean);
  if (segments.length > 0 && segments[0].toLowerCase() === 'textbooks') {
    result.filterDocType = 'Book';
    result.forceShowTable = true;
    if (segments.length === 1) {
      result.scopeAllBoards = true;
      return result;
    }
    const tbCurr = segments[1].toLowerCase();
    if (tbCurr === 'edexcel') {
      result.activeBoard = 'edexcel';
      if (segments.length === 2) return result;
      result.notFound = true;
      return result;
    } else if (tbCurr === 'ial' || tbCurr === 'edexcel-ial') {
      result.activeBoard = 'edexcel';
      result.filterCurriculum = 'Edexcel IAL';
    } else if (tbCurr === 'igcse' || tbCurr === 'edexcel-igcse') {
      result.activeBoard = 'edexcel';
      result.filterCurriculum = 'Edexcel IGCSE';
    } else if (tbCurr === 'cambridge' || tbCurr === 'caie' || tbCurr === 'cie') {
      result.activeBoard = 'cambridge';
      if (segments.length === 2) return result;
      const lvl = segments[2].toLowerCase();
      if (lvl === 'a-level' || lvl === 'as-a-level' || lvl === 'al') result.filterCurriculum = 'Cambridge AS & A Level';
      else if (lvl === 'igcse') result.filterCurriculum = 'Cambridge IGCSE';
      else if (lvl === 'o-level' || lvl === 'ol') result.filterCurriculum = 'Cambridge O Level';
      else {
        result.notFound = true;
        return result;
      }
      if (segments.length === 3) return result;
      if (segments.length === 4) {
        const subj = resolveSubjectFromSlug(segments[3], result.filterCurriculum, meta);
        if (!subj) {
          result.notFound = true;
          return result;
        }
        result.filterSubject = subj;
        return result;
      }
      result.notFound = true;
      return result;
    } else {
      result.notFound = true;
      return result;
    }
    if (segments.length === 2) return result;
    if (segments.length === 3) {
      const subj = resolveSubjectFromSlug(segments[2], result.filterCurriculum, meta);
      if (!subj) {
        result.notFound = true;
        return result;
      }
      result.filterSubject = subj;
      return result;
    }
    result.notFound = true;
    return result;
  }

  if (segments.length === 0) {
    if (result.filterYear || result.filterDocType || result.searchQuery || result.paperParam) {
      result.forceShowTable = true;
    }
    return result;
  }

  const first = segments[0].toLowerCase();

  // Cambridge International namespace: /cambridge, /cambridge/papers, /cambridge/<level>/<subject>/<unit>, /cambridge/<code>
  if (first === 'cambridge' || first === 'caie' || first === 'cie') {
    result.activeBoard = 'cambridge';
    if (segments.length === 1) {
      if (result.filterYear || result.filterDocType || result.searchQuery || result.paperParam || result.filterVariant) {
        result.forceShowTable = true;
      }
      return result;
    }
    const second = segments[1].toLowerCase();
    if (second === 'papers') {
      result.forceShowTable = true;
      return result;
    }
    if (/^\d{4}$/.test(second)) {
      const sylEntry = resolveCambridgeSyllabus(second);
      if (!sylEntry) {
        result.notFound = true;
        return result;
      }
      result.filterCurriculum = sylEntry.curriculum;
      result.filterSubject = formatCambridgeSubjectName(sylEntry);
      result.forceShowTable = true;
      return result;
    }
    if (second === 'a-level' || second === 'as-a-level' || second === 'al') {
      result.filterCurriculum = 'Cambridge AS & A Level';
      result.forceShowTable = true;
    } else if (second === 'igcse') {
      result.filterCurriculum = 'Cambridge IGCSE';
      result.forceShowTable = true;
    } else if (second === 'o-level' || second === 'ol') {
      result.filterCurriculum = 'Cambridge O Level';
      result.forceShowTable = true;
    } else {
      result.notFound = true;
      return result;
    }

    if (segments.length >= 3) {
      const subj = resolveSubjectFromSlug(segments[2], result.filterCurriculum, meta);
      if (!subj) {
        result.notFound = true;
        return result;
      }
      result.filterSubject = subj;
      result.forceShowTable = true;
    }
    if (segments.length >= 4) {
      const unit = resolveUnitFromSlug(segments[3], result.filterCurriculum, result.filterSubject, meta);
      if (!unit) {
        result.notFound = true;
        return result;
      }
      result.filterUnit = unit;
      result.forceShowTable = true;
    }
    if (segments.length > 4) {
      result.notFound = true;
      return result;
    }
    return result;
  }

  // Pearson Edexcel canonical routes (100% preserved)
  if (first === 'ial' || first === 'edexcel-ial') {
    result.activeBoard = 'edexcel';
    result.filterCurriculum = 'Edexcel IAL';
    result.forceShowTable = true;
  } else if (first === 'igcse' || first === 'edexcel-igcse') {
    result.activeBoard = 'edexcel';
    result.filterCurriculum = 'Edexcel IGCSE';
    result.forceShowTable = true;
  } else {
    result.notFound = true;
    return result;
  }

  if (segments.length >= 2) {
    const subj = resolveSubjectFromSlug(segments[1], result.filterCurriculum, meta);
    if (!subj) {
      result.notFound = true;
      return result;
    }
    result.filterSubject = subj;
    result.forceShowTable = true;
  }

  if (segments.length >= 3) {
    const unit = resolveUnitFromSlug(segments[2], result.filterCurriculum, result.filterSubject, meta);
    if (!unit) {
      result.notFound = true;
      return result;
    }
    result.filterUnit = unit;
    result.forceShowTable = true;
  }

  if (segments.length > 3) {
    result.notFound = true;
    return result;
  }

  if (result.filterYear || result.filterDocType || result.searchQuery || result.paperParam) {
    result.forceShowTable = true;
  }

  return result;
}

export function getSeoMetadata({
  currentTab = 'library',
  activeBoard = 'edexcel',
  scopeAllBoards = false,
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterDocType = null,
  searchQuery = '',
  forceShowTable = false,
  notFound = false,
  meta = null
}) {
  const counts = getArchiveCounts(meta);
  const {
    uniqueFiles,
    totalFiles,
    totalBooks,
    ialBooks,
    igcseBooks,
    edexcelBooks,
    cambridgeBooks,
    cieAlBooks,
    cieIgcseBooks,
    cieOlBooks,
    dfCount,
    audioCount,
    edexcelUnique,
    cambridgeUnique
  } = counts;
  const effBoard = filterCurriculum
    ? getBoardForCurriculum(filterCurriculum)
    : (activeBoard || 'edexcel');
  const isCie = effBoard === 'cambridge';

  const isCanonicalDocTypeFilter =
    (filterDocType === 'Book' && !filterUnit) ||
    (filterDocType === 'DF' && !filterCurriculum && !filterSubject && !filterUnit) ||
    (filterDocType === 'AUD' && !filterCurriculum && !filterSubject && !filterUnit);
  const hasSearchQuery = Boolean(searchQuery && String(searchQuery).trim());

  if (notFound) {
    return {
      title: 'Page Not Found | Conceptualist Systems',
      description: 'The requested international exam past paper or resource route could not be found. Browse Edexcel & Cambridge International subjects from archive home.',
      keywords: 'Conceptualist Systems, Edexcel IAL past papers, Edexcel IGCSE past papers, Cambridge International past papers',
      canonicalUrl: `${SITE_URL}/`,
      robots: 'noindex, nofollow',
      h1: 'Archive Route Not Found',
      subtitle: 'Return to the Conceptualist Systems archive directory to select a board, subject, paper, or textbook.'
    };
  }

  const canonicalPath = buildRoutePath({
    currentTab,
    activeBoard: effBoard,
    scopeAllBoards,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear: '',
    filterVariant: '',
    filterDocType: isCanonicalDocTypeFilter ? filterDocType : null,
    forceShowTable
  });
  const canonicalUrl = `${SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`;
  let robots = hasSearchQuery ? 'noindex, follow' : 'index, follow';

  if (currentTab === 'about') {
    return {
      title: 'About Conceptualist Systems | Exam Study Archive',
      description: fitDescription(`Learn about Conceptualist Systems, an independent study index of ${uniqueFiles.toLocaleString()}+ Edexcel & Cambridge International past papers, mark schemes, reports & books.`),
      keywords: 'Conceptualist Systems, Edexcel past papers, Cambridge IGCSE past papers, Cambridge A Level past papers, O Level past papers, academic repository',
      canonicalUrl,
      robots: 'index, follow',
      h1: 'About Conceptualist Systems',
      subtitle: `Independent international exam study archive indexing ${uniqueFiles.toLocaleString()}+ unique Pearson Edexcel & Cambridge International (CAIE) resources (${totalFiles.toLocaleString()} archived files).`
    };
  }

  if (currentTab === 'changelog') {
    return {
      title: 'Site Changelog & Updates | Conceptualist Systems',
      description: fitDescription('Live update history: Cambridge International (CAIE) archive launch, 2025-2026 Edexcel papers, Split View WebPDF upgrades, and performance updates.'),
      keywords: 'Conceptualist Systems changelog, Edexcel 2026 past papers, Cambridge IGCSE past papers, split view reader',
      canonicalUrl,
      robots: 'index, follow',
      h1: 'Site Changelog & Update History',
      subtitle: 'Complete log of multi-board archive expansions, new examination series, and reader features.'
    };
  }

  if (filterDocType === 'DF' && !filterCurriculum && !filterSubject) {
    return {
      title: 'Edexcel & Cambridge IT/ICT Practical Data Files (.zip)',
      description: `Download ${dfCount} archived practical exam source data files (.zip) for Edexcel IAL IT (WIT12, WIT14), IGCSE ICT/CS (4IT1, 4CP0) and Cambridge ICT/CS.`,
      keywords: 'Edexcel IAL IT data files, WIT12 data files, WIT14 data files, 4IT1 data files, Cambridge ICT 0417 source files',
      canonicalUrl,
      robots,
      h1: 'Practical Examination Source Data Files (.zip)',
      subtitle: `Archived practical examination source data archives (${dfCount} ZIPs) covering IT, ICT, and Computer Science practical assessments.`
    };
  }

  if (filterDocType === 'AUD' && !filterCurriculum && !filterSubject) {
    return {
      title: 'Edexcel & Cambridge Listening Audio MP3s & Transcripts',
      description: `Stream and download ${audioCount} archived Edexcel & Cambridge listening examination MP3s and ZIPs with synchronized closed captions (CC).`,
      keywords: 'Edexcel IAL listening audio, Edexcel IGCSE listening audio, Cambridge ESL 0510 audio, French German Spanish listening mp3',
      canonicalUrl,
      robots,
      h1: 'Listening Examination Audio Archive',
      subtitle: `Direct MP3 & ZIP listening examination audio tracks (${audioCount} files) with synchronized transcripts and in-browser playback.`
    };
  }

  const subjDisplay = formatSubjectName(filterSubject);
  const cieCodeInSubj = extractSyllabusCodeFromSubject(subjDisplay);
  const baseSubjNoCode = cieCodeInSubj
    ? subjDisplay.replace(/\s*\(\d{4}\)\s*$/, '').trim()
    : subjDisplay;
  const SUBJECT_SHORT_MAP = {
    'Mathematics': 'Maths',
    'Mathematics (Without Coursework)': 'Maths',
    'Additional Mathematics': 'Add Maths',
    'Further Mathematics': 'Further Maths',
    'Further Pure Mathematics': 'Further Pure Maths',
    'International Mathematics': 'Int Maths',
    'Information Technology': 'IT',
    'Information and Communication Technology': 'ICT',
    'Computer Science': 'CS',
    'English as a Second Language': 'ESL',
    'English as a Second Language (Speaking Endorsement)': 'ESL',
    'English as a Second Language (Count-in Speaking)': 'ESL',
    'First Language English': 'First Lang English',
    'Literature in English': 'English Lit',
    'English Literature': 'English Lit',
    'English Language': 'English Lang',
    'Co-ordinated Sciences (Double Award)': 'Co-ord Science',
    'Combined Science': 'Combined Sci',
    'Sciences (Double Award)': 'Double Science',
    'Sciences (Single Award)': 'Single Science',
    'Environmental Management': 'Env Management',
    'Global Perspectives & Research': 'Global Persp',
    'Global Perspectives': 'Global Persp',
    'Design and Technology': 'Design & Tech',
    'Design & Technology': 'Design & Tech',
    'Physical Education': 'PE',
    'Business Studies': 'Business',
    'Religious Studies': 'RS',
    'Bangladesh Studies': 'Bangladesh St',
    'Pakistan Studies': 'Pakistan St',
    'Travel & Tourism': 'Travel & Tourism',
    'Greek (First Language)': 'Greek 1st Lang'
  };
  const mappedShortBase = SUBJECT_SHORT_MAP[baseSubjNoCode] || baseSubjNoCode.replace(/\s*\([^)]*\)/g, '').trim();
  const subjShort = cieCodeInSubj ? `${mappedShortBase} (${cieCodeInSubj})` : mappedShortBase;
  const currShort =
    filterCurriculum === 'Cambridge AS & A Level' ? 'Cambridge A-Level'
    : filterCurriculum === 'Cambridge IGCSE' ? 'Cambridge IGCSE'
    : filterCurriculum === 'Cambridge O Level' ? 'Cambridge O Level'
    : filterCurriculum === 'Edexcel IGCSE' ? 'Edexcel IGCSE'
    : filterCurriculum === 'Edexcel IAL' ? 'Edexcel IAL'
    : (isCie ? 'Cambridge' : 'Edexcel');
  const currTiny =
    filterCurriculum === 'Cambridge AS & A Level' ? 'CAIE A-Level'
    : filterCurriculum === 'Cambridge IGCSE' ? 'CAIE IGCSE'
    : filterCurriculum === 'Cambridge O Level' ? 'CAIE O Level'
    : currShort;

  if (filterDocType === 'Book' && !filterUnit) {
    if (filterSubject) {
      const curr = inferCurriculumForSubject(filterSubject, filterCurriculum);
      const isCieSubj = isCambridgeCurriculum(curr);
      const isIal = curr === 'Edexcel IAL';
      const isIalMath = isIal && filterSubject === 'Math';
      const hasAnswerBooks = isIal && ['Accounting', 'Biology', 'Business', 'Chemistry', 'Economics', 'Physics'].includes(filterSubject);
      const title = pickTitleVariant(
        isIalMath
          ? [
              'Edexcel IAL Maths Books & Solution Banks PDF (P1–FP3)',
              'Edexcel IAL Maths Solution Banks & Textbooks PDF'
            ]
          : isIal && filterSubject === 'Information Technology'
            ? [
                'Edexcel IAL IT Student Book 1 & 2 PDF (WIT11–WIT14)',
                'Edexcel IAL IT Student Book 1 & 2 PDF'
              ]
          : hasAnswerBooks
            ? [
                `Edexcel IAL ${subjDisplay} Student Book 1 & 2 PDF + Answers`,
                `Edexcel IAL ${subjDisplay} Student Book 1 & 2 PDF`,
                `Edexcel IAL ${subjShort} Student Book 1 & 2 PDF & Answers`,
                `Edexcel IAL ${subjDisplay} Textbooks & Answers PDF`
              ]
            : isCieSubj
              ? [
                  `${currShort} ${subjDisplay} Coursebooks & Answers PDF`,
                  `${currShort} ${subjDisplay} Coursebooks PDF`,
                  `${currShort} ${subjShort} Coursebooks PDF`,
                  `${currTiny} ${subjDisplay} Coursebooks PDF`,
                  `${currTiny} ${subjShort} Coursebooks PDF`,
                  `${currTiny} ${subjShort} Textbooks PDF`,
                  `${currTiny} ${subjShort} Books PDF`
                ]
              : [
                  `${curr} ${subjDisplay} Student Textbooks PDF`,
                  `${curr} ${subjShort} Student Textbooks PDF`,
                  `${curr} ${subjDisplay} Textbooks PDF`,
                  `${curr} ${subjShort} Textbooks PDF`
                ],
        56
      );
      const description = pickTitleVariant([
        isIalMath
          ? 'Read and download all 28 Edexcel IAL Mathematics Student Books & step-by-step Worked Solution Banks (P1-P4, M1-M3, S1-S3, D1, FP1-FP3) free in our 2-Page WebPDF reader.'
          : hasAnswerBooks
            ? `Read and download ${curr} ${subjDisplay} Student Book 1 & 2 PDFs, worked answers, and lab books free online in our 2-Page WebPDF reader.`
            : isCieSubj
              ? `Read and download ${currShort} ${subjDisplay} coursebooks, workbooks, practical guides, and worked answers free online in our 2-Page WebPDF reader.`
              : `Read and download ${curr} ${subjDisplay} student textbooks and revision guides free online in our 2-Page WebPDF reader.`,
        fitDescription(`Study ${currShort} ${subjDisplay} coursebooks${isIalMath ? ' & Worked Solution Banks (P1-P4, M1-M3, S1-S3, D1, FP1-FP3)' : hasAnswerBooks ? ', Student Book 1 & 2 answers & guides' : ', workbooks & revision guides'} in 2-Page WebPDF reader.`)
      ], 158);
      return {
        title,
        description,
        keywords: [
          `${currShort} ${subjDisplay} textbook pdf`,
          isCieSubj ? `${currShort} ${subjDisplay} coursebook pdf` : `${curr} ${subjDisplay} student book 1 pdf`,
          isCieSubj ? `${cieCodeInSubj || subjShort} workbook pdf` : `${curr} ${subjDisplay} student book 2 answers pdf`,
          isIalMath ? 'Edexcel IAL solution bank pdf' : `${currShort} ${subjDisplay} revision guide`,
          isIalMath ? 'Pure Maths P1 P2 P3 P4 M1 M2 S1 D1 FP1 Solution Bank' : `${currShort} ${subjDisplay} past papers`
        ].filter(Boolean).join(', '),
        canonicalUrl,
        robots,
        h1: `${currShort} ${subjDisplay} ${isCieSubj ? 'Coursebooks & Workbooks' : `Textbooks${isIalMath ? ' & Worked Solution Banks' : hasAnswerBooks ? ', Student Books & Answers' : ' & Study Books'}`}`,
        subtitle: `Archived ${curr} ${subjDisplay} ${isCieSubj ? 'coursebooks, workbooks, practical guides, and revision books' : `student books${isIalMath ? ' and chapter-by-chapter P1-P4, M1-M3, S1-S3, D1 & FP1-FP3 Solution Banks' : hasAnswerBooks ? ', Student Book 1 & 2 answer PDFs, and lab books' : ''}`} with instant 2-Page book spread viewing.`
      };
    }
    if (filterCurriculum) {
      const isIal = filterCurriculum === 'Edexcel IAL';
      const isIgcseEdx = filterCurriculum === 'Edexcel IGCSE';
      const currBookCount = isIal
        ? ialBooks
        : isIgcseEdx
          ? igcseBooks
          : filterCurriculum === 'Cambridge AS & A Level'
            ? cieAlBooks
            : filterCurriculum === 'Cambridge O Level'
              ? cieOlBooks
              : cieIgcseBooks;
      return {
        title: pickTitleVariant([
          isIal
            ? 'Edexcel IAL Student Books, Answers & Solution Banks'
            : isIgcseEdx
              ? 'Edexcel IGCSE (9-1) Student Textbooks & Guides PDF'
              : filterCurriculum === 'Cambridge AS & A Level'
                ? 'Cambridge AS & A Level Coursebooks & Workbooks PDF'
                : filterCurriculum === 'Cambridge IGCSE'
                  ? 'Cambridge IGCSE Coursebooks, Workbooks & Answers PDF'
                  : 'Cambridge O Level Textbooks & Revision Guides PDF',
          `${currShort} Textbooks & Coursebooks PDF`
        ], 56),
        description: isIal
          ? `Browse ${ialBooks} Edexcel IAL student textbooks, answer books & Maths Solution Banks across 9 subjects in our 2-Page WebPDF reader.`
          : isIgcseEdx
            ? `Browse ${igcseBooks} Edexcel IGCSE (9-1) student textbooks across Sciences, Mathematics, Business, Commerce & IT free online.`
            : fitDescription(`Browse ${currBookCount > 0 ? `${currBookCount} ` : ''}${filterCurriculum} coursebooks, workbooks, practical books & revision guides free online in 2-Page WebPDF reader.`),
        keywords: `${filterCurriculum} textbooks pdf, ${isIal ? 'Edexcel IAL solution banks, IAL Maths solution bank, student book 1 2 answers pdf' : `${filterCurriculum} coursebooks pdf, ${currShort} workbooks pdf`}`,
        canonicalUrl,
        robots,
        h1: `${filterCurriculum} ${isCie ? 'Coursebooks & Textbooks' : `Textbooks${isIal ? ' & Worked Solution Banks' : isIgcseEdx ? ' (9-1)' : ''}`}`,
        subtitle: `Read ${currBookCount || (isCie ? cambridgeBooks : edexcelBooks)} ${filterCurriculum} ${isCie ? 'coursebooks, workbooks, lab practical books, and revision guides' : 'student textbooks, lab guides, and worked answers'} online in 2-Page spread mode.`
      };
    }
    if (scopeAllBoards) {
      return {
        title: 'Edexcel & Cambridge Textbooks & Solution Banks PDF',
        description: fitDescription(`Read ${totalBooks} Pearson Edexcel (IAL & IGCSE) and Cambridge International (A-Level, IGCSE & O Level) coursebooks, workbooks & Solution Banks in 2-Page WebPDF reader.`),
        keywords: 'Edexcel IAL textbooks pdf, Cambridge IGCSE coursebooks pdf, Cambridge A Level textbooks pdf, O Level textbooks pdf, Edexcel solution bank',
        canonicalUrl,
        robots,
        h1: 'International Exam Textbooks, Coursebooks & Solution Banks',
        subtitle: `${totalBooks} archived resources (${edexcelBooks} Edexcel IAL & IGCSE student books and Solution Banks + ${cambridgeBooks} Cambridge International coursebooks, workbooks & guides) viewable in 2-Page book spread mode.`
      };
    }
    if (isCie) {
      return {
        title: 'Cambridge IGCSE, O Level & A-Level Coursebooks PDF',
        description: fitDescription(`Read ${cambridgeBooks > 0 ? `${cambridgeBooks} ` : ''}Cambridge International (CAIE) AS & A Level, IGCSE & O Level coursebooks, workbooks, practical books & revision guides in 2-Page WebPDF reader.`),
        keywords: 'Cambridge A Level textbooks pdf, Cambridge IGCSE coursebook pdf, Cambridge O Level textbooks pdf, CAIE biology chemistry physics maths coursebook',
        canonicalUrl,
        robots,
        h1: 'Cambridge International Coursebooks, Workbooks & Textbooks',
        subtitle: `${cambridgeBooks} verified Cambridge International AS & A Level (${cieAlBooks}), IGCSE (${cieIgcseBooks}), and O Level (${cieOlBooks}) coursebooks, workbooks, lab books, and answer guides.`
      };
    }
    return {
      title: 'Edexcel IAL & IGCSE Textbooks & Solution Banks PDF',
      description: fitDescription(`Read ${edexcelBooks} Edexcel IAL and IGCSE (9-1) student textbooks, answer PDFs, and Maths worked solution banks free online in 2-Page WebPDF reader.`),
      keywords: 'Edexcel IAL textbooks pdf, Edexcel IGCSE textbooks pdf, Edexcel solution bank, Pure Mathematics textbook, Chemistry Physics Biology Edexcel book',
      canonicalUrl,
      robots,
      h1: 'Edexcel IAL & IGCSE Textbooks & Solution Banks',
      subtitle: `${edexcelBooks} course textbooks, laboratory books, and worked solution manuals across Mathematics, Sciences, Business, Commerce, Economics, Accounting, Psychology, and IT.`
    };
  }

  // Unit / Paper-level SEO metadata
  if (filterSubject && filterUnit) {
    const unitCode = getUnitCodeFromLabel(filterUnit, { isCambridge: isCie });
    const cieCode = isCie ? extractSyllabusCodeFromSubject(filterSubject) : '';
    const igcseCode = filterCurriculum === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const unitCleanRaw = cleanUnitForContext(subjDisplay, filterUnit);
    const unitClean = unitCleanRaw.replace(/\b(Paper\s+[1-7])\s*\(P[1-7]\)/i, '$1').trim();
    const unitWithCode = unitCode && !unitClean.includes(unitCode) && !(isCie && /^P\d$/.test(unitCode) && /\bPaper\s+\d\b/i.test(unitClean))
      ? `${unitClean} (${unitCode})`
      : unitClean;
    const compactCleanRaw = compactUnitTitleLabel(unitClean);
    const compactClean = compactCleanRaw.replace(/\b(Paper\s+[1-7])\s*\(P[1-7]\)/i, '$1').trim();
    const unitShort = unitCode && !compactClean.includes(unitCode) && !(isCie && /^P\d$/.test(unitCode) && /\bPaper\s+\d\b/i.test(compactClean))
      ? `${compactClean} (${unitCode})`
      : compactClean;
    const parenShortMatch = unitClean.match(/\(([A-Z0-9]{2,4})\)/i);
    const parenTok = parenShortMatch ? parenShortMatch[1].toUpperCase() : '';
    const validParenTok = parenTok && !NON_CODE_PARENS.has(parenTok) ? parenTok : '';
    const ultraShortUnit = validParenTok && unitCode && validParenTok !== unitCode
      ? `${validParenTok} (${unitCode})`
      : isCie
        ? (/Pre-2020/i.test(unitClean) && unitCode ? `Pre-2020 ${unitCode}` : compactClean)
        : (unitCode || unitShort);

    const currSlug = filterCurriculum || 'Edexcel IAL';
    const unitObj = meta?.wizard?.[currSlug]?.[filterSubject]?.units?.[filterUnit];
    const docCount = unitObj?.count || 40;
    const isThin = !hasSearchQuery && isThinUnitRoute(meta, currSlug, filterSubject, filterUnit);
    if (isThin) {
      robots = 'noindex, follow';
    }
    const years = unitObj?.years || [2025, 2024, 2023, 2022, 2021, 2020];
    const minYr = years[years.length - 1] || 2018;
    const maxYr = years[0] || 2025;
    const yrSpan = `${minYr}–${maxYr}`;
    const igcseTitleCode = igcseCode ? ` (${igcseCode.split(' / ')[0]})` : '';
    const isIalMathUnit = currSlug === 'Edexcel IAL' && filterSubject === 'Math';
    const mathCompactUnit = isIalMathUnit
      ? compactClean
          .replace(/^Legacy\s+/i, '')
          .replace(/^Further Pure\s+(\d+)\s*\(FP\d+\)$/i, 'FP$1')
          .replace(/^Pure\s+(\d+)\s*\(P\d+\)$/i, 'Pure $1 (P$1)')
          .replace(/^Core\s+(\d+)\s*\(C\d+\)$/i, 'Core $1 (C$1)')
      : '';

    const title = pickTitleVariant(
      isIalMathUnit
        ? [
            `Edexcel IAL Maths ${mathCompactUnit}${unitCode ? ` (${unitCode})` : ''} Past Papers & MS`,
            `Edexcel IAL Maths ${mathCompactUnit}${unitCode ? ` (${unitCode})` : ''} Past Papers`,
            `Edexcel IAL Maths ${ultraShortUnit} Past Papers & MS`,
            `Edexcel IAL Maths ${ultraShortUnit} Past Papers`
          ]
        : [
            `${currShort} ${subjDisplay} ${unitWithCode}${igcseTitleCode} Past Papers & MS`,
            `${currShort} ${subjDisplay} ${unitWithCode}${igcseTitleCode} Past Papers`,
            `${currShort} ${subjDisplay} ${unitShort}${igcseTitleCode} Past Papers & MS`,
            `${currShort} ${subjDisplay} ${unitShort}${igcseTitleCode} Past Papers`,
            `${currShort} ${subjShort} ${unitShort}${igcseTitleCode} Past Papers & MS`,
            `${currShort} ${subjShort} ${unitShort}${igcseTitleCode} Past Papers`,
            `${currShort} ${subjShort} ${ultraShortUnit}${igcseTitleCode} Past Papers & MS`,
            `${currShort} ${subjShort} ${ultraShortUnit}${igcseTitleCode} Past Papers`,
            `${currTiny} ${subjShort} ${ultraShortUnit}${igcseTitleCode} Past Papers`,
            `${currTiny} ${subjShort} ${ultraShortUnit} Past Papers`,
            cieCode ? `CAIE ${cieCode} ${ultraShortUnit} Past Papers` : `${currTiny} ${subjShort} ${unitCode || ultraShortUnit} Past Papers`
          ],
      56
    );

    const codeNote = !unitWithCode.includes(igcseCode) && igcseCode ? ` (${igcseCode})` : '';
    const shortCodeNote = !unitShort.includes(igcseCode) && igcseCode ? ` (${igcseCode})` : '';
    const extras = isCie ? 'Mark Schemes, Inserts & Grade Thresholds' : 'Mark Schemes & Examiner Reports';
    const description = pickTitleVariant([
      `Study ${docCount}+ ${currShort} ${subjDisplay} ${unitWithCode}${codeNote} Past Papers, ${extras} (${yrSpan}) in Split View.`,
      `Study ${docCount}+ ${currShort} ${subjDisplay} ${unitWithCode}${codeNote} Past Papers & Mark Schemes (${yrSpan}) in Split View.`,
      `Study ${docCount}+ ${currShort} ${subjDisplay} ${unitShort}${shortCodeNote} Past Papers & Mark Schemes (${yrSpan}).`,
      fitDescription(`Browse ${docCount}+ ${currShort} ${subjDisplay} ${unitShort} (${yrSpan}) Past Papers & Mark Schemes in Split View.`)
    ], 158);

    const keywords = [
      `${currShort} ${subjDisplay} ${unitClean} past papers`,
      cieCode ? `${cieCode} ${unitShort} past papers` : '',
      cieCode ? `${cieCode} mark scheme` : '',
      cieCode ? `${cieCode} grade thresholds` : '',
      unitCode ? `${unitCode} past papers` : '',
      unitCode ? `${unitCode} mark scheme` : '',
      igcseCode ? `${igcseCode} ${unitClean} past papers` : '',
      `${subjDisplay} ${unitClean} mark scheme`,
      isCie ? 'Cambridge CAIE split view past papers' : 'Edexcel split view past papers'
    ].filter(Boolean).join(', ');

    return {
      title,
      description,
      keywords,
      canonicalUrl,
      consolidatingCanonical: false,
      robots,
      h1: `${currShort} ${subjDisplay} — ${unitWithCode} Past Papers (${yrSpan})`,
      subtitle: `${docCount} verified Question Papers, ${extras} covering ${yrSpan}. Click any sitting to study side-by-side in Split View.`
    };
  }

  // Subject-level SEO metadata
  if (filterSubject) {
    const curr = filterCurriculum || inferCurriculumForSubject(filterSubject, 'Edexcel IAL');
    const subjWizard = meta?.wizard?.[curr]?.[filterSubject];
    const docCount = subjWizard?.totalFiles || 100;
    const unitNames = Object.keys(subjWizard?.units || {});
    const unitCodes = getUniqueOrderedUnitCodes(unitNames);
    const currentSpecCodes = unitCodes.filter((c) => !LEGACY_IAL_UNIT_CODES.has(c));
    const displayUnitCodes = currentSpecCodes.length > 0 ? currentSpecCodes : unitCodes;
    const igcseCode = curr === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const cieCode = isCie ? extractSyllabusCodeFromSubject(filterSubject) : '';
    const cieEntry = cieCode ? resolveCambridgeSyllabus(cieCode) : null;
    const cov = (
      curr === 'Edexcel IGCSE' ? meta?.igcseSubjectCoverage?.[filterSubject]
      : curr === 'Edexcel IAL' ? meta?.ialSubjectCoverage?.[filterSubject]
      : curr === 'Cambridge AS & A Level' ? meta?.cieAlSubjectCoverage?.[filterSubject]
      : curr === 'Cambridge O Level' ? meta?.cieOlSubjectCoverage?.[filterSubject]
      : meta?.cieIgcseSubjectCoverage?.[filterSubject]
    ) || (isCie ? '2018 – 2025' : '2014 – June 2026');
    const hasBooks = subjectHasBooks(curr, filterSubject);

    const fullCodeStr = curr === 'Edexcel IGCSE' && igcseCode
      ? ` (${igcseCode})`
      : !isCie && displayUnitCodes.length > 0
        ? ` (${displayUnitCodes.slice(0, 6).join(', ')})`
        : '';

    const shortCodeToken = curr === 'Edexcel IGCSE' && igcseCode
      ? igcseCode.split(' / ')[0]
      : !isCie
        ? formatCodeRangeForTitle(displayUnitCodes, filterSubject === 'Math')
        : '';
    const shortCodeStr = shortCodeToken ? ` (${shortCodeToken})` : '';

    const title = pickTitleVariant(
      curr === 'Edexcel IAL' && filterSubject === 'Math'
        ? [
            'Edexcel IAL Maths Past Papers & MS (P1–P4, M1, S1, FP1)',
            'Edexcel IAL Maths (WMA11–WMA14) Past Papers & MS'
          ]
        : [
            `${currShort} ${subjDisplay}${shortCodeStr} Past Papers & MS`,
            `${currShort} ${subjDisplay}${shortCodeStr} Past Papers`,
            `${currShort} ${subjShort}${shortCodeStr} Past Papers & MS`,
            `${currShort} ${subjShort}${shortCodeStr} Past Papers`,
            `${currTiny} ${subjShort}${shortCodeStr} Past Papers & MS`,
            `${currTiny} ${subjShort}${shortCodeStr} Past Papers`,
            `${currTiny} ${subjShort} Past Papers`
          ],
      56
    );

    const resourceTail = isCie
      ? (hasBooks ? 'past papers, mark schemes, inserts, grade thresholds & textbooks' : 'past papers, mark schemes, inserts, grade thresholds & examiner reports')
      : hasBooks
        ? 'past exam papers, mark schemes, examiner reports & textbooks'
        : 'past exam papers, mark schemes & examiner reports';
    const resourceTailShort = isCie
      ? (hasBooks ? 'past papers, mark schemes, thresholds & textbooks' : 'past papers, mark schemes & grade thresholds')
      : hasBooks
        ? 'past papers, mark schemes & textbooks'
        : 'past papers, mark schemes & examiner reports';

    const altNote = cieEntry?.alt91 ? ` (also 9-1 ${cieEntry.alt91})` : '';
    const description = pickTitleVariant([
      `Browse ${docCount}+ ${currShort} ${subjDisplay}${fullCodeStr}${altNote} ${resourceTail} (${cov}) in Split View.`,
      `Browse ${docCount}+ ${currShort} ${subjDisplay}${shortCodeStr}${altNote} ${resourceTail} (${cov}) in Split View.`,
      `Browse ${docCount}+ ${currShort} ${subjDisplay}${shortCodeStr} ${resourceTailShort} (${cov}) in Split View.`,
      fitDescription(`Browse ${docCount}+ ${currShort} ${subjDisplay}${shortCodeStr} ${resourceTailShort} (${cov}).`)
    ], 158);

    const keywords = [
      `${currShort} ${subjDisplay} past papers`,
      `${currShort} ${subjDisplay} mark schemes`,
      cieCode ? `${cieCode} past papers` : '',
      cieEntry?.alt91 ? `${cieEntry.alt91} past papers` : '',
      cieCode ? `${cieCode} grade thresholds` : '',
      !isCie ? `${subjDisplay} Edexcel past papers` : `${subjDisplay} Cambridge CAIE past papers`,
      ...(!isCie ? displayUnitCodes.map((c) => `${c} past papers`) : []),
      igcseCode ? `${igcseCode} past papers` : '',
      hasBooks ? `${curr} ${subjDisplay} textbooks pdf` : ''
    ].filter(Boolean).join(', ');

    return {
      title,
      description,
      keywords,
      canonicalUrl,
      robots,
      h1: `${currShort} ${subjDisplay}${fullCodeStr} Past Papers & ${hasBooks ? 'Textbooks' : 'Mark Schemes'}`,
      subtitle: `Browse ${docCount} unique examination papers, ${isCie ? 'mark schemes, inserts, grade thresholds, and examiner reports' : hasBooks ? 'mark schemes, examiner reports, and textbooks' : 'mark schemes, and examiner reports'} (${cov}) across ${unitNames.length || 'all'} ${isCie ? 'components & variants' : 'course units'}.`
    };
  }

  // Cambridge Curriculum-level & Hub SEO metadata
  if (filterCurriculum === 'Cambridge AS & A Level') {
    const alCount = getCurriculumUniqueCount(meta, 'Cambridge AS & A Level');
    const alSubjCount = meta?.cieAlSubjects?.length || 0;
    return {
      title: 'Cambridge International AS & A Level Past Papers & MS',
      description: fitDescription(`Browse ${alCount.toLocaleString()}+ Cambridge International AS & A Level past papers, mark schemes, grade thresholds & reports across ${alSubjCount || 'key'} syllabuses (9709, 9702, 9701, 9700).`),
      keywords: 'Cambridge A Level past papers, CAIE AS A Level past papers, 9709 past papers, 9702 physics, 9701 chemistry, 9700 biology, grade thresholds',
      canonicalUrl,
      robots,
      h1: 'Cambridge International AS & A Level Past Papers',
      subtitle: `Independent CAIE AS & A Level study archive (${alCount.toLocaleString()}+ files) with variant filtering (v1–v3), Grade Thresholds (GT), and Split View.`
    };
  }

  if (filterCurriculum === 'Cambridge IGCSE') {
    const igCount = getCurriculumUniqueCount(meta, 'Cambridge IGCSE');
    const igSubjCount = meta?.cieIgcseSubjects?.length || 0;
    return {
      title: 'Cambridge IGCSE Past Papers, Mark Schemes & Thresholds',
      description: fitDescription(`Browse ${igCount.toLocaleString()}+ Cambridge IGCSE (A*-G & 9-1) past papers, mark schemes, inserts & grade thresholds across ${igSubjCount || 'key'} syllabuses (0625, 0620, 0610, 0580, 0500).`),
      keywords: 'Cambridge IGCSE past papers, CAIE IGCSE past papers, 0625 physics, 0620 chemistry, 0610 biology, 0580 maths, 0972, 0980, grade thresholds',
      canonicalUrl,
      robots,
      h1: 'Cambridge IGCSE Past Papers & Grade Thresholds',
      subtitle: `Independent Cambridge IGCSE archive covering A*–G and 9–1 equivalents across Core, Extended, Practical & ATP papers in Split View.`
    };
  }

  if (filterCurriculum === 'Cambridge O Level') {
    const olCount = getCurriculumUniqueCount(meta, 'Cambridge O Level');
    const olSubjCount = meta?.cieOlSubjects?.length || 0;
    return {
      title: 'Cambridge O Level Past Papers, Mark Schemes & GT',
      description: fitDescription(`Browse ${olCount.toLocaleString()}+ Cambridge O Level past papers, mark schemes & grade thresholds across ${olSubjCount || 'key'} syllabuses (4024, 5054, 5070, 5090, 1123, 2058, 2059).`),
      keywords: 'Cambridge O Level past papers, CAIE O Level past papers, 4024 maths D, 5054 physics, 5070 chemistry, 5090 biology, 2058 islamiyat, 2059 pakistan studies',
      canonicalUrl,
      robots,
      h1: 'Cambridge O Level Past Papers & Grade Thresholds',
      subtitle: `Independent Cambridge O Level study archive with instant variant lookup, Grade Thresholds (GT), and side-by-side Split View.`
    };
  }

  if (isCie && !filterCurriculum && !filterSubject && !filterUnit && !filterDocType) {
    return {
      title: forceShowTable
        ? 'All Cambridge (CAIE) Past Papers & Grade Thresholds'
        : 'Cambridge IGCSE, O Level & A-Level Past Papers & MS',
      description: forceShowTable
        ? fitDescription(`Search and filter all ${cambridgeUnique > 0 ? `${cambridgeUnique.toLocaleString()}+ ` : ''}Cambridge International (CAIE) AS & A Level, IGCSE & O Level past papers, mark schemes & grade thresholds (2002–2026).`)
        : fitDescription(`Study ${cambridgeUnique > 0 ? `${cambridgeUnique.toLocaleString()}+ ` : ''}Cambridge International (CAIE) AS & A Level, IGCSE, and O Level past papers, mark schemes, inserts & grade thresholds in Split View.`),
      keywords: 'Cambridge past papers, CAIE past papers, Cambridge IGCSE, Cambridge O Level, Cambridge A Level, 0625, 0580, 9709, 9702, 4024, 5054, grade thresholds',
      canonicalUrl,
      robots,
      h1: forceShowTable
        ? 'All Cambridge International Past Exam Papers'
        : 'Cambridge International AS & A Level, IGCSE & O Level Past Papers',
      subtitle: `Independent CAIE study archive indexing AS & A Level, IGCSE (A*–G & 9–1), and O Level papers with variant badges, Inserts, and Grade Thresholds.`
    };
  }

  // Edexcel Curriculum-level SEO metadata (100% preserved)
  if (filterCurriculum === 'Edexcel IAL') {
    const ialCount = getCurriculumUniqueCount(meta, 'Edexcel IAL');
    const ialSubjCount = meta?.ialSubjects?.length || 19;
    return {
      title: 'Edexcel IAL Past Papers, Mark Schemes & Books (2026)',
      description: fitDescription(`Browse ${ialCount.toLocaleString()}+ Edexcel IAL past papers, mark schemes, examiner reports & books across ${ialSubjCount} subjects including Mathematics (WMA11–WMA14), Physics & Biology.`),
      keywords: 'Edexcel IAL past papers, International A Level past papers, Edexcel IAL mark schemes, WMA11, WCH11, WPH11, WBI11, WEC11, WBS11, Edexcel IAL textbooks',
      canonicalUrl,
      robots,
      h1: 'Edexcel International A-Level (IAL) Past Papers & Textbooks',
      subtitle: `Complete archive across ${ialSubjCount} IAL subjects (${meta?.boards?.edexcel?.coverage || meta?.coverage || 'January 2003 – June 2026'}) with instant side-by-side Question Paper and Mark Scheme Split View.`
    };
  }

  if (filterCurriculum === 'Edexcel IGCSE') {
    const igcseCount = getCurriculumUniqueCount(meta, 'Edexcel IGCSE');
    const igcseSubjCount = meta?.igcseSubjects?.length || 43;
    return {
      title: 'Edexcel IGCSE Past Papers & Mark Schemes (9-1 & 2026)',
      description: fitDescription(`Browse ${igcseCount.toLocaleString()}+ Edexcel IGCSE (9-1 & Modular) past papers, mark schemes, examiner reports & textbooks across ${igcseSubjCount} subjects (4MA1, 4PH1, 4CH1, 4BI1).`),
      keywords: 'Edexcel IGCSE past papers, International GCSE Edexcel past papers, 4MA1, 4PH1, 4CH1, 4BI1, Edexcel IGCSE Modular past papers, Regional 1R 2R past papers',
      canonicalUrl,
      robots,
      h1: 'Edexcel International GCSE (IGCSE 9-1) Past Papers & Textbooks',
      subtitle: `Complete archive across ${igcseSubjCount} IGCSE subjects including Foundation, Higher, Regional (R), and Modular series with instant Split View.`
    };
  }

  if (forceShowTable && !filterCurriculum && !filterSubject && !filterUnit && !filterDocType) {
    return {
      title: 'Edexcel IAL & IGCSE Past Papers & Mark Schemes (2026)',
      description: fitDescription(`Browse all ${edexcelUnique.toLocaleString()}+ Edexcel IAL & IGCSE past papers, mark schemes, examiner reports & textbooks (${meta?.boards?.edexcel?.coverage || meta?.coverage || '2003–2026'}) in Split View.`),
      keywords: 'Edexcel past papers archive, Edexcel IAL past papers, Edexcel IGCSE past papers, mark schemes, examiner reports, split view',
      canonicalUrl,
      robots,
      h1: 'All Edexcel IAL & IGCSE Past Exam Papers',
      subtitle: `Independent study catalog indexing ${edexcelUnique.toLocaleString()}+ unique Edexcel papers, mark schemes, examiner reports, textbooks, and audio.`
    };
  }

  // Default Homepage SEO metadata (front-load Edexcel head query for zero SEO regression)
  return {
    title: 'Edexcel IAL & IGCSE Past Papers & Books | Conceptualist',
    description: fitDescription(`Study ${uniqueFiles.toLocaleString()}+ Edexcel IAL, Edexcel IGCSE & Cambridge International past papers, mark schemes, examiner reports & textbooks in Split View.`),
    keywords: 'Edexcel past papers, Edexcel IAL past papers, Edexcel IGCSE past papers, Cambridge IGCSE past papers, Cambridge A Level, Conceptualist Systems, WMA11, WCH11, WPH11, 0625, 9709',
    canonicalUrl: `${SITE_URL}/`,
    robots,
    h1: 'Edexcel IAL & IGCSE Past Exam Papers & Textbooks',
    subtitle: `${uniqueFiles.toLocaleString()}+ unique Question Papers, Mark Schemes, Examiner Reports, and Textbooks across Pearson Edexcel & Cambridge International (${totalFiles.toLocaleString()} archived files).`
  };
}
