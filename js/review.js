import { getRound, getCourse, getSettings, saveRound, saveCourse } from "./db.js";
import {
  computeReview, buildHeatMatrix, matrixCount, heatmapInsightHTML, RAMP, CLUB_GROUPS, activeHoles
} from "./stats.js";

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

  const [course, settings] = await Promise.all([getCourse(round.courseId), getSettings()]);
  const rv = computeReview(round);

  $("headerSub").textContent = `${formatDateJP(round.date)} ${course ? course.name : ""}`;
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

  /* ---- KPI ---- */
  rv.kpis.forEach((k) => {
    const d = document.createElement("div");
    d.className = "kpi";
    d.innerHTML = `<div class="v">${k.value}<small>${k.unit}</small></div><div class="k">${k.label}</div>`;
    $("kpiGrid").appendChild(d);
  });

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
    buildHeatmapUI(buildHeatMatrix(shots), $("shotGrid"), $("shotN"), $("shotInsight"), "ナイス", $("shotNote"));
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
    tr.innerHTML = `<td class="hole-no">${i + 1}</td>`
      + `<td><button class="par-tap" type="button" data-i="${i}">${hs.par}</button></td>`
      + `<td>${hs.score}</td>`
      + `<td class="${cls}">${d > 0 ? "+" + d : d === 0 ? "E" : d}</td>`
      + `<td class="${hs.three ? "putt3" : ""}">${hs.putts}</td>`
      + `<td class="note">${notes.join("・")}</td>`;
    $("holeRows").appendChild(tr);
  });

  /* ---- Par修正(2-2: 過去ラウンドのパー修正) ---- */
  let pendingPar = null;
  Array.prototype.forEach.call(document.querySelectorAll(".par-tap"), (btn) => {
    btn.addEventListener("click", async () => {
      const i = +btn.dataset.i;
      const rawHole = round.holes[i];
      const oldPar = rawHole.par;
      const newPar = oldPar === 3 ? 4 : oldPar === 4 ? 5 : 3;
      rawHole.par = newPar;
      await saveRound(round);
      pendingPar = { number: rawHole.number, newPar };
      $("parConfirmText").textContent =
        `${rawHole.number}番のParを${oldPar}→${newPar}に変更しました。`
        + `コース「${course ? course.name : "不明"}」のPar情報(以後このコースを選んだ時の初期値)も更新しますか?`;
      $("parConfirmOverlay").classList.add("show");
    });
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
})();
