// Shared SEO Routing, Slug Resolution & Metadata Generator
// Used by both the browser React app (src/App.jsx) and build-time SSG (scripts/prerender-seo.js)

export const SITE_URL = 'https://www.conceptualist.uk';

export const IGCSE_SPEC_CODES = {
  'Accounting': '4AC1',
  'Arabic': '4AA1',
  'Bangla': '4BA0',
  'Biology': '4BI1 / 4WBI1',
  'Business': '4BS1',
  'Chemistry': '4CH1 / 4WCH1',
  'Commerce': '4CM1',
  'Computer Science': '4CP0',
  'Economics': '4EC1',
  'English Language A': '4EA1 / 4WEA1',
  'English Language B': '4EB1',
  'English Literature': '4ET1 / 4WET1',
  'French': '4FR1',
  'Further Pure Mathematics': '4PM1',
  'Geography': '4GE1 / 4WGE1',
  'German': '4GN1',
  'Greek': '4GK1',
  'History': '4HI1',
  'Human Biology': '4HB1',
  'Information Technology': '4IT1',
  'Mathematics A': '4MA1 / 4WM1H',
  'Mathematics B': '4MB1',
  'Physics': '4PH1 / 4WPH1',
  'Spanish': '4SP1'
};

export const IAL_MATH_UNIT_CODES = {
  'Pure Mathematics 1 (P1)': 'WMA11',
  'Pure Mathematics 2 (P2)': 'WMA12',
  'Pure Mathematics 3 (P3)': 'WMA13',
  'Pure Mathematics 4 (P4)': 'WMA14',
  'Core Mathematics 12 (C12)': 'WMA01',
  'Core Mathematics 34 (C34)': 'WMA02',
  'Core Mathematics 1 (C1)': '6663',
  'Core Mathematics 2 (C2)': '6664',
  'Core Mathematics 3 (C3)': '6665',
  'Core Mathematics 4 (C4)': '6666',
  'Further Pure 1 (FP1)': 'WFM01',
  'Further Pure 2 (FP2)': 'WFM02',
  'Further Pure 3 (FP3)': 'WFM03',
  'Mechanics 1 (M1)': 'WME01',
  'Mechanics 2 (M2)': 'WME02',
  'Mechanics 3 (M3)': 'WME03',
  'Statistics 1 (S1)': 'WST01',
  'Statistics 2 (S2)': 'WST02',
  'Statistics 3 (S3)': 'WST03',
  'Decision Mathematics 1 (D1)': 'WDM11'
};

export const IAL_SUBJECTS_DEFAULT = [
  'Accounting', 'Arabic', 'Biology', 'Business', 'Chemistry', 'Economics',
  'English Language', 'English Literature', 'French', 'Geography', 'German', 'Greek',
  'History', 'Information Technology', 'Law', 'Math', 'Physics', 'Psychology', 'Spanish'
];

export const IGCSE_SUBJECTS_DEFAULT = [
  'Accounting', 'Bangla', 'Biology', 'Business', 'Chemistry', 'Commerce',
  'Computer Science', 'Economics', 'English Language A', 'English Language B', 'English Literature',
  'Further Pure Mathematics', 'Geography', 'Human Biology', 'Information Technology',
  'Mathematics A', 'Mathematics B', 'Physics'
];

