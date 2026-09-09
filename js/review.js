import { getRound, getCourse, getRounds, getSettings, saveRound, saveCourse, deleteRound, getFacility, getLoop, getFacilities, getLoops } from "./db.js";
import {
  computeReview, buildHeatMatrix, matrixCount, heatmapInsightHTML, RAMP, RAMP_RED, CLUB_GROUPS, activeHoles,
  build13Heat, heat13Total, heatmap13InsightHTML, compareRoundsFor, compareKpiValues, DIST_RAMP
} from "./stats.js";
import { exportBackup } from "./backup.js";

// 10-1: スコア分布の積み上げ帯(振り返り・累積ダッシュボード共通の描画ロジック)
function renderScoreDist(dist, barEl, legendEl) {
  barEl.innerHTML = "";
  legendEl.innerHTML = "";
  dist.forEach((d, i) => {
    const seg = document.createElement("div");
    seg.className = "dist-seg" + (d.n === 0 ? " empty" : "");
    seg.style.width = d.pct + "%";
    seg.style.background = DIST_RAMP[i];
    seg.title = `${d.label} ${d.n}H(${d.pct}%)`;
    barEl.appendChild(seg);

    const item = document.createElement("div");
    item.className = "dist-legend-item";
    item.innerHTML = `<i style="background:${DIST_RAMP[i]}"></i>${d.label} <b>${d.n}H</b>(${d.pct}%)`;
    legendEl.appendChild(item);
  });
}

