# ClipperM

スマホの中の画像を、Kindle の解像度ちょうどに切り抜いて、まとめて 1 冊の EPUB にして送るための PWA。

```
スマホの写真 / スクリーンショット
  → 切り抜き（機種の解像度ちょうど）
  → 16 階調グレースケール + ディザリング
  → 固定レイアウト EPUB（複数ページ）
  → 共有 → メール → @kindle.com
```

## なぜ作ったか

デスクトップには既に [Clipper](../Clipper/)（指定解像度で切り出す）と [EpubCoverBuilder](../EpubCoverBuilder/)（画像 1 枚をカバー付き EPUB にする）があり、この流れは確立している。

しかし**切り抜きたい画像の多くはスマホの中にある**。撮った写真、アプリのスクリーンショット。そのたびに PC へ転送するのが実用上の最大の摩擦だった。ClipperM はこれをスマホ内で完結させる。

あわせて、EpubCoverBuilder が未対応だった**複数ページ対応**（あちらは 1 枚 = 1 冊）をこちらで解決している。

## 制約: 有料サービスを使わない

これは希望ではなく、構成を決めた制約。

- **iOS ネイティブアプリは選べない** — Apple Developer Program が年 $99。したがって PWA 一択
- **サーバを持たない** — 切り抜きも白黒変換も EPUB 生成もすべてブラウザ内で完結する。画像は一切外部へ送られない
- **送信は Send to Kindle のメール受信を使う** — Wi-Fi 経由なら配信料金はかからない

## 使い方

1. 画像を追加する（ファイル選択、または Android なら OS の共有メニューから）
2. 出力解像度を選ぶ（Kindle 各機種のプリセット同梱）
3. 枠は固定なので、**指で画像を動かし、2 本指で拡大縮小**して構図を決める
4. 全体を切らずに入れたいときは「**全体を表示**」に切り替える（ページごとに選べる）
5. 必要なら「Kindle の 16 階調グレースケールにする」を有効にする
5. ページを並べ替える
6. 「EPUB を作る」→「送る」→ メールアプリで `@kindle.com` 宛に送信

「作る」と「送る」がボタンとして分かれているのは、`navigator.share()` がユーザー操作から来た呼び出ししか受け付けないため。生成を待ってから共有すると iOS で弾かれる。

### 枠を埋める / 全体を表示

Kindle は機種ごとに縦横比が違うため、画像の比率と一致することはまずない。どちらを捨てるかを選ぶ。

| | 結果 | 向いている画像 |
|---|---|---|
| **枠を埋める**（既定） | 余白なし。比が違えばどこかが切れる | 4:3 の縦写真、トリミングして見せたいもの |
| **全体を表示** | 全部入る。白い余白が出る | 横向きの写真、PC のスクリーンショット、全体を読みたいもの |

Paperwhite 第12世代（1264×1680）で「枠を埋める」を選んだとき、下限まで縮小しても見えるのは次の範囲。

| 画像 | 見える範囲 |
|---|---|
| iPhone スクショ 1290×2796 | 縦 61% |
| iPhone 写真 4:3 縦 3024×4032 | 100%（比がほぼ一致） |
| iPhone 写真 4:3 横 4032×3024 | 横 56% |
| PC スクショ FHD 1920×1080 | 横 42% |

余白は白。e-ink は白背景なので目立ちにくい。

### Kindle 側の準備

- 送信先は Kindle の**パーソナル・ドキュメントアドレス**（`@kindle.com`）
- **承認済みの差出人アドレス**から送る必要がある（Amazon のアカウント設定で登録する）
- スリープ画面に出したい場合は、送信後に Kindle で**一度その本を開く**（スリープ時に出るのは最後に開いた本のカバー）

## 開発

```powershell
npm install
npm run dev                       # 開発サーバ
npm run build                     # 型チェック付きビルド
npm test                          # Vitest
npm run lint
npm run typecheck
```

`npm install` で esbuild の postinstall がスキップされた警告が出るが、無視してよい（npm 11 の既定挙動。バイナリは別パッケージから供給される）。

### 実機で試す

Service Worker と共有機能は HTTPS（secure context）でしか動かない。トンネルを通すのが手軽。

```powershell
npm run preview                                    # 別ウィンドウで起動しておく
cloudflared tunnel --url http://localhost:4173     # https://xxxx.trycloudflare.com が出る
```

`vite.config.ts` に `allowedHosts` を入れてあるので、そのまま実機の Safari / Chrome で開ける。

**`npm run dev` では Service Worker が動かない**（本番ビルドにしか出ない）ので、共有ターゲットの確認は `preview` 側で行う。

### デプロイ（Cloudflare Pages）

```powershell
npx wrangler login       # 初回のみ
npm run deploy           # 本番
npm run deploy:preview   # preview ブランチ（本番と別 URL）
```

**ドメインのルートに置くこと。** manifest の `scope` が `/`、共有ターゲットが `/share-target` なので、サブパス配信（GitHub Pages のプロジェクトページなど）では壊れる。

### 構成

```
src/core/     DOM に触れない純粋関数（座標計算・階調変換・EPUB のバイト列）
src/render/   Canvas を使う描画・切り出し
src/store/    zustand。ページ一覧と編集状態
src/ui/       React コンポーネント
src/sw.ts     Service Worker（プリキャッシュと共有ターゲット）
```

`src/core/` が DOM 非依存であることは、Vitest の `environment: 'node'` と ESLint の `no-restricted-globals` で二重に強制している。おかげで最も壊れやすい部分（座標計算と EPUB のバイト列）をブラウザ無しで検証できる。

詳細な設計判断とハマりどころは [CLAUDE.md](CLAUDE.md) を参照。

## 対応状況

| | Android | iPhone |
|---|---|---|
| 切り抜き・EPUB 生成 | ○ | ○ |
| ファイル選択から取り込み | ○ | ○ |
| **共有メニューから取り込み** | ○ | × |
| 共有シートへ EPUB を渡す | ○ | ○ |

共有メニューからの取り込み（Web Share Target）は **iOS Safari が非対応**のため Android 限定。iOS ではファイル選択を使う。これは技術的な制約であって未実装ではない。

## 制限

- HEIC を開けるかはブラウザ依存（iOS Safari は開ける。Android Chrome は機種による）。開けなかったファイルは名前を表示して、残りの取り込みは続行する
- 生成した EPUB を端末内に履歴として保存しない
- e-ink のコントラストシミュレーション（Clipper の `eink_contrast` 相当）は未実装
- **実機での動作確認が未了。** 共有メニューへの登録、iOS での EPUB 共有、実際の Kindle 表示は HTTPS で配信してからでないと確かめられない

## 関連プロジェクト

| | 入力 | 出力 | 目的 |
|---|---|---|---|
| [Clipper](../Clipper/) | 画像 | 指定解像度の画像 | 切り出し（デスクトップ） |
| [EpubCoverBuilder](../EpubCoverBuilder/) | 画像 1 枚 | 1 ページの EPUB | Kindle を疑似ディスプレイ化 |
| **ClipperM** | スマホの画像 複数枚 | 複数ページの EPUB | 上 2 つをスマホ内で完結 |
| [InkFlow](../InkFlow/) | 雑誌記事 PDF | 固定レイアウト EPUB | 読み順の再ページ化（連携しない） |
