// DOM-free resilient fetch and Cache API helpers shared between main thread and Web Worker.

const INDEX_CACHE_NAME = 'cs_index_cache';

export function buildIndexCachePrefix(appVersion, buildTimestamp) {
  return `https://cs-cache.local/index_${appVersion}_${encodeURIComponent(buildTimestamp)}_`;
}

export function buildIndexCacheUrl(appVersion, buildTimestamp, boardKey = 'edexcel') {
  const safeBoard = String(boardKey || 'edexcel').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${buildIndexCachePrefix(appVersion, buildTimestamp)}${safeBoard}.json`;
}

export async function resilientFetch(urls, options = {}, timeoutMs = 45000) {
  let lastErr = null;
  const externalSignal = options?.signal || null;
  for (const url of urls) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      lastErr = err;
    }
  }
  throw lastErr || new Error('All fetch candidates failed');
}

export async function readCachedIndex(cacheUrl) {
  if (typeof caches === 'undefined' || !cacheUrl) return null;
  try {
    const cache = await caches.open(INDEX_CACHE_NAME);
    const match = await cache.match(cacheUrl);
    if (match) return await match.json();
  } catch {
    // Ignore cache read failures
  }
  return null;
}

export async function writeCachedIndex(cacheUrl, response) {
  if (typeof caches === 'undefined' || !cacheUrl || !response) return;
  try {
    const cache = await caches.open(INDEX_CACHE_NAME);
    // Preserve sibling board caches belonging to the exact same build version/timestamp
    const lastUnderscore = cacheUrl.lastIndexOf('_');
    const sameBuildPrefix = lastUnderscore > 0 ? cacheUrl.slice(0, lastUnderscore + 1) : '';
    const keys = await cache.keys();
    for (const req of keys) {
      if (req.url === cacheUrl) continue;
      if (!sameBuildPrefix || !req.url.startsWith(sameBuildPrefix)) {
        await cache.delete(req);
      }
    }
    await cache.put(cacheUrl, response);
  } catch {
    // Ignore cache write failures
  }
}
