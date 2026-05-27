/* ==========================================================================
   DOCTORAJ SERVICE WORKER
   Caches core assets for offline play and fast repeat loads.
   Strategy:
     - App Shell (HTML, CSS, JS): Cache-first, update in background
     - API calls (Cloudflare Functions): Network-first, no caching
     - Google Fonts: Stale-while-revalidate
   ========================================================================== */

const CACHE_NAME = 'doctoraj-v1';
const STATIC_CACHE_NAME = 'doctoraj-static-v1';
const FONT_CACHE_NAME = 'doctoraj-fonts-v1';

// Core app shell assets to pre-cache on install
const APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'gtdx.js',
  'manifest.json'
];

// ── Install: Pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting()) // Activate immediately
  );
});

// ── Activate: Clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const validCaches = [CACHE_NAME, STATIC_CACHE_NAME, FONT_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !validCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim()) // Take control of all pages
  );
});

// ── Fetch: Route-based caching strategies ───────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API / Cloudflare Function calls — always network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/')) {
    return; // Fall through to network naturally
  }

  // Google Fonts: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE_NAME));
    return;
  }

  // App shell (HTML, CSS, JS, manifest): Cache-first, update in background
  if (
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE_NAME));
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(networkWithCacheFallback(request, CACHE_NAME));
});

// ── Caching Strategies ───────────────────────────────────────────────────────

/**
 * Cache-first: Return cached version immediately; update cache in background.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Update in background (don't await)
    fetch(request).then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline - content not available', { status: 503 });
  }
}

/**
 * Stale-while-revalidate: Serve cached immediately, refresh cache in background.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request).then((response) => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  return cached || networkFetch;
}

/**
 * Network-first with cache fallback for offline.
 */
async function networkWithCacheFallback(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
