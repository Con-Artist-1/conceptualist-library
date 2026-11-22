// Full SEO Routing, Answer-Engine FAQ & Schema.org JSON-LD generator.
// Re-exports lightweight routeCore.js so build scripts keep identical imports while the browser lazy-loads JSON-LD.
import { BOOK_CATALOG_BY_PATH } from './bookCatalog.js';
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
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterDocType = null,
  meta = null
} = {}) {
  const { uniqueFiles, totalFiles, totalBooks, ialBooks, igcseBooks, dfCount, audioCount } = getArchiveCounts(meta);
  const subjDisplay = formatSubjectName(filterSubject);
  const curr = filterCurriculum || (filterSubject ? inferCurriculumForSubject(filterSubject, 'Edexcel IAL') : '');
  const faqs = [];

  if (currentTab === 'about' || currentTab === 'changelog') {
    return faqs;
  }

  if (filterDocType === 'Book' && !filterUnit) {
    if (filterSubject) {
      const isIalMath = curr === 'Edexcel IAL' && filterSubject === 'Math';
      faqs.push({
        q: `How do I read ${curr} ${subjDisplay} textbooks${isIalMath ? ' and Worked Solution Banks' : ''} online?`,
        a: `Click any ${curr} ${subjDisplay} Student Book${isIalMath ? ' or Worked Solution Bank ZIP (P1-P4, M1-M3, S1-S3, D1, FP1-FP3)' : ' or Answer PDF'} on this page to open it directly in our 2-Page side-by-side WebPDF reader with zero ads or downloads required.`
      });
      if (isIalMath) {
        faqs.push({
          q: 'Which Edexcel IAL Mathematics units have Worked Solution Banks included?',
          a: 'All 14 Pearson Edexcel IAL Mathematics units are covered chapter-by-chapter: Pure Mathematics 1-4 (WMA11-WMA14), Mechanics 1-3 (WME01-WME03), Statistics 1-3 (WST01-WST03), Decision Mathematics 1 (WDM11), and Further Pure Mathematics 1-3 (WFM01-WFM03).'
        });
      }
    } else {
      faqs.push({
        q: 'How many Edexcel IAL and IGCSE textbooks and Solution Banks are in the archive?',
        a: `The library indexes ${totalBooks} verified resources (${ialBooks} Edexcel IAL student books, lab books, answer PDFs, and Worked Solution Banks plus ${igcseBooks} Edexcel IGCSE 9-1 student books), all viewable in 2-Page book spread mode.`
      });
    }
    return faqs;
  }

  if (filterDocType === 'AUD') {
    faqs.push({
      q: 'Which Edexcel language listening exams include audio and synced transcripts?',
      a: `All ${audioCount} archived MP3 and ZIP listening tracks across Edexcel IAL French (WFR02, WFR04), German (WGN02, WGN04), and Spanish (WSP02, WSP04), plus Edexcel IGCSE ESL (4ES1), Chinese (4CN1), Swahili (4SW1), French (4FR1), German (4GN1), and Spanish (4SP1) stream directly in-browser above the Question Paper with live closed captions (CC).`
    });
    return faqs;
  }

  if (filterDocType === 'DF') {
    faqs.push({
      q: 'Which Edexcel practical exams require source data files (.zip)?',
      a: `The archive hosts ${dfCount} official practical examination data file archives for Edexcel IAL Information Technology Unit 2 (WIT12) and Unit 4 (WIT14), Edexcel IGCSE ICT Paper 2 (4IT1), and Edexcel IGCSE Computer Science Paper 2 (4CP0).`
    });
    return faqs;
  }

  if (filterSubject && filterUnit) {
    const unitCode = getUnitCodeFromLabel(filterUnit);
    const legacyEq = getLegacyEquivalentsForState({ filterCurriculum: curr, filterSubject, filterUnit });
    const unitObj = meta?.wizard?.[curr]?.[filterSubject]?.units?.[filterUnit];
    const docCount = unitObj?.count || 60;
    const years = unitObj?.years || [2026, 2025];
    const yrSpan = `${years[years.length - 1] || 2014}-${years[0] || 2026}`;

    faqs.push({
      q: `How many ${curr} ${subjDisplay} ${filterUnit} past papers and mark schemes are available?`,
      a: `This archive indexes ${docCount} verified Question Papers (QP), Mark Schemes (MS), and Examiner Reports (ER) for ${curr} ${subjDisplay} ${filterUnit}${unitCode ? ` (${unitCode})` : ''} spanning ${yrSpan}. Click Split View on any sitting to compare the Question Paper and Mark Scheme side by side.`
    });
    if (legacyEq) {
      faqs.push({
        q: `What are the specification and legacy unit codes for ${curr} ${subjDisplay} ${filterUnit}?`,
        a: `${legacyEq}. Both current and legacy series are indexed so you can practice every compatible past examination question.`
      });
    }
    return faqs;
  }

  if (filterSubject) {
    const subjWizard = meta?.wizard?.[curr]?.[filterSubject];
    const docCount = subjWizard?.totalFiles || 150;
    const unitNames = Object.keys(subjWizard?.units || {});
    const unitCodes = getUniqueOrderedUnitCodes(unitNames).filter((c) => !LEGACY_IAL_UNIT_CODES.has(c));
    const igcseCode = curr === 'Edexcel IGCSE' ? (IGCSE_SPEC_CODES[filterSubject] || '') : '';
    const legacySpec = SUBJECT_LEGACY_SPEC_CODES[curr]?.[filterSubject] || '';

    faqs.push({
      q: `Which units and specification codes are covered in ${curr} ${subjDisplay}?`,
      a: `This collection indexes ${docCount} unique past papers, mark schemes, and examiner reports across ${unitNames.length || 'all'} ${curr} ${subjDisplay} units${igcseCode ? ` (specification ${igcseCode})` : unitCodes.length ? ` (${unitCodes.join(', ')})` : ''}${legacySpec ? `, including ${legacySpec}` : ''}.`
    });
    return faqs;
  }

  faqs.push({
    q: 'What is included in the Conceptualist Systems Edexcel archive?',
    a: `Conceptualist Systems indexes ${uniqueFiles.toLocaleString()} unique Edexcel IAL and IGCSE Question Papers, Mark Schemes, Examiner Reports, ${totalBooks} Textbooks and Solution Banks, ${audioCount} Listening Audio tracks with synced subtitles, and ${dfCount} IT/CS Data Files (${totalFiles.toLocaleString()} total archived files covering 2003-2026).`
  });
  return faqs;
}

