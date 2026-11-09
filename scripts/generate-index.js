import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_DIR = path.resolve(__dirname, '..', '..'); // 'e:\The Library'
const EXCLUDE_DIRS = ['search-app', 'node_modules', '.git', '.scripts', 'ScriptFiles', '.vercel', 'dist'];
const ALLOWED_ROOT_DIRS = ['Past Papers', 'IAL Books', 'IGCSE Books'];

const UNIT_FRIENDLY_NAMES = {
  // Math
  'WME01': 'Mechanics 1 (WME01)',
  'WME02': 'Mechanics 2 (WME02)',
  'WME03': 'Mechanics 3 (WME03)',
  'WMA11': 'Pure Mathematics 1 (WMA11)',
  'WMA12': 'Pure Mathematics 2 (WMA12)',
  'WMA13': 'Pure Mathematics 3 (WMA13)',
  'WMA14': 'Pure Mathematics 4 (WMA14)',
  'WMA01': 'Core Mathematics 12 (WMA01)',
  'WMA02': 'Core Mathematics 34 (WMA02)',
  'C1': 'Core Mathematics 1 (C1)',
  'C2': 'Core Mathematics 2 (C2)',
  'C3': 'Core Mathematics 3 (C3)',
  'C4': 'Core Mathematics 4 (C4)',
  'WST01': 'Statistics 1 (WST01)',
  'WST02': 'Statistics 2 (WST02)',
  'WST03': 'Statistics 3 (WST03)',
  'WFM01': 'Further Pure 1 (WFM01)',
  'WFM02': 'Further Pure 2 (WFM02)',
  'WFM03': 'Further Pure 3 (WFM03)',
  'WDM01': 'Decision Mathematics 1 (WDM01)',
  'WDM11': 'Decision Mathematics 1 (WDM11)',
  // Sciences
  'WBI11': 'Biology Unit 1 (WBI11)',
  'WBI12': 'Biology Unit 2 (WBI12)',
  'WBI13': 'Biology Unit 3 (WBI13)',
  'WBI14': 'Biology Unit 4 (WBI14)',
  'WBI15': 'Biology Unit 5 (WBI15)',
  'WBI16': 'Biology Unit 6 (WBI16)',
  '6BI01': 'Biology Unit 1 (WBI11)',
  '6BI02': 'Biology Unit 2 (WBI12)',
  '6BI03': 'Biology Unit 3 (WBI13)',
  '6BI04': 'Biology Unit 4 (WBI14)',
  '6BI05': 'Biology Unit 5 (WBI15)',
  '6BI06': 'Biology Unit 6 (WBI16)',
  'WCH11': 'Chemistry Unit 1 (WCH11)',
  'WCH12': 'Chemistry Unit 2 (WCH12)',
  'WCH13': 'Chemistry Unit 3 (WCH13)',
  'WCH14': 'Chemistry Unit 4 (WCH14)',
  'WCH15': 'Chemistry Unit 5 (WCH15)',
  'WCH16': 'Chemistry Unit 6 (WCH16)',
  'WPH11': 'Physics Unit 1 (WPH11)',
  'WPH12': 'Physics Unit 2 (WPH12)',
  'WPH13': 'Physics Unit 3 (WPH13)',
  'WPH14': 'Physics Unit 4 (WPH14)',
  'WPH15': 'Physics Unit 5 (WPH15)',
  'WPH16': 'Physics Unit 6 (WPH16)',
  'WPH07': 'Physics Practical Investigation (WPH07)',
  // Business / Econ / Acc / Law
  'WBS11': 'Business Unit 1 (WBS11)',
  'WBS12': 'Business Unit 2 (WBS12)',
  'WBS13': 'Business Unit 3 (WBS13)',
  'WBS14': 'Business Unit 4 (WBS14)',
  'WEC11': 'Economics Unit 1 (WEC11)',
  'WEC12': 'Economics Unit 2 (WEC12)',
  'WEC13': 'Economics Unit 3 (WEC13)',
  'WEC14': 'Economics Unit 4 (WEC14)',
  'WAC11': 'Accounting Unit 1 (WAC11)',
  'WAC12': 'Accounting Unit 2 (WAC12)',
  'YLA1': 'Law Paper 1 (YLA1)',
  'YLA2': 'Law Paper 2 (YLA2)',
  'YLA0': 'Law Paper 1 (YLA1)',
  // Humanities / Languages / IT
  'WPS01': 'Psychology Unit 1 (WPS01)',
  'WPS02': 'Psychology Unit 2 (WPS02)',
  'WPS03': 'Psychology Unit 3 (WPS03)',
  'WPS04': 'Psychology Unit 4 (WPS04)',
  'WHI01': 'History Unit 1 (WHI01)',
  'WHI02': 'History Unit 2 (WHI02)',
  'WHI03': 'History Unit 3 (WHI03)',
  'WHI04': 'History Unit 4 (WHI04)',
  'WGE01': 'Geography Unit 1 (WGE01)',
  'WGE02': 'Geography Unit 2 (WGE02)',
  'WGE03': 'Geography Unit 3 (WGE03)',
  'WGE04': 'Geography Unit 4 (WGE04)',
  'WIT11': 'IT Unit 1 (WIT11)',
  'WIT12': 'IT Unit 2 (WIT12)',
  'WIT13': 'IT Unit 3 (WIT13)',
  'WIT14': 'IT Unit 4 (WIT14)',
  'WEN01': 'English Language Unit 1 (WEN01)',
  'WEN02': 'English Language Unit 2 (WEN02)',
  'WEN03': 'English Language Unit 3 (WEN03)',
  'WEN04': 'English Language Unit 4 (WEN04)',
  'WET01': 'English Literature Unit 1 (WET01)',
  'WET02': 'English Literature Unit 2 (WET02)',
  'WET03': 'English Literature Unit 3 (WET03)',
  'WET04': 'English Literature Unit 4 (WET04)',
  'WAA01': 'Arabic Unit 1 (WAA01)',
  'WAA02': 'Arabic Unit 2 (WAA02)',
  'WFR01': 'French Unit 1 (WFR01)',
  'WFR02': 'French Unit 2 (WFR02)',
  'WFR03': 'French Unit 3 (WFR03)',
  'WFR04': 'French Unit 4 (WFR04)',
  'WGN01': 'German Unit 1 (WGN01)',
  'WGN02': 'German Unit 2 (WGN02)',
  'WGN03': 'German Unit 3 (WGN03)',
  'WGN04': 'German Unit 4 (WGN04)',
  'WGK01': 'Greek Unit 1 (WGK01)',
  'WGK02': 'Greek Unit 2 (WGK02)',
  'WSP01': 'Spanish Unit 1 (WSP01)',
  'WSP02': 'Spanish Unit 2 (WSP02)',
  'WSP03': 'Spanish Unit 3 (WSP03)',
  'WSP04': 'Spanish Unit 4 (WSP04)',
};

