// Service worker for the shell's OWN static assets only. Each embedded tool
// (iframe) has its own service worker / caching strategy — this worker
// never touches cross-origin requests, so that's left alone deliberately
// (deferred, per Stage 1 scope).
//
// Cache-first everywhere, except the app shell document (SHELL_SCOPE, i.e.
// index.html): that one is network-first, so a deployed fix reaches a
// returning visitor on their very next load instead of only after someone
// remembers to bump CACHE_VERSION. Every other same-origin asset (manifest,
// icons, and any other file this worker opportunistically caches at
// runtime) keeps the original cache-first behaviour — those are either
// content-hashed build output (safe to treat as immutable) or small,
// rarely-changing static files, and this PR doesn't change how they're
// served.
//
// Bumped from v2 to v3 to ship this fix itself: existing installs are
// currently frozen cache-first on whatever index.html they first loaded, so
// without a version bump here too, they'd never see this worker at all.
// activate() below deletes any cache key that isn't this one.
const CACHE_VERSION = "pt-shell-v3";
const SHELL_SCOPE = self.registration.scope;

const SHELL_ASSETS = [
  `${SHELL_SCOPE}`,
  `${SHELL_SCOPE}manifest.json`,
  `${SHELL_SCOPE}icons/icon-16.png`,
  `${SHELL_SCOPE}icons/icon-32.png`,
  `${SHELL_SCOPE}icons/icon-180.png`,
  `${SHELL_SCOPE}icons/icon-192.png`,
  `${SHELL_SCOPE}icons/icon-512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// The app shell document: a top-level navigation, or a direct request for
// the scope root itself (what SHELL_ASSETS precaches as "index.html").
// Hash-based routing means in-app navigation never re-requests this — only
// a fresh load, reload, or deep link does — so this only ever gates the
// document that decides which JS/CSS bundle the visitor gets.
function isShellDocument(request) {
  return request.mode === "navigate" || request.url === SHELL_SCOPE;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests for this shell — never intercept
  // cross-origin iframe traffic belonging to the embedded tools.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (isShellDocument(request)) {
    // Network-first: always try for the freshest shell so a deploy
    // propagates immediately. Cache the fresh copy for the next offline
    // load, and only fall back to whatever's cached if the network fails.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(SHELL_SCOPE, clone));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_SCOPE))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
