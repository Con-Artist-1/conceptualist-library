import { REDIRECT_MAP } from './_redirects.js';

const SITE_ORIGIN = 'https://www.conceptualist.uk';

const BOOK_TYPE_DESTINATIONS = {
  '/': '/textbooks',
  '/cambridge': '/textbooks/cambridge',
  '/ial': '/textbooks/ial',
  '/igcse': '/textbooks/igcse',
  '/cambridge/a-level': '/textbooks/cambridge/a-level',
  '/cambridge/igcse': '/textbooks/cambridge/igcse',
  '/cambridge/o-level': '/textbooks/cambridge/o-level'
};

function sanitizePathname(rawPath) {
  let clean = String(rawPath || '')
    .split('\r').join('')
    .split('\n').join('')
    .split('\0').join('')
    .replace(/\\/g, '/')
    .trim();
  if (!clean.startsWith('/')) clean = `/${clean}`;
  clean = clean.replace(/\/{2,}/g, '/');
  if (clean.length > 1) clean = clean.replace(/\/+$/, '');
  if (!clean || clean.startsWith('/api/')) return '/';
  return clean;
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  const reqUrl = new URL(req.url || '/', SITE_ORIGIN);
  const rawPath = req.query?.__pathname ?? reqUrl.searchParams.get('__pathname') ?? reqUrl.pathname;
  let destPath = sanitizePathname(rawPath);
  if (destPath !== '/') destPath = destPath.toLowerCase();
  for (let hop = 0; hop < 3 && REDIRECT_MAP[destPath]; hop++) {
    destPath = REDIRECT_MAP[destPath];
  }

  const q = String(req.query?.q ?? reqUrl.searchParams.get('q') ?? '').trim();
  if (q) {
    res.statusCode = 308;
    res.setHeader('Location', `${SITE_ORIGIN}${destPath}?q=${encodeURIComponent(q)}`);
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.end();
    return;
  }

  const paper = String(req.query?.paper ?? reqUrl.searchParams.get('paper') ?? '').trim();
  const view = String(req.query?.view ?? reqUrl.searchParams.get('view') ?? '').trim();
  const type = String(req.query?.type ?? reqUrl.searchParams.get('type') ?? '').trim();

  if (!paper) {
    if (type === 'Book' && BOOK_TYPE_DESTINATIONS[destPath]) {
      destPath = BOOK_TYPE_DESTINATIONS[destPath];
    } else if (destPath === '/' && type === 'DF') {
      destPath = '/data-files';
    } else if (destPath === '/' && type === 'AUD') {
      destPath = '/audio';
    }
  }

  let hashStr = '';
  if (paper) {
    const hashParams = new URLSearchParams();
    hashParams.set('paper', paper);
    if (view) hashParams.set('view', view);
    hashStr = `#${hashParams.toString()}`;
  }

  res.statusCode = 308;
  res.setHeader('Location', `${SITE_ORIGIN}${destPath}${hashStr}`);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  res.end();
}
