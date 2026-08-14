/**
 * 切り抜きキャンバス。枠は固定で、下の画像を pan / pinch-zoom して構図を決める。
 *
 * ## 2 段構えの描画（Clipper から引き継いだ設計）
 *
 * ディザリングは出力解像度でかけないと見え方が変わるが、指を動かすたびに
 * 1264x1680 を作り直してディザすると追従しない。そこで:
 *
 * - **高速パス** — 操作中。元画像を transform で描くだけ。白黒化しない
 * - **正確パス** — 操作が 120ms 止まったら renderFrame を出力解像度で呼び直す。
 *   これが「EPUB に入るもの」と同一
 *
 * ## Clipper との意図的な差異
 *
 * Clipper は枠の外にも画像全体を 28% の不透明度で描いて位置合わせの手掛かりにしている。
 * ClipperM では**枠の中だけ**を描く。スマホの画面では枠外に割ける面積が無く、
 * 枠を小さくしてまで得られる利点より、枠を画面幅いっぱいに使えることのほうが大きいため。
 */

import { useCallback, useEffect, useRef } from 'react';
import { clampOffset, coverZoom, fitZoom, frameToImage } from '../core/geometry';
import type { Offset, Preset } from '../core/types';
import { drawPlacement } from '../render/drawPreview';
import { renderFrame } from '../render/renderFrame';
import type { PageItem } from '../store/usePagesStore';

/** 正確パスへ切り替えるまでの静止時間。 */
const SETTLE_MS = 120;
const MAX_ZOOM_FACTOR = 8;

interface Props {
  page: PageItem;
  preset: Preset;
  grayscale: boolean;
  dither: boolean;
  onChange: (zoom: number, offset: Offset) => void;
}

interface PointerSample {
  x: number;
  y: number;
}

export function CropCanvas({ page, preset, grayscale, dither, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, PointerSample>());
  const gesture = useRef<{ centroid: PointerSample; spread: number } | null>(null);
  const settleTimer = useRef<number | null>(null);

  // 最新の配置を ref に持つ。ポインタ移動のたびに state を経由すると 1 フレーム遅れる。
  const placement = useRef({ zoom: page.zoom, offset: page.offset });
  placement.current = { zoom: page.zoom, offset: page.offset };

  /** 高速パス。元画像をそのまま変形して描く。 */
  const drawFast = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { zoom, offset } = placement.current;
    drawPlacement(
      ctx,
      canvas.width,
      canvas.height,
      page.bitmap,
      page.size,
      preset.width,
      zoom,
      offset,
    );
  }, [page.bitmap, page.size, preset.width]);

  /** 正確パス。出力解像度で作り直したものを縮小して見せる。 */
  const drawAccurate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { zoom, offset } = placement.current;
    try {
      const output = renderFrame(
        page.bitmap,
        page.size,
        preset.width,
        preset.height,
        zoom,
        offset,
        { grayscale, dither },
      );
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(output, 0, 0, canvas.width, canvas.height);
      output.width = 0;
      output.height = 0;
    } catch {
      // 正確パスが失敗しても操作は続けられるべきなので、高速パスの絵のままにする。
      drawFast();
    }
  }, [dither, drawFast, grayscale, page.bitmap, page.size, preset.height, preset.width]);

  const scheduleAccurate = useCallback(() => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      drawAccurate();
    }, SETTLE_MS);
  }, [drawAccurate]);

  /** 状態を変えたら必ずここを通す（高速パスで即座に見せ、静止したら焼き直す）。 */
  const invalidate = useCallback(() => {
    drawFast();
    scheduleAccurate();
  }, [drawFast, scheduleAccurate]);

  // 表示サイズが決まったらバッキングストアを合わせる
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * dpr);
      const height = Math.round((rect.width * preset.height) / preset.width) * dpr;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = Math.round(height);
      }
      invalidate();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [invalidate, preset.height, preset.width]);

  // 配置・出力設定が変わったら描き直す
  useEffect(() => {
    invalidate();
  }, [invalidate, page.id, page.zoom, page.offset, grayscale, dither]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const commit = useCallback(
    (zoom: number, offset: Offset) => {
      // 下限はモード次第（contain なら全体が収まるところまで引ける）。
      // 上限は contain ではなく **cover 基準** で決める。contain を基準にすると、
      // 極端に横長の画像で上限が低くなりすぎて拡大できなくなる。
      const minZoom = fitZoom(page.fitMode, page.size, preset.width, preset.height);
      const maxZoom = coverZoom(page.size, preset.width, preset.height) * MAX_ZOOM_FACTOR;
      const clampedZoom = Math.min(Math.max(zoom, minZoom), maxZoom);
      const clamped = clampOffset(page.size, preset.width, preset.height, clampedZoom, offset);
      placement.current = { zoom: clampedZoom, offset: clamped };
      drawFast();
      scheduleAccurate();
      onChange(clampedZoom, clamped);
    },
    [drawFast, onChange, page.fitMode, page.size, preset.height, preset.width, scheduleAccurate],
  );

  const sampleGesture = () => {
    const samples = [...pointers.current.values()];
    const count = samples.length;
    const centroid = samples.reduce(
      (acc, sample) => ({ x: acc.x + sample.x / count, y: acc.y + sample.y / count }),
      { x: 0, y: 0 },
    );
    const spread =
      count < 2 ? 0 : Math.hypot(samples[0]!.x - samples[1]!.x, samples[0]!.y - samples[1]!.y);
    return { centroid, spread };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = sampleGesture();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const previous = gesture.current;
    const current = sampleGesture();
    gesture.current = current;
    if (!previous) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // CSS px → frame px。バッキングストアではなく表示サイズを基準にする。
    const cssScale = rect.width / preset.width;

    const { zoom, offset } = placement.current;
    // まず指の移動ぶんだけ画像を動かす
    let nextOffset: Offset = {
      x: offset.x + (current.centroid.x - previous.centroid.x) / cssScale,
      y: offset.y + (current.centroid.y - previous.centroid.y) / cssScale,
    };
    let nextZoom = zoom;

    // 2 本指なら、指の間隔の変化ぶんだけ centroid を中心に拡大縮小する
    if (pointers.current.size >= 2 && previous.spread > 0 && current.spread > 0) {
      nextZoom = zoom * (current.spread / previous.spread);
      const frameX = (current.centroid.x - rect.left) / cssScale;
      const frameY = (current.centroid.y - rect.top) / cssScale;
      // centroid の下にある画像の点を、拡大後も同じ位置に留める
      const anchor = frameToImage(frameX, frameY, zoom, nextOffset);
      nextOffset = { x: frameX - anchor.x * nextZoom, y: frameY - anchor.y * nextZoom };
    }

    commit(nextZoom, nextOffset);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    gesture.current = pointers.current.size > 0 ? sampleGesture() : null;
  };

  // デスクトップで動作確認するためのホイールズーム
  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssScale = rect.width / preset.width;
    const { zoom, offset } = placement.current;

    const factor = Math.exp(-event.deltaY / 400);
    const frameX = (event.clientX - rect.left) / cssScale;
    const frameY = (event.clientY - rect.top) / cssScale;
    const anchor = frameToImage(frameX, frameY, zoom, offset);
    const nextZoom = zoom * factor;
    commit(nextZoom, { x: frameX - anchor.x * nextZoom, y: frameY - anchor.y * nextZoom });
  };

  return (
    <canvas
      ref={canvasRef}
      className="crop-canvas"
      style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    />
  );
}
