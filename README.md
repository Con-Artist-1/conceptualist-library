# Conceptualist Systems — Edexcel Past Papers & Textbooks Library

High-speed web application powering **[conceptualist.uk](https://www.conceptualist.uk)** — a curated **100% Pearson Edexcel** library indexing **13,309 documents** (`13,238` past papers, mark schemes, examiner reports & audio resources + `71` textbooks) across **IAL** (`19` subjects) and **IGCSE** (`18` subjects) from **January 2003 – January 2026**.

## Architecture & Performance

- **Two-Stage Static Index (`0ms` First Paint)**:
  - `public/meta.json` (`~4.6 KB` Brotli): Precomputed directory tree, subject statistics, unit/paper lists, and step-by-step homepage wizard map. Hydrates synchronously from version-locked `localStorage` (`__APP_BUILD_TIME__`).
  - `public/index.json` (`~121 KB` Brotli): Full `13,309`-document index fetched asynchronously in the background for instant client-side search, synonym expansion, and companion sibling pairing (`QP` ↔ `MS` ↔ `ER`).
- **CDN Storage**: All PDFs, ZIP archives, and listening audio files are served directly from the Hugging Face dataset CDN (`Diavlon/mcmaster-docs-library`).
- **Anti-Stale Cache Control**: `vercel.json` enforces `Cache-Control: no-cache, no-store, must-revalidate` on `/` and `/index.html`, paired with build-timestamped asset and JSON cache-busting.

## Scripts

Configure your tokens in `.env` (see `.env.example`):

```bash
# 1. Regenerate public/meta.json and public/index.json from the local library
node scripts/generate-index.js

# 2. Build production bundle locally
npm run build

# 3. Deploy to Vercel production (https://www.conceptualist.uk)
node scripts/deploy-vercel.js

# 4. Sync local PDF/ZIP library with Hugging Face (Diavlon/mcmaster-docs-library)
node scripts/sync-hf.js

# 5. Push repository source & index to GitHub via GitHub REST API
node scripts/push-github.js "Commit message"
```
