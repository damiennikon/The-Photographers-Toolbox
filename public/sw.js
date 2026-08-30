// Cache-first service worker for the shell's OWN static assets only.
// Each embedded tool (iframe) has its own service worker / caching strategy —
// this worker never touches cross-origin requests, so that's left alone
// deliberately (deferred, per Stage 1 scope).

// Bumped from v1 to v2 for the new logo — this is a cache-first worker, so
// without a version bump existing installs would keep serving the old
// aperture-mark icons from cache indefinitely rather than picking up the
// new ones. activate() below deletes any cache key that isn't this one.
const CACHE_VERSION = "pt-shell-v2";
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

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests for this shell — never intercept
  // cross-origin iframe traffic belonging to the embedded tools.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
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
