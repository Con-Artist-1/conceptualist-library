/* global __APP_BUILD_TIME__ */
import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import './index.css';

const PAGE_SIZE = 80;
const BUILD_TIMESTAMP = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '2026-11-07T18:36:00.000Z';
const APP_VERSION = 'v2.8';
const META_CACHE_KEY = `cs_library_meta_${APP_VERSION}_${BUILD_TIMESTAMP}`;

const CHANGELOG_HISTORY = [
  {
    version: 'v2.8',
    date: BUILD_TIMESTAMP,
    title: '631 New 2024–2026 IAL & IGCSE Past Papers (May/June 2026, Jan 2025 & Modular) + Cache Recovery',
    summary: 'Expanded repository to 13,940 verified Pearson Edexcel files (+631 new papers across May/June 2026, Jan 2025, Oct/Nov 2024, and IGCSE Modular) plus one-click crash cache recovery.',
    changes: [
      'Added 631 verified, unwatermarked Pearson Edexcel past papers (QP, MS, ER, and practical data files), bringing the total indexed archive from 13,309 to 13,940 files.',
      'Added May/June 2026 IAL & IGCSE series across Accounting, Biology, Business, Chemistry, Economics, English Language/Literature, Geography, History, Law, Mathematics, Physics, and Psychology.',
      'Added IGCSE Modular (Unit 1 & Unit 2, 2024–2026) papers for Accounting, Biology, Chemistry, Commerce, Economics, Geography, History, Physics, and Religious Studies, plus Foundation/Higher Regional (F-R / H-R) and Computer Science P2 variants.',
      'Added backward-compatible tree indexing and a dedicated "Clear Cache & Force Reload" recovery screen so returning browsers with older cached shells self-heal automatically.'
    ]
  },
  {
    version: 'v2.7',
    date: '2026-11-07T17:18:00.000Z',
    title: 'Institutional McMaster/Ivy-League Styling, Unified Sittings & Typo-Tolerant Fuzzy Search',
    summary: 'Refined muted burgundy/slate institutional palette, removed all emojis, unified QP/MS/ER into single sitting rows (~65% less clutter), and added typo-tolerant fuzzy + shorthand search.',
    changes: [
      'Restored strict McMaster-Carr / Ivy-League institutional aesthetic: muted burgundy, Oxford slate-navy, forest-slate, and warm bronze tones with 0ms instant hover/click states and zero emojis.',
      'Unified matching Question Papers (QP), Mark Schemes (MS), Examiner Reports (ER), and audio/data attachments from the same exam sitting into a single consolidated row — reducing list length by ~65%.',
      'Added Side-by-Side Split View (QP + MS) inside the PDF Preview Modal and a "Unified Sittings / Individual Files" view mode toggle in the filter bar.',
      'Upgraded the search engine with Damerau-Levenshtein typo tolerance (e.g., "chemsitry", "mechanincs", "acounting"), compound shorthand expansion ("jan25", "oct24", "unit1", "p2r", "markscheme"), and relevance ranking in <1ms.'
    ]
  },
  {
    version: 'v2.5',
    date: '2026-11-07T16:10:00.000Z',
    title: 'Anti-Stale Cache Enforcement, Build Version Tracking & Live Changelog',
    summary: 'Fixed stale browser/CDN caching on root route, bound index cache to build timestamp, and added subtle footer update tracker + full Changelog page.',
    changes: [
      'Added strict Cache-Control (no-cache, no-store, must-revalidate) and Vercel-CDN-Cache-Control (no-store) headers to both "/" and "/index.html" so browsers and edge nodes never serve outdated HTML shells.',
      'Bound meta.json, index.json, and localStorage cache keys directly to the build timestamp so every new deployment automatically busts stale data while staying 0ms cached within the same release.',
      'Added a subtle, low-profile update indicator in the global footer showing when the site was last updated and a compact summary of the latest update.',
      'Added this interactive Changelog page (accessible by clicking the footer update note) with a complete history of all site improvements and a one-click cache reset tool.'
    ]
  },
  {
    version: 'v2.4',
    date: '2026-11-07T16:04:00.000Z',
    title: '85% Faster Index Payload, Smart Deduplication & Inline PDF Preview',
    summary: 'Shrank meta.json by 85% (4.6 KB Brotli), deduplicated 3,894 duplicate papers, fixed IGCSE unit filters, and added QP/MS/ER quick-links + inline PDF preview.',
    changes: [
      'Compacted directory tree serialization ([name, children]), shrinking meta.json from 882.4 KB down to 155.5 KB (4.6 KB Brotli) and reducing index.json by 728 KB.',
      'Precomputed the Subject → Unit → Year wizard map inside meta.json so clicking any subject or unit on the homepage responds in 0ms even before the full index finishes downloading.',
      'Collapsed 3,894 byte-for-byte duplicate PDFs across merged scraper folders (Math/Mathematics/Maths, U1/Unit 1, 2019/May-June vs 2019 May) while preserving all regional (1R), alternative (U1A), and option (_2–_4) papers.',
      'Fixed IGCSE unit extraction so numbered Examiner Reports (ER 3.pdf, ER 4.pdf) no longer create false Paper 3 (P3) and Paper 4 (P4) buttons in IGCSE subjects that only have Paper 1 and Paper 2.',
      'Fixed audio tracks (.mp3/.wav) being misclassified as Question Papers (QP), fixed _PEF.pdf detection as Examiner Reports (ER), and added badges for Audio, Data Files, Solutions, Source Booklets, and SAMs.',
      'Fixed duplicate subject names in document titles (e.g., "Accounting — Unit 1 (WAC11) • Question Paper • January 2026" instead of "Accounting Accounting Unit 1") and added file size & format tags.',
      'Added one-click companion QP ↗ / MS ↗ / ER ↗ buttons on every table row to jump directly between a Question Paper, its Mark Scheme, and its Examiner Report for the exact same sitting.',
      'Added an in-app PDF Preview Modal with built-in QP / MS / ER switching in the modal header.',
      'Added dynamic Unit/Paper and Year dropdowns to the main filter bar, non-blocking search (useDeferredValue) with full synonym expansion, 80-row fast pagination, and "/" keyboard shortcut to focus search.'
    ]
  },
  {
    version: 'v2.2',
    date: '2026-11-06T18:30:00.000Z',
    title: 'Unified IAL & IGCSE Directory Architecture & Two-Stage Indexer',
    summary: 'Organized 13,309 Pearson Edexcel documents into canonical IAL/IGCSE Past Papers and Textbooks with two-stage meta.json + index.json loading.',
    changes: [
      'Consolidated all 13,309 Pearson Edexcel resources (9,701 IAL past papers across 19 subjects, 3,537 IGCSE past papers across 18 subjects, and 71 textbooks/solution banks) spanning January 2003 – January 2026.',
      'Built the interactive 3-step Homepage Wizard (Subject → Unit/Paper → Examination Year) with curated unit labels for Mathematics, Biology, Chemistry, Physics, Accounting, Business, and Economics.',
      'Synchronized master repository with the Hugging Face dataset CDN (Diavlon/mcmaster-docs-library) for direct, high-speed PDF resolution.'
    ]
  }
];

