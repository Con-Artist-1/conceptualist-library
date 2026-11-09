# Conceptualist Systems Library - AI Assistant Guide

Welcome! If you are an AI assistant tasked with working on this directory (`e:\The Library\Past Papers`, `e:\The Library\IAL Books`, and `e:\The Library\IGCSE Books`), please read this document carefully before making any changes. This library powers the Conceptualist Systems web application (`https://www.conceptualist.uk`) and Hugging Face dataset (`Diavlon/mcmaster-docs-library`).

---

## 1. Directory Structure

The library is a curated **100% Pearson Edexcel** collection containing **13,940 files** covering **January 2003 – June 2026**.

**Main Root Folders:**
1. **`Past Papers\IAL`**: Contains Pearson Edexcel International A-Level (IAL) and legacy GCE papers across 19 subjects.
2. **`Past Papers\IGCSE`**: Contains Pearson Edexcel International GCSE papers across 18 subjects.
3. **`IAL Books`**: Contains official Edexcel IAL student textbooks, lab books, and solution banks sorted by subject.
4. **`IGCSE Books`**: Contains official Edexcel IGCSE (9–1) student textbooks sorted by subject.

**Typical Hierarchy:**
- `Past Papers \ IAL \ <Subject> \ <Unit or Year> \ <Session> \ <File.pdf>`
- `Past Papers \ IGCSE \ <Subject> \ <Year> \ <Session> \ <File.pdf>`
- `IAL Books \ <Subject> \ <Book.pdf>`
- `IGCSE Books \ <Subject> \ <Book.pdf>`

---

## 2. File Naming Conventions

The naming conventions depend on the source batch:

- **Canonical Edexcel Format**: `[Subject]_[UnitCode]_[Year]-[Session]_[DocType].pdf` (e.g., `Math_WMA11_2024-Jan_QP.pdf` or `Biology_U3_2022-Jan_QP.pdf`).
- **AutomatePapers Format**: Retains clean official names inside `Year\Session` folders (e.g., `QP U1.pdf`, `MS U2.pdf`, `QP Paper1R.pdf`).

**Critical Rule:** All raw scraper timestamp suffixes (e.g., `_1700000000.pdf`) have been strictly stripped from the repository. **Do not introduce files with raw timestamp suffixes.**

---

## 3. Web Application & Indexing

The front-end web application (React 19 + Vite) located at `e:\The Library\search-app` uses a two-stage static index:
- `public/meta.json`: High-speed compact index for `0ms` initial tree/subject hierarchy render.
- `public/index.json`: Full client-side searchable past paper index.

**Core Production Scripts (`search-app/scripts/`):**
The scripts directory contains strictly 7 essential utilities. Do not leave temporary or scratch scripts behind.

1. **Rebuild Metadata & Search Index:**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\generate-index.js"
   ```
2. **Vite Application Build:**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\build.js"
   ```
3. **SEO Sitemap & Route Pre-rendering (with Anti-FOUC noscript wrapper):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\prerender-seo.js"
   ```
4. **Push Web App to GitHub (`Con-Artist-1/conceptualist-library`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\push-github.js" "<commit message>"
   ```
5. **Deploy to Vercel Production (`https://www.conceptualist.uk`):**
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\deploy-vercel.js"
   ```
   *(Note: Production Vercel is connected directly to the GitHub repo; pushing to `main` also triggers automated deployment).*
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

The application features an in-house high-performance PDF reading engine (`search-app/src/PdfViewerPane.jsx`) powered by Mozilla PDF.js v4:

- **Progressive Canvas Virtualization:** Renders pages on demand using `IntersectionObserver` with skeleton shimmer fallbacks, maintaining 60 FPS scrolling and low memory usage across 100+ page booklets.
- **Draggable Split Resizer:**
  - **Desktop:** Horizontal resizer bar with live dragging and double-click 50/50 reset.
  - **Mobile:** Dedicated 12px vertical touch resizer bar (`.modal-mobile-split-resizer`) with high-contrast grip.
- **Reliable Page Navigation:**
  - Page tracking uses a focal-line scroll listener (`scrollTop + clientHeight * 0.35`) decoupled from canvas virtualization.
  - Navigation forward (`›`) and backward (`‹`) traverses monotonically (`1 -> 2 -> 3 -> 4`) without backward jumping.
- **Precision Zoom Anchoring:**
  - Button zoom (`+`, `−`, `Fit`): Anchors synchronously to viewport center (`clientWidth / 2`, `clientHeight / 2`).
  - Wheel zoom (`Ctrl + Scroll`): Anchors directly to the mouse cursor position via fractional coordinate normalization.

---

## 5. Pure OLED Dark Mode & Anti-FOUC Architecture

The platform supports both **Academic Light Mode** (default) and **Pure OLED Dark Mode** (`#000000` true black):

