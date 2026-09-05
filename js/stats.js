// SPEC §5・§6 の集計ロジック(モックの計算式をShot配列ベースに一般化)
import { PUTT_DISTS, DEFAULT_KPIS } from "./clubs.js";

/* ---------- §5 自動推測ルール ---------- */
export function inferLie(shots) {
  if (shots.length === 0) return "ティー";
  const last = shots[shots.length - 1];
  if (last.kind === "penalty") return "ラフ";
  // 7-1b: OBは前進(adv=true)なら特設ティー=FW扱い、打ち直しなら元のライに戻る
  if (last.kind === "ob") return last.adv ? "FW" : last.lie;
  if (last.kind === "miss") return last.lie;
  if (last.result.indexOf("左") >= 0 || last.result.indexOf("右") >= 0) return "ラフ";
  return "FW";
}

export function inferPuttDist(shots) {
  const isFirst = shots.filter((s) => s.club === "PT").length === 0;
  return isFirst ? "ミドル" : "1m以内";
}

/* ---------- 3-2: IN/OUTスタート ---------- */
// プレー順(1打目のホール〜18打目のホール)に対応する実ホール番号の配列
// OUT: 1,2,...,18 / IN: 10,11,...,18,1,2,...,9
export function playOrderNumbers(start) {
  const numbers = [];
  if (start === "IN") {
    for (let n = 10; n <= 18; n++) numbers.push(n);
    for (let n = 1; n <= 9; n++) numbers.push(n);
  } else {
    for (let n = 1; n <= 18; n++) numbers.push(n);
  }
  return numbers;
}

/* ---------- 6-3: グリーンサイドバンカー判定 ----------
   バンカーのライから打ったショットの次のショットがパット(またはそのショット自体が
   カップイン)であるとき、そのバンカーはグリーンサイドとみなす。
   フェアウェイバンカー(そこから普通のショットが続く)はサンドセーブの母数から除外する。 */
function hasGreensideBunker(shots) {
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (s.lie !== "バンカー") continue;
    if (s.kind === "in") return true;
    const next = shots[i + 1];
    if (next && next.club === "PT") return true;
  }
  return false;
}

/* ---------- §6.1 ホール単位 ---------- */
export function holeStats(hole) {
  const shots = hole.shots || [];
  const obShots = shots.filter((s) => s.kind === "ob");
  const obCount = obShots.length;
  const penaltyCount = shots.filter((s) => s.kind === "penalty").length;
  // 6-1b: OBは打ち直し(+1)/前進(+2)、赤杭・池のペナルティは常に+1
  const pen = obShots.reduce((a, s) => a + (s.adv ? 2 : 1), 0) + penaltyCount;
  const putts = shots.filter((s) => s.club === "PT").length;
  const score = shots.length + pen;
  const toGreen = shots.length - putts + pen;
  const gir = toGreen <= hole.par - 2;
  const bogeyOn = toGreen <= hole.par - 1;
  const scramble = !gir && score <= hole.par;
  const bunker = shots.some((s) => s.lie === "バンカー");
  const gsBunker = hasGreensideBunker(shots);
  const choro = shots.filter((s) => s.kind === "miss").length;
  const tee = shots[0];
  let fwKeep = null;
  if (hole.par >= 4 && tee) {
    fwKeep = tee.kind !== "ob" && tee.kind !== "penalty" && tee.kind !== "miss"
      && tee.result.indexOf("左") < 0 && tee.result.indexOf("右") < 0;
  }
  return {
    number: hole.number, par: hole.par, score, putts, pen, obCount, penaltyCount,
    gir, bogeyOn, scramble, fwKeep, bunker, gsBunker,
    choro, three: putts >= 3, sandSave: gsBunker && score <= hole.par
  };
}

export function roundTotals(holes) {
  const HS = holes.map(holeStats);
  return {
    HS,
    score: HS.reduce((a, h) => a + h.score, 0),
    par: HS.reduce((a, h) => a + h.par, 0),
    putts: HS.reduce((a, h) => a + h.putts, 0),
    pen: HS.reduce((a, h) => a + h.pen, 0)
  };
}

