// SPEC §5・§6 の集計ロジック(モックの計算式をShot配列ベースに一般化)
import { PUTT_DISTS } from "./clubs.js";

/* ---------- §5 自動推測ルール ---------- */
export function inferLie(shots) {
  if (shots.length === 0) return "ティー";
  const last = shots[shots.length - 1];
  if (last.kind === "penalty") return "ラフ";
  if (last.kind === "ob") return last.lie;
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

/* ---------- §6.1 ホール単位 ---------- */
export function holeStats(hole) {
  const shots = hole.shots || [];
  const obCount = shots.filter((s) => s.kind === "ob").length;
  const penaltyCount = shots.filter((s) => s.kind === "penalty").length;
  const pen = obCount + penaltyCount;
  const putts = shots.filter((s) => s.club === "PT").length;
  const score = shots.length + pen;
  const toGreen = shots.length - putts + pen;
  const gir = toGreen <= hole.par - 2;
  const bogeyOn = toGreen <= hole.par - 1;
  const scramble = !gir && score <= hole.par;
  const bunker = shots.some((s) => s.lie === "バンカー");
  const choro = shots.filter((s) => s.kind === "miss").length;
  const tee = shots[0];
  let fwKeep = null;
  if (hole.par >= 4 && tee) {
    fwKeep = tee.kind !== "ob" && tee.kind !== "penalty" && tee.result.indexOf("左") < 0 && tee.result.indexOf("右") < 0;
  }
  return {
    number: hole.number, par: hole.par, score, putts, pen, obCount, penaltyCount,
    gir, bogeyOn, scramble, fwKeep, bunker,
    choro, three: putts >= 3, sandSave: bunker && score <= hole.par
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

/* ---------- §6.2 KPI(review用: フラクション表示) ---------- */
export function computeKPIs(holes) {
  const HS = holes.map(holeStats);
  const allShots = holes.flatMap((h) => h.shots);
  const fwHoles = HS.filter((h) => h.fwKeep !== null);
  const fwKept = fwHoles.filter((h) => h.fwKeep).length;
  const girN = HS.filter((h) => h.gir).length;
  const nonGir = HS.filter((h) => !h.gir);
  const scrambled = nonGir.filter((h) => h.scramble).length;
  const bunkerHoles = HS.filter((h) => h.bunker);
  const sandSaved = bunkerHoles.filter((h) => h.sandSave).length;
  const threePutts = HS.filter((h) => h.three).length;
  const bogeyOnN = HS.filter((h) => h.bogeyOn).length;
  const putts = HS.reduce((a, h) => a + h.putts, 0);
  const obTotal = HS.reduce((a, h) => a + h.pen, 0);
  const attempts = allShots.filter((s) => s.club !== "PT" && s.kind !== "in").length;
  const niceN = allShots.filter((s) => s.kind === "nice").length;

  return [
    { id: "putts", label: "パット合計", value: putts, unit: "" },
    { id: "fwKeep", label: `FWキープ ${fwKept}/${fwHoles.length}`, value: fwHoles.length ? Math.round(fwKept / fwHoles.length * 100) : 0, unit: "%" },
    { id: "gir", label: `パーオン ${girN}/${HS.length}`, value: Math.round(girN / HS.length * 100), unit: "%" },
    { id: "bogeyOn", label: `ボギーオン ${bogeyOnN}/${HS.length}`, value: Math.round(bogeyOnN / HS.length * 100), unit: "%" },
    { id: "scramble", label: "寄せワン", value: `${scrambled}/${nonGir.length}`, unit: "" },
    { id: "sandSave", label: "サンドセーブ", value: bunkerHoles.length ? `${sandSaved}/${bunkerHoles.length}` : "-", unit: "" },
    { id: "threePutts", label: "3パット", value: threePutts, unit: "回" },
    { id: "penalty", label: "ペナルティ", value: obTotal, unit: "打" },
    { id: "niceRate", label: "ナイス率(ショット)", value: attempts ? Math.round(niceN / attempts * 100) : 0, unit: "%" }
  ];
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
export function computeReview(round) {
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
    kpis: computeKPIs(holes),
    typeAverages: holeTypeAverages(holes),
    distancePutts: distancePuttStats(holes),
    shotHeatSource: shotHeatShots(allShots),
    puttHeatSource: puttHeatShots(allShots)
  };
}

/* ---------- ダッシュボード用の一括計算 ---------- */
export function dashboardSummary(allRounds, courses) {
  const rounds = allRounds
    .filter((r) => r.complete)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const perRound = rounds.map((r) => {
    const holes = activeHoles(r);
    const t = roundTotals(holes);
    const nonGir = t.HS.filter((h) => !h.gir);
    const scrambled = nonGir.filter((h) => h.scramble).length;
    const bunkerHoles = t.HS.filter((h) => h.bunker);
    const sandSaved = bunkerHoles.filter((h) => h.sandSave).length;
    const fwHoles = t.HS.filter((h) => h.fwKeep !== null);
    const fwKept = fwHoles.filter((h) => h.fwKeep).length;
    const girN = t.HS.filter((h) => h.gir).length;
    const bogeyOnN = t.HS.filter((h) => h.bogeyOn).length;
    const threePutts = t.HS.filter((h) => h.three).length;
    const allShots = holes.flatMap((h) => h.shots);
    const attempts = allShots.filter((s) => s.club !== "PT" && s.kind !== "in").length;
    const niceN = allShots.filter((s) => s.kind === "nice").length;
    return {
      round: r, date: r.date, score: t.score, putts: t.putts,
      fwPct: fwHoles.length ? fwKept / fwHoles.length * 100 : null,
      girPct: girN / t.HS.length * 100,
      bogeyOnPct: bogeyOnN / t.HS.length * 100,
      scrPct: nonGir.length ? scrambled / nonGir.length * 100 : null,
      sandPct: bunkerHoles.length ? sandSaved / bunkerHoles.length * 100 : null,
      three: threePutts, pen: t.pen,
      nicePct: attempts ? niceN / attempts * 100 : null,
      shots: allShots
    };
  });

  const scores = perRound.map((r) => r.score);
  const recent3 = perRound.slice(-3);
  const prev3 = perRound.slice(-6, -3);

  function avgKey(arr, key) {
    const vals = arr.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  const KPI_DEFS = [
    { id: "putts", label: "パット/R", unit: "", digits: 1, lowerBetter: true, key: "putts" },
    { id: "fwKeep", label: "FWキープ", unit: "%", digits: 0, key: "fwPct" },
    { id: "gir", label: "パーオン", unit: "%", digits: 0, key: "girPct" },
    { id: "bogeyOn", label: "ボギーオン", unit: "%", digits: 0, key: "bogeyOnPct" },
    { id: "scramble", label: "寄せワン", unit: "%", digits: 0, key: "scrPct" },
    { id: "sandSave", label: "サンドセーブ", unit: "%", digits: 0, key: "sandPct" },
    { id: "threePutts", label: "3パット/R", unit: "回", digits: 1, lowerBetter: true, key: "three" },
    { id: "penalty", label: "ペナルティ/R", unit: "打", digits: 1, lowerBetter: true, key: "pen" },
    { id: "niceRate", label: "ナイス率", unit: "%", digits: 0, key: "nicePct" }
  ];
  const kpis = KPI_DEFS.map((k) => {
    const now = avgKey(recent3, k.key);
    const before = avgKey(prev3, k.key);
    return { ...k, now, before, diff: now !== null && before !== null ? now - before : null };
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
  const shotShots = shotHeatShots(allShots);
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
