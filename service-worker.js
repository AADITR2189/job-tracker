/* ════════════════════════════════════════════════════════════════════
   Job Tracker — Service Worker
   ────────────────────────────────────────────────────────────────────
   Strategy
   • App shell (HTML/CSS/JS/icons) is pre-cached per version and served
     cache-first, so the app opens instantly and fully offline.
   • A new version installs in the background and WAITS; the page shows
     an "Update now" banner. Nothing reloads without the user's consent.
   • Google Fonts and the ExcelJS library (CDN) are cached at runtime.
   • Job data lives in localStorage (never in these caches), so clearing
     or replacing caches can never touch user data.

   ⚠ When you deploy changes, bump CACHE_VERSION below so devices
     download the new files.
   ════════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'v2.3.0';
const SHELL_CACHE = `jt-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = 'jt-runtime-v1';

const SHELL_ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'components/data-compat.js',
  'components/theme.js',
  'components/ui.js',
  'components/empty-state.js',
  'components/pwa.js',
  'components/sync.js',
  'components/motion.js',
  'sync-config.js',
  'manifest.json',
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png'
];

// Fetched opportunistically at install (failures are ignored)
const OPTIONAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // cache:'reload' bypasses the HTTP cache so a new version gets fresh files
    await cache.addAll(SHELL_ASSETS.map(u => new Request(u, { cache: 'reload' })));
    const rt = await caches.open(RUNTIME_CACHE);
    await Promise.all(OPTIONAL_ASSETS.map(async u => {
      try {
        if(await rt.match(u)) return;
        const res = await fetch(u, { mode: 'cors', credentials: 'omit' });
        if(res.ok) await rt.put(u, res);
      } catch(e) { /* offline during install: fine */ }
    }));
    // Upgrading from the v1 worker (sw.js): take over straight away.
    const active = self.registration.active;
    if(!active || /\/sw\.js$/.test(active.scriptURL)) await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, RUNTIME_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n)));
    if(self.registration.navigationPreload) { try { await self.registration.navigationPreload.disable(); } catch(e) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const msg = event.data || {};
  if(msg.type === 'SKIP_WAITING') self.skipWaiting();
  if(msg.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage(CACHE_VERSION);
});

// Periodic Background Sync (Chromium, installed apps): check for a newer version.
self.addEventListener('periodicsync', event => {
  if(event.tag === 'jt-update-check') event.waitUntil(self.registration.update());
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
  if(cached) return cached;
  const res = await fetch(request);
  if(res && (res.ok || res.type === 'opaque')) {
    const cache = await caches.open(cacheName);
    cache.put(request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if(res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page navigations → cached app shell (works offline, ignores ?query)
  if(req.mode === 'navigate' && url.origin === self.location.origin) {
    const scopePath = new URL(self.registration.scope).pathname;
    const rel = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : null;
    if(rel === '' || rel === 'index.html') {
      event.respondWith((async () => {
        const shell = await caches.open(SHELL_CACHE);
        const cached = (await shell.match('index.html')) || (await shell.match('./'));
        if(cached) return cached;
        try { return await fetch(req); } catch(e) { return Response.error(); }
      })());
    } else {
      // Other pages (e.g. legacy/index-v1.html): network first, cache fallback
      event.respondWith(fetch(req).then(res => {
        if(res.ok) { const copy = res.clone(); caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req)));
    }
    return;
  }

  // Same-origin static files → cache-first
  if(url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, SHELL_CACHE).catch(() => caches.match(req)));
    return;
  }

  // Google Fonts stylesheet → stale-while-revalidate; font files → cache-first
  if(url.hostname === 'fonts.googleapis.com') { event.respondWith(staleWhileRevalidate(req)); return; }
  if(url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdn.jsdelivr.net' || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }
});
