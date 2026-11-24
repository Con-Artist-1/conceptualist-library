// Pure multi-board catalog hydration, sibling grouping, smart search & query engine.
// Runs off the main UI thread inside src/workers/catalog.worker.js (with transparent fallback).

import { compareUnitLabels } from './unitSort.js';
import { decodeCatalogFiles } from './indexSerializer.js';
import { getBookMetadata } from '../bookCatalog.js';
import { getPaperTotalViews } from './paperKeys.js';
import {
  getBoardForSpec,
  getCurriculumForSpec,
  isBookCategory,
  isCambridgeSpec
} from '../data/boards.js';
import { extractSyllabusCodeFromSubject } from '../data/cambridgeCatalog.js';
import {
  buildFileSearchData,
  finalizeUnifiedSearchData,
  buildCatalogVocab,
  parseSearchQuery,
  executeSmartSearch
} from '../searchEngine.js';

const SIBLING_TYPES = new Set(['QP', 'MS', 'ER', 'GT', 'SC', 'AUD', 'DF', 'SOL', 'SAM']);
const DOC_PRIORITY = ['QP', 'MS', 'ER', 'GT', 'SOL', 'AUD', 'SC', 'DF', 'SAM'];
const DOC_ORDER = { QP: 1, MS: 2, ER: 3, GT: 4, SC: 5, DF: 6, AUD: 7, SAM: 8, SOL: 9 };
const UNIT_PREFIX_BY_SUBJECT = { French: 'WFR', German: 'WGN', Spanish: 'WSP' };
const SAMPLE_AUDIO_ID = 'IAL|French|WFR02||June 2021';

function scoreFile(f) {
  let s = 0;
  if (f.path && f.path.includes('(')) s += 10;
  if (f.name && f.name.includes('_')) s += 5;
  return s;
}

function preferSiblingCandidate(existing, candidate) {
  if (!existing) return true;
  const exPdf = existing.ext === 'pdf' ? 1 : 0;
  const caPdf = candidate.ext === 'pdf' ? 1 : 0;
  if (caPdf !== exPdf) return caPdf > exPdf;
  return scoreFile(candidate) > scoreFile(existing);
}

function sanitizeLeafDoc(d) {
  if (!d) return undefined;
  const out = {
    name: d.name,
    path: d.path,
    size: d.size || 0,
    subject: d.subject,
    docType: d.docType,
    year: d.year,
    session: d.session,
    sortKey: d.sortKey,
    unitCode: d.unitCode,
    unitName: d.unitName,
    spec: d.spec,
    board: d.board,
    syllabusCode: d.syllabusCode || null,
    category: d.category,
    variant: d.variant,
    cleanUnitLabel: d.cleanUnitLabel,
    ext: d.ext,
    curriculum: d.curriculum
  };
  if (d.altPaths) out.altPaths = d.altPaths;
  if (d.bookMeta) out.bookMeta = d.bookMeta;
  return out;
}

function sanitizeDocMap(mapObj) {
  if (!mapObj) return null;
  const out = {};
  for (const k of Object.keys(mapObj)) {
    if (mapObj[k]) out[k] = sanitizeLeafDoc(mapObj[k]);
  }
  return out;
}

