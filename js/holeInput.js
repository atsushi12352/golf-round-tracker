import { getRound, saveRound, deleteRound, getSettings, getCourse, saveCourse } from "./db.js";
import { PUTT_DISTS, LIES } from "./clubs.js";
import { inferLie, inferPuttDist, playedHoleCount } from "./stats.js";

(async function () {
  const params = new URLSearchParams(location.search);
  const roundId = params.get("round");
  if (!roundId) { location.href = "index.html"; return; }

  const round = await getRound(roundId);
  if (!round) { location.href = "index.html"; return; }
  if (round.complete) { location.href = "review.html?round=" + roundId; return; }

  const settings = await getSettings();
  const course = round.courseId ? await getCourse(round.courseId) : null;

  let holeNum = parseInt(params.get("hole"), 10);
  if (!holeNum || holeNum < 1) holeNum = playedHoleCount(round) + 1;
  holeNum = Math.min(Math.max(holeNum, 1), 18);

  const holeData = round.holes[holeNum - 1];
  let par = holeData.par || 4;
  let shots = (holeData.shots || []).slice();

  let selectedClub = settings.clubs.includes("1W") ? "1W" : settings.clubs[0];
  let selectedLie = "ティー";
  let selectedPuttDist = "ミドル";
  let editIndex = null;
  let pickMode = null; // "ob" | "penalty" | null(通常モード)
  let pendingDir = null; // OBのティーショットで方向確定後、処置(打ち直し/前進)待ち
  // 大ミス方向選択パネルで有効になるマス([row,col] → 方向)
  const DIR_MAP = { "0,1": "奥", "1,0": "左", "1,2": "右", "2,1": "手前" };

  const $ = (id) => document.getElementById(id);

  $("holeNum").textContent = holeData.number;
  $("holePar").textContent = par;

  /* ---- club grid ---- */
  const clubGrid = $("clubGrid");
  settings.clubs.forEach((c) => {
    const b = document.createElement("button");
    b.className = "club-btn" + (c === "PT" ? " pt" : "");
    b.textContent = c;
    b.dataset.club = c;
    b.addEventListener("click", () => selectClub(c));
    clubGrid.appendChild(b);
  });

  /* ---- lie chips ---- */
  const lieChips = $("lieChips");
  LIES.forEach((l) => {
    const b = document.createElement("button");
    b.className = "lie-chip";
    b.textContent = l;
    b.dataset.lie = l;
    b.addEventListener("click", () => setLie(l, false));
    lieChips.appendChild(b);
  });

  function setLie(l, auto) {
    selectedLie = l;
    Array.prototype.forEach.call(lieChips.children, (b) => {
      b.classList.toggle("selected", b.dataset.lie === l);
      b.classList.toggle("auto", auto && b.dataset.lie === l);
    });
  }

  function selectClub(c) {
    resetPick();
    selectedClub = c;
    Array.prototype.forEach.call(clubGrid.children, (b) => b.classList.toggle("selected", b.dataset.club === c));
    const isPutt = c === "PT";
    $("gridMode").style.display = isPutt ? "none" : "";
    $("puttMode").style.display = isPutt ? "" : "none";
    $("lieRow").style.display = isPutt ? "none" : "";
    if (isPutt) updatePuttDistRow();
    updateGuideText();
  }

  function updateGuideText() {
    const isPutt = selectedClub === "PT";
    $("guide").innerHTML = isPutt
      ? "<b>パット</b>の結果をタップ(入ったら「カップイン」)"
      : "<b>" + selectedClub + "</b> の結果のマスをタップ";
  }

  /* ---- 9 grid ---- */
  const GRID = [
    ["左オーバー", "オーバー", "右オーバー"],
    ["左", "ナイス", "右"],
    ["左ショート", "ショート", "右ショート"]
  ];
  const grid9 = $("grid9");
  GRID.forEach((row, ri) => {
    row.forEach((label, ci) => {
      const b = document.createElement("button");
      b.className = "cell" + (ri === 1 && ci === 1 ? " center" : "");
      b.dataset.rc = ri + "," + ci;
      b.innerHTML = ri === 1 && ci === 1 ? "ナイス<small>狙い通り</small>" : label;
      b.addEventListener("click", () => {
        if (pickMode) {
          const dir = DIR_MAP[b.dataset.rc];
          if (!dir) return;
          onPickDir(dir);
        } else {
          record({ club: selectedClub, lie: selectedLie, result: label, kind: (ri === 1 && ci === 1) ? "nice" : "normal" });
        }
      });
      grid9.appendChild(b);
    });
  });

  /* ---- 7-1/7-1b: OB・ペナの方向選択 + OBティーショットの処置選択 ---- */
  function startPick(mode) {
    pickMode = mode;
    grid9.classList.add("pick");
    Array.prototype.forEach.call(grid9.children, (b) => {
      const dir = DIR_MAP[b.dataset.rc];
      b.classList.toggle("dir", !!dir);
      if (dir) b.textContent = dir;
    });
    $("specialRow").style.display = "none";
    $("cancelRow").style.display = "";
    $("choiceRow").style.display = "none";
    $("guide").className = "guide bigmiss";
    $("guide").innerHTML = (mode === "ob" ? "OB" : "ペナ") + "はどっちに?";
  }

  function onPickDir(dir) {
    // ティーショットのOBだけ、続けて打ち直し/前進の2択を挟む
    if (pickMode === "ob" && selectedLie === "ティー") {
      pendingDir = dir;
      $("cancelRow").style.display = "none";
      $("choiceRow").style.display = "";
      $("guide").innerHTML = "OB" + dir + " — 処置は?";
      return;
    }
    const kind = pickMode;
    const label = kind === "ob" ? "OB" : "ペナ";
    record({ club: selectedClub, lie: selectedLie, result: label + dir, kind, dir, adv: false });
    resetPick();
  }

  $("choiceReplay").addEventListener("click", () => {
    record({ club: selectedClub, lie: selectedLie, result: "OB" + pendingDir, kind: "ob", dir: pendingDir, adv: false });
    resetPick();
  });
  $("choiceAdvance").addEventListener("click", () => {
    record({ club: selectedClub, lie: selectedLie, result: "OB" + pendingDir, kind: "ob", dir: pendingDir, adv: true });
    resetPick();
  });
  $("cancelPickBtn").addEventListener("click", resetPick);
  $("cancelChoiceBtn").addEventListener("click", resetPick);

  function resetPick() {
    if (!pickMode) return;
    pickMode = null;
    pendingDir = null;
    grid9.classList.remove("pick");
    Array.prototype.forEach.call(grid9.children, (b) => {
      const [ri, ci] = b.dataset.rc.split(",").map(Number);
      b.classList.remove("dir");
      b.innerHTML = (ri === 1 && ci === 1) ? "ナイス<small>狙い通り</small>" : GRID[ri][ci];
    });
    $("specialRow").style.display = "";
    $("cancelRow").style.display = "none";
    $("choiceRow").style.display = "none";
    $("guide").className = "guide";
    updateGuideText();
  }

  Array.prototype.forEach.call(document.querySelectorAll("#specialRow [data-special]"), (b) => {
    b.addEventListener("click", () => {
      const r = b.dataset.special;
      if (r === "チップイン") {
        const wasEdit = editIndex !== null;
        record({ club: selectedClub, lie: selectedLie, result: "チップイン", kind: "in" });
        if (!wasEdit) holeOut();
      } else if (r === "トップ・チョロ") {
        record({ club: selectedClub, lie: selectedLie, result: "トップ・チョロ", kind: "miss" });
      } else if (r === "OB") {
        startPick("ob");
      } else if (r === "ペナ") {
        startPick("penalty");
      }
    });
  });

  /* ---- putt dist chips ---- */
  const puttDistChips = $("puttDistChips");
  PUTT_DISTS.forEach((p) => {
    const b = document.createElement("button");
    b.className = "lie-chip";
    b.innerHTML = p.key + '<br><small style="font-size:9px;font-weight:500;">' + p.note + '</small>';
    b.dataset.dist = p.key;
    b.addEventListener("click", () => setPuttDist(p.key));
    puttDistChips.appendChild(b);
  });
  function setPuttDist(k) {
    selectedPuttDist = k;
    Array.prototype.forEach.call(puttDistChips.children, (b) => b.classList.toggle("selected", b.dataset.dist === k));
  }
  function updatePuttDistRow() {
    setPuttDist(inferPuttDist(shots));
  }

  /* ---- putt grid ---- */
  const PGRID = [
    ["左オーバー", "オーバー", "右オーバー"],
    ["左に外し", "惜しい", "右に外し"],
    ["左ショート", "ショート", "右ショート"]
  ];
  const puttGrid = $("puttGrid");
  PGRID.forEach((row, ri) => {
    row.forEach((label, ci) => {
      const b = document.createElement("button");
      b.className = "cell";
      b.innerHTML = (ri === 1 && ci === 1) ? "惜しい<small>距離◎ 真っ直ぐ</small>" : label;
      b.addEventListener("click", () => {
        record({ club: "PT", lie: "グリーン", result: label, kind: "putt", dist: selectedPuttDist });
      });
      puttGrid.appendChild(b);
    });
  });

  $("cupinBtn").addEventListener("click", () => {
    const wasEdit = editIndex !== null;
    record({ club: "PT", lie: "グリーン", result: "カップイン", kind: "in", dist: selectedPuttDist });
    if (!wasEdit) holeOut();
  });

  /* ---- record / undo ---- */
  // 7-1b: OBは打ち直し+1/前進+2、赤杭・池のペナルティは常に+1(js/stats.jsのholeStatsと同じ計算)
  function penalties() {
    return shots.reduce((a, s) => {
      if (s.kind === "ob") return a + (s.adv ? 2 : 1);
      if (s.kind === "penalty") return a + 1;
      return a;
    }, 0);
  }
  function score() { return shots.length + penalties(); }
  function putts() { return shots.filter((s) => s.club === "PT").length; }

  function record(shot) {
    if (editIndex !== null) {
      const i = editIndex;
      shots[i] = shot;
      exitEditMode();
      render();
      flash((i + 1) + "打目を修正しました", shot.club + " " + shot.result);
      const last = shots[shots.length - 1];
      if (last && last.kind === "in") setTimeout(holeOut, 700);
      return;
    }
    shots.push(shot);
    setLie(inferLie(shots), true);
    updatePuttDistRow();
    render();
    let sub;
    if (shot.kind === "ob") sub = shot.adv ? "前進 +2打罰" : "打ち直し +1打罰";
    else if (shot.kind === "penalty") sub = "+1打罰";
    else if (shot.dist) sub = shot.dist + "パット";
    else if (shot.lie !== "グリーン") sub = shot.lie + "から";
    else sub = "";
    flash(shot.club + " " + shot.result, sub);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function startEdit(i) {
    editIndex = i;
    const s = shots[i];
    $("overlay").classList.remove("show");
    $("editBannerText").textContent = (i + 1) + "打目を修正中(" + s.club + " " + s.result + ")";
    $("editBanner").classList.add("show");
    selectClub(s.club);
    if (s.club !== "PT") setLie(s.lie, false);
    else setPuttDist(s.dist || "ミドル");
  }

  function exitEditMode() {
    editIndex = null;
    $("editBanner").classList.remove("show");
    selectClub(selectedClub);
    setLie(inferLie(shots), true);
  }

  $("cancelEdit").addEventListener("click", () => {
    exitEditMode();
    const last = shots[shots.length - 1];
    if (last && last.kind === "in") holeOut();
  });

  $("undoBtn").addEventListener("click", () => {
    if (editIndex !== null) exitEditMode();
    if (shots.length === 0) return;
    const s = shots.pop();
    setLie(inferLie(shots), true);
    updatePuttDistRow();
    render();
    flash("取り消し", s.club + " " + s.result);
  });

  function render() {
    $("strokeNum").textContent = score() + 1;
    const log = $("logScroll");
    log.innerHTML = "";
    if (shots.length === 0) {
      log.innerHTML = '<span class="log-empty">まだ記録はありません</span>';
    } else {
      shots.forEach((s, i) => {
        const chip = document.createElement("span");
        chip.className = "log-chip" + ((s.kind === "ob" || s.kind === "penalty") ? " bad" : s.kind === "miss" ? " warn" : "");
        const advSuffix = s.kind === "ob" ? (s.adv ? "(前進)" : "(打直)") : "";
        chip.textContent = (i + 1) + " " + (s.lie === "グリーン" ? (s.dist ? s.dist + " " : "") : s.lie + " ") + s.club + " " + s.result + advSuffix;
        log.appendChild(chip);
      });
      log.scrollLeft = log.scrollWidth;
    }
  }

  let flashTimer;
  function flash(main, sub) {
    const f = $("flash");
    f.innerHTML = main + (sub ? "<small>" + sub + "</small>" : "");
    f.classList.add("show");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => f.classList.remove("show"), 900);
  }

  /* ---- par変更(5-1: モーダル確認方式。タップ即トグルは廃止) ---- */
  let parEditSelected = par;
  function renderParEditChips(current) {
    parEditSelected = current;
    Array.prototype.forEach.call(document.querySelectorAll("#parEditChips .chip-toggle"), (b) => {
      b.classList.toggle("selected", +b.dataset.par === current);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("#parEditChips .chip-toggle"), (b) => {
    b.addEventListener("click", () => renderParEditChips(+b.dataset.par));
  });
  $("parBtn").addEventListener("click", () => {
    $("parEditTitle").textContent = holeData.number + "番ホールのパーを変更";
    renderParEditChips(par);
    $("parEditOverlay").classList.add("show");
  });
  $("parEditCancel").addEventListener("click", () => $("parEditOverlay").classList.remove("show"));
  $("parEditApply").addEventListener("click", async () => {
    $("parEditOverlay").classList.remove("show");
    if (parEditSelected === par) return;
    par = parEditSelected;
    $("holePar").textContent = par;
    round.holes[holeNum - 1].par = par;
    await saveRound(round);
    if (course) {
      course.pars[holeData.number - 1] = par;
      await saveCourse(course);
    }
  });

  /* ---- hole out ---- */
  function holeOut() {
    const sc = score(), pa = par;
    const diff = sc - pa;
    const name = diff === 0 ? "パー" : diff === -1 ? "バーディ" : diff === -2 ? "イーグル"
      : diff === 1 ? "ボギー" : diff === 2 ? "ダブルボギー" : "+" + diff;
    $("sheetTitle").textContent = "ホール" + holeData.number + " ホールアウト:" + name;
    $("statScore").textContent = sc;
    $("statPutts").textContent = putts();
    $("statPenalty").textContent = penalties();
    const list = $("shotList");
    list.innerHTML = "";
    shots.forEach((s, i) => {
      const div = document.createElement("div");
      div.className = "shot-item";
      div.innerHTML = '<span class="no">' + (i + 1) + '打</span>'
        + '<span class="club">' + s.club + '</span>'
        + '<span class="res">' + s.result + (s.kind === "ob" ? (s.adv ? "(前進)" : "(打直)") : "") + ' <small style="color:var(--sub);font-size:11px;">' + s.lie + (s.dist ? "・" + s.dist : "") + '</small></span>'
        + (s.kind === "ob" ? '<span class="tag bad">+' + (s.adv ? 2 : 1) + '罰</span>'
          : s.kind === "penalty" ? '<span class="tag bad">+1罰</span>'
          : s.kind === "in" || s.kind === "nice" ? '<span class="tag">Good</span>'
          : s.kind === "miss" ? '<span class="tag warn">ミス</span>' : "");
      const fixBtn = document.createElement("button");
      fixBtn.className = "fix-btn";
      fixBtn.textContent = "修正";
      fixBtn.addEventListener("click", () => startEdit(i));
      div.appendChild(fixBtn);
      list.appendChild(div);
    });
    $("nextHole").textContent = holeNum >= 18 ? "ラウンドを保存する" : "次のホールへ";
    $("overlay").classList.add("show");
  }

  $("nextHole").addEventListener("click", async () => {
    round.holes[holeNum - 1] = { number: holeData.number, par, shots: shots.slice() };
    round.playedHoles = Math.max(playedHoleCount(round), holeNum);
    if (holeNum >= 18) {
      round.complete = true;
      await saveRound(round);
      location.href = "review.html?round=" + roundId;
    } else {
      await saveRound(round);
      location.href = "hole.html?round=" + roundId + "&hole=" + (holeNum + 1);
    }
  });

  /* ---- menu / 途中終了 ---- */
  $("menuBtn").addEventListener("click", () => $("menuOverlay").classList.add("show"));
  $("closeMenuBtn").addEventListener("click", () => $("menuOverlay").classList.remove("show"));
  $("endEarlyBtn").addEventListener("click", () => {
    $("menuOverlay").classList.remove("show");
    const played = playedHoleCount(round);
    $("endConfirmText").textContent = played === 0
      ? "まだ1ホールも完了していません。終了すると保存されるデータはありません。"
      : played + "ホールまで保存し、振り返り画面に進みます。現在入力中のホール" + holeData.number + "の内容は破棄されます。";
    $("endConfirmOverlay").classList.add("show");
  });
  $("endConfirmNo").addEventListener("click", () => $("endConfirmOverlay").classList.remove("show"));
  $("endConfirmYes").addEventListener("click", async () => {
    if (playedHoleCount(round) === 0) {
      await deleteRound(roundId);
      location.href = "index.html";
      return;
    }
    round.complete = true;
    await saveRound(round);
    location.href = "review.html?round=" + roundId;
  });

  /* ---- 4-1: 保存せずにラウンドを中止 ---- */
  $("discardBtn").addEventListener("click", () => {
    $("menuOverlay").classList.remove("show");
    $("discardConfirmOverlay").classList.add("show");
  });
  $("discardConfirmNo").addEventListener("click", () => $("discardConfirmOverlay").classList.remove("show"));
  $("discardConfirmYes").addEventListener("click", async () => {
    await deleteRound(roundId);
    location.href = "index.html";
  });

  /* ---- init ---- */
  selectClub(selectedClub);
  setLie(inferLie(shots), true);
  updatePuttDistRow();
  render();
})();
