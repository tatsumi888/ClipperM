import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildEpub, escapeXml, sanitizeFilename, type EpubPageInput } from '../src/core/epub';
import { ClipperMError } from '../src/core/errors';

/** 中身は問われないのでダミーで良い。空でないことだけが要件。 */
function page(
  width: number,
  height: number,
  mediaType: 'image/jpeg' | 'image/png' = 'image/jpeg',
): EpubPageInput {
  return { bytes: new Uint8Array([1, 2, 3, 4, 5]), mediaType, width, height };
}

/** ZIP のローカルファイルヘッダを読む。仕様の固定オフセット。 */
function readLocalHeader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  return {
    signature: view.getUint32(0, true),
    compressionMethod: view.getUint16(8, true),
    compressedSize: view.getUint32(18, true),
    uncompressedSize: view.getUint32(22, true),
    nameLength,
    extraLength,
    name: strFromU8(bytes.slice(30, 30 + nameLength)),
    contentStart: 30 + nameLength + extraLength,
  };
}

describe('EPUB の ZIP 構造（OCF 仕様の必須要件）', () => {
  // ここが崩れると Kindle が EPUB として認識しない。
  // epubcheck は CRC32 を検証しないので、バイト列は自分で確かめるしかない。
  const { bytes } = buildEpub([page(1264, 1680)], { title: 'テスト' });
  const header = readLocalHeader(bytes);

  it('先頭エントリが mimetype', () => {
    expect(header.signature).toBe(0x04034b50); // "PK\x03\x04"
    expect(header.name).toBe('mimetype');
  });

  it('mimetype は無圧縮 (method=0 / Stored)', () => {
    // .NET Framework の ZipArchive はここを 8 (Deflate) にしてしまい、
    // EpubCoverBuilder はヘッダの手組みを強いられた。fflate は level:0 で素直に 0 になる。
    expect(header.compressionMethod).toBe(0);
  });

  it('mimetype に extra field が無い', () => {
    // libarchive 系は extra field を 32 バイト付けてしまい、これも仕様違反になる。
    expect(header.extraLength).toBe(0);
  });

  it('mimetype の内容が改行なしの 20 バイト丁度', () => {
    expect(header.uncompressedSize).toBe(20);
    expect(header.compressedSize).toBe(20);
    const content = strFromU8(bytes.slice(header.contentStart, header.contentStart + 20));
    expect(content).toBe('application/epub+zip');
    expect(content).toHaveLength(20);
  });

  it('全エントリが CRC 検証を通る（unzip できる）', () => {
    // epubcheck は CRC を見ないため、実際に展開できることを別途確かめる。
    expect(() => unzipSync(bytes)).not.toThrow();
  });
});

