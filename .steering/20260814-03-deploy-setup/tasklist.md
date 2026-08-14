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

## フェーズ5: ドキュメント

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

### 次回への改善提案

- ETFTracker / BullGraph / RoutineKeeper にも `.gitattributes` を入れる。
  同じ `core.autocrlf=true` 環境で、同じ Prettier 設定を使っている。
- リモート（GitHub `tatsumi888/ClipperM`）は未設定のまま。
  Cloudflare Pages と GitHub を繋いで push で自動デプロイにするかは、
  手動 `npm run deploy` の運用を試してから決める。
