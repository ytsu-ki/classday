import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useAppState, useUi } from '../../app/context';
import { allDayFor, dayWindow, fixedFor } from '../../domain/schedule';
import { addDays, dateOf, weekOf } from '../../domain/time';
import type { DateKey } from '../../domain/types';
import { t } from '../../i18n';
import { Button, Empty, IconButton } from '../components/controls';
import { joinFacts, span, timeParts, weekdayAbbr, weekRange } from '../format';
import { useSwipe } from '../useSwipe';
import { courseColors, inLanes, passingBreaks, periodRows, semesterWeek, weekAxis, type Axis } from '../weekGrid';

/** The week as a timetable. The + adds an event; a sideways swipe moves to the next or previous week. */
export function WeekScreen() {
  const { data, today } = useAppState();
  const ui = useUi();
  const [monday, setMonday] = useState(weekOf(today));
  const [slide, setSlide] = useState<'next' | 'previous' | ''>('');
  const move = (by: 1 | -1) => { setSlide(by > 0 ? 'next' : 'previous'); setMonday(addDays(monday, 7 * by)); };
  const swipe = useSwipe(move);
  const thisWeek = monday === weekOf(today);
  const future = monday > weekOf(today);
  const week = semesterWeek(data, monday);

  return (
    <section class="screen week swipe-area" aria-labelledby="week-title" {...swipe}>
      <header class="page-head">
        <div class="page-title">
          <p class="eyebrow">{thisWeek ? t.week.thisWeek : future ? t.week.comingUp : t.week.lookingBack}</p>
          <h1 id="week-title">{week ? t.week.number(week) : weekRange(monday)}</h1>
          {week && <p class="page-sub">{weekRange(monday)}</p>}
        </div>
        <div class="page-actions">
          <IconButton icon="back" label={t.week.previous} onClick={() => move(-1)} />
          {!thisWeek && <Button size="sm" onClick={() => { setSlide(future ? 'previous' : 'next'); setMonday(weekOf(today)); }}>{t.week.thisWeek}</Button>}
          <IconButton icon="forward" label={t.week.next} onClick={() => move(1)} />
          <IconButton icon="plus" tone="accent" label={t.today.addEvent} onClick={() => ui.open({ type: 'event', id: null, day: thisWeek ? today : monday })} />
        </div>
      </header>

      <div key={monday} class={`week-pane ${slide ? `slide-${slide}` : ''}`}>
        <WeekGrid monday={monday} />
      </div>

      {!data.events.length && (
        <Empty icon="week" title={t.week.emptyTitle} action={<Button variant="soft" icon="plus" onClick={() => ui.open({ type: 'event', id: null })}>{t.today.addEvent}</Button>}>
          {t.week.emptyBody}
        </Empty>
      )}
    </section>
  );
}

const px = (n: number) => `${n}px`;
const digits = (minute: number) => timeParts(minute).digits;

/**
 * A column per day, the periods down the side, and each event in its own soft color. All-day
 * events sit under the day row. Only the cards take a tap; the day row and empty space do nothing.
 */
