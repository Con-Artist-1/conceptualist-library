# Conceptualist Systems Library - AI Assistant Guide

Welcome! If you are an AI assistant tasked with working on the curated document repository (`e:\The Library\Past Papers`, `e:\The Library\IAL Books`, and `e:\The Library\IGCSE Books`), please read this document carefully before making any changes. This library powers the independent Conceptualist Systems web archive (`https://www.conceptualist.uk`) and Hugging Face dataset (`Diavlon/mcmaster-docs-library`).

---

## 1. Directory Structure

The library is an independent study archive indexing **100% Pearson Edexcel** exam resources containing **19,882 archived files** (**16,021 deduplicated unique documents**) across **19 IAL subjects** and **43 IGCSE subjects** covering **January 2003 – June 2026**.

**Main Root Folders:**
1. **`Past Papers\IAL`**: Contains Edexcel International A-Level (IAL) and legacy GCE Maths papers across 19 subjects (strictly excludes UK GCE non-Math specs and pre-launch years).
2. **`Past Papers\IGCSE`**: Contains Edexcel International GCSE (9–1) Modular (`4W*`), Linear (`4*`), and Legacy (`4*0` / 4-digit) papers across 43 subjects (including `Sciences (Double Award)` `B`/`C`/`P` papers and merged `Bangla`/`Bengali`).
3. **`IAL Books`**: Contains Edexcel IAL student textbooks, lab books, and solution banks sorted by subject.
4. **`IGCSE Books`**: Contains Edexcel IGCSE (9–1) student textbooks sorted by subject.

**Typical Hierarchy:**
- `Past Papers \ IAL \ <Subject> \ <Unit or Year> \ <Session> \ <File.pdf>`
- `Past Papers \ IGCSE \ <Subject> \ <Year> \ <Session> \ <File.pdf>`
- `IAL Books \ <Subject> \ <Book.pdf>`
- `IGCSE Books \ <Subject> \ <Book.pdf>`

---

## 2. File Naming & Normalization Conventions

The naming conventions depend on the source batch:

- **Canonical Edexcel Format**: `[Subject]_[UnitCode]_[Year]-[Session]_[DocType].pdf` (e.g., `Math_WMA11_2024-Jan_QP.pdf`, `Biology_U3_2022-Jan_QP.pdf`).
- **AutomatePapers Format**: Retains clean standard names inside `Year\Session` folders (e.g., `QP U1.pdf`, `MS U2.pdf`, `QP Paper1R.pdf`).
- **Search & Unit Normalization (`src/searchEngine.js`, `src/unitParser.js`)**: Indexes structured whole-token/phrase fields per sitting (`buildFileSearchData`, `finalizeUnifiedSearchData`) alongside canonical Math branch disambiguation (`pure mathematics 1..4` → `wma11..wma14`, `further pure 1..3` → `fp1..fp3`, `mechanics 1..3` → `m1..m3`, `statistics 1..3` → `s1..s3`, `decision 1` → `d1`, `core 1..4|12|34` → `c1..c4|c12|c34`), strict separation of IAL `u1..u6` from IGCSE `p1..p4`, legacy unit normalization (merging Physics `WPH07` into `Unit 3 (WPH13)`), cover-code patterns (`WMA11/01`, `4MA1/2HR`), bidirectional session aliases (`May`/`June`/`Summer`, `Oct`/`Nov`), typo suggestions (`Did you mean`), `"quoted phrases"`, `-exclusions`, and partial-match fallback.

**Critical Rule:** All raw scraper timestamp suffixes (e.g., `_1700000000.pdf`) have been strictly stripped from the repository. `generate-index.js` also excludes known third-party `toaz.info-*` watermark artifacts. **Do not introduce files with raw timestamp suffixes or watermarks.**

---

## 3. Web Application, Route Sharding & Indexing

