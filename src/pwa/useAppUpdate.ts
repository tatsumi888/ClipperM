import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * registerType: 'prompt' なので、新しいバージョンを検知しても即座には反映しない。
 * ユーザーが更新を選ぶまで needRefresh を立てたままにする
 * （registration.waiting はブラウザ側が保持するので、更新せずアプリを開き直しても再検知される。
 * localStorage 等での独自の永続化は不要）。
 *
 * 稼働中の検知は setInterval で常時ポーリングせず、タブ再表示時（visibilitychange）に絞る。
 * ClipperM は短時間で使い切る用途で、開きっぱなしを前提にしたポーリングは価値が薄い。
 */
export function useAppUpdate() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration;
    },
  });

  const checkForUpdate = () => {
    void registrationRef.current?.update();
  };

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return {
    needRefresh,
    update: () => void updateServiceWorker(true),
    checkForUpdate,
  };
}
