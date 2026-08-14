# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

ClipperM は**スマホ内で完結する Clipper**。撮影した写真やスクリーンショットを Kindle の実解像度ちょうどに切り抜き、複数枚をまとめて固定レイアウト EPUB にして、Kindle へ送り込む PWA。

デスクトップ側の 2 つのツールを 1 つにまとめた位置づけになる。

```
Clipper（指定解像度で切り出し） + EpubCoverBuilder（1枚=1冊のEPUB化） → ClipperM（複数枚 → 1冊、スマホ内で完結）
```

**画像は一切外部へ送らない。** 切り抜きも白黒変換も EPUB 生成もすべてブラウザ内で行うため、サーバが存在しない。これは設計の都合ではなく要件（有料サービスを使わない）から来ている。iOS ネイティブアプリは Apple Developer Program が年 $99 かかるため選択肢から外れ、PWA 一択になった経緯がある。

## コマンド

```powershell
npm run dev                       # 開発サーバ
npm run build                     # 型チェック付きビルド（tsc -b && vite build）
npm test                          # Vitest（1回実行）
npm run lint                      # ESLint
npm run typecheck                 # tsc -b --noEmit
npx vitest run tests/epub.test.ts        # 単一ファイル
npx vitest run -t "mimetype は無圧縮"     # 名前で絞る
```

**一括の検証スクリプトは無い。** コミット前は `npm test` / `npm run lint` / `npm run typecheck` / `npm run build` の 4 つを通す。

`npm install` 時に **esbuild の postinstall がスキップされたという警告が出るが、無視してよい**（npm 11 の既定挙動）。バイナリは `@esbuild/win32-x64` という別パッケージから供給されるため実際には動く。`npm approve-scripts` を実行する必要はない。

## アーキテクチャ

### 層の境界: `src/core/` に DOM を持ち込まない

Clipper が `imaging.py` に Qt を持ち込まないことで画像処理を単体テストできている構造を、そのまま移植したもの。

```
src/ui/       React コンポーネント
src/store/    zustand。ページ一覧と編集状態
src/render/   Canvas を使う描画・切り出し          ← DOM 依存
src/core/     座標計算・階調変換・EPUB のバイト列   ← DOM 非依存。Node 上でテストできる
```

**この境界は 2 重に機械強制してある。** 崩そうとすると落ちる。

- `vite.config.ts` の Vitest 設定が `environment: 'node'`。core が DOM に触れた瞬間にテストが落ちる
- `eslint.config.js` が `src/core/**` に対して `document` / `window` / `navigator` を `no-restricted-globals` で禁止

そのため `core/dither.ts` は `ImageData` ではなく `Uint8ClampedArray` + 寸法を受け取る（`ImageData` は DOM の型なので、引数に取った時点で core が Node で動かなくなる）。

### 中心となるモデル: 「枠は固定、画像を動かす」

Clipper と同じ。一般的なクロップツールと逆で、**切り出し枠は動かない**。枠は出力解像度そのもので固定され、ユーザーは下の画像を pan / pinch-zoom して枠に写り込む内容を決める。

- 出力サイズは常に指定値ちょうど。切り出し位置の計算が出力サイズに影響しない
- zoom が「元画像のどの範囲を写すか」に直結する（表示倍率ではない）
- 元画像が枠より小さければ zoom > 1.0 となり、自動的に拡大されて指定解像度を満たす

座標系は 3 つあり、混同すると壊れる:

| 座標系 | 単位 | 用途 |
|---|---|---|
| image | 元画像の px | 元データ |
| **frame** | 出力画像の px | `zoom` と `offset` はこの系で定義される |
| screen | 画面上の px | 描画時のみ。`canvas.width / preset.width` で frame から変換 |

変換の定義は 1 本だけ: `frameX = imageX * zoom + offsetX`（`core/geometry.ts`）

### 表示モードは「縮小の下限を選ぶだけ」

各ページが `fitMode: 'cover' | 'contain'` を持つ（既定 `cover`）。**両者は別々の配置ロジックではなく、縮小の下限値が違うだけ**として実装してある。

```
containZoom ≦ coverZoom  （常に成り立つ）
cover   モード: 下限 = coverZoom   枠を埋める。比が違えば必ずどこかが切れる
contain モード: 下限 = containZoom 全体が入る。比が違えば白い余白が出る
```

`contain` のまま拡大すれば連続的に cover を越えて枠を埋められる。この捉え方にすると `clampOffset` の非対称性がそのまま両モードで正しく動くので、**分岐を増やさないこと**。

なお**拡大の上限は contain ではなく cover 基準**（`coverZoom * 8`）。contain を基準にすると、極端に横長の画像で上限が低くなりすぎて拡大できなくなる。

