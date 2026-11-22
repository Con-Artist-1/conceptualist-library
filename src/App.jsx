import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useDeferredValue, useRef, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
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
import { compareUnitLabels } from './unitParser.js';
import { initTelemetryTracker } from './telemetry.js';
import {
  APP_VERSION,
  BUILD_TIMESTAMP,
  META_CACHE_KEY,
  DAILY_CACHE_TTL_MS,
  formatUpdateTimestamp,
  forcePurgeCacheAndReload,
  softReloadKeepingUrl
} from './lib/appMeta.js';
import {
  shouldHandleClientNavigation,
  useIsMobile,
  DOC_TYPE_INFO,
  SUBJECTS_WITH_BOOKS,
  IAL_AUDIO_SUBJECTS,
  IGCSE_AUDIO_SUBJECTS,
  hasDataFilesForCourse,
  getScDocumentLabel,
  getDocTypeBadge,
  formatBytes,
  formatSubjectDisplay,
  getShortUnitDisplay,
  getDisplayTitle,
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
import { preloadReaderChunksOnce, prewarmPaperOnPointerDown } from './lib/pdfPrewarm.js';
import { PaperViewsCounter } from './components/PaperViewsCounter.jsx';
import { PdfPaneSkeleton, TableSkeletonLoader } from './components/Skeletons.jsx';
import WelcomePage from './components/WelcomePage.jsx';

const PreviewModal = lazy(() => import('./components/PreviewModal.jsx'));
const AboutPage = lazy(() => import('./components/AboutPage.jsx'));
const ChangelogPage = lazy(() => import('./components/ChangelogPage.jsx'));

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

async function resilientFetch(urls, options = {}, timeoutMs = 45000) {
  let lastErr = null;
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      console.warn(`Fetch candidate failed (${url}):`, err.message);
    }
  }
  throw lastErr || new Error('All fetch candidates failed');
}

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

