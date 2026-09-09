// IndexedDBラッパー(golf-log DB: settings / courses / rounds)
import { DEFAULT_CLUBS, DEFAULT_KPIS } from "./clubs.js";
import { PRESET_COURSES } from "./presetCourses.js";

const DB_NAME = "golf-log";
const DB_VERSION = 2;
const SETTINGS_ID = "main";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("courses")) {
        db.createObjectStore("courses", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("rounds")) {
        db.createObjectStore("rounds", { keyPath: "id" });
      }
      // バッチ13: ゴルフ場(Facility)+9ホールコース(Loop)。DB_VERSION 1→2で追加。
      if (!db.objectStoreNames.contains("facilities")) {
        db.createObjectStore("facilities", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("loops")) {
        db.createObjectStore("loops", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet(storeName, key) {
  const store = await tx(storeName, "readonly");
  return wrapReq(store.get(key));
}

export async function dbGetAll(storeName) {
  const store = await tx(storeName, "readonly");
  return wrapReq(store.getAll());
}

export async function dbPut(storeName, value) {
  const store = await tx(storeName, "readwrite");
  return wrapReq(store.put(value));
}

export async function dbDelete(storeName, key) {
  const store = await tx(storeName, "readwrite");
  return wrapReq(store.delete(key));
}

export async function dbClear(storeName) {
  const store = await tx(storeName, "readwrite");
  return wrapReq(store.clear());
}

export function newId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

/* ---------- settings ---------- */
export async function getSettings() {
  let s = await dbGet("settings", SETTINGS_ID);
  if (!s) {
    s = { id: SETTINGS_ID, clubs: DEFAULT_CLUBS.slice(), kpis: DEFAULT_KPIS.slice() };
    await dbPut("settings", s);
  } else if (!Array.isArray(s.kpis) || s.kpis.length !== 9) {
    // 9-1: 既存設定にkpisフィールドが無い場合の非破壊マイグレーション(不足分を補うだけ)
    s.kpis = DEFAULT_KPIS.slice();
    await dbPut("settings", s);
  }
  return s;
}

export async function saveSettings(settings) {
  settings.id = SETTINGS_ID;
  return dbPut("settings", settings);
}

/* ---------- courses ---------- */
// 3-1: 未登録のプリセットコースがあれば追加する(同名の手動登録済みコースがあれば作らない)
export async function ensurePresetCourses() {
  const existing = await dbGetAll("courses");
  const existingNames = new Set(existing.map((c) => c.name));
  for (const preset of PRESET_COURSES) {
    if (!existingNames.has(preset.name)) {
      await dbPut("courses", { id: preset.id, name: preset.name, pars: preset.pars.slice() });
    }
  }
}

export async function getCourses() {
  await ensurePresetCourses();
  return dbGetAll("courses");
}

export async function getCourse(id) {
  // バッチ13: ゴルフ場登録(9ホール単体・facilityId経由)のラウンドはcourseIdを
  // 持たないことがある(IndexedDBのget()はキーにundefinedを渡すと例外になるため防御する)。
  return id ? dbGet("courses", id) : undefined;
}

export async function saveCourse(course) {
  return dbPut("courses", course);
}

export async function deleteCourse(id) {
  return dbDelete("courses", id);
}

/* ---------- バッチ13: ゴルフ場(Facility) / 9ホールコース(Loop) ----------
   日本のゴルフ場は「9ホールのコースが3つ以上あり、その組み合わせで18ホールを回る」
   構成が多いため、旧来の「Course=18ホール固定」を Facility(ゴルフ場)+Loop(9ホール)
   に一般化する。既存の Course store は削除せず、そのまま残す(5-2のコース付け替え・
   ダッシュボードのコース別集計など、この段階では変更しない分析画面が引き続き使うため)。 */
export async function getFacilities() {
  await ensureFacilitiesFromCourses();
  return dbGetAll("facilities");
}
export async function getFacility(id) {
  return id ? dbGet("facilities", id) : undefined;
}
export async function saveFacility(f) {
  return dbPut("facilities", f);
}

export async function getLoops() {
  return dbGetAll("loops");
}
export async function getLoop(id) {
  return id ? dbGet("loops", id) : undefined;
}
export async function saveLoop(l) {
  return dbPut("loops", l);
}
export async function loopsForFacility(facilityId) {
  const loops = await getLoops();
  return loops.filter((l) => l.facilityId === facilityId);
}
export async function deleteLoop(id) {
  return dbDelete("loops", id);
}

// バッチ13改訂: ゴルフ場の削除。配下のLoopもすべて削除する。プリセット・使用中の
// チェックは呼び出し側(settings.js)の責任(この関数自体は行わない)。
// 旧Course由来のFacility(id が "fac-"+courseId)の場合は、元のCourseレコードも
// 一緒に削除する(残すと ensureFacilitiesFromCourses が次回アクセス時に復活させてしまうため)。
export async function deleteFacility(id) {
  const loops = await loopsForFacility(id);
  for (const l of loops) await dbDelete("loops", l.id);
  await dbDelete("facilities", id);
  if (id.indexOf("fac-") === 0) {
    const courseId = id.slice(4);
    const course = await dbGet("courses", courseId);
    if (course) await dbDelete("courses", courseId);
  }
}

// 既存の Course{id,name,pars[18]} を Facility+Loop(OUT/IN)に変換する(非破壊・冪等)。
// Course自体は削除しない。同じFacility idが既にあれば何もしない(ensurePresetCoursesと同じ形)。
export async function ensureFacilitiesFromCourses() {
  await ensurePresetCourses(); // プリセットコース(3-1)がまだ無ければ先に用意してから変換する
  const [courses, facilities] = await Promise.all([dbGetAll("courses"), dbGetAll("facilities")]);
  const existingIds = new Set(facilities.map((f) => f.id));
  for (const course of courses) {
    const facId = "fac-" + course.id;
    if (existingIds.has(facId)) continue;
    await dbPut("facilities", { id: facId, name: course.name });
    await dbPut("loops", { id: course.id + "-out", facilityId: facId, name: "OUT", pars: course.pars.slice(0, 9) });
    await dbPut("loops", { id: course.id + "-in", facilityId: facId, name: "IN", pars: course.pars.slice(9, 18) });
  }
}

// 既存Roundに facilityId/frontLoopId/backLoopId、各holeに loopId/loopHole を補完する
// (非破壊: courseId/startは削除しない。冪等: 既にfacilityIdがあれば何もしない)。
// 「摩周コース3番」はどの順番で回っても同じ集計対象になるよう、hole.loopId/loopHoleは
// そのホールの実ホール番号(1-9→OUTループ, 10-18→INループ)だけから決まる
// (round.start / frontLoopIdには依存しない)。
export async function ensureRoundFacilityFields(round) {
  if (round.facilityId || !round.courseId) return round;
  const outId = round.courseId + "-out";
  const inId = round.courseId + "-in";
  round.facilityId = "fac-" + round.courseId;
  round.frontLoopId = round.start === "IN" ? inId : outId;
  round.backLoopId = round.start === "IN" ? outId : inId;
  (round.holes || []).forEach((h) => {
    if (h.loopId && h.loopHole) return;
    h.loopId = h.number <= 9 ? outId : inId;
    h.loopHole = h.number <= 9 ? h.number : h.number - 9;
  });
  await dbPut("rounds", round);
  return round;
}

/* ---------- rounds ---------- */
export async function getRounds() {
  await ensureFacilitiesFromCourses();
  const rounds = await dbGetAll("rounds");
  for (const r of rounds) await ensureRoundFacilityFields(r);
  rounds.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rounds;
}

export async function getRound(id) {
  const round = await dbGet("rounds", id);
  if (!round) return round;
  await ensureFacilitiesFromCourses();
  return ensureRoundFacilityFields(round);
}

export async function saveRound(round) {
  return dbPut("rounds", round);
}

export async function deleteRound(id) {
  return dbDelete("rounds", id);
}

/* ---------- backup用: 全データ入出力 ----------
   バッチ13: facilities/loopsもバックアップ対象に追加(version 2)。
   旧バージョン(facilities/loopsを含まない version 1 のバックアップ)を読み込んだ
   場合は、インポート後の初回アクセス時に ensureFacilitiesFromCourses が
   courses から再生成するので非破壊的に復元できる。 */
export async function exportAllData() {
  const [settings, courses, rounds, facilities, loops] = await Promise.all([
    getSettings(), getCourses(), getRounds(), getFacilities(), getLoops()
  ]);
  return { version: 2, exportedAt: new Date().toISOString(), settings, courses, rounds, facilities, loops };
}

export async function importAllData(data) {
  await dbClear("settings");
  await dbClear("courses");
  await dbClear("rounds");
  await dbClear("facilities");
  await dbClear("loops");
  if (data.settings) await dbPut("settings", { ...data.settings, id: SETTINGS_ID });
  if (Array.isArray(data.courses)) {
    for (const c of data.courses) await dbPut("courses", c);
  }
  if (Array.isArray(data.rounds)) {
    for (const r of data.rounds) await dbPut("rounds", r);
  }
  if (Array.isArray(data.facilities)) {
    for (const f of data.facilities) await dbPut("facilities", f);
  }
  if (Array.isArray(data.loops)) {
    for (const l of data.loops) await dbPut("loops", l);
  }
}
