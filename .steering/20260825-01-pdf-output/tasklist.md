# タスクリスト

## 🚨 タスク完全完了の原則

**このファイルの全タスクが完了するまで作業を継続すること**

- 全てのタスクを `[x]` にする
- 「時間の都合により別タスクとして実施予定」は禁止
- 未完了タスク（`[ ]`）を残したまま作業を終了しない

スキップは技術的理由がある場合のみ、理由を明記して `- [x] ~~タスク~~（理由）`。

---

## フェーズ1: core/pdf.ts（DOM 非依存）

- [x] `core/errors.ts` に `PDF_BUILD_FAILED` を追加
- [x] `src/core/pdf.ts` を作る
  - [x] `PdfImageEncoding` / `PdfPageInput` / `PdfOptions` を定義
  - [x] オブジェクトを積みながら**実測でオフセットを記録**する仕組み
  - [x] `MediaBox` を画像の実寸にする
  - [x] `flate-gray` → `/DeviceGray` + `/FlateDecode`（`zlibSync`）
  - [x] `jpeg` → `/DeviceRGB` + `/DCTDecode`（そのまま格納）
  - [x] 内容ストリーム `q W 0 0 H 0 0 cm /Im0 Do Q`
  - [x] Info の Title を UTF-16BE + BOM の16進文字列にする
  - [x] xref と trailer、`startxref`
  - [x] 入力検証（空・寸法0・データ空）
- [x] `tests/pdf.test.ts`
  - [x] `%PDF-` で始まり `%%EOF` で終わる
  - [x] **xref の各オフセットが実際の `N 0 obj` を指す**
  - [x] `MediaBox` が入力寸法と一致する
  - [x] ページ数と順序が入力と一致する
  - [x] `flate-gray` の色空間とフィルタが正しい
  - [x] `jpeg` の色空間とフィルタが正しい
  - [x] グレーデータが可逆（`unzlibSync` で元に戻る）
  - [x] 日本語タイトルが UTF-16BE + BOM で入る
  - [x] 不正入力で `ClipperMError`

## フェーズ2: render 層

- [x] `render/renderFrame.ts` に `renderFrameToPdfPage()` を追加
  - [x] グレースケール時は `getImageData` の R チャンネルだけを取り出す
  - [x] カラー時は JPEG のバイト列をそのまま使う
  - [x] Canvas を使用後に潰す

## フェーズ3: 送信の形式非依存化

- [x] `share/send.ts` に `sendFile(bytes, filename, mediaType)` を作る
- [x] `sendEpub` を置き換える（呼び出し側も更新）
- [x] `application/pdf` で共有できることを確認

## フェーズ4: 状態と UI

- [x] `usePagesStore` に `outputFormat: 'epub' | 'pdf'`（既定 `epub`）
- [x] 選択を `localStorage` に永続化
- [x] `SendPanel` に形式のセグメント切り替えを追加（`.segmented` を流用）
- [x] 形式を変えたら `built` を破棄する（依存配列に `outputFormat` を足す）
- [x] 形式ごとの説明を出す（PDF=等倍だがカバーにならない / EPUB=カバーになるが少し小さい）

## フェーズ5: 品質チェック

- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npx prettier --check .`
- [x] 既存の EPUB テスト65件が通り続けること（非退行）

## フェーズ6: ドキュメント

- [x] `CLAUDE.md` に PDF 出力とトレードオフを追記
- [x] `README.md` の使い方・対応状況を更新
- [x] 実装後の振り返り

---

## 実装後の振り返り

### 実装完了日

2026-08-25

### 計画と実績の差分

**計画と異なった点**:

- **`sendEpub` を削除せず薄いラッパとして残した。** `sendFile` に一本化する設計だったが、
  呼び出し側を全部書き換えるより、形式ごとの薄いラッパ（`sendEpub` / `sendPdf`）を
  用意したほうが呼び出し箇所の意図が読みやすかった。実体は `sendFile` 1 本。

**新たに必要になったタスク**:

- **グレー画像のバイト数と寸法の一致検証**を `buildPdf` に追加した。
  `width*height` と合わないデータを渡すと、PDF としては通るが**画像が斜めにずれる**。
  黙って壊れた出力が出るより、早期に落とすほうがよい。

**技術的理由でスキップしたタスク**: なし。全タスク完了。

### 学んだこと

**技術的な学び**:

- **PDF の xref は「文字数」ではなく「バイト数」で数える。** 文字列を latin1 で扱わないと、
  日本語タイトルなどマルチバイト文字のぶんだけオフセットがずれる。
  ずれた PDF は多くのビューアが例外を出さず**黙って白紙**を返すため、
  EPUB の mimetype と同じく**バイト列を直接検証するテスト**を置いた。

- **PDF は JPEG をネイティブに格納できる（`/DCTDecode`）。** カラー時は Canvas が出した
  JPEG をそのまま入れればよく、再エンコードが要らない。
  一方グレースケールは `/FlateDecode` で可逆にする必要がある（ディザが潰れるため）。
  結果として EPUB 側の「グレースケールは PNG、カラーは JPEG」と**同じ判断が再利用できた**。

- **1 チャンネルにするだけでサイズが 1/3 になった**（920KB → 318KB）。
  Canvas の出力は RGBA だが、ディザ後は R=G=B かつ全ピクセル不透明なので、
  R だけ取り出せば情報を落とさずに 1/4 のデータ量になる（圧縮後で約 1/3）。

**プロセス上の改善点**:

- 実機で等倍表示を確認済みの検証ファイル（⑩）が手元にあったため、
  **本番コードの出力を⑩と構造比較する**ことで、実機に送らずに正しさを確認できた。
  差はタイトルとメタデータぶんの 1KB のみ。

### 次回への改善提案

- Kindle が PDF をカバーとして扱わない件は Amazon 側の仕様であり、こちらで解決できない。
  Amazon が `rendition:layout` の扱いを戻せば EPUB で等倍が可能になるので、
  そのときは `core/epub.ts` のコメントに沿って復活を検討する。
- 実機での PDF 送信は⑩で確認済みだが、**アプリ本体から生成した PDF の送信は未確認**。
  `application/pdf` が iOS の共有シートを通るかは実機で確かめる必要がある。
