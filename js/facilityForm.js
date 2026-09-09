// バッチ13: ゴルフ場(Facility)+9ホールコース(Loop)の登録フォーム。
// settings.html(ゴルフ場・コース管理カード)・round-start.html(その場で新規登録)の
// 両方から使う共通コンポーネント(ロジックの二重管理を避けるため)。
// バッチ13改訂: 新規ゴルフ場登録(renderFacilityForm)に加え、既存ゴルフ場への
// コース追加(renderAddLoopForm)も同じ描画ロジック(renderLoopForm)を共有する。
import { saveFacility, saveLoop, newId } from "./db.js";

const MAX_LOOPS = 6;
const PAR_CYCLE = [3, 4, 5];

function newLoopDraft(name) {
  return { name: name || "", pars: Array(9).fill(4) };
}

// container: フォームを差し込むDOM要素(空にして使う)。
// state: { mode, loops, errMsg }(呼び出し元が保持する可変オブジェクト)。
// opts: {
//   maxTotal: このフォームで作成できるコース数の上限(新規登録なら6、追加なら6-既存数),
//   showNameField: ゴルフ場名の入力欄を出すか,
//   registerLabel: 確定ボタンの文言,
//   onSubmit(name, loops): 確定時に呼ばれる(async)。name はshowNameFieldのときのみ意味を持つ,
//   onCancel: 「やめる」時に呼ばれる(任意)
// }
function renderLoopForm(container, state, opts) {
  function setMode(m) {
    state.mode = m;
    state.errMsg = "";
    state.loops = m === "full18" ? [newLoopDraft("OUT"), newLoopDraft("IN")] : [newLoopDraft()];
    render();
  }

  function addLoop() {
    if (state.loops.length >= opts.maxTotal) return;
    state.loops.push(newLoopDraft());
    render();
  }

  function removeLoop(i) {
    if (state.loops.length <= 1) return;
    state.loops.splice(i, 1);
    render();
  }

  function cyclePar(loopIdx, holeIdx) {
    const cur = state.loops[loopIdx].pars[holeIdx];
    const next = PAR_CYCLE[(PAR_CYCLE.indexOf(cur) + 1) % PAR_CYCLE.length];
    state.loops[loopIdx].pars[holeIdx] = next;
    render();
  }

  function render() {
    container.innerHTML = "";

    if (opts.maxTotal <= 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "これ以上コースを追加できません(1ゴルフ場につき最大6コースまで)。";
      container.appendChild(empty);
      if (opts.onCancel) {
        const btnRow = document.createElement("div");
        btnRow.className = "sheet-btns";
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "sheet-btn ghost";
        cancelBtn.textContent = "閉じる";
        cancelBtn.addEventListener("click", opts.onCancel);
        btnRow.appendChild(cancelBtn);
        container.appendChild(btnRow);
      }
      return;
    }

    const modeRow = document.createElement("div");
    modeRow.className = "seg-row";
    [["step9", "9ホールずつ追加"], ["full18", "18ホールとして登録"]].forEach(([key, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-btn" + (state.mode === key ? " selected" : "");
      b.textContent = label;
      b.disabled = key === "full18" && opts.maxTotal < 2;
      b.addEventListener("click", () => setMode(key));
      modeRow.appendChild(b);
    });
    container.appendChild(modeRow);

    if (opts.showNameField) {
      const nameField = document.createElement("div");
      nameField.className = "field";
      nameField.innerHTML = '<label>ゴルフ場名</label><input type="text" id="facilityNameInput" placeholder="例:恵庭カントリー倶楽部">';
      container.appendChild(nameField);
      if (container._pendingName) nameField.querySelector("input").value = container._pendingName;
      nameField.querySelector("input").addEventListener("input", (e) => { container._pendingName = e.target.value; });
    }

    state.loops.forEach((loop, li) => {
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

      if (state.mode === "step9" && state.loops.length > 1) {
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "loop-remove-btn";
        rm.textContent = "このコースを削除";
        rm.addEventListener("click", () => removeLoop(li));
        block.appendChild(rm);
      }
      container.appendChild(block);
    });

    if (state.mode === "step9") {
      const atMax = state.loops.length >= opts.maxTotal;
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn ghost block";
      addBtn.textContent = atMax ? "これ以上追加できません(上限)" : "9ホールのコースを追加";
      addBtn.disabled = atMax;
      addBtn.addEventListener("click", addLoop);
      container.appendChild(addBtn);
    }

    if (state.errMsg) {
      const err = document.createElement("div");
      err.className = "empty-state";
      err.style.color = "var(--danger)";
      err.textContent = state.errMsg;
      container.appendChild(err);
    }

    const btnRow = document.createElement("div");
    btnRow.className = "sheet-btns";
    const registerBtn = document.createElement("button");
    registerBtn.type = "button";
    registerBtn.className = "sheet-btn primary";
    registerBtn.textContent = opts.registerLabel;
    registerBtn.addEventListener("click", submit);
    btnRow.appendChild(registerBtn);
    if (opts.onCancel) {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "sheet-btn ghost";
      cancelBtn.textContent = "やめる";
      cancelBtn.addEventListener("click", opts.onCancel);
      btnRow.appendChild(cancelBtn);
    }
    container.appendChild(btnRow);
  }

  async function submit() {
    if (opts.showNameField) {
      const name = (container._pendingName || "").trim();
      if (!name) { state.errMsg = "ゴルフ場名を入力してください。"; render(); return; }
    }
    if (state.loops.some((l) => !l.name.trim())) { state.errMsg = "すべてのコースに名前を入力してください。"; render(); return; }
    if (state.loops.length === 0) { state.errMsg = "コースを1つ以上追加してください。"; render(); return; }
    if (state.loops.length > opts.maxTotal) { state.errMsg = "コースが多すぎます(上限を超えています)。"; render(); return; }
    await opts.onSubmit(container._pendingName ? container._pendingName.trim() : null, state.loops);
  }

  render();
}

// 新規ゴルフ場の登録(ゴルフ場名 + 9ホールコースを1つ以上)。
// onDone(facility, loops): 登録が完了したら呼ばれる。onCancel(): 「やめる」時に呼ばれる(任意)。
export function renderFacilityForm(container, onDone, onCancel) {
  const state = { mode: "step9", loops: [newLoopDraft()], errMsg: "" };
  renderLoopForm(container, state, {
    maxTotal: MAX_LOOPS,
    showNameField: true,
    registerLabel: "登録する",
    onCancel,
    onSubmit: async (name, loops) => {
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
  });
}

// バッチ13改訂: 既存ゴルフ場にコース(9ホール、または「18ホールとして登録」でOUT/INの
// 2コース一括)を追加する。設定画面の「ゴルフ場・コース管理」カードから使う。
// existingCount: そのゴルフ場が既に持っているコース数(1ゴルフ場につき最大6コースまで)。
// onDone(loops): 追加が完了したら呼ばれる。
export function renderAddLoopForm(container, facility, existingCount, onDone, onCancel) {
  const state = { mode: "step9", loops: [newLoopDraft()], errMsg: "" };
  renderLoopForm(container, state, {
    maxTotal: Math.max(0, MAX_LOOPS - existingCount),
    showNameField: false,
    registerLabel: "追加する",
    onCancel,
    onSubmit: async (_name, loops) => {
      const savedLoops = [];
      for (const l of loops) {
        const loop = { id: newId(), facilityId: facility.id, name: l.name.trim(), pars: l.pars.slice() };
        await saveLoop(loop);
        savedLoops.push(loop);
      }
      onDone(savedLoops);
    }
  });
}
