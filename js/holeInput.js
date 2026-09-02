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

  const $ = (id) => document.getElementById(id);

  $("holeNum").textContent = holeNum;
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
    selectedClub = c;
    Array.prototype.forEach.call(clubGrid.children, (b) => b.classList.toggle("selected", b.dataset.club === c));
    const isPutt = c === "PT";
    $("gridMode").style.display = isPutt ? "none" : "";
    $("puttMode").style.display = isPutt ? "" : "none";
    $("lieRow").style.display = isPutt ? "none" : "";
    if (isPutt) updatePuttDistRow();
    $("guide").innerHTML = isPutt
      ? "<b>パット</b>の結果をタップ(入ったら「カップイン」)"
      : "<b>" + c + "</b> の結果のマスをタップ";
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
      b.innerHTML = ri === 1 && ci === 1 ? "ナイス<small>狙い通り</small>" : label;
      b.addEventListener("click", () => {
        record({ club: selectedClub, lie: selectedLie, result: label, kind: (ri === 1 && ci === 1) ? "nice" : "normal" });
      });
      grid9.appendChild(b);
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-special]"), (b) => {
    b.addEventListener("click", () => {
      const r = b.dataset.special;
      if (r === "チップイン") {
        const wasEdit = editIndex !== null;
        record({ club: selectedClub, lie: selectedLie, result: "チップイン", kind: "in" });
        if (!wasEdit) holeOut();
      } else if (r.indexOf("OB") === 0) {
        record({ club: selectedClub, lie: selectedLie, result: r, kind: "ob" });
      } else if (r === "ペナルティ") {
        record({ club: selectedClub, lie: selectedLie, result: "ペナルティ", kind: "penalty" });
      } else {
        record({ club: selectedClub, lie: selectedLie, result: r, kind: "miss" });
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
  function penalties() { return shots.filter((s) => s.kind === "ob" || s.kind === "penalty").length; }
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
    flash(shot.club + " " + shot.result, (shot.kind === "ob" || shot.kind === "penalty") ? "+1打罰" : (shot.dist ? shot.dist + "パット" : (shot.lie !== "グリーン" ? shot.lie + "から" : "")));
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
        chip.textContent = (i + 1) + " " + (s.lie === "グリーン" ? (s.dist ? s.dist + " " : "") : s.lie + " ") + s.club + " " + s.result;
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

  /* ---- par toggle(新規: コースのpar確定) ---- */
  $("parBtn").addEventListener("click", async () => {
    par = par === 3 ? 4 : par === 4 ? 5 : 3;
    $("holePar").textContent = par;
    round.holes[holeNum - 1].par = par;
    await saveRound(round);
    if (course) {
      course.pars[holeNum - 1] = par;
      await saveCourse(course);
    }
  });

  /* ---- hole out ---- */
  function holeOut() {
    const sc = score(), pa = par;
    const diff = sc - pa;
    const name = diff === 0 ? "パー" : diff === -1 ? "バーディ" : diff === -2 ? "イーグル"
      : diff === 1 ? "ボギー" : diff === 2 ? "ダブルボギー" : "+" + diff;
    $("sheetTitle").textContent = "ホール" + holeNum + " ホールアウト:" + name;
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
        + '<span class="res">' + s.result + ' <small style="color:var(--sub);font-size:11px;">' + s.lie + (s.dist ? "・" + s.dist : "") + '</small></span>'
        + ((s.kind === "ob" || s.kind === "penalty") ? '<span class="tag bad">+1罰</span>'
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
    round.holes[holeNum - 1] = { number: holeNum, par, shots: shots.slice() };
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
      : played + "ホールまで保存し、振り返り画面に進みます。現在入力中のホール" + holeNum + "の内容は破棄されます。";
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

  /* ---- init ---- */
  selectClub(selectedClub);
  setLie(inferLie(shots), true);
  updatePuttDistRow();
  render();
})();
