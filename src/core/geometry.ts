/**
 * 座標計算。Clipper/clipper/imaging.py の移植。
 *
 * ## 中心となるモデル: 「枠は固定、画像を動かす」
 *
 * 一般的なクロップツールと逆で、切り出し枠は動かない。枠は出力解像度そのもので固定され、
 * ユーザーは下にある画像を pan / zoom して枠に写り込む内容を決める。この選択の帰結:
 *
 * - 出力サイズは常に指定値ちょうど。切り出し位置の計算が出力サイズに影響しない
 * - zoom が「元画像のどの範囲を写すか」に直結する（表示倍率ではない）
 * - 元画像が枠より小さければ zoom > 1.0 となり、自動的に拡大されて指定解像度を満たす
 *
 * ## 座標系は 3 つ。混同すると壊れる
 *
 * | 座標系 | 単位 | 用途 |
 * |---|---|---|
 * | image  | 元画像の px | 元データ |
 * | frame  | 出力画像の px | zoom と offset はこの系で定義される |
 * | screen | 画面上の px | 描画時のみ。frame から表示倍率で変換する |
 *
 * 変換の定義は 1 本だけ:  frameX = imageX * zoom + offsetX
 */

import type { DrawRect, FitMode, Offset, Placement, Size } from './types';

/** image 座標 → frame 座標。 */
export function imageToFrame(imageX: number, imageY: number, zoom: number, offset: Offset): Offset {
  return { x: imageX * zoom + offset.x, y: imageY * zoom + offset.y };
}

/** frame 座標 → image 座標。 */
export function frameToImage(frameX: number, frameY: number, zoom: number, offset: Offset): Offset {
  return { x: (frameX - offset.x) / zoom, y: (frameY - offset.y) / zoom };
}

/** 枠を隙間なく覆う最小倍率。元画像が枠より小さければ 1.0 を超える。 */
export function coverZoom(image: Size, frameW: number, frameH: number): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.max(frameW / image.width, frameH / image.height);
}

/** 画像全体が枠に収まる最大倍率。必ず余白が出る。 */
export function containZoom(image: Size, frameW: number, frameH: number): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.min(frameW / image.width, frameH / image.height);
}

/** 画像を枠の中央に置く offset。 */
export function centeredOffset(image: Size, frameW: number, frameH: number, zoom: number): Offset {
  return {
    x: (frameW - image.width * zoom) / 2,
    y: (frameH - image.height * zoom) / 2,
  };
}

/**
 * 画像が枠を覆えている軸については、枠内に隙間ができない位置へ押し戻す。
 *
 * 覆えていない軸は中央寄せにする。この **非対称性が仕様** なので単純化しないこと。
 * 「覆えている軸は押し戻すだけ、覆えていない軸は問答無用で中央」でないと、
 * 縦長画像を横長の枠に入れたときに横方向がガタつく。
 */
export function clampOffset(
  image: Size,
  frameW: number,
  frameH: number,
  zoom: number,
  offset: Offset,
): Offset {
  const scaledW = image.width * zoom;
  const scaledH = image.height * zoom;

  let x: number;
  if (scaledW >= frameW) {
    x = Math.min(0, Math.max(offset.x, frameW - scaledW));
  } else {
    x = (frameW - scaledW) / 2;
  }

  let y: number;
  if (scaledH >= frameH) {
    y = Math.min(0, Math.max(offset.y, frameH - scaledH));
  } else {
    y = (frameH - scaledH) / 2;
  }

  return { x, y };
}

/**
 * 枠と画像の重なりを、drawImage の 9 引数版へ渡せる矩形として求める。
 *
 * Canvas の変換行列を使って画像全体を描くのではなく、**重なる領域だけを転送する**。
 * 枠外の巨大な領域を描かせないための最適化であると同時に、
 * 出力画像の端で 1px ずれないよう dest 側を整数に揃える役割がある。
 *
 * 重なりが無ければ null。
 */
export function computeDrawRect(
  image: Size,
  frameW: number,
  frameH: number,
  zoom: number,
  offset: Offset,
): DrawRect | null {
  if (image.width <= 0 || image.height <= 0 || zoom <= 0) return null;

  // 枠と画像の重なりを frame 座標の整数矩形として求める
  const dx0 = Math.max(0, Math.floor(offset.x));
  const dy0 = Math.max(0, Math.floor(offset.y));
  const dx1 = Math.min(frameW, Math.ceil(offset.x + image.width * zoom));
  const dy1 = Math.min(frameH, Math.ceil(offset.y + image.height * zoom));
  if (dx1 <= dx0 || dy1 <= dy0) return null;

  // その矩形に対応する元画像側の領域
  const sx0 = Math.max(0, (dx0 - offset.x) / zoom);
  const sy0 = Math.max(0, (dy0 - offset.y) / zoom);
  const sx1 = Math.min(image.width, (dx1 - offset.x) / zoom);
  const sy1 = Math.min(image.height, (dy1 - offset.y) / zoom);
  if (sx1 - sx0 <= 0 || sy1 - sy0 <= 0) return null;

  return {
    sx: sx0,
    sy: sy0,
    sw: sx1 - sx0,
    sh: sy1 - sy0,
    dx: dx0,
    dy: dy0,
    dw: dx1 - dx0,
    dh: dy1 - dy0,
  };
}

/**
 * 表示モードごとの「縮小の下限」。
 *
 * cover と contain は別々の配置ロジックではなく、**下限値が違うだけ**として扱う。
 *   containZoom ≦ coverZoom  （常に成り立つ）
 *
 * contain モードでも拡大していけば連続的に cover を越えて枠を埋められる。
 * この捉え方なら clampOffset（覆えている軸だけ押し戻し、覆えていない軸は中央寄せ）が
 * そのまま両モードで正しく動き、分岐を増やさずに済む。
 */
export function fitZoom(mode: FitMode, image: Size, frameW: number, frameH: number): number {
  return mode === 'contain' ? containZoom(image, frameW, frameH) : coverZoom(image, frameW, frameH);
}

/** 指定モードでちょうど収まる配置（中央寄せ）。 */
export function placementFor(
  mode: FitMode,
  image: Size,
  frameW: number,
  frameH: number,
): Placement {
  const zoom = fitZoom(mode, image, frameW, frameH);
  return { zoom, offset: centeredOffset(image, frameW, frameH, zoom) };
}

/**
 * 画像を枠に対して初期配置する。
 *
 * 既定は cover（枠を埋める）。Clipper の lock_min_zoom が既定で真なのと同じ考えで、
 * 「まず余白の無い状態から始めて、必要なら引く」ほうが実用的だったため。
 */
export function initialPlacement(image: Size, frameW: number, frameH: number): Placement {
  return placementFor('cover', image, frameW, frameH);
}