// Normalize legacy/variant W-codes to canonical unit codes
const CODE_ALIAS_MAP = {
  'WMA11R': 'WMA11',
  'WMA12R': 'WMA12',
  'WMA13R': 'WMA13',
  'WMA14R': 'WMA14',
  'WDM01': 'WDM11',
  'YLA0': 'YLA1',
  '6BI01': 'WBI11',
  '6BI02': 'WBI12',
  '6BI03': 'WBI13',
  '6BI04': 'WBI14',
  '6BI05': 'WBI15',
  '6BI06': 'WBI16',
};

// Map (Subject, UnitNumber 1..6) -> Canonical IAL Unit Code
const SUBJECT_UNIT_CODE_MAP = {
  'Accounting': { 1: 'WAC11', 2: 'WAC12' },
  'Arabic': { 1: 'WAA01', 2: 'WAA02' },
  'Biology': { 1: 'WBI11', 2: 'WBI12', 3: 'WBI13', 4: 'WBI14', 5: 'WBI15', 6: 'WBI16' },
  'Business': { 1: 'WBS11', 2: 'WBS12', 3: 'WBS13', 4: 'WBS14' },
  'Chemistry': { 1: 'WCH11', 2: 'WCH12', 3: 'WCH13', 4: 'WCH14', 5: 'WCH15', 6: 'WCH16' },
  'Economics': { 1: 'WEC11', 2: 'WEC12', 3: 'WEC13', 4: 'WEC14' },
  'English Language': { 1: 'WEN01', 2: 'WEN02', 3: 'WEN03', 4: 'WEN04' },
  'English Literature': { 1: 'WET01', 2: 'WET02', 3: 'WET03', 4: 'WET04' },
  'French': { 1: 'WFR01', 2: 'WFR02', 3: 'WFR03', 4: 'WFR04' },
  'Geography': { 1: 'WGE01', 2: 'WGE02', 3: 'WGE03', 4: 'WGE04' },
  'German': { 1: 'WGN01', 2: 'WGN02', 3: 'WGN03', 4: 'WGN04' },
  'Greek': { 1: 'WGK01', 2: 'WGK02' },
  'History': { 1: 'WHI01', 2: 'WHI02', 3: 'WHI03', 4: 'WHI04' },
  'Information Technology': { 1: 'WIT11', 2: 'WIT12', 3: 'WIT13', 4: 'WIT14' },
  'Law': { 1: 'YLA1', 2: 'YLA2' },
  'Physics': { 1: 'WPH11', 2: 'WPH12', 3: 'WPH13', 4: 'WPH14', 5: 'WPH15', 6: 'WPH16' },
  'Psychology': { 1: 'WPS01', 2: 'WPS02', 3: 'WPS03', 4: 'WPS04' },
  'Spanish': { 1: 'WSP01', 2: 'WSP02', 3: 'WSP03', 4: 'WSP04' }
};

const MATH_UNIT_CODE_MAP = {
  'P1': 'WMA11', 'P1A': 'WMA11', 'P1R': 'WMA11',
  'P2': 'WMA12', 'P2A': 'WMA12', 'P2R': 'WMA12',
  'P3': 'WMA13', 'P3A': 'WMA13', 'P3R': 'WMA13',
  'P4': 'WMA14', 'P4A': 'WMA14', 'P4R': 'WMA14',
  'C12': 'WMA01', 'C12A': 'WMA01', 'C12R': 'WMA01',
  'C34': 'WMA02', 'C34A': 'WMA02', 'C34R': 'WMA02',
  'C1': 'C1', 'C1R': 'C1', 'C1A': 'C1',
  'C2': 'C2', 'C2R': 'C2', 'C2A': 'C2',
  'C3': 'C3', 'C3R': 'C3', 'C3A': 'C3',
  'C4': 'C4', 'C4R': 'C4', 'C4A': 'C4',
  'M1': 'WME01', 'M1A': 'WME01', 'M1R': 'WME01',
  'M2': 'WME02', 'M2A': 'WME02', 'M2R': 'WME02',
  'M3': 'WME03', 'M3A': 'WME03', 'M3R': 'WME03',
  'S1': 'WST01', 'S1A': 'WST01', 'S1R': 'WST01',
  'S2': 'WST02', 'S2A': 'WST02', 'S2R': 'WST02',
  'S3': 'WST03', 'S3A': 'WST03', 'S3R': 'WST03',
  'FP1': 'WFM01', 'FP1A': 'WFM01', 'F1': 'WFM01', 'F1A': 'WFM01',
  'FP2': 'WFM02', 'FP2A': 'WFM02', 'F2': 'WFM02', 'F2A': 'WFM02',
  'FP3': 'WFM03', 'FP3A': 'WFM03', 'F3': 'WFM03', 'F3A': 'WFM03',
  'D1': 'WDM11', 'D1A': 'WDM11', 'D1R': 'WDM11'
};

