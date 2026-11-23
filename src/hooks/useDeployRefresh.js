import { useEffect, useRef } from 'react';
import { DAILY_CACHE_TTL_MS, softReloadKeepingUrl } from '../lib/appMeta.js';

const PROBE_INTERVAL_MS = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Automatic 24-hour full reload + live new-catalog detection.
 * Defers safely while the reader modal is open or an active search query is typed.
 */
export function useDeployRefresh({
  previewFile,
  searchQuery,
  latestLoadedGenAtRef,
  dataMetaRef
}) {
  const previewFileRef = useRef(previewFile);
  previewFileRef.current = previewFile;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const pendingAutoReloadRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const pageBootAt = Date.now();
    let lastProbeAt = pageBootAt;

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
    }, CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(intervalId);
    };
  }, [latestLoadedGenAtRef, dataMetaRef]);

  useEffect(() => {
    if (!previewFile && pendingAutoReloadRef.current && !(searchQuery && searchQuery.trim())) {
      pendingAutoReloadRef.current = false;
      softReloadKeepingUrl();
    }
  }, [previewFile, searchQuery]);
}
