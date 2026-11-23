import { useState, useEffect } from 'react';
import { SUBJECTS_WITH_BOOKS_MAP } from '../data/curriculumCatalog.js';
import {
  getBoardForSpec,
  getCurriculumForSpec,
  isBookCategory,
  isCambridgeCurriculum,
  isCambridgeSpec
} from '../data/boards.js';
import { extractSyllabusCodeFromSubject, resolveCambridgeSyllabus } from '../data/cambridgeCatalog.js';
import {
  getPaperViewKey,
  isQuestionPaperEligibleForViews,
  getPaperTotalViews
} from './paperKeys.js';

export { SUBJECTS_WITH_BOOKS_MAP as SUBJECTS_WITH_BOOKS };
export { getPaperViewKey, isQuestionPaperEligibleForViews, getPaperTotalViews };

export const normalizePaperTelemetryMode = (activeView, canSplit, fallbackDocType) => {
  if (activeView === 'split' && canSplit) return 'split';
  const rawType = String(
    activeView && activeView !== 'split' ? activeView : fallbackDocType || 'QP'
  )
    .trim()
    .toUpperCase();
  if (rawType === 'QP') return 'qp';
  if (rawType === 'MS') return 'ms';
  if (rawType === 'ER') return 'er';
  if (rawType === 'GT') return 'gt';
  return 'other';
};

export const shouldHandleClientNavigation = (e) => (
  !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)
);

export function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= breakpointPx : false
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, [breakpointPx]);
  return isMobile;
}

export const DOC_TYPE_INFO = {
  QP: { label: 'QP', fullLabel: 'Question Paper', cls: 'qp' },
  MS: { label: 'MS', fullLabel: 'Mark Scheme', cls: 'ms' },
  ER: { label: 'ER', fullLabel: 'Examiner Report', cls: 'er' },
  GT: { label: 'GT', fullLabel: 'Grade Thresholds', cls: 'gt' },
  Book: { label: 'Book', fullLabel: 'Textbook', cls: 'book' },
  SOL: { label: 'Solutions', fullLabel: 'Worked Solutions', cls: 'sol' },
  DF: { label: 'Data', fullLabel: 'Data Files', cls: 'df' },
  AUD: { label: 'Audio', fullLabel: 'Listening Audio', cls: 'aud' },
  SC: { label: 'Source', fullLabel: 'Source / Insert', cls: 'sc' },
  SAM: { label: 'SAM', fullLabel: 'Specimen / Syllabus', cls: 'sam' }
};

export const IAL_AUDIO_SUBJECTS = new Set(['French', 'German', 'Spanish']);
export const IGCSE_AUDIO_SUBJECTS = new Set(['Chinese', 'English as a Second Language', 'French', 'German', 'Spanish', 'Swahili']);

export function hasAudioForCourse(curriculum, subject) {
  if (!subject) return false;
  if (isCambridgeCurriculum(curriculum)) {
    const code = extractSyllabusCodeFromSubject(subject);
    return Boolean(code && resolveCambridgeSyllabus(code)?.hasAudio);
  }
  if (curriculum === 'Edexcel IAL') return IAL_AUDIO_SUBJECTS.has(subject);
  if (curriculum === 'Edexcel IGCSE') return IGCSE_AUDIO_SUBJECTS.has(subject);
  return false;
}

export function hasDataFilesForCourse(curriculum, subject) {
  if (!subject) return false;
  if (isCambridgeCurriculum(curriculum)) {
    const code = extractSyllabusCodeFromSubject(subject);
    return Boolean(code && resolveCambridgeSyllabus(code)?.hasDataFiles);
  }
  if (subject === 'Information Technology') return true;
  if (subject === 'Computer Science' && curriculum !== 'Edexcel IAL') return true;
  return false;
}

