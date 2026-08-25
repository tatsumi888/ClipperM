/**
 * 枠に写り込んだ内容を出力解像度ちょうどの Canvas に焼く。
 *
 * ここが「保存されるもの」を作る唯一の場所。プレビューの高速パス（CropCanvas 側）は
 * あくまで見た目の近似であり、最終的な出力は必ずこの関数を通る。
 */

import { toKindleGray, type GrayOptions } from '../core/dither';
import { ClipperMError } from '../core/errors';
import { computeDrawRect } from '../core/geometry';
import type { PdfPageInput } from '../core/pdf';
import type { Offset, Size } from '../core/types';

export interface RenderOptions extends GrayOptions {
  /** 16 階調グレースケール化するか。false ならフルカラーのまま。 */
  grayscale?: boolean;
}

export type FrameSource = ImageBitmap | HTMLCanvasElement | HTMLImageElement;

export function renderFrame(
  source: FrameSource,
  imageSize: Size,
  frameW: number,
  frameH: number,
  zoom: number,
  offset: Offset,
  options: RenderOptions = {},
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = frameW;
  canvas.height = frameH;

  const grayscale = options.grayscale ?? false;
  // グレースケール時は getImageData を必ず呼ぶので、その旨をブラウザに伝えると速くなる。
  const ctx = canvas.getContext('2d', { willReadFrequently: grayscale });
  if (!ctx) {
    throw new ClipperMError('CANVAS_UNAVAILABLE', 'Canvas の 2D コンテキストを取得できません。');
  }

  // 透過を白へ落とす。Kindle に透明は無いので、先に白で塗ってしまう。
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, frameW, frameH);
  assertCanvasUsable(ctx, frameW, frameH);

  const rect = computeDrawRect(imageSize, frameW, frameH, zoom, offset);
  if (rect) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
  }

  if (grayscale) {
    // ディザは必ずこの解像度でかける。縮小してからかけると模様が平均化されて消える。
    const imageData = ctx.getImageData(0, 0, frameW, frameH);
    const gray: GrayOptions = { dither: options.dither ?? true };
    if (options.levels !== undefined) gray.levels = options.levels;
    toKindleGray(imageData.data, frameW, frameH, gray);
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

/**
 * iOS Safari の Canvas 面積上限を踏んだことを検知する。
 *
 * 上限を超えると **例外ではなく空白の Canvas が返る**（描画が黙って無視される）ため、
 * 白で塗った直後に 1px 読んで実際に塗れているかを確かめる。
 * Kindle の最大解像度 Scribe (1860x2480 = 4.6M px) は上限内だが、
 * 将来より大きいプリセットを足したときにここが効く。
 */
function assertCanvasUsable(ctx: CanvasRenderingContext2D, frameW: number, frameH: number): void {
  const probe = ctx.getImageData(0, 0, 1, 1).data;
  if (probe[3] !== 255) {
    throw new ClipperMError(
      'CANVAS_TOO_LARGE',
      `${frameW}x${frameH} の Canvas を作れませんでした。解像度の小さいプリセットを選んでください。`,
    );
  }
}

/**
 * 出力形式。
 *
 * **グレースケール時は必ず PNG。** JPEG は非可逆なので、せっかく出力解像度でかけた
 * ディザリングのドットパターンをブロックノイズで壊してしまう。
 * フルカラー時は写真が主なので JPEG のほうが圧倒的に小さい。
 */
export function outputMediaType(grayscale: boolean): 'image/png' | 'image/jpeg' {
  return grayscale ? 'image/png' : 'image/jpeg';
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mediaType: 'image/png' | 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new ClipperMError('CANVAS_TOO_LARGE', '画像の書き出しに失敗しました。'));
        }
      },
      mediaType,
      mediaType === 'image/jpeg' ? quality : undefined,
    );
  });
}

export async function renderFrameToBytes(
  source: FrameSource,
  imageSize: Size,
  frameW: number,
  frameH: number,
  zoom: number,
  offset: Offset,
  options: RenderOptions = {},
): Promise<{ bytes: Uint8Array; mediaType: 'image/png' | 'image/jpeg' }> {
  const canvas = renderFrame(source, imageSize, frameW, frameH, zoom, offset, options);
  const mediaType = outputMediaType(options.grayscale ?? false);
  const blob = await canvasToBlob(canvas, mediaType);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // 巨大な Canvas を GC 任せにするとスマホでメモリが張り付く。明示的に潰す。
  canvas.width = 0;
  canvas.height = 0;

  return { bytes, mediaType };
}

/**
 * PDF に埋め込む形で 1 ページぶんを焼き出す。
 *
 * 格納方式は白黒かどうかで変える（`core/pdf.ts` の設計と対）:
 *   - グレースケール: 生のグレー値。PDF 側で FlateDecode により**可逆**に格納される。
 *     ディザリングのドットパターンを 1 ドットも壊さない
 *   - フルカラー: JPEG のバイト列。PDF はこれをそのまま扱えるので再エンコードしない
 */
export async function renderFrameToPdfPage(
  source: FrameSource,
  imageSize: Size,
  frameW: number,
  frameH: number,
  zoom: number,
  offset: Offset,
  options: RenderOptions = {},
): Promise<PdfPageInput> {
  const grayscale = options.grayscale ?? false;
  const canvas = renderFrame(source, imageSize, frameW, frameH, zoom, offset, options);

  try {
    if (grayscale) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new ClipperMError(
          'CANVAS_UNAVAILABLE',
          'Canvas の 2D コンテキストを取得できません。',
        );
      }
      const rgba = ctx.getImageData(0, 0, frameW, frameH).data;
      // toKindleGray を通した後は R=G=B なので、R だけ取れば 1 チャンネルに落とせる。
      // RGBA のまま渡すと 4 倍のサイズになるうえ、PDF 側で色空間の指定が要る。
      const gray = new Uint8Array(frameW * frameH);
      for (let i = 0; i < gray.length; i += 1) gray[i] = rgba[i * 4];
      return { data: gray, encoding: 'flate-gray', width: frameW, height: frameH };
    }

    const blob = await canvasToBlob(canvas, 'image/jpeg');
    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      encoding: 'jpeg',
      width: frameW,
      height: frameH,
    };
  } finally {
    // 巨大な Canvas を GC 任せにするとスマホでメモリが張り付く。
    canvas.width = 0;
    canvas.height = 0;
  }
}
