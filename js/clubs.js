// クラブマスターと既定設定値
export const CLUB_MASTER = [
  "1W", "3W", "5W", "7W", "UT",
  "2I", "3I", "4I", "5I", "6I", "7I", "8I", "9I",
  "PW", "AW", "SW", "LW", "PT"
];

// v1既定のアクティブクラブ(モックと同じ13本)
export const DEFAULT_CLUBS = [
  "1W", "3W", "5W", "UT", "5I", "6I", "7I", "8I", "9I", "PW", "AW", "SW", "PT"
];

// SPEC §6.2 のKPI9項目(内部ID、v2でカスタマイズUIを開放する前提の並び順)
export const DEFAULT_KPIS = [
  "putts", "fwKeep", "gir", "bogeyOn", "scramble", "sandSave", "threePutts", "penalty", "niceRate"
];

export const TEES = ["赤", "白", "青", "黒"];

export const PUTT_DISTS = [
  { key: "ロング", note: "10m〜" },
  { key: "ミドル", note: "3〜10m" },
  { key: "ショート", note: "1〜3m" },
  { key: "1m以内", note: "タップイン" }
];

export const LIES = ["ティー", "FW", "ラフ", "バンカー", "林"];