The front-end application (React 19 + Vite 8 + Vercel Web Analytics & Speed Insights + MongoDB endpoints `/api/views` & `/api/telemetry`) located at `e:\The Library\search-app` uses multi-stage static data loading:
- `public/meta.json`: High-speed compact metadata & wizard catalog for `0ms` initial UI hydration.
- `dist/shards/*.json`: **65 compact route shards** loaded in parallel with `meta.json` on cold landing pages (up to 96% smaller than full index payloads).
- `public/index.json`: Tuple-encoded (`keys` + `files`) deduplicated global catalog loaded on demand / background upgrade, with Hugging Face `live_index.json` fallback.
- `public/audio-subtitles.json`: Pre-generated Tier 1 subtitle index (`32` cached keys covering `11/272` `AUD` resources: 10 French Transcript PDFs `2019–2021`, IGCSE ESL June 2018 P2/P2R Transcript PDFs, + all 4 tracks of `French WFR02 Jan 2026`), incrementally preserved and merged from `.data/audio_subtitles.json` whenever `generate-index.js` runs. Remaining un-indexed ESL, Chinese, Swahili, French, German, and Spanish audio packs use Tier 2 MongoDB (`audio_subtitles`) caching and Tier 3 on-demand browser generation (`inferWhisperLanguage`).

**Core Production Scripts (`search-app/scripts/`):**
The scripts directory contains strictly **8 essential utilities**. Keep all temporary/verification scripts outside the repo (e.g. in AppData scratch directories).

