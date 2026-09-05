// オフライン完全動作のためのcache-first Service Worker。
// バージョン文字列を上げるとinstall時に再キャッシュ、activate時に旧キャッシュを破棄する。
const CACHE_VERSION = "golf-log-v5";
const PRECACHE_URLS = [
  "./",
  "index.html",
  "hole.html",
  "round-start.html",
  "review.html",
  "dashboard.html",
  "settings.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/db.js",
  "js/clubs.js",
  "js/stats.js",
  "js/presetCourses.js",
  "js/backup.js",
  "js/sw-register.js",
  "js/home.js",
  "js/roundStart.js",
  "js/holeInput.js",
  "js/review.js",
  "js/dashboard.js",
  "js/settings.js",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
