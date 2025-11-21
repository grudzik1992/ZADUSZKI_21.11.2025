// Keep cache name in sync with CURRENT_DEFAULTS_VERSION in storage.js
// Bump this value to force clients to download fresh assets and clear old caches.
const CACHE_NAME = "spiewnik-cache-2025-11-21-v1";
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
  "./data/dane.json",
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
    // Delete all caches to ensure no stale assets remain, then recreate the
    // active cache. This forces clients to receive the newest files during
    // development and after we update `dane.json` or other defaults.
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  // Take control of uncontrolled clients immediately
  self.clients.claim();
  console.log("♻️ Service Worker: Wszystkie cache usunięte i worker aktywowany.");
});
