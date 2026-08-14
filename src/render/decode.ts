/**
 * File → ImageBitmap。
 *
 * EXIF の回転は `imageOrientation: 'from-image'` にブラウザ側で処理させる。
 * 自前で EXIF を解析しない（スマホの写真は Orientation が 1 以外のことが日常的にあり、
 * 手で実装すると必ずどこかの機種で外す）。
 */

import { ClipperMError } from '../core/errors';

export interface DecodedImage {
  readonly bitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
  readonly name: string;
}

export interface DecodeFailure {
  readonly name: string;
  readonly error: ClipperMError;
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      bitmap.close();
      throw new ClipperMError('DECODE_FAILED', `${file.name} の寸法を取得できませんでした。`);
    }
    return { bitmap, width: bitmap.width, height: bitmap.height, name: file.name };
  } catch (cause) {
    if (cause instanceof ClipperMError) throw cause;
    // HEIC はブラウザのデコーダ次第。iOS Safari は開けるが、Android Chrome は機種による。
    throw new ClipperMError(
      'DECODE_FAILED',
      `${file.name} を開けませんでした。この形式に対応していない可能性があります。`,
      { cause },
    );
  }
}

/**
 * 複数ファイルをまとめて読む。
 *
 * **1 枚の失敗で全体を止めない。** 開けたものは取り込み、開けなかったものは
 * 名前を返して画面に出す。10 枚選んで 1 枚が HEIC 非対応、で全部落とすのは実用に耐えない。
 */
export async function decodeImageFiles(files: readonly File[]): Promise<{
  decoded: DecodedImage[];
  failures: DecodeFailure[];
}> {
  const results = await Promise.allSettled(files.map((file) => decodeImageFile(file)));
  const decoded: DecodedImage[] = [];
  const failures: DecodeFailure[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      decoded.push(result.value);
      return;
    }
    const reason = result.reason;
    failures.push({
      name: files[index]?.name ?? '(不明なファイル)',
      error:
        reason instanceof ClipperMError
          ? reason
          : new ClipperMError('DECODE_FAILED', '読み込みに失敗しました。', { cause: reason }),
    });
  });

  return { decoded, failures };
}
