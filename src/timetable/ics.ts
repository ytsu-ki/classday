import ICAL from 'ical.js';
import { addDays, dateOf, isDateKey, uid } from '../domain/time';
import type { DateKey, FixedEvent } from '../domain/types';
import { ICS_MAX_BYTES } from './limits';
import { ProblemError } from '../domain/problems';

export interface IcsOptions {
  from: DateKey;
  until: DateKey;
  group: string;
  /** Zoned times are shown as wall-clock time in this zone. Defaults to the device zone. */
  timeZone?: string;
}


/**
 * Reads lessons from a calendar file as one-off events within a date range.
 * Handles recurrence rules, excluded dates, moved and cancelled lessons, UTC and embedded time zones.
 */
export function parseIcs(text: string, { from, until, group, timeZone }: IcsOptions): FixedEvent[] {
  if (typeof text !== 'string' || text.length > ICS_MAX_BYTES) throw new ProblemError({ code: 'ics-size' });
  if (!isDateKey(from) || !isDateKey(until) || until < from || until > addDays(from, 370))
    throw new ProblemError({ code: 'ics-range' });
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const format = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const wall = (time: ICAL.Time) => {
    if (time.zone === ICAL.Timezone.localTimezone) {
      const s = time.toString();
      return { date: s.slice(0, 10), time: s.slice(11, 16) };
    }
    const parts = Object.fromEntries(format.formatToParts(time.toJSDate()).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  };

  ICAL.TimezoneService.reset();
  // Campus exports often name Asia/Shanghai without defining it.
  const shanghai = new ICAL.Component(['vtimezone', [['tzid', {}, 'text', 'Asia/Shanghai']], [[
    'standard', [['dtstart', {}, 'date-time', '1970-01-01T00:00:00'], ['tzoffsetfrom', {}, 'utc-offset', '+08:00'], ['tzoffsetto', {}, 'utc-offset', '+08:00']], [],
  ]]]);
  ICAL.TimezoneService.register(new ICAL.Timezone(shanghai));
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new ProblemError({ code: 'ics-unreadable' });
  }
  if (root.name !== 'vcalendar') throw new ProblemError({ code: 'ics-not-calendar' });
  for (const z of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(new ICAL.Timezone(z));
  const components = root.getAllSubcomponents('vevent');
  if (components.length > 2000) throw new ProblemError({ code: 'ics-too-large' });
  for (const c of components) {
    for (const p of c.getAllProperties()) {
      const tz = p.getParameter('tzid');
      if (typeof tz === 'string' && !ICAL.TimezoneService.has(tz)) throw new ProblemError({ code: 'ics-timezone', zone: tz });
    }
    for (const r of c.getAllProperties('rrule')) {
      const freq = (r.getFirstValue() as ICAL.Recur).freq;
      if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) throw new ProblemError({ code: 'ics-repeat' });
    }
  }
  const events: FixedEvent[] = [], keys = new Set<string>();
  let inspected = 0;
  for (const c of components) {
    if (c.hasProperty('recurrence-id') || c.getFirstPropertyValue('status') === 'CANCELLED') continue;
    const event = new ICAL.Event(c);
    if (!event.uid || !event.summary || event.summary.length > 120 || event.uid.length > 200) throw new ProblemError({ code: 'ics-entry' });
    if (event.startDate.isDate) throw new ProblemError({ code: 'ics-all-day', title: event.summary });
    const iterator = event.iterator();
    let occurrence: ICAL.Time | null;
    while ((occurrence = iterator.next())) {
      if (++inspected > 10_000) throw new ProblemError({ code: 'ics-too-many-repeats' });
      const occurrenceWall = wall(occurrence);
      if (occurrenceWall.date > addDays(until, 370)) break;
      const details = event.getOccurrenceDetails(occurrence);
      if (details.item.component.getFirstPropertyValue('status') === 'CANCELLED') continue;
      const start = wall(details.startDate), end = wall(details.endDate);
      // A moved lesson may land inside the range even when its original slot does not.
      if (start.date < from || start.date > until) {
        if (occurrenceWall.date > until && !Object.keys(event.exceptions).length) break;
        continue;
      }
      if (start.date !== end.date || end.time <= start.time) throw new ProblemError({ code: 'ics-overnight', title: event.summary });
      const sourceKey = `${event.uid}:${occurrence.toString()}`;
      if (keys.has(sourceKey)) continue;
      keys.add(sourceKey);
      events.push({
        id: uid(), title: details.item.summary || event.summary, category: 'once', start: start.time, end: end.time,
        date: start.date, from: start.date, until: start.date, repeat: 'once', parity: 'all', weekday: dateOf(start.date).getDay(),
        location: details.item.location || '', sourceKey, importGroup: group,
      });
      if (events.length > 2000) throw new ProblemError({ code: 'ics-too-many-lessons' });
      if (!event.isRecurring()) break;
    }
  }
  if (!events.length) throw new ProblemError({ code: 'ics-no-lessons' });
  return events;
}
