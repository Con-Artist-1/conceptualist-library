// Dedicated Cambridge International (CAIE) filename, session, component/variant, and unit parser.
// Strictly handles Cambridge AS & A Level (CIE-AL), Cambridge IGCSE (CIE-IGCSE), and Cambridge O Level (CIE-OL).

import {
  CAMBRIDGE_SYLLABUSES,
  resolveCambridgeSyllabus,
  formatCambridgeSubjectName,
  extractSyllabusCodeFromSubject
} from '../data/cambridgeCatalog.js';

const CIE_FILENAME_RE = /(?:^|[\\/])(\d{4})[-_]([smwyg])(\d{2})[-_]([a-z]{2,4})(?:[-_](\d{1,2}|[a-z0-9]{1,4}))?(?:[-_][a-z0-9]+)*\.([a-z0-9]+)$/i;
const CIE_G_PRACTICAL_RE = /(?:^|[\\/])g(\d{2})[-_](qp|ms|sf|in)[-_](\d{1,2})(?:[-_](sf))?\.([a-z0-9]+)$/i;

const CIE_SERIES_MAP = {
  m: { num: 3, full: 'Feb/March' },
  s: { num: 6, full: 'May/June' },
  w: { num: 11, full: 'Oct/Nov' }
};

function expandTwoDigitYear(yyStr) {
  const yy = parseInt(yyStr, 10);
  if (Number.isNaN(yy)) return null;
  return yy >= 90 ? 1900 + yy : 2000 + yy;
}

export function parseCambridgePath(pathStr = '', nameHint = '') {
  const norm = String(pathStr || '').replace(/\\/g, '/');
  const fileName = nameHint || norm.split('/').pop() || '';
  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  let syllabusCode = '';
  let seriesChar = '';
  let year = null;
  let rawDocCode = '';
  let rawComponent = '';

  const mStd = fileName.match(CIE_FILENAME_RE) || norm.match(CIE_FILENAME_RE);
  if (mStd) {
    syllabusCode = mStd[1];
    seriesChar = mStd[2].toLowerCase();
    year = expandTwoDigitYear(mStd[3]);
    rawDocCode = mStd[4].toLowerCase();
    rawComponent = mStd[5] || '';
  } else {
    const mG = fileName.match(CIE_G_PRACTICAL_RE);
    if (mG) {
      const sylFolder = norm.match(/\b(0417|0983|9626)\b/);
      syllabusCode = sylFolder ? sylFolder[1] : '0417';
      seriesChar = 's';
      year = expandTwoDigitYear(mG[1]);
      rawDocCode = (mG[4] || mG[2]).toLowerCase();
      rawComponent = mG[3] || '';
    }
  }

  if (!syllabusCode) {
    // Fallback: extract 4-digit code from folder like "Physics (0625)" or leading digits
    const folderCode = norm.match(/\((\d{4})\)/) || fileName.match(/^(\d{4})[-_\s]/);
    if (folderCode && resolveCambridgeSyllabus(folderCode[1])) {
      syllabusCode = folderCode[1];
    }
  }

  const syllabusEntry = syllabusCode ? resolveCambridgeSyllabus(syllabusCode) : null;
  const canonicalCode = syllabusEntry ? syllabusEntry.code : syllabusCode;

  // Component -> Paper number & Variant digit
  let paperNum = null;
  let variant = '';
  let componentCode = '';
  if (rawComponent && /^\d{1,2}$/.test(rawComponent)) {
    componentCode = rawComponent;
    if (rawComponent.length === 1) {
      paperNum = parseInt(rawComponent, 10);
      variant = '';
    } else if (rawComponent.startsWith('0')) {
      // Zero-padded global single-variant component (e.g. 01, 02, 03)
      paperNum = parseInt(rawComponent[1], 10);
      variant = '';
    } else {
      // Two-digit <Paper><Variant> (11/12/13, 41/42/43, AS Science practicals 31..36)
      paperNum = parseInt(rawComponent[0], 10);
      variant = rawComponent[1];
    }
  }

  return {
    syllabusCode: canonicalCode,
    rawSyllabusCode: syllabusCode,
    syllabusEntry,
    seriesChar,
    year,
    rawDocCode,
    componentCode,
    paperNum,
    variant,
    ext
  };
}

export function detectCambridgeSpec(pathStr = '') {
  const norm = String(pathStr || '').replace(/\\/g, '/');
  if (/\/(?:A-Level|AS[-_\s]*A[-_\s]*Level|CIE-AL)\//i.test(norm) || /^Cambridge\s+AL\s+Books\//i.test(norm)) {
    return 'CIE-AL';
  }
  if (/\/(?:O-Level|O[-_\s]*Level|CIE-OL)\//i.test(norm) || /^Cambridge\s+OL\s+Books\//i.test(norm)) {
    return 'CIE-OL';
  }
  if (/\/(?:IGCSE|CIE-IGCSE)\//i.test(norm) || /^Cambridge\s+IGCSE\s+Books\//i.test(norm)) {
    return 'CIE-IGCSE';
  }
  const parsed = parseCambridgePath(norm);
  if (parsed.syllabusEntry?.spec) return parsed.syllabusEntry.spec;
  return 'CIE-IGCSE';
}

