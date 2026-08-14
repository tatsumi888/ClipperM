import { describe, expect, it } from 'vitest';
import {
  centeredOffset,
  clampOffset,
  computeDrawRect,
  containZoom,
  coverZoom,
  fitZoom,
  frameToImage,
  imageToFrame,
  initialPlacement,
  placementFor,
} from '../src/core/geometry';

const FRAME_W = 1264;
const FRAME_H = 1680;

describe('座標変換', () => {
  it('frameX = imageX * zoom + offsetX が唯一の定義', () => {
    const offset = { x: 30, y: -20 };
    expect(imageToFrame(100, 200, 2, offset)).toEqual({ x: 230, y: 380 });
  });

  it('image と frame を往復できる', () => {
    const offset = { x: 12.5, y: -7.25 };
    const zoom = 1.37;
    const framePoint = imageToFrame(321, 654, zoom, offset);
    const back = frameToImage(framePoint.x, framePoint.y, zoom, offset);
    expect(back.x).toBeCloseTo(321, 10);
    expect(back.y).toBeCloseTo(654, 10);
  });
});

describe('coverZoom / containZoom', () => {
  it('cover は枠を隙間なく覆う最小倍率', () => {
    // 横長の画像を縦長の枠に入れる → 縦を満たす倍率が必要
    const zoom = coverZoom({ width: 4000, height: 3000 }, FRAME_W, FRAME_H);
    expect(zoom).toBeCloseTo(FRAME_H / 3000, 10);
    expect(4000 * zoom).toBeGreaterThanOrEqual(FRAME_W);
    expect(3000 * zoom).toBeCloseTo(FRAME_H, 6);
  });

  it('contain は画像全体が収まる最大倍率', () => {
    const zoom = containZoom({ width: 4000, height: 3000 }, FRAME_W, FRAME_H);
    expect(zoom).toBeCloseTo(FRAME_W / 4000, 10);
    expect(4000 * zoom).toBeCloseTo(FRAME_W, 6);
    expect(3000 * zoom).toBeLessThanOrEqual(FRAME_H);
  });

  it('元画像が枠より小さければ cover は 1.0 を超える', () => {
    // 指定解像度ちょうどを満たすため、小さい画像は自動的に拡大される
    const zoom = coverZoom({ width: 400, height: 300 }, FRAME_W, FRAME_H);
    expect(zoom).toBeGreaterThan(1);
  });

  it('寸法が 0 のときは 1.0 を返す（ゼロ除算を作らない）', () => {
    expect(coverZoom({ width: 0, height: 0 }, FRAME_W, FRAME_H)).toBe(1);
    expect(containZoom({ width: 0, height: 100 }, FRAME_W, FRAME_H)).toBe(1);
  });
});

describe('clampOffset', () => {
  it('覆えている軸では枠外に隙間を作らせない', () => {
    const image = { width: 4000, height: 3000 };
    const zoom = coverZoom(image, FRAME_W, FRAME_H);
    // 大きく右へずらしても、左端より右には来られない
    const clamped = clampOffset(image, FRAME_W, FRAME_H, zoom, { x: 9999, y: 0 });
    expect(clamped.x).toBe(0);

    // 大きく左へずらしても、右端が枠の右辺より内側には来られない
    const clampedLeft = clampOffset(image, FRAME_W, FRAME_H, zoom, { x: -9999, y: 0 });
    expect(clampedLeft.x).toBeCloseTo(FRAME_W - image.width * zoom, 6);
  });

  it('覆えていない軸は中央寄せになる（この非対称性が仕様）', () => {
    // contain 倍率では画像が枠より小さくなる軸ができる。
    // そこは押し戻しではなく中央固定。単純化して両軸とも同じ扱いにしてはいけない。
    const image = { width: 4000, height: 3000 };
    const zoom = containZoom(image, FRAME_W, FRAME_H);
    const clamped = clampOffset(image, FRAME_W, FRAME_H, zoom, { x: 0, y: 0 });
    expect(clamped.y).toBeCloseTo((FRAME_H - image.height * zoom) / 2, 6);
    // 覆えている（ぴったり一致する）軸は動かない
    expect(clamped.x).toBeCloseTo(0, 6);
  });

  it('中央寄せの軸は入力の offset を無視する', () => {
    const image = { width: 400, height: 300 };
    const zoom = 0.5; // どちらの軸も枠より小さい
    const a = clampOffset(image, FRAME_W, FRAME_H, zoom, { x: -500, y: 800 });
    const b = clampOffset(image, FRAME_W, FRAME_H, zoom, { x: 500, y: -800 });
    expect(a).toEqual(b);
    expect(a).toEqual(centeredOffset(image, FRAME_W, FRAME_H, zoom));
  });

  it('clamp は冪等', () => {
    const image = { width: 4000, height: 3000 };
    const zoom = coverZoom(image, FRAME_W, FRAME_H);
    const once = clampOffset(image, FRAME_W, FRAME_H, zoom, { x: -123, y: -456 });
    const twice = clampOffset(image, FRAME_W, FRAME_H, zoom, once);
    expect(twice).toEqual(once);
  });
});