function WeekGrid({ monday }: { monday: DateKey }) {
  const { data, today, minute } = useAppState();
  const ui = useUi();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const periods = periodRows(data);
  const columns = days.map(day => ({ day, events: fixedFor(data, day).filter(f => f.kind === 'event'), allDay: allDayFor(data, day) }));
  const cards = columns.flatMap(c => c.events);
  const spans = [...periods, ...cards];
  const window = dayWindow(data.settings);
  const range = {
    start: Math.floor(Math.min(window.start, ...spans.map(s => s.start)) / 30) * 30,
    end: Math.ceil(Math.max(window.end, ...spans.map(s => s.end)) / 30) * 30,
  };
  const axis = weekAxis(range, spans, passingBreaks(periods, cards));
  const colors = courseColors(data.events);
  const place = (start: number, end: number): JSX.CSSProperties => ({ top: px(axis.y(start)), height: px(axis.y(end) - axis.y(start)) });
  const first = dateOf(monday);
  const anyAllDay = columns.some(c => c.allDay.length);

  return (
    <div class="wk" role="group" aria-label={t.week.gridLabel(weekRange(monday))}>
      <div class="wk-head">
        <div class="wk-corner" aria-hidden="true"><b>{first.getMonth() + 1}</b><span>{t.format.monthShort(first)}</span></div>
        {columns.map(({ day }) => (
          <div class={`wk-day ${day === today ? 'is-today' : ''}`} aria-current={day === today ? 'date' : undefined}>
            <span class="wk-weekday">{weekdayAbbr(day)}</span>
            <span class="wk-date">{Number(day.slice(8))}</span>
          </div>
        ))}
        {anyAllDay && <span class="wk-all-day-label" aria-hidden="true">{t.week.allDayShort}</span>}
        {anyAllDay && columns.map(({ day, allDay }) => (
          <div class="wk-all-day">
            {allDay.map(e => (
              <button type="button" class={`wk-all-day-chip course-${colors.get(e.title) ?? 0}`} aria-label={joinFacts([e.title, weekdayAbbr(day), t.event.allDay])}
                onClick={() => ui.open({ type: 'fixed', eventId: e.id, day })}>{e.title}</button>
            ))}
          </div>
        ))}
      </div>
      <div class="wk-body" style={{ height: px(axis.height) }}>
        <div class="wk-times" aria-hidden="true">
          {periods.length
            ? periods.map(p => (
              <div class="wk-period" style={place(p.start, p.end)}>
                <b>{p.n}</b><span>{digits(p.start)}</span><span>{digits(p.end)}</span>
              </div>
            ))
            : hours(range.start, range.end, axis).map(h => <div class="wk-hour" style={{ top: px(axis.y(h)) }}>{digits(h)}</div>)}
        </div>
        {periods.map(p => <div class="wk-line" style={{ top: px(axis.y(p.end)) }} aria-hidden="true" />)}
        {columns.map(({ day, events }) => {
          const over = (end: number) => day < today || (day === today && end <= minute);
          const laid = inLanes(events.map(f => ({ value: f, start: f.start, end: f.end })));
          return (
            <div class="wk-col">
              {laid.map(({ value: f, start, end, lane, lanes }) => {
                const style = { ...place(start, end), left: `calc(${(lane / lanes) * 100}% + 1px)`, width: `calc(${100 / lanes}% - 2px)` };
                // Cards that meet across a closed passing period share a square edge.
                const meets = (y: number, edge: 'start' | 'end') => laid.some(o => o.lane === lane && o.lanes === lanes && o.value !== f && axis.y(o[edge]) === y);
                const joins = `${meets(axis.y(start), 'end') ? ' joins-above' : ''}${meets(axis.y(end), 'start') ? ' joins-below' : ''}`;
                // A one-period card keeps its room for the title.
                const roomy = axis.y(end) - axis.y(start) >= 64;
                return (
                  <button type="button" class={`wk-card course-${colors.get(f.title) ?? 0}${joins} ${over(end) ? 'is-over' : ''}`} style={style}
                    aria-label={joinFacts([f.title, `${weekdayAbbr(day)} ${span(start, end)}`, f.event?.location])}
                    onClick={() => ui.open({ type: 'fixed', eventId: f.id, day })}>
                    <strong>{f.title}</strong>
                    {roomy && f.event?.location && <span class="wk-where">{f.event.location}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Whole hours for the side when there are no period times, skipping any too close to the last. */
function hours(start: number, end: number, axis: Axis): number[] {
  const out: number[] = [];
  for (let h = Math.ceil(start / 60) * 60; h < end; h += 60) {
    if (!out.length || axis.y(h) - axis.y(out[out.length - 1]) >= 18) out.push(h);
  }
  return out;
}
