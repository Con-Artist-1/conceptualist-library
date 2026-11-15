# Conceptualist Systems Library - AI Assistant Guide (App Scope)

Welcome! If you are an AI assistant working inside `e:\The Library\search-app`, read this guide before making changes. This React 19 + Vite 8 application powers `https://www.conceptualist.uk` and serves the curated Pearson Edexcel archive of **13,939 archived files** (**10,146 deduplicated unique records**) across **19 IAL** and **18 IGCSE** subjects (**28 distinct subjects**) covering **January 2003 – June 2026**.

---

## 1. Core Production Scripts (`search-app/scripts/`)

Keep `search-app/scripts/` strictly limited to these **7 core utilities** (do not leave scratch/test scripts behind):

1. **`generate-index.js`**: Scans `Past Papers/`, `IAL Books/`, and `IGCSE Books/` using `src/unitParser.js`, deduplicates variants, and outputs `public/meta.json` (`~0ms` wizard bootstrap), `public/index.json` (tuple-encoded `keys` + `files`), and root `live_index.json`. Ignores `toaz.info-*` junk artifacts and merges legacy Physics `WPH07` into `WPH13`.
2. **`build.js`**: Runs the Vite 8 production build (`dist/`) and invokes `prerender-seo.js`.
3. **`prerender-seo.js`**: Reads `meta.json` / `index.json` via shared `src/seoRoutes.js` and emits:
   - `public/sitemap.xml` & `dist/sitemap.xml` (**192 canonical URLs** including `/`, `/ial`, `/igcse`, `/textbooks`, `/textbooks/ial`, `/textbooks/igcse`, `/textbooks/<curr>/<subject>`, `/data-files`, `/audio`, `/about`, `/changelog`, and subject/unit pages).
   - **40 compact JSON route shards** in `dist/shards/` for cold-landing speed (up to 96% smaller than full `index.json`).
   - **318 pre-rendered static HTML route pages** in `dist/` (canonical URLs + unit-code aliases) with JSON-LD structured data, Open Graph `1200x630` metadata (`public/og-card.png`), legacy spec equivalents, and `<noscript>` SEO shells.
4. **`push-github.js`**: Pushes clean repository files directly to GitHub (`Con-Artist-1/conceptualist-library`) via the GitHub REST API.
5. **`deploy-vercel.js`**: Deploys `search-app` directly to Vercel Production (`prj_aoqCf7hkChGqzoRb3WGb9cf2KAgp`, team `team_34CBzFBsKwAwot7TK9eTAPj8`) and automatically verifies `https://www.conceptualist.uk/<INDEXNOW_KEY>.txt` before submitting canonical `public/sitemap.xml` URLs to **IndexNow** (`--indexnow-only` / `--skip-indexnow` supported; `"indexnow"` npm script alias in `package.json`). Note that pushing `main` on GitHub also triggers Vercel builds.
6. **`sync-hf.js`**: Syncs library documents to the Hugging Face dataset (`Diavlon/mcmaster-docs-library`).
7. **`upload-live-index-hf.js`**: Uploads root `live_index.json` to Hugging Face as a resilient client fallback.

---

## 2. Source Layout & Core Architecture

- **`src/App.jsx`**: Main single-page catalog in a centered `1280px` full-width layout (no redundant left sidebar), URL route hydration/404 recovery, client search & single-pass filters (including Exam Session filtering and Most Viewed sorting), two-stage catalog loader (`/meta.json` + `/shards/*.json` on cold landing, idle/on-demand upgrade to `/index.json` with Hugging Face fallback), `PreviewModal` (with Swap Panes, persistent Docked Audio Bar & in-browser ZIP audio player, and synchronized Subtitles `CC` + interactive Transcript drawer), view counter hooks (bottom action row on Recently Viewed cards), About/Team roster, and live `CHANGELOG_HISTORY`.
- **`src/zipAudioExtractor.js` & `src/audioSubtitles.js`**:
  - `src/zipAudioExtractor.js` unpacks `.zip` and nested `.zip` listening archives (STORE & DEFLATE via native `DecompressionStream`) directly in browser memory with zero backend extraction.
  - `src/audioSubtitles.js` implements the 3-tier Synchronized Subtitles engine: Tier 1 instant `0ms` lookup from `public/audio-subtitles.json` (official Edexcel Transcript PDFs + pre-generated Whisper tracks, preserved incrementally by `scripts/generate-index.js`), Tier 2 shared MongoDB Atlas cache (`/api/views?subtitles=...` -> `conceptualist_library.audio_subtitles`), and Tier 3 automatic browser RMS Voice Activity Detection (`detectSpeechSegments`) + `Xenova/whisper-tiny` WASM live transcription fallback for un-indexed or newly added audio files.
