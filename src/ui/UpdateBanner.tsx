import { useUpdateStore } from '../store/useUpdateStore';

/** 新しい Service Worker が waiting 状態のときだけ表示する。押すまで reload しない。 */
export function UpdateBanner() {
  const updateAvailable = useUpdateStore((state) => state.updateAvailable);
  const applyUpdate = useUpdateStore((state) => state.applyUpdate);

  if (!updateAvailable) return null;

  return (
    <section className="panel update-banner">
      <p className="note">新しいバージョンがあります。</p>
      <button type="button" className="primary" onClick={applyUpdate}>
        更新する
      </button>
    </section>
  );
}
