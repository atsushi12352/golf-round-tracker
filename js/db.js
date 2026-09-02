// IndexedDBラッパー(golf-log DB: settings / courses / rounds)
import { DEFAULT_CLUBS, DEFAULT_KPIS } from "./clubs.js";
import { PRESET_COURSES } from "./presetCourses.js";

const DB_NAME = "golf-log";
const DB_VERSION = 1;
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
  return dbGet("courses", id);
}

export async function saveCourse(course) {
  return dbPut("courses", course);
}

/* ---------- rounds ---------- */
export async function getRounds() {
  const rounds = await dbGetAll("rounds");
  rounds.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rounds;
}

export async function getRound(id) {
  return dbGet("rounds", id);
}

export async function saveRound(round) {
  return dbPut("rounds", round);
}

export async function deleteRound(id) {
  return dbDelete("rounds", id);
}

/* ---------- backup用: 全データ入出力 ---------- */
export async function exportAllData() {
  const [settings, courses, rounds] = await Promise.all([
    getSettings(), getCourses(), getRounds()
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), settings, courses, rounds };
}

export async function importAllData(data) {
  await dbClear("settings");
  await dbClear("courses");
  await dbClear("rounds");
  if (data.settings) await dbPut("settings", { ...data.settings, id: SETTINGS_ID });
  if (Array.isArray(data.courses)) {
    for (const c of data.courses) await dbPut("courses", c);
  }
  if (Array.isArray(data.rounds)) {
    for (const r of data.rounds) await dbPut("rounds", r);
  }
}
