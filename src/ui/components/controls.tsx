import type { ComponentChildren, JSX } from 'preact';
import { useId, useState } from 'preact/hooks';
import { DURATION_PICKS } from '../../domain/defaults';
import { t } from '../../i18n';
import { duration } from '../format';
import { Icon, type IconName } from './Icon';

type ButtonProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'icon'> & {
  variant?: 'primary' | 'quiet' | 'ghost' | 'danger' | 'soft';
  size?: 'sm' | 'md';
  icon?: IconName;
  busy?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  form?: string;
};

export function Button({ variant = 'quiet', size = 'md', icon, busy, children, class: cls, type = 'button', disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} class={`btn btn-${variant} btn-${size} ${cls ?? ''}`} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span class="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, onClick, class: cls, tone }: { icon: IconName; label: string; onClick: () => void; class?: string; tone?: 'accent' }) {
  return (
    <button type="button" class={`icon-btn ${tone === 'accent' ? 'icon-btn-accent' : ''} ${cls ?? ''}`} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

export function Chip({ selected, onClick, children, icon, tone, label, class: cls }: {
  selected?: boolean; onClick: () => void; children: ComponentChildren; icon?: IconName; tone?: 'removable'; label?: string; class?: string;
}) {
  return (
    <button type="button" class={`chip ${selected ? 'is-selected' : ''} ${tone === 'removable' ? 'chip-removable' : ''} ${cls ?? ''}`}
      aria-pressed={tone === 'removable' ? undefined : Boolean(selected)} aria-label={label} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
      {tone === 'removable' && <Icon name="close" size={14} />}
    </button>
  );
}

/** Radio groups move with the arrow keys and keep a single tab stop. */
export function radioKeys<T>(e: KeyboardEvent, values: readonly T[], index: number, onChange: (v: T) => void) {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const next = (index + step + values.length) % values.length;
  onChange(values[next]);
  (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
}

export function Segmented<T extends string>({ value, options, onChange, label, size }: {
  value: T; options: { value: T; label: string; icon?: IconName; lang?: string }[]; onChange: (v: T) => void; label: string; size?: 'sm';
}) {
  const index = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div class={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`} role="radiogroup" aria-label={label}
      onKeyDown={e => radioKeys(e, options.map(o => o.value), index, onChange)}
      style={{ '--count': options.length, '--index': index } as JSX.CSSProperties}>
      <span class="segmented-thumb" aria-hidden="true" />
      {options.map(o => (
        <button type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
          class={o.value === value ? 'is-selected' : ''} lang={o.lang} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={18} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: (id: string) => ComponentChildren; id?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div class={`field ${error ? 'has-error' : ''}`}>
      <label for={fieldId}>{label}</label>
      {children(fieldId)}
      {hint && !error && <p class="field-hint">{hint}</p>}
      {error && <p class="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div class="switch-row">
      <label for={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} class="switch" onClick={() => onChange(!checked)}>
        <span class="switch-knob" />
      </button>
    </div>
  );
}

/**
 * Quick duration picks and a custom entry. With `allowNone`, nothing is chosen at first and
 * tapping the chosen pick again clears it.
 */
export function DurationPicker({ value, onChange, allowNone, picks = DURATION_PICKS, label }: {
  value: number | null; onChange: (v: number | null) => void; allowNone?: boolean; picks?: number[]; label: string;
}) {
  const custom = value !== null && !picks.includes(value);
  const [editing, setEditing] = useState(custom);
  const pick = (m: number) => { setEditing(false); onChange(allowNone && value === m ? null : m); };
  return (
    <div class="duration-picker" role="group" aria-label={label}>
      <div class="chips">
        {picks.map(m => <Chip selected={value === m && !editing} onClick={() => pick(m)}>{duration(m)}</Chip>)}
        <Chip selected={editing || custom} onClick={() => {
          if (allowNone && (editing || custom)) { setEditing(false); onChange(null); } else setEditing(true);
        }}>{t.controls.custom}</Chip>
      </div>
      {(editing || custom) && (
        <div class="duration-custom">
          <input type="number" inputMode="numeric" min={5} max={6000} step={5} aria-label={t.controls.inMinutes(label)}
            value={value ?? ''} onInput={e => {
              const n = Number((e.target as HTMLInputElement).value);
              if (Number.isInteger(n) && n >= 5 && n <= 6000) onChange(n);
            }} />
          <span>{t.controls.minutes}</span>
        </div>
      )}
    </div>
  );
}

export function Disclosure({ label, children, open: initial = false }: { label: string; children: ComponentChildren; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  const id = useId();
  return (
    <div class={`disclosure ${open ? 'is-open' : ''}`}>
      <button type="button" class="disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span>{label}</span>
        <Icon name="down" size={18} />
      </button>
      {open && <div id={id} class="disclosure-body">{children}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <span class="empty-mark"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function SectionTitle({ children, action, count }: { children: ComponentChildren; action?: ComponentChildren; count?: number }) {
  return (
    <div class="section-title">
      <h2>{children}{count !== undefined && <span class="count">{count}</span>}</h2>
      {action}
    </div>
  );
}
