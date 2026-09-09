// オフライン完全動作のためのcache-first Service Worker。
// バージョン文字列を上げるとinstall時に再キャッシュ、activate時に旧キャッシュを破棄する。
//
// 【注意】html/css/jsのいずれかを変更・追加したら CACHE_VERSION を必ず連番で上げること。
// 新規ファイルを追加したときは、下の PRECACHE_URLS にも忘れず追記すること
// (js/ css/ 配下の実ファイル一覧と定期的に突き合わせて漏れがないか確認する)。
const CACHE_VERSION = "golf-log-v12";
const PRECACHE_URLS = [
  "./",
  "index.html",
  "hole.html",
  "round-start.html",
  "review.html",
  "dashboard.html",
  "settings.html",
  "scorecard.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/db.js",
  "js/clubs.js",
  "js/stats.js",
  "js/presetCourses.js",
  "js/backup.js",
  "js/sw-register.js",
  "js/scorecardView.js",
  "js/facilityForm.js",
  "js/home.js",
  "js/roundStart.js",
  "js/holeInput.js",
  "js/review.js",
  "js/dashboard.js",
  "js/settings.js",
  "js/scorecard.js",
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
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 自サイト以外は素通し

  // ページ遷移(navigate)は必ずキャッシュで応答できるようにする。
  // アプリは hole.html?round=...&hole=3 のようにクエリ付きで遷移するため、
  // ignoreSearch を付けないとキャッシュにヒットせずオフラインで失敗する。
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then((cached) => cached || fetch(req))
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }));
    })
  );
});
