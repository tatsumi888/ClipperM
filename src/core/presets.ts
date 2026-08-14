/**
 * 出力解像度プリセット。
 *
 * 値は Clipper/clipper/presets.py の BUILTIN_PRESETS と一致させてある。
 * 片方を変えたらもう片方も直すこと（現状は自動で同期しない）。
 *
 * 重要: 機種ごとに縦横比が違う。
 *   第7/10世代 1072x1448 → 1.3507
 *   第11世代   1236x1648 → 1.3333 (ちょうど 3:4)
 *   第12世代   1264x1680 → 1.3291
 * 「どの機種でも崩れない共通の比率」は存在しないので、実機の解像度ちょうどで作る。
 * 比率だけ合わせて解像度を変えると Kindle 側がスケーリングし、
 * ディザリングのドットパターンが潰れて眠い絵になる。
 */

import type { Preset } from './types';

export interface PresetGroup {
  readonly label: string;
  readonly presets: readonly Preset[];
}

export const PRESET_GROUPS: readonly PresetGroup[] = [
  {
    // 世代は Amazon の商品ページ表記（Kindle 端末全体の世代）に合わせる。
    // Paperwhite としての通し番号（Paperwhite 5 など）とは別系統なので混同しない。
    label: 'Kindle',
    presets: [
      { name: 'Paperwhite 第12世代 2024 (7")', width: 1264, height: 1680 },
      { name: 'Paperwhite 第11世代 2021 / Signature (6.8")', width: 1236, height: 1648 },
      { name: 'Paperwhite 第7/10世代 2015・2018 (6")', width: 1072, height: 1448 },
      { name: 'Paperwhite 第5/6世代 2012・2013 (6")', width: 758, height: 1024 },
      { name: 'Kindle 無印 第11世代 2022 / 2024 (6")', width: 1072, height: 1448 },
      { name: 'Oasis 第9/10世代 2017・2019 (7")', width: 1264, height: 1680 },
      { name: 'Scribe 第1世代 2022 (10.2")', width: 1860, height: 2480 },
    ],
  },
  {
    label: '一般',
    presets: [
      { name: 'FHD 縦', width: 1080, height: 1920 },
      { name: 'FHD 横', width: 1920, height: 1080 },
      { name: 'WQHD', width: 2560, height: 1440 },
      { name: '4K UHD', width: 3840, height: 2160 },
    ],
  },
  {
    label: '定型',
    presets: [
      { name: '正方形', width: 1080, height: 1080 },
      { name: 'アイコン 512', width: 512, height: 512 },
      { name: 'アイコン 256', width: 256, height: 256 },
    ],
  },
];

export const DEFAULT_PRESET: Preset = {
  name: 'Paperwhite 第12世代 2024 (7")',
  width: 1264,
  height: 1680,
};

/** グループを潰した一覧。同じ解像度が複数あるので、選択の同定には presetKey を使う。 */
export function allPresets(): readonly Preset[] {
  return PRESET_GROUPS.flatMap((group) => group.presets);
}

/**
 * プリセットを一意に識別する文字列。
 *
 * Clipper で「PySide6 の itemData にタプルを入れると findData が一致しなくなる」問題を踏んだ結果、
 * 解像度は "1264x1680" 形式の文字列で受け渡す約束になっている。
 * こちらは Qt ではないが、同じ機種名・同じ解像度の組が複数あるため名前も含めて識別する。
 */
export function presetKey(preset: Preset): string {
  return `${preset.width}x${preset.height}|${preset.name}`;
}

export function findPresetByKey(key: string): Preset | undefined {
  return allPresets().find((preset) => presetKey(preset) === key);
}
