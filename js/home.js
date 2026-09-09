import { getRounds, getCourses, getFacilities, getLoops } from "./db.js";
import { playedHoleCount, holeStats } from "./stats.js";
import { daysSinceLastBackup, getLastBackupAt, STALE_DAYS } from "./backup.js";

// 10-2: 最終バックアップ以降に保存された(=完了した)ラウンド数が一定を超えたら強調表示にする
const UNBACKED_STRONG_THRESHOLD = 3;

(async function () {
  const $ = (id) => document.getElementById(id);

  const [rounds, courses, facilities, loops] = await Promise.all([getRounds(), getCourses(), getFacilities(), getLoops()]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const facilityById = new Map(facilities.map((f) => [f.id, f]));
  const loopById = new Map(loops.map((l) => [l.id, l]));
  // バッチ13/14でFacility/Loopモデルに移行後、review.htmlでのコース付け替えなどにより
  // 旧courseIdが無い(またはcourseIdが指す旧Courseが実体と一致しない)ラウンドが
  // 「コース不明」になっていた不具合の修正。review.jsのfacilityHeaderText()と同じ
  // 優先順位(facility+frontLoop+backLoopが引ければそちらを優先)で表示する。
  const courseName = (r) => {
    const facility = facilityById.get(r.facilityId);
    const frontLoop = loopById.get(r.frontLoopId);
    const backLoop = loopById.get(r.backLoopId);
    if (facility && frontLoop && backLoop) {
      return frontLoop.id === backLoop.id ? `${facility.name} ${frontLoop.name}` : `${facility.name} ${frontLoop.name}→${backLoop.name}`;
    }
    const course = courseById.get(r.courseId);
    if (course) return course.name;
    return "コース不明";
  };

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
          <div class="course">${courseName(r)}</div>
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
