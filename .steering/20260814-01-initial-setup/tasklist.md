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

スキップ時は必ず理由を明記:
```markdown
- [x] ~~タスク名~~（実装方針変更により不要: 具体的な技術的理由）
```

---

## フェーズ1: PWA 雛形のセットアップ

- [x] npm プロジェクトを初期化し依存を入れる
  - [x] `package.json` を作成（ETFTracker のスクリプト構成に合わせる）
  - [x] React 19 / zustand / fflate と開発依存をインストール
- [x] ビルド設定を置く
  - [x] `vite.config.ts`（vite-plugin-pwa、Vitest 設定を含む）
  - [x] `tsconfig.json` / `tsconfig.app.json` / `tsconfig.sw.json` / `tsconfig.node.json`
  - [x] `eslint.config.js`
  - [x] `.prettierrc` / `.prettierignore`（実装中に追加。ETFTracker と同じ設定に揃えた）
  - [x] `.gitignore`
- [x] エントリポイントを置く
  - [x] `index.html`
  - [x] `src/main.tsx` / `src/App.tsx`
  - [x] `src/styles.css`
- [x] 雛形の状態で `npm run typecheck` と `npm run build` が通ることを確認

## フェーズ2: core 層（DOM 非依存）の実装とテスト

- [x] `src/core/types.ts` — Preset / Size / Offset / Placement / DrawRect の型定義
- [x] `src/core/errors.ts` — `ClipperMError` と code 定義
- [x] `src/core/presets.ts` — Clipper と同じ解像度プリセット
  - [x] `tests/presets.test.ts` — 値が正の整数であること、既定が第12世代であること
- [x] `src/core/geometry.ts` — 座標変換
  - [x] `coverZoom` / `containZoom` / `centeredOffset` / `clampOffset` / `imageToFrame` / `frameToImage`
  - [x] `computeDrawRect`（renderFrame から切り出した純関数。設計変更、下記の振り返りを参照）
  - [x] `tests/geometry.test.ts` — 覆えている軸は押し戻し・覆えていない軸は中央寄せの非対称性を検証
- [x] `src/core/dither.ts` — 16 階調グレースケール化
  - [x] Rec.601 の輝度変換、透明を白として扱う
  - [x] Floyd–Steinberg 誤差拡散
  - [x] `tests/dither.test.ts` — 階調数・端値の保存・サイズ不変を検証
- [x] `src/core/epub.ts` — 固定レイアウト EPUB3 の組み立て
  - [x] `container.xml` / `content.opf` / `nav.xhtml` / ページ XHTML の生成
  - [x] XML エスケープ
  - [x] `fflate.zipSync` で mimetype を先頭・level 0 で詰める
  - [x] `tests/epub.test.ts` — **ZIP のバイト列を直接検証**（先頭・method=0・extra 長 0・20 バイト）
  - [x] `tests/epub.test.ts` — 複数ページで spine 順序とページ数が一致すること
  - [x] `tests/epub.test.ts` — `cover-image` と UUID の一意性

## フェーズ3: render 層と UI

- [x] `src/render/decode.ts` — File → ImageBitmap（EXIF 向き反映）
- [x] `src/render/renderFrame.ts` — 出力解像度ちょうどで焼き出す
  - [x] 白背景で塗ってから重なり領域だけ転送
  - [x] グレースケール指定時に core/dither を通す
  - [x] iOS の Canvas 上限を踏んだ場合の検知（`assertCanvasUsable`）
- [x] `src/render/drawPreview.ts` — プレビュー / サムネイル共通の高速描画（実装中に追加）
- [x] `src/store/usePagesStore.ts` — ページ一覧と編集状態（zustand）
- [x] UI コンポーネント
  - [x] `src/ui/PresetSelect.tsx` — 解像度プリセット選択
  - [x] `src/ui/CropCanvas.tsx` — 枠固定・pan / pinch-zoom・2 段構えの描画
  - [x] `src/ui/PageList.tsx` — ページ一覧と並べ替え・削除
  - [x] `src/ui/SendPanel.tsx` — タイトル入力・EPUB 生成・送信
  - [x] `src/App.tsx` を実装して結線

## フェーズ4: 送信経路

- [x] `src/share/send.ts` — Web Share API とダウンロードのフォールバック
  - [x] `navigator.canShare({ files })` で事前判定
  - [x] `AbortError` をエラー扱いにしない
  - [x] フォールバックしたことを呼び出し側へ返す（`SendOutcome`）
- [x] Android の共有ターゲット
  - [x] manifest に `share_target` を宣言（vite.config.ts）
  - [x] `src/sw.ts` — POST を横取りして Cache 経由でアプリへ渡す
  - [x] `src/share/sharedFiles.ts` — 取り込み後に Cache を削除する

## フェーズ5: 品質チェックと修正