/* ---------- 9-1: KPIカタログ(選択式タイル用) ----------
   各エントリの calc(holes) は { value, num?, den? } を返す。
   value は「そのラウンド1件分」の生の値(未丸め)。率は0-100、平均はそのままの数値、
   件数はそのままの整数。null は「このラウンドでは計算不能」を表す。
   kind: "rate"(%、num/den付き) | "count"(整数) | "avg"(平均、num/den付き) | "diff"(差分、符号付き) */
function rateAgg(num, den) { return { value: den ? (num / den) * 100 : null, num, den }; }
function avgAgg(sum, den) { return { value: den ? sum / den : null, num: sum, den }; }

export const KPI_GROUPS = [
  { key: "score", label: "スコア系" },
  { key: "tee", label: "ティーショット系" },
  { key: "shot", label: "ショット系" },
  { key: "short", label: "ショートゲーム系" },
  { key: "putt", label: "パット系" }
];

export const KPI_CATALOG = [
  /* ---- スコア系 ---- */
  {
    id: "penalty", group: "score", label: "ペナルティ打数", unit: "打", dashDigits: 1, lowerBetter: true, kind: "count",
    calc: (holes) => ({ value: holes.map(holeStats).reduce((a, h) => a + h.pen, 0) })
  },
  {
    id: "dboOver", group: "score", label: "ダボ以上", unit: "", dashDigits: 1, lowerBetter: true, kind: "count",
    calc: (holes) => ({ value: holes.map(holeStats).filter((h) => h.score >= h.par + 2).length })
  },
  {
    id: "parSaveRate", group: "score", label: "パーセーブ率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats); return rateAgg(HS.filter((h) => h.score <= h.par).length, HS.length); }
  },
  {
    id: "birdies", group: "score", label: "バーディ数", unit: "", dashDigits: 1, lowerBetter: false, kind: "count",
    calc: (holes) => ({ value: holes.map(holeStats).filter((h) => h.score <= h.par - 1).length })
  },
  {
    id: "frontBackDiff", group: "score", label: "前半/後半スコア差", unit: "打", dashDigits: 1, lowerBetter: null, kind: "diff",
    calc: (holes) => {
      if (holes.length < 18) return { value: null };
      const HS = holes.map(holeStats);
      const front = HS.slice(0, 9).reduce((a, h) => a + h.score, 0);
      const back = HS.slice(9, 18).reduce((a, h) => a + h.score, 0);
      return { value: front - back };
    }
  },
  /* ---- ティーショット系 ---- */
  {
    id: "fwKeep", group: "tee", label: "FWキープ率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats); const fw = HS.filter((h) => h.fwKeep !== null); return rateAgg(fw.filter((h) => h.fwKeep).length, fw.length); }
  },
  {
    id: "teeSafeRate", group: "tee", label: "ティーショット無事率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => {
      const HS = holes.map(holeStats);
      const teeHoles = holes.filter((h, i) => HS[i].par >= 4 && h.shots && h.shots[0]);
      const safe = teeHoles.filter((h) => { const t = h.shots[0]; return t.kind !== "ob" && t.kind !== "penalty" && t.kind !== "miss"; });
      return rateAgg(safe.length, teeHoles.length);
    }
  },
  {
    id: "fwKeepScoreDiff", group: "tee", label: "FWキープ時とミス時のスコア差", unit: "打", dashDigits: 1, lowerBetter: null, kind: "diff",
    calc: (holes) => {
      const HS = holes.map(holeStats).filter((h) => h.fwKeep !== null);
      const kept = HS.filter((h) => h.fwKeep), missed = HS.filter((h) => !h.fwKeep);
      if (!kept.length || !missed.length) return { value: null };
      const avg = (arr) => arr.reduce((a, h) => a + h.score, 0) / arr.length;
      return { value: avg(kept) - avg(missed) };
    }
  },
  /* ---- ショット系 ---- */
  {
    id: "gir", group: "shot", label: "パーオン率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats); return rateAgg(HS.filter((h) => h.gir).length, HS.length); }
  },
  {
    id: "bogeyOn", group: "shot", label: "ボギーオン率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats); return rateAgg(HS.filter((h) => h.bogeyOn).length, HS.length); }
  },
  {
    id: "niceRate", group: "shot", label: "ナイス率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const shots = heat13Shots(holes.flatMap((h) => h.shots)); return rateAgg(shots.filter((s) => s.kind === "nice").length, shots.length); }
  },
  {
    id: "clubNiceDR", group: "shot", label: "ナイス率(ドライバー)", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const shots = heat13Shots(holes.flatMap((h) => h.shots)).filter((s) => CLUB_GROUPS.find((g) => g.key === "DR").test(s.club)); return rateAgg(shots.filter((s) => s.kind === "nice").length, shots.length); }
  },
  {
    id: "clubNiceIR", group: "shot", label: "ナイス率(アイアン)", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const shots = heat13Shots(holes.flatMap((h) => h.shots)).filter((s) => CLUB_GROUPS.find((g) => g.key === "IR").test(s.club)); return rateAgg(shots.filter((s) => s.kind === "nice").length, shots.length); }
  },
  {
    id: "clubNiceWG", group: "shot", label: "ナイス率(ウェッジ)", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const shots = heat13Shots(holes.flatMap((h) => h.shots)).filter((s) => CLUB_GROUPS.find((g) => g.key === "WG").test(s.club)); return rateAgg(shots.filter((s) => s.kind === "nice").length, shots.length); }
  },
  {
    id: "roughToGreen", group: "shot", label: "ラフからのグリーンオン率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => roughToGreenAgg(holes)
  },
  {
    id: "par3Gir", group: "shot", label: "パー3のパーオン率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats).filter((h) => h.par === 3); return rateAgg(HS.filter((h) => h.gir).length, HS.length); }
  },
  /* ---- ショートゲーム系 ---- */
  {
    id: "scramble", group: "short", label: "寄せワン", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats); const nonGir = HS.filter((h) => !h.gir); return rateAgg(nonGir.filter((h) => h.scramble).length, nonGir.length); }
  },
  {
    id: "sandSave", group: "short", label: "サンドセーブ", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats); const gs = HS.filter((h) => h.gsBunker); return rateAgg(gs.filter((h) => h.sandSave).length, gs.length); }
  },
  {
    id: "troubleEscape", group: "short", label: "トラブル脱出率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => troubleEscapeAgg(holes)
  },
  /* ---- パット系 ---- */
  {
    id: "putts", group: "putt", label: "パット合計", unit: "", dashDigits: 1, lowerBetter: true, kind: "count",
    calc: (holes) => ({ value: holes.map(holeStats).reduce((a, h) => a + h.putts, 0) })
  },
  {
    id: "threePutts", group: "putt", label: "3パット回数", unit: "回", dashDigits: 1, lowerBetter: true, kind: "count",
    calc: (holes) => ({ value: holes.map(holeStats).filter((h) => h.three).length })
  },
  {
    id: "onePuttRate", group: "putt", label: "1パット率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats); return rateAgg(HS.filter((h) => h.putts === 1).length, HS.length); }
  },
  {
    id: "twoPuttOrLessRate", group: "putt", label: "2パット以内率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => { const HS = holes.map(holeStats); return rateAgg(HS.filter((h) => h.putts <= 2).length, HS.length); }
  },
  {
    id: "girPuttAvg", group: "putt", label: "パーオンホールの平均パット数", unit: "", dashDigits: 1, lowerBetter: true, kind: "avg",
    calc: (holes) => { const HS = holes.map(holeStats).filter((h) => h.gir); return avgAgg(HS.reduce((a, h) => a + h.putts, 0), HS.length); }
  },
  {
    id: "shortPuttSuccess", group: "putt", label: "1m以内の成功率", unit: "%", dashDigits: 0, lowerBetter: false, kind: "rate",
    calc: (holes) => {
      const putts = holes.flatMap((h) => h.shots).filter((s) => s.club === "PT" && s.dist === "1m以内");
      return rateAgg(putts.filter((s) => s.kind === "in").length, putts.length);
    }
  },
  {
    id: "longThreePuttRate", group: "putt", label: "10m以上からの3パット率", unit: "%", dashDigits: 0, lowerBetter: true, kind: "rate",
    calc: (holes) => { const r = distancePuttStats(holes).find((b) => b.band === "ロング"); return { value: r && r.threePuttRate !== null ? r.threePuttRate : null }; }
  }
];

