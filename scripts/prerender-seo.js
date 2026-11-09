import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SITE_URL,
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  formatSubjectName,
  getUnitCodeFromLabel,
  getSeoMetadata,
  buildJsonLd
} from '../src/seoRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function collectAllRoutes(meta) {
  const routes = [];
  const seenPaths = new Set();

  const addRoute = (routeObj) => {
    if (seenPaths.has(routeObj.path)) return;
    seenPaths.add(routeObj.path);
    routes.push(routeObj);
  };

  // 1. Core Top-Level Routes
  addRoute({
    path: '/',
    priority: '1.0',
    changefreq: 'daily',
    includeInSitemap: true,
    state: { currentTab: 'library' }
  });

  addRoute({
    path: '/ial',
    priority: '0.95',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', filterCurriculum: 'Edexcel IAL' }
  });

  addRoute({
    path: '/igcse',
    priority: '0.95',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', filterCurriculum: 'Edexcel IGCSE' }
  });

  addRoute({
    path: '/textbooks',
    priority: '0.90',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', filterDocType: 'Book' }
  });

  addRoute({
    path: '/about',
    priority: '0.60',
    changefreq: 'monthly',
    includeInSitemap: true,
    state: { currentTab: 'about' }
  });

  addRoute({
    path: '/changelog',
    priority: '0.60',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'changelog' }
  });

  // 2. All Curriculum -> Subject -> Unit Routes from meta.wizard
  const curriculums = ['Edexcel IAL', 'Edexcel IGCSE'];
  for (const curr of curriculums) {
    const currSlug = getCurriculumSlug(curr);
    const subjectsMap = meta?.wizard?.[curr] || {};
    const subjectNames = Object.keys(subjectsMap).sort();

    for (const subj of subjectNames) {
      const subjSlug = getSubjectSlug(subj);
      const subjPath = `/${currSlug}/${subjSlug}`;

      addRoute({
        path: subjPath,
        priority: '0.90',
        changefreq: 'weekly',
        includeInSitemap: true,
        state: {
          currentTab: 'library',
          filterCurriculum: curr,
          filterSubject: subj
        }
      });

      const unitsMap = subjectsMap[subj]?.units || {};
      const unitNames = Object.keys(unitsMap);

      for (const unitLabel of unitNames) {
        const unitSlug = getUnitSlug(unitLabel);
        const unitPath = `/${currSlug}/${subjSlug}/${unitSlug}`;

        addRoute({
          path: unitPath,
          priority: '0.85',
          changefreq: 'weekly',
          includeInSitemap: true,
          state: {
            currentTab: 'library',
            filterCurriculum: curr,
            filterSubject: subj,
            filterUnit: unitLabel
          }
        });

        // Also pre-render direct unit-code alias paths (e.g., /ial/mathematics/wma11, /ial/mathematics/p1)
        const unitCode = getUnitCodeFromLabel(unitLabel);
        if (unitCode) {
          const codeSlug = unitCode.toLowerCase();
          const aliasPath = `/${currSlug}/${subjSlug}/${codeSlug}`;
          if (aliasPath !== unitPath) {
            addRoute({
              path: aliasPath,
              priority: '0.80',
              changefreq: 'weekly',
              includeInSitemap: false, // Canonical points to unitPath
              state: {
                currentTab: 'library',
                filterCurriculum: curr,
                filterSubject: subj,
                filterUnit: unitLabel
              }
            });
          }
        }
      }
    }
  }

  return routes;
}

