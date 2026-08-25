/**
 * 固定レイアウト EPUB3 の組み立て。
 *
 * 要件の出どころは EpubCoverBuilder/README.md（実機と epubcheck で検証済みの知見）。
 * 変えてよい所と絶対に変えてはいけない所があるので、下記のコメントを読んでから触ること。
 *
 * ## mimetype の 3 条件（OCF 仕様。3 つとも外せない）
 *
 * 1. ZIP の **先頭** エントリであること
 * 2. **無圧縮 (method=0 / Stored)** であること
 * 3. extra field が無く、内容が改行なしの 20 バイト丁度であること
 *
 * EpubCoverBuilder はこれを PowerShell で満たせず（.NET Framework の ZipArchive は
 * NoCompression を指定しても Deflate レベル 0 になり method=8 のまま）、
 * ZIP の先頭にローカルヘッダを手で差し込むという回避策を取っている。
 * **fflate はエントリ単位で level を指定できるので、その苦労は要らない。**
 * ただし「満たせているか」は tests/epub.test.ts がバイト列を直接見て検証している。
 *
 * ## 固定レイアウト (rendition:layout) は使えない（2026-08-24 実測）
 *
 * `<meta property="rendition:layout">pre-paginated</meta>` を入れると、
 * **Send to Kindle が E999 内部エラーで配信を拒否する**（ライブラリにファイルすら現れない）。
 * 同一画像・同一構成で meta の有無だけを変えた 2 つを送って確認した結果なので、これは断定できる。
 *
 * 併せて分かったこと:
 *   - `rendition:orientation` / `rendition:spread` は残しても通る（無害）が、
 *     layout が無ければ意味を持たないので書かない
 *   - Amazon 独自の `fixed-layout` / `original-resolution` / `book-type` メタも通らない
 *   - `<itemref properties="rendition:layout-pre-paginated">` や SVG ラッパーは
 *     変換自体は通るが **開けない本ができる**（ライブラリに出るが中身が表示されない）。最悪の結果
 *
 * 代償として Kindle 側が余白を付けて画像を縮小するため、**等倍表示にはならない**。
 * 等倍が要るときは EPUB ではなく PDF を使う（`core/pdf.ts`）。
 * epubcheck は CRC32 を検証しないため、ZIP を自前で組む世界では
 * 「epubcheck が通る = 壊れていない」ではない、という教訓も同 README にある。
 */

import { strToU8, zipSync, type Zippable } from 'fflate';
import { ClipperMError } from './errors';

/** OCF が要求する mimetype の内容。20 バイト、改行なし。 */
const MIMETYPE_CONTENT = 'application/epub+zip';

export type EpubImageMediaType = 'image/jpeg' | 'image/png';

export interface EpubPageInput {
  /** 画像のバイト列。出力解像度ちょうどで焼いたもの。 */
  readonly bytes: Uint8Array;
  readonly mediaType: EpubImageMediaType;
  /** 画像の実寸。各ページの viewport に書き込むため必須。 */
  readonly width: number;
  readonly height: number;
}

export interface EpubOptions {
  readonly title: string;
  readonly language?: string;
  /** 省略時は毎回新しい UUID。テストから固定値を入れられるようにしてある。 */
  readonly identifier?: string;
  /** 省略時は現在時刻。 */
  readonly modified?: Date;
}

export interface EpubResult {
  readonly bytes: Uint8Array;
  /** 送信時のファイル名に使う。 */
  readonly filename: string;
}

