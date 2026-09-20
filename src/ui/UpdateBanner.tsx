interface UpdateBannerProps {
  onUpdate: () => void;
}

export function UpdateBanner({ onUpdate }: UpdateBannerProps) {
  return (
    <div className="update-banner" role="status">
      <span>新しいバージョンがあります。更新すると今の作業内容は失われます。</span>
      <button type="button" className="link" onClick={onUpdate}>
        更新する
      </button>
    </div>
  );
}