describe('EPUB の中身', () => {
  function unzipToText(bytes: Uint8Array) {
    const files = unzipSync(bytes);
    return {
      files,
      text: (path: string) => strFromU8(files[path]!),
    };
  }

  it('必要なファイルが揃っている', () => {
    const { bytes } = buildEpub([page(1264, 1680)], { title: 'テスト' });
    const { files } = unzipToText(bytes);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'mimetype',
        'META-INF/container.xml',
        'OEBPS/content.opf',
        'OEBPS/nav.xhtml',
        'OEBPS/style.css',
        'OEBPS/p001.xhtml',
        'OEBPS/img001.jpg',
      ]),
    );
  });

  it('rendition:layout を書かない（Send to Kindle が弾くため）', () => {
    // これを入れると Send to Kindle が E999 内部エラーで配信を拒否し、
    // Kindle のライブラリにファイルすら現れない（2026-08-24 に実測で確認）。
    // 「固定レイアウトが抜けている」と善意で足し直すのを防ぐための回帰テスト。
    // 等倍表示が要るときは EPUB ではなく PDF を使う。
    const { bytes } = buildEpub([page(1264, 1680)], { title: 'テスト' });
    const opf = unzipToText(bytes).text('OEBPS/content.opf');
    expect(opf).not.toContain('rendition:layout');
    expect(opf).not.toContain('pre-paginated');
    // Amazon 独自の固定レイアウト指定も同様に通らない
    expect(opf).not.toContain('fixed-layout');
    expect(opf).not.toContain('original-resolution');
  });

  it('1 ページ目に cover-image が付く（無いとスリープ画面にカバーが出ない）', () => {
    const { bytes } = buildEpub([page(1264, 1680), page(1264, 1680)], { title: 'テスト' });
    const opf = unzipToText(bytes).text('OEBPS/content.opf');
    expect(opf).toContain(
      'id="img001" href="img001.jpg" media-type="image/jpeg" properties="cover-image"',
    );
    // 2 ページ目には付かない
    expect(opf).toContain('id="img002" href="img002.jpg" media-type="image/jpeg"/>');
    expect(opf).toMatch(/<meta name="cover" content="img001"\/>/);
  });

  it('viewport に画像の実寸が書かれる', () => {
    // ここが実寸とずれると Kindle 側がスケーリングし、ディザのドットが潰れる。
    const { bytes } = buildEpub([page(1860, 2480)], { title: 'テスト' });
    const xhtml = unzipToText(bytes).text('OEBPS/p001.xhtml');
    expect(xhtml).toContain('<meta name="viewport" content="width=1860, height=2480"/>');
  });

  it('複数ページで spine の順序がページの順序と一致する', () => {
    const pages = [page(100, 200), page(300, 400), page(500, 600)];
    const { bytes } = buildEpub(pages, { title: '複数' });
    const { files, text } = unzipToText(bytes);

    expect(files['OEBPS/p003.xhtml']).toBeDefined();
    expect(files['OEBPS/img003.jpg']).toBeDefined();

    const opf = text('OEBPS/content.opf');
    const spine = opf.slice(opf.indexOf('<spine>'), opf.indexOf('</spine>'));
    const order = [...spine.matchAll(/idref="(p\d+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['p001', 'p002', 'p003']);

    // 各ページの viewport が自分の寸法を持つ
    expect(text('OEBPS/p002.xhtml')).toContain('width=300, height=400');
  });

  it('PNG は .png、JPEG は .jpg になる', () => {
    // 仕様上は .jpeg でも通るが、Kindle のカバー認識が不安定なので .jpg に寄せている。
    const { bytes } = buildEpub([page(10, 10, 'image/png'), page(10, 10, 'image/jpeg')], {
      title: 'mixed',
    });
    const { files } = unzipToText(bytes);
    expect(files['OEBPS/img001.png']).toBeDefined();
    expect(files['OEBPS/img002.jpg']).toBeDefined();
  });

  it('identifier は生成のたびに変わる', () => {
    // 固定値だと Send to Kindle が同一書籍とみなし、更新が反映されないことがある。
    const a = unzipToText(buildEpub([page(10, 10)], { title: 'x' }).bytes).text(
      'OEBPS/content.opf',
    );
    const b = unzipToText(buildEpub([page(10, 10)], { title: 'x' }).bytes).text(
      'OEBPS/content.opf',
    );
    const idOf = (opf: string) => /<dc:identifier id="bookid">([^<]+)</.exec(opf)?.[1];
    expect(idOf(a)).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(idOf(a)).not.toBe(idOf(b));
  });

  it('dcterms:modified が秒精度の UTC', () => {
    // ミリ秒を含むと EPUB3 として不正になる。
    const { bytes } = buildEpub([page(10, 10)], {
      title: 'x',
      modified: new Date('2026-08-14T12:34:56.789Z'),
    });
    const opf = unzipToText(bytes).text('OEBPS/content.opf');
    expect(opf).toContain('<meta property="dcterms:modified">2026-08-14T12:34:56Z</meta>');
  });

  it('タイトルの記号が XML を壊さない', () => {
    const { bytes } = buildEpub([page(10, 10)], { title: 'A & B <script> "q" \'s\'' });
    const opf = unzipToText(bytes).text('OEBPS/content.opf');
    expect(opf).toContain(
      '<dc:title>A &amp; B &lt;script&gt; &quot;q&quot; &apos;s&apos;</dc:title>',
    );
    expect(opf).not.toContain('<script>');
  });
});

describe('入力の検証', () => {
  it('ページが空なら EPUB_BUILD_FAILED', () => {
    expect(() => buildEpub([], { title: 'x' })).toThrow(ClipperMError);
    try {
      buildEpub([], { title: 'x' });
    } catch (error) {
      expect((error as ClipperMError).code).toBe('EPUB_BUILD_FAILED');
    }
  });

  it('寸法が 0 以下なら失敗する', () => {
    expect(() => buildEpub([page(0, 100)], { title: 'x' })).toThrow(ClipperMError);
  });

  it('画像のバイト列が空なら失敗する', () => {
    const empty: EpubPageInput = {
      bytes: new Uint8Array(0),
      mediaType: 'image/jpeg',
      width: 1,
      height: 1,
    };
    expect(() => buildEpub([empty], { title: 'x' })).toThrow(ClipperMError);
  });

  it('タイトルが空白だけなら既定名になる', () => {
    const { filename } = buildEpub([page(10, 10)], { title: '   ' });
    expect(filename).toBe('ClipperM.epub');
  });
});

describe('補助関数', () => {
  it('escapeXml が 5 種の実体参照を扱う', () => {
    expect(escapeXml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('sanitizeFilename がパス記号を落とす', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).not.toMatch(/[/\\:*?"<>|]/);
  });

  it('sanitizeFilename が空になったら既定名を返す', () => {
    expect(sanitizeFilename('///')).toBe('ClipperM');
  });

  it('ファイル名にタイトルが反映される', () => {
    expect(buildEpub([page(10, 10)], { title: '週刊メモ' }).filename).toBe('週刊メモ.epub');
  });
});