#### モード切り替えは原子的に行う（Clipper が踏んだ罠の回避）

Clipper の `CLAUDE.md` にはこうある。

> `MainWindow._fit_whole()` が**先にロックを外してから** `fit_contain()` を呼ぶ。この順序を崩すとボタンが無反応になる。

ロックが有効なままズームを下げると、クランプが即座に押し戻すため「ボタンが効かない」ように見える。

ClipperM では `usePagesStore.setFitMode()` が**モードとズームと offset を 1 回の `set()` で同時に書き換える**ことで、この順序問題自体を発生させない。呼び出し側が順序を間違える余地が無い構造にしてあるので、**ここを「モードだけ変える」と「配置だけ変える」に分解しないこと**。分解した瞬間に Clipper と同じ罠が復活する。

`tests/geometry.test.ts` の「contain 配置は clampOffset に対して冪等」がこの回帰を防いでいる。

また `setPreset` の再配置（`replaceAll`）は**各ページの `fitMode` を尊重する**。ここを cover 固定にすると、プリセットを変えた瞬間に全体表示が黙って解除される。

### `clampOffset` の非対称性は仕様

画像が枠を**覆えている軸だけ**押し戻し、覆えていない軸は問答無用で中央寄せにする。両軸を同じ扱いにして単純化すると、縦長画像を横長の枠に入れたときに横方向がガタつく。`tests/geometry.test.ts` がこの非対称性を検証している。

### 2 段構えのプレビュー描画（`ui/CropCanvas.tsx`）

ディザリングは**出力解像度でかけないと見え方が変わる**（縮小表示するとディザ模様が平均化されて消える）。一方で指を動かすたびに 1264×1680 を作り直してディザすると追従しない。そこで:

- **高速パス** — 操作中。`render/drawPreview.ts` が元画像を変形して描くだけ。白黒化しない
- **正確パス** — 操作が 120ms 止まったら `renderFrame()` を出力解像度で呼び直す。これが **EPUB に入るものと同一**

状態を変えたら必ず `invalidate()` を通すこと（高速パスで即座に見せ、静止タイマーを張り直す）。

### Clipper との意図的な差異: 枠外を描かない

Clipper は枠の外にも画像全体を 28% の不透明度で描き、位置合わせの手掛かりにしている（Clipper 側ではこれを消す最適化は禁止）。**ClipperM では枠の中だけを描く。** スマホの画面では枠外に割ける面積が無く、枠を小さくしてまで得られる利点より枠を画面幅いっぱいに使えることのほうが大きいため。Clipper のつもりで「枠外描画が抜けている」と直さないこと。

## EPUB 生成（`core/epub.ts`）

要件の出どころは `../EpubCoverBuilder/README.md`（実機と epubcheck で検証済みの知見）。

### mimetype の 3 条件（OCF 仕様。3 つとも外せない）

1. ZIP の**先頭**エントリであること
2. **無圧縮 (method=0 / Stored)** であること
3. extra field が無く、内容が改行なしの 20 バイト丁度であること

**fflate ならこれは素直に満たせる。** エントリ単位で `{ level: 0 }` を指定でき、オブジェクトのキー順がそのまま ZIP のエントリ順になる。EpubCoverBuilder が PowerShell で強いられた「ZIP の先頭にローカルヘッダを 58 バイト手で差し込む」回避策は JS では不要。

ただし**それを信じずにバイト列で検証している**（`tests/epub.test.ts`）。**epubcheck は CRC32 を検証しない**ため、ZIP を組む側の世界では「チェッカが通る = 壊れていない」ではない。実際 EpubCoverBuilder では CRC 計算を誤った版が epubcheck を無警告で通過した例がある。

### OPF に入れているものと理由

| 要素 | 値 | 理由 |
|---|---|---|
| `dc:identifier` | `urn:uuid:<毎回新規>` | 固定値だと Send to Kindle が同一書籍とみなし、更新が反映されないことがある |
| `dcterms:modified` | 秒精度の UTC | ミリ秒を含めると EPUB3 として不正 |
| `rendition:layout` | `pre-paginated` | 固定レイアウト。画像を画面いっぱいに出す |
| `properties="cover-image"` | 1 ページ目の画像のみ | **これが無いとスリープ時にカバーが出ない** |
| `<meta name="cover">` | EPUB2 互換の指定 | Kindle のカバー認識に効くので残している |

- `rendition` は EPUB3 の**予約プレフィックスなので `prefix` 属性で宣言しない**（宣言すると epubcheck が余計な警告を出す）
- 各ページの `viewport` には画像の実寸を書く。ここが実寸とずれると Kindle 側がスケーリングし、ディザのドットが潰れる
- 画像の拡張子は **`.jpg` に寄せる**。仕様上は `.jpeg` でも通るが Kindle のカバー認識が不安定
- 画像は既に JPEG/PNG で圧縮済みなので `{ level: 0 }` で格納する（再圧縮しても縮まず時間だけかかる）

