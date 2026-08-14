import { useEffect, useRef } from 'react';
import type { Preset } from '../core/types';
import { drawPlacement } from '../render/drawPreview';
import type { PageItem } from '../store/usePagesStore';

const THUMB_WIDTH = 132;

interface Props {
  pages: readonly PageItem[];
  preset: Preset;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

export function PageList({ pages, preset, selectedId, onSelect, onRemove, onMove }: Props) {
  if (pages.length === 0) {
    return <p className="empty-note">画像を追加すると、ここにページが並びます。</p>;
  }

  return (
    <ol className="page-list">
      {pages.map((page, index) => (
        <li key={page.id} className={page.id === selectedId ? 'page-item selected' : 'page-item'}>
          <button type="button" className="page-thumb-button" onClick={() => onSelect(page.id)}>
            <Thumbnail page={page} preset={preset} />
            <span className="page-index">{index + 1}</span>
          </button>
          <div className="page-actions">
            <button
              type="button"
              onClick={() => onMove(page.id, -1)}
              disabled={index === 0}
              aria-label={`${index + 1} ページ目を前へ`}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMove(page.id, 1)}
              disabled={index === pages.length - 1}
              aria-label={`${index + 1} ページ目を後ろへ`}
            >
              ↓
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => onRemove(page.id)}
              aria-label={`${index + 1} ページ目を削除`}
            >
              ×
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Thumbnail({ page, preset }: { page: PageItem; preset: Preset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = Math.round((THUMB_WIDTH * preset.height) / preset.width);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // サムネイルは白黒化しない。一覧で 10 枚ぶんディザをかけると重すぎるうえ、
    // 縮小表示ではどのみちドットパターンが潰れて意味を成さない。
    drawPlacement(
      ctx,
      canvas.width,
      canvas.height,
      page.bitmap,
      page.size,
      preset.width,
      page.zoom,
      page.offset,
    );
  }, [page.bitmap, page.offset, page.size, page.zoom, preset.width, preset.height]);

  return <canvas ref={canvasRef} width={THUMB_WIDTH} height={height} className="page-thumb" />;
}
