import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  SITE_URL,
  isThinUnitRoute,
  IGCSE_SPEC_CODES,
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  formatSubjectName,
  getUnitCodeFromLabel,
  getLegacyEquivalentsForState,
  inferCurriculumForSubject,
  getIalMathBranchShardName,
  getShardPathForRoute,
  getSeoMetadata,
  buildJsonLd,
  buildRouteFaqEntries
} from '../src/seoRoutes.js';
import { compareUnitLabels, isLegacyUnitLabel } from '../src/unitParser.js';
import {
  ALL_CURRICULUMS,
  getBoardForCurriculum,
  getCurriculumForSpec,
  isBookCategory,
  isCambridgeCurriculum
} from '../src/data/boards.js';
import {
  extractSyllabusCodeFromSubject,
  resolveCambridgeSyllabus
} from '../src/data/cambridgeCatalog.js';
import { BOOK_CATALOG_BY_PATH } from '../src/bookCatalog.js';
import { CHANGELOG_HISTORY } from '../src/data/changelogHistory.js';
import { decodeCatalogFiles, encodeCompactCatalog } from '../src/lib/indexSerializer.js';

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
  GT: 'Grade Thresholds (GT)',
  Book: 'Student Textbook PDF',
  SOL: 'Worked Solution Bank',
  AUD: 'Listening Audio (MP3)',
  DF: 'Practical Data Files',
  SC: 'Source / Insert Booklet',
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
  if (!rawIndex) return { items: [] };
  const decoded = decodeCatalogFiles(rawIndex);
  for (let i = 0; i < decoded.length; i++) {
    decoded[i].curriculum = getCurriculumForSpec(decoded[i].spec, decoded[i].category);
  }
  return { items: decoded };
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

    if (isBookCategory(item.category)) {
      booksAll.push(item);
      if (!booksByCurrSubj.has(key)) booksByCurrSubj.set(key, []);
      booksByCurrSubj.get(key).push(item);
    }
    if (item.docType === 'DF') dfAll.push(item);
    if (item.docType === 'AUD') audioAll.push(item);
  }

  return { byCurrSubj, booksByCurrSubj, booksAll, dfAll, audioAll };
}

