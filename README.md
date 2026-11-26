# Conceptualist Systems — International Exam Past Papers & Textbooks Library

An independent, strictly international student study archive and high-speed web reader for searching, browsing, and studying **Pearson Edexcel International** (`IAL` & `IGCSE`) and **Cambridge International (CAIE)** (`AS & A Level`, `IGCSE`, and `O Level`) past papers, mark schemes, examiner reports, grade thresholds, inserts, textbooks (`154` total: `73` Edexcel + `81` Cambridge), worked solution banks, IT/CS data files, and language listening audio. The curated repository spans **78,820 archived files** (**74,958 deduplicated unique records**) across **169 international subjects** — **19 Edexcel IAL** + **43 Edexcel IGCSE** (`19,944` files / `16,083` unique, Jan 2003 – Jun 2026) and **31 Cambridge AS & A Level** + **45 Cambridge IGCSE** + **31 Cambridge O Level** (`58,876` files / `58,875` unique across all `107/107` international syllabuses, 2002 – May/June 2026) — live at `https://www.conceptualist.uk`.

> **Independent Study Archive:** Conceptualist Systems is an independent student study index and reader and is **not affiliated with, endorsed by, or sponsored by Pearson plc, Edexcel, or Cambridge University Press & Assessment (CAIE)**.

## Features

- **Isolated Multi-Board Switcher & Off-Thread Web Worker Catalog:** Dedicated header **Edexcel | Cambridge** switcher (`cs_board`) backed by board-partitioned indexes (`public/index-edexcel.json`, `public/index-cambridge.json`, plus compact `public/allowlist.json`) so switching boards is instant and zero Cambridge catalog bytes load during Edexcel sessions. Moves JSON hydration, tuple expansion, sibling pairing (`ER`/`GT`), filtering, sorting, and smart fuzzy search (`src/searchEngine.js` + `src/data/searchDictionaries.js`) onto a dedicated ES Module Web Worker (`src/workers/catalog.worker.js`), transferring only compact `<= 50`-row slices to the main thread. Supports Edexcel unit/branch disambiguation (`pure mathematics 1..4` → `WMA11..WMA14`, `M1..M3`, `S1..S3`, `D1`, `FP1..FP3`, `C1..C4`/`C12`/`C34`, `WMA11/01`, `4MA1/2HR`), Cambridge 4-digit syllabus & Paper+Variant tokens (`0625 42`, `9709 pure 1`, `4024 22`), 9–1 ↔ A\*–G equivalences (`0972` → `0625`, `0980` → `0580`), **Cross-Board Smart Nudges**, typo recovery (`Did you mean`), quoted `"exact phrases"`, `-exclusions`, and partial-match fallback.
- **In-House WebPDF Reader, Grade Thresholds (`GT`), `QP | IN` Split View & 2-Page Spreads:** Lazy-loaded canvas PDF reader (`src/PdfViewerPane.jsx`, `src/components/VirtualPdfPage.jsx`, `src/lib/pdfRangeTransport.js`, `src/lib/pdfLayoutMath.js`) powered by locally bundled Mozilla PDF.js (`4.10.38` + `168` self-hosted `.bcmap` CMap tables) featuring `IntersectionObserver` viewport virtualization, Page-1-first progressive two-pass canvas rendering, single-hop CDN byte-range streaming (`PDFDataRangeTransport`) for large PDFs (`>= 5 MB`), one-click **Grade Thresholds (`GT`)** tabs, synchronized **Split View** pairing Question Papers with either **Mark Schemes (`QP | MS`)** or **Inserts (`QP | IN`)**, resizable **2-Page Book Spread** mode with solo **Cover** offset toggle, `90°` page rotation, `Swap Panes`, `1-click Share` direct study links, and keyboard shortcuts.
- **Worked Solutions ZIP Reader & Synchronized Audio Subtitles (`CC`):**
  - Lazy-loaded **Worked Solutions ZIP viewer** (`src/components/SolutionBankView.jsx`, `src/zipPdfExtractor.js`) streams only the ZIP Central Directory via HTTP `206` Range requests and extracts clicked chapter/exercise PDFs on demand across all 14 IAL Maths Solution Banks directly inside WebPDF.
  - Lazy-loaded **Audio Player Dock & Subtitles** (`src/components/AudioPlayerDock.jsx`, `src/zipAudioExtractor.js`, `src/audioSubtitles.js`) unpacks `.zip` / nested `.zip` listening archives in browser memory via `DecompressionStream` and resolves clickable synced captions across Tier 1 sharded `public/subtitles/` (`manifest.json` with `995` keys + **9 lazy subject shards** covering **100% of all 273/273 Edexcel IAL & IGCSE listening resources** — `368` unique SHA-256 tracks & `50,888` timed segments) → Tier 2 MongoDB `audio_subtitles` cache (up to 1,200 segments / 320 KB) → Tier 3 opt-in browser adaptive RMS VAD + `Xenova/whisper-tiny` WASM live generation across 15+ exam languages. Standard Past Paper QP/MS opens fetch zero audio or Solution Bank ZIP chunks.