- **Clean Session Default:** Fresh visitors strictly default to **Academic Light Mode**.
- **1-Year Cookie & LocalStorage Dual Persistence:**
  - Theme choices are written to both `localStorage.setItem('cs_theme', theme)` and a 1-year browser cookie:
    `document.cookie = 'cs_theme=' + theme + '; max-age=31536000; path=/; SameSite=Lax'`
- **Anti-FOUC Critical Inline CSS (`<style id="critical-anti-fouc">`):**
  - An inline style block immediately in `<head>` sets `:root` and `[data-theme='dark']` baseline variables, immediately locks `html`, `body`, and `#root` background colors (`#F2F1ED` in light mode, `#000000` in dark mode), and hides any raw SSR shells (`.seo-prerender-shell { display: none !important; }`).
  - This eliminates raw HTML reload flashes and dark-mode white screen flashes.
- **Noscript SEO Wrapper:**
  - Fallback SEO pre-rendered content is strictly placed inside `<noscript>` in `dist/` HTML pages. Browsers with JavaScript skip it entirely during hydration, while search engine crawlers index every paper route.
- **Hue-Preserving PDF Canvas Inversion (`shivaprsd/doqment` Model):**
  - Applied filter:
    ```css
    [data-theme='dark'] .pdf-canvas {
      filter: invert(100%) hue-rotate(180deg) contrast(105%) brightness(95%);
      background-color: #000000 !important;
    }
    ```
  - Flips paper white `#FFFFFF` into pitch black `#000000` while rotating the hue 180° back to the original spectrum, preserving diagrams, graphs, charts, and markings.
- **High-Contrast, Eye-Friendly Colors:**
  - All dark surfaces use pure `#000000` or subtle `#080808`–`#0E0E0E`.
  - Headings and titles use crisp `#FFFFFF`.
  - Subtitles, summaries, and text use `#CBD5E1` / `#E2E8F0`.
  - Badges: Question Paper (`#79B8FF`), Mark Scheme (`#7EE787`), Examiner Report (`#FFD33D`), Regional (`#FFD33D`), Books (`#FF758F`).
- **Zero-Emoji Rule:** All theme buttons and controls must use geometric SVG icons or institutional text. No emojis.

---

## 6. Encrypted Token Vault & Environment Management

All deployment credentials (`VERCEL_TOKEN`, `HF_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_REPO`) are stored in `e:\The Library\search-app\.env`.
Encrypted Vault Payload (`salt.iv.authTag.ciphertext`) using **AES-256-GCM** (PBKDF2-SHA256, 100,000 iterations):
```text
M0rVF6hL8kSBZKddZZFsVw==.6U6izizH0zJXshHE.B0u2YJezMhxxSX+/Ba1IPA==.swY7bDh/CD67V5IOng2VkA4w4FsFfdO+rAFDkiiMIKihGXTC47sf9jlr1AonTYHYU3UDGYnEhZu05JkzbC92IK/q/VfMmP8iSU2Za3T4Gdk25v7vgbgJEOHtdLjyKu1Ox5SZUegQ1StaN/mAbgNDGe1h7Mis8+WT95hBXxZBdy6Ifrxhjju3Vfv7MVRlLlv0c4N9eBNa0eQgj8rH4U8CGji1BLeSoLWB4cPUHOJWest/KnTH0Dayv0CnEHm1/RjTBsa9LuN/n0/h3rcpaFriVStPDNIHbuHfwg8CX+BZE8sXFDmkB4YCd3Iul9hdMMhQoRByyAx9muyslDIrNo2y/TaLdAOfHRAnfLN+5XVOCyoMWgH98PQSnjmJl0BqR+7LyAT38g==
```

---

## 7. Rules for Modifying this Library & App

1. **Do not break folder structures**. Stick to `Past Papers\IAL`, `Past Papers\IGCSE`, `IAL Books`, and `IGCSE Books`.
2. **Clean file names**. Ensure all newly downloaded files are stripped of junk suffixes before moving them into the main library.
3. **No Scripts at Root or Junk Scripts in search-app/scripts/**. Keep only the 7 core production scripts. Clean up any temporary or test scripts immediately after use.
4. **Use Forward Slashes (`/`) in JSON**. Windows backslashes (`\`) break during Vite's static file copying and URL resolution.
5. **Node Invocations**: On this Windows machine, invoke Node via:
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" <script.js>
   ```
6. **Brave Headless Testing**: Always test UI changes against Brave Headless via CDP before shipping to production.
7. **Version & Changelog Discipline**: Whenever shipping updates, increment `APP_VERSION` and add a clean, unbloated entry to `CHANGELOG_HISTORY` in `search-app/src/App.jsx`.
8. **Production Discipline**: After verifying builds locally, run `push-github.js` to trigger Vercel deployment and keep source control in sync.

Enjoy working with this curated 13,940-document Edexcel repository!
