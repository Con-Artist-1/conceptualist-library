import { useState, useEffect, useCallback, useRef } from 'react';
import {
  readLocalViewsCache,
  isLocalViewsCacheStale,
  writeLocalViewsCache,
  updateSinglePaperInLocalViewsCache,
  getOrCreateViewerId,
  canCountPaperViewNow,
  getPaperViewKey,
  isQuestionPaperEligibleForViews,
  ACTIVE_MODAL_PAPER_SESSION_KEY
} from '../lib/libraryHelpers.js';

/**
 * Manages aggregated paper view counts, local TTL caching, and single-paper POST increments.
 * Exposes `viewsVersion` so Most Viewed sorting updates accurately even when existing key counts change.
 */
export function useViewsState() {
  const [viewsMap, setViewsMap] = useState(() => readLocalViewsCache() || {});
  const [viewsVersion, setViewsVersion] = useState(0);
  const viewsInflightRef = useRef(null);

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
        setViewsVersion((v) => v + 1);
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

  const recordPaperView = useCallback((fileObj, options = {}) => {
    if (!fileObj || fileObj.isPendingSkeleton || fileObj.isNotFound) return;
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
              setViewsVersion((v) => v + 1);
              updateSinglePaperInLocalViewsCache(vKey, latestCount);
            }
          })
          .catch(() => {
            // Do not fake increment if database request fails
          });
      }
    }
  }, []);

  return { viewsMap, viewsVersion, recordPaperView };
}
