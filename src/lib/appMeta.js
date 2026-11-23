/* global __APP_BUILD_TIME__ */

export const BUILD_TIMESTAMP =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '2026-11-22T00:00:00.000Z';

export const APP_VERSION = 'v7.3';
export const META_CACHE_KEY = `cs_library_meta_${APP_VERSION}_${BUILD_TIMESTAMP}`;
export const DAILY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_RELOAD_COOLDOWN_MS = 10 * 60 * 1000;

export function formatUpdateTimestamp(isoStr) {
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

// Global utility to purge all cached index/chunk entries while preserving theme, study history & viewer ID
export function forcePurgeCacheAndReload() {
  try {
    const preserveKeys = ['cs_theme', 'cs_recent_papers_v1', 'cs_viewer_id_v1'];
    const preserved = {};
    preserveKeys.forEach((k) => {
      const val = localStorage.getItem(k);
      if (val !== null) preserved[k] = val;
    });
    localStorage.clear();
    Object.entries(preserved).forEach(([k, val]) => {
      localStorage.setItem(k, val);
    });
    sessionStorage.clear();
    sessionStorage.setItem('cs_auto_healed', '1');
  } catch {
    // Ignore storage errors
  }
  const tasks = [];
  if (typeof window !== 'undefined' && 'caches' in window) {
    tasks.push(
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {})
    );
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister()))).catch(() => {})
    );
  }
  Promise.all(tasks).finally(() => {
    window.location.replace(`/?reset=${Date.now()}`);
  });
}

// Gentle cache-clearing reload that keeps the user's current route, theme, history & viewer ID intact
export function softReloadKeepingUrl() {
  try {
    const lastReload = Number(sessionStorage.getItem('cs_auto_reload_at') || 0);
    if (lastReload && Date.now() - lastReload < AUTO_RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem('cs_auto_reload_at', String(Date.now()));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('cs_library_meta_')) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // Ignore storage errors
  }
  const tasks = [];
  if (typeof window !== 'undefined' && 'caches' in window) {
    tasks.push(caches.delete('cs_index_cache').catch(() => {}));
  }
  Promise.all(tasks).finally(() => {
    window.location.reload();
  });
}