- **Three Academic Themes (Semantic CSS Custom Properties):** Automatically follows the visitor's OS `prefers-color-scheme` on first visit, with directional S-curve View Transitions cycling **Academic Light**, **Academic Dark** (slate charcoal), and **Pure OLED** (`#000000`), hue-preserving diagram/graph PDF canvas inversion, dual persistence (`localStorage` + 1-year cookie), and full `prefers-reduced-motion` support.
- **Canonical SEO, Route Sharding, `/llms.txt` & IndexNow:** Clean deep routes (`/ial/...`, `/igcse/...`, `/cambridge/a-level/...`, `/cambridge/igcse/...`, `/cambridge/o-level/...`, `/textbooks`, `/textbooks/edexcel`, `/textbooks/cambridge/...`, `/data-files`, `/audio`, `/about`, `/changelog`) backed by **176 compact JSON route shards**, **820 pre-rendered canonical static HTML routes + `404.html`** (with `683` permanent `308` shorthand/code redirects), `Book` + `ItemList` + `FAQPage` Schema.org JSON-LD, `public/llms.txt`, an **817-URL `sitemap.xml`**, and automated **IndexNow** URL submission on production deploys.
- **View Tracking, History & Idle Telemetry:** Serverless `/api/views` & `/api/telemetry` endpoints backed by MongoDB Atlas (shared view counters, subtitle caching, 90-day anonymized session metrics, distributed rate limits, compact `allowlist.json` validation, and local `.data/*.json` fallbacks), browser Recent History cards, idle-deferred telemetry (`src/telemetry.js`), and Vercel Web Analytics & Speed Insights.
- **Mobile & Desktop Polish:** Compact `1280px` desktop layout, collapsible lazy `FilterDrawer` (with Cambridge Variant `v1`/`v2`/`v3` & `Feb/March` filters), `100dvh` mobile reader modals, `3 × 3` mobile footer link grid, and `>= 16px` mobile inputs preventing iOS Safari zoom.

## How It Works

The frontend eliminates startup waterfalls and keeps main-thread blocking minimal:

1. **Zero-Waterfall `<head>` Early Fetch:** Strict SHA-256 CSP-hashed inline boot script starts `/meta.json?v=...` and the active route shard (or active board index) in parallel with CSS/JS downloads, with build version (`v8.3.0`) automatically synced via Vite `transformIndexHtml`.
2. **Route-Sharded Loading (`dist/shards/*.json`):** Deep subject, textbook, audio, or data-file pages across all 169 subjects hydrate immediately from compact route shards (`176` total shards).
3. **Off-Thread Partitioned Catalog Upgrade (`public/index-edexcel.json` & `public/index-cambridge.json`):** `src/workers/catalog.worker.js` fetches, caches (`cs_index_cache`), parses, and indexes only the active board's tuple-encoded catalog off the main thread (with Hugging Face `live_index.json` & `live_index_cambridge.json` fallbacks).
4. **Zero-Waste Pre-Warming & Virtualization:** `src/lib/pdfPrewarm.js` preloads lazy reader JS chunks once on first hover (zero Hugging Face traffic) and starts the clicked PDF's request only on `pointerdown`, while `VirtualPdfPage` renders visible canvases on demand and releases offscreen GPU textures.

## Tech Stack

- React 19
- Vite 8
- Mozilla PDF.js (`4.10.38` + local CMap tables)
- Plain CSS (semantic 3-theme custom properties across `index.css`, `welcome.css`, `filter-drawer.css`, `modal.css`, `secondary.css`)
- MongoDB Node Driver (`mongodb` for `/api/views` & `/api/telemetry`)
- Vercel Web Analytics & Speed Insights
- Oxlint

## Getting Started

### Prerequisites

- Node.js (version 18 or newer; or Antigravity Electron Node runtime via `ELECTRON_RUN_AS_NODE=1` on Windows)
- npm

### Installation

```bash
cd search-app
npm install
```

### Development

Start the local Vite dev server (includes `/api/views`, `/api/telemetry`, `/shards/`, and `/library-files/` disk byte-range streaming across `Past Papers/`, `IAL Books/`, `IGCSE Books/`, and `Cambridge Books/`):

```bash
npm run dev
```

### Linting

Verify code quality with Oxlint (`0` warnings/errors required across `src api scripts`):

```bash
npx oxlint src api scripts
```

### Building for Production

Compile the Vite bundle, generate `public/sitemap.xml` (`817` canonical URLs) and `public/llms.txt`, sync `683` permanent `308` shorthand/legacy redirects into `vercel.json`, create `dist/shards/` (`176` route shards), and pre-render `820` canonical HTML pages plus `404.html` into `dist/`:

```bash
npm run build
```

### Previewing the Build

Preview the compiled production bundle locally:

```bash
npm run preview
```

### Rebuilding the Index & Pre-Indexing New Audio

After adding or organizing library documents in `Past Papers/` (`IAL`, `IGCSE`, `Cambridge`), `IAL Books/`, `IGCSE Books/`, or `Cambridge Books/`, regenerate `public/meta.json`, partitioned `public/index*.json`, `public/allowlist.json`, root `live_index*.json`, and run SEO pre-renders:

