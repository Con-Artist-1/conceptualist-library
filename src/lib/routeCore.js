// Lightweight core SEO routing, slug resolution & metadata across International Exam Boards
// (Pearson Edexcel IAL/IGCSE and Cambridge International AS & A Level, IGCSE, O Level).
import {
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
      pathname = '/textbooks';
    } else {
      const curr = inferCurriculumForSubject(filterSubject, filterCurriculum);
      const currSlug = getCurriculumSlug(curr);
      if (isCambridgeCurriculum(curr)) {
        pathname = '/textbooks';
      } else if (filterSubject && currSlug) {
        pathname = `/textbooks/${currSlug}/${getSubjectSlug(filterSubject)}`;
      } else if (currSlug) {
        pathname = `/textbooks/${currSlug}`;
      } else {
        pathname = '/textbooks';
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
  const uniqueFiles = meta?.uniqueFiles || meta?.totalFiles || 16051;
  const totalFiles = meta?.totalFiles || 19912;
  const totalBooks = meta?.totalBooks || 73;
  const ialBooks = meta?.ialBooks || 60;
  const igcseBooks = meta?.igcseBooks || 13;
  const cambridgeBooks = meta?.cambridgeBooks || 0;
  const dfCount = meta?.dfCount || 46;
  const audioCount = meta?.audioCount || 272;
  const edexcelUnique = meta?.boards?.edexcel?.uniqueFiles ?? uniqueFiles;
  const edexcelTotal = meta?.boards?.edexcel?.totalFiles ?? totalFiles;
  const cambridgeUnique = meta?.boards?.cambridge?.uniqueFiles ?? 0;
  const cambridgeTotal = meta?.boards?.cambridge?.totalFiles ?? 0;
  return {
    uniqueFiles,
    totalFiles,
    totalBooks,
    ialBooks,
    igcseBooks,
    cambridgeBooks,
    dfCount,
    audioCount,
    edexcelUnique,
    edexcelTotal,
    cambridgeUnique,
    cambridgeTotal
  };
}

function pickTitleVariant(candidates, maxLen = 65) {
  for (const c of candidates) {
    if (c.length <= maxLen) return c;
  }
  return candidates[candidates.length - 1];
}

function fitDescription(str, maxLen = 160) {
  if (str.length <= maxLen) return str;
  const trimmed = str.slice(0, maxLen - 1);
  const lastSpace = trimmed.lastIndexOf(' ');
  return `${(lastSpace > 100 ? trimmed.slice(0, lastSpace) : trimmed).replace(/[.,;:\s-]+$/, '')}.`;
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
    if (segments.length === 1) return result;
    const tbCurr = segments[1].toLowerCase();
    if (tbCurr === 'ial' || tbCurr === 'edexcel-ial') {
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
      title: 'About Conceptualist Systems | International Exam Archive',
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
      title: 'International IT & CS Practical Data Files (.zip) | Conceptualist',
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
      title: 'Listening Audio MP3s & Synced Transcripts | Conceptualist',
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
    'Co-ordinated Sciences (Double Award)': 'Double Science',
    'Combined Science': 'Combined Sci',
    'Sciences (Double Award)': 'Double Science',
    'Sciences (Single Award)': 'Single Science',
    'Environmental Management': 'Env Management',
    'Global Perspectives & Research': 'Global Perspectives',
    'Global Perspectives': 'Global Persp',
    'Design and Technology': 'Design & Tech',
    'Physical Education': 'PE',
    'Business Studies': 'Business',
    'Religious Studies': 'RS',
    'Bangladesh Studies': 'Bangladesh St',
    'Pakistan Studies': 'Pakistan St',
    'Greek (First Language)': 'Greek (1st Lang)'
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
      const isIal = curr === 'Edexcel IAL';
      const isIalMath = isIal && filterSubject === 'Math';
      const hasAnswerBooks = isIal && ['Accounting', 'Biology', 'Business', 'Chemistry', 'Economics', 'Physics'].includes(filterSubject);
      const title = pickTitleVariant(
        isIalMath
          ? [
              'Edexcel IAL Maths Solution Banks & Books PDF | Conceptualist',
              'Edexcel IAL Maths Textbooks & Solution Banks PDF'
            ]
          : hasAnswerBooks
            ? [
                `${curr} ${subjDisplay} Textbooks & Answers PDF | Conceptualist`,
                `${curr} ${subjShort} Student Book 1 & 2 PDF + Answers | Conceptualist`,
                `${curr} ${subjDisplay} Student Book 1 & 2 PDF & Answers`
              ]
            : [
                `${curr} ${subjDisplay} Textbooks PDF | Conceptualist`,
                `${curr} ${subjShort} Textbooks & Student Books PDF | Conceptualist`,
                `${curr.replace(/^(Edexcel|Cambridge)\s+/, '')} ${subjDisplay} Textbooks PDF | Conceptualist`
              ],
        62
      );
      const description = pickTitleVariant([
        isIalMath
          ? 'Read and download all 28 Edexcel IAL Mathematics Student Books & step-by-step Worked Solution Banks (P1-P4, M1-M3, S1-S3, D1, FP1-FP3) free in our 2-Page WebPDF reader.'
          : hasAnswerBooks
            ? `Read and download ${curr} ${subjDisplay} Student Book 1 & 2 PDFs, worked answers, and lab books free online in our 2-Page WebPDF reader.`
            : `Read and download ${curr} ${subjDisplay} student textbooks and revision guides free online in our 2-Page WebPDF reader.`,
        `Study ${curr} ${subjDisplay} student books${isIalMath ? ' & Worked Solution Banks (P1-P4, M1-M3, S1-S3, D1, FP1-FP3)' : hasAnswerBooks ? ', Student Book 1 & 2 answers & guides' : ' & answers'} in WebPDF reader.`
      ], 158);
      return {
        title,
        description,
        keywords: [
          `${curr} ${subjDisplay} textbook pdf`,
          `${curr} ${subjDisplay} student book 1 pdf`,
          `${curr} ${subjDisplay} student book 2 answers pdf`,
          isIalMath ? 'Edexcel IAL solution bank pdf' : `${curr} ${subjDisplay} solution manual`,
          isIalMath ? 'Pure Maths P1 P2 P3 P4 M1 M2 S1 D1 FP1 Solution Bank' : `${curr} ${subjDisplay} past papers`
        ].join(', '),
        canonicalUrl,
        robots,
        h1: `${curr} ${subjDisplay} Textbooks${isIalMath ? ' & Worked Solution Banks' : hasAnswerBooks ? ', Student Books & Answers' : ' & Study Books'}`,
        subtitle: `Archived ${curr} ${subjDisplay} student books${isIalMath ? ' and chapter-by-chapter P1-P4, M1-M3, S1-S3, D1 & FP1-FP3 Solution Banks' : hasAnswerBooks ? ', Student Book 1 & 2 answer PDFs, and lab books' : ''} with instant 2-Page book spread viewing.`
      };
    }
    if (filterCurriculum) {
      const isIal = filterCurriculum === 'Edexcel IAL';
      const isIgcseEdx = filterCurriculum === 'Edexcel IGCSE';
      return {
        title: `${currShort} Textbooks${isIal ? ' & Solution Banks' : isIgcseEdx ? ' (9-1) PDF' : ' PDF'} | Conceptualist`,
        description: isIal
          ? `Browse ${ialBooks} Edexcel IAL student textbooks, answer books & Maths Solution Banks across 9 subjects in our 2-Page WebPDF reader.`
          : isIgcseEdx
            ? `Browse ${igcseBooks} Edexcel IGCSE (9-1) student textbooks across Sciences, Mathematics, Business, Commerce & IT free online.`
            : `Browse ${filterCurriculum} student textbooks and revision guides in our 2-Page WebPDF reader.`,
        keywords: `${filterCurriculum} textbooks pdf, ${isIal ? 'Edexcel IAL solution banks, IAL Maths solution bank, student book 1 2 answers pdf' : `${filterCurriculum} student books pdf`}`,
        canonicalUrl,
        robots,
        h1: `${filterCurriculum} Textbooks${isIal ? ' & Worked Solution Banks' : isIgcseEdx ? ' (9-1)' : ''}`,
        subtitle: `Read ${isIal ? ialBooks : isIgcseEdx ? igcseBooks : (counts.cambridgeBooks || totalBooks)} ${filterCurriculum} student textbooks, lab guides, and worked answers online in 2-Page spread mode.`
      };
    }
    return {
      title: 'Edexcel IAL & IGCSE Textbooks & Solutions | Conceptualist',
      description: fitDescription(`Read ${totalBooks} Edexcel IAL and IGCSE (9-1) student textbooks, answer PDFs, and Maths worked solution banks free online in 2-Page WebPDF reader.`),
      keywords: 'Edexcel IAL textbooks pdf, Edexcel IGCSE textbooks pdf, Edexcel solution bank, Pure Mathematics textbook, Chemistry Physics Biology Edexcel book',
      canonicalUrl,
      robots,
      h1: 'Edexcel IAL & IGCSE Textbooks & Solution Banks',
      subtitle: `${totalBooks} course textbooks, laboratory books, and worked solution manuals across Mathematics, Sciences, Business, Commerce, Economics, Accounting, Psychology, and IT.`
    };
  }

  // Unit / Paper-level SEO metadata
  if (filterSubject && filterUnit) {
    const unitCode = getUnitCodeFromLabel(filterUnit, { isCambridge: isCie });
    const cieCode = isCie ? extractSyllabusCodeFromSubject(filterSubject) : '';
    const igcseCode = filterCurriculum === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const unitClean = cleanUnitForContext(subjDisplay, filterUnit);
    const unitWithCode = unitCode && !unitClean.includes(unitCode) && !(isCie && /^P\d$/.test(unitCode) && /\bPaper\s+\d\b/i.test(unitClean))
      ? `${unitClean} (${unitCode})`
      : unitClean;
    const compactClean = compactUnitTitleLabel(unitClean);
    const unitShort = unitCode && !compactClean.includes(unitCode) && !(isCie && /^P\d$/.test(unitCode) && /\bPaper\s+\d\b/i.test(compactClean))
      ? `${compactClean} (${unitCode})`
      : compactClean;
    const parenShortMatch = unitClean.match(/\(([A-Z0-9]{2,4})\)/i);
    const parenTok = parenShortMatch ? parenShortMatch[1].toUpperCase() : '';
    const validParenTok = parenTok && !NON_CODE_PARENS.has(parenTok) ? parenTok : '';
    const ultraShortUnit = validParenTok && unitCode && validParenTok !== unitCode
      ? `${validParenTok} (${unitCode})`
      : (isCie ? compactClean : (unitCode || unitShort));

    const unitObj = meta?.wizard?.[filterCurriculum || 'Edexcel IAL']?.[filterSubject]?.units?.[filterUnit];
    const docCount = unitObj?.count || 40;
    let unitCanonicalUrl = canonicalUrl;
    let consolidatingCanonical = false;
    if (unitObj && typeof unitObj.count === 'number' && unitObj.count < 3 && !hasSearchQuery) {
      robots = 'noindex, follow';
      const parentCurrSlug = getCurriculumSlug(filterCurriculum || 'Edexcel IAL');
      const parentSubjSlug = getSubjectSlug(filterSubject);
      if (parentCurrSlug && parentSubjSlug) {
        unitCanonicalUrl = `${SITE_URL}/${parentCurrSlug}/${parentSubjSlug}`;
        consolidatingCanonical = true;
      }
    }
    const years = unitObj?.years || [2025, 2024, 2023, 2022, 2021, 2020];
    const minYr = years[years.length - 1] || 2018;
    const maxYr = years[0] || 2025;
    const yrSpan = `${minYr}–${maxYr}`;
    const igcseTitleCode = igcseCode ? ` (${igcseCode.split(' / ')[0]})` : '';

    const title = pickTitleVariant([
      `${currShort} ${subjDisplay} ${unitWithCode} Past Papers | Conceptualist`,
      `${currShort} ${subjDisplay} ${unitShort}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currShort} ${subjShort} ${unitShort}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currShort} ${subjShort} ${ultraShortUnit}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currTiny} ${subjShort} ${ultraShortUnit}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currShort.replace(/^(Edexcel|Cambridge)\s+/, '')} ${subjShort} ${ultraShortUnit}${igcseTitleCode} Past Papers | Conceptualist`,
      cieCode
        ? `CAIE ${cieCode} ${ultraShortUnit} Past Papers | Conceptualist`
        : `${currShort} ${subjShort} ${ultraShortUnit} Past Papers`,
      cieCode
        ? `CAIE ${cieCode} ${unitCode || ultraShortUnit} Past Papers | Conceptualist`
        : `${subjShort} ${unitCode || ultraShortUnit} Past Papers`
    ], 64);

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
      canonicalUrl: unitCanonicalUrl,
      consolidatingCanonical,
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

    const title = pickTitleVariant([
      `${currShort} ${subjDisplay}${shortCodeStr} Past Papers & MS | Conceptualist`,
      `${currShort} ${subjDisplay}${shortCodeStr} Past Papers | Conceptualist`,
      `${currShort} ${subjShort}${shortCodeStr} Past Papers | Conceptualist`,
      `${currTiny} ${subjShort}${shortCodeStr} Past Papers | Conceptualist`,
      `${currShort.replace(/^(Edexcel|Cambridge)\s+/, '')} ${subjShort}${shortCodeStr} Past Papers | Conceptualist`,
      cieCode
        ? `CAIE ${subjShort} Past Papers | Conceptualist`
        : `${currShort} ${subjShort} Past Papers | Conceptualist`,
      cieCode
        ? `Cambridge ${cieCode} Past Papers & MS | Conceptualist`
        : `${currShort} ${subjShort} Past Papers`
    ], 64);

    const resourceTail = isCie
      ? 'past papers, mark schemes, inserts, grade thresholds & examiner reports'
      : hasBooks
        ? 'past exam papers, mark schemes, examiner reports & textbooks'
        : 'past exam papers, mark schemes & examiner reports';
    const resourceTailShort = isCie
      ? 'past papers, mark schemes & grade thresholds'
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
      title: 'Cambridge AS & A Level (CAIE) Past Papers | Conceptualist',
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
      title: 'Cambridge IGCSE (CAIE) Past Papers & Mark Schemes | Conceptualist',
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
      title: 'Cambridge O Level (CAIE) Past Papers & MS | Conceptualist',
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
        ? 'All Cambridge International Past Papers Archive | Conceptualist'
        : 'Cambridge IGCSE, O Level & A-Level Past Papers | Conceptualist',
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
      title: 'Edexcel IAL Past Papers, Mark Schemes & Books | Conceptualist',
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
      title: 'Edexcel IGCSE Past Papers & Mark Schemes (9-1) | Conceptualist',
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
      title: 'All Edexcel IAL & IGCSE Past Papers Archive | Conceptualist',
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
    title: 'Edexcel IAL & IGCSE Past Papers & Textbooks | Conceptualist',
    description: fitDescription(`Study ${uniqueFiles.toLocaleString()}+ Edexcel IAL, Edexcel IGCSE & Cambridge International past papers, mark schemes, examiner reports & textbooks in Split View.`),
    keywords: 'Edexcel past papers, Edexcel IAL past papers, Edexcel IGCSE past papers, Cambridge IGCSE past papers, Cambridge A Level, Conceptualist Systems, WMA11, WCH11, WPH11, 0625, 9709',
    canonicalUrl: `${SITE_URL}/`,
    robots,
    h1: 'Edexcel IAL & IGCSE Past Exam Papers & Textbooks',
    subtitle: `${uniqueFiles.toLocaleString()}+ unique Question Papers, Mark Schemes, Examiner Reports, and Textbooks across Pearson Edexcel & Cambridge International (${totalFiles.toLocaleString()} archived files).`
  };
}
