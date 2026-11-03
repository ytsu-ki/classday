import { ProblemError } from '../domain/problems';
import { addDays, dateOf, dayKey, isClock, toMinutes, uid, weekOf } from '../domain/time';
import type { Clock, FixedEvent, SemesterPreferences } from '../domain/types';

/** A class read from a timetable file or pasted text, before it becomes weekly events. */
export interface ClassEntry {
  title: string;
  /** 0 = Sunday … 6 = Saturday, as Date.getDay(). */
  weekday: number;
  /** First and last period, when the timetable counts periods instead of clock times. */
  periods?: [number, number];
  start?: Clock;
  end?: Clock;
  /** Teaching weeks counted from the Monday of week one; absent means every week. */
  weeks?: number[];
  location?: string;
  teacher?: string;
}

/** The periods any entry uses, so the semester step only asks for those. */
export function usedPeriods(entries: ClassEntry[]): number[] {
  const used = new Set<number>();
  for (const e of entries) if (e.periods) for (let n = e.periods[0]; n <= e.periods[1]; n++) used.add(n);
  return [...used].sort((a, b) => a - b);
}

/** Weekly events for the entries, counting weeks from the semester's first Monday. */
export function buildEvents(entries: ClassEntry[], semester: SemesterPreferences, group: string): FixedEvent[] {
  const { firstMonday, periods } = semester;
  if (dayKey(dateOf(firstMonday)) !== firstMonday || weekOf(firstMonday) !== firstMonday)
    throw new ProblemError({ code: 'semester-first-monday' });
  const used = usedPeriods(entries);
  for (const n of used) {
    const p = periods[n - 1];
    if (!p || !isClock(p.start) || !isClock(p.end) || toMinutes(p.end) <= toMinutes(p.start))
      throw new ProblemError({ code: 'semester-period', period: n });
    const before = periods[n - 2];
    if (used.includes(n - 1) && before && isClock(before.end) && toMinutes(p.start) < toMinutes(before.end))
      throw new ProblemError({ code: 'semester-periods-overlap' });
  }
  const events: FixedEvent[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const start = e.periods ? periods[e.periods[0] - 1].start : e.start;
    const end = e.periods ? periods[e.periods[1] - 1].end : e.end;
    if (!start || !end || toMinutes(end) <= toMinutes(start)) continue;
    const weeks = e.weeks?.length ? e.weeks : undefined;
    // The same class listed twice (a timetable repeats it across cells or pages) is imported once.
    // A class counted in periods is known by them, so it stays the same class when the class times change.
    const sourceKey = JSON.stringify([e.title, e.weekday, ...(e.periods ? [e.periods] : [start, end]), weeks ?? null]);
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);
    events.push({
      id: uid(), title: e.title, category: 'long', weekday: e.weekday, start, end,
      repeat: 'weekly', date: firstMonday, from: firstMonday,
      until: weeks ? addDays(firstMonday, Math.max(...weeks) * 7 - 1) : '',
      parity: 'all',
      ...(e.periods ? { periods: [e.periods[0], e.periods[1]] as [number, number] } : {}),
      ...(weeks ? { weeks } : {}),
      ...(e.location ? { location: e.location } : {}),
      ...(e.teacher ? { teacher: e.teacher } : {}),
      sourceKey, importGroup: group,
    });
  }
  if (!events.length) throw new ProblemError({ code: 'timetable-no-classes' });
  return events;
}
