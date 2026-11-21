import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SITE_URL,
  IGCSE_SPEC_CODES,
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  formatSubjectName,
  getUnitCodeFromLabel,
  getLegacyEquivalentsForState,
  inferCurriculumForSubject,
  getSeoMetadata,
  buildJsonLd,
  buildRouteFaqEntries
} from '../src/seoRoutes.js';
import { compareUnitLabels, isLegacyIalUnitLabel } from '../src/unitParser.js';
import { BOOK_CATALOG_BY_PATH } from '../src/bookCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const VERCEL_CONFIG_PATH = path.join(ROOT_DIR, 'vercel.json');

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
  const aliasRedirects = [];
  const seenPaths = new Set();
  const seenRedirects = new Set();

  const addRoute = (routeObj) => {
    if (seenPaths.has(routeObj.path)) return;
    seenPaths.add(routeObj.path);
    routes.push(routeObj);
  };

  const addRedirect = (source, destination) => {
    if (!source || !destination || source === destination || seenRedirects.has(source)) return;
    seenRedirects.add(source);
    aliasRedirects.push({
      source,
      destination,
      permanent: true
    });
  };

  // Curriculum & subject shorthand aliases supported by seoRoutes.js
  addRedirect('/edexcel-ial', '/ial');
  addRedirect('/edexcel-igcse', '/igcse');
  addRedirect('/textbooks/edexcel-ial', '/textbooks/ial');
  addRedirect('/textbooks/edexcel-igcse', '/textbooks/igcse');
  const subjectAliasPairs = [
    ['/ial/math', '/ial/mathematics'],
    ['/ial/maths', '/ial/mathematics'],
    ['/ial/it', '/ial/information-technology'],
    ['/ial/ict', '/ial/information-technology'],
    ['/igcse/math', '/igcse/mathematics-a'],
    ['/igcse/maths', '/igcse/mathematics-a'],
    ['/igcse/it', '/igcse/information-technology'],
    ['/igcse/ict', '/igcse/information-technology'],
    ['/igcse/cs', '/igcse/computer-science'],
    ['/igcse/compsci', '/igcse/computer-science'],
    ['/textbooks/ial/math', '/textbooks/ial/mathematics'],
    ['/textbooks/ial/maths', '/textbooks/ial/mathematics'],
    ['/textbooks/ial/it', '/textbooks/ial/information-technology'],
    ['/textbooks/ial/ict', '/textbooks/ial/information-technology'],
    ['/textbooks/igcse/math', '/textbooks/igcse/mathematics-a'],
    ['/textbooks/igcse/maths', '/textbooks/igcse/mathematics-a'],
    ['/textbooks/igcse/it', '/textbooks/igcse/information-technology'],
    ['/textbooks/igcse/ict', '/textbooks/igcse/information-technology']
  ];
  for (const [src, dst] of subjectAliasPairs) {
    addRedirect(src, dst);
  }

  // Legacy renamed practical unit slugs indexed historically in Google Search Console
  const legacyUnitRedirects = [
    ['/ial/physics/practical-physics-i-wph13', '/ial/physics/unit-3-practical-physics-i-wph13'],
    ['/ial/physics/practical-physics-ii-wph16', '/ial/physics/unit-6-practical-physics-ii-wph16'],
    ['/ial/biology/practical-biology-i-wbi13', '/ial/biology/unit-3-practical-biology-i-wbi13'],
    ['/ial/biology/practical-biology-ii-wbi16', '/ial/biology/unit-6-practical-biology-ii-wbi16'],
    ['/ial/chemistry/practical-chemistry-i-wch13', '/ial/chemistry/unit-3-practical-chemistry-i-wch13'],
    ['/ial/chemistry/practical-chemistry-ii-wch16', '/ial/chemistry/unit-6-practical-chemistry-ii-wch16'],
    ['/ial/english-literature/unit-wet12', '/ial/english-literature/english-literature-unit-2-wet02'],
    ['/ial/english-literature/wet12', '/ial/english-literature/english-literature-unit-2-wet02']
  ];
  for (const [src, dst] of legacyUnitRedirects) {
    addRedirect(src, dst);
  }

  // 1. Core Top-Level Routes
  addRoute({
    path: '/',
    priority: '1.0',
    changefreq: 'daily',
    includeInSitemap: true,
    state: { currentTab: 'library' }
  });

  addRoute({
    path: '/papers',
    priority: '0.95',
    changefreq: 'daily',
    includeInSitemap: true,
    state: { currentTab: 'library', forceShowTable: true }
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
      const unitNames = Object.keys(unitsMap).sort((a, b) => compareUnitLabels(a, b, subj));

      for (const unitLabel of unitNames) {
        const unitSlug = getUnitSlug(unitLabel);
        const unitPath = `/${currSlug}/${subjSlug}/${unitSlug}`;
        const isLegacy = isLegacyIalUnitLabel(unitLabel);

        addRoute({
          path: unitPath,
          priority: isLegacy ? '0.75' : '0.85',
          changefreq: 'weekly',
          includeInSitemap: true,
          state: {
            currentTab: 'library',
            filterCurriculum: curr,
            filterSubject: subj,
            filterUnit: unitLabel
          }
        });

        // Map direct unit-code & shorthand alias paths (e.g., /ial/mathematics/wma11, /ial/mathematics/p1, /ial/physics/u1) to permanent 308 redirects
        const unitCode = getUnitCodeFromLabel(unitLabel);
        if (unitCode) {
          const codeSlug = unitCode.toLowerCase();
          addRedirect(`/${currSlug}/${subjSlug}/${codeSlug}`, unitPath);
          if (isLegacy) {
            // Preserve old /unit-wph01..06, /unit-wbi01..06, /unit-wch01..07, /unit-wbs01..04, /unit-wec01..04, /unit-6eca1..3 URLs
            addRedirect(`/${currSlug}/${subjSlug}/unit-${codeSlug}`, unitPath);
          }
        }
        const parenMatch = unitLabel.match(/\(([A-Z0-9]{2,6})\)/i);
        if (parenMatch) {
          addRedirect(`/${currSlug}/${subjSlug}/${parenMatch[1].toLowerCase()}`, unitPath);
        }
        if (!isLegacy) {
          const unitNumMatch = unitLabel.match(/\bUnit\s+([1-6])\b/i);
          if (unitNumMatch) {
            addRedirect(`/${currSlug}/${subjSlug}/u${unitNumMatch[1]}`, unitPath);
            addRedirect(`/${currSlug}/${subjSlug}/unit-${unitNumMatch[1]}`, unitPath);
          }
        }
      }
    }
  }

  return { routes, aliasRedirects };
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
  const faqEntries = buildRouteFaqEntries({
    currentTab,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterDocType,
    meta
  });

  if (currentTab === 'about') {
    itemEntries.push(
      '<li><strong>Archive Scope:</strong> Independent Edexcel IAL (19 subjects) and IGCSE (43 subjects) digital repository covering January 2003 through June 2026.</li>',
      '<li><strong>In-Browser Study Tools:</strong> Side-by-side Question Paper and Mark Scheme Split View, Resizable Two-Page Book Spread reader, chapter-by-chapter ZIP Worked Solution Bank viewer, and Listening Audio player with synced closed captions (CC).</li>',
      '<li><strong>Core Team:</strong> Nafiz.R (Founder &amp; Lead Architect), Nazmul.K (Co-Founder &amp; Systems Lead), Jemison Flaren (Systems Architect), Gemin Arghen (Infrastructure Engineer), Claudis Oppen (Research &amp; Intelligence Lead), Gemin Faure Hidrojen (Intern, Optimizer).</li>',
      '<li><strong>Educational Notice:</strong> Independent student study archive; not affiliated with or endorsed by Pearson plc or Edexcel.</li>'
    );
    links.push(
      '<li><a href="/ial">Edexcel International A-Level (IAL) Past Papers</a></li>',
      '<li><a href="/igcse">Edexcel International GCSE (IGCSE) Past Papers</a></li>',
      '<li><a href="/textbooks">Edexcel IAL &amp; IGCSE Textbooks &amp; Solution Banks</a></li>',
      '<li><a href="/audio">Listening Audio Archive with Synced Subtitles</a></li>',
      '<li><a href="/data-files">IT &amp; Computer Science Practical Data Files</a></li>'
    );
  } else if (currentTab === 'changelog') {
    itemEntries.push(
      '<li><strong>v6.9.5 (Latest):</strong> Full SEO &amp; AI-visibility upgrade (real DOM prerendering, llms.txt index, Book &amp; FAQPage JSON-LD, current-spec unit code prioritization, lateral unit linking, and 1-click Copy Study Link).</li>',
      '<li><strong>v6.9.4:</strong> Resizable Two-Page Side-by-Side PDF Reader Mode for textbooks and standalone past papers.</li>',
      '<li><strong>v6.9.3:</strong> Instant cache freshness, 24-hour auto-reload, and 100% Fast Web View large-PDF linearization.</li>',
      '<li><strong>v6.9.2:</strong> Added IGCSE (9-1) Commerce Student Book and Mathematics A Student Book 2 (73 total textbooks &amp; solution banks).</li>',
      '<li><strong>v6.9:</strong> Verified bibliographic textbook catalog, unit ordering, and hash-based modal deep links.</li>'
    );
    links.push(
      '<li><a href="/papers">Browse All Edexcel IAL &amp; IGCSE Past Papers</a></li>',
      '<li><a href="/textbooks">Browse Textbooks &amp; Worked Solution Banks</a></li>',
      '<li><a href="/about">About Conceptualist Systems</a></li>'
    );
  } else if (filterDocType === 'Book') {
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
      const catalogEntry = BOOK_CATALOG_BY_PATH[book.path] || null;
      const cleanBookTitle = catalogEntry?.title || String(book.name || '').replace(/\.(pdf|zip|rar)$/i, '').trim();
      const metaDetails = [
        catalogEntry?.authors ? `Authors: ${catalogEntry.authors}` : '',
        catalogEntry?.publisher ? `Publisher: ${catalogEntry.publisher}` : '',
        catalogEntry?.year ? `Year: ${catalogEntry.year}` : '',
        catalogEntry?.isbn ? `ISBN: ${catalogEntry.isbn}` : ''
      ].filter(Boolean).join(' · ');
      itemEntries.push(
        `<li><strong>${escapeHtml(cleanBookTitle)}</strong>: ${escapeHtml(subjLabel)} (${escapeHtml(label)})${metaDetails ? ` · <span>${escapeHtml(metaDetails)}</span>` : ''}</li>`
      );
    }
    if (!filterCurriculum) {
      links.push(
        '<li><a href="/textbooks/ial">Edexcel IAL Textbooks &amp; Worked Solution Banks</a></li>',
        '<li><a href="/textbooks/igcse">Edexcel IGCSE (9-1) Student Textbooks</a></li>'
      );
    } else if (filterCurriculum === 'Edexcel IAL') {
      links.push('<li><a href="/textbooks/igcse">Edexcel IGCSE (9-1) Student Textbooks</a></li>');
    } else if (filterCurriculum === 'Edexcel IGCSE') {
      links.push('<li><a href="/textbooks/ial">Edexcel IAL Textbooks &amp; Worked Solution Banks</a></li>');
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
        `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.curriculum)} ${escapeHtml(formatSubjectName(item.subject))}${unitTxt ? ` (${escapeHtml(unitTxt)})` : ''}${sessTxt ? ` (${escapeHtml(sessTxt)})` : ''}</li>`
      );
    }
    links.push(
      '<li><a href="/ial/information-technology">Edexcel IAL Information Technology Past Papers (WIT11-WIT14)</a></li>',
      '<li><a href="/ial/information-technology/it-unit-2-wit12">Edexcel IAL IT Unit 2 (WIT12) Past Papers &amp; Data Files</a></li>',
      '<li><a href="/ial/information-technology/it-unit-4-wit14">Edexcel IAL IT Unit 4 (WIT14) Past Papers &amp; Data Files</a></li>',
      '<li><a href="/igcse/information-technology">Edexcel IGCSE ICT (4IT1) Past Papers &amp; Data Files</a></li>',
      '<li><a href="/igcse/information-technology/paper-2-p2">Edexcel IGCSE ICT Paper 2 (4IT1/02) Practical Papers</a></li>',
      '<li><a href="/igcse/computer-science">Edexcel IGCSE Computer Science (4CP0) Past Papers</a></li>',
      '<li><a href="/igcse/computer-science/paper-2-p2">Edexcel IGCSE Computer Science Paper 2 (4CP0/02) Practical Papers</a></li>',
      '<li><a href="/textbooks/ial/information-technology">Edexcel IAL Information Technology Student Books 1 &amp; 2</a></li>',
      '<li><a href="/textbooks/igcse/information-technology">Edexcel IGCSE ICT Student Textbook</a></li>'
    );
  } else if (filterDocType === 'AUD') {
    const audItems = [...(indexLookup?.audioAll || [])].sort((a, b) => (Number(b.sortKey) || 0) - (Number(a.sortKey) || 0));
    for (const item of audItems) {
      const unitTxt = item.cleanUnitLabel || item.unitCode || '';
      const sessTxt = item.session || (item.year ? String(item.year) : '');
      itemEntries.push(
        `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.curriculum)} ${escapeHtml(formatSubjectName(item.subject))}${unitTxt ? ` (${escapeHtml(unitTxt)})` : ''}${sessTxt ? ` (${escapeHtml(sessTxt)} Listening Audio MP3)` : ''}</li>`
      );
    }
    links.push(
      '<li><a href="/ial/french">Edexcel IAL French Past Papers &amp; Listening Audio</a></li>',
      '<li><a href="/ial/french/french-unit-2-wfr02">Edexcel IAL French Unit 2 (WFR02) Listening &amp; Response</a></li>',
      '<li><a href="/ial/french/french-unit-4-wfr04">Edexcel IAL French Unit 4 (WFR04) Research &amp; Listening</a></li>',
      '<li><a href="/ial/german">Edexcel IAL German Past Papers &amp; Listening Audio</a></li>',
      '<li><a href="/ial/german/german-unit-2-wgn02">Edexcel IAL German Unit 2 (WGN02) Listening &amp; Response</a></li>',
      '<li><a href="/ial/german/german-unit-4-wgn04">Edexcel IAL German Unit 4 (WGN04) Research &amp; Listening</a></li>',
      '<li><a href="/ial/spanish">Edexcel IAL Spanish Past Papers &amp; Listening Audio</a></li>',
      '<li><a href="/ial/spanish/spanish-unit-2-wsp02">Edexcel IAL Spanish Unit 2 (WSP02) Listening &amp; Response</a></li>',
      '<li><a href="/ial/spanish/spanish-unit-4-wsp04">Edexcel IAL Spanish Unit 4 (WSP04) Research &amp; Listening</a></li>',
      '<li><a href="/igcse/english-as-a-second-language">Edexcel IGCSE English as a Second Language (4ES1) Past Papers &amp; Audio</a></li>',
      '<li><a href="/igcse/chinese">Edexcel IGCSE Chinese (4CN1) Past Papers &amp; Listening Audio</a></li>',
      '<li><a href="/igcse/french">Edexcel IGCSE French (4FR1) Past Papers &amp; Listening Audio</a></li>',
      '<li><a href="/igcse/german">Edexcel IGCSE German (4GN1) Past Papers &amp; Listening Audio</a></li>',
      '<li><a href="/igcse/spanish">Edexcel IGCSE Spanish (4SP1) Past Papers &amp; Listening Audio</a></li>',
      '<li><a href="/igcse/swahili">Edexcel IGCSE Swahili (4SW1) Past Papers &amp; Listening Audio</a></li>'
    );
  } else if (filterSubject && filterCurriculum && filterUnit) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    const subjSlug = getSubjectSlug(filterSubject);
    const subjItems = indexLookup?.byCurrSubj?.get(`${filterCurriculum}::${filterSubject}`) || [];
    const unitItems = subjItems.filter(it => it.cleanUnitLabel === filterUnit);
    for (const grp of groupSittingsForHtml(unitItems, 90)) {
      const dtLabels = ['QP', 'MS', 'ER', 'SC', 'AUD', 'DF', 'SAM', 'SOL']
        .filter(t => grp.docTypes.has(t))
        .map(t => DOC_TYPE_HUMAN[t] || t);
      const variantTxt = grp.variant ? ` (${grp.variant})` : '';
      itemEntries.push(
        `<li><strong>${escapeHtml(grp.session)}${escapeHtml(variantTxt)}</strong>: ${escapeHtml(filterSubject)} ${escapeHtml(filterUnit)} (${escapeHtml(dtLabels.join(', '))})</li>`
      );
    }
    if (indexLookup?.booksByCurrSubj?.has(`${filterCurriculum}::${filterSubject}`)) {
      links.push(
        `<li><a href="/textbooks/${currSlug}/${subjSlug}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} Textbooks & Solutions`)}</a></li>`
      );
    }
    links.push(
      `<li><a href="/${currSlug}/${subjSlug}">${escapeHtml(`All ${filterCurriculum} ${formatSubjectName(filterSubject)} Units & Past Papers`)}</a></li>`
    );
    // Lateral sibling unit links so every unit page has strong contextual inbound/outbound links
    const unitsObj = meta?.wizard?.[filterCurriculum]?.[filterSubject]?.units || {};
    const siblingUnits = Object.keys(unitsObj).sort((a, b) => compareUnitLabels(a, b, filterSubject));
    for (const sibUnit of siblingUnits) {
      if (sibUnit === filterUnit) continue;
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(sibUnit)}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} ${sibUnit} Past Papers`)}</a></li>`
      );
    }
  } else if (filterSubject && filterCurriculum) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    const subjSlug = getSubjectSlug(filterSubject);
    const unitsObj = meta?.wizard?.[filterCurriculum]?.[filterSubject]?.units || {};
    for (const u of Object.keys(unitsObj).sort((a, b) => compareUnitLabels(a, b, filterSubject))) {
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(u)}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} ${u} Past Papers & Mark Schemes`)}</a></li>`
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
        `<li><strong>${escapeHtml(grp.session)}${grp.unitLabel ? ` (${escapeHtml(grp.unitLabel)})` : ''}</strong>: ${escapeHtml(dtLabels.join(', '))}</li>`
      );
    }
  } else if (filterCurriculum) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    links.push(
      `<li><a href="/textbooks/${currSlug}">${escapeHtml(`${filterCurriculum} Textbooks & Worked Solution Banks`)}</a></li>`
    );
    const subjectsObj = meta?.wizard?.[filterCurriculum] || {};
    for (const s of Object.keys(subjectsObj).sort()) {
      const subjSlug = getSubjectSlug(s);
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(s)} Past Papers & Mark Schemes`)}</a></li>`
      );
      const uKeys = Object.keys(subjectsObj[s]?.units || {});
      if (uKeys.length === 1) {
        links.push(
          `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(uKeys[0])}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(s)} ${uKeys[0]} Past Papers`)}</a></li>`
        );
      }
    }
  } else if (currentTab === 'library') {
    links.push(
      '<li><a href="/textbooks/ial">Edexcel IAL Textbooks &amp; Worked Solution Banks</a></li>',
      '<li><a href="/textbooks/igcse">Edexcel IGCSE (9-1) Student Textbooks</a></li>'
    );
    for (const curr of ['Edexcel IAL', 'Edexcel IGCSE']) {
      const currSlug = getCurriculumSlug(curr);
      const subjectsObj = meta?.wizard?.[curr] || {};
      for (const s of Object.keys(subjectsObj).sort()) {
        const subjSlug = getSubjectSlug(s);
        links.push(
          `<li><a href="/${currSlug}/${subjSlug}">${escapeHtml(`${curr} ${formatSubjectName(s)} Past Papers`)}</a></li>`
        );
        const uKeys = Object.keys(subjectsObj[s]?.units || {});
        if (uKeys.length === 1) {
          links.push(
            `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(uKeys[0])}">${escapeHtml(`${curr} ${formatSubjectName(s)} ${uKeys[0]} Past Papers`)}</a></li>`
          );
        }
      }
    }
  }

  const faqHtml = faqEntries.length > 0
    ? `<section aria-label="Frequently Asked Questions"><h2>Frequently Asked Questions</h2>${faqEntries.map(f => `<article><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></article>`).join('\n        ')}</section>`
    : '';

  return `<main class="seo-prerender-shell" style="max-width:1160px;margin:24px auto;padding:20px 16px;font-family:'Roboto',system-ui,-apple-system,sans-serif;color:var(--text-primary,#1A1D20);background:var(--bg-surface,#FFFFFF);border-top:3px solid var(--mcmaster-maroon,#6F1D2B);box-sizing:border-box;">
      <nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:12px;">
        <a href="/" style="color:inherit;">Conceptualist Library Home</a>
        ${filterDocType === 'Book' ? ' / <a href="/textbooks" style="color:inherit;">Textbooks &amp; Solutions</a>' : ''}
        ${filterDocType === 'DF' ? ' / <span>IT &amp; CS Data Files</span>' : ''}
        ${filterDocType === 'AUD' ? ' / <span>Listening Audio MP3s</span>' : ''}
        ${filterCurriculum ? ` / <a href="${filterDocType === 'Book' ? `/textbooks/${getCurriculumSlug(filterCurriculum)}` : `/${getCurriculumSlug(filterCurriculum)}`}" style="color:inherit;">${escapeHtml(filterCurriculum)}</a>` : ''}
        ${filterSubject ? ` / <a href="${filterDocType === 'Book' ? `/textbooks/${getCurriculumSlug(filterCurriculum || 'Edexcel IAL')}/${getSubjectSlug(filterSubject)}` : `/${getCurriculumSlug(filterCurriculum || 'Edexcel IAL')}/${getSubjectSlug(filterSubject)}`}" style="color:inherit;">${escapeHtml(formatSubjectName(filterSubject))}</a>` : ''}
        ${filterUnit ? ` / <span>${escapeHtml(filterUnit)}</span>` : ''}
      </nav>
      <h1 style="margin:0 0 8px 0;font-size:24px;">${escapeHtml(seo.h1)}</h1>
      <p style="margin:0 0 8px 0;line-height:1.5;">${escapeHtml(seo.description)}</p>
      <p style="margin:0 0 12px 0;line-height:1.5;">${escapeHtml(seo.subtitle)}</p>
      ${legacyNote ? `<p style="margin:0 0 12px 0;"><strong>Specification &amp; Legacy Codes:</strong> ${escapeHtml(legacyNote)}</p>` : ''}
      ${faqHtml}
      <nav aria-label="Archive Navigation">
        <p>
          <a href="/papers">All Past Papers</a> |
          <a href="/ial">Edexcel IAL Past Papers</a> |
          <a href="/igcse">Edexcel IGCSE Past Papers</a> |
          <a href="/textbooks">Textbooks &amp; Solution Banks</a> |
          <a href="/data-files">IT &amp; CS Data Files</a> |
          <a href="/audio">Listening Audio MP3s</a> |
          <a href="/about">About</a> |
          <a href="/changelog">Changelog</a>
        </p>
        ${itemEntries.length > 0 ? `<section><h2>Archived Documents &amp; Examination Sittings</h2><ul>${itemEntries.join('\n          ')}</ul></section>` : ''}
        ${links.length > 0 ? `<section><h2>Browse Related Subjects &amp; Resources</h2><ul>${links.join('\n          ')}</ul></section>` : ''}
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

  // Replace or inject canonical only when indexable (avoid noindex + cross-canonical conflict)
  if (String(seo.robots || '').includes('noindex')) {
    html = html.replace(/\s*<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/gi, '');
  } else {
    html = setOrInsertTag(
      html,
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />`
    );
  }

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

  // Inject crawlable semantic HTML directly inside <div id="root">...</div> (without <noscript>!)
  // so non-JS AI search crawlers (OAI-SearchBot, PerplexityBot, ClaudeBot, GPTBot), Bingbot, and Googlebot Wave-1
  // index real visible DOM headings, Q&As, sittings, and internal links, while React createRoot replaces it on mount.
  html = html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root">${staticBody}</div>`
  );

  return html;
}

