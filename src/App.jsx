/* global __APP_BUILD_TIME__ */
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useDeferredValue, useRef, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import './index.css';
import {
  buildRoutePath,
  parseRouteFromLocation,
  getSeoMetadata,
  buildJsonLd,
  getShardPathForRoute,
  getLegacyEquivalentsForState,
  inferCurriculumForSubject,
  getCurriculumSlug,
  getSubjectSlug
} from './seoRoutes.js';
import { extractVariant, getCleanUnitLabel } from './unitParser.js';
import { initTelemetryTracker, setActivePaperTelemetry } from './telemetry.js';
import { extractZipAudioTracks } from './zipAudioExtractor.js';
import {
  buildCandidateSubtitleKeys,
  adaptSubtitleEntryForTrack,
  resolveExistingSubtitles,
  saveSubtitlesToCloud,
  generateLiveWhisperSubtitles,
  formatSubtitleTimestamp
} from './audioSubtitles.js';

const normalizePaperTelemetryMode = (activeView, canSplit, fallbackDocType) => {
  if (activeView === 'split' && canSplit) return 'split';
  const rawType = String(
    activeView && activeView !== 'split' ? activeView : fallbackDocType || 'QP'
  )
    .trim()
    .toUpperCase();
  if (rawType === 'QP') return 'qp';
  if (rawType === 'MS') return 'ms';
  if (rawType === 'ER') return 'er';
  return 'other';
};

const PdfViewerPane = lazy(() => import('./PdfViewerPane.jsx'));

function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= breakpointPx : false
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, [breakpointPx]);
  return isMobile;
}

const PAGE_SIZE = 80;
const BUILD_TIMESTAMP = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '2026-11-13T00:00:00.000Z';
const APP_VERSION = 'v6.2';
const META_CACHE_KEY = `cs_library_meta_${APP_VERSION}_${BUILD_TIMESTAMP}`;

