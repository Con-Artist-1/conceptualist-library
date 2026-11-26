export const CHANGELOG_HISTORY = [
  {
    version: 'v8.4.1',
    date: '2026-11-27T04:30:00+06:00',
    title: 'Second-Pass SEO Polish, Subject-Preserving Cambridge Titles & Hydrated WRS Parity',
    summary: 'Restored subject names on 62 Cambridge unit titles, aligned hydrated React FAQPage and contextual links with static prerendered HTML, deduplicated sitting rows, and collapsed multi-hop legacy query redirects.',
    changes: [
      'Subject-Preserving Cambridge Titles & Concise H1s: Added compact syllabus short forms so all 62 previously code-only Cambridge unit titles keep their subject name within 56 characters, and tightened long unit H1 headings.',
      'Hydrated WRS Parity & Semantic Prerender Cleanup: Rendered visible FAQs and hub links on /papers and /cambridge/papers in ArchiveContextStrip, mirrored <= 3-unit links and textbook hub/unit cross-links in React, moved prerendered sitting/link sections outside <nav>, and deduplicated 2,313 repeated sitting list items across 124 pages.',
      'Single-Pass Legacy Redirects & Copy Hygiene: Generated api/_redirects.js for direct alias resolution inside api/redirect.js, updated llms.txt hub coverage and pluralization, and removed AI copy tells across Welcome, About, and metadata.'
    ]
  },
  {
    version: 'v8.4.0',
    date: '2026-11-26T23:35:00+06:00',
    title: 'SEO Roast Remediation, Edge 308 Query Consolidation & SERP Title Overhaul',
    summary: 'Resolved Google Search Console indexation traps (legacy ?paper=/?year= 308 edge consolidation, visible FAQPage DOM parity, thin noindex canonical cleanup, 13 historical 404 redirects, and >=3 inbound links across all 817 canonical routes) and rewrote all 820 route titles to <= 56 characters.',
    changes: [
      'Edge 308 Query Consolidation & 404 Recovery: Added api/redirect.js + query-guarded Vercel rewrites to 308-redirect legacy ?paper=/?year=/?variant=/?type= URLs to clean canonical paths / #paper= hashes, added X-Robots-Tag: noindex, follow on ?q= searches, and added 13 missing 308 redirects (/igcse/bengali, /ial/physics/wph07, and 8 v8.0.0 Cambridge 0580/2058/4024 paper slugs).',
      'Visible FAQ Parity, Thin-Unit Hygiene & Internal Link Mesh: Rendered data-derived Archive FAQs visibly in WelcomePage and ArchiveContextStrip, scoped FAQPage schema away from repetitive unit child pages, stripped cross-page canonicals and ItemList/dofollow links from thin (<3-file) noindex units, unified archive fallback counts (74,958 unique / 154 books / 591 audio / 212 data files), and linked all orphan/low-inbound hubs (>= 3 inbound links across all 817 indexable routes).',
      'CTR-First SERP Title Rewrite & Attribution Loop: Rewrote all 820 route titles to <= 56 characters while preserving Edexcel/Cambridge board names, subject names, and high-intent modifiers ("Student Book 1 & 2 PDF + Answers", "Past Papers & MS"), and added a 1-click brand citation snippet on /about.'
    ]
  },
  {
    version: 'v8.3.2',
    date: '2026-11-26T22:50:00+06:00',
    title: 'WebPDF Streaming Crash Fix, Flat Pages O(1) Lookup & Determinate Progress Bar',
    summary: 'Eliminated the detached ArrayBuffer crash on cached/streamed PDFs, patched PDF.js flat /Pages-tree O(1) lookup so large textbooks open Page 1 in 1–2 range chunks instead of 50–90 MB bursts, and replaced indeterminate spinners/sliders with a real 0%–100% progress bar.',
    changes: [
      'Transfer-Safe Range & Prewarm Cache: Isolated every cached chunk, Head bootstrap, and prewarmed buffer with fresh slice copies so PDF.js worker postMessage ArrayBuffer transfers never detach session memory or crash on reopens and chunk 0 reads.',
      'O(1) Flat /Pages Lookup & Resilient Streaming: Patched PDF.js worker getPageDict to resolve flat /Pages kids directly in O(1) (slashing 29 large textbooks such as the 91.4 MB Mechanics Coursebook from 179 requests / 90.4 MB down to 2 requests / 1.9 MB on Page 1), added 2-chunk EOF tail prefetching, strict byte-length validation, 12s–15s timeouts with 3-attempt retries, async worker pool teardown guards, <= 25 MB direct-download fallback, and canvas memory clamping.',
      'Real 0%–100% Progress Bar & Error Polish: Replaced indeterminate loading sliders across both streamed and < 5 MB papers (including prewarmed table clicks) with a live monotonic 0%–100% progress bar, subtle toolbar jump-stream indicator, and styled .modal-action-link Retry/Download buttons across Light, Dark, and Pure OLED.'
    ]
  },
  {
    version: 'v8.3.1',
    date: '2026-11-26T21:20:00+06:00',
    title: 'Full-Archive PDF Linearization & High-Speed WebPDF Streaming Overhaul',
    summary: 'Linearized 100% of all books and >= 5 MB past papers across both Edexcel and Cambridge (430 additional PDFs, saving 481.6 MB) and overhauled WebPDF byte-range streaming with parallel Head+EOF bootstrap, pooled PDFWorkers, LIFO jump prioritization, and visible-spread-first scheduling.',
    changes: [
      '100% Archive-Wide Book & Large-PDF Linearization: Linearized and object-stream packed all 430 remaining non-linearized PDFs across IAL Books and >= 5 MB Edexcel/Cambridge Past Papers (shrinking 3,177.7 MB to 2,696.1 MB — 481.6 MB saved with 0 page-count drift), bringing 100% of all 140 textbook PDFs and 100% of all >= 5 MB exam papers/inserts to verified /Linearized + /ObjStm status.',
      'Parallel Head+EOF Range Bootstrap & Persistent Worker Pool: Pre-spawned a reusable 2-slot PDFWorker pool (eliminating the 1.34 MB worker startup delay), cached resolved Hugging Face CDN redirect URLs, and paired 512 KB–1 MB head bootstraps with parallel EOF chunk prefetches and 2-chunk ReadableStream read-ahead.',
      'LIFO Jump Prioritization & Anti-Stampede Virtualization: Replaced the 8-page neighbor prefetch storm with visible-spread-first rendering, 240ms post-paint forward warmup, bounded 96-chunk LRU RAM caching, and a LIFO concurrency-4 range queue tailored to prevent Hugging Face XetHub TTFB queueing on distant page jumps.'
    ]
  },
  {
    version: 'v8.3.0',
    date: '2026-11-26T07:30:00+06:00',
    title: 'Cambridge International Textbook Collection (81 Coursebooks, Workbooks & Lab Books)',
    summary: 'Added 81 verified, qpdf-linearized Cambridge International (CAIE) coursebooks, textbooks, workbooks, laboratory practical books, revision guides, and answer booklets across 32 syllabuses (154 total books across Edexcel & Cambridge), alongside dedicated /textbooks/cambridge and /textbooks/edexcel routes.',
    changes: [
      '81 Verified & Linearized Cambridge Textbooks: Curated, cover-verified, and qpdf-linearized 81 complete Cambridge International books across 32 syllabuses — 38 AS & A Level (Accounting 9706, Biology 9700, Business 9609, Chemistry 9701, Computer Science 9618, Economics 9708, Further Mathematics 9231, Geography 9696, Mathematics 9709, Physics 9702), 38 IGCSE (17 syllabuses), and 5 O Level (4037, 5090, 3247, 2058, 2059) — strictly filtering out publisher sample excerpts and domestic UK GCE/GCSE books.',
      'Cross-Board & Per-Board Textbook Routing: Added canonical /textbooks (all 154 international books), /textbooks/edexcel (73 books), /textbooks/cambridge (81 books), /textbooks/cambridge/{a-level,igcse,o-level}, and 32 per-syllabus Cambridge textbook routes backed by a unified cross-board dist/shards/textbooks.json shard and Schema.org/Book structured data.',
      'Catalog & UI Polish: Hardened generate-index.js book docType classification so textbook titles containing "Syllabus", "Questions", or "Insert" always index cleanly as Book/SOL, enabled the Cambridge FilterDrawer Textbooks pill, and added Cambridge WelcomePage and ArchiveContextStrip textbook navigation.'
    ]
  },
  {
    version: 'v8.2.0',
    date: '2026-11-24T22:30:00+06:00',
    title: 'Compact v2 Catalog Engine, Instant Shard Navigation & Search/SEO Hardening',
    summary: 'Compacted board indexes and route shards by ~62% via interned v2 tuples, eliminated warm-cache and fast-click shard stalls, accelerated smart search by 30x–150x with O(1) syllabus buckets and lazy search structures, and resolved mobile drawer, reader, API, and Cambridge SEO edge cases.',
    changes: [
      'Compact v2 Catalog & Instant Shard Navigation: Replaced repeated string tuples with interned v2 catalog/shard payloads and a private prefix-grouped API allowlist (api/_allowlist.json), cutting catalog/shard payload sizes by ~62%, dropping worker hydration memory by ~65% via lazy _search/vocab construction, and making warm-cache visits and homepage quick-filter clicks render immediately from lightweight route shards.',
      'Smart Search & Regex Upgrades: Added O(1) Cambridge syllabus bucket pre-filtering and length-bucketed fuzzy vocabulary lookup (sub-millisecond syllabus queries), raw filename/underscore/extension normalization, official Pearson YYYYMMDD exam/results-day parsing, legacy Edexcel 4-digit GCE/IGCSE unit codes (6663–6691, 4400, 4357), YLA1/01–02 Law codes, pre-2020 9709 Paper 5/6 disambiguation, and 9231 FM vs Feb/March separation.',
      'Reader, Accessibility, API & SEO Polish: Restored the sticky mobile "Done & View Results" drawer button, styled WebPDF Grade Thresholds (.pdf-doc-badge.gt) and Pure OLED subtitle hover contrast, added ref-counted ZIP abort safety, hardened /api/subtitles and /api/views with MongoDB indexes and static-manifest anti-poisoning guards, and cleaned up Cambridge 9709 unit URLs, <65-char SERP titles, and Breadcrumb/FAQ parity.'
    ]
  },
  {
    version: 'v8.1.0',
    date: '2026-11-24T10:30:00+06:00',
    title: 'Full 107-Syllabus Cambridge Archive Expansion & Multi-Source Sync (78,739 Files)',
    summary: 'Expanded Cambridge International (CAIE) from 20 pilot syllabuses to all 107 international syllabuses spanning 2002–2026 (58,795 Cambridge files) and added 32 newly discovered Edexcel International files across 169 total subjects (78,739 archived files / 74,877 unique records).',
    changes: [
      'Complete 107-Syllabus Cambridge Archive (2002–2026): Ingested and trailer-verified 55,816 additional Cambridge International past papers, mark schemes, examiner reports, grade thresholds, inserts, confidential instructions, data files, and listening tracks across all 31 AS & A Level, 45 IGCSE, and 31 O Level syllabuses (58,795 Cambridge files / 58,794 unique records).',
      'Edexcel International Completeness & 100% Audio Subtitles: Added 32 missing Edexcel IAL and IGCSE files across 19,944 Edexcel files (16,083 unique records) and pre-indexed the newly added IGCSE ESL listening track into Tier 1 static shards (368 unique SHA-256 tracks / 995 manifest keys covering 100% of all 273 Edexcel AUD resources).',
      '176 Instant Route Shards & 780 Sitemap Routes: Pre-rendered 783 canonical HTML pages and generated 176 per-subject JSON shards so every single Edexcel and Cambridge subject page hydrates immediately without waiting for full board indexes.'
    ]
  },
  {
    version: 'v8.0.0',
    date: '2026-11-24T02:00:00+06:00',
    title: 'Multi-Board International Archive & Cambridge International (CAIE) Launch',
    summary: 'Launched a pluggable international-only multi-board architecture adding Cambridge International (AS & A Level, IGCSE, and O Level) alongside Pearson Edexcel with an isolated header board switcher, Grade Thresholds (GT), QP + Insert Split View, and 2,979 verified Cambridge exam files.',
    changes: [
      'Isolated Board Switcher & Partitioned Indexes: Added an institutional Edexcel | Cambridge switcher in the header (persisted in cs_board with dedicated /cambridge/... canonical routes), backed by partitioned per-board indexes (index-edexcel.json, index-cambridge.json, plus allowlist.json) so switching boards stays instant and never bloats Edexcel startup.',
      'Cambridge International (CAIE) Pilot Archive: Ingested and verified 2,979 Cambridge files across 20 subjects spanning all three international qualifications—6 AS & A Level (9709, 9702, 9701, 9700, 9618, 9708), 7 IGCSE (0625, 0620, 0610, 0580, 0500, 0478, 0417), and 7 O Level (4024, 5054, 5070, 5090, 1123, 2058, 2059)—covering Feb/March 2024 – May/June 2026 while keeping all 19,912 Edexcel files (16,051 unique records) untouched.',
      'Board-Isolated Search & Smart Nudges: Built a dedicated Cambridge parser and search layer supporting 4-digit syllabus codes, 2-digit Paper+Variant tokens (e.g. "0625 22" without colliding with year 2022), 9–1 to A*–G equivalences (0972 -> 0625, 0980 -> 0580), Feb/March / May/June / Oct/Nov sessions, Variant pills (v1/v2/v3), and 1-click Cross-Board Smart Nudges when querying a code from the other board.',
      'Grade Thresholds (GT) & QP + Insert Split View: Extended the WebPDF reader and sitting table with first-class Grade Thresholds (GT) tabs/actions and a flexible Split View right-pane toggle letting students view Question Papers side-by-side with either Mark Schemes or Inserts (such as 0500 First Language English and 1123 O Level English).'
    ]
  },
  {
    version: 'v7.3.3',
    date: '2026-11-23T09:15:00+06:00',
    title: 'Elevare Source Integration & IGCSE History / CS Variant Coverage',
    summary: 'Added Elevare as a 7th verified Edexcel sync source, refined IGCSE History (4HI1) and Computer Science (4CP0) variant parsing, and filled 30 missing exam papers across 19,912 archived files.',
    changes: [
      'Elevare multi-source sync (scripts/sync-sources.js): Added elevareisonline.com/papers as a verified Edexcel-only source covering all 34 IAL/IGCSE Drive roots plus curated catalog fallbacks (strictly excluding Cambridge) with safe object-literal parsing and improved short-name/regional ER deduplication.',
      'IGCSE History & Computer Science variant parsing (src/unitParser.js): Extended extractVariant to recognize 4HI1 split-option codes (1A/1B/1AR/1BR/2A/2B/2AR/2BR -> OptA/OptB/OptA-R/OptB-R) and 4CP0 language mark schemes (4CP0_2A/2B/2C -> P2A/P2B/P2C), unlocking 24 missing 2021–2022 IGCSE History papers and 2 Oct-Nov 2020 Computer Science mark schemes.',
      'Archive completeness: Added 30 newly verified Edexcel PDFs in total (including 4 June 2017 IAL Biology/Physics modified-print grids and the WBI05 Scientific Article), bringing the archive to 19,912 total files (16,051 unique records).'
    ]
  },
  {
    version: 'v7.3.2',
    date: '2026-11-23T08:35:00+06:00',
    title: 'Single-Stream Audio Lifecycle & ZIP Track Swap Fix',
    summary: 'Fixed overlapping double audio playback and lingering background audio after closing the reader or navigating back to the home page.',
    changes: [
      'Single persistent audio player & full teardown: Replaced key-swapped JSX autoplay with an imperative single-element playback controller and global active-audio guard (src/lib/audioLifecycle.js) that pauses, clears src, flushes the browser media pipeline, and resets MediaSession whenever tracks switch, the modal/dock closes, or you navigate away.',
      'Stopped mid-playback ZIP hijacking: Skipped redundant background downloads of combined Audio U2U4.zip archives when the sitting already has a direct unit MP3/WAV, and kept active Full Audio playing smoothly when tracked chapter ZIPs finish unpacking instead of restarting or overlapping audio.',
      'Cleaner ZIP abort recovery & Back navigation: Synchronously cleared aborted in-flight ZIP extractions so rapid reopens never stall, and normalized same-paper hash routes via replaceState so Browser Back leaves the audio reader cleanly in one step.'
    ]
  },
  {
    version: 'v7.3.1',
    date: '2026-11-23T07:45:00+06:00',
    title: 'Zero-Waterfall Home Preload & Scoped Lazy CSS Tokens',
    summary: 'Eliminated the 2-round-trip home waterfall on lazy WelcomePage while moving 342 WelcomePage and FilterDrawer theme token declarations out of entry CSS.',
    changes: [
      'Home-only WelcomePage preload: scripts/prerender-seo.js now injects <link rel="modulepreload"> and <link rel="stylesheet"> for WelcomePage assets strictly into dist/index.html (/) so the homepage loads in round-trip 1 while all 298 deep routes keep the lighter bundle.',
      'Scoped lazy CSS tokens: Moved 111 WelcomePage theme tokens into src/styles/welcome.css and 3 FilterDrawer tokens into src/styles/filter-drawer.css (342 declarations removed from src/index.css with 0 unused and 0 undefined CSS custom properties).',
      'Repository sync: Restored AI_INSTRUCTIONS_APP.md and AI_INSTRUCTIONS_LIBRARY.md to GitHub tracking via scripts/push-github.js.'
    ]
  },
  {
    version: 'v7.3',
    date: '2026-11-23T06:00:00+06:00',
    title: 'Security, Accessibility, Performance & Reader Hardening',
    summary: 'Completed a comprehensive 4-pass security, accessibility, performance, SEO, and runtime audit—hardening CSP/API endpoints, modal focus management and WCAG contrast, self-hosted PDF CMaps, IAL Maths branch shards, and reader reliability.',
    changes: [
      'Security & self-hosted assets: Replaced script-src unsafe-inline with a strict SHA-256 CSP hash, extracted API subtitle handlers with distributed Mongo rate limits and allowlist guards, stopped CDN-caching transient subtitle misses, and self-hosted all 168 PDF.js CMap tables locally under /pdfjs/cmaps/.',
      'Accessibility & WCAG AA polish: Added full PreviewModal focus trapping, background inerting, opener focus restoration, roving tablist navigation, skip-to-main navigation, accessible mobile action labels, WCAG AA Dark/OLED Mark Scheme contrast, >= 24px interactive target heights, and high-contrast OLED resizer focus rings.',
      'Performance, SEO & runtime reliability: Split IAL Maths cold-landing shards by branch and deferred Welcome/Filter CSS out of entry CSS, removed dead compactTree metadata and redundant /api/views re-fetches, added 16 kHz audio resampling and AbortController teardown, fixed #paper= not-found states and modular IGCSE Maths search aliases (4WM1/4WM2), and derived per-route sitemap lastmod dates.'
    ]
  },
  {
    version: 'v7.2',
    date: '2026-11-23T01:30:00+06:00',
    title: '100% Full-Archive Pre-Indexed Audio Subtitles (All 272 IAL & IGCSE Listening Resources)',
    summary: 'Expanded sharded static subtitles to cover 100% of every listening audio file across both Edexcel IAL and IGCSE — 367 unique tracks and 50,363 timed segments across 9 lazy subject shards with zero device-side loading wait.',
    changes: [
      'Complete IGCSE pre-indexing (229 unique tracks): Pre-indexed all 6 IGCSE listening subjects into lazy per-subject shards — English as a Second Language (46 tracks), German (56), French (53), Spanish (36), Chinese Mandarin & Cantonese (28), and Swahili (10) — bringing total static coverage to 272/272 audio resources (367 unique SHA-256 tracks / 992 manifest keys / 50,363 timed segments).',
      'Silero VAD timing & reading-time rubric polish: Used Silero Voice Activity Detection across long 25–65 minute IGCSE exams to preserve exact wall-clock timestamps across silence pauses, spliced crisp English opening rubrics and post-5/8-minute-reading-pause instructions on non-English papers, and added clickable reading-time pause cues so students can jump straight to Question 1.',
      'Zero-bloat lazy subject delivery: Visitors only fetch compact public/subtitles/manifest.json (112.7 KB) plus the single subject shard for the exam they open (154 KB–1.77 MB uncompressed), keeping standard Past Paper PDFs and non-audio pages completely unaffected.'
    ]
  },
  {
    version: 'v7.1',
    date: '2026-11-22T22:15:00+06:00',
    title: '100% IAL Pre-Indexed Audio Subtitles, Sharded Delivery & Sync/Slicing Fixes',
    summary: 'Fixed early subtitle cutoffs, multi-unit ZIP passage slicing, and cross-unit track mismatches, migrated static subtitles to lazy per-subject shards, and pre-indexed 100% of all Edexcel IAL listening audio plus full-length IGCSE ESL June 2018 recordings.',
    changes: [
      'Real-audio forced alignment & full-duration sync: Replaced linear estimate timestamps with real audio word-level forced alignment against verbatim Transcript PDFs (fixing the 5:02 cutoff on 6:59 French WFR02 June 2021 recordings, kerning-split text in legacy 2019 PDFs, and the 23:37 early cutoff on 42:34 IGCSE ESL June 2018 P2/P2R tracks) with clean English exam intro splicing.',
      'Multi-unit ZIP & track-switching fixes: Stopped Audio U2U4.zip archives from slicing off Passages 2–4, prioritized exact per-track and unit-hint subtitle keys so switching between Unit 2 Audio, Unit 4 Audio, and Full Audio inside the same modal always loads the matching unit captions, added a pre-speech standby state, and keyed the audio element cleanly across track switches.',
      'Sharded static subtitles & 100% IAL coverage: Migrated static subtitles to public/subtitles/manifest.json + lazy per-subject shards (ial-french, ial-german, ial-spanish, igcse-esl — 140 unique SHA-256 tracks / 400 keys covering all 96 IAL listening resources + 2 IGCSE ESL 2018 tracks), fixed regional _R_AUD variant parsing so IGCSE P2 and P2R audio no longer collide, and raised /api/views shared cloud cache caps to 1,200 segments / 320 KB with multi-key fallback lookup.'
    ]
  },
  {
    version: 'v7.0.1',
    date: '2026-11-22T16:40:00+06:00',
    title: 'Entry Bundle Trimming, Idle Telemetry & Pure OLED Filter Polish',
    summary: 'Removed heavy unit-parsing tables and telemetry from the synchronous entry bundle, trimmed unused CSS custom properties, and fixed Pure OLED filter button contrast.',
    changes: [
      'Lighter initial JS boot: Extracted lightweight unitSort.js (compareUnitLabels / isLegacyIalUnitLabel) so full unitParser.js filename regex tables stay strictly off-thread in the catalog Web Worker and build scripts, and deferred telemetry.js loading until browser idle.',
      'Pure OLED filter drawer polish: Updated OLED .filter-btn tokens from white boxes to true dark OLED surfaces (#111111 with #E2E8F0 text and #FF5370 hover/active borders) and pruned 5 unused legacy CSS custom properties from index.css.',
      'Documentation sync: Refreshed README.md and AI assistant guides to match the v7.0.1 modular architecture, verified 19,882-file / 16,021-record archive counts, 296-URL sitemap, and /llms.txt.'
    ]
  },
  {
    version: 'v7.0',
    date: '2026-11-22T15:24:00+06:00',
    title: 'Modular Architecture, Lazy Audio/Solution Chunks & Semantic Theme Variables',
    summary: 'Decomposed oversized monolith modules and stylesheets into cohesive, cacheable ES modules and semantic CSS theme tokens while lazy-splitting audio/ZIP readers out of standard PDF viewing.',
    changes: [
      'Modular UI & Hook Decomposition: Extracted Header, Footer, Breadcrumbs, SearchBanner, FilterDrawer (lazy), PaperTable/PaperRow, ArchiveContextStrip, CrashRecoveryScreen, NotFoundCard (lazy), ThemeToggleButton, ResourceCard, VirtualPdfPage, and useTheme into dedicated modules alongside shared lib/ utilities (paperKeys, networkUtils, pdfRangeTransport, pdfLayoutMath).',
      'Lazy Reader Subsystems & Worker Deduplication: Split AudioPlayerDock (ZIP/subtitle stack) and SolutionBankView (chapter/exercise ZIP PDF extractor) into on-demand async chunks so standard Past Paper PDFs never fetch audio or ZIP modules, and moved static search dictionaries and curriculum maps into src/data/ cleanly shared across main thread, Web Worker, and SSR prerendering.',
      'Semantic CSS Theme Variables & Build Version Sync: Consolidated all Light, Dark, and Pure OLED overrides across index.css, secondary.css, and modal.css into CSS custom properties (~1,940 duplicated CSS lines removed with zero visual drift) and synced index.html <head> cache keys directly from appMeta.js via Vite transformIndexHtml.'
    ]
  },
  {
    version: 'v6.9.9',
    date: '2026-11-22T14:20:00+06:00',
    title: 'Web Worker Search & Indexing, Modular Code/CSS Splitting & Zero-Waterfall Cold Boot',
    summary: 'Broke up the monolithic app bundle and stylesheet into lazy-loaded chunks, moved full 16,021-record catalog hydration and smart search onto a dedicated Web Worker, eliminated the startup fetch waterfall, and added zero-waste click-down PDF pre-warming.',
    changes: [
      'Web Worker catalog & search engine: Moved 4.1 MB index.json JSON parsing, tuple hydration, sibling linking, and smart fuzzy search off the main UI thread into a dedicated module worker so scrolling and typing stay smooth even on mid-range phones and school laptops.',
      'Modular JS & CSS splitting: Split PreviewModal, ZIP/audio/subtitle modules, Changelog history, About, WelcomePage, heavy JSON-LD/ISBN schemas, and modal/secondary CSS out of the initial landing bundle—cutting initial entry JS and render-blocking CSS roughly in half.',
      'Zero-waterfall cold boot & instant first paint: Started parallel /meta.json and route-shard fetching right in <head> alongside a lightweight theme-matched boot shell so cold visits paint immediately while keeping full semantic crawler HTML intact.',
      'Zero-waste reader pre-warming: Preloads lazy reader code once on first paper hover (zero Hugging Face traffic) and starts the clicked paper’s PDF request on pointerdown for faster opens with zero wasted requests.'
    ]
  },
  {
    version: 'v6.9.8',
    date: '2026-11-22T01:30:00+06:00',
    title: 'Recovered 40 Missing IAL & June 2025 IGCSE PDFs + Hardened Sync Validation',
    summary: 'Restored all 20 previously truncated IAL Chemistry and Mathematics PDFs (2011, 2018, 2019) plus 20 June 2025 IGCSE Examiner Reports, bringing the verified archive to 19,882 files (16,021 unique records) with 100% valid PDFs.',
    changes: [
      'Complete IAL recovery (20/20): Restored IAL Chemistry Oct 2018 Unit 1 QP (linearized to 764 KB), all 15 legacy Jan/Jun 2011 Mathematics QPs and Examiner Reports (C4, D1, FP1–FP3, M1–M3, S1–S3), and all 4 May/Jan 2019 C3/C34 (WMA02) Mark Schemes and Examiner Reports.',
      'June 2025 IGCSE Examiner Reports (20 PDFs): Added verified June 2025 Examiner Reports for Biology (1B/1BR/2B/2BR), Chemistry (1C/1CR/2C/2CR), English Language A (01/01R/02/02R/03/E), English Language B (01/01R), and Further Pure Mathematics (01/01R/02/02R).',
      'Hardened multi-source sync guardrails: Added PDF %%EOF trailer and trailing-HTML checks, multi-source fallback retries, and strict Edexcel-only / IAL-vs-IGCSE isolation inside scripts/sync-sources.js.'
    ]
  },
  {
    version: 'v6.9.7',
    date: '2026-11-21T22:36:00+06:00',
    title: 'Zero-Warning Console Polish & Passive Touch Drag Fix',
    summary: 'Eliminated browser console warnings and errors during page loads, split-pane touch resizing, and PDF rendering.',
    changes: [
      'Removed unused /meta.json preload hint: Eliminated Chrome unused-preload warnings and duplicate /meta.json fetches since catalog metadata is requested with build-busted cache validation.',
      'Fixed passive touchstart listener errors: Guarded mouse-only preventDefault() calls on split-view and 2-page spread resizer handles and added CSS touch-action: none across all resizers so touch dragging produces zero console errors.',
      'Cleaner WebPDF worker console: Configured PDF.js verbosity to ERRORS to silence harmless TrueType hinting warnings (TT: undefined function) on legacy exam PDFs while keeping real errors visible.'
    ]
  },
  {
    version: 'v6.9.6',
    date: '2026-11-21T22:12:00+06:00',
    title: 'Search Precision & Math Unit Disambiguation, Zero-Flash Prerender Hydration & Desktop/Mobile Alignment Polish',
    summary: 'Fixed multi-word Math unit queries ("pure mathematics 3", "pure 1") colliding with IGCSE Paper 1–4, eliminated the split-second raw HTML flash on page reloads, prevented mobile reader controls from clipping off-screen, and aligned desktop views badges and table columns.',
    changes: [
      'Search engine precision & ranking: Preserved Pure Mathematics (WMA11–WMA14), Further Pure (WFM01–WFM03), Mechanics (WME01–WME03), Statistics (WST01–WST03), Decision (WDM11), and Core Mathematics (C1–C4, WMA01–WMA02) unit bindings during query normalization so "pure mathematics 3" never collides with IGCSE Paper 3, separated IAL Unit 1–4 from IGCSE Linear Paper 1–4, and boosted canonical unitCode equivalences.',
      'Zero-flash prerender hydration: Added synchronous head JS detection (html.js-enabled) to hide the static .seo-prerender-shell before first paint on browser reloads while keeping full semantic HTML visible for non-JS search and AI crawlers.',
      'Mobile & desktop UI alignment: Converted the paper views counter into a single-line horizontal pill aligned with curriculum and series badges, compacted mobile PDF modal Share/Download buttons to icon controls with clean flex wrapping so 9+ header tabs never clip off-screen, and widened the desktop Series column so Regional badges stay on one centered row.'
    ]
  },
  {
    version: 'v6.9.5',
    date: '2026-11-21T15:30:00+06:00',
    title: 'SEO & AI-Visibility Overhaul, Archive PDF Integrity, Cover-Page Spread Toggle & Mobile Reader Polish',
    summary: 'Upgraded static prerendering for AI/Search engines with Book & FAQPage JSON-LD and /llms.txt, cleaned and repaired defective archive PDFs, added a solo Cover-page spread toggle and 1-click study link sharing, and refined mobile 2-Page PDF toolbars.',
    changes: [
      'Search & AI-Engine (GEO) Prerendering: Rendered full semantic HTML directly inside #root with Answer-Engine Q&A blocks, Book + ItemList + FAQPage Schema.org JSON-LD (with verified ISBNs, authors & publishers), /llms.txt catalog index, current-first IAL unit code ordering, and lateral sibling-unit cross-linking across all unit pages.',
      'Archive PDF Integrity & Audio Subtitles: Repaired trailing-HTML IAL Biology papers, removed unrecoverable HTML error shells from the PDF catalog, synced canonical IAL French 2019–2021 audio subtitle keys, and seeded 205 timed transcript segments for IGCSE ESL June 2018 listening tracks.',
      'Reader & Mobile Polish: Added a 1-click "Share" button in the PDF reader header, an optional "Cover" pairing toggle in 2-Page mode (1 solo, 2–3, 4–5), compact 390px mobile 2-Page toolbar sizing with active maroon state across Light/Dark/OLED, and tightened API origin/subtitle write guards.'
    ]
  },
  {
    version: 'v6.9.4',
    date: '2026-11-20T01:40:00+06:00',
    title: 'Resizable Two-Page Side-by-Side PDF Reader Mode',
    summary: 'Added a side-by-side Two-Page spread reader with a draggable split-screen style resizer for textbooks and all standalone PDFs (QP, MS, ER, Worked Solutions).',
    changes: [
      'Two-Page Side-by-Side Mode: Textbooks open in 2-Page book-spread mode by default on desktop/tablet, while standalone past papers (QP, MS, ER, SC, SAM) and worked solutions open in single-page mode with a one-click "2-Page" toolbar toggle.',
      'Resizable Left & Right Sides: Drag the center divider (or use Left/Right Arrow keys; double-click or press Home to reset 50/50) to smoothly resize the left and right pages independently at 60fps with crisp HiDPI re-rendering on release.'
    ]
  },
  {
    version: 'v6.9.3',
    date: '2026-11-20T01:15:00+06:00',
    title: 'Instant Cache Freshness, Daily Auto-Reload & Full Large-PDF Linearization',
    summary: 'Eliminated stale browser catalog caching after updates with version-busted fetches, automatic 24-hour / new-deploy soft reloads (never interrupting open readers), and linearized all remaining >= 5 MB PDFs for Fast Web View streaming.',
    changes: [
      'Instant update freshness & daily auto-reload: Made /meta.json always revalidate (max-age=0), prioritized build-busted ?v= URLs for /index.json and /shards/*.json, added a 24-hour local cache TTL, and introduced safe automatic full reloads when a tab is >= 24h old or a newer catalog deploys (deferred automatically while reading a PDF or listening to audio).',
      '100% Fast Web View large PDFs: Linearized all remaining >= 5 MB textbooks and past papers with qpdf (/Linearized + /ObjStm) and synced them to Hugging Face so Page 1 streams immediately in ~1–2 byte-range chunks.'
    ]
  },
  {
    version: 'v6.9.2',
    date: '2026-11-20T00:50:00+06:00',
    title: 'Added IGCSE Commerce & Mathematics A Student Book 2 (73 Textbooks)',
    summary: 'Expanded the verified IGCSE (9-1) textbook collection with Commerce Student Book (Rob Jones, 2020) and Mathematics A Student Book 2 (David Turner & Ian Potts, 2017), adding /textbooks/igcse/commerce.',
    changes: [
      'New linearized IGCSE (9-1) textbooks: Added Pearson Edexcel International GCSE (9-1) Commerce Student Book (Rob Jones, 2020, 426 pp) and Mathematics A Student Book 2 (David Turner & Ian Potts, 2017, 561 pp) with verified cover/copyright metadata.',
      'Canonical SEO & catalog counts: Added /textbooks/igcse/commerce (299 canonical sitemap URLs, 73 total textbooks & worked solution banks).'
    ]
  },
  {
    version: 'v6.9.1',
    date: '2026-11-20T00:15:00+06:00',
    title: 'Subject Wizard Sub-URLs & Browser Back/Forward Navigation',
    summary: 'Synced subject and unit wizard steps with canonical sub-URLs (/ial/<subject>, /igcse/<subject>, and unit routes) so browser Back/Forward and mouse Back buttons step smoothly through Subjects → Units → Years → Papers instead of leaving the site.',
    changes: [
      'Wizard route & history sync: Selecting a subject or unit on the homepage now pushes its canonical sub-URL (e.g. /ial/accounting, /ial/accounting/unit-1-the-accounting-system-and-costing-wac11) with full popstate Back/Forward support and refresh preservation.',
      'Semantic links & scroll polish: Converted primary wizard "View All" actions into real <a href> links with middle-click support and auto-scrolled to top when drilling into subjects lower on the page.'
    ]
  },
  {
    version: 'v6.9',
    date: '2026-11-19T23:58:00+06:00',
    title: 'Verified Textbook Titles, Unit Grouping & Order, and Search Console SEO Fix',
    summary: 'Standardized all 71 textbook and solution bank titles with verified authors and years, fixed subject unit grouping/ordering across Physics, Business, Chemistry, Biology, Economics & Maths, resolved Search Console indexing traps, and tightened search accuracy.',
    changes: [
      'Subject unit ordering & naming: Scoped Maths branch grouping strictly to Maths (fixing Physics Units 1 & 4 under "Mechanics" and Business Unit 3 under "Decision Mathematics"), ordered all units 1–6 naturally, separated Current vs. Legacy (Pre-2018) specs with full verified Pearson unit titles (WPH01–06, WBI01–06, WCH01–07, WBS01–04, WEC01–04, 6ECA1–3), and merged the WET12 typo into WET02.',
      'Complete textbook catalog naming: Replaced cryptic and copy-suffixed textbook names ("P1 .pdf", "(1)", "New ...", ALL-CAPS answer files) with full bibliographic titles, verified authors, publishers, and publication years across all 71 IAL & IGCSE books and worked solution banks.',
      'Google Search indexing & crawl budget: Moved paper-modal deep links to hash fragments (#paper=...) to eliminate 30,000+ ?paper= crawl traps while keeping legacy ?paper= links and middle-click support intact, removed conflicting noindex directives on parameterized canonical routes, linked all unit and textbook sub-pages inside hydrated DOM reference bars, added shorthand & legacy unit 308 redirects, and enabled true HTTP 404s for invalid subpaths.',
      'Search & parser accuracy: Added plural document-type matching ("wit12 data files", "wma11 examiner reports"), blocked P1/WMA11 phrase collisions with Further Pure Mathematics 1, isolated Higher vs Foundation (2HR vs 2FR) queries, stripped duplicate copy suffixes from search path tokens, and recovered 5 unconventional Pearson filenames.',
      'Visual UI & OLED contrast polish: Fixed missing Pure OLED overrides for breadcrumbs, wizard back buttons, and IGCSE blue accents; eliminated Dark/OLED double-border clipping in mobile header breadcrumbs; replaced hardcoded "Scientific Article" tabs with context-aware document labels (Transcript, Equations List, Extract Booklet, Exemplars, Speaking / Grid); refined 1366px modal header spacing; and balanced the 404 recovery action row.'
    ]
  },
  {
    version: 'v6.8',
    date: '2026-11-17T04:17:16+06:00',
    title: 'PDF Streaming Reliability, Search Console SEO & Multi-Resolution UI Polish',
    summary: 'Eliminated non-linearized large PDF range stalls, fixed search & unit indexing edge cases, resolved Google Search Console noindex/canonical duplicates, and refined Dark/OLED, tablet, and mobile layouts.',
    changes: [
      'WebPDF streaming & zoom: Aligned 128 KB bootstrap chunking, bypassed backwards range storms on un-linearized <= 15 MB PDFs, queued large-PDF range requests, and fixed smooth Fit -> 125% zoom stepping across Fit-Width viewers.',
      'Search & catalog indexing: Tightened strict Solution Bank matching ("solution bank p1"), excluded listening transcripts from audio classification, and mapped legacy single-paper IGCSE 4AC0 Accounting files to Paper 1.',
      'SEO & assets: Replaced 176 duplicate shorthand unit alias HTML pages with permanent 308 redirects, removed ?year= crawl traps, preloaded cold legacy IAL unit labels, added multi-size favicon.ico & static 404.html, and updated Open Graph preview cards.',
      'Responsive UI & themes: Fixed OLED/Dark split-pane/resizer/skeleton/badge theming and ARIA tablist structure, added 2-column tablet grids, kept mobile breadcrumbs single-row scrollable, and constrained mobile filter drawers with sticky Apply actions.'
    ]
  },
  {
    version: 'v6.7',
    date: '2026-11-17T02:45:12+06:00',
    title: 'Header Coverage Date Pill Restored',
    summary: 'Restored the top-right archive year-range badge in the header, displaying full library span (January 2003 – June 2026) and active subject date ranges.',
    changes: [
      'Dynamic header coverage indicator: Brought back the top-right date-span badge next to the theme toggle, switching dynamically to show each selected subject’s exact earliest-to-latest sitting range.'
    ]
  },
  {
    version: 'v6.6',
    date: '2026-11-16T20:38:32.000Z',
    title: '16 New IGCSE Subjects, Sciences Double/Single Award & 2025–2026 Modular Coverage',
    summary: 'Grew the archive to 19,938 total files (16,077 unique records) across 19 IAL and 43 IGCSE subjects, adding 16 new IGCSE courses, Oct 2025 & May/June 2026 Modular Maths A, and expanded listening audio.',
    changes: [
      '16 new IGCSE subjects & Bengali merge: Added Art & Design, Bangladesh Studies, Chinese, Greek (First Language), Modern Greek, Gujarati, Hindi, Islamiyat, Pakistan Studies, Sciences (Double & Single Award with Linear 1B/1C/1P & Modular Unit 1B–6P), Sinhala, Swahili, Tamil, Turkish, and Urdu, plus 2011–2019 legacy Bengali merged into Bangla.',
      '2025–2026 Modular & gap fill: Added October 2025 and May/June 2026 Modular Mathematics A (4WM1H/4WM2H), filled missing 2014–2024 IAL Economics/Science/Law/History/IT gaps, recovered extra-time ESL/Chinese/Swahili/MFL listening tracks, and expanded audio to 272 tracks and archives with Chinese & Swahili Whisper support.',
      'Search & streaming refinements: Disambiguated IGCSE paper variants (F/H Tiers, Double/Single Science B/C/P disciplines), guarded IGCSE doc IDs from colliding with IAL W-codes, expanded Data Files to 46 archives, and packed new >= 5 MB PDFs with compact /ObjStm object streams.'
    ]
  },
  {
    version: 'v6.5',
    date: '2026-11-16T14:15:00.000Z',
    title: 'Massive Archive Expansion: 9 New IGCSE Subjects, 2011–2018 & Solomon Maths',
    summary: 'Expanded the archive to 18,180 total files (14,384 unique records) across 19 IAL and 27 IGCSE subjects with 9 new IGCSE courses, legacy 2011–2018 IAL/IGCSE series, Solomon Maths papers, and IGCSE listening audio.',
    changes: [
      '9 new IGCSE subjects: Added Arabic (2006–2025), English as a Second Language (2006–2025), French, German, Spanish, History, Religious Studies, Global Citizenship, and Islamic Studies with full search aliases and Modular 4W* support.',
      'Historical & Modular coverage: Filled 2014–2018 IAL and 2011–2018 IGCSE papers & Examiner Reports, added 2025 June IAL Humanities/Geography/Law papers, sorted Computer Science/IT Data Files out of Unknown_Year, and added all 168 Solomon Maths practice papers (C1–C4, M1–M2, S1–S2).',
      'Audio & streaming polish: Grew listening audio to 189 tracks & archives (adding IGCSE ESL, French, German & Spanish with English Whisper support), packed large new PDFs (>= 5 MB) with /ObjStm object streams, and synced search codes (4308, 4357, 4400, 7042, 4WES1).'
    ]
  },
  {
    version: 'v6.4',
    date: '2026-11-16T17:15:00.000Z',
    title: 'In-Browser Worked Solutions Reader',
    summary: 'Made all 14 IAL Maths Worked Solution Banks (P1–P4, M1–M3, S1–S3, D1, FP1–FP3) viewable chapter-by-chapter right inside WebPDF without downloading full archives.',
    changes: [
      'On-demand ZIP chapter streaming: Reads only the ZIP Central Directory (~3–22 KB) via HTTP Range requests to list every chapter, exercise, and review paper, then unpacks only the clicked PDF in browser memory.',
      'M3 & S3 archive conversion: Repacked the M3 and S3 RAR solution banks into standard DEFLATE ZIPs so all 14 solution packs open cleanly on-site.'
    ]
  },
  {
    version: 'v6.3',
    date: '2026-11-16T02:43:09.000Z',
    title: 'Smarter Search, Large PDF Streaming & Device Theme Sync',
    summary: 'Upgraded catalog search with precision/partial matching, added on-demand byte-range streaming for large textbooks (>= 5 MB), and synced initial light/dark themes to your device.',
    changes: [
      'Precision & aliases: Stopped short tokens like cs, it, p1, and m1 from matching inside unrelated words, paired May/June/Summer and Oct/Nov/Autumn sessions, and mapped IGCSE subject codes (e.g. 4MA1, 4PH1).',
      'Fuzzy & partial recovery: Built dynamic vocabulary from the live catalog, preserved digits inside paper codes during typo correction, added -exclusion filters, and surfaced closest partial matches + "Did you mean" hints.',
      'Large PDF streaming & theme sync: Textbooks and PDFs >= 5 MB stream 128 KB byte ranges on demand with Page-1 isolation + idle HiDPI sharpening and clean MB progress, large archive PDFs were packed with compact object streams for single-digit initial requests, and first visits follow device light/dark mode until overridden.'
    ]
  },
  {
    version: 'v6.2',
    date: '2026-11-16T00:51:30.000Z',
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
