/**
 * 出力の生成と送信。
 *
 * **生成と送信をあえて 2 つのボタンに分けている。**
 * navigator.share() はユーザー操作から来た呼び出しでないと拒否されるが、
 * 生成は非同期で数秒かかることがあり、await を挟むと iOS でジェスチャが切れる。
 * 「作る」→ 出来上がってから「送る」の 2 段にすれば、送信は常に新しいタップから始まる。
 *
 * ## 形式のトレードオフ（Kindle 側の仕様なので解消できない）
 *
 * - EPUB: カバーになる（スリープ画面に出る）が、Kindle が余白を付けて縮小する
 * - PDF : 等倍で表示される（変換を挟まない）が、Kindle はカバーとして扱わない
 */

import { useEffect, useState } from 'react';
import { buildEpub, type EpubPageInput } from '../core/epub';
import { isClipperMError } from '../core/errors';
import { buildPdf, type PdfPageInput } from '../core/pdf';
import type { OutputFormat, Preset } from '../core/types';
import { renderFrameToBytes, renderFrameToPdfPage } from '../render/renderFrame';
import { EPUB_MEDIA_TYPE, PDF_MEDIA_TYPE, sendFile } from '../share/send';
import type { PageItem } from '../store/usePagesStore';

interface Props {
  pages: readonly PageItem[];
  preset: Preset;
  grayscale: boolean;
  dither: boolean;
  outputFormat: OutputFormat;
  onChangeFormat: (format: OutputFormat) => void;
}

interface BuiltFile {
  bytes: Uint8Array;
  filename: string;
  mediaType: string;
  sizeLabel: string;
}

export function SendPanel({
  pages,
  preset,
  grayscale,
  dither,
  outputFormat,
  onChangeFormat,
}: Props) {
  const [title, setTitle] = useState('ClipperM');
  const [built, setBuilt] = useState<BuiltFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 中身や形式が変わったら、出来上がっているものは古い。黙って古いものを送らせない。
  useEffect(() => {
    setBuilt(null);
  }, [pages, preset, grayscale, dither, title, outputFormat]);

  const handleBuild = async () => {
    if (pages.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(0);

    try {
      const epubInputs: EpubPageInput[] = [];
      const pdfInputs: PdfPageInput[] = [];

      for (const [index, page] of pages.entries()) {
        if (outputFormat === 'pdf') {
          pdfInputs.push(
            await renderFrameToPdfPage(
              page.bitmap,
              page.size,
              preset.width,
              preset.height,
              page.zoom,
              page.offset,
              { grayscale, dither },
            ),
          );
        } else {
          const { bytes, mediaType } = await renderFrameToBytes(
            page.bitmap,
            page.size,
            preset.width,
            preset.height,
            page.zoom,
            page.offset,
            { grayscale, dither },
          );
          epubInputs.push({ bytes, mediaType, width: preset.width, height: preset.height });
        }
        setProgress(Math.round(((index + 1) / pages.length) * 100));
        // 1 枚ごとに制御を返さないと、枚数が多いときに画面が固まったように見える。
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const result =
        outputFormat === 'pdf' ? buildPdf(pdfInputs, { title }) : buildEpub(epubInputs, { title });
      setBuilt({
        bytes: result.bytes,
        filename: result.filename,
        mediaType: outputFormat === 'pdf' ? PDF_MEDIA_TYPE : EPUB_MEDIA_TYPE,
        sizeLabel: formatBytes(result.bytes.length),
      });
      setMessage(`${pages.length} ページの ${outputFormat.toUpperCase()} を作りました。`);
    } catch (cause) {
      setError(isClipperMError(cause) ? cause.message : '生成に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!built) return;
    const outcome = await sendFile(built.bytes, built.filename, built.mediaType);
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
      <h2 className="panel-title">形式を選んで送る</h2>

      <div className="segmented" role="group" aria-label="出力形式">
        <button
          type="button"
          className={outputFormat === 'epub' ? 'segment active' : 'segment'}
          aria-pressed={outputFormat === 'epub'}
          onClick={() => onChangeFormat('epub')}
        >
          EPUB
        </button>
        <button
          type="button"
          className={outputFormat === 'pdf' ? 'segment active' : 'segment'}
          aria-pressed={outputFormat === 'pdf'}
          onClick={() => onChangeFormat('pdf')}
        >
          PDF
        </button>
      </div>

      <p className="hint">
        {outputFormat === 'pdf'
          ? 'PDF: 画面ぴったりの等倍で表示されます。ただしスリープ画面のカバーにはなりません。'
          : 'EPUB: スリープ画面のカバーになります。ただし Kindle が余白を付けるため少し小さく表示されます。'}
      </p>

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
          {busy ? `作成中 ${progress}%` : `${outputFormat.toUpperCase()} を作る`}
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
