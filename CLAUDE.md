# ゴルフラウンド記録アプリ

iPhone Safari中心で使う、ゴルフのラウンドをホールごとに記録するPWA。目的は「記録」ではなく
**診断→処方**(数字で練習課題を特定する)。詳細仕様は [SPEC.md](SPEC.md) を参照。

- 公開URL: https://atsushi12352.github.io/golf-round-tracker/
- GitHubリポジトリ: https://github.com/atsushi12352/golf-round-tracker (Public)
- 開発者本人がユーザー(v1はシングルユーザー、アカウント機能なし)

## 重要: このフォルダ固有のgit事情

`C:\Users\ataka` (ホームディレクトリ) 自体が、このプロジェクトとは無関係の別のgitリポジトリの
ルートになっている(`.bash_history`や`.claude.json`等を含む、意図せず`git init`されたもの)。
**そちらには一切触れないこと。** この`ゴルフアプリ`フォルダは、その中に独立して`git init`した
別リポジトリ(nested repo)。`git status`等は必ずこのフォルダ内で完結する。

## アーキテクチャ

- **フレームワークなし、ビルドなし**(SPEC §2の方針: 依存最小限、壊れたら非エンジニアでも復旧できること)。
- **MPA構成**: 画面ごとに独立したhtmlファイル + 対応するjs。モック3枚(`mock/`配下、**無変更で保持**)
  がこの「1画面=1ファイル」構成の元ネタ。画面遷移は`location.href`、状態共有はすべてIndexedDB経由。
- データは端末内IndexedDB(`js/db.js`)。サーバーなし。
- PWA: `manifest.webmanifest` + `service-worker.js`(cache-first)。

### ファイル構成

```
mock/                  元の3モック(index/review/dashboard.html)。正解サンプルとして無変更で保持
SPEC.md                詳細仕様

index.html + js/home.js            ホーム(ラウンド一覧・開始導線)
round-start.html + js/roundStart.js  ラウンド開始(コース/ティー/OUT・IN選択)
hole.html + js/holeInput.js        ホール入力画面(最重要画面)
review.html + js/review.js         ラウンド振り返り(1ラウンド分析・編集機能いろいろ)
dashboard.html + js/dashboard.js   累積ダッシュボード
settings.html + js/settings.js     設定(クラブ選択・バックアップ・コース管理)

css/style.css           全画面共通スタイル
js/db.js                IndexedDBラッパー(CRUD一式、プリセットコースのマイグレーションも)
js/stats.js             集計ロジック全部(SPEC §5・§6の実装。ここが一番大事なファイル)
js/clubs.js             クラブマスター、既定設定
js/presetCourses.js     ホームコースのプリセットデータ(3-1)
js/backup.js            JSONエクスポート/インポート
js/sw-register.js       各画面共通のSW登録

.claude/launch.json          ローカル動作確認用サーバー設定(下記参照)
.claude/nocache_server.py    ↑が使うキャッシュ無効化サーバー
```

## 次にやること

[fix-instructions-3.md](fix-instructions-3.md) に、バッチ6〜10(集計バグ修正・13マス
ヒートマップとOB方向記録・ダッシュボード絞り込み・KPI選択式・スコア分布とバックアップ導線)
が**ユーザー不在の自走前提**でまとめてある。新しいセッションでこのプロジェクトの続きを
頼まれたら、まずこのファイルを読むこと。正解サンプルの新モックも追加済み:
`mock/heatmap13.html`(13マスヒートマップ)、`mock/input13.html`(大ミス方向入力フロー)。

このファイル自体に進め方・停止条件・`WORKLOG.md`への記録ルールが書いてあるので、
それに従う(1バッチ=1コミット、判断に迷ったら直前のコミットに戻して`WORKLOG.md`に
理由を書いて止まる、`git push`はしない等)。まだ着手されていない(`WORKLOG.md`は未作成)。

## これまでの経緯

初期実装(SPEC.md・モック3枚から新規構築)のあと、ユーザーからのフィードバックを
バッチ単位で反映してきた。**詳細は `git log --oneline` を見ること**(コミットメッセージに
背景・検証内容まで書いてある)。要点だけ挙げると:

