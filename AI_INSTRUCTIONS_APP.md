# Conceptualist Systems Library - AI Assistant Guide (App Scope)

Welcome! If you are an AI assistant working inside `e:\The Library\search-app`, read this guide before making changes. This React 19 + Vite 8 application powers `https://www.conceptualist.uk` and serves the curated Pearson Edexcel archive of **13,939 archived files** (**10,146 deduplicated unique records**) across **19 IAL** and **18 IGCSE** subjects (**28 distinct subjects**) covering **January 2003 – June 2026**.

---

## 1. Core Production Scripts (`search-app/scripts/`)

Keep `search-app/scripts/` strictly limited to these **7 core utilities** (do not leave scratch/test scripts behind):

1. **`generate-index.js`**: Scans `Past Papers/`, `IAL Books/`, and `IGCSE Books/` using `src/unitParser.js`, deduplicates variants, and outputs `public/meta.json` (`~0ms` wizard/tree bootstrap), `public/index.json` (tuple-encoded `keys` + `files`), and root `live_index.json`. Ignores `toaz.info-*` junk artifacts and merges legacy Physics `WPH07` into `WPH13`.
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

- **`src/App.jsx`**: Main single-page catalog, URL route hydration/404 recovery, client search & single-pass filters, two-stage catalog loader (`/meta.json` + `/shards/*.json` on cold landing, background/global upgrade to `/index.json` with Hugging Face fallback), `PreviewModal`, view counter hooks, About/Team roster, and live `CHANGELOG_HISTORY`.
- **`src/PdfViewerPane.jsx`**: In-house WebPDF reader powered by locally bundled **Mozilla PDF.js `4.10.38`** (`public/pdfjs/pdf.min.mjs` & `pdf.worker.min.mjs`). Features `IntersectionObserver` canvas virtualization, adaptive DPR capping & GPU texture cleanup, synchronized QP/MS Split View (horizontal desktop divider & 12px `.modal-mobile-split-resizer` on mobile), animated top linear streaming progress bar, cursor/center-anchored zoom, and direct **Download** links (native browser `builtIn` PDF iframe toggle was intentionally removed). Audio (`AUD`) and IT/CS practical archives (`DF`) render dedicated themed HTML5 audio/ZIP resource cards.
- **`src/seoRoutes.js` & `src/unitParser.js`**: Shared ISOMORPHIC helpers consumed by both browser (`src/App.jsx`) and Node build scripts (`generate-index.js`, `prerender-seo.js`).
- **`src/main.jsx`**: Mounts `<App />` alongside `@vercel/analytics/react` (`<Analytics />`) and `@vercel/speed-insights/react` (`<SpeedInsights />`).
- **`api/views.js`**: Vercel serverless endpoint managing paper popularity counters against MongoDB (`MONGODB_URI` -> `conceptualist_library.paper_views`) with a 30s per-user per-paper cooldown, 45/min IP burst limiter, 15s GET response cache, and `.data/paper_views.json` fallback.
- **`vite.config.js`**: Attaches local dev/preview middleware for `/api/views`, `/_vercel/*` stubs, and byte-range streaming of `/library-files/` directly from disk.
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

On this Windows environment, invoke Node scripts via the Antigravity IDE Electron runtime:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" <path/to/script.js>
```

**Linting (`.oxlintrc.json` — must pass with 0 warnings/errors):**
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\node_modules\oxlint\bin\oxlint" "e:\The Library\search-app\src"
```

---

## 6. Release & Changelog Protocol

1. Increment `APP_VERSION` (currently `'v5.6'`) in `src/App.jsx`.
2. Prepend a concise, accurate entry to `CHANGELOG_HISTORY` in `src/App.jsx`.
3. Lint `src/` (`oxlint`) and build + pre-render:
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\build.js"
   ```
4. Verify locally via Brave Headless CDP across desktop (`1440x900`) and mobile (`360px`/`375px`) in Light, Dark, and Pure OLED modes, then delete temporary scratch files.
5. Push via `scripts/push-github.js "<commit message>"` and deploy via `scripts/deploy-vercel.js`.