function formatUpdateTimestamp(isoStr) {
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

const DOC_TYPE_INFO = {
  QP: { label: 'QP', fullLabel: 'Question Paper', cls: 'qp' },
  MS: { label: 'MS', fullLabel: 'Mark Scheme', cls: 'ms' },
  ER: { label: 'ER', fullLabel: 'Examiner Report', cls: 'er' },
  Book: { label: 'Book', fullLabel: 'Textbook', cls: 'book' },
  SOL: { label: 'Solutions', fullLabel: 'Worked Solutions', cls: 'sol' },
  DF: { label: 'Data', fullLabel: 'Data Files', cls: 'df' },
  AUD: { label: 'Audio', fullLabel: 'Listening Audio', cls: 'aud' },
  SC: { label: 'Source', fullLabel: 'Source / Transcript', cls: 'sc' },
  SAM: { label: 'SAM', fullLabel: 'Specimen / Syllabus', cls: 'sam' }
};

const QUERY_SYNONYMS = {
  'math': 'math mathematics maths',
  'maths': 'math mathematics maths',
  'mathematics': 'math mathematics maths',
  'it': 'information technology it ict',
  'ict': 'information technology it ict',
  'cs': 'computer science',
  'compsci': 'computer science',
  'bio': 'biology',
  'humanbio': 'human biology',
  'chem': 'chemistry',
  'phys': 'physics',
  'phy': 'physics',
  'econ': 'economics',
  'bus': 'business',
  'acc': 'accounting',
  'psych': 'psychology',
  'geog': 'geography',
  'geo': 'geography',
  'eng': 'english',
  'lit': 'literature',
  'comm': 'commerce',
  'qp': 'qp question paper',
  'questionpaper': 'qp question paper',
  'questionpapers': 'qp question paper',
  'pastpaper': 'qp question paper',
  'pastpapers': 'qp question paper',
  'ms': 'ms mark scheme markscheme',
  'markscheme': 'ms mark scheme markscheme',
  'markschemes': 'ms mark scheme markscheme',
  'er': 'er examiner report pef',
  'examinerreport': 'er examiner report pef',
  'examinerreports': 'er examiner report pef',
  'pef': 'er examiner report pef',
  'book': 'book books textbook',
  'textbook': 'book books textbook',
  'textbooks': 'book books textbook',
  'u1': 'u1 unit 1 wma11 wbi11 wch11 wph11 wac11 wec11 wbs11 6bi01',
  'u2': 'u2 unit 2 wma12 wbi12 wch12 wph12 wac12 wec12 wbs12 6bi02',
  'u3': 'u3 unit 3 wma13 wbi13 wch13 wph13 wec13 wbs13 6bi03',
  'u4': 'u4 unit 4 wma14 wbi14 wch14 wph14 wec14 wbs14 6bi04',
  'u5': 'u5 unit 5 wbi15 wch15 wph15 6bi05',
  'u6': 'u6 unit 6 wbi16 wch16 wph16 6bi06',
  'p1': 'p1 wma11 pure mathematics 1 paper 1',
  'p2': 'p2 wma12 pure mathematics 2 paper 2',
  'p3': 'p3 wma13 pure mathematics 3 paper 3',
  'p4': 'p4 wma14 pure mathematics 4 paper 4',
  '1r': '1r p1r paper 1r regional',
  '2r': '2r p2r paper 2r regional',
  'p1r': '1r p1r paper 1r regional',
  'p2r': '2r p2r paper 2r regional',
  'm1': 'm1 wme01 mechanics 1',
  'm2': 'm2 wme02 mechanics 2',
  'm3': 'm3 wme03 mechanics 3',
  's1': 's1 wst01 statistics 1',
  's2': 's2 wst02 statistics 2',
  's3': 's3 wst03 statistics 3',
  'fp1': 'fp1 wfm01 further pure 1',
  'fp2': 'fp2 wfm02 further pure 2',
  'fp3': 'fp3 wfm03 further pure 3',
  'd1': 'd1 wdm11 wdm01 decision 1',
  'c12': 'c12 wma01 core mathematics 12',
  'c34': 'c34 wma02 core mathematics 34',
  'may': 'june may',
  'jun': 'june may',
  'june': 'june may',
  'summer': 'june may',
  'oct': 'october november oct nov',
  'nov': 'october november oct nov',
  'october': 'october november oct nov',
  'november': 'october november oct nov',
  'jan': 'january jan',
  'january': 'january jan'
};

// Canonical academic vocabulary for <0.05ms Damerau-Levenshtein typo tolerance & prefix matching
const SEARCH_VOCAB = [
  'accounting', 'arabic', 'bangla', 'biology', 'business', 'chemistry', 'commerce',
  'computer', 'science', 'economics', 'english', 'language', 'literature', 'french',
  'further', 'pure', 'mathematics', 'geography', 'german', 'greek', 'history',
  'human', 'information', 'technology', 'law', 'physics', 'psychology', 'spanish',
  'mechanics', 'statistics', 'decision', 'core', 'unit', 'paper', 'regional',
  'foundation', 'higher', 'question', 'mark', 'scheme', 'examiner', 'report',
  'textbook', 'book', 'solutions', 'worked', 'specimen', 'listening', 'audio',
  'january', 'june', 'october', 'november', 'summer', 'edexcel', 'igcse', 'ial',
  'wma11', 'wma12', 'wma13', 'wma14', 'wma01', 'wma02', 'wfm01', 'wfm02', 'wfm03',
  'wme01', 'wme02', 'wme03', 'wst01', 'wst02', 'wst03', 'wdm11', 'wdm01',
  'wbi11', 'wbi12', 'wbi13', 'wbi14', 'wbi15', 'wbi16',
  'wch11', 'wch12', 'wch13', 'wch14', 'wch15', 'wch16',
  'wph11', 'wph12', 'wph13', 'wph14', 'wph15', 'wph16',
  'wac11', 'wac12', 'wec11', 'wec12', 'wec13', 'wec14',
  'wbs11', 'wbs12', 'wbs13', 'wbs14'
];

// Fast bounded Damerau-Levenshtein distance (supports insertions, deletions, substitutions, and adjacent transpositions)
function damerauLevenshtein(a, b, maxDist = 2) {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  const dp = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[lenA][lenB];
}

// Parse user search query into expanded synonym + typo-tolerant token groups (<0.05ms per query)
function parseSearchQuery(rawQuery) {
  if (!rawQuery) return [];
  const normalized = rawQuery
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\bunit\s*([1-6])\b/g, 'u$1')
    .replace(/\bpaper\s*([1-4]r?)\b/g, 'p$1')
    .replace(/\b(jan(?:uary)?|feb|mar|may|jun(?:e)?|summer|oct(?:ober)?|nov(?:ember)?)[-_\s]*(\d{2}|\d{4})\b/g, '$1 $2')
    .replace(/[,/;•—–-]+/g, ' ')
    .trim();

  if (!normalized) return [];
  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  const groups = [];

  for (let i = 0; i < rawTokens.length; i++) {
    let tok = rawTokens[i];
    // Expand 2-digit years ("25" -> "2025", "19" -> "2019", "04" -> "2004")
    if (/^\d{2}$/.test(tok)) {
      const yrNum = parseInt(tok, 10);
      if (yrNum >= 3 && yrNum <= 29) {
        tok = String(2000 + yrNum);
      }
    }

    const alts = new Set([tok]);
    if (QUERY_SYNONYMS[tok]) {
      QUERY_SYNONYMS[tok].split(/\s+/).forEach(w => alts.add(w));
    }

    // Typo tolerance & prefix expansion for words >= 4 chars
    if (tok.length >= 4 && !/^\d+$/.test(tok)) {
      const maxEdits = tok.length >= 7 ? 2 : 1;
      for (let v = 0; v < SEARCH_VOCAB.length; v++) {
        const word = SEARCH_VOCAB[v];
        if (word === tok) continue;
        if (word.startsWith(tok)) {
          alts.add(word);
          if (QUERY_SYNONYMS[word]) {
            QUERY_SYNONYMS[word].split(/\s+/).forEach(w => alts.add(w));
          }
        } else if (Math.abs(word.length - tok.length) <= maxEdits) {
          // Require matching first character or transposed first two characters for high precision
          if (word[0] === tok[0] || (word[0] === tok[1] && word[1] === tok[0])) {
            const dist = damerauLevenshtein(tok, word, maxEdits);
            if (dist <= maxEdits) {
              alts.add(word);
              if (QUERY_SYNONYMS[word]) {
                QUERY_SYNONYMS[word].split(/\s+/).forEach(w => alts.add(w));
              }
            }
          }
        }
      }
    }

    groups.push({ primary: tok, alts: Array.from(alts) });
  }
  return groups;
}

function getDocTypeBadge(docType, category) {
  if (category === 'Books' || category === 'IAL Books' || category === 'IGCSE Books') {
    if (docType === 'SOL') return DOC_TYPE_INFO.SOL;
    return DOC_TYPE_INFO.Book;
  }
  if (docType && DOC_TYPE_INFO[docType]) return DOC_TYPE_INFO[docType];
  return null;
}

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : decimals))} ${sizes[i]}`;
}

function formatSubjectDisplay(subj) {
  if (!subj) return '';
  if (subj === 'Math') return 'Mathematics';
  return subj;
}

function getHfUrl(filePath) {
  return `https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/resolve/main/${(filePath || '').split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}

// Rehydrate compact [name, children] tree into { name, path, children } in ~1ms
function inflateCompactTree(compactNode, parentPath = '', isRoot = true) {
  if (!compactNode) return null;
  if (typeof compactNode === 'string') {
    const nodePath = isRoot ? '' : (parentPath ? `${parentPath}/${compactNode}` : compactNode);
    return { name: compactNode, path: nodePath, children: [] };
  }
  if (Array.isArray(compactNode)) {
    const [name, rawChildren] = compactNode;
    const nodePath = isRoot ? '' : (parentPath ? `${parentPath}/${name}` : name);
    const children = (rawChildren || []).map(c => inflateCompactTree(c, nodePath, false));
    return { name, path: nodePath, children };
  }
  return compactNode;
}

// Determine curriculum from path & category
function getCurriculum(file) {
  const p = file.path || '';
  const cat = file.category || '';
  const spec = file.spec || '';

  if (spec === 'IGCSE' || p.includes('IGCSE') || cat === 'IGCSE Books') {
    return 'Edexcel IGCSE';
  }
  return 'Edexcel IAL';
}

// Extract variant tag (e.g. R, A, F, H, Mod, OptA, Opt2, v2, ER1..10) so distinct variants are clearly labeled & never merged
function extractVariant(file) {
  const p = file.path || '';
  const n = (file.name || '').replace(/\.[^.]+$/, '');
  const isMod = /modular|(?:^|[^a-z0-9])4w[a-z]{1,2}[1-3]/i.test(p);

  // IAL History route options (Unit1A..Unit4D)
  if (file.subject === 'History') {
    const mHist = n.match(/(?:Unit[-_\s]*[1-4]|WHI0[1-4][-_\s]*1)([A-D])\b/i);
    if (mHist) return `Opt${mHist[1].toUpperCase()}`;
  }

  // IGCSE Computer Science Paper 2 programming language options (P2A, P2B, P2C)
  if (file.subject === 'Computer Science') {
    const mCs = p.match(/(?:^|[^A-Z0-9])P2([A-C])(?:[^A-Z0-9]|$)/i);
    if (mCs) return `P2${mCs[1].toUpperCase()}`;
  }

  // IGCSE Mathematics A Foundation / Higher (+ Regional / Modular)
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
  if (mEr && (file.spec === 'IGCSE' || file.curriculum === 'Edexcel IGCSE')) return `ER${mEr[1]}`;
  return '';
}

