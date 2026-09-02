import { getRounds, getCourses, deleteRound } from "./db.js";
import { playedHoleCount, holeStats } from "./stats.js";
import { daysSinceLastBackup, STALE_DAYS } from "./backup.js";

(async function () {
  const $ = (id) => document.getElementById(id);

  const staleDays = daysSinceLastBackup();
  if (staleDays >= STALE_DAYS) {
    const label = staleDays === Infinity ? "まだバックアップがありません" : `最終バックアップから${Math.floor(staleDays)}日経過`;
    $("warnBanner").innerHTML = `<div class="warn-banner">⚠ ${label}。設定画面からバックアップをおすすめします。</div>`;
  }

  const list = $("roundList");
  let pendingDelete = null;

  async function renderList() {
    const [rounds, courses] = await Promise.all([getRounds(), getCourses()]);
    const courseName = (id) => (courses.find((c) => c.id === id) || {}).name || "コース不明";

    if (rounds.length === 0) {
      list.innerHTML = '<div class="empty-state">まだラウンド記録がありません。「ラウンド開始」から始めましょう。</div>';
      return;
    }
    list.innerHTML = "";
    rounds.forEach((r) => {
      const played = playedHoleCount(r);
      const parTotal = r.holes.slice(0, played).reduce((a, h) => a + h.par, 0);
      let score = 0;
      r.holes.slice(0, played).forEach((h) => {
        score += holeStats(h).score;
      });
      const toPar = score - parTotal;
      const name = courseName(r.courseId);

      const card = document.createElement("div");
      card.className = "round-card";

      const a = document.createElement("a");
      a.className = "rc-link";
      a.href = r.complete ? `review.html?round=${r.id}` : `hole.html?round=${r.id}&hole=${played + 1}`;
      a.innerHTML = `
        <div class="rc-main">
          <div class="date">${r.date} ・ ${r.tee}ティー</div>
          <div class="course">${name}</div>
          ${r.complete ? "" : `<div class="status">途中(${played}/18)・タップして再開</div>`}
        </div>
        <div class="rc-score">
          <div class="v">${played ? score : "-"}</div>
          <div class="topar">${played ? (toPar >= 0 ? "+" + toPar : toPar) : ""}</div>
        </div>`;
      card.appendChild(a);

      const delBtn = document.createElement("button");
      delBtn.className = "rc-delete";
      delBtn.type = "button";
      delBtn.setAttribute("aria-label", "削除");
      delBtn.textContent = "🗑";
      delBtn.addEventListener("click", () => {
        pendingDelete = { id: r.id, date: r.date, course: name, score: played ? score : null };
        const scoreText = pendingDelete.score !== null ? `スコア${pendingDelete.score}` : "未完了";
        $("deleteConfirmText").textContent = `${r.date} ${name}(${scoreText})を削除しますか?`;
        $("deleteConfirmOverlay").classList.add("show");
      });
      card.appendChild(delBtn);

      list.appendChild(card);
    });
  }
  await renderList();

  $("deleteConfirmNo").addEventListener("click", () => {
    pendingDelete = null;
    $("deleteConfirmOverlay").classList.remove("show");
  });
  $("deleteConfirmYes").addEventListener("click", async () => {
    if (!pendingDelete) return;
    await deleteRound(pendingDelete.id);
    pendingDelete = null;
    $("deleteConfirmOverlay").classList.remove("show");
    await renderList();
  });

  $("startRoundBtn").addEventListener("click", () => { location.href = "round-start.html"; });
})();
