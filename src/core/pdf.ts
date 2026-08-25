/**
 * 固定レイアウト PDF の組み立て。
 *
 * ## なぜ PDF があるのか
 *
 * Send to Kindle が `rendition:layout`（EPUB の固定レイアウト指定）を弾くようになり、
 * EPUB では等倍表示ができなくなった（Kindle 側が余白を付けて縮小する）。
 * PDF は変換を挟まずそのまま表示されるため、**ページサイズを画像の実寸に合わせれば等倍になる**。
 * 2026-08-24 に実機で確認済み。詳しい経緯は CLAUDE.md を参照。
 *
 * 代償として **Kindle は PDF をカバーとして扱わない**（スリープ画面に出ない）。
 * そのため EPUB を廃止せず、用途で選べるようにしてある。
 *
 * ## ページサイズ
 *
 * `MediaBox [0 0 W H]` の W,H に画像のピクセル数をそのまま入れる。
 * pt として解釈されるので物理的には巨大なページになるが、Kindle は PDF を画面に
 * 合わせて表示するため、縦横比が一致していれば結果としてピクセル等倍になる。
 *
 * ## DOM に依存しない
 *
 * `core/epub.ts` と同じ性格の関数。入力はバイト列と寸法、出力はバイト列。
 * fflate は純 JS なので core から使ってよい（`zlibSync` が PDF の `/FlateDecode` と
 * 同じ zlib 形式を出す）。
 */

import { zlibSync } from 'fflate';
import { ClipperMError } from './errors';
import { sanitizeFilename } from './epub';

export type PdfImageEncoding =
  /** 生のグレー値（1 ピクセル 1 バイト）。可逆で格納する */
  | 'flate-gray'
  /** JPEG のバイト列。PDF はこれをそのまま扱えるので再エンコードしない */
  | 'jpeg';

export interface PdfPageInput {
  readonly data: Uint8Array;
  readonly encoding: PdfImageEncoding;
  readonly width: number;
  readonly height: number;
}

export interface PdfOptions {
  readonly title: string;
  readonly created?: Date;
}