const MONTH_MAP = {
  'jan': { num: 1, full: 'January' },
  'january': { num: 1, full: 'January' },
  'feb': { num: 2, full: 'February' },
  'february': { num: 2, full: 'February' },
  'mar': { num: 3, full: 'March' },
  'march': { num: 3, full: 'March' },
  'apr': { num: 4, full: 'April' },
  'april': { num: 4, full: 'April' },
  'may': { num: 6, full: 'June' },
  'may-june': { num: 6, full: 'June' },
  'mayjune': { num: 6, full: 'June' },
  'may-jun': { num: 6, full: 'June' },
  'jun': { num: 6, full: 'June' },
  'june': { num: 6, full: 'June' },
  'summer': { num: 6, full: 'June' },
  'jul': { num: 7, full: 'July' },
  'july': { num: 7, full: 'July' },
  'aug': { num: 8, full: 'August' },
  'august': { num: 8, full: 'August' },
  'sep': { num: 9, full: 'September' },
  'september': { num: 9, full: 'September' },
  'oct': { num: 10, full: 'October' },
  'oct-nov': { num: 10, full: 'October' },
  'octnov': { num: 10, full: 'October' },
  'october': { num: 10, full: 'October' },
  'nov': { num: 11, full: 'November' },
  'november': { num: 11, full: 'November' },
  'novemeber': { num: 11, full: 'November' },
  'dec': { num: 12, full: 'December' },
  'december': { num: 12, full: 'December' }
};

const CATEGORY_PAST_PAPERS = 'Past Papers';
const CATEGORY_BOOKS = 'IAL Books';
const CATEGORY_IGCSE = 'IGCSE Books';

function detectDocType(name, pathStr) {
  const ext = path.extname(name).toLowerCase();
  const combined = `${name} ${pathStr}`;

  // Audio recordings (.mp3, .wav, or Audio/recording zip archives)
  if (ext === '.mp3' || ext === '.wav' || /\b(?:audio|recording)\b/i.test(name)) {
    return 'AUD';
  }

  // Data files for IT / ICT / Computer Science (.zip with DF / Data)
  if (ext === '.zip' || ext === '.rar') {
    if (/(?:^|[^a-z0-9])df(?:[^a-z0-9]|$)|data[-_\s]*files?|p2[-_\s]*data/i.test(combined)) {
      return 'DF';
    }
    if (/solution/i.test(combined)) {
      return 'SOL';
    }
  }

  // Standard Past Paper types (QP, MS, ER)
  if (/question[-_\s]?paper|(?:^|[^a-z0-9])qp(?:[^a-z0-9]|\d|$)|[-_]que[-_.]/i.test(combined)) return 'QP';
  if (/mark[-_\s]?scheme|(?:^|[^a-z0-9])ms(?:[^a-z0-9]|\d|$)|[-_](?:rms|msc|eams)[-_.]/i.test(combined)) return 'MS';
  if (/examiner[-_\s]?report|(?:^|[^a-z0-9])er(?:[^a-z0-9]|\d|$)|[-_]pef(?:[-_.]|$)/i.test(combined)) return 'ER';

  // Scientific articles, source booklets, transcripts, SAMs
  if (/(?:^|[^a-z0-9])sc(?:[^a-z0-9]|$)|scientific[-_\s]?article|transcript/i.test(combined)) return 'SC';
  if (/(?:^|[^a-z0-9])sams?(?:[^a-z0-9]|$)|sample[-_\s]?assessment|specimen|mock|syllabus|\bgce\b/i.test(combined)) return 'SAM';

  return null;
}

const SUBJECT_FOLDER_NORMALIZER = {
  'accounting': 'Accounting',
  'arabic': 'Arabic',
  'bangla': 'Bangla',
  'biology': 'Biology',
  'human biology': 'Human Biology',
  'business': 'Business',
  'business studies': 'Business',
  'chemistry': 'Chemistry',
  'commerce': 'Commerce',
  'computer science': 'Computer Science',
  'economics': 'Economics',
  'english language': 'English Language',
  'english language a': 'English Language A',
  'english language b': 'English Language B',
  'english literature': 'English Literature',
  'french': 'French',
  'further pure mathematics': 'Further Pure Mathematics',
  'further pure maths': 'Further Pure Mathematics',
  'geography': 'Geography',
  'german': 'German',
  'greek': 'Greek',
  'history': 'History',
  'information technology': 'Information Technology',
  'it': 'Information Technology',
  'ict': 'Information Technology',
  'law': 'Law',
  'math': 'Math',
  'mathematics': 'Math',
  'maths': 'Math',
  'mathematics a': 'Mathematics A',
  'mathematics b': 'Mathematics B',
  'physics': 'Physics',
  'psychology': 'Psychology',
  'spanish': 'Spanish'
};

function detectSubject(pathStr) {
  const parts = pathStr.split(/[\\/]/).filter(Boolean);
  if (parts[0] === 'Past Papers' && parts.length >= 3) {
    const rawSubj = parts[2].toLowerCase().trim();
    if (SUBJECT_FOLDER_NORMALIZER[rawSubj]) {
      return SUBJECT_FOLDER_NORMALIZER[rawSubj];
    }
  }
  if ((parts[0] === 'IAL Books' || parts[0] === 'IGCSE Books') && parts.length >= 2) {
    const rawSubj = parts[1].toLowerCase().trim();
    if (parts[0] === 'IGCSE Books' && (rawSubj === 'maths' || rawSubj === 'math' || rawSubj === 'mathematics')) {
      return 'Mathematics A';
    }
    if (SUBJECT_FOLDER_NORMALIZER[rawSubj]) {
      return SUBJECT_FOLDER_NORMALIZER[rawSubj];
    }
  }

  const lower = pathStr.toLowerCase();
  const orderedSubjects = [
    ['human biology', 'Human Biology'],
    ['further pure mathematics', 'Further Pure Mathematics'],
    ['further pure maths', 'Further Pure Mathematics'],
    ['english language a', 'English Language A'],
    ['english language b', 'English Language B'],
    ['english language', 'English Language'],
    ['english literature', 'English Literature'],
    ['information technology', 'Information Technology'],
    ['computer science', 'Computer Science'],
    ['business studies', 'Business'],
    ['mathematics a', 'Mathematics A'],
    ['mathematics b', 'Mathematics B'],
    ['accounting', 'Accounting'],
    ['arabic', 'Arabic'],
    ['bangla', 'Bangla'],
    ['biology', 'Biology'],
    ['business', 'Business'],
    ['chemistry', 'Chemistry'],
    ['commerce', 'Commerce'],
    ['economics', 'Economics'],
    ['french', 'French'],
    ['geography', 'Geography'],
    ['german', 'German'],
    ['greek', 'Greek'],
    ['history', 'History'],
    ['law', 'Law'],
    ['physics', 'Physics'],
    ['psychology', 'Psychology'],
    ['spanish', 'Spanish'],
    ['math', 'Math']
  ];
  for (const [needle, canonical] of orderedSubjects) {
    if (lower.includes(needle)) return canonical;
  }
  return null;
}