function writeDistShards(rawIndexes) {
  const shardsDir = path.join(DIST_DIR, 'shards');
  fs.mkdirSync(shardsDir, { recursive: true });
  const validIndexes = (Array.isArray(rawIndexes) ? rawIndexes : [rawIndexes]).filter(Boolean);
  if (validIndexes.length === 0) return 0;

  const firstIdx = validIndexes[0];
  const baseShardMeta = {
    generatedAt: firstIdx.meta?.generatedAt || '',
    uniqueFiles: firstIdx.meta?.uniqueFiles || 0,
    isShard: true,
    isPreDeduped: true
  };

  const buckets = new Map();
  const pushToBucket = (shardName, item) => {
    let arr = buckets.get(shardName);
    if (!arr) {
      arr = [];
      buckets.set(shardName, arr);
    }
    arr.push(item);
  };

  for (const rawIndex of validIndexes) {
    const { items } = unpackIndexFile(rawIndex);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const curr = inferCurriculumForSubject(item.subject, item.curriculum);
      const currSlug = getCurriculumSlug(curr);
      const subjSlug = getSubjectSlug(item.subject);
      if (currSlug && subjSlug) {
        const flatCurrSlug = currSlug.replace(/\//g, '-');
        pushToBucket(`${flatCurrSlug}-${subjSlug}.json`, item);
        if (currSlug === 'ial' && subjSlug === 'mathematics') {
          const branchShard = getIalMathBranchShardName(`${item.cleanUnitLabel || ''} ${item.unitCode || ''} ${item.name || ''}`);
          pushToBucket(branchShard, item);
        }
      }
      if (isBookCategory(item.category)) {
        pushToBucket('textbooks.json', item);
      }
      if (item.docType === 'DF') {
        pushToBucket('data-files.json', item);
      }
      if (item.docType === 'AUD') {
        pushToBucket('audio.json', item);
      }
    }
  }

  for (const [shardName, itemsList] of buckets.entries()) {
    const shardBoard = (shardName === 'audio.json' || shardName === 'data-files.json' || shardName === 'textbooks.json')
      ? 'all'
      : shardName.startsWith('cambridge-')
        ? 'cambridge'
        : 'edexcel';
    const compactPayload = encodeCompactCatalog(itemsList, {
      ...baseShardMeta,
      board: shardBoard,
      partitionUniqueFiles: itemsList.length
    });
    fs.writeFileSync(path.join(shardsDir, shardName), JSON.stringify(compactPayload), 'utf8');
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
  addRedirect('/caie', '/cambridge');
  addRedirect('/cie', '/cambridge');
  addRedirect('/cambridge/al', '/cambridge/a-level');
  addRedirect('/cambridge/as-a-level', '/cambridge/a-level');
  addRedirect('/cambridge/ol', '/cambridge/o-level');
  addRedirect('/textbooks/caie', '/textbooks/cambridge');
  addRedirect('/textbooks/cie', '/textbooks/cambridge');
  addRedirect('/textbooks/cambridge/al', '/textbooks/cambridge/a-level');
  addRedirect('/textbooks/cambridge/as-a-level', '/textbooks/cambridge/a-level');
  addRedirect('/textbooks/cambridge/ol', '/textbooks/cambridge/o-level');
  addRedirect('/textbooks/edexcel-ial', '/textbooks/ial');
  addRedirect('/textbooks/edexcel-igcse', '/textbooks/igcse');
  const subjectAliasPairs = [
    ['/ial/math', '/ial/mathematics'],
    ['/ial/maths', '/ial/mathematics'],
    ['/ial/it', '/ial/information-technology'],
    ['/ial/ict', '/ial/information-technology'],
    ['/igcse/bengali', '/igcse/bangla'],
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
    ['/ial/english-literature/wet12', '/ial/english-literature/english-literature-unit-2-wet02'],
    ['/ial/physics/wph07', '/ial/physics/unit-3-practical-physics-i-wph13'],
    ['/ial/physics/unit-wph07', '/ial/physics/unit-3-practical-physics-i-wph13'],
    ['/igcse/bengali/paper-1-p1', '/igcse/bangla/paper-1-p1'],
    ['/igcse/bengali/p1', '/igcse/bangla/paper-1-p1'],
    ['/igcse/bengali/paper-1', '/igcse/bangla/paper-1-p1'],
    ['/cambridge/igcse/mathematics-0580/paper-1-core-p1', '/cambridge/igcse/mathematics-0580/paper-1-core'],
    ['/cambridge/igcse/mathematics-0580/paper-2-extended-p2', '/cambridge/igcse/mathematics-0580/paper-2-extended'],
    ['/cambridge/igcse/mathematics-0580/paper-3-core-p3', '/cambridge/igcse/mathematics-0580/paper-3-core'],
    ['/cambridge/igcse/mathematics-0580/paper-4-extended-p4', '/cambridge/igcse/mathematics-0580/paper-4-extended'],
    ['/cambridge/o-level/islamiyat-2058/paper-1-p1', '/cambridge/o-level/islamiyat-2058/paper-1-major-themes-of-the-qur-an-and-history'],
    ['/cambridge/o-level/islamiyat-2058/paper-2-p2', '/cambridge/o-level/islamiyat-2058/paper-2-hadith-caliphate-and-articles-of-faith'],
    ['/cambridge/o-level/mathematics-d-4024/paper-1-non-calculator-p1', '/cambridge/o-level/mathematics-d-4024/paper-1-non-calculator'],
    ['/cambridge/o-level/mathematics-d-4024/paper-2-calculator-p2', '/cambridge/o-level/mathematics-d-4024/paper-2-calculator'],
    ['/cambridge/a-level/mathematics-9709/pure-mathematics-1-p1-wma11', '/cambridge/a-level/mathematics-9709/pure-mathematics-1-p1'],
    ['/cambridge/a-level/mathematics-9709/pure-mathematics-2-p2-wma12', '/cambridge/a-level/mathematics-9709/pure-mathematics-2-p2'],
    ['/cambridge/a-level/mathematics-9709/pure-mathematics-3-p3-wma13', '/cambridge/a-level/mathematics-9709/pure-mathematics-3-p3']
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
    state: { currentTab: 'library', activeBoard: 'edexcel', filterCurriculum: 'Edexcel IGCSE' }
  });

  // Cambridge International Top-Level Routes
  const hasCieFiles = (meta?.boards?.cambridge?.uniqueFiles || 0) > 0;
  addRoute({
    path: '/cambridge',
    priority: '0.95',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', activeBoard: 'cambridge' }
  });

  addRoute({
    path: '/cambridge/papers',
    priority: '0.90',
    changefreq: 'weekly',
    includeInSitemap: hasCieFiles,
    state: { currentTab: 'library', activeBoard: 'cambridge', forceShowTable: true }
  });

  addRoute({
    path: '/cambridge/a-level',
    priority: '0.92',
    changefreq: 'weekly',
    includeInSitemap: (meta?.cieAlSubjects?.length || 0) > 0,
    state: { currentTab: 'library', activeBoard: 'cambridge', filterCurriculum: 'Cambridge AS & A Level' }
  });

  addRoute({
    path: '/cambridge/igcse',
    priority: '0.92',
    changefreq: 'weekly',
    includeInSitemap: (meta?.cieIgcseSubjects?.length || 0) > 0,
    state: { currentTab: 'library', activeBoard: 'cambridge', filterCurriculum: 'Cambridge IGCSE' }
  });

  addRoute({
    path: '/cambridge/o-level',
    priority: '0.92',
    changefreq: 'weekly',
    includeInSitemap: (meta?.cieOlSubjects?.length || 0) > 0,
    state: { currentTab: 'library', activeBoard: 'cambridge', filterCurriculum: 'Cambridge O Level' }
  });

  addRoute({
    path: '/textbooks',
    priority: '0.92',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', scopeAllBoards: true, filterDocType: 'Book', forceShowTable: true }
  });

  addRoute({
    path: '/textbooks/edexcel',
    priority: '0.88',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', activeBoard: 'edexcel', filterDocType: 'Book', forceShowTable: true }
  });

  addRoute({
    path: '/textbooks/ial',
    priority: '0.85',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', activeBoard: 'edexcel', filterCurriculum: 'Edexcel IAL', filterDocType: 'Book', forceShowTable: true }
  });

  addRoute({
    path: '/textbooks/igcse',
    priority: '0.85',
    changefreq: 'weekly',
    includeInSitemap: true,
    state: { currentTab: 'library', activeBoard: 'edexcel', filterCurriculum: 'Edexcel IGCSE', filterDocType: 'Book', forceShowTable: true }
  });

  const hasCieBooks = (meta?.cambridgeBooks || meta?.boards?.cambridge?.totalBooks || 0) > 0;
  addRoute({
    path: '/textbooks/cambridge',
    priority: '0.90',
    changefreq: 'weekly',
    includeInSitemap: hasCieBooks,
    state: { currentTab: 'library', activeBoard: 'cambridge', filterDocType: 'Book', forceShowTable: true }
  });

  addRoute({
    path: '/textbooks/cambridge/a-level',
    priority: '0.85',
    changefreq: 'weekly',
    includeInSitemap: (meta?.cieAlBooks || meta?.boards?.cambridge?.alBooks || 0) > 0,
    state: { currentTab: 'library', activeBoard: 'cambridge', filterCurriculum: 'Cambridge AS & A Level', filterDocType: 'Book', forceShowTable: true }
  });

  addRoute({
    path: '/textbooks/cambridge/igcse',
    priority: '0.85',
    changefreq: 'weekly',
    includeInSitemap: (meta?.cieIgcseBooks || meta?.boards?.cambridge?.igcseBooks || 0) > 0,
    state: { currentTab: 'library', activeBoard: 'cambridge', filterCurriculum: 'Cambridge IGCSE', filterDocType: 'Book', forceShowTable: true }
  });

  addRoute({
    path: '/textbooks/cambridge/o-level',
    priority: '0.85',
    changefreq: 'weekly',
    includeInSitemap: (meta?.cieOlBooks || meta?.boards?.cambridge?.olBooks || 0) > 0,
    state: { currentTab: 'library', activeBoard: 'cambridge', filterCurriculum: 'Cambridge O Level', filterDocType: 'Book', forceShowTable: true }
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

  // 3. All Curriculum -> Subject -> Unit Routes from meta.wizard across Edexcel & Cambridge
  for (const curr of ALL_CURRICULUMS) {
    const currSlug = getCurriculumSlug(curr);
    const boardId = getBoardForCurriculum(curr);
    const isCie = isCambridgeCurriculum(curr);
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
          activeBoard: boardId,
          filterCurriculum: curr,
          filterSubject: subj
        }
      });

      if (isCie) {
        const sylCode = extractSyllabusCodeFromSubject(subj);
        if (sylCode) {
          addRedirect(`/cambridge/${sylCode}`, subjPath);
          const codelessSlug = subjSlug.replace(/-\d{4}$/, '');
          if (codelessSlug && codelessSlug !== subjSlug) {
            addRedirect(`/${currSlug}/${codelessSlug}`, subjPath);
          }
          const entry = resolveCambridgeSyllabus(sylCode);
          if (entry?.alt91) addRedirect(`/cambridge/${entry.alt91}`, subjPath);
          if (Array.isArray(entry?.legacyCodes)) {
            for (const lc of entry.legacyCodes) {
              addRedirect(`/cambridge/${lc}`, subjPath);
            }
          }
        }
      }

      const unitsMap = subjectsMap[subj]?.units || {};
      const unitNames = Object.keys(unitsMap).sort((a, b) => compareUnitLabels(a, b, subj));

      for (const unitLabel of unitNames) {
        const unitSlug = getUnitSlug(unitLabel, { isCambridge: isCie });
        const unitPath = `/${currSlug}/${subjSlug}/${unitSlug}`;
        const isLegacy = isLegacyUnitLabel(unitLabel);

        addRoute({
          path: unitPath,
          priority: isLegacy ? '0.75' : '0.85',
          changefreq: 'weekly',
          includeInSitemap: true,
          state: {
            currentTab: 'library',
            activeBoard: boardId,
            filterCurriculum: curr,
            filterSubject: subj,
            filterUnit: unitLabel
          }
        });

        const isThin = isThinUnitRoute(meta, curr, subj, unitLabel);
        const redirectTarget = isThin ? subjPath : unitPath;

        if (!isCie) {
          const unitCode = getUnitCodeFromLabel(unitLabel);
          if (unitCode) {
            const codeSlug = unitCode.toLowerCase();
            addRedirect(`/${currSlug}/${subjSlug}/${codeSlug}`, redirectTarget);
            if (isLegacy) {
              addRedirect(`/${currSlug}/${subjSlug}/unit-${codeSlug}`, redirectTarget);
            }
          }
          const parenMatch = unitLabel.match(/\(([A-Z0-9]{2,6})\)/i);
          if (parenMatch) {
            addRedirect(`/${currSlug}/${subjSlug}/${parenMatch[1].toLowerCase()}`, redirectTarget);
          }
          if (!isLegacy) {
            const unitNumMatch = unitLabel.match(/\bUnit\s+([1-6])\b/i);
            if (unitNumMatch) {
              addRedirect(`/${currSlug}/${subjSlug}/u${unitNumMatch[1]}`, redirectTarget);
              addRedirect(`/${currSlug}/${subjSlug}/unit-${unitNumMatch[1]}`, redirectTarget);
            }
          }
        } else if (!isLegacy) {
          const ciePaperMatch = unitLabel.match(/\bPaper\s+([1-7])\b/i);
          if (ciePaperMatch) {
            addRedirect(`/${currSlug}/${subjSlug}/p${ciePaperMatch[1]}`, redirectTarget);
            addRedirect(`/${currSlug}/${subjSlug}/paper-${ciePaperMatch[1]}`, redirectTarget);
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

function groupSubjectSittingsForHtml(items, limit = 45) {
  const sittingMap = new Map();
  for (const item of items) {
    const key = `${item.session || item.year || item.name}|${item.cleanUnitLabel || ''}`;
    let grp = sittingMap.get(key);
    if (!grp) {
      grp = {
        sortKey: Number(item.sortKey) || (Number(item.year) || 0) * 100,
        session: item.session || (item.year ? `Year ${item.year}` : item.name),
        unitLabel: item.cleanUnitLabel || item.unitCode || '',
        variants: new Set(),
        docTypes: new Set()
      };
      sittingMap.set(key, grp);
    }
    if (item.variant) grp.variants.add(item.variant);
    if (item.docType) grp.docTypes.add(item.docType);
  }
  return [...sittingMap.values()]
    .sort((a, b) => b.sortKey - a.sortKey || a.session.localeCompare(b.session) || a.unitLabel.localeCompare(b.unitLabel))
    .slice(0, limit);
}

function buildStaticSemanticBody(route, seo, meta, indexLookup) {
  const {
    activeBoard = 'edexcel',
    filterCurriculum = '',
    filterSubject = '',
    filterUnit = '',
    filterDocType = null,
    forceShowTable = false,
    currentTab = 'library'
  } = route.state;
  const isCieRoute = isCambridgeCurriculum(filterCurriculum) || (!filterCurriculum && activeBoard === 'cambridge');
  const links = [];
  const itemEntries = [];
  const legacyNote = getLegacyEquivalentsForState({ filterCurriculum, filterSubject, filterUnit });
  const faqEntries = buildRouteFaqEntries({
    currentTab,
    activeBoard,
    scopeAllBoards: Boolean(route.state.scopeAllBoards),
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterDocType,
    notFound: Boolean(route.state.notFound),
    meta
  });

  if (currentTab === 'about') {
    itemEntries.push(
      '<li><strong>Archive Scope:</strong> Independent international exam repository covering Pearson Edexcel (IAL &amp; IGCSE) and Cambridge International (AS &amp; A Level, IGCSE &amp; O Level).</li>',
      '<li><strong>In-Browser Study Tools:</strong> Side-by-side Question Paper and Mark Scheme Split View, QP + Insert reading, Grade Thresholds (GT), Resizable Two-Page Book Spread reader, chapter-by-chapter ZIP Worked Solution Bank viewer, and Listening Audio player with synced closed captions (CC).</li>',
      '<li><strong>Core Team:</strong> Nafiz.R (Founder &amp; Lead Architect), Nazmul.K (Co-Founder &amp; Systems Lead), Jemison Flaren (Systems Architect), Gemin Arghen (Infrastructure Engineer), Claudis Oppen (Research &amp; Intelligence Lead), Gemin Faure Hidrojen (Intern, Optimizer).</li>',
      '<li><strong>Educational Notice:</strong> Independent student study archive; not affiliated with or endorsed by Pearson plc/Edexcel or Cambridge University Press &amp; Assessment (CAIE).</li>'
    );
    links.push(
      '<li><a href="/papers">All Edexcel Past Papers</a></li>',
      '<li><a href="/ial">Edexcel International A-Level (IAL) Past Papers</a></li>',
      '<li><a href="/igcse">Edexcel International GCSE (IGCSE) Past Papers</a></li>',
      '<li><a href="/cambridge">Cambridge International (AS &amp; A Level, IGCSE &amp; O Level) Past Papers</a></li>',
      '<li><a href="/cambridge/papers">All Cambridge Past Papers</a></li>',
      '<li><a href="/textbooks">Edexcel &amp; Cambridge Textbooks &amp; Solution Banks</a></li>',
      '<li><a href="/textbooks/cambridge">Cambridge International Coursebooks &amp; Workbooks</a></li>',
      '<li><a href="/audio">Listening Audio Archive with Synced Subtitles</a></li>',
      '<li><a href="/data-files">IT &amp; Computer Science Practical Data Files</a></li>',
      '<li><a href="/changelog">Site Changelog &amp; Archive Updates</a></li>'
    );
  } else if (currentTab === 'changelog') {
    for (const entry of CHANGELOG_HISTORY.slice(0, 8)) {
      itemEntries.push(
        `<li><strong>${escapeHtml(entry.version)}:</strong> ${escapeHtml(entry.title)}: ${escapeHtml(entry.summary)}</li>`
      );
    }
    links.push(
      '<li><a href="/papers">Browse All Edexcel IAL &amp; IGCSE Past Papers</a></li>',
      '<li><a href="/cambridge/papers">Browse All Cambridge International Past Papers</a></li>',
      '<li><a href="/textbooks">Browse Textbooks &amp; Worked Solution Banks</a></li>',
      '<li><a href="/audio">Listening Audio Archive</a></li>',
      '<li><a href="/data-files">IT &amp; CS Practical Data Files</a></li>',
      '<li><a href="/about">About Conceptualist Systems</a></li>'
    );
  } else if (filterDocType === 'Book') {
    let bookItems = indexLookup?.booksAll || [];
    if (!route.state.scopeAllBoards && !filterCurriculum) {
      const targetB = route.state.activeBoard || 'edexcel';
      bookItems = bookItems.filter(b => getBoardForCurriculum(b.curriculum) === targetB);
    }
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
    links.push(
      '<li><a href="/textbooks">All Edexcel &amp; Cambridge Textbooks</a></li>',
      '<li><a href="/textbooks/edexcel">Edexcel IAL &amp; IGCSE Textbooks &amp; Solution Banks</a></li>',
      '<li><a href="/textbooks/ial">Edexcel IAL Textbooks &amp; Worked Solution Banks</a></li>',
      '<li><a href="/textbooks/igcse">Edexcel IGCSE (9-1) Student Textbooks</a></li>',
      '<li><a href="/textbooks/cambridge">Cambridge International Coursebooks &amp; Workbooks</a></li>',
      '<li><a href="/textbooks/cambridge/a-level">Cambridge AS &amp; A Level Coursebooks</a></li>',
      '<li><a href="/textbooks/cambridge/igcse">Cambridge IGCSE Coursebooks</a></li>',
      '<li><a href="/textbooks/cambridge/o-level">Cambridge O Level Textbooks</a></li>'
    );
    if (indexLookup?.booksByCurrSubj) {
      for (const key of [...indexLookup.booksByCurrSubj.keys()].sort()) {
        const [bCurr, bSubj] = key.split('::');
        if (!route.state.scopeAllBoards && !filterCurriculum && getBoardForCurriculum(bCurr) !== (route.state.activeBoard || 'edexcel')) {
          continue;
        }
        links.push(
          `<li><a href="/textbooks/${getCurriculumSlug(bCurr)}/${getSubjectSlug(bSubj)}">${escapeHtml(`${bCurr} ${formatSubjectName(bSubj)} Textbooks & Solutions`)}</a></li>`
        );
      }
    }
    if (filterSubject && filterCurriculum) {
      links.unshift(
        `<li><a href="/${getCurriculumSlug(filterCurriculum)}/${getSubjectSlug(filterSubject)}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} Past Papers & Mark Schemes`)}</a></li>`
      );
      const tbUnitsObj = meta?.wizard?.[filterCurriculum]?.[filterSubject]?.units || {};
      const tbCurrSlug = getCurriculumSlug(filterCurriculum);
      const tbSubjSlug = getSubjectSlug(filterSubject);
      const tbIsCie = isCambridgeCurriculum(filterCurriculum);
      for (const u of Object.keys(tbUnitsObj).sort((a, b) => compareUnitLabels(a, b, filterSubject))) {
        if (isThinUnitRoute(meta, filterCurriculum, filterSubject, u)) continue;
        links.push(
          `<li><a href="/${tbCurrSlug}/${tbSubjSlug}/${getUnitSlug(u, { isCambridge: tbIsCie })}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} ${u} Past Papers`)}</a></li>`
        );
      }
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
      '<li><a href="/cambridge/igcse/ict-0417">Cambridge IGCSE ICT (0417) Past Papers &amp; Source Files</a></li>',
      '<li><a href="/cambridge/a-level/information-technology-9626">Cambridge AS &amp; A Level IT (9626) Past Papers &amp; Data Files</a></li>',
      '<li><a href="/cambridge/a-level/computer-science-9618">Cambridge AS &amp; A Level Computer Science (9618) Past Papers</a></li>',
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
      '<li><a href="/igcse/swahili">Edexcel IGCSE Swahili (4SW1) Past Papers &amp; Listening Audio</a></li>',
      '<li><a href="/cambridge/igcse/english-as-a-second-language-0510">Cambridge IGCSE English as a Second Language (0510) Listening Audio</a></li>',
      '<li><a href="/cambridge/igcse/french-0520">Cambridge IGCSE French (0520) Listening Audio</a></li>',
      '<li><a href="/cambridge/igcse/german-0525">Cambridge IGCSE German (0525) Listening Audio</a></li>',
      '<li><a href="/cambridge/igcse/spanish-0530">Cambridge IGCSE Spanish (0530) Listening Audio</a></li>',
      '<li><a href="/cambridge/igcse/mandarin-chinese-0547">Cambridge IGCSE Mandarin Chinese (0547) Listening Audio</a></li>'
    );
  } else if (filterSubject && filterCurriculum && filterUnit) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    const subjSlug = getSubjectSlug(filterSubject);
    const subjItems = indexLookup?.byCurrSubj?.get(`${filterCurriculum}::${filterSubject}`) || [];
    const unitItems = subjItems.filter(it => it.cleanUnitLabel === filterUnit);
    for (const grp of groupSittingsForHtml(unitItems, 90)) {
      const dtLabels = ['QP', 'MS', 'ER', 'GT', 'SC', 'AUD', 'DF', 'SAM', 'SOL']
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
      if (isThinUnitRoute(meta, filterCurriculum, filterSubject, sibUnit)) continue;
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(sibUnit, { isCambridge: isCieRoute })}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} ${sibUnit} Past Papers`)}</a></li>`
      );
    }
  } else if (filterSubject && filterCurriculum) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    const subjSlug = getSubjectSlug(filterSubject);
    const unitsObj = meta?.wizard?.[filterCurriculum]?.[filterSubject]?.units || {};
    for (const u of Object.keys(unitsObj).sort((a, b) => compareUnitLabels(a, b, filterSubject))) {
      if (isThinUnitRoute(meta, filterCurriculum, filterSubject, u)) continue;
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(u, { isCambridge: isCieRoute })}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} ${u} Past Papers & Mark Schemes`)}</a></li>`
      );
    }
    if (indexLookup?.booksByCurrSubj?.has(`${filterCurriculum}::${filterSubject}`)) {
      links.push(
        `<li><a href="/textbooks/${currSlug}/${subjSlug}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(filterSubject)} Textbooks & Solutions`)}</a></li>`
      );
    }
    const subjItems = indexLookup?.byCurrSubj?.get(`${filterCurriculum}::${filterSubject}`) || [];
    for (const grp of groupSubjectSittingsForHtml(subjItems, 45)) {
      const dtLabels = ['QP', 'MS', 'ER', 'GT', 'SC', 'AUD', 'DF', 'SAM', 'SOL']
        .filter(t => grp.docTypes.has(t))
        .map(t => DOC_TYPE_HUMAN[t] || t);
      const variantList = [...grp.variants].filter(Boolean).sort();
      const variantSuffix = variantList.length > 0 ? ` [${variantList.join(', ')}]` : '';
      itemEntries.push(
        `<li><strong>${escapeHtml(grp.session)}${grp.unitLabel ? ` (${escapeHtml(grp.unitLabel)})` : ''}${escapeHtml(variantSuffix)}</strong>: ${escapeHtml(dtLabels.join(', '))}</li>`
      );
    }
  } else if (filterCurriculum) {
    const currSlug = getCurriculumSlug(filterCurriculum);
    links.push(
      `<li><a href="/textbooks/${currSlug}">${escapeHtml(`${filterCurriculum} ${isCieRoute ? 'Coursebooks & Textbooks' : 'Textbooks & Worked Solution Banks'}`)}</a></li>`
    );
    const subjectsObj = meta?.wizard?.[filterCurriculum] || {};
    for (const s of Object.keys(subjectsObj).sort()) {
      const subjSlug = getSubjectSlug(s);
      links.push(
        `<li><a href="/${currSlug}/${subjSlug}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(s)} Past Papers & Mark Schemes`)}</a></li>`
      );
      const uKeys = Object.keys(subjectsObj[s]?.units || {}).filter((u) => !isThinUnitRoute(meta, filterCurriculum, s, u));
      if (uKeys.length <= 3) {
        for (const u of uKeys) {
          links.push(
            `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(u, { isCambridge: isCieRoute })}">${escapeHtml(`${filterCurriculum} ${formatSubjectName(s)} ${u} Past Papers`)}</a></li>`
          );
        }
      }
    }
  } else if (currentTab === 'library') {
    const isCieHome = route.state.activeBoard === 'cambridge';
    if (isCieHome) {
      links.push(
        ...(route.path !== '/cambridge' ? ['<li><a href="/cambridge">Cambridge International Archive Hub</a></li>'] : []),
        '<li><a href="/cambridge/papers">All Cambridge International Past Papers</a></li>',
        '<li><a href="/cambridge/a-level">Cambridge International AS &amp; A Level Past Papers</a></li>',
        '<li><a href="/cambridge/igcse">Cambridge IGCSE Past Papers (A*-G &amp; 9-1)</a></li>',
        '<li><a href="/cambridge/o-level">Cambridge O Level Past Papers</a></li>',
        '<li><a href="/textbooks/cambridge">Cambridge International Coursebooks &amp; Textbooks</a></li>',
        '<li><a href="/papers">Edexcel IAL &amp; IGCSE Past Papers</a></li>',
        '<li><a href="/textbooks">All International Textbooks &amp; Solution Banks</a></li>',
        '<li><a href="/textbooks/edexcel">Edexcel Textbooks &amp; Solution Banks</a></li>',
        '<li><a href="/audio">Listening Audio Archive</a></li>',
        '<li><a href="/data-files">IT &amp; CS Practical Data Files</a></li>',
        '<li><a href="/about">About Conceptualist Systems</a></li>',
        '<li><a href="/changelog">Site Changelog &amp; Release History</a></li>'
      );
      for (const curr of ['Cambridge AS & A Level', 'Cambridge IGCSE', 'Cambridge O Level']) {
        const currSlug = getCurriculumSlug(curr);
        const subjectsObj = meta?.wizard?.[curr] || {};
        for (const s of Object.keys(subjectsObj).sort()) {
          const subjSlug = getSubjectSlug(s);
          links.push(
            `<li><a href="/${currSlug}/${subjSlug}">${escapeHtml(`${curr} ${formatSubjectName(s)} Past Papers`)}</a></li>`
          );
          const uKeys = Object.keys(subjectsObj[s]?.units || {}).filter((u) => !isThinUnitRoute(meta, curr, s, u));
          if (uKeys.length <= 2) {
            for (const u of uKeys) {
              links.push(
                `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(u, { isCambridge: true })}">${escapeHtml(`${curr} ${formatSubjectName(s)} ${u} Past Papers`)}</a></li>`
              );
            }
          }
        }
      }
    } else {
      links.push(
        ...(route.path !== '/papers' ? ['<li><a href="/papers">All Edexcel IAL &amp; IGCSE Past Papers</a></li>'] : []),
        '<li><a href="/ial">Edexcel International A-Level (IAL) Hub</a></li>',
        '<li><a href="/igcse">Edexcel International GCSE (IGCSE) Hub</a></li>',
        '<li><a href="/cambridge">Cambridge International (CAIE) Past Papers Archive</a></li>',
        '<li><a href="/cambridge/papers">All Cambridge International Past Papers</a></li>',
        '<li><a href="/cambridge/a-level">Cambridge International AS &amp; A Level Past Papers</a></li>',
        '<li><a href="/cambridge/igcse">Cambridge IGCSE Past Papers</a></li>',
        '<li><a href="/cambridge/o-level">Cambridge O Level Past Papers</a></li>',
        '<li><a href="/textbooks">All International Textbooks &amp; Solution Banks</a></li>',
        '<li><a href="/textbooks/edexcel">Edexcel IAL &amp; IGCSE Textbooks &amp; Solution Banks</a></li>',
        '<li><a href="/textbooks/ial">Edexcel IAL Textbooks &amp; Worked Solution Banks</a></li>',
        '<li><a href="/textbooks/igcse">Edexcel IGCSE (9-1) Student Textbooks</a></li>',
        '<li><a href="/audio">Listening Audio Archive with Synced Subtitles</a></li>',
        '<li><a href="/data-files">IT &amp; Computer Science Practical Data Files</a></li>',
        '<li><a href="/about">About Conceptualist Systems</a></li>',
        '<li><a href="/changelog">Site Changelog &amp; Release History</a></li>'
      );
      for (const curr of ['Edexcel IAL', 'Edexcel IGCSE']) {
        const currSlug = getCurriculumSlug(curr);
        const subjectsObj = meta?.wizard?.[curr] || {};
        for (const s of Object.keys(subjectsObj).sort()) {
          const subjSlug = getSubjectSlug(s);
          links.push(
            `<li><a href="/${currSlug}/${subjSlug}">${escapeHtml(`${curr} ${formatSubjectName(s)} Past Papers`)}</a></li>`
          );
          const uKeys = Object.keys(subjectsObj[s]?.units || {}).filter((u) => !isThinUnitRoute(meta, curr, s, u));
          if (uKeys.length <= 2) {
            for (const u of uKeys) {
              links.push(
                `<li><a href="/${currSlug}/${subjSlug}/${getUnitSlug(u)}">${escapeHtml(`${curr} ${formatSubjectName(s)} ${u} Past Papers`)}</a></li>`
              );
            }
          }
        }
      }
    }
  }

  const uniqueItemEntries = [...new Set(itemEntries)];
  const selfHrefToken = `href="${route.path}"`;
  const uniqueLinks = [...new Set(links)].filter((li) => !li.includes(selfHrefToken));

  const faqHtml = faqEntries.length > 0
    ? `<section aria-label="Frequently Asked Questions"><h2>Frequently Asked Questions</h2>${faqEntries.map(f => `<article><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></article>`).join('\n        ')}</section>`
    : '';

  return `<main class="seo-prerender-shell" style="max-width:1160px;margin:24px auto;padding:20px 16px;font-family:'Roboto',system-ui,-apple-system,sans-serif;color:var(--text-primary,#1A1D20);background:var(--bg-surface,#FFFFFF);border-top:3px solid var(--mcmaster-maroon,#6F1D2B);box-sizing:border-box;">
      <nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:12px;">
        <a href="/" style="color:inherit;">Conceptualist Library Home</a>
        ${isCieRoute && !filterDocType ? ' / <a href="/cambridge" style="color:inherit;">Cambridge International</a>' : ''}
        ${isCieRoute && forceShowTable && !filterCurriculum && !filterSubject && !filterDocType ? ' / <span>All Cambridge Past Papers</span>' : ''}
        ${!isCieRoute && forceShowTable && !filterCurriculum && !filterSubject && !filterDocType ? ' / <span>All Past Papers</span>' : ''}
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
          <a href="/papers">Edexcel Past Papers</a> |
          <a href="/ial">Edexcel IAL</a> |
          <a href="/igcse">Edexcel IGCSE</a> |
          <a href="/cambridge">Cambridge International</a> |
          <a href="/cambridge/papers">Cambridge Papers</a> |
          <a href="/cambridge/a-level">Cambridge A-Level</a> |
          <a href="/cambridge/igcse">Cambridge IGCSE</a> |
          <a href="/cambridge/o-level">Cambridge O Level</a> |
          <a href="/textbooks">Textbooks &amp; Solution Banks</a> |
          <a href="/textbooks/edexcel">Edexcel Textbooks</a> |
          <a href="/data-files">IT &amp; CS Data Files</a> |
          <a href="/audio">Listening Audio MP3s</a> |
          <a href="/about">About</a> |
          <a href="/changelog">Changelog</a>
        </p>
      </nav>
      ${uniqueItemEntries.length > 0 ? `<section><h2>Archived Documents &amp; Examination Sittings</h2><ul>${uniqueItemEntries.join('\n          ')}</ul></section>` : ''}
      ${uniqueLinks.length > 0 ? `<section><h2>Browse Related Subjects &amp; Resources</h2><ul>${uniqueLinks.join('\n          ')}</ul></section>` : ''}
    </main>`;
}

