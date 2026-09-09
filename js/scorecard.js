import { getRound, getCourse } from "./db.js";
import { playedHoleCount } from "./stats.js";
import { scorecardBodyHTML, scorecardTotalRowHTML, scorecardLegendHTML } from "./scorecardView.js";

function formatDateJP(iso) {
  const d = new Date(iso + "T00:00:00");
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}(${w})`;
}

(async function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const roundId = params.get("round");
  if (!roundId) { location.href = "index.html"; return; }
  const round = await getRound(roundId);
  if (!round) { location.href = "index.html"; return; }
  const course = round.courseId ? await getCourse(round.courseId) : null;

  $("headerDate").textContent = formatDateJP(round.date);
  $("headerCourse").textContent = `${course ? course.name : "コース不明"}・${round.tee}ティー`;

  const { html, sc } = scorecardBodyHTML(round);
  $("scorecardBody").innerHTML = html;
  $("scorecardTotalRow").innerHTML = scorecardTotalRowHTML(sc);
  $("scorecardLegend").innerHTML = scorecardLegendHTML();

  $("heroScore").textContent = sc.totalScore == null ? "-" : sc.totalScore;
  $("heroToPar").textContent = sc.toPar == null ? "" : (sc.toPar >= 0 ? "+" + sc.toPar : sc.toPar);
  const played = playedHoleCount(round);
  const progress = played >= 18 ? "18ホール終了" : played > 0 ? `${played}ホール終了時点` : "未プレー";
  const c = document.createElement("span");
  c.className = "hero-chip";
  c.textContent = progress;
  $("heroChips").appendChild(c);

  $("backBtn").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = round.complete ? `review.html?round=${roundId}` : "index.html";
  });
})();