function extractYear(pathStr) {
  const match = pathStr.match(/\b(20[0-2]\d|199\d)\b/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function extractSessionDate(pathStr) {
  const monthPattern = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May(?:-June|June|-Jun)?|Jun(?:e)?|Summer|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:-Nov|Nov|ober)?|Nov(?:ember|emeber)?|Dec(?:ember)?)';
  const r1 = new RegExp(`\\b(20[0-2]\\d|199\\d)[-_\\s\\/]+${monthPattern}\\b`, 'i');
  const m1 = pathStr.match(r1);
  if (m1) {
    const yr = parseInt(m1[1], 10);
    const moKey = m1[2].toLowerCase().replace(/\s+/g, '-');
    const moInfo = MONTH_MAP[moKey] || MONTH_MAP[moKey.slice(0, 3)];
    if (moInfo) {
      return { year: yr, monthNum: moInfo.num, monthName: moInfo.full, sortKey: yr * 100 + moInfo.num, label: `${moInfo.full} ${yr}` };
    }
  }
  const r2 = new RegExp(`\\b${monthPattern}[-_\\s\\/]+(20[0-2]\\d|199\\d)\\b`, 'i');
  const m2 = pathStr.match(r2);
  if (m2) {
    const yr = parseInt(m2[2], 10);
    const moKey = m2[1].toLowerCase().replace(/\s+/g, '-');
    const moInfo = MONTH_MAP[moKey] || MONTH_MAP[moKey.slice(0, 3)];
    if (moInfo) {
      return { year: yr, monthNum: moInfo.num, monthName: moInfo.full, sortKey: yr * 100 + moInfo.num, label: `${moInfo.full} ${yr}` };
    }
  }
  return null;
}

function normalizeCode(rawCode) {
  const upper = rawCode.toUpperCase();
  return CODE_ALIAS_MAP[upper] || upper;
}

function extractUnitInfo(pathStr, subject, spec) {
  // 1. Explicit parenthesized code e.g. (WMA11), (WAC11), (WMA11R)
  const parenMatch = pathStr.match(/\(([W6Y][A-Z0-9]{3,5})\)/i);
  if (parenMatch) {
    const code = normalizeCode(parenMatch[1]);
    return {
      unitCode: code,
      unitName: UNIT_FRIENDLY_NAMES[code] || `Unit ${code}`
    };
  }

  // 2. Explicit W-code / YLA-code / 6-code in filename or path
  const codeMatch = pathStr.match(/(?:^|[^A-Z0-9])(W[A-Z]{2}\d{2}R?|YLA\d|6[0-9]{3}|6[A-Z]{2}\d{2})(?:[^A-Z0-9]|$)/i);
  if (codeMatch) {
    const code = normalizeCode(codeMatch[1]);
    return {
      unitCode: code,
      unitName: UNIT_FRIENDLY_NAMES[code] || `Unit ${code}`
    };
  }

  // 3. IAL Math shorthand (P1..P4, C12, C34, C1..C4, M1..M3, S1..S3, FP1..FP3, F1..F3, D1)
  if (subject === 'Math' && spec === 'IAL') {
    const mathMatch = pathStr.match(/(?:^|[^A-Z0-9])(P[1-4][A-Z]?|C12[A-Z]?|C34[A-Z]?|C[1-4][A-Z]?|M[1-3][A-Z]?|S[1-3][A-Z]?|FP[1-3][A-Z]?|F[1-3][A-Z]?|D1[A-Z]?)(?:[^A-Z0-9]|$)/i);
    if (mathMatch) {
      const token = mathMatch[1].toUpperCase();
      const mappedCode = MATH_UNIT_CODE_MAP[token] || MATH_UNIT_CODE_MAP[token.replace(/[AR]$/, '')];
      if (mappedCode) {
        return {
          unitCode: mappedCode,
          unitName: UNIT_FRIENDLY_NAMES[mappedCode] || `Unit ${mappedCode}`
        };
      }
    }
  }

  // 4. IAL Unit 1..6 shorthand (U1..U6, Unit 1..6, Audio U2U4, ER 1..6, QP 1..6, MS 1..6)
  if (spec === 'IAL') {
    const uMatch = pathStr.match(/(?:^|[^A-Z0-9])(?:U([1-6])[A-Z]?|Unit[-_\s]*([1-6])|(?:QP|MS|ER|Transcript)[-_\s]+U?([1-6])|Audio[-_\s]+U([1-6]))(?:[^A-Z0-9]|$)/i);
    if (uMatch) {
      const uNum = parseInt(uMatch[1] || uMatch[2] || uMatch[3] || uMatch[4], 10);
      const subjMap = SUBJECT_UNIT_CODE_MAP[subject];
      const mappedCode = subjMap ? subjMap[uNum] : null;
      if (mappedCode) {
        return {
          unitCode: mappedCode,
          unitName: UNIT_FRIENDLY_NAMES[mappedCode] || `Unit ${uNum} (${mappedCode})`
        };
      }
      return {
        unitCode: `U${uNum}`,
        unitName: `Unit ${uNum}`
      };
    }

    if (subject === 'Accounting' || subject === 'Law') {
      const pMatch = pathStr.match(/(?:^|[^A-Z0-9])(?:P([1-2])[A-Z]?|Paper[-_\s]*([1-2])[A-Z]?)(?:[^A-Z0-9]|$)/i);
      if (pMatch) {
        const pNum = parseInt(pMatch[1] || pMatch[2], 10);
        const mappedCode = SUBJECT_UNIT_CODE_MAP[subject]?.[pNum];
        if (mappedCode) {
          return {
            unitCode: mappedCode,
            unitName: UNIT_FRIENDLY_NAMES[mappedCode]
          };
        }
      }
    }
  }

  // 5. IGCSE Paper shorthand (Paper1, Paper1R, P1, P2, Unit1, Modular 2B, 4WBI1, 4WM2H, QP 1, MS 2, 4IT1_02, 4MA1-1F, 4PH1-1P)
  // Note: Do NOT map standalone 'ER 1..10.pdf' in IGCSE to P1..P4 because AutomatePapers numbered ERs sequentially (ER 1..10) across variants!
  if (spec === 'IGCSE') {
    const igcsePaperMatch = pathStr.match(/(?:^|[^A-Z0-9])(?:Paper[-_\s]*([1-3])[A-Z0-9]*|Unit[-_\s]*([1-3])[A-Z0-9]*|Modular[-_\s]*([1-3])[A-Z0-9]*|P([1-3])[A-Z0-9]*|(?:QP|MS)[-_\s]+([1-3])[A-Z]*|4[A-Z]{2}[01][-_. ]0?([1-3])[A-Z]*|4W[A-Z]{1,2}([1-3])[A-Z0-9]*)(?:[^A-Z0-9]|$)/i);
    if (igcsePaperMatch) {
      const pNum = igcsePaperMatch[1] || igcsePaperMatch[2] || igcsePaperMatch[3] || igcsePaperMatch[4] || igcsePaperMatch[5] || igcsePaperMatch[6] || igcsePaperMatch[7];
      return {
        unitCode: `P${pNum}`,
        unitName: `Paper ${pNum}`
      };
    }
    if (subject === 'Information Technology' && /data[-_\s]*files/i.test(pathStr)) {
      return {
        unitCode: 'P2',
        unitName: 'Paper 2'
      };
    }
  }

  return { unitCode: null, unitName: null };
}

