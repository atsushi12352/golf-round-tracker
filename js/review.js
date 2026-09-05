import { getRound, getCourse, getCourses, getRounds, getSettings, saveRound, saveCourse, deleteRound } from "./db.js";
import {
  computeReview, buildHeatMatrix, matrixCount, heatmapInsightHTML, RAMP, RAMP_RED, CLUB_GROUPS, activeHoles,
  build13Heat, heat13Total, heatmap13InsightHTML, compareRoundsFor, compareKpiValues
} from "./stats.js";

function formatDateJP(iso) {
  const d = new Date(iso + "T00:00:00");
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}(${w})`;
}

// 9-2: 比較対象の選択状態を保存し、次回開いたときも維持する
const COMPARE_KEY = "golf-log:review-compare";
function loadCompareMode() {
  try {
    const v = localStorage.getItem(COMPARE_KEY);
    return ["recent5", "all", "best", "course", "prev"].includes(v) ? v : "recent5";
  } catch (e) { return "recent5"; }
}
function saveCompareMode(mode) {
  try { localStorage.setItem(COMPARE_KEY, mode); } catch (e) { /* 無視 */ }
}
const COMPARE_LABELS = { recent5: "直近5R平均", all: "全期間平均", best: "ベスト", course: "同コース平均", prev: "前回" };

(async function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const roundId = params.get("round");
  if (!roundId) { location.href = "index.html"; return; }
  const round = await getRound(roundId);
  if (!round) { location.href = "index.html"; return; }

  const [course, settings, allCourses, allRounds] = await Promise.all([getCourse(round.courseId), getSettings(), getCourses(), getRounds()]);
  const rv = computeReview(round, settings.kpis);

  $("headerDate").textContent = formatDateJP(round.date);
  $("courseNameBtn").textContent = course ? course.name : "コース不明";
  $("heroScore").textContent = rv.total;
  $("heroToPar").textContent = (rv.toPar >= 0 ? "+" : "") + rv.toPar + ` (Par${rv.parTotal})`;
  [`パット ${rv.putts}`, `OB ${rv.obTotal}`, `3パット ${rv.threePutts}回`].forEach((t) => {
    const c = document.createElement("span");
    c.className = "hero-chip"; c.textContent = t;
    $("heroChips").appendChild(c);
  });

  /* ---- ロスTOP3 ---- */
  const lossList = $("lossList");
  if (rv.losses.length === 0) {
    lossList.innerHTML = '<div class="loss-empty">大きなスコアロス要因は見つかりませんでした。</div>';
  } else {
    const maxLoss = rv.losses[0].loss;
    rv.losses.forEach((l, i) => {
      const div = document.createElement("div");
      div.className = "loss-item";
      div.innerHTML =
        `<div class="loss-head"><span class="loss-rank">${i + 1}</span>`
        + `<span class="loss-name">${l.name}</span>`
        + `<span class="loss-val">-${l.loss}打</span></div>`
        + `<div class="loss-bar-track"><div class="loss-bar" style="width:${l.loss / maxLoss * 100}%"></div></div>`;
      lossList.appendChild(div);
    });
  }

  /* ---- 9-2: KPI + 比較対象 ---- */
  function renderKpis() {
    const mode = $("compareSelect").value;
    const compareRounds = compareRoundsFor(mode, allRounds, round);
    const compareValues = compareKpiValues(compareRounds, settings.kpis);
    const cmpLabel = COMPARE_LABELS[mode];

    $("kpiGrid").innerHTML = "";
    rv.kpis.forEach((k) => {
      const d = document.createElement("div");
      d.className = "kpi";
      let html = `<div class="v">${k.value}<small>${k.unit}</small></div><div class="k">${k.label}</div>`;
      const cmp = compareValues[k.id];
      if (cmp !== null && cmp !== undefined && k.raw !== null && k.raw !== undefined) {
        const diff = k.raw - cmp;
        const neutral = k.lowerBetter === null || k.lowerBetter === undefined;
        const cls = neutral || Math.abs(diff) < 0.05 ? "flat" : (k.lowerBetter ? diff < 0 : diff > 0) ? "up" : "down";
        const cmpText = k.kind === "diff" ? (cmp >= 0 ? "+" : "") + Math.round(cmp) : (Math.round(cmp * 10) / 10);
        html += `<div class="cmp ${cls}">${cmpLabel} ${cmpText}${k.unit}</div>`;
      }
      d.innerHTML = html;
      $("kpiGrid").appendChild(d);
    });
  }
  $("compareSelect").value = loadCompareMode();
  $("compareSelect").addEventListener("change", () => {
    saveCompareMode($("compareSelect").value);
    renderKpis();
  });
  renderKpis();

  /* ---- ホールタイプ別 ---- */
  const typeLabels = { 3: "ショート", 4: "ミドル", 5: "ロング" };
  rv.typeAverages.forEach((t) => {
    const d = document.createElement("div");
    d.className = "kpi";
    const avgText = t.avg === null ? "-" : (t.avg >= 0 ? "+" : "") + t.avg.toFixed(1);
    d.innerHTML = `<div class="v">${avgText}</div><div class="k">${typeLabels[t.par]}(Par${t.par}) ×${t.n}</div>`;
    $("typeGrid").appendChild(d);
  });

  /* ---- 距離帯別パット ---- */
  const puttRows = $("puttDistRows");
  rv.distancePutts.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.band}</td><td>${r.attempts}</td>`
      + `<td>${r.cupInRate === null ? "-" : r.cupInRate + "%"}</td>`
      + `<td>${r.threePuttRate === null ? "-" : r.threePuttRate + "%"}</td>`;
    puttRows.appendChild(tr);
  });

  /* ---- ヒートマップ ---- */
  function buildHeatmapUI(m, gridEl, nEl, insightEl, centerLabel, noteEl) {
    gridEl.innerHTML = "";
    const n = matrixCount(m);
    let max = 0;
    m.forEach((row) => row.forEach((v) => { if (v > max) max = v; }));
    nEl.textContent = `全${n}球`;
    for (let ri = 0; ri < 3; ri++) {
      for (let ci = 0; ci < 3; ci++) {
        const v = m[ri][ci];
        const pct = n ? Math.round(v / n * 100) : 0;
        const step = max ? Math.round(v / max * (RAMP.length - 1)) : 0;
        const cell = document.createElement("div");
        cell.className = "hm-cell";
        cell.style.background = RAMP[step];
        cell.style.color = step >= 4 ? "#fff" : "#0b0b0b";
        cell.innerHTML = v ? `<span class="pct">${pct}%</span><span class="cnt">${v}球</span>` : '<span class="cnt" style="opacity:.5">-</span>';
        gridEl.appendChild(cell);
      }
    }
    insightEl.innerHTML = heatmapInsightHTML(m, centerLabel);
    if (noteEl) noteEl.textContent = n && n < 10 ? `球数が少ないため参考程度(${n}球)。累積画面で精度が上がります。` : "";
  }

  // 7-2: 13マスヒートマップ(内側9マス=セーフだった球のばらつき、外周4マス=大ミスの方向)
  function build13HeatmapUI(d, gridEl, nEl, insightEl, noteEl) {
    gridEl.innerHTML = "";
    const total = heat13Total(d);
    const bigMiss = d.left + d.right + d.back + d.front;
    nEl.textContent = `全${total}球(うち大ミス${bigMiss}球)`;

    let gridMax = 0;
    d.grid.forEach((row) => row.forEach((v) => { if (v > gridMax) gridMax = v; }));
    const missMax = Math.max(d.left, d.right, d.back, d.front);

    function pct(v) { return total ? Math.round(v / total * 100) : 0; }
    function content(v, label) {
      const lbl = label ? `<span class="lbl">${label}</span>` : "";
      return v ? `${lbl}<span class="pct">${pct(v)}%</span><span class="cnt">${v}球</span>` : `${lbl}<span class="cnt" style="opacity:.5">-</span>`;
    }
    function paint(el, v, max, ramp) {
      const step = max ? Math.round(v / max * (ramp.length - 1)) : 0;
      el.style.background = ramp[step];
      el.style.color = step >= 4 ? "#fff" : "#0b0b0b";
    }

    const left = document.createElement("div");
    left.className = "hm-cell hm-bar-left";
    paint(left, d.left, missMax, RAMP_RED);
    left.innerHTML = content(d.left, "左へ<br>大ミス");
    gridEl.appendChild(left);

    const top = document.createElement("div");
    top.className = "hm-cell hm-bar-top";
    paint(top, d.back, missMax, RAMP_RED);
    top.innerHTML = content(d.back, "奥へ大ミス");
    gridEl.appendChild(top);

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const v = d.grid[r][c];
        const cell = document.createElement("div");
        cell.className = "hm-cell";
        cell.style.gridColumn = c + 2;
        cell.style.gridRow = r + 2;
        paint(cell, v, gridMax, RAMP);
        cell.innerHTML = content(v, null);
        gridEl.appendChild(cell);
      }
    }

    const right = document.createElement("div");
    right.className = "hm-cell hm-bar-right";
    paint(right, d.right, missMax, RAMP_RED);
    right.innerHTML = content(d.right, "右へ<br>大ミス");
    gridEl.appendChild(right);

    const bottom = document.createElement("div");
    bottom.className = "hm-cell hm-bar-bottom";
    paint(bottom, d.front, missMax, RAMP_RED);
    bottom.innerHTML = content(d.front, "手前へ大ミス");
    gridEl.appendChild(bottom);

    insightEl.innerHTML = heatmap13InsightHTML(d, "ナイス");
    if (noteEl) noteEl.textContent = total && total < 10 ? `球数が少ないため参考程度(${total}球)。累積画面で精度が上がります。` : "";
  }

  const clubsWithData = settings.clubs.filter((c) => c !== "PT" && rv.shotHeatSource.some((s) => s.club === c));
  let currentGroup = "IR", currentClub = clubsWithData[0] || null;

  function renderShotHm() {
    const g = CLUB_GROUPS.find((x) => x.key === currentGroup);
    let shots, title;
    if (g.key === "CLUB") {
      shots = rv.shotHeatSource.filter((s) => s.club === currentClub);
      title = currentClub || "-";
    } else {
      shots = rv.shotHeatSource.filter((s) => g.test(s.club));
      title = g.label;
    }
    $("shotTitle").textContent = title;
    build13HeatmapUI(build13Heat(shots), $("shotGrid"), $("shotN"), $("shotInsight"), $("shotNote"));
  }

  const segRow = $("segRow"), clubPick = $("clubPick");
  CLUB_GROUPS.forEach((g) => {
    const b = document.createElement("button");
    b.className = "seg-btn" + (g.key === currentGroup ? " selected" : "");
    b.textContent = g.label;
    b.dataset.key = g.key;
    b.addEventListener("click", () => {
      currentGroup = g.key;
      Array.prototype.forEach.call(segRow.children, (x) => x.classList.toggle("selected", x.dataset.key === g.key));
      clubPick.classList.toggle("show", g.key === "CLUB");
      if (g.key === "CLUB") {
        Array.prototype.forEach.call(clubPick.children, (x) => x.classList.toggle("selected", x.dataset.club === currentClub));
      }
      renderShotHm();
    });
    segRow.appendChild(b);
  });
  clubsWithData.forEach((c) => {
    const b = document.createElement("button");
    b.className = "seg-btn";
    b.textContent = c;
    b.dataset.club = c;
    b.addEventListener("click", () => {
      currentClub = c;
      Array.prototype.forEach.call(clubPick.children, (x) => x.classList.toggle("selected", x.dataset.club === c));
      renderShotHm();
    });
    clubPick.appendChild(b);
  });
  renderShotHm();
  buildHeatmapUI(buildHeatMatrix(rv.puttHeatSource), $("puttGridHm"), $("puttN"), $("puttInsight"), "惜しい");

  /* ---- ホール別 ---- */
  activeHoles(round).forEach((h, i) => {
    const hs = rv.HS[i];
    const d = hs.score - hs.par;
    const cls = d > 0 ? "diff-over" : d < 0 ? "diff-under" : "diff-even";
    const notes = [];
    if (hs.obCount) notes.push("OB");
    if (hs.penaltyCount) notes.push("ペナルティ");
    if (hs.three) notes.push("3パット");
    if (hs.choro) notes.push("ダフリ");
    if (hs.bunker) notes.push("バンカー");
    if (hs.scramble) notes.push("寄せワン");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="hole-no">${hs.number}</td>`
      + `<td><button class="par-tap" type="button" data-i="${i}">${hs.par}</button></td>`
      + `<td>${hs.score}</td>`
      + `<td class="${cls}">${d > 0 ? "+" + d : d === 0 ? "E" : d}</td>`
      + `<td class="${hs.three ? "putt3" : ""}">${hs.putts}</td>`
      + `<td class="note">${notes.join("・")}</td>`;
    $("holeRows").appendChild(tr);
  });

  /* ---- Par修正(2-2 + 5-1: モーダルで選んでから確定する) ---- */
  let editingIndex = null;
  let parEditSelected = null;
  function renderParEditChips(current) {
    parEditSelected = current;
    Array.prototype.forEach.call(document.querySelectorAll("#parEditChips .chip-toggle"), (b) => {
      b.classList.toggle("selected", +b.dataset.par === current);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("#parEditChips .chip-toggle"), (b) => {
    b.addEventListener("click", () => renderParEditChips(+b.dataset.par));
  });
  Array.prototype.forEach.call(document.querySelectorAll(".par-tap"), (btn) => {
    btn.addEventListener("click", () => {
      editingIndex = +btn.dataset.i;
      const rawHole = round.holes[editingIndex];
      $("parEditTitle").textContent = `${rawHole.number}番ホールのパーを変更`;
      renderParEditChips(rawHole.par);
      $("parEditOverlay").classList.add("show");
    });
  });
  $("parEditCancel").addEventListener("click", () => {
    $("parEditOverlay").classList.remove("show");
    editingIndex = null;
  });

  let pendingPar = null;
  $("parEditApply").addEventListener("click", async () => {
    $("parEditOverlay").classList.remove("show");
    const rawHole = round.holes[editingIndex];
    const oldPar = rawHole.par;
    editingIndex = null;
    if (parEditSelected === oldPar) return;
    rawHole.par = parEditSelected;
    await saveRound(round);
    pendingPar = { number: rawHole.number, newPar: parEditSelected };
    $("parConfirmText").textContent =
      `${rawHole.number}番のParを${oldPar}→${parEditSelected}に変更しました。`
      + `コース「${course ? course.name : "不明"}」のPar情報(以後このコースを選んだ時の初期値)も更新しますか?`;
    $("parConfirmOverlay").classList.add("show");
  });
  $("parConfirmYes").addEventListener("click", async () => {
    if (course && pendingPar) {
      course.pars[pendingPar.number - 1] = pendingPar.newPar;
      await saveCourse(course);
    }
    location.reload();
  });
  $("parConfirmNo").addEventListener("click", () => {
    location.reload();
  });

  /* ---- 5-2: ラウンドのコース付け替え ---- */
  let pendingCourseId = null;
  $("courseNameBtn").addEventListener("click", () => {
    const picks = allCourses.filter((c) => c.id !== round.courseId);
    const chipsEl = $("coursePickChips");
    chipsEl.innerHTML = "";
    if (picks.length === 0) {
      chipsEl.innerHTML = '<div class="empty-state">他に登録されているコースがありません。</div>';
    } else {
      picks.forEach((c) => {
        const b = document.createElement("button");
        b.className = "chip-toggle";
        b.type = "button";
        b.textContent = c.name;
        b.addEventListener("click", () => {
          $("coursePickOverlay").classList.remove("show");
          const activeH = activeHoles(round);
          const mismatch = activeH.filter((h) => c.pars[h.number - 1] !== h.par).length;
          pendingCourseId = c.id;
          $("courseReassignText").textContent = `このラウンドを「${c.name}」の記録として扱います。よろしいですか?`;
          $("courseReassignMismatch").textContent = mismatch > 0
            ? `パー構成がコース情報と${mismatch}ホール分異なります(記録はそのまま保持されます)。`
            : "";
          $("courseReassignConfirmOverlay").classList.add("show");
        });
        chipsEl.appendChild(b);
      });
    }
    $("coursePickOverlay").classList.add("show");
  });
  $("coursePickCancel").addEventListener("click", () => $("coursePickOverlay").classList.remove("show"));
  $("courseReassignNo").addEventListener("click", () => {
    pendingCourseId = null;
    $("courseReassignConfirmOverlay").classList.remove("show");
  });
  $("courseReassignYes").addEventListener("click", async () => {
    if (!pendingCourseId) return;
    round.courseId = pendingCourseId;
    await saveRound(round);
    location.reload();
  });

  /* ---- メニュー(⋯)からラウンド削除 ---- */
  $("menuBtn").addEventListener("click", () => $("menuOverlay").classList.add("show"));
  $("closeMenuBtn").addEventListener("click", () => $("menuOverlay").classList.remove("show"));
  $("deleteRoundBtn").addEventListener("click", () => {
    $("menuOverlay").classList.remove("show");
    $("deleteConfirmText").textContent =
      `${round.date} ${course ? course.name : "コース不明"}(スコア${rv.total})を削除しますか?`;
    $("deleteConfirmOverlay").classList.add("show");
  });
  $("deleteConfirmNo").addEventListener("click", () => $("deleteConfirmOverlay").classList.remove("show"));
  $("deleteConfirmYes").addEventListener("click", async () => {
    await deleteRound(roundId);
    location.href = "index.html";
  });
})();
