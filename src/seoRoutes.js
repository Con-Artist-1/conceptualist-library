// Full SEO Routing, Answer-Engine FAQ & Schema.org JSON-LD generator.
// Re-exports lightweight routeCore.js so build scripts keep identical imports while the browser lazy-loads JSON-LD.
import { BOOK_CATALOG_BY_PATH } from './bookCatalog.js';
import { getBoardForCurriculum, isCambridgeCurriculum } from './data/boards.js';
import {
  SITE_URL,
  isThinUnitRoute,
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  formatSubjectName,
  inferCurriculumForSubject,
  getArchiveCounts,
  buildRouteFaqEntries
} from './lib/routeCore.js';

export * from './lib/routeCore.js';

export function buildJsonLd({
  currentTab = 'library',
  activeBoard = 'edexcel',
  scopeAllBoards = false,
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterDocType = null,
  forceShowTable = false,
  seo,
  meta = null
}) {
  const { uniqueFiles, totalFiles } = getArchiveCounts(meta);
  const effBoard = filterCurriculum
    ? getBoardForCurriculum(filterCurriculum)
    : (activeBoard || 'edexcel');
  const isCie = !scopeAllBoards && effBoard === 'cambridge';

  const breadcrumbs = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Library Home',
      item: `${SITE_URL}/`
    }
  ];

  if (currentTab === 'about') {
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'About', item: `${SITE_URL}/about` });
  } else if (currentTab === 'changelog') {
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'Changelog', item: `${SITE_URL}/changelog` });
  } else if (filterDocType === 'DF' && !filterCurriculum && !filterSubject) {
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'IT & CS Data Files', item: `${SITE_URL}/data-files` });
  } else if (filterDocType === 'AUD' && !filterCurriculum && !filterSubject) {
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'Listening Audio MP3s', item: `${SITE_URL}/audio` });
  } else if (forceShowTable && !filterCurriculum && !filterSubject && !filterDocType) {
    if (isCie) {
      breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'Cambridge International', item: `${SITE_URL}/cambridge` });
      breadcrumbs.push({ '@type': 'ListItem', position: 3, name: 'All Cambridge Past Papers', item: `${SITE_URL}/cambridge/papers` });
    } else {
      breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'All Past Papers', item: `${SITE_URL}/papers` });
    }
  } else if (filterDocType === 'Book' && !filterUnit) {
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'Textbooks & Solutions', item: `${SITE_URL}/textbooks` });
    if (!filterCurriculum && !scopeAllBoards) {
      breadcrumbs.push({
        '@type': 'ListItem',
        position: 3,
        name: isCie ? 'Cambridge Textbooks' : 'Edexcel Textbooks',
        item: `${SITE_URL}/textbooks/${isCie ? 'cambridge' : 'edexcel'}`
      });
    } else if (filterCurriculum) {
      const currSlug = getCurriculumSlug(filterCurriculum);
      if (isCambridgeCurriculum(filterCurriculum)) {
        breadcrumbs.push({
          '@type': 'ListItem',
          position: breadcrumbs.length + 1,
          name: 'Cambridge Textbooks',
          item: `${SITE_URL}/textbooks/cambridge`
        });
      }
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: `${filterCurriculum} Textbooks`,
        item: `${SITE_URL}/textbooks/${currSlug}`
      });
      if (filterSubject) {
        const subjSlug = getSubjectSlug(filterSubject);
        breadcrumbs.push({
          '@type': 'ListItem',
          position: breadcrumbs.length + 1,
          name: `${formatSubjectName(filterSubject)} Books`,
          item: `${SITE_URL}/textbooks/${currSlug}/${subjSlug}`
        });
      }
    }
  } else {
    if (isCie) {
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: 'Cambridge International',
        item: `${SITE_URL}/cambridge`
      });
    }
    if (filterCurriculum) {
      const currSlug = getCurriculumSlug(filterCurriculum);
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: filterCurriculum,
        item: `${SITE_URL}/${currSlug}`
      });
    }
    if (filterSubject) {
      const currSlug = getCurriculumSlug(filterCurriculum || inferCurriculumForSubject(filterSubject, 'Edexcel IAL'));
      const subjSlug = getSubjectSlug(filterSubject);
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: `${filterCurriculum || inferCurriculumForSubject(filterSubject, 'Edexcel IAL')} ${formatSubjectName(filterSubject)}`,
        item: `${SITE_URL}/${currSlug}/${subjSlug}`
      });
    }
    if (filterSubject && filterUnit) {
      const currSlug = getCurriculumSlug(filterCurriculum || inferCurriculumForSubject(filterSubject, 'Edexcel IAL'));
      const subjSlug = getSubjectSlug(filterSubject);
      const unitSlug = getUnitSlug(filterUnit, { isCambridge: isCie });
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: filterUnit,
        item: `${SITE_URL}/${currSlug}/${subjSlug}/${unitSlug}`
      });
    }
  }

  const aboutOrg = isCie
    ? {
        '@type': 'EducationalOrganization',
        name: 'Cambridge International Education (AS & A Level, IGCSE & O Level)'
      }
    : {
        '@type': 'EducationalOrganization',
        name: 'Pearson Edexcel International Examinations (IAL & IGCSE)'
      };

  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'Conceptualist Systems — International Exam Past Papers & Textbooks Library',
      alternateName: ['Conceptualist Systems', 'Conceptualist Exam Archive'],
      description: `Independent international exam study archive indexing ${uniqueFiles.toLocaleString()}+ unique Pearson Edexcel (IAL & IGCSE) and Cambridge International (AS & A Level, IGCSE & O Level) past papers, mark schemes, examiner reports, grade thresholds, and textbooks (${totalFiles.toLocaleString()} archived files).`,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/?q={search_term_string}`
        },
        'query-input': 'required name=search_term_string'
      }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${seo.canonicalUrl}#breadcrumb`,
      itemListElement: breadcrumbs
    },
    {
      '@type': 'CollectionPage',
      '@id': `${seo.canonicalUrl}#webpage`,
      url: seo.canonicalUrl,
      name: seo.title,
      headline: seo.h1,
      description: seo.description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      breadcrumb: { '@id': `${seo.canonicalUrl}#breadcrumb` },
      about: aboutOrg
    }
  ];

  // Add ItemList of units/papers when on a Subject Past Papers page
  if (!filterDocType && filterSubject && !filterUnit && meta?.wizard) {
    const curr = filterCurriculum || inferCurriculumForSubject(filterSubject, 'Edexcel IAL');
    const currSlug = getCurriculumSlug(curr);
    const subjSlug = getSubjectSlug(filterSubject);
    const unitsObj = meta.wizard[curr]?.[filterSubject]?.units || {};
    const unitKeys = Object.keys(unitsObj).filter((u) => !isThinUnitRoute(meta, curr, filterSubject, u));
    if (unitKeys.length > 0) {
      graph.push({
        '@type': 'ItemList',
        name: `${curr} ${formatSubjectName(filterSubject)} ${isCie ? 'Papers & Components' : 'Units & Examination Papers'}`,
        numberOfItems: unitKeys.length,
        itemListElement: unitKeys.map((u, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${curr} ${formatSubjectName(filterSubject)} — ${u}`,
          url: `${SITE_URL}/${currSlug}/${subjSlug}/${getUnitSlug(u, { isCambridge: isCie })}`
        }))
      });
    }
  }

  // Add rich Book / CreativeWork ItemList on Textbook routes using verified ISBNs & authors from bookCatalog.js
  if (filterDocType === 'Book' && !filterUnit) {
    const matchingBooks = Object.entries(BOOK_CATALOG_BY_PATH).filter(([bookPath]) => {
      const isCieBook = bookPath.startsWith('Cambridge Books/');
      const bookBoard = isCieBook ? 'cambridge' : 'edexcel';
      const bookCurr = isCieBook
        ? (bookPath.startsWith('Cambridge Books/A-Level/')
            ? 'Cambridge AS & A Level'
            : bookPath.startsWith('Cambridge Books/O-Level/')
              ? 'Cambridge O Level'
              : 'Cambridge IGCSE')
        : (bookPath.startsWith('IGCSE Books/') ? 'Edexcel IGCSE' : 'Edexcel IAL');
      if (!scopeAllBoards && !filterCurriculum && bookBoard !== effBoard) return false;
      if (filterCurriculum && bookCurr !== filterCurriculum) return false;
      if (filterSubject) {
        if (isCieBook) {
          const cieSubjFolder = bookPath.split('/')[2] || '';
          if (cieSubjFolder !== filterSubject) return false;
        } else {
          const folderSubj = bookPath.split('/')[1] || '';
          const normFolder = folderSubj === 'Maths' ? (bookCurr === 'Edexcel IGCSE' ? 'Mathematics A' : 'Math')
            : folderSubj === 'Further Pure Maths' ? 'Further Pure Mathematics'
            : folderSubj;
          if (normFolder !== filterSubject) return false;
        }
      }
      return true;
    });
    if (matchingBooks.length > 0) {
      const parseAuthors = (rawAuthors) => {
        if (!rawAuthors) return null;
        const parts = String(rawAuthors)
          .split(/\s*,\s*|\s*&\s*|\s+and\s+/i)
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length === 0) return null;
        const toEntity = (name) => {
          const isOrg = /\b(pearson|edexcel|cambridge|education|press|publishing|limited|ltd|editorial)\b/i.test(name);
          return { '@type': isOrg ? 'Organization' : 'Person', name };
        };
        return parts.length === 1 ? toEntity(parts[0]) : parts.map(toEntity);
      };
      graph.push({
        '@type': 'ItemList',
        name: seo.h1,
        numberOfItems: matchingBooks.length,
        itemListElement: matchingBooks.map(([bookPath, bMeta], idx) => {
          const isZip = bookPath.toLowerCase().endsWith('.zip');
          const itemNode = {
            '@type': isZip ? 'CreativeWork' : 'Book',
            name: bMeta.title,
            inLanguage: 'en',
            url: `${seo.canonicalUrl}#paper=${encodeURIComponent(bookPath)}&view=${isZip ? 'SOL' : 'Book'}`
          };
          const parsedAuthor = parseAuthors(bMeta.authors);
          if (parsedAuthor) itemNode.author = parsedAuthor;
          if (bMeta.publisher) itemNode.publisher = { '@type': 'Organization', name: bMeta.publisher };
          if (bMeta.year) itemNode.datePublished = String(bMeta.year);
          if (bMeta.isbn) itemNode.isbn = bMeta.isbn;
          return {
            '@type': 'ListItem',
            position: idx + 1,
            item: itemNode
          };
        })
      });
    }
  }

  // Add Answer-Engine FAQPage schema when route has data-derived Q&As
  const faqEntries = buildRouteFaqEntries({
    currentTab,
    activeBoard: effBoard,
    scopeAllBoards,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterDocType,
    meta
  });
  if (faqEntries.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${seo.canonicalUrl}#faq`,
      mainEntity: faqEntries.map((entry) => ({
        '@type': 'Question',
        name: entry.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: entry.a
        }
      }))
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}
