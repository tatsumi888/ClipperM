# タスクリスト

## 🚨 タスク完全完了の原則

**このファイルの全タスクが完了するまで作業を継続すること**

### 必須ルール
- **全てのタスクを`[x]`にすること**
- 「時間の都合により別タスクとして実施予定」は禁止
- 「実装が複雑すぎるため後回し」は禁止
- 未完了タスク（`[ ]`）を残したまま作業を終了しない

### タスクスキップが許可される唯一のケース
以下の技術的理由に該当する場合のみスキップ可能:
- 実装方針の変更により、機能自体が不要になった
- アーキテクチャ変更により、別の実装方法に置き換わった
- 依存関係の変更により、タスクが実行不可能になった

---

## フェーズ1: ビルド情報の埋め込みと表示

- [x] `vite.config.ts` にビルド情報を計算する処理を追加
  - [x] `getBuildRevision()`（git短縮ハッシュ、未コミット変更があれば `-dirty` 付与、失敗時 `unknown`）
  - [x] `getBuildTimeJst()`（`Asia/Tokyo` で `YYYY-MM-DD HH:mm:ss JST`）
  - [x] `define` に `__BUILD_REVISION__` / `__BUILD_TIME_JST__` を追加
- [x] `src/vite-env.d.ts` を追加し、上記2定数をアンビエントに宣言
- [x] `src/buildInfo.ts` を追加し、型付きで re-export
- [x] `src/App.tsx` のヘッダー付近にビルド情報表示を追加
- [x] `src/styles.css` に表示用のスタイルを追加（既存の `.hint` 系に揃える）
- [x] `npm run build` を実行し、`dist/index.html` またはバンドル内に実際のリビジョン・
      日時が入っていることを確認（`950878d-dirty` が埋め込まれていることをバンドルから確認済み）

## フェーズ2: Service Worker を「ユーザー操作で更新」に変更

- [x] `vite.config.ts` の `VitePWA` の `registerType` を `'autoUpdate'` → `'prompt'` に変更
- [x] `src/sw.ts`
  - [x] `install` ハンドラの無条件 `self.skipWaiting()` 呼び出しを削除
  - [x] `message` イベントリスナーを追加し、`{type:'SKIP_WAITING'}` を受け取ったら
        `self.skipWaiting()` を呼ぶ
  - [x] 既存のコメント（「1つ失敗しただけでinstallごと落とさない」等）を新しい実装に合わせて更新
- [x] `src/store/useUpdateStore.ts` を追加（`updateAvailable` / `setUpdateAvailable` /
      `applyUpdate` / `setApplyUpdate`）
- [x] `src/pwaUpdate.ts` を追加
  - [x] `registerSW()` を呼び、`onNeedRefresh` で `updateAvailable = true`
  - [x] `onRegisteredSW` で `registration.update()` の定期チェック（1時間毎）を仕込む
  - [x] `visibilitychange` で `visible` に戻った時のチェックを仕込む
  - [x] `registerSW()` の戻り値を `useUpdateStore` の `applyUpdate` に結線する
- [x] `src/ui/UpdateBanner.tsx` を追加（`updateAvailable` のときだけ表示、「更新する」ボタン）
- [x] `src/main.tsx` を `registerSW({ immediate: true })` の直接呼び出しから
      `initServiceWorker()` に変更
- [x] `src/App.tsx` に `<UpdateBanner />` を差し込む
- [x] `src/styles.css` にバナー用のスタイルを追加（既存の `.panel` / `button.primary` を使う）

## フェーズ3: 品質チェックと修正

- [x] `npm test`(87件通過)
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run format:check`
- [x] `npm run build`

## フェーズ4: 動作確認

- [x] `npm run build` を実装前後で実行し、`950878d-dirty`(未コミット変更ありの短縮ハッシュ)が
      正しく埋め込まれることを確認。コミット後は `-dirty` が付かない短縮ハッシュに変わることは
      `getBuildRevision()` の実装（`git status --porcelain` が空なら付与しない）から自明であり、
      検証のためだけにコミットは作らない
- [x] `dist/assets/index-*.js` を直接読み、バンドルされた登録コードが `installed` / `waiting` /
      `messageSkipWaiting` / `controlling` を使う「prompt」経路であり、`autoUpdate` の
      無条件 `activated→reload` 経路ではないことをソース上で確認
- [x] `dist/sw.js` を直接読み、`install` ハンドラが `skipWaiting()` を呼ばず、
      `message` イベントで `SKIP_WAITING` を受けたときだけ呼ぶことを確認
- [x] 初回インストール(既存 SW が無い状態)では `waiting` する相手が存在せず、
      spec 上そのまま `activate`→`clients.claim()` に進むため、バナーは出ず共有ターゲット等は
      従来通り即座に使えることをロジック上で確認(実機での最終確認は別途ユーザーが実施)

## フェーズ5: ドキュメント更新

- [x] このファイルの下部に振り返りを記録

---

## 実装後の振り返り

### 実装完了日
2026-09-20

### 計画と実績の差分

**計画と異なった点**:
- design.md で計画した構成そのままで実装できた。差分は無い

**新たに必要になったタスク**:
- 特になし

**技術的理由でスキップしたタスク**:
- 無し

### 学んだこと

**技術的な学び**:
- `registerType: 'autoUpdate'`（vite-plugin-pwa）は「新しい SW が activated した瞬間に
  無条件で `window.location.reload()`」する実装であり、ユーザーへの予告は一切無い
  (`node_modules/vite-plugin-pwa/dist/client/build/register.js` で実際に確認した)
- `registerType: 'prompt'` に切り替えても、SW 自身が `install` ハンドラで無条件に
  `skipWaiting()` を呼んでいると `waiting` 状態を経由せず、結局 `onNeedRefresh` が
  発火しない。**クライアント側の registerType だけでなく、SW 側の skipWaiting 呼び出しを
  message 待ちに変える必要がある**、という両側の変更が対になっていることが分かった
- 初回インストール（既存 SW が無い）では、そもそも「待つ」対象の active worker が
  存在しないため spec 上 `skipWaiting()` を呼ばなくても即座に `activate` へ進む。
  そのため `install` ハンドラから無条件呼び出しを削除しても、初回インストール時の挙動
  （共有ターゲットが即座に使える等）は変わらない
- Vite の `sv-SE` ロケール + `toLocaleString` は `YYYY-MM-DD HH:mm:ss` 形式を素直に返すため、
  タイムゾーン変換後の日時パーツを手で組み立てる必要がなく、JST 表記が簡潔に書けた

**プロセス上の改善点**:
- 実装前に `node_modules` 内の実際の生成コード（register.js・workbox-window.js）を読んで
  仕様を確認したことで、「`registerType` を変えるだけ」という誤った実装（SW 側の
  skipWaiting 削除を忘れる）を避けられた。挙動が2つのファイル（クライアントの登録グルー
  コードと SW 本体）の組み合わせで決まる機能では、この確認が特に効いた

### 次回への改善提案
- 編集中の状態（ページ一覧・切り抜き位置）を将来永続化する場合、UpdateBanner の
  「更新する」の前に保存を挟む拡張ポイントとして `applyUpdate` を使える設計にしてある
- 実機（iPhone Safari / Windows Edge）でのデプロイ→バナー表示→更新の一連は、
  ユーザー側での実機確認が必要（このセッションではビルド出力の静的検証までに留めた）