- [x] すべてのテストが通ることを確認
  - [x] `npm test` — 58 件すべて通過
- [x] リントエラーがないことを確認
  - [x] `npm run lint`
- [x] 型エラーがないことを確認
  - [x] `npm run typecheck`
- [x] ビルドが成功することを確認
  - [x] `npm run build` — manifest の `share_target` と sw.js のプリキャッシュ 10 件を目視確認

## フェーズ6: ドキュメント

- [x] `CLAUDE.md` を作成（実装に即した内容にする）
- [x] `README.md` を作成
- [x] 親の `d:\ClaudeCode\CLAUDE.md` のプロジェクト一覧に ClipperM を追加
- [x] 実装後の振り返り（このファイルの下部に記録）

---

## 実装後の振り返り

### 実装完了日
2026-08-14

### 計画と実績の差分

**計画と異なった点**:

- **jsdom による統合テストをやめた。** jsdom には Canvas が無く、`node-canvas` は
  ネイティブビルドを要するため Windows で環境を壊すリスクが割に合わない。
  代わりに `renderFrame` の中で唯一非自明だった「枠と画像の重なりを求める計算」を
  `core/geometry.computeDrawRect` として純関数に切り出し、node 上で検証するようにした。
  残った `renderFrame` は `drawImage` に値を渡すだけの薄い層になり、層の分割としても改善になった。
  （design.md のテスト戦略に反映済み）

- **`src/render/drawPreview.ts` を追加した。** CropCanvas の高速パスと PageList の
  サムネイルが同じ描画をしていたため、共通化した。

- **`tsconfig.sw.json` を追加した。** Service Worker は `lib: WebWorker` でなければ
  `self` の型が Window になり、実在しない API が型チェックを通ってしまう。
  アプリ側の tsconfig とは分けるしかなかった。

**新たに必要になったタスク**:

- **Prettier の設定ファイルを追加した。** `package.json` に `format:check` を置いたのに
  設定ファイルが無く、既定値（セミコロンあり・ダブルクォート・80 桁）と実際のコードが
  全面的に食い違っていた。ETFTracker の `.prettierrc`（semi / singleQuote / printWidth 100 /
  trailingComma all）に揃え、`.prettierignore` で `.steering` と手書きの
  `CLAUDE.md` / `README.md` を除外した。

**技術的理由でスキップしたタスク**:

- なし。全タスク完了。

### 学んだこと

**技術的な学び**:

- **fflate は EPUB の `mimetype` 要件を素直に満たせる。** エントリ単位で `{ level: 0 }` を
  指定でき、extra field も付けない。EpubCoverBuilder が PowerShell で強いられた
  「ZIP の先頭にローカルヘッダを手で差し込む」回避策は、JS 側では完全に不要だった。
  ただしそれを**信じずにバイト列で検証する**テストを置いた（epubcheck は CRC32 を見ないため、
  「チェッカが通る = 壊れていない」ではない、という EpubCoverBuilder の教訓は生きている）。

- **vite-plugin-pwa の injectManifest は `self.__WB_MANIFEST` を文字列検索している。**
  `declare const __WB_MANIFEST` として `self.` を省いて参照すると、バンドル後に
  リテラルが消えて "Unable to find a place to inject the manifest" で必ず失敗する。
  型のために分解して書きたくなるが、`self.` を付けたまま参照しなければならない。

- **npm 11 は install スクリプトを既定で保留する。** esbuild の postinstall が
  スキップされた警告が出るが、バイナリは `@esbuild/win32-x64` という
  プラットフォーム別の optional 依存から供給されるため、実際には動く。
  警告を見て慌てて `npm approve-scripts` を実行する必要はなかった。

**プロセス上の改善点**:

- Clipper と EpubCoverBuilder の既存ドキュメントが、実測ベースの制約
  （機種ごとの解像度・比率、mimetype の 3 条件、cover-image の必要性）を
  すべて記録していたおかげで、設計段階で調べ直す必要がほとんど無かった。
  ClipperM 側も同じ水準で CLAUDE.md に残した。

### 次回への改善提案

- **プリセットの定義が Clipper と二重管理になっている。** 現状は値を手で一致させ、
  `tests/presets.test.ts` が食い違いを検出するだけ。片方を直してもう片方を忘れる事故は
  テストで気づけるが、根本的には共有したい（JSON を 1 つ置いて両者が読む形が考えられる）。

- 実機（Android / iPhone）での動作確認がまだ。特に以下は実機でしか確かめられない:
  - 共有メニューに ClipperM が現れるか（HTTPS で配信し、PWA としてインストールした後でないと出ない）
  - iOS Safari が `application/epub+zip` の File を共有シートに渡せるか
  - 生成した EPUB が実際に Kindle で余白なく全画面表示されるか