```bash
npm run index
```

If new listening audio files were added, incrementally pre-index only the newly added tracks into `public/subtitles/` (skips all already-indexed SHA-256 tracks; supports `--board=edexcel|cambridge|all`, `--syllabuses=0510,...`, `--dry-run`, and `--cpu-only`):

```bash
npm run subtitles
```

### IndexNow & Environment Credentials

Deployment tokens and `INDEXNOW_KEY` live strictly locally in git-ignored `.env` (see `.env.example` for template keys; never commit credentials to the repository). Production deploys via `scripts/deploy-vercel.js` automatically verify the static key file and submit `public/sitemap.xml` URLs to IndexNow, or you can trigger a standalone ping:

```bash
npm run indexnow
```

## Project Structure

- `api/`: Vercel serverless endpoints (`views.js` for paper popularity counters; `_subtitles.js` for shared audio subtitle caching; `telemetry.js` for anonymized session metrics; `_shared.js` for MongoDB pooling, `allowlist.json` validation & distributed rate limits).
- `public/`: Static assets, self-hosted WOFF2 fonts (`fonts/`), locally bundled PDF.js + 168 CMaps (`pdfjs/`), generated multi-board catalog files (`meta.json`, `index.json`, `index-edexcel.json`, `index-cambridge.json`, `index-cie-*.json`, `allowlist.json`), sharded pre-indexed subtitles (`subtitles/manifest.json` + 9 subject shards), Open Graph card (`og-card.png`), IndexNow verification `<INDEXNOW_KEY>.txt`, `llms.txt`, `robots.txt`, and `sitemap.xml`.
- `scripts/`: Strictly the 9 core automation utilities (`generate-index.js`, `index-audio-subtitles.js`, `build.js`, `prerender-seo.js`, `push-github.js`, `deploy-vercel.js`, `sync-hf.js`, `sync-sources.js`, `upload-live-index-hf.js`).
- `src/`: Modular application source:
  - Root modules: `main.jsx`, `App.jsx`, `PdfViewerPane.jsx`, `searchEngine.js`, `seoRoutes.js`, `unitParser.js`, `bookCatalog.js`, `audioSubtitles.js`, `zipUtils.js`, `zipAudioExtractor.js`, `zipPdfExtractor.js`, `telemetry.js`, `index.css`.
  - `src/parsers/`: Board-isolated filename/path parsers (`edexcelParser.js`, `cambridgeParser.js`).
  - `src/components/`: `WelcomePage.jsx`, `Header.jsx`, `Footer.jsx`, `Breadcrumbs.jsx`, `SearchBanner.jsx`, `PaperTable.jsx`, `ArchiveContextStrip.jsx`, `CrashRecoveryScreen.jsx`, `ThemeToggleButton.jsx`, `PaperViewsCounter.jsx`, `Skeletons.jsx`, `ResourceCard.jsx`, `VirtualPdfPage.jsx`, plus lazy-loaded `PreviewModal.jsx`, `AudioPlayerDock.jsx`, `SolutionBankView.jsx`, `FilterDrawer.jsx`, `AboutPage.jsx`, `ChangelogPage.jsx`, and `NotFoundCard.jsx`.
  - `src/data/`: `boards.js`, `cambridgeCatalog.js`, `curriculumCatalog.js`, `searchDictionaries.js`, `changelogHistory.js`.
  - `src/hooks/`: `useTheme.js`, `useViewsState.js`, `useDeployRefresh.js`, `useKeyboardShortcuts.js`, `useSeoHeadSync.js`.
  - `src/lib/`: `appMeta.js`, `archiveContext.js`, `audioLifecycle.js`, `catalogClient.js`, `catalogEngine.js`, `libraryHelpers.js`, `networkUtils.js`, `paperKeys.js`, `pdfLayoutMath.js`, `pdfPrewarm.js`, `pdfRangeTransport.js`, `routeCore.js`, `unitSort.js`.
  - `src/styles/`: Lazy-loaded `welcome.css`, `filter-drawer.css`, `modal.css`, and `secondary.css`.
  - `src/workers/`: `catalog.worker.js`.
- `index.html`: Entry HTML with parallel early-fetch bootstrap (`<meta name="cs-boot">`), preloads, and `<style id="critical-anti-fouc">` for zero-flicker Light/Dark/OLED boot.
- `vercel.json`: Permanent `308` redirects (`683`), `allowlist.json` serverless bundling, strict SHA-256 CSP headers, and route cache policies.
- `vite.config.js`: Vite 8 config, automatic `__CS_APP_VERSION__` / `__CS_BUILD_TIME__` HTML stamping, and local disk streaming middleware.

## Team

- **Nafiz.R** — Founder & Lead Architect
- **Nazmul.K** — Co-Founder & Systems Lead
- **Jemison Flaren** — Systems Architect
- **Gemin Arghen** — Infrastructure Engineer
- **Claudis Oppen** — Research & Intelligence Lead
- **Gemin Fauré Hidrojen** — Intern, Optimizer

## License

This project is maintained for independent educational use.
