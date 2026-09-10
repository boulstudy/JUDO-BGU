// Service worker for the coach app.
//
// Scope: keeps the app usable in a hall with bad or no reception, once it has
// been opened at least once with good reception. It does NOT try to precache
// every hashed Next.js chunk by build-time manifest (that needs a build step
// and a lot of moving parts to keep in sync); instead it caches at runtime,
// which is simpler and covers the actual requirement — a coach who already
// opened the app tonight can keep using it if the network drops mid-session.
//
// Strategy by request kind:
//   navigations (HTML)      → network-first, falling back to the last cached
//                              shell so a reload while offline still works
//   /_next/static/*, icons  → cache-first (content-hashed, safe forever)
//   Supabase REST (GET)     → network-first, cache fallback (stale data beats
//                              no data); writes (POST/PATCH/DELETE) are never
//                              cached and never intercepted — see writeQueue.js
//                              in the page for what happens when they fail
//   everything else         → pass through untouched
//
// Never touches WebSocket traffic — the Fetch API (and so a service worker's
// fetch handler) never sees it; that's the platform, not a rule enforced here.

const VERSION = 'v2-2026-09-10';
const SHELL_CACHE = 'shell-' + VERSION;
const STATIC_CACHE = 'static-' + VERSION;
const REST_CACHE = 'rest-' + VERSION;

const SHELL_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll(SHELL_URLS))
      .catch(() => {})   // offline install (rare) shouldn't hard-fail activation
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, STATIC_CACHE, REST_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// /sw-kill posts this to force an immediate takeover without waiting for the
// next navigation, so the emergency path doesn't itself depend on a reload
// happening to line up with the new worker's activation.
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

const isNextStatic = url => url.pathname.startsWith('/_next/static/');
const isIcon       = url => /^\/(icon-|apple-touch-icon|manifest|.*-manifest)/.test(url.pathname);
const isSupaRest    = url => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/');

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;   // writes: straight through, never cached

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/')) || Response.error();
      })
    );
    return;
  }

  if (url.origin === self.location.origin && (isNextStatic(url) || isIcon(url))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isSupaRest(url)) {
    event.respondWith(networkFirst(request, REST_CACHE));
    return;
  }

  // everything else (fonts from Google, the realtime websocket's initial
  // handshake if it ever appeared here, anything unrecognized): don't touch it
});
