// Full SEO Routing, Answer-Engine FAQ & Schema.org JSON-LD generator.
// Re-exports lightweight routeCore.js so build scripts keep identical imports while the browser lazy-loads JSON-LD.
import { BOOK_CATALOG_BY_PATH } from './bookCatalog.js';
import { getBoardForCurriculum, isCambridgeCurriculum } from './data/boards.js';
import { extractSyllabusCodeFromSubject, resolveCambridgeSyllabus } from './data/cambridgeCatalog.js';
import {
  SITE_URL,
  IGCSE_SPEC_CODES,
  LEGACY_IAL_UNIT_CODES,
  SUBJECT_LEGACY_SPEC_CODES,
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  formatSubjectName,
  getUnitCodeFromLabel,
  getLegacyEquivalentsForState,
  inferCurriculumForSubject,
  getUniqueOrderedUnitCodes,
  getArchiveCounts
} from './lib/routeCore.js';

export * from './lib/routeCore.js';

export function buildRouteFaqEntries({
  currentTab = 'library',
  activeBoard = 'edexcel',
  scopeAllBoards = false,
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterDocType = null,
  meta = null
} = {}) {
  const { uniqueFiles, totalFiles, totalBooks, ialBooks, igcseBooks, edexcelBooks, cambridgeBooks, dfCount, audioCount, cambridgeUnique } = getArchiveCounts(meta);
  const subjDisplay = formatSubjectName(filterSubject);
  const curr = filterCurriculum || (filterSubject ? inferCurriculumForSubject(filterSubject, 'Edexcel IAL') : '');
  const isCie = isCambridgeCurriculum(curr) || (!curr && !scopeAllBoards && activeBoard === 'cambridge');
  const faqs = [];

  if (currentTab === 'about' || currentTab === 'changelog') {
    return faqs;
  }

  if (filterDocType === 'Book' && !filterUnit) {
    if (filterSubject) {
      const isIalMath = curr === 'Edexcel IAL' && filterSubject === 'Math';
      faqs.push({
        q: `How do I read ${curr} ${subjDisplay} textbooks${isIalMath ? ' and Worked Solution Banks' : ''} online?`,
        a: `Click any ${curr} ${subjDisplay} ${isCie ? 'Coursebook, Workbook, Practical Book, or Answer Guide' : `Student Book${isIalMath ? ' or Worked Solution Bank ZIP (P1-P4, M1-M3, S1-S3, D1, FP1-FP3)' : ' or Answer PDF'}`} on this page to open it directly in our 2-Page side-by-side WebPDF reader with zero ads or downloads required.`
      });
      if (isIalMath) {
        faqs.push({
          q: 'Which Edexcel IAL Mathematics units have Worked Solution Banks included?',
          a: 'All 14 Pearson Edexcel IAL Mathematics units are covered chapter-by-chapter: Pure Mathematics 1-4 (WMA11-WMA14), Mechanics 1-3 (WME01-WME03), Statistics 1-3 (WST01-WST03), Decision Mathematics 1 (WDM11), and Further Pure Mathematics 1-3 (WFM01-WFM03).'
        });
      }
    } else if (isCie) {
      faqs.push({
        q: 'Which Cambridge International coursebooks and workbooks are in the archive?',
        a: `The archive indexes ${cambridgeBooks} verified Cambridge International AS & A Level, IGCSE, and O Level coursebooks, workbooks, practical lab books, revision guides, and answer booklets, all viewable online in 2-Page book spread mode.`
      });
    } else if (scopeAllBoards) {
      faqs.push({
        q: 'How many international exam textbooks and Solution Banks are in the archive?',
        a: `The library indexes ${totalBooks} verified resources across both boards: ${edexcelBooks} Pearson Edexcel (IAL & IGCSE) student books, lab books, answer PDFs, and Worked Solution Banks plus ${cambridgeBooks} Cambridge International (AS & A Level, IGCSE & O Level) coursebooks, workbooks, and revision guides.`
      });
    } else {
      faqs.push({
        q: 'How many Edexcel textbooks and Solution Banks are in the archive?',
        a: `The Edexcel textbook collection indexes ${edexcelBooks} verified resources (${ialBooks} Edexcel IAL student books, lab books, answer PDFs, and Worked Solution Banks plus ${igcseBooks} Edexcel IGCSE 9-1 student books), all viewable in 2-Page book spread mode.`
      });
    }
    return faqs;
  }

  if (filterDocType === 'AUD') {
    faqs.push({
      q: 'Which language listening exams include audio and synced transcripts?',
      a: `All ${audioCount} archived MP3 and ZIP listening tracks across international French, German, Spanish, ESL, Chinese, and Swahili exams stream directly in-browser above the Question Paper with live closed captions (CC).`
    });
    return faqs;
  }

  if (filterDocType === 'DF') {
    faqs.push({
      q: 'Which practical exams require source data files (.zip)?',
      a: `The archive hosts ${dfCount} practical examination source data file archives for Edexcel IAL Information Technology (WIT12, WIT14), Edexcel IGCSE ICT/CS (4IT1, 4CP0), and Cambridge ICT/CS practical components.`
    });
    return faqs;
  }

  if (filterSubject && filterUnit) {
    const unitCode = getUnitCodeFromLabel(filterUnit, { isCambridge: isCie });
    const legacyEq = getLegacyEquivalentsForState({ filterCurriculum: curr, filterSubject, filterUnit });
    const unitObj = meta?.wizard?.[curr]?.[filterSubject]?.units?.[filterUnit];
    const docCount = unitObj?.count || 40;
    const years = unitObj?.years || [2025, 2024];
    const yrSpan = `${years[years.length - 1] || 2018}-${years[0] || 2025}`;

    faqs.push({
      q: `How many ${curr} ${subjDisplay} ${filterUnit} past papers and mark schemes are available?`,
      a: `This archive indexes ${docCount} verified Question Papers (QP), Mark Schemes (MS), and ${isCie ? 'Grade Thresholds (GT) / Examiner Reports (ER)' : 'Examiner Reports (ER)'} for ${curr} ${subjDisplay} ${filterUnit}${unitCode ? ` (${unitCode})` : ''} spanning ${yrSpan}. Click Split View on any sitting to compare the Question Paper and Mark Scheme side by side.`
    });
    if (legacyEq) {
      faqs.push({
        q: `What are the specification and equivalent codes for ${curr} ${subjDisplay} ${filterUnit}?`,
        a: `${legacyEq}. Both current and equivalent/legacy series are indexed so you can practice every compatible past examination paper.`
      });
    }
    return faqs;
  }

  if (filterSubject) {
    const subjWizard = meta?.wizard?.[curr]?.[filterSubject];
    const docCount = subjWizard?.totalFiles || 100;
    const unitNames = Object.keys(subjWizard?.units || {});
    if (isCie) {
      const code = extractSyllabusCodeFromSubject(filterSubject);
      const entry = code ? resolveCambridgeSyllabus(code) : null;
      const legacyNote = getLegacyEquivalentsForState({ filterCurriculum: curr, filterSubject });
      faqs.push({
        q: `What papers and variants are included in ${curr} ${subjDisplay}?`,
        a: `This collection indexes ${docCount} unique Cambridge International Question Papers, Mark Schemes, Inserts, Grade Thresholds, and Examiner Reports across ${unitNames.length || 'all'} papers and timezone variants (v1, v2, v3)${legacyNote ? ` (${legacyNote})` : ''}.`
      });
      if (entry?.alt91) {
        faqs.push({
          q: `Are Cambridge IGCSE ${entry.code} and ${entry.alt91} (9-1) past papers the same?`,
          a: `Yes. Cambridge IGCSE ${entry.code} (A*-G) and ${entry.alt91} (9-1) share identical examination papers and mark schemes; only the final grade scale differs, so searching either code returns the full verified archive.`
        });
      }
      return faqs;
    }

    const unitCodes = getUniqueOrderedUnitCodes(unitNames).filter((c) => !LEGACY_IAL_UNIT_CODES.has(c));
    const igcseCode = curr === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const legacySpec = SUBJECT_LEGACY_SPEC_CODES[curr]?.[filterSubject] || '';

    faqs.push({
      q: `Which units and specification codes are covered in ${curr} ${subjDisplay}?`,
      a: `This collection indexes ${docCount} unique past papers, mark schemes, and examiner reports across ${unitNames.length || 'all'} ${curr} ${subjDisplay} units${igcseCode ? ` (specification ${igcseCode})` : unitCodes.length ? ` (${unitCodes.join(', ')})` : ''}${legacySpec ? `, including ${legacySpec}` : ''}.`
    });
    return faqs;
  }

  if (isCie) {
    faqs.push({
      q: 'Which Cambridge International qualifications are included on Conceptualist Systems?',
      a: `Conceptualist Systems indexes ${cambridgeUnique > 0 ? `${cambridgeUnique.toLocaleString()}+ ` : ''}Cambridge International AS & A Level (CIE-AL), Cambridge IGCSE (A*-G and 9-1 equivalents), and Cambridge O Level (CIE-OL) past papers, mark schemes, inserts, grade thresholds, and examiner reports with side-by-side Split View.`
    });
    return faqs;
  }

  faqs.push({
    q: 'What is included in the Conceptualist Systems international exam archive?',
    a: `Conceptualist Systems indexes ${uniqueFiles.toLocaleString()} unique Pearson Edexcel (IAL & IGCSE) and Cambridge International (AS & A Level, IGCSE & O Level) Question Papers, Mark Schemes, Examiner Reports, Grade Thresholds, ${totalBooks} Textbooks and Solution Banks, ${audioCount} Listening Audio tracks with synced subtitles, and ${dfCount} practical Data Files (${totalFiles.toLocaleString()} total archived files).`
  });
  return faqs;
}

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
    const unitKeys = Object.keys(unitsObj);
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