// ラフからのグリーンオン率(ホール単位でショットの前後関係を見る必要があるため専用関数)
function roughToGreenAgg(holes) {
  let num = 0, den = 0;
  holes.forEach((h) => {
    const shots = h.shots || [];
    shots.forEach((s, i) => {
      if (s.lie !== "ラフ" || s.club === "PT") return;
      den++;
      const next = shots[i + 1];
      if (next && next.club === "PT") num++;
    });
  });
  return rateAgg(num, den);
}

// トラブル脱出率(林・バンカーからのショットの次の状況を見る)
function troubleEscapeAgg(holes) {
  let num = 0, den = 0;
  holes.forEach((h) => {
    const shots = h.shots || [];
    shots.forEach((s, i) => {
      if ((s.lie !== "林" && s.lie !== "バンカー") || s.club === "PT") return;
      den++;
      const next = shots[i + 1];
      if (next && (next.lie === "FW" || next.lie === "グリーン")) num++;
      else if (!next && s.kind === "in") num++;
    });
  });
  return rateAgg(num, den);
}

function formatKpiValue(entry, value) {
  if (value === null || value === undefined) return "-";
  if (entry.kind === "rate") return Math.round(value);
  if (entry.kind === "avg") return Math.round(value * 10) / 10;
  if (entry.kind === "diff") return (value >= 0 ? "+" : "") + Math.round(value);
  return value;
}