export function buildJsonLd({
  currentTab = 'library',
  filterCurriculum = '',
  filterSubject = '',
  filterUnit = '',
  filterDocType = null,
  forceShowTable = false,
  seo,
  meta = null
}) {
  const { uniqueFiles, totalFiles } = getArchiveCounts(meta);
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
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'All Past Papers', item: `${SITE_URL}/papers` });
  } else if (filterDocType === 'Book' && !filterUnit) {
    breadcrumbs.push({ '@type': 'ListItem', position: 2, name: 'Textbooks & Solutions', item: `${SITE_URL}/textbooks` });
    if (filterCurriculum) {
      const currSlug = getCurriculumSlug(filterCurriculum);
      breadcrumbs.push({
        '@type': 'ListItem',
        position: 3,
        name: `${filterCurriculum} Textbooks`,
        item: `${SITE_URL}/textbooks/${currSlug}`
      });
      if (filterSubject) {
        const subjSlug = getSubjectSlug(filterSubject);
        breadcrumbs.push({
          '@type': 'ListItem',
          position: 4,
          name: `${formatSubjectName(filterSubject)} Books`,
          item: `${SITE_URL}/textbooks/${currSlug}/${subjSlug}`
        });
      }
    }
  } else {
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
      const currSlug = getCurriculumSlug(filterCurriculum || 'Edexcel IAL');
      const subjSlug = getSubjectSlug(filterSubject);
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: `${filterCurriculum || 'Edexcel IAL'} ${formatSubjectName(filterSubject)}`,
        item: `${SITE_URL}/${currSlug}/${subjSlug}`
      });
    }
    if (filterSubject && filterUnit) {
      const currSlug = getCurriculumSlug(filterCurriculum || 'Edexcel IAL');
      const subjSlug = getSubjectSlug(filterSubject);
      const unitSlug = getUnitSlug(filterUnit);
      breadcrumbs.push({
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: filterUnit,
        item: `${SITE_URL}/${currSlug}/${subjSlug}/${unitSlug}`
      });
    }
  }

  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'Conceptualist Systems — Edexcel Past Papers & Textbooks Library',
      alternateName: ['Conceptualist Systems', 'Conceptualist Edexcel Library'],
      description: `Independent academic study repository indexing ${uniqueFiles.toLocaleString()}+ unique Edexcel IAL and IGCSE past exam papers, mark schemes, examiner reports, and textbooks (${totalFiles.toLocaleString()} archived files).`,
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
      about: {
        '@type': 'EducationalOrganization',
        name: 'Pearson Edexcel International Examinations (IAL & IGCSE)'
      }
    }
  ];

  // Add ItemList of units when on a Subject Past Papers page
  if (!filterDocType && filterSubject && !filterUnit && meta?.wizard) {
    const curr = filterCurriculum || 'Edexcel IAL';
    const currSlug = getCurriculumSlug(curr);
    const subjSlug = getSubjectSlug(filterSubject);
    const unitsObj = meta.wizard[curr]?.[filterSubject]?.units || {};
    const unitKeys = Object.keys(unitsObj);
    if (unitKeys.length > 0) {
      graph.push({
        '@type': 'ItemList',
        name: `${curr} ${formatSubjectName(filterSubject)} Units & Examination Papers`,
        numberOfItems: unitKeys.length,
        itemListElement: unitKeys.map((u, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${curr} ${formatSubjectName(filterSubject)} — ${u}`,
          url: `${SITE_URL}/${currSlug}/${subjSlug}/${getUnitSlug(u)}`
        }))
      });
    }
  }

  // Add rich Book / CreativeWork ItemList on Textbook routes using verified ISBNs & authors from bookCatalog.js
  if (filterDocType === 'Book' && !filterUnit) {
    const matchingBooks = Object.entries(BOOK_CATALOG_BY_PATH).filter(([bookPath]) => {
      const bookCurr = bookPath.startsWith('IGCSE Books/') ? 'Edexcel IGCSE' : 'Edexcel IAL';
      if (filterCurriculum && bookCurr !== filterCurriculum) return false;
      if (filterSubject) {
        const folderSubj = bookPath.split('/')[1] || '';
        const normFolder = folderSubj === 'Maths' ? (bookCurr === 'Edexcel IGCSE' ? 'Mathematics A' : 'Math')
          : folderSubj === 'Further Pure Maths' ? 'Further Pure Mathematics'
          : folderSubj;
        if (normFolder !== filterSubject) return false;
      }
      return true;
    });
    if (matchingBooks.length > 0) {
      graph.push({
        '@type': 'ItemList',
        name: seo.h1,
        numberOfItems: matchingBooks.length,
        itemListElement: matchingBooks.slice(0, 35).map(([bookPath, bMeta], idx) => {
          const isZip = bookPath.toLowerCase().endsWith('.zip');
          const itemNode = {
            '@type': isZip ? 'CreativeWork' : 'Book',
            name: bMeta.title,
            inLanguage: 'en',
            url: `${seo.canonicalUrl}#paper=${encodeURIComponent(bookPath)}&view=${isZip ? 'SOL' : 'Book'}`
          };
          if (bMeta.authors) itemNode.author = { '@type': 'Person', name: bMeta.authors };
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

