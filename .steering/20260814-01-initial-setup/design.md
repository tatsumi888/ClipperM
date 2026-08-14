# 設計書

## アーキテクチャ概要

**「純粋なコア + 環境依存の外殻」** という層構成を採る。これは Clipper が `imaging.py` に Qt を持ち込まないことで画像処理を単体テストできている構造を、そのまま TypeScript に移したもの。

```
┌─────────────────────────────────────────────┐
│ ui/            React コンポーネント          │  DOM + React
│   CropCanvas / PageList / SendPanel          │
├─────────────────────────────────────────────┤
│ store/         zustand（ページ一覧と編集状態） │  React 非依存だが状態を持つ
├─────────────────────────────────────────────┤
│ render/        Canvas を使う描画・切り出し     │  DOM (Canvas/ImageBitmap)
│   decode.ts / renderFrame.ts                 │
├─────────────────────────────────────────────┤
│ core/          DOM に一切触らない純粋関数      │  ← Node 上でテストできる
│   geometry / presets / dither / epub         │
└─────────────────────────────────────────────┘
```

**鉄則: `src/core/` に DOM を持ち込まない。** `document` / `Canvas` / `Image` / `navigator` を参照しない。
座標計算・階調変換・EPUB のバイト列組み立てという、最も壊れやすく最もテストしたい部分が、
ブラウザ無しで検証できる状態を保つための境界である。`dither.ts` は `Uint8ClampedArray` を受け取って
返すだけにし、`ImageData` を引数に取らない（`ImageData` は DOM 型のため）。

## コンポーネント設計

### 1. core/geometry.ts

**責務**:
- 3 つの座標系（image / frame / screen）の間の変換
- cover / contain 倍率、中央寄せ offset、枠に隙間を作らない clamp

**実装の要点**:
- 変換の定義は 1 本だけ: `frame_x = image_x * zoom + offset_x`
- Clipper の `cover_zoom` / `contain_zoom` / `centered_offset` / `clamp_offset` を移植する。
  挙動を変えない（Clipper 側のテストで実証済みの仕様であるため）
- `clamp_offset` は「画像が枠を覆えている軸だけ押し戻し、覆えていない軸は中央寄せ」。
  この非対称性が仕様なので単純化しない

### 2. core/presets.ts

**責務**: Kindle 各機種の出力解像度を持つ

**実装の要点**:
- 値は `Clipper/clipper/presets.py` の `BUILTIN_PRESETS` と一致させる。
  **機種ごとに縦横比が違う**（第7/10世代 1.3507 / 第11世代 1.3333 / 第12世代 1.3291）ので、
  「共通の比率」に丸めてはいけない
- 既定は Paperwhite 第12世代 (1264×1680)

### 3. core/dither.ts

**責務**: RGBA バイト列を 16 階調グレースケール化する

**実装の要点**:
- **必ず出力解像度でかける。** 縮小表示してからディザすると模様が平均化されて消える
- Floyd–Steinberg の誤差拡散を自前で書く（ブラウザに相当機能が無いため）。
  誤差の配分は右 7/16・左下 3/16・下 5/16・右下 1/16
- 透明ピクセルは白として扱う（Kindle に透過は無い）
- 輝度は Rec.601 (`0.299R + 0.587G + 0.114B`)

### 4. core/epub.ts

**責務**: ページ画像の配列から固定レイアウト EPUB3 のバイト列を組み立てる

**実装の要点**:
- **`mimetype` は先頭・無圧縮・extra field なし・20 バイト丁度。** OCF 仕様の要求で、3 つとも外せない。
  `fflate` の `zipSync` に `{ level: 0 }` を指定し、オブジェクトの**最初のキー**として渡す
  （fflate は挿入順を保持する）。生成後にバイト列を検証するテストを必ず置く
- EpubCoverBuilder が PowerShell で苦労した部分（`ZipArchive` が Stored にできずヘッダを手で差し込んだ）は、
  **fflate なら素直に解決する**。手組みの必要は無い
- `dc:identifier` は生成ごとに新しい UUID。固定値だと Send to Kindle が同一書籍とみなし、
  更新が反映されないことがある