function kpiLabel(entry, agg) {
  if (agg.value === null || agg.den === undefined || agg.den === null) return entry.label;
  if (entry.kind === "rate") return `${entry.label} ${agg.num}/${agg.den}`;
  if (entry.kind === "avg") return `${entry.label}(×${agg.den}H)`;
  return entry.label;
}

// このラウンド(holes配列)単位でのKPI生値(未丸め)。ダッシュボードの平均化に使う。
export function kpiRoundValue(id, holes) {
  const entry = KPI_CATALOG.find((k) => k.id === id);
  if (!entry) return null;
  return entry.calc(holes).value;
}

/* ---------- §6.2 KPI(review用: 選択式・フラクション表示) ---------- */
export function computeKPIs(holes, kpiIds) {
  const ids = (kpiIds && kpiIds.length === 9) ? kpiIds : DEFAULT_KPIS;
  return ids.map((id) => {
    const entry = KPI_CATALOG.find((k) => k.id === id);
    if (!entry) return null;
    const agg = entry.calc(holes);
    return {
      id, label: kpiLabel(entry, agg), unit: entry.unit,
      value: formatKpiValue(entry, agg.value), raw: agg.value,
      kind: entry.kind, lowerBetter: entry.lowerBetter, digits: entry.dashDigits
    };
  }).filter(Boolean);
}

/* ---------- §6.4 スコアロスTOP3 ---------- */
function breakdownText(items, keyFn) {
  const counts = {};
  items.forEach((it) => { const k = keyFn(it); counts[k] = (counts[k] || 0) + 1; });
  const keys = Object.keys(counts);
  if (keys.length === 0) return "";
  if (keys.length === 1) return `すべて${keys[0]}`;
  return keys.sort((a, b) => counts[b] - counts[a]).map((k) => `${k}${counts[k]}`).join("・");
}

export function lossTop3(holes) {
  const allShots = holes.flatMap((h) => h.shots);
  const obShots = allShots.filter((s) => s.kind === "ob");
  const penaltyShots = allShots.filter((s) => s.kind === "penalty");
  const missShots = allShots.filter((s) => s.kind === "miss");
  const threePuttHoles = holes.filter((h) => holeStats(h).three);

  const losses = [];
  if (obShots.length + penaltyShots.length) {
    const parts = [];
    if (obShots.length) parts.push(`OB${obShots.length}`);
    if (penaltyShots.length) parts.push(`ペナ${penaltyShots.length}`);
    losses.push({
      name: `OB・ペナルティ ${obShots.length + penaltyShots.length}発(${parts.join("・")})`,
      loss: (obShots.length + penaltyShots.length) * 2
    });
  }
  if (missShots.length) {
    const lie = breakdownText(missShots, (s) => s.lie);
    losses.push({
      name: `素ダフリ・チョロ ${missShots.length}回(${lie})`,
      loss: missShots.length
    });
  }
  if (threePuttHoles.length) {
    const firstDist = (h) => {
      const putts = h.shots.filter((s) => s.club === "PT");
      return putts.length ? putts[0].dist : "不明";
    };
    const dist = breakdownText(threePuttHoles, firstDist);
    losses.push({
      name: `3パット ${threePuttHoles.length}回(${dist})`,
      loss: threePuttHoles.length
    });
  }
  losses.sort((a, b) => b.loss - a.loss);
  return losses.slice(0, 3);
}

