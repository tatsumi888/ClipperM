/**
 * 「枠に写り込んだ内容」を任意の大きさの Canvas へ手早く描く。
 *
 * 出力解像度で作り直さないので**白黒化やディザは反映されない**。
 * 操作中のプレビューとサムネイル専用。EPUB に入るものは renderFrame が作る。
 */

import type { Offset, Size } from '../core/types';
import type { FrameSource } from './renderFrame';

export function drawPlacement(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  source: FrameSource,
  imageSize: Size,
  frameWidth: number,
  zoom: number,
  offset: Offset,
): void {
  // frame 座標 → この Canvas の px。枠の幅を Canvas の幅に合わせる。
  const scale = canvasWidth / frameWidth;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(
    source,
    offset.x * scale,
    offset.y * scale,
    imageSize.width * zoom * scale,
    imageSize.height * zoom * scale,
  );
}
