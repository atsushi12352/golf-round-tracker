import { getRounds, getCourses } from "./db.js";
import { playedHoleCount, holeStats } from "./stats.js";
import { daysSinceLastBackup, getLastBackupAt, STALE_DAYS } from "./backup.js";

// 10-2: 最終バックアップ以降に保存された(=完了した)ラウンド数が一定を超えたら強調表示にする
const UNBACKED_STRONG_THRESHOLD = 3;

(async function () {
  const $ = (id) => document.getElementById(id);

  const [rounds, courses] = await Promise.all([getRounds(), getCourses()]);
  const courseName = (id) => (courses.find((c) => c.id === id) || {}).name || "コース不明";

  const staleDays = daysSinceLastBackup();
  const lastBackupAt = getLastBackupAt();
  const unbackedCount = rounds.filter((r) => {
    if (!r.complete) return false;
    if (!lastBackupAt) return true;
    return new Date(r.date + "T00:00:00").getTime() > lastBackupAt.getTime();
  }).length;

  if (unbackedCount >= UNBACKED_STRONG_THRESHOLD) {
    $("warnBanner").innerHTML = `<div class="warn-banner strong">⚠ 前回のバックアップから${unbackedCount}ラウンドたまっています。今すぐバックアップしてください。</div>`;
  } else if (staleDays >= STALE_DAYS) {
    const label = staleDays === Infinity ? "まだバックアップがありません" : `最終バックアップから${Math.floor(staleDays)}日経過`;
    $("warnBanner").innerHTML = `<div class="warn-banner">⚠ ${label}。設定画面からバックアップをおすすめします。</div>`;
  }

  const list = $("roundList");
  if (rounds.length === 0) {
    list.innerHTML = '<div class="empty-state">まだラウンド記録がありません。「ラウンド開始」から始めましょう。</div>';
  } else {
    list.innerHTML = "";
    rounds.forEach((r) => {
      const played = playedHoleCount(r);
      const parTotal = r.holes.slice(0, played).reduce((a, h) => a + h.par, 0);
      let score = 0;
      r.holes.slice(0, played).forEach((h) => {
        score += holeStats(h).score;
      });
      const toPar = score - parTotal;

      const a = document.createElement("a");
      a.className = "round-card";
      a.href = r.complete ? `review.html?round=${r.id}` : `hole.html?round=${r.id}&hole=${played + 1}`;
      a.innerHTML = `
        <div class="rc-main">
          <div class="date">${r.date} ・ ${r.tee}ティー</div>
          <div class="course">${courseName(r.courseId)}</div>
          ${r.complete ? "" : `<div class="status">途中(${played}/18)・タップして再開</div>`}
        </div>
        <div class="rc-score">
          <div class="v">${played ? score : "-"}</div>
          <div class="topar">${played ? (toPar >= 0 ? "+" + toPar : toPar) : ""}</div>
        </div>`;
      list.appendChild(a);
    });
  }

  $("startRoundBtn").addEventListener("click", () => { location.href = "round-start.html"; });
})();