export function getScDocumentLabel(doc) {
  const name = String(doc?.name || doc?.path || '').toLowerCase();
  const subj = String(doc?.subject || '').toLowerCase();
  const isCie = doc?.board === 'cambridge' || isCambridgeSpec(doc?.spec);
  if (isCie) {
    if (/(?:^|[/_-])in(?:[._-]|$)|insert/i.test(name)) return ['Insert', 'Insert'];
    if (/(?:^|[/_-])ci(?:[._-]|$)|confidential/i.test(name)) return ['Lab Setup (CI)', 'CI'];
    if (/(?:^|[/_-])tn(?:[._-]|$)|transcript|tapescript/i.test(name)) return ['Transcript', 'Transcript'];
    if (/(?:^|[/_-])pm(?:[._-]|$)|pre[-_\s]*release/i.test(name)) return ['Pre-Release', 'Pre-Rel'];
  }
  if (name.includes('transcript')) return ['Transcript', 'Transcript'];
  if (/scientific[\s_-]*article/.test(name) || subj === 'biology') return ['Scientific Article', 'Article'];
  if (/equations?[\s_-]*list/.test(name)) return ['Equations List', 'Equations'];
  if (name.includes('extract')) return ['Extract Booklet', 'Extract'];
  if (/exemplar|exp-and-com/.test(name)) return ['Exemplars', 'Exemplars'];
  if (/speaking|randomis|rand[\s_-]*grid|grid/.test(name)) return ['Speaking / Grid', 'Speaking'];
  if (/guidance|handbook/.test(name)) return ['Guidance', 'Guide'];
  return ['Source Booklet', 'Source'];
}

export function getDocTypeBadge(docType, category) {
  if (isBookCategory(category)) {
    if (docType === 'SOL') return DOC_TYPE_INFO.SOL;
    return DOC_TYPE_INFO.Book;
  }
  if (docType && DOC_TYPE_INFO[docType]) return DOC_TYPE_INFO[docType];
  return null;
}

export function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : decimals))} ${sizes[i]}`;
}

export function formatSubjectDisplay(subj) {
  if (!subj) return '';
  if (subj === 'Math') return 'Mathematics';
  return subj;
}

export function getHfUrl(filePath) {
  if (!filePath) return '';
  const encoded = (filePath || '').split(/[\\/]/).map(encodeURIComponent).join('/');
  if (import.meta.env.DEV) {
    return `/library-files/${encoded}`;
  }
  return `https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/resolve/main/${encoded}`;
}

export function getDownloadUrl(filePath) {
  const url = getHfUrl(filePath);
  if (!url) return '';
  return url.includes('?') ? `${url}&download=true` : `${url}?download=true`;
}

export function formatFallbackBookTitle(rawName = '') {
  return String(rawName || '')
    .replace(/\.(pdf|zip|rar|docx?)$/i, '')
    .replace(/\s*\(\d+\)\s*$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Strip redundant subject prefix from unitName (e.g. "Accounting Unit 1 (WAC11)" -> "Unit 1 (WAC11)")
export function getShortUnitDisplay(file) {
  let u = file.unitName || (file.unitCode ? `Unit ${file.unitCode}` : '');
  if (!u) return '';
  const isCie = file.board === 'cambridge' || isCambridgeSpec(file.spec);
  if (file.subject) {
    const subj = file.subject === 'Information Technology' ? 'IT' : file.subject;
    const prefixRegex = new RegExp(`^(?:${escapeRegExp(file.subject)}|${escapeRegExp(subj)})\\s+`, 'i');
    u = u.replace(prefixRegex, '');
  }
  const v = String(file.variant || '');
  if (isCie && /^\d$/.test(v)) {
    const pMatch = String(file.unitCode || '').match(/P(\d)$/i);
    const compCode = pMatch ? `${pMatch[1]}${v}` : '';
    return compCode ? `${u} (Var ${v} / ${compCode})` : `${u} (Variant ${v})`;
  }
  if (v === 'R') {
    if (u.startsWith('Paper ')) u = `${u}R (Regional / R)`;
    else u = `${u} (Regional / R)`;
  } else if (v === 'A') {
    u = `${u} (Regional / Alt A)`;
  } else if (v === 'F') {
    u = `${u} (Foundation)`;
  } else if (v === 'F-R') {
    u = `${u}R (Regional / Foundation R)`;
  } else if (v === 'H') {
    u = `${u} (Higher)`;
  } else if (v === 'H-R') {
    u = `${u}R (Regional / Higher R)`;
  } else if (v === 'Mod') {
    u = `${u} (Modular)`;
  } else if (v === 'R-Mod') {
    u = `${u}R (Regional / Modular R)`;
  } else if (v === 'H-Mod') {
    u = `${u} (Higher Modular)`;
  } else if (v === 'H-R-Mod') {
    u = `${u}R (Regional / Higher Modular R)`;
  } else if (v === 'F-Mod') {
    u = `${u} (Foundation Modular)`;
  } else if (v === 'F-R-Mod') {
    u = `${u}R (Regional / Foundation Modular R)`;
  } else if (v.startsWith('Opt')) {
    u = `${u} (Option ${v.slice(3)})`;
  } else if (v.startsWith('ER')) {
    u = `Report #${v.slice(2)}`;
  } else if (v) {
    u = `${u} (${v})`;
  }
  return u;
}

