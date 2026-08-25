import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ClipperMError } from '../src/core/errors';
import { buildPdf, type PdfPageInput } from '../src/core/pdf';

/** latin1 で読む。バイト位置とインデックスを 1:1 に保つため。 */
function text(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function grayPage(width: number, height: number, fill = 128): PdfPageInput {
  const data = new Uint8Array(width * height);
  data.fill(fill);
  return { data, encoding: 'flate-gray', width, height };
}

function jpegPage(width: number, height: number): PdfPageInput {
  // 中身は問われない。JPEG の SOI マーカーだけ入れておく
  return {
    data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    encoding: 'jpeg',
    width,
    height,
  };
}

describe('PDF の骨格', () => {
  const { bytes } = buildPdf([grayPage(1264, 1680)], { title: 'テスト' });
  const s = text(bytes);

  it('%PDF- で始まる', () => {
    expect(s.startsWith('%PDF-')).toBe(true);
  });

  it('%%EOF で終わる', () => {
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('startxref が xref テーブルの位置を指す', () => {
    const at = Number(/startxref\s+(\d+)/.exec(s)![1]);
    expect(s.slice(at, at + 4)).toBe('xref');
  });

  it('xref の各オフセットが実際のオブジェクト位置を指す', () => {
    // ここがずれた PDF は、多くのビューアが黙って白紙を出す。
    // EPUB で mimetype のバイト列を直接検証したのと同じ位置づけの検査。
    const at = Number(/startxref\s+(\d+)/.exec(s)![1]);
    const lines = s.slice(at).split('\n');
    const count = Number(lines[1]!.split(' ')[1]);
    expect(lines[2]).toMatch(/^0000000000 65535 f/); // 0 番は必ず free
    for (let n = 1; n < count; n += 1) {
      const offset = Number(lines[2 + n]!.slice(0, 10));
      expect(s.slice(offset, offset + `${n} 0 obj`.length), `オブジェクト ${n}`).toBe(`${n} 0 obj`);
    }
  });

  it('trailer が Size と Root を持つ', () => {
    expect(s).toMatch(/trailer\s*<<[^>]*\/Root 1 0 R/);
  });
});

describe('ページとサイズ', () => {
  it('MediaBox が画像の実寸と一致する', () => {
    // ここが実寸とずれると Kindle 側でスケーリングが起き、等倍という PDF の利点が消える。
    const { bytes } = buildPdf([grayPage(1264, 1680)], { title: 'x' });
    expect(text(bytes)).toContain('/MediaBox[0 0 1264 1680]');
  });

  it('Scribe の解像度でも寸法が保たれる', () => {
    const { bytes } = buildPdf([grayPage(1860, 2480)], { title: 'x' });
    expect(text(bytes)).toContain('/MediaBox[0 0 1860 2480]');
  });

  it('ページ数と順序が入力と一致する', () => {
    const { bytes } = buildPdf([grayPage(100, 200), grayPage(300, 400), grayPage(500, 600)], {
      title: 'x',
    });
    const s = text(bytes);
    expect(s).toContain('/Count 3');
    const boxes = [...s.matchAll(/\/MediaBox\[0 0 (\d+) (\d+)\]/g)].map((m) => `${m[1]}x${m[2]}`);
    expect(boxes).toEqual(['100x200', '300x400', '500x600']);
  });

  it('Kids の参照数がページ数と一致する', () => {
    const { bytes } = buildPdf([grayPage(10, 10), grayPage(10, 10)], { title: 'x' });
    const kids = /\/Kids\[([^\]]*)\]/.exec(text(bytes))![1];
    expect(kids.match(/\d+ 0 R/g)).toHaveLength(2);
  });

  it('内容ストリームが画像をページ全面に配置する', () => {
    const { bytes } = buildPdf([grayPage(1264, 1680)], { title: 'x' });
    expect(text(bytes)).toContain('q 1264 0 0 1680 0 0 cm /Im0 Do Q');
  });
});

describe('画像の格納方式', () => {
  it('グレースケールは DeviceGray + FlateDecode', () => {
    const { bytes } = buildPdf([grayPage(8, 8)], { title: 'x' });
    const s = text(bytes);
    expect(s).toContain('/ColorSpace/DeviceGray');
    expect(s).toContain('/Filter/FlateDecode');
  });

  it('グレースケールは可逆（ディザのドットを壊さない）', () => {
    // 非可逆にすると出力解像度でかけたディザリングが潰れ、PDF を選ぶ意味が無くなる。
    const width = 32;
    const height = 32;
    const original = new Uint8Array(width * height);
    for (let i = 0; i < original.length; i += 1) original[i] = (i * 17) % 256;

    const { bytes } = buildPdf([{ data: original, encoding: 'flate-gray', width, height }], {
      title: 'x',
    });
    const s = text(bytes);
    const length = Number(/\/Filter\/FlateDecode\/Length (\d+)>>/.exec(s)![1]);
    const start = s.indexOf('stream\n', s.indexOf('/FlateDecode')) + 'stream\n'.length;
    const restored = unzlibSync(bytes.slice(start, start + length));
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('JPEG は DeviceRGB + DCTDecode でそのまま格納する', () => {
    const page = jpegPage(64, 64);
    const { bytes } = buildPdf([page], { title: 'x' });
    const s = text(bytes);
    expect(s).toContain('/ColorSpace/DeviceRGB');
    expect(s).toContain('/Filter/DCTDecode');
    // 再エンコードせず素通しするので、長さは入力そのまま
    expect(s).toContain(`/Filter/DCTDecode/Length ${page.data.length}>>`);
  });
});

describe('メタデータ', () => {
  it('日本語タイトルが UTF-16BE + BOM で入る', () => {
    // latin1 のまま括弧文字列で書くと化ける。
    const { bytes } = buildPdf([grayPage(10, 10)], { title: '雲' });
    // 雲 = U+96F2
    expect(text(bytes)).toContain('/Title <FEFF96F2>');
  });

  it('ASCII タイトルも 16 進文字列になる', () => {
    const { bytes } = buildPdf([grayPage(10, 10)], { title: 'AB' });
    expect(text(bytes)).toContain('/Title <FEFF00410042>');
  });

  it('CreationDate が PDF の日付形式になる', () => {
    const { bytes } = buildPdf([grayPage(10, 10)], {
      title: 'x',
      created: new Date('2026-08-25T01:02:03.456Z'),
    });
    expect(text(bytes)).toContain('(D:20260825010203Z)');
  });

  it('ファイル名にタイトルが反映され拡張子が .pdf になる', () => {
    expect(buildPdf([grayPage(10, 10)], { title: '週刊メモ' }).filename).toBe('週刊メモ.pdf');
  });

  it('タイトルが空白だけなら既定名になる', () => {
    expect(buildPdf([grayPage(10, 10)], { title: '   ' }).filename).toBe('ClipperM.pdf');
  });
});

describe('入力の検証', () => {
  it('ページが空なら PDF_BUILD_FAILED', () => {
    expect(() => buildPdf([], { title: 'x' })).toThrow(ClipperMError);
    try {
      buildPdf([], { title: 'x' });
    } catch (error) {
      expect((error as ClipperMError).code).toBe('PDF_BUILD_FAILED');
    }
  });

  it('寸法が 0 以下なら失敗する', () => {
    expect(() => buildPdf([grayPage(0, 10)], { title: 'x' })).toThrow(ClipperMError);
  });

  it('データが空なら失敗する', () => {
    const empty: PdfPageInput = {
      data: new Uint8Array(0),
      encoding: 'jpeg',
      width: 10,
      height: 10,
    };
    expect(() => buildPdf([empty], { title: 'x' })).toThrow(ClipperMError);
  });

  it('グレー画像のバイト数が寸法と合わなければ失敗する', () => {
    // 取り違えを早期に検出する。ずれたまま通すと画像が斜めにずれた PDF ができる。
    const bad: PdfPageInput = {
      data: new Uint8Array(10 * 10 - 1),
      encoding: 'flate-gray',
      width: 10,
      height: 10,
    };
    expect(() => buildPdf([bad], { title: 'x' })).toThrow(ClipperMError);
  });
});
