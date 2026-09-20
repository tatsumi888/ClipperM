# 設計書

## アーキテクチャ概要

既存の `vite-plugin-pwa`（`injectManifest` 戦略）をそのまま使う。変えるのは
「新しい SW をいつ・どう適用するか」の一点。`registerType` を `autoUpdate` → `prompt` にし、
`src/sw.ts` 側で `skipWaiting()` を無条件に呼んでいた箇所をやめて、クライアントからの
`SKIP_WAITING` メッセージ待ちにする。ビルド情報は Vite の `define` でビルド時にリテラル注入する。

```
デプロイ
  ↓
新しい sw.js が配信される
  ↓（ブラウザが標準の更新チェックで検知、または本実装の定期チェックで検知）
新SWが install → waiting（skipWaitingしない）
  ↓ workbox-window が 'waiting' イベント検知
onNeedRefresh() → useUpdateStore.updateAvailable = true
  ↓
UpdateBanner が表示される
  ↓ ユーザーが「更新する」を押す
applyUpdate() → registerSW の戻り値 updateSW() 呼び出し
  ↓
wb.messageSkipWaiting() → SW に {type:'SKIP_WAITING'} を postMessage
  ↓
sw.ts の message ハンドラが self.skipWaiting() を呼ぶ
  ↓
新SWが activate → clients.claim() → controllerchange
  ↓
workbox-window の 'controlling' イベント → window.location.reload()
  ↓
リロード後、App画面のビルド情報表示が新しい値になる（目視で確認できる）
```

## コンポーネント設計

### 1. `vite.config.ts`（変更）

**責務**:
- git の短縮リビジョンとビルド日時(JST)を計算し、`define` で `__BUILD_REVISION__` /
  `__BUILD_TIME_JST__` としてソースに埋め込む
- `VitePWA` の `registerType` を `'prompt'` にする

**実装の要点**:
- `execSync('git rev-parse --short HEAD')` が失敗する環境（gitが無い等）でも
  ビルド自体は落とさない。`try/catch` で `'unknown'` にフォールバックする
- 未コミットの変更があれば `git status --porcelain` で検知し、リビジョンに `-dirty` を付ける
  （ローカルビルドで「今のコミットそのもの」ではないことが分かるようにする）
- 日時は `Date.now()` を `'sv-SE'` ロケール + `timeZone: 'Asia/Tokyo'` で
  `toLocaleString` すると `YYYY-MM-DD HH:mm:ss` 形式になる（ISO風で読みやすく、
  手でパーツを組み立てる必要が無い）。末尾に `' JST'` を付けて埋め込む
- この2値はビルド時（`vite build` 実行時）に一度だけ計算される。`npm run dev` では
  開発サーバ起動時点の値のまま変わらない（用途がデプロイ確認なので問題ない）

### 2. `src/vite-env.d.ts`（新規）

**責務**:
- `define` で注入したグローバル定数の型をアンビエントに宣言する

### 3. `src/buildInfo.ts`（新規）

**責務**:
- グローバル定数を型付きで re-export する薄いモジュール。UI 側はこれだけを import する

### 4. `src/sw.ts`（変更）

**責務**:
- `install` ハンドラの無条件 `self.skipWaiting()` を削除する
  - 初回インストール（既存 SW が無い）では、そもそも「待つ」対象が無いため spec 上
    即座に activate へ進む。挙動は変わらない
  - 既存 SW がいる更新時は、`skipWaiting` を呼ばない限り `waiting` 状態に留まる。
    これが `prompt` フローの前提
- `message` イベントを追加し、`{type: 'SKIP_WAITING'}` を受け取ったら `self.skipWaiting()`
  を呼ぶ（`workbox-window` の `messageSkipWaiting()` が送る形式そのまま）

### 5. `src/store/useUpdateStore.ts`（新規）

**責務**:
- `updateAvailable: boolean` と、実際に適用する関数 `applyUpdate` を保持する zustand store
- `registerSW()` はモジュールの読み込みタイミングで一度しか呼べない一方、UI（React）側から
  呼び出せる形にする必要があるため、両者を store で繋ぐ

### 6. `src/pwaUpdate.ts`（新規）

**責務**:
- `registerSW()`（`virtual:pwa-register`）を呼び、`useUpdateStore` と結線する
- `onNeedRefresh` で `updateAvailable = true`
- `onRegisteredSW` で `ServiceWorkerRegistration` を受け取り、定期チェック
  （1時間ごと）と `visibilitychange`（visible に戻った時）のチェックを仕込む

**実装の要点**:
- 定期チェックは `registration.update()` を呼ぶだけ。実際に新しい SW が見つかれば
  上記フローで `onNeedRefresh` が呼ばれる
- チェック間隔は 1 時間。バッテリー消費と検知の速さのバランスを取った値
  （タブ復帰時のチェックがあるので、多くのケースはそちらで先に検知される）

### 7. `src/ui/UpdateBanner.tsx`（新規）

**責務**:
- `useUpdateStore` の `updateAvailable` を見て、true のときだけバナーを表示する
- 「更新する」ボタンで `applyUpdate()` を呼ぶ