### 出力形式は白黒かどうかで決まる（`render/renderFrame.ts`）

**グレースケール時は必ず PNG。** JPEG は非可逆なので、せっかく出力解像度でかけたディザリングのドットパターンをブロックノイズで壊す。フルカラー時は写真が主なので JPEG のほうが圧倒的に小さい。

## 解像度プリセット（`core/presets.ts`）

値は `../Clipper/clipper/presets.py` の `BUILTIN_PRESETS` と**手で一致させてある**（自動同期はしていない）。片方を変えたらもう片方も直すこと。`tests/presets.test.ts` が食い違いを検出する。

**機種ごとに縦横比が違う。**

```
第7/10世代 1072x1448 → 1.3507
第11世代   1236x1648 → 1.3333（ちょうど 3:4）
第12世代   1264x1680 → 1.3291
```

「どの機種でも崩れない共通の比率」は存在しない。比率だけ合わせて解像度を変えると Kindle 側がスケーリングし、全体がぼやけたうえディザのドットパターンが潰れる。**実機の解像度ちょうどで作るのが唯一確実な方法。**

同じ解像度の機種が複数ある（Paperwhite 第12世代と Oasis はどちらも 1264×1680）ため、選択の同定には `presetKey()` の `"1264x1680|機種名"` 形式を使う。解像度の数値だけでは同定できない。

## 注意点

- **`navigator.share()` はユーザー操作から来た呼び出しでないと拒否される。** EPUB の生成は数秒かかることがあり、`await` を挟むと iOS でジェスチャが切れる。そのため UI は「EPUB を作る」と「送る」を**別のボタンに分けてある**。ここを 1 ボタンにまとめないこと
- **`navigator.canShare({ files })` で必ず事前判定する。** `share()` をいきなり呼ぶと未対応環境で例外になる。`AbortError`（ユーザーが共有シートを閉じた）はエラー扱いにしない
- **共有が使えずダウンロードにフォールバックしたことは必ず画面に出す。** 黙って落とすと「送ったつもりで送れていない」状態になる（Clipper の POST ACTION で同種の失敗をした）
- **`self.__WB_MANIFEST` は `self.` を付けたまま参照する。** vite-plugin-pwa の injectManifest はビルド後のファイルからこの**リテラルを文字列検索**している。型のために分解して `declare const __WB_MANIFEST` と書くとバンドル後にリテラルが消え、`Unable to find a place to inject the manifest` で必ずビルドが落ちる
- **`ImageBitmap` は不要になったら `close()` する。** GC 任せにするとスマホでメモリが張り付く。`usePagesStore` の `removePage` / `clearAll` で閉じている
- **iOS Safari は Canvas の面積上限を超えると例外ではなく空白を返す。** `renderFrame()` は白で塗った直後に 1px 読んで実際に塗れているか確かめている（`assertCanvasUsable`）。この検査を「無駄だから」と外さないこと
- **EXIF の回転は自前で解析しない。** `createImageBitmap(file, { imageOrientation: 'from-image' })` にブラウザ処理させる。スマホの写真は Orientation が 1 以外なのが日常的で、手で実装すると必ずどこかの機種で外す
- **1 枚の失敗で取り込み全体を止めない。** HEIC の対応はブラウザ次第（iOS Safari は開けるが Android Chrome は機種による）。`decodeImageFiles` は成功したぶんだけ返し、失敗はファイル名を画面に出す

## 共有ターゲット（Android 限定）

manifest の `share_target` を宣言し、`src/sw.ts` が `POST /share-target` を横取りする。

POST のボディはそのままではアプリ側の JS から読めないので、**一度 Cache に逃がしてから 303 で GET のページを開かせる**のが定石。`src/share/sharedFiles.ts` が続きを担当し、**取り出したら必ず Cache を消す**（画像を端末内にも溜めない）。

**iOS Safari は Web Share Target 非対応**なので、この経路は Android だけ。iOS ではファイル選択から取り込む。これは技術的な制約であって未実装ではない。

`src/sw.ts` は `tsconfig.sw.json` で別扱いにしてある（`lib: WebWorker` にしないと `self` の型が `Window` になり、実在しない API が型チェックを通ってしまう）。

## Kindle 側の制約（変えられない部分）

- スリープ時に出るのは**最後に開いた本のカバー**
- Send to Kindle 経由だと「ドキュメント」扱いになることがある
- 完全な自動更新はできない（送信と「開く」操作が要る）
- 送信は Kindle のパーソナル・ドキュメントアドレス（`@kindle.com`）宛。**承認済みの差出人アドレスから送る必要がある**。Wi-Fi 経由なら配信料金はかからない

