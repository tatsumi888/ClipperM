# 設計書

## 方針: EPUB と同じ層構造にそのまま乗せる

```
src/core/pdf.ts          PDF のバイト列を組み立てる    ← DOM 非依存。Node でテストできる
src/render/renderFrame.ts 画像データの取り出しを追加     ← Canvas 依存
src/store/usePagesStore.ts 出力形式の状態
src/ui/SendPanel.tsx      形式の選択と送信
src/share/send.ts         PDF の MIME に対応
```

`core/pdf.ts` は `core/epub.ts` と同じ性格の関数になる。**入力はバイト列と寸法、出力はバイト列。** DOM に触れないので `environment: 'node'` のまま構造をバイト単位で検証できる。EPUB で「mimetype が先頭・無圧縮か」をバイト列で確かめたのと同じ手法を、PDF では **xref のオフセット**に対して行う。

`fflate` は純 JS なので core から使ってよい（`zlibSync` が PDF の `/FlateDecode` と同じ zlib 形式を出す）。新しい依存は増やさない。

## 画像の埋め込み方は白黒かどうかで決める

EPUB での「グレースケールは PNG、カラーは JPEG」と同じ判断を PDF に持ち込む。

| | フィルタ | 色空間 | 理由 |
|---|---|---|---|
| **グレースケール** | `/FlateDecode` | `/DeviceGray` | **可逆**。ディザリングのドットパターンを1ドットも壊さない。1チャンネルなので PNG(RGBA) の 1/3 になる |
| フルカラー | `/DCTDecode` | `/DeviceRGB` | Canvas が出した **JPEG をそのまま格納**する。PDF は JPEG をネイティブに扱えるので再エンコードが要らない |

グレースケールで JPEG を使ってはいけない（非可逆でディザが潰れる）。ここは EPUB 側と同じ制約。

## ページサイズ = 画像の実寸

```
MediaBox [0 0 W H]      W,H は画像のピクセル数をそのまま pt として使う
内容ストリーム: q W 0 0 H 0 0 cm /Im0 Do Q
```

pt として解釈されるので物理的には巨大なページになるが、**Kindle は PDF を画面に合わせて表示する**。ページの縦横比が端末と一致するので、結果としてピクセル等倍になる。これが PDF を選ぶ理由そのもの。

## core/pdf.ts の形

```ts
export type PdfImageEncoding = 'flate-gray' | 'jpeg';

export interface PdfPageInput {
  readonly data: Uint8Array;   // flate-gray なら生のグレー値、jpeg なら JPEG バイト列
  readonly encoding: PdfImageEncoding;
  readonly width: number;
  readonly height: number;
}

export interface PdfOptions {
  readonly title: string;
  readonly created?: Date;
}

export function buildPdf(pages: readonly PdfPageInput[], options: PdfOptions): {
  bytes: Uint8Array;
  filename: string;
};
```

**実装の要点**:

- **xref のオフセットは実測で積む。** 文字列を組み立てながら現在位置を数え、各オブジェクトの開始位置を記録する。ここがずれた PDF は多くのビューアが「壊れている」と言うか、黙って白紙を出す
- オブジェクト番号は `1=Catalog` / `2=Pages` / `3=Info`、以降ページごとに `Page` / `Image` / `Contents` の3つ
- 文字列は latin1 で扱う。UTF-8 で長さを数えるとオフセットがずれる
- **日本語タイトルは UTF-16BE + BOM の16進文字列**にする（PDF の text string 仕様）。latin1 のまま書くと化ける
- `flate-gray` のデータは `zlibSync(data, { level: 9 })` で圧縮してから格納する

## render 層の追加

```ts
export async function renderFrameToPdfPage(
  source, imageSize, frameW, frameH, zoom, offset, options
): Promise<PdfPageInput>
```

- `renderFrame()` で出力解像度の Canvas を作るところまでは既存と共通
- **グレースケール時**: `getImageData` の R チャンネルだけを取り出す（ディザ後は R=G=B なので R で十分）。`Uint8Array(w*h)` になる
- **カラー時**: `canvasToBlob('image/jpeg')` のバイト列をそのまま使う
- Canvas は使い終わったら潰す（既存と同じ）

## 形式の選択

- `usePagesStore` に `outputFormat: 'epub' | 'pdf'`（既定 `epub`。従来の挙動を変えない）
- 端末に永続化する。`localStorage` に薄く保存する（画像は保存しない方針だが、設定は別）
- `SendPanel` にセグメント切り替えを置く。「全体を表示」で使った `.segmented` のスタイルを流用する
- 形式を変えたら **`built` を破棄する**（既存の依存配列に `outputFormat` を足す）。古い形式のファイルを送らせない

## 送信

`share/send.ts` を形式非依存にする。

```ts
export async function sendFile(bytes, filename, mediaType): Promise<SendOutcome>
```

既存の `sendEpub` はこれを呼ぶ薄いラッパにするか、呼び出し側を差し替える。`application/pdf` は `navigator.canShare` の判定を通るはずだが、**通らなければ従来どおりダウンロードに落ちる**ので追加の分岐は要らない。

## テスト戦略

`tests/pdf.test.ts`（node 環境、既存と同じ）

- `%PDF-` で始まり `%%EOF` で終わる
- **xref の各エントリのオフセットが、実際に `N 0 obj` の位置を指している**（最重要。EPUB の mimetype バイト検証に相当する）
- `MediaBox` が入力寸法と一致する
- ページ数と順序が入力と一致する
- `flate-gray` → `/DeviceGray` `/FlateDecode`、`jpeg` → `/DeviceRGB` `/DCTDecode`
- 圧縮したグレーデータが `inflate` で元に戻る（可逆であることの確認）
- 日本語タイトルが UTF-16BE + BOM で入る
- 入力が空・寸法0・データ空なら `ClipperMError`

`fflate` の `unzlibSync` で展開して往復を確かめられるので、可逆性まで検証できる。

## エラーハンドリング

`core/errors.ts` に `PDF_BUILD_FAILED` を追加する。EPUB と同じ扱い（1枚の失敗で全体を止めない方針は取り込み側の話なので変更なし）。

## 実装の順序

1. `core/pdf.ts` + `tests/pdf.test.ts`（**ここが最も価値が高く、ブラウザ無しで完結する**）
2. `render/renderFrame.ts` に画像取り出しを追加
3. `share/send.ts` を形式非依存にする
4. store と UI
5. 品質チェック
6. ドキュメント

## 将来

- PDF のページに余白色を選べるようにする（現状は白固定）
- 1操作で両形式を出す