export const DEFAULT_UNIT_LABELS = {
  'Edexcel IAL': {
    'Accounting': [
      'Unit 1: The Accounting System & Costing (WAC11)',
      'Unit 2: Corporate & Management Accounting (WAC12)'
    ],
    'Biology': [
      'Unit 1: Lifestyle, Transport & Health (WBI11)',
      'Unit 2: Cells, Development & Biodiversity (WBI12)',
      'Unit 3: Practical Biology I (WBI13)',
      'Unit 4: Energy, Environment & Immunity (WBI14)',
      'Unit 5: Respiration & Muscles (WBI15)',
      'Unit 6: Practical Biology II (WBI16)'
    ],
    'Business': [
      'Unit 1: Marketing & People (WBS11)',
      'Unit 2: Managing Business Activities (WBS12)',
      'Unit 3: Business Decisions & Strategy (WBS13)',
      'Unit 4: Global Business (WBS14)'
    ],
    'Chemistry': [
      'Unit 1: Structure & Bonding (WCH11)',
      'Unit 2: Energetics & Organics (WCH12)',
      'Unit 3: Practical Chemistry I (WCH13)',
      'Unit 4: Rates & Organic Chemistry (WCH14)',
      'Unit 5: Transition Metals (WCH15)',
      'Unit 6: Practical Chemistry II (WCH16)'
    ],
    'Economics': [
      'Unit 1: Markets in Action (WEC11)',
      'Unit 2: Macroeconomic Performance (WEC12)',
      'Unit 3: Business Behaviour (WEC13)',
      'Unit 4: A Global Perspective (WEC14)'
    ],
    'Information Technology': [
      'IT Unit 1 (WIT11)',
      'IT Unit 2 (WIT12)',
      'IT Unit 3 (WIT13)',
      'IT Unit 4 (WIT14)'
    ],
    'Math': [
      'Core Mathematics 1 (C1)',
      'Core Mathematics 12 (C12)',
      'Core Mathematics 2 (C2)',
      'Core Mathematics 3 (C3)',
      'Core Mathematics 34 (C34)',
      'Core Mathematics 4 (C4)',
      'Decision Mathematics 1 (D1)',
      'Further Pure 1 (FP1)',
      'Further Pure 2 (FP2)',
      'Further Pure 3 (FP3)',
      'Mechanics 1 (M1)',
      'Mechanics 2 (M2)',
      'Mechanics 3 (M3)',
      'Pure Mathematics 1 (P1)',
      'Pure Mathematics 2 (P2)',
      'Pure Mathematics 3 (P3)',
      'Pure Mathematics 4 (P4)',
      'Statistics 1 (S1)',
      'Statistics 2 (S2)',
      'Statistics 3 (S3)'
    ],
    'Physics': [
      'Unit 1: Mechanics & Materials (WPH11)',
      'Unit 2: Waves & Electricity (WPH12)',
      'Unit 3: Practical Physics I (WPH13)',
      'Unit 4: Further Mechanics & Fields (WPH14)',
      'Unit 5: Thermodynamics & Oscillations (WPH15)',
      'Unit 6: Practical Physics II (WPH16)'
    ],
    'Psychology': [
      'Psychology Unit 1 (WPS01)',
      'Psychology Unit 2 (WPS02)',
      'Psychology Unit 3 (WPS03)',
      'Psychology Unit 4 (WPS04)'
    ],
    'Arabic': ['Arabic Unit 1 (WAA01)', 'Arabic Unit 2 (WAA02)'],
    'English Language': [
      'English Language Unit 1 (WEN01)',
      'English Language Unit 2 (WEN02)',
      'English Language Unit 3 (WEN03)',
      'English Language Unit 4 (WEN04)'
    ],
    'English Literature': [
      'English Literature Unit 1 (WET01)',
      'English Literature Unit 2 (WET02)',
      'English Literature Unit 3 (WET03)',
      'English Literature Unit 4 (WET04)'
    ],
    'French': [
      'French Unit 1 (WFR01)',
      'French Unit 2 (WFR02)',
      'French Unit 3 (WFR03)',
      'French Unit 4 (WFR04)'
    ],
    'Geography': [
      'Geography Unit 1 (WGE01)',
      'Geography Unit 2 (WGE02)',
      'Geography Unit 3 (WGE03)',
      'Geography Unit 4 (WGE04)'
    ],
    'German': [
      'German Unit 1 (WGN01)',
      'German Unit 2 (WGN02)',
      'German Unit 3 (WGN03)',
      'German Unit 4 (WGN04)'
    ],
    'Greek': ['Greek Unit 1 (WGK01)', 'Greek Unit 2 (WGK02)'],
    'History': [
      'History Unit 1 (WHI01)',
      'History Unit 2 (WHI02)',
      'History Unit 3 (WHI03)',
      'History Unit 4 (WHI04)'
    ],
    'Law': ['Law Paper 1 (YLA1)', 'Law Paper 2 (YLA2)'],
    'Spanish': [
      'Spanish Unit 1 (WSP01)',
      'Spanish Unit 2 (WSP02)',
      'Spanish Unit 3 (WSP03)',
      'Spanish Unit 4 (WSP04)'
    ]
  },
  'Edexcel IGCSE': {
    'Accounting': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Biology': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Business': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Chemistry': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Economics': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Further Pure Mathematics': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Human Biology': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Information Technology': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Mathematics A': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Physics': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Bangla': ['Paper 1 (P1)'],
    'Commerce': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Computer Science': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'English Language A': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'English Language B': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'English Literature': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)'],
    'Geography': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Mathematics B': ['Paper 1 (P1)', 'Paper 2 (P2)']
  }
};