export function detectCambridgeDocType(name = '', pathStr = '') {
  const parsed = parseCambridgePath(pathStr, name);
  const ext = parsed.ext;
  const code = parsed.rawDocCode;
  const combined = `${name} ${pathStr}`;

  if (ext === '.mp3' || ext === 'mp3' || ext === 'wav' || ext === 'm4a' || ext === 'ogg') {
    return 'AUD';
  }
  if (code === 'qp') return 'QP';
  if (code === 'ms') return 'MS';
  if (code === 'er') return 'ER';
  if (code === 'gt') return 'GT';
  if (code === 'in' || code === 'ci' || code === 'tn' || code === 'pm' || code === 'rp') return 'SC';
  if (code === 'sf') {
    if (ext === 'mp3' || ext === 'wav' || /audio|listening/i.test(combined) || parsed.syllabusEntry?.hasAudio) {
      return 'AUD';
    }
    return 'DF';
  }
  if (code === 'qr') {
    return (ext === 'mp3' || ext === 'wav' || ext === 'zip') ? 'AUD' : 'SC';
  }
  if (code === 'sp' || code === 'sm' || code === 'su' || code === 'sy') return 'SAM';

  // Fallback heuristics for non-standard Cambridge filenames
  if (/grade[-_\s]*threshold|(?:^|[^a-z0-9])gt(?:[^a-z0-9]|$)/i.test(combined)) return 'GT';
  if (/examiner[-_\s']*s?[-_\s]*report|(?:^|[^a-z0-9])er(?:[^a-z0-9]|$)/i.test(combined)) return 'ER';
  if (/mark[-_\s]*scheme|(?:^|[^a-z0-9])ms(?:[^a-z0-9]|$)/i.test(combined)) return 'MS';
  if (/question[-_\s]*paper|(?:^|[^a-z0-9])qp(?:[^a-z0-9]|$)/i.test(combined)) return 'QP';
  if (/insert|confidential[-_\s]*instruction|transcript|tapescript|pre[-_\s]*release/i.test(combined)) return 'SC';
  if ((ext === 'zip' || ext === 'rar') && /audio|listening/i.test(combined)) return 'AUD';
  if ((ext === 'zip' || ext === 'rar') && /source[-_\s]*file|data[-_\s]*file|\bsf\b/i.test(combined)) return 'DF';
  if (/specimen|syllabus/i.test(combined)) return 'SAM';

  return null;
}

export function detectCambridgeSubject(pathStr = '') {
  const parsed = parseCambridgePath(pathStr);
  if (parsed.syllabusEntry) {
    return formatCambridgeSubjectName(parsed.syllabusEntry);
  }
  const parts = String(pathStr || '').split(/[\\/]/).filter(Boolean);
  if (parts[0] === 'Past Papers' && parts[1] === 'Cambridge' && parts.length >= 4) {
    const folder = parts[3].trim();
    const codeMatch = folder.match(/(\d{4})/);
    if (codeMatch) {
      const resolved = resolveCambridgeSyllabus(codeMatch[1]);
      if (resolved) return formatCambridgeSubjectName(resolved);
    }
    return folder;
  }
  if (parts[0] === 'Cambridge Books' && parts.length >= 3) {
    const folder = parts[2].trim();
    const codeMatch = folder.match(/(\d{4})/);
    if (codeMatch) {
      const resolved = resolveCambridgeSyllabus(codeMatch[1]);
      if (resolved) return formatCambridgeSubjectName(resolved);
    }
    return folder;
  }
  return null;
}

export function extractCambridgeSessionDate(pathStr = '') {
  const parsed = parseCambridgePath(pathStr);
  if (parsed.year && parsed.seriesChar && CIE_SERIES_MAP[parsed.seriesChar]) {
    const info = CIE_SERIES_MAP[parsed.seriesChar];
    return {
      year: parsed.year,
      monthNum: info.num,
      monthName: info.full,
      sortKey: parsed.year * 100 + info.num,
      label: `${info.full} ${parsed.year}`
    };
  }
  const norm = String(pathStr || '');
  const mFolder = norm.match(/\b(20[0-2]\d|199\d)[/\\_\s-]+(Feb[-_\s/]*March|Feb[-_\s/]*Mar|March|May[-_\s/]*June|May[-_\s/]*Jun|June|Summer|Oct[-_\s/]*Nov|October[-_\s/]*November|November|Winter)\b/i)
    || norm.match(/\b(Feb[-_\s/]*March|Feb[-_\s/]*Mar|March|May[-_\s/]*June|May[-_\s/]*Jun|June|Summer|Oct[-_\s/]*Nov|October[-_\s/]*November|November|Winter)[/\\_\s-]+(20[0-2]\d|199\d)\b/i);
  if (mFolder) {
    const isYearFirst = /^\d{4}$/.test(mFolder[1]);
    const yr = parseInt(isYearFirst ? mFolder[1] : mFolder[2], 10);
    const moTxt = (isYearFirst ? mFolder[2] : mFolder[1]).toLowerCase();
    let info = CIE_SERIES_MAP.s;
    if (/feb|mar/.test(moTxt)) info = CIE_SERIES_MAP.m;
    else if (/oct|nov|win/.test(moTxt)) info = CIE_SERIES_MAP.w;
    return {
      year: yr,
      monthNum: info.num,
      monthName: info.full,
      sortKey: yr * 100 + info.num,
      label: `${info.full} ${yr}`
    };
  }
  return null;
}

export function extractCambridgeYear(pathStr = '') {
  const parsed = parseCambridgePath(pathStr);
  if (parsed.year) return parsed.year;
  const sess = extractCambridgeSessionDate(pathStr);
  if (sess?.year) return sess.year;
  // Exclude 4-digit syllabus codes inside parentheses or leading filename positions (e.g. "2010_s23...")
  const stripped = String(pathStr || '')
    .replace(/\(\d{4}\)/g, '')
    .replace(/(?:^|[\\/])\d{4}_/g, '/');
  const m = stripped.match(/(?:^|[^A-Za-z0-9])(20[0-2]\d|199\d)(?:[^A-Za-z0-9]|$)/);
  return m ? parseInt(m[1], 10) : null;
}

export function getCambridgePaperLabel(syllabusCode, paperNum, year) {
  if (!paperNum) return null;
  const entry = resolveCambridgeSyllabus(syllabusCode) || CAMBRIDGE_SYLLABUSES[syllabusCode];
  if (entry) {
    // Year-aware syllabus renumbering overrides
    if (entry.legacyPre2020Papers && year && year < 2020 && entry.legacyPre2020Papers[paperNum]) {
      return entry.legacyPre2020Papers[paperNum];
    }
    if (entry.legacyPre2016Papers && year && year < 2016 && entry.legacyPre2016Papers[paperNum]) {
      return entry.legacyPre2016Papers[paperNum];
    }
    if (entry.legacyPre2024Papers && year && year < 2024 && entry.legacyPre2024Papers[paperNum]) {
      return entry.legacyPre2024Papers[paperNum];
    }
    if (entry.papers && entry.papers[paperNum]) {
      return entry.papers[paperNum];
    }
  }
  return `Paper ${paperNum}`;
}

export function extractCambridgeUnitInfo(pathStr = '', subject = '') {
  const parsed = parseCambridgePath(pathStr);
  const sylCode = parsed.syllabusCode || extractSyllabusCodeFromSubject(subject);
  const docCode = parsed.rawDocCode;
  // Session-wide Examiner Reports & Grade Thresholds have no individual paper/component
  if ((docCode === 'er' || docCode === 'gt') && !parsed.paperNum) {
    return {
      unitCode: null,
      unitName: null,
      syllabusCode: sylCode || null
    };
  }
  if (parsed.paperNum) {
    const yr = parsed.year || extractCambridgeYear(pathStr);
    const label = getCambridgePaperLabel(sylCode, parsed.paperNum, yr);
    const uCode = sylCode ? `${sylCode}-P${parsed.paperNum}` : `P${parsed.paperNum}`;
    return {
      unitCode: uCode,
      unitName: label || `Paper ${parsed.paperNum}`,
      syllabusCode: sylCode || null
    };
  }
  return {
    unitCode: null,
    unitName: null,
    syllabusCode: sylCode || null
  };
}

export function extractCambridgeVariant(file = {}) {
  const parsed = parseCambridgePath(file.path || '', file.name || '');
  return parsed.variant || '';
}

export function getCambridgeCleanUnitLabel(file = {}) {
  if (file.category && file.category.includes('Books')) return null;
  const parsed = parseCambridgePath(file.path || '', file.name || '');
  const sylCode = file.syllabusCode || parsed.syllabusCode || extractSyllabusCodeFromSubject(file.subject || '');
  let paperNum = parsed.paperNum;
  if (!paperNum && file.unitCode) {
    const m = String(file.unitCode).match(/(?:^|-)P(\d)$/i);
    if (m) paperNum = parseInt(m[1], 10);
  }
  if (!paperNum) return null;
  const yr = file.year || parsed.year || extractCambridgeYear(file.path || '');
  return getCambridgePaperLabel(sylCode, paperNum, yr);
}