/* ---------- §6.3 ヒートマップ ---------- */
export function heatmapCellPos(result) {
  const row = result.indexOf("オーバー") >= 0 ? 0 : result.indexOf("ショート") >= 0 ? 2 : 1;
  const col = result.indexOf("左") >= 0 ? 0 : result.indexOf("右") >= 0 ? 2 : 1;
  return [row, col];
}

export function buildHeatMatrix(shots) {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  shots.forEach((s) => {
    const [r, c] = heatmapCellPos(s.result);
    m[r][c]++;
  });
  return m;
}

export function sumMatrices(mats) {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  mats.forEach((a) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r][c] += a[r][c]; });
  return m;
}

export function matrixCount(m) {
  let n = 0;
  m.forEach((row) => row.forEach((v) => { n += v; }));
  return n;
}

export const RAMP = ["#eef5f1", "#d4e9de", "#aed7c2", "#83c1a2", "#54a87f", "#2b8f60", "#0f7b4d"];

// §6.5 ヒートマップ読み解き文
export function heatmapInsightHTML(m, centerLabel) {
  const n = matrixCount(m);
  const nice = m[1][1];
  const missTotal = n - nice;
  const niceShare = n ? Math.round(nice / n * 100) : 0;
  if (!n) return `${centerLabel}率<b>${niceShare}%</b>。データがまだ足りません。`;

  let best = { v: -1, ri: 0, ci: 0 };
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (r === 1 && c === 1) continue;
    if (m[r][c] > best.v) best = { v: m[r][c], ri: r, ci: c };
  }
  const rowName = ["オーバー", "ジャスト", "ショート"][best.ri];
  const colName = ["左", "真ん中", "右"][best.ci];
  const missShare = missTotal ? Math.round(best.v / missTotal * 100) : 0;

  if (missTotal && missShare >= 34) {
    return `${centerLabel}率${niceShare}%。ミスは<b>${colName}・${rowName}</b>に集中(ミスの${missShare}%)。`;
  }

  const rowSum = [0, 0, 0], colSum = [0, 0, 0];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (r === 1 && c === 1) continue;
    rowSum[r] += m[r][c]; colSum[c] += m[r][c];
  }
  const axes = [
    { share: rowSum[0], name: "オーバー系" }, { share: rowSum[2], name: "ショート系" },
    { share: colSum[0], name: "左系" }, { share: colSum[2], name: "右系" }
  ].sort((a, b) => b.share - a.share);
  const axShare = missTotal ? Math.round(axes[0].share / missTotal * 100) : 0;

  if (missTotal && axShare >= 50) {
    return `${centerLabel}率${niceShare}%。ミスは<b>${axes[0].name}</b>に偏り(ミスの${axShare}%)。`;
  }
  return `${centerLabel}率<b>${niceShare}%</b>。ミスの散り方に大きな偏りはありません。`;
}

export const CLUB_GROUPS = [
  { key: "DR", label: "ドライバー", test: (c) => c === "1W" },
  { key: "WD", label: "ウッド・UT", test: (c) => ["3W", "5W", "7W", "UT"].includes(c) },
  { key: "IR", label: "アイアン", test: (c) => /^[2-9]I$/.test(c) },
  { key: "WG", label: "ウェッジ", test: (c) => ["PW", "AW", "SW", "LW"].includes(c) },
  { key: "CLUB", label: "クラブ別", test: null }
];

