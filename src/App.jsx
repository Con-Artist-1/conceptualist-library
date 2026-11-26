import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef, lazy, Suspense } from 'react';
import './index.css';
import {
  BOARD_STORAGE_KEY,
  DEFAULT_BOARD_ID,
  EDEXCEL_CURRICULUMS,
  CAMBRIDGE_CURRICULUMS,
  ALL_CURRICULUMS,
  getBoardForCurriculum,
  isBookCategory,
  isCambridgePath
} from './data/boards.js';
import { detectLikelyQueryBoard } from './lib/queryBoardDetect.js';
import {
  buildRoutePath,
  parseRouteFromLocation,
  getSeoMetadata,
  getShardPathForRoute,
  IAL_SUBJECTS_DEFAULT,
  IGCSE_SUBJECTS_DEFAULT
} from './lib/routeCore.js';
import { compareUnitLabels } from './lib/unitSort.js';
import {
  APP_VERSION,
  BUILD_TIMESTAMP,
  META_CACHE_KEY,
  DAILY_CACHE_TTL_MS
} from './lib/appMeta.js';
import { resilientFetch, buildIndexCacheUrl } from './lib/networkUtils.js';
import {
  useIsMobile,
  formatSubjectDisplay,
  HISTORY_STORAGE_KEY,
  ACTIVE_MODAL_PAPER_SESSION_KEY,
  MAX_HISTORY_ITEMS,
  getOrCreateViewerId,
  isBrowserReloadNavigation,
  getPaperViewKey,
  isQuestionPaperEligibleForViews,
  getPaperTotalViews,
  buildPendingPaperPlaceholder,
  serializePaperForHistory,
  getInitialRecentHistory
} from './lib/libraryHelpers.js';
import { buildArchiveContextInfo } from './lib/archiveContext.js';
import { getCatalogClient } from './lib/catalogClient.js';
import { preloadReaderChunksOnce } from './lib/pdfPrewarm.js';
import { stopAllSiteAudio } from './lib/audioLifecycle.js';
import { useTheme } from './hooks/useTheme.js';
import { useViewsState } from './hooks/useViewsState.js';
import { useDeployRefresh } from './hooks/useDeployRefresh.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useSeoHeadSync } from './hooks/useSeoHeadSync.js';
import { AppErrorBoundary, CrashRecoveryScreen } from './components/CrashRecoveryScreen.jsx';
import { Header } from './components/Header.jsx';
import { SearchBanner } from './components/SearchBanner.jsx';
import { PaperTable } from './components/PaperTable.jsx';
import { ArchiveContextStrip } from './components/ArchiveContextStrip.jsx';
import { Footer } from './components/Footer.jsx';
import { PdfPaneSkeleton } from './components/Skeletons.jsx';

const WelcomePage = lazy(() => import('./components/WelcomePage.jsx'));
const PreviewModal = lazy(() => import('./components/PreviewModal.jsx'));
const AboutPage = lazy(() => import('./components/AboutPage.jsx'));
const ChangelogPage = lazy(() => import('./components/ChangelogPage.jsx'));
const NotFoundCard = lazy(() => import('./components/NotFoundCard.jsx'));

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 80;
const DEFAULT_ALL_SUBJECTS = Array.from(new Set([...IAL_SUBJECTS_DEFAULT, ...IGCSE_SUBJECTS_DEFAULT])).sort();

const DEFAULT_META = {
  totalFiles: 78820,
  uniqueFiles: 74958,
  totalBooks: 154,
  ialBooks: 60,
  igcseBooks: 13,
  cambridgeBooks: 81,
  dfCount: 46,
  audioCount: 272,
  subjects: DEFAULT_ALL_SUBJECTS,
  ialSubjects: IAL_SUBJECTS_DEFAULT,
  igcseSubjects: IGCSE_SUBJECTS_DEFAULT,
  cieAlSubjects: [],
  cieIgcseSubjects: [],
  cieOlSubjects: [],
  coverage: 'January 2003 – June 2026',
  subjectCoverage: {}
};

const EMPTY_SEARCH_META = {
  isPartialFallback: false,
  missingTerms: [],
  appliedCorrections: [],
  didYouMean: ''
};

function getInitialCachedMeta() {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.meta) {
      const savedAt = Number(parsed.savedAt || 0);
      if (savedAt && Date.now() - savedAt > DAILY_CACHE_TTL_MS) {
        localStorage.removeItem(META_CACHE_KEY);
        return null;
      }
      return { meta: parsed.meta };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function getInitialBoard(initialRoute, initialHistoryState) {
  if (initialHistoryState?.board === 'cambridge' || initialHistoryState?.board === 'edexcel') {
    return initialHistoryState.board;
  }
  if (initialRoute?.activeBoard === 'cambridge' || initialRoute?.activeBoard === 'edexcel') {
    return initialRoute.activeBoard;
  }
  if (initialRoute?.filterCurriculum) {
    return getBoardForCurriculum(initialRoute.filterCurriculum);
  }
  if (initialRoute?.paperParam) {
    const p = String(initialRoute.paperParam);
    if (p.startsWith('CIE-') || isCambridgePath(p)) return 'cambridge';
  }
  if (typeof window !== 'undefined' && ((window.location.pathname || '/').replace(/\/+$/, '') || '/') === '/') {
    try {
      const saved = localStorage.getItem(BOARD_STORAGE_KEY);
      if (saved === 'cambridge' || saved === 'edexcel') return saved;
    } catch {
      // Ignore storage errors
    }
  }
  return DEFAULT_BOARD_ID;
}

function persistBoardPreference(boardId) {
  try {
    localStorage.setItem(BOARD_STORAGE_KEY, boardId);
  } catch {
    // Ignore storage errors
  }
}

function SecondaryPageSkeleton({ label }) {
  return (
    <div
      className="about-card"
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 14, padding: '28px 32px' }}
      aria-busy="true"
      aria-label={label}
    >
      <div className="skeleton-shimmer" style={{ width: '42%', height: 28, borderRadius: 4 }} />
      <div className="skeleton-shimmer" style={{ width: '78%', height: 16, borderRadius: 4 }} />
      <div className="skeleton-shimmer" style={{ width: '66%', height: 16, borderRadius: 4 }} />
      <div className="skeleton-shimmer" style={{ width: '100%', height: 140, borderRadius: 6, marginTop: 12 }} />
      <div className="skeleton-shimmer" style={{ width: '100%', height: 140, borderRadius: 6 }} />
    </div>
  );
}

