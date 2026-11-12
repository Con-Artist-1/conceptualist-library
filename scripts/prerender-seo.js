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
  getLegacyEquivalentsForState,
  inferCurriculumForSubject,
  getSeoMetadata,
  buildJsonLd
} from '../src/seoRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const DOC_TYPE_HUMAN = {
  QP: 'Question Paper (QP)',
  MS: 'Mark Scheme (MS)',
  ER: 'Examiner Report (ER)',
  Book: 'Student Textbook PDF',
  SOL: 'Worked Solution Bank',
  AUD: 'Listening Audio (MP3)',
  DF: 'Practical Data Files',
  SC: 'Source Booklet',
  SAM: 'Sample Assessment Material'
};

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

function unpackIndexFile(rawIndex) {
  if (!rawIndex || !Array.isArray(rawIndex.files)) {
    return { keys: [], rawTuples: [], items: [] };
  }
  const keys = Array.isArray(rawIndex.keys) ? rawIndex.keys : [];
  const rawTuples = rawIndex.files;
  const items = new Array(rawTuples.length);
  for (let i = 0; i < rawTuples.length; i++) {
    const arr = rawTuples[i];
    const obj = {};
    for (let j = 0; j < keys.length; j++) {
      obj[keys[j]] = arr[j];
    }
    obj.curriculum = (obj.spec === 'IGCSE' || obj.category === 'IGCSE Books') ? 'Edexcel IGCSE' : 'Edexcel IAL';
    items[i] = obj;
  }
  return { keys, rawTuples, items };
}

function buildIndexLookup(items) {
  const byCurrSubj = new Map();
  const booksByCurrSubj = new Map();
  const booksAll = [];
  const dfAll = [];
  const audioAll = [];

  for (const item of items) {
    const curr = item.curriculum;
    const key = `${curr}::${item.subject || ''}`;
    if (!byCurrSubj.has(key)) byCurrSubj.set(key, []);
    byCurrSubj.get(key).push(item);

    const isBook = item.category === 'Books' || item.category === 'IAL Books' || item.category === 'IGCSE Books';
    if (isBook) {
      booksAll.push(item);
      if (!booksByCurrSubj.has(key)) booksByCurrSubj.set(key, []);
      booksByCurrSubj.get(key).push(item);
    }
    if (item.docType === 'DF') dfAll.push(item);
    if (item.docType === 'AUD') audioAll.push(item);
  }

  return { byCurrSubj, booksByCurrSubj, booksAll, dfAll, audioAll };
}

function writeDistShards(rawIndex) {
  const shardsDir = path.join(DIST_DIR, 'shards');
  fs.mkdirSync(shardsDir, { recursive: true });
  const { keys, rawTuples, items } = unpackIndexFile(rawIndex);
  const shardMeta = {
    generatedAt: rawIndex.meta?.generatedAt || '',
    uniqueFiles: rawIndex.meta?.uniqueFiles || items.length,
    isShard: true
  };

  const buckets = new Map();
  const pushToBucket = (shardName, tuple) => {
    if (!buckets.has(shardName)) buckets.set(shardName, []);
    buckets.get(shardName).push(tuple);
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tuple = rawTuples[i];
    const curr = inferCurriculumForSubject(item.subject, item.curriculum);
    const currSlug = getCurriculumSlug(curr);
    const subjSlug = getSubjectSlug(item.subject);
    if (currSlug && subjSlug) {
      pushToBucket(`${currSlug}-${subjSlug}.json`, tuple);
    }
    if (item.category === 'Books' || item.category === 'IAL Books' || item.category === 'IGCSE Books') {
      pushToBucket('textbooks.json', tuple);
    }
    if (item.docType === 'DF') {
      pushToBucket('data-files.json', tuple);
    }
    if (item.docType === 'AUD') {
      pushToBucket('audio.json', tuple);
    }
  }

  for (const [shardName, tuples] of buckets.entries()) {
    const payload = JSON.stringify({ keys, meta: shardMeta, files: tuples });
    fs.writeFileSync(path.join(shardsDir, shardName), payload, 'utf8');
  }
  return buckets.size;
}