function generateLlmsTxt(meta, indexLookup) {
  const uniqueFiles = meta?.uniqueFiles || meta?.totalFiles || 16079;
  const totalFiles = meta?.totalFiles || 19940;
  const booksCount = indexLookup?.booksAll?.length || Object.keys(BOOK_CATALOG_BY_PATH).length || 73;
  const audioCount = indexLookup?.audioAll?.length || 272;
  const dfCount = indexLookup?.dfAll?.length || 46;
  const ialSubjects = Object.keys(meta?.wizard?.['Edexcel IAL'] || {}).sort();
  const igcseSubjects = Object.keys(meta?.wizard?.['Edexcel IGCSE'] || {}).sort();

  const lines = [
    '# Conceptualist Systems — Pearson Edexcel IAL & IGCSE Past Papers & Textbooks Library',
    '',
    `> Conceptualist Systems (${SITE_URL}) is a free, zero-ad academic study archive indexing ${uniqueFiles.toLocaleString()} unique Pearson Edexcel International A-Level (IAL) and International GCSE (IGCSE 9-1 & Modular) Question Papers (QP), Mark Schemes (MS), Examiner Reports (ER), ${booksCount} Student Textbooks & Worked Solution Banks, ${audioCount} Listening Audio tracks with synced closed captions (CC), and ${dfCount} IT & Computer Science practical Data Files (${totalFiles.toLocaleString()} total archived files covering January 2003 through June 2026).`,
    '',
    '## Core Platform Capabilities',
    '- **Side-by-Side Split View Reader:** Open any paired Question Paper (QP) and Mark Scheme (MS) side by side in the browser with synchronized zoom and draggable split divider.',
    '- **Resizable Two-Page Book Spread Mode:** Read all 73 Edexcel IAL & IGCSE student textbooks and standalone past papers in a 2-Page side-by-side spread with Pure OLED and Academic Dark reading modes.',
    '- **In-Browser Worked Solution Bank Reader:** Stream all 14 Edexcel IAL Mathematics Worked Solution Banks (P1-P4, M1-M3, S1-S3, D1, FP1-FP3) chapter-by-chapter directly in the browser without downloading full ZIP archives.',
    '- **Synced Listening Audio & Subtitles (CC):** Play MP3 and multi-track ZIP listening examinations above the Question Paper with clickable time-synced transcripts across French, German, Spanish, ESL, Chinese, and Swahili.',
    '',
    '## Primary Archive Hubs',
    `- [Library Homepage](${SITE_URL}/): Interactive subject, unit, and examination year navigator.`,
    `- [All Past Papers Catalog](${SITE_URL}/papers): Full searchable catalog of ${uniqueFiles.toLocaleString()} unique Edexcel resources.`,
    `- [Edexcel IAL Past Papers](${SITE_URL}/ial): ${ialSubjects.length} International A-Level subjects (2003-2026).`,
    `- [Edexcel IGCSE Past Papers](${SITE_URL}/igcse): ${igcseSubjects.length} International GCSE (9-1, Regional R, and Modular 4W*) subjects.`,
    `- [Textbooks & Worked Solution Banks](${SITE_URL}/textbooks): ${booksCount} student books, answer PDFs, lab books, and IAL Maths Solution Banks.`,
    `- [Edexcel IAL Textbooks & Solution Banks](${SITE_URL}/textbooks/ial): Student Book 1 & 2 PDFs, answers, and P1-P4/M1-M3/S1-S3/D1/FP1-FP3 Solution Banks.`,
    `- [Edexcel IGCSE (9-1) Textbooks](${SITE_URL}/textbooks/igcse): Official student books across Mathematics A, Further Pure Maths, Sciences, Business, Commerce, Accounting, Economics, and ICT.`,
    `- [Listening Audio Archive (MP3 & Live CC)](${SITE_URL}/audio): ${audioCount} listening audio tracks and synced transcripts.`,
    `- [IT & Computer Science Practical Data Files](${SITE_URL}/data-files): ${dfCount} practical exam source ZIPs for WIT12, WIT14, 4IT1, and 4CP0.`,
    '',
    `## Edexcel International A-Level (IAL) Subjects (${ialSubjects.length})`,
    ...ialSubjects.map((s) => {
      const sObj = meta?.wizard?.['Edexcel IAL']?.[s] || {};
      const uCount = Object.keys(sObj.units || {}).length;
      return `- [Edexcel IAL ${formatSubjectName(s)}](${SITE_URL}/ial/${getSubjectSlug(s)}): ${sObj.totalFiles || 0} unique files across ${uCount} units.`;
    }),
    '',
    `## Edexcel International GCSE (IGCSE) Subjects (${igcseSubjects.length})`,
    ...igcseSubjects.map((s) => {
      const sObj = meta?.wizard?.['Edexcel IGCSE']?.[s] || {};
      const code = IGCSE_SPEC_CODES[s] ? ` (${IGCSE_SPEC_CODES[s]})` : '';
      return `- [Edexcel IGCSE ${formatSubjectName(s)}${code}](${SITE_URL}/igcse/${getSubjectSlug(s)}): ${sObj.totalFiles || 0} unique files.`;
    }),
    '',
    '## Subject Textbooks & Solution Bank Collections',
    ...[...(indexLookup?.booksByCurrSubj?.keys() || [])].sort().map((key) => {
      const [curr, subj] = key.split('::');
      const list = indexLookup.booksByCurrSubj.get(key) || [];
      return `- [${curr} ${formatSubjectName(subj)} Textbooks & Solutions](${SITE_URL}/textbooks/${getCurriculumSlug(curr)}/${getSubjectSlug(subj)}): ${list.length} books/solution banks.`;
    }),
    ''
  ];

  return lines.join('\n');
}

