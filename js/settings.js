import { getSettings, saveSettings } from "./db.js";
import { CLUB_MASTER } from "./clubs.js";
import { exportBackup, importBackupFile, getLastBackupAt, daysSinceLastBackup, STALE_DAYS } from "./backup.js";

(async function () {
  const $ = (id) => document.getElementById(id);
  const settings = await getSettings();

  const grid = $("clubToggleGrid");
  function renderClubs() {
    grid.innerHTML = "";
    CLUB_MASTER.forEach((c) => {
      const b = document.createElement("button");
      const isPt = c === "PT";
      const on = isPt || settings.clubs.includes(c);
      b.className = "club-toggle" + (on ? " on" : "");
      b.textContent = c;
      if (isPt) b.disabled = true;
      b.addEventListener("click", async () => {
        const idx = settings.clubs.indexOf(c);
        if (idx >= 0) settings.clubs.splice(idx, 1);
        else settings.clubs.push(c);
        // マスター順を保つ
        settings.clubs = CLUB_MASTER.filter((m) => settings.clubs.includes(m));
        await saveSettings(settings);
        renderClubs();
      });
      grid.appendChild(b);
    });
  }
  renderClubs();

  function renderBackupStatus() {
    const last = getLastBackupAt();
    const days = daysSinceLastBackup();
    const stale = days >= STALE_DAYS;
    const el = $("backupStatus");
    el.className = "backup-status" + (stale ? " stale" : "");
    el.textContent = last
      ? `最終バックアップ: ${last.toLocaleString("ja-JP")}${stale ? `(${Math.floor(days)}日経過・そろそろバックアップを)` : ""}`
      : "まだバックアップがありません。";
  }
  renderBackupStatus();

  $("exportBtn").addEventListener("click", async () => {
    await exportBackup();
    renderBackupStatus();
  });

  $("importBtn").addEventListener("click", () => $("importFile").click());

  let pendingFile = null;
  $("importFile").addEventListener("change", (e) => {
    pendingFile = e.target.files[0] || null;
    if (pendingFile) $("importConfirmOverlay").classList.add("show");
  });
  $("importConfirmNo").addEventListener("click", () => {
    $("importConfirmOverlay").classList.remove("show");
    $("importFile").value = "";
    pendingFile = null;
  });
  $("importConfirmYes").addEventListener("click", async () => {
    if (!pendingFile) return;
    try {
      await importBackupFile(pendingFile);
      $("importConfirmOverlay").classList.remove("show");
      $("backupStatus").textContent = "インポートが完了しました。ホームに戻ります…";
      setTimeout(() => { location.href = "index.html"; }, 900);
    } catch (err) {
      $("importConfirmOverlay").classList.remove("show");
      alert("インポートに失敗しました: " + err.message);
    }
  });
})();
