/* global __APP_BUILD_TIME__ */
import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import './index.css';
import {
  SITE_URL,
  buildRoutePath,
  parseRouteFromLocation,
  getSeoMetadata,
  buildJsonLd,
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug
} from './seoRoutes.js';

const PAGE_SIZE = 80;
const BUILD_TIMESTAMP = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '2026-11-08T02:00:00.000Z';
const APP_VERSION = 'v3.5';
const META_CACHE_KEY = `cs_library_meta_${APP_VERSION}_${BUILD_TIMESTAMP}`;

const CHANGELOG_HISTORY = [
  {
    version: 'v3.5',
    date: BUILD_TIMESTAMP,
    title: 'Direct Subject & Unit URLs, On-Site Paper Reader & SEO Indexing',
    summary: 'Introduced dedicated shareable URLs for every qualification, subject, unit, and examination sitting, defaulted all papers to open directly inside the on-site reader, and added full search engine indexing.',
    changes: [
      'Dedicated subject & unit routes: Every Edexcel IAL and IGCSE qualification, subject, and unit now has its own clean, shareable URL (e.g. /ial/mathematics/pure-mathematics-1-p1).',
      '100% on-site paper viewing: Clicking any examination title, Question Paper [QP], Mark Scheme [MS], Examiner Report [ER], or Textbook now opens directly in the on-site viewer without bouncing you to external tabs.',
      'Direct paper share links: Added one-click shareable URLs inside the reader modal so you can send classmates a direct link to any exact sitting or Split View.',
      'Search engine pre-rendering & sitemap: Added static route pre-rendering, structured Schema.org JSON-LD breadcrumbs, and a complete 240+ page XML sitemap.'
    ]
  },
  {
    version: 'v3.4',
    date: BUILD_TIMESTAMP,
    title: 'Mobile Reader Refinement & Content-First UX',
    summary: 'Optimized mobile viewing across all pages: pinned in-modal close controls, full-height single-page reader mode on phones, decluttered exam sitting cards, and streamlined wizard navigation.',
    changes: [
      'Fixed mobile reader header: Pinned the close button and tab controls to the top of the modal on small screens, preventing the 200px+ horizontal overflow that trapped mobile users.',
      'Full-height mobile reader: Automatically opens examination papers in full-height single view on mobile devices for readable PDFs, with 1-tap switching between QP, MS, and Split View.',
      'Decluttered sitting cards: Removed redundant stacked text in mobile cards, displaying clean examination titles, variant badges, and thumb-friendly action buttons.',
      'Streamlined interactive wizard: Automatically collapses the welcome hero on mobile when drilling down into units and years, keeping relevant options immediately in view.',
      'Persistent subpage navigation: Added clear top-level return navigation to the About and Changelog pages on mobile while preserving the distraction-free search layout.'
    ]
  },
  {
    version: 'v3.3',
    date: BUILD_TIMESTAMP,
    title: 'Instant In-Modal Switching for QP, MS, and Split View',
    summary: 'Resolved an issue where clicking the Question Paper or Mark Scheme buttons inside the reader modal could reload the view back into split mode, enabling seamless instant toggles between single and dual document views.',
    changes: [
      'Seamless view toggling: Switching between Split View, Question Paper [QP], Mark Scheme [MS], and Examiner Report [ER] now happens instantly inside the modal without reloading or resetting.',
      'Active tab clarity: The active view button is clearly highlighted with McMaster burgundy so you always know which document or view mode is currently focused.',
      'Clean single-document view: Selecting Question Paper or Mark Scheme expands that document to full width while updating the title, subtitle, and full-tab download link accordingly.'
    ]
  },
  {
    version: 'v3.2',
    date: BUILD_TIMESTAMP,
    title: 'Default Side-by-Side Split View & Immersive Fullscreen Reader',
    summary: 'Upgraded document previews to launch directly into an edge-to-edge Split View so you can study Question Papers and Mark Schemes side-by-side without wasted screen space.',
    changes: [
      'Split View by default: Clicking into any examination sitting now immediately boots up the dual-pane view with the Question Paper on the left and Mark Scheme on the right.',
      'Edge-to-edge reading: Removed all outer modal borders, margins, and letterboxing so the preview spans your entire display, giving you maximum room to study questions and working steps.',
      'Clearer action buttons: Renamed the table action button to "Split View" so you know exactly what to expect before opening an exam sitting.',
      'Humanized changelogs: Refreshed our version history with clearer, more thoughtful descriptions across all previous updates.'
    ]
  },
  {
    version: 'v3.1',
    date: '2026-11-08T07:25:00.000Z',
    title: 'Instant 0ms Category Tree & Multi-Tier Catalog Sync',
    summary: 'Fixed an issue where the category tree appeared empty on slower networks by baking the full subject hierarchy straight into the initial app shell and adding smart background failovers.',
    changes: [
      'Instant sidebar browsing: The entire subject catalog (19 IAL subjects, 22 IGCSE subjects, and textbooks) now renders on the first paint before any background network calls even start.',
      'Edge caching that actually works: Switched our CDN headers to stale-while-revalidate, so you get cached index responses in ~50ms instead of waiting for a cold origin server.',
      'Zero-downtime Hugging Face fallback: If our primary hosting provider ever has a hiccup or delay, the app automatically switches to our Hugging Face CDN mirror in the background.',
      'Clear connection alerts: Replaced the misleading "No matching documents found" screen with an honest, real-time reconnection banner and manual retry button.'
    ]
  },
  {
    version: 'v3.0',
    date: '2026-11-08T06:00:00.000Z',
    title: 'Leaner Tree Index & 0ms App Shell',
    summary: 'We shaved 96% off the initial metadata payload by cleaning out thousands of redundant year folders, getting rid of blank loading screens for good.',
    changes: [
      'Cleaned up folder clutter: Pruned over 8,500 repetitive year and exam session folders from the sidebar tree, shrinking our metadata payload from 162 KB down to 27 KB.',
      'No more white flashes: The header, subject cards, and archive stats now paint in 0ms synchronously when you open the site.',
      'Smarter cache busting: Upgraded our storage keys so returning visitors get fresh releases automatically without having to manually wipe their browser data.'
    ]
  },
  {
    version: 'v2.9',
    date: '2026-11-07T19:30:00.000Z',
    title: 'Clearer Regional (Alt A & R) Labels & Badges',
    summary: 'Added clear visual indicators for Regional and Alternate papers so students don\'t accidentally study the wrong paper variant.',
    changes: [
      'Prominent paper tags: Regional (R) and IAL Alternate (Alt A) variants now feature dedicated badges right beside the sitting title.',
      'Search shorthand support: You can now type "r", "reg", "alt", or "alta" into search to jump straight to regional variants.'
    ]
  },
  {
    version: 'v2.8',
    date: '2026-11-07T18:36:00.000Z',
    title: '631 New 2024–2026 Papers & One-Click Cache Recovery',
    summary: 'Expanded our library to 13,940 verified papers, including the latest May/June 2026 and Jan 2025 series, plus an automatic recovery screen for stuck browsers.',
    changes: [
      'Fresh 2025–2026 examination series: Added 631 unwatermarked past papers across all major sciences, mathematics, humanities, and business subjects.',
      'IGCSE Modular support: Added Unit 1 and Unit 2 papers for the new modular qualifications alongside Foundation/Higher variants.',
      'Self-healing cache: Built an automatic recovery screen that detects outdated local storage and refreshes your cache with a single click.'
    ]
  },
  {
    version: 'v2.7',
    date: '2026-11-07T17:18:00.000Z',
    title: 'Unified Exam Sittings & McMaster Institutional Theme',
    summary: 'Grouped matching Question Papers, Mark Schemes, and Reports into a single row to cut table clutter by 65%, and introduced typo-tolerant fuzzy search.',
    changes: [
      'Single-row sittings: Instead of scrolling past three or four separate rows for the same exam, you now get QP, MS, and ER consolidated into one neat row.',
      'Dual-pane PDF preview: Introduced the side-by-side Split View modal to compare question papers directly against the marking guidelines.',
      'Typo-tolerant search: Search now handles small spelling mistakes (like "chemsitry" or "mechanincs") and popular shorthands like "jan25" or "p1" effortlessly.',
      'Refined aesthetic: Restored a focused institutional palette with muted burgundy, deep slate, and warm neutrals, completely ditching decorative emojis.'
    ]
  },
  {
    version: 'v2.5',
    date: '2026-11-07T16:10:00.000Z',
    title: 'Edge Cache Alignment & Live Changelog',
    summary: 'Fixed stale page caching across edge networks, anchored assets to build timestamps, and launched this live update log.',
    changes: [
      'Always fresh: Configured strict cache-control on HTML documents so your browser never gets stuck on yesterday\'s release.',
      'Live changelog page: Created this dedicated log so anyone can follow along with site improvements, fixes, and new features.'
    ]
  },
  {
    version: 'v2.4',
    date: '2026-11-07T16:04:00.000Z',
    title: 'Faster Indexing, Deduplication & Dynamic Filters',
    summary: 'Shrank the archive index, deduplicated identical paper copies across mirror batches, and added fast in-app PDF previews.',
    changes: [
      'Deduplicated archives: Cleaned up nearly 4,000 duplicate files created by overlapping scraper dumps, while preserving all variant and regional papers.',
      'Instant preview: Added inline PDF viewing so you can check questions without opening dozens of browser tabs.',
      'Quick navigation: Added dynamic unit and year dropdowns and keyboard shortcuts ("/" to search).'
    ]
  },
  {
    version: 'v2.2',
    date: '2026-11-06T18:30:00.000Z',
    title: 'Unified IAL & IGCSE Architecture',
    summary: 'Organized our entire archive of 13,000+ Pearson Edexcel resources into clear IAL and IGCSE past papers and textbooks with direct high-speed CDN delivery.',
    changes: [
      'Complete archive: Indexed over 13,000 papers spanning from 2003 through 2026 across 37 international subjects.',
      'Interactive homepage wizard: Built a 3-step subject, paper, and year explorer to help you find the exact paper you need in seconds.',
      'Direct CDN hosting: Connected the catalog directly to our Hugging Face dataset for instant PDF loading.'
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
  'january': 'january jan',
  'alt': 'alt alta regional variant',
  'alta': 'alt alta regional variant',
  'regional': 'regional reg alt alta r',
  'reg': 'regional reg alt alta r',
  '4ma1': '4ma1 mathematics a igcse',
  '4mb1': '4mb1 mathematics b igcse',
  '4pm1': '4pm1 further pure mathematics igcse',
  '4ph1': '4ph1 physics igcse',
  '4ch1': '4ch1 chemistry igcse',
  '4bi1': '4bi1 biology igcse',
  '4hb1': '4hb1 human biology igcse',
  '4ac1': '4ac1 accounting igcse',
  '4ec1': '4ec1 economics igcse',
  '4bs1': '4bs1 business igcse',
  '4cm1': '4cm1 commerce igcse',
  '4cp0': '4cp0 computer science igcse',
  '4it1': '4it1 information technology igcse',
  '4ea1': '4ea1 english language a igcse',
  '4eb1': '4eb1 english language b igcse',
  '4et1': '4et1 english literature igcse',
  '4ge1': '4ge1 geography igcse',
  '4hi1': '4hi1 history igcse'
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
  'wbs11', 'wbs12', 'wbs13', 'wbs14',
  '4ma1', '4mb1', '4pm1', '4ph1', '4ch1', '4bi1', '4hb1', '4ac1', '4ec1', '4bs1', '4cp0', '4it1'
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
    if (u.startsWith('Paper ')) u = `${u}R (Regional / R)`;
    else u = `${u} (Regional / R)`;
  } else if (v === 'A') {
    u = `${u} (Regional / Alt A)`;
  } else if (v === 'F') {
    u = `${u} (Foundation)`;
  } else if (v === 'F-R') {
    u = `${u}R (Regional / Foundation R)`;
  } else if (v === 'H') {
    u = `${u} (Higher)`;
  } else if (v === 'H-R') {
    u = `${u}R (Regional / Higher R)`;
  } else if (v === 'Mod') {
    u = `${u} (Modular)`;
  } else if (v === 'R-Mod') {
    u = `${u}R (Regional / Modular R)`;
  } else if (v === 'H-Mod') {
    u = `${u} (Higher Modular)`;
  } else if (v === 'H-R-Mod') {
    u = `${u}R (Regional / Higher Modular R)`;
  } else if (v === 'F-Mod') {
    u = `${u} (Foundation Modular)`;
  } else if (v === 'F-R-Mod') {
    u = `${u}R (Regional / Foundation Modular R)`;
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

// ─── In-App Quick PDF & Resource Preview Modal (with Default Fullscreen Split View) ────
const PreviewModal = ({ file, initialView, onClose, onViewChange }) => {
  const siblings = useMemo(() => ({
    ...(file?.siblings || {}),
    ...(file?.docs || {})
  }), [file]);

  const canSplit = Boolean(siblings.QP?.ext === 'pdf' && siblings.MS?.ext === 'pdf');
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // Resolve initial view: honor explicit user click (QP / MS / ER / split / extra), else mobile single / desktop split
  const [activeView, setActiveView] = useState(() => {
    if (initialView) {
      if (initialView === 'split') return canSplit ? 'split' : (file?.docType || 'QP');
      return initialView;
    }
    return isMobile
      ? (file?.docType || (siblings.QP ? 'QP' : 'split'))
      : (canSplit ? 'split' : (file?.docType || 'QP'));
  });
  const [copiedLink, setCopiedLink] = useState(false);

  const handleSelectView = useCallback((nextView) => {
    setActiveView(nextView);
    if (onViewChange) onViewChange(nextView);
  }, [onViewChange]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Resolve current active single document when not in split mode
  const currentDoc = useMemo(() => {
    if (!file) return null;
    if (activeView && siblings[activeView]) return siblings[activeView];
    return file.primaryFile || file;
  }, [activeView, siblings, file]);

  if (!file || !currentDoc) return null;

  const isSplit = activeView === 'split' && canSplit;

  const singleUrl = getHfUrl(currentDoc.path);
  const singleTitle = getDisplayTitle(currentDoc);
  const currentExt = (currentDoc.ext || '').toLowerCase();
  const isAudio = currentExt === 'mp3' || currentExt === 'wav' || currentDoc.docType === 'AUD';
  const isArchive = currentExt === 'zip' || currentExt === 'rar' || currentDoc.docType === 'DF';

  const modalTitle = isSplit
    ? `${getUnifiedSittingTitle(file)} — Split View (QP + MS)`
    : singleTitle;

  const modalSubtitle = isSplit
    ? `Left: ${siblings.QP?.name || ''} • Right: ${siblings.MS?.name || ''}`
    : `${currentDoc.path} ${currentDoc.size ? `(${formatBytes(currentDoc.size)})` : ''}`;

  const downloadUrl = isSplit ? getHfUrl(siblings.QP?.path) : singleUrl;

  const handleCopyShareLink = () => {
    try {
      const shareUrl = window.location.href;
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={modalTitle}>
      <div className={`modal-container ${isSplit ? 'modal-split-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-top">
            <div className="modal-title-group">
              <span className="modal-title" title={modalTitle}>{modalTitle}</span>
              <span className="modal-subtitle">{modalSubtitle}</span>
            </div>

            <div className="modal-header-controls">
              <button
                type="button"
                className="modal-action-link"
                onClick={handleCopyShareLink}
                title="Copy direct on-site link to this examination paper"
              >
                {copiedLink ? 'Copied Link ✓' : 'Share Link 🔗'}
              </button>
              <a
                href={downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="modal-action-link"
                title="Download or open raw file"
              >
                Download ⬇
              </a>
              <button
                type="button"
                className="modal-close-btn"
                onClick={onClose}
                aria-label="Close preview"
                title="Close Preview (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="modal-actions" role="tablist" aria-label="Document view tabs">
            {/* Instant Sibling Switcher inside Preview Modal */}
            {['QP', 'MS', 'ER', 'AUD', 'SC', 'SOL', 'SAM', 'DF'].map((type) => {
              const sib = siblings[type];
              if (!sib) return null;
              const isCurrent = !isSplit && (activeView === type || currentDoc.path === sib.path);
              const desktopLabels = {
                QP: 'Question Paper [QP]',
                MS: 'Mark Scheme [MS]',
                ER: 'Examiner Report [ER]',
                AUD: 'Listening Audio [AUD]',
                SC: 'Source Booklet [SC]',
                SOL: 'Worked Solutions [SOL]',
                SAM: 'Specimen [SAM]',
                DF: 'Data Files [DF]'
              };
              return (
                <button
                  key={type}
                  type="button"
                  className={`modal-sibling-btn ${type.toLowerCase()} ${isCurrent ? 'active' : ''}`}
                  onClick={() => handleSelectView(type)}
                  title={`Focus on ${DOC_TYPE_INFO[type]?.fullLabel || type} only`}
                >
                  <span className="modal-btn-desktop-text">
                    {desktopLabels[type] || type}
                  </span>
                  <span className="modal-btn-mobile-text">{type}</span>
                </button>
              );
            })}

            {canSplit && (
              <button
                type="button"
                className={`modal-sibling-btn split ${isSplit ? 'active' : ''}`}
                onClick={() => handleSelectView('split')}
                title="View Question Paper and Mark Scheme side-by-side"
              >
                <span className="modal-btn-desktop-text">Split View (QP + MS)</span>
                <span className="modal-btn-mobile-text">Split</span>
              </button>
            )}
          </div>
        </div>
        <div className={`modal-body ${isSplit ? 'split-grid' : ''}`}>
          {isSplit ? (
            <>
              <div className="modal-split-pane">
                <div className="modal-split-label qp">
                  <span>Question Paper (QP)</span>
                  <button
                    type="button"
                    className="modal-pane-link"
                    onClick={() => handleSelectView('QP')}
                    title="Expand Question Paper to full screen"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Full View ⤢
                  </button>
                </div>
                <iframe
                  src={getHfUrl(siblings.QP.path)}
                  title="Question Paper"
                  className="modal-iframe"
                />
              </div>
              <div className="modal-split-pane">
                <div className="modal-split-label ms">
                  <span>Mark Scheme (MS)</span>
                  <button
                    type="button"
                    className="modal-pane-link"
                    onClick={() => handleSelectView('MS')}
                    title="Expand Mark Scheme to full screen"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Full View ⤢
                  </button>
                </div>
                <iframe
                  src={getHfUrl(siblings.MS.path)}
                  title="Mark Scheme"
                  className="modal-iframe"
                />
              </div>
            </>
          ) : isAudio && currentExt !== 'zip' ? (
            <div className="modal-resource-card">
              <div className="modal-resource-box">
                <h3>{singleTitle}</h3>
                <p>Official Pearson Edexcel Listening Examination Audio Recording ({currentDoc.name})</p>
                <audio controls autoPlay src={singleUrl} style={{ width: '100%', marginTop: '16px', marginBottom: '16px' }}>
                  Your browser does not support the audio element.
                </audio>
                <a href={singleUrl} download className="search-button" style={{ display: 'inline-block', textDecoration: 'none' }}>
                  Download Audio File ({formatBytes(currentDoc.size)}) ⬇
                </a>
              </div>
            </div>
          ) : isArchive || (currentExt && currentExt !== 'pdf') ? (
            <div className="modal-resource-card">
              <div className="modal-resource-box">
                <h3>{singleTitle}</h3>
                <p>
                  This examination resource is packaged as a <strong>{(currentExt || 'ZIP').toUpperCase()}</strong> archive ({formatBytes(currentDoc.size)}).
                  Download the archive below to access the practical examination data files or audio tracks.
                </p>
                <a href={singleUrl} download className="search-button" style={{ display: 'inline-block', marginTop: '16px', textDecoration: 'none' }}>
                  Download {(currentExt || 'Archive').toUpperCase()} ({formatBytes(currentDoc.size)}) ⬇
                </a>
              </div>
            </div>
          ) : (
            <iframe
              key={currentDoc.path}
              src={singleUrl}
              title={singleTitle}
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
      caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).catch(() => { })
    );
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))).catch(() => { })
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
              <div className="team-role">Co-Founder & CTO</div>
            </div>

            <div className="team-card">
              <div className="team-name">Naz</div>
              <div className="team-role">Co-Founder & CTO</div>
            </div>

            <div className="team-card">
              <div className="team-name">Jemison Flaren</div>
              <div className="team-role">Systems Architect</div>
            </div>

            <div className="team-card">
              <div className="team-name">Gemin Arghen</div>
              <div className="team-role">Infrastructure Engineer</div>
            </div>

            <div className="team-card">
              <div className="team-name">Claudis Oppen</div>
              <div className="team-role">Research & Intelligence Lead</div>
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
      <div className={`welcome-hero ${selectedSubject ? 'mobile-hidden' : ''}`}>
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
          <a
            href="/ial"
            className="filter-btn hero-action-btn"
            style={{ textDecoration: 'none' }}
            onClick={(e) => { e.preventDefault(); onCurriculumSelect('Edexcel IAL'); }}
          >
            Edexcel IAL Collection
          </a>
          <a
            href="/igcse"
            className="filter-btn hero-action-btn igcse"
            style={{ textDecoration: 'none' }}
            onClick={(e) => { e.preventDefault(); onCurriculumSelect('Edexcel IGCSE'); }}
          >
            Edexcel IGCSE Collection
          </a>
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
                <a
                  href={`/${getCurriculumSlug(selectedSubject.curriculum)}/${getSubjectSlug(selectedSubject.name)}`}
                  className="wizard-option-btn primary"
                  onClick={(e) => { e.preventDefault(); onSubjectSelect(selectedSubject.name, selectedSubject.curriculum); }}
                  style={{ width: '100%', marginBottom: '20px', textDecoration: 'none' }}
                >
                  <span>View All {formatSubjectDisplay(selectedSubject.name)} Units, Papers & Textbooks →</span>
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
                            style={{ textDecoration: 'none' }}
                            onClick={(e) => { e.preventDefault(); handleUnitClick(unitName); }}
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
                  onClick={(e) => { e.preventDefault(); handleYearClick(''); }}
                  style={{ width: '100%', textDecoration: 'none' }}
                >
                  <span>All Examination Years for {selectedUnit} →</span>
                </a>
              </div>
              <div className="wizard-button-grid-years">
                {availableYears.map(year => (
                  <a
                    key={year}
                    href={`/${getCurriculumSlug(selectedSubject.curriculum)}/${getSubjectSlug(selectedSubject.name)}/${getUnitSlug(selectedUnit)}?year=${year}`}
                    className="wizard-option-btn year"
                    style={{ textDecoration: 'none' }}
                    onClick={(e) => { e.preventDefault(); handleYearClick(year); }}
                  >
                    {year}
                  </a>
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
                  style={{ textDecoration: 'none', display: 'block' }}
                  onClick={(e) => { e.preventDefault(); handleSubjectClick(subject, 'Edexcel IAL'); }}
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
                  style={{ textDecoration: 'none', display: 'block' }}
                  onClick={(e) => { e.preventDefault(); handleSubjectClick(subject, 'Edexcel IGCSE'); }}
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

async function resilientFetch(urls, options = {}, timeoutMs = 45000) {
  let lastErr = null;
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      console.warn(`Fetch candidate failed (${url}):`, err.message);
    }
  }
  throw lastErr || new Error('All fetch candidates failed');
}

const DEFAULT_TREE = {
  name: 'The Library',
  path: '',
  children: [
    {
      name: 'Past Papers',
      path: 'Past Papers',
      children: [
        {
          name: 'IAL',
          path: 'Past Papers/IAL',
          children: [
            { name: 'Accounting', path: 'Past Papers/IAL/Accounting', children: [] },
            { name: 'Arabic', path: 'Past Papers/IAL/Arabic', children: [] },
            { name: 'Biology', path: 'Past Papers/IAL/Biology', children: [] },
            { name: 'Business', path: 'Past Papers/IAL/Business', children: [] },
            { name: 'Chemistry', path: 'Past Papers/IAL/Chemistry', children: [] },
            { name: 'Economics', path: 'Past Papers/IAL/Economics', children: [] },
            { name: 'English Language', path: 'Past Papers/IAL/English Language', children: [] },
            { name: 'English Literature', path: 'Past Papers/IAL/English Literature', children: [] },
            { name: 'French', path: 'Past Papers/IAL/French', children: [] },
            { name: 'Geography', path: 'Past Papers/IAL/Geography', children: [] },
            { name: 'German', path: 'Past Papers/IAL/German', children: [] },
            { name: 'Greek', path: 'Past Papers/IAL/Greek', children: [] },
            { name: 'History', path: 'Past Papers/IAL/History', children: [] },
            { name: 'Information Technology', path: 'Past Papers/IAL/Information Technology', children: [] },
            { name: 'Law', path: 'Past Papers/IAL/Law', children: [] },
            { name: 'Mathematics', path: 'Past Papers/IAL/Mathematics', children: [] },
            { name: 'Physics', path: 'Past Papers/IAL/Physics', children: [] },
            { name: 'Psychology', path: 'Past Papers/IAL/Psychology', children: [] },
            { name: 'Spanish', path: 'Past Papers/IAL/Spanish', children: [] }
          ]
        },
        {
          name: 'IGCSE',
          path: 'Past Papers/IGCSE',
          children: [
            { name: 'Accounting', path: 'Past Papers/IGCSE/Accounting', children: [] },
            { name: 'Arabic', path: 'Past Papers/IGCSE/Arabic', children: [] },
            { name: 'Bangla', path: 'Past Papers/IGCSE/Bangla', children: [] },
            { name: 'Biology', path: 'Past Papers/IGCSE/Biology', children: [] },
            { name: 'Business', path: 'Past Papers/IGCSE/Business', children: [] },
            { name: 'Chemistry', path: 'Past Papers/IGCSE/Chemistry', children: [] },
            { name: 'Commerce', path: 'Past Papers/IGCSE/Commerce', children: [] },
            { name: 'Computer Science', path: 'Past Papers/IGCSE/Computer Science', children: [] },
            { name: 'Economics', path: 'Past Papers/IGCSE/Economics', children: [] },
            { name: 'English Language A', path: 'Past Papers/IGCSE/English Language A', children: [] },
            { name: 'English Language B', path: 'Past Papers/IGCSE/English Language B', children: [] },
            { name: 'English Literature', path: 'Past Papers/IGCSE/English Literature', children: [] },
            { name: 'French', path: 'Past Papers/IGCSE/French', children: [] },
            { name: 'Further Pure Mathematics', path: 'Past Papers/IGCSE/Further Pure Mathematics', children: [] },
            { name: 'Geography', path: 'Past Papers/IGCSE/Geography', children: [] },
            { name: 'German', path: 'Past Papers/IGCSE/German', children: [] },
            { name: 'Greek', path: 'Past Papers/IGCSE/Greek', children: [] },
            { name: 'History', path: 'Past Papers/IGCSE/History', children: [] },
            { name: 'Human Biology', path: 'Past Papers/IGCSE/Human Biology', children: [] },
            { name: 'Information Technology', path: 'Past Papers/IGCSE/Information Technology', children: [] },
            { name: 'Mathematics A', path: 'Past Papers/IGCSE/Mathematics A', children: [] },
            { name: 'Mathematics B', path: 'Past Papers/IGCSE/Mathematics B', children: [] },
            { name: 'Physics', path: 'Past Papers/IGCSE/Physics', children: [] },
            { name: 'Spanish', path: 'Past Papers/IGCSE/Spanish', children: [] }
          ]
        }
      ]
    },
    {
      name: 'IAL Books',
      path: 'IAL Books',
      children: [
        { name: 'Accounting', path: 'IAL Books/Accounting', children: [] },
        { name: 'Biology', path: 'IAL Books/Biology', children: [] },
        { name: 'Business', path: 'IAL Books/Business', children: [] },
        { name: 'Chemistry', path: 'IAL Books/Chemistry', children: [] },
        { name: 'Economics', path: 'IAL Books/Economics', children: [] },
        { name: 'Information Technology', path: 'IAL Books/Information Technology', children: [] },
        { name: 'Maths', path: 'IAL Books/Maths', children: [] },
        { name: 'Physics', path: 'IAL Books/Physics', children: [] },
        { name: 'Psychology', path: 'IAL Books/Psychology', children: [] }
      ]
    },
    {
      name: 'IGCSE Books',
      path: 'IGCSE Books',
      children: [
        { name: 'Accounting', path: 'IGCSE Books/Accounting', children: [] },
        { name: 'Biology', path: 'IGCSE Books/Biology', children: [] },
        { name: 'Business', path: 'IGCSE Books/Business', children: [] },
        { name: 'Chemistry', path: 'IGCSE Books/Chemistry', children: [] },
        { name: 'Economics', path: 'IGCSE Books/Economics', children: [] },
        { name: 'Further Pure Maths', path: 'IGCSE Books/Further Pure Maths', children: [] },
        { name: 'Human Biology', path: 'IGCSE Books/Human Biology', children: [] },
        { name: 'Information Technology', path: 'IGCSE Books/Information Technology', children: [] },
        { name: 'Maths', path: 'IGCSE Books/Maths', children: [] },
        { name: 'Physics', path: 'IGCSE Books/Physics', children: [] }
      ]
    }
  ]
};

const DEFAULT_META = {
  totalFiles: 13940,
  subjects: [
    'Accounting', 'Arabic', 'Bangla', 'Biology', 'Business', 'Chemistry', 'Commerce',
    'Computer Science', 'Economics', 'English Language', 'English Literature', 'French',
    'Geography', 'German', 'Greek', 'History', 'Human Biology', 'Information Technology',
    'Law', 'Mathematics', 'Physics', 'Psychology', 'Spanish'
  ],
  ialSubjects: [
    'Accounting', 'Arabic', 'Biology', 'Business', 'Chemistry', 'Economics',
    'English Language', 'English Literature', 'French', 'Geography', 'German', 'Greek',
    'History', 'Information Technology', 'Law', 'Mathematics', 'Physics', 'Psychology', 'Spanish'
  ],
  igcseSubjects: [
    'Accounting', 'Arabic', 'Bangla', 'Biology', 'Business', 'Chemistry', 'Commerce',
    'Computer Science', 'Economics', 'English Language A', 'English Language B', 'English Literature',
    'French', 'Geography', 'German', 'Greek', 'History', 'Human Biology', 'Information Technology',
    'Mathematics A', 'Mathematics B', 'Physics', 'Spanish'
  ],
  coverage: 'January 2003 – June 2026'
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
  const initialRoute = useMemo(() => (
    typeof window !== 'undefined'
      ? parseRouteFromLocation(window.location.pathname, window.location.search, initialCache?.meta || DEFAULT_META)
      : {}
  ), [initialCache]);

  const [data, setData] = useState(() => ({
    tree: initialCache?.tree || DEFAULT_TREE,
    flatFiles: [],
    dedupedFiles: [],
    unifiedFiles: [],
    meta: initialCache?.meta || DEFAULT_META
  }));
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState(initialRoute.searchQuery || '');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedPath, setSelectedPath] = useState('');
  const [expandedPaths, setExpandedPaths] = useState(new Set(['']));
  const [currentTab, setCurrentTab] = useState(initialRoute.currentTab || 'library'); // 'library' | 'about' | 'changelog'
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewInitialView, setPreviewInitialView] = useState(initialRoute.viewParam || '');
  const [pendingPaperParam, setPendingPaperParam] = useState(initialRoute.paperParam || '');
  const [viewMode, setViewMode] = useState('unified'); // 'unified' | 'separate'

  // Filters initialized directly from URL route
  const [filterCurriculum, setFilterCurriculum] = useState(initialRoute.filterCurriculum || ''); // '' | 'Edexcel IAL' | 'Edexcel IGCSE'
  const [filterDocType, setFilterDocType] = useState(initialRoute.filterDocType || null); // 'QP' | 'MS' | 'ER' | 'Book' | 'Extra' | null
  const [filterSubject, setFilterSubject] = useState(initialRoute.filterSubject || '');
  const [filterUnit, setFilterUnit] = useState(initialRoute.filterUnit || '');
  const [filterYear, setFilterYear] = useState(initialRoute.filterYear || '');
  const [sortBy, setSortBy] = useState('newest'); // Default to newest first so recent 2026/2025 papers appear at top
  const [forceShowTable, setForceShowTable] = useState(Boolean(initialRoute.forceShowTable));
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const searchInputRef = useRef(null);
  const isPopStateRef = useRef(false);

  const openOnSiteReader = useCallback((fileObj, preferredView = '') => {
    if (!fileObj) return;
    setPreviewInitialView(preferredView);
    setPreviewFile(fileObj);
  }, []);

  // Handle browser Back/Forward navigation across all routes and modals
  useEffect(() => {
    const handlePopState = () => {
      isPopStateRef.current = true;
      const parsed = parseRouteFromLocation(window.location.pathname, window.location.search, data.meta);
      setCurrentTab(parsed.currentTab || 'library');
      setFilterCurriculum(parsed.filterCurriculum || '');
      setFilterSubject(parsed.filterSubject || '');
      setFilterUnit(parsed.filterUnit || '');
      setFilterYear(parsed.filterYear || '');
      setFilterDocType(parsed.filterDocType || null);
      setSearchQuery(parsed.searchQuery || '');
      setForceShowTable(Boolean(parsed.forceShowTable));
      setPreviewInitialView(parsed.viewParam || '');
      if (parsed.paperParam) {
        const found =
          data.unifiedFiles.find(f => f.id === parsed.paperParam || f.path === parsed.paperParam) ||
          data.flatFiles.find(f => f.path === parsed.paperParam);
        if (found) setPreviewFile(found);
        else setPendingPaperParam(parsed.paperParam);
      } else {
        setPreviewFile(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [data.meta, data.unifiedFiles, data.flatFiles]);

  // Re-resolve unit slug from URL once wizard metadata finishes hydrating on cold visits
  useEffect(() => {
    if (!data.meta?.wizard) return;
    const segments = (window.location.pathname || '/').split('/').filter(Boolean);
    if (segments.length >= 3 && !filterUnit) {
      const parsed = parseRouteFromLocation(window.location.pathname, window.location.search, data.meta);
      if (parsed.filterUnit) {
        setFilterCurriculum(parsed.filterCurriculum);
        setFilterSubject(parsed.filterSubject);
        setFilterUnit(parsed.filterUnit);
        setForceShowTable(true);
      }
    }
  }, [data.meta, filterUnit]);

  // Resolve ?paper= deep link once catalog finishes loading
  useEffect(() => {
    if (!pendingPaperParam) return;
    if (data.unifiedFiles.length === 0 && data.flatFiles.length === 0) return;
    const found =
      data.unifiedFiles.find(f => f.id === pendingPaperParam || f.path === pendingPaperParam) ||
      data.flatFiles.find(f => f.path === pendingPaperParam);
    if (found) {
      setPreviewFile(found);
    }
    setPendingPaperParam('');
  }, [pendingPaperParam, data.unifiedFiles, data.flatFiles]);

  // Synchronize current route state to browser URL and dynamic SEO <head> + Schema.org JSON-LD
  const seoMeta = useMemo(() => getSeoMetadata({
    currentTab,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterDocType,
    meta: data.meta
  }), [currentTab, filterCurriculum, filterSubject, filterUnit, filterYear, filterDocType, data.meta]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Wait for wizard metadata before overwriting a 3-segment unit URL on a cold cache visit
    const pathSegments = (window.location.pathname || '/').split('/').filter(Boolean);
    const waitingForUnitHydration = pathSegments.length >= 3 && !filterUnit && !data.meta?.wizard;

    if (!waitingForUnitHydration) {
      const nextUrl = buildRoutePath({
        currentTab,
        filterCurriculum,
        filterSubject,
        filterUnit,
        filterYear,
        filterDocType,
        searchQuery: deferredSearchQuery,
        previewFile,
        previewMode: previewInitialView
      });
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl !== nextUrl) {
        if (isPopStateRef.current) {
          isPopStateRef.current = false;
        } else if (deferredSearchQuery) {
          window.history.replaceState(null, '', nextUrl);
        } else {
          window.history.pushState(null, '', nextUrl);
        }
      } else {
        isPopStateRef.current = false;
      }
    }

    // Update document title, meta description, canonical URL, OpenGraph, and JSON-LD schema
    const pageTitle = previewFile
      ? `${getUnifiedSittingTitle(previewFile)} — Past Paper & Mark Scheme | Conceptualist Systems`
      : seoMeta.title;
    document.title = pageTitle;

    const setMetaTag = (selector, attrName, attrVal, contentVal) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', contentVal);
    };

    setMetaTag('meta[name="description"]', 'name', 'description', seoMeta.description);
    setMetaTag('meta[name="keywords"]', 'name', 'keywords', seoMeta.keywords);
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', pageTitle);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', seoMeta.description);
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', seoMeta.canonicalUrl);
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'website');

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', seoMeta.canonicalUrl);

    let ldScript = document.getElementById('seo-json-ld');
    if (!ldScript) {
      ldScript = document.createElement('script');
      ldScript.id = 'seo-json-ld';
      ldScript.type = 'application/ld+json';
      document.head.appendChild(ldScript);
    }
    const jsonLdObj = buildJsonLd({
      currentTab,
      filterCurriculum,
      filterSubject,
      filterUnit,
      seo: seoMeta,
      meta: data.meta
    });
    ldScript.textContent = JSON.stringify(jsonLdObj);
  }, [
    currentTab,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterDocType,
    deferredSearchQuery,
    previewFile,
    previewInitialView,
    seoMeta,
    data.meta
  ]);

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

    const candidateIndexUrls = [
      '/index.json',
      `/index.json?v=${buildQuery}`,
      'https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/resolve/main/live_index.json'
    ];

    const loadFullIndex = () => {
      setFilesLoading(true);
      setLoadError(null);

      // Stage 2: Background load full index.json using resilient multi-tier fallback
      resilientFetch(candidateIndexUrls, {}, 50000)
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
                (isReg ? 'regional reg r ' : '') +
                (v === 'A' ? 'alt alta variant ' : '') +
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
            setLoadError(null);
          }, 0);
        })
        .catch(err => {
          console.error('Failed to load index from all candidate sources:', err);
          setLoading(false);
          setFilesLoading(false);
          setLoadError(err?.message || 'Connection delayed');
        });
    };

    if (initialCache?.tree && initialCache?.meta?.wizard) {
      // Tree and wizard are already hydrated from localStorage; background fetch full index
      setTimeout(loadFullIndex, 0);
    } else {
      // Stage 1: Fetch tiny pruned meta.json first (~3.5 KB Brotli) to hydrate wizard and category tree
      resilientFetch(['/meta.json', `/meta.json?v=${buildQuery}`], {}, 25000)
        .then(res => res.json())
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
        .catch(err => {
          console.warn('Meta fetch error, proceeding to full index:', err);
          loadFullIndex();
        });
    }
  }, [initialCache, retryCount]);

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

  const retryLoadIndex = useCallback(() => {
    setFilesLoading(true);
    setLoadError(null);
    setRetryCount(c => c + 1);
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

  const getOnSitePaperUrl = useCallback((fileObj, preferredView = '') => {
    return buildRoutePath({
      currentTab: 'library',
      filterCurriculum: filterCurriculum || fileObj?.curriculum || '',
      filterSubject: filterSubject || fileObj?.subject || '',
      filterUnit: filterUnit || fileObj?.cleanUnitLabel || '',
      filterYear,
      filterDocType,
      searchQuery: deferredSearchQuery,
      previewFile: fileObj,
      previewMode: preferredView
    });
  }, [filterCurriculum, filterSubject, filterUnit, filterYear, filterDocType, deferredSearchQuery]);

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
        ) : loadError && data.unifiedFiles.length === 0 ? (
          <span style={{ color: '#8A2030', fontWeight: 600 }}>Reconnecting to archive...</span>
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
        <div className={`header-top-row ${!showWelcome && currentTab === 'library' ? 'mobile-hidden' : ''}`}>
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
              className={`header-nav-btn ${currentTab !== 'library' ? 'active' : ''}`}
              onClick={() => setCurrentTab(currentTab !== 'library' ? 'library' : 'about')}
            >
              {currentTab !== 'library' ? '← Library' : 'About'}
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
                placeholder={typeof window !== 'undefined' && window.innerWidth <= 768 ? "Search subject, unit, or code (e.g. WMA11)..." : "Search by course code, subject, unit or year (e.g. WMA11, Chemistry, M1 Jan 2025, 4MA1)..."}
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

              <button
                type="button"
                className="filter-apply-btn mobile-only"
                onClick={() => setShowMobileFilters(false)}
              >
                Done &amp; View Results ({allMatchedFiles.length.toLocaleString()})
              </button>
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

              {/* SEO Contextual Topic Header & Unit Explorer */}
              {(filterCurriculum || filterSubject || filterUnit || filterDocType === 'Book') && (
                <section className="seo-topic-banner" aria-label="Course Collection Overview">
                  <div className="seo-topic-header">
                    <div>
                      <h1 className="seo-topic-h1">{seoMeta.h1}</h1>
                      <p className="seo-topic-subtitle">{seoMeta.subtitle}</p>
                    </div>
                  </div>
                  {filterSubject && availableUnitsForFilter.length > 0 && (
                    <nav className="seo-unit-pills" aria-label={`${formatSubjectDisplay(filterSubject)} Units and Papers`}>
                      <a
                        href={buildRoutePath({ currentTab: 'library', filterCurriculum: filterCurriculum || 'Edexcel IAL', filterSubject })}
                        className={`seo-unit-pill ${!filterUnit ? 'active' : ''}`}
                        onClick={(e) => { e.preventDefault(); setFilterUnit(''); }}
                      >
                        All Units ({availableUnitsForFilter.length})
                      </a>
                      {availableUnitsForFilter.map(u => {
                        const unitHref = buildRoutePath({
                          currentTab: 'library',
                          filterCurriculum: filterCurriculum || 'Edexcel IAL',
                          filterSubject,
                          filterUnit: u
                        });
                        return (
                          <a
                            key={u}
                            href={unitHref}
                            className={`seo-unit-pill ${filterUnit === u ? 'active' : ''}`}
                            onClick={(e) => { e.preventDefault(); setFilterUnit(filterUnit === u ? '' : u); }}
                          >
                            {u}
                          </a>
                        );
                      })}
                    </nav>
                  )}
                </section>
              )}

              {/* Document List / Data Table */}
              {filesLoading && visibleFiles.length === 0 ? (
                <div className="no-results-box">
                  <h3>Loading full document catalog...</h3>
                  <p>Preparing 13,940 examination papers and textbooks.</p>
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
                        const hasSplitPair = Boolean(
                          (docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf') ||
                          (siblings?.QP?.ext === 'pdf' && siblings?.MS?.ext === 'pdf')
                        );
                        const defaultViewMode = isUnified
                          ? (hasSplitPair ? 'split' : (activeDoc.docType || 'QP'))
                          : (activeDoc.docType || 'QP');

                        return (
                          <tr key={file.id || file.path} className={isUnified ? 'unified-sitting-row' : ''}>
                            <td className="file-title-cell">
                              <div className="file-title-row">
                                <a
                                  href={getOnSitePaperUrl(file, defaultViewMode)}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openOnSiteReader(file, defaultViewMode);
                                  }}
                                  className={titleCls}
                                  title={isUnified ? `View ${displayTitle} on-site` : `View ${displayTitle} on-site`}
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
                                {Boolean(file.variant === 'R' || file.variant === 'A' || (file.variant && file.variant.includes('R'))) && (
                                  <span className="curr-mini-badge regional" title="Regional examination series">
                                    {file.variant === 'A' ? 'Regional (Alt A)' : 'Regional'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              {isUnified ? (
                                <div className="unified-actions-cell">
                                  {docs.QP && (
                                    <a
                                      href={getOnSitePaperUrl(file, 'QP')}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOnSiteReader(file, 'QP');
                                      }}
                                      className="unified-doc-btn qp"
                                      title={`View Question Paper on-site — ${docs.QP.name} (${formatBytes(docs.QP.size)})`}
                                    >
                                      <span className="desktop-btn-label">Question Paper </span>
                                      <span className="btn-code">[QP]</span>
                                    </a>
                                  )}
                                  {docs.MS && (
                                    <a
                                      href={getOnSitePaperUrl(file, 'MS')}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOnSiteReader(file, 'MS');
                                      }}
                                      className="unified-doc-btn ms"
                                      title={`View Mark Scheme on-site — ${docs.MS.name} (${formatBytes(docs.MS.size)})`}
                                    >
                                      <span className="desktop-btn-label">Mark Scheme </span>
                                      <span className="btn-code">[MS]</span>
                                    </a>
                                  )}
                                  {docs.ER && (
                                    <a
                                      href={getOnSitePaperUrl(file, 'ER')}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOnSiteReader(file, 'ER');
                                      }}
                                      className="unified-doc-btn er"
                                      title={`View Examiner Report on-site — ${docs.ER.name} (${formatBytes(docs.ER.size)})`}
                                    >
                                      <span className="desktop-btn-label">Examiner Report </span>
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
                                        href={getOnSitePaperUrl(file, extraType)}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          openOnSiteReader(file, extraType);
                                        }}
                                        className="unified-doc-btn extra"
                                        title={`View ${DOC_TYPE_INFO[extraType]?.fullLabel || extraType} on-site — ${extraDoc.name}`}
                                      >
                                        <span>{labelMap[extraType] || extraType}</span>
                                        <span className="btn-code">[{extraType}]</span>
                                      </a>
                                    );
                                  })}
                                  {isPdf && (
                                    <button
                                      type="button"
                                      className={`unified-preview-btn ${Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf') ? 'split-btn' : ''}`}
                                      onClick={() => openOnSiteReader(file, Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf') ? 'split' : (activeDoc.docType || 'QP'))}
                                      title={Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf') ? "Open Question Paper and Mark Scheme side-by-side in Split View" : "Quick In-App PDF Preview"}
                                    >
                                      {Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf') ? 'Split View' : 'Preview'}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="row-actions-cell">
                                  {viewMode === 'unified' ? (
                                    <a
                                      href={getOnSitePaperUrl(file, file.docType || 'Book')}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOnSiteReader(file, file.docType || 'Book');
                                      }}
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
                                            href={getOnSitePaperUrl(sib, sibType)}
                                            onClick={(e) => {
                                              e.preventDefault();
                                              openOnSiteReader(sib, sibType);
                                            }}
                                            className={`sibling-pill ${sibType.toLowerCase()}`}
                                            title={`View matching ${DOC_TYPE_INFO[sibType]?.fullLabel} (${file.session}) on-site`}
                                          >
                                            {sibType}
                                          </a>
                                        );
                                      })}
                                    </>
                                  )}

                                  {isPdf && (
                                    <button
                                      type="button"
                                      className={viewMode === 'unified' ? 'unified-preview-btn' : 'preview-btn'}
                                      onClick={() => openOnSiteReader(activeDoc, Boolean(siblings?.QP?.ext === 'pdf' && siblings?.MS?.ext === 'pdf') ? 'split' : (activeDoc.docType || 'QP'))}
                                      title={Boolean(siblings?.QP?.ext === 'pdf' && siblings?.MS?.ext === 'pdf') ? "Open Question Paper and Mark Scheme side-by-side in Split View" : "Quick In-App PDF Preview"}
                                    >
                                      {Boolean(siblings?.QP?.ext === 'pdf' && siblings?.MS?.ext === 'pdf') ? 'Split View' : 'Preview'}
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
                  {loadError && data.unifiedFiles.length === 0 ? (
                    <>
                      <h3>Connecting to repository archive...</h3>
                      <p>
                        The network connection took longer than expected ({loadError}). Reconnecting automatically in the background...
                      </p>
                      <button
                        type="button"
                        className="search-button"
                        style={{ marginTop: '14px' }}
                        onClick={retryLoadIndex}
                      >
                        Retry Connection Now
                      </button>
                    </>
                  ) : (
                    <>
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
                    </>
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
          key={`${previewFile.id || previewFile.path}-${previewInitialView}`}
          file={previewFile}
          initialView={previewInitialView}
          onViewChange={(v) => setPreviewInitialView(v)}
          onClose={() => {
            setPreviewFile(null);
            setPreviewInitialView('');
          }}
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
          <a
            href="/"
            className="footer-link"
            onClick={(e) => { e.preventDefault(); setCurrentTab('library'); clearFilters(); }}
          >
            Library Home
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/ial"
            className="footer-link"
            onClick={(e) => {
              e.preventDefault();
              setCurrentTab('library');
              clearFilters();
              setFilterCurriculum('Edexcel IAL');
              setForceShowTable(true);
            }}
          >
            Edexcel IAL
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/igcse"
            className="footer-link"
            onClick={(e) => {
              e.preventDefault();
              setCurrentTab('library');
              clearFilters();
              setFilterCurriculum('Edexcel IGCSE');
              setForceShowTable(true);
            }}
          >
            Edexcel IGCSE
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/textbooks"
            className="footer-link"
            onClick={(e) => {
              e.preventDefault();
              setCurrentTab('library');
              clearFilters();
              setFilterDocType('Book');
              setForceShowTable(true);
            }}
          >
            Textbooks
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/changelog"
            className="footer-link"
            onClick={(e) => { e.preventDefault(); setCurrentTab('changelog'); }}
          >
            Changelog
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/about"
            className="footer-link"
            onClick={(e) => { e.preventDefault(); setCurrentTab('about'); }}
          >
            About Us & Team
          </a>
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
