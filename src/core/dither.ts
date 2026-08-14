/**
 * Kindle の e-ink 表示（既定 16 階調グレースケール）への変換。
 *
 * ## 必ず出力解像度でかけること
 *
 * ディザリングは出力解像度でかけないと見え方が変わる。縮小して表示すると
 * ディザ模様が平均化されて消えてしまうため、プレビュー用に小さく作った画像へ
 * かけた結果は「保存されるもの」と一致しない。
 * 呼び出し側（render/renderFrame.ts）は必ず出力解像度の ImageData に対して適用する。
 *
 * ## DOM に依存しない
 *
 * 引数は ImageData ではなく Uint8ClampedArray + 寸法にしてある。
 * ImageData は DOM の型なので、これを受け取ると core が Node 上でテストできなくなる。
 */

/** Kindle の e-ink は 4bit = 16 階調。 */
export const KINDLE_GRAY_LEVELS = 16;

export interface GrayOptions {
  /** 階調数。2〜256。 */
  levels?: number;
  /** 誤差拡散をかけるか。false なら単純な丸め。 */
  dither?: boolean;
}

/**
 * RGBA バッファをグレースケール化して量子化する。
 *
 * **引数のバッファを破壊的に書き換え、同じ参照を返す。**
 * スマホでは出力解像度ぶんのバッファ（Scribe で 1860x2480x4 = 約 18MB）を
 * 何枚も複製したくないため、あえてコピーを作らない。
 */
export function toKindleGray(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: GrayOptions = {},
): Uint8ClampedArray {
  const levels = Math.max(2, Math.min(256, Math.trunc(options.levels ?? KINDLE_GRAY_LEVELS)));
  const dither = options.dither ?? true;
  const pixelCount = width * height;
  if (pixelCount <= 0) return rgba;

  // 誤差拡散は丸め前の値に誤差を足し込むため、8bit では足りず浮動小数の作業バッファが要る。
  const buffer = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    buffer[i] = luminanceOverWhite(rgba, i * 4);
  }

  if (dither) {
    floydSteinberg(buffer, width, height, levels);
  } else {
    const step = 255 / (levels - 1);
    for (let i = 0; i < pixelCount; i += 1) {
      buffer[i] = clamp255(Math.round(buffer[i] / step) * step);
    }
  }

  for (let i = 0; i < pixelCount; i += 1) {
    const value = buffer[i];
    const offset = i * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

/**
 * Rec.601 の輝度。透明部分は白紙として扱う。
 *
 * Kindle に透過は無いので、アルファは白へ合成してしまう。
 * ここで黒へ合成すると、PNG のスクリーンショットの透明余白が真っ黒になる。
 */
function luminanceOverWhite(rgba: Uint8ClampedArray, offset: number): number {
  const alpha = rgba[offset + 3] / 255;
  const r = rgba[offset] * alpha + 255 * (1 - alpha);
  const g = rgba[offset + 1] * alpha + 255 * (1 - alpha);
  const b = rgba[offset + 2] * alpha + 255 * (1 - alpha);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Floyd–Steinberg 誤差拡散。
 *
 * 誤差の配分:
 *        *   7/16
 *  3/16 5/16 1/16
 *
 * 端の画素では配分先が無くなるが、**誤差を捨てる**（他所へ寄せない）。
 * 寄せると端に沿って明るさが偏った線が出る。
 */
function floydSteinberg(buffer: Float32Array, width: number, height: number, levels: number): void {
  const step = 255 / (levels - 1);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = rowStart + x;
      const oldValue = buffer[index];
      const newValue = clamp255(Math.round(oldValue / step) * step);
      buffer[index] = newValue;
      const error = oldValue - newValue;
      if (error === 0) continue;

      if (x + 1 < width) {
        buffer[index + 1] += (error * 7) / 16;
      }
      if (y + 1 < height) {
        const nextRow = index + width;
        if (x > 0) {
          buffer[nextRow - 1] += (error * 3) / 16;
        }
        buffer[nextRow] += (error * 5) / 16;
        if (x + 1 < width) {
          buffer[nextRow + 1] += error / 16;
        }
      }
    }
  }
}

function clamp255(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

/** 量子化後に現れうる階調値の一覧。テストと UI の説明に使う。 */
export function grayLevelValues(levels: number = KINDLE_GRAY_LEVELS): number[] {
  const step = 255 / (levels - 1);
  return Array.from({ length: levels }, (_, i) => clamp255(Math.round(i * step)));
}