describe('initialPlacement', () => {
  it('cover 倍率で中央に置く（既定で余白が出ない）', () => {
    const image = { width: 3000, height: 4000 };
    const placement = initialPlacement(image, FRAME_W, FRAME_H);
    expect(placement.zoom).toBeCloseTo(coverZoom(image, FRAME_W, FRAME_H), 10);

    // 置いた直後は clamp しても動かない = 隙間が無い
    const clamped = clampOffset(image, FRAME_W, FRAME_H, placement.zoom, placement.offset);
    expect(clamped.x).toBeCloseTo(placement.offset.x, 6);
    expect(clamped.y).toBeCloseTo(placement.offset.y, 6);
  });
});

describe('fitZoom / placementFor（表示モード）', () => {
  // 実際にスマホから来る画像の比率を並べる。横向きの写真と PC のスクショが
  // cover では大きく切れるケースであり、この機能の存在理由そのもの。
  const samples: Array<[string, number, number]> = [
    ['iPhone スクショ（縦長）', 1290, 2796],
    ['iPhone 写真 4:3（縦）', 3024, 4032],
    ['iPhone 写真 4:3（横）', 4032, 3024],
    ['PC スクショ FHD（横）', 1920, 1080],
    ['正方形', 2000, 2000],
  ];

  it('contain の下限は常に cover 以下', () => {
    for (const [name, width, height] of samples) {
      const image = { width, height };
      const contain = fitZoom('contain', image, FRAME_W, FRAME_H);
      const cover = fitZoom('cover', image, FRAME_W, FRAME_H);
      expect(contain, name).toBeLessThanOrEqual(cover);
    }
  });

  it('contain 配置では画像がどちらの軸も枠からはみ出さない', () => {
    for (const [name, width, height] of samples) {
      const image = { width, height };
      const { zoom, offset } = placementFor('contain', image, FRAME_W, FRAME_H);
      expect(offset.x, name).toBeGreaterThanOrEqual(-1e-9);
      expect(offset.y, name).toBeGreaterThanOrEqual(-1e-9);
      expect(offset.x + width * zoom, name).toBeLessThanOrEqual(FRAME_W + 1e-9);
      expect(offset.y + height * zoom, name).toBeLessThanOrEqual(FRAME_H + 1e-9);
    }
  });

  it('cover 配置では枠に隙間ができない', () => {
    for (const [name, width, height] of samples) {
      const image = { width, height };
      const { zoom } = placementFor('cover', image, FRAME_W, FRAME_H);
      expect(width * zoom, name).toBeGreaterThanOrEqual(FRAME_W - 1e-9);
      expect(height * zoom, name).toBeGreaterThanOrEqual(FRAME_H - 1e-9);
    }
  });

  it('contain 配置は clampOffset に対して冪等（勝手に押し戻されない）', () => {
    // ここが崩れると「全体を表示」を押した瞬間にクランプが巻き戻し、
    // ボタンが無反応に見える（Clipper が踏んだ罠）。
    for (const [name, width, height] of samples) {
      const image = { width, height };
      const { zoom, offset } = placementFor('contain', image, FRAME_W, FRAME_H);
      const clamped = clampOffset(image, FRAME_W, FRAME_H, zoom, offset);
      expect(clamped.x, name).toBeCloseTo(offset.x, 6);
      expect(clamped.y, name).toBeCloseTo(offset.y, 6);
    }
  });

  it('枠と同じ比率なら cover と contain が一致する', () => {
    const image = { width: FRAME_W * 2, height: FRAME_H * 2 };
    expect(fitZoom('contain', image, FRAME_W, FRAME_H)).toBeCloseTo(
      fitZoom('cover', image, FRAME_W, FRAME_H),
      10,
    );
  });

  it('比率が違えば contain で余白が出る（少なくとも一方の軸が枠より小さい）', () => {
    const image = { width: 1920, height: 1080 }; // 横長
    const { zoom, offset } = placementFor('contain', image, FRAME_W, FRAME_H);
    const rect = computeDrawRect(image, FRAME_W, FRAME_H, zoom, offset)!;
    expect(rect).not.toBeNull();
    expect(rect.dh).toBeLessThan(FRAME_H); // 上下に余白
    expect(rect.dw).toBe(FRAME_W); // 横は端まで
  });

  it('initialPlacement は cover と同じ（既定の挙動を変えていない）', () => {
    const image = { width: 4032, height: 3024 };
    expect(initialPlacement(image, FRAME_W, FRAME_H)).toEqual(
      placementFor('cover', image, FRAME_W, FRAME_H),
    );
  });
});

