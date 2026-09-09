import { getSettings, saveSettings, getCourses, getRounds, deleteCourse, getFacilities, getLoops, saveLoop } from "./db.js";
import { CLUB_MASTER } from "./clubs.js";
import { PRESET_COURSES } from "./presetCourses.js";
import { exportBackup, importBackupFile, getLastBackupAt, daysSinceLastBackup, STALE_DAYS } from "./backup.js";
import { KPI_CATALOG, KPI_GROUPS } from "./stats.js";
import { renderFacilityForm } from "./facilityForm.js";

(async function () {
  const $ = (id) => document.getElementById(id);
  const settings = await getSettings();

  /* ---- 9-1: 表示する指標(9枠)---- */
  function renderKpiSlots() {
    const list = $("kpiSlotList");
    list.innerHTML = "";
    settings.kpis.forEach((id, i) => {
      const row = document.createElement("div");
      row.className = "kpi-slot";
      const no = document.createElement("span");
      no.className = "slot-no";
      no.textContent = i + 1;
      const select = document.createElement("select");
      KPI_GROUPS.forEach((g) => {
        const og = document.createElement("optgroup");
        og.label = g.label;
        KPI_CATALOG.filter((k) => k.group === g.key).forEach((k) => {
          const opt = document.createElement("option");
          opt.value = k.id;
          opt.textContent = k.label;
          og.appendChild(opt);
        });
        select.appendChild(og);
      });
      select.value = id;
      select.addEventListener("change", async () => {
        const newId = select.value;
        const otherIdx = settings.kpis.indexOf(newId);
        if (otherIdx !== -1 && otherIdx !== i) {
          // 同じ指標が既に別の枠にある場合は、その枠と入れ替える(重複させない)
          settings.kpis[otherIdx] = settings.kpis[i];
        }
        settings.kpis[i] = newId;
        await saveSettings(settings);
        renderKpiSlots();
      });
      row.appendChild(no);
      row.appendChild(select);
      list.appendChild(row);
    });
  }
  renderKpiSlots();

  const grid = $("clubToggleGrid");
  function renderClubs() {
    grid.innerHTML = "";
    CLUB_MASTER.forEach((c) => {
      const b = document.createElement("button");
      const isPt = c === "PT";
      const on = isPt || settings.clubs.includes(c);
      b.className = "club-toggle" + (on ? " on" : "");
      b.textContent = c;
      if (isPt) b.disabled = true;
      b.addEventListener("click", async () => {
        const idx = settings.clubs.indexOf(c);
        if (idx >= 0) settings.clubs.splice(idx, 1);
        else settings.clubs.push(c);
        // マスター順を保つ
        settings.clubs = CLUB_MASTER.filter((m) => settings.clubs.includes(m));
        await saveSettings(settings);
        renderClubs();
      });
      grid.appendChild(b);
    });
  }
  renderClubs();

  /* ---- おまけ: 未参照コースの削除 ---- */
  // プリセットコースは削除しても次回起動時のマイグレーションで復活するため、削除対象から除外する
  const presetIds = new Set(PRESET_COURSES.map((p) => p.id));
  const courseList = $("courseList");
  let pendingDeleteCourse = null;
  async function renderCourses() {
    const [courses, rounds] = await Promise.all([getCourses(), getRounds()]);
    const usedIds = new Set(rounds.map((r) => r.courseId));
    if (courses.length === 0) {
      courseList.innerHTML = '<div class="empty-state">登録されているコースがありません。</div>';
      return;
    }
    courseList.innerHTML = "";
    courses.forEach((c) => {
      const count = rounds.filter((r) => r.courseId === c.id).length;
      const inUse = usedIds.has(c.id);
      const isPreset = presetIds.has(c.id);
      const statusText = isPreset ? "プリセットコース(削除不可)" : count > 0 ? `${count}ラウンドで使用中` : "未使用";
      const row = document.createElement("div");
      row.className = "round-card course-row";
      row.innerHTML = `
        <div class="rc-main">
          <div class="course">${c.name}</div>
          <div class="status">${statusText}</div>
        </div>`;
      const delBtn = document.createElement("button");
      delBtn.className = "rc-delete";
      delBtn.type = "button";
      delBtn.setAttribute("aria-label", "削除");
      delBtn.textContent = "🗑";
      delBtn.disabled = inUse || isPreset;
      delBtn.addEventListener("click", () => {
        if (inUse || isPreset) return;
        pendingDeleteCourse = c;
        $("courseDeleteConfirmText").textContent = `「${c.name}」を削除しますか?この操作は取り消せません。`;
        $("courseDeleteConfirmOverlay").classList.add("show");
      });
      row.appendChild(delBtn);
      courseList.appendChild(row);
    });
  }
  await renderCourses();
  $("courseDeleteConfirmNo").addEventListener("click", () => {
    pendingDeleteCourse = null;
    $("courseDeleteConfirmOverlay").classList.remove("show");
  });
  $("courseDeleteConfirmYes").addEventListener("click", async () => {
    if (!pendingDeleteCourse) return;
    await deleteCourse(pendingDeleteCourse.id);
    pendingDeleteCourse = null;
    $("courseDeleteConfirmOverlay").classList.remove("show");
    await renderCourses();
  });

  /* ---- バッチ13: ゴルフ場(Facility)+9ホールコース(Loop) ---- */
  const facilityList = $("facilityList");
  async function renderFacilities() {
    const [facilities, loops] = await Promise.all([getFacilities(), getLoops()]);
    if (facilities.length === 0) {
      facilityList.innerHTML = '<div class="empty-state">登録されているゴルフ場がありません。</div>';
      return;
    }
    facilityList.innerHTML = "";
    facilities.forEach((f) => {
      const card = document.createElement("div");
      card.className = "card facility-card";
      const fLoops = loops.filter((l) => l.facilityId === f.id);
      card.innerHTML = `<div class="fname">${f.name}</div>`;
      fLoops.forEach((loop) => {
        const total = loop.pars.reduce((a, b) => a + b, 0);
        const row = document.createElement("div");
        row.className = "facility-loop-row";
        row.innerHTML = `<div><div class="lname">${loop.name}</div><div class="lpar">Par${total}(9ホール)</div></div>`;
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "lpar-edit";
        editBtn.textContent = "Par修正";
        editBtn.addEventListener("click", () => openLoopHoles(loop));
        row.appendChild(editBtn);
        card.appendChild(row);
      });
      facilityList.appendChild(card);
    });
  }
  await renderFacilities();

  $("newFacilityBtn").addEventListener("click", () => {
    renderFacilityForm($("facilityFormContainer"), async () => {
      $("facilityNewOverlay").classList.remove("show");
      await renderFacilities();
    }, () => $("facilityNewOverlay").classList.remove("show"));
    $("facilityNewOverlay").classList.add("show");
  });

  // Loopの9ホール一覧(タップでPar修正。既存のPar修正と同じ「選ぶ→確定する」方式)
  let editingLoop = null, editingHoleIdx = null, loopParSelected = null;
  function openLoopHoles(loop) {
    editingLoop = loop;
    $("loopHolesTitle").textContent = `${loop.name}のPar`;
    const list = $("loopHoleList");
    list.innerHTML = "";
    loop.pars.forEach((par, i) => {
      const item = document.createElement("div");
      item.className = "lh-item";
      item.innerHTML = `<div class="lh-no">${i + 1}番</div><button type="button" class="lh-par-btn" data-i="${i}">Par ${par}</button>`;
      list.appendChild(item);
    });
    Array.prototype.forEach.call(list.querySelectorAll(".lh-par-btn"), (btn) => {
      btn.addEventListener("click", () => {
        editingHoleIdx = +btn.dataset.i;
        $("loopParEditTitle").textContent = `${loop.name} ${editingHoleIdx + 1}番のParを変更`;
        renderLoopParEditChips(loop.pars[editingHoleIdx]);
        $("loopParEditOverlay").classList.add("show");
      });
    });
    $("loopHolesOverlay").classList.add("show");
  }
  $("loopHolesCloseBtn").addEventListener("click", () => $("loopHolesOverlay").classList.remove("show"));

  function renderLoopParEditChips(current) {
    loopParSelected = current;
    Array.prototype.forEach.call(document.querySelectorAll("#loopParEditChips .chip-toggle"), (b) => {
      b.classList.toggle("selected", +b.dataset.par === current);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("#loopParEditChips .chip-toggle"), (b) => {
    b.addEventListener("click", () => renderLoopParEditChips(+b.dataset.par));
  });
  $("loopParEditCancel").addEventListener("click", () => $("loopParEditOverlay").classList.remove("show"));
  $("loopParEditApply").addEventListener("click", async () => {
    $("loopParEditOverlay").classList.remove("show");
    if (editingLoop && editingHoleIdx !== null && loopParSelected !== editingLoop.pars[editingHoleIdx]) {
      editingLoop.pars[editingHoleIdx] = loopParSelected;
      await saveLoop(editingLoop);
      openLoopHoles(editingLoop);
      await renderFacilities();
    }
    editingHoleIdx = null;
  });

  function renderBackupStatus() {
    const last = getLastBackupAt();
    const days = daysSinceLastBackup();
    const stale = days >= STALE_DAYS;
    const el = $("backupStatus");
    el.className = "backup-status" + (stale ? " stale" : "");
    el.textContent = last
      ? `最終バックアップ: ${last.toLocaleString("ja-JP")}${stale ? `(${Math.floor(days)}日経過・そろそろバックアップを)` : ""}`
      : "まだバックアップがありません。";
  }
  renderBackupStatus();

  $("exportBtn").addEventListener("click", async () => {
    await exportBackup();
    renderBackupStatus();
  });

  $("importBtn").addEventListener("click", () => $("importFile").click());

  let pendingFile = null;
  $("importFile").addEventListener("change", (e) => {
    pendingFile = e.target.files[0] || null;
    if (pendingFile) $("importConfirmOverlay").classList.add("show");
  });
  $("importConfirmNo").addEventListener("click", () => {
    $("importConfirmOverlay").classList.remove("show");
    $("importFile").value = "";
    pendingFile = null;
  });
  $("importConfirmYes").addEventListener("click", async () => {
    if (!pendingFile) return;
    try {
      await importBackupFile(pendingFile);
      $("importConfirmOverlay").classList.remove("show");
      $("backupStatus").textContent = "インポートが完了しました。ホームに戻ります…";
      setTimeout(() => { location.href = "index.html"; }, 900);
    } catch (err) {
      $("importConfirmOverlay").classList.remove("show");
      alert("インポートに失敗しました: " + err.message);
    }
  });
})();