function setOrInsertTag(html, tagRegex, newTag) {
  if (tagRegex.test(html)) {
    return html.replace(tagRegex, newTag);
  }
  return html.replace(/<\/head>/i, `  ${newTag}\n  </head>`);
}

function buildInstantBootShell(seo) {
  return `<div class="app-boot-shell" aria-hidden="true">` +
    `<div class="boot-header"><div class="boot-brand">Conceptualist <span>Systems</span></div></div>` +
    `<div class="boot-search-bar"><div class="boot-search-pill"></div></div>` +
    `<div class="boot-main"><div class="boot-hero">` +
      `<div class="boot-title">${escapeHtml(seo.h1)}</div>` +
      `<p class="boot-subtitle">${escapeHtml(seo.subtitle || seo.description)}</p>` +
    `</div></div>` +
  `</div>`;
}

function injectSeoIntoHtml(templateHtml, route, meta, indexLookup) {
  const seo = getSeoMetadata({ ...route.state, meta });
  const jsonLd = buildJsonLd({ ...route.state, seo, meta });
  const staticBody = buildStaticSemanticBody(route, seo, meta, indexLookup);
  const bootShell = buildInstantBootShell(seo);
  const routeShard = getShardPathForRoute(route.state);
  const routeBoard = route.state.filterCurriculum
    ? getBoardForCurriculum(route.state.filterCurriculum)
    : (route.state.activeBoard || 'edexcel');
  const routeNeedsFull = Boolean(
    !routeShard &&
    route.state.currentTab === 'library' &&
    !route.state.notFound &&
    (route.state.forceShowTable || route.state.filterCurriculum || route.state.filterDocType)
  );

  let html = templateHtml;

  // Inject route-specific parallel early-fetch targets into <head> script
  html = html.replace(/__CS_ROUTE_SHARD__/g, routeShard || '');
  html = html.replace(/__CS_ROUTE_NEEDS_FULL__/g, routeNeedsFull ? '1' : '0');
  html = html.replace(/__CS_ROUTE_BOARD__/g, routeBoard || 'edexcel');

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

  // Remove obsolete meta keywords tag to keep pre-rendered HTML lean
  html = html.replace(/\s*<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/gi, '');

  // Replace or inject canonical when indexable or when a thin route provides a consolidating parent canonical
  if (String(seo.robots || '').includes('noindex') && !seo.consolidatingCanonical) {
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
  if (routeBoard === 'cambridge') {
    html = setOrInsertTag(
      html,
      /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/?>/i,
      '<meta property="og:image:alt" content="Conceptualist Systems: Cambridge International IGCSE, O Level &amp; A-Level Past Papers Reader" />'
    );
  }

  // Inject JSON-LD before </head> (escape '<' so embedded strings can never terminate the script element)
  const jsonLdScript = `  <script id="seo-json-ld" type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n  </head>`;
  html = html.replace(/<\/head>/i, jsonLdScript);

  // Inject crawlable semantic HTML directly inside <div id="root">...</div> (without <noscript>!)
  // so non-JS AI search crawlers (OAI-SearchBot, PerplexityBot, ClaudeBot, GPTBot), Bingbot, and Googlebot Wave-1
  // index real visible DOM headings, Q&As, sittings, and internal links, while JS browsers paint .app-boot-shell
  // immediately until React createRoot mounts the full interactive UI.
  html = html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root">${bootShell}${staticBody}</div>`
  );

  return html;
}

