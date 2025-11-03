// Keep cache name in sync with CURRENT_DEFAULTS_VERSION in storage.js
const CACHE_NAME = "spiewnik-cache-2025-11-03-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/main.css",
  "./js/app.js",
  "./js/serviceWorkerGuard.js",
  "./js/modules/dom.js",
  "./js/modules/dragDrop.js",
  "./js/modules/profile.js",
  "./js/modules/songs.js",
  "./js/modules/storage.js",
  "./js/modules/theme.js",
  "./js/modules/transpose.js",
  "./data/chords.json",
  "./data/lyrics.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./img/komputer.png",
  "./img/tablet.png",
  "./service-worker.js"
];

// Instalacja i cache plików
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
  console.log("📦 Service Worker: Zainstalowano i dodano do cache.");
});

// Obsługa żądań (offline)
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      cached => cached || fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        return response;
      })
    )
  );
});

// Aktualizacja cache
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  console.log("♻️ Service Worker: Zaktualizowano cache.");
});
