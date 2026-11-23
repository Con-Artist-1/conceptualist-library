import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef, lazy, Suspense } from 'react';
import './index.css';
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
  totalFiles: 19882,
  uniqueFiles: 16021,
  totalBooks: 73,
  ialBooks: 60,
  igcseBooks: 13,
  dfCount: 46,
  audioCount: 272,
  subjects: DEFAULT_ALL_SUBJECTS,
  ialSubjects: IAL_SUBJECTS_DEFAULT,
  igcseSubjects: IGCSE_SUBJECTS_DEFAULT,
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
  const [sortBy, setSortBy] = useState('newest');
  const [forceShowTable, setForceShowTable] = useState(Boolean(!initialHistoryState && initialRoute.forceShowTable));
  const [showFilters, setShowFilters] = useState(false);

  const searchInputRef = useRef(null);
  const modalOpenerRef = useRef(null);
  const isPopStateRef = useRef(false);
  const popStateReqIdRef = useRef(0);
  const isFullIndexLoadedRef = useRef(false);
  const isHydratedRef = useRef(false);
  const hydratedShardPathRef = useRef(null);
  const latestLoadedGenAtRef = useRef('');
  const dataMetaRef = useRef(meta);
  dataMetaRef.current = meta;
  const fullIndexPromiseRef = useRef(null);
  const ensureFullIndexRef = useRef(null);
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

    const isBook =
      fileObj.category === 'Books' ||
      fileObj.category === 'IAL Books' ||
      fileObj.category === 'IGCSE Books';
    if (!isBook) {
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

  // Handle browser Back/Forward & hash deep-link navigation across all routes, wizard steps, and modals
  useEffect(() => {
    const handlePopState = (event) => {
      isPopStateRef.current = true;
      const popReqId = ++popStateReqIdRef.current;
      const navState = (event && event.state) || window.history.state || null;
      const parsed = parseRouteFromLocation(window.location.pathname, window.location.search, dataMetaRef.current, window.location.hash);

      if ((navState?.wizardStep === 'unit' || navState?.wizardStep === 'year') && navState.subject && navState.curriculum) {
        setCurrentTab('library');
        setIsNotFound(false);
        setFilterCurriculum('');
        setFilterSubject('');
        setFilterUnit('');
        setFilterYear('');
        setFilterSession('');
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
            } else if (isFullIndexLoadedRef.current) {
              setPreviewFile({ isNotFound: true, path: parsed.paperParam, name: parsed.paperParam });
              setPendingPaperParam('');
            }
          })
          .catch(() => {});
      } else {
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
        } else if (isFullIndexLoadedRef.current) {
          setPreviewFile({ isNotFound: true, path: pendingPaperParam, name: pendingPaperParam });
          setPendingPaperParam('');
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
    !searchQuery &&
    !forceShowTable
  );
  const effectiveRouteCurriculum = isWizardRouteActive && wizardSubject ? wizardSubject.curriculum : filterCurriculum;
  const effectiveRouteSubject = isWizardRouteActive && wizardSubject ? wizardSubject.name : filterSubject;
  const effectiveRouteUnit = isWizardRouteActive && wizardSubject && wizardUnit ? wizardUnit : filterUnit;

  const seoMeta = useMemo(() => getSeoMetadata({
    currentTab,
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
    isNotFound,
    isWizardRouteActive,
    wizardSubject,
    wizardUnit,
    effectiveRouteCurriculum,
    effectiveRouteSubject,
    effectiveRouteUnit,
    filterUnit,
    filterYear,
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
    return buildRoutePath({
      currentTab: 'library',
      filterCurriculum: filterCurriculum || fileObj?.curriculum || '',
      filterSubject: filterSubject || fileObj?.subject || '',
      filterUnit: filterUnit || fileObj?.cleanUnitLabel || '',
      filterYear,
      filterDocType,
      searchQuery: deferredSearchQuery,
      previewFile: fileObj,
      previewMode: preferredView,
      forceShowTable
    });
  }, [filterCurriculum, filterSubject, filterUnit, filterYear, filterDocType, deferredSearchQuery, forceShowTable]);

  // Multi-stage zero-waterfall catalog hydration via Web Worker
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    const buildQuery = encodeURIComponent(BUILD_TIMESTAMP);
    const activeRoute = retryCount > 0 && typeof window !== 'undefined'
      ? parseRouteFromLocation(window.location.pathname, window.location.search, dataMetaRef.current, window.location.hash)
      : initialRoute;
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

    const candidateIndexUrls = [
      `/index.json?v=${buildQuery}`,
      '/index.json',
      'https://huggingface.co/datasets/Diavlon/mcmaster-docs-library/resolve/main/live_index.json'
    ];
    const INDEX_CACHE_URL = buildIndexCacheUrl(APP_VERSION, BUILD_TIMESTAMP);

    // Consume any in-flight early fetch kicked off in <head> before JS finished parsing
    const earlyFetch = typeof window !== 'undefined' ? window.__CS_EARLY_FETCH__ : null;
    if (typeof window !== 'undefined' && window.__CS_EARLY_FETCH__) {
      window.__CS_EARLY_FETCH__ = null;
    }

    const markWorkerHydrated = (res, { isFull, shardPath = null }) => {
      if (cancelled || !res) return;
      if (!isFull && isFullIndexLoadedRef.current) return;
      isHydratedRef.current = true;
      if (res.isFull || isFull) {
        isFullIndexLoadedRef.current = true;
        latestLoadedGenAtRef.current = res.generatedAt || latestLoadedGenAtRef.current;
        hydratedShardPathRef.current = null;
      } else if (shardPath) {
        hydratedShardPathRef.current = shardPath;
      }
      if (res.meta) {
        setMeta((prev) => (res.meta?.wizard ? res.meta : prev));
      }
      if (res.counts) {
        setCatalogTotalCount(res.counts.unifiedCount || res.counts.flatCount || 0);
      }
      setLoading(false);
      setLoadError(null);
      setCatalogRevision((rev) => rev + 1);
    };

    const loadFullIndex = async (freshMeta = latestMeta, { showLoader = false, forceReload = false } = {}) => {
      if (cancelled) return;
      if (
        !forceReload &&
        isFullIndexLoadedRef.current &&
        (!freshMeta || latestLoadedGenAtRef.current === freshMeta.generatedAt)
      ) {
        return;
      }
      if (fullIndexPromiseRef.current) return fullIndexPromiseRef.current;

      const task = (async () => {
        if (showLoader || !isHydratedRef.current) setFilesLoading(true);
        setLoadError(null);

        try {
          if (!forceReload && earlyFetch?.fullBufferPromise) {
            const p = earlyFetch.fullBufferPromise;
            earlyFetch.fullBufferPromise = null;
            const buf = await p;
            if (buf && buf.byteLength > 0 && !cancelled) {
              const res = await catalogClient.loadBuffer(buf, { isFull: true, cacheUrl: INDEX_CACHE_URL });
              markWorkerHydrated(res, { isFull: true });
              return;
            }
          }

          const res = await catalogClient.loadFullIndex({
            urls: candidateIndexUrls,
            cacheUrl: INDEX_CACHE_URL,
            expectedMeta: freshMeta,
            forceReload,
            signal: abortController.signal
          });
          markWorkerHydrated(res, { isFull: true });
        } catch (err) {
          if (!cancelled && err?.name !== 'AbortError') {
            console.error('Failed to load index from all candidate sources:', err);
            setLoading(false);
            setFilesLoading(false);
            setLoadError(err?.message || 'Connection delayed');
          }
        } finally {
          fullIndexPromiseRef.current = null;
        }
      })();

      fullIndexPromiseRef.current = task;
      return task;
    };

    ensureFullIndexRef.current = (opts) => loadFullIndex(latestMeta, opts);

    const hydrateInitialShard = async () => {
      if (!initialShardRoute) return;
      try {
        if (earlyFetch?.shardBufferPromise && earlyFetch.shardPath === initialShardRoute) {
          const p = earlyFetch.shardBufferPromise;
          earlyFetch.shardBufferPromise = null;
          const buf = await p;
          if (buf && buf.byteLength > 0 && !cancelled && !isFullIndexLoadedRef.current) {
            const res = await catalogClient.loadBuffer(buf, { isFull: false });
            markWorkerHydrated(res, { isFull: false, shardPath: initialShardRoute });
            return;
          }
        }

        const res = await catalogClient.loadShard({
          shardUrl: `${initialShardRoute}?v=${buildQuery}`,
          cacheUrl: INDEX_CACHE_URL,
          expectedMeta: latestMeta,
          signal: abortController.signal
        });
        markWorkerHydrated(res, { isFull: Boolean(res?.isFull), shardPath: initialShardRoute });
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;
        shardFailed = true;
        void loadFullIndex(latestMeta);
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
      activeRoute.filterSession ||
      activeRoute.searchQuery ||
      activeRoute.forceShowTable ||
      activeRoute.paperParam
    );

    if (initialShardRoute) {
      void hydrateInitialShard();
    } else if (initialDemand && !activeRoute.notFound && activeRoute.currentTab === 'library') {
      void loadFullIndex(latestMeta, { showLoader: true });
    }

    // Validate against /meta.json in parallel (reusing <head> early fetch promise when present)
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
        const staleFullCache = isFullIndexLoadedRef.current && latestLoadedGenAtRef.current !== (json?.meta?.generatedAt || '');
        if ((!initialShardRoute || shardFailed || staleFullCache) && (initialDemand || staleFullCache)) {
          if (staleFullCache) isFullIndexLoadedRef.current = false;
          void loadFullIndex(json?.meta || null, { forceReload: staleFullCache });
        }
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        console.warn('Meta fetch error, proceeding to cached or remote full index:', err);
        if (initialShardRoute && shardFailed) {
          void loadFullIndex(null);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      fullIndexPromiseRef.current = null;
    };
  }, [initialCache, initialRoute, retryCount]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedPath, filterCurriculum, filterDocType, filterSubject, filterUnit, filterYear, filterSession, deferredSearchQuery, sortBy, viewMode]);

  const handleSubjectSelect = useCallback((subject, curriculum = '') => {
    setCurrentTab('library');
    setIsNotFound(false);
    setWizardSubject(null);
    setWizardUnit(null);
    if (curriculum) setFilterCurriculum(curriculum);
    setFilterSubject(subject);
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setSearchQuery('');
    setForceShowTable(true);
    setSelectedPath('');
  }, []);

  const handleSelectFinalFilter = useCallback(({ subject, curriculum, unit, year }) => {
    setCurrentTab('library');
    setIsNotFound(false);
    setWizardSubject(null);
    setWizardUnit(null);
    if (curriculum) setFilterCurriculum(curriculum);
    if (subject) setFilterSubject(subject);
    setFilterUnit(unit || '');
    setFilterYear(year ? String(year) : '');
    setFilterSession('');
    setSearchQuery('');
    setForceShowTable(true);
    setSelectedPath('');
  }, []);

  const clearFilters = useCallback(({ pushUrl = true } = {}) => {
    setIsNotFound(false);
    setWizardSubject(null);
    setWizardUnit(null);
    setFilterCurriculum('');
    setFilterDocType(null);
    setFilterSubject('');
    setFilterUnit('');
    setFilterYear('');
    setFilterSession('');
    setSearchQuery('');
    setSortBy('newest');
    setForceShowTable(false);
    setSelectedPath('');
    if (pushUrl && typeof window !== 'undefined' && (window.location.pathname !== '/' || window.location.search !== '' || window.location.hash !== '')) {
      window.history.pushState({ wizardStep: 'home' }, '', '/');
    }
  }, []);

  const navigateToHome = useCallback((e) => {
    if (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      if (e.preventDefault) e.preventDefault();
    }
    setCurrentTab('library');
    setIsNotFound(false);
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
    setSearchQuery('');
    setSortBy('newest');
    setForceShowTable(false);
    setSelectedPath('');
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== '/' || window.location.search !== '' || window.location.hash !== '') {
        window.history.pushState({ wizardStep: 'home' }, '', '/');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleViewAll = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setForceShowTable(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearFilters]);

  const handleBrowseTextbooks = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setFilterDocType('Book');
    setForceShowTable(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearFilters]);

  const handleBrowseAudio = useCallback(() => {
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    setFilterDocType('AUD');
    setForceShowTable(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearFilters]);

  const handleTrySampleAudio = useCallback(() => {
    const SAMPLE_AUDIO_ID = 'IAL|French|WFR02||June 2021';
    preloadReaderChunksOnce();
    void getCatalogClient()
      .resolveSampleAudio()
      .then((sample) => {
        if (sample) {
          openOnSiteReader(sample, 'AUD');
          return;
        }
        ensureFullIndexRef.current?.({ showLoader: false });
        setPreviewInitialView('AUD');
        setPendingPaperParam(SAMPLE_AUDIO_ID);
        setPreviewFile(buildPendingPaperPlaceholder(SAMPLE_AUDIO_ID, 'AUD'));
      })
      .catch(() => {
        ensureFullIndexRef.current?.({ showLoader: false });
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
    searchQuery ||
    forceShowTable
  );
  const isRoot = selectedPath === '';
  const showWelcome = isRoot && !hasActiveFilters;

  const availableSubjectsForFilter = useMemo(() => {
    if (filterCurriculum === 'Edexcel IAL') return meta?.ialSubjects || meta?.subjects || [];
    if (filterCurriculum === 'Edexcel IGCSE') return meta?.igcseSubjects || meta?.subjects || [];
    return meta?.subjects || [];
  }, [filterCurriculum, meta]);

  const hasWizardUnits = useMemo(() => {
    if (!filterSubject || !meta?.wizard) return false;
    const currs = filterCurriculum ? [filterCurriculum] : ['Edexcel IAL', 'Edexcel IGCSE'];
    return currs.some((c) => {
      const unitsObj = meta.wizard[c]?.[filterSubject]?.units;
      return Boolean(unitsObj && Object.keys(unitsObj).length > 0);
    });
  }, [filterSubject, filterCurriculum, meta]);

  const availableUnitsForFilter = useMemo(() => {
    if (!filterSubject) return [];
    const wizard = meta?.wizard;
    if (wizard) {
      const set = new Set();
      const currs = filterCurriculum ? [filterCurriculum] : ['Edexcel IAL', 'Edexcel IGCSE'];
      currs.forEach((c) => {
        const unitsObj = wizard[c]?.[filterSubject]?.units;
        if (unitsObj) Object.keys(unitsObj).forEach((u) => set.add(u));
      });
      if (set.size > 0) return Array.from(set).sort((a, b) => compareUnitLabels(a, b, filterSubject));
    }
    return queryResult.fallbackUnits || [];
  }, [filterSubject, filterCurriculum, meta, queryResult.fallbackUnits]);

  const availableYearsForFilter = useMemo(() => {
    const wizard = meta?.wizard;
    if (filterSubject && wizard) {
      const set = new Set();
      const currs = filterCurriculum ? [filterCurriculum] : ['Edexcel IAL', 'Edexcel IGCSE'];
      currs.forEach((c) => {
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
  }, [filterSubject, filterCurriculum, filterUnit, meta]);

  // Execute off-thread filtering, smart fuzzy search, sorting, and pagination slicing inside the Web Worker
  const popularViewsDep = sortBy === 'popular' ? viewsMap : null;
  const popularViewsVerDep = sortBy === 'popular' ? viewsVersion : 0;

  useEffect(() => {
    if (catalogRevision === 0) return undefined;
    if (showWelcome || currentTab !== 'library' || isNotFound) {
      setFilesLoading(false);
      return undefined;
    }

    const reqId = ++queryReqIdRef.current;
    const baseKey = JSON.stringify([
      catalogRevision,
      selectedPath,
      viewMode,
      filterCurriculum,
      filterSubject,
      filterUnit,
      filterYear,
      filterSession,
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
          filterCurriculum,
          filterSubject,
          filterUnit,
          filterYear,
          filterSession,
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
    filterDocType,
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
      const cov = activeCurr === 'Edexcel IGCSE'
        ? meta?.igcseSubjectCoverage?.[activeSubj]
        : (activeCurr === 'Edexcel IAL'
            ? meta?.ialSubjectCoverage?.[activeSubj]
            : meta?.subjectCoverage?.[activeSubj]);
      if (cov) return `${formatSubjectDisplay(activeSubj)}: ${cov}`;
    }
    return meta?.coverage || 'January 2003 – June 2026';
  }, [filterSubject, filterCurriculum, showWelcome, wizardSubject, meta]);

  const activeDrawerFilterCount = useMemo(() => {
    let count = 0;
    if (filterDocType) count += 1;
    if (filterSubject) count += 1;
    if (filterUnit) count += 1;
    if (filterYear) count += 1;
    if (filterSession) count += 1;
    if (sortBy !== 'newest') count += 1;
    if (viewMode !== 'unified') count += 1;
    return count;
  }, [filterDocType, filterSubject, filterUnit, filterYear, filterSession, sortBy, viewMode]);

  // Upgrade from a route shard to the full catalog index whenever global search, deep links, or cross-route navigation requires it
  useEffect(() => {
    if (isFullIndexLoadedRef.current) return undefined;
    const activeShard = getShardPathForRoute({
      currentTab,
      filterCurriculum,
      filterSubject,
      filterUnit,
      filterDocType,
      notFound: currentTab === 'library' && isNotFound
    });
    const switchedOutOfShard = Boolean(
      hydratedShardPathRef.current &&
      activeShard !== hydratedShardPathRef.current
    );
    const needsFullNow =
      Boolean(pendingPaperParam) ||
      Boolean(deferredSearchQuery && deferredSearchQuery.trim()) ||
      Boolean(selectedPath) ||
      switchedOutOfShard ||
      (!showWelcome && !activeShard);
    if (needsFullNow) {
      ensureFullIndexRef.current?.({ showLoader: switchedOutOfShard && !showWelcome });
      return undefined;
    }
    if (showWelcome) {
      const idleTimer = setTimeout(() => {
        ensureFullIndexRef.current?.({ showLoader: false });
      }, 1600);
      return () => clearTimeout(idleTimer);
    }
    return undefined;
  }, [
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
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterDocType,
    meta,
    actions: archiveContextActions
  }), [currentTab, isNotFound, showWelcome, filterCurriculum, filterSubject, filterUnit, filterDocType, meta, archiveContextActions]);

  const welcomeDataProp = useMemo(() => ({ meta }), [meta]);

  const handleQuickCurriculum = useCallback((currValue) => {
    setIsNotFound(false);
    if (!currValue) {
      setFilterCurriculum('');
    } else {
      setFilterCurriculum((prev) => (prev === currValue ? '' : currValue));
      setForceShowTable(true);
    }
  }, []);

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
    setCurrentTab('library');
    clearFilters({ pushUrl: false });
    if (action === 'ial') setFilterCurriculum('Edexcel IAL');
    else if (action === 'igcse') setFilterCurriculum('Edexcel IGCSE');
    else if (action === 'textbooks') setFilterDocType('Book');
    else if (action === 'data-files') setFilterDocType('DF');
    else if (action === 'audio') setFilterDocType('AUD');
    setForceShowTable(true);
  }, [clearFilters]);

  const handleOpenTab = useCallback((tab) => {
    setIsNotFound(false);
    setCurrentTab(tab);
  }, []);

  const breadcrumbProps = useMemo(() => ({
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
    navigateToHome,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterSession,
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
          searchQuery={searchQuery}
          onSearchChange={(val) => { setIsNotFound(false); setSearchQuery(val); }}
          onSearchFocus={() => ensureFullIndexRef.current?.()}
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
                onTrySampleAudio={handleTrySampleAudio}
                onSelectFinalFilter={handleSelectFinalFilter}
              />
            </Suspense>
          ) : (
            <>
              <PaperTable
                isMobile={isMobile}
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