**実装の要点**:
- 既存の `.panel` / `.note` / `button.primary` のスタイルをそのまま使い、見た目を揃える

### 8. `src/main.tsx`（変更）

- `registerSW({ immediate: true })` の直接呼び出しを `initServiceWorker()`
  （`src/pwaUpdate.ts`）に置き換える

### 9. `src/App.tsx`（変更）

- ヘッダー直下に `<UpdateBanner />` を差し込む
- ヘッダー付近にビルド情報（リビジョン・JST日時）を表示する行を追加する

## データフロー

### 通常のデプロイ後、ユーザーが更新する場合
```
1. main への push → deploy.yml がビルド → 新しい sw.js / index.html が Cloudflare Pages に乗る
2. ユーザーが既に開いている ClipperM（旧SWが有効）で、タブがバックグラウンド→フォアグラウンドに戻る
3. registration.update() が新しい sw.js を検知し、新SWの install が走る（waitingで停止）
4. onNeedRefresh が呼ばれ、UpdateBanner が表示される
5. ユーザーが「更新する」を押す → SKIP_WAITING → activate → controllerchange → reload
6. reload後の画面で、ビルド情報の表示が新しいリビジョン/日時になっている
```

### 初回インストール
```
1. 初めて ClipperM を開く（SW未登録）
2. registerSW({immediate:true}) が SW を登録、install → waiting相手がいないので即activate
3. clients.claim() で今開いているページも制御下に入る
4. onOfflineReady 相当（onNeedRefreshは呼ばれない、バナーは出ない）
```

## エラーハンドリング戦略

- `registration.update()` の失敗（オフライン等）は握りつぶす。更新確認は「できたら儲けもの」の
  ベストエフォートであり、失敗をユーザーに見せる必要はない
- git コマンドが使えないビルド環境では `'unknown'` にフォールボックし、ビルド自体は失敗させない

## テスト戦略

### ユニットテスト
- 今回の変更は「Vite の define」「Service Worker のメッセージ待ち」「React の表示」が中心で、
  いずれも `core/`（DOM非依存・Node環境でテストする層）には属さない。既存の `tests/` 配下の
  自動テストで機械的に検証できる範囲が薄いため、**実機/ビルド出力での確認を主とする**
  （既存の `epub.test.ts` / `pdf.test.ts` がバイト列を検証しているのと同じ理由で、
  これは「テストを書かない」ではなく「この種の変更はそもそも単体テストの対象になりにくい」
  という判断）
- 既存のテストスイート（`npm test`）が変更によって壊れていないことを確認する

### 統合テスト（手動・実機）
- `npm run build` を2回（コミットを変えて）実行し、`dist/index.html` 内のビルド情報が
  変わることを確認する
- `npm run preview` + cloudflared トンネルで実機から開き、SW を一旦アンインストールした状態
  → 再インストール → コードを変更して再ビルド・再配信 → バナーが出て「更新する」で
  反映されることを確認する

## 依存ライブラリ

追加ライブラリは無し（`vite-plugin-pwa` が依存する `workbox-window` は既に入っている）。

## ディレクトリ構造

```
src/
  vite-env.d.ts        (新規) __BUILD_REVISION__ / __BUILD_TIME_JST__ のアンビエント宣言
  buildInfo.ts         (新規) 上記の型付き re-export
  pwaUpdate.ts         (新規) registerSW() の結線、定期チェック
  main.tsx             (変更) initServiceWorker() を呼ぶだけに変更
  sw.ts                (変更) skipWaiting を message 待ちに変更
  App.tsx              (変更) UpdateBanner とビルド情報表示を追加
  store/
    useUpdateStore.ts  (新規) 更新可能フラグと適用関数
  ui/
    UpdateBanner.tsx   (新規)
vite.config.ts          (変更) define でビルド情報を注入、registerType を prompt に
```

## 実装の順序

1. `vite.config.ts` にビルド情報の `define` を追加（`registerType` はまだ変えない）
2. `src/vite-env.d.ts` / `src/buildInfo.ts` を追加し、`App.tsx` に表示（まず見える状態を作る）
3. `vite.config.ts` の `registerType` を `prompt` に変更
4. `src/sw.ts` の `skipWaiting` をメッセージ待ちに変更
5. `src/store/useUpdateStore.ts` / `src/pwaUpdate.ts` / `src/ui/UpdateBanner.tsx` を追加
6. `src/main.tsx` / `src/App.tsx` を結線
7. `npm run lint && npm run typecheck && npm run format:check && npm test && npm run build` を通す

## セキュリティ考慮事項

- git リビジョン・ビルド日時はいずれも非機密情報（GitHub リポジトリは public）。
  画面表示・バンドルへの埋め込みに問題は無い

## パフォーマンス考慮事項

- 定期チェックは 1 時間間隔かつ `registration.update()`（軽いHTTPリクエスト1本）のみ。
  バッテリー・通信への影響は無視できる

## 将来の拡張性

- 編集中の状態を永続化する機能を将来入れる場合、UpdateBanner の「更新する」を
  そのまま使い続けられる（reload前に保存を挟むだけで済む設計にしてある）