function getCleanUnitLabel(file) {
  if (file.category === 'Books' || file.category === 'IAL Books' || file.category === 'IGCSE Books') return null;

  const code = (file.unitCode || '').toUpperCase();
  const name = (file.unitName || '').toUpperCase();
  const rawPath = (file.path || '').toUpperCase();
  const subj = (file.subject || '').toUpperCase();
  const spec = file.spec || 'IAL';

  if (spec === 'IGCSE') {
    if (code === 'P1' || name === 'PAPER 1') return 'Paper 1 (P1)';
    if (code === 'P2' || name === 'PAPER 2') return 'Paper 2 (P2)';
    if (code === 'P3' || name === 'PAPER 3') return 'Paper 3 (P3)';
    return file.unitName || null;
  }

  if (subj === 'MATH' || subj === 'MATHEMATICS') {
    if (code === 'WMA11' || name.includes('PURE MATHEMATICS 1') || /\b(?:P1|P1A|P1R)\b/.test(name) || rawPath.includes('WMA11'))
      return 'Pure Mathematics 1 (P1)';
    if (code === 'WMA12' || name.includes('PURE MATHEMATICS 2') || /\b(?:P2|P2A|P2R)\b/.test(name) || rawPath.includes('WMA12'))
      return 'Pure Mathematics 2 (P2)';
    if (code === 'WMA13' || name.includes('PURE MATHEMATICS 3') || /\b(?:P3|P3A)\b/.test(name) || rawPath.includes('WMA13'))
      return 'Pure Mathematics 3 (P3)';
    if (code === 'WMA14' || name.includes('PURE MATHEMATICS 4') || /\b(?:P4|P4A)\b/.test(name) || rawPath.includes('WMA14'))
      return 'Pure Mathematics 4 (P4)';
    if (code === 'WMA01' || name.includes('CORE MATHEMATICS 12') || /\bC12\b/.test(name) || rawPath.includes('WMA01'))
      return 'Core Mathematics 12 (C12)';
    if (code === 'WMA02' || name.includes('CORE MATHEMATICS 34') || /\bC34\b/.test(name) || rawPath.includes('WMA02'))
      return 'Core Mathematics 34 (C34)';
    if (code === 'C1' || name.includes('CORE MATHEMATICS 1 (C1)'))
      return 'Core Mathematics 1 (C1)';
    if (code === 'C2' || name.includes('CORE MATHEMATICS 2 (C2)'))
      return 'Core Mathematics 2 (C2)';
    if (code === 'C3' || name.includes('CORE MATHEMATICS 3 (C3)'))
      return 'Core Mathematics 3 (C3)';
    if (code === 'C4' || name.includes('CORE MATHEMATICS 4 (C4)'))
      return 'Core Mathematics 4 (C4)';

    if (code === 'WFM01' || name.includes('FURTHER PURE 1') || /\b(?:FP1|FP1A)\b/.test(name) || rawPath.includes('WFM01'))
      return 'Further Pure 1 (FP1)';
    if (code === 'WFM02' || name.includes('FURTHER PURE 2') || /\b(?:FP2|FP2A)\b/.test(name) || rawPath.includes('WFM02'))
      return 'Further Pure 2 (FP2)';
    if (code === 'WFM03' || name.includes('FURTHER PURE 3') || /\b(?:FP3|FP3A)\b/.test(name) || rawPath.includes('WFM03'))
      return 'Further Pure 3 (FP3)';

    if (code === 'WME01' || name.includes('MECHANICS 1') || /\b(?:M1|M1A)\b/.test(name) || rawPath.includes('WME01'))
      return 'Mechanics 1 (M1)';
    if (code === 'WME02' || name.includes('MECHANICS 2') || /\b(?:M2|M2A)\b/.test(name) || rawPath.includes('WME02'))
      return 'Mechanics 2 (M2)';
    if (code === 'WME03' || name.includes('MECHANICS 3') || /\b(?:M3|M3A)\b/.test(name) || rawPath.includes('WME03'))
      return 'Mechanics 3 (M3)';

    if (code === 'WST01' || name.includes('STATISTICS 1') || /\b(?:S1|S1A)\b/.test(name) || rawPath.includes('WST01'))
      return 'Statistics 1 (S1)';
    if (code === 'WST02' || name.includes('STATISTICS 2') || /\b(?:S2|S2A)\b/.test(name) || rawPath.includes('WST02'))
      return 'Statistics 2 (S2)';
    if (code === 'WST03' || name.includes('STATISTICS 3') || /\b(?:S3|S3A)\b/.test(name) || rawPath.includes('WST03'))
      return 'Statistics 3 (S3)';

    if (code === 'WDM11' || code === 'WDM01' || name.includes('DECISION') || /\b(?:D1|D1A)\b/.test(name) || rawPath.includes('WDM11') || rawPath.includes('WDM01'))
      return 'Decision Mathematics 1 (D1)';
  }

  if (subj.includes('CHEM')) {
    if (code === 'WCH11' || name.includes('UNIT 1') || rawPath.includes('WCH11')) return 'Unit 1: Structure & Bonding (WCH11)';
    if (code === 'WCH12' || name.includes('UNIT 2') || rawPath.includes('WCH12')) return 'Unit 2: Energetics & Organics (WCH12)';
    if (code === 'WCH13' || name.includes('UNIT 3') || rawPath.includes('WCH13')) return 'Unit 3: Practical Chemistry I (WCH13)';
    if (code === 'WCH14' || name.includes('UNIT 4') || rawPath.includes('WCH14')) return 'Unit 4: Rates & Organic Chemistry (WCH14)';
    if (code === 'WCH15' || name.includes('UNIT 5') || rawPath.includes('WCH15')) return 'Unit 5: Transition Metals (WCH15)';
    if (code === 'WCH16' || name.includes('UNIT 6') || rawPath.includes('WCH16')) return 'Unit 6: Practical Chemistry II (WCH16)';
  }

  if (subj.includes('PHYS')) {
    if (code === 'WPH11' || name.includes('UNIT 1') || rawPath.includes('WPH11')) return 'Unit 1: Mechanics & Materials (WPH11)';
    if (code === 'WPH12' || name.includes('UNIT 2') || rawPath.includes('WPH12')) return 'Unit 2: Waves & Electricity (WPH12)';
    if (code === 'WPH13' || name.includes('UNIT 3') || rawPath.includes('WPH13')) return 'Unit 3: Practical Physics I (WPH13)';
    if (code === 'WPH14' || name.includes('UNIT 4') || rawPath.includes('WPH14')) return 'Unit 4: Further Mechanics & Fields (WPH14)';
    if (code === 'WPH15' || name.includes('UNIT 5') || rawPath.includes('WPH15')) return 'Unit 5: Thermodynamics & Oscillations (WPH15)';
    if (code === 'WPH16' || name.includes('UNIT 6') || rawPath.includes('WPH16')) return 'Unit 6: Practical Physics II (WPH16)';
    if (code === 'WPH07') return 'Practical Physics I (WPH13)';
  }

  if (subj === 'BIOLOGY') {
    if (code === 'WBI11' || code === '6BI01' || name.includes('UNIT 1') || rawPath.includes('WBI11')) return 'Unit 1: Lifestyle, Transport & Health (WBI11)';
    if (code === 'WBI12' || code === '6BI02' || name.includes('UNIT 2') || rawPath.includes('WBI12')) return 'Unit 2: Cells, Development & Biodiversity (WBI12)';
    if (code === 'WBI13' || code === '6BI03' || name.includes('UNIT 3') || rawPath.includes('WBI13')) return 'Unit 3: Practical Biology I (WBI13)';
    if (code === 'WBI14' || code === '6BI04' || name.includes('UNIT 4') || rawPath.includes('WBI14')) return 'Unit 4: Energy, Environment & Immunity (WBI14)';
    if (code === 'WBI15' || code === '6BI05' || name.includes('UNIT 5') || rawPath.includes('WBI15')) return 'Unit 5: Respiration & Muscles (WBI15)';
    if (code === 'WBI16' || code === '6BI06' || name.includes('UNIT 6') || rawPath.includes('WBI16')) return 'Unit 6: Practical Biology II (WBI16)';
  }

  if (subj.includes('ACCOUNTING')) {
    if (code === 'WAC11' || name.includes('UNIT 1') || rawPath.includes('WAC11')) return 'Unit 1: The Accounting System & Costing (WAC11)';
    if (code === 'WAC12' || name.includes('UNIT 2') || rawPath.includes('WAC12')) return 'Unit 2: Corporate & Management Accounting (WAC12)';
  }

  if (subj.includes('ECONOMICS')) {
    if (code === 'WEC11' || name.includes('UNIT 1') || rawPath.includes('WEC11')) return 'Unit 1: Markets in Action (WEC11)';
    if (code === 'WEC12' || name.includes('UNIT 2') || rawPath.includes('WEC12')) return 'Unit 2: Macroeconomic Performance (WEC12)';
    if (code === 'WEC13' || name.includes('UNIT 3') || rawPath.includes('WEC13')) return 'Unit 3: Business Behaviour (WEC13)';
    if (code === 'WEC14' || name.includes('UNIT 4') || rawPath.includes('WEC14')) return 'Unit 4: A Global Perspective (WEC14)';
  }

  if (subj.includes('BUSINESS')) {
    if (code === 'WBS11' || name.includes('UNIT 1') || rawPath.includes('WBS11')) return 'Unit 1: Marketing & People (WBS11)';
    if (code === 'WBS12' || name.includes('UNIT 2') || rawPath.includes('WBS12')) return 'Unit 2: Managing Business Activities (WBS12)';
    if (code === 'WBS13' || name.includes('UNIT 3') || rawPath.includes('WBS13')) return 'Unit 3: Business Decisions & Strategy (WBS13)';
    if (code === 'WBS14' || name.includes('UNIT 4') || rawPath.includes('WBS14')) return 'Unit 4: Global Business (WBS14)';
  }

  return file.unitName || null;
}