const CHANGELOG_HISTORY = [
  {
    version: 'v6.2',
    date: BUILD_TIMESTAMP,
    title: 'Single-Row Action Buttons & Real Team Names',
    summary: 'Fixed multi-button rows wrapping onto two lines on recent cards and sitting tables, removed the card view badge, and updated founder names.',
    changes: [
      'Single-row actions: Removed the view counter from Recently Viewed cards and balanced table/card action pills so QP, MS, ER, Audio, and Split View stay on one clean row.',
      'Team roster: Updated founder credits on /about to Nafiz.R and Nazmul.K.'
    ]
  },
  {
    version: 'v6.1',
    date: '2026-11-16T00:34:32.000Z',
    title: 'Cleaner Layout, Audio Showcase & S-Curve Theme Wipes',
    summary: 'Freed up screen room on laptops, showcased in-browser audio + subtitles on Home, made /papers a real route, updated disclaimers, and added fast S-curve theme wipes.',
    changes: [
      'Compact layout & filter drawer: Slimmed the header/search bar, kept the footer in normal page flow instead of locking it over small screens, moved filters into a drawer, and dropped the extra search banner.',
      'Audio + CC showcase on Home: Highlighted Past Papers, Textbooks, and Listening Audio with synced subtitles side by side, plus a one-click sample track + CC preview.',
      'Real /papers link & cleaner copy: Made Browse All Papers a proper route with working Back/Forward navigation, trimmed "(AUD)" on desktop buttons, and replaced "Official" wording with independent study disclaimers.',
      'Fast S-curve animations: Added a 260ms directional Light/Dark/OLED wipe (top-to-bottom body, left-to-right header and footer) plus crisp hover/open motion that respects reduced-motion settings.'
    ]
  },
  {
    version: 'v6.0',
    date: '2026-11-15T22:37:46.000Z',
    title: 'Live Audio Subtitles (CC) & Clickable Transcripts',
    summary: 'Added synced closed captions and interactive transcripts to listening audio tracks, backed by static Transcript PDF timings, shared MongoDB caching, and optional browser Whisper AI.',
    changes: [
      'Synced CC bar & transcript drawer: Highlights the active line with a next-line preview and lets you click any line to jump straight to that timestamp across all themes.',
      'Instant static index: Ships pre-loaded timings from Edexcel Transcript PDFs and Whisper tracks in audio-subtitles.json so supported exams need zero setup.',
      'Shared cache & opt-in AI captions: Prompts before running VAD + Whisper WASM in your browser on uncached audio and saves finished captions to MongoDB for future visitors.'
    ]
  },
  {
    version: 'v5.9',
    date: '2026-11-15T10:46:27.000Z',
    title: 'In-Browser ZIP Audio Player',
    summary: 'Unpacks zipped listening archives right in the browser with multi-track controls and individual track downloads.',
    changes: [
      'Zero-backend ZIP unpacking: Extracts STORE and deflate .zip (and nested .zip) listening packs in memory using DecompressionStream.',
      'Multi-track playback: Added Track 1–4 / Unit 2–4 selectors, auto-advance, and per-MP3 or full-ZIP download controls across docked and standalone players.'
    ]
  },
  {
    version: 'v5.8',
    date: '2026-11-15T09:50:29.000Z',
    title: 'Zero Theme Shift & Centered Catalog',
    summary: 'Stopped elements jumping on theme switches, dropped the extra sidebar to center the catalog, and steadied WebPDF startup.',
    changes: [
      'Zero theme movement: Standardized borders, input font weights, button widths, and 8px scrollbars across Light, Dark, and OLED.',
      'Centered layout & Dark Mode contrast: Removed the redundant left sidebar and fixed Dark Mode unit card shading.',
      'Steadier WebPDF & view badges: Sized Page 1 before mount to stop startup jumps and placed view counts beside bottom card actions.'
    ]
  },
  {
    version: 'v5.7',
    date: '2026-11-15T09:03:49.000Z',
    title: 'WebPDF Fixes, Persistent Audio Dock & Charcoal/Gold Palette',
    summary: 'Fixed FIT-mode scrollbars, added 90° rotation and Split pane swapping, docked audio above listening Question Papers, and unified QP/MS colors.',
    changes: [
      'WebPDF overhaul: Fixed FIT horizontal overflow, added double-buffered zoom redraws, 90° page rotation, live download progress, and Split pane swapping.',
      'Audio dock & filters: Pinned MP3 tracks above listening Question Papers, added Exam Session filters and Most Viewed sorting, and added mobile theme toggles on subject pages.',
      'Charcoal/Gold palette & API cache: Unified QP/MS accents across all three themes and added a 15s cache to /api/views.'
    ]
  },
  {
    version: 'v5.6',
    date: '2026-11-12T22:26:53.000Z',
    title: 'Team Update & Docs Sync',
    summary: 'Added Gemin Fauré Hidrojen to Conceptualist Systems on About Us and synced docs with the v5 setup.',
    changes: [
      'Team roster: Added Gemin Fauré Hidrojen (Intern, Optimizer) to the 6-card grid on /about.',
      'Docs refresh: Updated README and AI instructions with route shard, WebPDF, and MongoDB/Vercel details.'
    ]
  },
  {
    version: 'v5.5',
    date: '2026-11-12T22:16:19.000Z',
    title: 'Instant PDF Theme Swaps & 3×3 Mobile Footer',
    summary: 'Cut Light/Dark/OLED lag inside the PDF reader down to a single frame and turned mobile footer links into a 3×3 grid.',
    changes: [
      'Instant PDF theme switches: Froze hidden background panes while the reader is open and bypassed slow cross-DOM transitions during toggles.',
      'Mobile 3×3 footer: Grouped the mobile footer links into a balanced touch grid without changing desktop layout.'
    ]
  },
  {
    version: 'v5.4',
    date: '2026-11-12T21:57:10.000Z',
    title: 'Header Alignment & Mobile Touch Polish',
    summary: 'Matched desktop header button heights, fixed mobile breadcrumb and footer wrapping, and stopped iOS zoom on inputs.',
    changes: [
      'Even header sizing: Normalized height (34px) and alignment across desktop header controls.',
      'Mobile polish: Wrapped breadcrumbs without clipping, capped zoomed PDF DPR to save memory, and kept mobile inputs at 16px+.'
    ]
  },
  {
    version: 'v5.3',
    date: '2026-11-12T21:28:22.000Z',
    title: 'Route Shards, Textbook/Audio Pages & Telemetry',
    summary: 'Split cold route loads into compact JSON shards, launched dedicated textbook/data/audio pages, and enabled Vercel telemetry.',
    changes: [
      'Fast route shards: Deep pages load a small route shard in parallel with meta.json before upgrading the full catalog.',
      'New resource pages & OG card: Added /textbooks/ial, /textbooks/igcse, /data-files, /audio, plus a 1200×630 social preview image.'
    ]
  },
  {
    version: 'v5.2',
    date: '2026-11-12T20:42:55.000Z',
    title: 'Smaller Index, Range Streaming & Accessibility',
    summary: 'Shrank catalog payloads with shared unit parsing, tightened SEO metadata, restored lazy WebPDF loading, and hardened mobile accessibility.',
    changes: [
      'Leaner index & fixed parsing: Merged WPH07 into WPH13, fixed tricky filename regexes, and deduplicated records at build time.',
      'Better PDF streaming: Removed upfront burst page loads on long textbooks and scoped Split View keyboard shortcuts per pane.',
      'SEO & accessibility: Added 404 route recovery, 100dvh mobile modals, focus outlines, and atomic MongoDB view updates.'
    ]
  },
  {
    version: 'v5.1',
    date: '2026-11-11T14:00:00.000Z',
    title: 'Uniform Subject Grid & Subtle Table Shading',
    summary: 'Made subject cards consistent, toned down table zebra striping, and replaced nested beige badges with clean white pills.',
    changes: [
      'Uniform subject cards: Kept every subject card crisp white (#FFFFFF) with consistent crimson and blue accent bars.',
      'Lighter table striping & dividers: Softened row contrast and hairline borders across Light, Dark, and OLED.'
    ]
  },
  {
    version: 'v5.0',
    date: '2026-11-11T08:00:00.000Z',
    title: 'Alternating Row & Card Contrast',
    summary: 'Added subtle zebra striping on tables and alternating card shading across Light, Dark, and OLED themes.',
    changes: [
      'Table zebra striping: Added alternating row contrast across exam sitting tables for easier scanning.',
      'Card alternation: Brought alternating tonal shading to subject cards, wizard units, and recent paper cards.'
    ]
  },
  {
    version: 'v4.9',
    date: '2026-11-10T22:00:00.000Z',
    title: 'Header Home Link & Route Sync',
    summary: 'Made clicking the header logo reliably return home cleanly from deep sub-routes without leaving stale filters behind.',
    changes: [
      'Reliable Home navigation: Turned the header brand into a real link that resets filters and pushes cleanly back to "/".',
      'Cold-visit loop fix: Stopped the unit-slug effect from re-reading old path segments after clearing filters.'
    ]
  },
  {
    version: 'v4.8',
    date: '2026-11-10T18:00:00.000Z',
    title: 'Cleaner Button Labels & Charcoal/Gold Palette',
    summary: 'Dropped redundant "(QP)"/"(MS)" suffixes on desktop buttons and switched buttons to Slate Charcoal and Collegiate Gold.',
    changes: [
      'Cleaner desktop buttons: Show full "Question Paper", "Mark Scheme", and "Examiner Report" labels on desktop while keeping short tags on phones.',
      'Palette harmony: Switched primary paper actions to Slate Charcoal (#2B303A) and Collegiate Gold (#8C651E / #A88226).'
    ]
  },
  {
    version: 'v4.7',
    date: '2026-11-10T15:00:00.000Z',
    title: 'Full Dark Mode Coverage',
    summary: 'Fixed leftover white backgrounds in Dark Mode across Changelog, About, tables, pagination, and reader toolbars.',
    changes: [
      'Changelog & About Dark Mode: Converted hardcoded light surfaces to deep charcoal (#1B1E23) with legible text.',
      'Component parity: Added 150+ missing Dark Mode overrides across tables, dropdowns, modals, and footers.'
    ]
  },
  {
    version: 'v4.6',
    date: '2026-11-10T12:00:00.000Z',
    title: 'Academic Light & Slate Dark Palette Refresh',
    summary: 'Refreshed Light and Dark themes around Heritage Crimson, warm alabaster, and deep slate charcoal while keeping Pure OLED intact.',
    changes: [
      'Academic Light & Slate Dark: Restored warm #F4F3EF canvas on Light and switched Dark mode to #121417 slate charcoal.',
      'Anti-FOUC & OLED kept: Preserved pitch-black #000000 OLED mode with zero flash on page reload.'
    ]
  },
  {
    version: 'v4.5',
    date: '2026-11-10T09:00:00.000Z',
    title: '3-Way Theme Cycler (Light, Dark & OLED)',
    summary: 'Added a seamless three-way theme cycler across main navigation and the PDF reader modal.',
    changes: [
      'Warm light & terminal dark variants: Explored warm parchment light and tactile dark styling alongside true black OLED.',
      'Single-click cycling: Switched seamlessly between all three modes with geometric SVG icons.'
    ]
  },
  {
    version: 'v4.4',
    date: '2026-11-09T21:00:00.000Z',
    title: 'PDF Memory Virtualization & Single-Pass Filters',
    summary: 'Fixed SEO canonical tags on pre-rendered pages, bounded WebPDF canvas memory, locked modal scroll, and sped up filtering.',
    changes: [
      'Canvas memory cleanup & shortcuts: Added sliding-window page release, worker teardown, and keyboard page/zoom shortcuts.',
      'Single-pass filters & SEO: Combined search predicates into one loop and fixed canonical/Open Graph tags on pre-rendered routes.'
    ]
  },
  {
    version: 'v4.3',
    date: '2026-11-09T18:00:00.000Z',
    title: 'Zero-Flicker Boot & Repo Cleanup',
    summary: 'Stopped reload theme flashes using critical inline styles and noscript SEO shells, fixed hook order, and tidied scripts.',
    changes: [
      'No reload flash: Injected critical inline theme CSS in head before first paint.',
      'Noscript SEO shells & cleanup: Kept crawlers happy while rendering clean SPAs and pruned legacy scripts down to 7 core tools.'
    ]
  },
  {
    version: 'v4.2',
    date: '2026-11-09T12:00:00.000Z',
    title: 'Reader Header Cleanup & Team Restoration',
    summary: 'Simplified the Split View header, made history action pills always visible, and updated footer and About links.',
    changes: [
      'Cleaner PDF header & history cards: Removed duplicate titles and kept QP/MS/View buttons visible without hover.',
      'Footer & icons: Added direct canonical footer links and switched odd text arrows to crisp SVG chevrons.'
    ]
  },
  {
    version: 'v4.1',
    date: '2026-11-09T11:00:00.000Z',
    title: 'SEO Routes, View Counters & Recent History',
    summary: 'Added clean subject/unit URLs with a sitemap, live view counters, recently viewed cards, and direct deep-link skeletons.',
    changes: [
      'Canonical URLs & telemetry: Launched clean /ial and /igcse paths, live view counts, and homepage Recent History cards.',
      'Instant deep links & header safety: Added skeleton loading states and protected header buttons on narrower screens.'
    ]
  },
  {
    version: 'v4.0',
    date: '2026-11-08T20:00:00.000Z',
    title: 'Zero-FOUT Local Fonts & Fast Typography',
    summary: 'Eliminated font flickers and layout snapping on page reloads by self-hosting modern Roboto & Roboto Mono variable WOFF2 fonts.',
    changes: [
      'Self-hosted fonts: Bundled lightweight WOFF2 variable fonts locally, removing external calls to Google Fonts servers.',
      'Preloaded typography: Added link preloading in document head for instant font glyph availability.',
      'font-display: optional: Prevented visible font snapping on page refreshes for clean, immediate text rendering.'
    ]
  },
  {
    version: 'v3.9',
    date: '2026-11-08T18:00:00.000Z',
    title: 'High-Contrast Action Buttons & "View" Label',
    summary: 'Standardized document reader triggers to a simple "View" button across mobile and desktop, with bold white text on vivid identity backgrounds.',
    changes: [
      'Clean "View" button: Replaced "Split View" with "View" across all paper listings for simplicity.',
      'High-contrast typography: Swapped low-contrast tones for bold pure white (#FFFFFF) text on blue (QP), green (MS), and maroon (View) buttons.',
      'No more bracket syntax: Cleaned up [QP] and [MS] button text for a modern, uncluttered look.'
    ]
  },
  {
    version: 'v3.8',
    date: '2026-11-08T16:00:00.000Z',
    title: 'Mobile UI Overhaul & Zero Clipping',
    summary: 'Fixed all small-screen layout clipping down to 375px iPhone SE displays: anchored modals edge-to-edge and pinned mobile close controls.',
    changes: [
      'Zero modal offset: Removed the 88px modal shift bug, ensuring full past paper width is visible on phones.',
      'Pinned mobile close button: Placed a dedicated close button in the top title row so readers are never trapped.',
      'Contained breadcrumbs: Added horizontal touch scrolling to prevent screen blowout on mobile.',
      'Compact search: Tailored search placeholder text to fit comfortably beside mobile filter buttons.'
    ]
  },
  {
    version: 'v3.7',
    date: '2026-11-08T14:00:00.000Z',
    title: 'Performance Tuning & Instant Catalog Hydration',
    summary: 'Boosted search speed and loading times using chunk code-splitting and native Cache API persistence.',
    changes: [
      'Lazy-loaded PDF reader: Code-split WebPDF engine with React.lazy, speeding up initial landing page loads.',
      'Instant catalog cache: Stored past paper indexes in the browser Cache API for 0ms repeat visits.',
      'Fast binary sorting: Replaced slow localeCompare calls with relational operators, speeding up sorting by 90%.'
    ]
  },
  {
    version: 'v3.6',
    date: '2026-11-08T12:00:00.000Z',
    title: 'Pure OLED Dark Mode (#000000)',
    summary: 'Introduced an absolute true black OLED theme with diagram color preservation and persistent preferences.',
    changes: [
      'True OLED black: Used #000000 across all surfaces for maximum contrast and battery savings on OLED screens.',
      'Color-preserving PDF filter: Inverted white page backgrounds to black while keeping graphs, diagrams, and markings in original colors.',
      'Theme persistence: Saved dark mode preferences in cookies and localStorage for seamless reloads.'
    ]
  },
  {
    version: 'v3.5',
    date: '2026-11-08T10:00:00.000Z',
    title: 'In-House High-Speed WebPDF Engine',
    summary: 'Replaced browser default iframes with our custom canvas reader featuring synchronized split scrolling and resizable panes.',
    changes: [
      'Virtual canvas reader: Powered by PDF.js with lazy page rendering for razor-sharp text without browser tab slowdowns.',
      'Draggable split divider: Drag the divider between Question Paper and Mark Scheme to customize pane widths.',
      'Zero-download streaming: Streams PDF pages on demand without downloading entire booklets upfront.'
    ]
  },
  {
    version: 'v3.4',
    date: '2026-11-08T09:00:00.000Z',
    title: 'Mobile Reader Refinement',
    summary: 'Optimized paper viewing on phones with pinned header controls, full-height single-page mode, and uncluttered cards.',
    changes: [
      'Fixed small-screen overflow: Pinned modal headers to prevent wide toolbar displacement on phones.',
      'Full-height mobile reader: Automatically opens papers in single-document mode on smartphones for maximum reading height.',
      'Streamlined sitting cards: Simplified mobile row layouts to focus on exam titles and tap targets.'
    ]
  },
  {
    version: 'v3.3',
    date: '2026-11-08T08:00:00.000Z',
    title: 'Instant Document View Switching',
    summary: 'Enabled seamless 1-tap toggling between Question Paper, Mark Scheme, and Split View without modal reloading.',
    changes: [
      'Smooth toggling: Switch between QP, MS, and Split View instantly inside the reader.',
      'Active tab clarity: Highlights the active document tab so you always know what you are viewing.'
    ]
  },
  {
    version: 'v3.2',
    date: '2026-11-08T07:45:00.000Z',
    title: 'Default Side-by-Side Split View',
    summary: 'Launches exam sittings directly into fullscreen side-by-side QP + MS comparison view.',
    changes: [
      'Side-by-side default: Opens papers and mark schemes next to each other on desktop.',
      'Edge-to-edge layout: Minimized borders and padding so documents fill the entire display.'
    ]
  },
  {
    version: 'v3.1',
    date: '2026-11-08T07:25:00.000Z',
    title: 'Fast Category Tree & Edge Caching',
    summary: 'Ensured the subject tree renders in 0ms on initial paint and added background failover mirrors.',
    changes: [
      'Instant subject sidebar: Renders all 41+ IAL and IGCSE subjects before initial network calls.',
      'Edge caching: Configured stale-while-revalidate headers for quick CDN delivery.'
    ]
  },
  {
    version: 'v3.0',
    date: '2026-11-08T06:00:00.000Z',
    title: 'Leaner Tree Index & 0ms App Shell',
    summary: 'Pruned over 8,500 redundant tree nodes to shrink metadata payload by 96% for fast initial paint.',
    changes: [
      'Payload reduction: Shrank metadata payload from 162 KB down to 27 KB.',
      'Instant paint: Shell, header, and stats render synchronously with zero white flash.'
    ]
  },
  {
    version: 'v2.9',
    date: '2026-11-07T19:30:00.000Z',
    title: 'Clear Regional (R & Alt A) Badges',
    summary: 'Added explicit badges for Regional and Alternate variants so students always know the exact sitting.',
    changes: [
      'Variant badges: Highlighted Regional (R) and Alternate (Alt A) exam papers.',
      'Search shorthand: Type "r", "reg", or "alt" to filter directly to regional variants.'
    ]
  },
  {
    version: 'v2.8',
    date: '2026-11-07T18:36:00.000Z',
    title: 'New Examination Papers & Cache Recovery',
    summary: 'Added 631 new 2024–2026 past papers and an automatic one-click cache recovery option.',
    changes: [
      'Updated archives: Added the latest 2025–2026 examination series across major subjects.',
      'One-click recovery: Built a recovery button to reset stale browser caches easily.'
    ]
  },
  {
    version: 'v2.7',
    date: '2026-11-07T17:18:00.000Z',
    title: 'Unified Exam Sittings & Fuzzy Search',
    summary: 'Consolidated QP, MS, and ER into single sitting rows, and added typo-tolerant search.',
    changes: [
      'Single sitting rows: Grouped papers, mark schemes, and examiner reports together.',
      'Typo tolerance: Handles common spelling slips (e.g. "chemsitry", "maths") seamlessly.'
    ]
  },
  {
    version: 'v2.5',
    date: '2026-11-07T16:10:00.000Z',
    title: 'Edge Cache Alignment & Changelog',
    summary: 'Configured strict edge cache controls and launched the live on-site version history page.',
    changes: [
      'Edge cache headers: Assets now update reliably without browser cache hang-ups.',
      'Live changelog: Documented all platform updates directly within the web app.'
    ]
  },
  {
    version: 'v2.2',
    date: '2026-11-06T18:30:00.000Z',
    title: 'Unified IAL & IGCSE Architecture',
    summary: 'Organized 13,000+ Pearson Edexcel past papers and textbooks into a fast searchable catalog.',
    changes: [
      'Complete catalog: Indexed Pearson Edexcel papers from 2003 through 2026.',
      'Homepage wizard: 3-step interactive explorer to quickly drill into subjects and years.'
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

const SUBJECTS_WITH_BOOKS = {
  'Edexcel IAL': new Set(['Accounting', 'Biology', 'Business', 'Chemistry', 'Economics', 'Information Technology', 'Math', 'Physics', 'Psychology']),
  'Edexcel IGCSE': new Set(['Accounting', 'Biology', 'Business', 'Chemistry', 'Economics', 'Further Pure Mathematics', 'Human Biology', 'Information Technology', 'Mathematics A', 'Physics'])
};

const IAL_AUDIO_SUBJECTS = new Set(['French', 'German', 'Spanish']);

function hasDataFilesForCourse(curriculum, subject) {
  if (subject === 'Information Technology') return true;
  if (subject === 'Computer Science' && curriculum !== 'Edexcel IAL') return true;
  return false;
}

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
  'sol': 'sol solution solutions solutionbank textbook',
  'solution': 'sol solution solutions solutionbank textbook',
  'solutions': 'sol solution solutions solutionbank textbook',
  'solutionbank': 'sol solution solutions solutionbank textbook',
  'df': 'df data datafile datafiles zip',
  'datafile': 'df data datafile datafiles zip',
  'datafiles': 'df data datafile datafiles zip',
  'aud': 'aud audio listening mp3',
  'audio': 'aud audio listening mp3',
  'listening': 'aud audio listening mp3',
  'mp3': 'aud audio listening mp3',
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
  'reg': 'regional reg alt alta r'
};

// Canonical academic vocabulary for <0.05ms Damerau-Levenshtein typo tolerance & prefix matching
const SEARCH_VOCAB = [
  'accounting', 'arabic', 'bangla', 'biology', 'business', 'chemistry', 'commerce',
  'computer', 'science', 'economics', 'english', 'language', 'literature', 'french',
  'further', 'pure', 'mathematics', 'geography', 'german', 'greek', 'history',
  'human', 'information', 'technology', 'law', 'physics', 'psychology', 'spanish',
  'mechanics', 'statistics', 'decision', 'core', 'unit', 'paper', 'regional',
  'foundation', 'higher', 'question', 'mark', 'scheme', 'examiner', 'report',
  'textbook', 'book', 'solutions', 'solutionbank', 'worked', 'specimen', 'listening', 'audio', 'mp3',
  'datafile', 'datafiles', 'modular', 'c12', 'c34',
  'january', 'june', 'october', 'november', 'summer', 'edexcel', 'igcse', 'ial',
  'wph01', 'wph02', 'wph03', 'wph04', 'wph05', 'wph06', 'wph07',
  '6ph01', '6ph02', '6ph03', '6ph04', '6ph05', '6ph06',
  '6bi01', '6bi02', '6bi03', '6bi04', '6bi05', '6bi06',
  '6ch01', '6ch02', '6ch03', '6ch04', '6ch05', '6ch06',
  '4ma0', '4ph0', '4ch0', '4bi0',
  'wma11', 'wma12', 'wma13', 'wma14', 'wma01', 'wma02', 'wfm01', 'wfm02', 'wfm03',
  'wme01', 'wme02', 'wme03', 'wst01', 'wst02', 'wst03', 'wdm11', 'wdm01',
  'wbi11', 'wbi12', 'wbi13', 'wbi14', 'wbi15', 'wbi16',
  'wch11', 'wch12', 'wch13', 'wch14', 'wch15', 'wch16',
  'wph11', 'wph12', 'wph13', 'wph14', 'wph15', 'wph16',
  'wac11', 'wac12', 'wec11', 'wec12', 'wec13', 'wec14',
  'wbs11', 'wbs12', 'wbs13', 'wbs14',
  'wps01', 'wps02', 'wps03', 'wps04', 'whi01', 'whi02', 'whi03', 'whi04',
  'wge01', 'wge02', 'wge03', 'wge04', 'wit11', 'wit12', 'wit13', 'wit14',
  'wen01', 'wen02', 'wen03', 'wen04', 'wet01', 'wet02', 'wet03', 'wet04',
  'waa01', 'waa02', 'wfr01', 'wfr02', 'wfr03', 'wfr04',
  'wgn01', 'wgn02', 'wgn03', 'wgn04', 'wgk01', 'wgk02',
  'wsp01', 'wsp02', 'wsp03', 'wsp04', 'yla1', 'yla2',
  '4ma1', '4mb1', '4pm1', '4ph1', '4ch1', '4bi1', '4hb1', '4ec1', '4bs1',
  '4ac1', '4cm1', '4cp0', '4it1', '4ea1', '4eb1', '4et1', '4ge1', '4ba0',
  '4wbi1', '4wch1', '4wph1'
];

const _dlPrevPrev = new Int32Array(64);
const _dlPrev = new Int32Array(64);
const _dlCurr = new Int32Array(64);

// Fast bounded Damerau-Levenshtein distance using reusable typed rows
function damerauLevenshtein(a, b, maxDist = 2) {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (lenA === 0) return lenB <= maxDist ? lenB : maxDist + 1;
  if (lenB === 0) return lenA <= maxDist ? lenA : maxDist + 1;
  const need = lenB + 1;
  let prevPrev = need <= _dlPrevPrev.length ? _dlPrevPrev : new Int32Array(need);
  let prev = need <= _dlPrev.length ? _dlPrev : new Int32Array(need);
  let curr = need <= _dlCurr.length ? _dlCurr : new Int32Array(need);

  for (let j = 0; j <= lenB; j++) prev[j] = j;

  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    let rowMin = maxDist + 1;
    const chA = a.charCodeAt(i - 1);
    const chAPrev = i > 1 ? a.charCodeAt(i - 2) : -1;
    for (let j = 1; j <= lenB; j++) {
      const chB = b.charCodeAt(j - 1);
      const cost = chA === chB ? 0 : 1;
      let val = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      if (ins < val) val = ins;
      const sub = prev[j - 1] + cost;
      if (sub < val) val = sub;
      if (i > 1 && j > 1 && chA === b.charCodeAt(j - 2) && chAPrev === chB) {
        const trans = prevPrev[j - 2] + 1;
        if (trans < val) val = trans;
      }
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[lenB];
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
  if (!filePath) return '';
  const encoded = (filePath || '').split(/[\\/]/).map(encodeURIComponent).join('/');
  if (import.meta.env.DEV) {
    return `/library-files/${encoded}`;
  }
  return `https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/resolve/main/${encoded}`;
}

function getDownloadUrl(filePath) {
  const url = getHfUrl(filePath);
  if (!url) return '';
  return url.includes('?') ? `${url}&download=true` : `${url}?download=true`;
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

const HISTORY_STORAGE_KEY = 'cs_recent_papers_v1';
const VIEWS_CACHE_STORAGE_KEY = 'cs_paper_views_cache_v1';
const VIEW_COOLDOWN_STORAGE_KEY = 'cs_paper_view_cooldown_v1';
const VIEWER_ID_STORAGE_KEY = 'cs_viewer_id_v1';
const ACTIVE_MODAL_PAPER_SESSION_KEY = 'cs_active_modal_paper_v1';
const PAPER_VIEW_COOLDOWN_MS = 30 * 1000; // Strict 30-second cooldown per paper per user
const MAX_HISTORY_ITEMS = 8;
const inMemoryCooldownMap = new Map();

function sanitizeViewsMap(rawMap) {
  const clean = {};
  if (!rawMap || typeof rawMap !== 'object') return clean;
  for (const [k, v] of Object.entries(rawMap)) {
    const val = Number(v);
    if (Number.isFinite(val) && val > 0) {
      clean[k] = Math.floor(val);
    }
  }
  return clean;
}

function readLocalViewsCache() {
  try {
    const raw = localStorage.getItem(VIEWS_CACHE_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const rawViews = parsed.views && typeof parsed.views === 'object'
      ? parsed.views
      : (parsed.counts && typeof parsed.counts === 'object' ? parsed.counts : parsed);
    if (!rawViews || typeof rawViews !== 'object') return null;
    return sanitizeViewsMap(rawViews);
  } catch {
    return null;
  }
}

function writeLocalViewsCache(rawViewsObj) {
  const cleanViews = sanitizeViewsMap(rawViewsObj);
  try {
    localStorage.setItem(
      VIEWS_CACHE_STORAGE_KEY,
      JSON.stringify({
        views: cleanViews,
        updatedAt: Date.now()
      })
    );
  } catch {
    // Ignore storage quota errors
  }
  return cleanViews;
}

function updateSinglePaperInLocalViewsCache(paperKey, viewsCount) {
  if (!paperKey) return;
  const cleanCount = Number(viewsCount);
  if (!Number.isFinite(cleanCount) || cleanCount < 0) return;
  try {
    const existingViews = readLocalViewsCache() || {};
    existingViews[paperKey] = Math.max(Number(existingViews[paperKey]) || 0, Math.floor(cleanCount));
    writeLocalViewsCache(existingViews);
  } catch {
    // Ignore storage quota errors
  }
}

function getOrCreateViewerId() {
  try {
    let vid = localStorage.getItem(VIEWER_ID_STORAGE_KEY);
    if (!vid || typeof vid !== 'string' || vid.length < 8) {
      vid =
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
      localStorage.setItem(VIEWER_ID_STORAGE_KEY, vid);
    }
    return vid;
  } catch {
    return 'anon-session';
  }
}

function isBrowserReloadNavigation() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
      const navEntries = performance.getEntriesByType('navigation');
      if (Array.isArray(navEntries) && navEntries.length > 0 && navEntries[0].type === 'reload') {
        return true;
      }
    }
    if (typeof performance !== 'undefined' && performance.navigation && performance.navigation.type === 1) {
      return true;
    }
  } catch {
    // Ignore performance API errors
  }
  return false;
}

function canCountPaperViewNow(paperKey, { isPageReload = false } = {}) {
  if (!paperKey || isPageReload) return false;
  const now = Date.now();
  const memLast = inMemoryCooldownMap.get(paperKey) || 0;
  if (now - memLast < PAPER_VIEW_COOLDOWN_MS) {
    return false;
  }

  let stored = {};
  try {
    const raw = localStorage.getItem(VIEW_COOLDOWN_STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : {};
    if (!stored || typeof stored !== 'object') stored = {};
  } catch {
    stored = {};
  }

  const storageLast = Number(stored[paperKey]) || 0;
  if (now - storageLast < PAPER_VIEW_COOLDOWN_MS) {
    inMemoryCooldownMap.set(paperKey, storageLast);
    return false;
  }

  // Record timestamp and prune expired entries
  inMemoryCooldownMap.set(paperKey, now);
  const nextStored = { [paperKey]: now };
  for (const [k, ts] of Object.entries(stored)) {
    if (k !== paperKey && now - Number(ts) < PAPER_VIEW_COOLDOWN_MS) {
      nextStored[k] = Number(ts);
    }
  }
  try {
    localStorage.setItem(VIEW_COOLDOWN_STORAGE_KEY, JSON.stringify(nextStored));
  } catch {
    // Ignore storage quota errors
  }
  return true;
}

// Canonical key so Unified Sitting, Individual QP, Modal, and History Card share the exact same view counter
function getPaperViewKey(file) {
  if (!file) return '';
  if (file.id && String(file.id).includes('|')) return file.id;
  if (file.spec && file.subject && file.unitCode && file.session) {
    return `${file.spec}|${file.subject}|${file.unitCode}|${file.variant || ''}|${file.session}`;
  }
  const qpPath = file.docs?.QP?.path || file.siblings?.QP?.path || file.path || file.name || '';
  return qpPath;
}

function isQuestionPaperEligibleForViews(file) {
  if (!file) return false;
  if (file.category === 'Books' || file.category === 'IAL Books' || file.category === 'IGCSE Books' || file.docType === 'Book') return true;
  if (file.isUnifiedSitting) return Boolean(file.docs?.QP || file.docType === 'QP' || file.isPendingSkeleton);
  return file.docType === 'QP' || Boolean(file.docs?.QP);
}

function getPaperTotalViews(file, viewsMap) {
  if (!file) return 0;
  const key = getPaperViewKey(file);
  if (!key || !viewsMap) return 0;
  const count = Number(viewsMap[key]);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

// Build a 0ms placeholder object from ?paper= URL parameter while index.json resolves in the background
function buildPendingPaperPlaceholder(paperParam, viewParam = 'QP') {
  if (!paperParam) return null;
  const raw = String(paperParam).trim();
  if (raw.includes('|')) {
    const [spec = 'IAL', subject = '', unitCode = '', variant = '', session = ''] = raw.split('|');
    const yearMatch = session.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : '';
    const curriculum = spec === 'IGCSE' ? 'Edexcel IGCSE' : 'Edexcel IAL';
    const tempFile = {
      id: raw,
      isUnifiedSitting: true,
      isPendingSkeleton: true,
      spec,
      curriculum,
      category: 'Past Papers',
      subject,
      unitCode,
      unitName: unitCode,
      variant,
      year,
      session,
      docType: viewParam === 'MS' || viewParam === 'ER' ? viewParam : 'QP',
      ext: 'pdf',
      docs: {},
      siblings: {},
      path: raw,
      name: `${subject} ${unitCode} ${session}`
    };
    tempFile.cleanUnitLabel = getCleanUnitLabel(tempFile) || unitCode;
    return tempFile;
  }

  // Direct file path parameter
  const rawLower = raw.toLowerCase();
  const isPdf = rawLower.endsWith('.pdf');
  const extMatch = rawLower.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const fileName = raw.split('/').pop() || raw;
  const inferredDocType =
    viewParam && ['QP', 'MS', 'ER', 'AUD', 'SC', 'DF', 'SOL', 'SAM'].includes(viewParam)
      ? viewParam
      : ext === 'mp3' || ext === 'wav' || /audio|recording/i.test(fileName)
      ? 'AUD'
      : 'QP';
  return {
    id: raw,
    path: raw,
    name: fileName,
    ext,
    docType: inferredDocType,
    isPendingSkeleton: !isPdf && inferredDocType !== 'AUD',
    docs: {},
    siblings: {}
  };
}

// Create a compact serializable snapshot of a paper for localStorage recent history
function serializePaperForHistory(file, preferredView = 'QP') {
  if (!file) return null;
  const pickDoc = (d) => d ? ({
    name: d.name,
    path: d.path,
    ext: d.ext || 'pdf',
    size: d.size || 0,
    docType: d.docType,
    subject: d.subject || file.subject,
    curriculum: d.curriculum || file.curriculum,
    spec: d.spec || file.spec,
    unitCode: d.unitCode || file.unitCode,
    unitName: d.unitName || file.unitName,
    cleanUnitLabel: d.cleanUnitLabel || file.cleanUnitLabel,
    variant: d.variant || file.variant,
    year: d.year || file.year,
    session: d.session || file.session,
    category: d.category || file.category
  }) : undefined;

  const rawDocs = { ...(file.siblings || {}), ...(file.docs || {}) };
  if (file.docType && !rawDocs[file.docType] && file.path) {
    rawDocs[file.docType] = file;
  }

  const docs = {};
  ['QP', 'MS', 'ER', 'SOL', 'AUD', 'SC', 'DF', 'SAM'].forEach(t => {
    if (rawDocs[t]) docs[t] = pickDoc(rawDocs[t]);
  });
  if (rawDocs.AUD_ZIP) docs.AUD_ZIP = pickDoc(rawDocs.AUD_ZIP);
  if (rawDocs.AUD_SINGLE) docs.AUD_SINGLE = pickDoc(rawDocs.AUD_SINGLE);

  const primary = docs.QP || docs.MS || docs.ER || pickDoc(file.primaryFile || file);
  const docTypes = Object.keys(docs);

  return {
    id: getPaperViewKey(file) || file.id || file.path,
    isUnifiedSitting: Boolean(file.isUnifiedSitting || docTypes.length > 1),
    spec: file.spec || (file.curriculum === 'Edexcel IGCSE' ? 'IGCSE' : 'IAL'),
    curriculum: file.curriculum || 'Edexcel IAL',
    category: file.category || 'Past Papers',
    subject: file.subject || '',
    unitCode: file.unitCode || '',
    unitName: file.unitName || '',
    cleanUnitLabel: file.cleanUnitLabel || getCleanUnitLabel(file) || '',
    variant: file.variant || '',
    year: file.year || '',
    session: file.session || '',
    name: primary?.name || file.name || '',
    path: primary?.path || file.path || '',
    folderPath: file.folderPath || (primary?.path ? primary.path.split('/').slice(0, -1).join('/') : ''),
    ext: primary?.ext || file.ext || 'pdf',
    size: file.size || primary?.size || 0,
    totalSize: file.totalSize || file.size || 0,
    docType: primary?.docType || file.docType || 'QP',
    fileCount: docTypes.length || 1,
    docTypes,
    docs,
    siblings: docs,
    primaryFile: primary,
    lastView: preferredView || 'QP',
    viewedAt: Date.now()
  };
}

// ─── Question Paper Views Counter Component (Matches Eye + Stacked Count / VIEWS Design) ───
const PaperViewsCounter = React.memo(({ count = 0, variant = 'table' }) => {
  const safeCount = Number.isFinite(Number(count)) && Number(count) > 0 ? Number(count) : 0;
  return (
    <div
      className={`paper-views-counter ${variant}`}
      title={`${safeCount.toLocaleString()} question paper views`}
      aria-label={`${safeCount.toLocaleString()} views`}
    >
      <svg
        className="paper-views-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <div className="paper-views-meta">
        <span className="paper-views-num">{safeCount.toLocaleString()}</span>
        <span className="paper-views-label">VIEWS</span>
      </div>
    </div>
  );
});

// ─── Skeleton Loader for PDF Document Pane (Modal & Deep Links) ───
const PdfPaneSkeleton = ({ title, subtitle }) => (
  <div className="pdf-skeleton-wrapper" role="status" aria-live="polite">
    <div className="pdf-skeleton-sheet">
      <div className="pdf-skeleton-top-bar">
        <div className="skeleton-shimmer" style={{ width: '140px', height: '14px' }} />
        <div className="skeleton-shimmer" style={{ width: '90px', height: '14px' }} />
      </div>
      <div className="pdf-skeleton-header-box">
        <div className="skeleton-shimmer" style={{ width: '68%', height: '20px', marginBottom: '10px' }} />
        <div className="skeleton-shimmer" style={{ width: '46%', height: '13px' }} />
      </div>
      <div className="pdf-skeleton-questions">
        {[1, 2, 3].map((q) => (
          <div key={q} className="pdf-skeleton-q-block">
            <div className="skeleton-shimmer" style={{ width: '32px', height: '14px', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="skeleton-shimmer" style={{ width: '94%', height: '12px' }} />
              <div className="skeleton-shimmer" style={{ width: '82%', height: '12px' }} />
              <div className="skeleton-shimmer" style={{ width: '60%', height: '12px' }} />
              <div className="pdf-skeleton-lines" />
            </div>
          </div>
        ))}
      </div>
      <div className="pdf-skeleton-status-pill">
        <span className="pdf-skeleton-spinner" />
        <span>{title || 'Loading Pearson Edexcel Examination PDF...'}</span>
        {subtitle && <small style={{ marginLeft: 6, opacity: 0.8 }}>{subtitle}</small>}
      </div>
    </div>
  </div>
);

// ─── Skeleton Loader for Archive Table Pages (/ial, /igcse, /subject, /unit, /textbooks) ───
const TableSkeletonLoader = ({ rows = 8, viewMode = 'unified' }) => (
  <div className="file-list skeleton-table-container" role="status" aria-label="Loading examination papers">
    <table className="file-table">
      <thead>
        <tr>
          <th style={{ width: viewMode === 'unified' ? '40%' : '48%' }}>
            {viewMode === 'unified' ? 'Exam Sitting / Resource' : 'Document'}
          </th>
          <th style={{ width: viewMode === 'unified' ? '22%' : '26%' }}>Course &amp; Session</th>
          <th style={{ width: viewMode === 'unified' ? '38%' : '26%' }}>
            {viewMode === 'unified' ? 'Open Paper / Mark Scheme / Report' : 'Type & Quick Links'}
          </th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, idx) => (
          <tr key={idx} className="skeleton-table-row">
            <td className="file-title-cell">
              <div className="skeleton-shimmer" style={{ width: `${68 - (idx % 3) * 8}%`, height: '16px', marginBottom: '7px' }} />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div className="skeleton-shimmer" style={{ width: '180px', height: '12px' }} />
                <div className="skeleton-shimmer" style={{ width: '95px', height: '12px' }} />
              </div>
            </td>
            <td>
              <div className="skeleton-shimmer" style={{ width: '75%', height: '14px', marginBottom: '6px' }} />
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div className="skeleton-shimmer" style={{ width: '38px', height: '14px' }} />
                <div className="skeleton-shimmer" style={{ width: '88px', height: '14px' }} />
              </div>
            </td>
            <td>
              <div className="unified-actions-cell">
                <div className="skeleton-shimmer" style={{ width: '58px', height: '26px', borderRadius: '3px' }} />
                <div className="skeleton-shimmer" style={{ width: '108px', height: '26px', borderRadius: '3px' }} />
                <div className="skeleton-shimmer" style={{ width: '104px', height: '26px', borderRadius: '3px' }} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

function getInitialRecentHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── In-App Quick PDF Preview Modal (with WebPDF Engine & Refined Split View) ────
const PreviewModal = ({ file, initialView = '', viewsCount = 0, showViews = false, onClose, onViewModeChange, theme, onToggleTheme }) => {
  const siblings = useMemo(() => ({
    ...(file?.siblings || {}),
    ...(file?.docs || {})
  }), [file]);

  const canSplit = Boolean(siblings.QP?.ext === 'pdf' && siblings.MS?.ext === 'pdf');
  const isMobile = useIsMobile();

  const audSib = siblings.AUD;
  const audExt = audSib
    ? (audSib.ext || (audSib.path ? audSib.path.split('.').pop() : '') || '').toLowerCase()
    : '';
  const audZipSib = siblings.AUD_ZIP || (audExt === 'zip' ? audSib : null);
  const audSingleSib = siblings.AUD_SINGLE || (audExt && audExt !== 'zip' ? audSib : null);
  const isPlayableAudioSib =
    audExt === 'mp3' || audExt === 'wav' || audExt === 'm4a' || audExt === 'ogg' || audExt === 'zip';
  const hasPdfFallback = Boolean(siblings.QP?.ext === 'pdf' || siblings.MS?.ext === 'pdf');
  const canDockAudio = isPlayableAudioSib && hasPdfFallback;

  const [audioDockOpen, setAudioDockOpen] = useState(() => Boolean(initialView === 'AUD' && canDockAudio));
  const [swapSplit, setSwapSplit] = useState(false);

  // On mobile portrait, default to single QP view for maximum readable document height; on desktop, default to split view
  const [activeView, setActiveView] = useState(() => {
    if (initialView === 'AUD' && canDockAudio) {
      return !isMobile && canSplit ? 'split' : (siblings.QP ? 'QP' : siblings.MS ? 'MS' : 'QP');
    }
    if (initialView === 'split' && canSplit) return 'split';
    if (initialView && (siblings[initialView] || file?.docType === initialView)) return initialView;
    return isMobile ? (file?.docType || (siblings.QP ? 'QP' : 'split')) : (canSplit ? 'split' : (file?.docType || 'QP'));
  });

  useEffect(() => {
    if (canDockAudio && activeView === 'AUD') {
      setAudioDockOpen(true);
      const fallbackView = !isMobile && canSplit ? 'split' : (siblings.QP ? 'QP' : 'MS');
      setActiveView(fallbackView);
    }
  }, [canDockAudio, activeView, isMobile, canSplit, siblings.QP]);

  const handleSelectView = useCallback((nextView) => {
    if (nextView === 'AUD' && canDockAudio) {
      setAudioDockOpen((prev) => !prev);
      return;
    }
    setActiveView(nextView);
    if (onViewModeChange) onViewModeChange(nextView);
  }, [canDockAudio, onViewModeChange]);

  const telemetryPaperKey = file && !file.isPendingSkeleton ? getPaperViewKey(file) : '';
  const telemetryMode = useMemo(() => {
    if (!telemetryPaperKey) return '';
    return normalizePaperTelemetryMode(activeView, canSplit, file?.docType);
  }, [telemetryPaperKey, activeView, canSplit, file?.docType]);

  useEffect(() => {
    if (!telemetryPaperKey || !telemetryMode) {
      setActivePaperTelemetry(null, null);
      return undefined;
    }
    setActivePaperTelemetry(telemetryPaperKey, telemetryMode);
    return () => {
      setActivePaperTelemetry(null, null);
    };
  }, [telemetryPaperKey, telemetryMode]);

  const [headerVisible, setHeaderVisible] = useState(true);
  const [desktopSplitRatio, setDesktopSplitRatio] = useState(50); // percentage for desktop split
  const [mobileSplitRatio, setMobileSplitRatio] = useState(50);   // percentage for mobile vertical split
  const [isDragging, setIsDragging] = useState(false);

  const modalBodyRef = useRef(null);
  const desktopRatioRef = useRef(desktopSplitRatio);
  const mobileRatioRef = useRef(mobileSplitRatio);

  useEffect(() => {
    desktopRatioRef.current = desktopSplitRatio;
  }, [desktopSplitRatio]);

  useEffect(() => {
    mobileRatioRef.current = mobileSplitRatio;
  }, [mobileSplitRatio]);

  // Lock background body scroll while modal is active to prevent scroll bleed-through
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (!headerVisible) {
          setHeaderVisible(true);
        } else {
          onClose();
        }
      } else if (e.key === 'h' || e.key === 'H') {
        // Only toggle if not typing in an input
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          setHeaderVisible((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, headerVisible]);

  // High-performance desktop horizontal drag (updates CSS directly to eliminate stutter)
  const handleDesktopDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);

    const onMove = (moveEvent) => {
      if (!modalBodyRef.current) return;
      const rect = modalBodyRef.current.getBoundingClientRect();
      const clientX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const pct = Math.max(15, Math.min(85, ((clientX - rect.left) / rect.width) * 100));
      desktopRatioRef.current = pct;
      modalBodyRef.current.style.setProperty('--desktop-split-pct', `${pct}%`);
    };

    const onEnd = () => {
      setIsDragging(false);
      setDesktopSplitRatio(desktopRatioRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, []);

  // High-performance mobile vertical drag for phones
  const handleMobileDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);

    const onMove = (moveEvent) => {
      if (!modalBodyRef.current) return;
      const rect = modalBodyRef.current.getBoundingClientRect();
      const clientY = moveEvent.touches && moveEvent.touches.length > 0 ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const pct = Math.max(18, Math.min(82, ((clientY - rect.top) / rect.height) * 100));
      mobileRatioRef.current = pct;
      modalBodyRef.current.style.setProperty('--mobile-split-pct', `${pct}%`);
    };

    const onEnd = () => {
      setIsDragging(false);
      setMobileSplitRatio(mobileRatioRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, []);

  // Double click or tap resets both desktop and mobile split to 50/50
  const handleResetSplit = useCallback(() => {
    setDesktopSplitRatio(50);
    setMobileSplitRatio(50);
    desktopRatioRef.current = 50;
    mobileRatioRef.current = 50;
    if (modalBodyRef.current) {
      modalBodyRef.current.style.setProperty('--desktop-split-pct', '50%');
      modalBodyRef.current.style.setProperty('--mobile-split-pct', '50%');
    }
  }, []);

  const handleDesktopResizerKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (e.key === 'Home' || e.key === 'End') {
        handleResetSplit();
        return;
      }
      const delta = e.key === 'ArrowLeft' ? -5 : 5;
      setDesktopSplitRatio((prev) => {
        const next = Math.max(15, Math.min(85, Math.round(prev + delta)));
        desktopRatioRef.current = next;
        if (modalBodyRef.current) modalBodyRef.current.style.setProperty('--desktop-split-pct', `${next}%`);
        return next;
      });
    }
  }, [handleResetSplit]);

  const handleMobileResizerKeyDown = useCallback((e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (e.key === 'Home' || e.key === 'End') {
        handleResetSplit();
        return;
      }
      const delta = e.key === 'ArrowUp' ? -5 : 5;
      setMobileSplitRatio((prev) => {
        const next = Math.max(18, Math.min(82, Math.round(prev + delta)));
        mobileRatioRef.current = next;
        if (modalBodyRef.current) modalBodyRef.current.style.setProperty('--mobile-split-pct', `${next}%`);
        return next;
      });
    }
  }, [handleResetSplit]);

  // Resolve current active single document when not in split mode
  const currentDoc = useMemo(() => {
    if (!file) return {};
    if (activeView === 'QP' && siblings.QP) return siblings.QP;
    if (activeView === 'MS' && siblings.MS) return siblings.MS;
    if (activeView === 'ER' && siblings.ER) return siblings.ER;
    return siblings[activeView] || file.primaryFile || file;
  }, [activeView, siblings, file]);

  const isSplit = activeView === 'split' && canSplit;
  const singleExt = (currentDoc.ext || (currentDoc.path ? currentDoc.path.split('.').pop() : 'pdf') || 'pdf').toLowerCase();
  const isSinglePdf = singleExt === 'pdf';
  const isSingleAudio = singleExt === 'mp3' || singleExt === 'wav' || singleExt === 'm4a' || singleExt === 'ogg';
  const isSingleAudioZip =
    singleExt === 'zip' &&
    (currentDoc.docType === 'AUD' ||
      /audio|recording|wfr0[24]|wgn0[24]|wsp0[24]/i.test(currentDoc.name || currentDoc.path || ''));

  const [zipTracks, setZipTracks] = useState([]);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState(null);
  const [zipProgress, setZipProgress] = useState(null);
  const [selectedTrackIdx, setSelectedTrackIdx] = useState(0);
  const [useFullSingleAudio, setUseFullSingleAudio] = useState(false);

  const activeZipDoc = useMemo(() => {
    if (!file) return null;
    if (!isSplit && !isSinglePdf && isSingleAudioZip) return currentDoc;
    if (audioDockOpen && canDockAudio && audZipSib) return audZipSib;
    return null;
  }, [file, isSplit, isSinglePdf, isSingleAudioZip, currentDoc, audioDockOpen, canDockAudio, audZipSib]);

  const activeZipUrl = activeZipDoc ? getHfUrl(activeZipDoc.path) : '';
  const effectiveUnitCode = file?.unitCode || currentDoc?.unitCode || '';

  useEffect(() => {
    if (!activeZipUrl) {
      setZipTracks([]);
      setZipLoading(false);
      setZipError(null);
      setZipProgress(null);
      return undefined;
    }

    let cancelled = false;
    setZipLoading(true);
    setZipError(null);
    setZipProgress({ phase: 'downloading', percent: 0 });

    extractZipAudioTracks(activeZipUrl, (status) => {
      if (!cancelled) setZipProgress(status);
    })
      .then((tracks) => {
        if (cancelled) return;
        setZipTracks(tracks);
        let initialIdx = 0;
        const hasU2 = tracks.some((t) => t.unitHint === 'U2');
        const hasU4 = tracks.some((t) => t.unitHint === 'U4');
        if (hasU2 && hasU4) {
          if (effectiveUnitCode.endsWith('2')) {
            const idx2 = tracks.findIndex((t) => t.unitHint === 'U2');
            if (idx2 !== -1) initialIdx = idx2;
          } else if (effectiveUnitCode.endsWith('4')) {
            const idx4 = tracks.findIndex((t) => t.unitHint === 'U4');
            if (idx4 !== -1) initialIdx = idx4;
          }
        }
        setSelectedTrackIdx(initialIdx);
        setUseFullSingleAudio(false);
        setZipLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setZipError(err?.message || 'Failed to unpack audio archive');
        setZipLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeZipUrl, effectiveUnitCode]);

  const safeTrackIdx = zipTracks.length > 0 ? Math.min(selectedTrackIdx, zipTracks.length - 1) : 0;
  const activeZipTrack = zipTracks[safeTrackIdx] || null;

  const audioPlayerRef = useRef(null);
  const audioCurrentTimeRef = useRef(0);
  const transcriptListRef = useRef(null);
  const prevTranscriptExpandedRef = useRef(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleEntry, setSubtitleEntry] = useState(null);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleProgress, setSubtitleProgress] = useState(null);
  const [subtitleError, setSubtitleError] = useState(null);
  const [subtitleUncached, setSubtitleUncached] = useState(false);
  const [whisperApprovedIdentity, setWhisperApprovedIdentity] = useState('');
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [whisperRetryCount, setWhisperRetryCount] = useState(0);

  const activeAudioContext = useMemo(() => {
    if (!file) return null;
    const sittingKey = getPaperViewKey(file);
    const subject = file.subject || currentDoc?.subject || 'French';
    const spec = file.spec || currentDoc?.spec || 'IAL';
    const session = file.session || currentDoc?.session || '';

    if (!isSplit && !isSinglePdf) {
      if (isSingleAudioZip) {
        if (!activeZipTrack?.blobUrl) return null;
        return {
          mode: 'card',
          audioUrl: activeZipTrack.blobUrl,
          audioPath: currentDoc.path || '',
          sittingKey,
          trackIndex: zipTracks.length > 1 ? safeTrackIdx : 0,
          isMultiTrack: zipTracks.length > 1,
          trackFileName: activeZipTrack.fileName || '',
          unitHint: activeZipTrack.unitHint || '',
          subject,
          spec,
          session
        };
      }
      if (isSingleAudio && currentDoc.path) {
        return {
          mode: 'card',
          audioUrl: getHfUrl(currentDoc.path),
          audioPath: currentDoc.path || '',
          sittingKey,
          trackIndex: null,
          isMultiTrack: false,
          trackFileName: currentDoc.name || '',
          unitHint: '',
          subject,
          spec,
          session
        };
      }
    }

    if (audioDockOpen && canDockAudio && audSib) {
      if (!useFullSingleAudio && activeZipTrack?.blobUrl) {
        return {
          mode: 'dock',
          audioUrl: activeZipTrack.blobUrl,
          audioPath: (audZipSib || audSib).path || '',
          sittingKey,
          trackIndex: zipTracks.length > 1 ? safeTrackIdx : 0,
          isMultiTrack: zipTracks.length > 1,
          trackFileName: activeZipTrack.fileName || '',
          unitHint: activeZipTrack.unitHint || '',
          subject,
          spec,
          session
        };
      }
      const singleTarget = audSingleSib || (!audZipSib ? audSib : null);
      if (singleTarget?.path) {
        return {
          mode: 'dock',
          audioUrl: getHfUrl(singleTarget.path),
          audioPath: singleTarget.path || '',
          sittingKey,
          trackIndex: null,
          isMultiTrack: false,
          trackFileName: singleTarget.name || '',
          unitHint: '',
          subject,
          spec,
          session
        };
      }
    }

    return null;
  }, [
    file,
    currentDoc,
    isSplit,
    isSinglePdf,
    isSingleAudioZip,
    isSingleAudio,
    activeZipTrack,
    zipTracks.length,
    safeTrackIdx,
    audioDockOpen,
    canDockAudio,
    audSib,
    audZipSib,
    audSingleSib,
    useFullSingleAudio
  ]);

  const activeAudioIdentity = activeAudioContext
    ? `${activeAudioContext.audioPath}::${activeAudioContext.trackFileName}::${activeAudioContext.trackIndex ?? 'full'}`
    : '';

  useEffect(() => {
    audioCurrentTimeRef.current = 0;
    setAudioCurrentTime(0);
    setSubtitleEntry(null);
    setSubtitleLoading(false);
    setSubtitleProgress(null);
    setSubtitleError(null);
    setSubtitleUncached(false);
  }, [activeAudioIdentity]);

  useEffect(() => {
    if (!activeAudioContext || !subtitlesEnabled) {
      setSubtitleLoading(false);
      setSubtitleProgress(null);
      setSubtitleUncached(false);
      return undefined;
    }

    let cancelled = false;
    const candidateKeys = buildCandidateSubtitleKeys(activeAudioContext);

    setSubtitleLoading(true);
    setSubtitleError(null);
    setSubtitleUncached(false);

    resolveExistingSubtitles(candidateKeys)
      .then(async (existing) => {
        if (cancelled) return;
        if (existing && Array.isArray(existing.segments) && existing.segments.length > 0) {
          const adapted = adaptSubtitleEntryForTrack(existing, {
            isMultiTrack: activeAudioContext.isMultiTrack,
            trackIndex: activeAudioContext.trackIndex || 0
          });
          setSubtitleEntry(adapted);
          setSubtitleLoading(false);
          setSubtitleProgress(null);
          setSubtitleUncached(false);
          return;
        }

        if (whisperApprovedIdentity !== activeAudioIdentity) {
          setSubtitleLoading(false);
          setSubtitleProgress(null);
          setSubtitleUncached(true);
          return;
        }

        // Tier 3 Fallback: Live VAD + Whisper AI transcription for un-indexed or newly added audio
        const generated = await generateLiveWhisperSubtitles({
          audioUrl: activeAudioContext.audioUrl,
          subject: activeAudioContext.subject,
          trackIndex: activeAudioContext.trackIndex || 0,
          getCurrentTime: () => audioCurrentTimeRef.current,
          shouldCancel: () => cancelled,
          onProgress: (st) => {
            if (cancelled) return;
            setSubtitleProgress(st);
            if (Array.isArray(st.segments) && st.segments.length > 0) {
              setSubtitleEntry({
                source: 'whisper-ai',
                tier: 'live',
                language: activeAudioContext.subject.toLowerCase(),
                segments: st.segments
              });
            }
          }
        });

        if (cancelled || !generated) return;
        setSubtitleEntry({ ...generated, tier: 'live' });
        setSubtitleLoading(false);
        setSubtitleProgress(null);
        setSubtitleUncached(false);
        if (candidateKeys.length > 0 && generated.segments?.length > 0) {
          saveSubtitlesToCloud(candidateKeys[0], candidateKeys.slice(1), generated);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setSubtitleError(err?.message || 'Unable to load subtitles');
        setSubtitleLoading(false);
        setSubtitleProgress(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAudioIdentity, activeAudioContext, subtitlesEnabled, whisperApprovedIdentity, whisperRetryCount]);

  const subtitleSegments = useMemo(() => subtitleEntry?.segments || [], [subtitleEntry]);

  const activeSubtitleIdx = useMemo(() => {
    if (!subtitleSegments.length) return -1;
    const t = audioCurrentTime;
    let active = 0;
    for (let i = 0; i < subtitleSegments.length; i++) {
      if (subtitleSegments[i].start - 0.18 <= t) {
        active = i;
      }
    }
    return active;
  }, [subtitleSegments, audioCurrentTime]);

  const activeSubtitleSeg = activeSubtitleIdx >= 0 ? subtitleSegments[activeSubtitleIdx] : null;
  const nextSubtitleSeg =
    activeSubtitleIdx >= 0 && activeSubtitleIdx + 1 < subtitleSegments.length
      ? subtitleSegments[activeSubtitleIdx + 1]
      : null;

  useEffect(() => {
    if (!subtitlesEnabled || !transcriptExpanded || !transcriptListRef.current) {
      prevTranscriptExpandedRef.current = false;
      return;
    }
    const justOpened = !prevTranscriptExpandedRef.current;
    prevTranscriptExpandedRef.current = true;
    if (activeSubtitleIdx < 0) return;

    const container = transcriptListRef.current;
    const activeBtn = container.querySelector(`[data-seg-idx="${activeSubtitleIdx}"]`);
    if (activeBtn) {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeBtn.getBoundingClientRect();
      const relTop = activeRect.top - containerRect.top + container.scrollTop;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      const desiredTop = relTop - container.clientHeight / 2 + activeRect.height / 2;
      const targetTop = Math.min(maxScroll, Math.max(0, desiredTop));
      container.scrollTo({
        top: targetTop,
        behavior: justOpened ? 'auto' : 'smooth'
      });
    }
  }, [activeSubtitleIdx, transcriptExpanded, subtitlesEnabled, subtitleSegments]);

  const handleAudioTimeUpdate = useCallback((e) => {
    const t = e.currentTarget?.currentTime || 0;
    audioCurrentTimeRef.current = t;
    setAudioCurrentTime(t);
  }, []);

  const handleSeekToSubtitle = useCallback((startSec) => {
    const targetSec = Math.max(0, Number(startSec) || 0);
    audioCurrentTimeRef.current = targetSec;
    setAudioCurrentTime(targetSec);
    const el = audioPlayerRef.current;
    if (el) {
      try {
        el.currentTime = targetSec;
        if (el.paused) {
          el.play().catch(() => {});
        }
      } catch {
        // Ignore seek errors before metadata is ready
      }
    }
  }, []);

  const handleAudioEnded = useCallback(() => {
    if (useFullSingleAudio || zipTracks.length <= 1) return;
    setSelectedTrackIdx((prev) => {
      if (prev >= zipTracks.length - 1) return prev;
      const curr = zipTracks[prev];
      const next = zipTracks[prev + 1];
      if (curr?.unitHint && next?.unitHint && curr.unitHint !== next.unitHint) {
        return prev;
      }
      return prev + 1;
    });
  }, [useFullSingleAudio, zipTracks]);

  if (!file) return null;

  const singleUrl = getHfUrl(currentDoc.path);
  const singleTitle = getDisplayTitle(currentDoc);

  const modalTitle = isSplit
    ? getUnifiedSittingTitle(file)
    : singleTitle;

  const modalSubtitle = isSplit
    ? ''
    : `${currentDoc.path} ${currentDoc.size ? `(${formatBytes(currentDoc.size)})` : ''}`;

  const downloadUrl = isSplit ? getDownloadUrl(siblings.QP?.path) : getDownloadUrl(currentDoc.path);

  const renderSplitPdfPane = (docTypeKey, shouldFocus) => {
    const targetSib = docTypeKey === 'QP' ? siblings.QP : siblings.MS;
    const labelText = docTypeKey === 'QP' ? 'Question Paper' : 'Mark Scheme';
    return (
      <Suspense fallback={<PdfPaneSkeleton title={`Loading ${labelText}...`} subtitle="Initializing WebPDF Reader" />}>
        <PdfViewerPane
          key={docTypeKey}
          url={getHfUrl(targetSib.path)}
          title={targetSib.name || labelText}
          docType={docTypeKey}
          isMobile={isMobile}
          initialPage={1}
          onDownload={true}
          autoFocus={shouldFocus}
        />
      </Suspense>
    );
  };

  const renderSubtitleBar = (variant = 'dock') => {
    if (!subtitlesEnabled || !activeAudioContext) return null;
    const isOfficial = subtitleEntry?.source === 'official-transcript-pdf';
    const sourceBadgeText = isOfficial
      ? 'Transcript PDF'
      : subtitleEntry?.tier === 'static' || subtitleEntry?.tier === 'cloud'
      ? 'Synchronized Subtitles'
      : subtitleUncached && subtitleSegments.length === 0
      ? 'On-Demand AI Subtitles'
      : 'Live AI Subtitles';

    return (
      <div
        className={`modal-subtitle-bar ${variant === 'card' ? 'card-variant' : 'dock-variant'}`}
        role="region"
        aria-label="Synchronized Audio Subtitles"
      >
        <div className="modal-subtitle-top-row">
          <div className="modal-subtitle-meta">
            <span className="modal-subtitle-cc-pill">CC</span>
            <span className="modal-subtitle-source">{sourceBadgeText}</span>
            {subtitleSegments.length > 0 && (
              <span className="modal-subtitle-count">
                {subtitleSegments.length} {subtitleSegments.length === 1 ? 'segment' : 'segments'}
              </span>
            )}
            {subtitleLoading && subtitleProgress && (
              <span className="modal-subtitle-progress-tag" role="status" aria-live="polite">
                {subtitleProgress.message || `Transcribing (${subtitleProgress.percent || 0}%)...`}
              </span>
            )}
          </div>

          <div className="modal-subtitle-controls">
            {subtitleSegments.length > 0 && (
              <button
                type="button"
                className={`modal-subtitle-drawer-btn ${transcriptExpanded ? 'active' : ''}`}
                onClick={() => setTranscriptExpanded((prev) => !prev)}
                aria-expanded={transcriptExpanded}
                title={transcriptExpanded ? 'Hide full interactive transcript' : 'View full interactive transcript & click any line to seek'}
              >
                <span>{transcriptExpanded ? 'Hide Transcript' : 'Full Transcript'}</span>
              </button>
            )}
            <button
              type="button"
              className="modal-subtitle-hide-btn"
              onClick={() => setSubtitlesEnabled(false)}
              title="Hide Subtitles (CC)"
            >
              Hide CC
            </button>
          </div>
        </div>

        {subtitleLoading && subtitleSegments.length === 0 ? (
          <div className="modal-subtitle-loading-row" role="status" aria-live="polite">
            <span className="pdf-skeleton-spinner" />
            <span>
              {subtitleProgress?.message || 'Loading synchronized subtitles for this audio track...'}
            </span>
          </div>
        ) : subtitleError && subtitleSegments.length === 0 ? (
          <div className="modal-subtitle-error-row" role="alert">
            <span>Subtitles unavailable ({subtitleError}).</span>
            <button
              type="button"
              className="modal-subtitle-retry-btn"
              onClick={() => {
                setWhisperApprovedIdentity(activeAudioIdentity);
                setWhisperRetryCount((c) => c + 1);
              }}
            >
              Retry AI Subtitles
            </button>
          </div>
        ) : subtitleUncached && subtitleSegments.length === 0 ? (
          <div className="modal-subtitle-uncached-row">
            <span className="modal-subtitle-uncached-text">
              Not pre-indexed yet. Generate synchronized AI captions in your browser &mdash; streams live and saves for everyone.
            </span>
            <button
              type="button"
              className="modal-subtitle-generate-btn"
              onClick={() => setWhisperApprovedIdentity(activeAudioIdentity)}
            >
              Generate AI Subtitles
            </button>
          </div>
        ) : activeSubtitleSeg ? (
          <div className="modal-subtitle-live-stage">
            <button
              type="button"
              className="modal-subtitle-active-line"
              onClick={() => handleSeekToSubtitle(activeSubtitleSeg.start)}
              title={`Click to replay from ${formatSubtitleTimestamp(activeSubtitleSeg.start)}`}
            >
              <span className="modal-subtitle-time-badge">
                {formatSubtitleTimestamp(activeSubtitleSeg.start)}
              </span>
              <span className="modal-subtitle-active-text">{activeSubtitleSeg.text}</span>
            </button>
            {nextSubtitleSeg && (
              <button
                type="button"
                className="modal-subtitle-next-line"
                onClick={() => handleSeekToSubtitle(nextSubtitleSeg.start)}
                title={`Click to skip to ${formatSubtitleTimestamp(nextSubtitleSeg.start)}`}
              >
                <span className="modal-subtitle-next-label">
                  Next ({formatSubtitleTimestamp(nextSubtitleSeg.start)}):
                </span>
                <span className="modal-subtitle-next-text">{nextSubtitleSeg.text}</span>
              </button>
            )}
          </div>
        ) : null}

        {transcriptExpanded && subtitleSegments.length > 0 && (
          <div
            ref={transcriptListRef}
            className="modal-subtitle-drawer"
            role="list"
            aria-label="Full timestamped transcript"
          >
            {subtitleSegments.map((seg, idx) => {
              const isCurrentSeg = idx === activeSubtitleIdx;
              return (
                <button
                  key={`${seg.start}-${idx}`}
                  type="button"
                  role="listitem"
                  data-seg-idx={idx}
                  className={`modal-subtitle-seg-btn ${isCurrentSeg ? 'active' : ''}`}
                  onClick={() => handleSeekToSubtitle(seg.start)}
                  title={`Jump audio to ${formatSubtitleTimestamp(seg.start)}`}
                >
                  <span className="modal-subtitle-seg-time">
                    {formatSubtitleTimestamp(seg.start)}
                  </span>
                  <span className="modal-subtitle-seg-text">{seg.text}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={modalTitle}>
      <div className={`modal-container ${isSplit ? 'modal-split-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Docked top unhide bar when header is collapsed (zero overlap with pane titles) */}
        {!headerVisible && (
          <div
            className="modal-docked-unhide-bar"
            onClick={() => setHeaderVisible(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHeaderVisible(true); } }}
            title="Click to restore header (or press H)"
          >
            <span className="unhide-bar-content">▼ Show Header Controls (Press H)</span>
          </div>
        )}

        {/* Unified Ivy League Academic Light Header */}
        {headerVisible && (
          <div className="modal-header">
            {/* Left side: Auto-fitting title & structured badges */}
            <div className="modal-title-group">
              <div className="modal-title-row">
                <span className="modal-title" title={modalTitle}>{modalTitle}</span>
                {file.curriculum && (
                  <span className="modal-header-badge curriculum">{file.curriculum}</span>
                )}
                {isSplit && (
                  <span className="modal-header-badge split-indicator">QP + MS</span>
                )}
                {showViews && (
                  <PaperViewsCounter count={viewsCount} variant="modal" />
                )}
                <button
                  type="button"
                  className="modal-close-btn mobile-only-close"
                  onClick={onClose}
                  aria-label="Close preview"
                  title="Close Preview (Esc)"
                >
                  ✕
                </button>
              </div>
              {!isSplit && (
                <div className="modal-subtitle" title={modalSubtitle}>
                  <span className="modal-doc-name">{currentDoc.name || currentDoc.path}</span>
                  {currentDoc.size ? <span className="modal-doc-size">({formatBytes(currentDoc.size)})</span> : null}
                </div>
              )}
            </div>

            {/* Right side: Consolidated buttons with strict pixel uniformity */}
            <div className="modal-header-controls-bar">
              {/* Document View Switchers */}
              <div className="modal-view-tabs" role="tablist" aria-label="Document views">
                {['QP', 'MS', 'ER', 'SC', 'AUD', 'DF', 'SOL', 'SAM'].map((type) => {
                  const sib = siblings[type];
                  if (!sib) return null;
                  const isDockedAudioTab = type === 'AUD' && canDockAudio;
                  const isCurrent = isDockedAudioTab
                    ? audioDockOpen
                    : (!isSplit && (activeView === type || currentDoc.path === sib.path));
                  const labelMap = {
                    QP: ['Question Paper', 'QP'],
                    MS: ['Mark Scheme', 'MS'],
                    ER: ['Examiner Report', 'ER'],
                    SC: ['Scientific Article', 'SC'],
                    AUD: ['Listening Audio', 'Audio'],
                    DF: ['Data / Formulae', 'Data'],
                    SOL: ['Worked Solution', 'SOL'],
                    SAM: ['Sample Paper', 'SAM']
                  };
                  const [fullLabel, shortLabel] = labelMap[type] || [type, type];
                  return (
                    <button
                      key={type}
                      type="button"
                      role={isDockedAudioTab ? undefined : 'tab'}
                      aria-selected={isDockedAudioTab ? undefined : isCurrent}
                      aria-pressed={isDockedAudioTab ? audioDockOpen : undefined}
                      className={`modal-btn modal-view-btn ${type.toLowerCase()} ${isCurrent ? 'active' : ''}`}
                      onClick={() => handleSelectView(type)}
                      title={isDockedAudioTab ? (audioDockOpen ? 'Hide docked audio player' : 'Play listening audio above paper') : `View ${fullLabel}`}
                    >
                      <span className="btn-desktop-text">{fullLabel}</span>
                      <span className="btn-mobile-text" aria-hidden="true">{shortLabel}</span>
                    </button>
                  );
                })}

                {canSplit && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isSplit}
                    className={`modal-btn modal-view-btn split ${isSplit ? 'active' : ''}`}
                    onClick={() => handleSelectView('split')}
                    title="View Question Paper and Mark Scheme side-by-side"
                  >
                    <span className="btn-desktop-text">Split View</span>
                    <span className="btn-mobile-text" aria-hidden="true">Split</span>
                  </button>
                )}

                {isSplit && (
                  <button
                    type="button"
                    className={`modal-btn modal-swap-split-btn ${swapSplit ? 'active' : ''}`}
                    onClick={() => setSwapSplit((prev) => !prev)}
                    aria-pressed={swapSplit}
                    title={swapSplit ? 'Restore Question Paper left / Mark Scheme right' : 'Swap Question Paper and Mark Scheme pane positions'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                    <span className="btn-desktop-text">Swap Panes</span>
                    <span className="btn-mobile-text" aria-hidden="true">Swap</span>
                  </button>
                )}
              </div>

              <div className="modal-control-separator" />

              {/* Theme Toggle Button (Light / Dark / OLED) */}
              {onToggleTheme && (
                <button
                  type="button"
                  className="modal-btn modal-theme-toggle-btn"
                  onClick={onToggleTheme}
                  title={
                    theme === 'light'
                      ? 'Current: Academic Light - Click for Dark Mode'
                      : theme === 'dark'
                      ? 'Current: Academic Dark - Click for Pure OLED Mode'
                      : 'Current: Pure OLED - Click for Light Mode'
                  }
                >
                  {theme === 'light' ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                      <span className="btn-desktop-text">Light</span>
                    </>
                  ) : theme === 'dark' ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                      <span className="btn-desktop-text">Dark</span>
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 3v18A9 9 0 0 0 12 3z" fill="currentColor"/></svg>
                      <span className="btn-desktop-text">OLED</span>
                    </>
                  )}
                </button>
              )}

              {/* Hide Header Button */}
              <button
                type="button"
                className="modal-btn modal-hide-header-btn"
                onClick={() => setHeaderVisible(false)}
                title="Hide header for distraction-free reading (Press H to restore)"
              >
                <span className="btn-desktop-text">Hide Header</span>
                <span className="btn-mobile-text" aria-hidden="true">Hide</span>
              </button>

              {/* Download PDF directly */}
              <a
                href={downloadUrl}
                download
                rel="noopener noreferrer"
                className="modal-btn modal-link-btn"
                title="Download document"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download</span>
              </a>

              {/* Close Button */}
              <button
                type="button"
                className="modal-close-btn desktop-only-close"
                onClick={onClose}
                aria-label="Close preview"
                title="Close Preview (Esc)"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Persistent Docked Audio Player above Question Paper / Split Stage */}
        {audioDockOpen && canDockAudio && audSib && (
          <div className="modal-audio-dock" role="region" aria-label="Listening Audio Player">
            <div className="modal-audio-dock-info">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span
                className="modal-audio-dock-label"
                title={
                  !useFullSingleAudio && activeZipTrack
                    ? `${activeZipTrack.title} (${audZipSib?.name || audSib.name})`
                    : audSib.name || audSib.path
                }
              >
                {!useFullSingleAudio && activeZipTrack
                  ? activeZipTrack.title
                  : audSib.name || 'Listening Audio Track'}
              </span>
            </div>

            {zipTracks.length > 0 && (zipTracks.length > 1 || audSingleSib) && (
              <div className="modal-audio-dock-tracks" role="group" aria-label="Select audio track">
                {zipTracks.map((track, idx) => (
                  <button
                    key={track.id}
                    type="button"
                    className={`modal-audio-track-pill ${!useFullSingleAudio && safeTrackIdx === idx ? 'active' : ''}`}
                    onClick={() => {
                      setUseFullSingleAudio(false);
                      setSelectedTrackIdx(idx);
                    }}
                    title={`${track.title} (${formatBytes(track.size)})`}
                  >
                    {track.shortLabel}
                  </button>
                ))}
                {audSingleSib && (
                  <button
                    type="button"
                    className={`modal-audio-track-pill ${useFullSingleAudio ? 'active' : ''}`}
                    onClick={() => setUseFullSingleAudio(true)}
                    title={`Play full combined audio (${audSingleSib.name})`}
                  >
                    Full Audio
                  </button>
                )}
              </div>
            )}

            {zipLoading && !useFullSingleAudio && !activeZipTrack ? (
              <div className="modal-audio-dock-status" role="status" aria-live="polite">
                <span className="pdf-skeleton-spinner" />
                <span className="modal-audio-dock-status-text">
                  {zipProgress?.phase === 'unpacking'
                    ? `Unpacking ${zipProgress.entryName || 'track'} (${zipProgress.currentTrack}/${zipProgress.totalTracks})...`
                    : `Streaming & unpacking ZIP audio in browser${zipProgress?.percent ? ` (${zipProgress.percent}%)` : '...'}`}
                </span>
              </div>
            ) : zipError && !useFullSingleAudio && !audSingleSib ? (
              <div className="modal-audio-dock-status error" role="alert">
                <span className="modal-audio-dock-status-text">
                  Unable to unpack archive in browser ({zipError}).
                </span>
              </div>
            ) : (
              <audio
                ref={audioPlayerRef}
                controls
                autoPlay
                preload="metadata"
                className="modal-audio-dock-player"
                src={
                  !useFullSingleAudio && activeZipTrack?.blobUrl
                    ? activeZipTrack.blobUrl
                    : getHfUrl((audSingleSib || audSib).path)
                }
                onTimeUpdate={handleAudioTimeUpdate}
                onSeeked={handleAudioTimeUpdate}
                onLoadedMetadata={handleAudioTimeUpdate}
                onEnded={handleAudioEnded}
              >
                Your browser does not support the audio element.
              </audio>
            )}

            <div className="modal-audio-dock-actions">
              <button
                type="button"
                className={`modal-audio-cc-btn ${subtitlesEnabled ? 'active' : ''}`}
                onClick={() => setSubtitlesEnabled((prev) => !prev)}
                aria-pressed={subtitlesEnabled}
                title={subtitlesEnabled ? 'Hide synchronized subtitles (CC)' : 'Show synchronized subtitles (CC)'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                  <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                </svg>
                <span>Subtitles</span>
              </button>
              {!useFullSingleAudio && activeZipTrack?.blobUrl && (
                <a
                  href={activeZipTrack.blobUrl}
                  download={activeZipTrack.fileName}
                  className="modal-audio-dock-download track-dl"
                  title={`Download unpacked track: ${activeZipTrack.fileName} (${formatBytes(activeZipTrack.size)})`}
                >
                  <span>{activeZipTrack.shortLabel} ({activeZipTrack.ext.toUpperCase()})</span>
                </a>
              )}
              {audSingleSib && (
                <a
                  href={getDownloadUrl(audSingleSib.path)}
                  download
                  rel="noopener noreferrer"
                  className="modal-audio-dock-download"
                  title={`Download full audio file (${audSingleSib.name})`}
                >
                  Download {(audSingleSib.ext || 'MP3').toUpperCase()}
                </a>
              )}
              {audZipSib && (
                <a
                  href={getDownloadUrl(audZipSib.path)}
                  download
                  rel="noopener noreferrer"
                  className="modal-audio-dock-download"
                  title={`Download full ZIP archive (${audZipSib.name})`}
                >
                  Download ZIP
                </a>
              )}
              <button
                type="button"
                className="modal-audio-dock-close"
                onClick={() => setAudioDockOpen(false)}
                aria-label="Close docked audio player"
                title="Hide Audio Bar"
              >
                ×
              </button>
            </div>

            {renderSubtitleBar('dock')}
          </div>
        )}

        {/* Modal Stage (Hardware-accelerated CSS split sizing) */}
        <div
          ref={modalBodyRef}
          className={`modal-body ${file.isPendingSkeleton ? 'single-container' : isSplit ? 'split-container' : 'single-container'} ${isDragging ? 'is-resizing' : ''} ${!headerVisible ? 'header-hidden' : ''}`}
          style={{
            '--desktop-split-pct': `${desktopSplitRatio}%`,
            '--mobile-split-pct': `${mobileSplitRatio}%`
          }}
        >
          {file.isPendingSkeleton ? (
            <PdfPaneSkeleton
              title={`Loading ${modalTitle}...`}
              subtitle="Fetching examination paper directly into on-site reader"
            />
          ) : isSplit ? (
            <>
              {/* First Split Pane (QP by default, MS when swapped) */}
              <div className="modal-split-pane qp-pane">
                {swapSplit ? renderSplitPdfPane('MS', true) : renderSplitPdfPane('QP', true)}
              </div>

              {/* Desktop Horizontal Split Resizer */}
              {!isMobile && (
                <div
                  className={`modal-split-resizer ${isDragging ? 'dragging' : ''}`}
                  onMouseDown={handleDesktopDragStart}
                  onTouchStart={handleDesktopDragStart}
                  onDoubleClick={handleResetSplit}
                  onKeyDown={handleDesktopResizerKeyDown}
                  tabIndex={0}
                  title="Drag or use Left/Right Arrow keys to resize panes (Double-click or Home to reset 50/50)"
                  role="separator"
                  aria-label="Resize split panes"
                  aria-orientation="vertical"
                  aria-valuenow={Math.round(desktopSplitRatio)}
                  aria-valuemin={15}
                  aria-valuemax={85}
                >
                  <div className="resizer-handle-grip" />
                </div>
              )}

              {/* Mobile Vertical Split Resizer (for Phones) */}
              {isMobile && (
                <div
                  className={`modal-mobile-split-resizer ${isDragging ? 'dragging' : ''}`}
                  onTouchStart={handleMobileDragStart}
                  onMouseDown={handleMobileDragStart}
                  onDoubleClick={handleResetSplit}
                  onKeyDown={handleMobileResizerKeyDown}
                  tabIndex={0}
                  title="Drag or use Up/Down Arrow keys to resize split (Double-tap or Home to reset 50/50)"
                  role="separator"
                  aria-label="Resize top and bottom panes"
                  aria-orientation="horizontal"
                  aria-valuenow={Math.round(mobileSplitRatio)}
                  aria-valuemin={18}
                  aria-valuemax={82}
                >
                  <div className="mobile-resizer-grip" />
                </div>
              )}

              {/* Second Split Pane (MS by default, QP when swapped) */}
              <div className="modal-split-pane ms-pane">
                {swapSplit ? renderSplitPdfPane('QP', false) : renderSplitPdfPane('MS', false)}
              </div>
            </>
          ) : (
            <div className="modal-single-pane">
              {!isSinglePdf ? (
                <div className="modal-resource-card">
                  <div className={`modal-resource-box ${isSingleAudioZip ? 'audio-zip-box' : ''}`}>
                    <h3>{singleTitle}</h3>
                    <p>{currentDoc.name || currentDoc.path}</p>
                    {isSingleAudio && (
                      <>
                        <div className="modal-zip-audio-header">
                          <span className="modal-zip-audio-badge">In-Browser Audio Player</span>
                          <button
                            type="button"
                            className={`modal-audio-cc-btn ${subtitlesEnabled ? 'active' : ''}`}
                            onClick={() => setSubtitlesEnabled((prev) => !prev)}
                            aria-pressed={subtitlesEnabled}
                            title={subtitlesEnabled ? 'Hide synchronized subtitles (CC)' : 'Show synchronized subtitles (CC)'}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                              <rect x="2" y="4" width="20" height="16" rx="2" />
                              <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                              <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                            </svg>
                            <span>Subtitles (CC)</span>
                          </button>
                        </div>
                        <audio
                          ref={audioPlayerRef}
                          controls
                          autoPlay
                          className="modal-audio-player"
                          src={singleUrl}
                          onTimeUpdate={handleAudioTimeUpdate}
                          onSeeked={handleAudioTimeUpdate}
                          onLoadedMetadata={handleAudioTimeUpdate}
                        >
                          Your browser does not support the audio element.
                        </audio>
                        {renderSubtitleBar('card')}
                      </>
                    )}
                    {isSingleAudioZip && (
                      <div className="modal-zip-audio-section">
                        {zipLoading ? (
                          <div className="modal-zip-audio-loading" role="status" aria-live="polite">
                            <span className="pdf-skeleton-spinner" />
                            <span>
                              {zipProgress?.phase === 'unpacking'
                                ? `Unpacking ${zipProgress.entryName || 'audio track'} (${zipProgress.currentTrack}/${zipProgress.totalTracks}) in browser...`
                                : `Streaming & unpacking ZIP audio in browser${zipProgress?.percent ? ` (${zipProgress.percent}%)` : '...'}`}
                            </span>
                          </div>
                        ) : zipError ? (
                          <div className="modal-zip-audio-error" role="alert">
                            Unable to unpack audio in browser ({zipError}). You can still download the ZIP archive below.
                          </div>
                        ) : zipTracks.length > 0 ? (
                          <>
                            <div className="modal-zip-audio-header">
                              <span className="modal-zip-audio-badge">
                                In-Browser Player • {zipTracks.length} {zipTracks.length === 1 ? 'Track' : 'Tracks'} Ready
                              </span>
                              <div className="modal-zip-header-right">
                                {activeZipTrack && (
                                  <span className="modal-zip-active-name">
                                    Playing: {activeZipTrack.fileName} ({formatBytes(activeZipTrack.size)})
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className={`modal-audio-cc-btn ${subtitlesEnabled ? 'active' : ''}`}
                                  onClick={() => setSubtitlesEnabled((prev) => !prev)}
                                  aria-pressed={subtitlesEnabled}
                                  title={subtitlesEnabled ? 'Hide synchronized subtitles (CC)' : 'Show synchronized subtitles (CC)'}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                                    <rect x="2" y="4" width="20" height="16" rx="2" />
                                    <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                                    <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0" />
                                  </svg>
                                  <span>Subtitles (CC)</span>
                                </button>
                              </div>
                            </div>
                            {zipTracks.length > 1 && (
                              <div className="modal-zip-track-list" role="group" aria-label="Audio tracks in archive">
                                {zipTracks.map((track, idx) => (
                                  <button
                                    key={track.id}
                                    type="button"
                                    className={`modal-zip-track-btn ${safeTrackIdx === idx ? 'active' : ''}`}
                                    onClick={() => setSelectedTrackIdx(idx)}
                                  >
                                    <span className="modal-zip-track-title">{track.title}</span>
                                    <span className="modal-zip-track-meta">
                                      {formatBytes(track.size)} • {track.ext.toUpperCase()}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {activeZipTrack?.blobUrl && (
                              <>
                                <audio
                                  ref={audioPlayerRef}
                                  controls
                                  autoPlay
                                  preload="metadata"
                                  className="modal-audio-player"
                                  src={activeZipTrack.blobUrl}
                                  onTimeUpdate={handleAudioTimeUpdate}
                                  onSeeked={handleAudioTimeUpdate}
                                  onLoadedMetadata={handleAudioTimeUpdate}
                                  onEnded={handleAudioEnded}
                                >
                                  Your browser does not support the audio element.
                                </audio>
                                {renderSubtitleBar('card')}
                                <a
                                  href={activeZipTrack.blobUrl}
                                  download={activeZipTrack.fileName}
                                  className="modal-track-download-btn"
                                >
                                  Download Current Track — {activeZipTrack.fileName} ({formatBytes(activeZipTrack.size)})
                                </a>
                              </>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                    <a
                      href={downloadUrl}
                      rel="noopener noreferrer"
                      download
                      className="modal-download-btn"
                    >
                      Download {singleExt.toUpperCase()} Resource ({formatBytes(currentDoc.size)})
                    </a>
                  </div>
                </div>
              ) : (
                <Suspense fallback={<PdfPaneSkeleton title={`Loading ${singleTitle}...`} subtitle="Initializing WebPDF Reader" />}>
                  <PdfViewerPane
                    key={currentDoc.path}
                    url={singleUrl}
                    title={singleTitle}
                    docType={currentDoc.docType || 'DOC'}
                    isMobile={isMobile}
                    initialPage={1}
                    onDownload={true}
                    autoFocus={true}
                  />
                </Suspense>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

  // Global utility to purge all cached index/chunk entries while preserving theme, study history & viewer ID
function forcePurgeCacheAndReload() {
  try {
    const preserveKeys = ['cs_theme', 'cs_recent_papers_v1', 'cs_viewer_id_v1'];
    const preserved = {};
    preserveKeys.forEach((k) => {
      const val = localStorage.getItem(k);
      if (val !== null) preserved[k] = val;
    });
    localStorage.clear();
    Object.entries(preserved).forEach(([k, val]) => {
      localStorage.setItem(k, val);
    });
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
    // Only auto-purge if it is genuinely a Vite chunk / dynamic import fetch error
    const isChunkError = /dynamically imported module|Loading chunk|Failed to fetch|preload/i.test(errorMsg || '');
    if (!isChunkError) return;
    try {
      if (!sessionStorage.getItem('cs_auto_healed')) {
        sessionStorage.setItem('cs_auto_healed', '1');
        forcePurgeCacheAndReload();
      }
    } catch {
      // Ignore storage access errors
    }
  }, [errorMsg]);

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
          <button
            type="button"
            className="search-button return-to-library-btn"
            onClick={onGoHome}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Return to Library Repository</span>
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
              <div className="team-name">Nafiz.R</div>
              <div className="team-role">Founder &amp; Lead Architect</div>
            </div>
            <div className="team-card">
              <div className="team-name">Nazmul.K</div>
              <div className="team-role">Co-Founder &amp; Systems Lead</div>
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
              <div className="team-role">Research &amp; Intelligence Lead</div>
            </div>
            <div className="team-card">
              <div className="team-name">Gemin Fauré Hidrojen</div>
              <div className="team-role">Intern, Optimizer</div>
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
          <h2>Non-Affiliation &amp; Educational Notice</h2>
          <p>
            Conceptualist Systems is an independent student study index and reader and is not affiliated with, endorsed by, sponsored by, or officially connected to Pearson plc or Edexcel. All trademarks and examination materials remain the property of their respective copyright holders and are provided strictly for personal revision and educational reference. Rights holders may contact us below for prompt removal.
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
          <button
            type="button"
            className="search-button return-to-library-btn"
            onClick={onGoHome}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Return to Library Repository</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Interactive Step-by-Step Homepage Navigator ──────────────────
const WelcomePage = ({
  data,
  recentHistory = [],
  onOpenPaper,
  onClearHistory,
  getOnSitePaperUrl,
  onSubjectSelect,
  onViewAll,
  onBrowseTextbooks,
  onBrowseAudio,
  onTrySampleAudio,
  onSelectFinalFilter
}) => {
  const [selectedSubject, setSelectedSubject] = useState(null); // { name, curriculum }
  const [selectedUnit, setSelectedUnit] = useState(null); // string | null
  const hasHistory = Array.isArray(recentHistory) && recentHistory.length > 0;
  const bookCount = useMemo(() => (
    Array.isArray(data.unifiedFiles) && data.unifiedFiles.length > 0
      ? data.unifiedFiles.filter((f) => f.category === 'Books' || f.category === 'IAL Books' || f.category === 'IGCSE Books').length
      : 71
  ), [data.unifiedFiles]);
  const audioCount = useMemo(() => (
    Array.isArray(data.flatFiles) && data.flatFiles.length > 0
      ? data.flatFiles.filter((f) => f.docType === 'AUD').length
      : 96
  ), [data.flatFiles]);

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
            <h1>Past Exam Papers &amp; Course Resources</h1>
            <p>
              Independent Edexcel IAL &amp; IGCSE study archive — read paired papers in Split View, browse worked solution textbooks, or stream listening exams with live subtitles in-browser.
            </p>
          </div>
          <div className="hero-stats-row">
            <div className="hero-stat-pill">
              <strong>{(data.meta?.uniqueFiles || data.meta?.totalFiles || 10146).toLocaleString()}</strong>
              <span>{data.meta?.uniqueFiles ? 'Unique Papers' : 'Total Files'}</span>
            </div>
            <div className="hero-stat-pill">
              <strong>{ialSubjects.length + igcseSubjects.length}</strong>
              <span>Subjects</span>
            </div>
          </div>
        </div>
      </div>

      {!selectedSubject && (
        <section className="home-pillars-grid" aria-label="Core archive collections">
          <div className="pillar-card">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <h2>Past Exam Papers</h2>
              </div>
              <span className="pillar-badge">2003–2026</span>
            </div>
            <p className="pillar-desc">
              Paired Question Papers, Mark Schemes &amp; Examiner Reports with instant side-by-side Split View.
            </p>
            <div className="pillar-actions">
              <a
                href="/papers"
                className="pillar-btn"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  onViewAll();
                }}
              >
                Browse All Papers →
              </a>
            </div>
          </div>

          <div className="pillar-card pillar-books">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                <h2>Textbooks &amp; Solutions</h2>
              </div>
              <span className="pillar-badge pillar-badge-books">{bookCount} Resources</span>
            </div>
            <p className="pillar-desc">
              Complete Edexcel IAL &amp; IGCSE student books, revision guides, and step-by-step Solution Banks.
            </p>
            <div className="pillar-actions">
              <a
                href="/textbooks"
                className="pillar-btn"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  onBrowseTextbooks();
                }}
              >
                Browse Textbooks →
              </a>
            </div>
          </div>

          <div className="pillar-card pillar-audio">
            <div className="pillar-card-head">
              <div className="pillar-title-row">
                <svg className="pillar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
                <h2>Listening Audio &amp; Subtitles</h2>
              </div>
              <span className="pillar-badge pillar-badge-audio">Live CC · In-Browser</span>
            </div>
            <p className="pillar-desc">
              Play {audioCount} French, German &amp; Spanish MP3s and ZIP archives above Question Papers with clickable synced transcripts.
            </p>
            <div className="pillar-actions">
              <a
                href="/?paper=IAL%7CFrench%7CWFR02%7C%7CJune%202021&view=AUD"
                className="pillar-btn primary"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  onTrySampleAudio();
                }}
              >
                Try Sample Track + CC
              </a>
              <a
                href="/audio"
                className="pillar-btn"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  onBrowseAudio();
                }}
              >
                All Audio →
              </a>
            </div>
          </div>
        </section>
      )}

      {/* RECENTLY VIEWED PAST PAPERS HISTORY SECTION (Shown once user has opened a paper) */}
      {hasHistory && !selectedSubject && (
        <section className="history-section" aria-label="Recently Viewed Past Papers">
          <div className="history-header-row">
            <div className="history-title-group">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <h2 className="history-section-title">Recently Viewed Past Papers</h2>
              <span className="history-count-pill">{recentHistory.length} recent</span>
            </div>
            <button
              type="button"
              className="history-clear-btn"
              onClick={onClearHistory}
              title="Clear recently viewed papers history"
            >
              Clear History
            </button>
          </div>

          <div className="history-grid">
            {recentHistory.map((item) => {
              const title = item.isUnifiedSitting ? getUnifiedSittingTitle(item) : getDisplayTitle(item);
              const docs = item.docs || item.siblings || {};
              const hasQP = Boolean(docs.QP || item.docType === 'QP');
              const hasMS = Boolean(docs.MS || item.docType === 'MS');
              const hasER = Boolean(docs.ER || item.docType === 'ER');
              const hasAUD = Boolean(docs.AUD || item.docType === 'AUD');
              const hasSC = Boolean(docs.SC || item.docType === 'SC');
              const canSplit = Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf');
              const primaryMode = hasQP ? 'QP' : (item.lastView || item.docType || 'QP');
              const qpHref = getOnSitePaperUrl ? getOnSitePaperUrl(item, primaryMode) : '#';

              return (
                <div
                  key={item.id || item.path}
                  className="history-card"
                >
                  <a
                    href={qpHref}
                    className="history-card-main-link"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenPaper(item, primaryMode);
                    }}
                    title={`Resume Question Paper: ${title}`}
                  >
                    <div className="history-card-top">
                      <div className="history-card-badges">
                        <span className={`curr-mini-badge ${item.curriculum === 'Edexcel IGCSE' ? 'igcse' : 'ial'}`}>
                          {item.curriculum === 'Edexcel IGCSE' ? 'IGCSE' : 'IAL'}
                        </span>
                        {item.session && (
                          <span className="history-session-tag">{item.session}</span>
                        )}
                      </div>
                    </div>
                    <div className="history-card-title">{title}</div>
                  </a>

                  <div className="history-card-actions" aria-label={`Quick links for ${title}`}>
                    {hasQP && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'QP') : '#'}
                        className="history-doc-btn qp"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'QP');
                        }}
                        title="Open Question Paper"
                      >
                        QP
                      </a>
                    )}
                    {hasMS && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'MS') : '#'}
                        className="history-doc-btn ms"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'MS');
                        }}
                        title="Open Mark Scheme"
                      >
                        MS
                      </a>
                    )}
                    {hasER && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'ER') : '#'}
                        className="history-doc-btn er"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'ER');
                        }}
                        title="Open Examiner Report"
                      >
                        ER
                      </a>
                    )}
                    {hasAUD && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'AUD') : '#'}
                        className="history-doc-btn aud"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'AUD');
                        }}
                        title="Open Listening Audio"
                      >
                        AUD
                      </a>
                    )}
                    {hasSC && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'SC') : '#'}
                        className="history-doc-btn extra"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'SC');
                        }}
                        title="Open Source / Transcript"
                      >
                        SC
                      </a>
                    )}
                    {canSplit && (
                      <a
                        href={getOnSitePaperUrl ? getOnSitePaperUrl(item, 'split') : '#'}
                        className="history-doc-btn split"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenPaper(item, 'split');
                        }}
                        title="Open Question Paper and Mark Scheme side by side in Split View"
                      >
                        <span className="btn-desktop-text">Split View</span>
                        <span className="btn-mobile-text" aria-hidden="true">Split</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* STEP 2 / STEP 3 INTERACTIVE DRILLDOWN WIZARD */}
      {selectedSubject ? (
        <div className="interactive-wizard-card">
          <div className="wizard-breadcrumb">
            <button
              type="button"
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
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSubjectClick(subject, 'Edexcel IAL'); } }}
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
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSubjectClick(subject, 'Edexcel IGCSE'); } }}
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

const DEFAULT_META = {
  totalFiles: 13939,
  uniqueFiles: 10146,
  subjects: [
    'Accounting', 'Arabic', 'Bangla', 'Biology', 'Business', 'Chemistry', 'Commerce',
    'Computer Science', 'Economics', 'English Language', 'English Language A', 'English Language B',
    'English Literature', 'French', 'Further Pure Mathematics', 'Geography', 'German', 'Greek',
    'History', 'Human Biology', 'Information Technology', 'Law', 'Math',
    'Mathematics A', 'Mathematics B', 'Physics', 'Psychology', 'Spanish'
  ],
  ialSubjects: [
    'Accounting', 'Arabic', 'Biology', 'Business', 'Chemistry', 'Economics',
    'English Language', 'English Literature', 'French', 'Geography', 'German', 'Greek',
    'History', 'Information Technology', 'Law', 'Math', 'Physics', 'Psychology', 'Spanish'
  ],
  igcseSubjects: [
    'Accounting', 'Bangla', 'Biology', 'Business', 'Chemistry', 'Commerce',
    'Computer Science', 'Economics', 'English Language A', 'English Language B',
    'English Literature', 'Further Pure Mathematics', 'Geography', 'Human Biology',
    'Information Technology', 'Mathematics A', 'Mathematics B', 'Physics'
  ],
  coverage: 'January 2003 – June 2026'
};

// Read cached meta synchronously so repeat visits render in 0ms before fetch even begins
function getInitialCachedMeta() {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.meta) {
      return { meta: parsed.meta };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

// ─── Main Application ────────────────────────────────────────────
function App() {
  const isMobile = useIsMobile();
  const initialCache = useMemo(() => getInitialCachedMeta(), []);
  const initialRoute = useMemo(() => (
    typeof window !== 'undefined'
      ? parseRouteFromLocation(window.location.pathname, window.location.search, initialCache?.meta || DEFAULT_META)
      : {}
  ), [initialCache]);

  const [isNotFound, setIsNotFound] = useState(Boolean(initialRoute.notFound));
  const [viewsMap, setViewsMap] = useState(() => readLocalViewsCache() || {});
  const [recentHistory, setRecentHistory] = useState(() => getInitialRecentHistory());

  const [data, setData] = useState(() => ({
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
  const [currentTab, setCurrentTab] = useState(initialRoute.currentTab || 'library'); // 'library' | 'about' | 'changelog'
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [previewInitialView, setPreviewInitialView] = useState(initialRoute.viewParam || '');
  const [previewFile, setPreviewFile] = useState(() => {
    if (!initialRoute.paperParam) return null;
    const hist = getInitialRecentHistory();
    const cachedMatch = hist.find(
      h => h.id === initialRoute.paperParam || h.path === initialRoute.paperParam
    );
    return cachedMatch || buildPendingPaperPlaceholder(initialRoute.paperParam, initialRoute.viewParam);
  });
  const [pendingPaperParam, setPendingPaperParam] = useState(initialRoute.paperParam || '');
  const [viewMode, setViewMode] = useState('unified'); // 'unified' | 'separate'

  // Theme Management (Default: Light Mode; Persistent across Sessions & Cookies; Supports 'light' | 'dark' | 'oled')
  const [theme, setTheme] = useState(() => {
    try {
      const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )cs_theme=([^;]*)/) : null;
      const cookieTheme = match ? decodeURIComponent(match[1]) : null;
      const saved = cookieTheme || (typeof localStorage !== 'undefined' ? localStorage.getItem('cs_theme') : null);
      if (saved === 'dark' || saved === 'light' || saved === 'oled') return saved;
    } catch {}
    return 'light'; // Light Mode is strictly default
  });

  const themeSwitchRafRef = useRef(null);
  const activeThemeTransitionRef = useRef(null);
  const didMountThemeRef = useRef(false);

  const isPreviewOpen = Boolean(previewFile);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('modal-open', isPreviewOpen);
    return () => root.classList.remove('modal-open');
  }, [isPreviewOpen]);

  useLayoutEffect(() => {
    try {
      const root = document.documentElement;
      const isThemeChange = didMountThemeRef.current;
      didMountThemeRef.current = true;
      const isViewTransitionActive = root.classList.contains('theme-vt');

      if (isThemeChange && !isViewTransitionActive) {
        root.classList.add('theme-switching');
      }
      if (root.getAttribute('data-theme') !== theme) {
        root.setAttribute('data-theme', theme);
      }
      const metaTheme = document.getElementById('meta-theme-color');
      const metaColor = theme === 'oled' ? '#000000' : (theme === 'dark' ? '#121417' : '#6F1D2B');
      if (metaTheme && metaTheme.getAttribute('content') !== metaColor) {
        metaTheme.setAttribute('content', metaColor);
      }

      if (isThemeChange && !isViewTransitionActive) {
        if (themeSwitchRafRef.current) {
          cancelAnimationFrame(themeSwitchRafRef.current);
        }
        themeSwitchRafRef.current = requestAnimationFrame(() => {
          themeSwitchRafRef.current = requestAnimationFrame(() => {
            root.classList.remove('theme-switching');
            themeSwitchRafRef.current = null;
          });
        });
      }
    } catch {}
  }, [theme]);

  useEffect(() => {
    return () => {
      if (themeSwitchRafRef.current) {
        cancelAnimationFrame(themeSwitchRafRef.current);
        themeSwitchRafRef.current = null;
      }
      if (activeThemeTransitionRef.current) {
        try {
          activeThemeTransitionRef.current.skipTransition();
        } catch {
          // Ignore stale transition cleanup
        }
        activeThemeTransitionRef.current = null;
      }
      document.documentElement.classList.remove('theme-vt', 'theme-switching');
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cs_theme', theme);
      document.cookie = `cs_theme=${theme}; max-age=31536000; path=/; SameSite=Lax`;
    } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'oled' : 'light';
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!root || prefersReduced || typeof document.startViewTransition !== 'function') {
      setTheme(nextTheme);
      return;
    }

    if (activeThemeTransitionRef.current) {
      try {
        activeThemeTransitionRef.current.skipTransition();
      } catch {
        // Ignore stale transition state
      }
      activeThemeTransitionRef.current = null;
    }

    root.classList.add('theme-vt', 'theme-switching');
    try {
      const vt = document.startViewTransition(() => {
        flushSync(() => {
          setTheme(nextTheme);
        });
        root.setAttribute('data-theme', nextTheme);
        const metaTheme = document.getElementById('meta-theme-color');
        const metaColor = nextTheme === 'oled' ? '#000000' : (nextTheme === 'dark' ? '#121417' : '#6F1D2B');
        if (metaTheme) metaTheme.setAttribute('content', metaColor);
      });
      activeThemeTransitionRef.current = vt;
      vt.finished.finally(() => {
        if (activeThemeTransitionRef.current === vt) {
          activeThemeTransitionRef.current = null;
          root.classList.remove('theme-vt', 'theme-switching');
        }
      });
    } catch {
      activeThemeTransitionRef.current = null;
      root.classList.remove('theme-vt', 'theme-switching');
      setTheme(nextTheme);
    }
  }, [theme]);

  // Filters initialized directly from URL route
  const [filterCurriculum, setFilterCurriculum] = useState(initialRoute.filterCurriculum || ''); // '' | 'Edexcel IAL' | 'Edexcel IGCSE'
  const [filterDocType, setFilterDocType] = useState(initialRoute.filterDocType || null); // 'QP' | 'MS' | 'ER' | 'Book' | 'Extra' | null
  const [filterSubject, setFilterSubject] = useState(initialRoute.filterSubject || '');
  const [filterUnit, setFilterUnit] = useState(initialRoute.filterUnit || '');
  const [filterYear, setFilterYear] = useState(initialRoute.filterYear || '');
  const [filterSession, setFilterSession] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // Default to newest first so recent 2026/2025 papers appear at top
  const [forceShowTable, setForceShowTable] = useState(Boolean(initialRoute.forceShowTable));
  const [showFilters, setShowFilters] = useState(false);

  const searchInputRef = useRef(null);
  const isPopStateRef = useRef(false);
  const isFullIndexLoadedRef = useRef(false);
  const isHydratedRef = useRef(false);
  const hydratedShardPathRef = useRef(null);
  const latestLoadedGenAtRef = useRef('');
  const fullIndexPromiseRef = useRef(null);
  const ensureFullIndexRef = useRef(null);
  const viewsInflightRef = useRef(null);

  const refreshViewsFromApi = useCallback(() => {
    if (viewsInflightRef.current) {
      return viewsInflightRef.current;
    }
    const req = fetch('/api/views', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload || !payload.ok) return null;
        const mapObj = payload.views && typeof payload.views === 'object' ? payload.views : payload.counts;
        if (!mapObj || typeof mapObj !== 'object') return null;
        const saved = writeLocalViewsCache(mapObj);
        setViewsMap(saved);
        return saved;
      })
      .catch(() => null)
      .finally(() => {
        viewsInflightRef.current = null;
      });
    viewsInflightRef.current = req;
    return req;
  }, []);

  // Load cached views directly from browser localStorage; only fetch once when empty, otherwise wait until user adds a view
  useEffect(() => {
    try {
      localStorage.removeItem('cs_paper_views_v1');
      localStorage.removeItem('cs_paper_views_db_v2');
    } catch {
      // Ignore storage errors
    }

    if (readLocalViewsCache() === null) {
      void refreshViewsFromApi();
    }
  }, [refreshViewsFromApi]);

  useEffect(() => {
    return initTelemetryTracker({ getViewerId: getOrCreateViewerId });
  }, []);

  const recordPaperInteraction = useCallback((fileObj, preferredView = '', options = {}) => {
    if (!fileObj || fileObj.isPendingSkeleton) return;
    const vKey = getPaperViewKey(fileObj);
    if (vKey) {
      try {
        sessionStorage.setItem(ACTIVE_MODAL_PAPER_SESSION_KEY, vKey);
      } catch {
        // Ignore sessionStorage errors
      }
    }

    if (vKey && isQuestionPaperEligibleForViews(fileObj)) {
      const allowedToCount = canCountPaperViewNow(vKey, options);
      if (allowedToCount) {
        const viewerId = getOrCreateViewerId();
        fetch('/api/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paperKey: vKey, viewerId }),
          keepalive: true
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((payload) => {
            if (payload && payload.ok && typeof payload.views === 'number') {
              const latestCount = Math.floor(payload.views);
              setViewsMap((prev) => ({
                ...prev,
                [vKey]: Math.max(Number(prev[vKey]) || 0, latestCount)
              }));
              updateSinglePaperInLocalViewsCache(vKey, latestCount);
              if (payload.incremented) {
                void refreshViewsFromApi();
              }
            }
          })
          .catch(() => {
            // Do not fake increment if database request fails
          });
      }
    }

    const isBook =
      fileObj.category === 'Books' ||
      fileObj.category === 'IAL Books' ||
      fileObj.category === 'IGCSE Books';
    if (!isBook) {
      const snapshot = serializePaperForHistory(fileObj, preferredView);
      if (snapshot && snapshot.id) {
        setRecentHistory(prev => {
          const filtered = prev.filter(item => item.id !== snapshot.id && item.path !== snapshot.path);
          const next = [snapshot, ...filtered].slice(0, MAX_HISTORY_ITEMS);
          try {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Ignore storage quota errors
          }
          return next;
        });
      }
    }
  }, [refreshViewsFromApi]);

  const handleClearHistory = useCallback(() => {
    setRecentHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const openOnSiteReader = useCallback((fileObj, preferredView = '') => {
    if (!fileObj) return;
    setPendingPaperParam('');
    setPreviewInitialView(preferredView);
    setPreviewFile(fileObj);
    recordPaperInteraction(fileObj, preferredView);
  }, [recordPaperInteraction]);

  // Handle browser Back/Forward navigation across all routes and modals
  useEffect(() => {
    const handlePopState = () => {
      isPopStateRef.current = true;
      const parsed = parseRouteFromLocation(window.location.pathname, window.location.search, data.meta);
      setCurrentTab(parsed.currentTab || 'library');
      setIsNotFound(Boolean(parsed.notFound));
      setFilterCurriculum(parsed.filterCurriculum || '');
      setFilterSubject(parsed.filterSubject || '');
      setFilterUnit(parsed.filterUnit || '');
      setFilterYear(parsed.filterYear || '');
      setFilterSession('');
      setFilterDocType(parsed.filterDocType || null);
      setSearchQuery(parsed.searchQuery || '');
      setForceShowTable(Boolean(parsed.forceShowTable));
      setPreviewInitialView(parsed.viewParam || '');
      if (parsed.paperParam) {
        const found =
          data.unifiedFiles.find(f => f.id === parsed.paperParam || f.path === parsed.paperParam) ||
          data.flatFiles.find(f => f.path === parsed.paperParam);
        if (found) {
          setPreviewFile(found);
          setPendingPaperParam('');
        } else {
          setPendingPaperParam(parsed.paperParam);
          setPreviewFile(buildPendingPaperPlaceholder(parsed.paperParam, parsed.viewParam));
        }
      } else {
        setPreviewFile(null);
        setPendingPaperParam('');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [data.meta, data.unifiedFiles, data.flatFiles]);

  // Re-resolve unit slug and route validity once wizard metadata finishes hydrating on cold visits
  const initialUnitHydratedRef = useRef(false);
  useEffect(() => {
    if (initialUnitHydratedRef.current) return;
    if (!data.meta?.wizard) return;
    initialUnitHydratedRef.current = true;
    const segments = (window.location.pathname || '/').split('/').filter(Boolean);
    if (segments.length >= 1) {
      const parsed = parseRouteFromLocation(window.location.pathname, window.location.search, data.meta);
      setIsNotFound(Boolean(parsed.notFound));
      if (parsed.filterUnit) {
        setFilterCurriculum(parsed.filterCurriculum);
        setFilterSubject(parsed.filterSubject);
        setFilterUnit(parsed.filterUnit);
        setForceShowTable(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.meta]);

  // Scroll to top when switching top-level views (Library / About / Changelog)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [currentTab]);

  // Resolve ?paper= deep link once catalog finishes loading (skip view increment on browser refresh)
  useEffect(() => {
    if (!pendingPaperParam) return;
    if (data.unifiedFiles.length === 0 && data.flatFiles.length === 0) return;
    const found =
      data.unifiedFiles.find(f => f.id === pendingPaperParam || f.path === pendingPaperParam) ||
      data.flatFiles.find(f => f.path === pendingPaperParam);
    if (found) {
      setPreviewFile(found);
      const resolvedKey = getPaperViewKey(found);
      let alreadyOpenInSession = false;
      try {
        alreadyOpenInSession = sessionStorage.getItem(ACTIVE_MODAL_PAPER_SESSION_KEY) === resolvedKey;
      } catch {
        alreadyOpenInSession = false;
      }
      const isPageReload = isBrowserReloadNavigation() || alreadyOpenInSession;
      recordPaperInteraction(found, previewInitialView || 'QP', { isPageReload });
    }
    setPendingPaperParam('');
  }, [pendingPaperParam, data.unifiedFiles, data.flatFiles, previewInitialView, recordPaperInteraction]);

  // Synchronize current route state to browser URL and dynamic SEO <head> + Schema.org JSON-LD
  const seoMeta = useMemo(() => getSeoMetadata({
    currentTab,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterDocType,
    searchQuery: deferredSearchQuery,
    paperParam: previewFile ? (previewFile.id || previewFile.path) : pendingPaperParam,
    forceShowTable,
    notFound: currentTab === 'library' && isNotFound,
    meta: data.meta
  }), [
    currentTab,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterDocType,
    deferredSearchQuery,
    previewFile,
    pendingPaperParam,
    forceShowTable,
    isNotFound,
    data.meta
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Wait for wizard metadata before overwriting a 3-segment unit URL on a cold cache visit
    const pathSegments = (window.location.pathname || '/').split('/').filter(Boolean);
    const waitingForUnitHydration = pathSegments.length >= 3 && pathSegments[0] !== 'textbooks' && !filterUnit && !data.meta?.wizard;
    const activeNotFound = currentTab === 'library' && isNotFound;

    if (!waitingForUnitHydration && !activeNotFound) {
      const nextUrl = buildRoutePath({
        currentTab,
        filterCurriculum,
        filterSubject,
        filterUnit,
        filterYear,
        filterDocType,
        searchQuery: deferredSearchQuery,
        previewFile,
        pendingPaperParam,
        previewMode: previewInitialView,
        forceShowTable
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

    // Update document title, meta description, canonical URL, robots, OpenGraph, and JSON-LD schema
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
    setMetaTag('meta[name="robots"]', 'name', 'robots', seoMeta.robots || 'index, follow');
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
      filterDocType,
      forceShowTable,
      seo: seoMeta,
      meta: data.meta
    });
    ldScript.textContent = JSON.stringify(jsonLdObj);
  }, [
    currentTab,
    isNotFound,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterDocType,
    deferredSearchQuery,
    previewFile,
    pendingPaperParam,
    previewInitialView,
    forceShowTable,
    seoMeta,
    data.meta
  ]);

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
      previewMode: preferredView,
      forceShowTable
    });
  }, [filterCurriculum, filterSubject, filterUnit, filterYear, filterDocType, deferredSearchQuery, forceShowTable]);

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
    let cancelled = false;
    const buildQuery = encodeURIComponent(BUILD_TIMESTAMP);
    const initialShardRoute = getShardPathForRoute(initialRoute);

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

    let latestMeta = initialCache?.meta || null;
    let shardFailed = false;

    const candidateIndexUrls = [
      '/index.json',
      `/index.json?v=${buildQuery}`,
      'https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/resolve/main/live_index.json'
    ];

    const INDEX_CACHE_URL = `https://cs-cache.local/index_${APP_VERSION}.json`;

    const getCachedIndex = async () => {
      if (typeof caches === 'undefined') return null;
      try {
        const cache = await caches.open('cs_index_cache');
        const match = await cache.match(INDEX_CACHE_URL);
        if (match) return await match.json();
      } catch {
        // Ignore cache errors
      }
      return null;
    };

    const saveCachedIndex = async (response) => {
      if (typeof caches === 'undefined' || !response) return;
      try {
        const cache = await caches.open('cs_index_cache');
        const keys = await cache.keys();
        for (const req of keys) {
          if (req.url !== INDEX_CACHE_URL) {
            await cache.delete(req);
          }
        }
        await cache.put(INDEX_CACHE_URL, response);
      } catch {
        // Ignore cache errors
      }
    };

    const applyHydratedIndex = (json, { isFull = true } = {}) => {
      setTimeout(() => {
        if (cancelled || (!isFull && isFullIndexLoadedRef.current)) return;
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
                (dt === 'QP'
                  ? 'question paper '
                  : dt === 'MS'
                  ? 'mark scheme markscheme '
                  : dt === 'ER'
                  ? 'examiner report '
                  : dt === 'SOL'
                  ? 'solution bank worked solutions '
                  : dt === 'DF'
                  ? 'data file datafiles practical zip '
                  : dt === 'AUD'
                  ? 'listening audio mp3 '
                  : dt === 'Book'
                  ? 'textbook student book '
                  : '') +
                fileObj.curriculum + ' ' +
                (fileObj.category || '')
              ).toLowerCase();

              flatFiles[i] = fileObj;
            }

        // Link QP/MS/ER/extras siblings across each canonical exam sitting (deduplicating only legacy un-deduped indexes)
        const scoreFile = (f) => {
          let s = 0;
          if (f.path.includes('(')) s += 10;
          if (f.name.includes('_')) s += 5;
          return s;
        };

        const hasPreDeduped = Boolean(
          json.meta?.isShard ||
          (json.meta?.uniqueFiles &&
          Array.isArray(flatFiles) &&
          flatFiles.length === json.meta.uniqueFiles)
        );
        const SIBLING_TYPES = new Set(['QP', 'MS', 'ER', 'SC', 'AUD', 'DF', 'SOL', 'SAM']);
        const preferSiblingCandidate = (existing, candidate) => {
          if (!existing) return true;
          const exPdf = existing.ext === 'pdf' ? 1 : 0;
          const caPdf = candidate.ext === 'pdf' ? 1 : 0;
          if (caPdf !== exPdf) return caPdf > exPdf;
          return scoreFile(candidate) > scoreFile(existing);
        };

        const dedupMap = hasPreDeduped ? null : new Map();
        const siblingGroups = new Map();
        const combinedU2U4Zips = [];

        for (let i = 0; i < flatFiles.length; i++) {
          const f = flatFiles[i];
          const isCanonicalPaper = f.category === 'Past Papers' && f.unitCode && f.session && f.docType;

          if (
            f.category === 'Past Papers' &&
            f.docType === 'AUD' &&
            !f.unitCode &&
            f.session &&
            f.subject &&
            /u2u4/i.test(f.name || '')
          ) {
            combinedU2U4Zips.push(f);
          }

          if (dedupMap) {
            const dedupKey = isCanonicalPaper
              ? `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}|${f.docType}|${f.ext}|${f.size}`
              : f.path;
            const prev = dedupMap.get(dedupKey);
            if (!prev || scoreFile(f) > scoreFile(prev)) {
              dedupMap.set(dedupKey, f);
            }
          }

          if (isCanonicalPaper && SIBLING_TYPES.has(f.docType)) {
            const sibKey = `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}`;
            let grp = siblingGroups.get(sibKey);
            if (!grp) {
              grp = {};
              siblingGroups.set(sibKey, grp);
            }
            if (preferSiblingCandidate(grp[f.docType], f)) {
              grp[f.docType] = f;
            }
            if (f.docType === 'AUD') {
              if (f.ext === 'zip') grp.AUD_ZIP = f;
              else grp.AUD_SINGLE = f;
            }
          }
        }

        // Link combined Audio U2U4.zip packages as fallback AUD/AUD_ZIP for matching U2 and U4 sittings
        const UNIT_PREFIX_BY_SUBJECT = { French: 'WFR', German: 'WGN', Spanish: 'WSP' };
        for (let i = 0; i < combinedU2U4Zips.length; i++) {
          const z = combinedU2U4Zips[i];
          const prefix = UNIT_PREFIX_BY_SUBJECT[z.subject];
          if (!prefix) continue;
          ['02', '04'].forEach((num) => {
            const sibKey = `${z.spec}|${z.subject}|${prefix}${num}||${z.session}`;
            const grp = siblingGroups.get(sibKey);
            if (grp) {
              if (!grp.AUD) grp.AUD = z;
              if (!grp.AUD_ZIP) grp.AUD_ZIP = z;
            }
          });
        }

        // Attach sibling map to each file
        for (let i = 0; i < flatFiles.length; i++) {
          const f = flatFiles[i];
          if (f.category === 'Past Papers' && f.unitCode && f.session) {
            const sibKey = `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}`;
            f.siblings = siblingGroups.get(sibKey) || null;
          }
        }

        const dedupedFiles = dedupMap ? Array.from(dedupMap.values()) : flatFiles;

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
              paths: Array.isArray(f.altPaths) && f.altPaths.length > 0 ? [f.path, ...f.altPaths] : [f.path],
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
          if (f.docType === 'AUD') {
            if (f.ext === 'zip') group.docs.AUD_ZIP = f;
            else group.docs.AUD_SINGLE = f;
          }
          group.paths.push(f.path);
          if (Array.isArray(f.altPaths) && f.altPaths.length > 0) {
            group.paths.push(...f.altPaths);
          }
          group.searchChunks.push(f.searchTerms);
          group.totalSize += (f.size || 0);
        }

        // Propagate fallback combined U2U4 audio into unified sittings that only had U2U4.zip
        for (let i = 0; i < combinedU2U4Zips.length; i++) {
          const z = combinedU2U4Zips[i];
          const prefix = UNIT_PREFIX_BY_SUBJECT[z.subject];
          if (!prefix) continue;
          ['02', '04'].forEach((num) => {
            const sittingKey = `${z.spec}|${z.subject}|${prefix}${num}||${z.session}`;
            const group = sittingMap.get(sittingKey);
            if (group) {
              if (!group.docs.AUD) group.docs.AUD = z;
              if (!group.docs.AUD_ZIP) group.docs.AUD_ZIP = z;
            }
          });
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

            if (cancelled || (!isFull && isFullIndexLoadedRef.current)) return;
            isHydratedRef.current = true;
            if (isFull) isFullIndexLoadedRef.current = true;
            setData(prev => ({
              flatFiles,
              dedupedFiles,
              unifiedFiles,
              meta: json.meta?.isShard
                ? (prev.meta && prev.meta.wizard ? prev.meta : (latestMeta || prev.meta || {}))
                : (json.meta || prev.meta || {})
            }));
            setLoading(false);
            setFilesLoading(false);
            setLoadError(null);
          }, 0);
    };

    const loadFullIndex = async (freshMeta = latestMeta, { showLoader = false } = {}) => {
      if (cancelled) return;
      if (
        isFullIndexLoadedRef.current &&
        (!freshMeta || latestLoadedGenAtRef.current === freshMeta.generatedAt)
      ) {
        return;
      }
      if (fullIndexPromiseRef.current) return fullIndexPromiseRef.current;

      const task = (async () => {
        if (showLoader || !isHydratedRef.current) setFilesLoading(true);
        setLoadError(null);

        try {
          const cached = await getCachedIndex();
          const isCacheValid = cached && (
            !freshMeta ||
            (cached.meta?.generatedAt === freshMeta.generatedAt && cached.meta?.uniqueFiles === freshMeta.uniqueFiles)
          );
          if (isCacheValid && !cancelled) {
            isFullIndexLoadedRef.current = true;
            latestLoadedGenAtRef.current = cached.meta?.generatedAt || '';
            hydratedShardPathRef.current = null;
            applyHydratedIndex(cached, { isFull: true });
            return;
          }
        } catch {
          // Fallback to network
        }

        try {
          const res = await resilientFetch(candidateIndexUrls, {}, 50000);
          const resClone = res.clone();
          const json = await res.json();
          saveCachedIndex(resClone);
          if (!cancelled) {
            isFullIndexLoadedRef.current = true;
            latestLoadedGenAtRef.current = json.meta?.generatedAt || '';
            hydratedShardPathRef.current = null;
            applyHydratedIndex(json, { isFull: true });
          }
        } catch (err) {
          if (!cancelled) {
            console.error('Failed to load index from all candidate sources:', err);
            setLoading(false);
            setFilesLoading(false);
            setLoadError(err?.message || 'Connection delayed');
          }
        } finally {
          fullIndexPromiseRef.current = null;
        }
      })();

      fullIndexPromiseRef.current = task;
      return task;
    };

    ensureFullIndexRef.current = (opts) => loadFullIndex(latestMeta, opts);

    const hydrateInitialShard = async () => {
      if (!initialShardRoute) return;
      try {
        const cached = await getCachedIndex();
        const isCacheValid = cached && (
          !latestMeta ||
          (cached.meta?.generatedAt === latestMeta.generatedAt && cached.meta?.uniqueFiles === latestMeta.uniqueFiles)
        );
        if (isCacheValid && !cancelled) {
          isFullIndexLoadedRef.current = true;
          latestLoadedGenAtRef.current = cached.meta?.generatedAt || '';
          hydratedShardPathRef.current = null;
          applyHydratedIndex(cached, { isFull: true });
          return;
        }

        const res = await fetch(initialShardRoute);
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          throw new Error(`Shard unavailable (${res.status})`);
        }
        const shardJson = await res.json();
        if (!Array.isArray(shardJson?.files)) {
          throw new Error('Malformed shard payload');
        }
        if (!cancelled && !isFullIndexLoadedRef.current) {
          hydratedShardPathRef.current = initialShardRoute;
          applyHydratedIndex(shardJson, { isFull: false });
        }
      } catch {
        shardFailed = true;
        if (!cancelled) {
          loadFullIndex(latestMeta);
        }
      }
    };

    if (initialShardRoute) {
      hydrateInitialShard();
    }

    // Always validate against /meta.json in parallel with shard hydration
    resilientFetch(['/meta.json', `/meta.json?v=${buildQuery}`], {}, 25000)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        latestMeta = json.meta || null;
        if (json.meta) {
          setData(prev => ({
            ...prev,
            meta: json.meta || prev.meta
          }));
          setLoading(false);
        }
        try {
          localStorage.setItem(META_CACHE_KEY, JSON.stringify({
            meta: json.meta
          }));
        } catch {
          // Ignore quota errors
        }
        const staleFullCache = isFullIndexLoadedRef.current && latestLoadedGenAtRef.current !== (json.meta?.generatedAt || '');
        const hasInitialDemand = Boolean(
          (initialRoute.currentTab && initialRoute.currentTab !== 'library') ||
          initialRoute.notFound ||
          initialRoute.filterCurriculum ||
          initialRoute.filterDocType ||
          initialRoute.filterSubject ||
          initialRoute.filterUnit ||
          initialRoute.filterYear ||
          initialRoute.filterSession ||
          initialRoute.searchQuery ||
          initialRoute.forceShowTable ||
          initialRoute.paperParam
        );
        if ((!initialShardRoute || shardFailed || staleFullCache) && (hasInitialDemand || staleFullCache)) {
          if (staleFullCache) isFullIndexLoadedRef.current = false;
          setTimeout(() => loadFullIndex(json.meta || null), 0);
        }
      })
      .catch(err => {
        console.warn('Meta fetch error, proceeding to cached or remote full index:', err);
        if (initialShardRoute && shardFailed) {
          loadFullIndex(null);
        }
      });

    return () => {
      cancelled = true;
      fullIndexPromiseRef.current = null;
    };
  }, [initialCache, initialRoute, retryCount]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedPath, filterCurriculum, filterDocType, filterSubject, filterUnit, filterYear, filterSession, deferredSearchQuery, sortBy, viewMode]);

  const handleSubjectSelect = useCallback((subject, curriculum = '') => {
    setCurrentTab('library');
    setIsNotFound(false);
    if (curriculum) setFilterCurriculum(curriculum);
    setFilterSubject(subject);
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setSearchQuery('');
    setForceShowTable(true);
    setSelectedPath('');
  }, []);

  const handleSelectFinalFilter = useCallback(({ subject, curriculum, unit, year }) => {
    setCurrentTab('library');
    setIsNotFound(false);
    if (curriculum) setFilterCurriculum(curriculum);
    if (subject) setFilterSubject(subject);
    setFilterUnit(unit || '');
    setFilterYear(year ? String(year) : '');
    setFilterSession('');
    setSearchQuery('');
    setForceShowTable(true);
    setSelectedPath('');
  }, []);

  const clearFilters = useCallback(({ pushUrl = true } = {}) => {
    setIsNotFound(false);
    setFilterCurriculum('');
    setFilterDocType(null);
    setFilterSubject('');
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setSearchQuery('');
    setSortBy('newest');
    setForceShowTable(false);
    setSelectedPath('');
    if (pushUrl && typeof window !== 'undefined' && (window.location.pathname !== '/' || window.location.search !== '')) {
      window.history.pushState(null, '', '/');
    }
  }, []);

  const navigateToHome = useCallback((e) => {
    if (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
        return;
      }
      if (e.preventDefault) {
        e.preventDefault();
      }
    }
    setCurrentTab('library');
    setIsNotFound(false);
    setPreviewFile(null);
    setPendingPaperParam('');
    try {
      sessionStorage.removeItem(ACTIVE_MODAL_PAPER_SESSION_KEY);
    } catch {
      // Ignore sessionStorage errors
    }
    setFilterCurriculum('');
    setFilterDocType(null);
    setFilterSubject('');
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setSearchQuery('');
    setSortBy('newest');
    setForceShowTable(false);
    setSelectedPath('');
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== '/' || window.location.search !== '') {
        window.history.pushState(null, '', '/');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleViewAll = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setForceShowTable(true);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [clearFilters]);

  const handleBrowseTextbooks = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setFilterDocType('Book');
    setForceShowTable(true);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [clearFilters]);

  const handleBrowseAudio = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setFilterDocType('AUD');
    setForceShowTable(true);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [clearFilters]);

  const handleTrySampleAudio = useCallback(() => {
    const SAMPLE_AUDIO_ID = 'IAL|French|WFR02||June 2021';
    const sample =
      data.unifiedFiles.find((f) => f.id === SAMPLE_AUDIO_ID && f.docs?.AUD) ||
      data.unifiedFiles.find((f) => f.docs?.AUD && f.docs?.QP) ||
      data.unifiedFiles.find((f) => f.docs?.AUD);
    if (sample) {
      openOnSiteReader(sample, 'AUD');
      return;
    }
    ensureFullIndexRef.current?.({ showLoader: false });
    setPreviewInitialView('AUD');
    setPendingPaperParam(SAMPLE_AUDIO_ID);
    setPreviewFile(buildPendingPaperPlaceholder(SAMPLE_AUDIO_ID, 'AUD'));
  }, [data.unifiedFiles, openOnSiteReader]);

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
    const isSpecificFolder = Boolean(selectedPath && selectedPath !== '');
    const useUnified = viewMode === 'unified';

    const sourceFiles = useUnified
      ? data.unifiedFiles
      : (isSpecificFolder ? data.flatFiles : data.dedupedFiles);

    const folderPrefix = isSpecificFolder
      ? (selectedPath.endsWith('/') ? selectedPath : `${selectedPath}/`)
      : null;

    const hasFolder = Boolean(folderPrefix);
    const hasCurriculum = Boolean(filterCurriculum);
    const hasSubject = Boolean(filterSubject);
    const hasUnit = Boolean(filterUnit);
    const hasYear = Boolean(filterYear);
    const hasSession = Boolean(filterSession);
    const hasDocType = Boolean(filterDocType);

    let files;
    if (!hasFolder && !hasCurriculum && !hasSubject && !hasUnit && !hasYear && !hasSession && !hasDocType) {
      files = sourceFiles;
    } else {
      const filtered = [];
      const len = sourceFiles.length;
      for (let i = 0; i < len; i++) {
        const f = sourceFiles[i];

        if (hasFolder) {
          if (useUnified) {
            const inFolder = f.path === selectedPath || f.path.startsWith(folderPrefix) ||
              (f.paths && f.paths.some(p => p === selectedPath || p.startsWith(folderPrefix)));
            if (!inFolder) continue;
          } else {
            const inFolder = f.path === selectedPath || f.path.startsWith(folderPrefix) ||
              (f.altPaths && f.altPaths.some(p => p === selectedPath || p.startsWith(folderPrefix)));
            if (!inFolder) continue;
          }
        }

        if (hasCurriculum && f.curriculum !== filterCurriculum) continue;
        if (hasSubject && f.subject !== filterSubject) continue;
        if (hasUnit && f.cleanUnitLabel !== filterUnit) continue;
        if (hasYear && String(f.year) !== String(filterYear)) continue;
        if (hasSession && !String(f.session || '').toLowerCase().startsWith(filterSession.toLowerCase())) continue;

        if (hasDocType) {
          if (filterDocType === 'Book') {
            if (f.category !== 'Books' && f.category !== 'IAL Books' && f.category !== 'IGCSE Books') continue;
          } else if (filterDocType === 'Extra') {
            if (useUnified) {
              const hasExtra = Boolean(
                f.docs?.DF || f.docs?.AUD || f.docs?.SC || f.docs?.SAM || f.docs?.SOL ||
                f.docType === 'DF' || f.docType === 'AUD' || f.docType === 'SC' || f.docType === 'SAM' || f.docType === 'SOL'
              );
              if (!hasExtra) continue;
            } else {
              if (f.docType !== 'DF' && f.docType !== 'AUD' && f.docType !== 'SC' && f.docType !== 'SAM' && f.docType !== 'SOL') continue;
            }
          } else if (useUnified) {
            if (!f.docs?.[filterDocType] && f.docType !== filterDocType) continue;
          } else {
            if (f.docType !== filterDocType) continue;
          }
        }

        filtered.push(f);
      }
      files = filtered;
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
        const aCode = a.unitCode || '';
        const bCode = b.unitCode || '';
        if (aCode !== bCode) return aCode < bCode ? -1 : 1;
        const aVar = a.variant || '';
        const bVar = b.variant || '';
        if (aVar !== bVar) return aVar < bVar ? -1 : 1;
        return (docOrder[a.docType] || 9) - (docOrder[b.docType] || 9);
      });
    } else if (sortBy === 'popular') {
      sorted.sort((a, b) => {
        const vDiff = getPaperTotalViews(b, viewsMap) - getPaperTotalViews(a, viewsMap);
        if (vDiff !== 0) return vDiff;
        const kDiff = (b.sortKey || 0) - (a.sortKey || 0);
        if (kDiff !== 0) return kDiff;
        return (docOrder[a.docType] || 9) - (docOrder[b.docType] || 9);
      });
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => {
        const diff = (a.sortKey || 999999) - (b.sortKey || 999999);
        if (diff !== 0) return diff;
        return (docOrder[a.docType] || 9) - (docOrder[b.docType] || 9);
      });
    } else if (sortBy === 'name_asc') {
      sorted.sort((a, b) => {
        const an = a.name || '';
        const bn = b.name || '';
        return an === bn ? 0 : (an < bn ? -1 : 1);
      });
    } else if (sortBy === 'name_desc') {
      sorted.sort((a, b) => {
        const an = a.name || '';
        const bn = b.name || '';
        return an === bn ? 0 : (an > bn ? -1 : 1);
      });
    } else if (sortBy === 'size_desc') {
      sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
    }

    return sorted;
  }, [
    data.flatFiles,
    data.dedupedFiles,
    data.unifiedFiles,
    selectedPath,
    deferredSearchQuery,
    filterCurriculum,
    filterDocType,
    filterSubject,
    filterUnit,
    filterYear,
    filterSession,
    sortBy,
    viewMode,
    viewsMap
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
    filterSession ||
    searchQuery ||
    forceShowTable
  );
  const isRoot = selectedPath === '';
  const showWelcome = isRoot && !hasActiveFilters;

  const activeDrawerFilterCount = useMemo(() => {
    let count = 0;
    if (filterDocType) count += 1;
    if (filterSubject) count += 1;
    if (filterUnit) count += 1;
    if (filterYear) count += 1;
    if (filterSession) count += 1;
    if (sortBy !== 'newest') count += 1;
    if (viewMode !== 'unified') count += 1;
    return count;
  }, [filterDocType, filterSubject, filterUnit, filterYear, filterSession, sortBy, viewMode]);

  // Upgrade from a route shard to the full catalog index whenever global search, deep links, or cross-route navigation requires it
  useEffect(() => {
    if (isFullIndexLoadedRef.current) return;
    const activeShard = getShardPathForRoute({
      currentTab,
      filterCurriculum,
      filterSubject,
      filterDocType,
      notFound: currentTab === 'library' && isNotFound
    });
    const switchedOutOfShard = Boolean(
      hydratedShardPathRef.current &&
      activeShard !== hydratedShardPathRef.current
    );
    const needsFullNow =
      Boolean(pendingPaperParam) ||
      Boolean(deferredSearchQuery && deferredSearchQuery.trim()) ||
      Boolean(selectedPath) ||
      switchedOutOfShard ||
      (!showWelcome && !activeShard);
    if (needsFullNow) {
      ensureFullIndexRef.current?.({ showLoader: switchedOutOfShard && !showWelcome });
      return undefined;
    }
    if (showWelcome) {
      const idleTimer = setTimeout(() => {
        ensureFullIndexRef.current?.({ showLoader: false });
      }, 1200);
      return () => clearTimeout(idleTimer);
    }
    return undefined;
  }, [
    currentTab,
    filterCurriculum,
    filterSubject,
    filterDocType,
    isNotFound,
    showWelcome,
    pendingPaperParam,
    deferredSearchQuery,
    selectedPath
  ]);

  const archiveContextInfo = useMemo(() => {
    if (currentTab !== 'library' || isNotFound || showWelcome) return null;
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
    if (filterSubject && currSlug && subjSlug) {
      if (filterUnit) {
        links.push({
          href: `/${currSlug}/${subjSlug}`,
          label: `All ${subjDisplay} Units & Papers`,
          onClick: () => { setIsNotFound(false); setFilterUnit(''); setForceShowTable(true); }
        });
      }
      const hasBooks = Boolean(SUBJECTS_WITH_BOOKS[effCurr]?.has(filterSubject));
      if (hasBooks && filterDocType !== 'Book') {
        const isMath = effCurr === 'Edexcel IAL' && filterSubject === 'Math';
        links.push({
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
        links.push({
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
        links.push({
          href: '/data-files',
          label: 'IT & CS Data Files (.zip)',
          onClick: () => {
            clearFilters({ pushUrl: false });
            setFilterDocType('DF');
            setForceShowTable(true);
          }
        });
      }
      if (effCurr === 'Edexcel IAL' && IAL_AUDIO_SUBJECTS.has(filterSubject) && filterDocType !== 'AUD') {
        links.push({
          href: '/audio',
          label: 'IAL Listening Audio (MP3)',
          onClick: () => {
            clearFilters({ pushUrl: false });
            setFilterDocType('AUD');
            setForceShowTable(true);
          }
        });
      }
    } else if (filterDocType === 'Book') {
      if (filterCurriculum !== 'Edexcel IAL') {
        links.push({
          href: '/textbooks/ial',
          label: 'Edexcel IAL Textbooks & Solution Banks',
          onClick: () => { setIsNotFound(false); setFilterCurriculum('Edexcel IAL'); setFilterDocType('Book'); setForceShowTable(true); }
        });
      }
      if (filterCurriculum !== 'Edexcel IGCSE') {
        links.push({
          href: '/textbooks/igcse',
          label: 'Edexcel IGCSE (9-1) Textbooks',
          onClick: () => { setIsNotFound(false); setFilterCurriculum('Edexcel IGCSE'); setFilterDocType('Book'); setForceShowTable(true); }
        });
      }
    } else if (filterDocType === 'DF') {
      links.push(
        {
          href: '/ial/information-technology',
          label: 'IAL Information Technology',
          onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('Information Technology'); setForceShowTable(true); }
        },
        {
          href: '/igcse/computer-science',
          label: 'IGCSE Computer Science',
          onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IGCSE'); setFilterSubject('Computer Science'); setForceShowTable(true); }
        },
        {
          href: '/igcse/information-technology',
          label: 'IGCSE Information Technology',
          onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IGCSE'); setFilterSubject('Information Technology'); setForceShowTable(true); }
        }
      );
    } else if (filterDocType === 'AUD') {
      links.push(
        {
          href: '/ial/french',
          label: 'IAL French Papers',
          onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('French'); setForceShowTable(true); }
        },
        {
          href: '/ial/german',
          label: 'IAL German Papers',
          onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('German'); setForceShowTable(true); }
        },
        {
          href: '/ial/spanish',
          label: 'IAL Spanish Papers',
          onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('Spanish'); setForceShowTable(true); }
        }
      );
    } else if (filterCurriculum) {
      links.push(
        {
          href: filterCurriculum === 'Edexcel IAL' ? '/textbooks/ial' : '/textbooks/igcse',
          label: `${filterCurriculum} Textbooks`,
          onClick: () => { setIsNotFound(false); setFilterDocType('Book'); setForceShowTable(true); }
        },
        {
          href: '/data-files',
          label: 'IT & CS Data Files',
          onClick: () => { clearFilters({ pushUrl: false }); setFilterDocType('DF'); setForceShowTable(true); }
        }
      );
      if (filterCurriculum === 'Edexcel IAL') {
        links.push({
          href: '/audio',
          label: 'Listening Audio Archive',
          onClick: () => { clearFilters({ pushUrl: false }); setFilterDocType('AUD'); setForceShowTable(true); }
        });
      }
    }

    let note = 'Every sitting pairs Question Papers (QP), Mark Schemes (MS), and Examiner Reports (ER) for instant on-site Split View inspection.';
    if (filterDocType === 'Book') {
      note = `Archived Edexcel student books${filterCurriculum === 'Edexcel IAL' || filterSubject === 'Math' ? ' and worked Solution Banks' : ''} with range-streamed WebPDF viewing.`;
    } else if (filterDocType === 'DF') {
      note = 'Practical examination source archives (.zip) for IT and Computer Science coding, spreadsheet, database, and web tasks.';
    } else if (filterDocType === 'AUD') {
      note = 'Edexcel IAL Modern Languages listening examination audio tracks (MP3) with in-app playback alongside question papers.';
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
              ? 'Modern Languages Listening Tracks (.mp3)'
              : `${filterCurriculum || 'Edexcel Archive'} Resource Guide`;

    return { heading, legacyInfo, note, links };
  }, [currentTab, isNotFound, showWelcome, filterCurriculum, filterSubject, filterUnit, filterDocType, clearFilters]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#1A1D20', fontFamily: 'Roboto, sans-serif' }}>
        Loading Repository Index...
      </div>
    );
  }

  if (!data.meta) {
    return <CrashRecoveryScreen errorMsg="Repository metadata missing or stale cache encountered." />;
  }

  const breadcrumbParts = selectedPath ? selectedPath.split(/[\\/]/).filter(Boolean) : [];

  const renderBreadcrumbs = (classNameAdd = '') => (
    <div className={`breadcrumb-container ${classNameAdd}`}>
      <div className="breadcrumb-trail">
        <a href="/" className="breadcrumb-link home" onClick={navigateToHome}>
          <span className="btn-desktop-text">← Library Home</span>
          <span className="btn-mobile-text" aria-hidden="true">← Home</span>
        </a>
        {filterCurriculum && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterCurriculum('')} title="Click to remove curriculum filter">
              {filterCurriculum} ×
            </button>
          </>
        )}
        {filterSubject && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => { setFilterSubject(''); setFilterUnit(''); }} title="Click to remove subject filter">
              {formatSubjectDisplay(filterSubject)} ×
            </button>
          </>
        )}
        {filterUnit && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterUnit('')} title="Click to remove unit filter">
              {filterUnit} ×
            </button>
          </>
        )}
        {filterYear && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterYear('')} title="Click to remove year filter">
              {filterYear} ×
            </button>
          </>
        )}
        {filterSession && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterSession('')} title="Click to remove session filter">
              {filterSession} ×
            </button>
          </>
        )}
        {filterDocType && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterDocType(null)} title="Click to remove document type filter">
              {DOC_TYPE_INFO[filterDocType]?.fullLabel || filterDocType} ×
            </button>
          </>
        )}
        {breadcrumbParts.map((part, i) => (
          <React.Fragment key={i}>
            <span className="breadcrumb-separator">/</span>
            <button
              type="button"
              className="breadcrumb-link"
              onClick={() => {
                const pathSlice = breadcrumbParts.slice(0, i + 1).join('/');
                setSelectedPath(pathSlice);
                setForceShowTable(true);
              }}
            >
              {part}
            </button>
          </React.Fragment>
        ))}
        {searchQuery && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setSearchQuery('')} title="Clear search query">
              Search: &ldquo;{searchQuery}&rdquo; ×
            </button>
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
            {filterDocType === 'Book'
              ? 'textbooks'
              : (viewMode === 'unified' ? 'exam sittings' : 'documents')}
          </>
        ) : (
          <>
            Displaying <strong>{allMatchedFiles.length.toLocaleString()}</strong> matching{' '}
            {filterDocType === 'Book'
              ? (allMatchedFiles.length === 1 ? 'textbook' : 'textbooks')
              : viewMode === 'unified'
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
        <div className={`header-top-row ${!showWelcome && !isNotFound && currentTab === 'library' ? 'mobile-hidden' : ''}`}>
          <a
            href="/"
            className="brand-section"
            onClick={navigateToHome}
            aria-label="Conceptualist Systems - Library Home"
          >
            <div className="brand-logo-text">
              Conceptualist <span className="brand-logo-accent">Systems</span>
            </div>
            <div className="brand-tagline">
              <span className="title">EDEXCEL LIBRARY</span>
              <span>Past Exam Papers & Resources</span>
            </div>
          </a>

          <div className="header-right-group">
            <button
              type="button"
              className="header-theme-btn"
              onClick={toggleTheme}
              title={
                theme === 'light'
                  ? 'Current: Academic Light - Click for Dark Mode'
                  : theme === 'dark'
                  ? 'Current: Academic Dark - Click for Pure OLED Mode'
                  : 'Current: Pure OLED - Click for Light Mode'
              }
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  <span>Light</span>
                </>
              ) : theme === 'dark' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 3v18A9 9 0 0 0 12 3z" fill="currentColor"/></svg>
                  <span>OLED</span>
                </>
              )}
            </button>
            <a
              href={currentTab !== 'library' ? '/' : '/about'}
              className={`header-nav-btn ${currentTab !== 'library' ? 'active' : ''}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                e.preventDefault();
                setIsNotFound(false);
                setCurrentTab(currentTab !== 'library' ? 'library' : 'about');
              }}
            >
              {currentTab !== 'library' ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="15 18 9 12 15 6"/></svg>
                  <span>Library</span>
                </>
              ) : (
                'About'
              )}
            </a>
          </div>
        </div>

        {/* Integrated Mobile Header Breadcrumb Strip */}
        {isMobile && currentTab === 'library' && !showWelcome && !isNotFound && (
          <div className="mobile-header-breadcrumb">
            {renderBreadcrumbs('mobile-header-breadcrumb-content')}
            <button
              type="button"
              className="mobile-breadcrumb-theme-btn"
              onClick={toggleTheme}
              title={
                theme === 'light'
                  ? 'Current: Light - Tap for Dark'
                  : theme === 'dark'
                  ? 'Current: Dark - Tap for Pure OLED'
                  : 'Current: OLED - Tap for Light'
              }
              aria-label={`Switch color theme (current: ${theme})`}
            >
              {theme === 'light' ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  <span>Light</span>
                </>
              ) : theme === 'dark' ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18A9 9 0 0 0 12 3z" fill="currentColor"/></svg>
                  <span>OLED</span>
                </>
              )}
            </button>
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
                placeholder={isMobile ? "Search unit, code, or year..." : "Search by course code, subject, unit or year (e.g. WMA11, Chemistry, M1 Jan 2025, 4MA1)..."}
                value={searchQuery}
                onFocus={() => ensureFullIndexRef.current?.()}
                onChange={(e) => { setIsNotFound(false); setSearchQuery(e.target.value); }}
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
              <div className="quick-curriculum-pills" role="group" aria-label="Filter by curriculum">
                <button
                  type="button"
                  className={`quick-curr-btn ${filterCurriculum === '' ? 'active' : ''}`}
                  onClick={() => { setIsNotFound(false); setFilterCurriculum(''); }}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`quick-curr-btn ${filterCurriculum === 'Edexcel IAL' ? 'active' : ''}`}
                  onClick={() => {
                    setIsNotFound(false);
                    setFilterCurriculum(filterCurriculum === 'Edexcel IAL' ? '' : 'Edexcel IAL');
                    setForceShowTable(true);
                  }}
                >
                  IAL
                </button>
                <button
                  type="button"
                  className={`quick-curr-btn ${filterCurriculum === 'Edexcel IGCSE' ? 'active' : ''}`}
                  onClick={() => {
                    setIsNotFound(false);
                    setFilterCurriculum(filterCurriculum === 'Edexcel IGCSE' ? '' : 'Edexcel IGCSE');
                    setForceShowTable(true);
                  }}
                >
                  IGCSE
                </button>
              </div>
              <button
                type="button"
                className={`filter-drawer-toggle ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(prev => !prev)}
                aria-expanded={showFilters}
                aria-controls="catalog-filter-drawer"
                aria-label="Toggle Filters"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                <span className="filter-toggle-label">Filters</span>
                {activeDrawerFilterCount > 0 && (
                  <span className="filter-count-badge">{activeDrawerFilterCount}</span>
                )}
              </button>
              {hasActiveFilters && !showFilters && (
                <button
                  type="button"
                  className="search-reset-inline"
                  onClick={clearFilters}
                  title="Clear all active filters and return to Library Home"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Filter Controls Drawer */}
          {showFilters && (
            <div id="catalog-filter-drawer" className="filter-controls-container">
              {/* Row 1: Curriculum (narrow/mobile) & Document Type */}
              <div className="filter-row">
                <div className="drawer-curriculum-group">
                  <span className="filter-group-label">Curriculum:</span>
                  <div className="filter-pills" role="group" aria-label="Filter by curriculum">
                    <button
                      type="button"
                      className={`filter-btn ${filterCurriculum === '' ? 'active' : ''}`}
                      onClick={() => { setIsNotFound(false); setFilterCurriculum(''); }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`filter-btn ${filterCurriculum === 'Edexcel IAL' ? 'active' : ''}`}
                      onClick={() => {
                        setIsNotFound(false);
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
                        setIsNotFound(false);
                        setFilterCurriculum(filterCurriculum === 'Edexcel IGCSE' ? '' : 'Edexcel IGCSE');
                        setForceShowTable(true);
                      }}
                    >
                      Edexcel IGCSE
                    </button>
                  </div>
                </div>

                <span className="filter-group-label">Type:</span>
                <div className="filter-pills" role="group" aria-label="Filter by document type">
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === null ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(null); }}
                  >
                    All Types
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'QP' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'QP' ? null : 'QP'); setForceShowTable(true); }}
                  >
                    Question Papers
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'MS' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'MS' ? null : 'MS'); setForceShowTable(true); }}
                  >
                    Mark Schemes
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'ER' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'ER' ? null : 'ER'); setForceShowTable(true); }}
                  >
                    Examiner Reports
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'Book' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'Book' ? null : 'Book'); setForceShowTable(true); }}
                  >
                    Textbooks
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'Extra' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'Extra' ? null : 'Extra'); setForceShowTable(true); }}
                  >
                    Audio / Data / SAMs
                  </button>
                </div>
              </div>

              {/* Row 2: Subject, Unit, Year & Sort Dropdowns */}
              <div className="filter-row filter-row-selects">
                <label htmlFor="subject-select" className="filter-group-label">Subject:</label>
                <select
                  id="subject-select"
                  aria-label="Filter documents by subject"
                  className="filter-select"
                  value={filterSubject}
                  onChange={(e) => {
                    setIsNotFound(false);
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
                    <label htmlFor="unit-select" className="filter-group-label">Unit:</label>
                    <select
                      id="unit-select"
                      aria-label="Filter documents by unit or paper"
                      className="filter-select"
                      value={filterUnit}
                      onChange={(e) => {
                        setIsNotFound(false);
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

                <label htmlFor="year-select" className="filter-group-label">Year:</label>
                <select
                  id="year-select"
                  aria-label="Filter documents by examination year"
                  className="filter-select"
                  value={filterYear}
                  onChange={(e) => {
                    setIsNotFound(false);
                    setFilterYear(e.target.value);
                    if (e.target.value) setForceShowTable(true);
                  }}
                >
                  <option value="">All Years</option>
                  {availableYearsForFilter.map(y => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>

                {filterDocType !== 'Book' && (
                  <>
                    <label htmlFor="session-select" className="filter-group-label">Session:</label>
                    <select
                      id="session-select"
                      aria-label="Filter documents by examination session"
                      className="filter-select"
                      value={filterSession}
                      onChange={(e) => {
                        setIsNotFound(false);
                        setFilterSession(e.target.value);
                        if (e.target.value) setForceShowTable(true);
                      }}
                    >
                      <option value="">All Sessions</option>
                      <option value="January">January</option>
                      <option value="June">June</option>
                      <option value="October">October</option>
                    </select>
                  </>
                )}

                <label htmlFor="sort-select" className="filter-group-label">Sort:</label>
                <select
                  id="sort-select"
                  aria-label="Sort documents"
                  className="filter-select"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setForceShowTable(true); }}
                >
                  <option value="newest">Newest First</option>
                  <option value="popular">Most Viewed</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name_asc">Name (A–Z)</option>
                  <option value="name_desc">Name (Z–A)</option>
                  <option value="size_desc">File Size (Largest)</option>
                </select>

                <span className="filter-group-label">View:</span>
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
                  onClick={() => setShowFilters(false)}
                >
                  Done &amp; View Results ({allMatchedFiles.length.toLocaleString()})
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Layout */}
      <div className="main-layout">
        {/* Main Content Area */}
        <main className="content-area">
          {currentTab === 'about' ? (
            <AboutPage onGoHome={() => { setIsNotFound(false); setCurrentTab('library'); }} />
          ) : currentTab === 'changelog' ? (
            <ChangelogPage onGoHome={() => { setIsNotFound(false); setCurrentTab('library'); }} />
          ) : isNotFound ? (
            <div className="not-found-card" role="region" aria-label="Page not found">
              <span className="not-found-badge">404 • Route Not Found</span>
              <h1>{seoMeta.h1}</h1>
              <p>{seoMeta.subtitle}</p>
              <div className="not-found-actions">
                <a href="/" className="search-button" onClick={navigateToHome}>
                  Return to Library Home
                </a>
                <a
                  href="/ial"
                  className="filter-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterCurriculum('Edexcel IAL');
                    setForceShowTable(true);
                  }}
                >
                  Edexcel IAL
                </a>
                <a
                  href="/igcse"
                  className="filter-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterCurriculum('Edexcel IGCSE');
                    setForceShowTable(true);
                  }}
                >
                  Edexcel IGCSE
                </a>
                <a
                  href="/textbooks"
                  className="filter-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterDocType('Book');
                    setForceShowTable(true);
                  }}
                >
                  Textbooks
                </a>
                <a
                  href="/data-files"
                  className="filter-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterDocType('DF');
                    setForceShowTable(true);
                  }}
                >
                  Data Files
                </a>
                <a
                  href="/audio"
                  className="filter-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterDocType('AUD');
                    setForceShowTable(true);
                  }}
                >
                  Audio Archive
                </a>
              </div>
            </div>
          ) : showWelcome ? (
            <WelcomePage
              data={data}
              recentHistory={recentHistory}
              onOpenPaper={openOnSiteReader}
              onClearHistory={handleClearHistory}
              getOnSitePaperUrl={getOnSitePaperUrl}
              onSubjectSelect={handleSubjectSelect}
              onViewAll={handleViewAll}
              onBrowseTextbooks={handleBrowseTextbooks}
              onBrowseAudio={handleBrowseAudio}
              onTrySampleAudio={handleTrySampleAudio}
              onSelectFinalFilter={handleSelectFinalFilter}
            />
          ) : (() => {
            const isSearchActive = Boolean(searchQuery && searchQuery.trim());
            return (
            <>
              {/* Unified Context Header: Breadcrumb Trail + Archive Title (suppressed during live search) */}
              {isSearchActive ? (
                <>
                  <h1 className="sr-only">{seoMeta.h1}</h1>
                  {!isMobile && !(filesLoading && visibleFiles.length === 0) && allMatchedFiles.length > 0 && (
                    <div className="search-results-bar">
                      <span className="search-results-count">
                        {allMatchedFiles.length > visibleFiles.length ? (
                          <>Showing <strong>{visibleFiles.length}</strong> of <strong>{allMatchedFiles.length.toLocaleString()}</strong> {viewMode === 'unified' ? 'matching exam sittings' : 'matching documents'}</>
                        ) : (
                          <><strong>{allMatchedFiles.length.toLocaleString()}</strong> {allMatchedFiles.length === 1 ? (viewMode === 'unified' ? 'matching exam sitting' : 'matching document') : (viewMode === 'unified' ? 'matching exam sittings' : 'matching documents')}</>
                        )}
                      </span>
                    </div>
                  )}
                </>
              ) : !isMobile ? (
                <div className="archive-context-header">
                  {renderBreadcrumbs('desktop-breadcrumb')}
                  <div className="archive-title-block">
                    <h1 className="archive-page-h1">{seoMeta.h1}</h1>
                    {seoMeta.subtitle && (
                      <p className="archive-page-subtitle">{seoMeta.subtitle}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="archive-title-header">
                  <h1 className="archive-page-h1">{seoMeta.h1}</h1>
                  {seoMeta.subtitle && (
                    <p className="archive-page-subtitle">{seoMeta.subtitle}</p>
                  )}
                </div>
              )}

              {/* Document List / Data Table */}
              {filesLoading && visibleFiles.length === 0 ? (
                <TableSkeletonLoader rows={8} viewMode={viewMode} />
              ) : visibleFiles.length > 0 ? (
                <div className="file-list">
                  <table className="file-table">
                    <thead>
                      <tr>
                        <th className="col-sitting" style={{ width: viewMode === 'unified' ? '39%' : '50%' }}>
                          {filterDocType === 'Book'
                            ? 'Textbook / Solution Resource'
                            : viewMode === 'unified' ? 'Exam Sitting / Resource' : 'Document'}
                        </th>
                        <th className="col-series" style={{ width: viewMode === 'unified' ? '15%' : '26%' }}>
                          {filterDocType === 'Book' ? 'Course & Category' : viewMode === 'unified' ? 'Series' : 'Course & Session'}
                        </th>
                        <th className="col-actions" style={{ width: viewMode === 'unified' ? '46%' : '24%' }}>
                          {filterDocType === 'Book'
                            ? 'Open Textbook / Resource'
                            : viewMode === 'unified' ? 'Open Paper / Mark Scheme / Report' : 'Type & Quick Links'}
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
                        const canSplit = Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf');
                        const defaultViewMode =
                          filterDocType === 'AUD' && (docs.AUD || activeDoc.docType === 'AUD')
                            ? 'AUD'
                            : canSplit
                            ? 'split'
                            : (docs.QP ? 'QP' : (activeDoc.docType || 'QP'));
                        const eligibleForViews = isQuestionPaperEligibleForViews(file);
                        const paperViews = eligibleForViews
                          ? getPaperTotalViews(file, viewsMap)
                          : 0;

                        return (
                          <tr key={file.id || file.path} className={isUnified ? 'unified-sitting-row' : ''}>
                            <td className="file-title-cell">
                              <div className="file-title-top-flex">
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div className="file-title-row">
                                    <a
                                      href={getOnSitePaperUrl(file, defaultViewMode)}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOnSiteReader(file, defaultViewMode);
                                      }}
                                      className={titleCls}
                                      title={isUnified ? `View ${DOC_TYPE_INFO[activeDoc.docType]?.fullLabel || 'Document'} (${displayTitle}) on-site` : `View ${displayTitle} on-site`}
                                    >
                                      {displayTitle}
                                    </a>
                                  </div>
                                  <div className="file-meta-subrow">
                                    {isUnified ? (
                                      <span className="unified-meta-subline" title={file.folderPath}>
                                        {file.fileCount} {file.fileCount === 1 ? 'file' : 'files'} · {file.docTypes.join(' · ')}
                                        {file.totalSize ? ` · ${formatBytes(file.totalSize)}` : ''}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="file-path-subtext file-location" title={file.path}>
                                          {file.path}
                                        </span>
                                        {file.size ? (
                                          <span className="file-size-tag">
                                            {formatBytes(file.size)} · {(file.ext || 'PDF').toUpperCase()}
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                </div>
                                {eligibleForViews && (
                                  <PaperViewsCounter count={paperViews} variant="table" />
                                )}
                              </div>
                            </td>
                            <td>
                              {!isUnified && (
                                <div className="details-primary">
                                  {formatSubjectDisplay(file.subject)}
                                  {!(file.category === 'Books' || file.category === 'IAL Books' || file.category === 'IGCSE Books') && shortUnit
                                    ? ` — ${shortUnit}`
                                    : ''}
                                </div>
                              )}
                              <div className="details-secondary">
                                <span className={`curr-mini-badge ${file.curriculum === 'Edexcel IGCSE' ? 'igcse' : 'ial'}`}>
                                  {file.curriculum ? file.curriculum.replace('Edexcel ', '') : 'IAL'}
                                </span>
                                {isUnified && file.unitCode && (
                                  <span className="unit-code-chip">{file.unitCode}</span>
                                )}
                                {file.session ? (
                                  <span className="session-pill-tag">{file.session}</span>
                                ) : file.year ? (
                                  <span>Year {file.year}</span>
                                ) : (
                                  <span>Reference Resource</span>
                                )}
                                {Boolean(file.variant === 'R' || file.variant === 'A' || (file.variant && file.variant.includes('R'))) && (
                                  <span className="curr-mini-badge regional" title="Regional examination series">
                                    {file.variant === 'A' ? 'Alt A' : 'Regional'}
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
                                      title={`Open Question Paper — ${docs.QP.name} (${formatBytes(docs.QP.size)})`}
                                    >
                                      <span className="btn-desktop-text">Question Paper</span>
                                      <span className="btn-mobile-text" aria-hidden="true">QP</span>
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
                                      title={`Open Mark Scheme — ${docs.MS.name} (${formatBytes(docs.MS.size)})`}
                                    >
                                      <span className="btn-desktop-text">Mark Scheme</span>
                                      <span className="btn-mobile-text" aria-hidden="true">MS</span>
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
                                      title={`Open Examiner Report — ${docs.ER.name} (${formatBytes(docs.ER.size)})`}
                                    >
                                      <span className="btn-desktop-text">Examiner Report</span>
                                      <span className="btn-mobile-text" aria-hidden="true">ER</span>
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
                                        className={`unified-doc-btn ${extraType === 'AUD' ? 'aud' : 'extra'}`}
                                        title={`Open ${DOC_TYPE_INFO[extraType]?.fullLabel || extraType} on-site — ${extraDoc.name}`}
                                      >
                                        <span className="btn-desktop-text">{labelMap[extraType] || extraType}</span>
                                        <span className="btn-mobile-text" aria-hidden="true">{extraType}</span>
                                      </a>
                                    );
                                  })}
                                  {isPdf && canSplit && (
                                    <a
                                      href={getOnSitePaperUrl(file, 'split')}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOnSiteReader(file, 'split');
                                      }}
                                      className="unified-preview-btn split-btn"
                                      title="Open Question Paper and Mark Scheme side by side in Split View"
                                    >
                                      <span className="btn-desktop-text">Split View</span>
                                      <span className="btn-mobile-text" aria-hidden="true">Split</span>
                                    </a>
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
                                      <span className="btn-desktop-text">
                                        {badge?.cls === 'book'
                                          ? 'Open Textbook'
                                          : badge?.cls === 'sol'
                                            ? 'Worked Solutions'
                                            : `Open ${badge?.fullLabel || 'Resource'}`}
                                      </span>
                                      <span className="btn-mobile-text" aria-hidden="true">{badge?.label || 'DOC'}</span>
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
                                            title={`Open matching ${DOC_TYPE_INFO[sibType]?.fullLabel} (${file.session})`}
                                          >
                                            {sibType} ↗
                                          </a>
                                        );
                                      })}
                                    </>
                                  )}

                                  {(isPdf || activeDoc.docType === 'AUD') && viewMode !== 'unified' && (
                                    <a
                                      href={getOnSitePaperUrl(activeDoc, activeDoc.docType || 'QP')}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openOnSiteReader(activeDoc, activeDoc.docType || 'QP');
                                      }}
                                      className="preview-btn"
                                      title={
                                        activeDoc.docType === 'AUD'
                                          ? 'Play Listening Audio On-Site'
                                          : siblings?.QP?.ext === 'pdf' && siblings?.MS?.ext === 'pdf'
                                          ? 'Open Question Paper and Mark Scheme in PDF Reader'
                                          : 'Quick In-App PDF Preview'
                                      }
                                    >
                                      {activeDoc.docType === 'AUD' ? 'Listen' : 'View'}
                                    </a>
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

              {archiveContextInfo && !(filesLoading && visibleFiles.length === 0) && (
                <section className="archive-context-strip" aria-label="Archive specifications and related resources">
                  <div className="archive-context-copy">
                    <div className="archive-context-eyebrow">Specification &amp; Archive Reference</div>
                    <h2 className="archive-context-heading">{archiveContextInfo.heading}</h2>
                    {archiveContextInfo.legacyInfo && (
                      <p className="archive-context-legacy">{archiveContextInfo.legacyInfo}</p>
                    )}
                    <p className="archive-context-note">{archiveContextInfo.note}</p>
                  </div>
                  {archiveContextInfo.links.length > 0 && (
                    <nav className="archive-context-links" aria-label="Related course resources">
                      {archiveContextInfo.links.map((item) => (
                        <a
                          key={item.href}
                          href={item.href}
                          className="archive-context-link"
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                            e.preventDefault();
                            item.onClick();
                          }}
                        >
                          {item.label} →
                        </a>
                      ))}
                    </nav>
                  )}
                </section>
              )}
            </>
            );
          })()}
        </main>
      </div>

      {/* In-App PDF Preview Modal */}
      {previewFile && (
        <PreviewModal
          key={`${previewFile.isPendingSkeleton ? 'pending-' : ''}${previewFile.id || previewFile.path}`}
          file={previewFile}
          initialView={previewInitialView}
          onViewModeChange={(nextMode) => setPreviewInitialView(nextMode)}
          showViews={isQuestionPaperEligibleForViews(previewFile)}
          viewsCount={isQuestionPaperEligibleForViews(previewFile) ? getPaperTotalViews(previewFile, viewsMap) : 0}
          onClose={() => {
            setPreviewFile(null);
            setPendingPaperParam('');
            try {
              sessionStorage.removeItem(ACTIVE_MODAL_PAPER_SESSION_KEY);
            } catch {
              // Ignore sessionStorage errors
            }
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      {/* Global Footer at the Very Bottom */}
      <footer className="footer-bottom">
        <div className="footer-left-col">
          <div>© 2026 <strong>Conceptualist Systems</strong> — Independent Study Archive</div>
          <div
            className="footer-update-micro"
            onClick={() => { setIsNotFound(false); setCurrentTab('changelog'); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsNotFound(false); setCurrentTab('changelog'); } }}
            title="Click to view full site changelog & version history"
          >
            {CHANGELOG_HISTORY[0].version} · Updated {formatUpdateTimestamp(BUILD_TIMESTAMP)} · Not affiliated with Pearson or Edexcel
          </div>
        </div>
        <div className="footer-links">
          <a
            href="/ial"
            className="footer-link"
            onClick={(e) => {
              e.preventDefault();
              setCurrentTab('library');
              clearFilters({ pushUrl: false });
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
              clearFilters({ pushUrl: false });
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
              clearFilters({ pushUrl: false });
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
            onClick={(e) => { e.preventDefault(); setIsNotFound(false); setCurrentTab('changelog'); }}
          >
            Changelog
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/about"
            className="footer-link"
            onClick={(e) => { e.preventDefault(); setIsNotFound(false); setCurrentTab('about'); }}
          >
            About Us &amp; Team
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
