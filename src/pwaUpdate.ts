/**
 * Service Worker の登録と、更新検知をユーザー操作に繋ぐ結線。
 *
 * `registerType: 'prompt'` なので、新しい SW が waiting 状態になっても vite-plugin-pwa は
 * 自動で reload しない。onNeedRefresh で useUpdateStore にフラグを立て、UpdateBanner の
 * 「更新する」が押されたときだけ registerSW() の戻り値（skipWaiting を送って reload する）
 * を呼ぶ。
 *
 * 開きっぱなしの PWA では、ブラウザ標準の更新チェックだけに頼ると次のデプロイに
 * いつ気づけるか分からない。そのため、タブがフォアグラウンドに戻ったときに
 * `registration.update()` を呼び、能動的に確認する。ClipperM は数枚切り抜いて送るだけの
 * 短時間セッションが基本のため、setInterval による常時ポーリングは採用しない
 * （電力を食う割に、開きっぱなしを前提にした価値が薄い）。
 */

import { registerSW } from 'virtual:pwa-register';
import { useUpdateStore } from './store/useUpdateStore';

export function initServiceWorker(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      useUpdateStore.getState().setUpdateAvailable(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
  });

  useUpdateStore.getState().setApplyUpdate(() => {
    void updateSW();
  });
}
