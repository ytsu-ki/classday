import { occurs } from './schedule';
import { addDays, dateOf, dayKey, toMinutes } from './time';
import type { Clock, DateKey, PlannerData } from './types';

/**
 * The notifications to have scheduled right now, worked out from the data alone. The app
 * replaces all pending ones with this list whenever the data changes, so nothing goes stale.
 */
export type Reminder =
  | { kind: 'deadline'; id: number; at: Date; itemId: string; due: DateKey; dueTime?: Clock }
  | { kind: 'event'; id: number; at: Date; eventId: string; day: DateKey };

/** Android notification ids are 32-bit; a stable hash keeps each reminder's id the same. */
function idFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}

/** That day at that clock time, on the phone's clock (dateOf gives noon, away from DST edges). */
export const moment = (day: DateKey, clock: Clock) => {
  const d = dateOf(day);
  d.setHours(0, toMinutes(clock), 0, 0);
  return d;
};

export function upcomingReminders(data: PlannerData, now: Date, horizonDays = 14): Reminder[] {
  const r = data.reminders;
  const today = dayKey(now);
  const last = addDays(today, horizonDays);
  const out: Reminder[] = [];

  if (r.deadlines) {
    for (const item of data.items) {
      if (item.status !== 'open' || !item.due || item.due < today) continue;
      // The usual lead time; if that moment has passed, the morning of the due day; else nothing.
      let at = moment(addDays(item.due, -r.deadlineDays), r.at);
      if (at <= now) at = moment(item.due, r.at);
      if (at <= now || dayKey(at) > last) continue;
      if (item.dueTime && at >= moment(item.due, item.dueTime)) continue;
      out.push({ kind: 'deadline', id: idFor(`deadline|${item.id}|${item.due}`), at, itemId: item.id, due: item.due, dueTime: item.dueTime });
    }
  }

  // Each event chooses its own reminder. An all-day event's comes at the usual reminder time,
  // on the day or, for "a day before", the day before.
  for (const event of data.events) {
    if (event.remind === undefined) continue;
    for (let day = today; day <= last; day = addDays(day, 1)) {
      if (!occurs(event, day)) continue;
      const at = event.allDay
        ? moment(event.remind >= 1440 ? addDays(day, -1) : day, r.at)
        : new Date(moment(day, event.start).getTime() - event.remind * 60_000);
      if (at > now) out.push({ kind: 'event', id: idFor(`event|${event.id}|${day}`), at, eventId: event.id, day });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 48);
}
