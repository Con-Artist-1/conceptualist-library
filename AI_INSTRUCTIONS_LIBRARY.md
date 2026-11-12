# Conceptualist Systems Library - AI Assistant Guide

Welcome! If you are an AI assistant tasked with working on the curated document repository (`e:\The Library\Past Papers`, `e:\The Library\IAL Books`, and `e:\The Library\IGCSE Books`), please read this document carefully before making any changes. This library powers the Conceptualist Systems web application (`https://www.conceptualist.uk`) and Hugging Face dataset (`Diavlon/mcmaster-docs-library`).

---

## 1. Directory Structure

The library is a curated **100% Pearson Edexcel** collection containing **13,939 archived files** (**10,146 deduplicated unique documents**) across **19 IAL subjects** and **18 IGCSE subjects** (**28 distinct subjects**) covering **January 2003 – June 2026**.

**Main Root Folders:**
1. **`Past Papers\IAL`**: Contains Pearson Edexcel International A-Level (IAL) and legacy GCE papers across 19 subjects.
2. **`Past Papers\IGCSE`**: Contains Pearson Edexcel International GCSE (9–1) and legacy papers across 18 subjects.
3. **`IAL Books`**: Contains official Edexcel IAL student textbooks, lab books, and solution banks sorted by subject.
4. **`IGCSE Books`**: Contains official Edexcel IGCSE (9–1) student textbooks sorted by subject.

**Typical Hierarchy:**
- `Past Papers \ IAL \ <Subject> \ <Unit or Year> \ <Session> \ <File.pdf>`
- `Past Papers \ IGCSE \ <Subject> \ <Year> \ <Session> \ <File.pdf>`
- `IAL Books \ <Subject> \ <Book.pdf>`
- `IGCSE Books \ <Subject> \ <Book.pdf>`

---

## 2. File Naming & Normalization Conventions

The naming conventions depend on the source batch:

- **Canonical Edexcel Format**: `[Subject]_[UnitCode]_[Year]-[Session]_[DocType].pdf` (e.g., `Math_WMA11_2024-Jan_QP.pdf`, `Biology_U3_2022-Jan_QP.pdf`).
- **AutomatePapers Format**: Retains clean official names inside `Year\Session` folders (e.g., `QP U1.pdf`, `MS U2.pdf`, `QP Paper1R.pdf`).
- **Shared Unit Normalization (`src/unitParser.js`)**: Automatically resolves legacy equivalents (including merging Physics `WPH07` cleanly into `Unit 3 (WPH13)`), snake_case dates, CamelCase audio filenames, and duplicate file paths (`altPaths`).

**Critical Rule:** All raw scraper timestamp suffixes (e.g., `_1700000000.pdf`) have been strictly stripped from the repository. `generate-index.js` also excludes known third-party `toaz.info-*` watermark artifacts. **Do not introduce files with raw timestamp suffixes or watermarks.**

---

## 3. Web Application, Route Sharding & Indexing

The front-end application (React 19 + Vite 8 + Vercel Web Analytics & Speed Insights + MongoDB view counter `/api/views`) located at `e:\The Library\search-app` uses multi-stage static data loading:
- `public/meta.json`: High-speed compact metadata & tree for `0ms` initial UI hydration.
- `dist/shards/*.json`: **40 compact route shards** loaded in parallel with `meta.json` on cold landing pages (up to 96% smaller than full index payloads).
- `public/index.json`: Tuple-encoded (`keys` + `files`) deduplicated global catalog loaded on demand / background upgrade, with Hugging Face `live_index.json` fallback.

**Core Production Scripts (`search-app/scripts/`):**
The scripts directory contains strictly **7 essential utilities**. Do not leave temporary or scratch scripts behind.