// ショットヒートマップ対象(§6.3: normal/nice/putt、ob/miss/inは除外)
export function shotHeatShots(allShots) {
  return allShots.filter((s) => s.club !== "PT" && (s.kind === "normal" || s.kind === "nice"));
}
export function puttHeatShots(allShots) {
  return allShots.filter((s) => s.club === "PT" && s.kind === "putt");
}

/* ---------- 7-1/7-2: 大ミス方向・13マスヒートマップ ---------- */
export const RAMP_RED = ["#fbeee8", "#f6dbcf", "#efc3ae", "#e5a184", "#d67f5c", "#c5623a", "#b0421f"];

// 旧データ(dir未記録のOB左/OB右)は結果文字列からdirを補って読む(非破壊・書き込みなし)。
// ペナルティ(赤杭・池)で方向未記録のものはnullのまま(呼び出し側で「手前」に合流させる)。
export function shotDir(s) {
  if (s.dir) return s.dir;
  if (s.kind === "ob") {
    if (s.result === "OB左") return "左";
    if (s.result === "OB右") return "右";
  }
  return null;
}

// 13マスヒートマップ対象ショット(パット以外の全ショットからkind="in"を除いたもの)
export function heat13Shots(allShots) {
  return allShots.filter((s) => s.club !== "PT" && s.kind !== "in");
}

export function build13Heat(shots) {
  const grid = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let left = 0, right = 0, back = 0, front = 0;
  shots.forEach((s) => {
    if (s.kind === "ob" || s.kind === "penalty") {
      const dir = shotDir(s);
      if (dir === "左") { left++; return; }
      if (dir === "右") { right++; return; }
      if (dir === "奥") { back++; return; }
      // "手前"、または方向未記録の旧ペナルティは下段(手前へ大ミス)に合流
      front++; return;
    }
    if (s.kind === "miss") { front++; return; }
    const [r, c] = heatmapCellPos(s.result);
    grid[r][c]++;
  });
  return { grid, left, right, back, front };
}

export function heat13Total(d) {
  let n = 0;
  d.grid.forEach((row) => row.forEach((v) => { n += v; }));
  return n + d.left + d.right + d.back + d.front;
}

// 13マスヒートマップ読み解き文(mock/heatmap13.htmlの文面に合わせる。助言は入れない)
export function heatmap13InsightHTML(d, centerLabel) {
  const total = heat13Total(d);
  const nice = d.grid[1][1];
  const niceShare = total ? Math.round(nice / total * 100) : 0;
  if (!total) return `${centerLabel}率<b>${niceShare}%</b>。データがまだ足りません。`;

  const missTotal = total - nice;
  const bigMiss = d.left + d.right + d.back + d.front;
  const LABELS = [["左オーバー", "オーバー", "右オーバー"], ["左", "ナイス", "右"], ["左ショート", "ショート", "右ショート"]];
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (r === 1 && c === 1) continue;
    cells.push({ v: d.grid[r][c], name: LABELS[r][c], big: false });
  }
  cells.push({ v: d.left, name: "左への大ミス", big: true });
  cells.push({ v: d.right, name: "右への大ミス", big: true });
  cells.push({ v: d.back, name: "奥への大ミス", big: true });
  cells.push({ v: d.front, name: "手前への大ミス", big: true });
  let best = { v: -1, name: "", big: false };
  cells.forEach((x) => { if (x.v > best.v) best = x; });
  const bestShare = missTotal ? Math.round(best.v / missTotal * 100) : 0;

  let txt = `${centerLabel}率<b>${niceShare}%</b>。ミスで最も多いのは<b${best.big ? ' class="bad"' : ""}>${best.name}</b>(ミスの${bestShare}%)。`;
  if (bigMiss) {
    const bigShare = total ? Math.round(bigMiss / total * 100) : 0;
    const parts = [];
    if (d.left) parts.push(`左${d.left}`);
    if (d.right) parts.push(`右${d.right}`);
    if (d.back) parts.push(`奥${d.back}`);
    if (d.front) parts.push(`手前${d.front}`);
    txt += `大ミスは<b class="bad">${bigShare}%</b>(${parts.join("・")})。`;
  }
  return txt;
}

