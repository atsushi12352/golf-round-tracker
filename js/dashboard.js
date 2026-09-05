import { getRounds, getCourses, getSettings } from "./db.js";
import { TEES } from "./clubs.js";
import {
  dashboardSummary, buildHeatMatrix, matrixCount, heatmapInsightHTML, RAMP, RAMP_RED, CLUB_GROUPS,
  build13Heat, heat13Total, heatmap13InsightHTML
} from "./stats.js";

// バッチ8: 絞り込み状態の保存(次回開いたときも維持する)
const FILTER_KEY = "golf-log:dashboard-filter";
function loadFilter() {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return { courseId: "all", tee: "all", roundFilter: "18" };
    const v = JSON.parse(raw) || {};
    return {
      courseId: v.courseId || "all",
      tee: v.tee || "all",
      roundFilter: v.roundFilter === "all" ? "all" : "18"
    };
  } catch (e) {
    return { courseId: "all", tee: "all", roundFilter: "18" };
  }
}
function saveFilter(f) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch (e) { /* ストレージ不可時は無視 */ }
}

(async function () {
  const $ = (id) => document.getElementById(id);
  const [rounds, courses, settings] = await Promise.all([getRounds(), getCourses(), getSettings()]);
  const completeRounds = rounds.filter((r) => r.complete);

  if (completeRounds.length === 0) {
    $("filterBar").style.display = "none";
    $("emptyCardText").textContent = "完了したラウンドがまだありません。ラウンドを保存すると、ここに推移や傾向が表示されます。";
    $("emptyCard").style.display = "";
    $("dashboardBody").style.display = "none";
    return;
  }

  /* ---------- 絞り込み行のセットアップ(記録に存在するものだけ選択肢に出す) ---------- */
  const filter = loadFilter();
  const courseIdsWithRounds = new Set(completeRounds.map((r) => r.courseId));
  const courseOptions = courses.filter((c) => courseIdsWithRounds.has(c.id));
  const teeOptions = TEES.filter((t) => completeRounds.some((r) => r.tee === t));
  if (!courseOptions.some((c) => c.id === filter.courseId)) filter.courseId = "all";
  if (!teeOptions.includes(filter.tee)) filter.tee = "all";

  const courseSel = $("filterCourse"), teeSel = $("filterTee"), roundSel = $("filterRound");
  courseSel.innerHTML = '<option value="all">すべて</option>'
    + courseOptions.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  teeSel.innerHTML = '<option value="all">すべて</option>'
    + teeOptions.map((t) => `<option value="${t}">${t}</option>`).join("");
  courseSel.value = filter.courseId;
  teeSel.value = filter.tee;
  roundSel.value = filter.roundFilter;

  courseSel.addEventListener("change", () => { filter.courseId = courseSel.value; saveFilter(filter); renderAll(); });
  teeSel.addEventListener("change", () => { filter.tee = teeSel.value; saveFilter(filter); renderAll(); });
  roundSel.addEventListener("change", () => { filter.roundFilter = roundSel.value; saveFilter(filter); renderAll(); });

  /* ---------- 折れ線チャート ---------- */
  function lineChart(el, values, labels, opts) {
    const W = 420, H = opts.height || 150, padL = 30, padR = 14, padT = 16, padB = opts.showX === false ? 8 : 24;
    let lo = Math.min(...values), hi = Math.max(...values);
    const span = Math.max(hi - lo, 4);
    lo = Math.floor(lo - span * 0.15); hi = Math.ceil(hi + span * 0.15);
    const x = (i) => padL + (W - padL - padR) * (values.length === 1 ? 0.5 : i / (values.length - 1));
    const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const ticks = [lo, Math.round((lo + hi) / 2), hi];
    let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;">`;
    ticks.forEach((t) => {
      s += `<line x1="${padL}" y1="${y(t)}" x2="${W - padR}" y2="${y(t)}" stroke="#eceae4" stroke-width="1"/>`;
      s += `<text x="${padL - 5}" y="${y(t) + 3.5}" font-size="10" fill="#898781" text-anchor="end">${t}</text>`;
    });
    if (opts.title) s += `<text x="${padL}" y="11" font-size="10" font-weight="700" fill="#52514e">${opts.title}</text>`;
    const pts = values.map((v, i) => x(i) + "," + y(v)).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="#0f7b4d" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const minV = Math.min(...values);
    values.forEach((v, i) => {
      const isLast = i === values.length - 1;
      const isBest = opts.markMin && v === minV;
      s += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${isBest ? "#0a5c39" : "#0f7b4d"}" stroke="#fcfcfb" stroke-width="2"/>`;
      if (isLast || isBest) {
        s += `<text x="${x(i)}" y="${y(v) - 9}" font-size="11" font-weight="700" fill="#0b0b0b" text-anchor="middle">${v}${isBest && !isLast ? " ★" : ""}</text>`;
      }
      if (opts.showX !== false) {
        s += `<text x="${x(i)}" y="${H - 7}" font-size="9" fill="#898781" text-anchor="middle">${labels[i]}</text>`;
      }
    });
    s += "</svg>";
    el.innerHTML = s;
  }

  /* ---------- ヒートマップ(パット用: 従来の9マス) ---------- */
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
    if (noteEl) noteEl.textContent = n && n < 10 ? `球数が少ないため参考程度(${n}球)。` : "";
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
    if (noteEl) noteEl.textContent = total && total < 10 ? `球数が少ないため参考程度(${total}球)。` : "";
  }

  /* ---------- 絞り込み結果に応じてダッシュボード全体を再描画 ---------- */
  function renderAll() {
    const d = dashboardSummary(rounds, courses, { ...filter, kpiIds: settings.kpis });

    document.querySelectorAll(".filter-count").forEach((el) => {
      el.textContent = d.perRound.length ? `該当${d.perRound.length}ラウンド` : "";
    });

    if (d.perRound.length === 0) {
      $("emptyCardText").textContent = "条件に合うラウンドがありません。";
      $("emptyCard").style.display = "";
      $("dashboardBody").style.display = "none";
      return;
    }
    $("emptyCard").style.display = "none";
    $("dashboardBody").style.display = "flex";

    const firstDate = d.perRound[0].date, lastDate = d.perRound[d.perRound.length - 1].date;
    $("headerSub").textContent = `${firstDate}〜${lastDate} 全${d.perRound.length}ラウンド`;
    $("avgRecent").textContent = d.avgRecent3 !== null ? d.avgRecent3.toFixed(1) : "-";
    $("best").textContent = d.best !== null ? d.best : "-";
    $("avgAll").textContent = d.avgAll !== null ? d.avgAll.toFixed(1) : "-";

    const view = d.perRound.slice(-20);
    const viewLabels = view.map((r) => r.date.slice(5).replace("-", "/"));
    lineChart($("scoreChart"), view.map((r) => r.score), viewLabels, { markMin: true, showX: false, height: 130, title: "スコア" });
    lineChart($("puttChart"), view.map((r) => r.putts), viewLabels, { markMin: false, height: 110, title: "パット" });

    /* ---------- KPI ---------- */
    $("kpiGrid").innerHTML = "";
    d.kpis.forEach((k) => {
      const el = document.createElement("div");
      el.className = "kpi";
      if (k.now === null) {
        el.innerHTML = `<div class="v">-</div><div class="k">${k.label}</div>`;
      } else {
        const diff = k.diff;
        const neutral = k.lowerBetter === null || k.lowerBetter === undefined;
        const good = diff === null || neutral ? null : (k.lowerBetter ? diff < 0 : diff > 0);
        const cls = diff === null || neutral || Math.abs(diff) < 0.05 ? "flat" : good ? "up" : "down";
        const arrow = diff === null || Math.abs(diff) < 0.05 ? "→" : diff > 0 ? "▲" : "▼";
        const diffText = diff === null ? "" : Math.abs(diff).toFixed(k.digits === 0 ? 0 : 1) + k.unit;
        const nowText = k.kind === "diff" ? (k.now >= 0 ? "+" : "") + k.now.toFixed(k.digits) : k.now.toFixed(k.digits);
        el.innerHTML = `<div class="v">${nowText}<small>${k.unit}</small></div>`
          + `<div class="k">${k.label}</div>`
          + `<div class="d ${cls}">${arrow} ${diffText}</div>`;
      }
      $("kpiGrid").appendChild(el);
    });

    /* ---------- ホールタイプ別 ---------- */
    const typeLabels = { 3: "ショート(Par3)", 4: "ミドル(Par4)", 5: "ロング(Par5)" };
    $("typeN").textContent = `該当${d.perRound.length}ラウンド`;
    $("typeGrid").innerHTML = "";
    d.typeAverages.forEach((t) => {
      const el = document.createElement("div");
      el.className = "kpi";
      const avgText = t.avg === null ? "-" : (t.avg >= 0 ? "+" : "") + t.avg.toFixed(1);
      el.innerHTML = `<div class="v">${avgText}</div><div class="k">${typeLabels[t.par]} ×${t.n}H</div>`;
      $("typeGrid").appendChild(el);
    });

    /* ---------- コース別・ホール別 ---------- */
    let currentCourseIdx = 0;
    function renderCourse() {
      const c = d.courseStats[currentCourseIdx];
      const holes = $("courseHoles");
      holes.innerHTML = "";
      const known = c.avgs.filter((a) => a !== null);
      const maxAvg = known.length ? Math.max(...known) : null;
      const minAvg = known.length ? Math.min(...known) : null;
      c.avgs.forEach((a, i) => {
        const el = document.createElement("div");
        const worst = a !== null && maxAvg !== null && a >= maxAvg - 0.15;
        const best = a !== null && minAvg !== null && a <= minAvg + 0.15;
        el.className = "hole-tile" + (worst ? " worst" : best ? " best" : "");
        const avgText = a === null ? "-" : (a >= 0 ? "+" : "") + a.toFixed(1);
        el.innerHTML = `<div class="no">${i + 1} <span style="opacity:.7">P${c.course.pars[i]}</span></div><div class="avg">${avgText}</div>`;
        holes.appendChild(el);
      });
      if (maxAvg !== null) {
        const wi = c.avgs.indexOf(maxAvg);
        $("courseInsight").innerHTML = `要対策は<b>${wi + 1}番(Par${c.course.pars[wi]})</b>の平均+${maxAvg.toFixed(1)}。`;
      } else {
        $("courseInsight").textContent = "";
      }
    }
    const courseRow = $("courseRow");
    courseRow.innerHTML = "";
    if (d.courseStats.length === 0) {
      $("courseHoles").innerHTML = '<div class="empty-state">コースデータがありません。</div>';
      $("courseInsight").textContent = "";
    } else {
      d.courseStats.forEach((c, i) => {
        const b = document.createElement("button");
        b.className = "seg-btn" + (i === currentCourseIdx ? " selected" : "");
        b.textContent = `${c.course.name} ×${c.rounds}R`;
        b.dataset.i = i;
        b.addEventListener("click", () => {
          currentCourseIdx = i;
          Array.prototype.forEach.call(courseRow.children, (x) => x.classList.toggle("selected", +x.dataset.i === i));
          renderCourse();
        });
        courseRow.appendChild(b);
      });
      renderCourse();
    }

    /* ---------- 距離帯別パット(累積) ---------- */
    const puttRows = $("puttDistRows");
    puttRows.innerHTML = "";
    d.distancePutts.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.band}</td><td>${r.attempts}</td>`
        + `<td>${r.cupInRate === null ? "-" : r.cupInRate + "%"}</td>`
        + `<td>${r.threePuttRate === null ? "-" : r.threePuttRate + "%"}</td>`;
      puttRows.appendChild(tr);
    });

    /* ---------- ヒートマップ ---------- */
    const clubOrder = settings.clubs.filter((c) => c !== "PT" && d.byClub[c] && d.byClub[c].length);
    let currentGroup = "IR", currentClub = clubOrder[0] || null;

    function renderShotHm() {
      const g = CLUB_GROUPS.find((x) => x.key === currentGroup);
      let shots, title;
      if (g.key === "CLUB") {
        shots = d.byClub[currentClub] || [];
        title = currentClub || "-";
      } else {
        shots = d.shotShots.filter((s) => g.test(s.club));
        title = g.label;
      }
      $("shotTitle").textContent = title;
      build13HeatmapUI(build13Heat(shots), $("shotGrid"), $("shotN"), $("shotInsight"), $("shotNote"));
    }

    const segRow = $("segRow"), clubPick = $("clubPick");
    segRow.innerHTML = "";
    clubPick.innerHTML = "";
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
    clubOrder.forEach((c) => {
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
    buildHeatmapUI(buildHeatMatrix(d.puttShots), $("puttGridHm"), $("puttN"), $("puttInsight"), "惜しい");
  }

  renderAll();
})();
