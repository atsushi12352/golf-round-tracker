import { getCourses, getRounds, saveCourse, saveRound, newId } from "./db.js";
import { TEES } from "./clubs.js";
import { playOrderNumbers } from "./stats.js";

(async function () {
  const $ = (id) => document.getElementById(id);

  const [courses, rounds] = await Promise.all([getCourses(), getRounds()]);
  const roundCountByCourse = {};
  rounds.forEach((r) => { roundCountByCourse[r.courseId] = (roundCountByCourse[r.courseId] || 0) + 1; });

  let selectedCourseId = null;
  const courseChips = $("courseChips");
  courses.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip-toggle";
    b.type = "button";
    b.textContent = `${c.name}(${roundCountByCourse[c.id] || 0}R)`;
    b.addEventListener("click", () => {
      selectedCourseId = selectedCourseId === c.id ? null : c.id;
      $("newCourseName").value = "";
      renderCourseSelection();
    });
    b.dataset.id = c.id;
    courseChips.appendChild(b);
  });
  function renderCourseSelection() {
    Array.prototype.forEach.call(courseChips.children, (b) => b.classList.toggle("selected", b.dataset.id === selectedCourseId));
  }
  $("newCourseName").addEventListener("input", () => {
    if ($("newCourseName").value.trim()) { selectedCourseId = null; renderCourseSelection(); }
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

  let selectedStart = "OUT";
  const startChips = $("startChips");
  [["OUT", "OUTスタート(1番から)"], ["IN", "INスタート(10番から)"]].forEach(([key, label]) => {
    const b = document.createElement("button");
    b.className = "chip-toggle" + (key === selectedStart ? " selected" : "");
    b.type = "button";
    b.textContent = label;
    b.dataset.start = key;
    b.addEventListener("click", () => {
      selectedStart = key;
      Array.prototype.forEach.call(startChips.children, (x) => x.classList.toggle("selected", x.dataset.start === key));
    });
    startChips.appendChild(b);
  });

  function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }

  $("startBtn").addEventListener("click", async () => {
    const err = $("errMsg");
    err.style.display = "none";

    let course = selectedCourseId ? courses.find((c) => c.id === selectedCourseId) : null;
    const newName = $("newCourseName").value.trim();
    if (!course && newName) {
      course = { id: newId(), name: newName, pars: Array(18).fill(4) };
      await saveCourse(course);
    }
    if (!course) {
      err.textContent = "コースを選択するか、新規コース名を入力してください。";
      err.style.display = "block";
      return;
    }

    const tee = selectedTee || $("teeCustom").value.trim();
    if (!tee) {
      err.textContent = "ティーを選択するか、自由入力してください。";
      err.style.display = "block";
      return;
    }

    const round = {
      id: newId(),
      date: todayISO(),
      courseId: course.id,
      tee,
      start: selectedStart,
      holes: playOrderNumbers(selectedStart).map((n) => ({ number: n, par: course.pars[n - 1], shots: [] })),
      playedHoles: 0,
      complete: false
    };
    await saveRound(round);
    location.href = `hole.html?round=${round.id}&hole=1`;
  });
})();
