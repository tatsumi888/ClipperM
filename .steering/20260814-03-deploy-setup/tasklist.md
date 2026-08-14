# タスクリスト

## 概要

実機確認とデプロイの経路を整備する。Kindle での表示が想定どおりであることを確認できたため、
残る未検証項目（iOS の共有シート、Android の共有メニュー）を実機で試せる状態にする。

前提となる制約:

- Service Worker と `navigator.share` は **secure context 必須**。LAN の HTTP では動かない
- Vite 6 は想定外の Host ヘッダを弾くため、トンネル経由だと素では開けない
- ClipperM は**ルート配信前提**（manifest の `scope` が `/`、共有ターゲットが `/share-target`）

---

## フェーズ1: トンネル経由での実機確認

- [x] `vite.config.ts` に `server.allowedHosts` / `preview.allowedHosts` を追加
  - [x] `.trycloudflare.com` / `.ngrok-free.app` / `.ngrok.io` / `.loca.lt` を許可
  - [x] `host: true` で LAN からも開けるようにする
  - [x] 「dev には SW が無い」「HTTP では共有が動かない」をコメントに残す

## フェーズ2: Cloudflare Pages へのデプロイ

- [x] `wrangler` を devDependency として追加
- [x] `package.json` に `deploy` スクリプトを追加（build → pages deploy）
- [x] `deploy:preview`（`--branch preview`）を追加
- [x] `public/_headers` を追加し、`sw.js` / `manifest.webmanifest` / `index.html` を `no-cache` に
  - [x] `dist/_headers` に配られることを確認
  - [x] PWA のプリキャッシュ対象に混入していないことを確認（10 件のまま）

## フェーズ3: バージョン管理

- [x] `git init -b main`（既存プロジェクトの既定ブランチに合わせる）
- [x] `.gitattributes` を追加し改行を `eol=lf` に固定
- [x] 初期コミット（Conventional Commits + 日本語、`Co-Authored-By` 付き）
- [x] `node_modules` / `dist` が含まれていないことを確認（48 ファイル）

## フェーズ4: 品質チェック

- [x] `npm test` — 65 件通過
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npx prettier --check .`

## フェーズ5: リモートと自動デプロイ（追加）

- [x] リモート `https://github.com/tatsumi888/ClipperM.git` を `origin` として登録
- [x] リモートが空であることを確認してから push（既存の履歴を壊さないため）
- [x] `.github/workflows/ci.yml` — pull request のみ
- [x] `.github/workflows/deploy.yml` — main への push で検証 → Cloudflare Pages
  - [x] `concurrency` で古いデプロイの後追い上書きを防ぐ
- [x] `git push -u origin main`（3 コミット、51 ファイル）
- [x] Direct Upload 型と Git 連携が排他である旨を CLAUDE.md に明記

## フェーズ6: ドキュメント

- [x] `CLAUDE.md` にデプロイ手順・実機確認手順・ルート配信前提を追記
- [x] **`CLAUDE.md` の「Git リポジトリではない」という記述を訂正**
- [x] 親 `d:\ClaudeCode\CLAUDE.md` の補足も訂正
- [x] `README.md` に実機確認とデプロイの節を追加
- [x] 実装後の振り返り

---

## 実装後の振り返り

### 実装完了日

2026-08-14

### 計画と実績の差分

**計画と異なった点**:

- **`deploy:dry` を諦めて `deploy:preview` にした。** `wrangler pages deploy` には
  `--dry-run` が存在しない（Workers 向けの `wrangler deploy` にはある）。
  `--help` で確認して気づいた。本番に出す前に確かめたいという目的は、
  `--branch preview` で別 URL に出すほうが実態に即している。

**新たに必要になったタスク**:

- **`.gitattributes` の追加。** `git add` が 47 ファイルすべてに
  「LF が CRLF に置き換わる」と警告した。`core.autocrlf=true` の環境で clone すると
  作業ツリーが CRLF になり、Prettier（`endOfLine` 既定は LF）が全ファイルを
  差分ありと判定して `npm run format:check` がリポジトリごと落ちる。
  `* text=auto eol=lf` で固定した。
  なお **ETFTracker も `.gitattributes` を持っておらず同じ穴がある**（CI は Linux なので
  気づきにくい）。あちらにも入れておくとよい。

- **`public/_headers` の追加。** Cloudflare Pages の既定キャッシュのままだと
  `sw.js` が長期キャッシュされ、デプロイし直しても端末が古い Service Worker を
  掴み続ける。PWA で最も嫌な事故なので先に塞いだ。