describe('computeDrawRect', () => {
  it('cover 配置では枠全体を埋める', () => {
    const image = { width: 3000, height: 4000 };
    const { zoom, offset } = initialPlacement(image, FRAME_W, FRAME_H);
    const rect = computeDrawRect(image, FRAME_W, FRAME_H, zoom, offset)!;
    expect(rect).not.toBeNull();
    expect(rect.dx).toBe(0);
    expect(rect.dy).toBe(0);
    expect(rect.dw).toBe(FRAME_W);
    expect(rect.dh).toBe(FRAME_H);
  });

  it('dest 側は整数（出力画像の端で 1px ずれない）', () => {
    const image = { width: 1234, height: 2345 };
    const rect = computeDrawRect(image, FRAME_W, FRAME_H, 1.234, { x: 12.7, y: -33.3 })!;
    for (const value of [rect.dx, rect.dy, rect.dw, rect.dh]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('dest は必ず枠内に収まる', () => {
    const image = { width: 800, height: 600 };
    const rect = computeDrawRect(image, FRAME_W, FRAME_H, 3, { x: -100.4, y: -50.9 })!;
    expect(rect.dx).toBeGreaterThanOrEqual(0);
    expect(rect.dy).toBeGreaterThanOrEqual(0);
    expect(rect.dx + rect.dw).toBeLessThanOrEqual(FRAME_W);
    expect(rect.dy + rect.dh).toBeLessThanOrEqual(FRAME_H);
  });

  it('source は必ず元画像内に収まる', () => {
    const image = { width: 800, height: 600 };
    const rect = computeDrawRect(image, FRAME_W, FRAME_H, 0.5, { x: -100, y: -80 })!;
    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sy).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(image.width + 1e-9);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(image.height + 1e-9);
  });

  it('画像が枠外へ完全に外れたら null', () => {
    const image = { width: 100, height: 100 };
    expect(computeDrawRect(image, FRAME_W, FRAME_H, 1, { x: -200, y: 0 })).toBeNull();
    expect(computeDrawRect(image, FRAME_W, FRAME_H, 1, { x: FRAME_W + 10, y: 0 })).toBeNull();
  });

  it('寸法や zoom が不正なら null', () => {
    expect(
      computeDrawRect({ width: 0, height: 100 }, FRAME_W, FRAME_H, 1, { x: 0, y: 0 }),
    ).toBeNull();
    expect(
      computeDrawRect({ width: 10, height: 10 }, FRAME_W, FRAME_H, 0, { x: 0, y: 0 }),
    ).toBeNull();
  });
});