function collectAllRoutes(meta, indexLookup) {
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
    path: '/textbooks/ial',
    priority: '0.85',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', filterCurriculum: 'Edexcel IAL', filterDocType: 'Book' }
  });

  addRoute({
    path: '/textbooks/igcse',
    priority: '0.85',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', filterCurriculum: 'Edexcel IGCSE', filterDocType: 'Book' }
  });

  addRoute({
    path: '/data-files',
    priority: '0.85',
    changefreq: 'monthly',
    includeInSitemap: true,
    state: { currentTab: 'library', filterDocType: 'DF' }
  });

  addRoute({
    path: '/audio',
    priority: '0.85',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', filterDocType: 'AUD' }
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

  // 2. Per-Subject Textbooks & Solution Bank Routes
  if (indexLookup?.booksByCurrSubj) {
    const sortedBookKeys = [...indexLookup.booksByCurrSubj.keys()].sort();
    for (const key of sortedBookKeys) {
      const [curr, subj] = key.split('::');
      if (!curr || !subj) continue;
      const currSlug = getCurriculumSlug(curr);
      const subjSlug = getSubjectSlug(subj);
      addRoute({
        path: `/textbooks/${currSlug}/${subjSlug}`,
        priority: '0.85',
        changefreq: 'monthly',
        includeInSitemap: true,
        state: {
          currentTab: 'library',
          filterCurriculum: curr,
          filterSubject: subj,
          filterDocType: 'Book'
        }
      });
    }
  }

  // 3. All Curriculum -> Subject -> Unit Routes from meta.wizard
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

function groupSittingsForHtml(items, limit = 80) {
  const sittingMap = new Map();
  for (const item of items) {
    const key = `${item.session || item.year || item.name}|${item.variant || ''}|${item.cleanUnitLabel || ''}`;
    let grp = sittingMap.get(key);
    if (!grp) {
      grp = {
        sortKey: Number(item.sortKey) || (Number(item.year) || 0) * 100,
        session: item.session || (item.year ? `Year ${item.year}` : item.name),
        variant: item.variant || '',
        unitLabel: item.cleanUnitLabel || item.unitCode || '',
        docTypes: new Set(),
        names: []
      };
      sittingMap.set(key, grp);
    }
    if (item.docType) grp.docTypes.add(item.docType);
    if (item.name) grp.names.push(item.name);
  }
  return [...sittingMap.values()]
    .sort((a, b) => b.sortKey - a.sortKey || a.session.localeCompare(b.session))
    .slice(0, limit);
}

function buildStaticSemanticBody(route, seo, meta, indexLookup) {
  const {
    filterCurriculum = '',
    filterSubject = '',
    filterUnit = '',
    filterDocType = null,
    currentTab = 'library'
  } = route.state;
  const links = [];
  const itemEntries = [];
  const legacyNote = getLegacyEquivalentsForState({ filterCurriculum, filterSubject, filterUnit });

  if (filterDocType === 'Book') {
    let bookItems = indexLookup?.booksAll || [];
    if (filterCurriculum) {
      bookItems = bookItems.filter(b => b.curriculum === filterCurriculum);
    }
    if (filterSubject) {
      bookItems = bookItems.filter(b => b.subject === filterSubject);
    }
    for (const book of bookItems) {
      const label = DOC_TYPE_HUMAN[book.docType] || 'Textbook PDF';
      const subjLabel = `${book.curriculum} ${formatSubjectName(book.subject)}`;
      itemEntries.push(`<li><strong>${escapeHtml(book.name)}</strong> — ${escapeHtml(subjLabel)} (${escapeHtml(label)})</li>`);
    }
    if (indexLookup?.booksByCurrSubj) {
      for (const key of [...indexLookup.booksByCurrSubj.keys()].sort()) {
        const [bCurr, bSubj] = key.split('::');
        links.push(
          `<li><a href="/textbooks/${getCurriculumSlug(bCurr)}/${getSubjectSlug(bSubj)}">${escapeHtml(`${bCurr} ${formatSubjectName(bSubj)} Textbooks & Solutions`)}</a></li>`
        );
      }
    }
    if (filterSubject && filterCurriculum) {
      links.unshift(
        `<li><a href="/${getCurriculumSlug(filterCurriculum)}/${getSubjectSlug(filterSubject)}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} Past Papers & Mark Schemes`)}</a></li>`
      );
    }
  } else if (filterDocType === 'DF') {
    const dfItems = [...(indexLookup?.dfAll || [])].sort((a, b) => (Number(b.sortKey) || 0) - (Number(a.sortKey) || 0));
    for (const item of dfItems) {
      const unitTxt = item.cleanUnitLabel || item.unitCode || '';
      const sessTxt = item.session || (item.year ? String(item.year) : '');
      itemEntries.push(
        `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.curriculum)} ${escapeHtml(formatSubjectName(item.subject))}${unitTxt ? ` (${escapeHtml(unitTxt)})` : ''}${sessTxt ? ` — ${escapeHtml(sessTxt)}` : ''}</li>`
      );
    }
  } else if (filterDocType === 'AUD') {
    const audItems = [...(indexLookup?.audioAll || [])].sort((a, b) => (Number(b.sortKey) || 0) - (Number(a.sortKey) || 0));
    for (const item of audItems) {
      const unitTxt = item.cleanUnitLabel || item.unitCode || '';
      const sessTxt = item.session || (item.year ? String(item.year) : '');
      itemEntries.push(
        `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.curriculum)} ${escapeHtml(formatSubjectName(item.subject))}${unitTxt ? ` (${escapeHtml(unitTxt)})` : ''}${sessTxt ? ` — ${escapeHtml(sessTxt)} Listening Audio (MP3)` : ''}</li>`
      );
    }
  } else if (filterSubject && filterCurriculum && filterUnit) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    const subjSlug = getSubjectSlug(filterSubject);
    const unitSlug = getUnitSlug(filterUnit);
    const subjItems = indexLookup?.byCurrSubj?.get(`${filterCurriculum}::${filterSubject}`) || [];
    const unitItems = subjItems.filter(it => it.cleanUnitLabel === filterUnit);
    for (const grp of groupSittingsForHtml(unitItems, 90)) {
      const dtLabels = ['QP', 'MS', 'ER', 'SC', 'AUD', 'DF', 'SAM', 'SOL']
        .filter(t => grp.docTypes.has(t))
        .map(t => DOC_TYPE_HUMAN[t] || t);
      const variantTxt = grp.variant ? ` (${grp.variant})` : '';
      itemEntries.push(
        `<li><strong>${escapeHtml(grp.session)}${escapeHtml(variantTxt)}</strong> — ${escapeHtml(filterSubject)} ${escapeHtml(filterUnit)}: ${escapeHtml(dtLabels.join(', '))}</li>`
      );
    }
    const years = meta?.wizard?.[filterCurriculum]?.[filterSubject]?.units?.[filterUnit]?.years || [];
    for (const yr of years.slice(0, 12)) {
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}/${unitSlug}?year=${yr}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} ${filterUnit} (${yr})`)}</a></li>`
      );
    }
    if (indexLookup?.booksByCurrSubj?.has(`${filterCurriculum}::${filterSubject}`)) {
      links.push(
        `<li><a href="/textbooks/${currSlug}/${subjSlug}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} Textbooks & Solutions`)}</a></li>`
      );
    }
  } else if (filterSubject && filterCurriculum) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    const subjSlug = getSubjectSlug(filterSubject);
    const unitsObj = meta?.wizard?.[filterCurriculum]?.[filterSubject]?.units || {};
    for (const u of Object.keys(unitsObj)) {
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(u)}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} — ${u} Past Papers & Mark Schemes`)}</a></li>`
      );
    }
    if (indexLookup?.booksByCurrSubj?.has(`${filterCurriculum}::${filterSubject}`)) {
      links.push(
        `<li><a href="/textbooks/${currSlug}/${subjSlug}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} Textbooks & Solutions`)}</a></li>`
      );
    }
    const subjItems = indexLookup?.byCurrSubj?.get(`${filterCurriculum}::${filterSubject}`) || [];
    for (const grp of groupSittingsForHtml(subjItems, 45)) {
      const dtLabels = ['QP', 'MS', 'ER', 'SC', 'AUD', 'DF', 'SAM', 'SOL']
        .filter(t => grp.docTypes.has(t))
        .map(t => DOC_TYPE_HUMAN[t] || t);
      itemEntries.push(
        `<li><strong>${escapeHtml(grp.session)}${grp.unitLabel ? ` — ${escapeHtml(grp.unitLabel)}` : ''}</strong>: ${escapeHtml(dtLabels.join(', '))}</li>`
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
        ${filterDocType === 'Book' ? ' / <a href="/textbooks">Textbooks &amp; Solutions</a>' : ''}
        ${filterDocType === 'DF' ? ' / <span>IT &amp; CS Data Files</span>' : ''}
        ${filterDocType === 'AUD' ? ' / <span>Listening Audio MP3s</span>' : ''}
        ${filterCurriculum ? ` / <a href="${filterDocType === 'Book' ? `/textbooks/${getCurriculumSlug(filterCurriculum)}` : `/${getCurriculumSlug(filterCurriculum)}`}">${escapeHtml(filterCurriculum)}</a>` : ''}
        ${filterSubject ? ` / <a href="${filterDocType === 'Book' ? `/textbooks/${getCurriculumSlug(filterCurriculum || 'Edexcel IAL')}/${getSubjectSlug(filterSubject)}` : `/${getCurriculumSlug(filterCurriculum || 'Edexcel IAL')}/${getSubjectSlug(filterSubject)}`}">${escapeHtml(formatSubjectName(filterSubject))}</a>` : ''}
        ${filterUnit ? ` / <span>${escapeHtml(filterUnit)}</span>` : ''}
      </nav>
      <h1>${escapeHtml(seo.h1)}</h1>
      <p>${escapeHtml(seo.description)}</p>
      <p>${escapeHtml(seo.subtitle)}</p>
      ${legacyNote ? `<p><strong>Specification &amp; Legacy Codes:</strong> ${escapeHtml(legacyNote)}</p>` : ''}
      <nav aria-label="Archive Navigation">
        <p>
          <a href="/ial">Edexcel IAL Past Papers</a> |
          <a href="/igcse">Edexcel IGCSE Past Papers</a> |
          <a href="/textbooks">Textbooks &amp; Solution Banks</a> |
          <a href="/data-files">IT &amp; CS Data Files</a> |
          <a href="/audio">Listening Audio MP3s</a> |
          <a href="/about">About</a> |
          <a href="/changelog">Changelog</a>
        </p>
        ${itemEntries.length > 0 ? `<section><h2>Archived Documents &amp; Examination Sittings</h2><ul>${itemEntries.join('\n          ')}</ul></section>` : ''}
        ${links.length > 0 ? `<section><h2>Browse Related Subjects &amp; Years</h2><ul>${links.join('\n          ')}</ul></section>` : ''}
      </nav>
    </main>`;
}

