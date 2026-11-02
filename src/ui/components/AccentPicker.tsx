import { useId } from 'preact/hooks';
import { DEFAULT_ACCENT } from '../../domain/defaults';
import type { AccentId } from '../../domain/types';
import { t } from '../../i18n';
import { labelFor, pickerChoices } from '../theme/accent';
import { radioKeys } from './controls';
import { Icon } from './Icon';

/** Round color swatches; the whole app recolors as soon as one is chosen. */
export function AccentPicker({ value, onChange }: { value: AccentId; onChange: (accent: AccentId) => void }) {
  const titleId = useId();
  const hintId = useId();
  const choices = pickerChoices();
  const found = choices.findIndex(c => c.id === value);
  const index = Math.max(0, found);
  const hint = found < 0
    ? t.appearance.wallpaperUnavailable(labelFor(DEFAULT_ACCENT))
    : value === 'wallpaper' ? t.appearance.wallpaperHint : t.appearance.accentHint(labelFor(value));
  return (
    <div class="picker">
      <p class="picker-title" id={titleId}>{t.appearance.accent}</p>
      <div class="swatches" role="radiogroup" aria-labelledby={titleId} aria-describedby={hintId}
        onKeyDown={e => radioKeys(e, choices.map(c => c.id), index, onChange)}>
        {choices.map((c, i) => (
          <button type="button" role="radio" class="swatch" aria-label={c.label} aria-checked={c.id === value}
            tabIndex={i === index ? 0 : -1} style={{ '--swatch': c.fill }} onClick={() => onChange(c.id)}>
            {c.id === value && <Icon name="check" size={20} />}
          </button>
        ))}
      </div>
      <p class="field-hint" id={hintId}>{hint}</p>
    </div>
  );
}