function buildStaticSemanticBody(route, seo, meta) {
  const { filterCurriculum = '', filterSubject = '', filterUnit = '', currentTab = 'library' } = route.state;
  const links = [];

  if (filterSubject && filterCurriculum) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    const subjSlug = getSubjectSlug(filterSubject);
    const unitsObj = meta?.wizard?.[filterCurriculum]?.[filterSubject]?.units || {};
    for (const u of Object.keys(unitsObj)) {
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(u)}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} — ${u} Past Papers & Mark Schemes`)}</a></li>`
      );
    }
  } else if (filterCurriculum) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    const subjectsObj = meta?.wizard?.[filterCurriculum] || {};
    for (const s of Object.keys(subjectsObj).sort()) {
      links.push(
        `<li><a href="/${currSlug}/${getSubjectSlug(s)}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(s)} Past Papers & Textbooks`)}</a></li>`
      );
    }
  } else if (currentTab === 'library') {
    for (const curr of ['Edexcel IAL', 'Edexcel IGCSE']) {
      const currSlug = getCurriculumSlug(curr);
      const subjectsObj = meta?.wizard?.[curr] || {};
      for (const s of Object.keys(subjectsObj).sort()) {
        links.push(
          `<li><a href="/${currSlug}/${getSubjectSlug(s)}">${escapeHtml(`${curr} ${formatSubjectName(s)} Past Papers`)}</a></li>`
        );
      }
    }
  }

  return `<main class="seo-prerender-shell" style="max-width:1100px;margin:24px auto;padding:0 16px;font-family:system-ui,-apple-system,sans-serif;">
      <nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:12px;">
        <a href="/">Conceptualist Library Home</a>
        ${filterCurriculum ? ` / <a href="/${getCurriculumSlug(filterCurriculum)}">${escapeHtml(filterCurriculum)}</a>` : ''}
        ${filterSubject ? ` / <a href="/${getCurriculumSlug(filterCurriculum || 'Edexcel IAL')}/${getSubjectSlug(filterSubject)}">${escapeHtml(formatSubjectName(filterSubject))}</a>` : ''}
        ${filterUnit ? ` / <span>${escapeHtml(filterUnit)}</span>` : ''}
      </nav>
      <h1>${escapeHtml(seo.h1)}</h1>
      <p>${escapeHtml(seo.description)}</p>
      <p>${escapeHtml(seo.subtitle)}</p>
      <nav aria-label="Archive Navigation">
        <p>
          <a href="/ial">Edexcel IAL Past Papers</a> |
          <a href="/igcse">Edexcel IGCSE Past Papers</a> |
          <a href="/textbooks">Edexcel Textbooks &amp; Solution Banks</a> |
          <a href="/about">About Conceptualist Systems</a> |
          <a href="/changelog">Changelog</a>
        </p>
        ${links.length > 0 ? `<ul>${links.join('\n          ')}</ul>` : ''}
      </nav>
    </main>`;
}

function injectSeoIntoHtml(templateHtml, route, meta) {
  const seo = getSeoMetadata({ ...route.state, meta });
  const jsonLd = buildJsonLd({ ...route.state, seo, meta });
  const staticBody = buildStaticSemanticBody(route, seo, meta);

  let html = templateHtml;

  // Replace <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);

  // Replace meta description
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`
  );

  // Replace meta keywords
  html = html.replace(
    /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="keywords" content="${escapeHtml(seo.keywords)}" />`
  );

  // Replace canonical
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />`
  );

  // Replace OpenGraph & Twitter tags
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(seo.canonicalUrl)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`
  );

  // Inject JSON-LD before </head>
  const jsonLdScript = `  <script id="seo-json-ld" type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  </head>`;
  html = html.replace(/<\/head>/i, jsonLdScript);

  // Inject crawlable semantic HTML inside <div id="root">...</div> wrapped in <noscript>
  // This guarantees search engine crawlers receive all structured content and links,
  // while preventing any raw unstyled HTML flicker or bullet-point flash for human users during hydration.
  html = html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root"><noscript>${staticBody}</noscript></div>`
  );

  return html;
}

function generateSitemapXml(routes, lastmodDate) {
  const sitemapRoutes = routes.filter(r => r.includeInSitemap);
  const urlEntries = sitemapRoutes.map(r => {
    const loc = r.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${r.path}`;
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmodDate}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>
`;
}

function run() {
  const metaPath = path.join(PUBLIC_DIR, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    console.error('❌ public/meta.json not found. Run generate-index.js first.');
    process.exit(1);
  }

  const rawMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const meta = rawMeta.meta || rawMeta;
  const routes = collectAllRoutes(meta);
  const lastmodDate = new Date().toISOString().split('T')[0];

  // 1. Write public/sitemap.xml
  const sitemapXml = generateSitemapXml(routes, lastmodDate);
  const publicSitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml');
  fs.writeFileSync(publicSitemapPath, sitemapXml, 'utf8');
  const sitemapCount = routes.filter(r => r.includeInSitemap).length;
  console.log(`✅ Generated public/sitemap.xml with ${sitemapCount} canonical URLs.`);

  // 2. If dist/index.html exists, pre-render static HTML for all routes
  const distIndexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(distIndexPath)) {
    const templateHtml = fs.readFileSync(distIndexPath, 'utf8');

    // Copy updated sitemap.xml to dist/sitemap.xml
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');

    let prerenderedCount = 0;
    for (const route of routes) {
      const renderedHtml = injectSeoIntoHtml(templateHtml, route, meta);
      if (route.path === '/') {
        fs.writeFileSync(distIndexPath, renderedHtml, 'utf8');
        prerenderedCount++;
      } else {
        const relPath = route.path.replace(/^\/+/, '');
        const routeDir = path.join(DIST_DIR, relPath);
        fs.mkdirSync(routeDir, { recursive: true });
        fs.writeFileSync(path.join(routeDir, 'index.html'), renderedHtml, 'utf8');
        prerenderedCount++;
      }
    }
    console.log(`✅ Pre-rendered ${prerenderedCount} static HTML route pages in dist/.`);
  }
}

run();