1. **Rebuild Metadata, Search Index & Subtitle Sync (updates `public/meta.json`, `public/index.json`, root `live_index.json`, and preserves/merges `public/audio-subtitles.json`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\generate-index.js`" 2>&1" | Write-Output
   ```
2. **Vite Production Build & SEO Pre-Render (`dist/`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\build.js`" 2>&1" | Write-Output
   ```
3. **SEO Sitemap, `/llms.txt`, Route Shards & Static HTML Pre-rendering (`296` indexable sitemap URLs excluding `< 3`-file thin `noindex` routes, `65` shards, `299` canonical HTML routes + `404.html` + `422` permanent `308` redirects in `vercel.json`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\prerender-seo.js`" 2>&1" | Write-Output
   ```
4. **Push Web App to GitHub (`Con-Artist-1/conceptualist-library`) via REST API script** *(NEVER run CLI `git push`, which hangs on interactive credential prompts; always sync local `.git` afterwards via `git fetch origin` + `git reset --mixed origin/main`)*:
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\push-github.js`" `"<commit message>`" > %TEMP%\gh_push.txt 2>&1 & type %TEMP%\gh_push.txt"
   ```
5. **Deploy to Vercel Production (`https://www.conceptualist.uk`) & IndexNow Ping (mandatory production deploy step after pushing):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\deploy-vercel.js`" > %TEMP%\vercel_deploy.txt 2>&1 & type %TEMP%\vercel_deploy.txt"
   ```
   *(Automatically verifies `https://www.conceptualist.uk/<INDEXNOW_KEY>.txt` once READY and submits all canonical `public/sitemap.xml` URLs to `api.indexnow.org`; supports `--indexnow-only` / `--skip-indexnow` and `npm run indexnow`. Always confirm `=== Production Deployment READY! ===`.)*
6. **Sync Library Files to Hugging Face (`Diavlon/mcmaster-docs-library`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\sync-hf.js`" 2>&1" | Write-Output
   ```
7. **Upload Live Index to Hugging Face:**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\upload-live-index-hf.js`" 2>&1" | Write-Output
   ```
8. **Sync New Past Papers From Verified Upstream Sources (`scripts/sync-sources.js`):**
   - **Dry-run preview (fast filter for new sessions, e.g. `2026+`):**
     ```powershell
     $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\sync-sources.js`" --dry-run --since=2026 2>&1" | Write-Output
     ```
   - **Download, optimize (`>= 5 MB` `/ObjStm`), and re-index:**
     ```powershell
     $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\sync-sources.js`" --apply --since=2026 2>&1" | Write-Output
     ```
   - **Supported `--sources=`:** `bsr` (British Student Room `/edexcel/` public Google Drive folders via `embeddedfolderview?id=...#list`, filtering `data-level` strictly to `IAL` & `IGCSE`), `dp` (`dynamicpapers.com` authenticated with `post_password=159357`), `igexams` (`igexams.com` Edexcel IGCSE/IAL + Drive folders), `ssc` (`smartstudycampus.com` `igcse-edexcel-subject` / `as-edexcel-subject`), `pmt` (`physicsandmathstutor.com/past-papers/` Edexcel IAL/IGCSE + Solomon), and `pl` (`paperlords.org` REST API).
   - **Built-in Safeguards:**
     - **Strict Edexcel-only & IAL vs UK GCE / IGCSE isolation:** Blocks non-Edexcel exam boards (`AQA`, `OCR`, `CIE`, `Cambridge`, `WJEC`, `Eduqas`), `toaz.info` artifacts, non-IAL subjects (enforcing `IAL_LAUNCH_YEAR` whitelist), IGCSE/GCSE codes leaking into IAL (`4w?[a-z]{2}\d`, `1B/1C/1P/2BR/1H`), UK GCE (`6BI0x`, `6CH0x`, `6PH0x`, `6EC0x`, `66xx` non-Math, `8xx`/`9xx`), and excludes grade boundaries, grade characteristics, syllabuses, timetables, formula sheets, notes, and specimen/SAMs.
     - **PDF trailer validation, multi-source fallbacks & incremental SHA-256:** Verifies `%PDF-` header, closing `%%EOF` trailer (last 8 KB), and absence of trailing HTML before saving; keeps per-dedup-key fallback URLs across sources if a primary download fails validation; caches `(size, mtimeMs, sha256)` in `.data/library_sha_cache.json` (git-excluded via `push-github.js`) to avoid re-hashing unchanged files, automatically falls back to `curl.exe` (`600s` timeout) when large MP3/Modified-paper ZIPs (`50–155 MB`) exceed `fetch` timeouts, copies shared cross-subject `Sciences (Double Award)` papers (`1B`/`1C`/`1P` matching local Bio/Chem/Phys SHA-256) directly from disk, prioritizes explicit Pearson filename codes (`_rms_`, `_pef_`, `_que_`) over misfiled Drive folders, packs new `>= 5 MB` PDFs lacking `/ObjStm` when `qpdf` (`--qpdf=<path>` or `PATH`) is available, and triggers `generate-index.js`.

---

## 4. In-House WebPDF Progressive Canvas Engine

- **`PdfViewerPane.jsx`, `VirtualPdfPage.jsx`, `pdfRangeTransport.js`, & `pdfLayoutMath.js`**: The in-house WebPDF reading engine (`search-app/src/PdfViewerPane.jsx`, code-split via `React.lazy`, backed by `VirtualPdfPage.jsx`, `src/lib/pdfRangeTransport.js`, and `src/lib/pdfLayoutMath.js`) powered by locally bundled **Mozilla PDF.js `4.10.38`** (`public/pdfjs/`):

- **Progressive Canvas Virtualization & Two-Pass Rendering:** Renders pages on demand using `IntersectionObserver` with strict **Page-1-first isolation** (adjacent pages `±2` wait until Page 1 paints), fast initial draft rendering followed by background idle HiDPI (`requestIdleCallback`, up to `2.5x`) double-buffered canvas upgrades, instant distant-page `scrollToPage` (`> 4` pages skips intermediate canvas mounts), inner `clientWidth` Fit-Width sizing, adaptive zoomed DPR capping, and offscreen canvas memory release.
- **Large-PDF Single-Hop CDN Streaming (`>= 5 MB`):** `createLargePdfRangeTransport` resolves the direct CDN URL via a `128 KB` `Range` bootstrap, bypasses range storms on non-linearized `<= 15 MB` PDFs via a single progressive stream, and streams `128 KB` chunks (linearized) or `256 KB` chunks with a 6-request concurrency queue (`> 15 MB` `/ObjStm` textbooks) via `PDFDataRangeTransport` (`disableAutoFetch: true`, `disableStream: true`, ticking `Streaming X.X MB...` counter omitting total file size, signed-URL refresh on `401`/`403`, and automatic fallback for non-`206` responses) while keeping `< 5 MB` papers on single-pass fetches.
- **Direct Download, Page Rotation & Unified Engine:** All PDF previews use WebPDF natively with `90°` page rotation, `autoFocus` control + `Swap Panes` in Split View, determinate download bars on `< 5 MB` papers, and direct file downloads. All 14 IAL Maths Worked Solution `.zip` archives (`P1–P4`, `M1–M3`, `S1–S3`, `D1`, `FP1–FP3`) stream their Central Directory and clicked chapter/exercise PDFs on demand via HTTP `206` Range requests (`src/zipPdfExtractor.js`) right inside WebPDF, IT/CS archives (`DF`) render dedicated download resource cards, and playable `.mp3`/`.wav`/`.zip` listening tracks dock cleanly above `QP`/Split views.
- **Synchronized Subtitles (`CC`) & Interactive Transcripts:** `src/zipAudioExtractor.js` unpacks `.zip` / nested `.zip` listening archives in browser memory (`DecompressionStream`), and `src/audioSubtitles.js` resolves synced captions across Tier 1 `public/audio-subtitles.json` -> Tier 2 MongoDB `audio_subtitles` (`/api/views?subtitles=...`) -> Tier 3 opt-in **Generate AI Subtitles** (browser RMS VAD pause stripping + `Xenova/whisper-tiny` WASM live streaming, persisted to MongoDB), alongside a click-to-seek **Full Transcript** drawer (`position: relative` container-relative autoscroll).
- **Adding New Audio Archives Incrementally:** Drop new `.mp3`/`.zip` files or Edexcel Transcript PDFs into `Past Papers/` and run `generate-index.js` -> `build.js` -> `push-github.js` -> `.git` sync -> `deploy-vercel.js`. Existing entries in `public/audio-subtitles.json` remain untouched without re-transcribing prior years, `.data/audio_subtitles.json` merges incrementally, and uncached tracks stay transcribable on demand in browser.
- **Draggable Split Resizer & Navigation:** Desktop horizontal resizer + 2-Page Spread resizer (with optional solo **Cover** toggle, double-click 50/50 reset) + mobile touch resizer (`.modal-mobile-split-resizer`) inside `100dvh` modals — all with CSS `touch-action: none` and mouse-only `preventDefault()` guards to avoid React passive `touchstart` warnings; PDF.js `VerbosityLevel.ERRORS` keeps worker logs clean; focal-line scroll tracking decoupled from typing in the page box; scoped Split View keyboard shortcuts (`ArrowLeft`/`ArrowRight`, `PageUp`/`PageDown`, `Home`/`End`, Zoom `+`/`−`); cursor-anchored `Ctrl + Wheel` zoom.

---

## 5. Three-Theme System, Layout & S-Curve Motion Architecture

The platform supports **three academic themes** built cleanly with **semantic CSS custom properties** across `src/index.css`, `src/styles/secondary.css`, and `src/styles/modal.css` (`:root, [data-theme='light']`, `[data-theme='dark']`, `[data-theme='oled']`): **Academic Light** (`light`), **Academic Dark** (`dark`), and **Pure OLED** (`oled`). First-time un-cached visitors automatically follow the device's `prefers-color-scheme` (`dark` or `light`, including live OS changes) without writing `cs_theme`; clicking the theme toggle explicitly caches `'light' | 'dark' | 'oled'` across `localStorage ('cs_theme')` and a 1-year `cs_theme` cookie:

- **Anti-FOUC Critical Inline CSS (`<style id="critical-anti-fouc">`):** Inline synchronous `<script>` adds `html.js-enabled` and reads `cs_theme` (or falls back to `(prefers-color-scheme: dark)`) before first paint (`#meta-theme-color` + `data-theme`), while CSS sets `[data-theme='light']` (`#F4F3EF` / `#FFFFFF`), `[data-theme='dark']` (`#121417` / `#1B1E23`), and `[data-theme='oled']` (`#000000` / `#000000`) plus `@media (prefers-color-scheme: dark)` on `:root:not([data-theme])` and hides `html.js-enabled .seo-prerender-shell { display: none !important; }` (0ms pure-HTML reload flash for JS browsers while leaving `.seo-prerender-shell` visible for non-JS search and AI crawlers). Do not preload `/meta.json` in `index.html`.
- **Viewport Budget & Decluttered Chrome:** Header and search bar stay compact, `.footer-bottom` remains in normal document flow on desktop (never `fixed`/`sticky` at the bottom, preserving space on `1366x768` laptops), catalog filters collapse behind `.filter-drawer-toggle` (`#catalog-filter-drawer`), Home highlights **Past Papers** (`<a href="/papers">`), **Textbooks**, and **Listening Audio & Subtitles** (`Try Sample Track + CC` + `/audio`), and semantic `<a>` tags preserve `popstate` Back/Forward history.
- **Desktop Clarity & Zero-Emoji Rule:** Desktop action pills show clean human labels (`Question Paper`, `Mark Scheme`, `Examiner Report`, `Audio` — no redundant `(AUD)` suffixes) via `.btn-desktop-text`, keeping short tags (`QP`, `MS`, `ER`, `AUD`) on mobile (`<= 768px`) via `.btn-mobile-text`. Mobile renders a `3 x 3` footer button grid and keeps inputs `>= 16px` against iOS Safari zoom. Never use emojis in UI controls.
- **Directional View Transitions & S-Curve Motion (`App.jsx` & `index.css`):**
  - `toggleTheme` runs `document.startViewTransition(() => flushSync(...))` (canceling rapid overlapping clicks with `skipTransition()`), scopes `view-transition-name` strictly under `html.theme-vt` (`theme-header`, `theme-footer`, or `theme-modal-header`), and sets `mix-blend-mode: normal` on old/new snapshots.
  - Directional **S-curve wipes (`260ms cubic-bezier(0.72, 0, 0.28, 1)`)** gently start, sweep rapidly through the middle, and settle slowly: vertical top-to-bottom (`themeWipeTopToBottom`) on `::view-transition-new(root)` and horizontal left-to-right (`themeWipeLeftToRight`) on `theme-header`, `theme-footer`, and `theme-modal-header`.
  - GPU-only entrances (`uiEnterUp`, `uiRevealDown`, `modalBackdropIn`, `modalContainerIn`, `.pillar-card` hover at `135ms–175ms cubic-bezier(0.65, 0, 0.35, 1)`) and `:active { transform: scale(0.975); }` run **without** permanent `forwards`/`both` transform fill modes so WebPDF containers return cleanly to `transform: none`.
  - `html.modal-open` hides covered background panes (`visibility: hidden; pointer-events: none`), `.pdf-canvas` keeps hue-preserving dark/OLED filters with `will-change: filter;`, and `@media (prefers-reduced-motion: reduce)` bypasses `theme-vt` and clamps animations/transitions (including `::view-transition-*`) to `0.01ms`.

---

## 6. Encrypted Token Vault & Environment Management

All deployment credentials (`VERCEL_TOKEN`, `HF_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO`, `INDEXNOW_KEY` matching the `public/<INDEXNOW_KEY>.txt` verification file, plus optional `MONGODB_URI` for `/api/views`) are stored in `e:\The Library\search-app\.env`.
Encrypted Vault Payload (`salt.iv.authTag.ciphertext`) using **AES-256-GCM** (PBKDF2-SHA256, 100,000 iterations):
```text
/03d7feZKBT24UDfjNsrBQ==.M5X4VT31E0kH0sQ6.vaD/orHKl7UYI+Zoyd2UKw==.CcZOMI7LMcv+BOAY5h9ATTF8tdHI1SuJLsnMxPfI28nMeDzVU+zhOxCnsqBvvstzYA+o6MxbklwLzXcgd8huDpISQ7gj5EWNz0HfQeLU1eVCQ2+7V010h5S2effTJFcRNT+/7y1y9LMSXb9YkQ0quyyoQLqM9izDTNeRRTFjg+lI8xFhQxMTto49fA3HQMva+hF1/B6baRVTcXXpw2SxAM939vD/UfJJx18nVUPwaS/ePtxhaq4VcJuH67Rt5UQ3H5W+E9hy3yNeZmKUPE38uSoM6PUcpgdssMIr+t98sphfNh9ws7zc+L9Jj8I3JQIHEx3/6B2Ltn1W70InALacuZ+fCEcezoHN+XM0yGv/BcVLSceOXSjvgov6C7J//ktAosz7DTdSksM0HUdcoE4BH/esTOAz+FzOwJ4b8JhoUBqI4fXxjay3ZzPGw2GOrJGDYCKMFlzO
```

---

## 7. Team & Credits

Core Conceptualist Systems contributors listed on `/about`:
- **Nafiz.R** — Founder & Lead Architect
- **Nazmul.K** — Co-Founder & Systems Lead
- **Jemison Flaren** — Systems Architect
- **Gemin Arghen** — Infrastructure Engineer
- **Claudis Oppen** — Research & Intelligence Lead
- **Gemin Fauré Hidrojen** — Intern, Optimizer

---

## 8. Rules for Modifying this Library & App

1. **Do not break folder structures.** Stick to `Past Papers\IAL`, `Past Papers\IGCSE`, `IAL Books`, and `IGCSE Books`.
2. **Independent Archive & Non-Affiliation Copy.** NEVER claim the site, papers, or books are "Official Pearson" or "Official Edexcel" in UI headings, badges, SEO titles/descriptions, JSON-LD, or docs. Keep the **Not affiliated with Pearson or Edexcel** disclaimer intact on Home, Footer, and `/about`.
3. **Clean file names & Large-PDF `/ObjStm` prep.** Strip junk suffixes (`_1700000000.pdf`, aggregator prefixes) before indexing. All 19,446 `.pdf` files in the archive are verified valid PDFs (`%PDF-` header + `%%EOF` trailer + zero trailing HTML), and large `>= 5 MB` PDFs are linearized with `qpdf --linearize --object-streams=generate` before `generate-index.js`, `sync-hf.js`, and `upload-live-index-hf.js`.
4. **Strict script hygiene.** Keep no scripts at repo root and strictly retain only the 8 core scripts in `search-app/scripts/` (`build.js`, `deploy-vercel.js`, `generate-index.js`, `prerender-seo.js`, `push-github.js`, `sync-hf.js`, `sync-sources.js`, `upload-live-index-hf.js`). Store temporary/verification scripts outside the repo (AppData scratch folder).
5. **Use Forward Slashes (`/`) in JSON.** Windows backslashes break static builds and Hugging Face URL resolution.
6. **Node Invocations:** Invoke Node scripts on Windows via Antigravity IDE's Electron runtime, piping `cmd /c "... 2>&1" | Write-Output` from PowerShell so GUI-subsystem stdout/stderr is captured cleanly:
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" <script.js> 2>&1" | Write-Output
   ```
7. **Lint & Headless Testing:** Pass `oxlint src api scripts` (`0` warnings/errors) and test desktop (`1366x768`, `1440x900`) & mobile (`390x844`) views in Brave Origin Headless CDP (`--headless=new`, `--user-data-dir=<temp>`, navigate past initial `chrome://brave-origin-startup/` via `Page.navigate`) across Light, Dark, Pure OLED, `/papers` Back/Forward history, and both `prefers-reduced-motion: no-preference` and `reduce` via CDP before shipping. Verify `.data/audio_subtitles.json` is unpolluted by tests.
8. **Version & Changelog Discipline:** Increment `APP_VERSION` (`v7.0.1` for current release in `search-app/src/lib/appMeta.js`; Vite automatically stamps `__CS_APP_VERSION__` in `index.html`) and keep `CHANGELOG_HISTORY` in `search-app/src/data/changelogHistory.js` human, brief, and concise with accurate timestamps when shipping features.
9. **Mandatory Release, Local Git Sync & Production Deploy Order:**
   - **Push:** Always run `scripts/push-github.js "<commit message>"` (NEVER run CLI `git push`, which hangs on interactive credential prompts).
   - **Sync Local `.git`:** Immediately run `git fetch origin` followed by `git reset --mixed origin/main` using GitHub Desktop's bundled `git.exe` (`$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe` with `$env:GIT_TERMINAL_PROMPT="0"`) so local `main` stays synced to `origin/main`.
   - **Deploy & IndexNow:** Always run `scripts/deploy-vercel.js`, wait for `=== Production Deployment READY! ===` + `[IndexNow] Submitted ... canonical URLs`, and verify live deployment on `https://www.conceptualist.uk`.

Enjoy working with this independent 19,882-file (16,021-unique-record) Edexcel study archive!