function extractSpec(pathStr) {
  if (pathStr.includes('IGCSE')) return 'IGCSE';
  if (pathStr.includes('IAL')) return 'IAL';
  return 'IAL';
}

function extractCategory(pathStr) {
  if (pathStr.startsWith('Past Papers')) return CATEGORY_PAST_PAPERS;
  if (pathStr.startsWith('IGCSE Books')) return CATEGORY_IGCSE;
  if (pathStr.startsWith('IAL Books') || pathStr.startsWith('Books')) return CATEGORY_BOOKS;
  return 'Other';
}

function buildTree(dirPath, rootPath) {
  const name = path.basename(dirPath);
  const node = {
    name,
    path: path.relative(rootPath, dirPath).replace(/\\/g, '/'),
    type: 'directory',
    children: [],
  };

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      if (EXCLUDE_DIRS.includes(item.name)) continue;
      if (item.name.startsWith('.')) continue;

      if (dirPath === rootPath) {
        if (!item.isDirectory() || !ALLOWED_ROOT_DIRS.includes(item.name)) {
          continue;
        }
      }
      
      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
      
      if (item.isDirectory()) {
        const childNode = buildTree(fullPath, rootPath);
        node.children.push(childNode);
      } else {
        const relPath = relativePath;
        const category = extractCategory(relPath);
        const spec = extractSpec(relPath);
        const subject = detectSubject(relPath);
        const sessionDate = extractSessionDate(relPath);
        const { unitCode, unitName } = category === CATEGORY_PAST_PAPERS
          ? extractUnitInfo(relPath, subject, spec)
          : { unitCode: null, unitName: null };

        node.children.push({
          name: item.name,
          path: relPath,
          size: fs.statSync(fullPath).size,
          subject,
          docType: detectDocType(item.name, relPath),
          year: sessionDate ? sessionDate.year : extractYear(relPath),
          session: sessionDate ? sessionDate.label : null,
          sortKey: sessionDate ? sessionDate.sortKey : null,
          unitCode,
          unitName,
          spec,
          category
        });
      }
    }
    
    node.children.sort((a, b) => {
      if (a.children && !b.children) return -1;
      if (!a.children && b.children) return 1;
      return a.name.localeCompare(b.name);
    });

  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return node;
}