export function slugify(text) {
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

export function resolveSubjectFromSlug(slug, curriculum, meta) {
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

export function resolveUnitFromSlug(unitSlug, curriculum, subject, meta) {
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
    const paperNumMatch = clean.match(/^p(?:aper)?[-_]?([1-4])$/);
    if (paperNumMatch && label.toLowerCase().includes(`paper ${paperNumMatch[1]}`)) {
      return label;
    }
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
  previewMode = ''
}) {
  if (currentTab === 'about') return '/about';
  if (currentTab === 'changelog') return '/changelog';

  let pathname = '/';
  if (filterDocType === 'Book' && !filterCurriculum && !filterSubject && !filterUnit) {
    pathname = '/textbooks';
  } else if (filterCurriculum || filterSubject) {
    let curr = filterCurriculum;
    if (!curr && filterSubject) {
      const igcseOnly = [
        'Bangla', 'Commerce', 'Computer Science', 'English Language A',
        'English Language B', 'Further Pure Mathematics', 'Human Biology',
        'Mathematics A', 'Mathematics B'
      ];
      curr = igcseOnly.includes(filterSubject) ? 'Edexcel IGCSE' : 'Edexcel IAL';
    }
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
  }

  const params = new URLSearchParams();
  if (filterYear) params.set('year', String(filterYear));
  if (filterDocType && !(pathname === '/textbooks' && filterDocType === 'Book')) {
    params.set('type', filterDocType);
  }
  if (searchQuery && searchQuery.trim()) {
    params.set('q', searchQuery.trim());
  }
  const paperKey = previewFile ? (previewFile.id || previewFile.path || '') : (pendingPaperParam || '');
  if (paperKey) {
    params.set('paper', paperKey);
    if (previewMode) params.set('view', previewMode);
  }

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

const MATH_CODE_PRIORITY = [
  'WMA11', 'WMA12', 'WMA13', 'WMA14',
  'WFM01', 'WFM02', 'WFM03',
  'WME01', 'WME02', 'WME03',
  'WST01', 'WST02', 'WST03',
  'WDM11', 'WMA01', 'WMA02',
  '6663', '6664', '6665', '6666'
];

function getUniqueOrderedUnitCodes(unitNames) {
  const unique = [...new Set(unitNames.map(getUnitCodeFromLabel).filter(Boolean))];
  return unique.sort((a, b) => {
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
  if (isMath && codes.includes('WMA11') && codes.includes('WMA14')) {
    return 'WMA11–WMA14';
  }
  if (codes.length >= 2) {
    const first = codes[0];
    const last = codes[codes.length - 1];
    const m1 = /^([A-Z]+)(\d+)$/.exec(first);
    const m2 = /^([A-Z]+)(\d+)$/.exec(last);
    if (m1 && m2 && m1[1] === m2[1] && parseInt(m2[2], 10) - parseInt(m1[2], 10) === codes.length - 1) {
      return `${first}–${last}`;
    }
  }
  return codes.slice(0, 3).join(', ');
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
  // Collapse "Unit 5: Thermodynamics & Oscillations (WPH15)" -> "Unit 5 (WPH15)" when needed to stay <= 65 chars
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
  return curr === 'Edexcel IGCSE' ? 3040 : 7106;
}

function getArchiveCounts(meta) {
  const uniqueFiles = meta?.uniqueFiles || meta?.totalFiles || 10146;
  const totalFiles = meta?.totalFiles || 13939;
  return { uniqueFiles, totalFiles };
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

export function parseRouteFromLocation(pathname = '/', search = '', meta = null) {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search || '');

  const result = {
    currentTab: 'library',
    filterCurriculum: '',
    filterSubject: '',
    filterUnit: '',
    filterYear: params.get('year') || '',
    filterDocType: params.get('type') || null,
    searchQuery: params.get('q') || '',
    paperParam: params.get('paper') || '',
    viewParam: params.get('view') || '',
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
  if (cleanPath === '/textbooks') {
    result.filterDocType = 'Book';
    result.forceShowTable = true;
    return result;
  }

  const segments = cleanPath.split('/').filter(Boolean);
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
  filterYear = '',
  filterDocType = null,
  searchQuery = '',
  paperParam = '',
  notFound = false,
  meta = null
}) {
  const { uniqueFiles, totalFiles } = getArchiveCounts(meta);
  const hasFacetedQuery = Boolean(
    filterYear ||
    searchQuery ||
    paperParam ||
    (filterDocType && !(filterDocType === 'Book' && !filterCurriculum && !filterSubject && !filterUnit))
  );

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
    filterDocType: filterDocType === 'Book' && !filterCurriculum && !filterSubject ? 'Book' : null
  });
  const canonicalUrl = `${SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const robots = hasFacetedQuery ? 'noindex, follow' : 'index, follow';

  if (currentTab === 'about') {
    return {
      title: 'About Conceptualist Systems | Edexcel IAL & IGCSE Archive',
      description: fitDescription(`Learn about Conceptualist Systems, indexing ${uniqueFiles.toLocaleString()}+ unique Edexcel IAL & IGCSE papers, mark schemes, reports & books (${totalFiles.toLocaleString()} archived files).`),
      keywords: 'Conceptualist Systems, Edexcel past papers, IAL past papers, IGCSE past papers, academic repository, Diavlon, Naz',
      canonicalUrl,
      robots: 'index, follow',
      h1: 'About Conceptualist Systems',
      subtitle: `Open, high-speed access to ${uniqueFiles.toLocaleString()}+ unique Pearson Edexcel IAL and IGCSE resources (${totalFiles.toLocaleString()} total archived files).`
    };
  }

  if (currentTab === 'changelog') {
    return {
      title: 'Site Changelog & Updates | Conceptualist Systems',
      description: fitDescription('Live update history: new 2025–2026 Edexcel past papers, Split View WebPDF optimizations, search improvements, and archive updates.'),
      keywords: 'Conceptualist Systems changelog, Edexcel 2026 past papers, 2025 past papers, split view reader',
      canonicalUrl,
      robots: 'index, follow',
      h1: 'Site Changelog & Update History',
      subtitle: 'Complete log of speed optimizations, new examination series, and reader features.'
    };
  }

  if (filterDocType === 'Book' && !filterCurriculum && !filterSubject) {
    return {
      title: 'Edexcel IAL & IGCSE Textbooks & Solutions PDF | Conceptualist',
      description: fitDescription('Read 71 official Pearson Edexcel IAL and IGCSE (9–1) student textbooks, lab books, and worked solution banks free online in WebPDF reader.'),
      keywords: 'Edexcel IAL textbooks pdf, Edexcel IGCSE textbooks pdf, Edexcel solution bank, Pure Mathematics textbook, Chemistry Physics Biology Edexcel book',
      canonicalUrl,
      robots,
      h1: 'Pearson Edexcel IAL & IGCSE Textbooks & Solution Banks',
      subtitle: 'Official course textbooks, laboratory books, and worked solution manuals across Mathematics, Sciences, Business, Economics, and Humanities.'
    };
  }

  const subjDisplay = formatSubjectName(filterSubject);
  const currShort = filterCurriculum === 'Edexcel IGCSE' ? 'Edexcel IGCSE' : filterCurriculum === 'Edexcel IAL' ? 'Edexcel IAL' : 'Pearson Edexcel';

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

    const unitObj = meta?.wizard?.[filterCurriculum || 'Edexcel IAL']?.[filterSubject]?.units?.[filterUnit];
    const docCount = unitObj?.count || 60;
    const years = unitObj?.years || [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019];
    const minYr = years[years.length - 1] || 2014;
    const maxYr = years[0] || 2026;
    const yrSpan = `${minYr}–${maxYr}`;
    const igcseTitleCode = igcseCode ? ` (${igcseCode.split(' / ')[0]})` : '';

    const title = pickTitleVariant([
      `${currShort} ${subjDisplay} ${unitWithCode} Past Papers | Conceptualist`,
      `${currShort} ${subjDisplay} ${unitShort}${igcseTitleCode} Papers | Conceptualist`,
      `${currShort} ${subjDisplay} ${unitShort} | Conceptualist`,
      `${currShort.replace('Edexcel ', '')} ${subjDisplay} ${unitShort} | Conceptualist`
    ], 65);

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
      canonicalUrl,
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
    const igcseCode = curr === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const cov = (curr === 'Edexcel IGCSE' ? meta?.igcseSubjectCoverage?.[filterSubject] : meta?.ialSubjectCoverage?.[filterSubject]) || '2014 – June 2026';

    const fullCodeStr = curr === 'Edexcel IGCSE' && igcseCode
      ? ` (${igcseCode})`
      : unitCodes.length > 0
        ? ` (${unitCodes.slice(0, 6).join(', ')})`
        : '';

    const shortCodeToken = curr === 'Edexcel IGCSE' && igcseCode
      ? igcseCode.split(' / ')[0]
      : formatCodeRangeForTitle(unitCodes, filterSubject === 'Math');
    const shortCodeStr = shortCodeToken ? ` (${shortCodeToken})` : '';

    const title = pickTitleVariant([
      `${curr} ${subjDisplay}${shortCodeStr} Past Papers & MS | Conceptualist`,
      `${curr} ${subjDisplay}${shortCodeStr} Past Papers | Conceptualist`,
      `${curr} ${subjDisplay} Past Papers & Mark Schemes | Conceptualist`,
      `${curr.replace('Edexcel ', '')} ${subjDisplay}${shortCodeStr} Past Papers | Conceptualist`,
      `${curr.replace('Edexcel ', '')} ${subjDisplay}${shortCodeStr} Papers | Conceptualist`,
      `${curr} ${subjDisplay} Past Papers | Conceptualist`
    ], 65);

    const description = pickTitleVariant([
      `Browse ${docCount}+ ${curr} ${subjDisplay}${fullCodeStr} past exam papers, mark schemes, examiner reports & textbooks (${cov}) in Split View.`,
      `Browse ${docCount}+ ${curr} ${subjDisplay}${shortCodeStr} past exam papers, mark schemes, examiner reports & textbooks (${cov}) in Split View.`,
      `Browse ${docCount}+ ${curr} ${subjDisplay}${shortCodeStr} past papers, mark schemes & examiner reports (${cov}) in Split View.`,
      fitDescription(`Browse ${docCount}+ ${curr} ${subjDisplay}${shortCodeStr} past papers, mark schemes & textbooks (${cov}).`)
    ], 158);

    const keywords = [
      `${curr} ${subjDisplay} past papers`,
      `${curr} ${subjDisplay} mark schemes`,
      `${subjDisplay} Edexcel past papers`,
      ...unitCodes.map(c => `${c} past papers`),
      igcseCode ? `${igcseCode} past papers` : '',
      `${curr} ${subjDisplay} textbooks pdf`
    ].filter(Boolean).join(', ');

    return {
      title,
      description,
      keywords,
      canonicalUrl,
      robots,
      h1: `${curr} ${subjDisplay}${fullCodeStr} Past Papers & Resources`,
      subtitle: `Browse ${docCount} unique examination papers, mark schemes, examiner reports, and textbooks (${cov}) across ${unitNames.length || 'all'} course units.`
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
      h1: 'Pearson Edexcel International A-Level (IAL) Past Papers & Textbooks',
      subtitle: `Complete archive across ${ialSubjCount} IAL subjects (${meta?.coverage || 'January 2003 – June 2026'}) with instant side-by-side Question Paper and Mark Scheme Split View.`
    };
  }

  if (filterCurriculum === 'Edexcel IGCSE') {
    const igcseCount = getCurriculumUniqueCount(meta, 'Edexcel IGCSE');
    const igcseSubjCount = meta?.igcseSubjects?.length || 18;
    return {
      title: 'Edexcel IGCSE Past Papers & Mark Schemes (9–1) | Conceptualist',
      description: fitDescription(`Browse ${igcseCount.toLocaleString()}+ Edexcel IGCSE (9–1 & Modular) past papers, mark schemes, examiner reports & textbooks across ${igcseSubjCount} subjects (4MA1, 4PH1, 4CH1, 4BI1).`),
      keywords: 'Edexcel IGCSE past papers, International GCSE Edexcel past papers, 4MA1, 4PH1, 4CH1, 4BI1, Edexcel IGCSE Modular past papers, Regional 1R 2R past papers',
      canonicalUrl,
      robots,
      h1: 'Pearson Edexcel International GCSE (IGCSE 9–1) Past Papers & Textbooks',
      subtitle: `Complete archive across ${igcseSubjCount} IGCSE subjects including Foundation, Higher, Regional (R), and Modular series with instant Split View.`
    };
  }

  // Default Homepage SEO metadata
  return {
    title: 'Conceptualist Systems | Edexcel IAL & IGCSE Past Papers',
    description: fitDescription(`Study ${uniqueFiles.toLocaleString()}+ unique Edexcel IAL & IGCSE past papers, mark schemes, examiner reports & textbooks (${meta?.coverage || '2003–2026'}) side-by-side in Split View.`),
    keywords: 'Edexcel past papers, Edexcel IAL past papers, Edexcel IGCSE past papers, Conceptualist Systems, WMA11, WCH11, WPH11, WBI11, 4MA1, mark schemes, examiner reports, Edexcel textbooks pdf',
    canonicalUrl: `${SITE_URL}/`,
    robots,
    h1: 'Pearson Edexcel IAL & IGCSE Past Exam Papers & Textbooks',
    subtitle: `${uniqueFiles.toLocaleString()}+ unique Question Papers, Mark Schemes, Examiner Reports, and Textbooks across ${totalFiles.toLocaleString()} archived files (${meta?.coverage || 'January 2003 – June 2026'}).`
  };
}

export function buildJsonLd({
  currentTab = 'library',
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  seo,
  meta = null
}) {
  const { uniqueFiles, totalFiles } = getArchiveCounts(meta);
  const breadcrumbs = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Library Home',
      item: `${SITE_URL}/`
    }
  ];

  if (currentTab === 'about') {
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'About', item: `${SITE_URL}/about` });
  } else if (currentTab === 'changelog') {
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'Changelog', item: `${SITE_URL}/changelog` });
  } else {
    if (filterCurriculum) {
      const currSlug = getCurriculumSlug(filterCurriculum);
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: filterCurriculum,
        item: `${SITE_URL}/${currSlug}`
      });
    }
    if (filterSubject) {
      const currSlug = getCurriculumSlug(filterCurriculum || 'Edexcel IAL');
      const subjSlug = getSubjectSlug(filterSubject);
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: `${filterCurriculum || 'Edexcel IAL'} ${formatSubjectName(filterSubject)}`,
        item: `${SITE_URL}/${currSlug}/${subjSlug}`
      });
    }
    if (filterSubject && filterUnit) {
      const currSlug = getCurriculumSlug(filterCurriculum || 'Edexcel IAL');
      const subjSlug = getSubjectSlug(filterSubject);
      const unitSlug = getUnitSlug(filterUnit);
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: filterUnit,
        item: `${SITE_URL}/${currSlug}/${subjSlug}/${unitSlug}`
      });
    }
  }

  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'Conceptualist Systems — Edexcel Past Papers & Textbooks Library',
      alternateName: ['Conceptualist Systems', 'Conceptualist Edexcel Library'],
      description: `High-speed academic repository indexing ${uniqueFiles.toLocaleString()}+ unique Pearson Edexcel IAL and IGCSE past exam papers, mark schemes, examiner reports, and textbooks (${totalFiles.toLocaleString()} archived files).`,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/?q={search_term_string}`
        },
        'query-input': 'required name=search_term_string'
      }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${seo.canonicalUrl}#breadcrumb`,
      itemListElement: breadcrumbs
    },
    {
      '@type': 'CollectionPage',
      '@id': `${seo.canonicalUrl}#webpage`,
      url: seo.canonicalUrl,
      name: seo.title,
      headline: seo.h1,
      description: seo.description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      breadcrumb: { '@id': `${seo.canonicalUrl}#breadcrumb` },
      about: {
        '@type': 'EducationalOrganization',
        name: 'Pearson Edexcel International Examinations (IAL & IGCSE)'
      }
    }
  ];

  // Add ItemList of units when on a Subject page
  if (filterSubject && !filterUnit && meta?.wizard) {
    const curr = filterCurriculum || 'Edexcel IAL';
    const currSlug = getCurriculumSlug(curr);
    const subjSlug = getSubjectSlug(filterSubject);
    const unitsObj = meta.wizard[curr]?.[filterSubject]?.units || {};
    const unitKeys = Object.keys(unitsObj);
    if (unitKeys.length > 0) {
      graph.push({
        '@type': 'ItemList',
        name: `${curr} ${formatSubjectName(filterSubject)} Units & Examination Papers`,
        numberOfItems: unitKeys.length,
        itemListElement: unitKeys.map((u, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${curr} ${formatSubjectName(filterSubject)} — ${u}`,
          url: `${SITE_URL}/${currSlug}/${subjSlug}/${getUnitSlug(u)}`
        }))
      });
    }
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}