/* ---------- §6.6 距離帯別パット ---------- */
export function distancePuttStats(holes) {
  const bands = PUTT_DISTS.map((p) => p.key);
  const byBand = {};
  bands.forEach((b) => { byBand[b] = { band: b, attempts: 0, cupIn: 0, firstDistHoles: 0, threePuttHoles: 0 }; });

  holes.forEach((hole) => {
    const putts = (hole.shots || []).filter((s) => s.club === "PT");
    putts.forEach((s) => {
      const r = byBand[s.dist];
      if (!r) return;
      r.attempts++;
      if (s.kind === "in") r.cupIn++;
    });
    if (putts.length) {
      const first = putts[0];
      const r = byBand[first.dist];
      if (r) {
        r.firstDistHoles++;
        if (putts.length >= 3) r.threePuttHoles++;
      }
    }
  });

  return bands.map((b) => {
    const r = byBand[b];
    return {
      band: b,
      attempts: r.attempts,
      cupInRate: r.attempts ? Math.round(r.cupIn / r.attempts * 100) : null,
      threePuttRate: r.firstDistHoles ? Math.round(r.threePuttHoles / r.firstDistHoles * 100) : null
    };
  });
}

/* ---------- ホールタイプ別 平均± ---------- */
export function holeTypeAverages(holes) {
  return [3, 4, 5].map((par) => {
    const hs = holes.filter((h) => h.par === par).map(holeStats);
    const avg = hs.length ? hs.reduce((a, h) => a + (h.score - h.par), 0) / hs.length : null;
    return { par, n: hs.length, avg };
  });
}

/* ---------- 途中終了ラウンド対応: プレー済みホールのみ抽出 ---------- */
export function playedHoleCount(round) {
  return round.playedHoles != null ? round.playedHoles : round.holes.length;
}
export function activeHoles(round) {
  return round.holes.slice(0, playedHoleCount(round));
}

/* ---------- 振り返り画面用の一括計算 ---------- */
export function computeReview(round, kpiIds) {
  const holes = activeHoles(round);
  const HS = holes.map(holeStats);
  const total = HS.reduce((a, h) => a + h.score, 0);
  const parTotal = HS.reduce((a, h) => a + h.par, 0);
  const putts = HS.reduce((a, h) => a + h.putts, 0);
  const obTotal = HS.reduce((a, h) => a + h.obCount, 0);
  const threePutts = HS.filter((h) => h.three).length;
  const allShots = holes.flatMap((h) => h.shots);

  return {
    HS, total, parTotal, toPar: total - parTotal, putts, obTotal, threePutts,
    losses: lossTop3(holes),
    kpis: computeKPIs(holes, kpiIds),
    typeAverages: holeTypeAverages(holes),
    distancePutts: distancePuttStats(holes),
    shotHeatSource: heat13Shots(allShots),
    puttHeatSource: puttHeatShots(allShots)
  };
}

/* ---------- 9-2: 比較対象(振り返り画面のKPI比較) ----------
   mode: "recent5"(既定・直近5R平均) | "all"(全期間平均) | "best"(自己ベストのラウンド)
       | "course"(同じコースでの平均) | "prev"(前回のラウンド)
   いずれも現在表示中のラウンド自身は比較対象から除外する。日付は文字列比較
   (YYYY-MM-DD)で厳密未満(<)判定のため、同日に複数ラウンドがある場合は
   「直近5R/前回」の対象に含まれないことがある(単純化した仕様)。 */
export function compareRoundsFor(mode, allRounds, currentRound) {
  const complete = allRounds
    .filter((r) => r.complete && r.id !== currentRound.id)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (mode === "all") return complete;
  if (mode === "course") return complete.filter((r) => r.courseId === currentRound.courseId);
  if (mode === "best") {
    if (!complete.length) return [];
    let best = complete[0], bestScore = roundTotals(activeHoles(best)).score;
    complete.forEach((r) => {
      const sc = roundTotals(activeHoles(r)).score;
      if (sc < bestScore) { bestScore = sc; best = r; }
    });
    return [best];
  }
  const before = complete.filter((r) => r.date < currentRound.date);
  if (mode === "prev") return before.length ? [before[before.length - 1]] : [];
  // 既定: recent5(直近5ラウンドの平均、現在のラウンドより前のもの)
  return before.slice(-5);
}

