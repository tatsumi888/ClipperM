import { describe, expect, it } from 'vitest';
import { KINDLE_GRAY_LEVELS, grayLevelValues, toKindleGray } from '../src/core/dither';

function makeRgba(width: number, height: number, fill: [number, number, number, number]) {
  const buffer = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    buffer[i * 4] = fill[0];
    buffer[i * 4 + 1] = fill[1];
    buffer[i * 4 + 2] = fill[2];
    buffer[i * 4 + 3] = fill[3];
  }
  return buffer;
}

function uniqueValues(buffer: Uint8ClampedArray): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < buffer.length; i += 4) seen.add(buffer[i]);
  return [...seen].sort((a, b) => a - b);
}

describe('toKindleGray', () => {
  it('16 階調では 0..255 を 17 刻みにする', () => {
    expect(grayLevelValues(KINDLE_GRAY_LEVELS)).toEqual([
      0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255,
    ]);
  });

  it('出力値がすべて許された階調に載る', () => {
    // 誤差拡散を通しても、出た値は必ず量子化後の階調のいずれか。
    const width = 64;
    const height = 64;
    const buffer = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const value = (i * 37) % 256; // ばらつかせる
      buffer[i * 4] = value;
      buffer[i * 4 + 1] = 255 - value;
      buffer[i * 4 + 2] = (value * 3) % 256;
      buffer[i * 4 + 3] = 255;
    }
    toKindleGray(buffer, width, height);

    const allowed = new Set(grayLevelValues(KINDLE_GRAY_LEVELS));
    for (const value of uniqueValues(buffer)) {
      expect(allowed.has(value), `階調 ${value} は許されていない`).toBe(true);
    }
  });

  it('グレースケールなので RGB が揃い、アルファは不透明になる', () => {
    const buffer = makeRgba(8, 8, [200, 100, 50, 128]);
    toKindleGray(buffer, 8, 8);
    for (let i = 0; i < buffer.length; i += 4) {
      expect(buffer[i]).toBe(buffer[i + 1]);
      expect(buffer[i + 1]).toBe(buffer[i + 2]);
      expect(buffer[i + 3]).toBe(255);
    }
  });

  it('真っ白と真っ黒は誤差拡散をかけても保存される', () => {
    // ここが崩れると、白背景のスクリーンショットに薄いノイズが乗る。
    const white = makeRgba(16, 16, [255, 255, 255, 255]);
    toKindleGray(white, 16, 16);
    expect(uniqueValues(white)).toEqual([255]);

    const black = makeRgba(16, 16, [0, 0, 0, 255]);
    toKindleGray(black, 16, 16);
    expect(uniqueValues(black)).toEqual([0]);
  });

  it('透明部分は白として扱う（Kindle に透過は無い）', () => {
    // 黒へ合成してしまうと PNG の透明余白が真っ黒になる。
    const transparent = makeRgba(8, 8, [0, 0, 0, 0]);
    toKindleGray(transparent, 8, 8);
    expect(uniqueValues(transparent)).toEqual([255]);
  });

  it('バッファのサイズを変えず、同じ参照を返す', () => {
    const buffer = makeRgba(10, 10, [123, 123, 123, 255]);
    const before = buffer.length;
    const returned = toKindleGray(buffer, 10, 10);
    expect(returned).toBe(buffer);
    expect(buffer.length).toBe(before);
  });

  it('dither: false は誤差を撒かないので単色は単色のまま', () => {
    // 中間調 128 は 17 の倍数ではないため、丸めると単一の階調に落ちる。
    const flat = makeRgba(16, 16, [128, 128, 128, 255]);
    toKindleGray(flat, 16, 16, { dither: false });
    expect(uniqueValues(flat)).toHaveLength(1);
  });

  it('dither: true は単色の中間調を複数階調へばらす', () => {
    // 誤差拡散が実際に効いていることの確認。ばらさないと帯（バンディング）が出る。
    const flat = makeRgba(16, 16, [128, 128, 128, 255]);
    toKindleGray(flat, 16, 16, { dither: true });
    expect(uniqueValues(flat).length).toBeGreaterThan(1);
  });

  it('誤差拡散後の平均輝度が元の輝度に近い', () => {
    const size = 64;
    const flat = makeRgba(size, size, [128, 128, 128, 255]);
    toKindleGray(flat, size, size, { dither: true });
    let total = 0;
    for (let i = 0; i < flat.length; i += 4) total += flat[i];
    expect(total / (size * size)).toBeCloseTo(128, 0);
  });

  it('levels は 2 未満・256 超で丸められる', () => {
    const buffer = makeRgba(8, 8, [128, 128, 128, 255]);
    toKindleGray(buffer, 8, 8, { levels: 1, dither: false });
    // levels=2 相当（白か黒のみ）
    for (const value of uniqueValues(buffer)) {
      expect([0, 255]).toContain(value);
    }
  });

  it('空の画像でも落ちない', () => {
    const empty = new Uint8ClampedArray(0);
    expect(() => toKindleGray(empty, 0, 0)).not.toThrow();
  });
});
