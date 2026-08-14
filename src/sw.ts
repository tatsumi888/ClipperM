/// <reference lib="webworker" />
/**
 * Service Worker。
 *
 * 役割は 2 つだけ:
 *   1. ビルド成果物のプリキャッシュ（オフラインで起動できるようにする）
 *   2. **共有ターゲットの POST を横取りする**（Android の共有メニュー対応）
 *
 * workbox のランタイムは入れていない。__WB_MANIFEST の注入だけ vite-plugin-pwa に任せ、
 * キャッシュ操作は Cache API を直接叩く。やることが上の 2 つしかないため、
 * 依存を増やす価値が無い。
 */

interface PrecacheEntry {
  url: string;
  revision?: string | null;
}

// vite-plugin-pwa (injectManifest) がビルド後のファイルから `self.__WB_MANIFEST` という
// **リテラルを文字列検索して** 実際の一覧に差し替える。
// そのため `const { __WB_MANIFEST } = self` のように分解して書くと、
// バンドル後にリテラルが消えて "Unable to find a place to inject the manifest" で失敗する。
// 必ず self. を付けたまま参照すること。
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: PrecacheEntry[] };

const PRECACHE_NAME = 'clipperm-precache-v1';
const SHARE_CACHE_NAME = 'clipperm-shared-v1';
const SHARE_INDEX_URL = '/__shared__/index';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE_NAME);
      const urls = self.__WB_MANIFEST.map((entry) =>
        entry.revision ? `${entry.url}?__rev=${entry.revision}` : entry.url,
      );
      // 1 つ失敗しただけで install ごと落とさない（オフライン対応は付加価値であって必須ではない）。
      await Promise.allSettled(urls.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('clipperm-precache-') && name !== PRECACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // --- 共有ターゲット -------------------------------------------------------
  // manifest の share_target で action: '/share-target', method: 'POST' を宣言してある。
  // ここで横取りしないと、そんなページは存在しないので 404 になる。
  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // ナビゲーションはネット優先。失敗したらキャッシュした index.html を返す。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(PRECACHE_NAME);
        return (await cache.match('/index.html')) ?? (await cache.match('/')) ?? Response.error();
      }),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached ?? fetch(request);
    })(),
  );
});

/**
 * 共有された画像を Cache に置いてからアプリへリダイレクトする。
 *
 * POST のボディはそのままではアプリ側の JS から読めないので、
 * 一度 Cache に逃がしてから GET のページを開かせる、というのが定石。
 * 303 なのは「POST の結果を GET で取りに行かせる」ため。
 */
async function handleShareTarget(request: Request): Promise<Response> {
  const redirect = Response.redirect(`/?share-target=1`, 303);
  try {
    const formData = await request.formData();
    const files = formData.getAll('images').filter((value): value is File => value instanceof File);
    if (files.length === 0) return redirect;

    const cache = await caches.open(SHARE_CACHE_NAME);
    const entries = files.map((file, index) => ({
      name: file.name || `shared-${index}`,
      type: file.type,
      url: `/__shared__/${index}`,
    }));

    await Promise.all(
      entries.map((entry, index) => cache.put(entry.url, new Response(files[index]))),
    );
    await cache.put(
      SHARE_INDEX_URL,
      new Response(JSON.stringify(entries), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    return redirect;
  } catch {
    // 受け取れなくてもアプリは開く。ここで 500 を返すと共有元に何も出ない。
    return redirect;
  }
}