// バッチ14: ヘッダーの表記を「ゴルフ場名 前半コース→後半コース・ティー」にする
// (同じコースを前半・後半とも回った場合は矢印を省く)。facility/loopが引けない
// (未移行データ等)ときは旧来のコース名表示にフォールバックする。
function facilityHeaderText(facility, frontLoop, backLoop, tee, course) {
  if (facility && frontLoop && backLoop) {
    const loopPart = frontLoop.id === backLoop.id ? frontLoop.name : `${frontLoop.name}→${backLoop.name}`;
    return `${facility.name} ${loopPart}・${tee}ティー`;
  }
  if (course) return `${course.name}・${tee}ティー`;
  return "コース不明";
}

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

  const [course, settings, allRounds, facility, frontLoop, backLoop, allFacilities, allLoops] = await Promise.all([
    getCourse(round.courseId), getSettings(), getRounds(),
    getFacility(round.facilityId), getLoop(round.frontLoopId), getLoop(round.backLoopId),
    getFacilities(), getLoops()
  ]);
  const rv = computeReview(round, settings.kpis);

  $("headerDate").textContent = formatDateJP(round.date);
  $("courseNameBtn").textContent = facilityHeaderText(facility, frontLoop, backLoop, round.tee, course);
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

  /* ---- 10-1: スコア分布 ---- */
  renderScoreDist(rv.scoreDist, $("distBar"), $("distLegend"));

  /* ---- 10-2: 保存直後のバックアップ導線 ---- */
  if (params.get("saved") === "1") {
    $("backupCta").style.display = "";
    $("backupCtaBtn").addEventListener("click", async () => {
      await exportBackup();
      $("backupCtaBtn").textContent = "バックアップしました";
      $("backupCtaBtn").disabled = true;
    });
  }

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

  /* ---- バッチ13改訂: ラウンドのコース付け替え(ゴルフ場→前半コース→後半コース) ----
     5-2で実装した「コース名タップで付け替え」を新モデル(Facility/Loop)に対応させた。
     旧来の単一Course選択だったところを、ゴルフ場→前半コース→後半コースの3段階選択に
     拡張(新しく別の導線は作らず、既存のcourseNameBtn/オーバーレイを流用)。 */
  let pickStep = null; // "facility" | "front" | "back"
  let pickFacility = null, pickFrontLoop = null;
  let pendingReassign = null;

  function loopsOf(facilityId) { return allLoops.filter((l) => l.facilityId === facilityId); }

  function renderCoursePickStep() {
    const chipsEl = $("coursePickChips");
    chipsEl.innerHTML = "";
    $("coursePickBack").style.display = pickStep === "facility" ? "none" : "";

    if (pickStep === "facility") {
      $("coursePickTitle").textContent = "ゴルフ場を選ぶ";
      if (allFacilities.length === 0) {
        chipsEl.innerHTML = '<div class="empty-state">登録されているゴルフ場がありません。</div>';
        return;
      }
      allFacilities.forEach((f) => {
        const b = document.createElement("button");
        b.className = "chip-toggle";
        b.type = "button";
        b.textContent = f.name;
        b.addEventListener("click", () => { pickFacility = f; pickStep = "front"; renderCoursePickStep(); });
        chipsEl.appendChild(b);
      });
      return;
    }

    const fLoops = loopsOf(pickFacility.id);
    if (fLoops.length === 0) {
      chipsEl.innerHTML = '<div class="empty-state">このゴルフ場にはコースが登録されていません。</div>';
      return;
    }
    if (pickStep === "front") {
      $("coursePickTitle").textContent = `${pickFacility.name}: 前半のコースを選ぶ`;
      fLoops.forEach((l) => {
        const b = document.createElement("button");
        b.className = "chip-toggle";
        b.type = "button";
        b.textContent = l.name;
        b.addEventListener("click", () => { pickFrontLoop = l; pickStep = "back"; renderCoursePickStep(); });
        chipsEl.appendChild(b);
      });
    } else if (pickStep === "back") {
      $("coursePickTitle").textContent = `${pickFacility.name}: 後半のコースを選ぶ`;
      fLoops.forEach((l) => {
        const b = document.createElement("button");
        b.className = "chip-toggle";
        b.type = "button";
        b.textContent = l.name;
        b.addEventListener("click", () => confirmReassign(pickFacility, pickFrontLoop, l));
        chipsEl.appendChild(b);
      });
    }
  }

  function confirmReassign(facility, frontLoop, backLoop) {
    $("coursePickOverlay").classList.remove("show");
    // 記録済み(プレー済み)ホールのPar構成が、付け替え先のコースと食い違うか調べる
    // (Parそのものは書き換えない。5-2から踏襲した既存の挙動)。
    const activeH = activeHoles(round);
    let mismatch = 0;
    activeH.forEach((h, i) => {
      const expectedPar = i < 9 ? frontLoop.pars[i] : backLoop.pars[i - 9];
      if (expectedPar !== h.par) mismatch++;
    });
    pendingReassign = { facility, frontLoop, backLoop };
    const loopPart = frontLoop.id === backLoop.id ? frontLoop.name : `${frontLoop.name}→${backLoop.name}`;
    $("courseReassignText").textContent = `このラウンドを「${facility.name} ${loopPart}」の記録として扱います。よろしいですか?`;
    $("courseReassignMismatch").textContent = mismatch > 0
      ? `Par構成がコース情報と${mismatch}ホール分異なります(記録はそのまま保持されます)。`
      : "";
    $("courseReassignConfirmOverlay").classList.add("show");
  }

  $("courseNameBtn").addEventListener("click", () => {
    pickStep = "facility";
    pickFacility = null;
    pickFrontLoop = null;
    renderCoursePickStep();
    $("coursePickOverlay").classList.add("show");
  });
  $("coursePickBack").addEventListener("click", () => {
    if (pickStep === "back") { pickStep = "front"; pickFrontLoop = null; }
    else if (pickStep === "front") { pickStep = "facility"; pickFacility = null; }
    renderCoursePickStep();
  });
  $("coursePickCancel").addEventListener("click", () => $("coursePickOverlay").classList.remove("show"));
  $("courseReassignNo").addEventListener("click", () => {
    pendingReassign = null;
    $("courseReassignConfirmOverlay").classList.remove("show");
  });
  $("courseReassignYes").addEventListener("click", async () => {
    if (!pendingReassign) return;
    const { facility, frontLoop, backLoop } = pendingReassign;
    round.facilityId = facility.id;
    round.frontLoopId = frontLoop.id;
    round.backLoopId = backLoop.id;
    round.holes.forEach((h, i) => {
      if (i < 9) { h.loopId = frontLoop.id; h.loopHole = i + 1; }
      else { h.loopId = backLoop.id; h.loopHole = i - 9 + 1; }
      // par はここでは変更しない(記録済みの実プレー結果を優先する。上のmismatch表示のみで知らせる)
    });
    // courseId/start互換フィールドの再計算。付け替え前の値はもう正しくない可能性があるため、
    // いったん外し、旧Courseから移行したFacility(fac-<courseId>)で、かつ前半・後半が
    // ちょうどそのOUT/INペアのときだけ、roundStart.jsの新規作成時と同じ規則で補い直す。
    delete round.courseId;
    delete round.start;
    if (facility.id.indexOf("fac-") === 0) {
      const legacyCourseId = facility.id.slice(4);
      const outId = legacyCourseId + "-out", inId = legacyCourseId + "-in";
      if (frontLoop.id === outId && backLoop.id === inId) {
        round.courseId = legacyCourseId;
        round.start = "OUT";
      } else if (frontLoop.id === inId && backLoop.id === outId) {
        round.courseId = legacyCourseId;
        round.start = "IN";
      }
    }
    await saveRound(round);
    location.reload();
  });

  /* ---- バッチ12: スコアカード ---- */
  $("scorecardBtn").addEventListener("click", () => {
    location.href = `scorecard.html?round=${roundId}`;
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
