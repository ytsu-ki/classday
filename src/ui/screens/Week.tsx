import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useAppState, useUi } from '../../app/context';
import { allDayFor, dayWindow, fixedFor } from '../../domain/schedule';
import { addDays, dateOf, weekOf } from '../../domain/time';
import type { DateKey } from '../../domain/types';
import { t } from '../../i18n';
import { Button, Empty, IconButton } from '../components/controls';
import { createDraftSlot, DraftBlock, type DraftSlot } from '../draftSlot';
import { joinFacts, span, timeParts, weekdayAbbr, weekRange } from '../format';
import { usePager } from '../useSwipe';
import { courseColors, passingBreaks, periodRows, semesterWeek, weekAxis, weekClusters, type Axis } from '../weekGrid';

/** The week as a timetable. Tapping empty space places a draggable dashed draft slot. */
export function WeekScreen() {
  const { data, today } = useAppState();
  const ui = useUi();
  const [monday, setMonday] = useState(weekOf(today));
  const { slide, setSlide, move, swipe } = usePager(useCallback((by: 1 | -1) => setMonday(m => addDays(m, 7 * by)), []), Boolean(ui.sheet));
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
 * A column per day, the periods down the side, and each event in its own soft color. Overlapping
 * events collapse into one full-width card with a "+N" badge; tapping empty space places a dashed
 * draft block whose edges drag to adjust duration before tapping opens EventSheet.
 */
function WeekGrid({ monday }: { monday: DateKey }) {
  const { data, today, minute } = useAppState();
  const ui = useUi();
  const [draft, setDraft] = useState<DraftSlot | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(null); }, [monday]);

  useEffect(() => {
    if (!draft) return;
    const unregister = ui.registerBack(() => {
      if (ui.sheet) return false;
      setDraft(null);
      return true;
    });
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-draft-slot]') || target?.closest('.wk-col')) return;
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

  // Worked out once per week and per change to the data, not on every tick of the clock or toast.
  const { periods, columns, range, axis, colors } = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const periods = periodRows(data);
    const columns = days.map(day => ({
      day, allDay: allDayFor(data, day),
      clusters: weekClusters(fixedFor(data, day).filter(f => f.kind === 'event').map(f => ({ value: f, start: f.start, end: f.end }))),
    }));
    const cards = columns.flatMap(c => c.clusters.flatMap(x => x.entries));
    const spans = [...periods, ...cards];
    const window = dayWindow(data.settings);
    const range = {
      start: Math.floor(Math.min(window.start, ...spans.map(s => s.start)) / 30) * 30,
      end: Math.ceil(Math.max(window.end, ...spans.map(s => s.end)) / 30) * 30,
    };
    return { periods, columns, range, axis: weekAxis(range, spans, passingBreaks(periods, cards)), colors: courseColors(data.events) };
  }, [data, monday]);
  const place = (start: number, end: number): JSX.CSSProperties => ({ top: px(axis.y(start)), height: px(axis.y(end) - axis.y(start)) });
  const first = dateOf(monday);
  const anyAllDay = columns.some(c => c.allDay.length);
  const onEmptyClick = (e: MouseEvent, day: DateKey) => {
    const col = e.currentTarget as HTMLElement | null;
    if (!col?.isConnected || (e.target as HTMLElement).closest('button, [data-draft-slot]')) return;
    const rect = col.getBoundingClientRect();
    const relY = e.clientY > 0 ? Math.max(0, e.clientY - rect.top) : 0;
    setDraft(createDraftSlot(day, axis.minuteAt(relY), periods, range));
  };

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
              <button type="button" class={`wk-all-day-chip course-${colors.get(e.title) ?? 0}`} title={e.title} aria-label={joinFacts([e.title, weekdayAbbr(day), t.event.allDay])}
                onClick={() => { setDraft(null); ui.open({ type: 'fixed', eventId: e.id, day }); }}>{e.title}</button>
            ))}
          </div>
        ))}
      </div>
      <div ref={bodyRef} class="wk-body" style={{ height: px(axis.height) }}>
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
        {columns.map(({ day, clusters }) => {
          const over = (end: number) => day < today || (day === today && end <= minute);
          return (
            <div class="wk-col" data-day={day} onClick={e => onEmptyClick(e, day)}>
              {clusters.map(cluster => {
                const { primary, entries, start, end } = cluster;
                const f = primary.value;
                const extra = entries.length - 1;
                const style = { ...place(start, end), left: '1px', width: 'calc(100% - 2px)' };
                // Cards that meet across a closed passing period share a square edge.
                const meets = (y: number, edge: 'start' | 'end') => clusters.some(o => o !== cluster && axis.y(o[edge]) === y);
                const joins = `${meets(axis.y(start), 'end') ? ' joins-above' : ''}${meets(axis.y(end), 'start') ? ' joins-below' : ''}`;
                const roomy = axis.y(end) - axis.y(start) >= 64 && extra === 0;
                const title = extra > 0
                  ? entries.map(x => joinFacts([x.value.title, span(x.start, x.end), x.value.event?.location])).join('\n')
                  : joinFacts([f.title, span(start, end), f.event?.location]);
                const aria = extra > 0
                  ? t.week.overlapAria(f.title, extra, `${weekdayAbbr(day)} ${span(start, end)}`)
                  : joinFacts([f.title, `${weekdayAbbr(day)} ${span(start, end)}`, f.event?.location]);
                return (
                  <button type="button" title={title}
                    class={`wk-card course-${colors.get(f.title) ?? 0}${joins}${extra > 0 ? ' is-stacked' : ''}${over(end) ? ' is-over' : ''}`} style={style}
                    aria-label={aria}
                    onClick={() => {
                      setDraft(null);
                      if (extra > 0) ui.open({ type: 'overlap', day, eventIds: entries.map(x => x.value.id) });
                      else ui.open({ type: 'fixed', eventId: f.id, day });
                    }}>
                    <strong>{f.title}</strong>
                    {extra > 0
                      ? <span class="wk-more" aria-hidden="true">+{extra}</span>
                      : roomy && f.event?.location && <span class="wk-where">{f.event.location}</span>}
                  </button>
                );
              })}
              {draft && draft.day === day && (
                <DraftBlock
                  slot={draft}
                  axis={axis}
                  range={range}
                  periods={periods}
                  compact
                  containerRef={bodyRef}
                  onChange={setDraft}
                  onEdit={() => {
                    const picked = draft;
                    setDraft(null);
                    ui.open({ type: 'event', id: null, day: picked.day, start: picked.start, end: picked.end });
                  }}
                />
              )}
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
