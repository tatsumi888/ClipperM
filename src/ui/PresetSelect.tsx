import { PRESET_GROUPS, findPresetByKey, presetKey } from '../core/presets';
import type { Preset } from '../core/types';

interface Props {
  value: Preset;
  onChange: (preset: Preset) => void;
}

export function PresetSelect({ value, onChange }: Props) {
  return (
    <label className="field">
      <span className="field-label">出力解像度</span>
      <select
        className="field-control"
        value={presetKey(value)}
        onChange={(event) => {
          // 解像度は文字列キーで受け渡す。同じ解像度の機種が複数あるため、
          // 数値の組だけでは同定できない。
          const preset = findPresetByKey(event.target.value);
          if (preset) onChange(preset);
        }}
      >
        {PRESET_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.presets.map((preset) => (
              <option key={presetKey(preset)} value={presetKey(preset)}>
                {preset.name} — {preset.width}×{preset.height}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
