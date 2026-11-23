// Lightweight core SEO routing, slug resolution & metadata (zero bookCatalog/JSON-LD overhead)
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

export * from '../data/curriculumCatalog.js';

function subjectHasBooks(curriculum, subject) {
  if (!subject) return false;
  const curr = curriculum || inferCurriculumForSubject(subject, 'Edexcel IAL');
  return Boolean(SUBJECTS_WITH_BOOKS_MAP[curr]?.has(subject));
}

export function getLegacyEquivalentsForState({ filterCurriculum = '', filterSubject = '', filterUnit = '' } = {}) {
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
  if (curriculum === 'Edexcel IGCSE' || curriculum.toUpperCase().includes('IGCSE')) return 'igcse';
  if (curriculum === 'Edexcel IAL' || curriculum.toUpperCase().includes('IAL')) return 'ial';
  return slugify(curriculum);
}

export function getSubjectSlug(subject) {
  if (!subject) return '';
  if (subject === 'Math' || subject === 'Mathematics' || subject === 'Maths') return 'mathematics';
  return slugify(subject);
}

export function getUnitSlug(unitLabel) {
  if (!unitLabel) return '';
  const base = slugify(unitLabel);
  const mathCode = IAL_MATH_UNIT_CODES[unitLabel];
  if (mathCode && !base.endsWith(mathCode.toLowerCase())) {
    return `${base}-${mathCode.toLowerCase()}`;
  }
  return base;
}

export function formatSubjectName(subj) {
  if (!subj) return '';
  if (subj === 'Math') return 'Mathematics';
  return subj;
}

export function getUnitCodeFromLabel(unitLabel) {
  if (!unitLabel) return '';
  if (IAL_MATH_UNIT_CODES[unitLabel]) return IAL_MATH_UNIT_CODES[unitLabel];
  const parenMatch = unitLabel.match(/\(([A-Z0-9]{2,6})\)/i);
  return parenMatch ? parenMatch[1].toUpperCase() : '';
}

function resolveSubjectFromSlug(slug, curriculum, meta) {
  if (!slug) return '';
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
  // Fallback across all subjects
  const allPool = [...new Set([...IAL_SUBJECTS_DEFAULT, ...IGCSE_SUBJECTS_DEFAULT, ...(meta?.subjects || [])])];
  for (const subj of allPool) {
    if (getSubjectSlug(subj) === clean || slugify(subj) === clean) {
      return subj;
    }
  }
  return '';
}

function resolveUnitFromSlug(unitSlug, curriculum, subject, meta) {
  if (!unitSlug || !subject) return '';
  const clean = unitSlug.toLowerCase().trim();
  const curr = curriculum || 'Edexcel IAL';
  const unitsObj = meta?.wizard?.[curr]?.[subject]?.units;
  const unitLabels = unitsObj
    ? Object.keys(unitsObj)
    : (DEFAULT_UNIT_LABELS[curr]?.[subject] || []);

  // 1. Exact slug match
  for (const label of unitLabels) {
    if (getUnitSlug(label) === clean || slugify(label) === clean) return label;
  }

  // 2. Match by unit code or short code (e.g. "wma11", "p1", "wch11", "unit-1")
  for (const label of unitLabels) {
    const code = getUnitCodeFromLabel(label).toLowerCase();
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
    const paperNumMatch = clean.match(/^p(?:aper)?[-_]?([1-6])$/);
    if (paperNumMatch && label.toLowerCase().includes(`paper ${paperNumMatch[1]}`)) {
      return label;
    }
  }

  return '';
}

export function inferCurriculumForSubject(subject, fallbackCurriculum = '') {
  if (fallbackCurriculum) return fallbackCurriculum;
  if (!subject) return '';
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
    if (currSlug && subjSlug) return `/shards/${currSlug}-${subjSlug}.json`;
  }
  return '';
}