// Generate clean, unambiguous human-readable title without duplicate subject names
export function getDisplayTitle(file) {
  if (isBookCategory(file.category)) {
    if (file.bookMeta?.title) return file.bookMeta.title;
    return formatFallbackBookTitle(file.name);
  }

  let cleanName = (file.name || '')
    .replace(/\.(pdf|zip|rar|mp3|wav|docx)$/i, '')
    .replace(/_\d{10,14}/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!file.session && !file.unitName && !file.unitCode) {
    return cleanName;
  }

  const subjStr = file.subject === 'Information Technology'
    ? 'IT'
    : (file.subject === 'Math' ? 'Mathematics' : (file.subject || ''));

  const shortUnit = getShortUnitDisplay(file);
  const badge = getDocTypeBadge(file.docType, file.category);
  const docLabel = badge ? badge.fullLabel : '';

  const mainParts = [subjStr, shortUnit].filter(Boolean).join(' — ');
  const suffixParts = [];
  if (docLabel) suffixParts.push(docLabel);
  if (file.session) suffixParts.push(file.session);
  else if (file.year) suffixParts.push(String(file.year));

  if (!mainParts) return cleanName;
  if (suffixParts.length > 0) {
    return `${mainParts} • ${suffixParts.join(' • ')}`;
  }
  return mainParts;
}

// Generate clean unified sitting title (e.g. "Mathematics — Unit 1 (WMA11) • January 2025")
export function getUnifiedSittingTitle(file) {
  const subjStr = file.subject === 'Information Technology'
    ? 'IT'
    : (file.subject === 'Math' ? 'Mathematics' : (file.subject || ''));
  const shortUnit = getShortUnitDisplay(file);
  const mainParts = [subjStr, shortUnit].filter(Boolean).join(' — ');
  const timePart = file.session || (file.year ? String(file.year) : '');
  if (!mainParts) return getDisplayTitle(file);
  return timePart ? `${mainParts} • ${timePart}` : mainParts;
}

export const HISTORY_STORAGE_KEY = 'cs_recent_papers_v1';
const VIEWS_CACHE_STORAGE_KEY = 'cs_paper_views_cache_v1';
const VIEW_COOLDOWN_STORAGE_KEY = 'cs_paper_view_cooldown_v1';
const VIEWER_ID_STORAGE_KEY = 'cs_viewer_id_v1';
export const ACTIVE_MODAL_PAPER_SESSION_KEY = 'cs_active_modal_paper_v1';
export const PAPER_VIEW_COOLDOWN_MS = 30 * 1000;
export const MAX_HISTORY_ITEMS = 8;
const inMemoryCooldownMap = new Map();

function sanitizeViewsMap(rawMap) {
  const clean = {};
  if (!rawMap || typeof rawMap !== 'object') return clean;
  for (const [k, v] of Object.entries(rawMap)) {
    const val = Number(v);
    if (Number.isFinite(val) && val > 0) {
      clean[k] = Math.floor(val);
    }
  }
  return clean;
}

export function readLocalViewsCache() {
  try {
    const raw = localStorage.getItem(VIEWS_CACHE_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const rawViews = parsed.views && typeof parsed.views === 'object'
      ? parsed.views
      : (parsed.counts && typeof parsed.counts === 'object' ? parsed.counts : parsed);
    if (!rawViews || typeof rawViews !== 'object') return null;
    return sanitizeViewsMap(rawViews);
  } catch {
    return null;
  }
}

export function isLocalViewsCacheStale(maxAgeMs = 10 * 60 * 1000) {
  try {
    const raw = localStorage.getItem(VIEWS_CACHE_STORAGE_KEY);
    if (raw === null) return true;
    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);
    return !updatedAt || (Date.now() - updatedAt > maxAgeMs);
  } catch {
    return true;
  }
}

