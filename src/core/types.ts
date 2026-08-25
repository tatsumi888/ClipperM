/**
 * core 層の型定義。
 *
 * ここに DOM の型（ImageBitmap / Blob / Canvas など）を持ち込まないこと。
 * 画像の実体を扱う型は render 層・store 層側に置く。
 */

/** 出力解像度プリセット。 */
export interface Preset {
  /** 表示名。機種名と世代を含む。 */
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** 画像の寸法（px）。 */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * frame 座標系での画像の位置。
 *
 * 座標変換の定義はこれ 1 本だけ:
 *   frameX = imageX * zoom + offset.x
 */
export interface Offset {
  readonly x: number;
  readonly y: number;
}

/** 元画像を frame 座標へ置くための変換。 */
export interface Placement {
  readonly zoom: number;
  readonly offset: Offset;
}

/**
 * 枠に対する画像の収め方。**縮小の下限を選ぶだけ**のもの。
 *
 * - `cover`   枠を隙間なく埋める。余白は出ないが、比が違えば必ずどこかが切れる
 * - `contain` 画像全体を収める。切れないが、比が違えば白い余白が出る
 *
 * どちらのモードでも拡大側は自由で、contain のまま拡大すれば cover を越えて枠を埋められる。
 */
export type FitMode = 'cover' | 'contain';

/**
 * drawImage へ渡す矩形。source は元画像座標、dest は frame 座標。
 * 枠と画像が重ならない場合は null になる（computeDrawRect を参照）。
 */
export interface DrawRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
}

/**
 * 出力形式。Kindle 側の仕様でトレードオフがあるため、用途で選ぶ。
 *
 * - `epub`  カバーになる（スリープ画面に出る）が、Kindle が余白を付けて縮小するため等倍にならない
 * - `pdf`   等倍で表示される（変換を挟まない）が、Kindle はカバーとして扱わない
 *
 * 経緯は CLAUDE.md の「固定レイアウトは使えない」を参照。
 */
export type OutputFormat = 'epub' | 'pdf';