function extractFlatFiles(treeNode, filesList = []) {
  if (treeNode.children && treeNode.children.length >= 0) {
    for (const child of treeNode.children) {
      extractFlatFiles(child, filesList);
    }
  } else {
    filesList.push(treeNode);
  }
  return filesList;
}

console.log('Generating index for', TARGET_DIR);
const tree = buildTree(TARGET_DIR, TARGET_DIR);
tree.name = 'The Library'; 

const flatFiles = extractFlatFiles(tree);

const allSubjects = [...new Set(flatFiles.map(f => f.subject).filter(Boolean))].sort();
const ialSubjects = [...new Set(flatFiles.filter(f => f.spec === 'IAL').map(f => f.subject).filter(Boolean))].sort();
const igcseSubjects = [...new Set(flatFiles.filter(f => f.spec === 'IGCSE').map(f => f.subject).filter(Boolean))].sort();

function computeCoverageMap(filesSubset, subjectList) {
  const cov = {};
  for (const subj of subjectList) {
    const subjFiles = filesSubset.filter(f => f.subject === subj);
    const subjDates = subjFiles
      .map(f => extractSessionDate(f.path))
      .filter(Boolean)
      .sort((a, b) => a.sortKey - b.sortKey);

    if (subjDates.length > 0) {
      const minD = subjDates[0];
      const maxD = subjDates[subjDates.length - 1];
      cov[subj] = `${minD.label} – ${maxD.label}`;
    } else {
      cov[subj] = 'Reference Collection';
    }
  }
  return cov;
}

const subjectCoverage = computeCoverageMap(flatFiles, allSubjects);
const ialSubjectCoverage = computeCoverageMap(flatFiles.filter(f => f.spec === 'IAL'), ialSubjects);
const igcseSubjectCoverage = computeCoverageMap(flatFiles.filter(f => f.spec === 'IGCSE'), igcseSubjects);

// Extract variant tag (e.g. R, A, F, H, Mod, OptA, Opt2, v2, ER1..10) so distinct variants are clearly labeled & never merged
function extractVariant(file) {
  const p = file.path || '';
  const n = (file.name || '').replace(/\.[^.]+$/, '');
  const isMod = /modular|(?:^|[^a-z0-9])4w[a-z]{1,2}[1-3]/i.test(p);

  if (file.subject === 'History') {
    const mHist = n.match(/(?:Unit[-_\s]*[1-4]|WHI0[1-4][-_\s]*1)([A-D])\b/i);
    if (mHist) return `Opt${mHist[1].toUpperCase()}`;
  }

  if (file.subject === 'Computer Science') {
    const mCs = p.match(/(?:^|[^A-Z0-9])P2([A-C])(?:[^A-Z0-9]|$)/i);
    if (mCs) return `P2${mCs[1].toUpperCase()}`;
  }

  const isF = /(?:^|[^A-Z0-9])(?:[12]F[-_]?R?|Paper[-_\s]*[12]F[-_\s]*R?|Foundation)(?:[^A-Z0-9]|$)/i.test(p);
  const isH = /(?:^|[^A-Z0-9])(?:[12]H[-_]?R?|Paper[-_\s]*[12]H[-_\s]*R?|4WM[12]H|Higher)(?:[^A-Z0-9]|$)/i.test(p);
  const isR = /(?:^|[^A-Z0-9])(?:Paper[-_\s]*[1-4][FH]?[-_\s]*R|Unit[-_\s]*[1-6]R|Modular[-_\s]*[1-3][A-Z]*R|P[1-4]R|U[1-6]R|[1-4][BCPFH]R|WMA1[1-4]R|C[1-4]R|C12R|C34R|M[1-3]R|S[1-3]R|D1R|0[1-4]R)(?:[^A-Z0-9]|$)/i.test(p);

  if (isMod) {
    if (isF && isR) return 'F-R-Mod';
    if (isH && isR) return 'H-R-Mod';
    if (isF) return 'F-Mod';
    if (isH) return 'H-Mod';
    if (isR) return 'R-Mod';
    return 'Mod';
  }

  if (isF && isR) return 'F-R';
  if (isH && isR) return 'H-R';
  if (isF) return 'F';
  if (isH) return 'H';
  if (isR) return 'R';

  if (/(?:^|[^A-Z0-9])(?:U[1-6]A|P[1-4]A|C12A|C34A|M[1-3]A|S[1-3]A|FP[1-3]A|F[1-3]A|D1A)(?:[^A-Z0-9]|$)/i.test(p)) return 'A';
  const mOpt = n.match(/_([2-9]|\d{2})$/);
  if (mOpt) return `Opt${mOpt[1]}`;
  const mVer = n.match(/\((v\d+|\d+)\)/i);
  if (mVer) return mVer[1].toLowerCase();
  const mEr = n.match(/^ER\s+(\d+)$/i);
  if (mEr && file.spec === 'IGCSE') return `ER${mEr[1]}`;
  return '';
}