export function serializeItemForUi(item) {
  if (!item) return null;
  const cleanDocs = item.docs ? sanitizeDocMap(item.docs) : {};
  const cleanSiblings = item.siblings ? sanitizeDocMap(item.siblings) : cleanDocs;
  const out = {
    id: item.id,
    isUnifiedSitting: Boolean(item.isUnifiedSitting),
    board: item.board,
    spec: item.spec,
    curriculum: item.curriculum,
    syllabusCode: item.syllabusCode || null,
    category: item.category,
    subject: item.subject,
    unitCode: item.unitCode,
    unitName: item.unitName,
    cleanUnitLabel: item.cleanUnitLabel,
    variant: item.variant,
    year: item.year,
    session: item.session,
    sortKey: item.sortKey,
    name: item.name,
    path: item.path,
    folderPath: item.folderPath,
    ext: item.ext,
    size: item.size || 0,
    totalSize: item.totalSize || item.size || 0,
    docType: item.docType,
    fileCount: item.fileCount || 1,
    docTypes: item.docTypes || (item.docType ? [item.docType] : []),
    docs: cleanDocs,
    siblings: cleanSiblings,
    primaryFile: item.primaryFile ? sanitizeLeafDoc(item.primaryFile) : undefined
  };
  if (item.altPaths) out.altPaths = item.altPaths;
  if (item.paths) out.paths = item.paths;
  if (item.bookMeta) out.bookMeta = item.bookMeta;
  return out;
}

export function ensureItemSearchData(item) {
  if (!item) return null;
  if (item._search) return item._search;
  if (item.isUnifiedSitting && Array.isArray(item._searchSources)) {
    const sources = item._searchSources;
    finalizeUnifiedSearchData(item, sources);
    item._searchSources = null;
    return item._search;
  }
  item._search = buildFileSearchData(item);
  return item._search;
}

function ensureCatalogVocab(state) {
  if (!state) return undefined;
  if (!state.catalogVocab) {
    state.catalogVocab = buildCatalogVocab(state.flatFiles);
  }
  return state.catalogVocab;
}

function pushMapList(mapObj, key, item) {
  if (!key) return;
  let arr = mapObj.get(key);
  if (!arr) {
    arr = [];
    mapObj.set(key, arr);
  }
  arr.push(item);
}