- **ドキュメントの訂正。** `CLAUDE.md` と親の `CLAUDE.md` の両方に
  「ClipperM は Git リポジトリではない」と書いてあり、`git init` によって嘘になった。

### 学んだこと

**技術的な学び**:

- **`wrangler pages deploy` と `wrangler deploy` はフラグが違う。** Pages は静的配信で
  ビルド成果物を投げるだけなので `--dry-run` の概念が無い。
  スクリプトに書く前に `--help` で実在を確かめるべきだった（実際それで気づけた）。

- **secure context の要否で検証手段が変わる。** 切り抜き・EPUB 生成・ダウンロードは
  LAN の HTTP でも試せるが、Service Worker と `navigator.share` は HTTPS が要る。
  この切り分けを知っていると、確認したいことによって手段（LAN / トンネル / デプロイ）を
  選べる。実際 Kindle 表示の確認はデプロイ無しで済んだ。

**リモート設定で分かったこと**:

- **Cloudflare Pages の Direct Upload 型と Git 連携型は排他。** `wrangler pages deploy` で
  作ったプロジェクトは後から Cloudflare 側の Git 連携へ切り替えられず、逆に Git 連携型には
  `wrangler pages deploy` でアップロードできない。ClipperM は
  「Direct Upload + GitHub Actions」を選んだので、**ダッシュボードで Git を接続すると
  `npm run deploy` と `deploy.yml` の両方が壊れる**。CLAUDE.md に警告として残した。

- **CI を ci.yml と deploy.yml に分け、トリガを重複させなかった。** 既存プロジェクトの
  ci.yml は `push: [main]` と `pull_request` の両方を対象にしているが、ClipperM は
  main への push で deploy.yml が同じ検証を実行するため、ci.yml は pull request 専用にした。
  両方で走らせると同じチェックが 2 重に回るだけになる。

- **Pages プロジェクトは先にローカルで 1 回作る必要がある。** CI は非対話なので、
  存在しないプロジェクト名を渡すと作成の確認ができずに失敗する。

### 実機確認の結果（2026-08-15）

iPhone で一通り確認し、**すべて想定どおり動作した**。これで初期セットアップ時に
残していた未検証項目が解消した。

- **iOS Safari が `application/epub+zip` の File を共有シートに渡せた。** ここが最大の未知で、
  駄目なら「ファイル」アプリ経由の導線を足す必要があると見ていたが、不要だった。
  `navigator.canShare({ files })` での事前判定と、生成と送信をボタンで分けた設計が
  そのまま通用した。
- 切り抜き・ピンチ操作・「全体を表示」・EPUB 生成・Kindle での表示まで問題なし。
- Kindle 表示自体は配信前にデスクトップの `npm run preview` で先に確認できていた。
  **secure context の要否で検証手段を切り分けた**判断（HTTPS が要るのは共有だけ）が
  実際に手戻りを減らした。

未確認のまま残るのは **Android の共有メニューからの取り込み**（Web Share Target）のみ。

### 次回への改善提案

- ETFTracker / BullGraph / RoutineKeeper にも `.gitattributes` を入れる。
  同じ `core.autocrlf=true` 環境で、同じ Prettier 設定を使っている。
### 自動デプロイの疎通（2026-08-15 完了）

`https://clipperm.pages.dev/` が公開され、**GitHub Actions 経由のデプロイが成功**した
（run #5 / commit d3da156 / Cloudflare deployment dcceeaa3）。

**詰まった点と解決**:

- CI のデプロイ段階だけが 3 回連続で失敗した。注釈には
  `npx failed with exit code 1` としか出ず、原因が特定できなかった。
- ワークフロー自身に状態を吐かせる診断ステップを入れて解決。
  **`CLOUDFLARE_ACCOUNT_ID` が空**（Secrets ではなく Variables 側に登録していた）と判明。
  Secrets は値を出さず**文字数だけ**表示すれば安全に検証できる。この手は残した。
- 一方 `wrangler whoami` の診断ステップは**外した**。whoami は
  `User → User Details → Read` を要求するが、トークンは `Cloudflare Pages / Edit` だけに
  絞ってある（絞れているのが正しい状態）ため必ず失敗する。
  `continue-on-error` で常設すると、ジョブが緑のまま error 注釈が毎回 2 件残り、
  「無視してよい赤」に慣れて本物のエラーを見落とすようになる。

- あわせて actions/checkout と setup-node を v5、wrangler-action を v4 へ更新。
  v4 系は Node 20 実行で非推奨警告が出ていた（v5 / v4 から node24）。
  wrangler-action v4 は `apiToken` / `accountId` / `command` の入力が v3 と同じで、
  そのまま差し替えられることを action.yml で確認してから上げた。
