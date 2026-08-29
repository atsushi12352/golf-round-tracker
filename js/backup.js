// バックアップ(JSONエクスポート/インポート)。最終バックアップ日時はlocalStorageに保持。
import { exportAllData, importAllData } from "./db.js";

const LAST_BACKUP_KEY = "golf-log:last-backup-at";
export const STALE_DAYS = 7;

export function getLastBackupAt() {
  const v = localStorage.getItem(LAST_BACKUP_KEY);
  return v ? new Date(v) : null;
}

function setLastBackupAt(date) {
  localStorage.setItem(LAST_BACKUP_KEY, date.toISOString());
}

export function daysSinceLastBackup() {
  const last = getLastBackupAt();
  if (!last) return Infinity;
  return (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
}

export async function exportBackup() {
  const data = await exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `golf-log-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setLastBackupAt(new Date());
}

export async function importBackupFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || (!data.rounds && !data.settings && !data.courses)) {
    throw new Error("バックアップファイルの形式が正しくありません");
  }
  await importAllData(data);
  setLastBackupAt(new Date());
}
