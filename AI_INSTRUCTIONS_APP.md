# Conceptualist Systems Library - AI Assistant Guide (App Scope)

Welcome! If you are an AI assistant tasked with working on the web application (`e:\The Library\search-app`), please read this document carefully before making any changes. This web app powers `https://www.conceptualist.uk` and connects to the curated Pearson Edexcel repository of **13,940 files** covering **January 2003 – June 2026**.

---

## 1. Core Production Scripts (`search-app/scripts/`)

Keep this directory clean. There are strictly 7 essential utilities:

1. **`generate-index.js`**: Generates `public/meta.json` (fast initial load) and `public/index.json` (full client search).
2. **`build.js`**: Compiles the React 19 / Vite client bundle.
3. **`prerender-seo.js`**: Generates `public/sitemap.xml` and 296 pre-rendered static route HTML pages with `<noscript>` SEO shells.
4. **`push-github.js`**: Directly pushes repository files to GitHub (`Con-Artist-1/conceptualist-library`) via GitHub REST API.
5. **`deploy-vercel.js`**: Deploys the built application to Vercel production (`prj_aoqCf7hkChGqzoRb3WGb9cf2KAgp`). Note that GitHub `main` pushes also trigger automated Vercel deployment.
6. **`sync-hf.js`**: Synchronizes library documents to Hugging Face dataset (`Diavlon/mcmaster-docs-library`).
7. **`upload-live-index-hf.js`**: Uploads `index.json` to Hugging Face.

---

## 2. Key Architecture & Anti-FOUC Rules

- **Zero Reload Flicker:** In `index.html`, an inline `<style id="critical-anti-fouc">` tag defines `:root` and `[data-theme='dark']` variables and locks `html`, `body`, and `#root` background colors before first paint.
- **Noscript SEO Fallback:** Pre-rendered route HTML injected by `prerender-seo.js` is placed inside `<noscript>`. Browsers with JavaScript enabled never render the raw bullet points or links while React hydrates.
- **Pure OLED Dark Mode:** True `#000000` black with canvas hue-rotation (`invert(100%) hue-rotate(180deg)`), zero emojis, and persistent theme cookies/localStorage.
- **In-House WebPDF Engine:** (`src/PdfViewerPane.jsx`) Lazy-rendered canvas virtualizer with synchronized split view and focal-line scroll tracking.

---

## 3. Node Invocations & Linting

On this Windows environment, invoke Node scripts using the Antigravity IDE Electron runtime:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" <path/to/script.js>
```

**Linting:**
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "search-app\node_modules\oxlint\bin\oxlint" "search-app\src"
```

---

## 4. Release & Changelog Protocol

1. Update `APP_VERSION` (e.g. `'v4.3'`) in `src/App.jsx`.
2. Add a clean, concise, unbloated entry to `CHANGELOG_HISTORY` in `src/App.jsx`.
3. Build the application and run `prerender-seo.js`:
   ```powershell
   $env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "search-app\scripts\build.js"
   ```
4. Verify with Brave Headless CDP.
5. Push to GitHub using `push-github.js`.
