import { useMemo, useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import * as act from '../../domain/actions';
import { eventEnd, parseNotice } from '../../domain/notice';
import { problemOf } from '../../domain/problems';
import { daysOf } from '../../domain/schedule';
import { REMINDER_LEADS } from '../../domain/schema';
import { addDays, dateOf, isClock, roundUp, toClock, toMinutes, uid } from '../../domain/time';
import type { DateKey, EventCategory, FixedEvent } from '../../domain/types';
import { problemText, t } from '../../i18n';
import { formatRanges, parseRanges } from '../../timetable/weeks';
import { Button, Chip, Disclosure, Field, Segmented, Switch } from '../components/controls';
import { useDatePage } from '../components/DatePage';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { TimeField } from '../components/TimeField';
import { inlineDay, joinFacts, longDate, relativeDay, span, weekdayAbbr } from '../format';
import { periodRows } from '../weekGrid';

/** Monday first, as timetables are read. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** "Mon, Wed, Fri", "every day". */
export function daysText(days: number[]): string {
  if (days.length === 7) return t.event.everyDay;
  return [...days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => t.common.weekdaysShort[d]).join(t.event.daysJoin);
}

/** How an event repeats, in a few words: "Once", "Mon, Wed until 30 Nov", "Every Tue". */
export function repeatText(e: FixedEvent): string {
  if (e.category === 'once') return t.event.categories.once;
  const days = daysText(daysOf(e));
  return e.until && e.category === 'short' ? t.event.repeatsUntil(days, longDate(e.until)) : t.event.repeatsEvery(days);
}

const dateText = (day: DateKey) => `${longDate(day)} ${weekdayAbbr(day)}`;

/**
 * Add or change an event. Every event is one of three kinds: once, short-term (repeats until an
 * end date) or long-term (repeats with no planned end). Pasting a whole notice or message into
 * the name reads the date, time and place out of it (see domain/notice.ts).
 */
export function EventSheet({ id, day, start: startAt }: { id: string | null; day?: DateKey; start?: number }) {
  const { data, today, minute } = useAppState();
  const store = useStore();
  const ui = useUi();
  const existing = id ? data.events.find(e => e.id === id) : undefined;
  const periods = useMemo(() => periodRows(data), [data.timetable.semester]);
  const base = day ?? today;
  const [e, setE] = useState<FixedEvent>(() => {
    if (existing) return { ...existing };
    const first = Math.min(startAt ?? (base === today ? roundUp(minute + 1, 30) : 9 * 60), 23 * 60);
    return {
      id: uid(), title: '', category: 'once', start: toClock(first), end: toClock(eventEnd(first, {}, periods)),
      repeat: 'once', date: base, weekday: dateOf(base).getDay(), from: base, until: '', parity: 'all',
    };
  });
  const [endChosen, setEndChosen] = useState(Boolean(existing));
  const [weeksText, setWeeksText] = useState(existing?.weeks ? formatRanges(existing.weeks, t.format.parityRange) : '');
  const [found, setFound] = useState('');
  const [error, setError] = useState('');
  const dates = useDatePage(today);
  const set = (patch: Partial<FixedEvent>) => { setError(''); setE(current => ({ ...current, ...patch })); };
  const days = daysOf(e);

  // Without an end of its own, an event lasts a double period, lined up with the timetable.
  const setStart = (start: string) => set({ start, ...(endChosen || !isClock(start) ? {} : { end: toClock(eventEnd(toMinutes(start), {}, periods)) }) });
  const setCategory = (category: EventCategory) => {
    if (category === 'once') return set({ category, repeat: 'once', date: e.from });
    set({
      category, repeat: 'weekly', from: e.category === 'once' ? e.date : e.from,
      until: category === 'long' ? (existing?.category === 'long' ? existing.until : '') : e.until || addDays(e.category === 'once' ? e.date : e.from, 27),
      ...(e.category === 'once' ? { weekday: dateOf(e.date).getDay(), days: undefined } : {}),
    });
  };
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    if (next.length) set({ weekday: next.includes(e.weekday) ? e.weekday : next[0], days: next.length > 1 ? next : undefined });
  };

  /** A whole notice pasted into the name fills in what it says, for checking below. */
  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text') ?? '';
    const notice = parseNotice(text, today);
    if (!notice.found.length || !notice.title) return;
    event.preventDefault();
    const start = notice.start ?? e.start;
    set({
      title: notice.title,
      ...(notice.location ? { location: notice.location } : {}),
      ...(notice.date ? { category: 'once', repeat: 'once', date: notice.date, from: notice.date, weekday: dateOf(notice.date).getDay(), days: undefined } : {}),
      ...(notice.start ? { start, end: toClock(eventEnd(toMinutes(start), notice, periods)), allDay: undefined } : {}),
    });
    setEndChosen(Boolean(notice.end || notice.minutes));
    setFound(t.event.foundIn(notice.found.map(f => t.event.noticeFields[f])));
  };

  const save = (ev: Event) => {
    ev.preventDefault();
    const title = e.title.trim();
    if (!title) return setError(t.event.giveName);
    if (!e.allDay && (!isClock(e.start) || !isClock(e.end) || toMinutes(e.end) <= toMinutes(e.start))) return setError(t.event.endAfterStart);
    const next: FixedEvent = { ...e, title };
    if (e.allDay) Object.assign(next, { start: '00:00', end: '23:59' });
    else delete next.allDay;
    if (next.remind === undefined) delete next.remind;
    if (e.category === 'once') {
      Object.assign(next, { repeat: 'once', weekday: dateOf(e.date).getDay(), from: e.date, until: '', parity: 'all' });
      delete next.days;
      delete next.weeks;
    } else {
      if (e.category === 'short' && (!e.until || e.until < e.from)) return setError(t.event.needsUntil);
      Object.assign(next, { repeat: 'weekly', date: e.from });
      if (!next.days || next.days.length < 2) delete next.days;
      if (weeksText.trim()) {
        try { next.weeks = parseRanges(weeksText); } catch (err) { const problem = problemOf(err); return setError(problem ? problemText(problem) : String(err)); }
      } else delete next.weeks;
      if (next.parity !== 'all' && dateOf(next.from).getDay() !== 1) return setError(t.event.parityMonday);
    }
    store.act(d => act.saveEvent(d, next), { message: existing ? t.event.saved : t.event.added(e.category === 'once' ? dateText(e.date) : repeatText(next)) });
    ui.close();
  };

  const pick = (title: string, value: DateKey, done: (day: DateKey) => void, min?: DateKey) => dates.open({ title, date: value, min, done });
  const datePill = (label: string, value: DateKey, onPick: () => void) => (
    <div class="field">
      <span class="field-label">{label}</span>
      <button type="button" class="date-pill" onClick={onPick} aria-label={`${label}: ${dateText(value)}`}>
        <Icon name="calendar" size={18} /><span>{dateText(value)}</span>
      </button>
    </div>
  );
  const leads = e.allDay ? [0, 1440] : REMINDER_LEADS;

  const page = dates.page;
  return (
    <Sheet title={page?.title ?? (existing ? t.event.editTitle : t.event.addTitle)} onClose={page?.onClose ?? ui.close}
      footer={page?.footer ?? <Button variant="primary" type="submit" form="event-form" class="grow">{existing ? t.common.save : t.common.add}</Button>}>
      {page?.body ?? (
        <form id="event-form" class="form-stack" onSubmit={save} noValidate>
          <Field label={t.common.name} hint={found || (existing ? undefined : t.event.pasteHint)}>
            {fid => <input id={fid} data-autofocus={!existing || undefined} type="text" maxLength={200} placeholder={t.event.namePlaceholder}
              value={e.title} onPaste={onPaste} onInput={x => { set({ title: (x.target as HTMLInputElement).value }); setFound(''); }} />}
          </Field>
          <Field label={t.event.where}>
            {fid => <input id={fid} type="text" maxLength={500} placeholder={t.common.optional} value={e.location ?? ''} onInput={x => set({ location: (x.target as HTMLInputElement).value })} />}
          </Field>

          <Segmented<EventCategory> label={t.event.category} value={e.category} onChange={setCategory} options={[
            { value: 'once', label: t.event.categories.once }, { value: 'short', label: t.event.categories.short }, { value: 'long', label: t.event.categories.long },
          ]} />
          <p class="field-hint">{t.event.categoryHints[e.category]}</p>

          {e.category === 'once'
            ? datePill(t.event.date, e.date, () => pick(t.event.date, e.date, date => set({ date, from: date, weekday: dateOf(date).getDay() })))
            : (
              <>
                <div class="form-grid">
                  {datePill(t.event.firstDay, e.from, () => pick(t.event.firstDay, e.from, from => set({ from, date: from })))}
                  {e.category === 'short' && datePill(t.event.lastDay, e.until || e.from, () => pick(t.event.lastDay, e.until || e.from, until => set({ until }), e.from))}
                </div>
                <fieldset class="group">
                  <legend>{t.event.repeatsOn}</legend>
                  <div class="chips">
                    <Chip selected={days.length === 7} onClick={() => set(days.length === 7 ? { days: undefined } : { days: ALL_DAYS })}>{t.event.everyDay}</Chip>
                    {WEEK_ORDER.map(n => <Chip selected={days.length < 7 && days.includes(n)} onClick={() => toggleDay(n)}>{t.common.weekdaysShort[n]}</Chip>)}
                  </div>
                </fieldset>
              </>
            )}

          <Switch checked={Boolean(e.allDay)} onChange={v => set({ allDay: v || undefined, ...(v && e.remind !== undefined && e.remind !== 1440 ? { remind: 0 } : {}) })} label={t.event.allDay} />
          {!e.allDay && (
            <div class="form-grid">
              <Field label={t.event.starts}>{fid => <TimeField id={fid} label={t.event.starts} value={e.start} onChange={setStart} />}</Field>
              <Field label={t.event.ends}>{fid => <TimeField id={fid} label={t.event.ends} value={e.end} onChange={v => { setEndChosen(true); set({ end: v }); }} />}</Field>
            </div>
          )}

          <Field label={t.event.remind}>
            {fid => (
              <select id={fid} value={e.remind ?? 'none'} onChange={x => { const v = (x.target as HTMLSelectElement).value; set({ remind: v === 'none' ? undefined : Number(v) }); }}>
                <option value="none">{t.event.noReminder}</option>
                {leads.map(m => <option value={m}>{e.allDay ? t.event.allDayReminders[m as 0 | 1440] : t.event.reminders(m)}</option>)}
              </select>
            )}
          </Field>

          {e.category !== 'once' && (
            <Disclosure label={t.event.weeksAndDates} open={Boolean(existing?.weeks || (existing && existing.parity !== 'all'))}>
              <div class="form-stack">
                <Segmented<'all' | 'odd' | 'even'> size="sm" label={t.event.whichWeeks} value={e.parity} onChange={v => set({ parity: v })}
                  options={[{ value: 'all', label: t.event.allWeeks }, { value: 'odd', label: t.event.odd }, { value: 'even', label: t.event.even }]} />
                <Field label={t.event.onlyWeeks} hint={t.event.onlyWeeksHint}>
                  {fid => <input id={fid} type="text" inputMode="text" placeholder={t.event.allWeeks} value={weeksText} onInput={x => { setWeeksText((x.target as HTMLInputElement).value); setError(''); }} />}
                </Field>
                <Field label={t.event.teacher}>{fid => <input id={fid} type="text" maxLength={500} placeholder={t.common.optional} value={e.teacher ?? ''} onInput={x => set({ teacher: (x.target as HTMLInputElement).value })} />}</Field>
              </div>
            </Disclosure>
          )}
          {existing?.sourceKey && <p class="field-hint">{t.event.imported}</p>}
          {error && <p class="field-error" role="alert">{error}</p>}
          {existing && (
            <Button variant="danger" icon="trash" onClick={() => ui.open({
              type: 'confirm', title: t.event.removeTitle, danger: true, confirm: t.common.remove,
              message: existing.repeat === 'weekly' ? t.event.removeRepeating(existing.title) : t.event.removeOnce(existing.title),
              onConfirm: () => store.act(d => act.deleteEvent(d, existing.id), { message: t.event.removed }),
            })}>{t.common.remove}</Button>
          )}
        </form>
      )}
    </Sheet>
  );
}

