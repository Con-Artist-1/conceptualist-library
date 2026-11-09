# Conceptualist Systems — Past Papers & Textbooks Library

A fast web application for searching, browsing, and viewing Pearson Edexcel past papers, mark schemes, examiner reports, and textbooks. The library covers International A-Level (IAL) and International GCSE (IGCSE) qualifications from 2003 through 2026.

## Features

- Fast Search: Client-side search with typo tolerance and synonym matching across all indexed documents.
- Filter and Browse: Filter papers by curriculum (IAL or IGCSE), subject, unit or paper code, and exam session.
- In-Browser PDF Viewer: Read documents directly in the browser with single-document and side-by-side split view. Split view lets students compare question papers and mark schemes side by side with an adjustable divider.
- OLED Dark Mode: Pure black dark theme with an inverted page filter that keeps graphs and diagrams legible.
- Document Pairing: Automatically links question papers with their corresponding mark schemes and examiner reports for the same exam sitting.
- Audio Support: In-browser audio playback for language listening examination tracks.
- Recent History: Keeps track of recently opened papers in local browser storage for quick access.
- Mobile and Desktop Support: Responsive layout designed for phones, tablets, and desktop screens.

## How It Works

The application runs entirely on the client side after the initial page load. It uses a two-stage data loading process to keep loading times short:

1. Initial Load: The browser first downloads a small metadata file (`public/meta.json`). This file contains the subject list, unit codes, and navigation tree, allowing the homepage and menus to display immediately.
2. Background Search Index: While the user browses, the application loads the complete document index (`public/index.json`) in the background. Once loaded, users can search through thousands of documents instantly without sending search queries to a backend server.
3. Document Viewing: PDFs are rendered on demand using a canvas-based PDF.js viewer. Pages are virtualized and only rendered when they enter the viewport, keeping memory usage low.

## Tech Stack

- React 19
- Vite
- PDF.js
- Plain CSS
- Oxlint

## Getting Started

### Prerequisites

- Node.js (version 18 or newer)
- npm

### Installation

Clone the repository and install dependencies:

```bash
cd search-app
npm install
```

### Development

Start the local development server:

```bash
npm run dev
```

Open your browser and navigate to the local address displayed in the terminal (usually `http://localhost:5173`). In development mode, the local server can serve library files directly from your workspace.

### Building for Production

Compile the production bundle and generate static SEO routes:

```bash
npm run build
```

The output will be placed in the `dist` folder.

### Previewing the Build

Preview the compiled production build locally:

```bash
npm run preview
```

### Rebuilding the Index

If you add new past papers or books to the collection, rebuild the metadata and search index files:

```bash
npm run index
```

This runs the index generation script to update `public/meta.json` and `public/index.json`, followed by the static SEO pre-renderer.

## Project Structure

- `public/`: Static files, fonts, and generated metadata (`meta.json` and `index.json`).
- `scripts/`: Utilities for index generation (`generate-index.js`), app compilation (`build.js`), and SEO route pre-rendering (`prerender-seo.js`).
- `src/`: React source code, including `App.jsx`, the custom PDF viewer (`PdfViewerPane.jsx`), and styling (`index.css`).
- `index.html`: Main HTML entry point.
- `package.json`: Project dependencies and npm scripts.
- `vite.config.js`: Vite configuration and local development file server.

## License

This project is maintained for educational purposes.