- スコア/ヒートマップ/KPIの表示文言から「処方」「〜すべき」的な助言口調を排除し、事実の報告のみにした
- 赤杭・池のペナルティ入力(OBと同じ+1打罰、KPI/ロス要因はOBと合算、方向性の内訳は別軸)
- 過去ラウンドのPar修正・コースの付け替え(記録済みホールのParは変更しない)
- ホームコースのプリセット3コース(未登録なら追加する非破壊マイグレーション)
- OUT/INスタート対応(各ホールは実ホール番号で保存。コース別集計は`.number`で突き合わせる)
- ラウンドの「保存せず中止」(hole.html)と「削除」(review.htmlの⋯メニュー、確認モーダル必須)
- Par変更はタップ即トグルではなく、必ず確認モーダルを挟む方式に統一

## 大事な運用ルール(ユーザーから明示された/繰り返し確認したこと)

- **表示文言は事実ベースのみ**。「〜チェックを」「〜ルール化」のようなコーチング風の助言文は
  追加しない(過去に全削除された経緯がある)。数字・傾向の記述に留める。
- **削除・中止など取り消せない操作は必ずアプリ内モーダルで確認**。`window.confirm()`は使わない
  (PWAでの見た目・動作の一貫性のため)。誤操作しやすい場所(一覧の行に常設ボタン等)に直接
  置かず、詳細画面の「⋯」メニューのような一段深い階層に置く。
- **Par変更のような値の変更は「選ぶ→確定する」の2段階**にする。タップ即反映は誤操作の元として
  却下された。
- データ構造やDB内容を破壊的に変更する必要が出た場合は、**実行前に理由を説明して確認を取る**。
- 作業は機能単位の小さいコミットに分け、実ブラウザで動作確認してからコミットする(下記参照)。
- pushはユーザーから明示的に指示されたときだけ行う。

## ローカルでの動作確認

このプロジェクトは`file://`では動かない(ES modules・Service Worker・IndexedDBがhttp(s)オリジン
前提)。`.claude/launch.json`の`golf-log-static`設定を`preview_start`で起動するとローカルサーバーが立つ。

**注意点(ここでハマった実績あり)**:

1. **ポートを毎回変える**: このBrowserプレビュー環境には、標準のHTTPキャッシュとは別に
   ポート単位でレスポンスをキャッシュしてしまう挙動がある(`Cache-Control: no-store`を返す
   `.claude/nocache_server.py`を使っていても効かないことがある)。コード修正後に検証する際は
   `.claude/launch.json`の`runtimeArgs`と`port`の数字を毎回インクリメントしてから
   `preview_start`し直すこと。使い回すと編集前の古いコードで検証してしまう。
2. **Service Workerのキャッシュバージョン**: `service-worker.js`の`CACHE_VERSION`は、
   html/css/jsのいずれかを変更したら**必ず**上げる(`golf-log-v4`のように連番)。忘れると
   デプロイ後も古いキャッシュが返り続け、この不具合を2回踏んだ。新しいファイルを追加した
   場合は`PRECACHE_URLS`にも追記すること。
3. 動作確認は`mcp__Claude_Browser__*`ツールで、モバイル幅(`resize_window` preset: mobile)に
   してから行う。IndexedDBへのシードは`import('./js/db.js')`をブラウザ上で動的importして直接
   `saveRound`/`saveCourse`等を呼ぶのが速い(UIを全部クリックするより効率的)。

## デプロイ(pushの指示があったとき)

1. `git push origin main`
2. `gh api repos/atsushi12352/golf-round-tracker/pages/builds/latest --jq .status` を
   `built`になるまでポーリング
3. 実際に公開URLをBrowserツールで開き、既存タブが対象オリジンを訪問済みなら
   `navigator.serviceWorker.getRegistration()` → `reg.update()` で更新を強制してから
   再読み込みし、新しい内容が出ているか確認する(SWのcache-first戦略上、放っておくと
   古いタブは更新に気づかないことがある)。

## v1に入れない範囲(SPEC §7)

KPIカスタマイズUI、アプローチ残り距離記録、練習記録連携、コースDB API連携、複数ユーザー機能は
意図的に対象外。
