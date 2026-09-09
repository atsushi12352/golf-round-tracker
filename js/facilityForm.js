// バッチ13: ゴルフ場(Facility)+9ホールコース(Loop)の新規登録フォーム。
// settings.html(ゴルフ場登録カード)・round-start.html(その場で新規登録)の
// 両方から使う共通コンポーネント(ロジックの二重管理を避けるため)。
import { saveFacility, saveLoop, newId } from "./db.js";

const MAX_LOOPS = 6;
const PAR_CYCLE = [3, 4, 5];

function newLoopDraft(name) {
  return { name: name || "", pars: Array(9).fill(4) };
}

// container: フォームを差し込むDOM要素(空にして使う)。
// onDone(facility, loops): 登録が完了したら呼ばれる。onCancel(): 「やめる」時に呼ばれる(任意)。
export function renderFacilityForm(container, onDone, onCancel) {
  let mode = "step9"; // "step9"(9ホールずつ追加) | "full18"(18ホールとして一括登録)
  let loops = [newLoopDraft()];
  let errMsg = "";

  function setMode(m) {
    mode = m;
    errMsg = "";
    loops = m === "full18" ? [newLoopDraft("OUT"), newLoopDraft("IN")] : [newLoopDraft()];
    render();
  }

  function addLoop() {
    if (loops.length >= MAX_LOOPS) return;
    loops.push(newLoopDraft());
    render();
  }

  function removeLoop(i) {
    if (loops.length <= 1) return;
    loops.splice(i, 1);
    render();
  }

  function cyclePar(loopIdx, holeIdx) {
    const cur = loops[loopIdx].pars[holeIdx];
    const next = PAR_CYCLE[(PAR_CYCLE.indexOf(cur) + 1) % PAR_CYCLE.length];
    loops[loopIdx].pars[holeIdx] = next;
    render();
  }

  function render() {
    container.innerHTML = "";

    const modeRow = document.createElement("div");
    modeRow.className = "seg-row";
    [["step9", "9ホールずつ追加"], ["full18", "18ホールとして登録"]].forEach(([key, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-btn" + (mode === key ? " selected" : "");
      b.textContent = label;
      b.addEventListener("click", () => setMode(key));
      modeRow.appendChild(b);
    });
    container.appendChild(modeRow);

    const nameField = document.createElement("div");
    nameField.className = "field";
    nameField.innerHTML = '<label>ゴルフ場名</label><input type="text" id="facilityNameInput" placeholder="例:恵庭カントリー倶楽部">';
    container.appendChild(nameField);
    if (container._pendingName) nameField.querySelector("input").value = container._pendingName;
    nameField.querySelector("input").addEventListener("input", (e) => { container._pendingName = e.target.value; });

    loops.forEach((loop, li) => {
      const block = document.createElement("div");
      block.className = "facility-loop-block";
      const nameRow = document.createElement("div");
      nameRow.className = "field";
      nameRow.innerHTML = `<label>コース名(9ホール)</label><input type="text" class="loopNameInput" placeholder="例:摩周コース">`;
      const nameInput = nameRow.querySelector("input");
      nameInput.value = loop.name;
      nameInput.addEventListener("input", (e) => { loop.name = e.target.value; });
      block.appendChild(nameRow);

      const parGrid = document.createElement("div");
      parGrid.className = "par-pick-grid";
      loop.pars.forEach((p, hi) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "par-pick";
        b.innerHTML = `<small>${hi + 1}</small>${p}`;
        b.addEventListener("click", () => cyclePar(li, hi));
        parGrid.appendChild(b);
      });
      block.appendChild(parGrid);

      if (mode === "step9" && loops.length > 1) {
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "loop-remove-btn";
        rm.textContent = "このコースを削除";
        rm.addEventListener("click", () => removeLoop(li));
        block.appendChild(rm);
      }
      container.appendChild(block);
    });

    if (mode === "step9") {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn ghost block";
      addBtn.textContent = loops.length >= MAX_LOOPS ? "これ以上追加できません(最大6コース)" : "9ホールのコースを追加";
      addBtn.disabled = loops.length >= MAX_LOOPS;
      addBtn.addEventListener("click", addLoop);
      container.appendChild(addBtn);
    }

    if (errMsg) {
      const err = document.createElement("div");
      err.className = "empty-state";
      err.style.color = "var(--danger)";
      err.textContent = errMsg;
      container.appendChild(err);
    }

    const btnRow = document.createElement("div");
    btnRow.className = "sheet-btns";
    const registerBtn = document.createElement("button");
    registerBtn.type = "button";
    registerBtn.className = "sheet-btn primary";
    registerBtn.textContent = "登録する";
    registerBtn.addEventListener("click", submit);
    btnRow.appendChild(registerBtn);
    if (onCancel) {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "sheet-btn ghost";
      cancelBtn.textContent = "やめる";
      cancelBtn.addEventListener("click", onCancel);
      btnRow.appendChild(cancelBtn);
    }
    container.appendChild(btnRow);
  }

  async function submit() {
    const name = (container._pendingName || "").trim();
    if (!name) { errMsg = "ゴルフ場名を入力してください。"; render(); return; }
    if (loops.some((l) => !l.name.trim())) { errMsg = "すべてのコースに名前を入力してください。"; render(); return; }
    if (loops.length === 0) { errMsg = "コースを1つ以上追加してください。"; render(); return; }

    const facility = { id: newId(), name };
    await saveFacility(facility);
    const savedLoops = [];
    for (const l of loops) {
      const loop = { id: newId(), facilityId: facility.id, name: l.name.trim(), pars: l.pars.slice() };
      await saveLoop(loop);
      savedLoops.push(loop);
    }
    onDone(facility, savedLoops);
  }

  render();
}