// Clean canonical unit label resolver
function getCleanUnitLabel(file) {
  if (file.category === 'Books' || file.category === 'IAL Books' || file.category === 'IGCSE Books') return null;

  const code = (file.unitCode || '').toUpperCase();
  const name = (file.unitName || '').toUpperCase();
  const rawPath = (file.path || '').toUpperCase();
  const subj = (file.subject || '').toUpperCase();
  const curr = file.curriculum || getCurriculum(file);

  if (curr === 'Edexcel IGCSE') {
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

  if (
    file.unitName &&
    !file.unitName.includes('.pdf') &&
    !file.unitName.includes('_177')
  ) {
    return file.unitName;
  }

  return null;
}

// Strip redundant subject prefix from unitName (e.g. "Accounting Unit 1 (WAC11)" -> "Unit 1 (WAC11)")
function getShortUnitDisplay(file) {
  let u = file.unitName || (file.unitCode ? `Unit ${file.unitCode}` : '');
  if (!u) return '';
  if (file.subject) {
    const subj = file.subject === 'Information Technology' ? 'IT' : file.subject;
    const prefixRegex = new RegExp(`^(?:${file.subject}|${subj})\\s+`, 'i');
    u = u.replace(prefixRegex, '');
  }
  const v = file.variant || '';
  if (v === 'R') {
    if (u.startsWith('Paper ')) u = `${u}R (Regional)`;
    else u = `${u} (Regional)`;
  } else if (v === 'A') {
    u = `${u} (Regional)`;
  } else if (v === 'F') {
    u = `${u} (Foundation)`;
  } else if (v === 'F-R') {
    u = `${u}R (Foundation Regional)`;
  } else if (v === 'H') {
    u = `${u} (Higher)`;
  } else if (v === 'H-R') {
    u = `${u}R (Higher Regional)`;
  } else if (v === 'Mod') {
    u = `${u} (Modular)`;
  } else if (v === 'R-Mod') {
    u = `${u}R (Modular Regional)`;
  } else if (v === 'H-Mod') {
    u = `${u} (Higher Modular)`;
  } else if (v === 'H-R-Mod') {
    u = `${u}R (Higher Modular Regional)`;
  } else if (v === 'F-Mod') {
    u = `${u} (Foundation Modular)`;
  } else if (v === 'F-R-Mod') {
    u = `${u}R (Foundation Modular Regional)`;
  } else if (v.startsWith('Opt')) {
    u = `${u} (Option ${v.slice(3)})`;
  } else if (v.startsWith('ER')) {
    u = `Report #${v.slice(2)}`;
  } else if (v) {
    u = `${u} (${v})`;
  }
  return u;
}

// Generate clean, unambiguous human-readable title without duplicate subject names
function getDisplayTitle(file) {
  let cleanName = (file.name || '')
    .replace(/\.(pdf|zip|rar|mp3|wav|docx)$/i, '')
    .replace(/_\d{10,14}/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    file.category === 'Books' ||
    file.category === 'IAL Books' ||
    file.category === 'IGCSE Books' ||
    (!file.session && !file.unitName && !file.unitCode)
  ) {
    return cleanName;
  }

  const subjStr = file.subject === 'Information Technology'
    ? 'IT'
    : (file.subject === 'Math' ? 'Mathematics' : (file.subject || ''));

  const shortUnit = getShortUnitDisplay(file);
  const badge = getDocTypeBadge(file.docType, file.category);
  const docLabel = badge ? badge.fullLabel : '';

  const mainParts = [subjStr, shortUnit].filter(Boolean).join(' — ');
  const suffixParts = [];
  if (docLabel) suffixParts.push(docLabel);
  if (file.session) suffixParts.push(file.session);
  else if (file.year) suffixParts.push(String(file.year));

  if (!mainParts) return cleanName;
  if (suffixParts.length > 0) {
    return `${mainParts} • ${suffixParts.join(' • ')}`;
  }
  return mainParts;
}

// Generate clean unified sitting title (e.g. "Mathematics — Unit 1 (WMA11) • January 2025")
function getUnifiedSittingTitle(file) {
  const subjStr = file.subject === 'Information Technology'
    ? 'IT'
    : (file.subject === 'Math' ? 'Mathematics' : (file.subject || ''));
  const shortUnit = getShortUnitDisplay(file);
  const mainParts = [subjStr, shortUnit].filter(Boolean).join(' — ');
  const timePart = file.session || (file.year ? String(file.year) : '');
  if (!mainParts) return getDisplayTitle(file);
  return timePart ? `${mainParts} • ${timePart}` : mainParts;
}

// ─── Institutional Sidebar Tree Node ─────────────────────────────
const TreeNode = React.memo(({ node, currentPath, onSelect, expandedPaths, toggleExpand }) => {
  if (!node || !node.children) return null;
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = currentPath === node.path;
  const hasSubDirs = node.children && node.children.length > 0;

  const handleClick = (e) => {
    e.preventDefault();
    onSelect(node.path);
    if (hasSubDirs) {
      toggleExpand(node.path);
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-item ${isSelected ? 'selected' : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e); }}
      >
        <span className="tree-indicator">
          {hasSubDirs ? (isExpanded ? '−' : '+') : '•'}
        </span>
        <span className="tree-name">{node.name}</span>
      </div>
      {isExpanded && hasSubDirs && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              currentPath={currentPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ─── In-App Quick PDF Preview Modal (with QP + MS Split View) ────
const PreviewModal = ({ file, onClose, onSwitchFile }) => {
  const [splitMode, setSplitMode] = useState(false);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!file) return null;
  const url = getHfUrl(file.path);
  const siblings = file.siblings || {};
  const canSplit = Boolean(siblings.QP?.ext === 'pdf' && siblings.MS?.ext === 'pdf');
  const activeSplit = splitMode && canSplit;
  const title = activeSplit ? `${getUnifiedSittingTitle(file)} — Split View (QP + MS)` : getDisplayTitle(file);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal-container ${activeSplit ? 'modal-split-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-title">{title}</span>
            <span className="modal-subtitle">
              {activeSplit
                ? `Left: ${siblings.QP.name} • Right: ${siblings.MS.name}`
                : `${file.path} ${file.size ? `(${formatBytes(file.size)})` : ''}`}
            </span>
          </div>

          <div className="modal-actions">
            {/* Instant Sibling Switcher inside Preview Modal */}
            {['QP', 'MS', 'ER'].map((type) => {
              const sib = siblings[type];
              if (!sib || !sib.ext || sib.ext !== 'pdf') return null;
              const isCurrent = !activeSplit && file.path === sib.path;
              return (
                <button
                  key={type}
                  type="button"
                  className={`modal-sibling-btn ${type.toLowerCase()} ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    setSplitMode(false);
                    if (file.path !== sib.path) onSwitchFile(sib);
                  }}
                  title={`View ${DOC_TYPE_INFO[type]?.fullLabel || type}`}
                >
                  {type === 'QP' ? 'Question Paper [QP]' : type === 'MS' ? 'Mark Scheme [MS]' : 'Examiner Report [ER]'}
                </button>
              );
            })}

            {canSplit && (
              <button
                type="button"
                className={`modal-sibling-btn split ${activeSplit ? 'active' : ''}`}
                onClick={() => setSplitMode(prev => !prev)}
                title="View Question Paper and Mark Scheme side-by-side"
              >
                Split View (QP + MS)
              </button>
            )}

            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="modal-action-link"
            >
              Open Full Tab ↗
            </a>
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close preview">
              ✕
            </button>
          </div>
        </div>
        <div className={`modal-body ${activeSplit ? 'split-grid' : ''}`}>
          {activeSplit ? (
            <>
              <div className="modal-split-pane">
                <div className="modal-split-label qp">Question Paper (QP)</div>
                <iframe
                  src={getHfUrl(siblings.QP.path)}
                  title="Question Paper"
                  className="modal-iframe"
                />
              </div>
              <div className="modal-split-pane">
                <div className="modal-split-label ms">Mark Scheme (MS)</div>
                <iframe
                  src={getHfUrl(siblings.MS.path)}
                  title="Mark Scheme"
                  className="modal-iframe"
                />
              </div>
            </>
          ) : (
            <iframe
              src={url}
              title={title}
              className="modal-iframe"
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Global utility to purge all browser caches, storage, and service workers and force a clean reload
function forcePurgeCacheAndReload() {
  try {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('cs_auto_healed', '1');
  } catch {
    // Ignore storage errors
  }
  const tasks = [];
  if (typeof window !== 'undefined' && 'caches' in window) {
    tasks.push(
      caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).catch(() => {})
    );
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))).catch(() => {})
    );
  }
  Promise.all(tasks).finally(() => {
    window.location.replace(`/?reset=${Date.now()}`);
  });
}

// ─── Institutional Crash / Stale Cache Recovery Screen ───────────
const CrashRecoveryScreen = ({ errorMsg }) => {
  useEffect(() => {
    // Automatically self-heal once per session if a returning user hits a stale-cache error
    try {
      if (!sessionStorage.getItem('cs_auto_healed')) {
        sessionStorage.setItem('cs_auto_healed', '1');
        forcePurgeCacheAndReload();
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F2F1ED',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Roboto, Inter, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #C8C4BC',
        borderTop: '4px solid #6F1D2B',
        borderRadius: '3px',
        maxWidth: '540px',
        width: '100%',
        padding: '32px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          color: '#6F1D2B',
          marginBottom: '6px'
        }}>
          Conceptualist Systems — Repository Recovery
        </div>
        <h1 style={{
          fontSize: '20px',
          fontWeight: 800,
          color: '#1A1D20',
          marginBottom: '10px'
        }}>
          Outdated Browser Cache Detected
        </h1>
        <p style={{
          fontSize: '14px',
          color: '#2E343B',
          lineHeight: 1.55,
          marginBottom: '20px'
        }}>
          Your browser attempted to load an older cached version of the repository index after a recent site update. Click the button below to purge stale cache data and load the latest catalog.
        </p>
        {errorMsg && (
          <div style={{
            fontSize: '11.5px',
            fontFamily: 'Roboto Mono, monospace',
            backgroundColor: '#F2F1ED',
            border: '1px solid #E2DFD9',
            padding: '8px 12px',
            color: '#525860',
            marginBottom: '20px',
            wordBreak: 'break-word'
          }}>
            Diagnostic: {errorMsg}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={forcePurgeCacheAndReload}
            style={{
              backgroundColor: '#6F1D2B',
              color: '#FFFFFF',
              border: '1px solid #6F1D2B',
              borderRadius: '2px',
              padding: '10px 20px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Clear Cache &amp; Force Reload
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#1A1D20',
              border: '1px solid #C8C4BC',
              borderRadius: '2px',
              padding: '10px 16px',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Standard Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || 'Unexpected runtime error' };
  }
  render() {
    if (this.state.hasError) {
      return <CrashRecoveryScreen errorMsg={this.state.errorMsg} />;
    }
    return this.props.children;
  }
}

// ─── Changelog Page ──────────────────────────────────────────────
const ChangelogPage = ({ onGoHome }) => {
  return (
    <div className="about-container">
      <div className="about-card">
        <div className="changelog-header-top">
          <div>
            <h1 className="about-title">Site Changelog & Update History</h1>
            <p className="about-lead">
              Complete log of speed optimizations, index updates, bug fixes, and UI improvements deployed to Conceptualist Systems.
            </p>
          </div>
          <div className="changelog-build-box">
            <div className="changelog-build-version">Current Build: <strong>{APP_VERSION}</strong></div>
            <div className="changelog-build-time">Deployed: {formatUpdateTimestamp(BUILD_TIMESTAMP)}</div>
            <button type="button" className="changelog-purge-btn" onClick={forcePurgeCacheAndReload}>
              Clear Cache &amp; Force Reload
            </button>
          </div>
        </div>

        <hr className="about-divider" />

        <div className="changelog-list">
          {CHANGELOG_HISTORY.map((entry, idx) => (
            <div key={entry.version} className={`changelog-entry ${idx === 0 ? 'latest' : ''}`}>
              <div className="changelog-entry-header">
                <div className="changelog-version-group">
                  <span className={`changelog-badge ${idx === 0 ? 'latest' : ''}`}>
                    {entry.version} {idx === 0 ? '• Latest' : ''}
                  </span>
                  <h2 className="changelog-entry-title">{entry.title}</h2>
                </div>
                <span className="changelog-entry-date">{formatUpdateTimestamp(entry.date)}</span>
              </div>
              <p className="changelog-entry-summary">{entry.summary}</p>
              <ul className="changelog-bullets">
                {entry.changes.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '28px' }}>
          <button className="search-button" onClick={onGoHome}>
            ← Return to Library Repository
          </button>
        </div>
      </div>
    </div>
  );
};
const AboutPage = ({ onGoHome }) => {
  return (
    <div className="about-container">
      <div className="about-card">
        <h1 className="about-title">About Conceptualist Systems</h1>
        <p className="about-lead">
          Conceptualist Systems is an independent academic resource platform dedicated to open, fast, and structured access to international examination materials.
        </p>

        <hr className="about-divider" />

        <div className="about-section">
          <h2>Who We Are</h2>
          <p>
            We are a team of educators and developers committed to indexing, organizing, and archiving examination resources for students and teachers worldwide.
          </p>
          <div className="team-grid">
            <div className="team-card">
              <div className="team-name">Diavlon</div>
              <div className="team-role">Founder & Lead Architect</div>
            </div>
            <div className="team-card">
              <div className="team-name">Naz</div>
              <div className="team-role">Co-Founder & Systems Lead</div>
            </div>
          </div>
        </div>

        <div className="about-section">
          <h2>Our Mission</h2>
          <p>
            Navigating past papers, mark schemes, examiner reports, and reference books should be effortless.
            Our platform indexes thousands of documents across Edexcel GCE, International A-Level (IAL) and International GCSE (IGCSE) qualifications into a high-speed, searchable catalog.
          </p>
        </div>

        <div className="about-section">
          <h2>Contact & Inquiries</h2>
          <p>
            For resource submissions, feedback, or general inquiries, please contact us directly:
          </p>
          <div className="contact-box">
            <strong>Direct Email:</strong>{' '}
            <a href="mailto:diavlon.pxa@gmail.com">diavlon.pxa@gmail.com</a>
          </div>
        </div>

        <div style={{ marginTop: '28px' }}>
          <button className="search-button" onClick={onGoHome}>
            ← Return to Library Repository
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Interactive Step-by-Step Homepage Navigator ──────────────────
const WelcomePage = ({ data, onSubjectSelect, onViewAll, onCurriculumSelect, onSelectFinalFilter }) => {
  const [selectedSubject, setSelectedSubject] = useState(null); // { name, curriculum }
  const [selectedUnit, setSelectedUnit] = useState(null); // string | null

  const ialSubjects = data.meta?.ialSubjects || data.meta?.subjects || [];
  const igcseSubjects = data.meta?.igcseSubjects || [
    'Accounting', 'Bangla', 'Biology', 'Business', 'Chemistry', 'Commerce',
    'Computer Science', 'Economics', 'English Language A', 'English Language B',
    'English Literature', 'Further Pure Mathematics', 'Geography', 'Human Biology',
    'Information Technology', 'Mathematics A', 'Mathematics B', 'Physics'
  ];
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
    const files = data.flatFiles.filter(
      f => f.subject === name && (!curriculum || f.curriculum === curriculum)
    );
    const map = {};
    files.forEach(f => {
      const cleanLabel = f.cleanUnitLabel || getCleanUnitLabel(f);
      if (cleanLabel) {
        if (!map[cleanLabel]) map[cleanLabel] = { count: 0, years: new Set() };
        map[cleanLabel].count++;
        if (f.year) map[cleanLabel].years.add(f.year);
      }
    });
    const out = {};
    Object.keys(map).sort((a, b) => a.localeCompare(b)).forEach(k => {
      out[k] = { count: map[k].count, years: Array.from(map[k].years).sort((a, b) => b - a) };
    });
    return out;
  }, [wizardMeta, data.flatFiles, selectedSubject]);

  const availableUnits = useMemo(() => Object.keys(availableUnitsMap), [availableUnitsMap]);

  // Group available units logically by their prefix/type
  const groupedUnits = useMemo(() => {
    if (!availableUnits.length) return {};
    const groups = {};
    availableUnits.forEach(unit => {
      let groupName = 'Course Units';
      if (unit.includes('Further Pure')) groupName = 'Further Pure Mathematics';
      else if (unit.includes('Pure')) groupName = 'Pure Mathematics';
      else if (unit.includes('Core')) groupName = 'Core Mathematics';
      else if (unit.includes('Mechanics')) groupName = 'Mechanics';
      else if (unit.includes('Statistics')) groupName = 'Statistics';
      else if (unit.includes('Decision')) groupName = 'Decision Mathematics';
      else if (unit.includes('Unit')) groupName = 'Course Units';
      else if (unit.includes('Paper')) groupName = 'Examination Papers';

      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(unit);
    });
    return groups;
  }, [availableUnits]);

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
    setSelectedSubject({ name: subjectName, curriculum });
    setSelectedUnit(null);
  };

  const handleUnitClick = (unitName) => {
    setSelectedUnit(unitName);
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
      <div className="welcome-hero">
        <div className="welcome-hero-top">
          <div>
            <h1>Past Exam Papers & Course Resources</h1>
            <p>
              Welcome to Conceptualist Systems online repository. Select a qualification or subject below to interactively filter by unit, module, and examination year.
            </p>
          </div>
          <div className="hero-stats-row">
            <div className="hero-stat-pill">
              <strong>{(data.meta?.totalFiles || 13309).toLocaleString()}</strong>
              <span>Total Files</span>
            </div>
            <div className="hero-stat-pill">
              <strong>{ialSubjects.length + igcseSubjects.length}</strong>
              <span>Subjects</span>
            </div>
          </div>
        </div>
        <div className="welcome-hero-actions">
          <button className="search-button" onClick={onViewAll}>
            Browse All Documents →
          </button>
          <button className="filter-btn hero-action-btn" onClick={() => onCurriculumSelect('Edexcel IAL')}>
            Edexcel IAL Collection
          </button>
          <button className="filter-btn hero-action-btn igcse" onClick={() => onCurriculumSelect('Edexcel IGCSE')}>
            Edexcel IGCSE Collection
          </button>
        </div>
      </div>

      {/* STEP 2 / STEP 3 INTERACTIVE DRILLDOWN WIZARD */}
      {selectedSubject ? (
        <div className="interactive-wizard-card">
          <div className="wizard-breadcrumb">
            <button
              className="wizard-back-btn"
              onClick={() => { if (selectedUnit) setSelectedUnit(null); else setSelectedSubject(null); }}
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
                <button
                  className="wizard-option-btn primary"
                  onClick={() => onSubjectSelect(selectedSubject.name, selectedSubject.curriculum)}
                  style={{ width: '100%', marginBottom: '20px' }}
                >
                  <span>View All {formatSubjectDisplay(selectedSubject.name)} Units, Papers & Textbooks →</span>
                </button>
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
                        return (
                          <button
                            key={unitName}
                            className="wizard-option-btn"
                            onClick={() => handleUnitClick(unitName)}
                          >
                            <span>{unitName}</span>
                            {unitCount ? <span className="wizard-unit-count">{unitCount}</span> : null}
                          </button>
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
                <button
                  className="wizard-option-btn primary"
                  onClick={() => handleYearClick('')}
                  style={{ width: '100%' }}
                >
                  <span>All Examination Years for {selectedUnit} →</span>
                </button>
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
              return (
                <div
                  key={`ial-${subject}`}
                  className="subject-card"
                  onClick={() => handleSubjectClick(subject, 'Edexcel IAL')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSubjectClick(subject, 'Edexcel IAL'); }}
                >
                  <div className="subject-card-top">
                    <div className="subject-card-title">{formatSubjectDisplay(subject)}</div>
                    {docCount > 0 && <span className="subject-card-count">{docCount} docs</span>}
                  </div>
                  <div className="subject-card-subtitle">
                    {ialSubjectCoverage[subject] || 'Edexcel IAL Collection'}
                    {unitCount > 0 ? ` • ${unitCount} ${unitCount === 1 ? 'Unit' : 'Units'}` : ''}
                  </div>
                </div>
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
              return (
                <div
                  key={`igcse-${subject}`}
                  className="subject-card igcse"
                  onClick={() => handleSubjectClick(subject, 'Edexcel IGCSE')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSubjectClick(subject, 'Edexcel IGCSE'); }}
                >
                  <div className="subject-card-top">
                    <div className="subject-card-title">{subject}</div>
                    {docCount > 0 && <span className="subject-card-count igcse">{docCount} docs</span>}
                  </div>
                  <div className="subject-card-subtitle">
                    {igcseSubjectCoverage[subject] || 'International GCSE Collection'}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// Read cached meta synchronously so repeat visits render in 0ms before fetch even begins
function getInitialCachedMeta() {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const tree = parsed.compactTree ? inflateCompactTree(parsed.compactTree) : parsed.tree;
    if (tree && parsed.meta) {
      return { tree, meta: parsed.meta };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

// ─── Main Application ────────────────────────────────────────────
function App() {
  const initialCache = useMemo(() => getInitialCachedMeta(), []);

  const [data, setData] = useState(() => ({
    tree: initialCache?.tree || null,
    flatFiles: [],
    dedupedFiles: [],
    unifiedFiles: [],
    meta: initialCache?.meta || {}
  }));
  const [loading, setLoading] = useState(!initialCache?.tree);
  const [filesLoading, setFilesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedPath, setSelectedPath] = useState('');
  const [expandedPaths, setExpandedPaths] = useState(new Set(['']));
  const [currentTab, setCurrentTab] = useState('library'); // 'library' | 'about' | 'changelog'
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [previewFile, setPreviewFile] = useState(null);
  const [viewMode, setViewMode] = useState('unified'); // 'unified' | 'separate'

  // Filters
  const [filterCurriculum, setFilterCurriculum] = useState(''); // '' | 'Edexcel IAL' | 'Edexcel IGCSE'
  const [filterDocType, setFilterDocType] = useState(null); // 'QP' | 'MS' | 'ER' | 'Book' | 'Extra' | null
  const [filterSubject, setFilterSubject] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // Default to newest first so recent 2026/2025 papers appear at top
  const [forceShowTable, setForceShowTable] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const searchInputRef = useRef(null);

  // Auto 404 / Unknown path fallback to Homepage
  useEffect(() => {
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  // Global keyboard shortcut: '/' or Ctrl+K / Cmd+K focuses search input
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const buildQuery = encodeURIComponent(BUILD_TIMESTAMP);
    // Clean up any older build caches in localStorage
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cs_library_meta_') && k !== META_CACHE_KEY) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // Ignore storage errors
    }

    let metaLoadedTree = Boolean(initialCache?.tree);

    const loadFullIndex = () => {
      // Stage 2: Background load full index.json after initial UI paint
      fetch(`/index.json?v=${buildQuery}`)
        .then(res => {
          if (!res.ok) return fetch(`/index.json?nocache=${Date.now()}`, { cache: 'reload' });
          return res;
        })
        .then(res => res.json())
        .then(json => {
          setTimeout(() => {
            const tree = !metaLoadedTree
              ? (json.compactTree ? inflateCompactTree(json.compactTree) : json.tree)
              : null;
            let rawList = [];
            if (json.files && json.keys) {
              const keys = json.keys;
              const kLen = keys.length;
              rawList = new Array(json.files.length);
              for (let i = 0; i < json.files.length; i++) {
                const arr = json.files[i];
                const fileObj = {};
                for (let j = 0; j < kLen; j++) {
                  fileObj[keys[j]] = arr[j];
                }
                rawList[i] = fileObj;
              }
            } else {
              rawList = json.flatFiles || [];
            }

            // Enrich files in a single ultra-fast pass using precomputed variant & cleanUnitLabel
            const flatFiles = new Array(rawList.length);
            for (let i = 0; i < rawList.length; i++) {
              const fileObj = rawList[i];
              if (fileObj.name && fileObj.name.includes('_17')) fileObj.name = fileObj.name.replace(/_\d{10,14}/g, '');
              if (fileObj.path && fileObj.path.includes('_17')) fileObj.path = fileObj.path.replace(/_\d{10,14}/g, '');

              const dotIdx = fileObj.name ? fileObj.name.lastIndexOf('.') : -1;
              fileObj.ext = dotIdx !== -1 ? fileObj.name.slice(dotIdx + 1).toLowerCase() : '';
              fileObj.curriculum = fileObj.spec === 'IGCSE' || fileObj.category === 'IGCSE Books' ? 'Edexcel IGCSE' : 'Edexcel IAL';
              if (fileObj.variant === undefined) fileObj.variant = extractVariant(fileObj);
              if (fileObj.cleanUnitLabel === undefined) fileObj.cleanUnitLabel = getCleanUnitLabel(fileObj);

              if (!fileObj.sortKey) {
                let sessionVal = 0;
                const s = fileObj.session;
                if (s) {
                  if (s.includes('Jan')) sessionVal = 1;
                  else if (s.includes('May') || s.includes('June')) sessionVal = 6;
                  else if (s.includes('Oct') || s.includes('Nov')) sessionVal = 10;
                }
                fileObj.sortKey = (fileObj.year || 2000) * 100 + sessionVal;
              }

              const v = fileObj.variant || '';
              const isReg = v === 'R' || v === 'A' || v.includes('R');
              const s = fileObj.session || '';
              const dt = fileObj.docType || '';

              fileObj.searchTerms = (
                (fileObj.name || '') + ' ' +
                (fileObj.path || '') + ' ' +
                (fileObj.subject || '') + ' ' +
                (fileObj.subject === 'Math' ? 'mathematics maths ' : fileObj.subject === 'Information Technology' ? 'it ict ' : '') +
                (fileObj.unitCode || '') + ' ' +
                (fileObj.unitName || '') + ' ' +
                (fileObj.cleanUnitLabel || '') + ' ' +
                (isReg ? 'regional ' : '') +
                s + ' ' +
                (s.includes('June') ? 'may summer ' : s.includes('October') ? 'november nov ' : '') +
                (fileObj.year || '') + ' ' +
                dt + ' ' +
                (dt === 'QP' ? 'question paper ' : dt === 'MS' ? 'mark scheme markscheme ' : dt === 'ER' ? 'examiner report ' : '') +
                fileObj.curriculum + ' ' +
                (fileObj.category || '')
              ).toLowerCase();

              flatFiles[i] = fileObj;
            }

        // Deduplicate byte-for-byte duplicate files across batches & link QP/MS/ER siblings
        const scoreFile = (f) => {
          let s = 0;
          if (f.path.includes('(')) s += 10;
          if (f.name.includes('_')) s += 5;
          return s;
        };

        const dedupMap = new Map();
        const siblingGroups = new Map();

        for (let i = 0; i < flatFiles.length; i++) {
          const f = flatFiles[i];
          const isCanonicalPaper = f.category === 'Past Papers' && f.unitCode && f.session && f.docType;
          const dedupKey = isCanonicalPaper
            ? `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}|${f.docType}|${f.ext}|${f.size}`
            : f.path;

          if (!dedupMap.has(dedupKey) || scoreFile(f) > scoreFile(dedupMap.get(dedupKey))) {
            dedupMap.set(dedupKey, f);
          }

          if (isCanonicalPaper && f.ext === 'pdf' && (f.docType === 'QP' || f.docType === 'MS' || f.docType === 'ER')) {
            const sibKey = `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}`;
            let grp = siblingGroups.get(sibKey);
            if (!grp) {
              grp = {};
              siblingGroups.set(sibKey, grp);
            }
            if (!grp[f.docType] || scoreFile(f) > scoreFile(grp[f.docType])) {
              grp[f.docType] = f;
            }
          }
        }

        // Attach sibling map to each file
        for (let i = 0; i < flatFiles.length; i++) {
          const f = flatFiles[i];
          if (f.category === 'Past Papers' && f.unitCode && f.session) {
            const sibKey = `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}`;
            f.siblings = siblingGroups.get(sibKey) || null;
          }
        }

        const dedupedFiles = Array.from(dedupMap.values());

        // Build Unified Exam Sitting entries so each exam sitting (QP + MS + ER + extras) is a single row
        const sittingMap = new Map();
        const unifiedFiles = [];
        const DOC_PRIORITY = ['QP', 'MS', 'ER', 'SOL', 'AUD', 'SC', 'DF', 'SAM'];

        for (let i = 0; i < dedupedFiles.length; i++) {
          const f = dedupedFiles[i];
          const canUnify =
            f.category === 'Past Papers' &&
            f.unitCode &&
            f.session &&
            f.docType &&
            !String(f.variant || '').startsWith('ER');

          if (!canUnify) {
            unifiedFiles.push({
              ...f,
              isUnifiedSitting: false,
              docs: f.docType ? { [f.docType]: f } : {},
              docTypes: f.docType ? [f.docType] : [],
              paths: [f.path],
              fileCount: 1,
              totalSize: f.size || 0
            });
            continue;
          }

          const sittingKey = `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}`;
          let group = sittingMap.get(sittingKey);
          if (!group) {
            group = {
              id: sittingKey,
              isUnifiedSitting: true,
              spec: f.spec,
              curriculum: f.curriculum,
              category: f.category,
              subject: f.subject,
              unitCode: f.unitCode,
              unitName: f.unitName,
              cleanUnitLabel: f.cleanUnitLabel,
              variant: f.variant,
              year: f.year,
              session: f.session,
              sortKey: f.sortKey,
              docs: {},
              paths: [],
              searchChunks: [],
              totalSize: 0
            };
            sittingMap.set(sittingKey, group);
            unifiedFiles.push(group);
          }

          if (!group.docs[f.docType] || scoreFile(f) > scoreFile(group.docs[f.docType])) {
            group.docs[f.docType] = f;
          }
          group.paths.push(f.path);
          group.searchChunks.push(f.searchTerms);
          group.totalSize += (f.size || 0);
        }

        // Finalize unified sitting metadata in one fast pass
        for (let i = 0; i < unifiedFiles.length; i++) {
          const item = unifiedFiles[i];
          if (!item.isUnifiedSitting) continue;
          const docTypes = DOC_PRIORITY.filter(t => Boolean(item.docs[t]));
          const primary = item.docs.QP || item.docs.MS || item.docs.ER || item.docs[docTypes[0]];
          const folderPath = (primary.path || '').split('/').slice(0, -1).join('/') || primary.path;
          item.docTypes = docTypes;
          item.fileCount = docTypes.length;
          item.primaryFile = primary;
          item.name = primary.name;
          item.path = primary.path;
          item.folderPath = folderPath;
          item.ext = primary.ext;
          item.size = item.totalSize;
          item.docType = primary.docType;
          item.siblings = primary.siblings;
          item.searchTerms = item.searchChunks.join(' ');
          delete item.searchChunks;
        }

            setData(prev => ({
              tree: tree || prev.tree,
              flatFiles,
              dedupedFiles,
              unifiedFiles,
              meta: json.meta || prev.meta || {}
            }));
            setLoading(false);
            setFilesLoading(false);
          }, 0);
        })
        .catch(err => {
          console.error('Failed to load index:', err);
          setLoading(false);
          setFilesLoading(false);
        });
    };

    if (metaLoadedTree) {
      // Homepage & sidebar are already rendered in 0ms from localStorage; fetch full index after first paint
      setTimeout(loadFullIndex, 0);
    } else {
      // Stage 1: Fetch tiny meta.json first (~14 KB Brotli) so Homepage renders immediately without competing with index.json
      fetch(`/meta.json?v=${buildQuery}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(json => {
          const tree = json.compactTree ? inflateCompactTree(json.compactTree) : json.tree;
          if (tree) {
            metaLoadedTree = true;
            setData(prev => ({
              ...prev,
              tree: tree || prev.tree,
              meta: json.meta || prev.meta
            }));
            setLoading(false);
            setExpandedPaths(prev => new Set([...prev, '', tree.path]));
          }
          try {
            localStorage.setItem(META_CACHE_KEY, JSON.stringify({
              compactTree: json.compactTree,
              meta: json.meta
            }));
          } catch {
            // Ignore quota errors
          }
          setTimeout(loadFullIndex, 0);
        })
        .catch(() => {
          loadFullIndex();
        });
    }
  }, [initialCache]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedPath, filterCurriculum, filterDocType, filterSubject, filterUnit, filterYear, deferredSearchQuery, sortBy, viewMode]);

  const toggleExpand = useCallback((path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSubjectSelect = useCallback((subject, curriculum = '') => {
    setCurrentTab('library');
    if (curriculum) setFilterCurriculum(curriculum);
    setFilterSubject(subject);
    setFilterUnit('');
    setFilterYear('');
    setSearchQuery('');
    setForceShowTable(true);
    setSelectedPath(data.tree?.path || '');
  }, [data.tree]);

  const handleSelectFinalFilter = useCallback(({ subject, curriculum, unit, year }) => {
    setCurrentTab('library');
    if (curriculum) setFilterCurriculum(curriculum);
    if (subject) setFilterSubject(subject);
    setFilterUnit(unit || '');
    setFilterYear(year ? String(year) : '');
    setSearchQuery('');
    setForceShowTable(true);
    setSelectedPath(data.tree?.path || '');
  }, [data.tree]);

  const clearFilters = useCallback(() => {
    setFilterCurriculum('');
    setFilterDocType(null);
    setFilterSubject('');
    setFilterUnit('');
    setFilterYear('');
    setSearchQuery('');
    setSortBy('newest');
    setForceShowTable(false);
    setSelectedPath(data.tree?.path || '');
  }, [data.tree]);

  const handleViewAll = useCallback(() => {
    setCurrentTab('library');
    setSortBy('newest');
    setForceShowTable(true);
  }, []);

  // Dynamic subject list based on selected curriculum
  const availableSubjectsForFilter = useMemo(() => {
    if (filterCurriculum === 'Edexcel IAL') return data.meta?.ialSubjects || data.meta?.subjects || [];
    if (filterCurriculum === 'Edexcel IGCSE') return data.meta?.igcseSubjects || data.meta?.subjects || [];
    return data.meta?.subjects || [];
  }, [filterCurriculum, data.meta]);

  // Dynamic unit list for filter bar when a subject is selected
  const availableUnitsForFilter = useMemo(() => {
    if (!filterSubject) return [];
    const wizard = data.meta?.wizard;
    if (wizard) {
      const set = new Set();
      const currs = filterCurriculum ? [filterCurriculum] : ['Edexcel IAL', 'Edexcel IGCSE'];
      currs.forEach(c => {
        const unitsObj = wizard[c]?.[filterSubject]?.units;
        if (unitsObj) Object.keys(unitsObj).forEach(u => set.add(u));
      });
      if (set.size > 0) return Array.from(set).sort((a, b) => a.localeCompare(b));
    }
    const set = new Set();
    data.dedupedFiles.forEach(f => {
      if (f.subject === filterSubject && (!filterCurriculum || f.curriculum === filterCurriculum) && f.cleanUnitLabel) {
        set.add(f.cleanUnitLabel);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filterSubject, filterCurriculum, data.meta, data.dedupedFiles]);

  // Dynamic year list for filter bar
  const availableYearsForFilter = useMemo(() => {
    const wizard = data.meta?.wizard;
    if (filterSubject && wizard) {
      const set = new Set();
      const currs = filterCurriculum ? [filterCurriculum] : ['Edexcel IAL', 'Edexcel IGCSE'];
      currs.forEach(c => {
        const subjEntry = wizard[c]?.[filterSubject];
        if (subjEntry) {
          const yrs = filterUnit && subjEntry.units?.[filterUnit]
            ? subjEntry.units[filterUnit].years
            : subjEntry.allYears;
          (yrs || []).forEach(y => set.add(y));
        }
      });
      if (set.size > 0) return Array.from(set).sort((a, b) => b - a);
    }
    const years = [];
    for (let y = 2026; y >= 2003; y--) years.push(y);
    return years;
  }, [filterSubject, filterCurriculum, filterUnit, data.meta]);

  const allMatchedFiles = useMemo(() => {
    const isSpecificFolder = Boolean(selectedPath && selectedPath !== '' && selectedPath !== data.tree?.path);
    const useUnified = viewMode === 'unified';

    let files = useUnified
      ? data.unifiedFiles
      : (isSpecificFolder ? data.flatFiles : data.dedupedFiles);

    if (isSpecificFolder) {
      const prefix = selectedPath.endsWith('/') ? selectedPath : `${selectedPath}/`;
      if (useUnified) {
        files = files.filter(f =>
          f.path === selectedPath ||
          f.path.startsWith(prefix) ||
          (f.paths && f.paths.some(p => p === selectedPath || p.startsWith(prefix)))
        );
      } else {
        files = files.filter(f => f.path === selectedPath || f.path.startsWith(prefix));
      }
    }

    if (filterCurriculum) {
      files = files.filter(f => f.curriculum === filterCurriculum);
    }

    if (filterSubject) {
      files = files.filter(f => f.subject === filterSubject);
    }

    if (filterUnit) {
      files = files.filter(f => f.cleanUnitLabel === filterUnit);
    }

    if (filterYear) {
      files = files.filter(f => String(f.year) === String(filterYear));
    }

    if (filterDocType) {
      if (filterDocType === 'Book') {
        files = files.filter(f => f.category === 'Books' || f.category === 'IAL Books' || f.category === 'IGCSE Books');
      } else if (filterDocType === 'Extra') {
        if (useUnified) {
          files = files.filter(f =>
            f.docs?.DF || f.docs?.AUD || f.docs?.SC || f.docs?.SAM || f.docs?.SOL ||
            f.docType === 'DF' || f.docType === 'AUD' || f.docType === 'SC' || f.docType === 'SAM' || f.docType === 'SOL'
          );
        } else {
          files = files.filter(f => f.docType === 'DF' || f.docType === 'AUD' || f.docType === 'SC' || f.docType === 'SAM' || f.docType === 'SOL');
        }
      } else if (useUnified) {
        files = files.filter(f => Boolean(f.docs?.[filterDocType] || f.docType === filterDocType));
      } else {
        files = files.filter(f => f.docType === filterDocType);
      }
    }

    const termGroups = parseSearchQuery(deferredSearchQuery);
    const hasSearch = termGroups.length > 0;
    const relevanceMap = hasSearch ? new WeakMap() : null;

    if (hasSearch) {
      const matched = [];
      for (let k = 0; k < files.length; k++) {
        const f = files[k];
        const st = f.searchTerms;
        if (!st) continue;
        let allMatched = true;
        let score = 0;

        for (let i = 0; i < termGroups.length; i++) {
          const { primary, alts } = termGroups[i];
          let matchedOne = false;
          for (let j = 0; j < alts.length; j++) {
            const alt = alts[j];
            if (st.includes(alt)) {
              matchedOne = true;
              // Boost exact primary token or exact unitCode / subject / year match
              if (alt === primary) score += 4;
              else score += 2;
              if (f.unitCode && f.unitCode.toLowerCase() === alt) score += 10;
              if (f.subject && f.subject.toLowerCase() === alt) score += 6;
              if (f.year && String(f.year) === alt) score += 5;
              break;
            }
          }
          if (!matchedOne) {
            allMatched = false;
            break;
          }
        }
        if (allMatched) {
          relevanceMap.set(f, score);
          matched.push(f);
        }
      }
      files = matched;
    }

    // Sort logic (when searching, rank by relevance score first, then newest session first)
    const docOrder = { QP: 1, MS: 2, ER: 3, SC: 4, DF: 5, AUD: 6, SAM: 7, SOL: 8 };
    const sorted = [...files];
    if (sortBy === 'newest' || sortBy === '') {
      sorted.sort((a, b) => {
        if (relevanceMap) {
          const rDiff = (relevanceMap.get(b) || 0) - (relevanceMap.get(a) || 0);
          if (rDiff !== 0) return rDiff;
        }
        const diff = (b.sortKey || 0) - (a.sortKey || 0);
        if (diff !== 0) return diff;
        const uDiff = (a.unitCode || '').localeCompare(b.unitCode || '');
        if (uDiff !== 0) return uDiff;
        const vDiff = (a.variant || '').localeCompare(b.variant || '');
        if (vDiff !== 0) return vDiff;
        return (docOrder[a.docType] || 9) - (docOrder[b.docType] || 9);
      });
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => {
        const diff = (a.sortKey || 999999) - (b.sortKey || 999999);
        if (diff !== 0) return diff;
        return (docOrder[a.docType] || 9) - (docOrder[b.docType] || 9);
      });
    } else if (sortBy === 'name_asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name_desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === 'size_desc') {
      sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
    }

    return sorted;
  }, [
    data.flatFiles,
    data.dedupedFiles,
    data.unifiedFiles,
    data.tree,
    selectedPath,
    deferredSearchQuery,
    filterCurriculum,
    filterDocType,
    filterSubject,
    filterUnit,
    filterYear,
    sortBy,
    viewMode
  ]);

  const visibleFiles = useMemo(
    () => allMatchedFiles.slice(0, visibleCount),
    [allMatchedFiles, visibleCount]
  );

  const hasActiveFilters = Boolean(
    filterCurriculum ||
    filterDocType ||
    filterSubject ||
    filterUnit ||
    filterYear ||
    searchQuery ||
    forceShowTable
  );
  const isRoot = selectedPath === data.tree?.path || selectedPath === '';
  const showWelcome = isRoot && !hasActiveFilters;

  const activeDateText = useMemo(() => {
    if (filterSubject) {
      const cov = filterCurriculum === 'Edexcel IGCSE'
        ? data.meta?.igcseSubjectCoverage?.[filterSubject]
        : (filterCurriculum === 'Edexcel IAL'
            ? data.meta?.ialSubjectCoverage?.[filterSubject]
            : data.meta?.subjectCoverage?.[filterSubject]);
      if (cov) return `${formatSubjectDisplay(filterSubject)}: ${cov}`;
    }
    return data.meta?.coverage || 'January 2003 – January 2026';
  }, [filterSubject, filterCurriculum, data.meta]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#1A1D20', fontFamily: 'Roboto, sans-serif' }}>
        Loading Repository Index...
      </div>
    );
  }

  if (!data.tree) {
    return <CrashRecoveryScreen errorMsg="Repository directory tree missing or stale cache encountered." />;
  }

  const breadcrumbParts = selectedPath ? selectedPath.split(/[\\/]/).filter(Boolean) : [];

  const renderBreadcrumbs = (classNameAdd = '') => (
    <div className={`breadcrumb-container ${classNameAdd}`}>
      <div className="breadcrumb-trail">
        <span className="breadcrumb-link home" onClick={clearFilters}>
          ← Library Home
        </span>
        {filterCurriculum && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-link" onClick={() => setFilterCurriculum('')} title="Click to remove curriculum filter">
              {filterCurriculum} ×
            </span>
          </>
        )}
        {filterSubject && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-link" onClick={() => { setFilterSubject(''); setFilterUnit(''); }} title="Click to remove subject filter">
              {formatSubjectDisplay(filterSubject)} ×
            </span>
          </>
        )}
        {filterUnit && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-link" onClick={() => setFilterUnit('')} title="Click to remove unit filter">
              {filterUnit} ×
            </span>
          </>
        )}
        {filterYear && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-link" onClick={() => setFilterYear('')} title="Click to remove year filter">
              {filterYear} ×
            </span>
          </>
        )}
        {filterDocType && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-link" onClick={() => setFilterDocType(null)} title="Click to remove document type filter">
              {DOC_TYPE_INFO[filterDocType]?.fullLabel || filterDocType} ×
            </span>
          </>
        )}
        {breadcrumbParts.map((part, i) => (
          <React.Fragment key={i}>
            <span className="breadcrumb-separator">/</span>
            <span
              className="breadcrumb-link"
              onClick={() => {
                const pathSlice = breadcrumbParts.slice(0, i + 1).join('/');
                setSelectedPath(pathSlice);
                setForceShowTable(true);
              }}
            >
              {part}
            </span>
          </React.Fragment>
        ))}
        {searchQuery && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-link" onClick={() => setSearchQuery('')} title="Clear search query">
              Search: &ldquo;{searchQuery}&rdquo; ×
            </span>
          </>
        )}
      </div>

      <div className="result-summary">
        {filesLoading ? (
          <span>Loading full catalog...</span>
        ) : allMatchedFiles.length > visibleFiles.length ? (
          <>
            Showing <strong>{visibleFiles.length}</strong> of <strong>{allMatchedFiles.length.toLocaleString()}</strong>{' '}
            {viewMode === 'unified' ? 'exam sittings' : 'documents'}
          </>
        ) : (
          <>
            Displaying <strong>{allMatchedFiles.length.toLocaleString()}</strong> matching{' '}
            {viewMode === 'unified'
              ? (allMatchedFiles.length === 1 ? 'exam sitting' : 'exam sittings')
              : (allMatchedFiles.length === 1 ? 'document' : 'documents')}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header-top">
        <div className={`header-top-row ${!showWelcome ? 'mobile-hidden' : ''}`}>
          <div
            className="brand-section"
            onClick={() => { setCurrentTab('library'); clearFilters(); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setCurrentTab('library'); clearFilters(); } }}
          >
            <div className="brand-logo-text">
              Conceptualist <span className="brand-logo-accent">Systems</span>
            </div>
            <div className="brand-tagline">
              <span className="title">EDEXCEL LIBRARY</span>
              <span>Past Exam Papers & Resources</span>
            </div>
          </div>

          <div className="header-right-group">
            <div className="header-coverage-badge">
              <strong>{activeDateText}</strong>
            </div>
            <button
              type="button"
              className={`header-nav-btn ${currentTab === 'about' ? 'active' : ''}`}
              onClick={() => setCurrentTab(currentTab === 'about' ? 'library' : 'about')}
            >
              {currentTab === 'about' ? '← Library' : 'About'}
            </button>
          </div>
        </div>

        {/* Integrated Mobile Header Breadcrumb Strip */}
        {currentTab === 'library' && !showWelcome && (
          <div className="mobile-header-breadcrumb">
            {renderBreadcrumbs('mobile-header-breadcrumb-content')}
          </div>
        )}
      </header>

      {/* Main Search & Filter Banner (only shown in library tab) */}
      {currentTab === 'library' && (
        <div className="search-banner">
          <div className="search-row">
            <div className="search-input-wrapper">
              <label htmlFor="search-input" className="sr-only">
                Search repository by course code, subject, unit or year
              </label>
              <svg className="search-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                ref={searchInputRef}
                id="search-input"
                type="text"
                className="search-input"
                placeholder="Search by course code, subject, unit or year (e.g. WMA11, Chemistry, M1 Jan 2025, 4MA1)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search by course code, subject, unit or year"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                  aria-label="Clear search query"
                >
                  ✕
                </button>
              ) : (
                <kbd className="search-shortcut-hint" title="Press / to search">/</kbd>
              )}
            </div>
            <div className="search-button-group">
              <button
                type="button"
                className={`mobile-filter-toggle ${showMobileFilters ? 'active' : ''}`}
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                aria-label="Toggle Filters"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
              </button>
            </div>
          </div>

          {/* Filter Controls Section */}
          <div className={`filter-controls-container ${!showMobileFilters ? 'mobile-hidden' : ''}`}>
            {/* Row 1: Curriculum & Document Type */}
            <div className="filter-row">
              <span className="filter-group-label">Curriculum:</span>
              <div className="filter-pills" role="group" aria-label="Filter by curriculum">
                <button
                  type="button"
                  className={`filter-btn ${filterCurriculum === '' ? 'active' : ''}`}
                  onClick={() => setFilterCurriculum('')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filterCurriculum === 'Edexcel IAL' ? 'active' : ''}`}
                  onClick={() => {
                    setFilterCurriculum(filterCurriculum === 'Edexcel IAL' ? '' : 'Edexcel IAL');
                    setForceShowTable(true);
                  }}
                >
                  Edexcel IAL
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filterCurriculum === 'Edexcel IGCSE' ? 'active' : ''}`}
                  onClick={() => {
                    setFilterCurriculum(filterCurriculum === 'Edexcel IGCSE' ? '' : 'Edexcel IGCSE');
                    setForceShowTable(true);
                  }}
                >
                  Edexcel IGCSE
                </button>
              </div>

              <span className="filter-group-label" style={{ marginLeft: '8px' }}>Type:</span>
              <div className="filter-pills" role="group" aria-label="Filter by document type">
                <button
                  type="button"
                  className={`filter-btn ${filterDocType === null ? 'active' : ''}`}
                  onClick={() => setFilterDocType(null)}
                >
                  All Types
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filterDocType === 'QP' ? 'active' : ''}`}
                  onClick={() => { setFilterDocType(filterDocType === 'QP' ? null : 'QP'); setForceShowTable(true); }}
                >
                  Question Papers
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filterDocType === 'MS' ? 'active' : ''}`}
                  onClick={() => { setFilterDocType(filterDocType === 'MS' ? null : 'MS'); setForceShowTable(true); }}
                >
                  Mark Schemes
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filterDocType === 'ER' ? 'active' : ''}`}
                  onClick={() => { setFilterDocType(filterDocType === 'ER' ? null : 'ER'); setForceShowTable(true); }}
                >
                  Examiner Reports
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filterDocType === 'Book' ? 'active' : ''}`}
                  onClick={() => { setFilterDocType(filterDocType === 'Book' ? null : 'Book'); setForceShowTable(true); }}
                >
                  Textbooks
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filterDocType === 'Extra' ? 'active' : ''}`}
                  onClick={() => { setFilterDocType(filterDocType === 'Extra' ? null : 'Extra'); setForceShowTable(true); }}
                >
                  Audio / Data / SAMs
                </button>
              </div>
            </div>

            {/* Row 2: Subject, Unit, Year & Sort Dropdowns */}
            <div className="filter-row" style={{ marginTop: '2px' }}>
              <label htmlFor="subject-select" className="filter-group-label">Subject:</label>
              <select
                id="subject-select"
                aria-label="Filter documents by subject"
                className="filter-select"
                value={filterSubject}
                onChange={(e) => {
                  setFilterSubject(e.target.value);
                  setFilterUnit('');
                  if (e.target.value) setForceShowTable(true);
                }}
              >
                <option value="">All Subjects</option>
                {availableSubjectsForFilter.map(s => (
                  <option key={s} value={s}>{formatSubjectDisplay(s)}</option>
                ))}
              </select>

              {availableUnitsForFilter.length > 0 && (
                <>
                  <label htmlFor="unit-select" className="filter-group-label" style={{ marginLeft: '8px' }}>Unit/Paper:</label>
                  <select
                    id="unit-select"
                    aria-label="Filter documents by unit or paper"
                    className="filter-select"
                    value={filterUnit}
                    onChange={(e) => {
                      setFilterUnit(e.target.value);
                      setForceShowTable(true);
                    }}
                  >
                    <option value="">All Units & Papers</option>
                    {availableUnitsForFilter.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </>
              )}

              <label htmlFor="year-select" className="filter-group-label" style={{ marginLeft: '8px' }}>Year:</label>
              <select
                id="year-select"
                aria-label="Filter documents by examination year"
                className="filter-select"
                value={filterYear}
                onChange={(e) => {
                  setFilterYear(e.target.value);
                  if (e.target.value) setForceShowTable(true);
                }}
              >
                <option value="">All Years</option>
                {availableYearsForFilter.map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>

              <label htmlFor="sort-select" className="filter-group-label" style={{ marginLeft: '8px' }}>Sort:</label>
              <select
                id="sort-select"
                aria-label="Sort documents"
                className="filter-select"
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setForceShowTable(true); }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name_asc">Name (A–Z)</option>
                <option value="name_desc">Name (Z–A)</option>
                <option value="size_desc">File Size (Largest)</option>
              </select>

              <span className="filter-group-label" style={{ marginLeft: '8px' }}>View:</span>
              <div className="view-mode-toggle" role="group" aria-label="Toggle Unified Sittings vs Individual Files">
                <button
                  type="button"
                  className={`view-mode-btn ${viewMode === 'unified' ? 'active' : ''}`}
                  onClick={() => setViewMode('unified')}
                  title="Combine QP, MS, and ER from the same sitting into one row"
                >
                  Unified Sittings
                </button>
                <button
                  type="button"
                  className={`view-mode-btn ${viewMode === 'separate' ? 'active' : ''}`}
                  onClick={() => setViewMode('separate')}
                  title="Show every file as a separate row"
                >
                  Individual Files
                </button>
              </div>

              {hasActiveFilters && (
                <button type="button" className="filter-reset-btn" onClick={clearFilters}>
                  Reset All
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="main-layout">
        {/* Sidebar Navigation */}
        {currentTab === 'library' && (
          <aside className="sidebar" aria-label="Repository Categories Tree">
            <div className="sidebar-title">Repository Categories</div>
            <TreeNode
              node={data.tree}
              currentPath={selectedPath}
              onSelect={(p) => { setSelectedPath(p); setForceShowTable(p !== data.tree?.path); }}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
            />
          </aside>
        )}

        {/* Main Content Area */}
        <main className="content-area">
          {currentTab === 'about' ? (
            <AboutPage onGoHome={() => setCurrentTab('library')} />
          ) : currentTab === 'changelog' ? (
            <ChangelogPage onGoHome={() => setCurrentTab('library')} />
          ) : showWelcome ? (
            <WelcomePage
              data={data}
              onSubjectSelect={handleSubjectSelect}
              onViewAll={handleViewAll}
              onCurriculumSelect={(c) => { setFilterCurriculum(c); setForceShowTable(true); }}
              onSelectFinalFilter={handleSelectFinalFilter}
            />
          ) : (
            <>
              {/* Desktop Breadcrumb Bar */}
              {renderBreadcrumbs('desktop-breadcrumb')}

              {/* Document List / Data Table */}
              {filesLoading && visibleFiles.length === 0 ? (
                <div className="no-results-box">
                  <h3>Loading full document catalog...</h3>
                  <p>Preparing 13,309 examination papers and textbooks.</p>
                </div>
              ) : visibleFiles.length > 0 ? (
                <div className="file-list">
                  <table className="file-table">
                    <thead>
                      <tr>
                        <th style={{ width: viewMode === 'unified' ? '42%' : '50%' }}>
                          {viewMode === 'unified' ? 'Exam Sitting / Resource' : 'Document'}
                        </th>
                        <th style={{ width: viewMode === 'unified' ? '23%' : '28%' }}>Course & Session</th>
                        <th style={{ width: viewMode === 'unified' ? '35%' : '22%' }}>
                          {viewMode === 'unified' ? 'Open Paper / Mark Scheme / Report' : 'Type & Quick Links'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFiles.map((file) => {
                        const isUnified = Boolean(viewMode === 'unified' && file.isUnifiedSitting);
                        const activeDoc = isUnified
                          ? ((filterDocType && file.docs?.[filterDocType]) || file.primaryFile || file)
                          : file;
                        const badge = getDocTypeBadge(activeDoc.docType, activeDoc.category);
                        const displayTitle = isUnified ? getUnifiedSittingTitle(file) : getDisplayTitle(file);
                        const titleCls = isUnified ? 'title-unified' : (badge ? `title-${badge.cls}` : 'title-default');
                        const shortUnit = getShortUnitDisplay(file);
                        const isPdf = activeDoc.ext === 'pdf';
                        const siblings = file.siblings || null;
                        const docs = file.docs || {};

                        return (
                          <tr key={file.id || file.path} className={isUnified ? 'unified-sitting-row' : ''}>
                            <td className="file-title-cell">
                              <div className="file-title-row">
                                <a
                                  href={getHfUrl(activeDoc.path)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={titleCls}
                                  title={isUnified ? `Open ${DOC_TYPE_INFO[activeDoc.docType]?.fullLabel || 'Document'} (${displayTitle})` : displayTitle}
                                >
                                  {displayTitle}
                                </a>
                              </div>
                              <div className="file-meta-subrow">
                                <span className="file-path-subtext file-location" title={isUnified ? file.folderPath : file.path}>
                                  {isUnified ? file.folderPath : file.path}
                                </span>
                                {isUnified ? (
                                  <span className="unified-count-tag">
                                    {file.fileCount} {file.fileCount === 1 ? 'file' : 'files'} ({file.docTypes.join(' • ')})
                                    {file.totalSize ? ` • ${formatBytes(file.totalSize)}` : ''}
                                  </span>
                                ) : file.size ? (
                                  <span className="file-size-tag">
                                    {formatBytes(file.size)} • {(file.ext || 'PDF').toUpperCase()}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <div className="details-primary">
                                {formatSubjectDisplay(file.subject)}
                                {!(file.category === 'Books' || file.category === 'IAL Books' || file.category === 'IGCSE Books') && shortUnit
                                  ? ` — ${shortUnit}`
                                  : ''}
                              </div>
                              <div className="details-secondary">
                                <span className={`curr-mini-badge ${file.curriculum === 'Edexcel IGCSE' ? 'igcse' : 'ial'}`}>
                                  {file.curriculum ? file.curriculum.replace('Edexcel ', '') : 'IAL'}
                                </span>
                                {file.session ? (
                                  <span className="session-pill-tag">{file.session}</span>
                                ) : file.year ? (
                                  <span>Year {file.year}</span>
                                ) : (
                                  <span>Reference Resource</span>
                                )}
                              </div>
                            </td>
                            <td>
                              {isUnified ? (
                                <div className="unified-actions-cell">
                                  {docs.QP && (
                                    <a
                                      href={getHfUrl(docs.QP.path)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="unified-doc-btn qp"
                                      title={`Open Question Paper — ${docs.QP.name} (${formatBytes(docs.QP.size)})`}
                                    >
                                      <span>Question Paper</span>
                                      <span className="btn-code">[QP]</span>
                                    </a>
                                  )}
                                  {docs.MS && (
                                    <a
                                      href={getHfUrl(docs.MS.path)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="unified-doc-btn ms"
                                      title={`Open Mark Scheme — ${docs.MS.name} (${formatBytes(docs.MS.size)})`}
                                    >
                                      <span>Mark Scheme</span>
                                      <span className="btn-code">[MS]</span>
                                    </a>
                                  )}
                                  {docs.ER && (
                                    <a
                                      href={getHfUrl(docs.ER.path)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="unified-doc-btn er"
                                      title={`Open Examiner Report — ${docs.ER.name} (${formatBytes(docs.ER.size)})`}
                                    >
                                      <span>Examiner Report</span>
                                      <span className="btn-code">[ER]</span>
                                    </a>
                                  )}
                                  {['AUD', 'SC', 'DF', 'SOL', 'SAM'].map((extraType) => {
                                    const extraDoc = docs[extraType];
                                    if (!extraDoc) return null;
                                    const labelMap = {
                                      AUD: 'Audio',
                                      SC: 'Source',
                                      DF: 'Data Files',
                                      SOL: 'Solutions',
                                      SAM: 'Specimen'
                                    };
                                    return (
                                      <a
                                        key={extraType}
                                        href={getHfUrl(extraDoc.path)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="unified-doc-btn extra"
                                        title={`Open ${DOC_TYPE_INFO[extraType]?.fullLabel || extraType} — ${extraDoc.name}`}
                                      >
                                        <span>{labelMap[extraType] || extraType}</span>
                                        <span className="btn-code">[{extraType}]</span>
                                      </a>
                                    );
                                  })}
                                  {isPdf && (
                                    <button
                                      type="button"
                                      className="unified-preview-btn"
                                      onClick={() => setPreviewFile(activeDoc)}
                                      title="Quick In-App Preview & Side-by-Side (QP + MS) Split View"
                                    >
                                      Preview
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="row-actions-cell">
                                  {viewMode === 'unified' ? (
                                    <a
                                      href={getHfUrl(file.path)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`unified-doc-btn ${badge?.cls === 'book' || badge?.cls === 'sol' ? 'book' : (badge?.cls || 'extra')}`}
                                    >
                                      <span>
                                        {badge?.cls === 'book'
                                          ? 'Open Textbook'
                                          : badge?.cls === 'sol'
                                            ? 'Worked Solutions'
                                            : `Open ${badge?.fullLabel || 'Resource'}`}
                                      </span>
                                      <span className="btn-code">[{badge?.label || 'DOC'}]</span>
                                    </a>
                                  ) : (
                                    <>
                                      {badge ? (
                                        <span className={`doc-badge ${badge.cls}`} title={badge.fullLabel}>
                                          {badge.label}
                                        </span>
                                      ) : (
                                        <span className="doc-badge default">Doc</span>
                                      )}

                                      {/* Companion QP / MS / ER Quick-Open Links for the exact same sitting */}
                                      {siblings && ['QP', 'MS', 'ER'].map((sibType) => {
                                        if (sibType === file.docType) return null;
                                        const sib = siblings[sibType];
                                        if (!sib) return null;
                                        return (
                                          <a
                                            key={sibType}
                                            href={getHfUrl(sib.path)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={`sibling-pill ${sibType.toLowerCase()}`}
                                            title={`Open matching ${DOC_TYPE_INFO[sibType]?.fullLabel} (${file.session})`}
                                          >
                                            {sibType} ↗
                                          </a>
                                        );
                                      })}
                                    </>
                                  )}

                                  {isPdf && (
                                    <button
                                      type="button"
                                      className={viewMode === 'unified' ? 'unified-preview-btn' : 'preview-btn'}
                                      onClick={() => setPreviewFile(activeDoc)}
                                      title="Quick In-App PDF Preview"
                                    >
                                      Preview
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Fast Pagination Footer */}
                  {allMatchedFiles.length > visibleFiles.length && (
                    <div className="pagination-bar">
                      <span className="pagination-info">
                        Showing <strong>{visibleFiles.length}</strong> of <strong>{allMatchedFiles.length.toLocaleString()}</strong> matching documents
                      </span>
                      <div className="pagination-actions">
                        <button
                          type="button"
                          className="search-button pagination-btn"
                          onClick={() => setVisibleCount(c => c + 100)}
                        >
                          Load 100 More ↓
                        </button>
                        {allMatchedFiles.length - visibleFiles.length <= 600 && (
                          <button
                            type="button"
                            className="filter-btn"
                            onClick={() => setVisibleCount(allMatchedFiles.length)}
                          >
                            Show All ({allMatchedFiles.length.toLocaleString()})
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-results-box">
                  <h3>No matching documents found</h3>
                  <p>Try refining your search terms or resetting an active filter above.</p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="search-button"
                      style={{ marginTop: '14px' }}
                      onClick={clearFilters}
                    >
                      Reset All Filters
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* In-App PDF Preview Modal */}
      {previewFile && (
        <PreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onSwitchFile={(newFile) => setPreviewFile(newFile)}
        />
      )}

      {/* Global Footer at the Very Bottom */}
      <footer className="footer-bottom">
        <div className="footer-left-col">
          <div>© 2026 <strong>Conceptualist Systems</strong> — All Rights Reserved</div>
          <div
            className="footer-update-micro"
            onClick={() => setCurrentTab('changelog')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCurrentTab('changelog'); }}
            title="Click to view full site changelog & version history"
          >
            Last updated {formatUpdateTimestamp(BUILD_TIMESTAMP)} ({CHANGELOG_HISTORY[0].version}): {CHANGELOG_HISTORY[0].summary}
          </div>
        </div>
        <div className="footer-links">
          <span className="footer-link" onClick={() => { setCurrentTab('library'); clearFilters(); }}>
            Library Home
          </span>
          <span className="footer-sep">•</span>
          <span className="footer-link" onClick={() => setCurrentTab('changelog')}>
            Changelog
          </span>
          <span className="footer-sep">•</span>
          <span className="footer-link" onClick={() => setCurrentTab('about')}>
            About Us & Team
          </span>
          <span className="footer-sep">•</span>
          <a href="mailto:diavlon.pxa@gmail.com" className="footer-link">
            Contact Us
          </a>
        </div>
      </footer>
    </div>
  );
}

export default function RootApp() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
