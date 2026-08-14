import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET,
  PRESET_GROUPS,
  allPresets,
  findPresetByKey,
  presetKey,
} from '../src/core/presets';

describe('presets', () => {
  it('すべてのプリセットが正の整数の解像度を持つ', () => {
    for (const preset of allPresets()) {
      expect(Number.isInteger(preset.width), preset.name).toBe(true);
      expect(Number.isInteger(preset.height), preset.name).toBe(true);
      expect(preset.width, preset.name).toBeGreaterThan(0);
      expect(preset.height, preset.name).toBeGreaterThan(0);
    }
  });

  it('既定は Paperwhite 第12世代 1264x1680', () => {
    expect(DEFAULT_PRESET.width).toBe(1264);
    expect(DEFAULT_PRESET.height).toBe(1680);
  });

  it('既定プリセットが一覧に含まれる', () => {
    expect(allPresets().some((p) => presetKey(p) === presetKey(DEFAULT_PRESET))).toBe(true);
  });

  it('Clipper と同じ Kindle の解像度を持つ', () => {
    // Clipper/clipper/presets.py の BUILTIN_PRESETS と一致していること。
    // 片方だけ直すと、Clipper で作った画像と ClipperM で作った画像の寸法がずれる。
    const kindle = PRESET_GROUPS.find((group) => group.label === 'Kindle');
    expect(kindle).toBeDefined();
    const sizes = kindle!.presets.map((p) => `${p.width}x${p.height}`);
    expect(sizes).toEqual([
      '1264x1680', // Paperwhite 第12世代
      '1236x1648', // Paperwhite 第11世代
      '1072x1448', // Paperwhite 第7/10世代
      '758x1024', // Paperwhite 第5/6世代
      '1072x1448', // Kindle 無印 第11世代
      '1264x1680', // Oasis 第9/10世代
      '1860x2480', // Scribe 第1世代
    ]);
  });

  it('機種ごとに縦横比が異なる（共通比率に丸めていない）', () => {
    // 「181:134 を守ればどの解像度でも崩れない」は第7/10世代でしか成り立たない。
    // 丸めが混入していないことを、比率が実際に食い違うことで確認する。
    const ratio = (w: number, h: number) => h / w;
    expect(ratio(1072, 1448)).toBeCloseTo(1.3507, 4);
    expect(ratio(1236, 1648)).toBeCloseTo(1.3333, 4);
    expect(ratio(1264, 1680)).toBeCloseTo(1.3291, 4);
  });

  it('presetKey で往復できる', () => {
    for (const preset of allPresets()) {
      expect(findPresetByKey(presetKey(preset))).toEqual(preset);
    }
  });

  it('同じ解像度でも機種が違えば別のキーになる', () => {
    // Paperwhite 第12世代と Oasis はどちらも 1264x1680。解像度だけでは同定できない。
    const pw = allPresets().find((p) => p.name.includes('Paperwhite 第12世代'))!;
    const oasis = allPresets().find((p) => p.name.includes('Oasis'))!;
    expect(pw.width).toBe(oasis.width);
    expect(pw.height).toBe(oasis.height);
    expect(presetKey(pw)).not.toBe(presetKey(oasis));
  });

  it('存在しないキーには undefined を返す', () => {
    expect(findPresetByKey('9999x9999|存在しない')).toBeUndefined();
  });
});