function deduplicateFiles(filesList) {
  const scoreFile = (f) => {
    let s = 0;
    if (f.path.includes('(')) s += 10;
    if (f.name.includes('_')) s += 5;
    return s;
  };
  const map = new Map();
  for (const f of filesList) {
    const ext = (f.name || '').split('.').pop().toLowerCase();
    const v = extractVariant(f);
    const key = (f.category === CATEGORY_PAST_PAPERS && f.unitCode && f.session && f.docType)
      ? `${f.spec}|${f.subject}|${f.unitCode}|${v}|${f.session}|${f.docType}|${ext}|${f.size}`
      : f.path;
    if (!map.has(key) || scoreFile(f) > scoreFile(map.get(key))) {
      map.set(key, f);
    }
  }
  return Array.from(map.values());
}

// Precompute instant 0ms Wizard metadata (Subject -> Units -> Years & Counts)
function buildWizardMeta(filesList) {
  const dedupedList = deduplicateFiles(filesList);
  const wizard = {
    'Edexcel IAL': {},
    'Edexcel IGCSE': {}
  };
  for (const f of dedupedList) {
    const curr = f.spec === 'IGCSE' ? 'Edexcel IGCSE' : 'Edexcel IAL';
    const subj = f.subject;
    if (!subj) continue;
    if (!wizard[curr][subj]) {
      wizard[curr][subj] = { totalFiles: 0, units: {}, allYears: new Set() };
    }
    wizard[curr][subj].totalFiles++;
    if (f.year) wizard[curr][subj].allYears.add(f.year);
    const unitLabel = getCleanUnitLabel(f);
    if (unitLabel) {
      if (!wizard[curr][subj].units[unitLabel]) {
        wizard[curr][subj].units[unitLabel] = { count: 0, years: new Set() };
      }
      wizard[curr][subj].units[unitLabel].count++;
      if (f.year) wizard[curr][subj].units[unitLabel].years.add(f.year);
    }
  }
  // Serialize Sets into sorted arrays
  for (const curr of Object.keys(wizard)) {
    for (const subj of Object.keys(wizard[curr])) {
      const entry = wizard[curr][subj];
      entry.allYears = Array.from(entry.allYears).sort((a, b) => b - a);
      const cleanUnits = {};
      for (const u of Object.keys(entry.units).sort((a, b) => a.localeCompare(b))) {
        cleanUnits[u] = {
          count: entry.units[u].count,
          years: Array.from(entry.units[u].years).sort((a, b) => b - a)
        };
      }
      entry.units = cleanUnits;
    }
  }
  return wizard;
}

const wizardMeta = buildWizardMeta(flatFiles);

const dates = flatFiles
  .map(f => extractSessionDate(f.path))
  .filter(Boolean)
  .sort((a, b) => a.sortKey - b.sortKey);

const minDate = dates[0];
const maxDate = dates[dates.length - 1];

const coverageRangeStr = minDate && maxDate 
  ? `${minDate.label} – ${maxDate.label}`
  : 'January 2003 – January 2026';

function isYearOrSessionDir(name) {
  if (/^\d{4}$/.test(name)) return true;
  if (/^\d{4}[-_\s]+[A-Za-z]+$/i.test(name)) return true;
  if (/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|summer|winter|spring)[-_\s]*\d{0,4}$/i.test(name)) return true;
  return false;
}

// Clean pruned directory tree { name, path, children } preserving all qualifications, subjects, and unit modules,
// but pruning ~8,500 repetitive year and examination session folders
function getCleanDirectoryTree(node, depth = 0) {
  if (!node) return null;
  if (depth > 2 && isYearOrSessionDir(node.name)) return null;

  const dirChildren = (node.children || [])
    .filter(c => c.children && !isYearOrSessionDir(c.name))
    .map(c => getCleanDirectoryTree(c, depth + 1))
    .filter(Boolean);

  return {
    name: node.name,
    path: node.path,
    children: dirChildren
  };
}

const cleanTree = getCleanDirectoryTree(tree);

// Compact tree representation [name, children] pruned of year/session directories
// Slashes meta.json size from 162 KB down to ~27 KB (96% tree size reduction) while keeping 100% of qualifications, subjects, and units
function getCompactTree(node, depth = 0) {
  if (!node) return null;
  if (depth > 2 && isYearOrSessionDir(node.name)) return null;

  const dirChildren = (node.children || [])
    .filter(c => c.children && !isYearOrSessionDir(c.name))
    .map(c => getCompactTree(c, depth + 1))
    .filter(Boolean);

  if (dirChildren.length === 0) return node.name;
  return [node.name, dirChildren];
}

const compactTree = getCompactTree(tree);

const keys = ["name", "path", "size", "subject", "docType", "year", "session", "sortKey", "unitCode", "unitName", "spec", "category", "variant", "cleanUnitLabel"];
const files = flatFiles.map(f => [
  f.name,
  f.path,
  f.size,
  f.subject,
  f.docType,
  f.year,
  f.session,
  f.sortKey,
  f.unitCode,
  f.unitName,
  f.spec,
  f.category,
  extractVariant(f),
  getCleanUnitLabel(f)
]);

const metaInfo = {
  totalFiles: flatFiles.length,
  subjects: allSubjects,
  ialSubjects,
  igcseSubjects,
  coverage: coverageRangeStr,
  subjectCoverage,
  ialSubjectCoverage,
  igcseSubjectCoverage,
  wizard: wizardMeta,
  generatedAt: new Date().toISOString()
};

const output = {
  tree: cleanTree,
  compactTree,
  keys,
  files,
  meta: metaInfo
};

const metaOutput = {
  tree: cleanTree,
  compactTree,
  meta: metaInfo
};

const publicDir = path.resolve(__dirname, '..', 'public');
const outputPath = path.join(publicDir, 'index.json');
fs.writeFileSync(outputPath, JSON.stringify(output));

const metaPath = path.join(publicDir, 'meta.json');
fs.writeFileSync(metaPath, JSON.stringify(metaOutput));

const rootLiveIndexPath = path.join(TARGET_DIR, 'live_index.json');
fs.writeFileSync(rootLiveIndexPath, JSON.stringify({ tree: cleanTree, compactTree, keys, files, meta: metaInfo }));

console.log(`Index generated successfully at ${outputPath}`);
console.log(`Indexed ${flatFiles.length} files (${ialSubjects.length} IAL subjects, ${igcseSubjects.length} IGCSE subjects).`);