- `rendition:layout` = `pre-paginated`、各 XHTML の `viewport` に画像の実寸を書く
- 1 ページ目に `properties="cover-image"` と EPUB2 互換の `<meta name="cover">` を両方付ける。
  **これが無いと Kindle のスリープ画面にカバーが出ない**
- 画像の拡張子は `.jpg` に寄せる（`.jpeg` だと Kindle のカバー認識が不安定）
- XML に埋める文字列は必ずエスケープする（タイトルはユーザー入力）

### 5. render/decode.ts

**責務**: `File` → `ImageBitmap` + 実寸

**実装の要点**:
- `createImageBitmap(file, { imageOrientation: 'from-image' })` で EXIF の向きを反映する。
  自前で EXIF を解析しない
- HEIC はブラウザのデコーダ次第。開けなかった場合はそのファイルだけ握りつぶさずエラーとして返す

### 6. render/renderFrame.ts

**責務**: 枠に写り込んだ内容を出力解像度ちょうどの Canvas に描く

**実装の要点**:
- `drawImage` の 9 引数版で、枠と画像の重なりだけを転送する
- 背景を白で塗ってから描く（透過を白に落とすため）
- グレースケール指定時は描画後に `getImageData` → `core/dither` → `putImageData`

### 7. share/send.ts

**責務**: EPUB を共有シートに渡す。無理ならダウンロード

**実装の要点**:
- `navigator.canShare({ files })` で**必ず事前判定する**。`share()` を直接呼ぶと未対応環境で例外になる
- ユーザー操作のハンドラから同期的に呼ぶ必要がある。EPUB 生成を待ってから呼ぶと
  iOS でユーザージェスチャが切れて拒否されることがあるため、**生成完了後に「送る」ボタンを出す**
- `AbortError`（ユーザーが共有シートを閉じた）はエラー扱いにしない

## データフロー

### 画像を切り抜いて EPUB を送る
```
1. ファイル選択 or 共有ターゲットで File[] を受け取る
2. decode.ts が ImageBitmap にする（EXIF 向き反映）
3. store に「ページ」として積む。各ページは zoom / offset を持つ
4. CropCanvas で pan / pinch-zoom → store の zoom / offset を更新
   （更新のたびに geometry.clampOffset を通す）
5. 「EPUB を作る」→ 各ページを renderFrame で出力解像度に焼き、
   グレースケール指定なら dither をかけ、JPEG/PNG の Blob にする
6. epub.ts が Uint8Array を組み立てる
7. share/send.ts が Web Share API に渡す → メールアプリ → @kindle.com
```

### Android の共有から取り込む
```
1. manifest の share_target（POST / multipart-form-data）
2. Service Worker が fetch を横取りし、formData から画像を取り出して Cache に置く
3. アプリ側へリダイレクト。起動後に Cache から拾って store へ積む
```

## エラーハンドリング戦略

### カスタムエラークラス

`core/errors.ts` に `ClipperMError` を置き、`code` で区別する。

| code | 意味 |
|---|---|
| `DECODE_FAILED` | 画像を開けなかった（HEIC 非対応など） |
| `CANVAS_TOO_LARGE` | Canvas の上限を超えた（iOS で顕著） |
| `EPUB_BUILD_FAILED` | EPUB 組み立てに失敗 |
| `SHARE_UNSUPPORTED` | 共有 API が使えない（ダウンロードへ落とす） |

### エラーハンドリングパターン

- **1 枚の失敗で全体を止めない。** 取り込みは成功したぶんだけ進め、失敗したファイル名を一覧で見せる
- 共有の失敗は握りつぶさずダウンロードにフォールバックし、**フォールバックしたことを画面に出す**
  （Clipper の POST ACTION で「動いていないが理由が分からない」状態を作った反省を引き継ぐ）
- `AbortError` はユーザーの意思なので通知しない

## テスト戦略

### ユニットテスト（Vitest / Node 環境）

- `geometry.test.ts` — cover / contain / centered / clamp。特に「画像が枠より小さい軸は中央寄せ」の非対称性
- `dither.test.ts` — 16 階調に収まること、真っ白・真っ黒が保存されること、サイズが変わらないこと
- `epub.test.ts` — **ZIP のバイト列を直接検証**する。mimetype が先頭・method=0・extra 長 0・20 バイト。
  さらに `unzipSync` で全エントリを取り出し、OPF に必要な要素が入っていること、
  ページ数と spine の順序が一致することを確認