export interface PdfResult {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

export const PDF_MEDIA_TYPE = 'application/pdf';

export function buildPdf(pages: readonly PdfPageInput[], options: PdfOptions): PdfResult {
  if (pages.length === 0) {
    throw new ClipperMError('PDF_BUILD_FAILED', 'ページが 1 枚もありません。');
  }
  for (const page of pages) {
    if (page.width <= 0 || page.height <= 0) {
      throw new ClipperMError('PDF_BUILD_FAILED', '画像の寸法が不正です。');
    }
    if (page.data.length === 0) {
      throw new ClipperMError('PDF_BUILD_FAILED', '画像のバイト列が空です。');
    }
    if (page.encoding === 'flate-gray' && page.data.length !== page.width * page.height) {
      throw new ClipperMError(
        'PDF_BUILD_FAILED',
        `グレー画像のバイト数が寸法と合いません（${page.data.length} ≠ ${page.width}x${page.height}）。`,
      );
    }
  }

  const title = options.title.trim() === '' ? 'ClipperM' : options.title.trim();
  const created = options.created ?? new Date();

  const writer = new PdfWriter();
  // オブジェクト番号は 1=Catalog / 2=Pages / 3=Info、以降ページごとに 3 つずつ。
  const firstPageObj = 4;
  const pageObjNumbers = pages.map((_, i) => firstPageObj + i * 3);

  writer.pushHeader();
  writer.pushObject(1, `<</Type/Catalog/Pages 2 0 R>>`);
  writer.pushObject(
    2,
    `<</Type/Pages/Kids[${pageObjNumbers.map((n) => `${n} 0 R`).join(' ')}]/Count ${pages.length}>>`,
  );
  writer.pushObject(
    3,
    `<</Title ${utf16BeHexString(title)}/Producer ${utf16BeHexString('ClipperM')}/CreationDate (${pdfDate(created)})>>`,
  );

  pages.forEach((page, index) => {
    const pageObj = pageObjNumbers[index]!;
    const imageObj = pageObj + 1;
    const contentObj = pageObj + 2;

    writer.pushObject(
      pageObj,
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${page.width} ${page.height}]` +
        `/Resources<</XObject<</Im0 ${imageObj} 0 R>>>>/Contents ${contentObj} 0 R>>`,
    );

    const { stream, filter, colorSpace } = encodeImage(page);
    writer.pushObject(
      imageObj,
      `<</Type/XObject/Subtype/Image/Width ${page.width}/Height ${page.height}` +
        `/ColorSpace/${colorSpace}/BitsPerComponent 8/Filter/${filter}/Length ${stream.length}>>`,
      stream,
    );

    // 画像をページ全面に配置する。cm でページサイズに合わせて拡大してから Do で描く。
    const content = latin1(`q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q\n`);
    writer.pushObject(contentObj, `<</Length ${content.length}>>`, content);
  });

  const bytes = writer.finish(3 + pages.length * 3);
  return { bytes, filename: `${sanitizeFilename(title)}.pdf` };
}

function encodeImage(page: PdfPageInput): {
  stream: Uint8Array;
  filter: string;
  colorSpace: string;
} {
  if (page.encoding === 'jpeg') {
    // PDF は JPEG をネイティブに扱える。再エンコードすると画質が落ちるだけなので素通しする。
    return { stream: page.data, filter: 'DCTDecode', colorSpace: 'DeviceRGB' };
  }
  // グレースケールは必ず可逆で格納する。非可逆にすると出力解像度でかけた
  // ディザリングのドットパターンが壊れ、PDF を選ぶ意味そのものが無くなる。
  return {
    stream: zlibSync(page.data, { level: 9 }),
    filter: 'FlateDecode',
    colorSpace: 'DeviceGray',
  };
}

/**
 * オブジェクトを積みながら位置を実測する書き出し器。
 *
 * **xref のオフセットがずれた PDF は、多くのビューアが黙って白紙を出す。**
 * 文字数から推測せず、実際に積んだバイト数を数える。
 */
class PdfWriter {
  private readonly chunks: Uint8Array[] = [];
  private position = 0;
  private readonly offsets = new Map<number, number>();

  pushHeader(): void {
    // 2 行目のバイナリコメントは「このファイルはバイナリである」と処理系に伝える慣習。
    this.push(latin1('%PDF-1.4\n%âãÏÓ\n'));
  }

  pushObject(number: number, dict: string, stream?: Uint8Array): void {
    this.offsets.set(number, this.position);
    this.push(latin1(`${number} 0 obj\n${dict}\n`));
    if (stream) {
      this.push(latin1('stream\n'));
      this.push(stream);
      this.push(latin1('\nendstream\n'));
    }
    this.push(latin1('endobj\n'));
  }

  finish(maxObjectNumber: number): Uint8Array {
    const xrefPosition = this.position;
    let xref = `xref\n0 ${maxObjectNumber + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= maxObjectNumber; n += 1) {
      const offset = this.offsets.get(n);
      if (offset === undefined) {
        throw new ClipperMError('PDF_BUILD_FAILED', `オブジェクト ${n} が書き出されていません。`);
      }
      xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<</Size ${maxObjectNumber + 1}/Root 1 0 R/Info 3 0 R>>\n`;
    xref += `startxref\n${xrefPosition}\n%%EOF\n`;
    this.push(latin1(xref));

    const total = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }

  private push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.position += bytes.length;
  }
}

/**
 * latin1（1 文字 = 1 バイト）で符号化する。
 * UTF-8 で数えるとマルチバイト文字のぶんだけ xref のオフセットがずれる。
 */
function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * PDF の text string。日本語を通すため UTF-16BE + BOM の 16 進文字列にする。
 * latin1 のまま括弧文字列で書くと化ける。
 */
function utf16BeHexString(value: string): string {
  let hex = 'FEFF';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff) {
      // サロゲートペアはそのまま 2 単位で書く
      const v = code - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0').toUpperCase();
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0').toUpperCase();
    } else {
      hex += code.toString(16).padStart(4, '0').toUpperCase();
    }
  }
  return `<${hex}>`;
}

/** PDF の日付形式 D:YYYYMMDDHHmmSSZ。 */
function pdfDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}