## 開発ワークフロー

作業単位のステアリングは `.steering/[YYYYMMDD]-[NN]-[機能名]/` に置く（`requirements.md` / `design.md` / `tasklist.md`）。`tasklist.md` が進捗の正であり、TodoWrite は補助。初期セットアップの記録は `.steering/20260814-01-initial-setup/` にある。

このプロジェクトはまだ `docs/` 配下の永続ドキュメントを持たない。設計判断の正典は本ファイルと、参照元である `../Clipper/CLAUDE.md`・`../EpubCoverBuilder/README.md`。

**ClipperM は Git リポジトリだが、リモートは未設定**（`git push` 先が存在しない）。既定ブランチは `main`。コミットメッセージは他プロジェクトに合わせて Conventional Commits + 日本語。

`.gitattributes` で改行を `eol=lf` に固定してある。**これを外さないこと。** Windows の `core.autocrlf=true` 環境で clone すると作業ツリーが CRLF になり、Prettier（`endOfLine` の既定は LF）が全ファイルを差分ありと判定して `npm run format:check` がリポジトリごと落ちる。

## デプロイ

配信先は Cloudflare Pages（プロジェクト名 `clipperm`）。**main に push すると `.github/workflows/deploy.yml` が検証を通してから自動でデプロイする。** 手動で出すこともできる。

```powershell
npx wrangler login                # 初回のみ
npm run deploy                    # build して Cloudflare Pages の本番へ
npm run deploy:preview            # preview ブランチへ（本番と別 URL で確認できる）
```

### この Pages プロジェクトは "Direct Upload" 型（重要）

`wrangler pages deploy` で作成したプロジェクトは **Direct Upload 型**になり、**後から Cloudflare 側の Git 連携（GitHub を繋いで自動ビルドさせる方式）へ切り替えることはできない。** 逆に Git 連携型のプロジェクトには `wrangler pages deploy` でアップロードできない。

つまり **2 つの方式は排他**で、ClipperM は Direct Upload + GitHub Actions を選んでいる。

- Cloudflare のダッシュボードで「Git を接続」しないこと。**`npm run deploy` と `deploy.yml` の両方が壊れる**
- 方式を変えたくなったら、プロジェクトを作り直すことになる

### CI に必要な設定

GitHub リポジトリの Secrets（Settings → Secrets and variables → Actions）に 2 つ登録する。

| Secret | 取得元 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare ダッシュボード → My Profile → API Tokens。権限は Account / Cloudflare Pages / **Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami` で確認できる |

**Pages プロジェクトは先にローカルの `npm run deploy` で 1 回作っておくこと。** CI は非対話なので、存在しないプロジェクト名を渡すと作成の確認ができずに失敗する。

### ワークフローの分担

| ファイル | 契機 | 内容 |
|---|---|---|
| `ci.yml` | pull request | lint / typecheck / format:check / test / build |
| `deploy.yml` | main への push | 同じ検証 → Cloudflare Pages へデプロイ |

main への push で `ci.yml` を走らせていないのは、`deploy.yml` が同じ検証を先に実行するため。**両方で走らせると同じチェックが 2 重に回る。**

- **ドメインのルートに置く前提。** manifest の `start_url` / `scope` が `/`、SW が横取りするのも `/share-target` で、`base` を設定していない。`clipperm.pages.dev` のようなルート配信なら問題ないが、**GitHub Pages のプロジェクトページ（`/ClipperM/` のようなサブパス）に置くと壊れる**
- `public/_headers` が `sw.js` / `manifest.webmanifest` / `index.html` を `no-cache` にしている。**ここを消さないこと。** Service Worker が長期キャッシュされると、デプロイし直しても端末が古い `sw.js` を掴み続ける
- `wrangler pages deploy` に **`--dry-run` は無い**（Workers の `wrangler deploy` にはあるが Pages には無い）。確認したいときは `deploy:preview` を使う

### 実機での確認

`vite.config.ts` の `server` / `preview` に `allowedHosts` を入れてあり、トンネル経由で実機から開ける。

```powershell
npm run preview                                    # 別ウィンドウで
cloudflared tunnel --url http://localhost:4173     # https://xxxx.trycloudflare.com
```

- **`npm run dev` では Service Worker が動かない**（`devOptions` を有効にしていないので SW は本番ビルドにしか出ない）。共有ターゲットを試すときは必ず `preview` 側
- **HTTP では Service Worker も `navigator.share` も動かない**（secure context 必須）。LAN の `http://<PCのIP>:4173` で試せるのは切り抜きと EPUB 生成とダウンロードまで。共有まわりは必ずトンネルの HTTPS URL で
