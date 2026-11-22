import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef, lazy, Suspense } from 'react';
import './index.css';
import {
  buildRoutePath,
  parseRouteFromLocation,
  getSeoMetadata,
  getShardPathForRoute,
  getLegacyEquivalentsForState,
  inferCurriculumForSubject,
  getCurriculumSlug,
  getSubjectSlug,
  getUnitSlug,
  DEFAULT_UNIT_LABELS,
  IAL_SUBJECTS_DEFAULT,
  IGCSE_SUBJECTS_DEFAULT
} from './lib/routeCore.js';
import { compareUnitLabels } from './lib/unitSort.js';
import {
  APP_VERSION,
  BUILD_TIMESTAMP,
  META_CACHE_KEY,
  DAILY_CACHE_TTL_MS,
  softReloadKeepingUrl
} from './lib/appMeta.js';
import { resilientFetch, buildIndexCacheUrl } from './lib/networkUtils.js';
import {
  useIsMobile,
  SUBJECTS_WITH_BOOKS,
  IAL_AUDIO_SUBJECTS,
  IGCSE_AUDIO_SUBJECTS,
  hasDataFilesForCourse,
  formatSubjectDisplay,
  getUnifiedSittingTitle,
  HISTORY_STORAGE_KEY,
  ACTIVE_MODAL_PAPER_SESSION_KEY,
  MAX_HISTORY_ITEMS,
  readLocalViewsCache,
  isLocalViewsCacheStale,
  writeLocalViewsCache,
  updateSinglePaperInLocalViewsCache,
  getOrCreateViewerId,
  isBrowserReloadNavigation,
  canCountPaperViewNow,
  getPaperViewKey,
  isQuestionPaperEligibleForViews,
  getPaperTotalViews,
  buildPendingPaperPlaceholder,
  serializePaperForHistory,
  getInitialRecentHistory
} from './lib/libraryHelpers.js';
import { getCatalogClient } from './lib/catalogClient.js';
import { preloadReaderChunksOnce } from './lib/pdfPrewarm.js';
import { useTheme } from './hooks/useTheme.js';
import { AppErrorBoundary, CrashRecoveryScreen } from './components/CrashRecoveryScreen.jsx';
import { Header } from './components/Header.jsx';
import { SearchBanner } from './components/SearchBanner.jsx';
import { PaperTable } from './components/PaperTable.jsx';
import { ArchiveContextStrip } from './components/ArchiveContextStrip.jsx';
import { Footer } from './components/Footer.jsx';
import { PdfPaneSkeleton } from './components/Skeletons.jsx';
import WelcomePage from './components/WelcomePage.jsx';

const PreviewModal = lazy(() => import('./components/PreviewModal.jsx'));
const AboutPage = lazy(() => import('./components/AboutPage.jsx'));
const ChangelogPage = lazy(() => import('./components/ChangelogPage.jsx'));
const NotFoundCard = lazy(() => import('./components/NotFoundCard.jsx'));

