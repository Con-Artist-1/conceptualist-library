// DOM-free resilient fetch and Cache API helpers shared between main thread and Web Worker.

const INDEX_CACHE_NAME = 'cs_index_cache';

export function buildIndexCacheUrl(appVersion, buildTimestamp) {
  return `https://cs-cache.local/index_${appVersion}_${encodeURIComponent(buildTimestamp)}.json`;
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
    const keys = await cache.keys();
    for (const req of keys) {
      if (req.url !== cacheUrl) {
        await cache.delete(req);
      }
    }
    await cache.put(cacheUrl, response);
  } catch {
    // Ignore cache write failures
  }
}
