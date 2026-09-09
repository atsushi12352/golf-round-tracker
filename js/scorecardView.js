// バッチ12: スコアカードのHTML組み立て(scorecard.html本体・hole.htmlのオーバーレイ共通)。
// 集計そのものは js/stats.js の computeScorecard に一本化し、ここは表示専用。
import { computeScorecard, scorecardCellClass } from "./stats.js";

export { computeScorecard };

function blockHTML(b) {
  let html = '<div class="sc-block">';
  // 改訂: 見出しに実打数・対Parを出す(マス内は対Par表示になったため)。
  const headExtra = b.rawTotal == null ? "" : `${b.rawTotal}打 ${b.diffTotal >= 0 ? "+" : ""}${b.diffTotal} / `;
  html += `<div class="sc-block-name">${b.label}<span>${headExtra}Par ${b.parTotal}</span></div>`;
  html += '<table class="sc-table"><thead><tr><th class="rowlbl">H</th>';
  b.cells.forEach((c) => { html += `<th>${c.number}</th>`; });
  html += '<th class="tot">計</th></tr></thead><tbody>';

  html += '<tr class="par"><td class="rowlbl">Par</td>';
  b.cells.forEach((c) => { html += `<td>${c.par}</td>`; });
  html += `<td class="tot">${b.parTotal}</td></tr>`;

  html += '<tr class="score"><td class="rowlbl">対Par</td>';
  b.cells.forEach((c) => {
    const d = c.diff;
    html += `<td class="${scorecardCellClass(d)}">${d == null ? "-" : (d > 0 ? "+" + d : d)}</td>`;
  });
  html += `<td class="tot">${b.diffTotal == null ? "-" : (b.diffTotal >= 0 ? "+" + b.diffTotal : b.diffTotal)}</td></tr>`;

  html += '<tr class="putt"><td class="rowlbl">パット</td>';
  b.cells.forEach((c) => { html += `<td>${c.putt == null ? "-" : c.putt}</td>`; });
  html += `<td class="tot">${b.puttTotal == null ? "-" : b.puttTotal}</td></tr>`;

  html += '</tbody></table></div>';
  return html;
}

// カード本体(前半・後半の2ブロック)のHTML。
// loopNames(バッチ14、任意): { [loopId]: 実コース名 } を渡すとブロック見出しが
// 実名になる(渡さない/該当が無いときはOUT/IN表示にフォールバック)。
export function scorecardBodyHTML(round, loopNames) {
  const sc = computeScorecard(round, loopNames);
  return { html: blockHTML(sc.front) + blockHTML(sc.back), sc };
}

// 下部合計タイル(スコア/パット/対Par/ペナルティ)のHTML
export function scorecardTotalRowHTML(sc) {
  const tile = (v, k) => `<div class="total-item"><div class="v">${v == null ? "-" : v}</div><div class="k">${k}</div></div>`;
  const toParText = sc.toPar == null ? null : (sc.toPar >= 0 ? "+" + sc.toPar : sc.toPar);
  return tile(sc.totalScore, "スコア") + tile(sc.totalPutts, "パット") + tile(toParText, "対Par") + tile(sc.pen, "ペナルティ");
}

// 凡例(バーディ以下/パー/ボギー/ダボ以上)のHTML。スコアカードのカードに共通で使う。
export function scorecardLegendHTML() {
  return `
    <span><i style="background:var(--under-pale);border:1px solid #b9cff0"></i>バーディ以下</span>
    <span><i style="background:var(--green-pale);border:1px solid #b9ddca"></i>パー</span>
    <span><i style="background:var(--warn-pale);border:1px solid #ead9b8"></i>ボギー</span>
    <span><i style="background:var(--double-pale);border:1px solid #edc7b8"></i>ダボ以上</span>
  `;
}