/** One occurrence of an event, tapped on Today or Week: what it is, and what can change. */
export function FixedSheet({ eventId, day }: { eventId: string; day: DateKey }) {
  const { data, today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const event = data.events.find(e => e.id === eventId);
  if (!event) return null;
  const when = event.allDay ? t.event.allDay : span(toMinutes(event.start), toMinutes(event.end));
  return (
    <Sheet title={event.title} subtitle={joinFacts([relativeDay(day, today), when])} onClose={ui.close}>
      <dl class="facts">
        {event.location && <><dt>{t.fixed.where}</dt><dd>{event.location}</dd></>}
        {event.teacher && <><dt>{t.fixed.with}</dt><dd>{event.teacher}</dd></>}
        <dt>{t.event.category}</dt><dd>{joinFacts([t.event.categories[event.category], event.category !== 'once' && repeatText(event)])}</dd>
        {event.remind !== undefined && <><dt>{t.event.remind}</dt><dd>{event.allDay ? t.event.allDayReminders[event.remind as 0 | 1440] ?? t.event.reminders(event.remind) : t.event.reminders(event.remind)}</dd></>}
      </dl>
      <div class="action-grid">
        {day >= today && <Button variant="soft" icon="close" onClick={() => {
          store.act(d => act.cancelOccurrence(d, eventId, day), { message: event.repeat === 'once' ? t.event.removed : t.fixed.cancelledFor(inlineDay(day, today)) });
          ui.close();
        }}>{event.repeat === 'once' ? t.common.remove : t.fixed.notHappening}</Button>}
        <Button variant="soft" icon="edit" onClick={() => ui.open({ type: 'event', id: eventId, day })}>{t.common.edit}</Button>
      </div>
    </Sheet>
  );
}
