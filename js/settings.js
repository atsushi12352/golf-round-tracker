import { getSettings, saveSettings, getRounds, getFacilities, getLoops, saveLoop, deleteFacility, deleteLoop } from "./db.js";
import { CLUB_MASTER } from "./clubs.js";
import { PRESET_COURSES } from "./presetCourses.js";
import { exportBackup, importBackupFile, getLastBackupAt, daysSinceLastBackup, STALE_DAYS } from "./backup.js";
import { KPI_CATALOG, KPI_GROUPS } from "./stats.js";
import { renderFacilityForm, renderAddLoopForm } from "./facilityForm.js";

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

  /* ---- バッチ13改訂: ゴルフ場(Facility)+9ホールコース(Loop)の統合管理 ----
     旧「コース管理」(Course一覧・削除)と旧「ゴルフ場登録」の2カードを、この1カードに
     統合した(役割の重複を避けるため)。プリセット由来・旧Course由来のFacility/Loopの
     idはここで判定する(プリセットは削除不可)。 */
  const presetFacilityIds = new Set(PRESET_COURSES.map((p) => "fac-" + p.id));
  const presetLoopIds = new Set(PRESET_COURSES.flatMap((p) => [p.id + "-out", p.id + "-in"]));

  const facilityList = $("facilityList");
  let pendingDelete = null; // { type: "facility"|"loop", id, name }

  async function renderFacilities() {
    const [facilities, loops, rounds] = await Promise.all([getFacilities(), getLoops(), getRounds()]);
    if (facilities.length === 0) {
      facilityList.innerHTML = '<div class="empty-state">登録されているゴルフ場がありません。</div>';
      return;
    }
    facilityList.innerHTML = "";
    facilities.forEach((f) => {
      const card = document.createElement("div");
      card.className = "card facility-card";

      const fLoops = loops.filter((l) => l.facilityId === f.id);
      const fUsedCount = rounds.filter((r) => r.facilityId === f.id).length;
      const fIsPreset = presetFacilityIds.has(f.id);

      const fNameRow = document.createElement("div");
      fNameRow.style.display = "flex";
      fNameRow.style.alignItems = "center";
      fNameRow.style.justifyContent = "space-between";
      fNameRow.style.gap = "8px";
      const fName = document.createElement("div");
      fName.className = "fname";
      fName.textContent = f.name;
      fNameRow.appendChild(fName);
      const fDelBtn = document.createElement("button");
      fDelBtn.type = "button";
      fDelBtn.className = "rc-delete";
      fDelBtn.setAttribute("aria-label", "ゴルフ場を削除");
      fDelBtn.textContent = "🗑";
      fDelBtn.disabled = fIsPreset || fUsedCount > 0;
      fDelBtn.addEventListener("click", () => {
        if (fDelBtn.disabled) return;
        pendingDelete = { type: "facility", id: f.id };
        $("deleteConfirmTitle").textContent = "ゴルフ場を削除しますか?";
        $("deleteConfirmText").textContent =
          `「${f.name}」を削除しますか?登録されているコース(${fLoops.length}件)もすべて削除されます。この操作は取り消せません。`;
        $("deleteConfirmOverlay").classList.add("show");
      });
      fNameRow.appendChild(fDelBtn);
      card.appendChild(fNameRow);

      fLoops.forEach((loop) => {
        const total = loop.pars.reduce((a, b) => a + b, 0);
        const loopUsedCount = rounds.filter((r) => r.frontLoopId === loop.id || r.backLoopId === loop.id).length;
        const loopIsPreset = presetLoopIds.has(loop.id);
        const statusText = loopIsPreset ? "プリセットコース(削除不可)" : loopUsedCount > 0 ? `${loopUsedCount}ラウンドで使用中` : "未使用";

        const row = document.createElement("div");
        row.className = "facility-loop-row";
        row.innerHTML = `<div><div class="lname">${loop.name}</div><div class="lpar">Par${total}(9ホール)・${statusText}</div></div>`;

        const btnGroup = document.createElement("div");
        btnGroup.style.display = "flex";
        btnGroup.style.alignItems = "center";
        btnGroup.style.gap = "2px";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "lpar-edit";
        editBtn.textContent = "編集";
        editBtn.addEventListener("click", () => openLoopHoles(loop));
        btnGroup.appendChild(editBtn);

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "rc-delete";
        delBtn.setAttribute("aria-label", "コースを削除");
        delBtn.textContent = "🗑";
        delBtn.disabled = loopIsPreset || loopUsedCount > 0;
        delBtn.addEventListener("click", () => {
          if (delBtn.disabled) return;
          pendingDelete = { type: "loop", id: loop.id };
          $("deleteConfirmTitle").textContent = "コースを削除しますか?";
          $("deleteConfirmText").textContent = `「${loop.name}」を削除しますか?この操作は取り消せません。`;
          $("deleteConfirmOverlay").classList.add("show");
        });
        btnGroup.appendChild(delBtn);

        row.appendChild(btnGroup);
        card.appendChild(row);
      });

      const addLoopBtn = document.createElement("button");
      addLoopBtn.type = "button";
      addLoopBtn.className = "btn ghost block";
      addLoopBtn.style.marginTop = "10px";
      const atMax = fLoops.length >= 6;
      addLoopBtn.textContent = atMax ? "コースは上限(6つ)まで登録済みです" : "このゴルフ場にコースを追加";
      addLoopBtn.disabled = atMax;
      addLoopBtn.addEventListener("click", () => {
        $("loopAddTitle").textContent = `「${f.name}」にコースを追加`;
        renderAddLoopForm($("loopAddFormContainer"), f, fLoops.length, async () => {
          $("loopAddOverlay").classList.remove("show");
          await renderFacilities();
        }, () => $("loopAddOverlay").classList.remove("show"));
        $("loopAddOverlay").classList.add("show");
      });
      card.appendChild(addLoopBtn);

      facilityList.appendChild(card);
    });
  }
  await renderFacilities();

  $("deleteConfirmNo").addEventListener("click", () => {
    pendingDelete = null;
    $("deleteConfirmOverlay").classList.remove("show");
  });
  $("deleteConfirmYes").addEventListener("click", async () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === "facility") await deleteFacility(pendingDelete.id);
    else await deleteLoop(pendingDelete.id);
    pendingDelete = null;
    $("deleteConfirmOverlay").classList.remove("show");
    await renderFacilities();
  });

  $("newFacilityBtn").addEventListener("click", () => {
    renderFacilityForm($("facilityFormContainer"), async () => {
      $("facilityNewOverlay").classList.remove("show");
      await renderFacilities();
    }, () => $("facilityNewOverlay").classList.remove("show"));
    $("facilityNewOverlay").classList.add("show");
  });

  // Loopの編集(名前・Par)。名前は「入力→変更する」、Parは既存のPar修正と同じ
  // 「選ぶ→確定する」の2段階方式(タップ即反映にしない)。
  let editingLoop = null, editingHoleIdx = null, loopParSelected = null;
  function openLoopHoles(loop) {
    editingLoop = loop;
    $("loopHolesTitle").textContent = `${loop.name}の編集`;
    $("loopNameInput").value = loop.name;
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

  $("loopNameApplyBtn").addEventListener("click", async () => {
    if (!editingLoop) return;
    const newName = $("loopNameInput").value.trim();
    if (!newName || newName === editingLoop.name) return;
    editingLoop.name = newName;
    await saveLoop(editingLoop);
    $("loopHolesTitle").textContent = `${editingLoop.name}の編集`;
    await renderFacilities();
  });

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
