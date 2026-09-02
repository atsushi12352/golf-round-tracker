// 3-1: ホームコースのプリセット(公式サイトのコース案内から取得した値)。
// 未登録なら追加するマイグレーションで使う。実際のスコアカードと異なる場合は
// ラウンド中のPar切替 / 振り返り画面のPar修正でコースマスターに反映できる。
export const PRESET_COURSES = [
  {
    id: "preset-sapporo-regent-new",
    name: "札幌リージェントGC 新コース",
    pars: [5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4]
  },
  {
    id: "preset-sapporo-regent-old",
    name: "札幌リージェントGC 旧コース",
    pars: [5, 4, 3, 4, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4]
  },
  {
    id: "preset-sapporo-regent-thomson",
    name: "札幌リージェントGC トムソンコース",
    pars: [4, 4, 4, 5, 3, 4, 5, 3, 4, 4, 3, 5, 4, 5, 3, 4, 4, 4]
  }
];