- **`src/PdfViewerPane.jsx`**: In-house WebPDF reader powered by locally bundled **Mozilla PDF.js `4.10.38`** (`public/pdfjs/pdf.min.mjs` & `pdf.worker.min.mjs`). Features `IntersectionObserver` canvas virtualization, synchronous `useLayoutEffect` container width measurement, Page 1 pre-mount dimension resolution & `overflow-y: scroll` stage locking to prevent loading/scroll jumpiness, double-buffered offscreen redraws, inner `clientWidth` Fit-Width sizing, `90°` page rotation, live download progress bar, `autoFocus` control, adaptive DPR capping & GPU texture cleanup, synchronized QP/MS Split View (horizontal desktop divider & 12px `.modal-mobile-split-resizer` on mobile), cursor/center-anchored zoom, and direct **Download** links (native browser `builtIn` PDF iframe toggle was intentionally removed). Standalone `.zip` audio packages (`AUD`) and IT/CS archives (`DF`) render dedicated resource cards, while playable `.mp3`/`.wav` listening tracks dock cleanly above the paper.
- **`src/seoRoutes.js` & `src/unitParser.js`**: Shared ISOMORPHIC helpers consumed by both browser (`src/App.jsx`) and Node build scripts (`generate-index.js`, `prerender-seo.js`).
- **`src/main.jsx`**: Mounts `<App />` alongside `@vercel/analytics/react` (`<Analytics />`) and `@vercel/speed-insights/react` (`<SpeedInsights />`).
- **`api/views.js`**: Vercel serverless endpoint managing paper popularity counters against MongoDB (`MONGODB_URI` -> `conceptualist_library.paper_views`) with a 30s per-user per-paper cooldown, 45/min IP burst limiter, 15s DB hydration TTL + GET `Cache-Control` (`s-maxage=15`), and `.data/paper_views.json` fallback.
- **`vite.config.js`**: Attaches local dev/preview middleware for `/api/views`, `/api/telemetry`, `/_vercel/*` stubs, `/shards/` JSON serving from `dist/shards/`, and byte-range streaming of `/library-files/` directly from disk.
- **`vercel.json`**: Enforces CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, immutable 1-year caching for `/assets/`, `/fonts/`, `/pdfjs/`, stale-while-revalidate for `/shards/`, `/index.json`, `/meta.json`, and `must-revalidate` for HTML routes.

---

## 3. Three-Theme System, Anti-FOUC & Theme Performance Rules

- **Three Supported Themes:**
  - `light` (**Academic Light**, default): `#F4F3EF` canvas, `#FFFFFF` surface, `#6F1D2B` crimson, `#C9A45C` antique gold.
  - `dark` (**Academic Dark**): `#121417` slate ground, `#1B1E23` surface, `#8C1D2F` crimson, `#D4AF37` gold; `.pdf-canvas` applies `filter: invert(92%) hue-rotate(180deg) contrast(105%) brightness(92%)`.
  - `oled` (**Pure OLED**): `#000000` ground/surface, `#FFD33D` high-contrast gold accents; `.pdf-canvas` applies `filter: invert(100%) hue-rotate(180deg) contrast(105%) brightness(95%)`.
