import { useEffect, useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import * as act from '../../domain/actions';
import { upcomingReminders } from '../../domain/reminders';
import { allDayFor } from '../../domain/schedule';
import { addDays, daysBetween } from '../../domain/time';
import { t } from '../../i18n';
import { notificationPermission, requestNotifications, type NotificationPermission } from '../../platform/notifications';
import { Button, IconButton } from '../components/controls';
import { Icon } from '../components/Icon';
import { DAY_SCALE, dayLayout, hourMarks, type DayEntry } from '../dayGrid';
import { duration, longDate, relativeDay, span, time, timeParts, weekdayName } from '../format';
import { useSwipe } from '../useSwipe';
import { WelcomeCard } from './Welcome';

type Entry = DayEntry | { kind: 'now'; start: number; end: number };

const px = (n: number) => `${n}px`;

/**
 * One day of the timetable on a single time scale: events and classes, meals and free time each as
 * tall as they are long, with the hours down the side. The + in the header adds an event; a
 * sideways swipe moves to the next or previous day.
 */
export function TodayScreen() {
  const { data, today, minute } = useAppState();
  const ui = useUi();
  const day = ui.day;
  const isToday = day === today;
  const isPast = day < today;
  const [slide, setSlide] = useState<'next' | 'previous' | ''>('');
  const move = (by: 1 | -1) => { setSlide(by > 0 ? 'next' : 'previous'); ui.showDay(addDays(day, by)); };
  const swipe = useSwipe(move);
  const layout = dayLayout(data, day, isToday ? minute : undefined);
  const y = (m: number) => (m - layout.start) * DAY_SCALE;
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
          <IconButton icon="plus" tone="accent" label={t.today.addEvent} onClick={() => ui.open({ type: 'event', id: null, day })} />
        </div>
      </header>
      {empty && isToday && <WelcomeCard />}
      {isToday && <ReminderPrompt />}
      <section key={day} class={`timeline ${slide ? `slide-${slide}` : ''}`} aria-label={t.today.planFor(longDate(day))}>
        {allDay.length > 0 && (
          <ul class="plain-list all-day" aria-label={t.event.allDay}>
            {allDay.map(e => (
              <li key={e.id}>
                <button type="button" class="all-day-chip" onClick={() => ui.open({ type: 'fixed', eventId: e.id, day })}>
                  <span class="all-day-tag">{t.event.allDay}</span><strong>{e.title}</strong>{e.location && <span>{e.location}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div class="day" style={{ height: px(y(layout.end)) }}>
          <div class="day-hours" aria-hidden="true">
            {/* An hour right beside the current time leaves its label to the time. */}
            {hourMarks(layout).map(h => <div class="day-hour" style={{ top: px(y(h)) }}>{!(showNow && Math.abs(h - minute) < 20) && <TimeCell at={h} />}</div>)}
          </div>
          <ol class="day-items">
            {entries.map(entry => (
              <DayRow entry={entry} day={day} y={y} over={isOver(entry)}
                key={entry.kind === 'event' || entry.kind === 'meal' ? `${entry.block.id}-${entry.start}` : `${entry.kind}-${entry.start}`} />
            ))}
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
 * One thing on the day, placed by its start and as tall as it lasts. What is already over stays,
 * quieter; free time still ahead takes a tap to add an event there.
 */
function DayRow({ entry, day, y, over }: { entry: Entry; day: string; y: (minute: number) => number; over: boolean }) {
  const ui = useUi();
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
    return (
      <li class={`day-free${past}`} style={box}>
        {over
          ? <span class="day-free-box">{label}</span>
          : <button type="button" class="day-free-box" aria-label={t.today.addEventAt(time(entry.start))} onClick={() => ui.open({ type: 'event', id: null, day, start: entry.start })}>
            {label}<span class="free-add">{t.common.add}</span>
          </button>}
      </li>
    );
  }
  if (entry.kind === 'meal') {
    return (
      <li class={`day-meal${past}`} style={box}>
        <Icon name="meal" size={15} /> {t.common.meals[entry.block.id as 'lunch' | 'dinner']}
      </li>
    );
  }
  const f = entry.block;
  // Short events keep the title and put the times beside it; the shortest show the title alone.
  const size = height < 32 ? ' is-tiny' : height < 52 ? ' is-short' : '';
  const lane = { left: `${(entry.lane / entry.lanes) * 100}%`, width: entry.lanes > 1 ? `calc(${100 / entry.lanes}% - 3px)` : '100%' };
  return (
    <li class={`day-event${past}${size}`} style={{ ...box, ...lane }}>
      <button type="button" class="card card-class" onClick={() => ui.open({ type: 'fixed', eventId: f.id, day })}>
        <strong class="card-title">{f.title}</strong>
        <span class="card-meta">{span(f.start, f.end)}{f.event?.location ? `${t.format.separator}${f.event.location}` : ''}</span>
      </button>
    </li>
  );
}

/**
 * Asks once, at a moment it matters (there is something to remind about), whether reminders
 * may arrive as notifications. Either answer is remembered; Settings → Reminders can change it.
 */
function ReminderPrompt() {
  const { data } = useAppState();
  const store = useStore();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  useEffect(() => { notificationPermission().then(setPermission); }, []);
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