export function hydrateCatalogPayload(json) {
  const rawList = decodeCatalogFiles(json);

  const flatFiles = new Array(rawList.length);
  const bySyllabusFlat = new Map();
  let bookCount = 0;
  let audioCount = 0;

  for (let i = 0; i < rawList.length; i++) {
    const fileObj = rawList[i];
    if (fileObj.name && fileObj.name.includes('_17')) {
      fileObj.name = fileObj.name.replace(/_\d{10,14}/g, '');
    }

    const dotIdx = fileObj.name ? fileObj.name.lastIndexOf('.') : -1;
    fileObj.ext = dotIdx !== -1 ? fileObj.name.slice(dotIdx + 1).toLowerCase() : '';
    fileObj.board = getBoardForSpec(fileObj.spec);
    fileObj.curriculum = getCurriculumForSpec(fileObj.spec, fileObj.category);
    if (!fileObj.syllabusCode && isCambridgeSpec(fileObj.spec)) {
      fileObj.syllabusCode = extractSyllabusCodeFromSubject(fileObj.subject) || null;
    }
    if (fileObj.variant === undefined || fileObj.variant === null) fileObj.variant = '';
    if (fileObj.cleanUnitLabel === undefined) fileObj.cleanUnitLabel = fileObj.unitName || null;

    if (!fileObj.sortKey) {
      let sessionVal = 0;
      const s = fileObj.session;
      if (s) {
        if (s.includes('Jan')) sessionVal = 1;
        else if (s.includes('Feb') || s.includes('Mar')) sessionVal = 3;
        else if (s.includes('May') || s.includes('June')) sessionVal = 6;
        else if (s.includes('Oct') || s.includes('Nov')) sessionVal = isCambridgeSpec(fileObj.spec) ? 11 : 10;
      }
      fileObj.sortKey = (fileObj.year || 2000) * 100 + sessionVal;
    }

    if (isBookCategory(fileObj.category)) {
      bookCount++;
      const bm = getBookMetadata(fileObj);
      if (bm) fileObj.bookMeta = bm;
    }
    if (fileObj.docType === 'AUD') audioCount++;

    if (fileObj.syllabusCode) {
      pushMapList(bySyllabusFlat, fileObj.syllabusCode, fileObj);
    }
    flatFiles[i] = fileObj;
  }

  const hasPreDeduped = Boolean(
    json.meta?.isShard ||
    json.meta?.isPreDeduped ||
    (json.meta?.uniqueFiles &&
      Array.isArray(flatFiles) &&
      flatFiles.length === json.meta.uniqueFiles)
  );

  const dedupMap = hasPreDeduped ? null : new Map();
  const siblingGroups = new Map();
  const combinedU2U4Zips = [];
  // Session-wide Cambridge ER & GT files (shared across all papers/variants in that syllabus + session)
  const cieSessionDocs = new Map();

  for (let i = 0; i < flatFiles.length; i++) {
    const f = flatFiles[i];
    const isCanonicalPaper = f.category === 'Past Papers' && f.unitCode && f.session && f.docType;

    if (
      f.category === 'Past Papers' &&
      f.docType === 'AUD' &&
      !f.unitCode &&
      f.session &&
      f.subject &&
      /u2u4/i.test(f.name || '')
    ) {
      combinedU2U4Zips.push(f);
    }

    if (
      f.category === 'Past Papers' &&
      isCambridgeSpec(f.spec) &&
      !f.unitCode &&
      f.syllabusCode &&
      f.session &&
      (f.docType === 'ER' || f.docType === 'GT')
    ) {
      const sessKey = `${f.spec}|${f.syllabusCode}|${f.session}`;
      let sBag = cieSessionDocs.get(sessKey);
      if (!sBag) {
        sBag = {};
        cieSessionDocs.set(sessKey, sBag);
      }
      if (preferSiblingCandidate(sBag[f.docType], f)) {
        sBag[f.docType] = f;
      }
    }

    if (dedupMap) {
      const dedupKey = isCanonicalPaper
        ? `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}|${f.docType}|${f.ext}|${f.size}`
        : f.path;
      const prev = dedupMap.get(dedupKey);
      if (!prev || scoreFile(f) > scoreFile(prev)) {
        dedupMap.set(dedupKey, f);
      }
    }

    if (isCanonicalPaper && SIBLING_TYPES.has(f.docType)) {
      const sibKey = `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}`;
      let grp = siblingGroups.get(sibKey);
      if (!grp) {
        grp = {};
        siblingGroups.set(sibKey, grp);
      }
      if (preferSiblingCandidate(grp[f.docType], f)) {
        grp[f.docType] = f;
      }
      if (f.docType === 'AUD') {
        if (f.ext === 'zip') grp.AUD_ZIP = f;
        else grp.AUD_SINGLE = f;
      }
    }
  }

  for (let i = 0; i < combinedU2U4Zips.length; i++) {
    const z = combinedU2U4Zips[i];
    const prefix = UNIT_PREFIX_BY_SUBJECT[z.subject];
    if (!prefix) continue;
    ['02', '04'].forEach((num) => {
      const sibKey = `${z.spec}|${z.subject}|${prefix}${num}||${z.session}`;
      const grp = siblingGroups.get(sibKey);
      if (grp) {
        if (!grp.AUD) grp.AUD = z;
        if (!grp.AUD_ZIP) grp.AUD_ZIP = z;
      }
    });
  }

  // Attach Cambridge session-wide ER & GT onto every matching syllabus+session sibling group
  if (cieSessionDocs.size > 0) {
    for (const grp of siblingGroups.values()) {
      const refDoc = grp.QP || grp.MS || grp.SC || grp.AUD || grp.DF;
      if (!refDoc || !isCambridgeSpec(refDoc.spec) || !refDoc.syllabusCode || !refDoc.session) continue;
      const sBag = cieSessionDocs.get(`${refDoc.spec}|${refDoc.syllabusCode}|${refDoc.session}`);
      if (!sBag) continue;
      if (sBag.ER && !grp.ER) grp.ER = sBag.ER;
      if (sBag.GT && !grp.GT) grp.GT = sBag.GT;
    }
  }

  for (let i = 0; i < flatFiles.length; i++) {
    const f = flatFiles[i];
    if (f.category === 'Past Papers' && f.unitCode && f.session) {
      const sibKey = `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}`;
      f.siblings = siblingGroups.get(sibKey) || null;
    }
  }

  const dedupedFiles = dedupMap ? Array.from(dedupMap.values()) : flatFiles;

  const sittingMap = new Map();
  const unifiedFiles = [];

  for (let i = 0; i < dedupedFiles.length; i++) {
    const f = dedupedFiles[i];
    const canUnify =
      f.category === 'Past Papers' &&
      f.unitCode &&
      f.session &&
      f.docType &&
      !String(f.variant || '').startsWith('ER');

    if (!canUnify) {
      unifiedFiles.push({
        ...f,
        isUnifiedSitting: false,
        docs: f.docType ? { [f.docType]: f } : {},
        docTypes: f.docType ? [f.docType] : [],
        paths: Array.isArray(f.altPaths) && f.altPaths.length > 0 ? [f.path, ...f.altPaths] : [f.path],
        fileCount: 1,
        totalSize: f.size || 0
      });
      continue;
    }

    const sittingKey = `${f.spec}|${f.subject}|${f.unitCode}|${f.variant}|${f.session}`;
    let group = sittingMap.get(sittingKey);
    if (!group) {
      group = {
        id: sittingKey,
        isUnifiedSitting: true,
        board: f.board,
        spec: f.spec,
        curriculum: f.curriculum,
        syllabusCode: f.syllabusCode || null,
        category: f.category,
        subject: f.subject,
        unitCode: f.unitCode,
        unitName: f.unitName,
        cleanUnitLabel: f.cleanUnitLabel,
        variant: f.variant,
        year: f.year,
        session: f.session,
        sortKey: f.sortKey,
        docs: {},
        paths: [],
        _childFiles: [],
        totalSize: 0
      };
      sittingMap.set(sittingKey, group);
      unifiedFiles.push(group);
    }

    if (preferSiblingCandidate(group.docs[f.docType], f)) {
      group.docs[f.docType] = f;
    }
    if (f.docType === 'AUD') {
      if (f.ext === 'zip') group.docs.AUD_ZIP = f;
      else group.docs.AUD_SINGLE = f;
    }
    group.paths.push(f.path);
    if (Array.isArray(f.altPaths) && f.altPaths.length > 0) {
      group.paths.push(...f.altPaths);
    }
    group._childFiles.push(f);
    group.totalSize += (f.size || 0);
  }

  for (let i = 0; i < combinedU2U4Zips.length; i++) {
    const z = combinedU2U4Zips[i];
    const prefix = UNIT_PREFIX_BY_SUBJECT[z.subject];
    if (!prefix) continue;
    ['02', '04'].forEach((num) => {
      const sittingKey = `${z.spec}|${z.subject}|${prefix}${num}||${z.session}`;
      const group = sittingMap.get(sittingKey);
      if (group) {
        if (!group.docs.AUD) group.docs.AUD = z;
        if (!group.docs.AUD_ZIP) group.docs.AUD_ZIP = z;
      }
    });
  }

  // Pass 2: Attach Cambridge session-wide ER & GT to every matching paper sitting (without polluting paper highSet search ranking)
  const attachedSessionDocPaths = new Set();
  if (cieSessionDocs.size > 0) {
    for (const group of sittingMap.values()) {
      if (!isCambridgeSpec(group.spec) || !group.syllabusCode || !group.session) continue;
      const sBag = cieSessionDocs.get(`${group.spec}|${group.syllabusCode}|${group.session}`);
      if (!sBag) continue;
      if (sBag.ER && !group.docs.ER) {
        group.docs.ER = sBag.ER;
        if (sBag.ER.path) attachedSessionDocPaths.add(sBag.ER.path);
      }
      if (sBag.GT && !group.docs.GT) {
        group.docs.GT = sBag.GT;
        if (sBag.GT.path) attachedSessionDocPaths.add(sBag.GT.path);
      }
    }
  }

  const lookupById = new Map();
  const lookupByPath = new Map();
  const bySyllabusUnified = new Map();
  let sampleAudio = null;
  let fallbackAudioWithQp = null;
  let fallbackAudioAny = null;

  for (let i = 0; i < unifiedFiles.length; i++) {
    const item = unifiedFiles[i];
    if (!item.isUnifiedSitting && item.path && attachedSessionDocPaths.has(item.path)) {
      item.isAttachedSessionDoc = true;
    }
    if (item.isUnifiedSitting) {
      const docTypes = DOC_PRIORITY.filter((t) => Boolean(item.docs[t]));
      const primary = item.docs.QP || item.docs.MS || item.docs.ER || item.docs[docTypes[0]];
      const folderPath = (primary.path || '').split('/').slice(0, -1).join('/') || primary.path;
      item.docTypes = docTypes;
      item.fileCount = docTypes.length;
      item.primaryFile = primary;
      item.name = primary.name;
      item.path = primary.path;
      item.folderPath = folderPath;
      item.ext = primary.ext;
      item.size = item.totalSize;
      item.docType = primary.docType;
      item.siblings = primary.siblings;
      item._searchSources = item.docs.AUD && !item._childFiles.includes(item.docs.AUD)
        ? [...item._childFiles, item.docs.AUD]
        : item._childFiles;
      delete item._childFiles;
    }

    if (item.syllabusCode) {
      pushMapList(bySyllabusUnified, item.syllabusCode, item);
    }
    if (item.id && !lookupById.has(item.id)) lookupById.set(item.id, item);
    if (item.path && !lookupByPath.has(item.path)) lookupByPath.set(item.path, item);

    if (!sampleAudio && item.id === SAMPLE_AUDIO_ID && item.docs?.AUD) {
      sampleAudio = item;
    } else if (!fallbackAudioWithQp && item.docs?.AUD && item.docs?.QP) {
      fallbackAudioWithQp = item;
    } else if (!fallbackAudioAny && item.docs?.AUD) {
      fallbackAudioAny = item;
    }
  }

  for (let i = 0; i < flatFiles.length; i++) {
    const f = flatFiles[i];
    if (f.path && !lookupByPath.has(f.path)) lookupByPath.set(f.path, f);
  }

  return {
    flatFiles,
    dedupedFiles,
    unifiedFiles,
    bySyllabusUnified,
    bySyllabusFlat,
    catalogVocab: null,
    lookupById,
    lookupByPath,
    sampleAudio: sampleAudio || fallbackAudioWithQp || fallbackAudioAny || null,
    meta: json.meta || {},
    counts: {
      flatCount: flatFiles.length,
      dedupedCount: dedupedFiles.length,
      unifiedCount: unifiedFiles.length,
      bookCount,
      audioCount
    }
  };
}

