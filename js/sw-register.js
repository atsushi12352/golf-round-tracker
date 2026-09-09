if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
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