export function buildRoutePath({
  currentTab = 'library',
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterYear = '',
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

  let pathname = '/';
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
      if (filterSubject && currSlug) {
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
    if (filterSubject) {
      const subjSlug = getSubjectSlug(filterSubject);
      if (filterUnit) {
        pathname = `/${currSlug}/${subjSlug}/${getUnitSlug(filterUnit)}`;
      } else {
        pathname = `/${currSlug}/${subjSlug}`;
      }
    } else if (currSlug) {
      pathname = `/${currSlug}`;
    }
  } else if (forceShowTable) {
    pathname = '/papers';
  }

  const params = new URLSearchParams();
  if (filterYear) params.set('year', String(filterYear));
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
  // Collapse "Unit 5: Thermodynamics & Oscillations (WPH15)" -> "Unit 5 (WPH15)" when needed to stay <= 62 chars
  const m = /^(Unit\s+\d+):\s+.+?(\s*\([A-Z0-9]+\))$/i.exec(label);
  if (m) return `${m[1]}${m[2]}`;
  return String(label || '')
    .replace(/\b(Decision|Pure|Core|Further Pure)\s+Mathematics\b/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getCurriculumUniqueCount(meta, curr) {
  const subjectsMap = meta?.wizard?.[curr];
  if (subjectsMap && Object.keys(subjectsMap).length > 0) {
    return Object.values(subjectsMap).reduce((sum, entry) => sum + (entry?.totalFiles || 0), 0);
  }
  return curr === 'Edexcel IGCSE' ? 7377 : 8604;
}

export function getArchiveCounts(meta) {
  const uniqueFiles = meta?.uniqueFiles || meta?.totalFiles || 16021;
  const totalFiles = meta?.totalFiles || 19882;
  const totalBooks = meta?.totalBooks || 73;
  const ialBooks = meta?.ialBooks || 60;
  const igcseBooks = meta?.igcseBooks || 13;
  const dfCount = meta?.dfCount || 46;
  const audioCount = meta?.audioCount || 272;
  return { uniqueFiles, totalFiles, totalBooks, ialBooks, igcseBooks, dfCount, audioCount };
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
    filterCurriculum: '',
    filterSubject: '',
    filterUnit: '',
    filterYear: params.get('year') || '',
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
    result.forceShowTable = true;
    return result;
  }
  if (cleanPath === '/data-files') {
    result.filterDocType = 'DF';
    result.forceShowTable = true;
    return result;
  }
  if (cleanPath === '/audio') {
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
      result.filterCurriculum = 'Edexcel IAL';
    } else if (tbCurr === 'igcse' || tbCurr === 'edexcel-igcse') {
      result.filterCurriculum = 'Edexcel IGCSE';
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
  if (first === 'ial' || first === 'edexcel-ial') {
    result.filterCurriculum = 'Edexcel IAL';
    result.forceShowTable = true;
  } else if (first === 'igcse' || first === 'edexcel-igcse') {
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
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterDocType = null,
  searchQuery = '',
  forceShowTable = false,
  notFound = false,
  meta = null
}) {
  const { uniqueFiles, totalFiles, totalBooks, ialBooks, igcseBooks, dfCount, audioCount } = getArchiveCounts(meta);
  const isCanonicalDocTypeFilter =
    (filterDocType === 'Book' && !filterUnit) ||
    (filterDocType === 'DF' && !filterCurriculum && !filterSubject && !filterUnit) ||
    (filterDocType === 'AUD' && !filterCurriculum && !filterSubject && !filterUnit);
  // Keep parameterized views (?paper=, ?year=, ?type=) indexable with rel="canonical" pointing to the clean parent URL
  // so Google Search Console consolidates signals cleanly instead of failing validation with "Excluded by 'noindex' tag".
  // Only free-text internal search queries (?q=...), ultra-thin unit routes (< 3 files), and genuine 404s emit noindex.
  const hasSearchQuery = Boolean(searchQuery && String(searchQuery).trim());

  if (notFound) {
    return {
      title: 'Page Not Found | Conceptualist Systems',
      description: 'The requested Edexcel past paper or resource route could not be found. Browse all IAL & IGCSE subjects from our archive home.',
      keywords: 'Conceptualist Systems, Edexcel IAL past papers, Edexcel IGCSE past papers',
      canonicalUrl: `${SITE_URL}/`,
      robots: 'noindex, nofollow',
      h1: 'Archive Route Not Found',
      subtitle: 'Return to the Edexcel IAL & IGCSE archive directory to select a subject, unit, or textbook.'
    };
  }

  const canonicalPath = buildRoutePath({
    currentTab,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear: '',
    filterDocType: isCanonicalDocTypeFilter ? filterDocType : null,
    forceShowTable
  });
  const canonicalUrl = `${SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`;
  let robots = hasSearchQuery ? 'noindex, follow' : 'index, follow';

  if (currentTab === 'about') {
    return {
      title: 'About Conceptualist Systems | Edexcel IAL & IGCSE Archive',
      description: fitDescription(`Learn about Conceptualist Systems, an independent study index of ${uniqueFiles.toLocaleString()}+ Edexcel IAL & IGCSE papers, mark schemes, reports & books (${totalFiles.toLocaleString()} archived files).`),
      keywords: 'Conceptualist Systems, Edexcel past papers, IAL past papers, IGCSE past papers, academic repository, Nafiz.R, Nazmul.K',
      canonicalUrl,
      robots: 'index, follow',
      h1: 'About Conceptualist Systems',
      subtitle: `Independent study access to ${uniqueFiles.toLocaleString()}+ unique Edexcel IAL and IGCSE resources (${totalFiles.toLocaleString()} total archived files).`
    };
  }

  if (currentTab === 'changelog') {
    return {
      title: 'Site Changelog & Updates | Conceptualist Systems',
      description: fitDescription('Live update history: new 2025-2026 Edexcel past papers, Split View WebPDF optimizations, 2-Page book spread reader, and archive updates.'),
      keywords: 'Conceptualist Systems changelog, Edexcel 2026 past papers, 2025 past papers, split view reader',
      canonicalUrl,
      robots: 'index, follow',
      h1: 'Site Changelog & Update History',
      subtitle: 'Complete log of speed optimizations, new examination series, and reader features.'
    };
  }

  if (filterDocType === 'DF' && !filterCurriculum && !filterSubject) {
    return {
      title: 'Edexcel IAL & IGCSE IT & CS Data Files (.zip) | Conceptualist',
      description: `Download ${dfCount} archived Edexcel IAL IT (WIT12, WIT14) and IGCSE ICT & Computer Science (4IT1, 4CP0) practical exam data files free.`,
      keywords: 'Edexcel IAL IT data files, WIT12 data files, WIT14 data files, Edexcel IGCSE ICT 4IT1 data files, Computer Science 4CP0 data files',
      canonicalUrl,
      robots,
      h1: 'Edexcel IAL IT & IGCSE Practical Data Files',
      subtitle: `Archived practical examination source data archives (${dfCount} ZIPs) covering IAL Information Technology (WIT12, WIT14), IGCSE ICT (4IT1), and Computer Science (4CP0).`
    };
  }

  if (filterDocType === 'AUD' && !filterCurriculum && !filterSubject) {
    return {
      title: 'Edexcel IAL & IGCSE Listening Audio MP3s | Conceptualist',
      description: `Stream and download ${audioCount} archived Edexcel IAL & IGCSE ESL, French, German, Spanish, Chinese & Swahili listening audio MP3s and ZIPs with synced transcripts.`,
      keywords: 'Edexcel IAL listening audio, Edexcel IGCSE listening audio, ESL 4ES1 audio, French 4FR1 WFR02 mp3, German 4GN1 WGN02 mp3, Spanish 4SP1 WSP02 mp3, Chinese 4CN1 audio, Swahili 4SW1 audio',
      canonicalUrl,
      robots,
      h1: 'Edexcel IAL & IGCSE Listening Audio Archive',
      subtitle: `Direct MP3 & ZIP listening examination audio tracks (${audioCount} files) across IGCSE ESL, Chinese, Swahili, and IAL/IGCSE French, German & Spanish with synced transcripts.`
    };
  }

  const subjDisplay = formatSubjectName(filterSubject);
  const SUBJECT_SHORT_MAP = {
    'Mathematics': 'Maths',
    'Information Technology': 'IT',
    'English as a Second Language': 'ESL',
    'Further Pure Mathematics': 'Further Pure Maths',
    'Greek (First Language)': 'Greek (1st Lang)',
    'Sciences (Double Award)': 'Double Science',
    'Sciences (Single Award)': 'Single Science'
  };
  const subjShort = SUBJECT_SHORT_MAP[subjDisplay] || subjDisplay;
  const currShort = filterCurriculum === 'Edexcel IGCSE' ? 'Edexcel IGCSE' : filterCurriculum === 'Edexcel IAL' ? 'Edexcel IAL' : 'Edexcel';

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
                `${curr.replace('Edexcel ', '')} ${subjDisplay} Textbooks PDF | Conceptualist`
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
      return {
        title: `${filterCurriculum} Textbooks${isIal ? ' & Solution Banks' : ' (9-1) PDF'} | Conceptualist`,
        description: isIal
          ? `Browse ${ialBooks} Edexcel IAL student textbooks, answer books & Maths Solution Banks across 9 subjects in our 2-Page WebPDF reader.`
          : `Browse ${igcseBooks} Edexcel IGCSE (9-1) student textbooks across Sciences, Mathematics, Business, Commerce & IT free online.`,
        keywords: `${filterCurriculum} textbooks pdf, ${isIal ? 'Edexcel IAL solution banks, IAL Maths solution bank, student book 1 2 answers pdf' : 'Edexcel IGCSE 9-1 textbooks pdf'}`,
        canonicalUrl,
        robots,
        h1: `${filterCurriculum} Textbooks${isIal ? ' & Worked Solution Banks' : ' (9-1)'}`,
        subtitle: `Read ${isIal ? ialBooks : igcseBooks} ${filterCurriculum} student textbooks, lab guides, and worked answers online in 2-Page spread mode.`
      };
    }
    return {
      title: 'Edexcel IAL & IGCSE Textbooks & Solution Banks PDF',
      description: fitDescription(`Read ${totalBooks} Edexcel IAL and IGCSE (9-1) student textbooks, answer PDFs, and Maths worked solution banks free online in 2-Page WebPDF reader.`),
      keywords: 'Edexcel IAL textbooks pdf, Edexcel IGCSE textbooks pdf, Edexcel solution bank, Pure Mathematics textbook, Chemistry Physics Biology Edexcel book',
      canonicalUrl,
      robots,
      h1: 'Edexcel IAL & IGCSE Textbooks & Solution Banks',
      subtitle: `${totalBooks} course textbooks, laboratory books, and worked solution manuals across Mathematics, Sciences, Business, Commerce, Economics, Accounting, Psychology, and IT.`
    };
  }

  // Unit-level SEO metadata
  if (filterSubject && filterUnit) {
    const unitCode = getUnitCodeFromLabel(filterUnit);
    const igcseCode = filterCurriculum === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const unitClean = cleanUnitForContext(subjDisplay, filterUnit);
    const unitWithCode = unitCode && !unitClean.includes(unitCode) ? `${unitClean} (${unitCode})` : unitClean;
    const compactClean = compactUnitTitleLabel(unitClean);
    const unitShort = unitCode && !compactClean.includes(unitCode)
      ? `${compactClean} (${unitCode})`
      : compactClean;
    const parenShortMatch = unitClean.match(/\(([A-Z0-9]{2,4})\)/i);
    const ultraShortUnit = parenShortMatch && unitCode && parenShortMatch[1].toUpperCase() !== unitCode
      ? `${parenShortMatch[1].toUpperCase()} (${unitCode})`
      : (unitCode || unitShort);

    const unitObj = meta?.wizard?.[filterCurriculum || 'Edexcel IAL']?.[filterSubject]?.units?.[filterUnit];
    const docCount = unitObj?.count || 60;
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
    const years = unitObj?.years || [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019];
    const minYr = years[years.length - 1] || 2014;
    const maxYr = years[0] || 2026;
    const yrSpan = `${minYr}–${maxYr}`;
    const igcseTitleCode = igcseCode ? ` (${igcseCode.split(' / ')[0]})` : '';

    // Guarantee "Past Papers" in every unit <title> within 62 chars (never drop the transactional intent noun)
    const title = pickTitleVariant([
      `${currShort} ${subjDisplay} ${unitWithCode} Past Papers | Conceptualist`,
      `${currShort} ${subjDisplay} ${unitShort}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currShort} ${subjShort} ${unitShort}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currShort} ${subjShort} ${ultraShortUnit}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currShort.replace('Edexcel ', '')} ${subjDisplay} ${unitShort}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currShort.replace('Edexcel ', '')} ${subjShort} ${ultraShortUnit}${igcseTitleCode} Past Papers | Conceptualist`,
      `${currShort} ${subjShort} ${ultraShortUnit} Past Papers & Mark Schemes`
    ], 62);

    const codeNote = !unitWithCode.includes(igcseCode) && igcseCode ? ` (${igcseCode})` : '';
    const shortCodeNote = !unitShort.includes(igcseCode) && igcseCode ? ` (${igcseCode})` : '';
    const description = pickTitleVariant([
      `Study ${docCount}+ ${currShort} ${subjDisplay} ${unitWithCode}${codeNote} Past Papers, Mark Schemes & Examiner Reports (${yrSpan}) in Split View.`,
      `Study ${docCount}+ ${currShort} ${subjDisplay} ${unitWithCode}${codeNote} Past Papers, Mark Schemes & Examiner Reports (${yrSpan}).`,
      `Study ${docCount}+ ${currShort} ${subjDisplay} ${unitShort}${shortCodeNote} Past Papers, Mark Schemes & Examiner Reports (${yrSpan}).`,
      fitDescription(`Browse ${docCount}+ ${currShort} ${subjDisplay} ${unitShort} (${yrSpan}) Past Papers & Mark Schemes in Split View.`)
    ], 158);

    const keywords = [
      `${currShort} ${subjDisplay} ${unitClean} past papers`,
      unitCode ? `${unitCode} past papers` : '',
      unitCode ? `${unitCode} mark scheme` : '',
      unitCode ? `${unitCode} question paper` : '',
      unitCode ? `${unitCode} Jan 2026` : '',
      unitCode ? `${unitCode} June 2025` : '',
      igcseCode ? `${igcseCode} ${unitClean} past papers` : '',
      `${subjDisplay} ${unitClean} mark scheme`,
      'Edexcel split view past papers'
    ].filter(Boolean).join(', ');

    return {
      title,
      description,
      keywords,
      canonicalUrl: unitCanonicalUrl,
      consolidatingCanonical,
      robots,
      h1: `${currShort} ${subjDisplay} — ${unitWithCode} Past Papers (${yrSpan})`,
      subtitle: `${docCount} verified Question Papers, Mark Schemes, and Examiner Reports covering ${yrSpan}. Click any sitting to study side-by-side in Split View.`
    };
  }

  // Subject-level SEO metadata
  if (filterSubject) {
    const curr = filterCurriculum || 'Edexcel IAL';
    const subjWizard = meta?.wizard?.[curr]?.[filterSubject];
    const docCount = subjWizard?.totalFiles || 150;
    const unitNames = Object.keys(subjWizard?.units || {});
    const unitCodes = getUniqueOrderedUnitCodes(unitNames);
    const currentSpecCodes = unitCodes.filter((c) => !LEGACY_IAL_UNIT_CODES.has(c));
    const displayUnitCodes = currentSpecCodes.length > 0 ? currentSpecCodes : unitCodes;
    const igcseCode = curr === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const cov = (curr === 'Edexcel IGCSE' ? meta?.igcseSubjectCoverage?.[filterSubject] : meta?.ialSubjectCoverage?.[filterSubject]) || '2014 – June 2026';
    const hasBooks = subjectHasBooks(curr, filterSubject);

    const fullCodeStr = curr === 'Edexcel IGCSE' && igcseCode
      ? ` (${igcseCode})`
      : displayUnitCodes.length > 0
        ? ` (${displayUnitCodes.slice(0, 6).join(', ')})`
        : '';

    const shortCodeToken = curr === 'Edexcel IGCSE' && igcseCode
      ? igcseCode.split(' / ')[0]
      : formatCodeRangeForTitle(displayUnitCodes, filterSubject === 'Math');
    const shortCodeStr = shortCodeToken ? ` (${shortCodeToken})` : '';

    // Guarantee "Past Papers" in every subject <title> within 62 chars
    const title = pickTitleVariant([
      `${curr} ${subjDisplay}${shortCodeStr} Past Papers & MS | Conceptualist`,
      `${curr} ${subjDisplay}${shortCodeStr} Past Papers | Conceptualist`,
      `${curr} ${subjShort}${shortCodeStr} Past Papers | Conceptualist`,
      `${curr} ${subjDisplay} Past Papers & Mark Schemes | Conceptualist`,
      `${curr.replace('Edexcel ', '')} ${subjDisplay}${shortCodeStr} Past Papers | Conceptualist`,
      `${curr.replace('Edexcel ', '')} ${subjShort}${shortCodeStr} Past Papers | Conceptualist`,
      `${curr} ${subjDisplay} Past Papers | Conceptualist`,
      `${curr} ${subjShort} Past Papers | Conceptualist`,
      `${curr} ${subjDisplay} Past Papers & Mark Schemes`
    ], 62);

    const resourceTail = hasBooks
      ? 'past exam papers, mark schemes, examiner reports & textbooks'
      : 'past exam papers, mark schemes & examiner reports';
    const resourceTailShort = hasBooks
      ? 'past papers, mark schemes & textbooks'
      : 'past papers, mark schemes & examiner reports';

    const description = pickTitleVariant([
      `Browse ${docCount}+ ${curr} ${subjDisplay}${fullCodeStr} ${resourceTail} (${cov}) in Split View.`,
      `Browse ${docCount}+ ${curr} ${subjDisplay}${shortCodeStr} ${resourceTail} (${cov}) in Split View.`,
      `Browse ${docCount}+ ${curr} ${subjDisplay}${shortCodeStr} ${resourceTailShort} (${cov}) in Split View.`,
      fitDescription(`Browse ${docCount}+ ${curr} ${subjDisplay}${shortCodeStr} ${resourceTailShort} (${cov}).`)
    ], 158);

    const keywords = [
      `${curr} ${subjDisplay} past papers`,
      `${curr} ${subjDisplay} mark schemes`,
      `${subjDisplay} Edexcel past papers`,
      ...displayUnitCodes.map(c => `${c} past papers`),
      igcseCode ? `${igcseCode} past papers` : '',
      hasBooks ? `${curr} ${subjDisplay} textbooks pdf` : ''
    ].filter(Boolean).join(', ');

    return {
      title,
      description,
      keywords,
      canonicalUrl,
      robots,
      h1: `${curr} ${subjDisplay}${fullCodeStr} Past Papers & ${hasBooks ? 'Textbooks' : 'Mark Schemes'}`,
      subtitle: `Browse ${docCount} unique examination papers, mark schemes${hasBooks ? ', examiner reports, and textbooks' : ', and examiner reports'} (${cov}) across ${unitNames.length || 'all'} course units.`
    };
  }

  // Curriculum-level SEO metadata
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
      subtitle: `Complete archive across ${ialSubjCount} IAL subjects (${meta?.coverage || 'January 2003 – June 2026'}) with instant side-by-side Question Paper and Mark Scheme Split View.`
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
      description: fitDescription(`Browse all ${uniqueFiles.toLocaleString()}+ Edexcel IAL & IGCSE past papers, mark schemes, examiner reports & textbooks (${meta?.coverage || '2003–2026'}) in Split View.`),
      keywords: 'Edexcel past papers archive, Edexcel IAL past papers, Edexcel IGCSE past papers, mark schemes, examiner reports, split view',
      canonicalUrl,
      robots,
      h1: 'All Edexcel IAL & IGCSE Past Exam Papers',
      subtitle: `Independent study catalog indexing ${uniqueFiles.toLocaleString()}+ unique papers, mark schemes, examiner reports, textbooks, and audio across ${totalFiles.toLocaleString()} archived files.`
    };
  }

  // Default Homepage SEO metadata (front-load head query per seo-title-optimization)
  return {
    title: 'Edexcel IAL & IGCSE Past Papers & Textbooks | Conceptualist',
    description: fitDescription(`Study ${uniqueFiles.toLocaleString()}+ Edexcel IAL & IGCSE past papers, mark schemes, examiner reports & textbooks (2003–2026) in Split View.`),
    keywords: 'Edexcel past papers, Edexcel IAL past papers, Edexcel IGCSE past papers, Conceptualist Systems, WMA11, WCH11, WPH11, WBI11, 4MA1, mark schemes, examiner reports, Edexcel textbooks pdf',
    canonicalUrl: `${SITE_URL}/`,
    robots,
    h1: 'Edexcel IAL & IGCSE Past Exam Papers & Textbooks',
    subtitle: `${uniqueFiles.toLocaleString()}+ unique Question Papers, Mark Schemes, Examiner Reports, and Textbooks across ${totalFiles.toLocaleString()} archived files (${meta?.coverage || 'January 2003 – June 2026'}).`
  };
}