// ─── Main Application ────────────────────────────────────────────
function App() {
  const isMobile = useIsMobile();
  const initialCache = useMemo(() => getInitialCachedMeta(), []);
  const initialHistoryState = useMemo(() => {
    try {
      const st = typeof window !== 'undefined' ? window.history.state : null;
      if (st && (st.wizardStep === 'unit' || st.wizardStep === 'year') && st.subject && st.curriculum) {
        return st;
      }
    } catch {
      // Ignore history access errors
    }
    return null;
  }, []);
  const initialRoute = useMemo(() => (
    typeof window !== 'undefined'
      ? parseRouteFromLocation(window.location.pathname, window.location.search, initialCache?.meta || DEFAULT_META, window.location.hash)
      : {}
  ), [initialCache]);

  const [activeBoard, setActiveBoard] = useState(() => getInitialBoard(initialRoute, initialHistoryState));
  const [scopeAllBoards, setScopeAllBoards] = useState(() => Boolean(!initialHistoryState && initialRoute.scopeAllBoards));

  const [isNotFound, setIsNotFound] = useState(Boolean(!initialHistoryState && initialRoute.notFound));
  const [wizardSubject, setWizardSubject] = useState(() => (
    initialHistoryState ? { name: initialHistoryState.subject, curriculum: initialHistoryState.curriculum } : null
  ));
  const [wizardUnit, setWizardUnit] = useState(() => (
    initialHistoryState?.wizardStep === 'year' ? (initialHistoryState.unit || null) : null
  ));
  const { viewsMap, viewsVersion, recordPaperView } = useViewsState();
  const [recentHistory, setRecentHistory] = useState(() => getInitialRecentHistory());

  const [meta, setMeta] = useState(() => initialCache?.meta || DEFAULT_META);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogTotalCount, setCatalogTotalCount] = useState(0);
  const [queryResult, setQueryResult] = useState(() => ({
    visibleFiles: [],
    totalMatchedCount: 0,
    meta: EMPTY_SEARCH_META,
    fallbackUnits: null
  }));
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState(initialRoute.searchQuery || '');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(initialRoute.searchQuery || '');
  const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
  const [selectedPath, setSelectedPath] = useState('');
  const [currentTab, setCurrentTab] = useState(initialRoute.currentTab || 'library');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [previewInitialView, setPreviewInitialView] = useState(initialRoute.viewParam || '');
  const [previewFile, setPreviewFile] = useState(() => {
    if (!initialRoute.paperParam) return null;
    const hist = getInitialRecentHistory();
    const cachedMatch = hist.find(
      (h) => h.id === initialRoute.paperParam || h.path === initialRoute.paperParam
    );
    return cachedMatch || buildPendingPaperPlaceholder(initialRoute.paperParam, initialRoute.viewParam);
  });
  const [pendingPaperParam, setPendingPaperParam] = useState(initialRoute.paperParam || '');
  const [viewMode, setViewMode] = useState('unified');

  const { theme, toggleTheme } = useTheme({ isPreviewOpen: Boolean(previewFile) });

  // Filters initialized directly from URL route
  const [filterCurriculum, setFilterCurriculum] = useState(initialHistoryState ? '' : (initialRoute.filterCurriculum || ''));
  const [filterDocType, setFilterDocType] = useState(initialHistoryState ? null : (initialRoute.filterDocType || null));
  const [filterSubject, setFilterSubject] = useState(initialHistoryState ? '' : (initialRoute.filterSubject || ''));
  const [filterUnit, setFilterUnit] = useState(initialHistoryState ? '' : (initialRoute.filterUnit || ''));
  const [filterYear, setFilterYear] = useState(initialHistoryState ? '' : (initialRoute.filterYear || ''));
  const [filterSession, setFilterSession] = useState('');
  const [filterVariant, setFilterVariant] = useState(initialHistoryState ? '' : (initialRoute.filterVariant || ''));
  const [sortBy, setSortBy] = useState('newest');
  const [forceShowTable, setForceShowTable] = useState(Boolean(!initialHistoryState && initialRoute.forceShowTable));
  const [showFilters, setShowFilters] = useState(false);

  const searchInputRef = useRef(null);
  const modalOpenerRef = useRef(null);
  const isPopStateRef = useRef(false);
  const popStateReqIdRef = useRef(0);
  const loadedBoardsRef = useRef(new Set());
  const boardGenAtRef = useRef(new Map());
  const isHydratedRef = useRef(false);
  const hydratedShardPathRef = useRef(null);
  const hydratedShardBoardRef = useRef(null);
  const inFlightShardPathRef = useRef(null);
  const latestLoadedGenAtRef = useRef('');
  const dataMetaRef = useRef(meta);
  dataMetaRef.current = meta;
  const activeBoardRef = useRef(activeBoard);
  activeBoardRef.current = activeBoard;
  const boardIndexPromisesRef = useRef(new Map());
  const ensureBoardIndexRef = useRef(null);
  const queryReqIdRef = useRef(0);
  const lastQueryBaseKeyRef = useRef('');
  const lastVisibleCountRef = useRef(PAGE_SIZE);

  // Debounce live search queries before dispatching to Web Worker (immediate on clear)
  useEffect(() => {
    if (!searchQuery) {
      setDebouncedSearchQuery('');
      return undefined;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Deferred idle telemetry bootstrap
  useEffect(() => {
    let cancelled = false;
    let cleanup = null;
    let timerId = null;
    let idleId = null;

    const startTelemetry = () => {
      import('./telemetry.js')
        .then((mod) => {
          if (cancelled || typeof mod?.initTelemetryTracker !== 'function') return;
          cleanup = mod.initTelemetryTracker({ getViewerId: getOrCreateViewerId });
        })
        .catch(() => {});
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(startTelemetry, { timeout: 1500 });
    } else {
      timerId = setTimeout(startTelemetry, 1200);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null) clearTimeout(timerId);
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const recordPaperInteraction = useCallback((fileObj, preferredView = '', options = {}) => {
    if (!fileObj || fileObj.isPendingSkeleton || fileObj.isNotFound) return;
    recordPaperView(fileObj, options);

    if (!isBookCategory(fileObj.category)) {
      const snapshot = serializePaperForHistory(fileObj, preferredView);
      if (snapshot && snapshot.id) {
        setRecentHistory((prev) => {
          const filtered = prev.filter((item) => item.id !== snapshot.id && item.path !== snapshot.path);
          const next = [snapshot, ...filtered].slice(0, MAX_HISTORY_ITEMS);
          try {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Ignore storage quota errors
          }
          return next;
        });
      }
    }
  }, [recordPaperView]);

  const handleClearHistory = useCallback(() => {
    setRecentHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const openOnSiteReader = useCallback((fileObj, preferredView = '') => {
    if (!fileObj) return;
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      modalOpenerRef.current = document.activeElement;
    }
    setPendingPaperParam('');
    setPreviewInitialView(preferredView);
    setPreviewFile(fileObj);
    recordPaperInteraction(fileObj, preferredView);
  }, [recordPaperInteraction]);

  // Handle browser Back/Forward & hash deep-link navigation across all boards, routes, wizard steps, and modals
  const lastNavLocRef = useRef('');
  const lastNavAtRef = useRef(0);

  useEffect(() => {
    const handlePopState = (event) => {
      const locKey = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const now = Date.now();
      if (event?.type === 'hashchange' && locKey === lastNavLocRef.current && now - lastNavAtRef.current < 80) {
        return;
      }
      lastNavLocRef.current = locKey;
      lastNavAtRef.current = now;

      isPopStateRef.current = true;
      const popReqId = ++popStateReqIdRef.current;
      const navState = (event && event.state) || window.history.state || null;
      const parsed = parseRouteFromLocation(window.location.pathname, window.location.search, dataMetaRef.current, window.location.hash);

      const resolvedBoard =
        navState?.board === 'cambridge' || navState?.board === 'edexcel'
          ? navState.board
          : parsed.activeBoard || (parsed.filterCurriculum ? getBoardForCurriculum(parsed.filterCurriculum) : activeBoardRef.current);

      setActiveBoard(resolvedBoard);
      setScopeAllBoards(Boolean(parsed.scopeAllBoards));

      if ((navState?.wizardStep === 'unit' || navState?.wizardStep === 'year') && navState.subject && navState.curriculum) {
        setCurrentTab('library');
        setIsNotFound(false);
        setFilterCurriculum('');
        setFilterSubject('');
        setFilterUnit('');
        setFilterYear('');
        setFilterSession('');
        setFilterVariant('');
        setFilterDocType(null);
        setSearchQuery('');
        setSelectedPath('');
        setForceShowTable(false);
        setWizardSubject({ name: navState.subject, curriculum: navState.curriculum });
        setWizardUnit(navState.wizardStep === 'year' ? (navState.unit || null) : null);
      } else {
        setWizardSubject(null);
        setWizardUnit(null);
        setCurrentTab(parsed.currentTab || 'library');
        setIsNotFound(Boolean(parsed.notFound));
        setFilterCurriculum(parsed.filterCurriculum || '');
        setFilterSubject(parsed.filterSubject || '');
        setFilterUnit(parsed.filterUnit || '');
        setFilterYear(parsed.filterYear || '');
        setFilterSession('');
        setFilterVariant(parsed.filterVariant || '');
        setFilterDocType(parsed.filterDocType || null);
        setSearchQuery(parsed.searchQuery || '');
        setForceShowTable(Boolean(parsed.forceShowTable));
      }

      setPreviewInitialView(parsed.viewParam || '');
      if (parsed.paperParam) {
        setPendingPaperParam(parsed.paperParam);
        setPreviewFile(buildPendingPaperPlaceholder(parsed.paperParam, parsed.viewParam));
        void getCatalogClient()
          .resolvePaper(parsed.paperParam)
          .then((found) => {
            if (popReqId !== popStateReqIdRef.current) return;
            if (found) {
              setPreviewFile(found);
              setPendingPaperParam('');
            } else if (loadedBoardsRef.current.has(resolvedBoard)) {
              setPreviewFile({ isNotFound: true, path: parsed.paperParam, name: parsed.paperParam });
              setPendingPaperParam('');
            }
          })
          .catch(() => {});
      } else {
        stopAllSiteAudio();
        setPreviewFile(null);
        setPendingPaperParam('');
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Guarantee zero audio ever lingers when no preview modal is open
  useEffect(() => {
    if (!previewFile) {
      stopAllSiteAudio();
    }
  }, [previewFile]);

  // Re-resolve unit slug and route validity once wizard metadata finishes hydrating on cold visits
  const initialUnitHydratedRef = useRef(false);
  useEffect(() => {
    if (initialUnitHydratedRef.current) return;
    if (!meta?.wizard) return;
    initialUnitHydratedRef.current = true;
    const activeWiz = window.history.state?.wizardStep;
    if (activeWiz === 'unit' || activeWiz === 'year') return;
    const segments = (window.location.pathname || '/').split('/').filter(Boolean);
    if (segments.length >= 1) {
      const parsed = parseRouteFromLocation(window.location.pathname, window.location.search, meta, window.location.hash);
      setIsNotFound(Boolean(parsed.notFound));
      if (parsed.activeBoard) setActiveBoard(parsed.activeBoard);
      if (parsed.filterUnit) {
        setFilterCurriculum(parsed.filterCurriculum);
        setFilterSubject(parsed.filterSubject);
        setFilterUnit(parsed.filterUnit);
        setForceShowTable(true);
      }
    }
  }, [meta]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [currentTab]);

  // Resolve #paper= / ?paper= deep link once worker catalog finishes loading
  useEffect(() => {
    if (!pendingPaperParam || catalogRevision === 0) return undefined;
    let cancelled = false;
    void getCatalogClient()
      .resolvePaper(pendingPaperParam)
      .then((found) => {
        if (cancelled) return;
        if (found) {
          setPreviewFile(found);
          const resolvedKey = getPaperViewKey(found);
          let alreadyOpenInSession = false;
          try {
            alreadyOpenInSession = sessionStorage.getItem(ACTIVE_MODAL_PAPER_SESSION_KEY) === resolvedKey;
          } catch {
            alreadyOpenInSession = false;
          }
          const isPageReload = isBrowserReloadNavigation() || alreadyOpenInSession;
          recordPaperInteraction(found, previewInitialView || 'QP', { isPageReload });
          setPendingPaperParam('');
        } else {
          const needBoard = (pendingPaperParam.startsWith('CIE-') || isCambridgePath(pendingPaperParam))
            ? 'cambridge'
            : activeBoardRef.current;
          if (loadedBoardsRef.current.has(needBoard)) {
            setPreviewFile({ isNotFound: true, path: pendingPaperParam, name: pendingPaperParam });
            setPendingPaperParam('');
          } else {
            ensureBoardIndexRef.current?.(needBoard, { showLoader: false });
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pendingPaperParam, catalogRevision, previewInitialView, recordPaperInteraction]);

  const isWizardRouteActive = Boolean(
    currentTab === 'library' &&
    !isNotFound &&
    selectedPath === '' &&
    !filterCurriculum &&
    !filterDocType &&
    !filterSubject &&
    !filterUnit &&
    !filterYear &&
    !filterSession &&
    !filterVariant &&
    !searchQuery &&
    !forceShowTable
  );
  const effectiveRouteCurriculum = isWizardRouteActive && wizardSubject ? wizardSubject.curriculum : filterCurriculum;
  const effectiveRouteSubject = isWizardRouteActive && wizardSubject ? wizardSubject.name : filterSubject;
  const effectiveRouteUnit = isWizardRouteActive && wizardSubject && wizardUnit ? wizardUnit : filterUnit;

  const seoMeta = useMemo(() => getSeoMetadata({
    currentTab,
    activeBoard,
    scopeAllBoards,
    filterCurriculum: effectiveRouteCurriculum,
    filterSubject: effectiveRouteSubject,
    filterUnit: effectiveRouteUnit,
    filterYear,
    filterDocType,
    searchQuery: deferredSearchQuery,
    paperParam: previewFile && !previewFile.isNotFound ? (previewFile.id || previewFile.path) : pendingPaperParam,
    forceShowTable,
    notFound: currentTab === 'library' && isNotFound,
    meta
  }), [
    currentTab,
    activeBoard,
    scopeAllBoards,
    effectiveRouteCurriculum,
    effectiveRouteSubject,
    effectiveRouteUnit,
    filterYear,
    filterDocType,
    deferredSearchQuery,
    previewFile,
    pendingPaperParam,
    forceShowTable,
    isNotFound,
    meta
  ]);

  useSeoHeadSync({
    currentTab,
    activeBoard,
    scopeAllBoards,
    isNotFound,
    isWizardRouteActive,
    wizardSubject,
    wizardUnit,
    effectiveRouteCurriculum,
    effectiveRouteSubject,
    effectiveRouteUnit,
    filterUnit,
    filterYear,
    filterVariant,
    filterDocType,
    deferredSearchQuery,
    previewFile,
    pendingPaperParam,
    previewInitialView,
    forceShowTable,
    seoMeta,
    meta,
    isPopStateRef
  });

  useKeyboardShortcuts({ searchInputRef, isPreviewOpen: Boolean(previewFile) });

  useDeployRefresh({
    previewFile,
    searchQuery,
    latestLoadedGenAtRef,
    dataMetaRef
  });

  const getOnSitePaperUrl = useCallback((fileObj, preferredView = '') => {
    const fileBoard = fileObj?.board || (fileObj?.curriculum ? getBoardForCurriculum(fileObj.curriculum) : activeBoard);
    return buildRoutePath({
      currentTab: 'library',
      activeBoard: fileBoard,
      scopeAllBoards,
      filterCurriculum: filterCurriculum || fileObj?.curriculum || '',
      filterSubject: filterSubject || fileObj?.subject || '',
      filterUnit: filterUnit || fileObj?.cleanUnitLabel || '',
      filterYear,
      filterVariant,
      filterDocType,
      searchQuery: deferredSearchQuery,
      previewFile: fileObj,
      previewMode: preferredView,
      forceShowTable
    });
  }, [activeBoard, scopeAllBoards, filterCurriculum, filterSubject, filterUnit, filterYear, filterVariant, filterDocType, deferredSearchQuery, forceShowTable]);

  // Multi-board zero-waterfall catalog hydration via Web Worker
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    const buildQuery = encodeURIComponent(BUILD_TIMESTAMP);
    const activeRoute = retryCount > 0 && typeof window !== 'undefined'
      ? parseRouteFromLocation(window.location.pathname, window.location.search, dataMetaRef.current, window.location.hash)
      : initialRoute;
    const bootBoard = getInitialBoard(activeRoute, initialHistoryState);
    const initialShardRoute = getShardPathForRoute(activeRoute);
    const catalogClient = getCatalogClient();

    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cs_library_meta_') && k !== META_CACHE_KEY) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // Ignore storage errors
    }

    let latestMeta = initialCache?.meta || null;
    let shardFailed = false;

    const getBoardIndexUrls = (bKey) => (
      bKey === 'cambridge'
        ? [
            `/index-cambridge.json?v=${buildQuery}`,
            '/index-cambridge.json',
            'https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/resolve/main/live_index_cambridge.json'
          ]
        : [
            `/index.json?v=${buildQuery}`,
            '/index.json',
            'https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/resolve/main/live_index.json'
          ]
    );

    const earlyFetch = typeof window !== 'undefined' ? window.__CS_EARLY_FETCH__ : null;
    if (typeof window !== 'undefined' && window.__CS_EARLY_FETCH__) {
      window.__CS_EARLY_FETCH__ = null;
    }

    const markWorkerHydrated = (res, { isFull, board = 'edexcel', shardPath = null }) => {
      if (cancelled || !res) return;
      const bKey = res.board || board || 'edexcel';
      if (!isFull && bKey !== 'all' && loadedBoardsRef.current.has(bKey)) return;
      isHydratedRef.current = true;
      if (res.isFull || isFull) {
        loadedBoardsRef.current.add(bKey);
        boardGenAtRef.current.set(bKey, res.generatedAt || '');
        latestLoadedGenAtRef.current = res.generatedAt || latestLoadedGenAtRef.current;
        if (hydratedShardPathRef.current && shardPath === null && hydratedShardBoardRef.current === bKey) {
          hydratedShardPathRef.current = null;
          hydratedShardBoardRef.current = null;
        }
      } else if (shardPath) {
        hydratedShardPathRef.current = shardPath;
        hydratedShardBoardRef.current = bKey;
      }
      if (res.meta && res.meta.wizard) {
        setMeta(res.meta);
      }
      if (res.counts) {
        setCatalogTotalCount((prev) => Math.max(prev, res.counts.unifiedCount || res.counts.flatCount || 0));
      }
      setLoading(false);
      setLoadError(null);
      setCatalogRevision((rev) => rev + 1);
    };

    const loadSingleBoardIndex = async (boardKey, freshMeta = latestMeta, { showLoader = false, forceReload = false } = {}) => {
      if (cancelled) return;
      const bKey = boardKey === 'cambridge' ? 'cambridge' : 'edexcel';
      if (
        !forceReload &&
        loadedBoardsRef.current.has(bKey) &&
        (!freshMeta || boardGenAtRef.current.get(bKey) === freshMeta.generatedAt)
      ) {
        return;
      }
      if (boardIndexPromisesRef.current.has(bKey)) {
        return boardIndexPromisesRef.current.get(bKey);
      }

      const cacheUrl = buildIndexCacheUrl(APP_VERSION, BUILD_TIMESTAMP, bKey);
      const task = (async () => {
        if (showLoader && !loadedBoardsRef.current.has(bKey)) setFilesLoading(true);
        setLoadError(null);

        try {
          if (!forceReload && earlyFetch?.fullBufferPromise && (earlyFetch.board || 'edexcel') === bKey) {
            const p = earlyFetch.fullBufferPromise;
            earlyFetch.fullBufferPromise = null;
            try {
              const buf = await p;
              if (buf && buf.byteLength > 0 && !cancelled) {
                const res = await catalogClient.loadBuffer(buf, { isFull: true, cacheUrl, board: bKey });
                markWorkerHydrated(res, { isFull: true, board: bKey });
                return;
              }
            } catch (bufErr) {
              console.warn(`Early buffer decode failed for ${bKey}, falling back to network/cache fetch:`, bufErr);
            }
          }

          const res = await catalogClient.loadFullIndex({
            urls: getBoardIndexUrls(bKey),
            cacheUrl,
            expectedMeta: freshMeta,
            forceReload,
            board: bKey,
            signal: abortController.signal
          });
          markWorkerHydrated(res, { isFull: true, board: bKey });
        } catch (err) {
          if (!cancelled && err?.name !== 'AbortError') {
            console.error(`Failed to load ${bKey} index from all candidate sources:`, err);
            setLoading(false);
            setFilesLoading(false);
            setLoadError(err?.message || 'Connection delayed');
          }
        } finally {
          boardIndexPromisesRef.current.delete(bKey);
        }
      })();

      boardIndexPromisesRef.current.set(bKey, task);
      return task;
    };

    const ensureBoardIndex = (target, opts = {}) => {
      if (target === 'all') {
        return Promise.all([
          loadSingleBoardIndex('edexcel', latestMeta, opts),
          loadSingleBoardIndex('cambridge', latestMeta, opts)
        ]);
      }
      return loadSingleBoardIndex(target || activeBoardRef.current, latestMeta, opts);
    };

    ensureBoardIndexRef.current = ensureBoardIndex;

    const isCrossBoardShard = (sp) => (
      sp === '/shards/audio.json' ||
      sp === '/shards/data-files.json' ||
      sp === '/shards/textbooks.json'
    );

    const hydrateInitialShard = async () => {
      if (!initialShardRoute) return;
      const shardTargetBoard = isCrossBoardShard(initialShardRoute) ? 'all' : bootBoard;
      const cacheUrl = buildIndexCacheUrl(APP_VERSION, BUILD_TIMESTAMP, bootBoard);
      inFlightShardPathRef.current = initialShardRoute;
      try {
        if (earlyFetch?.shardBufferPromise && earlyFetch.shardPath === initialShardRoute) {
          const p = earlyFetch.shardBufferPromise;
          earlyFetch.shardBufferPromise = null;
          try {
            const buf = await p;
            if (buf && buf.byteLength > 0 && !cancelled && (shardTargetBoard === 'all' || !loadedBoardsRef.current.has(bootBoard))) {
              const res = await catalogClient.loadBuffer(buf, { isFull: false, board: shardTargetBoard });
              markWorkerHydrated(res, { isFull: false, board: res?.board || shardTargetBoard, shardPath: initialShardRoute });
              return;
            }
          } catch (bufErr) {
            console.warn('Early shard buffer decode failed, falling back to shard fetch:', bufErr);
          }
        }

        const res = await catalogClient.loadShard({
          shardUrl: `${initialShardRoute}?v=${buildQuery}`,
          cacheUrl,
          expectedMeta: latestMeta,
          board: shardTargetBoard,
          signal: abortController.signal
        });
        markWorkerHydrated(res, { isFull: Boolean(res?.isFull), board: res?.board || shardTargetBoard, shardPath: initialShardRoute });
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;
        shardFailed = true;
        void ensureBoardIndex(shardTargetBoard, { showLoader: true });
      } finally {
        if (inFlightShardPathRef.current === initialShardRoute) {
          inFlightShardPathRef.current = null;
        }
      }
    };

    const initialDemand = Boolean(
      (activeRoute.currentTab && activeRoute.currentTab !== 'library') ||
      activeRoute.notFound ||
      activeRoute.filterCurriculum ||
      activeRoute.filterDocType ||
      activeRoute.filterSubject ||
      activeRoute.filterUnit ||
      activeRoute.filterYear ||
      activeRoute.filterVariant ||
      activeRoute.searchQuery ||
      activeRoute.forceShowTable ||
      activeRoute.paperParam
    );

    if (initialShardRoute) {
      void hydrateInitialShard();
    } else if (initialDemand && !activeRoute.notFound && activeRoute.currentTab === 'library') {
      void loadSingleBoardIndex(bootBoard, latestMeta, { showLoader: true });
    }

    const metaPromise = earlyFetch?.metaPromise
      ? earlyFetch.metaPromise.then((json) => json || resilientFetch([`/meta.json?v=${buildQuery}`, '/meta.json'], { signal: abortController.signal }, 25000).then((r) => r.json()))
      : resilientFetch([`/meta.json?v=${buildQuery}`, '/meta.json'], { signal: abortController.signal }, 25000).then((r) => r.json());

    metaPromise
      .then((json) => {
        if (cancelled) return;
        latestMeta = json?.meta || null;
        if (json?.meta) {
          setMeta(json.meta);
          setLoading(false);
        }
        try {
          localStorage.setItem(META_CACHE_KEY, JSON.stringify({
            meta: json.meta,
            savedAt: Date.now()
          }));
        } catch {
          // Ignore quota errors
        }
        const staleFullCache = loadedBoardsRef.current.has(bootBoard) && boardGenAtRef.current.get(bootBoard) !== (json?.meta?.generatedAt || '');
        if ((!initialShardRoute || shardFailed || staleFullCache) && (initialDemand || staleFullCache)) {
          if (staleFullCache) loadedBoardsRef.current.delete(bootBoard);
          void loadSingleBoardIndex(bootBoard, json?.meta || null, { forceReload: staleFullCache });
        }
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        console.warn('Meta fetch error, proceeding to cached or remote full index:', err);
        if (initialShardRoute && shardFailed) {
          void loadSingleBoardIndex(bootBoard, null);
        }
      });

    const promisesMap = boardIndexPromisesRef.current;

    return () => {
      cancelled = true;
      abortController.abort();
      promisesMap.clear();
    };
  }, [initialCache, initialHistoryState, initialRoute, retryCount]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeBoard, scopeAllBoards, selectedPath, filterCurriculum, filterDocType, filterSubject, filterUnit, filterYear, filterSession, filterVariant, deferredSearchQuery, sortBy, viewMode]);

  const handleSubjectSelect = useCallback((subject, curriculum = '') => {
    setCurrentTab('library');
    setIsNotFound(false);
    setWizardSubject(null);
    setWizardUnit(null);
    if (curriculum) {
      setFilterCurriculum(curriculum);
      const b = getBoardForCurriculum(curriculum);
      setActiveBoard(b);
      persistBoardPreference(b);
    }
    setFilterSubject(subject);
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setFilterVariant('');
    setSearchQuery('');
    setForceShowTable(true);
    setSelectedPath('');
  }, []);

  const handleSelectFinalFilter = useCallback(({ subject, curriculum, unit, year }) => {
    setCurrentTab('library');
    setIsNotFound(false);
    setWizardSubject(null);
    setWizardUnit(null);
    if (curriculum) {
      setFilterCurriculum(curriculum);
      const b = getBoardForCurriculum(curriculum);
      setActiveBoard(b);
      persistBoardPreference(b);
    }
    if (subject) setFilterSubject(subject);
    setFilterUnit(unit || '');
    setFilterYear(year ? String(year) : '');
    setFilterSession('');
    setFilterVariant('');
    setSearchQuery('');
    setForceShowTable(true);
    setSelectedPath('');
  }, []);

  const clearFilters = useCallback(({ pushUrl = true, targetBoard = null } = {}) => {
    const nextBoard = targetBoard || activeBoardRef.current || DEFAULT_BOARD_ID;
    const homeUrl = nextBoard === 'cambridge' ? '/cambridge' : '/';
    setIsNotFound(false);
    setScopeAllBoards(false);
    setWizardSubject(null);
    setWizardUnit(null);
    setFilterCurriculum('');
    setFilterDocType(null);
    setFilterSubject('');
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setFilterVariant('');
    setSearchQuery('');
    setSortBy('newest');
    setForceShowTable(false);
    setSelectedPath('');
    if (pushUrl && typeof window !== 'undefined' && (window.location.pathname !== homeUrl || window.location.search !== '' || window.location.hash !== '')) {
      window.history.pushState({ wizardStep: 'home', board: nextBoard }, '', homeUrl);
    }
  }, []);

  const handleSwitchBoard = useCallback((nextBoard, { keepQuery = false } = {}) => {
    if (nextBoard !== 'edexcel' && nextBoard !== 'cambridge') return;
    stopAllSiteAudio();
    persistBoardPreference(nextBoard);
    setActiveBoard(nextBoard);
    setScopeAllBoards(false);
    setCurrentTab('library');
    setIsNotFound(false);
    setWizardSubject(null);
    setWizardUnit(null);
    setPreviewFile(null);
    setPendingPaperParam('');
    setFilterCurriculum('');
    setFilterDocType(null);
    setFilterSubject('');
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setFilterVariant('');
    setSelectedPath('');
    if (keepQuery) {
      setForceShowTable(true);
      ensureBoardIndexRef.current?.(nextBoard, { showLoader: true });
    } else {
      setSearchQuery('');
      setForceShowTable(false);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const handleSwitchBoardKeepingQuery = useCallback((targetBoard) => {
    handleSwitchBoard(targetBoard, { keepQuery: true });
  }, [handleSwitchBoard]);

  const handleSelectBoardScope = useCallback((scopeVal) => {
    setIsNotFound(false);
    if (scopeVal === 'all') {
      setScopeAllBoards(true);
      setFilterCurriculum('');
      setFilterSubject('');
      setFilterUnit('');
      setFilterVariant('');
      setForceShowTable(true);
      ensureBoardIndexRef.current?.('all', { showLoader: true });
    } else if (scopeVal === 'edexcel' || scopeVal === 'cambridge') {
      setScopeAllBoards(false);
      if (scopeVal !== activeBoardRef.current) {
        handleSwitchBoard(scopeVal, { keepQuery: Boolean(searchQuery.trim()) });
      }
    }
  }, [handleSwitchBoard, searchQuery]);

  const navigateToHome = useCallback((e) => {
    if (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      if (e.preventDefault) e.preventDefault();
    }
    const homeBoard = activeBoardRef.current || DEFAULT_BOARD_ID;
    const homeUrl = homeBoard === 'cambridge' ? '/cambridge' : '/';
    stopAllSiteAudio();
    setCurrentTab('library');
    setIsNotFound(false);
    setScopeAllBoards(false);
    setWizardSubject(null);
    setWizardUnit(null);
    setPreviewFile(null);
    setPendingPaperParam('');
    try {
      sessionStorage.removeItem(ACTIVE_MODAL_PAPER_SESSION_KEY);
    } catch {
      // Ignore sessionStorage errors
    }
    setFilterCurriculum('');
    setFilterDocType(null);
    setFilterSubject('');
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setFilterVariant('');
    setSearchQuery('');
    setSortBy('newest');
    setForceShowTable(false);
    setSelectedPath('');
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== homeUrl || window.location.search !== '' || window.location.hash !== '') {
        window.history.pushState({ wizardStep: 'home', board: homeBoard }, '', homeUrl);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleViewAll = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setForceShowTable(true);
    ensureBoardIndexRef.current?.(activeBoardRef.current, { showLoader: true });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearFilters]);

  const handleBrowseTextbooks = useCallback((targetBoard = null) => {
    const nextBoard = targetBoard === 'cambridge' || targetBoard === 'edexcel'
      ? targetBoard
      : (activeBoardRef.current || 'edexcel');
    setCurrentTab('library');
    persistBoardPreference(nextBoard);
    setActiveBoard(nextBoard);
    clearFilters({ pushUrl: false, targetBoard: nextBoard });
    setFilterDocType('Book');
    setForceShowTable(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearFilters]);

  const handleBrowseAudio = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setScopeAllBoards(true);
    setFilterDocType('AUD');
    setForceShowTable(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearFilters]);

  const handleBrowseThresholds = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setFilterDocType('GT');
    setForceShowTable(true);
    ensureBoardIndexRef.current?.('cambridge', { showLoader: true });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearFilters]);

  const handleTrySampleAudio = useCallback(() => {
    const SAMPLE_AUDIO_ID = 'IAL|French|WFR02||June 2021';
    preloadReaderChunksOnce();
    void getCatalogClient()
      .resolveSampleAudio('edexcel')
      .then((sample) => {
        if (sample) {
          openOnSiteReader(sample, 'AUD');
          return;
        }
        ensureBoardIndexRef.current?.('edexcel', { showLoader: false });
        setPreviewInitialView('AUD');
        setPendingPaperParam(SAMPLE_AUDIO_ID);
        setPreviewFile(buildPendingPaperPlaceholder(SAMPLE_AUDIO_ID, 'AUD'));
      })
      .catch(() => {
        ensureBoardIndexRef.current?.('edexcel', { showLoader: false });
        setPreviewInitialView('AUD');
        setPendingPaperParam(SAMPLE_AUDIO_ID);
        setPreviewFile(buildPendingPaperPlaceholder(SAMPLE_AUDIO_ID, 'AUD'));
      });
  }, [openOnSiteReader]);

  const retryLoadIndex = useCallback(() => {
    setFilesLoading(true);
    setLoadError(null);
    setRetryCount((c) => c + 1);
  }, []);

  const hasActiveFilters = Boolean(
    filterCurriculum ||
    filterDocType ||
    filterSubject ||
    filterUnit ||
    filterYear ||
    filterSession ||
    filterVariant ||
    searchQuery ||
    forceShowTable
  );
  const isRoot = selectedPath === '';
  const showWelcome = isRoot && !hasActiveFilters;

  const effectiveQueryBoard = scopeAllBoards ? 'all' : activeBoard;

  // Cross-board smart nudge when a query clearly matches the other board (e.g. "0625 42" in Edexcel or "WMA11" in Cambridge)
  const suggestedOtherBoard = useMemo(() => {
    if (scopeAllBoards || !searchQuery || !searchQuery.trim()) return null;
    const likely = detectLikelyQueryBoard(searchQuery);
    return likely && likely !== activeBoard ? likely : null;
  }, [searchQuery, activeBoard, scopeAllBoards]);

  const availableSubjectsForFilter = useMemo(() => {
    if (filterCurriculum === 'Edexcel IAL') return meta?.ialSubjects || IAL_SUBJECTS_DEFAULT;
    if (filterCurriculum === 'Edexcel IGCSE') return meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT;
    if (filterCurriculum === 'Cambridge AS & A Level') return meta?.cieAlSubjects || [];
    if (filterCurriculum === 'Cambridge IGCSE') return meta?.cieIgcseSubjects || [];
    if (filterCurriculum === 'Cambridge O Level') return meta?.cieOlSubjects || [];
    if (scopeAllBoards) return meta?.subjects || [];
    if (activeBoard === 'cambridge') {
      return Array.from(new Set([
        ...(meta?.cieAlSubjects || []),
        ...(meta?.cieIgcseSubjects || []),
        ...(meta?.cieOlSubjects || [])
      ])).sort();
    }
    return Array.from(new Set([
      ...(meta?.ialSubjects || IAL_SUBJECTS_DEFAULT),
      ...(meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT)
    ])).sort();
  }, [filterCurriculum, activeBoard, scopeAllBoards, meta]);

  const activeCurriculumsForMeta = useMemo(() => {
    if (filterCurriculum) return [filterCurriculum];
    if (scopeAllBoards) return ALL_CURRICULUMS;
    return activeBoard === 'cambridge' ? CAMBRIDGE_CURRICULUMS : EDEXCEL_CURRICULUMS;
  }, [filterCurriculum, scopeAllBoards, activeBoard]);

  const hasWizardUnits = useMemo(() => {
    if (!filterSubject || !meta?.wizard) return false;
    return activeCurriculumsForMeta.some((c) => {
      const unitsObj = meta.wizard[c]?.[filterSubject]?.units;
      return Boolean(unitsObj && Object.keys(unitsObj).length > 0);
    });
  }, [filterSubject, activeCurriculumsForMeta, meta]);

  const availableUnitsForFilter = useMemo(() => {
    if (!filterSubject) return [];
    const wizard = meta?.wizard;
    if (wizard) {
      const set = new Set();
      activeCurriculumsForMeta.forEach((c) => {
        const unitsObj = wizard[c]?.[filterSubject]?.units;
        if (unitsObj) Object.keys(unitsObj).forEach((u) => set.add(u));
      });
      if (set.size > 0) return Array.from(set).sort((a, b) => compareUnitLabels(a, b, filterSubject));
    }
    return queryResult.fallbackUnits || [];
  }, [filterSubject, activeCurriculumsForMeta, meta, queryResult.fallbackUnits]);

  const availableYearsForFilter = useMemo(() => {
    const wizard = meta?.wizard;
    if (filterSubject && wizard) {
      const set = new Set();
      activeCurriculumsForMeta.forEach((c) => {
        const subjEntry = wizard[c]?.[filterSubject];
        if (subjEntry) {
          const yrs = filterUnit && subjEntry.units?.[filterUnit]
            ? subjEntry.units[filterUnit].years
            : subjEntry.allYears;
          (yrs || []).forEach((y) => set.add(y));
        }
      });
      if (set.size > 0) return Array.from(set).sort((a, b) => b - a);
    }
    const years = [];
    for (let y = 2026; y >= 2003; y--) years.push(y);
    return years;
  }, [filterSubject, activeCurriculumsForMeta, filterUnit, meta]);

  // Execute off-thread filtering, smart fuzzy search, sorting, and pagination slicing inside the Web Worker
  const popularViewsDep = sortBy === 'popular' ? viewsMap : null;
  const popularViewsVerDep = sortBy === 'popular' ? viewsVersion : 0;

  useEffect(() => {
    if (showWelcome || currentTab !== 'library' || isNotFound) {
      setFilesLoading(false);
      return undefined;
    }
    const currentRouteShard = getShardPathForRoute({
      currentTab,
      filterCurriculum,
      filterSubject,
      filterUnit,
      filterDocType,
      notFound: currentTab === 'library' && isNotFound
    });
    const hasMatchingShard = Boolean(
      currentRouteShard &&
      hydratedShardPathRef.current === currentRouteShard &&
      (
        hydratedShardBoardRef.current === effectiveQueryBoard ||
        hydratedShardBoardRef.current === 'all'
      )
    );
    const isTargetBoardHydrated = effectiveQueryBoard === 'all'
      ? ((loadedBoardsRef.current.has('edexcel') && loadedBoardsRef.current.has('cambridge')) || hasMatchingShard)
      : (loadedBoardsRef.current.has(effectiveQueryBoard) || hasMatchingShard);
    if (catalogRevision === 0 || !isTargetBoardHydrated) {
      setFilesLoading(true);
      return undefined;
    }
    if (Boolean(searchQuery && searchQuery.trim()) && !deferredSearchQuery) {
      setFilesLoading(true);
      return undefined;
    }

    const reqId = ++queryReqIdRef.current;
    const baseKey = JSON.stringify([
      catalogRevision,
      effectiveQueryBoard,
      selectedPath,
      viewMode,
      filterCurriculum,
      filterSubject,
      filterUnit,
      filterYear,
      filterSession,
      filterVariant,
      filterDocType,
      deferredSearchQuery,
      sortBy,
      popularViewsVerDep
    ]);

    const canFastSlice = baseKey === lastQueryBaseKeyRef.current && visibleCount !== lastVisibleCountRef.current;
    lastQueryBaseKeyRef.current = baseKey;
    lastVisibleCountRef.current = visibleCount;

    const catalogClient = getCatalogClient();
    const promise = canFastSlice
      ? catalogClient.slice(visibleCount)
      : catalogClient.query({
          selectedPath,
          viewMode,
          filterBoard: effectiveQueryBoard,
          filterCurriculum,
          filterSubject,
          filterUnit,
          filterYear,
          filterSession,
          filterVariant,
          filterDocType,
          searchQuery: deferredSearchQuery,
          sortBy,
          viewsMap: popularViewsDep,
          visibleCount,
          needFallbackUnits: Boolean(filterSubject && !hasWizardUnits)
        });

    void promise
      .then((res) => {
        if (reqId !== queryReqIdRef.current || !res) return;
        setQueryResult((prev) => ({
          visibleFiles: res.visibleFiles || [],
          totalMatchedCount: res.totalMatchedCount || 0,
          meta: res.meta || EMPTY_SEARCH_META,
          fallbackUnits: res.fallbackUnits !== undefined ? res.fallbackUnits : prev.fallbackUnits
        }));
        setFilesLoading(false);
      })
      .catch((err) => {
        if (reqId !== queryReqIdRef.current) return;
        console.warn('Catalog query error:', err);
        setFilesLoading(false);
      });

    return undefined;
  }, [
    catalogRevision,
    effectiveQueryBoard,
    showWelcome,
    currentTab,
    isNotFound,
    selectedPath,
    viewMode,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterSession,
    filterVariant,
    filterDocType,
    searchQuery,
    deferredSearchQuery,
    sortBy,
    popularViewsDep,
    popularViewsVerDep,
    visibleCount,
    hasWizardUnits
  ]);

  const visibleFiles = queryResult.visibleFiles;
  const totalMatchedCount = queryResult.totalMatchedCount;
  const searchMeta = queryResult.meta;

  // Clear stale homepage wizard selection whenever user activates search or table filters
  useEffect(() => {
    if (!showWelcome && (wizardSubject || wizardUnit)) {
      setWizardSubject(null);
      setWizardUnit(null);
    }
  }, [showWelcome, wizardSubject, wizardUnit]);

  const activeDateText = useMemo(() => {
    const activeSubj = filterSubject || (showWelcome ? wizardSubject?.name : '');
    const activeCurr = filterCurriculum || (showWelcome ? wizardSubject?.curriculum : '');
    if (activeSubj) {
      const cov =
        activeCurr === 'Edexcel IGCSE' ? meta?.igcseSubjectCoverage?.[activeSubj]
        : activeCurr === 'Edexcel IAL' ? meta?.ialSubjectCoverage?.[activeSubj]
        : activeCurr === 'Cambridge AS & A Level' ? meta?.cieAlSubjectCoverage?.[activeSubj]
        : activeCurr === 'Cambridge IGCSE' ? meta?.cieIgcseSubjectCoverage?.[activeSubj]
        : activeCurr === 'Cambridge O Level' ? meta?.cieOlSubjectCoverage?.[activeSubj]
        : meta?.subjectCoverage?.[activeSubj];
      if (cov) return `${formatSubjectDisplay(activeSubj)}: ${cov}`;
    }
    if (activeBoard === 'cambridge') {
      return meta?.boards?.cambridge?.coverage || 'Cambridge International (CAIE)';
    }
    return meta?.boards?.edexcel?.coverage || meta?.coverage || 'January 2003 – June 2026';
  }, [activeBoard, filterSubject, filterCurriculum, showWelcome, wizardSubject, meta]);

  const activeDrawerFilterCount = useMemo(() => {
    let count = 0;
    if (scopeAllBoards) count += 1;
    if (filterDocType) count += 1;
    if (filterSubject) count += 1;
    if (filterUnit) count += 1;
    if (filterYear) count += 1;
    if (filterSession) count += 1;
    if (filterVariant) count += 1;
    if (sortBy !== 'newest') count += 1;
    if (viewMode !== 'unified') count += 1;
    return count;
  }, [scopeAllBoards, filterDocType, filterSubject, filterUnit, filterYear, filterSession, filterVariant, sortBy, viewMode]);

  // Upgrade from a route shard or hydrate the active board's shard/full index on demand
  useEffect(() => {
    const requiredTarget = scopeAllBoards ? 'all' : activeBoard;
    const isTargetLoaded = requiredTarget === 'all'
      ? (loadedBoardsRef.current.has('edexcel') && loadedBoardsRef.current.has('cambridge'))
      : loadedBoardsRef.current.has(requiredTarget);
    if (isTargetLoaded) return undefined;

    const activeShard = getShardPathForRoute({
      currentTab,
      filterCurriculum,
      filterSubject,
      filterUnit,
      filterDocType,
      notFound: currentTab === 'library' && isNotFound
    });
    const isCrossBoardHubShard = (
      activeShard === '/shards/audio.json' ||
      activeShard === '/shards/data-files.json' ||
      activeShard === '/shards/textbooks.json'
    );
    const shardBoardTarget = isCrossBoardHubShard ? 'all' : activeBoard;
    const hasActiveSearch = Boolean(deferredSearchQuery && deferredSearchQuery.trim());
    const canServeFromShard = Boolean(
      !showWelcome &&
      activeShard &&
      !pendingPaperParam &&
      !hasActiveSearch &&
      !selectedPath &&
      (!scopeAllBoards || isCrossBoardHubShard)
    );

    if (canServeFromShard) {
      const shardAlreadyReady =
        hydratedShardPathRef.current === activeShard &&
        (hydratedShardBoardRef.current === shardBoardTarget || hydratedShardBoardRef.current === 'all');

      if (!shardAlreadyReady && inFlightShardPathRef.current !== activeShard) {
        let cancelled = false;
        inFlightShardPathRef.current = activeShard;
        const buildQuery = encodeURIComponent(BUILD_TIMESTAMP);
        void getCatalogClient()
          .loadShard({
            shardUrl: `${activeShard}?v=${buildQuery}`,
            board: shardBoardTarget
          })
          .then((res) => {
            if (cancelled || !res) return;
            const resolvedShardBoard = res.board || shardBoardTarget;
            if (!res.isFull) {
              hydratedShardPathRef.current = activeShard;
              hydratedShardBoardRef.current = resolvedShardBoard;
            }
            if (res.counts) {
              setCatalogTotalCount((prev) => Math.max(prev, res.counts.unifiedCount || res.counts.flatCount || 0));
            }
            setLoading(false);
            setLoadError(null);
            setCatalogRevision((rev) => rev + 1);
          })
          .catch(() => {
            if (!cancelled) {
              ensureBoardIndexRef.current?.(requiredTarget, { showLoader: true });
            }
          })
          .finally(() => {
            if (inFlightShardPathRef.current === activeShard) {
              inFlightShardPathRef.current = null;
            }
          });

        // Upgrade single-board full index quietly after shard paints (cross-board shards already have 100% of items)
        const bgTimer = !isCrossBoardHubShard
          ? setTimeout(() => {
              ensureBoardIndexRef.current?.(activeBoard, { showLoader: false });
            }, 1200)
          : null;

        return () => {
          cancelled = true;
          if (bgTimer) clearTimeout(bgTimer);
        };
      }

      if (!isCrossBoardHubShard) {
        const bgTimer = setTimeout(() => {
          ensureBoardIndexRef.current?.(activeBoard, { showLoader: false });
        }, 1200);
        return () => clearTimeout(bgTimer);
      }
      return undefined;
    }

    const switchedOutOfShard = Boolean(
      hydratedShardPathRef.current &&
      activeShard !== hydratedShardPathRef.current
    );
    const needsFullNow =
      Boolean(pendingPaperParam) ||
      hasActiveSearch ||
      Boolean(selectedPath) ||
      scopeAllBoards ||
      switchedOutOfShard ||
      (!showWelcome && !activeShard);
    if (needsFullNow) {
      ensureBoardIndexRef.current?.(requiredTarget, { showLoader: !showWelcome });
      return undefined;
    }
    if (showWelcome) {
      const idleTimer = setTimeout(() => {
        ensureBoardIndexRef.current?.(requiredTarget, { showLoader: false });
      }, 1400);
      return () => clearTimeout(idleTimer);
    }
    return undefined;
  }, [
    activeBoard,
    scopeAllBoards,
    currentTab,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterDocType,
    isNotFound,
    showWelcome,
    pendingPaperParam,
    deferredSearchQuery,
    selectedPath
  ]);

  const archiveContextActions = useMemo(() => ({
    clearFilters,
    setIsNotFound,
    setActiveBoard,
    setScopeAllBoards,
    setFilterCurriculum,
    setFilterSubject,
    setFilterUnit,
    setFilterYear,
    setFilterDocType,
    setForceShowTable
  }), [clearFilters]);

  const archiveContextInfo = useMemo(() => buildArchiveContextInfo({
    currentTab,
    isNotFound,
    showWelcome,
    activeBoard,
    scopeAllBoards,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterDocType,
    meta,
    actions: archiveContextActions
  }), [currentTab, isNotFound, showWelcome, activeBoard, scopeAllBoards, filterCurriculum, filterSubject, filterUnit, filterDocType, meta, archiveContextActions]);

  const welcomeDataProp = useMemo(() => ({ meta }), [meta]);

  const handleQuickCurriculum = useCallback((currValue) => {
    setIsNotFound(false);
    if (!currValue) {
      setFilterCurriculum('');
    } else {
      const b = getBoardForCurriculum(currValue);
      if (b && !scopeAllBoards) {
        setActiveBoard(b);
        persistBoardPreference(b);
      }
      setFilterCurriculum((prev) => (prev === currValue ? '' : currValue));
      setForceShowTable(true);
    }
  }, [scopeAllBoards]);

  const handleQuickDocType = useCallback((docTypeValue) => {
    setIsNotFound(false);
    if (!docTypeValue) {
      setFilterDocType(null);
    } else {
      setFilterDocType((prev) => (prev === docTypeValue ? null : docTypeValue));
      setForceShowTable(true);
    }
  }, []);

  const handleQuickRouteFilter = useCallback((action) => {
    stopAllSiteAudio();
    setPreviewFile(null);
    setPendingPaperParam('');
    setCurrentTab('library');
    setScopeAllBoards(false);
    if (action === 'cambridge') {
      handleSwitchBoard('cambridge', { keepQuery: false });
      return;
    }
    if (action === 'ial') {
      persistBoardPreference('edexcel');
      setActiveBoard('edexcel');
      clearFilters({ pushUrl: false, targetBoard: 'edexcel' });
      setFilterCurriculum('Edexcel IAL');
      setForceShowTable(true);
      return;
    }
    if (action === 'igcse') {
      persistBoardPreference('edexcel');
      setActiveBoard('edexcel');
      clearFilters({ pushUrl: false, targetBoard: 'edexcel' });
      setFilterCurriculum('Edexcel IGCSE');
      setForceShowTable(true);
      return;
    }
    if (action === 'textbooks') {
      clearFilters({ pushUrl: false });
      setScopeAllBoards(true);
      setFilterDocType('Book');
      setForceShowTable(true);
      return;
    }
    clearFilters({ pushUrl: false });
    if (action === 'data-files') {
      setScopeAllBoards(true);
      setFilterDocType('DF');
    } else if (action === 'audio') {
      setScopeAllBoards(true);
      setFilterDocType('AUD');
    }
    setForceShowTable(true);
  }, [clearFilters, handleSwitchBoard]);

  const handleOpenTab = useCallback((tab) => {
    stopAllSiteAudio();
    setPreviewFile(null);
    setPendingPaperParam('');
    setIsNotFound(false);
    setCurrentTab(tab);
  }, []);

  const breadcrumbProps = useMemo(() => ({
    activeBoard,
    navigateToHome,
    filterCurriculum,
    onClearCurriculum: () => setFilterCurriculum(''),
    filterSubject,
    onClearSubject: () => { setFilterSubject(''); setFilterUnit(''); },
    filterUnit,
    onClearUnit: () => setFilterUnit(''),
    filterYear,
    onClearYear: () => setFilterYear(''),
    filterSession,
    onClearSession: () => setFilterSession(''),
    filterVariant,
    onClearVariant: () => setFilterVariant(''),
    filterDocType,
    onClearDocType: () => setFilterDocType(null),
    breadcrumbParts: selectedPath ? selectedPath.split(/[\\/]/).filter(Boolean) : [],
    onSelectBreadcrumbPath: (pathSlice) => {
      setSelectedPath(pathSlice);
      setForceShowTable(true);
    },
    searchQuery,
    onClearSearch: () => setSearchQuery(''),
    filesLoading,
    loadError,
    catalogTotalCount,
    totalMatchedCount,
    visibleFilesCount: visibleFiles.length,
    viewMode
  }), [
    activeBoard,
    navigateToHome,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterSession,
    filterVariant,
    filterDocType,
    selectedPath,
    searchQuery,
    filesLoading,
    loadError,
    catalogTotalCount,
    totalMatchedCount,
    visibleFiles.length,
    viewMode
  ]);

  const filterDrawerProps = useMemo(() => ({
    activeBoard,
    scopeAllBoards,
    onSelectBoardScope: handleSelectBoardScope,
    filterCurriculum,
    onSelectCurriculum: handleQuickCurriculum,
    filterDocType,
    onSelectDocType: handleQuickDocType,
    filterSubject,
    availableSubjects: availableSubjectsForFilter,
    onChangeSubject: (val) => {
      setIsNotFound(false);
      setFilterSubject(val);
      setFilterUnit('');
      if (val) setForceShowTable(true);
    },
    filterUnit,
    availableUnits: availableUnitsForFilter,
    onChangeUnit: (val) => {
      setIsNotFound(false);
      setFilterUnit(val);
      setForceShowTable(true);
    },
    filterYear,
    availableYears: availableYearsForFilter,
    onChangeYear: (val) => {
      setIsNotFound(false);
      setFilterYear(val);
      if (val) setForceShowTable(true);
    },
    filterSession,
    onChangeSession: (val) => {
      setIsNotFound(false);
      setFilterSession(val);
      if (val) setForceShowTable(true);
    },
    filterVariant,
    onChangeVariant: (val) => {
      setIsNotFound(false);
      setFilterVariant((prev) => (prev === val ? '' : val));
      if (val) setForceShowTable(true);
    },
    sortBy,
    onChangeSort: (val) => {
      setSortBy(val);
      setForceShowTable(true);
    },
    viewMode,
    onChangeViewMode: setViewMode,
    hasActiveFilters,
    onResetAll: clearFilters,
    totalMatchedCount,
    onDoneMobile: () => setShowFilters(false)
  }), [
    activeBoard,
    scopeAllBoards,
    handleSelectBoardScope,
    filterCurriculum,
    handleQuickCurriculum,
    filterDocType,
    handleQuickDocType,
    filterSubject,
    availableSubjectsForFilter,
    filterUnit,
    availableUnitsForFilter,
    filterYear,
    availableYearsForFilter,
    filterSession,
    filterVariant,
    sortBy,
    viewMode,
    hasActiveFilters,
    clearFilters,
    totalMatchedCount
  ]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-primary, #1A1D20)', backgroundColor: 'var(--bg-page, transparent)', fontFamily: 'Roboto, sans-serif' }}>
        Loading Repository Index...
      </div>
    );
  }

  if (!meta) {
    return <CrashRecoveryScreen errorMsg="Repository metadata missing or stale cache encountered." />;
  }

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header
        isMobile={isMobile}
        showWelcome={showWelcome}
        isNotFound={isNotFound}
        currentTab={currentTab}
        activeBoard={activeBoard}
        onSwitchBoard={(bId) => handleSwitchBoard(bId, { keepQuery: false })}
        navigateToHome={navigateToHome}
        activeDateText={activeDateText}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleNavTab={() => handleOpenTab(currentTab !== 'library' ? 'library' : 'about')}
        breadcrumbProps={breadcrumbProps}
      />

      {currentTab === 'library' && (
        <SearchBanner
          searchInputRef={searchInputRef}
          isMobile={isMobile}
          activeBoard={activeBoard}
          scopeAllBoards={scopeAllBoards}
          suggestedOtherBoard={suggestedOtherBoard}
          onSwitchBoardKeepingQuery={handleSwitchBoardKeepingQuery}
          searchQuery={searchQuery}
          onSearchChange={(val) => { setIsNotFound(false); setSearchQuery(val); }}
          onSearchFocus={() => ensureBoardIndexRef.current?.(scopeAllBoards ? 'all' : activeBoard)}
          onClearSearch={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
          filterCurriculum={filterCurriculum}
          onSelectCurriculum={handleQuickCurriculum}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((prev) => !prev)}
          activeDrawerFilterCount={activeDrawerFilterCount}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          filterDrawerProps={filterDrawerProps}
        />
      )}

      <div className="main-layout">
        <main id="main-content" className="content-area" tabIndex={-1}>
          {currentTab === 'about' ? (
            <Suspense fallback={<SecondaryPageSkeleton label="Loading About page" />}>
              <AboutPage onGoHome={() => handleOpenTab('library')} />
            </Suspense>
          ) : currentTab === 'changelog' ? (
            <Suspense fallback={<SecondaryPageSkeleton label="Loading Changelog page" />}>
              <ChangelogPage onGoHome={() => handleOpenTab('library')} />
            </Suspense>
          ) : isNotFound ? (
            <Suspense fallback={null}>
              <NotFoundCard
                seoMeta={seoMeta}
                onNavigateHome={navigateToHome}
                onQuickRoute={handleQuickRouteFilter}
              />
            </Suspense>
          ) : showWelcome ? (
            <Suspense fallback={<SecondaryPageSkeleton label="Loading Library Home" />}>
              <WelcomePage
                data={welcomeDataProp}
                activeBoard={activeBoard}
                recentHistory={recentHistory}
                selectedSubject={wizardSubject}
                selectedUnit={wizardUnit}
                onWizardSubjectChange={setWizardSubject}
                onWizardUnitChange={setWizardUnit}
                onOpenPaper={openOnSiteReader}
                onClearHistory={handleClearHistory}
                getOnSitePaperUrl={getOnSitePaperUrl}
                onSubjectSelect={handleSubjectSelect}
                onViewAll={handleViewAll}
                onBrowseTextbooks={handleBrowseTextbooks}
                onBrowseAudio={handleBrowseAudio}
                onBrowseThresholds={handleBrowseThresholds}
                onQuickCurriculum={handleQuickCurriculum}
                onTrySampleAudio={handleTrySampleAudio}
                onSelectFinalFilter={handleSelectFinalFilter}
              />
            </Suspense>
          ) : (
            <>
              <PaperTable
                isMobile={isMobile}
                scopeAllBoards={scopeAllBoards}
                suggestedOtherBoard={suggestedOtherBoard}
                onSwitchBoardKeepingQuery={handleSwitchBoardKeepingQuery}
                searchQuery={searchQuery}
                onSetSearchQuery={setSearchQuery}
                seoMeta={seoMeta}
                filesLoading={filesLoading}
                visibleFiles={visibleFiles}
                totalMatchedCount={totalMatchedCount}
                viewMode={viewMode}
                searchMeta={searchMeta}
                filterDocType={filterDocType}
                viewsMap={viewsMap}
                loadError={loadError}
                catalogTotalCount={catalogTotalCount}
                hasActiveFilters={hasActiveFilters}
                onRetryLoadIndex={retryLoadIndex}
                onClearFilters={clearFilters}
                onLoadMore={() => setVisibleCount((c) => c + 100)}
                onShowAll={() => setVisibleCount(totalMatchedCount)}
                getOnSitePaperUrl={getOnSitePaperUrl}
                onOpenReader={openOnSiteReader}
                breadcrumbProps={breadcrumbProps}
              />
              {archiveContextInfo && !(filesLoading && visibleFiles.length === 0) && (
                <ArchiveContextStrip archiveContextInfo={archiveContextInfo} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Lazy-Loaded In-App PDF / Audio / Solution Bank Preview Modal */}
      {previewFile && (
        <Suspense
          fallback={(
            <div className="modal-backdrop">
              <div
                className="modal-container"
                role="dialog"
                aria-modal="true"
                aria-label="Loading Study Reader"
                style={{ background: 'var(--bg-surface)', width: '96vw', height: '94vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <PdfPaneSkeleton title="Opening Study Reader..." />
              </div>
            </div>
          )}
        >
          <PreviewModal
            key={`${previewFile.isPendingSkeleton ? 'pending-' : ''}${previewFile.isNotFound ? 'missing-' : ''}${previewFile.id || previewFile.path}`}
            file={previewFile}
            initialView={previewInitialView}
            onViewModeChange={(nextMode) => setPreviewInitialView(nextMode)}
            showViews={!previewFile.isNotFound && isQuestionPaperEligibleForViews(previewFile)}
            viewsCount={!previewFile.isNotFound && isQuestionPaperEligibleForViews(previewFile) ? getPaperTotalViews(previewFile, viewsMap) : 0}
            onClose={() => {
              stopAllSiteAudio();
              setPreviewFile(null);
              setPendingPaperParam('');
              try {
                sessionStorage.removeItem(ACTIVE_MODAL_PAPER_SESSION_KEY);
              } catch {
                // Ignore sessionStorage errors
              }
            }}
            theme={theme}
            onToggleTheme={toggleTheme}
            openerRef={modalOpenerRef}
          />
        </Suspense>
      )}

      <Footer onNavigateQuickFilter={handleQuickRouteFilter} onOpenTab={handleOpenTab} />
    </div>
  );
}

export default function RootApp() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
