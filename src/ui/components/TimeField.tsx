import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { toClock, toMinutes } from '../../domain/time';
import { t } from '../../i18n';
import { prefers24h, time } from '../format';
import { Icon } from './Icon';

/** Height of one wheel row in pixels; matches --wheel-row in components.css. */
const ROW = 40;

/**
 * A time chosen on scroll wheels that open under the field: hours and minutes, and am/pm on a
 * phone set to 12-hour time. Replaces <input type="time">, whose Android clock dial is awkward on
 * a phone. Minutes move in fives; a time imported off that step keeps its own minute.
 */
export function TimeField({ id, value, onChange, label, optional, disabled, start = '09:00' }: {
  id?: string;
  value: string;
  onChange: (clock: string) => void;
  label: string;
  /** Offers to clear the time. */
  optional?: boolean;
  disabled?: boolean;
  /** Where the wheels start when there is no time yet. */
  start?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const latest = useRef(value);
  latest.current = value;
  const minutes = value ? toMinutes(value) : null;
  const shown = minutes === null ? '' : time(minutes);
  const isOpen = open && !disabled && minutes !== null;

  const set = (next: number) => {
    const clock = toClock(((next % 1440) + 1440) % 1440);
    if (clock !== latest.current) onChange(clock);
  };
  // Each wheel changes its own part of the latest time, so turning two wheels quickly keeps both.
  const current = () => (latest.current ? toMinutes(latest.current) : toMinutes(start));
  const hour24 = minutes === null ? 0 : Math.floor(minutes / 60);
  const minute = minutes === null ? 0 : minutes % 60;
  const minuteValues = useMemo(() => {
    const steps = Array.from({ length: 12 }, (_, i) => i * 5);
    return steps.includes(minute) ? steps : [...steps, minute].sort((a, b) => a - b);
  }, [isOpen]); // Fixed while open, so an off-step minute doesn't vanish mid-turn.

  const toggle = () => {
    if (!open && !value) onChange(start);
    setOpen(!open);
  };

  // The wheels open under the field, often below the fold of a sheet: bring them on screen.
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => panel.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  return (
    <div class="time-field">
      <button id={id} type="button" class={`time-input ${shown ? '' : 'is-empty'}`} disabled={disabled}
        aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined}
        aria-label={t.controls.timeValue(label, shown || t.controls.setTime)} onClick={toggle}>
        <span>{shown || t.controls.setTime}</span>
        <Icon name="clock" size={18} />
      </button>
      {isOpen && (
        <div ref={panel} id={panelId} class="time-panel" role="group" aria-label={label}>
          <div class="time-wheels">
            {prefers24h
              ? <Wheel label={t.controls.hour} values={HOURS_24} value={hour24} format={pad} onChange={h => set(h * 60 + current() % 60)} />
              : <Wheel label={t.controls.hour} values={HOURS_12} value={hour24 % 12 || 12}
                onChange={h => { const c = current(); set(((h % 12) + (c >= 720 ? 12 : 0)) * 60 + c % 60); }} />}
            <span class="time-colon" aria-hidden="true">:</span>
            <Wheel label={t.controls.minute} values={minuteValues} value={minute} format={pad}
              onChange={m => { const c = current(); set(c - c % 60 + m); }} />
            {!prefers24h && (
              <Wheel label={t.controls.amPm} values={[0, 1]} value={hour24 >= 12 ? 1 : 0} format={v => (v ? t.format.pm : t.format.am)}
                onChange={pm => { const c = current(); set((c % 720) + (pm ? 720 : 0)); }} />
            )}
          </div>
          <div class="time-panel-actions">
            {optional && <button type="button" class="link-btn" onClick={() => { onChange(''); setOpen(false); }}>{t.controls.noTime}</button>}
            <button type="button" class="link-btn" onClick={() => setOpen(false)}>{t.common.done}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * One scroll wheel: the row in the middle band is the choice. Scrolling settles on a row;
 * tapping a row or the arrow keys choose directly.
 */
function Wheel({ values, value, onChange, label, format = String }: {
  values: number[]; value: number; onChange: (v: number) => void; label: string; format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const index = Math.max(0, values.indexOf(value));
  const [centered, setCentered] = useState(index);
  const settle = useRef(0);

  // Follow the value when it changes from outside the wheel (and on opening).
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
    setCentered(index);
  }, [index]);
  useEffect(() => () => clearTimeout(settle.current), []);

  const choose = (i: number) => {
    const next = Math.max(0, Math.min(values.length - 1, i));
    clearTimeout(settle.current);
    setCentered(next);
    if (values[next] !== value) onChange(values[next]);
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW)));
    setCentered(i);
    clearTimeout(settle.current);
    settle.current = window.setTimeout(() => { if (values[i] !== value) onChange(values[i]); }, 140);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
    if (step) choose(index + step);
    else if (e.key === 'Home') choose(0);
    else if (e.key === 'End') choose(values.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={ref} class="wheel" role="listbox" tabIndex={0} aria-label={label} aria-activedescendant={`${id}-${index}`}
      onScroll={onScroll} onKeyDown={onKeyDown}>
      {values.map((v, i) => (
        <div id={`${id}-${i}`} role="option" aria-selected={i === index} class={`wheel-option ${i === centered ? 'is-centered' : ''}`}
          onClick={() => choose(i)}>
          {format(v)}
        </div>
      ))}
    </div>
  );
}