export function buildEpub(pages: readonly EpubPageInput[], options: EpubOptions): EpubResult {
  if (pages.length === 0) {
    throw new ClipperMError('EPUB_BUILD_FAILED', 'ページが 1 枚もありません。');
  }
  for (const page of pages) {
    if (page.width <= 0 || page.height <= 0) {
      throw new ClipperMError('EPUB_BUILD_FAILED', '画像の寸法が不正です。');
    }
    if (page.bytes.length === 0) {
      throw new ClipperMError('EPUB_BUILD_FAILED', '画像のバイト列が空です。');
    }
  }

  const title = options.title.trim() === '' ? 'ClipperM' : options.title.trim();
  const language = options.language ?? 'ja';
  // 固定値だと Send to Kindle が同一書籍とみなし、更新が反映されないことがある。
  const identifier = options.identifier ?? `urn:uuid:${randomUuid()}`;
  const modified = options.modified ?? new Date();

  const pad = Math.max(3, String(pages.length).length);
  const entries = pages.map((page, index) => {
    const seq = String(index + 1).padStart(pad, '0');
    return {
      page,
      imageId: `img${seq}`,
      // 仕様上は .jpeg でも問題ないが、Kindle / Send to Kindle のカバー認識が
      // 不安定になることがあるため .jpg に寄せる。
      imageHref: `img${seq}${page.mediaType === 'image/png' ? '.png' : '.jpg'}`,
      pageId: `p${seq}`,
      pageHref: `p${seq}.xhtml`,
    };
  });

  const files: Zippable = {
    // 先頭・無圧縮。オブジェクトのキー順がそのまま ZIP のエントリ順になる。
    mimetype: [strToU8(MIMETYPE_CONTENT), { level: 0 }],
    'META-INF/container.xml': strToU8(CONTAINER_XML),
    'OEBPS/content.opf': strToU8(
      buildContentOpf(entries, { title, language, identifier, modified }),
    ),
    'OEBPS/nav.xhtml': strToU8(buildNav(entries, title, language)),
    'OEBPS/style.css': strToU8(PAGE_CSS),
  };

  for (const entry of entries) {
    files[`OEBPS/${entry.pageHref}`] = strToU8(buildPageXhtml(entry, language));
    // 画像は既に JPEG/PNG で圧縮済み。再圧縮しても縮まないうえ時間だけかかる。
    files[`OEBPS/${entry.imageHref}`] = [entry.page.bytes, { level: 0 }];
  }

  let bytes: Uint8Array;
  try {
    bytes = zipSync(files, { mtime: modified });
  } catch (cause) {
    throw new ClipperMError('EPUB_BUILD_FAILED', 'EPUB の ZIP 化に失敗しました。', { cause });
  }

  return { bytes, filename: `${sanitizeFilename(title)}.epub` };
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

/**
 * viewport が画像の実寸なので、img を 100% にすれば 1px のずれもなく全画面に収まる。
 * 余白を出さないため body の margin を潰し、背景は白にしておく。
 */
const PAGE_CSS = `html, body { margin: 0; padding: 0; height: 100%; }
body { background-color: #ffffff; }
div.page { margin: 0; padding: 0; width: 100%; height: 100%; }
div.page img { display: block; width: 100%; height: 100%; }
`;

interface Entry {
  readonly page: EpubPageInput;
  readonly imageId: string;
  readonly imageHref: string;
  readonly pageId: string;
  readonly pageHref: string;
}

function buildContentOpf(
  entries: readonly Entry[],
  meta: { title: string; language: string; identifier: string; modified: Date },
): string {
  const cover = entries[0];
  const manifestItems = entries
    .flatMap((entry) => [
      // 1 ページ目だけ cover-image。これが無いと Kindle のスリープ画面にカバーが出ない。
      `    <item id="${entry.imageId}" href="${entry.imageHref}" media-type="${entry.page.mediaType}"${
        entry === cover ? ' properties="cover-image"' : ''
      }/>`,
      `    <item id="${entry.pageId}" href="${entry.pageHref}" media-type="application/xhtml+xml"/>`,
    ])
    .join('\n');

  const spineItems = entries.map((entry) => `    <itemref idref="${entry.pageId}"/>`).join('\n');

  // ここに rendition:layout を書いてはいけない。下記の「固定レイアウトは使えない」を参照。
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(meta.identifier)}</dc:identifier>
    <dc:title>${escapeXml(meta.title)}</dc:title>
    <dc:language>${escapeXml(meta.language)}</dc:language>
    <meta property="dcterms:modified">${toIsoSeconds(meta.modified)}</meta>
    <meta name="cover" content="${cover.imageId}"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>
`;
}

function buildNav(entries: readonly Entry[], title: string, language: string): string {
  const items = entries
    .map((entry, index) => `        <li><a href="${entry.pageHref}">${index + 1} ページ</a></li>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>目次</h1>
      <ol>
${items}
      </ol>
    </nav>
  </body>
</html>
`;
}

/**
 * 固定レイアウトのページ。
 * viewport には画像の実寸を書く。ここが実寸とずれると Kindle 側でスケーリングが起き、
 * ディザリングのドットパターンが潰れる。
 */
function buildPageXhtml(entry: Entry, language: string): string {
  const { width, height } = entry.page;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${entry.pageId}</title>
    <meta name="viewport" content="width=${width}, height=${height}"/>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <div class="page"><img src="${entry.imageHref}" alt=""/></div>
  </body>
</html>
`;
}

/** dcterms:modified は秒精度の UTC でなければならない（ミリ秒を含めると不正）。 */
function toIsoSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 共有時のファイル名。共有先の OS もアプリも分からないので、
 * 禁止記号が最も多い Windows を基準に落とす。
 *
 * 空白は保持する（`_` に潰すと日本語のタイトルが読みにくくなる）。
 * 記号だけのタイトルは置換後に `_` の羅列になるため、そこまで削って空なら既定名にする。
 */
export function sanitizeFilename(value: string): string {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    // 先頭末尾の `_` と、Windows が嫌う末尾のドット・空白を落とす
    .replace(/^[_\s]+|[_\s.]+$/g, '');
  return cleaned === '' ? 'ClipperM' : cleaned.slice(0, 80);
}

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // randomUUID は安全なコンテキストでしか使えない。HTTP で開いた場合の保険。
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