// ─── Institutional Crash / Stale Cache Recovery Screen ───────────
const CrashRecoveryScreen = ({ errorMsg }) => {
  useEffect(() => {
    const isChunkError = /dynamically imported module|Loading chunk|Failed to fetch|preload/i.test(errorMsg || '');
    if (!isChunkError) return;
    try {
      if (!sessionStorage.getItem('cs_auto_healed')) {
        sessionStorage.setItem('cs_auto_healed', '1');
        forcePurgeCacheAndReload();
      }
    } catch {
      // Ignore storage access errors
    }
  }, [errorMsg]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-page, #F2F1ED)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Roboto, Inter, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface, #FFFFFF)',
        border: '1px solid var(--border-medium, #C8C4BC)',
        borderTop: '4px solid var(--mcmaster-maroon, #6F1D2B)',
        borderRadius: '3px',
        maxWidth: '540px',
        width: '100%',
        padding: '32px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          color: 'var(--text-link, #6F1D2B)',
          marginBottom: '6px'
        }}>
          Conceptualist Systems — Repository Recovery
        </div>
        <h1 style={{
          fontSize: '20px',
          fontWeight: 800,
          color: 'var(--text-primary, #1A1D20)',
          marginBottom: '10px'
        }}>
          Outdated Browser Cache Detected
        </h1>
        <p style={{
          fontSize: '14px',
          color: 'var(--text-secondary, #2E343B)',
          lineHeight: 1.55,
          marginBottom: '20px'
        }}>
          Your browser attempted to load an older cached version of the repository index after a recent site update. Click the button below to purge stale cache data and load the latest catalog.
        </p>
        {errorMsg && (
          <div style={{
            fontSize: '11.5px',
            fontFamily: 'Roboto Mono, monospace',
            backgroundColor: 'var(--bg-subtle, #F2F1ED)',
            border: '1px solid var(--border-light, #E2DFD9)',
            padding: '8px 12px',
            color: 'var(--text-muted, #525860)',
            marginBottom: '20px',
            wordBreak: 'break-word'
          }}>
            Diagnostic: {errorMsg}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={forcePurgeCacheAndReload}
            style={{
              backgroundColor: '#6F1D2B',
              color: '#FFFFFF',
              border: '1px solid #6F1D2B',
              borderRadius: '2px',
              padding: '10px 20px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Clear Cache &amp; Force Reload
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#1A1D20',
              border: '1px solid #C8C4BC',
              borderRadius: '2px',
              padding: '10px 16px',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Standard Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || 'Unexpected runtime error' };
  }
  render() {
    if (this.state.hasError) {
      return <CrashRecoveryScreen errorMsg={this.state.errorMsg} />;
    }
    return this.props.children;
  }
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

  // Theme Management (Default: follows device prefers-color-scheme until explicitly cached; Supports 'light' | 'dark' | 'oled')
  const readSavedTheme = () => {
    try {
      const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )cs_theme=([^;]*)/) : null;
      const cookieTheme = match ? decodeURIComponent(match[1]) : null;
      if (cookieTheme === 'dark' || cookieTheme === 'light' || cookieTheme === 'oled') return cookieTheme;
      const localTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('cs_theme') : null;
      if (localTheme === 'dark' || localTheme === 'light' || localTheme === 'oled') return localTheme;
    } catch {
      // Ignore storage errors
    }
    return null;
  };

  const getSystemTheme = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch {
      // Ignore matchMedia errors
    }
    return 'light';
  };

  const [theme, setTheme] = useState(() => readSavedTheme() || getSystemTheme());
  const hasExplicitThemeRef = useRef(Boolean(readSavedTheme()));

  const themeSwitchRafRef = useRef(null);
  const activeThemeTransitionRef = useRef(null);
  const didMountThemeRef = useRef(false);

  const isPreviewOpen = Boolean(previewFile);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('modal-open', isPreviewOpen);
    return () => root.classList.remove('modal-open');
  }, [isPreviewOpen]);

  useLayoutEffect(() => {
    try {
      const root = document.documentElement;
      const isThemeChange = didMountThemeRef.current;
      didMountThemeRef.current = true;
      const isViewTransitionActive = root.classList.contains('theme-vt');

      if (isThemeChange && !isViewTransitionActive) {
        root.classList.add('theme-switching');
      }
      if (root.getAttribute('data-theme') !== theme) {
        root.setAttribute('data-theme', theme);
      }
      const metaTheme = document.getElementById('meta-theme-color');
      const metaColor = theme === 'oled' ? '#000000' : (theme === 'dark' ? '#121417' : '#6F1D2B');
      if (metaTheme && metaTheme.getAttribute('content') !== metaColor) {
        metaTheme.setAttribute('content', metaColor);
      }

      if (isThemeChange && !isViewTransitionActive) {
        if (themeSwitchRafRef.current) {
          cancelAnimationFrame(themeSwitchRafRef.current);
        }
        themeSwitchRafRef.current = requestAnimationFrame(() => {
          themeSwitchRafRef.current = requestAnimationFrame(() => {
            root.classList.remove('theme-switching');
            themeSwitchRafRef.current = null;
          });
        });
      }
    } catch {
      // Ignore DOM sync errors
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (themeSwitchRafRef.current) {
        cancelAnimationFrame(themeSwitchRafRef.current);
        themeSwitchRafRef.current = null;
      }
      if (activeThemeTransitionRef.current) {
        try {
          activeThemeTransitionRef.current.skipTransition();
        } catch {
          // Ignore stale transition cleanup
        }
        activeThemeTransitionRef.current = null;
      }
      document.documentElement.classList.remove('theme-vt', 'theme-switching');
    };
  }, []);

  useEffect(() => {
    if (!hasExplicitThemeRef.current) return;
    try {
      localStorage.setItem('cs_theme', theme);
      document.cookie = `cs_theme=${theme}; max-age=31536000; path=/; SameSite=Lax`;
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e) => {
      if (hasExplicitThemeRef.current) return;
      setTheme(e.matches ? 'dark' : 'light');
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleSystemThemeChange);
      return () => mql.removeEventListener('change', handleSystemThemeChange);
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(handleSystemThemeChange);
      return () => mql.removeListener(handleSystemThemeChange);
    }
    return undefined;
  }, []);

  const toggleTheme = useCallback(() => {
    hasExplicitThemeRef.current = true;
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'oled' : 'light';
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!root || prefersReduced || typeof document.startViewTransition !== 'function') {
      setTheme(nextTheme);
      return;
    }

    if (activeThemeTransitionRef.current) {
      try {
        activeThemeTransitionRef.current.skipTransition();
      } catch {
        // Ignore stale transition state
      }
      activeThemeTransitionRef.current = null;
    }

    root.classList.add('theme-vt', 'theme-switching');
    try {
      const vt = document.startViewTransition(() => {
        flushSync(() => {
          setTheme(nextTheme);
        });
        root.setAttribute('data-theme', nextTheme);
        const metaTheme = document.getElementById('meta-theme-color');
        const metaColor = nextTheme === 'oled' ? '#000000' : (nextTheme === 'dark' ? '#121417' : '#6F1D2B');
        if (metaTheme) metaTheme.setAttribute('content', metaColor);
      });
      activeThemeTransitionRef.current = vt;
      vt.finished.finally(() => {
        if (activeThemeTransitionRef.current === vt) {
          activeThemeTransitionRef.current = null;
          root.classList.remove('theme-vt', 'theme-switching');
        }
      });
    } catch {
      activeThemeTransitionRef.current = null;
      root.classList.remove('theme-vt', 'theme-switching');
      setTheme(nextTheme);
    }
  }, [theme]);

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
    return initTelemetryTracker({ getViewerId: getOrCreateViewerId });
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
    const INDEX_CACHE_URL = `https://cs-cache.local/index_${APP_VERSION}_${buildQuery}.json`;

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

  const breadcrumbParts = selectedPath ? selectedPath.split(/[\\/]/).filter(Boolean) : [];

  const renderBreadcrumbs = (classNameAdd = '') => (
    <div className={`breadcrumb-container ${classNameAdd}`}>
      <div className="breadcrumb-trail">
        <a href="/" className="breadcrumb-link home" onClick={navigateToHome}>
          <span className="btn-desktop-text">← Library Home</span>
          <span className="btn-mobile-text" aria-hidden="true">← Home</span>
        </a>
        {filterCurriculum && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterCurriculum('')} title="Click to remove curriculum filter">
              {filterCurriculum} ×
            </button>
          </>
        )}
        {filterSubject && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => { setFilterSubject(''); setFilterUnit(''); }} title="Click to remove subject filter">
              {formatSubjectDisplay(filterSubject)} ×
            </button>
          </>
        )}
        {filterUnit && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterUnit('')} title="Click to remove unit filter">
              {filterUnit} ×
            </button>
          </>
        )}
        {filterYear && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterYear('')} title="Click to remove year filter">
              {filterYear} ×
            </button>
          </>
        )}
        {filterSession && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterSession('')} title="Click to remove session filter">
              {filterSession} ×
            </button>
          </>
        )}
        {filterDocType && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setFilterDocType(null)} title="Click to remove document type filter">
              {DOC_TYPE_INFO[filterDocType]?.fullLabel || filterDocType} ×
            </button>
          </>
        )}
        {breadcrumbParts.map((part, i) => (
          <React.Fragment key={i}>
            <span className="breadcrumb-separator">/</span>
            <button
              type="button"
              className="breadcrumb-link"
              onClick={() => {
                const pathSlice = breadcrumbParts.slice(0, i + 1).join('/');
                setSelectedPath(pathSlice);
                setForceShowTable(true);
              }}
            >
              {part}
            </button>
          </React.Fragment>
        ))}
        {searchQuery && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button type="button" className="breadcrumb-link" onClick={() => setSearchQuery('')} title="Clear search query">
              Search: &ldquo;{searchQuery}&rdquo; ×
            </button>
          </>
        )}
      </div>

      <div className="result-summary">
        {filesLoading ? (
          <span>Loading full catalog...</span>
        ) : loadError && catalogTotalCount === 0 ? (
          <span style={{ color: '#8A2030', fontWeight: 600 }}>Reconnecting to archive...</span>
        ) : totalMatchedCount > visibleFiles.length ? (
          <>
            Showing <strong>{visibleFiles.length}</strong> of <strong>{totalMatchedCount.toLocaleString()}</strong>{' '}
            {filterDocType === 'Book'
              ? 'textbooks'
              : (viewMode === 'unified' ? 'exam sittings' : 'documents')}
          </>
        ) : (
          <>
            Displaying <strong>{totalMatchedCount.toLocaleString()}</strong> matching{' '}
            {filterDocType === 'Book'
              ? (totalMatchedCount === 1 ? 'textbook' : 'textbooks')
              : viewMode === 'unified'
                ? (totalMatchedCount === 1 ? 'exam sitting' : 'exam sittings')
                : (totalMatchedCount === 1 ? 'document' : 'documents')}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header-top">
        <div className={`header-top-row ${!showWelcome && !isNotFound && currentTab === 'library' ? 'mobile-hidden' : ''}`}>
          <a
            href="/"
            className="brand-section"
            onClick={navigateToHome}
            aria-label="Conceptualist Systems - Library Home"
          >
            <div className="brand-logo-text">
              Conceptualist <span className="brand-logo-accent">Systems</span>
            </div>
            <div className="brand-tagline">
              <span className="title">EDEXCEL LIBRARY</span>
              <span>Past Exam Papers & Resources</span>
            </div>
          </a>

          <div className="header-right-group">
            <div className="header-coverage-badge">
              <strong>{activeDateText}</strong>
            </div>
            <button
              type="button"
              className="header-theme-btn"
              onClick={toggleTheme}
              title={
                theme === 'light'
                  ? 'Current: Academic Light - Click for Dark Mode'
                  : theme === 'dark'
                  ? 'Current: Academic Dark - Click for Pure OLED Mode'
                  : 'Current: Pure OLED - Click for Light Mode'
              }
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  <span>Light</span>
                </>
              ) : theme === 'dark' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 3v18A9 9 0 0 0 12 3z" fill="currentColor"/></svg>
                  <span>OLED</span>
                </>
              )}
            </button>
            <a
              href={currentTab !== 'library' ? '/' : '/about'}
              className={`header-nav-btn ${currentTab !== 'library' ? 'active' : ''}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                e.preventDefault();
                setIsNotFound(false);
                setCurrentTab(currentTab !== 'library' ? 'library' : 'about');
              }}
            >
              {currentTab !== 'library' ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="15 18 9 12 15 6"/></svg>
                  <span>Library</span>
                </>
              ) : (
                'About'
              )}
            </a>
          </div>
        </div>

        {/* Integrated Mobile Header Breadcrumb Strip */}
        {isMobile && currentTab === 'library' && !showWelcome && !isNotFound && (
          <div className="mobile-header-breadcrumb">
            {renderBreadcrumbs('mobile-header-breadcrumb-content')}
            <button
              type="button"
              className="mobile-breadcrumb-theme-btn"
              onClick={toggleTheme}
              title={
                theme === 'light'
                  ? 'Current: Light - Tap for Dark'
                  : theme === 'dark'
                  ? 'Current: Dark - Tap for Pure OLED'
                  : 'Current: OLED - Tap for Light'
              }
              aria-label={`Switch color theme (current: ${theme})`}
            >
              {theme === 'light' ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  <span>Light</span>
                </>
              ) : theme === 'dark' ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18A9 9 0 0 0 12 3z" fill="currentColor"/></svg>
                  <span>OLED</span>
                </>
              )}
            </button>
          </div>
        )}
      </header>

      {/* Main Search & Filter Banner */}
      {currentTab === 'library' && (
        <div className="search-banner">
          <div className="search-row">
            <div className="search-input-wrapper">
              <label htmlFor="search-input" className="sr-only">
                Search repository by course code, subject, unit or year
              </label>
              <svg className="search-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                ref={searchInputRef}
                id="search-input"
                type="text"
                className="search-input"
                placeholder={isMobile ? 'Search unit, code, or year...' : 'Search by course code, subject, unit or year (e.g. WMA11, Biology, 4MA1)...'}
                value={searchQuery}
                onFocus={() => ensureFullIndexRef.current?.()}
                onChange={(e) => { setIsNotFound(false); setSearchQuery(e.target.value); }}
                aria-label="Search by course code, subject, unit or year"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                  aria-label="Clear search query"
                >
                  ✕
                </button>
              ) : (
                <kbd className="search-shortcut-hint" title="Press / to search">/</kbd>
              )}
            </div>
            <div className="search-button-group">
              <div className="quick-curriculum-pills" role="group" aria-label="Filter by curriculum">
                <button
                  type="button"
                  className={`quick-curr-btn ${filterCurriculum === '' ? 'active' : ''}`}
                  onClick={() => { setIsNotFound(false); setFilterCurriculum(''); }}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`quick-curr-btn ${filterCurriculum === 'Edexcel IAL' ? 'active' : ''}`}
                  onClick={() => {
                    setIsNotFound(false);
                    setFilterCurriculum(filterCurriculum === 'Edexcel IAL' ? '' : 'Edexcel IAL');
                    setForceShowTable(true);
                  }}
                >
                  IAL
                </button>
                <button
                  type="button"
                  className={`quick-curr-btn ${filterCurriculum === 'Edexcel IGCSE' ? 'active' : ''}`}
                  onClick={() => {
                    setIsNotFound(false);
                    setFilterCurriculum(filterCurriculum === 'Edexcel IGCSE' ? '' : 'Edexcel IGCSE');
                    setForceShowTable(true);
                  }}
                >
                  IGCSE
                </button>
              </div>
              <button
                type="button"
                className={`filter-drawer-toggle ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters((prev) => !prev)}
                aria-expanded={showFilters}
                aria-controls="catalog-filter-drawer"
                aria-label="Toggle Filters"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                <span className="filter-toggle-label">Filters</span>
                {activeDrawerFilterCount > 0 && (
                  <span className="filter-count-badge">{activeDrawerFilterCount}</span>
                )}
              </button>
              {hasActiveFilters && !showFilters && (
                <button
                  type="button"
                  className="search-reset-inline"
                  onClick={clearFilters}
                  title="Clear all active filters and return to Library Home"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Filter Controls Drawer */}
          {showFilters && (
            <div id="catalog-filter-drawer" className="filter-controls-container">
              <div className="filter-row">
                <div className="drawer-curriculum-group">
                  <span className="filter-group-label">Curriculum:</span>
                  <div className="filter-pills" role="group" aria-label="Filter by curriculum">
                    <button
                      type="button"
                      className={`filter-btn ${filterCurriculum === '' ? 'active' : ''}`}
                      onClick={() => { setIsNotFound(false); setFilterCurriculum(''); }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`filter-btn ${filterCurriculum === 'Edexcel IAL' ? 'active' : ''}`}
                      onClick={() => {
                        setIsNotFound(false);
                        setFilterCurriculum(filterCurriculum === 'Edexcel IAL' ? '' : 'Edexcel IAL');
                        setForceShowTable(true);
                      }}
                    >
                      Edexcel IAL
                    </button>
                    <button
                      type="button"
                      className={`filter-btn ${filterCurriculum === 'Edexcel IGCSE' ? 'active' : ''}`}
                      onClick={() => {
                        setIsNotFound(false);
                        setFilterCurriculum(filterCurriculum === 'Edexcel IGCSE' ? '' : 'Edexcel IGCSE');
                        setForceShowTable(true);
                      }}
                    >
                      Edexcel IGCSE
                    </button>
                  </div>
                </div>

                <span className="filter-group-label">Type:</span>
                <div className="filter-pills" role="group" aria-label="Filter by document type">
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === null ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(null); }}
                  >
                    All Types
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'QP' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'QP' ? null : 'QP'); setForceShowTable(true); }}
                  >
                    Question Papers
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'MS' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'MS' ? null : 'MS'); setForceShowTable(true); }}
                  >
                    Mark Schemes
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'ER' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'ER' ? null : 'ER'); setForceShowTable(true); }}
                  >
                    Examiner Reports
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'Book' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'Book' ? null : 'Book'); setForceShowTable(true); }}
                  >
                    Textbooks
                  </button>
                  <button
                    type="button"
                    className={`filter-btn ${filterDocType === 'Extra' ? 'active' : ''}`}
                    onClick={() => { setIsNotFound(false); setFilterDocType(filterDocType === 'Extra' ? null : 'Extra'); setForceShowTable(true); }}
                  >
                    Audio / Data / SAMs
                  </button>
                </div>
              </div>

              <div className="filter-row filter-row-selects">
                <label htmlFor="subject-select" className="filter-group-label">Subject:</label>
                <select
                  id="subject-select"
                  aria-label="Filter documents by subject"
                  className="filter-select"
                  value={filterSubject}
                  onChange={(e) => {
                    setIsNotFound(false);
                    setFilterSubject(e.target.value);
                    setFilterUnit('');
                    if (e.target.value) setForceShowTable(true);
                  }}
                >
                  <option value="">All Subjects</option>
                  {availableSubjectsForFilter.map((s) => (
                    <option key={s} value={s}>{formatSubjectDisplay(s)}</option>
                  ))}
                </select>

                {availableUnitsForFilter.length > 0 && (
                  <>
                    <label htmlFor="unit-select" className="filter-group-label">Unit:</label>
                    <select
                      id="unit-select"
                      aria-label="Filter documents by unit or paper"
                      className="filter-select"
                      value={filterUnit}
                      onChange={(e) => {
                        setIsNotFound(false);
                        setFilterUnit(e.target.value);
                        setForceShowTable(true);
                      }}
                    >
                      <option value="">All Units & Papers</option>
                      {availableUnitsForFilter.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </>
                )}

                <label htmlFor="year-select" className="filter-group-label">Year:</label>
                <select
                  id="year-select"
                  aria-label="Filter documents by examination year"
                  className="filter-select"
                  value={filterYear}
                  onChange={(e) => {
                    setIsNotFound(false);
                    setFilterYear(e.target.value);
                    if (e.target.value) setForceShowTable(true);
                  }}
                >
                  <option value="">All Years</option>
                  {availableYearsForFilter.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>

                {filterDocType !== 'Book' && (
                  <>
                    <label htmlFor="session-select" className="filter-group-label">Session:</label>
                    <select
                      id="session-select"
                      aria-label="Filter documents by examination session"
                      className="filter-select"
                      value={filterSession}
                      onChange={(e) => {
                        setIsNotFound(false);
                        setFilterSession(e.target.value);
                        if (e.target.value) setForceShowTable(true);
                      }}
                    >
                      <option value="">All Sessions</option>
                      <option value="January">January</option>
                      <option value="June">June</option>
                      <option value="October">October</option>
                    </select>
                  </>
                )}

                <label htmlFor="sort-select" className="filter-group-label">Sort:</label>
                <select
                  id="sort-select"
                  aria-label="Sort documents"
                  className="filter-select"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setForceShowTable(true); }}
                >
                  <option value="newest">Newest First</option>
                  <option value="popular">Most Viewed</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name_asc">Name (A–Z)</option>
                  <option value="name_desc">Name (Z–A)</option>
                  <option value="size_desc">File Size (Largest)</option>
                </select>

                <span className="filter-group-label">View:</span>
                <div className="view-mode-toggle" role="group" aria-label="Toggle Unified Sittings vs Individual Files">
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === 'unified' ? 'active' : ''}`}
                    onClick={() => setViewMode('unified')}
                    title="Combine QP, MS, and ER from the same sitting into one row"
                  >
                    Unified Sittings
                  </button>
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === 'separate' ? 'active' : ''}`}
                    onClick={() => setViewMode('separate')}
                    title="Show every file as a separate row"
                  >
                    Individual Files
                  </button>
                </div>

                {hasActiveFilters && (
                  <button type="button" className="filter-reset-btn" onClick={clearFilters}>
                    Reset All
                  </button>
                )}

                <button
                  type="button"
                  className="filter-apply-btn mobile-only"
                  onClick={() => setShowFilters(false)}
                >
                  Done &amp; View Results ({totalMatchedCount.toLocaleString()})
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Layout */}
      <div className="main-layout">
        <main className="content-area">
          {currentTab === 'about' ? (
            <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading About...</div>}>
              <AboutPage onGoHome={() => { setIsNotFound(false); setCurrentTab('library'); }} />
            </Suspense>
          ) : currentTab === 'changelog' ? (
            <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading Changelog...</div>}>
              <ChangelogPage onGoHome={() => { setIsNotFound(false); setCurrentTab('library'); }} />
            </Suspense>
          ) : isNotFound ? (
            <div className="not-found-card" role="region" aria-label="Page not found">
              <span className="not-found-badge">404 • Route Not Found</span>
              <h1>{seoMeta.h1}</h1>
              <p>{seoMeta.subtitle}</p>
              <div className="not-found-actions">
                <a href="/" className="search-button" onClick={navigateToHome}>
                  Return to Library Home
                </a>
                <a
                  href="/ial"
                  className="filter-btn"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterCurriculum('Edexcel IAL');
                    setForceShowTable(true);
                  }}
                >
                  Edexcel IAL
                </a>
                <a
                  href="/igcse"
                  className="filter-btn"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterCurriculum('Edexcel IGCSE');
                    setForceShowTable(true);
                  }}
                >
                  Edexcel IGCSE
                </a>
                <a
                  href="/textbooks"
                  className="filter-btn"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterDocType('Book');
                    setForceShowTable(true);
                  }}
                >
                  Textbooks
                </a>
                <a
                  href="/data-files"
                  className="filter-btn"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterDocType('DF');
                    setForceShowTable(true);
                  }}
                >
                  Data Files
                </a>
                <a
                  href="/audio"
                  className="filter-btn"
                  onClick={(e) => {
                    if (!shouldHandleClientNavigation(e)) return;
                    e.preventDefault();
                    clearFilters({ pushUrl: false });
                    setFilterDocType('AUD');
                    setForceShowTable(true);
                  }}
                >
                  Audio Archive
                </a>
              </div>
            </div>
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
          ) : (() => {
            const isSearchActive = Boolean(searchQuery && searchQuery.trim());
            return (
              <>
                {isSearchActive ? (
                  <>
                    <h1 className="sr-only">{seoMeta.h1}</h1>
                    {!(filesLoading && visibleFiles.length === 0) && totalMatchedCount > 0 && (!isMobile || searchMeta.didYouMean) && (
                      <div className="search-results-bar">
                        {!isMobile && (
                          <span className="search-results-count">
                            {totalMatchedCount > visibleFiles.length ? (
                              <>Showing <strong>{visibleFiles.length}</strong> of <strong>{totalMatchedCount.toLocaleString()}</strong> {viewMode === 'unified' ? 'matching exam sittings' : 'matching documents'}</>
                            ) : (
                              <><strong>{totalMatchedCount.toLocaleString()}</strong> {totalMatchedCount === 1 ? (viewMode === 'unified' ? 'matching exam sitting' : 'matching document') : (viewMode === 'unified' ? 'matching exam sittings' : 'matching documents')}</>
                            )}
                          </span>
                        )}
                        {searchMeta.didYouMean && (
                          <span className="search-did-you-mean">
                            Did you mean{' '}
                            <button
                              type="button"
                              className="search-did-you-mean-btn"
                              onClick={() => setSearchQuery(searchMeta.didYouMean)}
                            >
                              {searchMeta.didYouMean}
                            </button>
                            ?
                          </span>
                        )}
                      </div>
                    )}
                    {!(filesLoading && visibleFiles.length === 0) && searchMeta.isPartialFallback && totalMatchedCount > 0 && (
                      <div className="search-fallback-banner" role="status">
                        <span>
                          No exact match for all terms — showing closest partial matches
                          {searchMeta.missingTerms?.length > 0 && (
                            <> (missing: <strong>{searchMeta.missingTerms.join(', ')}</strong>)</>
                          )}
                        </span>
                      </div>
                    )}
                  </>
                ) : !isMobile ? (
                  <div className="archive-context-header">
                    {renderBreadcrumbs('desktop-breadcrumb')}
                    <div className="archive-title-block">
                      <h1 className="archive-page-h1">{seoMeta.h1}</h1>
                      {seoMeta.subtitle && (
                        <p className="archive-page-subtitle">{seoMeta.subtitle}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="archive-title-header">
                    <h1 className="archive-page-h1">{seoMeta.h1}</h1>
                    {seoMeta.subtitle && (
                      <p className="archive-page-subtitle">{seoMeta.subtitle}</p>
                    )}
                  </div>
                )}

                {filesLoading && visibleFiles.length === 0 ? (
                  <TableSkeletonLoader rows={8} viewMode={viewMode} />
                ) : visibleFiles.length > 0 ? (
                  <div className="file-list">
                    <table className="file-table">
                      <thead>
                        <tr>
                          <th className="col-sitting" style={{ width: viewMode === 'unified' ? '40%' : '50%' }}>
                            {filterDocType === 'Book'
                              ? 'Textbook / Solution Resource'
                              : viewMode === 'unified' ? 'Exam Sitting / Resource' : 'Document'}
                          </th>
                          <th className="col-series" style={{ width: viewMode === 'unified' ? '19%' : '26%' }}>
                            {filterDocType === 'Book' ? 'Course & Category' : viewMode === 'unified' ? 'Series' : 'Course & Session'}
                          </th>
                          <th className="col-actions" style={{ width: viewMode === 'unified' ? '41%' : '24%' }}>
                            {filterDocType === 'Book'
                              ? 'Open Textbook / Resource'
                              : viewMode === 'unified' ? 'Open Paper / Mark Scheme / Report' : 'Type & Quick Links'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleFiles.map((file) => {
                          const isUnified = Boolean(viewMode === 'unified' && file.isUnifiedSitting);
                          const activeDoc = isUnified
                            ? ((filterDocType && file.docs?.[filterDocType]) || file.primaryFile || file)
                            : file;
                          const badge = getDocTypeBadge(activeDoc.docType, activeDoc.category);
                          const displayTitle = isUnified ? getUnifiedSittingTitle(file) : getDisplayTitle(file);
                          const titleCls = isUnified ? 'title-unified' : (badge ? `title-${badge.cls}` : 'title-default');
                          const shortUnit = getShortUnitDisplay(file);
                          const isPdf = activeDoc.ext === 'pdf';
                          const siblings = file.siblings || null;
                          const docs = file.docs || {};
                          const canSplit = Boolean(docs.QP?.ext === 'pdf' && docs.MS?.ext === 'pdf');
                          const defaultViewMode =
                            filterDocType === 'AUD' && (docs.AUD || activeDoc.docType === 'AUD')
                              ? 'AUD'
                              : canSplit
                              ? 'split'
                              : (docs.QP ? 'QP' : (activeDoc.docType || 'QP'));
                          const eligibleForViews = isQuestionPaperEligibleForViews(file);
                          const paperViews = eligibleForViews
                            ? getPaperTotalViews(file, viewsMap)
                            : 0;

                          return (
                            <tr key={file.id || file.path} className={isUnified ? 'unified-sitting-row' : ''}>
                              <td className="file-title-cell">
                                <div className="file-title-top-flex">
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div className="file-title-row">
                                      <a
                                        href={getOnSitePaperUrl(file, defaultViewMode)}
                                        rel="nofollow"
                                        onPointerEnter={preloadReaderChunksOnce}
                                        onFocus={preloadReaderChunksOnce}
                                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, defaultViewMode); }}
                                        onClick={(e) => {
                                          if (!shouldHandleClientNavigation(e)) return;
                                          e.preventDefault();
                                          openOnSiteReader(file, defaultViewMode);
                                        }}
                                        className={titleCls}
                                        title={isUnified ? `View ${DOC_TYPE_INFO[activeDoc.docType]?.fullLabel || 'Document'} (${displayTitle}) on-site` : `View ${displayTitle} on-site`}
                                      >
                                        {displayTitle}
                                      </a>
                                    </div>
                                    <div className="file-meta-subrow">
                                      {isUnified ? (
                                        <span className="unified-meta-subline" title={file.folderPath}>
                                          {file.fileCount} {file.fileCount === 1 ? 'file' : 'files'} · {file.docTypes.join(' · ')}
                                          {file.totalSize ? ` · ${formatBytes(file.totalSize)}` : ''}
                                        </span>
                                      ) : (
                                        <>
                                          {(() => {
                                            const bookMeta = file.bookMeta || null;
                                            const sublineText = bookMeta
                                              ? [bookMeta.authors, bookMeta.publisher, bookMeta.year].filter(Boolean).join(' · ')
                                              : file.path;
                                            return (
                                              <span className="file-path-subtext file-location" title={sublineText}>
                                                {sublineText}
                                              </span>
                                            );
                                          })()}
                                          {file.size ? (
                                            <span className="file-size-tag">
                                              {formatBytes(file.size)} · {(file.ext || 'PDF').toUpperCase()}
                                            </span>
                                          ) : null}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {eligibleForViews && (
                                    <PaperViewsCounter count={paperViews} variant="table" />
                                  )}
                                </div>
                              </td>
                              <td>
                                {!isUnified && (
                                  <div className="details-primary">
                                    {formatSubjectDisplay(file.subject)}
                                    {!(file.category === 'Books' || file.category === 'IAL Books' || file.category === 'IGCSE Books') && shortUnit
                                      ? ` — ${shortUnit}`
                                      : ''}
                                  </div>
                                )}
                                <div className="details-secondary">
                                  <span className={`curr-mini-badge ${file.curriculum === 'Edexcel IGCSE' ? 'igcse' : 'ial'}`}>
                                    {file.curriculum ? file.curriculum.replace('Edexcel ', '') : 'IAL'}
                                  </span>
                                  {isUnified && file.unitCode && (
                                    <span className="unit-code-chip">{file.unitCode}</span>
                                  )}
                                  {file.session ? (
                                    <span className="session-pill-tag">{file.session}</span>
                                  ) : file.year ? (
                                    <span>Year {file.year}</span>
                                  ) : (
                                    <span>Reference Resource</span>
                                  )}
                                  {Boolean(file.variant === 'R' || file.variant === 'A' || (file.variant && file.variant.includes('R'))) && (
                                    <span className="curr-mini-badge regional" title="Regional examination series">
                                      {file.variant === 'A' ? 'Alt A' : 'Regional'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {isUnified ? (
                                  <div className="unified-actions-cell">
                                    {docs.QP && (
                                      <a
                                        href={getOnSitePaperUrl(file, 'QP')}
                                        rel="nofollow"
                                        onPointerEnter={preloadReaderChunksOnce}
                                        onFocus={preloadReaderChunksOnce}
                                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, 'QP'); }}
                                        onClick={(e) => {
                                          if (!shouldHandleClientNavigation(e)) return;
                                          e.preventDefault();
                                          openOnSiteReader(file, 'QP');
                                        }}
                                        className="unified-doc-btn qp"
                                        title={`Open Question Paper — ${docs.QP.name} (${formatBytes(docs.QP.size)})`}
                                      >
                                        <span className="btn-desktop-text">Question Paper</span>
                                        <span className="btn-mobile-text" aria-hidden="true">QP</span>
                                      </a>
                                    )}
                                    {docs.MS && (
                                      <a
                                        href={getOnSitePaperUrl(file, 'MS')}
                                        rel="nofollow"
                                        onPointerEnter={preloadReaderChunksOnce}
                                        onFocus={preloadReaderChunksOnce}
                                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, 'MS'); }}
                                        onClick={(e) => {
                                          if (!shouldHandleClientNavigation(e)) return;
                                          e.preventDefault();
                                          openOnSiteReader(file, 'MS');
                                        }}
                                        className="unified-doc-btn ms"
                                        title={`Open Mark Scheme — ${docs.MS.name} (${formatBytes(docs.MS.size)})`}
                                      >
                                        <span className="btn-desktop-text">Mark Scheme</span>
                                        <span className="btn-mobile-text" aria-hidden="true">MS</span>
                                      </a>
                                    )}
                                    {docs.ER && (
                                      <a
                                        href={getOnSitePaperUrl(file, 'ER')}
                                        rel="nofollow"
                                        onPointerEnter={preloadReaderChunksOnce}
                                        onFocus={preloadReaderChunksOnce}
                                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, 'ER'); }}
                                        onClick={(e) => {
                                          if (!shouldHandleClientNavigation(e)) return;
                                          e.preventDefault();
                                          openOnSiteReader(file, 'ER');
                                        }}
                                        className="unified-doc-btn er"
                                        title={`Open Examiner Report — ${docs.ER.name} (${formatBytes(docs.ER.size)})`}
                                      >
                                        <span className="btn-desktop-text">Examiner Report</span>
                                        <span className="btn-mobile-text" aria-hidden="true">ER</span>
                                      </a>
                                    )}
                                    {['AUD', 'SC', 'DF', 'SOL', 'SAM'].map((extraType) => {
                                      const extraDoc = docs[extraType];
                                      if (!extraDoc) return null;
                                      const [scFullLabel, scShortLabel] = extraType === 'SC' ? getScDocumentLabel(extraDoc) : [null, null];
                                      const labelMap = {
                                        AUD: 'Audio',
                                        SC: scFullLabel || 'Source',
                                        DF: 'Data Files',
                                        SOL: 'Solutions',
                                        SAM: 'Specimen'
                                      };
                                      return (
                                        <a
                                          key={extraType}
                                          href={getOnSitePaperUrl(file, extraType)}
                                          rel="nofollow"
                                          onPointerEnter={preloadReaderChunksOnce}
                                          onFocus={preloadReaderChunksOnce}
                                          onPointerDown={(e) => { if (e.button === 0 && extraType !== 'AUD') prewarmPaperOnPointerDown(file, extraType); }}
                                          onClick={(e) => {
                                            if (!shouldHandleClientNavigation(e)) return;
                                            e.preventDefault();
                                            openOnSiteReader(file, extraType);
                                          }}
                                          className={`unified-doc-btn ${extraType === 'AUD' ? 'aud' : 'extra'}`}
                                          title={`Open ${extraType === 'SC' ? scFullLabel : (DOC_TYPE_INFO[extraType]?.fullLabel || extraType)} on-site — ${extraDoc.name}`}
                                        >
                                          <span className="btn-desktop-text">{labelMap[extraType] || extraType}</span>
                                          <span className="btn-mobile-text" aria-hidden="true">{extraType === 'SC' ? scShortLabel : extraType}</span>
                                        </a>
                                      );
                                    })}
                                    {isPdf && canSplit && (
                                      <a
                                        href={getOnSitePaperUrl(file, 'split')}
                                        rel="nofollow"
                                        onPointerEnter={preloadReaderChunksOnce}
                                        onFocus={preloadReaderChunksOnce}
                                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, 'split'); }}
                                        onClick={(e) => {
                                          if (!shouldHandleClientNavigation(e)) return;
                                          e.preventDefault();
                                          openOnSiteReader(file, 'split');
                                        }}
                                        className="unified-preview-btn split-btn"
                                        title="Open Question Paper and Mark Scheme side by side in Split View"
                                      >
                                        <span className="btn-desktop-text">Split View</span>
                                        <span className="btn-mobile-text" aria-hidden="true">Split</span>
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <div className="row-actions-cell">
                                    {viewMode === 'unified' ? (
                                      <a
                                        href={getOnSitePaperUrl(file, file.docType || 'Book')}
                                        rel="nofollow"
                                        onPointerEnter={preloadReaderChunksOnce}
                                        onFocus={preloadReaderChunksOnce}
                                        onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(file, file.docType || 'Book'); }}
                                        onClick={(e) => {
                                          if (!shouldHandleClientNavigation(e)) return;
                                          e.preventDefault();
                                          openOnSiteReader(file, file.docType || 'Book');
                                        }}
                                        className={`unified-doc-btn ${badge?.cls === 'book' || badge?.cls === 'sol' ? 'book' : (badge?.cls || 'extra')}`}
                                      >
                                        <span className="btn-desktop-text">
                                          {badge?.cls === 'book'
                                            ? 'Open Textbook'
                                            : badge?.cls === 'sol'
                                              ? 'Worked Solutions'
                                              : `Open ${badge?.fullLabel || 'Resource'}`}
                                        </span>
                                        <span className="btn-mobile-text" aria-hidden="true">{badge?.label || 'DOC'}</span>
                                      </a>
                                    ) : (
                                      <>
                                        {badge ? (
                                          <span className={`doc-badge ${badge.cls}`} title={badge.fullLabel}>
                                            {badge.label}
                                          </span>
                                        ) : (
                                          <span className="doc-badge default">Doc</span>
                                        )}

                                        {siblings && ['QP', 'MS', 'ER'].map((sibType) => {
                                          if (sibType === file.docType) return null;
                                          const sib = siblings[sibType];
                                          if (!sib) return null;
                                          return (
                                            <a
                                              key={sibType}
                                              href={getOnSitePaperUrl(sib, sibType)}
                                              rel="nofollow"
                                              onPointerEnter={preloadReaderChunksOnce}
                                              onFocus={preloadReaderChunksOnce}
                                              onPointerDown={(e) => { if (e.button === 0) prewarmPaperOnPointerDown(sib, sibType); }}
                                              onClick={(e) => {
                                                if (!shouldHandleClientNavigation(e)) return;
                                                e.preventDefault();
                                                openOnSiteReader(sib, sibType);
                                              }}
                                              className={`sibling-pill ${sibType.toLowerCase()}`}
                                              title={`Open matching ${DOC_TYPE_INFO[sibType]?.fullLabel} (${file.session})`}
                                            >
                                              {sibType} ↗
                                            </a>
                                          );
                                        })}
                                      </>
                                    )}

                                    {(isPdf || activeDoc.docType === 'AUD' || (activeDoc.docType === 'SOL' && activeDoc.ext === 'zip')) && viewMode !== 'unified' && (
                                      <a
                                        href={getOnSitePaperUrl(activeDoc, activeDoc.docType || 'QP')}
                                        rel="nofollow"
                                        onPointerEnter={preloadReaderChunksOnce}
                                        onFocus={preloadReaderChunksOnce}
                                        onPointerDown={(e) => { if (e.button === 0 && activeDoc.docType !== 'AUD') prewarmPaperOnPointerDown(activeDoc, activeDoc.docType || 'QP'); }}
                                        onClick={(e) => {
                                          if (!shouldHandleClientNavigation(e)) return;
                                          e.preventDefault();
                                          openOnSiteReader(activeDoc, activeDoc.docType || 'QP');
                                        }}
                                        className="preview-btn"
                                        title={
                                          activeDoc.docType === 'AUD'
                                            ? 'Play Listening Audio On-Site'
                                            : siblings?.QP?.ext === 'pdf' && siblings?.MS?.ext === 'pdf'
                                            ? 'Open Question Paper and Mark Scheme in PDF Reader'
                                            : 'Quick In-App PDF Preview'
                                        }
                                      >
                                        {activeDoc.docType === 'AUD' ? 'Listen' : 'View'}
                                      </a>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {totalMatchedCount > visibleFiles.length && (
                      <div className="pagination-bar">
                        <span className="pagination-info">
                          Showing <strong>{visibleFiles.length}</strong> of <strong>{totalMatchedCount.toLocaleString()}</strong> matching documents
                        </span>
                        <div className="pagination-actions">
                          <button
                            type="button"
                            className="search-button pagination-btn"
                            onClick={() => setVisibleCount((c) => c + 100)}
                          >
                            Load 100 More ↓
                          </button>
                          {totalMatchedCount - visibleFiles.length <= 600 && (
                            <button
                              type="button"
                              className="filter-btn"
                              onClick={() => setVisibleCount(totalMatchedCount)}
                            >
                              Show All ({totalMatchedCount.toLocaleString()})
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="no-results-box">
                    {loadError && catalogTotalCount === 0 ? (
                      <>
                        <h3>Connecting to repository archive...</h3>
                        <p>
                          The network connection took longer than expected ({loadError}). Reconnecting automatically in the background...
                        </p>
                        <button
                          type="button"
                          className="search-button"
                          style={{ marginTop: '14px' }}
                          onClick={retryLoadIndex}
                        >
                          Retry Connection Now
                        </button>
                      </>
                    ) : (
                      <>
                        <h3>No matching documents found</h3>
                        <p>Try refining your search terms or resetting an active filter above.</p>
                        {searchMeta.didYouMean && (
                          <p className="search-did-you-mean search-did-you-mean-empty">
                            Did you mean{' '}
                            <button
                              type="button"
                              className="search-did-you-mean-btn"
                              onClick={() => setSearchQuery(searchMeta.didYouMean)}
                            >
                              {searchMeta.didYouMean}
                            </button>
                            ?
                          </p>
                        )}
                        {hasActiveFilters && (
                          <button
                            type="button"
                            className="search-button"
                            style={{ marginTop: '14px' }}
                            onClick={clearFilters}
                          >
                            Reset All Filters
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {archiveContextInfo && !(filesLoading && visibleFiles.length === 0) && (
                  <section className="archive-context-strip" aria-label="Archive specifications and related resources">
                    <div className="archive-context-copy">
                      <div className="archive-context-eyebrow">Specification &amp; Archive Reference</div>
                      <h2 className="archive-context-heading">{archiveContextInfo.heading}</h2>
                      {archiveContextInfo.legacyInfo && (
                        <p className="archive-context-legacy">{archiveContextInfo.legacyInfo}</p>
                      )}
                      <p className="archive-context-note">{archiveContextInfo.note}</p>
                    </div>
                    {archiveContextInfo.links.length > 0 && (
                      <nav className="archive-context-links" aria-label="Related course resources">
                        {archiveContextInfo.links.map((item) => (
                          <a
                            key={item.href}
                            href={item.href}
                            className="archive-context-link"
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                              e.preventDefault();
                              item.onClick();
                            }}
                          >
                            {item.label} →
                          </a>
                        ))}
                      </nav>
                    )}
                  </section>
                )}
              </>
            );
          })()}
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

      {/* Global Footer at the Very Bottom */}
      <footer className="footer-bottom">
        <div className="footer-left-col">
          <div>© 2026 <strong>Conceptualist Systems</strong> — Independent Study Archive</div>
          <div
            className="footer-update-micro"
            onClick={() => { setIsNotFound(false); setCurrentTab('changelog'); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsNotFound(false); setCurrentTab('changelog'); } }}
            title="Click to view full site changelog & version history"
          >
            {APP_VERSION} · Updated {formatUpdateTimestamp(BUILD_TIMESTAMP)} · Not affiliated with Pearson or Edexcel
          </div>
        </div>
        <div className="footer-links">
          <a
            href="/ial"
            className="footer-link"
            onClick={(e) => {
              if (!shouldHandleClientNavigation(e)) return;
              e.preventDefault();
              setCurrentTab('library');
              clearFilters({ pushUrl: false });
              setFilterCurriculum('Edexcel IAL');
              setForceShowTable(true);
            }}
          >
            Edexcel IAL
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/igcse"
            className="footer-link"
            onClick={(e) => {
              if (!shouldHandleClientNavigation(e)) return;
              e.preventDefault();
              setCurrentTab('library');
              clearFilters({ pushUrl: false });
              setFilterCurriculum('Edexcel IGCSE');
              setForceShowTable(true);
            }}
          >
            Edexcel IGCSE
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/textbooks"
            className="footer-link"
            onClick={(e) => {
              if (!shouldHandleClientNavigation(e)) return;
              e.preventDefault();
              setCurrentTab('library');
              clearFilters({ pushUrl: false });
              setFilterDocType('Book');
              setForceShowTable(true);
            }}
          >
            Textbooks
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/changelog"
            className="footer-link"
            onClick={(e) => {
              if (!shouldHandleClientNavigation(e)) return;
              e.preventDefault();
              setIsNotFound(false);
              setCurrentTab('changelog');
            }}
          >
            Changelog
          </a>
          <span className="footer-sep">•</span>
          <a
            href="/about"
            className="footer-link"
            onClick={(e) => {
              if (!shouldHandleClientNavigation(e)) return;
              e.preventDefault();
              setIsNotFound(false);
              setCurrentTab('about');
            }}
          >
            About Us &amp; Team
          </a>
          <span className="footer-sep">•</span>
          <a href="mailto:diavlon.pxa@gmail.com" className="footer-link">
            Contact Us
          </a>
        </div>
      </footer>
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