- **Zero-Flicker Head Boot (`index.html`):** Inline `<script>` reads `cs_theme` cookie / `localStorage` before first paint, sets `data-theme`, and `<style id="critical-anti-fouc">` locks baseline colors and hides `.seo-prerender-shell`. Fonts are self-hosted variable WOFF2s in `public/fonts/`.
- **Zero-Lag PDF Theme Switching (`App.jsx`, `index.css`, `PdfViewerPane.jsx`):**
  - Theme DOM updates run in `useLayoutEffect` with `html.theme-switching` (`transition: none !important` except `.pdf-loading-bar-fill`/spinner, cleared via double `requestAnimationFrame`), eliminating multi-frame CSS transition cascades across background tables.
  - Opening `PreviewModal` sets `html.modal-open`, hiding covered `.app-container > :not(.modal-backdrop)` panes (`visibility: hidden; pointer-events: none`) to avoid hidden repaints while preserving exact scroll offsets.
  - `PdfViewerPane` is wrapped in `React.memo` and `.pdf-canvas` uses `will-change: filter;`.
- **Zero-Emoji & Mobile UI Parity:** Never use emojis in UI controls (geometric SVG/institutional labels only). Under `@media (max-width: 768px)`, footer links render as a balanced `3 x 3` button grid (leaving desktop inline footer unchanged), header buttons match crisp `34px` box geometry, modal uses `100dvh`, and inputs stay `>= 16px` to prevent iOS Safari zoom.

---

## 4. Team Roster (`src/App.jsx` — About Page)

Keep documentation and UI references aligned with all 6 core team members:
- **Diavlon** — Founder & Lead Architect
- **Naz** — Co-Founder & Systems Lead
- **Jemison Flaren** — Systems Architect
- **Gemin Arghen** — Infrastructure Engineer
- **Claudis Oppen** — Research & Intelligence Lead
- **Gemin Fauré Hidrojen** — Intern, Optimizer

---

## 5. Node Invocations & Linting

On this Windows environment (no standalone `node.exe` on `PATH`), invoke Node scripts via the Antigravity IDE Electron runtime (`v22.21.1`). When running from PowerShell, redirect stdout/stderr via `cmd /c` so output from the Electron binary is captured reliably:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" <path/to/script.js>
```

**Linting (`.oxlintrc.json` — must pass with 0 warnings/errors):**
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\node_modules\oxlint\bin\oxlint`" `"e:\The Library\search-app\src`" > %TEMP%\oxlint.txt 2>&1"; Get-Content "$env:TEMP\oxlint.txt"
```

---

## 6. Release & Changelog Protocol

1. Increment `APP_VERSION` (currently `'v6.0'`) in `src/App.jsx`.
2. Prepend a concise, accurate entry to `CHANGELOG_HISTORY` in `src/App.jsx`.
3. Lint `src/` (`oxlint`) and build + pre-render:
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\build.js"
   ```
4. Verify locally via **Brave Origin Headless** (`C:\Program Files\BraveSoftware\Brave-Origin\Application\brave.exe` with `--headless=new` + CDP WebSocket) across desktop (`1440x900`) and mobile (`390x844`) in Light, Dark, and Pure OLED modes, then remove temporary files.
5. **Push to GitHub via `scripts/push-github.js`** (NEVER run CLI `git push`, which hangs waiting on interactive credentials since `git` is not on the default system `PATH` and GitHub Desktop manages OAuth separately):
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\push-github.js`" `"<commit message>`" > %TEMP%\gh_push.txt 2>&1 & type %TEMP%\gh_push.txt"
   ```
6. **Sync local `.git` immediately after `push-github.js`** so local `main` matches `origin/main` without divergence (using GitHub Desktop's bundled `git.exe`):
   ```powershell
   $env:GIT_TERMINAL_PROMPT="0"
   $git = (Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" | Select-Object -First 1).FullName
   & $git fetch origin
   & $git reset --mixed origin/main
   ```
7. **Deploy to Vercel Production & submit IndexNow** using `scripts/deploy-vercel.js`, waiting for `=== Production Deployment READY! ===` and verifying `[IndexNow] Submitted ... canonical URLs`:
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; cmd /c "`"C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`" `"e:\The Library\search-app\scripts\deploy-vercel.js`" > %TEMP%\vercel_deploy.txt 2>&1 & type %TEMP%\vercel_deploy.txt"
   ```