export function mergeHydratedStates(statesList) {
  const valid = (statesList || []).filter(Boolean);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  const flatFiles = [];
  const dedupedFiles = [];
  const unifiedFiles = [];
  const bySyllabusUnified = new Map();
  const bySyllabusFlat = new Map();
  const lookupById = new Map();
  const lookupByPath = new Map();
  let sampleAudio = null;
  let bookCount = 0;
  let audioCount = 0;

  for (let i = 0; i < valid.length; i++) {
    const st = valid[i];
    for (let j = 0; j < st.flatFiles.length; j++) flatFiles.push(st.flatFiles[j]);
    for (let j = 0; j < st.dedupedFiles.length; j++) dedupedFiles.push(st.dedupedFiles[j]);
    for (let j = 0; j < st.unifiedFiles.length; j++) unifiedFiles.push(st.unifiedFiles[j]);
    if (st.bySyllabusUnified) {
      for (const [code, list] of st.bySyllabusUnified.entries()) {
        const existing = bySyllabusUnified.get(code);
        bySyllabusUnified.set(code, existing ? existing.concat(list) : list.slice());
      }
    }
    if (st.bySyllabusFlat) {
      for (const [code, list] of st.bySyllabusFlat.entries()) {
        const existing = bySyllabusFlat.get(code);
        bySyllabusFlat.set(code, existing ? existing.concat(list) : list.slice());
      }
    }
    for (const [k, v] of st.lookupById.entries()) if (!lookupById.has(k)) lookupById.set(k, v);
    for (const [k, v] of st.lookupByPath.entries()) if (!lookupByPath.has(k)) lookupByPath.set(k, v);
    if (!sampleAudio && st.sampleAudio) sampleAudio = st.sampleAudio;
    bookCount += st.counts?.bookCount || 0;
    audioCount += st.counts?.audioCount || 0;
  }

  return {
    flatFiles,
    dedupedFiles,
    unifiedFiles,
    bySyllabusUnified,
    bySyllabusFlat,
    catalogVocab: null,
    lookupById,
    lookupByPath,
    sampleAudio,
    meta: valid[0].meta || {},
    counts: {
      flatCount: flatFiles.length,
      dedupedCount: dedupedFiles.length,
      unifiedCount: unifiedFiles.length,
      bookCount,
      audioCount
    }
  };
}