// 指定したラウンド集合について、各KPIの平均値(未丸め)を返す。1件なら実質そのラウンドの値。
export function compareKpiValues(rounds, kpiIds) {
  const result = {};
  kpiIds.forEach((id) => {
    const vals = rounds.map((r) => kpiRoundValue(id, activeHoles(r))).filter((v) => v !== null && v !== undefined);
    result[id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  return result;
}

/* ---------- ダッシュボード用の一括計算 ----------
   6-1: 既定では18ホール完了したラウンドのみを対象にする(9ホールラウンドが
   18ホールラウンドと同じ重みで平均・ベスト・推移に混ざるのを防ぐ)。
   バッチ8: 絞り込み行「コース/ティー/ラウンド(18Hのみ既定/すべて)」を
   opts = { roundFilter, courseId, tee } として渡す。いずれも既定は「すべて」
   (roundFilterのみ既定"18")。 */
export function dashboardSummary(allRounds, courses, opts) {
  const roundFilter = (opts && opts.roundFilter) || "18";
  const courseFilter = (opts && opts.courseId) || "all";
  const teeFilter = (opts && opts.tee) || "all";
  const kpiIds = (opts && opts.kpiIds && opts.kpiIds.length === 9) ? opts.kpiIds : DEFAULT_KPIS;
  const rounds = allRounds
    .filter((r) => r.complete)
    .filter((r) => roundFilter === "all" || playedHoleCount(r) === 18)
    .filter((r) => courseFilter === "all" || r.courseId === courseFilter)
    .filter((r) => teeFilter === "all" || r.tee === teeFilter)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const perRound = rounds.map((r) => {
    const holes = activeHoles(r);
    const t = roundTotals(holes);
    const allShots = holes.flatMap((h) => h.shots);
    const kpiRaw = {};
    kpiIds.forEach((id) => { kpiRaw[id] = kpiRoundValue(id, holes); });
    return { round: r, date: r.date, score: t.score, putts: t.putts, kpiRaw, shots: allShots };
  });

  const scores = perRound.map((r) => r.score);
  const recent3 = perRound.slice(-3);
  const prev3 = perRound.slice(-6, -3);

  function avgKpi(arr, id) {
    const vals = arr.map((r) => r.kpiRaw[id]).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  const kpis = kpiIds.map((id) => {
    const entry = KPI_CATALOG.find((k) => k.id === id);
    const now = avgKpi(recent3, id);
    const before = avgKpi(prev3, id);
    return {
      id, label: entry.label, unit: entry.unit, digits: entry.dashDigits, lowerBetter: entry.lowerBetter, kind: entry.kind,
      now, before, diff: now !== null && before !== null ? now - before : null
    };
  });

  const allHoles = rounds.flatMap((r) => activeHoles(r));
  const typeAverages = holeTypeAverages(allHoles);

  // コース別・ホール別
  const courseMap = {};
  rounds.forEach((r) => { (courseMap[r.courseId] = courseMap[r.courseId] || []).push(r); });
  const courseStats = (courses || []).filter((c) => courseMap[c.id]).map((c) => {
    const crounds = courseMap[c.id];
    const avgs = c.pars.map((par, i) => {
      const diffs = crounds.map((r) => {
        // IN/OUTどちらのスタートでも実ホール番号で突き合わせる(プレー順の配列位置には依存しない)
        const h = activeHoles(r).find((hh) => hh.number === i + 1);
        return h ? holeStats(h).score - h.par : null;
      }).filter((v) => v !== null);
      return diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
    });
    return { course: c, rounds: crounds.length, avgs };
  });

  // ヒートマップ(全期間・クラブ別)
  const allShots = perRound.flatMap((r) => r.shots);
  const shotShots = heat13Shots(allShots);
  const puttShots = puttHeatShots(allShots);
  const byClub = {};
  shotShots.forEach((s) => { (byClub[s.club] = byClub[s.club] || []).push(s); });

  return {
    perRound, scores,
    avgRecent3: recent3.length ? recent3.reduce((a, r) => a + r.score, 0) / recent3.length : null,
    best: scores.length ? Math.min(...scores) : null,
    avgAll: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    kpis, typeAverages, courseStats, byClub, shotShots, puttShots,
    distancePutts: distancePuttStats(allHoles)
  };
}
