# 設計書

## 方針: モードは「縮小の下限を選ぶだけ」

`cover` と `contain` を別々の配置ロジックにしない。**両者の違いは縮小の下限値だけ**にする。

```
containZoom ≦ coverZoom  （常に成り立つ）

cover   モード: 下限 = coverZoom
contain モード: 下限 = containZoom
```

`contain` モードでも拡大していけば連続的に cover を越えて枠を埋められる。逆は下限で止まる。
この捉え方にすると、既存の `clampOffset`（覆えている軸だけ押し戻し、覆えていない軸は中央寄せ）が
**そのまま両モードで正しく動く**。分岐を増やす必要がない。

## Clipper が踏んだ順序の罠を、構造で回避する

Clipper の `CLAUDE.md` にはこうある。

> `MainWindow._fit_whole()` が **先にロックを外してから** `fit_contain()` を呼ぶ。
> この順序を崩すとボタンが無反応になる。

ロックが有効なままズームを下げると、クランプが即座に押し戻して「ボタンが効かない」ように見える。

ClipperM では **store のアクション 1 つでモードとズームと offset を同時に set する**ことで、
この順序問題自体を発生させない。呼び出し側が順序を間違える余地を残さない。

```ts
setFitMode(id, mode) {
  // mode / zoom / offset を 1 回の set で書き換える
}
```

`CropCanvas` 側のクランプは `page.fitMode` を見て下限を決めるため、
set が終わった時点では既に新しい下限が適用されている。

## 変更点

### core/types.ts

```ts
export type FitMode = 'cover' | 'contain';
```

### core/geometry.ts

```ts
export function fitZoom(mode: FitMode, image: Size, frameW, frameH): number
export function placementFor(mode: FitMode, image: Size, frameW, frameH): Placement
```

`initialPlacement` は `placementFor('cover', ...)` に委譲する（既定の挙動は不変）。

### store/usePagesStore.ts

- `PageItem` に `fitMode: FitMode` を追加（追加時は `'cover'`）
- `setFitMode(id, mode)` を追加。モードとズームと offset を原子的に更新
- `replaceAll`（プリセット変更時の再配置）が**各ページの fitMode を尊重する**。
  ここを cover 固定のままにすると、プリセットを変えた瞬間に全体表示が解除される

### ui/CropCanvas.tsx

下限を `coverZoom` 固定から `fitZoom(page.fitMode, ...)` に変える。上限は従来どおり
「cover 倍率の 8 倍」に据える（contain を基準にすると、極端に横長の画像で上限が低すぎる）。

### ui/App.tsx

キャンバス直下にトグルを置く。選択中のページに効く。

```
[ 枠を埋める ][ 全体を表示 ]
```

## テスト戦略

`core/geometry.ts` に閉じた検証を追加する（node 上で動く）。

- `fitZoom('contain', ...) <= fitZoom('cover', ...)` が常に成り立つ
- `placementFor('contain', ...)` の配置で、画像が**どちらの軸も枠からはみ出さない**
- `placementFor('contain', ...)` の配置に `clampOffset` をかけても動かない（冪等）
- 縦横比が枠と一致する画像では cover と contain が一致する
- contain 配置での `computeDrawRect` が、少なくとも一方の軸で枠より小さい（＝余白が出る）

UI のトグル自体はテストしない（core の下限計算が正しければ、UI は値を渡すだけのため）。

## 出力への影響

`contain` のページは出力に白い余白が入る。`renderFrame` は既に白で塗ってから描いているので
**実装の変更は不要**。出力寸法がプリセットちょうどである性質も変わらない。
