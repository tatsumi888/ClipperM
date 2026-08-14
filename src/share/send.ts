/**
 * 生成した EPUB を Kindle へ渡す。
 *
 * 経路は「Web Share API → メールアプリ → Send to Kindle のアドレス (@kindle.com)」。
 * サーバも有料サービスも要らず、Wi-Fi 経由なら配信料金もかからない。
 *
 * ## ユーザー操作との関係（重要）
 *
 * `navigator.share()` は **ユーザー操作から来た呼び出しでないと拒否される**。
 * EPUB の生成は非同期で時間がかかるため、生成を await した後に share を呼ぶと
 * iOS でジェスチャが切れて弾かれることがある。
 * そのため UI 側は「EPUB を作る」と「送る」を **別のボタンに分けている**。
 * この関数は既に出来上がったバイト列を受け取るだけで、内部で重い処理をしない。
 */

import { ClipperMError } from '../core/errors';

export type SendOutcome =
  /** 共有シートに渡せた */
  | 'shared'
  /** 共有が使えずダウンロードした。呼び出し側はこれを画面に出すこと */
  | 'downloaded'
  /** ユーザーが共有シートを閉じた。失敗ではない */
  | 'cancelled';

export const EPUB_MEDIA_TYPE = 'application/epub+zip';

export function canShareFiles(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

export async function sendEpub(bytes: Uint8Array, filename: string): Promise<SendOutcome> {
  const blob = new Blob([bytes as BlobPart], { type: EPUB_MEDIA_TYPE });
  const file = new File([blob], filename, { type: EPUB_MEDIA_TYPE });

  // canShare で必ず事前判定する。share() をいきなり呼ぶと未対応環境で例外になる。
  if (!canShareFiles(file)) {
    downloadBlob(blob, filename);
    return 'downloaded';
  }

  try {
    await navigator.share({
      files: [file],
      title: filename,
      text: 'Send to Kindle のアドレス宛に送ってください。',
    });
    return 'shared';
  } catch (error) {
    // ユーザーが閉じただけ。エラーとして通知しない。
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'cancelled';
    }
    // 共有シートは出たが渡せなかった場合（受け手が epub を扱えないなど）。
    // 黙って諦めず、必ずダウンロードに落とす。
    downloadBlob(blob, filename);
    return 'downloaded';
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // 即座に revoke するとダウンロードが始まらない環境があるため、少し待つ。
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export function assertShareSupported(): void {
  if (typeof navigator.share !== 'function') {
    throw new ClipperMError('SHARE_UNSUPPORTED', 'この環境では共有を使えません。');
  }
}
