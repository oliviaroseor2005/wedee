/* =========================================================
   sw.js — StreamHub service worker
   Cache-first for static assets (fast repeat loads), stale-while-
   revalidate for the JSON video/author pools (fresh data without
   blocking on the network every time).
   ========================================================= */

const STATIC_CACHE = "streamhub-static-v1";
const DATA_CACHE = "streamhub-data-v1";

const STATIC_ASSETS = [
  "/", "/index.html", "/style.css", "/config.js", "/script.js", "/countries.js",
  "/account.html", "/account.js", "/firebase-config.js", "/auth.js",
  "/v/watch.html", "/v/watch.js",
  "/models/profile.html", "/models/profile.js",
  "/placeholder.webp", "/placeholder-avatar.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((err) => console.warn("[sw] precache skipped some assets:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isJsonDataRequest(url) {
  return url.pathname.endsWith(".json");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // Stale-while-revalidate for content*.json / authors.json — serve the
  // cached copy instantly, then quietly refresh the cache in the
  // background for next time. Falls back to network if nothing cached.
  if (isJsonDataRequest(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkFetch = fetch(event.request)
          .then((res) => { if (res.ok) cache.put(event.request, res.clone()); return res; })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Cache-first for same-origin static assets.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});