- `presets.test.ts` — 全プリセットが正の整数で、Clipper と同じ値であること

### 統合テスト（jsdom）— 不要になった

当初は「ページを 2 枚積んで EPUB を作る流れ」を jsdom で通す想定だった。
しかし jsdom には Canvas が無く、`node-canvas` はネイティブビルドを要するため
Windows で環境を壊すリスクが割に合わない。

代わりに **`renderFrame` の難しい部分を `core/geometry.computeDrawRect` として切り出した**。
枠と画像の重なりを求める計算（Clipper の `render_frame` の box 指定に相当）が
唯一の非自明なロジックであり、これが純関数になったことで node 上で検証できる。
残った `render/renderFrame.ts` は `computeDrawRect` の結果を `drawImage` に渡すだけの薄い層で、
テストで守る価値のある分岐を持たない。

結果として層の分割自体が良くなったので、この変更は妥協ではなく改善として採用する。

## 依存ライブラリ

```json
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "zustand": "^5",
    "fflate": "^0.8"
  }
}
```

`fflate` を選ぶ理由: MIT / 依存ゼロ / 小さい（~8KB）/ **エントリ単位で圧縮レベルを指定できる**。
最後の点が EPUB の `mimetype` 要件に直結するため、JSZip ではなくこちらにする。

## ディレクトリ構造

```
ClipperM/
├─ index.html
├─ package.json / tsconfig*.json / vite.config.ts / eslint.config.js
├─ public/
│   └─ icons/
├─ src/
│   ├─ main.tsx / App.tsx / styles.css
│   ├─ core/          DOM 非依存
│   │   ├─ geometry.ts
│   │   ├─ presets.ts
│   │   ├─ dither.ts
│   │   ├─ epub.ts
│   │   ├─ errors.ts
│   │   └─ types.ts
│   ├─ render/
│   │   ├─ decode.ts
│   │   └─ renderFrame.ts
│   ├─ share/
│   │   └─ send.ts
│   ├─ store/
│   │   └─ usePagesStore.ts
│   ├─ ui/
│   │   ├─ CropCanvas.tsx
│   │   ├─ PageList.tsx
│   │   ├─ PresetSelect.tsx
│   │   └─ SendPanel.tsx
│   └─ sw.ts          共有ターゲットの受け口
└─ tests/
    ├─ geometry.test.ts
    ├─ dither.test.ts
    ├─ epub.test.ts
    └─ presets.test.ts
```

## 実装の順序

1. 雛形（Vite + React + TS + PWA、lint / typecheck / test が通る空の状態）
2. `core/` を実装しテストを書く（ここが最も価値が高く、ブラウザ無しで検証できる）
3. `render/` と UI（実際に切り抜けるようにする）
4. `share/` と共有ターゲット
5. 品質チェック
6. ドキュメント

## セキュリティ考慮事項

- **画像は一切外部に送信しない。** すべて端末内で処理する。これは制約であると同時に本アプリの性質
- 共有ターゲットで受けた画像を置く Cache は、取り込み後に必ず削除する（端末に残さない）
- ユーザー入力（EPUB タイトル）は XML に埋めるため必ずエスケープする

## パフォーマンス考慮事項

- **iOS Safari には Canvas の面積上限がある。** 上限を超えると例外ではなく**空白の Canvas が返る**ため、
  描画後にピクセルを確認して検知する。Kindle の最大解像度 Scribe (1860×2480 = 4.6M px) は上限内だが、
  入力側のスマホ写真は 12M px を超えることがあるので、`ImageBitmap` を保持したまま何枚も積むとメモリを圧迫する
- ページを積むほどメモリが増えるので、`ImageBitmap` は不要になったら `close()` する
- EPUB 生成は枚数に比例して重い。UI をブロックしないよう、生成中は進捗を出す

## 将来の拡張性

- e-ink コントラストのプレビュー再現（Clipper の `eink_contrast` 相当）
- 生成した EPUB の履歴を IndexedDB に保持
- ページの並べ替えをドラッグ操作で行う
- Clipper 側とプリセット定義を共有する仕組み（現状は値を手で一致させている）
