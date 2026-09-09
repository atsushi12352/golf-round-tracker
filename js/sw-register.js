if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").then((reg) => {
      // ブラウザ標準の更新チェックは間隔が長く(特にホーム画面追加のPWAで顕著)、
      // 新しいバージョンをデプロイしても古いタブ・古いホーム画面アプリがずっと
      // 気づかないことがある。読み込みのたびに明示的に更新チェックさせる。
      reg.update().catch(() => {});
    }).catch(() => {});

    // 新しいService Workerが有効化された(=更新が適用された)ら、次のfetchから
    // 新しいコードで動くよう自動で1回だけ再読み込みする(skipWaiting/clients.claim
    // と対になる仕組み。多重リロードを防ぐためrefreshingフラグでガードする)。
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  });
}

// オフライン状態の可視化(バッチ11)。
// ネットワークが無い間、画面最上部に控えめな帯を表示する(記録自体はIndexedDBのみで
// 完結しネットワーク不要なので、これは不安を減らすための表示のみ)。
function renderOfflineBanner() {
  const existing = document.getElementById("offlineBanner");
  if (!navigator.onLine) {
    if (!existing) {
      const el = document.createElement("div");
      el.id = "offlineBanner";
      el.className = "offline-banner";
      el.textContent = "オフライン(記録は端末に保存されます)";
      document.body.prepend(el);
    }
  } else if (existing) {
    existing.remove();
  }
}
window.addEventListener("online", renderOfflineBanner);
window.addEventListener("offline", renderOfflineBanner);
renderOfflineBanner();
