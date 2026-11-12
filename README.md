# Conceptualist Systems — Past Papers & Textbooks Library

A high-speed web application for searching, browsing, and viewing Pearson Edexcel past papers, mark schemes, examiner reports, textbooks, IT/CS data files, and language listening audio. The curated repository spans **13,939 archived files** (**10,146 unique documents**) across **19 IAL subjects** and **18 IGCSE subjects** covering **January 2003 – June 2026**, live at `https://www.conceptualist.uk`.

## Features

- **Fast Search & Single-Pass Filtering:** Client-side search with typo tolerance and legacy unit/specification matching (including C12/C34, WPH01–WPH07, 4WBI1/4WCH1/4WPH1, etc.), paired with single-pass filtering by curriculum (`IAL` or `IGCSE`), subject, unit/paper code, exam session, and document type.
- **In-House WebPDF Reader & Split View:** Lazy-loaded canvas PDF reader powered by Mozilla PDF.js (`4.10.38`) featuring `IntersectionObserver` viewport virtualization, adaptive DPR scaling, animated download progress tracking, direct document download links, keyboard shortcuts, and synchronized side-by-side Split View (with adjustable desktop and mobile dividers).
- **Three Academic Themes:** Instant, flicker-free cycling between **Academic Light**, **Academic Dark** (slate charcoal), and **Pure OLED** (`#000000`) with hue-preserving diagram/graph canvas inversion and dual persistence (`localStorage` + 1-year cookie).
- **Dedicated Resource Viewers:** Automatically pairs Question Papers, Mark Schemes, and Examiner Reports per exam sitting, plays `AUD` language listening MP3s via themed audio cards, and serves `DF` practical `.zip` archives on `/data-files`.
- **Canonical SEO, Route Sharding & IndexNow:** Clean deep routes (`/ial/...`, `/igcse/...`, `/textbooks/...`, `/data-files`, `/audio`, `/about`, `/changelog`) backed by **40 compact JSON route shards**, **318 pre-rendered static HTML routes**, JSON-LD schema, Open Graph preview cards, a **192-URL `sitemap.xml`**, and automated **IndexNow** URL submission on production deploys.
- **View Tracking, History & Telemetry:** Serverless `/api/views` endpoint backed by MongoDB (with per-paper cooldown, rate limiting, and local JSON fallback), browser Recent History cards, and Vercel Web Analytics & Speed Insights.
- **Mobile & Desktop Polish:** Responsive `100dvh` full-screen reader modals, `3 × 3` button navigation grid in the mobile footer, pixel-uniform headers, and `>= 16px` mobile inputs to prevent iOS Safari zoom.

## How It Works

The frontend is designed for minimal cold-load payloads and zero runtime server bottlenecks:

1. **Instant Bootstrap (`public/meta.json`):** Loads the compact subject/unit catalog and navigation tree immediately for fast first paint.
2. **Route-Sharded Loading (`dist/shards/*.json`):** Deep subject, textbook, audio, or data-file URLs fetch only their compact route shard (~4% of the full index size) in parallel with `meta.json`.
3. **Full Catalog Upgrade (`public/index.json`):** Streams the tuple-encoded deduplicated search index seamlessly in the background (with Hugging Face `live_index.json` fallback) for instant global queries.
4. **On-Demand PDF Virtualization:** PDF pages render lazily via WebPDF workers as they enter the scroll viewport and release offscreen textures to keep mobile and desktop memory bounded.

## Tech Stack

- React 19
- Vite 8
- Mozilla PDF.js (`4.10.38`)
- Plain CSS (3-theme custom properties & responsive mobile grid/modal rules)
- MongoDB Node Driver (`mongodb` for `/api/views`)
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

Start the local Vite dev server (includes `/api/views` JSON fallback and `/library-files/` disk byte-range streaming):

```bash
npm run dev
```

### Linting

Verify code quality with Oxlint (`0` warnings/errors required):

```bash
npm run lint
```

### Building for Production

Compile the Vite bundle, generate `public/sitemap.xml` (`192` URLs), create `dist/shards/` (`40` route shards), and pre-render `318` static HTML pages into `dist/`:

```bash
npm run build
```

### Previewing the Build

Preview the compiled production bundle locally:

```bash
npm run preview
```

### Rebuilding the Index

After adding or organizing library documents in `Past Papers/`, `IAL Books/`, or `IGCSE Books/`, regenerate `public/meta.json`, `public/index.json`, root `live_index.json`, and SEO pre-renders:

```bash
npm run index
```

### IndexNow & Environment Credentials

Deployment tokens and `INDEXNOW_KEY` live locally in `.env` (see `.env.example` for template keys) and are stored encrypted inside the password-protected AES-256-GCM vault in `AI_INSTRUCTIONS_LIBRARY.md`. Production deploys via `scripts/deploy-vercel.js` automatically verify the static key file and submit `public/sitemap.xml` URLs to IndexNow, or you can trigger a standalone ping:

```bash
npm run indexnow
```

## Project Structure

- `api/`: Vercel serverless function (`views.js`) for paper popularity counters.
- `public/`: Static assets, self-hosted WOFF2 fonts (`fonts/`), PDF.js runtime (`pdfjs/`), generated index/metadata (`meta.json`, `index.json`), Open Graph card (`og-card.png`), IndexNow verification `<INDEXNOW_KEY>.txt`, `robots.txt`, and `sitemap.xml`.
- `scripts/`: Core automation utilities (`generate-index.js`, `build.js`, `prerender-seo.js`, `push-github.js`, `deploy-vercel.js`, `sync-hf.js`, `upload-live-index-hf.js`).
- `src/`: Source code including `App.jsx`, lazy-loaded `PdfViewerPane.jsx`, `seoRoutes.js`, `unitParser.js`, `index.css`, and `main.jsx`.
- `index.html`: Entry HTML with preloads and `<style id="critical-anti-fouc">` for flicker-free Light/Dark/OLED boot.
- `package.json`: Project dependencies and npm scripts.
- `vercel.json`: SPA rewrites, security/CSP headers, and route cache policies.
- `vite.config.js`: Vite configuration and local disk streaming middleware.

## Team

- **Diavlon** — Founder & Lead Architect
- **Naz** — Co-Founder & Systems Lead
- **Jemison Flaren** — Systems Architect
- **Gemin Arghen** — Infrastructure Engineer
- **Claudis Oppen** — Research & Intelligence Lead
- **Gemin Fauré Hidrojen** — Intern, Optimizer

## License

This project is maintained for educational purposes.