function generateLlmsTxt(meta, indexLookup) {
  const uniqueFiles = meta?.uniqueFiles || meta?.totalFiles || 16051;
  const totalFiles = meta?.totalFiles || 19912;
  const booksCount = indexLookup?.booksAll?.length || Object.keys(BOOK_CATALOG_BY_PATH).length || 73;
  const audioCount = indexLookup?.audioAll?.length || 272;
  const dfCount = indexLookup?.dfAll?.length || 46;
  const ialSubjects = Object.keys(meta?.wizard?.['Edexcel IAL'] || {}).sort();
  const igcseSubjects = Object.keys(meta?.wizard?.['Edexcel IGCSE'] || {}).sort();
  const cieAlSubjects = Object.keys(meta?.wizard?.['Cambridge AS & A Level'] || {}).sort();
  const cieIgcseSubjects = Object.keys(meta?.wizard?.['Cambridge IGCSE'] || {}).sort();
  const cieOlSubjects = Object.keys(meta?.wizard?.['Cambridge O Level'] || {}).sort();

  const lines = [
    '# Conceptualist Systems: International Exam Past Papers & Textbooks Library',
    '',
    `> Independent international exam study archive; not affiliated with, endorsed by, or sponsored by Pearson plc / Edexcel or Cambridge University Press & Assessment (CAIE). Conceptualist Systems (${SITE_URL}) is a free, zero-ad academic archive indexing ${uniqueFiles.toLocaleString()} unique Pearson Edexcel (IAL & IGCSE) and Cambridge International (AS & A Level, IGCSE & O Level) Question Papers (QP), Mark Schemes (MS), Examiner Reports (ER), Grade Thresholds (GT), Inserts (IN), ${booksCount} Student Textbooks & Worked Solution Banks, ${audioCount} Listening Audio tracks with synced closed captions (CC), and ${dfCount} practical Data Files (${totalFiles.toLocaleString()} total archived files).`,
    '',
    '## Core Platform Capabilities',
    '- **Board Switcher Architecture:** Isolated switching between Pearson Edexcel International (IAL & IGCSE) and Cambridge International (AS & A Level, IGCSE & O Level) with zero cross-board search collisions.',
    '- **Side-by-Side Split View Reader:** Open paired Question Papers (QP) alongside Mark Schemes (MS) or Cambridge Inserts (IN), plus one-click Grade Thresholds (GT) and Examiner Reports (ER).',
    '- **Resizable Two-Page Book Spread Mode:** Read student textbooks and standalone past papers in a 2-Page side-by-side spread with Pure OLED and Academic Dark reading modes.',
    '- **In-Browser Worked Solution Bank Reader:** Stream all 14 Edexcel IAL Mathematics Worked Solution Banks (P1-P4, M1-M3, S1-S3, D1, FP1-FP3) chapter-by-chapter directly in the browser.',
    '- **Synced Listening Audio & Subtitles (CC):** Play MP3 and multi-track ZIP listening examinations above the Question Paper with clickable time-synced transcripts.',
    '',
    '## Primary Archive Hubs',
    `- [Library Homepage](${SITE_URL}/): Interactive subject, unit, and examination year navigator.`,
    `- [All Edexcel Past Papers](${SITE_URL}/papers): Searchable Pearson Edexcel catalog.`,
    `- [Edexcel IAL Past Papers](${SITE_URL}/ial): ${ialSubjects.length} International A-Level subjects.`,
    `- [Edexcel IGCSE Past Papers](${SITE_URL}/igcse): ${igcseSubjects.length} International GCSE (9-1, Regional R, and Modular 4W*) subjects.`,
    `- [Cambridge International Hub](${SITE_URL}/cambridge): Cambridge AS & A Level (${cieAlSubjects.length}), IGCSE (${cieIgcseSubjects.length}), and O Level (${cieOlSubjects.length}) subjects.`,
    `- [All Cambridge Past Papers](${SITE_URL}/cambridge/papers): Searchable Cambridge International (CAIE) catalog.`,
    `- [Cambridge AS & A Level](${SITE_URL}/cambridge/a-level): International AS & A Level past papers, mark schemes & grade thresholds.`,
    `- [Cambridge IGCSE](${SITE_URL}/cambridge/igcse): Cambridge IGCSE (A*-G & 9-1 equivalents) past papers, inserts & grade thresholds.`,
    `- [Cambridge O Level](${SITE_URL}/cambridge/o-level): Cambridge O Level past papers, mark schemes & grade thresholds.`,
    `- [All International Textbooks & Solution Banks](${SITE_URL}/textbooks): ${booksCount} Edexcel & Cambridge student books, coursebooks, workbooks, lab books, and IAL Maths Solution Banks.`,
    `- [Edexcel Textbooks & Solution Banks](${SITE_URL}/textbooks/edexcel): Pearson Edexcel IAL & IGCSE student books, answer PDFs, and Worked Solution Banks.`,
    `- [Cambridge International Textbooks](${SITE_URL}/textbooks/cambridge): Cambridge AS & A Level, IGCSE & O Level coursebooks, workbooks & revision guides.`,
    `- [Listening Audio Archive (MP3 & Live CC)](${SITE_URL}/audio): ${audioCount} listening audio tracks and synced transcripts.`,
    `- [IT & Computer Science Practical Data Files](${SITE_URL}/data-files): ${dfCount} practical exam source ZIPs.`,
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
    ''
  ];

  if (cieAlSubjects.length > 0) {
    lines.push(`## Cambridge International AS & A Level Subjects (${cieAlSubjects.length})`);
    for (const s of cieAlSubjects) {
      const sObj = meta?.wizard?.['Cambridge AS & A Level']?.[s] || {};
      lines.push(`- [Cambridge AS & A Level ${s}](${SITE_URL}/cambridge/a-level/${getSubjectSlug(s)}): ${sObj.totalFiles || 0} unique files.`);
    }
    lines.push('');
  }
  if (cieIgcseSubjects.length > 0) {
    lines.push(`## Cambridge IGCSE Subjects (${cieIgcseSubjects.length})`);
    for (const s of cieIgcseSubjects) {
      const sObj = meta?.wizard?.['Cambridge IGCSE']?.[s] || {};
      lines.push(`- [Cambridge IGCSE ${s}](${SITE_URL}/cambridge/igcse/${getSubjectSlug(s)}): ${sObj.totalFiles || 0} unique files.`);
    }
    lines.push('');
  }
  if (cieOlSubjects.length > 0) {
    lines.push(`## Cambridge O Level Subjects (${cieOlSubjects.length})`);
    for (const s of cieOlSubjects) {
      const sObj = meta?.wizard?.['Cambridge O Level']?.[s] || {};
      lines.push(`- [Cambridge O Level ${s}](${SITE_URL}/cambridge/o-level/${getSubjectSlug(s)}): ${sObj.totalFiles || 0} unique files.`);
    }
    lines.push('');
  }

  lines.push(
    '## Subject Textbooks & Solution Bank Collections',
    ...[...(indexLookup?.booksByCurrSubj?.keys() || [])].sort().map((key) => {
      const [curr, subj] = key.split('::');
      const list = indexLookup.booksByCurrSubj.get(key) || [];
      return `- [${curr} ${formatSubjectName(subj)} Textbooks & Solutions](${SITE_URL}/textbooks/${getCurriculumSlug(curr)}/${getSubjectSlug(subj)}): ${list.length} ${list.length === 1 ? 'book/solution bank' : 'books/solution banks'}.`;
    }),
    ''
  );

  return lines.join('\n');
}

