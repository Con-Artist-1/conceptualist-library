import { useEffect, useRef } from 'react';
import { buildRoutePath } from '../lib/routeCore.js';
import { getUnifiedSittingTitle } from '../lib/libraryHelpers.js';

/**
 * Synchronizes active route state to browser history URL, <title>, OpenGraph/Twitter meta tags,
 * canonical link, and lazy-loaded Schema.org JSON-LD.
 */
export function useSeoHeadSync({
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
}) {
  const didInitialSeoSyncRef = useRef(false);

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
        previewFile: previewFile?.isNotFound ? null : previewFile,
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
        const currentHashStr = String(window.location.hash || '').replace(/^#/, '');
        const currentHashParams = currentHashStr.includes('=') ? new URLSearchParams(currentHashStr) : null;
        const currentPaperKey = currentHashParams?.get('paper') || '';
        const currentViewParam = currentHashParams?.get('view') || '';
        const nextPaperKey = previewFile && !previewFile.isNotFound
          ? (previewFile.id || previewFile.path || '')
          : (pendingPaperParam || '');
        const isSamePaperNormalization = Boolean(
          currentPaperKey &&
          nextPaperKey &&
          currentPaperKey === nextPaperKey &&
          currentViewParam === (previewInitialView || '')
        );
        if (isPopStateRef.current) {
          isPopStateRef.current = false;
          if (isSamePaperNormalization && currentUrl !== nextUrl) {
            window.history.replaceState(nextHistoryState, '', nextUrl);
          }
        } else if (deferredSearchQuery || isLegacyPaperMigration || isInitialColdStateTag || isSamePaperNormalization) {
          window.history.replaceState(nextHistoryState, '', nextUrl);
        } else {
          window.history.pushState(nextHistoryState, '', nextUrl);
        }
      } else {
        isPopStateRef.current = false;
      }
    }

    const pageTitle = previewFile && !previewFile.isNotFound
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
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', pageTitle);
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', seoMeta.description);

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (robotsVal.includes('noindex') && !seoMeta.consolidatingCanonical) {
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
    void import('../seoRoutes.js')
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
  ]);
}
