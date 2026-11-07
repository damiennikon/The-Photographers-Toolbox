const CACHE = "pt-shell-__BUILD_VERSION__";
const SCOPE = self.registration.scope;
const INDEX = new URL("index.html", SCOPE);
const ROOT_PATH = new URL(SCOPE).pathname;
const ASSETS = new Set(__BUILD_ASSETS__.map((path) => new URL(path, SCOPE).href));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...ASSETS].map((url) => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("pt-shell-") && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(SCOPE)) return;
  const path = new URL(request.url).pathname;
  if (request.mode === "navigate" && (path === ROOT_PATH || path === INDEX.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
      } catch {
        // The matching precached shell and bundles are available offline.
      }
      return (await caches.open(CACHE)).match(INDEX.href);
    })());
  } else if (ASSETS.has(request.url)) {
    // Precached files are the same bytes for every request. A module script
    // can send an Origin header that was absent during precaching.
    event.respondWith((async () => (await (await caches.open(CACHE)).match(request.url, { ignoreVary: true })) || fetch(request))());
  }
});
