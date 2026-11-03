import type { Interval } from '../domain/schedule';
import { daysBetween, toMinutes } from '../domain/time';
import type { DateKey, FixedEvent, PlannerData } from '../domain/types';

/** Pixels per minute where something happens (periods, classes, plans) and in the gaps between. */
export const DENSE = 1.3;
export const SPARSE = 0.35;
/** How many course colors the stylesheet defines (.course-0 … .course-9). */
export const COURSE_COLORS = 10;
/** The longest break between two periods that counts as a passing period, for walking between rooms. */
export const PASSING_MAX = 30;

export interface Axis { height: number; y: (minute: number) => number }

/**
 * The week grid's time axis. Periods and everything on the plan get full height and the stretches
 * between them are compressed, so a school day reads like a timetable and lunch doesn't take a
 * screen. Passing periods take no height at all, so back-to-back classes sit flush. Days share one
 * axis so rows line up across the week.
 */
export function weekAxis(range: Interval, dense: Interval[], closed: Interval[] = []): Axis {
  const within = (list: Interval[], m: number) => list.some(x => x.start <= m && m < x.end);
  const marks = [...new Set([range.start, range.end, ...[...dense, ...closed].flatMap(x => [x.start, x.end])])]
    .filter(m => m >= range.start && m <= range.end)
    .sort((a, b) => a - b);
  const points: [minute: number, y: number][] = [[range.start, 0]];
  let y = 0;
  for (let i = 1; i < marks.length; i++) {
    const from = marks[i - 1], to = marks[i];
    const scale = within(closed, from) ? 0 : within(dense, from) ? DENSE : SPARSE;
    y += (to - from) * scale;
    points.push([to, y]);
  }
  const at = (minute: number) => {
    if (minute <= range.start) return 0;
    for (let i = 1; i < points.length; i++) {
      const [m1, y1] = points[i];
      if (minute > m1) continue;
      const [m0, y0] = points[i - 1];
      return y0 + ((minute - m0) * (y1 - y0)) / (m1 - m0);
    }
    return y;
  };
  return { height: Math.round(y), y: minute => Math.round(at(minute)) };
}

/**
 * The passing periods between consecutive periods, which the grid closes up. One stays open when
 * something on the plan starts or ends inside it, so that never shrinks to nothing.
 */
export function passingBreaks(periods: Period[], planned: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (let i = 1; i < periods.length; i++) {
    const gap = { start: periods[i - 1].end, end: periods[i].start };
    if (gap.end <= gap.start || gap.end - gap.start > PASSING_MAX) continue;
    const inside = (m: number) => m > gap.start && m < gap.end;
    if (!planned.some(x => inside(x.start) || inside(x.end))) out.push(gap);
  }
  return out;
}

export interface Lane<T> { value: T; start: number; end: number; lane: number; lanes: number }

/** Side-by-side lanes for things that overlap within a day, so none hides another. */
export function inLanes<T>(entries: { value: T; start: number; end: number }[]): Lane<T>[] {
  const sorted = [...entries].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Lane<T>[] = [];
  let group: Lane<T>[] = [];
  let groupEnd = -1;
  const close = () => { const lanes = Math.max(0, ...group.map(g => g.lane)) + 1; for (const g of group) g.lanes = lanes; };
  for (const e of sorted) {
    if (e.start >= groupEnd) { close(); group = []; }
    const taken = group.filter(g => g.end > e.start).map(g => g.lane);
    let lane = 0;
    while (taken.includes(lane)) lane++;
    const placed = { ...e, lane, lanes: 1 };
    group.push(placed);
    out.push(placed);
    groupEnd = Math.max(groupEnd, e.end);
  }
  close();
  return out;
}

/** A color for each course, stable while the timetable stays the same. */
export function courseColors(events: FixedEvent[]): Map<string, number> {
  const titles = [...new Set(events.map(e => e.title))].sort();
  return new Map(titles.map((title, i) => [title, i % COURSE_COLORS]));
}

export interface Period { n: number; start: number; end: number }

/** The school's class times to show beside the grid; none until the student sets them, and the grid shows hours. */
export function periodRows(data: PlannerData): Period[] {
  return (data.timetable.semester?.periods ?? []).map((p, i) => ({ n: i + 1, start: toMinutes(p.start), end: toMinutes(p.end) }));
}

/** Week number in the semester, when one is set and the week falls within it. */
export function semesterWeek(data: PlannerData, monday: DateKey): number | null {
  const first = data.timetable.semester?.firstMonday;
  if (!first) return null;
  const n = Math.floor(daysBetween(first, monday) / 7) + 1;
  return n >= 1 && n <= 30 ? n : null;
}