const PAGE_SIZE = 50;
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
  const [viewsMap, setViewsMap] = useState(() => readLocalViewsCache() || {});
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
  const deferredSearchQuery = useDeferredValue(searchQuery);
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
  const isPopStateRef = useRef(false);
  const isFullIndexLoadedRef = useRef(false);
  const isHydratedRef = useRef(false);
  const hydratedShardPathRef = useRef(null);
  const latestLoadedGenAtRef = useRef('');
  const dataMetaRef = useRef(meta);
  dataMetaRef.current = meta;
  const previewFileRef = useRef(previewFile);
  previewFileRef.current = previewFile;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const pendingAutoReloadRef = useRef(false);
  const fullIndexPromiseRef = useRef(null);
  const ensureFullIndexRef = useRef(null);
  const viewsInflightRef = useRef(null);
  const didInitialSeoSyncRef = useRef(false);
  const queryReqIdRef = useRef(0);
  const lastQueryBaseKeyRef = useRef('');
  const lastVisibleCountRef = useRef(PAGE_SIZE);

  const refreshViewsFromApi = useCallback(() => {
    if (viewsInflightRef.current) {
      return viewsInflightRef.current;
    }
    const req = fetch('/api/views', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload || !payload.ok) return null;
        const mapObj = payload.views && typeof payload.views === 'object' ? payload.views : payload.counts;
        if (!mapObj || typeof mapObj !== 'object') return null;
        const saved = writeLocalViewsCache(mapObj);
        setViewsMap(saved);
        return saved;
      })
      .catch(() => null)
      .finally(() => {
        viewsInflightRef.current = null;
      });
    viewsInflightRef.current = req;
    return req;
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem('cs_paper_views_v1');
      localStorage.removeItem('cs_paper_views_db_v2');
    } catch {
      // Ignore storage errors
    }

    if (readLocalViewsCache() === null || isLocalViewsCacheStale()) {
      void refreshViewsFromApi();
    }
  }, [refreshViewsFromApi]);

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
    if (!fileObj || fileObj.isPendingSkeleton) return;
    const vKey = getPaperViewKey(fileObj);
    if (vKey) {
      try {
        sessionStorage.setItem(ACTIVE_MODAL_PAPER_SESSION_KEY, vKey);
      } catch {
        // Ignore sessionStorage errors
      }
    }

    if (vKey && isQuestionPaperEligibleForViews(fileObj)) {
      const allowedToCount = canCountPaperViewNow(vKey, options);
      if (allowedToCount) {
        const viewerId = getOrCreateViewerId();
        fetch('/api/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paperKey: vKey, viewerId }),
          keepalive: true
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((payload) => {
            if (payload && payload.ok && typeof payload.views === 'number') {
              const latestCount = Math.floor(payload.views);
              setViewsMap((prev) => ({
                ...prev,
                [vKey]: Math.max(Number(prev[vKey]) || 0, latestCount)
              }));
              updateSinglePaperInLocalViewsCache(vKey, latestCount);
              if (payload.incremented) {
                void refreshViewsFromApi();
              }
            }
          })
          .catch(() => {
            // Do not fake increment if database request fails
          });
      }
    }

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
  }, [refreshViewsFromApi]);

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
    setPendingPaperParam('');
    setPreviewInitialView(preferredView);
    setPreviewFile(fileObj);
    recordPaperInteraction(fileObj, preferredView);
  }, [recordPaperInteraction]);

  // Handle browser Back/Forward & hash deep-link navigation across all routes, wizard steps, and modals
  useEffect(() => {
    const handlePopState = (event) => {
      isPopStateRef.current = true;
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
            if (found) {
              setPreviewFile(found);
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
    if (!pendingPaperParam || catalogRevision === 0) return;
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
    paperParam: previewFile ? (previewFile.id || previewFile.path) : pendingPaperParam,
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

  // Synchronize route state to browser URL and dynamic SEO <head> + lazy Schema.org JSON-LD
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const pathSegments = (window.location.pathname || '/').split('/').filter(Boolean);
    const waitingForUnitHydration = pathSegments.length >= 3 && pathSegments[0] !== 'textbooks' && !filterUnit && !wizardUnit && !meta?.wizard;
    const activeNotFound = currentTab === 'library' && isNotFound;

    if (!waitingForUnitHydration && !activeNotFound) {
      const nextUrl = buildRoutePath({
        currentTab,
        filterCurriculum: effectiveRouteCurriculum,
        filterSubject: effectiveRouteSubject,
        filterUnit: effectiveRouteUnit,
        filterYear,
        filterDocType,
        searchQuery: deferredSearchQuery,
        previewFile,
        pendingPaperParam,
        previewMode: previewInitialView,
        forceShowTable,
        useHashForPaper: true
      });
      const nextHistoryState = (isWizardRouteActive && wizardSubject)
        ? {
            wizardStep: wizardUnit ? 'year' : 'unit',
            curriculum: wizardSubject.curriculum,
            subject: wizardSubject.name,
            unit: wizardUnit || null
          }
        : { wizardStep: isWizardRouteActive ? 'home' : 'table' };
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const prevState = window.history.state;
      const prevWizardStep = prevState?.wizardStep || null;
      const stateChanged =
        prevWizardStep !== nextHistoryState.wizardStep ||
        (prevState?.subject || '') !== (nextHistoryState.subject || '') ||
        (prevState?.curriculum || '') !== (nextHistoryState.curriculum || '') ||
        (prevState?.unit || '') !== (nextHistoryState.unit || '');

      if (currentUrl !== nextUrl || stateChanged) {
        const isLegacyPaperMigration = window.location.search.includes('paper=') && nextUrl.includes('#paper=');
        const isInitialColdStateTag = currentUrl === nextUrl && prevState === null;
        if (isPopStateRef.current) {
          isPopStateRef.current = false;
        } else if (deferredSearchQuery || isLegacyPaperMigration || isInitialColdStateTag) {
          window.history.replaceState(nextHistoryState, '', nextUrl);
        } else {
          window.history.pushState(nextHistoryState, '', nextUrl);
        }
      } else {
        isPopStateRef.current = false;
      }
    }

    const pageTitle = previewFile
      ? `${getUnifiedSittingTitle(previewFile)} — Past Paper & Mark Scheme | Conceptualist Systems`
      : seoMeta.title;
    document.title = pageTitle;

    const setMetaTag = (selector, attrName, attrVal, contentVal) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', contentVal);
    };

    const robotsVal = seoMeta.robots || 'index, follow';
    setMetaTag('meta[name="description"]', 'name', 'description', seoMeta.description);
    setMetaTag('meta[name="keywords"]', 'name', 'keywords', seoMeta.keywords);
    setMetaTag('meta[name="robots"]', 'name', 'robots', robotsVal);
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', pageTitle);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', seoMeta.description);
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', seoMeta.canonicalUrl);
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'website');

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (robotsVal.includes('noindex')) {
      if (canonicalEl) canonicalEl.remove();
    } else {
      if (!canonicalEl) {
        canonicalEl = document.createElement('link');
        canonicalEl.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalEl);
      }
      canonicalEl.setAttribute('href', seoMeta.canonicalUrl);
    }

    // On initial cold mount, prerender-seo.js has already embedded the exact JSON-LD in <head>.
    // Only lazily import seoRoutes.js (with bookCatalog ISBNs & FAQs) on SPA navigations or if absent.
    const existingLd = document.getElementById('seo-json-ld');
    const isColdWithPrerenderedLd = !didInitialSeoSyncRef.current && Boolean(existingLd?.textContent) && !previewFile && !deferredSearchQuery;
    didInitialSeoSyncRef.current = true;
    if (isColdWithPrerenderedLd) return undefined;

    let cancelled = false;
    void import('./seoRoutes.js')
      .then(({ buildJsonLd }) => {
        if (cancelled) return;
        let ldScript = document.getElementById('seo-json-ld');
        if (!ldScript) {
          ldScript = document.createElement('script');
          ldScript.id = 'seo-json-ld';
          ldScript.type = 'application/ld+json';
          document.head.appendChild(ldScript);
        }
        const jsonLdObj = buildJsonLd({
          currentTab,
          filterCurriculum: effectiveRouteCurriculum,
          filterSubject: effectiveRouteSubject,
          filterUnit: effectiveRouteUnit,
          filterDocType,
          forceShowTable,
          seo: seoMeta,
          meta
        });
        ldScript.textContent = JSON.stringify(jsonLdObj);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    currentTab,
    isNotFound,
    isWizardRouteActive,
    wizardSubject,
    wizardUnit,
    effectiveRouteCurriculum,
    effectiveRouteSubject,
    effectiveRouteUnit,
    filterCurriculum,
    filterSubject,
    filterUnit,
    filterYear,
    filterDocType,
    deferredSearchQuery,
    previewFile,
    pendingPaperParam,
    previewInitialView,
    forceShowTable,
    seoMeta,
    meta
  ]);

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

  // Global keyboard shortcut: '/' or Ctrl+K / Cmd+K focuses search input
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Multi-stage zero-waterfall catalog hydration via Web Worker
  useEffect(() => {
    let cancelled = false;
    const buildQuery = encodeURIComponent(BUILD_TIMESTAMP);
    const initialShardRoute = getShardPathForRoute(initialRoute);
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
          // If <head> already downloaded /index.json as ArrayBuffer (e.g., on /papers), transfer zero-copy to Worker
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
            forceReload
          });
          markWorkerHydrated(res, { isFull: true });
        } catch (err) {
          if (!cancelled) {
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
          expectedMeta: latestMeta
        });
        markWorkerHydrated(res, { isFull: Boolean(res?.isFull), shardPath: initialShardRoute });
      } catch {
        shardFailed = true;
        if (!cancelled) {
          void loadFullIndex(latestMeta);
        }
      }
    };

    const initialDemand = Boolean(
      (initialRoute.currentTab && initialRoute.currentTab !== 'library') ||
      initialRoute.notFound ||
      initialRoute.filterCurriculum ||
      initialRoute.filterDocType ||
      initialRoute.filterSubject ||
      initialRoute.filterUnit ||
      initialRoute.filterYear ||
      initialRoute.filterSession ||
      initialRoute.searchQuery ||
      initialRoute.forceShowTable ||
      initialRoute.paperParam
    );

    if (initialShardRoute) {
      void hydrateInitialShard();
    } else if (initialDemand && !initialRoute.notFound && initialRoute.currentTab === 'library') {
      // Kick off full index load immediately in parallel with /meta.json on /papers, /ial, /igcse!
      void loadFullIndex(latestMeta, { showLoader: true });
    }

    // Validate against fresh /meta.json in parallel (reusing <head> early fetch promise when present)
    const metaPromise = earlyFetch?.metaPromise
      ? earlyFetch.metaPromise.then((json) => json || resilientFetch([`/meta.json?v=${buildQuery}`, '/meta.json'], { cache: 'no-cache' }, 25000).then((r) => r.json()))
      : resilientFetch([`/meta.json?v=${buildQuery}`, '/meta.json'], { cache: 'no-cache' }, 25000).then((r) => r.json());

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
        console.warn('Meta fetch error, proceeding to cached or remote full index:', err);
        if (initialShardRoute && shardFailed) {
          void loadFullIndex(null);
        }
      });

    return () => {
      cancelled = true;
      fullIndexPromiseRef.current = null;
    };
  }, [initialCache, initialRoute, retryCount]);

  // Automatic 24-hour full reload + live new-catalog detection (defers safely while reading or searching)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const pageBootAt = Date.now();
    let lastProbeAt = pageBootAt;
    const PROBE_INTERVAL_MS = 10 * 60 * 1000;

    const triggerOrDeferReload = () => {
      if (previewFileRef.current || (searchQueryRef.current && searchQueryRef.current.trim())) {
        pendingAutoReloadRef.current = true;
        return;
      }
      softReloadKeepingUrl();
    };

    const checkFreshness = async () => {
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const now = Date.now();
      if (now - pageBootAt >= DAILY_CACHE_TTL_MS) {
        triggerOrDeferReload();
        return;
      }

      if (now - lastProbeAt < PROBE_INTERVAL_MS) return;
      lastProbeAt = now;
      try {
        const res = await fetch(`/meta.json?t=${now}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const remoteMeta = json?.meta;
        if (!remoteMeta) return;
        const loadedGenAt = latestLoadedGenAtRef.current || dataMetaRef.current?.generatedAt || '';
        const loadedUnique = dataMetaRef.current?.uniqueFiles || 0;
        const hasNewCatalog = Boolean(
          (loadedGenAt && remoteMeta.generatedAt && remoteMeta.generatedAt !== loadedGenAt) ||
          (loadedUnique && remoteMeta.uniqueFiles && remoteMeta.uniqueFiles !== loadedUnique)
        );
        if (hasNewCatalog) {
          triggerOrDeferReload();
        }
      } catch {
        // Ignore transient offline errors
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkFreshness();
    };
    const handleFocus = () => {
      void checkFreshness();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    const intervalId = window.setInterval(() => {
      void checkFreshness();
    }, 30 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!previewFile && pendingAutoReloadRef.current && !(searchQuery && searchQuery.trim())) {
      pendingAutoReloadRef.current = false;
      softReloadKeepingUrl();
    }
  }, [previewFile, searchQuery]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedPath, filterCurriculum, filterDocType, filterSubject, filterUnit, filterYear, filterSession, searchQuery, sortBy, viewMode]);

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

  // Dynamic subject list based on selected curriculum
  const availableSubjectsForFilter = useMemo(() => {
    if (filterCurriculum === 'Edexcel IAL') return meta?.ialSubjects || meta?.subjects || [];
    if (filterCurriculum === 'Edexcel IGCSE') return meta?.igcseSubjects || meta?.subjects || [];
    return meta?.subjects || [];
  }, [filterCurriculum, meta]);

  // Dynamic unit list for filter bar when a subject is selected
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

  // Dynamic year list for filter bar
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
      searchQuery,
      sortBy,
      popularViewsDep ? Object.keys(popularViewsDep).length : 0
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
          searchQuery,
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
    searchQuery,
    sortBy,
    popularViewsDep,
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
    filterDocType,
    isNotFound,
    showWelcome,
    pendingPaperParam,
    deferredSearchQuery,
    selectedPath
  ]);

  const archiveContextInfo = useMemo(() => {
    if (currentTab !== 'library' || isNotFound || showWelcome) return null;
    const effCurr = filterCurriculum || inferCurriculumForSubject(filterSubject, '');
    const legacyInfo = getLegacyEquivalentsForState({
      filterCurriculum: effCurr,
      filterSubject,
      filterUnit
    });
    const currSlug = effCurr ? getCurriculumSlug(effCurr) : '';
    const subjSlug = filterSubject ? getSubjectSlug(filterSubject) : '';
    const subjDisplay = filterSubject ? formatSubjectDisplay(filterSubject) : '';

    const links = [];
    const seenHrefs = new Set();
    const pushLink = (item) => {
      if (!item?.href || seenHrefs.has(item.href)) return;
      seenHrefs.add(item.href);
      links.push(item);
    };

    if (filterSubject && currSlug && subjSlug) {
      if (filterUnit) {
        pushLink({
          href: `/${currSlug}/${subjSlug}`,
          label: `All ${subjDisplay} Units & Papers`,
          onClick: () => { setIsNotFound(false); setFilterUnit(''); setForceShowTable(true); }
        });
      }
      const hasBooks = Boolean(SUBJECTS_WITH_BOOKS[effCurr]?.has(filterSubject));
      if (hasBooks && filterDocType !== 'Book') {
        const isMath = effCurr === 'Edexcel IAL' && filterSubject === 'Math';
        pushLink({
          href: `/textbooks/${currSlug}/${subjSlug}`,
          label: `${subjDisplay} Textbooks${isMath ? ' & Solution Banks' : ''}`,
          onClick: () => {
            setIsNotFound(false);
            setFilterCurriculum(effCurr);
            setFilterDocType('Book');
            setFilterUnit('');
            setFilterYear('');
            setForceShowTable(true);
          }
        });
      } else if (filterDocType === 'Book') {
        pushLink({
          href: `/${currSlug}/${subjSlug}`,
          label: `${subjDisplay} Past Papers & Mark Schemes`,
          onClick: () => {
            setIsNotFound(false);
            setFilterDocType(null);
            setForceShowTable(true);
          }
        });
      }
      if (hasDataFilesForCourse(effCurr, filterSubject) && filterDocType !== 'DF') {
        pushLink({
          href: '/data-files',
          label: 'IT & CS Data Files (.zip)',
          onClick: () => {
            clearFilters({ pushUrl: false });
            setFilterDocType('DF');
            setForceShowTable(true);
          }
        });
      }
      if (
        filterDocType !== 'AUD' &&
        ((effCurr === 'Edexcel IAL' && IAL_AUDIO_SUBJECTS.has(filterSubject)) ||
          (effCurr === 'Edexcel IGCSE' && IGCSE_AUDIO_SUBJECTS.has(filterSubject)))
      ) {
        pushLink({
          href: '/audio',
          label: `${effCurr === 'Edexcel IGCSE' ? 'IGCSE' : 'IAL'} Listening Audio (MP3)`,
          onClick: () => {
            clearFilters({ pushUrl: false });
            setFilterDocType('AUD');
            setForceShowTable(true);
          }
        });
      }

      if (filterDocType !== 'Book') {
        const unitsObj = meta?.wizard?.[effCurr]?.[filterSubject]?.units;
        const unitList = (unitsObj
          ? Object.keys(unitsObj)
          : (DEFAULT_UNIT_LABELS[effCurr]?.[filterSubject] || [])
        ).slice().sort((a, b) => compareUnitLabels(a, b, filterSubject));
        for (const uLabel of unitList) {
          if (uLabel === filterUnit) continue;
          const uSlug = getUnitSlug(uLabel);
          if (!uSlug) continue;
          pushLink({
            href: `/${currSlug}/${subjSlug}/${uSlug}`,
            label: uLabel,
            onClick: () => {
              setIsNotFound(false);
              setFilterCurriculum(effCurr);
              setFilterSubject(filterSubject);
              setFilterUnit(uLabel);
              setFilterDocType(null);
              setForceShowTable(true);
            }
          });
        }
      }
    } else if (filterDocType === 'Book') {
      if (filterCurriculum !== 'Edexcel IAL') {
        pushLink({
          href: '/textbooks/ial',
          label: 'Edexcel IAL Textbooks & Solution Banks',
          onClick: () => { setIsNotFound(false); setFilterCurriculum('Edexcel IAL'); setFilterDocType('Book'); setForceShowTable(true); }
        });
      }
      if (filterCurriculum !== 'Edexcel IGCSE') {
        pushLink({
          href: '/textbooks/igcse',
          label: 'Edexcel IGCSE (9-1) Textbooks',
          onClick: () => { setIsNotFound(false); setFilterCurriculum('Edexcel IGCSE'); setFilterDocType('Book'); setForceShowTable(true); }
        });
      }
      const bookCurrs = filterCurriculum ? [filterCurriculum] : ['Edexcel IAL', 'Edexcel IGCSE'];
      for (const bCurr of bookCurrs) {
        const bCurrSlug = getCurriculumSlug(bCurr);
        const bSubjects = Array.from(SUBJECTS_WITH_BOOKS[bCurr] || []).sort();
        for (const bSubj of bSubjects) {
          pushLink({
            href: `/textbooks/${bCurrSlug}/${getSubjectSlug(bSubj)}`,
            label: `${bCurr === 'Edexcel IGCSE' ? 'IGCSE' : 'IAL'} ${formatSubjectDisplay(bSubj)} Books`,
            onClick: () => {
              setIsNotFound(false);
              setFilterCurriculum(bCurr);
              setFilterSubject(bSubj);
              setFilterUnit('');
              setFilterYear('');
              setFilterDocType('Book');
              setForceShowTable(true);
            }
          });
        }
      }
    } else if (filterDocType === 'DF') {
      pushLink({
        href: '/ial/information-technology',
        label: 'IAL Information Technology',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('Information Technology'); setForceShowTable(true); }
      });
      pushLink({
        href: '/igcse/computer-science',
        label: 'IGCSE Computer Science',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IGCSE'); setFilterSubject('Computer Science'); setForceShowTable(true); }
      });
      pushLink({
        href: '/igcse/information-technology',
        label: 'IGCSE Information Technology',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IGCSE'); setFilterSubject('Information Technology'); setForceShowTable(true); }
      });
    } else if (filterDocType === 'AUD') {
      pushLink({
        href: '/ial/french',
        label: 'IAL French Papers',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('French'); setForceShowTable(true); }
      });
      pushLink({
        href: '/ial/german',
        label: 'IAL German Papers',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('German'); setForceShowTable(true); }
      });
      pushLink({
        href: '/ial/spanish',
        label: 'IAL Spanish Papers',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IAL'); setFilterSubject('Spanish'); setForceShowTable(true); }
      });
      pushLink({
        href: '/igcse/english-as-a-second-language',
        label: 'IGCSE ESL Papers',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IGCSE'); setFilterSubject('English as a Second Language'); setForceShowTable(true); }
      });
      pushLink({
        href: '/igcse/french',
        label: 'IGCSE French Papers',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterCurriculum('Edexcel IGCSE'); setFilterSubject('French'); setForceShowTable(true); }
      });
    } else if (filterCurriculum) {
      pushLink({
        href: filterCurriculum === 'Edexcel IAL' ? '/textbooks/ial' : '/textbooks/igcse',
        label: `${filterCurriculum} Textbooks`,
        onClick: () => { setIsNotFound(false); setFilterDocType('Book'); setForceShowTable(true); }
      });
      pushLink({
        href: '/data-files',
        label: 'IT & CS Data Files',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterDocType('DF'); setForceShowTable(true); }
      });
      pushLink({
        href: '/audio',
        label: 'Listening Audio Archive',
        onClick: () => { clearFilters({ pushUrl: false }); setFilterDocType('AUD'); setForceShowTable(true); }
      });
      const subjPool = filterCurriculum === 'Edexcel IGCSE'
        ? (meta?.igcseSubjects || IGCSE_SUBJECTS_DEFAULT)
        : (meta?.ialSubjects || IAL_SUBJECTS_DEFAULT);
      for (const sName of subjPool) {
        pushLink({
          href: `/${currSlug}/${getSubjectSlug(sName)}`,
          label: formatSubjectDisplay(sName),
          onClick: () => {
            setIsNotFound(false);
            setFilterCurriculum(filterCurriculum);
            setFilterSubject(sName);
            setFilterUnit('');
            setFilterDocType(null);
            setForceShowTable(true);
          }
        });
      }
    }

    let note = 'Every sitting pairs Question Papers (QP), Mark Schemes (MS), and Examiner Reports (ER) for instant on-site Split View inspection.';
    if (filterDocType === 'Book') {
      note = `Archived Edexcel student books${filterCurriculum === 'Edexcel IAL' || filterSubject === 'Math' ? ' and worked Solution Banks' : ''} with range-streamed WebPDF viewing.`;
    } else if (filterDocType === 'DF') {
      note = 'Practical examination source archives (.zip) for IT and Computer Science coding, spreadsheet, database, and web tasks.';
    } else if (filterDocType === 'AUD') {
      note = 'Edexcel IAL & IGCSE listening examination audio tracks (MP3/ZIP) with synchronized transcripts and in-app playback alongside question papers.';
    }

    if (!legacyInfo && links.length === 0 && !filterCurriculum && !filterSubject) return null;

    const heading = filterUnit
      ? `${effCurr} ${subjDisplay} — ${filterUnit}`
      : filterSubject
        ? `${effCurr} ${subjDisplay} Specification & Resources`
        : filterDocType === 'Book'
          ? 'Edexcel Student Textbooks & Worked Solution Banks'
          : filterDocType === 'DF'
            ? 'Practical Examination Source Files (.zip)'
            : filterDocType === 'AUD'
              ? 'IAL & IGCSE Listening Audio Tracks (.mp3)'
              : `${filterCurriculum || 'Edexcel Archive'} Resource Guide`;

    return { heading, legacyInfo, note, links };
  }, [currentTab, isNotFound, showWelcome, filterCurriculum, filterSubject, filterUnit, filterDocType, clearFilters, meta]);

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
        <main className="content-area">
          {currentTab === 'about' ? (
            <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading About...</div>}>
              <AboutPage onGoHome={() => handleOpenTab('library')} />
            </Suspense>
          ) : currentTab === 'changelog' ? (
            <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading Changelog...</div>}>
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
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Loading Study Reader">
              <div className="modal-container" style={{ background: 'var(--bg-surface)', width: '96vw', height: '94vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PdfPaneSkeleton title="Opening Study Reader..." />
              </div>
            </div>
          )}
        >
          <PreviewModal
            key={`${previewFile.isPendingSkeleton ? 'pending-' : ''}${previewFile.id || previewFile.path}`}
            file={previewFile}
            initialView={previewInitialView}
            onViewModeChange={(nextMode) => setPreviewInitialView(nextMode)}
            showViews={isQuestionPaperEligibleForViews(previewFile)}
            viewsCount={isQuestionPaperEligibleForViews(previewFile) ? getPaperTotalViews(previewFile, viewsMap) : 0}
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
