import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// share_target は vite-plugin-pwa の ManifestOptions 型に無い（W3C の提案段階の仕様のため）。
// 実体は manifest.webmanifest にそのまま書き出されればよいので、型だけ緩める。
const shareTarget = {
  share_target: {
    action: '/share-target',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: {
      files: [{ name: 'images', accept: ['image/*'] }],
    },
  },
} as Record<string, unknown>;

/** 実機確認用のトンネルが使うホスト。dev / preview の両方で許可する。 */
const TUNNEL_HOSTS = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'];

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 共有ターゲットの POST を自前で横取りする必要があるため generateSW ではなく injectManifest。
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
      },
      manifest: {
        name: 'ClipperM',
        short_name: 'ClipperM',
        description: 'スマホの画像を Kindle の解像度ちょうどに切り抜いて EPUB にする',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#1a1a1a',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          {
            src: 'icons/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
        ...shareTarget,
      },
    }),
  ],
  // Vite 6 は DNS リバインディング対策として、想定外の Host ヘッダを持つリクエストを弾く。
  // トンネル（*.trycloudflare.com など）経由で実機から開くには、そのホストを許可する必要がある。
  // 先頭のドットは「そのドメインと全サブドメイン」を意味する。
  //
  // host: true は 0.0.0.0 で待ち受ける指定。同じ Wi-Fi のスマホから
  // http://<PCのIP>:4173 で直接開けるようにするためのもの。
  // ただし **HTTP では Service Worker も navigator.share も動かない**（secure context 必須）ので、
  // 共有まわりを試すときは必ずトンネルの HTTPS URL を使うこと。
  server: {
    host: true,
    allowedHosts: TUNNEL_HOSTS,
  },
  preview: {
    // Service Worker は本番ビルドにしか出ない（devOptions を有効にしていない）ため、
    // 共有ターゲットの確認は dev ではなく preview 側で行う。
    host: true,
    allowedHosts: TUNNEL_HOSTS,
  },
  test: {
    // 既定を node にすることで「core/ に DOM を持ち込まない」という設計上の境界を
    // テストが機械的に守らせる。core が document や Canvas に触れた瞬間にテストが落ちる。
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