export function writeLocalViewsCache(rawViewsObj) {
  const cleanViews = sanitizeViewsMap(rawViewsObj);
  try {
    localStorage.setItem(
      VIEWS_CACHE_STORAGE_KEY,
      JSON.stringify({
        views: cleanViews,
        updatedAt: Date.now()
      })
    );
  } catch {
    // Ignore storage quota errors
  }
  return cleanViews;
}

export function updateSinglePaperInLocalViewsCache(paperKey, viewsCount) {
  if (!paperKey) return;
  const cleanCount = Number(viewsCount);
  if (!Number.isFinite(cleanCount) || cleanCount < 0) return;
  try {
    const existingViews = readLocalViewsCache() || {};
    existingViews[paperKey] = Math.max(Number(existingViews[paperKey]) || 0, Math.floor(cleanCount));
    writeLocalViewsCache(existingViews);
  } catch {
    // Ignore storage quota errors
  }
}

export function getOrCreateViewerId() {
  try {
    let vid = localStorage.getItem(VIEWER_ID_STORAGE_KEY);
    if (!vid || typeof vid !== 'string' || vid.length < 8) {
      vid =
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
      localStorage.setItem(VIEWER_ID_STORAGE_KEY, vid);
    }
    return vid;
  } catch {
    return 'anon-session';
  }
}

export function isBrowserReloadNavigation() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
      const navEntries = performance.getEntriesByType('navigation');
      if (Array.isArray(navEntries) && navEntries.length > 0 && navEntries[0].type === 'reload') {
        return true;
      }
    }
    if (typeof performance !== 'undefined' && performance.navigation && performance.navigation.type === 1) {
      return true;
    }
  } catch {
    // Ignore performance API errors
  }
  return false;
}