function computeRouteLastmod(route, defaultLastmod, indexLookup) {
  const clampDate = (isoDate) => (isoDate && isoDate <= defaultLastmod ? isoDate : defaultLastmod);
  const st = route.state || {};
  if (st.currentTab === 'changelog') {
    const latestChangelog = CHANGELOG_HISTORY[0]?.date;
    if (typeof latestChangelog === 'string' && /^\d{4}-\d{2}-\d{2}/.test(latestChangelog)) {
      return clampDate(latestChangelog.slice(0, 10));
    }
    return defaultLastmod;
  }
  if (st.filterDocType === 'Book' && st.filterSubject) {
    const curr = inferCurriculumForSubject(st.filterSubject, st.filterCurriculum);
    const books = indexLookup?.booksByCurrSubj?.get(`${curr}::${st.filterSubject}`) || [];
    const maxYear = books.reduce((mx, b) => Math.max(mx, Number(b.year) || 0), 0);
    if (maxYear >= 2000 && maxYear <= 2100) {
      return clampDate(`${maxYear}-09-01`);
    }
    return defaultLastmod;
  }
  if (st.filterSubject && !st.filterDocType) {
    const curr = inferCurriculumForSubject(st.filterSubject, st.filterCurriculum);
    let items = indexLookup?.byCurrSubj?.get(`${curr}::${st.filterSubject}`) || [];
    if (st.filterUnit) {
      items = items.filter((item) => item.cleanUnitLabel === st.filterUnit);
    }
    const maxSortKey = items.reduce((mx, item) => Math.max(mx, Number(item.sortKey) || 0), 0);
    if (maxSortKey >= 200000) {
      const yr = Math.floor(maxSortKey / 100);
      const mo = Math.max(1, Math.min(12, (maxSortKey % 100) || 6));
      return clampDate(`${yr}-${String(mo).padStart(2, '0')}-01`);
    }
  }
  return defaultLastmod;
}