export function queryCatalogState(state, params) {
  const {
    selectedPath = '',
    viewMode = 'unified',
    filterBoard = '',
    filterCurriculum = '',
    filterSubject = '',
    filterUnit = '',
    filterYear = '',
    filterSession = '',
    filterVariant = '',
    filterDocType = null,
    searchQuery = '',
    sortBy = 'newest',
    viewsMap = null
  } = params;

  if (!state) {
    return {
      sortedFiles: [],
      meta: {
        isPartialFallback: false,
        missingTerms: [],
        appliedCorrections: [],
        didYouMean: ''
      }
    };
  }

  const isSpecificFolder = Boolean(selectedPath && selectedPath !== '');
  const useUnified = viewMode === 'unified';

  const sourceFiles = useUnified
    ? state.unifiedFiles
    : (isSpecificFolder ? state.flatFiles : state.dedupedFiles);

  const folderPrefix = isSpecificFolder
    ? (selectedPath.endsWith('/') ? selectedPath : `${selectedPath}/`)
    : null;

  const hasFolder = Boolean(folderPrefix);
  const hasBoard = Boolean(filterBoard && filterBoard !== 'all');
  const hasCurriculum = Boolean(filterCurriculum);
  const hasSubject = Boolean(filterSubject);
  const hasUnit = Boolean(filterUnit);
  const hasYear = Boolean(filterYear);
  const hasSession = Boolean(filterSession);
  const hasVariant = Boolean(filterVariant);
  const hasDocType = Boolean(filterDocType);

  const effectiveBoard = hasBoard ? filterBoard : '';
  const hasRawSearch = Boolean(searchQuery && String(searchQuery).trim());
  const parsedSearch = hasRawSearch
    ? parseSearchQuery(searchQuery, () => ensureCatalogVocab(state), { activeBoard: effectiveBoard })
    : { hasQuery: false, groups: [], exclusions: [], corrections: [], didYouMean: '' };
  const queryRequestsSessionDoc = Boolean(
    parsedSearch.hasQuery &&
    Array.isArray(parsedSearch.groups) &&
    parsedSearch.groups.some((g) => (
      g.primary === 'gt' ||
      g.primary === 'er' ||
      g.primary === 'threshold' ||
      g.primary === 'thresholds' ||
      (Array.isArray(g.alts) && g.alts.some((a) => a.val === 'gt' || a.val === 'er' || a.val === 'grade thresholds' || a.val === 'examiner report'))
    ))
  );
  const hideAttachedSessionDocs = Boolean(useUnified && !hasDocType && !queryRequestsSessionDoc);

  // Fast O(1) syllabus bucket pre-filter when query specifies an unambiguous Cambridge 4-digit code
  let syllabusBucket = null;
  if (parsedSearch.hasQuery && !hasFolder && !hasSubject && !hasUnit) {
    const cieGroup = parsedSearch.groups.find((g) => g.isCieSyllabus && g.resolvedCieCode);
    if (cieGroup && (!hasBoard || filterBoard === 'cambridge')) {
      const sylMap = useUnified ? state.bySyllabusUnified : state.bySyllabusFlat;
      if (sylMap) {
        syllabusBucket = sylMap.get(cieGroup.resolvedCieCode) || sylMap.get(cieGroup.primary) || null;
      }
    }
  }

  const applyAttributeFilters = (inputList) => {
    if (!hasFolder && !hasBoard && !hasCurriculum && !hasSubject && !hasUnit && !hasYear && !hasSession && !hasVariant && !hasDocType && !hideAttachedSessionDocs) {
      return inputList;
    }
    const filtered = [];
    const len = inputList.length;
    const lowerSession = hasSession ? filterSession.toLowerCase() : '';
    const strYear = hasYear ? String(filterYear) : '';
    const strVariant = hasVariant ? String(filterVariant) : '';

    for (let i = 0; i < len; i++) {
      const f = inputList[i];
      if (hideAttachedSessionDocs && f.isAttachedSessionDoc) continue;

      if (hasFolder) {
        if (useUnified) {
          const inFolder = f.path === selectedPath || f.path.startsWith(folderPrefix) ||
            (f.paths && f.paths.some((p) => p === selectedPath || p.startsWith(folderPrefix)));
          if (!inFolder) continue;
        } else {
          const inFolder = f.path === selectedPath || f.path.startsWith(folderPrefix) ||
            (f.altPaths && f.altPaths.some((p) => p === selectedPath || p.startsWith(folderPrefix)));
          if (!inFolder) continue;
        }
      }

      if (hasBoard && f.board !== filterBoard) continue;
      if (hasCurriculum && f.curriculum !== filterCurriculum) continue;
      if (hasSubject && f.subject !== filterSubject) continue;
      if (hasUnit && f.cleanUnitLabel !== filterUnit) continue;
      if (hasYear && String(f.year) !== strYear) continue;
      if (hasSession && !String(f.session || '').toLowerCase().startsWith(lowerSession)) continue;
      if (hasVariant && String(f.variant || '') !== strVariant) continue;

      if (hasDocType) {
        if (filterDocType === 'Book') {
          if (!isBookCategory(f.category)) continue;
        } else if (filterDocType === 'Extra') {
          if (useUnified) {
            const hasExtra = Boolean(
              f.docs?.DF || f.docs?.AUD || f.docs?.SC || f.docs?.SAM || f.docs?.SOL ||
              f.docType === 'DF' || f.docType === 'AUD' || f.docType === 'SC' || f.docType === 'SAM' || f.docType === 'SOL'
            );
            if (!hasExtra) continue;
          } else if (
            f.docType !== 'DF' && f.docType !== 'AUD' && f.docType !== 'SC' &&
            f.docType !== 'SAM' && f.docType !== 'SOL'
          ) {
            continue;
          }
        } else if (useUnified) {
          if ((filterDocType === 'GT' || (filterDocType === 'ER' && f.board === 'cambridge')) && !hasUnit) {
            if (f.docType !== filterDocType) continue;
          } else if (!f.docs?.[filterDocType] && f.docType !== filterDocType) {
            continue;
          }
        } else if (f.docType !== filterDocType) {
          continue;
        }
      }

      filtered.push(f);
    }
    return filtered;
  };

  let searchExec;
  if (parsedSearch.hasQuery) {
    if (syllabusBucket && syllabusBucket.length > 0) {
      const fastPool = applyAttributeFilters(syllabusBucket);
      const fastRes = executeSmartSearch(fastPool, parsedSearch, {
        isUnified: useUnified,
        ensureSearchData: ensureItemSearchData
      });
      if (!fastRes.isPartialFallback && fastRes.files.length > 0) {
        searchExec = fastRes;
      }
    }
    if (!searchExec) {
      const fullPool = applyAttributeFilters(sourceFiles);
      searchExec = executeSmartSearch(fullPool, parsedSearch, {
        isUnified: useUnified,
        ensureSearchData: ensureItemSearchData
      });
    }
  } else {
    const files = applyAttributeFilters(sourceFiles);
    searchExec = {
      files,
      relevanceMap: null,
      isPartialFallback: false,
      missingTerms: [],
      appliedCorrections: [],
      didYouMean: ''
    };
  }

  const matchedFiles = searchExec.files;
  const relevanceMap = searchExec.relevanceMap;
  const sorted = [...matchedFiles];

  if (sortBy === 'newest' || sortBy === '') {
    sorted.sort((a, b) => {
      if (relevanceMap) {
        const rDiff = (relevanceMap.get(b) || 0) - (relevanceMap.get(a) || 0);
        if (rDiff !== 0) return rDiff;
      }
      const diff = (b.sortKey || 0) - (a.sortKey || 0);
      if (diff !== 0) return diff;
      const aCode = a.unitCode || '';
      const bCode = b.unitCode || '';
      if (aCode !== bCode) return aCode < bCode ? -1 : 1;
      const aVar = a.variant || '';
      const bVar = b.variant || '';
      if (aVar !== bVar) return aVar < bVar ? -1 : 1;
      return (DOC_ORDER[a.docType] || 9) - (DOC_ORDER[b.docType] || 9);
    });
  } else if (sortBy === 'popular') {
    sorted.sort((a, b) => {
      const vDiff = getPaperTotalViews(b, viewsMap) - getPaperTotalViews(a, viewsMap);
      if (vDiff !== 0) return vDiff;
      const kDiff = (b.sortKey || 0) - (a.sortKey || 0);
      if (kDiff !== 0) return kDiff;
      return (DOC_ORDER[a.docType] || 9) - (DOC_ORDER[b.docType] || 9);
    });
  } else if (sortBy === 'oldest') {
    sorted.sort((a, b) => {
      const diff = (a.sortKey || 999999) - (b.sortKey || 999999);
      if (diff !== 0) return diff;
      return (DOC_ORDER[a.docType] || 9) - (DOC_ORDER[b.docType] || 9);
    });
  } else if (sortBy === 'name_asc') {
    sorted.sort((a, b) => {
      const an = a.name || '';
      const bn = b.name || '';
      return an === bn ? 0 : (an < bn ? -1 : 1);
    });
  } else if (sortBy === 'name_desc') {
    sorted.sort((a, b) => {
      const an = a.name || '';
      const bn = b.name || '';
      return an === bn ? 0 : (an > bn ? -1 : 1);
    });
  } else if (sortBy === 'size_desc') {
    sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
  }

  return {
    sortedFiles: sorted,
    meta: {
      isPartialFallback: Boolean(searchExec.isPartialFallback),
      missingTerms: searchExec.missingTerms || [],
      appliedCorrections: searchExec.appliedCorrections || [],
      didYouMean: searchExec.didYouMean || ''
    }
  };
}

export function resolvePaperFromState(state, param) {
  if (!state || !param) return null;
  const hit = state.lookupById.get(param) || state.lookupByPath.get(param) || null;
  return hit ? serializeItemForUi(hit) : null;
}

export function getFallbackUnitsFromState(state, subject, curriculum = '') {
  if (!state || !subject) return [];
  const set = new Set();
  const list = state.dedupedFiles || [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.subject === subject && (!curriculum || f.curriculum === curriculum) && f.cleanUnitLabel) {
      set.add(f.cleanUnitLabel);
    }
  }
  return Array.from(set).sort((a, b) => compareUnitLabels(a, b, subject));
}
