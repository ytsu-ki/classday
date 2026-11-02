import { daysBetween, toMinutes, weekdayOf } from './time';
import type { DateKey, FixedEvent, PlannerData, Settings } from './types';

/**
 * What is on the timetable on a given day: events and classes, and the meals of a normal day.
 * Nothing here plans anything; the student puts every event where it goes.
 */

export interface Interval { start: number; end: number }
export interface FixedBlock extends Interval { id: string; title: string; kind: 'event' | 'meal'; event?: FixedEvent }

/** The weekdays a repeating event happens on. */
export const daysOf = (e: FixedEvent): number[] => e.days?.length ? e.days : [Number(e.weekday)];

export function occurs(e: FixedEvent, day: DateKey): boolean {
  if (e.repeat === 'once') return e.date === day;
  if (day < e.from || (e.until && day > e.until)) return false;
  if (!daysOf(e).includes(weekdayOf(day))) return false;
  if (e.exclusions?.includes(day)) return false;
  const week = Math.floor(daysBetween(e.from, day) / 7) + 1;
  if (e.weeks) return e.weeks.includes(week);
  return e.parity === 'all' || (e.parity === 'odd' ? week % 2 === 1 : week % 2 === 0);
}

/** The part of the day the timetable shows. */
export function dayWindow(s: Settings): Interval {
  return { start: toMinutes(s.dayStart), end: Math.max(toMinutes(s.dayStart), toMinutes(s.dayEnd)) };
}

/** Events with a time, and the meals, in order. All-day events are listed by allDayFor. */
export function fixedFor(data: PlannerData, day: DateKey): FixedBlock[] {
  const s = data.settings;
  const events: FixedBlock[] = data.events.filter(e => !e.allDay && occurs(e, day)).map(e => ({
    id: e.id, title: e.title, start: toMinutes(e.start), end: toMinutes(e.end), kind: 'event', event: e,
  }));
  const meals: FixedBlock[] = [
    { id: 'lunch', title: 'Lunch', start: toMinutes(s.lunch), end: toMinutes(s.lunch) + s.mealMinutes, kind: 'meal' },
    { id: 'dinner', title: 'Dinner', start: toMinutes(s.dinner), end: toMinutes(s.dinner) + s.mealMinutes, kind: 'meal' },
  ];
  return [...events, ...meals].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function allDayFor(data: PlannerData, day: DateKey): FixedEvent[] {
  return data.events.filter(e => e.allDay && occurs(e, day));
}

/** Stretches of the day with no event, from `from` on. Meals count as free: an event can go there. */
export function freeTime(data: PlannerData, day: DateKey, from = 0): Interval[] {
  const window = dayWindow(data.settings);
  const out: Interval[] = [];
  let cursor = Math.max(window.start, from);
  for (const b of fixedFor(data, day).filter(f => f.kind === 'event')) {
    if (b.end <= cursor) continue;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) out.push({ start: cursor, end: window.end });
  return out.filter(x => x.end > x.start);
}