export function canCountPaperViewNow(paperKey, { isPageReload = false } = {}) {
  if (!paperKey || isPageReload) return false;
  const now = Date.now();
  const memLast = inMemoryCooldownMap.get(paperKey) || 0;
  if (now - memLast < PAPER_VIEW_COOLDOWN_MS) {
    return false;
  }

  let stored = {};
  try {
    const raw = localStorage.getItem(VIEW_COOLDOWN_STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : {};
    if (!stored || typeof stored !== 'object') stored = {};
  } catch {
    stored = {};
  }

  const storageLast = Number(stored[paperKey]) || 0;
  if (now - storageLast < PAPER_VIEW_COOLDOWN_MS) {
    inMemoryCooldownMap.set(paperKey, storageLast);
    return false;
  }

  inMemoryCooldownMap.set(paperKey, now);
  const nextStored = { [paperKey]: now };
  for (const [k, ts] of Object.entries(stored)) {
    if (k !== paperKey && now - Number(ts) < PAPER_VIEW_COOLDOWN_MS) {
      nextStored[k] = Number(ts);
    }
  }
  try {
    localStorage.setItem(VIEW_COOLDOWN_STORAGE_KEY, JSON.stringify(nextStored));
  } catch {
    // Ignore storage quota errors
  }
  return true;
}

// Build a 0ms placeholder object from #paper= / ?paper= URL parameter while index.json resolves in the background
export function buildPendingPaperPlaceholder(paperParam, viewParam = 'QP') {
  if (!paperParam) return null;
  const raw = String(paperParam).trim();
  if (raw.includes('|')) {
    const [spec = 'IAL', subject = '', unitCode = '', variant = '', session = ''] = raw.split('|');
    const yearMatch = session.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : '';
    const curriculum = getCurriculumForSpec(spec);
    const board = getBoardForSpec(spec);
    const syllabusCode = isCambridgeSpec(spec) ? (extractSyllabusCodeFromSubject(subject) || null) : null;
    const tempFile = {
      id: raw,
      isUnifiedSitting: true,
      isPendingSkeleton: true,
      board,
      spec,
      curriculum,
      syllabusCode,
      category: 'Past Papers',
      subject,
      unitCode,
      unitName: unitCode,
      variant,
      year,
      session,
      docType: viewParam === 'MS' || viewParam === 'ER' || viewParam === 'GT' ? viewParam : 'QP',
      ext: 'pdf',
      docs: {},
      siblings: {},
      path: raw,
      name: `${subject} ${unitCode} ${session}`
    };
    tempFile.cleanUnitLabel = unitCode;
    return tempFile;
  }

  const rawLower = raw.toLowerCase();
  const isPdf = rawLower.endsWith('.pdf');
  const extMatch = rawLower.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const fileName = raw.split('/').pop() || raw;
  const inferredDocType =
    viewParam && ['QP', 'MS', 'ER', 'GT', 'AUD', 'SC', 'DF', 'SOL', 'SAM'].includes(viewParam)
      ? viewParam
      : ext === 'mp3' || ext === 'wav' || /audio|recording/i.test(fileName)
      ? 'AUD'
      : 'QP';
  return {
    id: raw,
    path: raw,
    name: fileName,
    ext,
    docType: inferredDocType,
    isPendingSkeleton: !isPdf && inferredDocType !== 'AUD',
    docs: {},
    siblings: {}
  };
}

// Create a compact serializable snapshot of a paper for localStorage recent history
export function serializePaperForHistory(file, preferredView = 'QP') {
  if (!file) return null;
  const pickDoc = (d) => d ? ({
    name: d.name,
    path: d.path,
    ext: d.ext || 'pdf',
    size: d.size || 0,
    docType: d.docType,
    subject: d.subject || file.subject,
    curriculum: d.curriculum || file.curriculum,
    spec: d.spec || file.spec,
    board: d.board || file.board,
    syllabusCode: d.syllabusCode || file.syllabusCode || null,
    unitCode: d.unitCode || file.unitCode,
    unitName: d.unitName || file.unitName,
    cleanUnitLabel: d.cleanUnitLabel || file.cleanUnitLabel,
    variant: d.variant || file.variant,
    year: d.year || file.year,
    session: d.session || file.session,
    category: d.category || file.category
  }) : undefined;

  const rawDocs = { ...(file.siblings || {}), ...(file.docs || {}) };
  if (file.docType && !rawDocs[file.docType] && file.path) {
    rawDocs[file.docType] = file;
  }

  const docs = {};
  ['QP', 'MS', 'ER', 'GT', 'SOL', 'AUD', 'SC', 'DF', 'SAM'].forEach((t) => {
    if (rawDocs[t]) docs[t] = pickDoc(rawDocs[t]);
  });
  if (rawDocs.AUD_ZIP) docs.AUD_ZIP = pickDoc(rawDocs.AUD_ZIP);
  if (rawDocs.AUD_SINGLE) docs.AUD_SINGLE = pickDoc(rawDocs.AUD_SINGLE);

  const primary = docs.QP || docs.MS || docs.ER || docs.GT || pickDoc(file.primaryFile || file);
  const docTypes = Object.keys(docs);

  return {
    id: getPaperViewKey(file) || file.id || file.path,
    isUnifiedSitting: Boolean(file.isUnifiedSitting || docTypes.length > 1),
    board: file.board || getBoardForSpec(file.spec),
    spec: file.spec || (file.curriculum === 'Edexcel IGCSE' ? 'IGCSE' : 'IAL'),
    curriculum: file.curriculum || getCurriculumForSpec(file.spec, file.category),
    syllabusCode: file.syllabusCode || null,
    category: file.category || 'Past Papers',
    subject: file.subject || '',
    unitCode: file.unitCode || '',
    unitName: file.unitName || '',
    cleanUnitLabel: file.cleanUnitLabel || file.unitName || file.unitCode || '',
    variant: file.variant || '',
    year: file.year || '',
    session: file.session || '',
    name: primary?.name || file.name || '',
    path: primary?.path || file.path || '',
    folderPath: file.folderPath || (primary?.path ? primary.path.split('/').slice(0, -1).join('/') : ''),
    ext: primary?.ext || file.ext || 'pdf',
    size: file.size || primary?.size || 0,
    totalSize: file.totalSize || file.size || 0,
    docType: primary?.docType || file.docType || 'QP',
    fileCount: docTypes.length || 1,
    docTypes,
    docs,
    siblings: docs,
    primaryFile: primary,
    lastView: preferredView || 'QP',
    viewedAt: Date.now()
  };
}

export function getInitialRecentHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