function setOrInsertTag(html, tagRegex, newTag) {
  if (tagRegex.test(html)) {
    return html.replace(tagRegex, newTag);
  }
  return html.replace(/<\/head>/i, `  ${newTag}\n  </head>`);
}

function injectSeoIntoHtml(templateHtml, route, meta, indexLookup) {
  const seo = getSeoMetadata({ ...route.state, meta });
  const jsonLd = buildJsonLd({ ...route.state, seo, meta });
  const staticBody = buildStaticSemanticBody(route, seo, meta, indexLookup);

  let html = templateHtml;

  // Replace <title>
  html = setOrInsertTag(
    html,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(seo.title)}</title>`
  );

  // Replace meta description
  html = setOrInsertTag(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`
  );

  // Replace or set meta robots
  html = setOrInsertTag(
    html,
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="robots" content="${escapeHtml(seo.robots || 'index, follow')}" />`
  );

  // Replace meta keywords
  html = setOrInsertTag(
    html,
    /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="keywords" content="${escapeHtml(seo.keywords)}" />`
  );

  // Replace or inject canonical
  html = setOrInsertTag(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />`
  );

  // Replace OpenGraph & Twitter tags
  html = setOrInsertTag(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`
  );
  html = setOrInsertTag(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`
  );
  html = setOrInsertTag(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(seo.canonicalUrl)}" />`
  );
  html = setOrInsertTag(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`
  );
  html = setOrInsertTag(
    html,
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

  const indexPath = path.join(PUBLIC_DIR, 'index.json');
  const rawIndex = fs.existsSync(indexPath)
    ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    : null;
  const unpacked = unpackIndexFile(rawIndex);
  const indexLookup = buildIndexLookup(unpacked.items);

  const routes = collectAllRoutes(meta, indexLookup);
  const lastmodDate = new Date().toISOString().split('T')[0];

  // 1. Write public/sitemap.xml
  const sitemapXml = generateSitemapXml(routes, lastmodDate);
  const publicSitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml');
  fs.writeFileSync(publicSitemapPath, sitemapXml, 'utf8');
  const sitemapCount = routes.filter(r => r.includeInSitemap).length;
  console.log(`✅ Generated public/sitemap.xml with ${sitemapCount} canonical URLs.`);

  // 2. If dist/index.html exists, write dist/shards and pre-render static HTML for all routes
  const distIndexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(distIndexPath)) {
    const templateHtml = fs.readFileSync(distIndexPath, 'utf8');

    // Copy updated sitemap.xml to dist/sitemap.xml
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');

    if (rawIndex) {
      const shardCount = writeDistShards(rawIndex);
      console.log(`✅ Generated ${shardCount} fast route JSON shards in dist/shards/.`);
    }

    let prerenderedCount = 0;
    for (const route of routes) {
      const renderedHtml = injectSeoIntoHtml(templateHtml, route, meta, indexLookup);
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