function generateSitemapXml(routes, defaultLastmod, meta, indexLookup) {
  const sitemapRoutes = routes.filter((r) => {
    if (!r.includeInSitemap) return false;
    const seo = getSeoMetadata({ ...r.state, meta });
    return !String(seo.robots || '').includes('noindex');
  });
  const urlEntries = sitemapRoutes.map(r => {
    const loc = r.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${r.path}`;
    const routeLastmod = computeRouteLastmod(r, defaultLastmod, indexLookup);
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${routeLastmod}</lastmod>
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
  const cieIndexPath = path.join(PUBLIC_DIR, 'index-cambridge.json');
  const rawEdexcelIndex = fs.existsSync(indexPath)
    ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    : null;
  const rawCieIndex = fs.existsSync(cieIndexPath)
    ? JSON.parse(fs.readFileSync(cieIndexPath, 'utf8'))
    : null;
  const unpackedEdexcel = unpackIndexFile(rawEdexcelIndex);
  const unpackedCie = unpackIndexFile(rawCieIndex);
  const indexLookup = buildIndexLookup([...unpackedEdexcel.items, ...unpackedCie.items]);

  const { routes, aliasRedirects } = collectAllRoutes(meta, indexLookup);
  const lastmodDate = new Date().toISOString().split('T')[0];

  const sortedAllRedirects = [...aliasRedirects].sort((a, b) => a.source.localeCompare(b.source));
  const redirectEntries = sortedAllRedirects
    .map((r) => `  ${JSON.stringify(r.source)}: ${JSON.stringify(r.destination)}`)
    .join(',\n');
  const redirectsModuleCode = `// Auto-generated by scripts/prerender-seo.js — do not edit manually.\nexport const REDIRECT_MAP = {\n${redirectEntries}\n};\n`;
  fs.writeFileSync(path.join(ROOT_DIR, 'api', '_redirects.js'), redirectsModuleCode, 'utf8');

  // Sync permanent 308 alias redirects, private allowlist function bundle, and inline <script> CSP SHA-256 into vercel.json
  const syncVercelConfig = (inlineScriptCspHash = '') => {
    if (!fs.existsSync(VERCEL_CONFIG_PATH)) return;
    try {
      const vercelCfg = JSON.parse(fs.readFileSync(VERCEL_CONFIG_PATH, 'utf8'));
      const sortedRedirects = [...aliasRedirects].sort((a, b) => a.source.localeCompare(b.source));
      const queryRedirects = ['paper', 'year', 'variant', 'type'].map((key) => ({
        source: '/((?!api/).*)',
        has: [{ type: 'query', key }],
        missing: [{ type: 'query', key: 'q' }],
        destination: '/api/redirect?__pathname=/$1',
        permanent: true
      }));
      vercelCfg.rewrites = [];
      vercelCfg.redirects = [...queryRedirects, ...sortedRedirects];
      if (vercelCfg.functions && vercelCfg.functions['api/*.js']) {
        vercelCfg.functions['api/*.js'].includeFiles = 'api/_allowlist.json';
      }
      if (Array.isArray(vercelCfg.headers)) {
        vercelCfg.headers = vercelCfg.headers.filter(
          (hRule) => !hRule.headers?.some((h) => h.key === 'X-Robots-Tag')
        );
        vercelCfg.headers.unshift({
          source: '/(.*)',
          has: [{ type: 'query', key: 'q' }],
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }]
        });
      }
      if (inlineScriptCspHash && Array.isArray(vercelCfg.headers)) {
        for (const hRule of vercelCfg.headers) {
          for (const h of hRule.headers || []) {
            if (h.key === 'Content-Security-Policy' && typeof h.value === 'string') {
              h.value = h.value.replace(/'sha256-[A-Za-z0-9+/=]+'/g, `'sha256-${inlineScriptCspHash}'`);
            }
          }
        }
      }
      fs.writeFileSync(VERCEL_CONFIG_PATH, JSON.stringify(vercelCfg, null, 2) + '\n', 'utf8');
      console.log(`✅ Synced ${sortedRedirects.length} permanent redirects${inlineScriptCspHash ? ` + CSP sha256-${inlineScriptCspHash}` : ''} into vercel.json.`);
    } catch (err) {
      console.warn('⚠️ Could not sync vercel.json:', err.message);
    }
  };
  syncVercelConfig();

  // 1. Write public/sitemap.xml & public/llms.txt
  const sitemapXml = generateSitemapXml(routes, lastmodDate, meta, indexLookup);
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
    const inlineScriptMatch = templateHtml.match(/<script>([\s\S]*?)<\/script>/i);
    if (inlineScriptMatch) {
      const cspSha256 = crypto.createHash('sha256').update(inlineScriptMatch[1], 'utf8').digest('base64');
      syncVercelConfig(cspSha256);
    }

    // Copy updated sitemap.xml, llms.txt & robots.txt to dist/
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'llms.txt'), llmsTxt, 'utf8');
    if (fs.existsSync(path.join(PUBLIC_DIR, 'robots.txt'))) {
      fs.copyFileSync(path.join(PUBLIC_DIR, 'robots.txt'), path.join(DIST_DIR, 'robots.txt'));
    }

    const rawIndexesForShards = [rawEdexcelIndex, rawCieIndex].filter(Boolean);
    if (rawIndexesForShards.length > 0) {
      const shardCount = writeDistShards(rawIndexesForShards);
      console.log(`✅ Generated ${shardCount} fast route JSON shards in dist/shards/.`);
    }

    // Detect lazy WelcomePage assets so ONLY `/` (dist/index.html) preloads them in round-trip 1
    // (eliminating the 2-RTT 4G waterfall on home while keeping all 298 deep routes lean)
    const distAssetsDir = path.join(DIST_DIR, 'assets');
    const distAssetNames = fs.existsSync(distAssetsDir) ? fs.readdirSync(distAssetsDir) : [];
    const welcomeJsAsset = distAssetNames.find((f) => /^WelcomePage-.*\.js$/i.test(f)) || '';
    const welcomeCssAsset = distAssetNames.find((f) => /^WelcomePage-.*\.css$/i.test(f)) || '';
    const homePreloadTags = [
      welcomeJsAsset ? `    <link rel="modulepreload" crossorigin href="/assets/${welcomeJsAsset}">` : '',
      welcomeCssAsset ? `    <link rel="stylesheet" crossorigin href="/assets/${welcomeCssAsset}">` : ''
    ].filter(Boolean).join('\n');

    let prerenderedCount = 0;
    for (const route of routes) {
      let renderedHtml = injectSeoIntoHtml(templateHtml, route, meta, indexLookup);
      if (route.path === '/' || route.path === '/cambridge') {
        if (homePreloadTags) {
          const entryCssRe = /(<link\s+rel="stylesheet"\s+crossorigin\s+href="\/assets\/index-[^"]+\.css"\s*\/?>)/i;
          if (entryCssRe.test(renderedHtml)) {
            renderedHtml = renderedHtml.replace(entryCssRe, `$1\n${homePreloadTags}`);
          } else {
            renderedHtml = renderedHtml.replace(/<\/head>/i, `${homePreloadTags}\n  </head>`);
          }
        }
      }
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
