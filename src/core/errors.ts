/**
 * アプリ内で意図的に投げるエラー。
 *
 * 失敗を握りつぶさないための土台。Clipper の POST ACTION で
 * 「動いていないが理由が誰にも分からない」状態を作った反省から、
 * 失敗は必ず code を持たせて画面に出せる形にする。
 */

export type ClipperMErrorCode =
  /** 画像を開けなかった（HEIC 非対応など、ブラウザのデコーダ依存） */
  | 'DECODE_FAILED'
  /** Canvas の面積上限を超えた。iOS Safari では例外ではなく空白が返るため自前で検知する */
  | 'CANVAS_TOO_LARGE'
  /** Canvas のコンテキストを取得できなかった */
  | 'CANVAS_UNAVAILABLE'
  /** EPUB の組み立てに失敗 */
  | 'EPUB_BUILD_FAILED'
  /** Web Share API が使えない。呼び出し側はダウンロードへフォールバックする */
  | 'SHARE_UNSUPPORTED';

export class ClipperMError extends Error {
  readonly code: ClipperMErrorCode;

  constructor(code: ClipperMErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ClipperMError';
    this.code = code;
  }
}

export function isClipperMError(value: unknown): value is ClipperMError {
  return value instanceof ClipperMError;
}
