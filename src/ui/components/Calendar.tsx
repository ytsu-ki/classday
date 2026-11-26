import { useRef, useState } from 'preact/hooks';
import { addDays, dateOf, weekOf } from '../../domain/time';
import type { DateKey } from '../../domain/types';
import { t } from '../../i18n';
import { longDate } from '../format';
import { useSwipe } from '../useSwipe';
import { Icon } from './Icon';

const pad = (n: number) => String(n).padStart(2, '0');
const firstOfMonth = (day: DateKey) => `${day.slice(0, 8)}01`;
function shiftMonth(first: DateKey, by: number): DateKey {
  const d = dateOf(first);
  d.setMonth(d.getMonth() + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function shiftMonthsClamped(day: DateKey, by: number): DateKey {
  const d = dateOf(day);
  const targetDay = d.getDate();
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + by, 1);
  const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  return `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-${pad(Math.min(targetDay, lastDay))}`;
}

/** Monday first, as the timetable reads. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * A month of days to pick from, Monday first. The arrows or a sideways swipe change the month;
 * days of the next and previous months show greyed at the edges and can be picked too.
 * Follows WAI-ARIA APG grid roving tabindex + arrow key navigation.
 */
export function Calendar({ value, onChange, today, min }: { value: DateKey | null; onChange: (day: DateKey) => void; today: DateKey; min?: DateKey }) {
  const [month, setMonth] = useState(firstOfMonth(value ?? today));
  const [focused, setFocused] = useState<DateKey>(value ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const move = (by: number) => setMonth(m => shiftMonth(m, by));
  const swipe = useSwipe(move);
  const start = weekOf(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  // Six rows only when the month needs them.
  const shown = days[35].slice(0, 7) === month.slice(0, 7) ? days : days.slice(0, 35);
  const activeDay = shown.some(d => d === focused && !(min && d < min))
    ? focused
    : (shown.find(d => d.slice(0, 7) === month.slice(0, 7) && !(min && d < min)) ?? shown.find(d => !(min && d < min)) ?? shown[0]);

  const moveFocus = (day: DateKey, e: KeyboardEvent) => {
    let next: DateKey | null = null;
    if (e.key === 'ArrowLeft') next = addDays(day, -1);
    else if (e.key === 'ArrowRight') next = addDays(day, 1);
    else if (e.key === 'ArrowUp') next = addDays(day, -7);
    else if (e.key === 'ArrowDown') next = addDays(day, 7);
    else if (e.key === 'Home') next = weekOf(day);
    else if (e.key === 'End') next = addDays(weekOf(day), 6);
    else if (e.key === 'PageUp') next = shiftMonthsClamped(day, -1);
    else if (e.key === 'PageDown') next = shiftMonthsClamped(day, 1);
    if (!next) return;
    e.preventDefault();
    if (min && next < min) next = min;
    setFocused(next);
    if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(firstOfMonth(next));
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
  };

  return (
    <div class="calendar">
      <div class="calendar-head">
        <button type="button" class="icon-btn" aria-label={t.calendar.previousMonth} onClick={() => move(-1)}><Icon name="back" /></button>
        <h3 aria-live="polite">{t.calendar.month(dateOf(month))}</h3>
        <button type="button" class="icon-btn" aria-label={t.calendar.nextMonth} onClick={() => move(1)}><Icon name="forward" /></button>
      </div>
      <div ref={gridRef} class="calendar-grid" role="group" aria-label={t.calendar.month(dateOf(month))} {...swipe}>
        {WEEK_ORDER.map(d => <span class="calendar-weekday" aria-hidden="true">{t.calendar.weekdayLetters[d]}</span>)}
        {shown.map(day => {
          const other = day.slice(0, 7) !== month.slice(0, 7);
          const disabled = Boolean(min && day < min);
          return (
            <button type="button" key={day} data-day={day} disabled={disabled}
              tabIndex={!disabled && day === activeDay ? 0 : -1}
              class={`calendar-day ${other ? 'is-other' : ''} ${day === today ? 'is-today' : ''} ${day === value ? 'is-selected' : ''}`}
              aria-pressed={day === value} aria-label={longDate(day)}
              onKeyDown={e => moveFocus(day, e)}
              onClick={() => { setFocused(day); onChange(day); if (other) setMonth(firstOfMonth(day)); }}>
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
