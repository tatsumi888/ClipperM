/**
 * Android の共有メニューから渡された画像を受け取る（アプリ側）。
 *
 * Service Worker が POST /share-target を横取りして Cache に置き、
 * `/?share-target=1` へリダイレクトしてくる。ここはその続きを担当する。
 *
 * iOS Safari は Web Share **Target** に対応していないため、この経路は Android 限定。
 * iOS ではファイル選択から取り込む。
 */

export const SHARE_CACHE_NAME = 'clipperm-shared-v1';
export const SHARE_INDEX_URL = '/__shared__/index';
export const SHARE_FLAG = 'share-target';

interface SharedEntry {
  readonly name: string;
  readonly type: string;
  readonly url: string;
}

/** URL に共有ターゲット経由のフラグが立っているか。 */
export function hasSharedPayload(): boolean {
  return new URLSearchParams(window.location.search).has(SHARE_FLAG);
}

/**
 * Cache に置かれた共有画像を File として取り出す。
 *
 * **取り出したら必ず Cache を消す。** 端末に画像を残さないため
 * （本アプリは画像を一切外へ出さないのが売りなので、内部にも溜めない）。
 */
export async function consumeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return [];

  let cache: Cache;
  try {
    cache = await caches.open(SHARE_CACHE_NAME);
  } catch {
    return [];
  }

  try {
    const indexResponse = await cache.match(SHARE_INDEX_URL);
    if (!indexResponse) return [];

    const entries = (await indexResponse.json()) as SharedEntry[];
    const files: File[] = [];
    for (const entry of entries) {
      const response = await cache.match(entry.url);
      if (!response) continue;
      const blob = await response.blob();
      files.push(new File([blob], entry.name, { type: entry.type || blob.type }));
    }
    return files;
  } catch {
    return [];
  } finally {
    await caches.delete(SHARE_CACHE_NAME).catch(() => undefined);
    // フラグを消して、リロードで二重に取り込まないようにする。
    const url = new URL(window.location.href);
    url.searchParams.delete(SHARE_FLAG);
    window.history.replaceState(null, '', url.toString());
  }
}
