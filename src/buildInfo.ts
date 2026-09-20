/**
 * ビルド対象の git リビジョンと JST ビルド日時。
 *
 * 値そのものは vite.config.ts の define でビルド時に埋め込まれる（実体は src/vite-env.d.ts
 * の __BUILD_REVISION__ / __BUILD_TIME_JST__）。SW を更新した後、実際に新しいビルドに
 * 切り替わったかをこの表示の変化で目視確認できる。
 */
export const BUILD_REVISION = __BUILD_REVISION__;
export const BUILD_TIME_JST = __BUILD_TIME_JST__;
