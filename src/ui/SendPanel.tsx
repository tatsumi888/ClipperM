/**
 * EPUB の生成と送信。
 *
 * **生成と送信をあえて 2 つのボタンに分けている。**
 * navigator.share() はユーザー操作から来た呼び出しでないと拒否されるが、
 * EPUB の生成は非同期で数秒かかることがあり、await を挟むと iOS でジェスチャが切れる。
 * 「作る」→ 出来上がってから「送る」の 2 段にすれば、送信は常に新しいタップから始まる。
 */

import { useEffect, useState } from 'react';
import { buildEpub, type EpubPageInput } from '../core/epub';
import { isClipperMError } from '../core/errors';
import type { Preset } from '../core/types';
import { renderFrameToBytes } from '../render/renderFrame';
import { sendEpub } from '../share/send';
import type { PageItem } from '../store/usePagesStore';

interface Props {
  pages: readonly PageItem[];
  preset: Preset;
  grayscale: boolean;
  dither: boolean;
}

interface BuiltEpub {
  bytes: Uint8Array;
  filename: string;
  sizeLabel: string;
}

export function SendPanel({ pages, preset, grayscale, dither }: Props) {
  const [title, setTitle] = useState('ClipperM');
  const [built, setBuilt] = useState<BuiltEpub | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 中身が変わったら、出来上がっている EPUB は古い。黙って古いものを送らせない。
  useEffect(() => {
    setBuilt(null);
  }, [pages, preset, grayscale, dither, title]);

  const handleBuild = async () => {
    if (pages.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(0);

    try {
      const inputs: EpubPageInput[] = [];
      for (const [index, page] of pages.entries()) {
        const { bytes, mediaType } = await renderFrameToBytes(
          page.bitmap,
          page.size,
          preset.width,
          preset.height,
          page.zoom,
          page.offset,
          { grayscale, dither },
        );
        inputs.push({ bytes, mediaType, width: preset.width, height: preset.height });
        setProgress(Math.round(((index + 1) / pages.length) * 100));
        // 1 枚ごとに制御を返さないと、枚数が多いときに画面が固まったように見える。
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const result = buildEpub(inputs, { title });
      setBuilt({
        bytes: result.bytes,
        filename: result.filename,
        sizeLabel: formatBytes(result.bytes.length),
      });
      setMessage(`${pages.length} ページの EPUB を作りました。`);
    } catch (cause) {
      setError(isClipperMError(cause) ? cause.message : 'EPUB の生成に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!built) return;
    const outcome = await sendEpub(built.bytes, built.filename);
    if (outcome === 'shared') {
      setMessage('共有しました。メールアプリから @kindle.com 宛に送ってください。');
    } else if (outcome === 'downloaded') {
      // フォールバックしたことを必ず画面に出す。黙って落とすと
      // 「送ったつもりで送れていない」状態になる。
      setMessage('この環境では共有を使えないため、端末に保存しました。');
    }
  };

  return (
    <section className="panel">
      <h2 className="panel-title">EPUB にして送る</h2>

      <label className="field">
        <span className="field-label">タイトル</span>
        <input
          className="field-control"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="ClipperM"
        />
      </label>

      <div className="button-row">
        <button type="button" onClick={handleBuild} disabled={busy || pages.length === 0}>
          {busy ? `作成中 ${progress}%` : 'EPUB を作る'}
        </button>
        <button type="button" className="primary" onClick={handleSend} disabled={!built}>
          {built ? `送る (${built.sizeLabel})` : '送る'}
        </button>
      </div>

      {message && <p className="note">{message}</p>}
      {error && <p className="note error">{error}</p>}

      <p className="hint">
        送信先は Kindle の「パーソナル・ドキュメント」アドレス（<code>@kindle.com</code>）。
        承認済みの差出人アドレスから送る必要があります。
      </p>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
