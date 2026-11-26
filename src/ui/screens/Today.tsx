import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import * as act from '../../domain/actions';
import { upcomingReminders } from '../../domain/reminders';
import { allDayFor } from '../../domain/schedule';
import { addDays, daysBetween } from '../../domain/time';
import { t } from '../../i18n';
import { requestNotifications } from '../../platform/notifications';
import { Button, IconButton } from '../components/controls';
import { Icon } from '../components/Icon';
import { dayAxis, dayLayout, visibleHourMarks, type DayEntry } from '../dayGrid';
import { createDraftSlot, DraftBlock, DRAFT_MIN, type DraftSlot } from '../draftSlot';
import { duration, longDate, relativeDay, span, time, timeParts, weekdayName } from '../format';
import { useNotificationPermission } from '../reminders';
import { usePager } from '../useSwipe';
import { periodRows } from '../weekGrid';
import { WelcomeCard } from './Welcome';

type Entry = DayEntry | { kind: 'now'; start: number; end: number };

const px = (n: number) => `${n}px`;

/**
 * One day of the timetable on a single elastic time scale: events and classes, meals and free time
 * fit inside one screen, with the hours down the side. Tapping future free time places a resizable
 * dashed draft slot whose body opens EventSheet with the chosen span.
 */
export function TodayScreen() {
  const { data, today, minute } = useAppState();
  const ui = useUi();
  const day = ui.day;
  const isToday = day === today;
  const isPast = day < today;
  const { slide, setSlide, move, swipe } = usePager(useCallback((by: 1 | -1) => ui.showDay(addDays(day, by)), [day, ui]), Boolean(ui.sheet));
  const periods = useMemo(() => periodRows(data), [data.timetable.semester]);
  const layout = useMemo(() => dayLayout(data, day, isToday ? minute : undefined), [data, day, isToday ? minute : undefined]);
  const axis = useMemo(() => dayAxis(layout), [layout]);
  const hours = useMemo(() => visibleHourMarks(layout, axis), [layout, axis]);
  const y = (m: number) => axis.y(m);
  const [draft, setDraft] = useState<DraftSlot | null>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => { setDraft(null); }, [day]);

  useEffect(() => {
    if (!draft) return;
    const unregister = ui.registerBack(() => {
      if (ui.sheet) return false;
      setDraft(null);
      return true;
    });
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-draft-slot]') || target?.closest('.day-free-box')) return;
      setDraft(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ui.sheet) setDraft(null); };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      unregister();
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [draft, ui]);

  const entries: Entry[] = [...layout.entries];
  const showNow = isToday && minute >= layout.start && minute <= layout.end;
  // The current time reads in order with the rest, and draws across the day where it falls.
  if (showNow) {
    const next = entries.findIndex(e => e.start >= minute);
    entries.splice(next < 0 ? entries.length : next, 0, { kind: 'now', start: minute, end: minute });
  }
  const allDay = allDayFor(data, day);
  const isOver = (entry: Entry) => isPast || (isToday && entry.end <= minute);
  const empty = !data.items.length && !data.events.length;
  const range = { start: layout.start, end: layout.end };

  const placeDraftAt = (entry: { start: number; end: number }, e: MouseEvent) => {
    const list = listRef.current;
    let targetMinute = entry.start;
    if (list && e.clientY > 0) {
      const rect = list.getBoundingClientRect();
      if (rect.height > 0) {
        const clamped = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        targetMinute = Math.max(entry.start, Math.min(Math.max(entry.start, entry.end - DRAFT_MIN), axis.minuteAt(clamped)));
      }
    }
    setDraft(createDraftSlot(day, targetMinute, periods, range));
  };

  return (
    <section class="screen today swipe-area" aria-labelledby="today-title" {...swipe}>
      <header class="page-head">
        <div class="page-title">
          <p class="eyebrow">{Math.abs(daysBetween(today, day)) <= 1 ? `${relativeDay(day, today)}${t.format.separator}${weekdayName(day)}` : weekdayName(day)}</p>
          <h1 id="today-title">{longDate(day)}</h1>
        </div>
        <div class="page-actions">
          <IconButton icon="back" label={t.today.previousDay} onClick={() => move(-1)} />
          {!isToday && <Button size="sm" onClick={() => { setSlide(day > today ? 'previous' : 'next'); ui.showDay(today); }}>{t.common.today}</Button>}
          <IconButton icon="forward" label={t.today.nextDay} onClick={() => move(1)} />
          <IconButton icon="plus" tone="accent" label={t.today.addEvent} onClick={() => { setDraft(null); ui.open({ type: 'event', id: null, day }); }} />
        </div>
      </header>
      {empty && isToday && <WelcomeCard />}
      {isToday && <ReminderPrompt />}
      <section key={day} class={`timeline ${slide ? `slide-${slide}` : ''}`} aria-label={t.today.planFor(longDate(day))}>
        {allDay.length > 0 && (
          <ul class="plain-list all-day" aria-label={t.event.allDay}>
            {allDay.map(e => (
              <li key={e.id}>
                <button type="button" class="all-day-chip" onClick={() => { setDraft(null); ui.open({ type: 'fixed', eventId: e.id, day }); }}>
                  <span class="all-day-tag">{t.event.allDay}</span><strong>{e.title}</strong>{e.location && <span>{e.location}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div ref={dayRef} class="day" style={{ height: px(axis.height) }}>
          <div class="day-hours" aria-hidden="true">
            {/* An hour right beside the current time leaves its label to the time. */}
            {hours.map(h => <div class="day-hour" style={{ top: px(y(h)) }}>{!(showNow && Math.abs(y(h) - y(minute)) < 16) && <TimeCell at={h} />}</div>)}
          </div>
          <ol ref={listRef} class="day-items">
            {entries.map(entry => (
              <DayRow entry={entry} day={day} y={y} over={isOver(entry)}
                onPickFree={e => placeDraftAt(entry, e)}
                onOpenEvent={id => { setDraft(null); ui.open({ type: 'fixed', eventId: id, day }); }}
                key={entry.kind === 'event' || entry.kind === 'meal' ? `${entry.block.id}-${entry.start}` : `${entry.kind}-${entry.start}`} />
            ))}
            {draft && draft.day === day && (
              <li class="day-draft-layer">
                <DraftBlock
                  slot={draft}
                  axis={axis}
                  range={range}
                  periods={periods}
                  containerRef={listRef}
                  onChange={setDraft}
                  onEdit={() => {
                    const picked = draft;
                    setDraft(null);
                    ui.open({ type: 'event', id: null, day: picked.day, start: picked.start, end: picked.end });
                  }}
                />
              </li>
            )}
          </ol>
        </div>
      </section>
    </section>
  );
}

function TimeCell({ at }: { at: number }) {
  const { digits, suffix } = timeParts(at);
  return <span class="time"><span>{digits}</span>{suffix && <small>{suffix}</small>}</span>;
}

/**
 * One thing on the day, placed by its start and as tall as the elastic scale gives it.
 */
function DayRow({ entry, y, over, onPickFree, onOpenEvent }: {
  entry: Entry;
  day: string;
  y: (minute: number) => number;
  over: boolean;
  onPickFree: (e: MouseEvent) => void;
  onOpenEvent: (id: string) => void;
}) {
  const past = over ? ' is-over' : '';
  if (entry.kind === 'now') {
    return (
      <li class="day-now" style={{ top: px(y(entry.start)) }} aria-label={t.today.nowAria(time(entry.start))}>
        <span class="day-now-time" aria-hidden="true">{timeParts(entry.start).digits}</span>
      </li>
    );
  }
  const top = y(entry.start), height = y(entry.end) - top;
  // A hairline apart, so back-to-back events read as two.
  const box = { top: px(top + 1), height: px(Math.max(height - 2, 0)) };
  if (entry.kind === 'free') {
    const label = t.today.free(duration(entry.end - entry.start));
    const freeSize = height < 18 ? ' is-tiny' : height < 24 ? ' is-short' : '';
    return (
      <li class={`day-free${past}${freeSize}`} style={box}>
        {over
          ? <span class="day-free-box"><span class="day-free-label">{label}</span></span>
          : <button type="button" class="day-free-box" aria-label={t.today.addEventAt(time(entry.start))} onClick={onPickFree}>
            <span class="day-free-label">{label}</span><span class="free-add">{t.common.add}</span>
          </button>}
      </li>
    );
  }
  if (entry.kind === 'meal') {
    const short = height < 32 ? ' is-short' : '';
    return (
      <li class={`day-meal${past}${short}`} style={box}>
        <Icon name="meal" size={14} /> {t.common.meals[entry.block.id as 'lunch' | 'dinner']}
      </li>
    );
  }
  const f = entry.block;
  const size = height < 28 ? ' is-tiny' : height < 44 ? ' is-short' : '';
  const narrow = entry.lanes > 1 ? ' is-narrow' : '';
  const lane = { left: `${(entry.lane / entry.lanes) * 100}%`, width: entry.lanes > 1 ? `calc(${100 / entry.lanes}% - 3px)` : '100%' };
  return (
    <li class={`day-event${past}${size}${narrow}`} style={{ ...box, ...lane }}>
      <button type="button" class="card card-class" onClick={() => onOpenEvent(f.id)}>
        <strong class="card-title">{f.title}</strong>
        <span class="card-meta">{span(f.start, f.end)}{f.event?.location ? `${t.format.separator}${f.event.location}` : ''}</span>
      </button>
    </li>
  );
}

/**
 * Asks once, at a moment it matters (there is something to remind about), whether reminders
 * may arrive as notifications. Either answer is remembered; Settings -> Reminders can change it.
 */
function ReminderPrompt() {
  const { data } = useAppState();
  const store = useStore();
  const [permission, setPermission] = useNotificationPermission();
  if (permission !== 'prompt' || data.reminders.asked || !upcomingReminders(data, new Date()).length) return null;
  const answer = async (allow: boolean) => {
    if (allow) setPermission(await requestNotifications());
    store.act(d => act.setReminders(d, { asked: true }), { undoable: false });
  };
  return (
    <section class="decision decision-info" aria-labelledby="reminder-ask">
      <Icon name="bell" size={20} />
      <div class="decision-body">
        <h3 id="reminder-ask">{t.reminders.askTitle}</h3>
        <p>{t.reminders.askBody}</p>
        <div class="decision-actions">
          <Button size="sm" variant="soft" onClick={() => answer(true)}>{t.reminders.allow}</Button>
          <Button size="sm" variant="ghost" onClick={() => answer(false)}>{t.reminders.notNow}</Button>
        </div>
      </div>
    </section>
  );
}