function generateSitemapXml(routes, lastmodDate, meta) {
  const sitemapRoutes = routes.filter((r) => {
    if (!r.includeInSitemap) return false;
    const seo = getSeoMetadata({ ...r.state, meta });
    return !String(seo.robots || '').includes('noindex');
  });
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

  const { routes, aliasRedirects } = collectAllRoutes(meta, indexLookup);
  const lastmodDate = new Date().toISOString().split('T')[0];

  // Sync permanent 308 alias redirects into vercel.json and remove catch-all rewrites so invalid subpaths return genuine HTTP 404 (dist/404.html)
  if (fs.existsSync(VERCEL_CONFIG_PATH)) {
    try {
      const vercelCfg = JSON.parse(fs.readFileSync(VERCEL_CONFIG_PATH, 'utf8'));
      const sortedRedirects = [...aliasRedirects].sort((a, b) => a.source.localeCompare(b.source));
      vercelCfg.rewrites = [];
      vercelCfg.redirects = sortedRedirects;
      fs.writeFileSync(VERCEL_CONFIG_PATH, JSON.stringify(vercelCfg, null, 2) + '\n', 'utf8');
      console.log(`✅ Synced ${sortedRedirects.length} permanent shorthand/unit alias redirects into vercel.json (wildcard Soft-404 rewrites cleared).`);
    } catch (err) {
      console.warn('⚠️ Could not sync vercel.json redirects:', err.message);
    }
  }

  // 1. Write public/sitemap.xml & public/llms.txt
  const sitemapXml = generateSitemapXml(routes, lastmodDate, meta);
  const publicSitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml');
  fs.writeFileSync(publicSitemapPath, sitemapXml, 'utf8');
  const sitemapCount = (sitemapXml.match(/<url>/g) || []).length;
  console.log(`✅ Generated public/sitemap.xml with ${sitemapCount} indexable canonical URLs.`);

  const llmsTxt = generateLlmsTxt(meta, indexLookup);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt, 'utf8');
  console.log(`✅ Generated public/llms.txt (${llmsTxt.split('\n').length} lines).`);

  // 2. If dist/index.html exists, write dist/shards and pre-render static HTML for all routes
  const distIndexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(distIndexPath)) {
    const templateHtml = fs.readFileSync(distIndexPath, 'utf8');

    // Copy updated sitemap.xml, llms.txt & robots.txt to dist/
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'llms.txt'), llmsTxt, 'utf8');
    if (fs.existsSync(path.join(PUBLIC_DIR, 'robots.txt'))) {
      fs.copyFileSync(path.join(PUBLIC_DIR, 'robots.txt'), path.join(DIST_DIR, 'robots.txt'));
    }

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
    // Also write static 404.html so unknown routes return genuine HTTP 404 with clean navigation links
    const notFoundHtml = injectSeoIntoHtml(
      templateHtml,
      { path: '/404.html', state: { currentTab: 'library', notFound: true } },
      meta,
      indexLookup
    );
    fs.writeFileSync(path.join(DIST_DIR, '404.html'), notFoundHtml, 'utf8');
    console.log(`✅ Pre-rendered ${prerenderedCount} canonical HTML route pages + 404.html in dist/.`);
  }
}

run();
