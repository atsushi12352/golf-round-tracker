// バッチ13: ラウンド開始画面を「コース(18ホール固定)+OUT/INスタート」から
// 「ゴルフ場(Facility)+前半・後半のコース(Loop)」選択に置き換え。
import { getFacilities, getLoops, getRounds, saveRound, newId } from "./db.js";
import { TEES } from "./clubs.js";
import { renderFacilityForm } from "./facilityForm.js";

(async function () {
  const $ = (id) => document.getElementById(id);

  const [facilities, loops, rounds] = await Promise.all([getFacilities(), getLoops(), getRounds()]);
  const roundCountByFacility = {};
  rounds.forEach((r) => {
    if (r.facilityId) roundCountByFacility[r.facilityId] = (roundCountByFacility[r.facilityId] || 0) + 1;
  });

  function facilityLoops(facId) { return loops.filter((l) => l.facilityId === facId); }

  let selectedFacilityId = null;
  let selectedFrontLoopId = null;
  let selectedBackLoopId = null;

  const facilityChips = $("facilityChips");
  function renderFacilityChips() {
    facilityChips.innerHTML = "";
    facilities.forEach((f) => {
      const b = document.createElement("button");
      b.className = "chip-toggle" + (f.id === selectedFacilityId ? " selected" : "");
      b.type = "button";
      b.textContent = `${f.name}(${roundCountByFacility[f.id] || 0}R)`;
      b.addEventListener("click", () => selectFacility(f.id));
      facilityChips.appendChild(b);
    });
  }

  function selectFacility(id) {
    selectedFacilityId = id;
    const fl = facilityLoops(id);
    if (fl.length === 1) {
      selectedFrontLoopId = fl[0].id;
      selectedBackLoopId = fl[0].id;
    } else if (fl.length === 2) {
      // 2コースしかないゴルフ場では前半=OUT・後半=IN(相当)を既定にしておく
      const front = fl.find((l) => l.name === "OUT") || fl[0];
      const back = fl.find((l) => l.name === "IN") || fl[1];
      selectedFrontLoopId = front.id;
      selectedBackLoopId = back.id;
    } else {
      selectedFrontLoopId = null;
      selectedBackLoopId = null;
    }
    renderFacilityChips();
    renderLoopCard();
  }

  function renderLoopCard() {
    const fl = facilityLoops(selectedFacilityId);
    $("loopCard").style.display = selectedFacilityId ? "" : "none";
    const frontEl = $("frontLoopChips"), backEl = $("backLoopChips");
    frontEl.innerHTML = "";
    backEl.innerHTML = "";
    fl.forEach((l) => {
      const fb = document.createElement("button");
      fb.className = "chip-toggle" + (l.id === selectedFrontLoopId ? " selected" : "");
      fb.type = "button";
      fb.textContent = l.name;
      fb.addEventListener("click", () => { selectedFrontLoopId = l.id; renderLoopCard(); });
      frontEl.appendChild(fb);

      const bb = document.createElement("button");
      bb.className = "chip-toggle" + (l.id === selectedBackLoopId ? " selected" : "");
      bb.type = "button";
      bb.textContent = l.name;
      bb.addEventListener("click", () => { selectedBackLoopId = l.id; renderLoopCard(); });
      backEl.appendChild(bb);
    });
  }

  renderFacilityChips();
  renderLoopCard();

  $("newFacilityBtn").addEventListener("click", () => {
    renderFacilityForm($("facilityFormContainer"), async (facility, newLoops) => {
      $("facilityNewOverlay").classList.remove("show");
      facilities.push(facility);
      loops.push(...newLoops);
      selectFacility(facility.id);
    }, () => $("facilityNewOverlay").classList.remove("show"));
    $("facilityNewOverlay").classList.add("show");
  });

  let selectedTee = null;
  const teeChips = $("teeChips");
  TEES.forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip-toggle";
    b.type = "button";
    b.textContent = t + "ティー";
    b.addEventListener("click", () => {
      selectedTee = selectedTee === t ? null : t;
      $("teeCustom").value = "";
      renderTeeSelection();
    });
    b.dataset.t = t;
    teeChips.appendChild(b);
  });
  function renderTeeSelection() {
    Array.prototype.forEach.call(teeChips.children, (b) => b.classList.toggle("selected", b.dataset.t === selectedTee));
  }
  $("teeCustom").addEventListener("input", () => {
    if ($("teeCustom").value.trim()) { selectedTee = null; renderTeeSelection(); }
  });

  function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }

  $("startBtn").addEventListener("click", async () => {
    const err = $("errMsg");
    err.style.display = "none";

    if (!selectedFacilityId) {
      err.textContent = "ゴルフ場を選択するか、新規登録してください。";
      err.style.display = "block";
      return;
    }
    if (!selectedFrontLoopId || !selectedBackLoopId) {
      err.textContent = "前半・後半のコースを選択してください。";
      err.style.display = "block";
      return;
    }
    const tee = selectedTee || $("teeCustom").value.trim();
    if (!tee) {
      err.textContent = "ティーを選択するか、自由入力してください。";
      err.style.display = "block";
      return;
    }

    const frontLoop = loops.find((l) => l.id === selectedFrontLoopId);
    const backLoop = loops.find((l) => l.id === selectedBackLoopId);
    const holes = [];
    for (let i = 0; i < 9; i++) holes.push({ number: i + 1, loopId: frontLoop.id, loopHole: i + 1, par: frontLoop.pars[i], shots: [] });
    for (let i = 0; i < 9; i++) holes.push({ number: i + 10, loopId: backLoop.id, loopHole: i + 1, par: backLoop.pars[i], shots: [] });

    const round = {
      id: newId(),
      date: todayISO(),
      facilityId: selectedFacilityId,
      frontLoopId: selectedFrontLoopId,
      backLoopId: selectedBackLoopId,
      tee,
      holes,
      playedHoles: 0,
      complete: false
    };

    // この段階では分析画面(review/dashboard)は旧courseId前提のまま変更していないため、
    // 旧Courseから移行したゴルフ場(fac-<courseId>)で、かつ前半・後半がそのOUT/INの
    // ペアどおりのときは courseId/start も補って一緒に保存し、互換性を保つ
    // (バッチ14でループ単位の集計に切り替えるまでの措置)。
    if (selectedFacilityId.indexOf("fac-") === 0) {
      const courseId = selectedFacilityId.slice(4);
      const outId = courseId + "-out", inId = courseId + "-in";
      if (selectedFrontLoopId === outId && selectedBackLoopId === inId) {
        round.courseId = courseId;
        round.start = "OUT";
      } else if (selectedFrontLoopId === inId && selectedBackLoopId === outId) {
        round.courseId = courseId;
        round.start = "IN";
      }
    }

    await saveRound(round);
    location.href = `hole.html?round=${round.id}&hole=1`;
  });
})();