1. **Rebuild Metadata & Search Index (updates `public/meta.json`, `public/index.json`, and root `live_index.json`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\generate-index.js"
   ```
2. **Vite Production Build & SEO Pre-Render (`dist/`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\build.js"
   ```
3. **SEO Sitemap, Route Shards & Static HTML Pre-rendering (`192` sitemap URLs, `40` shards, `318` HTML routes):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\prerender-seo.js"
   ```
4. **Push Web App to GitHub (`Con-Artist-1/conceptualist-library`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\push-github.js" "<commit message>"
   ```
5. **Deploy to Vercel Production (`https://www.conceptualist.uk`) & IndexNow Ping:**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\deploy-vercel.js"
   ```
   *(Automatically verifies `https://www.conceptualist.uk/<INDEXNOW_KEY>.txt` once READY and submits all canonical `public/sitemap.xml` URLs to `api.indexnow.org`; supports `--indexnow-only` / `--skip-indexnow` and `npm run indexnow`. Pushing `main` on GitHub also triggers Vercel builds.)*
6. **Sync Library Files to Hugging Face (`Diavlon/mcmaster-docs-library`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\sync-hf.js"
   ```
7. **Upload Live Index to Hugging Face:**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\upload-live-index-hf.js"
   ```

---

## 4. In-House WebPDF Progressive Canvas Engine

The application features an in-house PDF reading engine (`search-app/src/PdfViewerPane.jsx`, code-split via `React.lazy`) powered by locally bundled **Mozilla PDF.js `4.10.38`** (`public/pdfjs/`):

- **Progressive Canvas Virtualization:** Renders pages on demand using `IntersectionObserver` with skeleton shimmer fallbacks, adaptive zoomed DPR capping, and offscreen canvas memory release across 100+ page booklets and mobile devices.
- **Direct Download & Unified Engine:** All PDF previews use WebPDF natively (the legacy native browser `builtIn` PDF toggle has been retired, and header links trigger direct downloads). Animated top linear progress bar tracks streaming document downloads.
- **Audio & Data File Resource Cards:** Language listening `AUD` tracks render an HTML5 `<audio>` card player, while `DF` archives (`.zip` IT & CS practical exam data files) render direct download cards matching all themes.
- **Draggable Split Resizer:**
  - **Desktop:** Horizontal resizer bar separating paired Question Paper and Mark Scheme panes with live dragging and double-click 50/50 reset.
  - **Mobile:** Dedicated 12px vertical touch resizer bar (`.modal-mobile-split-resizer`) inside `100dvh` full-screen flex modals.
- **Reliable Page Navigation & Precision Zoom:**
  - Focal-line scroll tracking (`scrollTop + clientHeight * 0.35`) decoupled from typing in the page input box; monotonic prev/next navigation.
  - Scoped Split View keyboard shortcuts (`ArrowLeft`/`ArrowRight`, `PageUp`/`PageDown`, `Home`/`End`, Zoom `+`/`−`).
  - Viewport-center button zoom and cursor-anchored `Ctrl + Wheel` zoom.

---

## 5. Three-Theme System & Anti-FOUC Architecture

The platform supports **three curated academic themes** cycled seamlessly via SVG controls: **Academic Light** (`light`, default), **Academic Dark** (`dark`), and **Pure OLED** (`oled`):

- **Clean Session Default & Dual Persistence:** Fresh visitors default to **Academic Light**. User selection writes to both `localStorage ('cs_theme')` and a 1-year cookie (`cs_theme=<theme>; max-age=31536000; path=/; SameSite=Lax`).
- **Anti-FOUC Critical Inline CSS (`<style id="critical-anti-fouc">`):**
  - An inline `<head>` script and style block in `index.html` set `[data-theme='light']` (`#F4F3EF` / `#FFFFFF`), `[data-theme='dark']` (`#121417` / `#1B1E23`), and `[data-theme='oled']` (`#000000` / `#000000`) immediately before first paint and hide SSR fallback containers (`.seo-prerender-shell { display: none !important; }`).
- **Instant Zero-Lag PDF Theme Switching:**
  - `App.jsx` coordinates `data-theme` updates synchronously inside `useLayoutEffect` with `html.theme-switching` suppressing cross-DOM CSS transitions for the single swap frame, hides covered background shell nodes via `html.modal-open` (`visibility: hidden; pointer-events: none` while preserving scroll positions), GPU-promotes `.pdf-canvas` (`will-change: filter`), and memoizes `PdfViewerPane` via `React.memo`.
- **Hue-Preserving PDF Canvas Inversion:**
  - `dark` (`[data-theme='dark'] .pdf-canvas`): `filter: invert(92%) hue-rotate(180deg) contrast(105%) brightness(92%); background-color: #121417 !important;`
  - `oled` (`[data-theme='oled'] .pdf-canvas`): `filter: invert(100%) hue-rotate(180deg) contrast(105%) brightness(95%); background-color: #000000 !important;`
- **High-Contrast Color System & Mobile Parity:**
  - Action badges: Question Paper (`Deep Slate Charcoal #2B303A` light / `#79B8FF` badges dark), Mark Scheme (`Collegiate Gold #8C651E` / `#7EE787` dark badges), Examiner Reports (`#FFD33D`), Books (`#FF758F`).
  - Mobile (`@media (max-width: 768px)`) formats the 9 global footer links into a clean `3 x 3` button grid across Light, Dark, and OLED while keeping the desktop footer inline.
- **Zero-Emoji Rule:** All controls must use geometric SVG icons or institutional text. No emojis.

---

## 6. Encrypted Token Vault & Environment Management

All deployment credentials (`VERCEL_TOKEN`, `HF_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO`, `INDEXNOW_KEY` matching the `public/<INDEXNOW_KEY>.txt` verification file, plus optional `MONGODB_URI` for `/api/views`) are stored in `e:\The Library\search-app\.env`.
Encrypted Vault Payload (`salt.iv.authTag.ciphertext`) using **AES-256-GCM** (PBKDF2-SHA256, 100,000 iterations):
```text
M0rVF6hL8kSBZKddZZFsVw==.6U6izizH0zJXshHE.B0u2YJezMhxxSX+/Ba1IPA==.swY7bDh/CD67V5IOng2VkA4w4FsFfdO+rAFDkiiMIKihGXTC47sf9jlr1AonTYHYU3UDGYnEhZu05JkzbC92IK/q/VfMmP8iSU2Za3T4Gdk25v7vgbgJEOHtdLjyKu1Ox5SZUegQ1StaN/mAbgNDGe1h7Mis8+WT95hBXxZBdy6Ifrxhjju3Vfv7MVRlLlv0c4N9eBNa0eQgj8rH4U8CGji1BLeSoLWB4cPUHOJWest/KnTH0Dayv0CnEHm1/RjTBsa9LuN/n0/h3rcpaFriVStPDNIHbuHfwg8CX+BZE8sXFDmkB4YCd3Iul9hdMMhQoRByyAx9muyslDIrNo2y/TaLdAOfHRAnfLN+5XVOCyoMWgH98PQSnjmJl0BqR+7LyAT38g==
```

---

## 7. Team & Credits

Core Conceptualist Systems contributors listed on `/about`:
- **Diavlon** — Founder & Lead Architect
- **Naz** — Co-Founder & Systems Lead
- **Jemison Flaren** — Systems Architect
- **Gemin Arghen** — Infrastructure Engineer
- **Claudis Oppen** — Research & Intelligence Lead
- **Gemin Fauré Hidrojen** — Intern, Optimizer

---

## 8. Rules for Modifying this Library & App

1. **Do not break folder structures.** Stick to `Past Papers\IAL`, `Past Papers\IGCSE`, `IAL Books`, and `IGCSE Books`.
2. **Clean file names.** Strip junk suffixes (`_1700000000.pdf`, aggregator prefixes) before indexing.
3. **Strict script hygiene.** Keep no scripts at repo root and strictly retain only the 7 core scripts in `search-app/scripts/`. Remove any temporary scripts immediately.
4. **Use Forward Slashes (`/`) in JSON.** Windows backslashes break static builds and Hugging Face URL resolution.
5. **Node Invocations:** Invoke Node on Windows via:
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" <script.js>
   ```
6. **Lint & Headless Testing:** Pass `oxlint` (`0` warnings/errors) and test desktop & mobile views in Brave Headless CDP across Light, Dark, and Pure OLED before deploying.
7. **Version & Changelog Discipline:** Increment `APP_VERSION` and add a concise entry to `CHANGELOG_HISTORY` in `search-app/src/App.jsx` before shipping.
8. **Production Discipline:** After local verification, push via `push-github.js` and verify live deployment on `https://www.conceptualist.uk`.

Enjoy working with this curated 13,939-file (10,146-unique-record) Edexcel repository!
